import { Command } from 'commander';
import chalk from 'chalk';
import {
  isValidYouTubeUrl, isPlaylistUrl,
  validateBatchFile, validateQuality, validateFormat, validateCategory,
  VALID_CATEGORIES,
} from './validators.js';
import { downloadVideo, downloadBatch } from './downloader.js';
import { downloadPlaylist } from './playlists.js';
import { downloadWithPersist } from './downloader-db.js';
import { getVideoInfo, displayVideoInfo } from './metadata.js';
import { listSubtitles, displaySubtitles, downloadSubtitles } from './subtitles.js';
import { convertFormat } from './formats.js';
import { startInteractive } from './interactive.js';

const program = new Command();

program
  .name('yt-dwn')
  .description(chalk.cyan('CLI para download de vídeos do YouTube'))
  .version('1.0.0')
  .option('-q, --quality <nivel>', 'Qualidade: high, medium, low', 'high')
  .option('-a, --audio-only', 'Apenas áudio', false)
  .option('-f, --format <fmt>', 'Formato de saída: mp4, mkv, webm, mp3, wav, aac, flac')
  .option('-o, --output <dir>', 'Diretório de saída', './downloads')
  .option('-C, --category <cat>', `Categoria: ${VALID_CATEGORIES.join(', ')}`)
  .option('-s, --subtitles', 'Baixar legendas', false)
  .option('--sub-lang <lang>', 'Idioma das legendas', 'pt,en')
  .option('-c, --concurrency <n>', 'Downloads paralelos (batch/playlist)', (v) => parseInt(v, 10), 3)
  .option('--fragments <n>', 'Fragmentos paralelos por vídeo (mais rápido)', (v) => parseInt(v, 10), 4);

// ─── Helpers ───────────────────────────────────────────────────────
/**
 * Se uma categoria foi fornecida, usa downloadWithPersist (salva no banco).
 * Caso contrário, usa o downloadVideo/downloadPlaylist direto.
 */
async function runDownload(url, options) {
  const {
    quality, audioOnly, output, category, subtitles, subLang, concurrency, fragments,
  } = options;
  const format = options.format || (audioOnly ? 'mp3' : 'mp4');

  if (category) {
    // Com categoria → persiste no banco automaticamente
    return downloadWithPersist(url, {
      category,
      quality,
      audioOnly,
      format,
      outputDir: output,
      subtitles,
      subLang,
      concurrency,
      concurrentFragments: fragments,
    });
  }

  // Sem categoria → download direto (comportamento original)
  if (isPlaylistUrl(url) && !isValidYouTubeUrl(url)) {
    return downloadPlaylist(url, {
      quality,
      audioOnly,
      format,
      outputDir: output,
      concurrency,
      concurrentFragments: fragments,
    });
  }

  return downloadVideo(url, {
    quality,
    audioOnly,
    format,
    outputDir: output,
    subtitles,
    subLang,
    concurrentFragments: fragments,
  });
}

// ─── Comando padrão: download de URL ──────────────────────────────
program
  .argument('[url]', 'URL do vídeo do YouTube')
  .action(async (url) => {
    if (!url) { program.help(); return; }

    const options = program.opts();

    try {
      validateQuality(options.quality);
      if (options.format) validateFormat(options.format);
      if (options.category) validateCategory(options.category);
    } catch (err) {
      console.log(chalk.red(`\n  ❌ ${err.message}\n`));
      process.exit(1);
    }

    if (!isValidYouTubeUrl(url) && !isPlaylistUrl(url)) {
      console.log(chalk.red('\n  ❌ URL inválida. Forneça uma URL válida do YouTube.'));
      console.log(chalk.gray('  Formatos aceitos:'));
      console.log(chalk.gray('    • https://www.youtube.com/watch?v=VIDEO_ID'));
      console.log(chalk.gray('    • https://youtu.be/VIDEO_ID'));
      console.log(chalk.gray('    • https://www.youtube.com/shorts/VIDEO_ID'));
      console.log(chalk.gray('    • https://www.youtube.com/playlist?list=PLAYLIST_ID\n'));
      process.exit(1);
    }

    try {
      await runDownload(url, options);
    } catch (err) {
      console.log(chalk.red(`\n  ❌ ${err.message}\n`));
      process.exit(1);
    }
  });

