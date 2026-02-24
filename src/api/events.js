/**
 * EventEmitter singleton para progresso de downloads.
 * Emite eventos por video_id para o endpoint SSE.
 *
 * Eventos emitidos: `video:<id>`
 * Payload: { type: 'progress'|'log'|'done'|'error', ...data }
 */
import { EventEmitter } from 'events';

const emitter = new EventEmitter();
emitter.setMaxListeners(100); // suporta muitas conexões SSE simultâneas

/**
 * Emite um evento para um vídeo específico.
 * @param {number} videoId
 * @param {'progress'|'log'|'done'|'error'} type
 * @param {object} data
 */
export function emitVideoEvent(videoId, type, data = {}) {
  emitter.emit(`video:${videoId}`, { type, videoId, ...data, ts: Date.now() });
}

export default emitter;
