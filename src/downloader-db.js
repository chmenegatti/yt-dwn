/**
 * Camada de persistência sobre downloadVideo / downloadBatch / downloadPlaylist.
 * Usada tanto pela CLI quanto pela API REST para registrar e atualizar
 * o status de cada download no banco SQLite.
 */
import { insertVideo, updateVideo } from './api/db.js';
import { downloadVideo, downloadBatch } from './downloader.js';
import { downloadPlaylist, getPlaylistInfo } from './playlists.js';
import { isPlaylistUrl, isValidYouTubeUrl } from './validators.js';

/**
 * Opções comuns de download — espelham as flags da CLI
 * @typedef {Object} DownloadOptions
 * @property {string}  category         — categoria obrigatória
 * @property {string}  [quality]        — high | medium | low
 * @property {boolean} [audioOnly]
 * @property {string}  [format]         — mp4 | mkv | webm | mp3 | wav | aac | flac
 * @property {string}  [outputDir]
 * @property {boolean} [subtitles]
 * @property {string}  [subLang]
 * @property {number}  [concurrency]    — downloads paralelos (playlist/batch)
 * @property {number}  [concurrentFragments]
 * @property {boolean} [silent]
 */

/**
 * Faz download de uma URL (vídeo ou playlist) e persiste no banco.
 * Retorna o(s) registro(s) criado(s).
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
    category,
    format,
    audioOnly,
    quality,
    subtitles,
    subLang,
    concurrency,
    fragments: concurrentFragments,
  };

  // ── Playlist ──────────────────────────────────────────────────────
  if (isPlaylistUrl(url) && !isValidYouTubeUrl(url)) {
    // Resolve a playlist para criar um registro por vídeo
    const playlistInfo = await getPlaylistInfo(url);
    const records = [];

    for (const entry of playlistInfo.entries) {
      const videoUrl = entry.url.startsWith('http')
        ? entry.url
        : `https://www.youtube.com/watch?v=${entry.id}`;

      const record = insertVideo({ url: videoUrl, ...commonInsert });
      records.push(record);
    }

    // Dispara os downloads em batch (com concorrência), atualizando status
    const items = records.map((record, i) => ({
      url: playlistInfo.entries[i].url.startsWith('http')
        ? playlistInfo.entries[i].url
        : `https://www.youtube.com/watch?v=${playlistInfo.entries[i].id}`,
      _dbId: record.id,
    }));

    // Executa usando downloadBatch mas com callbacks de persistência
    await runBatchWithPersist(items, {
      quality, audioOnly, format, outputDir, category,
      subtitles, subLang, concurrency, concurrentFragments, silent,
    });

    return records.map(r => r.id);
  }

  // ── Vídeo único ──────────────────────────────────────────────────
  const record = insertVideo({ url, ...commonInsert });
  updateVideo(record.id, { status: 'downloading' });

  try {
    const result = await downloadVideo(url, {
      quality,
      audioOnly,
      format,
      outputDir,
      category,
      subtitles,
      subLang,
      concurrentFragments,
      silent,
    });

    updateVideo(record.id, {
      status: 'done',
      title: result.title,
      channel: result.channel,
      youtube_id: result.youtubeId,
      file_path: result.file,
      duration: result.duration,
      downloaded_at: new Date().toISOString(),
    });

    return [record.id];
  } catch (err) {
    updateVideo(record.id, { status: 'error', error_msg: err.message });
    throw err;
  }
}

/**
 * Executa um batch de items [{url, _dbId}] com persistência por item.
 */
async function runBatchWithPersist(items, opts) {
  const {
    quality, audioOnly, format, outputDir, category,
    subtitles, subLang, concurrency, concurrentFragments, silent,
  } = opts;

  const parallel = Math.min(concurrency, items.length);
  const executing = new Set();

  for (const item of items) {
    if (item._dbId) updateVideo(item._dbId, { status: 'downloading' });

    const promise = downloadVideo(item.url, {
      quality, audioOnly, format, outputDir, category,
      subtitles, subLang, concurrentFragments, silent,
    })
      .then(result => {
        if (item._dbId) {
          updateVideo(item._dbId, {
            status: 'done',
            title: result.title,
            channel: result.channel,
            youtube_id: result.youtubeId,
            file_path: result.file,
            duration: result.duration,
            downloaded_at: new Date().toISOString(),
          });
        }
      })
      .catch(err => {
        if (item._dbId) updateVideo(item._dbId, { status: 'error', error_msg: err.message });
      });

    executing.add(promise);
    promise.finally(() => executing.delete(promise));

    if (executing.size >= parallel) await Promise.race(executing);
  }

  await Promise.all(executing);
}
