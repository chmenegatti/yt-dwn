import youtubedl from './ytdlp.js';
import chalk from 'chalk';
import ora from 'ora';
import { join } from 'path';
import { sanitizeFilename, ensureDir } from './utils.js';

/**
 * Lista legendas disponíveis para um vídeo
 */
export async function listSubtitles(url) {
  const spinner = ora({
    text: chalk.cyan('Buscando legendas disponíveis...'),
    spinner: 'dots',
  }).start();

  try {
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
    });

    spinner.stop();

    const manual = info.subtitles ? Object.keys(info.subtitles) : [];
    const automatic = info.automatic_captions ? Object.keys(info.automatic_captions) : [];

    return { manual, automatic, title: info.title };
  } catch (err) {
    spinner.stop();
    throw new Error(`Falha ao listar legendas: ${err.message}`);
  }
}

/**
 * Exibe legendas disponíveis no terminal
 */
export function displaySubtitles(subsInfo) {
  const separator = chalk.gray('─'.repeat(50));

  console.log(`\n${separator}`);
  console.log(chalk.cyan.bold(`  📝 Legendas: ${subsInfo.title}`));
  console.log(separator);

  if (subsInfo.manual.length > 0) {
    console.log(chalk.green('\n  Legendas manuais:'));
    subsInfo.manual.forEach(lang => {
      console.log(chalk.white(`    • ${lang}`));
    });
  } else {
    console.log(chalk.yellow('\n  ℹ️  Sem legendas manuais disponíveis'));
  }

  if (subsInfo.automatic.length > 0) {
    console.log(chalk.blue('\n  Legendas automáticas:'));
    // Mostrar apenas os mais comuns para não poluir
    const common = ['pt', 'pt-BR', 'en', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'zh-Hans', 'ru'];
    const filtered = subsInfo.automatic.filter(l => common.some(c => l.startsWith(c)));
    const others = subsInfo.automatic.length - filtered.length;

    filtered.forEach(lang => {
      console.log(chalk.white(`    • ${lang}`));
    });

    if (others > 0) {
      console.log(chalk.gray(`    ... e mais ${others} idiomas`));
    }
  } else {
    console.log(chalk.yellow('  ℹ️  Sem legendas automáticas disponíveis'));
  }

  console.log(separator + '\n');
}

/**
 * Download de legendas de um vídeo
 */
export async function downloadSubtitles(url, options = {}) {
  const {
    lang = 'pt,en',
    outputDir = './downloads',
    autoSub = true,
  } = options;

  const spinner = ora({
    text: chalk.cyan('Baixando legendas...'),
    spinner: 'dots',
  }).start();

  try {
    // Obter info para nome de arquivo
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
    });

    const title = sanitizeFilename(info.title || 'video');
    const channel = sanitizeFilename(info.channel || info.uploader || 'Unknown');
    const finalDir = join(outputDir, channel);
    ensureDir(finalDir);

    const outputTemplate = join(finalDir, `${title}.%(ext)s`);

    const args = {
      output: outputTemplate,
      writeSub: true,
      subLang: lang,
      subFormat: 'srt/best',
      skipDownload: true,
      noCheckCertificates: true,
      noWarnings: true,
    };

    if (autoSub) {
      args.writeAutoSub = true;
    }

    await youtubedl(url, args);

    spinner.succeed(chalk.green('Legendas baixadas com sucesso!'));
    console.log(chalk.gray(`  📁 Salvo em: ${finalDir}\n`));

    return { success: true, dir: finalDir };
  } catch (err) {
    spinner.fail(chalk.red('Falha ao baixar legendas'));
    throw new Error(`Falha ao baixar legendas: ${err.message}`);
  }
}
