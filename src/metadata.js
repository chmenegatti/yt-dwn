import youtubedl from './ytdlp.js';
import chalk from 'chalk';
import { formatDuration, formatNumber } from './utils.js';

/**
 * Extrai e exibe metadados de um vídeo do YouTube
 */
export async function getVideoInfo(url) {
  let info;
  try {
    info = await youtubedl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
    });
  } catch (err) {
    throw new Error(`Falha ao obter metadados: ${err.message}`);
  }

  return {
    title: info.title || 'N/A',
    channel: info.channel || info.uploader || 'N/A',
    channelUrl: info.channel_url || info.uploader_url || 'N/A',
    duration: info.duration || 0,
    durationFormatted: formatDuration(info.duration),
    viewCount: info.view_count || 0,
    likeCount: info.like_count || 0,
    description: info.description || 'N/A',
    uploadDate: info.upload_date || 'N/A',
    thumbnail: info.thumbnail || 'N/A',
    categories: info.categories || [],
    tags: (info.tags || []).slice(0, 10),
    formats: (info.formats || []).length,
    webpage_url: info.webpage_url || url,
    id: info.id || 'N/A',
    ageLimit: info.age_limit || 0,
    resolution: info.resolution || 'N/A',
    fps: info.fps || 'N/A',
    filesize: info.filesize_approx || info.filesize || null,
  };
}

/**
 * Exibe metadados formatados no terminal
 */
export function displayVideoInfo(info) {
  const separator = chalk.gray('─'.repeat(60));

  console.log(`\n${separator}`);
  console.log(chalk.cyan.bold('  📹 Informações do Vídeo'));
  console.log(separator);

  const rows = [
    ['Título', chalk.white.bold(info.title)],
    ['Canal', chalk.yellow(info.channel)],
    ['ID', chalk.gray(info.id)],
    ['Duração', chalk.green(info.durationFormatted)],
    ['Visualizações', chalk.magenta(formatNumber(info.viewCount))],
    ['Curtidas', chalk.magenta(formatNumber(info.likeCount))],
    ['Data Upload', chalk.gray(formatUploadDate(info.uploadDate))],
    ['Resolução', chalk.blue(info.resolution)],
    ['FPS', chalk.blue(String(info.fps))],
    ['Restrição Idade', info.ageLimit > 0 ? chalk.red(`${info.ageLimit}+`) : chalk.green('Nenhuma')],
    ['Formatos Disp.', chalk.gray(String(info.formats))],
    ['Categorias', chalk.gray(info.categories.join(', ') || 'N/A')],
  ];

  rows.forEach(([label, value]) => {
    console.log(`  ${chalk.cyan(label.padEnd(18))} ${value}`);
  });

  if (info.tags.length > 0) {
    console.log(`  ${chalk.cyan('Tags'.padEnd(18))} ${chalk.gray(info.tags.join(', '))}`);
  }

  if (info.description && info.description !== 'N/A') {
    console.log(`\n  ${chalk.cyan('Descrição:')}`);
    const desc = info.description.length > 300
      ? info.description.substring(0, 300) + '...'
      : info.description;
    desc.split('\n').slice(0, 5).forEach(line => {
      console.log(chalk.gray(`  ${line}`));
    });
  }

  console.log(`\n  ${chalk.cyan('URL:')} ${chalk.blue.underline(info.webpage_url)}`);
  console.log(`  ${chalk.cyan('Thumbnail:')} ${chalk.blue.underline(info.thumbnail)}`);
  console.log(separator + '\n');

  return info;
}

/**
 * Formata data de upload (YYYYMMDD -> DD/MM/YYYY)
 */
function formatUploadDate(dateStr) {
  if (!dateStr || dateStr === 'N/A' || dateStr.length !== 8) return dateStr;
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  return `${day}/${month}/${year}`;
}

/**
 * Lista legendas disponíveis para um vídeo
 */
export async function listAvailableSubtitles(url) {
  let info;
  try {
    info = await youtubedl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
    });
  } catch (err) {
    throw new Error(`Falha ao listar legendas: ${err.message}`);
  }

  const subtitles = info.subtitles || {};
  const autoSubs = info.automatic_captions || {};

  return {
    manual: Object.keys(subtitles),
    automatic: Object.keys(autoSubs),
  };
}
