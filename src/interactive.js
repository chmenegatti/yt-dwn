import { select, input, confirm, checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import { isValidYouTubeUrl, isPlaylistUrl } from './validators.js';
import { downloadVideo, downloadBatch } from './downloader.js';
import { downloadPlaylist } from './playlists.js';
import { getVideoInfo, displayVideoInfo } from './metadata.js';
import { listSubtitles, displaySubtitles, downloadSubtitles } from './subtitles.js';
import { convertFormat, SUPPORTED_FORMATS } from './formats.js';

/**
 * Banner da CLI
 */
function showBanner() {
  console.log(chalk.cyan.bold(`
  ╔═══════════════════════════════════════════╗
  ║                                           ║
  ║    ▶  ${chalk.white.bold('yt-dwn')}  •  YouTube Downloader       ║
  ║                                           ║
  ╚═══════════════════════════════════════════╝
  `));
}

/**
 * Menu principal interativo
 */
async function mainMenu() {
  return await select({
    message: chalk.cyan('O que deseja fazer?'),
    choices: [
      { value: 'download', name: '📥  Download de vídeo' },
      { value: 'audio', name: '🎵  Download apenas áudio' },
      { value: 'playlist', name: '📋  Download de playlist' },
      { value: 'batch', name: '📦  Download em lote (JSON)' },
      { value: 'info', name: '📹  Ver informações do vídeo' },
      { value: 'subtitles', name: '📝  Baixar legendas' },
      { value: 'convert', name: '🔄  Converter formato' },
      { value: 'exit', name: '🚪  Sair' },
    ],
  });
}

/**
 * Prompt de URL com validação
 */
async function askUrl(message = 'Cole a URL do YouTube:') {
  return await input({
    message: chalk.cyan(message),
    validate: (value) => {
      if (!value.trim()) return 'URL é obrigatória';
      if (!isValidYouTubeUrl(value.trim()) && !isPlaylistUrl(value.trim())) {
        return 'URL inválida. Por favor, insira uma URL válida do YouTube';
      }
      return true;
    },
  });
}

/**
 * Prompt de qualidade
 */
async function askQuality() {
  return await select({
    message: chalk.cyan('Qualidade:'),
    choices: [
      { value: 'high', name: '🔥 Alta (melhor qualidade disponível)' },
      { value: 'medium', name: '📺 Média (720p)' },
      { value: 'low', name: '📱 Baixa (480p)' },
    ],
    default: 'high',
  });
}

/**
 * Prompt de formato de vídeo
 */
async function askVideoFormat() {
  return await select({
    message: chalk.cyan('Formato de saída:'),
    choices: [
      { value: 'mp4', name: '🎬 MP4 (mais compatível)' },
      { value: 'mkv', name: '📦 MKV (melhor qualidade)' },
      { value: 'webm', name: '🌐 WebM (web)' },
    ],
    default: 'mp4',
  });
}

/**
 * Prompt de formato de áudio
 */
async function askAudioFormat() {
  return await select({
    message: chalk.cyan('Formato de áudio:'),
    choices: [
      { value: 'mp3', name: '🎵 MP3 (mais compatível)' },
      { value: 'wav', name: '📀 WAV (sem perda)' },
      { value: 'aac', name: '🔊 AAC (boa qualidade)' },
      { value: 'flac', name: '💿 FLAC (sem perda, comprimido)' },
      { value: 'ogg', name: '🎧 OGG (código aberto)' },
    ],
    default: 'mp3',
  });
}

/**
 * Prompt de diretório de saída
 */
async function askOutputDir() {
  return await input({
    message: chalk.cyan('Diretório de saída:'),
    default: './downloads',
  });
}

/**
 * Prompt de legendas
 */
async function askSubtitles() {
  const wantSubs = await confirm({
    message: chalk.cyan('Deseja baixar legendas?'),
    default: false,
  });

  if (!wantSubs) return { subtitles: false };

  const subLang = await input({
    message: chalk.cyan('Idiomas das legendas (separados por vírgula):'),
    default: 'pt,en',
  });

  return { subtitles: true, subLang };
}

/**
 * Fluxo de download de vídeo
 */
async function downloadFlow() {
  const url = await askUrl();
  const quality = await askQuality();
  const format = await askVideoFormat();
  const outputDir = await askOutputDir();
  const { subtitles, subLang } = await askSubtitles();

  await downloadVideo(url, { quality, format, outputDir, subtitles, subLang });
}

/**
 * Fluxo de download de áudio
 */
async function audioFlow() {
  const url = await askUrl();
  const format = await askAudioFormat();
  const quality = await askQuality();
  const outputDir = await askOutputDir();

  await downloadVideo(url, {
    quality,
    format,
    outputDir,
    audioOnly: true,
  });
}

/**
 * Fluxo de download de playlist
 */
async function playlistFlow() {
  const url = await input({
    message: chalk.cyan('Cole a URL da playlist:'),
    validate: (value) => {
      if (!value.trim()) return 'URL é obrigatória';
      if (!isPlaylistUrl(value.trim()) && !isValidYouTubeUrl(value.trim())) {
        return 'URL inválida';
      }
      return true;
    },
  });

  const quality = await askQuality();
  const audioOnly = await confirm({
    message: chalk.cyan('Baixar apenas áudio?'),
    default: false,
  });

  const format = audioOnly ? await askAudioFormat() : await askVideoFormat();
  const outputDir = await askOutputDir();

  await downloadPlaylist(url, { quality, format, audioOnly, outputDir });
}

/**
 * Fluxo de download em lote
 */
async function batchFlow() {
  const filePath = await input({
    message: chalk.cyan('Caminho do arquivo JSON:'),
    validate: (value) => {
      if (!value.trim()) return 'Caminho é obrigatório';
      return true;
    },
  });

  const { validateBatchFile } = await import('./validators.js');
  const items = validateBatchFile(filePath.trim());

  const quality = await askQuality();
  const audioOnly = await confirm({
    message: chalk.cyan('Baixar apenas áudio?'),
    default: false,
  });

  const format = audioOnly ? await askAudioFormat() : await askVideoFormat();
  const outputDir = await askOutputDir();

  await downloadBatch(items, { quality, format, audioOnly, outputDir });
}

/**
 * Fluxo de informações do vídeo
 */
async function infoFlow() {
  const url = await askUrl();
  const info = await getVideoInfo(url);
  displayVideoInfo(info);

  const showSubs = await confirm({
    message: chalk.cyan('Ver legendas disponíveis?'),
    default: false,
  });

  if (showSubs) {
    const subs = await listSubtitles(url);
    displaySubtitles(subs);
  }
}

/**
 * Fluxo de download de legendas
 */
async function subtitlesFlow() {
  const url = await askUrl();

  // Primeiro, listar legendas disponíveis
  const subs = await listSubtitles(url);
  displaySubtitles(subs);

  const proceed = await confirm({
    message: chalk.cyan('Deseja baixar as legendas?'),
    default: true,
  });

  if (!proceed) return;

  const lang = await input({
    message: chalk.cyan('Idiomas (separados por vírgula):'),
    default: 'pt,en',
  });

  const outputDir = await askOutputDir();

  await downloadSubtitles(url, { lang, outputDir });
}

/**
 * Fluxo de conversão de formato
 */
async function convertFlow() {
  const inputPath = await input({
    message: chalk.cyan('Caminho do arquivo para converter:'),
    validate: (value) => {
      if (!value.trim()) return 'Caminho é obrigatório';
      return true;
    },
  });

  const allFormats = [...SUPPORTED_FORMATS.video, ...SUPPORTED_FORMATS.audio];
  const outputFormat = await select({
    message: chalk.cyan('Converter para:'),
    choices: allFormats.map(f => ({ value: f, name: f.toUpperCase() })),
  });

  await convertFormat(inputPath.trim(), outputFormat);
}

/**
 * Inicia a interface interativa
 */
export async function startInteractive() {
  showBanner();

  let running = true;

  while (running) {
    try {
      const action = await mainMenu();

      switch (action) {
        case 'download':
          await downloadFlow();
          break;
        case 'audio':
          await audioFlow();
          break;
        case 'playlist':
          await playlistFlow();
          break;
        case 'batch':
          await batchFlow();
          break;
        case 'info':
          await infoFlow();
          break;
        case 'subtitles':
          await subtitlesFlow();
          break;
        case 'convert':
          await convertFlow();
          break;
        case 'exit':
          console.log(chalk.cyan('\n  👋 Até logo!\n'));
          running = false;
          break;
      }
    } catch (err) {
      if (err.name === 'ExitPromptError') {
        console.log(chalk.cyan('\n  👋 Até logo!\n'));
        running = false;
      } else {
        console.log(chalk.red(`\n  ❌ Erro: ${err.message}\n`));
      }
    }
  }
}
