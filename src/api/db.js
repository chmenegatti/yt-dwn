import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../../data/videos.db');

// Garante que o diretório de dados existe
const dataDir = dirname(DB_PATH);
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);

// Habilita WAL para melhor performance concorrente
db.pragma('journal_mode = WAL');

// Schema — mesmas opções da CLI
db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    youtube_id     TEXT,
    url            TEXT NOT NULL,
    title          TEXT,
    channel        TEXT,
    category       TEXT NOT NULL,
    format         TEXT NOT NULL DEFAULT 'mp4',
    audio_only     INTEGER NOT NULL DEFAULT 0,
    quality        TEXT NOT NULL DEFAULT 'high',
    subtitles      INTEGER NOT NULL DEFAULT 0,
    sub_lang       TEXT NOT NULL DEFAULT 'pt,en',
    concurrency    INTEGER NOT NULL DEFAULT 3,
    fragments      INTEGER NOT NULL DEFAULT 4,
    file_path      TEXT,
    thumbnail      TEXT,
    duration       INTEGER,
    status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK(status IN ('pending','downloading','done','error')),
    error_msg      TEXT,
    downloaded_at  TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);


// Migração silenciosa: adiciona colunas novas se o banco já existia
const existingCols = db.prepare("PRAGMA table_info(videos)").all().map(c => c.name);
const migrations = [
  { col: 'subtitles', def: "INTEGER NOT NULL DEFAULT 0" },
  { col: 'sub_lang', def: "TEXT NOT NULL DEFAULT 'pt,en'" },
  { col: 'concurrency', def: "INTEGER NOT NULL DEFAULT 3" },
  { col: 'fragments', def: "INTEGER NOT NULL DEFAULT 4" },
];
for (const { col, def } of migrations) {
  if (!existingCols.includes(col)) {
    db.exec(`ALTER TABLE videos ADD COLUMN ${col} ${def}`);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

export function listVideos({ category, status } = {}) {
  let sql = 'SELECT * FROM videos WHERE 1=1';
  const params = [];
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC';
  return db.prepare(sql).all(...params);
}

export function getVideo(id) {
  return db.prepare('SELECT * FROM videos WHERE id = ?').get(id);
}

/**
 * Busca um vídeo já baixado (status=done) pelo youtube_id.
 * Retorna o registro ou undefined se não existir.
 */
export function findVideoByYoutubeId(youtubeId) {
  if (!youtubeId) return undefined;
  return db.prepare('SELECT * FROM videos WHERE youtube_id = ? AND status = ?').get(youtubeId, 'done');
}

/**
 * Busca um vídeo já baixado (status=done) pelo título.
 * Retorna o registro ou undefined se não existir.
 */
export function findVideoByTitle(title) {
  if (!title) return undefined;
  return db.prepare('SELECT * FROM videos WHERE title = ? AND status = ?').get(title, 'done');
}

export function insertVideo({
  url,
  category,
  format = 'mp4',
  audioOnly = false,
  quality = 'high',
  subtitles = false,
  subLang = 'pt,en',
  concurrency = 3,
  fragments = 4,
}) {
  const result = db.prepare(`
    INSERT INTO videos (url, category, format, audio_only, quality, subtitles, sub_lang, concurrency, fragments)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    url, category, format,
    audioOnly ? 1 : 0,
    quality,
    subtitles ? 1 : 0,
    subLang,
    concurrency,
    fragments,
  );
  return getVideo(result.lastInsertRowid);
}

export function updateVideo(id, fields) {
  const allowed = [
    'title', 'channel', 'youtube_id', 'file_path', 'thumbnail',
    'duration', 'status', 'error_msg', 'downloaded_at',
  ];
  const keys = Object.keys(fields).filter(k => allowed.includes(k));
  if (keys.length === 0) return;
  const sets = keys.map(k => `${k} = ?`);
  const values = keys.map(k => fields[k]);
  db.prepare(`UPDATE videos SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
}

export function deleteVideo(id) {
  return db.prepare('DELETE FROM videos WHERE id = ?').run(id);
}

export default db;

