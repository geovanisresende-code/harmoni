const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/indicators — Indicadores agregados do colaborador logado
router.get('/', async (req, res) => {
  const result = await db.query(
    `SELECT
       AVG((indicators->>'energia')::int)       AS energia,
       AVG((indicators->>'estresse')::int)      AS estresse,
       AVG((indicators->>'riscoExaustao')::int) AS risco_exaustao,
       AVG((indicators->>'engajamento')::int)   AS engajamento,
       AVG(score_geral)                         AS indice_geral,
       COUNT(*)                                 AS total_sessoes
     FROM reports
     WHERE user_id = $1`,
    [req.user.id]
  );

  const latest = await db.query(
    `SELECT indicators, score_geral, created_at
     FROM reports
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [req.user.id]
  );

  res.json({
    aggregated: result.rows[0],
    latest: latest.rows[0] || null
  });
});

// GET /api/indicators/history — Série histórica para gráficos
router.get('/history', async (req, res) => {
  const { limit = 10 } = req.query;

  const result = await db.query(
    `SELECT
       score_geral,
       (indicators->>'energia')::int       AS energia,
       (indicators->>'estresse')::int      AS estresse,
       (indicators->>'riscoExaustao')::int AS risco_exaustao,
       created_at
     FROM reports
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [req.user.id, parseInt(limit)]
  );

  res.json(result.rows.reverse()); // cronológico para gráficos
});

// GET /api/indicators/company — Indicadores agregados da empresa (HR only)
router.get('/company', async (req, res) => {
  const { authMiddleware: _, requireRole } = require('../middleware/auth');

  if (!['hr', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  const result = await db.query(
    `SELECT
       AVG((r.indicators->>'energia')::int)       AS energia,
       AVG((r.indicators->>'estresse')::int)      AS estresse,
       AVG((r.indicators->>'riscoExaustao')::int) AS risco_exaustao,
       AVG(r.score_geral)                         AS indice_geral,
       COUNT(DISTINCT r.user_id)                  AS colaboradores_ativos,
       COUNT(*)                                   AS total_sessoes
     FROM reports r
     JOIN users u ON u.id = r.user_id
     WHERE u.company_id = $1
       AND r.created_at > NOW() - INTERVAL '30 days'`,
    [req.user.companyId]
  );

  res.json(result.rows[0]);
});

module.exports = router;
