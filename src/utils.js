import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Remove caracteres inválidos de nomes de arquivo
 */
export function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .trim()
    .slice(0, 200);
}

/**
 * Converte segundos para formato HH:MM:SS
 */
export function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Converte bytes para formato legível (KB, MB, GB)
 */
export function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(2)} ${units[i]}`;
}

/**
 * Cria diretório se não existir (recursivo)
 */
export function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * Formata número com separador de milhar
 */
export function formatNumber(num) {
  if (!num || isNaN(num)) return '0';
  return num.toLocaleString('pt-BR');
}

/**
 * Resolve o diretório de saída com categoria e subpasta (canal) opcionais
 * Estrutura: baseDir / [categoria] / [canal]
 */
export function resolveOutputPath(baseDir, category, channel) {
  let outputDir = baseDir;
  if (category) outputDir = join(outputDir, sanitizeFilename(category));
  if (channel) outputDir = join(outputDir, sanitizeFilename(channel));
  return ensureDir(outputDir);
}
