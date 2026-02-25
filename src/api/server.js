import express from 'express';
import cors from 'cors';
import videosRouter from './routes/videos.js';
import categoriesRouter from './routes/categories.js';
import logger from './logger.js';

const app = express();
const PORT = process.env.PORT || 3005;

// ─── Middlewares ──────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Request logging — mostra cada requisição no terminal
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    logger[level]({ method: req.method, url: req.originalUrl, status, ms }, `${req.method} ${req.originalUrl} → ${status} (${ms}ms)`);
  });
  next();
});

// ─── Rotas ────────────────────────────────────────────────────────
app.use('/api/videos', videosRouter);
app.use('/api/categories', categoriesRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'Rota não encontrada' });
});

// Error handler global
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: err.message });
});

// ─── Start ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  🚀 yt-dwn API rodando em http://localhost:${PORT}`);
  console.log(`  📋 Endpoints:`);
  console.log(`     GET  /api/health`);
  console.log(`     GET  /api/categories`);
  console.log(`     GET  /api/videos`);
  console.log(`     GET  /api/videos/:id`);
  console.log(`     POST /api/videos`);
  console.log(`     DELETE /api/videos/:id\n`);
});

export default app;
