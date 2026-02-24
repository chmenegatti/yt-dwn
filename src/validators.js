import { readFileSync, existsSync } from 'fs';

/**
 * Padrões de URL do YouTube suportados
 */
const YOUTUBE_PATTERNS = [
  // youtube.com/watch?v=VIDEO_ID
  /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  // youtu.be/VIDEO_ID
  /^(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
  // youtube.com/shorts/VIDEO_ID
  /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  // youtube.com/embed/VIDEO_ID
  /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  // youtube.com/v/VIDEO_ID
  /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  // m.youtube.com/watch?v=VIDEO_ID
  /^(?:https?:\/\/)?m\.youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  // music.youtube.com/watch?v=VIDEO_ID
  /^(?:https?:\/\/)?music\.youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
];

const PLAYLIST_PATTERN =
  /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/playlist\?.*list=([a-zA-Z0-9_-]+)/;

const PLAYLIST_IN_URL_PATTERN =
  /[?&]list=([a-zA-Z0-9_-]+)/;

/**
 * Verifica se a URL é uma URL válida do YouTube
 */
export function isValidYouTubeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return YOUTUBE_PATTERNS.some(pattern => pattern.test(url.trim()));
}

/**
 * Verifica se a URL é uma playlist do YouTube
 */
export function isPlaylistUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return PLAYLIST_PATTERN.test(url.trim()) || PLAYLIST_IN_URL_PATTERN.test(url.trim());
}

/**
 * Extrai o ID do vídeo de uma URL do YouTube
 */
export function extractVideoId(url) {
  if (!url) return null;
  const trimmed = url.trim();
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Extrai o ID da playlist de uma URL do YouTube
 */
export function extractPlaylistId(url) {
  if (!url) return null;
  const trimmed = url.trim();

  const playlistMatch = trimmed.match(PLAYLIST_PATTERN);
  if (playlistMatch) return playlistMatch[1];

  const inUrlMatch = trimmed.match(PLAYLIST_IN_URL_PATTERN);
  if (inUrlMatch) return inUrlMatch[1];

  return null;
}

/**
 * Valida e parseia um arquivo JSON de batch download
 * Formato esperado: array de strings (URLs) ou array de objetos { url, quality?, format?, audioOnly? }
 */
export function validateBatchFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`Erro ao ler arquivo: ${err.message}`);
  }

  let data;
  try {
    data = JSON.parse(content);
  } catch (err) {
    throw new Error(`JSON inválido: ${err.message}`);
  }

  if (!Array.isArray(data)) {
    throw new Error('O arquivo JSON deve conter um array de URLs ou objetos');
  }

  if (data.length === 0) {
    throw new Error('O arquivo JSON está vazio');
  }

  const items = data.map((item, index) => {
    if (typeof item === 'string') {
      if (!isValidYouTubeUrl(item)) {
        throw new Error(`URL inválida na posição ${index + 1}: ${item}`);
      }
      return { url: item.trim() };
    }

    if (typeof item === 'object' && item !== null) {
      if (!item.url) {
        throw new Error(`Item na posição ${index + 1} não possui campo "url"`);
      }
      if (!isValidYouTubeUrl(item.url)) {
        throw new Error(`URL inválida na posição ${index + 1}: ${item.url}`);
      }
      return {
        url: item.url.trim(),
        quality: item.quality || undefined,
        format: item.format || undefined,
        audioOnly: item.audioOnly || false,
      };
    }

    throw new Error(`Item inválido na posição ${index + 1}: esperado string ou objeto`);
  });

  return items;
}

/**
 * Valida a opção de qualidade
 */
export function validateQuality(quality) {
  const valid = ['high', 'medium', 'low'];
  if (!valid.includes(quality)) {
    throw new Error(`Qualidade inválida: "${quality}". Use: ${valid.join(', ')}`);
  }
  return quality;
}

/**
 * Valida o formato de saída
 */
export function validateFormat(format) {
  const valid = ['mp4', 'mkv', 'webm', 'mp3', 'wav', 'aac', 'flac', 'ogg'];
  if (!valid.includes(format)) {
    throw new Error(`Formato inválido: "${format}". Use: ${valid.join(', ')}`);
  }
  return format;
}

/**
 * Categorias disponíveis para organização dos downloads
 */
export const VALID_CATEGORIES = ['Histórias', 'Músicas', 'Educação', 'Desenhos'];

/**
 * Valida a categoria de download
 */
export function validateCategory(category) {
  if (!VALID_CATEGORIES.includes(category)) {
    throw new Error(
      `Categoria inválida: "${category}". Use: ${VALID_CATEGORIES.join(', ')}`
    );
  }
  return category;
}
