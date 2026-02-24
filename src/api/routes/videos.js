import { Router } from 'express';
import { unlinkSync, existsSync } from 'fs';
import { listVideos, getVideo, deleteVideo } from '../db.js';
import { downloadWithPersist } from '../../downloader-db.js';
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
    // Erro já foi persistido no banco por downloadWithPersist
    console.error(`[API] Erro no download: ${err.message}`);
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

export default router;
