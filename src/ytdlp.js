import { create } from 'youtube-dl-exec';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Tenta localizar o binário yt-dlp no sistema
 */
function findYtDlpBinary() {
  // 1. Variável de ambiente
  if (process.env.YTDLP_PATH && existsSync(process.env.YTDLP_PATH)) {
    return process.env.YTDLP_PATH;
  }

  // 2. Caminhos comuns
  const commonPaths = [
    join(homedir(), '.local', 'bin', 'yt-dlp'),
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
  ];

  for (const p of commonPaths) {
    if (existsSync(p)) return p;
  }

  // 3. Tentar via which
  try {
    const result = execSync('which yt-dlp 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (result) return result;
  } catch {
    // ignorar
  }

  return null;
}

const binaryPath = findYtDlpBinary();

/**
 * Instância configurada do youtube-dl-exec usando o binário yt-dlp encontrado.
 * Se não encontrado, usa o default do pacote (que pode falhar se o binary não foi baixado).
 */
let rawYtdl;
if (binaryPath) {
  rawYtdl = create(binaryPath);
} else {
  // Fallback: tenta usar o default do pacote
  const mod = await import('youtube-dl-exec');
  rawYtdl = mod.default;
}

/**
 * Opções padrão injetadas em todas as chamadas ao yt-dlp.
 * jsRuntimes: 'node' é necessário a partir do yt-dlp 2025+ para extração do YouTube.
 * Veja: https://github.com/yt-dlp/yt-dlp/wiki/EJS
 */
const defaultOptions = {
  jsRuntimes: 'node',
};

/**
 * Wrapper que injeta opções padrão automaticamente.
 * Suporta youtubedl(url, opts) e youtubedl.exec(url, opts).
 */
const youtubedl = function (url, opts = {}) {
  return rawYtdl(url, { ...defaultOptions, ...opts });
};

youtubedl.exec = function (url, opts = {}) {
  return rawYtdl.exec(url, { ...defaultOptions, ...opts });
};

export default youtubedl;
export { binaryPath };
