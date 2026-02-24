import pino from 'pino';
import { join } from 'path';

const logFilePath = join(process.cwd(), 'data', 'yt-dwn.log');

// Escreve log em stdout e também no arquivo yt-dwn.log
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
}, pino.multistream([
  { stream: process.stdout },
  { stream: pino.destination(logFilePath) }
]));

export default logger;