// ─── Comando: batch ────────────────────────────────────────────────
program
  .command('batch <arquivo>')
  .description('Download em lote a partir de um arquivo JSON')
  .action(async (arquivo) => {
    const options = program.opts();

    let items;
    try {
      items = validateBatchFile(arquivo);
    } catch (err) {
      console.log(chalk.red(`\n  ❌ ${err.message}\n`));
      process.exit(1);
    }

    if (options.category) {
      try { validateCategory(options.category); } catch (err) {
        console.log(chalk.red(`\n  ❌ ${err.message}\n`));
        process.exit(1);
      }
    }

    const format = options.format || (options.audioOnly ? 'mp3' : 'mp4');

    try {
      if (options.category) {
        // Reutiliza downloadWithPersist para cada item do batch
        for (const item of items) {
          await downloadWithPersist(item.url, {
            category: options.category,
            quality: item.quality || options.quality,
            audioOnly: item.audioOnly !== undefined ? item.audioOnly : options.audioOnly,
            format: item.format || format,
            outputDir: options.output,
            subtitles: options.subtitles,
            subLang: options.subLang,
            concurrency: options.concurrency,
            concurrentFragments: options.fragments,
          }).catch(err => {
            console.log(chalk.red(`  ❌ ${item.url}: ${err.message}`));
          });
        }
      } else {
        await downloadBatch(items, {
          quality: options.quality,
          audioOnly: options.audioOnly,
          format,
          outputDir: options.output,
          subtitles: options.subtitles,
          subLang: options.subLang,
          concurrency: options.concurrency,
          concurrentFragments: options.fragments,
        });
      }
    } catch (err) {
      console.log(chalk.red(`\n  ❌ ${err.message}\n`));
      process.exit(1);
    }
  });

// ─── Comando: playlist ─────────────────────────────────────────────
program
  .command('playlist <url>')
  .description('Download de playlist completa')
  .action(async (url) => {
    const options = program.opts();

    if (!isPlaylistUrl(url) && !isValidYouTubeUrl(url)) {
      console.log(chalk.red('\n  ❌ URL de playlist inválida.\n'));
      process.exit(1);
    }

    if (options.category) {
      try { validateCategory(options.category); } catch (err) {
        console.log(chalk.red(`\n  ❌ ${err.message}\n`));
        process.exit(1);
      }
    }

    try {
      await runDownload(url, { ...options, format: options.format });
    } catch (err) {
      console.log(chalk.red(`\n  ❌ ${err.message}\n`));
      process.exit(1);
    }
  });

// ─── Comando: info ──────────────────────────────────────────────────
program
  .command('info <url>')
  .description('Exibe metadados de um vídeo')
  .action(async (url) => {
    if (!isValidYouTubeUrl(url)) {
      console.log(chalk.red('\n  ❌ URL inválida.\n'));
      process.exit(1);
    }
    try {
      const info = await getVideoInfo(url);
      displayVideoInfo(info);
    } catch (err) {
      console.log(chalk.red(`\n  ❌ ${err.message}\n`));
      process.exit(1);
    }
  });

// ─── Comando: subs ──────────────────────────────────────────────────
program
  .command('subs <url>')
  .description('Baixar legendas de um vídeo')
  .option('-l, --lang <idiomas>', 'Idiomas das legendas', 'pt,en')
  .action(async (url, subOpts) => {
    const options = program.opts();
    if (!isValidYouTubeUrl(url)) {
      console.log(chalk.red('\n  ❌ URL inválida.\n'));
      process.exit(1);
    }
    try {
      const subsInfo = await listSubtitles(url);
      displaySubtitles(subsInfo);
      await downloadSubtitles(url, {
        lang: subOpts.lang || options.subLang,
        outputDir: options.output,
      });
    } catch (err) {
      console.log(chalk.red(`\n  ❌ ${err.message}\n`));
      process.exit(1);
    }
  });

// ─── Comando: convert ───────────────────────────────────────────────
program
  .command('convert <arquivo> <formato>')
  .description('Converter arquivo de mídia para outro formato')
  .action(async (arquivo, formato) => {
    try {
      await convertFormat(arquivo, formato);
    } catch (err) {
      console.log(chalk.red(`\n  ❌ ${err.message}\n`));
      process.exit(1);
    }
  });

// ─── Comando: interactive ──────────────────────────────────────────
program
  .command('interactive')
  .alias('i')
  .description('Modo interativo com prompts')
  .action(async () => {
    try {
      await startInteractive();
    } catch (err) {
      if (err.name === 'ExitPromptError') {
        console.log(chalk.cyan('\n  👋 Até logo!\n'));
      } else {
        console.log(chalk.red(`\n  ❌ ${err.message}\n`));
        process.exit(1);
      }
    }
  });

export { program };
