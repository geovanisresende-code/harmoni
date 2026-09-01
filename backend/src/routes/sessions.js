const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const db      = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const ai      = require('../services/aiOrchestrator');

// Todas as rotas requerem autenticação
router.use(authMiddleware);

// POST /api/sessions — Inicia nova sessão de análise
router.post('/', async (req, res) => {
  const sessionId = uuidv4();
  const userId    = req.user.id;

  await db.query(
    `INSERT INTO sessions (id, user_id, status) VALUES ($1, $2, 'active')`,
    [sessionId, userId]
  );

  // Primeira mensagem — abre a conversa com o agente
  const { reply, conversationId } = await ai.chat(sessionId, 'Olá', null);

  await db.query(
    `UPDATE sessions SET abacus_conversation_id = $1 WHERE id = $2`,
    [conversationId, sessionId]
  );
  await db.query(
    `INSERT INTO messages (session_id, role, content) VALUES ($1, 'assistant', $2)`,
    [sessionId, reply]
  );

  res.status(201).json({
    sessionId,
    message: reply
  });
});

// POST /api/sessions/:id/message — Envia mensagem para a IA
router.post('/:id/message', async (req, res) => {
  const { id: sessionId } = req.params;
  const { message } = req.body;
  const userId = req.user.id;

  if (!message) return res.status(400).json({ error: 'Mensagem obrigatória.' });

  // Verifica se a sessão pertence ao usuário
  const session = await db.query(
    `SELECT * FROM sessions WHERE id = $1 AND user_id = $2 AND status = 'active'`,
    [sessionId, userId]
  );

  if (session.rows.length === 0) {
    return res.status(404).json({ error: 'Sessão não encontrada ou já encerrada.' });
  }

  // Salva mensagem do usuário
  await db.query(
    `INSERT INTO messages (session_id, role, content) VALUES ($1, 'user', $2)`,
    [sessionId, message]
  );

  const { reply, conversationId } = await ai.chat(sessionId, message, session.rows[0].abacus_conversation_id);

  // Salva resposta da IA
  await db.query(
    `INSERT INTO messages (session_id, role, content) VALUES ($1, 'assistant', $2)`,
    [sessionId, reply]
  );
  if (conversationId && conversationId !== session.rows[0].abacus_conversation_id) {
    await db.query(`UPDATE sessions SET abacus_conversation_id = $1 WHERE id = $2`, [conversationId, sessionId]);
  }

  const countResult = await db.query(`SELECT COUNT(*) FROM messages WHERE session_id = $1`, [sessionId]);
  const isComplete = Number(countResult.rows[0].count) >= 16;

  res.json({ reply, isComplete });
});

// POST /api/sessions/:id/finish — Encerra sessão e gera relatório
router.post('/:id/finish', async (req, res) => {
  const { id: sessionId } = req.params;
  const userId = req.user.id;

  await db.query(
    `UPDATE sessions SET status = 'completed', finished_at = NOW() WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );

  const analysis = await ai.generateEmotionalAnalysis(userId, sessionId);

  // Persiste o relatório
  const reportId = uuidv4();
  await db.query(
    `INSERT INTO reports (id, user_id, session_id, score_geral, indicators, analysis, action_plan)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      reportId,
      userId,
      sessionId,
      analysis.indicadores.indiceGeral,
      JSON.stringify(analysis.indicadores),
      JSON.stringify({ ...analysis.analise, statusGeral: analysis.statusGeral, proximaSessaoEmDias: analysis.proximaSessaoEmDias }),
      JSON.stringify(analysis.planoAcao)
    ]
  );

  res.json({ reportId, analysis });
});

module.exports = router;
