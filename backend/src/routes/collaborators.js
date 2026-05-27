const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/collaborators — Lista colaboradores da empresa (HR/Admin only)
router.get('/', requireRole('hr', 'admin'), async (req, res) => {
  const result = await db.query(
    `SELECT u.id, u.name, u.email, u.role, u.created_at,
            r.score_geral AS last_score,
            r.created_at  AS last_session_at,
            r.indicators
     FROM users u
     LEFT JOIN LATERAL (
       SELECT score_geral, created_at, indicators
       FROM reports
       WHERE user_id = u.id
       ORDER BY created_at DESC
       LIMIT 1
     ) r ON true
     WHERE u.company_id = $1 AND u.role = 'collaborator'
     ORDER BY u.name`,
    [req.user.companyId]
  );
  res.json(result.rows);
});

// POST /api/collaborators/invite — Convida colaborador por e-mail
router.post('/invite', requireRole('hr', 'admin'), async (req, res) => {
  const { email, name, role: jobRole } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
  }

  // Aqui: enviar e-mail de convite com link de cadastro
  // await emailService.sendInvite({ email, name, companyId: req.user.companyId });

  res.json({ message: `Convite enviado para ${email}` });
});

// GET /api/collaborators/:id/indicators — Indicadores de um colaborador
router.get('/:id/indicators', requireRole('hr', 'admin'), async (req, res) => {
  const result = await db.query(
    `SELECT score_geral, indicators, created_at
     FROM reports
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [req.params.id]
  );
  res.json(result.rows);
});

// DELETE /api/collaborators/:id — Remove acesso do colaborador
router.delete('/:id', requireRole('hr', 'admin'), async (req, res) => {
  await db.query(
    `UPDATE users SET active = false WHERE id = $1 AND company_id = $2`,
    [req.params.id, req.user.companyId]
  );
  res.json({ message: 'Colaborador removido.' });
});

module.exports = router;
