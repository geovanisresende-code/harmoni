const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/companies/me — Dados da empresa do usuário logado
router.get('/me', async (req, res) => {
  const result = await db.query(
    `SELECT c.*, s.plan, s.status AS subscription_status, s.collaborator_limit
     FROM companies c
     LEFT JOIN subscriptions s ON s.company_id = c.id
     WHERE c.id = $1`,
    [req.user.companyId]
  );
  res.json(result.rows[0] || null);
});

// PUT /api/companies/me — Atualiza dados da empresa
router.put('/me', requireRole('hr', 'admin'), async (req, res) => {
  const { name, cnpj, contactEmail } = req.body;

  await db.query(
    `UPDATE companies SET name = $1, cnpj = $2, contact_email = $3, updated_at = NOW()
     WHERE id = $4`,
    [name, cnpj, contactEmail, req.user.companyId]
  );

  res.json({ message: 'Dados atualizados.' });
});

// GET /api/companies/me/stats — Estatísticas gerais da empresa
router.get('/me/stats', requireRole('hr', 'admin'), async (req, res) => {
  const collab = await db.query(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN active = true THEN 1 ELSE 0 END) AS ativos
     FROM users WHERE company_id = $1 AND role = 'collaborator'`,
    [req.user.companyId]
  );

  const risk = await db.query(
    `SELECT
       SUM(CASE WHEN r.score_geral >= 70 THEN 1 ELSE 0 END) AS saudavel,
       SUM(CASE WHEN r.score_geral BETWEEN 50 AND 69 THEN 1 ELSE 0 END) AS moderado,
       SUM(CASE WHEN r.score_geral < 50 THEN 1 ELSE 0 END) AS risco
     FROM (
       SELECT DISTINCT ON (user_id) user_id, score_geral
       FROM reports
       JOIN users u ON u.id = reports.user_id
       WHERE u.company_id = $1
       ORDER BY user_id, created_at DESC
     ) r`,
    [req.user.companyId]
  );

  res.json({
    collaborators: collab.rows[0],
    risk: risk.rows[0]
  });
});

module.exports = router;
