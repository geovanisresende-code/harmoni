/**
 * Harmoni AI Orchestrator
 * Integração com agente Abacus AI
 * Configure as variáveis no .env:
 *   ABACUS_API_KEY       = sua API key do Abacus
 *   ABACUS_DEPLOYMENT_ID = o Deployment ID do seu agente
 */

const db = require('../config/db');

const ABACUS_API_KEY       = process.env.ABACUS_API_KEY;
const ABACUS_DEPLOYMENT_ID = process.env.ABACUS_DEPLOYMENT_ID;
const ABACUS_BASE_URL      = 'https://api.abacus.ai/api/v0';

// Histórico em memória por sessão
const sessionHistories = new Map();

/**
 * Envia mensagem para o agente Abacus e retorna a resposta
 */
async function chat(userId, sessionId, userMessage, userMemory = {}) {
  const histKey = `${userId}:${sessionId}`;

  if (!sessionHistories.has(histKey)) {
    sessionHistories.set(histKey, []);
  }

  const history = sessionHistories.get(histKey);
  history.push({ role: 'user', content: userMessage });

  const response = await fetch(`${ABACUS_BASE_URL}/deployments/${ABACUS_DEPLOYMENT_ID}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apiKey': ABACUS_API_KEY
    },
    body: JSON.stringify({
      messages: history,
      deploymentConversationId: sessionId,
      // Contexto do usuário injetado
      systemMessage: buildContext(userMemory)
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Abacus API error: ${err}`);
  }

  const data = await response.json();
  const reply = data.reply || data.response || data.content || '';

  history.push({ role: 'assistant', content: reply });

  const isComplete = history.length >= 16;
  return { reply, isComplete };
}

/**
 * Gera análise emocional estruturada ao encerrar a sessão
 */
async function generateEmotionalAnalysis(userId, sessionId) {
  const histKey = `${userId}:${sessionId}`;
  const history = sessionHistories.get(histKey) || [];

  const prompt = `Com base na conversa abaixo, gere uma análise emocional em JSON:

${history.map(m => `${m.role === 'user' ? 'Colaborador' : 'Harmoni'}: ${m.content}`).join('\n')}

Retorne APENAS JSON válido:
{
  "indicadores": { "energia": 0-100, "estresse": 0-100, "riscoExaustao": 0-100, "engajamento": 0-100, "indiceGeral": 0-100 },
  "statusGeral": "Saudável|Moderado|Atenção|Crítico",
  "analise": { "contextoEmocional": "...", "pontosAtencao": "...", "evolucao": "..." },
  "planoAcao": [{ "titulo": "...", "descricao": "..." }],
  "proximaSessaoEmDias": 14
}`;

  const response = await fetch(`${ABACUS_BASE_URL}/deployments/${ABACUS_DEPLOYMENT_ID}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apiKey': ABACUS_API_KEY
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json();
  const raw  = data.reply || data.response || data.content || '{}';

  sessionHistories.delete(histKey);

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    return { indicadores: { energia: 70, estresse: 40, riscoExaustao: 30, engajamento: 75, indiceGeral: 70 }, statusGeral: 'Moderado', analise: {}, planoAcao: [] };
  }
}

function buildContext(userMemory) {
  if (!userMemory || Object.keys(userMemory).length === 0) return '';
  return `Contexto: última sessão em ${userMemory.lastSessionDate || 'N/A'}, índice anterior ${userMemory.lastScore || 'N/A'}, tendência: ${userMemory.trend || 'N/A'}.`;
}

async function getUserMemory(userId) {
  const result = await db.query(
    `SELECT score_geral, created_at FROM reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3`,
    [userId]
  );
  if (result.rows.length === 0) return {};
  const scores = result.rows.map(r => r.score_geral);
  const avg    = scores.reduce((a, b) => a + b, 0) / scores.length;
  return {
    lastSessionDate: result.rows[0].created_at,
    lastScore: result.rows[0].score_geral,
    trend: scores[0] > avg ? 'melhora' : scores[0] < avg ? 'piora' : 'estável'
  };
}

module.exports = { chat, generateEmotionalAnalysis, getUserMemory };
