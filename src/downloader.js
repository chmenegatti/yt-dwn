import youtubedl from './ytdlp.js';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { join } from 'path';
import { sanitizeFilename, ensureDir, resolveOutputPath } from './utils.js';

/**
 * Mapeia qualidade para formato yt-dlp
 */
function getFormatByQuality(quality, audioOnly) {
  if (audioOnly) {
    return 'bestaudio/best';
  }

  switch (quality) {
    case 'high':
      return 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best';
    case 'medium':
      return 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best';
    case 'low':
      return 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best';
    default:
      return 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best';
  }
}

/**
 * Faz download de um vídeo do YouTube
 */
export async function downloadVideo(url, options = {}) {
  const {
    quality = 'high',
    audioOnly = false,
    format = audioOnly ? 'mp3' : 'mp4',
    outputDir = './downloads',
    category = null,
    subtitles = false,
    subLang = 'pt,en',
    concurrentFragments = 4,
    silent = false,
  } = options;

  // Primeiro buscar info do vídeo para organização
  if (!silent) console.log(chalk.cyan('\n🔍 Obtendo informações do vídeo...\n'));

  let info;
  try {
    info = await youtubedl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
    });
  } catch (err) {
    throw new Error(`Falha ao obter informações: ${err.message}`);
  }

  const title = sanitizeFilename(info.title || 'video');
  const channel = sanitizeFilename(info.channel || info.uploader || 'Unknown');

  if (!silent) {
    console.log(chalk.white(`  📹 ${chalk.bold(info.title)}`));
    console.log(chalk.gray(`  📺 Canal: ${info.channel || info.uploader || 'Desconhecido'}`));
    if (info.duration) {
      const mins = Math.floor(info.duration / 60);
      const secs = info.duration % 60;
      console.log(chalk.gray(`  ⏱️  Duração: ${mins}:${secs.toString().padStart(2, '0')}`));
    }
    console.log();
  }

  // Organizar em subpastas por categoria e canal
  const finalOutputDir = resolveOutputPath(outputDir, category, channel);
  const outputTemplate = join(finalOutputDir, `${title}.%(ext)s`);

  // Configurar barra de progresso
  const progressBar = new cliProgress.SingleBar({
    format: chalk.cyan('{bar}') + ' | {percentage}% | {speed} | ETA: {eta_formatted}',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true,
    barsize: 30,
  });

  let progressStarted = false;

  // Montar args do yt-dlp
  const ytdlpArgs = {
    format: getFormatByQuality(quality, audioOnly),
    output: outputTemplate,
    noCheckCertificates: true,
    noWarnings: true,
    preferFreeFormats: true,
    mergeOutputFormat: audioOnly ? undefined : format,
    concurrentFragments: concurrentFragments,
  };

  // Se audio only, extrair áudio
  if (audioOnly) {
    ytdlpArgs.extractAudio = true;
    ytdlpArgs.audioFormat = format === 'mp4' ? 'mp3' : format;
    ytdlpArgs.audioQuality = quality === 'high' ? '0' : quality === 'medium' ? '5' : '9';
    delete ytdlpArgs.mergeOutputFormat;
  }

  // Legendas
  if (subtitles) {
    ytdlpArgs.writeSub = true;
    ytdlpArgs.writeAutoSub = true;
    ytdlpArgs.subLang = subLang;
    ytdlpArgs.subFormat = 'srt/best';
  }

  try {
    const subprocess = youtubedl.exec(url, ytdlpArgs);

    subprocess.stdout?.on('data', (data) => {
      const line = data.toString();

      // Parsear progresso do yt-dlp
      const progressMatch = line.match(
        /\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\w+)\s+at\s+([\d.]+\w+\/s|Unknown speed)\s+ETA\s+([\d:]+|Unknown)/
      );

      if (progressMatch) {
        const percent = parseFloat(progressMatch[1]);
        const speed = progressMatch[3];

        if (!progressStarted) {
          progressBar.start(100, 0, { speed: 'Iniciando...', eta_formatted: '--:--' });
          progressStarted = true;
        }

        progressBar.update(Math.floor(percent), {
          speed: speed,
          eta_formatted: progressMatch[4],
        });
      }

      // Detectar conclusão do download
      if (line.includes('[download] 100%') || line.includes('has already been downloaded')) {
        if (progressStarted) {
          progressBar.update(100, { speed: 'Concluído', eta_formatted: '00:00' });
          progressBar.stop();
          progressStarted = false;
        }
      }

      // Mostrar etapas de merge/conversão
      if (line.includes('[Merger]') || line.includes('[ExtractAudio]') || line.includes('[ffmpeg]')) {
        if (progressStarted) {
          progressBar.stop();
          progressStarted = false;
        }
        console.log(chalk.yellow(`  ⚙️  ${line.trim()}`));
      }
    });

    subprocess.stderr?.on('data', (data) => {
      const line = data.toString().trim();
      if (line && !line.includes('WARNING')) {
        // Silenciar warnings mas mostrar erros reais
      }
    });

    await subprocess;

    if (progressStarted) {
      progressBar.stop();
    }

    const ext = audioOnly ? (format === 'mp4' ? 'mp3' : format) : format;
    const expectedFile = join(finalOutputDir, `${title}.${ext}`);

    if (!silent) {
      console.log(chalk.green(`\n  ✅ Download concluído!`));
      console.log(chalk.gray(`  📁 Salvo em: ${expectedFile}\n`));
    }

    return { success: true, file: expectedFile, title: info.title, channel: info.channel, youtubeId: info.id, duration: info.duration || null };
  } catch (err) {
    if (progressStarted) {
      progressBar.stop();
    }

    // Tratar erros específicos
    const errorMsg = err.message || err.stderr || String(err);

    if (errorMsg.includes('Video unavailable') || errorMsg.includes('is not available')) {
      throw new Error('❌ Este vídeo não está disponível. Pode ser privado ou ter sido removido.');
    }
    if (errorMsg.includes('age')) {
      throw new Error('❌ Este vídeo tem restrição de idade e não pode ser baixado sem autenticação.');
    }
    if (errorMsg.includes('copyright')) {
      throw new Error('❌ Este vídeo não pode ser baixado por motivos de direitos autorais.');
    }
    if (errorMsg.includes('Sign in') || errorMsg.includes('login')) {
      throw new Error('❌ Este vídeo requer login para ser acessado.');
    }

    throw new Error(`❌ Falha no download: ${errorMsg}`);
  }
}

