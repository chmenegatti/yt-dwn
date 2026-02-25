import pino from 'pino';
import { join } from 'path';
import { build as prettyBuild } from 'pino-pretty';

const logFilePath = join(process.cwd(), 'data', 'yt-dwn.log');

// Stream bonito para o terminal (colorido, legível)
const prettyStream = prettyBuild({
  colorize: true,
  translateTime: 'HH:MM:ss',
  ignore: 'pid,hostname',
  messageFormat: '{msg}',
});

// Escreve log formatado no terminal e JSON puro no arquivo para Grafana/Loki
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
}, pino.multistream([
  { stream: prettyStream },
  { stream: pino.destination(logFilePath) },
]));

export default logger;
