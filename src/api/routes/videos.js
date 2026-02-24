import { Router } from 'express';
import { unlinkSync, existsSync } from 'fs';
import { listVideos, getVideo, insertVideo, deleteVideo, updateVideo } from '../db.js';
import { downloadVideo } from '../../downloader.js';
import { validateCategory, validateFormat, validateQuality, isValidYouTubeUrl } from '../../validators.js';

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
// Body: { url, category, format?, audioOnly?, quality? }
router.post('/', async (req, res) => {
  const { url, category, format = 'mp4', audioOnly = false, quality = 'high' } = req.body || {};

  // Validações
  if (!url) return res.status(400).json({ ok: false, error: 'Campo "url" é obrigatório' });
  if (!category) return res.status(400).json({ ok: false, error: 'Campo "category" é obrigatório' });

  if (!isValidYouTubeUrl(url))
    return res.status(400).json({ ok: false, error: 'URL do YouTube inválida' });

  try { validateCategory(category); }
  catch (e) { return res.status(400).json({ ok: false, error: e.message }); }

  try { validateFormat(format); }
  catch (e) { return res.status(400).json({ ok: false, error: e.message }); }

  try { validateQuality(quality); }
  catch (e) { return res.status(400).json({ ok: false, error: e.message }); }

  // Inserir no banco com status 'pending'
  let video;
  try {
    video = insertVideo({ url, category, format, audioOnly, quality });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }

  // Responde imediatamente, download roda em background
  res.status(202).json({ ok: true, data: video, message: 'Download iniciado em background' });

  // Dispara download assíncrono
  updateVideo(video.id, { status: 'downloading' });

  downloadVideo(url, {
    quality,
    audioOnly,
    format,
    outputDir: './downloads',
    category,
    silent: true,
  })
    .then((result) => {
      updateVideo(video.id, {
        status: 'done',
        title: result.title,
        channel: result.channel,
        file_path: result.file,
        downloaded_at: new Date().toISOString(),
      });
    })
    .catch((err) => {
      updateVideo(video.id, {
        status: 'error',
        error_msg: err.message,
      });
    });
});

// ─── DELETE /api/videos/:id ──────────────────────────────────────
// Query param: ?deleteFile=true para remover o arquivo do disco também
router.delete('/:id', (req, res) => {
  try {
    const video = getVideo(Number(req.params.id));
    if (!video) return res.status(404).json({ ok: false, error: 'Vídeo não encontrado' });

    // Remover arquivo do disco se solicitado
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
