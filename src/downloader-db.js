/**
 * Camada de persistência sobre downloadVideo / downloadPlaylist.
 * Usada tanto pela CLI quanto pela API REST para registrar e atualizar
 * o status de cada download no banco SQLite, e emitir eventos SSE.
 * Logs são impressos em StdOut no formato JSON para Grafana/Loki.
 * Logs JSON agora são gerados via Pino (stdout + data/yt-dwn.log) para Grafana/Loki.
 */
import { insertVideo, updateVideo, deleteVideo } from './api/db.js';
import { emitVideoEvent } from './api/events.js';
import logger from './api/logger.js';
import { downloadVideo } from './downloader.js';
import { getPlaylistInfo } from './playlists.js';
import { isPlaylistUrl, isValidYouTubeUrl } from './validators.js';

/**
 * Faz download de uma URL (vídeo ou playlist) com persistência + eventos.
 * Retorna array de IDs criados no banco.
 */
export async function downloadWithPersist(url, opts = {}) {
  const {
    category,
    quality = 'high',
    audioOnly = false,
    format = audioOnly ? 'mp3' : 'mp4',
    outputDir = './downloads',
    subtitles = false,
    subLang = 'pt,en',
    concurrency = 3,
    concurrentFragments = 4,
    silent = false,
  } = opts;

  const commonInsert = {
    category, format, audioOnly, quality,
    subtitles, subLang, concurrency, fragments: concurrentFragments,
  };

  // ── Playlist ──────────────────────────────────────────────────────
  if (isPlaylistUrl(url) && !isValidYouTubeUrl(url)) {
    const playlistInfo = await getPlaylistInfo(url);
    const records = [];

    for (const entry of playlistInfo.entries) {
      const videoUrl = entry.url.startsWith('http')
        ? entry.url
        : `https://www.youtube.com/watch?v=${entry.id}`;
      const record = insertVideo({ url: videoUrl, ...commonInsert });

      const logMsg = `Enfileirado: ${entry.title || videoUrl}`;
      logger.info({ videoId: record.id, level: 'info' }, logMsg);

      emitVideoEvent(record.id, 'log', { message: `Enfileirado na playlist "${playlistInfo.title}"` });
      records.push({ record, entry });
    }

    await runBatchWithPersist(records.map(({ record, entry }) => ({
      url: entry.url.startsWith('http')
        ? entry.url
        : `https://www.youtube.com/watch?v=${entry.id}`,
      _dbId: record.id,
    })), { quality, audioOnly, format, outputDir, category, subtitles, subLang, concurrentFragments, silent });

    return records.map(({ record }) => record.id);
  }

  // ── Vídeo único ──────────────────────────────────────────────────
  const record = insertVideo({ url, ...commonInsert });
  return [await downloadOneWithPersist(url, record.id, {
    quality, audioOnly, format, outputDir, category, subtitles, subLang, concurrentFragments, silent,
  })];
}

/**
 * Faz download de um único vídeo e atualiza o banco + emite eventos.
 * Retorna o id do registro.
 */
async function downloadOneWithPersist(url, dbId, opts) {
  const { quality, audioOnly, format, outputDir, category, subtitles, subLang, concurrentFragments, silent } = opts;

  updateVideo(dbId, { status: 'downloading' });

  logger.info({ videoId: dbId, level: 'info' }, 'Download iniciado');
  emitVideoEvent(dbId, 'log', { level: 'info', message: 'Download iniciado' });

  try {
    const result = await downloadVideo(url, {
      quality, audioOnly, format, outputDir, category, subtitles, subLang, concurrentFragments, silent,
      onProgress({ percent, speed, eta }) {
        emitVideoEvent(dbId, 'progress', { percent, speed, eta });
        if (percent % 25 === 0) {
          logger.info({ videoId: dbId, level: 'progress' }, `Progresso: ${percent}% — ${speed}`);
        }
      },
      onLog(message, level = 'info') {
        const pinoLevel = level === 'error' ? 'error' : 'info';
        logger[pinoLevel]({ videoId: dbId, level }, message);
        emitVideoEvent(dbId, 'log', { level, message });
      },
    });

    updateVideo(dbId, {
      status: 'done',
      title: result.title,
      channel: result.channel,
      youtube_id: result.youtubeId,
      file_path: result.file,
      duration: result.duration,
      downloaded_at: new Date().toISOString(),
    });
    logger.info({ videoId: dbId, level: 'info' }, `Concluído: ${result.file}`);
    emitVideoEvent(dbId, 'done', { title: result.title, file: result.file });

    return dbId;
  } catch (err) {
    // Remove o registro do banco — downloads com falha não devem ser persistidos
    deleteVideo(dbId);
    logger.error({ videoId: dbId, level: 'error' }, `Falha ao baixar: ${err.message}`);
    emitVideoEvent(dbId, 'error', { message: err.message });
    throw err;
  }
}

/**
 * Executa um batch de items com persistência por item (worker pool).
 */
async function runBatchWithPersist(items, opts) {
  const { concurrentFragments, ...rest } = opts;
  const parallel = Math.min(opts.concurrency ?? 3, items.length);
  const executing = new Set();

  for (const item of items) {
    const promise = downloadOneWithPersist(item.url, item._dbId, {
      ...rest, concurrentFragments,
    }).catch(() => { /* erros já persistidos */ });

    executing.add(promise);
    promise.finally(() => executing.delete(promise));
    if (executing.size >= parallel) await Promise.race(executing);
  }

  await Promise.all(executing);
}
