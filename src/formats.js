import ffmpeg from 'fluent-ffmpeg';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { existsSync } from 'fs';
import { basename, dirname, extname, join } from 'path';

/**
 * Formatos suportados para conversão
 */
export const SUPPORTED_FORMATS = {
  video: ['mp4', 'mkv', 'webm', 'avi', 'mov'],
  audio: ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'],
};

/**
 * Verifica se ffmpeg está disponível
 */
export function checkFfmpeg() {
  return new Promise((resolve) => {
    ffmpeg.getAvailableFormats((err) => {
      resolve(!err);
    });
  });
}

/**
 * Converte um arquivo de mídia para outro formato
 */
export async function convertFormat(inputPath, outputFormat, options = {}) {
  if (!existsSync(inputPath)) {
    throw new Error(`Arquivo não encontrado: ${inputPath}`);
  }

  const allFormats = [...SUPPORTED_FORMATS.video, ...SUPPORTED_FORMATS.audio];
  if (!allFormats.includes(outputFormat)) {
    throw new Error(
      `Formato não suportado: ${outputFormat}. Formatos disponíveis: ${allFormats.join(', ')}`
    );
  }

  const inputExt = extname(inputPath).slice(1).toLowerCase();
  if (inputExt === outputFormat) {
    console.log(chalk.yellow(`  ⚠️  O arquivo já está no formato ${outputFormat}`));
    return inputPath;
  }

  const dir = dirname(inputPath);
  const name = basename(inputPath, extname(inputPath));
  const outputPath = options.outputPath || join(dir, `${name}.${outputFormat}`);

  console.log(chalk.cyan(`\n  🔄 Convertendo: ${inputExt} → ${outputFormat}`));

  const progressBar = new cliProgress.SingleBar({
    format: chalk.magenta('{bar}') + ' | {percentage}% | {timemark}',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true,
    barsize: 30,
  });

  return new Promise((resolve, reject) => {
    let totalDuration = 0;
    let progressStarted = false;

    const command = ffmpeg(inputPath)
      .output(outputPath)
      .on('codecData', (data) => {
        // Parsear duração total
        const parts = data.duration.split(':');
        if (parts.length === 3) {
          totalDuration =
            parseFloat(parts[0]) * 3600 +
            parseFloat(parts[1]) * 60 +
            parseFloat(parts[2]);
        }
      })
      .on('progress', (progress) => {
        if (totalDuration > 0) {
          if (!progressStarted) {
            progressBar.start(100, 0, { timemark: '00:00:00' });
            progressStarted = true;
          }

          const percent = progress.percent
            ? Math.min(Math.floor(progress.percent), 100)
            : 0;

          progressBar.update(percent, {
            timemark: progress.timemark || '00:00:00',
          });
        }
      })
      .on('end', () => {
        if (progressStarted) {
          progressBar.update(100);
          progressBar.stop();
        }
        console.log(chalk.green(`  ✅ Conversão concluída!`));
        console.log(chalk.gray(`  📁 Salvo em: ${outputPath}\n`));
        resolve(outputPath);
      })
      .on('error', (err) => {
        if (progressStarted) {
          progressBar.stop();
        }
        reject(new Error(`Falha na conversão: ${err.message}`));
      });

    // Configurações de qualidade para áudio
    if (SUPPORTED_FORMATS.audio.includes(outputFormat)) {
      command.noVideo();
      if (outputFormat === 'mp3') {
        command.audioBitrate(options.audioBitrate || '320k');
      } else if (outputFormat === 'flac') {
        command.audioCodec('flac');
      } else if (outputFormat === 'aac') {
        command.audioCodec('aac').audioBitrate(options.audioBitrate || '256k');
      }
    }

    command.run();
  });
}
