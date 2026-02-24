import { Router } from 'express';
import { unlinkSync, existsSync, statSync, createReadStream } from 'fs';
import { listVideos, getVideo, deleteVideo } from '../db.js';
import { downloadWithPersist } from '../../downloader-db.js';
import emitter from '../events.js';
import logger from '../logger.js';
import {
  validateCategory, validateFormat, validateQuality,
  isValidYouTubeUrl, isPlaylistUrl,
  VALID_CATEGORIES,
} from '../../validators.js';

const router = Router();

// ─── GET /api/videos ─────────────────────────────────────────────
// Query params: ?category=Músicas&status=done
router.get('/', (req, res) => {
  try {
    const { category, status } = req.query;
    const videos = listVideos({ category, status });
    res.json({ ok: true, data: videos, total: videos.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/videos/:id ─────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const video = getVideo(Number(req.params.id));
    if (!video) return res.status(404).json({ ok: false, error: 'Vídeo não encontrado' });
    res.json({ ok: true, data: video });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/videos ─────────────────────────────────────────────
/**
 * Mesmas opções da CLI:
 * {
 *   url:          string   — vídeo ou playlist  (obrigatório)
 *   category:     string   — Histórias | Músicas | Educação | Desenhos (obrigatório)
 *   quality?:     string   — high | medium | low   (default: high)
 *   audioOnly?:   boolean                          (default: false)
 *   format?:      string   — mp4 | mkv | webm | mp3 | wav | aac | flac (default: mp4)
 *   subtitles?:   boolean                          (default: false)
 *   subLang?:     string   — ex: "pt,en"           (default: pt,en)
 *   concurrency?: number   — downloads paralelos   (default: 3)
 *   fragments?:   number   — fragmentos por vídeo  (default: 4)
 *   outputDir?:   string                           (default: ./downloads)
 * }
 */
router.post('/', async (req, res) => {
  const {
    url,
    category,
    quality = 'high',
    audioOnly = false,
    format = audioOnly ? 'mp3' : 'mp4',
    subtitles = false,
    subLang = 'pt,en',
    concurrency = 3,
    fragments = 4,
    outputDir = './downloads',
  } = req.body || {};

  // ── Validações ───────────────────────────────────────────────────
  if (!url) return res.status(400).json({ ok: false, error: 'Campo "url" é obrigatório' });
  if (!category) return res.status(400).json({ ok: false, error: 'Campo "category" é obrigatório' });

  if (!isValidYouTubeUrl(url) && !isPlaylistUrl(url))
    return res.status(400).json({ ok: false, error: 'URL do YouTube inválida' });

  try { validateCategory(category); }
  catch (e) { return res.status(400).json({ ok: false, error: e.message }); }

  try { validateFormat(format); }
  catch (e) { return res.status(400).json({ ok: false, error: e.message }); }

  try { validateQuality(quality); }
  catch (e) { return res.status(400).json({ ok: false, error: e.message }); }

  // ── Responde imediatamente, download roda em background ──────────
  res.status(202).json({
    ok: true,
    message: isPlaylistUrl(url) && !isValidYouTubeUrl(url)
      ? 'Playlist registrada — downloads iniciados em background'
      : 'Download iniciado em background',
    hint: 'Consulte GET /api/videos para acompanhar o status',
  });

  // ── Dispara download + persistência ──────────────────────────────
  downloadWithPersist(url, {
    category,
    quality,
    audioOnly,
    format,
    outputDir,
    subtitles,
    subLang,
    concurrency,
    concurrentFragments: fragments,
    silent: true,
  }).catch(err => {
    logger.error({ level: 'error' }, `[API] Erro no download: ${err.message}`);
  });
});

// ─── DELETE /api/videos/:id ──────────────────────────────────────
// Query param: ?deleteFile=true para remover o arquivo do disco também
router.delete('/:id', (req, res) => {
  try {
    const video = getVideo(Number(req.params.id));
    if (!video) return res.status(404).json({ ok: false, error: 'Vídeo não encontrado' });

    if (req.query.deleteFile === 'true' && video.file_path) {
      try {
        if (existsSync(video.file_path)) unlinkSync(video.file_path);
      } catch (_) { /* arquivo pode não existir mais */ }
    }

    deleteVideo(video.id);
    res.json({ ok: true, message: `Vídeo #${video.id} removido` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/videos/:id/events (SSE) ────────────────────────────
router.get('/:id/events', (req, res) => {
  const videoId = Number(req.params.id);
  const video = getVideo(videoId);

  if (!video) {
    return res.status(404).json({ ok: false, error: 'Vídeo não encontrado' });
  }

  // Headers obrigatórios para SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Envia status inicial para confirmar conexão
  res.write(`data: ${JSON.stringify({ type: 'connected', videoId, status: video.status })}\n\n`);

  // Se já terminou ou deu erro, avisa e fecha
  if (video.status === 'done' || video.status === 'error') {
    res.write(`data: ${JSON.stringify({ type: video.status, message: 'Processo já finalizado' })}\n\n`);
    res.end();
    return;
  }

  // Listener para eventos de progresso deste vídeo
  const eventName = `video:${videoId}`;
  const listener = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (data.type === 'done' || data.type === 'error') {
      res.end(); // fecha a conexão quando terminar
    }
  };

  emitter.on(eventName, listener);

  // Limpa listener quando o cliente desconectar
  req.on('close', () => {
    emitter.off(eventName, listener);
  });
});

// ─── GET /api/videos/:id/stream ──────────────────────────────────
router.get('/:id/stream', (req, res) => {
  try {
    const videoId = Number(req.params.id);
    const video = getVideo(videoId);

    if (!video) return res.status(404).json({ ok: false, error: 'Vídeo não encontrado' });
    if (!video.file_path || !existsSync(video.file_path)) {
      return res.status(404).json({ ok: false, error: 'Arquivo de vídeo não encontrado no disco' });
    }

    const { file_path: filePath } = video;
    const stat = statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Mapa simples de mime-type baseado na extensão (o formato do db armazena a ext)
    const ext = video.format.toLowerCase();
    const mimeTypes = {
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'mkv': 'video/x-matroska',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'aac': 'audio/aac',
      'flac': 'audio/flac',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    if (range) {
      // Pedido de streaming em chunks (Range request)
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize) {
        res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
        return;
      }

      const chunksize = (end - start) + 1;
      const file = createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      };

      res.writeHead(206, head);
      file.pipe(res);
    } else {
      // Enviar o arquivo inteiro de uma vez (download normal sem streaming bufferizado, não recomendado pra `<video>`)
      const head = {
        'Content-Length': fileSize,
        'Content-Type': contentType,
      };
      res.writeHead(200, head);
      createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    logger.error({ level: 'error' }, `[API Stream] Erro ao servir vídeo: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
