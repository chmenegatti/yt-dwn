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

// Schema
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

export function insertVideo({ url, category, format = 'mp4', audioOnly = false, quality = 'high' }) {
  const result = db.prepare(`
    INSERT INTO videos (url, category, format, audio_only, quality)
    VALUES (?, ?, ?, ?, ?)
  `).run(url, category, format, audioOnly ? 1 : 0, quality);
  return getVideo(result.lastInsertRowid);
}

export function updateVideo(id, fields) {
  const allowed = ['title', 'channel', 'youtube_id', 'file_path', 'thumbnail',
    'duration', 'status', 'error_msg', 'downloaded_at'];
  const sets = Object.keys(fields)
    .filter(k => allowed.includes(k))
    .map(k => `${k} = ?`);
  if (sets.length === 0) return;
  const values = sets.map((_, i) => fields[Object.keys(fields).filter(k => allowed.includes(k))[i]]);
  db.prepare(`UPDATE videos SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
}

export function deleteVideo(id) {
  return db.prepare('DELETE FROM videos WHERE id = ?').run(id);
}

export default db;
