const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/reports — Lista relatórios do colaborador
router.get('/', async (req, res) => {
  const result = await db.query(
    `SELECT id, score_geral, indicators, created_at
     FROM reports
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json(result.rows);
});

// GET /api/reports/:id — Relatório completo
router.get('/:id', async (req, res) => {
  const result = await db.query(
    `SELECT r.*, u.name AS user_name
     FROM reports r
     JOIN users u ON u.id = r.user_id
     WHERE r.id = $1 AND (r.user_id = $2 OR $3 = 'hr' OR $3 = 'admin')`,
    [req.params.id, req.user.id, req.user.role]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Relatório não encontrado.' });
  }

  res.json(result.rows[0]);
});

module.exports = router;
