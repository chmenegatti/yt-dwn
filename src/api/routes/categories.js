import { Router } from 'express';
import { VALID_CATEGORIES } from '../../validators.js';

const router = Router();

// GET /api/categories
router.get('/', (_req, res) => {
  res.json({ ok: true, data: VALID_CATEGORIES });
});

export default router;
