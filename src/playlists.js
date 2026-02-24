import youtubedl from './ytdlp.js';
import chalk from 'chalk';
import ora from 'ora';
import { downloadBatch } from './downloader.js';

/**
 * Obtém lista de vídeos de uma playlist
 */
export async function getPlaylistInfo(url) {
  const spinner = ora({
    text: chalk.cyan('Obtendo informações da playlist...'),
    spinner: 'dots',
  }).start();

  try {
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      flatPlaylist: true,
      noCheckCertificates: true,
      noWarnings: true,
    });

    spinner.stop();

    const entries = info.entries || [];

    return {
      title: info.title || 'Playlist',
      channel: info.channel || info.uploader || 'Desconhecido',
      count: entries.length,
      entries: entries.map((entry, index) => ({
        index: index + 1,
        id: entry.id,
        title: entry.title || `Vídeo ${index + 1}`,
        url: entry.url || entry.webpage_url || `https://www.youtube.com/watch?v=${entry.id}`,
        duration: entry.duration || 0,
      })),
    };
  } catch (err) {
    spinner.stop();
    throw new Error(`Falha ao obter playlist: ${err.message}`);
  }
}

/**
 * Download de playlist completa
 */
export async function downloadPlaylist(url, options = {}) {
  const playlistInfo = await getPlaylistInfo(url);

  const separator = chalk.gray('═'.repeat(60));
  console.log(`\n${separator}`);
  console.log(chalk.cyan.bold(`  🎵 Playlist: ${playlistInfo.title}`));
  console.log(chalk.gray(`  📺 Canal: ${playlistInfo.channel}`));
  console.log(chalk.gray(`  📊 Total: ${playlistInfo.count} vídeos`));
  console.log(separator);

  if (playlistInfo.count === 0) {
    console.log(chalk.yellow('\n  ⚠️  A playlist está vazia.\n'));
    return { success: [], failed: [] };
  }

  // Listar vídeos
  console.log(chalk.gray('\n  Vídeos:'));
  playlistInfo.entries.forEach(entry => {
    const duration = entry.duration
      ? ` (${Math.floor(entry.duration / 60)}:${(entry.duration % 60).toString().padStart(2, '0')})`
      : '';
    console.log(chalk.gray(`  ${String(entry.index).padStart(3)}. ${entry.title}${duration}`));
  });
  console.log();

  // Converter entries em items para downloadBatch
  const items = playlistInfo.entries.map(entry => ({
    url: entry.url.startsWith('http')
      ? entry.url
      : `https://www.youtube.com/watch?v=${entry.id}`,
  }));

  // Usar downloadBatch para paralelismo
  const results = await downloadBatch(items, {
    ...options,
    outputDir: options.outputDir || './downloads',
  });

  // Resumo
  console.log(`\n${separator}`);
  console.log(chalk.cyan.bold('  📊 Resumo da Playlist:'));
  console.log(chalk.green(`  ✅ Sucesso: ${results.success.length}/${playlistInfo.count}`));
  if (results.failed.length > 0) {
    console.log(chalk.red(`  ❌ Falha: ${results.failed.length}`));
    results.failed.forEach(f => {
      console.log(chalk.red(`     • ${f.url}`));
    });
  }
  console.log(separator + '\n');

  return results;
}