/**
 * Executa tarefas com concorrência limitada (worker pool)
 */
async function runWithConcurrency(tasks, concurrency) {
  const results = [];
  const executing = new Set();

  for (const task of tasks) {
    const promise = task().then(
      (result) => ({ status: 'fulfilled', value: result }),
      (error) => ({ status: 'rejected', reason: error })
    );
    results.push(promise);
    executing.add(promise);
    promise.finally(() => executing.delete(promise));

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

/**
 * Faz download em lote a partir de uma lista de items
 * Suporta download paralelo com concorrência configurável
 */
export async function downloadBatch(items, globalOptions = {}) {
  const { concurrency = 3, ...downloadOpts } = globalOptions;
  const total = items.length;
  const parallel = Math.min(concurrency, total);

  console.log(chalk.cyan.bold(`\n📦 Download em lote: ${total} vídeo(s)`));
  if (parallel > 1) {
    console.log(chalk.yellow(`  ⚡ Modo paralelo: ${parallel} downloads simultâneos`));
  }
  console.log(chalk.gray('─'.repeat(50)));

  const results = { success: [], failed: [] };
  let completed = 0;

  const tasks = items.map((item, i) => () => {
    const num = i + 1;
    console.log(chalk.cyan(`\n📥 [${num}/${total}] Iniciando download...`));

    const options = {
      ...downloadOpts,
      ...(item.quality && { quality: item.quality }),
      ...(item.format && { format: item.format }),
      ...(item.audioOnly !== undefined && { audioOnly: item.audioOnly }),
    };

    return downloadVideo(item.url, options)
      .then((result) => {
        completed++;
        console.log(chalk.green(`  ✅ [${completed}/${total}] ${result.title || item.url}`));
        results.success.push(result);
        return result;
      })
      .catch((err) => {
        completed++;
        console.log(chalk.red(`  ❌ [${completed}/${total}] ${item.url}`));
        console.log(chalk.gray(`     ${err.message}`));
        results.failed.push({ url: item.url, error: err.message });
      });
  });

  await runWithConcurrency(tasks, parallel);

  // Resumo
  console.log(chalk.gray('\n' + '─'.repeat(50)));
  console.log(chalk.cyan.bold('\n📊 Resumo do download em lote:\n'));
  console.log(chalk.green(`  ✅ Sucesso: ${results.success.length}`));
  if (results.failed.length > 0) {
    console.log(chalk.red(`  ❌ Falha: ${results.failed.length}`));
    results.failed.forEach(f => {
      console.log(chalk.red(`     • ${f.url}`));
      console.log(chalk.gray(`       ${f.error}`));
    });
  }
  console.log();

  return results;
}
