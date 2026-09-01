/**
 * Harmoni AI Orchestrator
 * Integração com agente Abacus AI
 * Configure as variáveis no .env:
 *   ABACUS_API_KEY       = sua API key do Abacus (System Agent API Key)
 *   ABACUS_DEPLOYMENT_ID = o Deployment ID do seu agente
 *
 * Endpoint real: POST /api/v0/getConversationResponse
 * (a persona do Consultor Emocional já está configurada no próprio
 * deployment da Abacus — não precisa ser reenviada a cada chamada.
 * A Abacus também mantém o histórico da conversa server-side, associado
 * ao deploymentConversationId retornado na primeira resposta.)
 */

const db = require('../config/db');

const ABACUS_API_KEY       = process.env.ABACUS_API_KEY;
const ABACUS_DEPLOYMENT_ID = process.env.ABACUS_DEPLOYMENT_ID;
const ABACUS_BASE_URL      = 'https://api.abacus.ai/api/v0';

// A persona configurada no deployment tende a responder com textos muito
// longos (a estrutura completa das 5 etapas) a cada turno. Para o chat ao
// vivo isso não cabe bem numa bolha de mensagem — pedimos brevidade por
// mensagem, sem alterar a persona em si. O relatório final (generateEmotionalAnalysis)
// não usa essa dica, e continua completo.
const BREVITY_HINT = '\n\n[Responda de forma breve e direta: no máximo 3 a 4 frases curtas, sem usar markdown (nada de ** ou listas). Vá direto ao ponto, mantendo o tom do Consultor Emocional.]';

/**
 * Envia uma mensagem para o deployment da Abacus e retorna a resposta.
 * @param {string} message
 * @param {string|null} deploymentConversationId — omitido na primeira mensagem
 */
async function callAbacus(message, deploymentConversationId) {
  const body = { deploymentId: ABACUS_DEPLOYMENT_ID, message };
  if (deploymentConversationId) body.deploymentConversationId = deploymentConversationId;

  const response = await fetch(`${ABACUS_BASE_URL}/getConversationResponse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apiKey: ABACUS_API_KEY
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Erro na API da Abacus');
  }

  const messages       = data.result.messages || [];
  const lastAssistant  = [...messages].reverse().find((m) => !m.is_user);

  return {
    reply: lastAssistant?.text || '',
    conversationId: data.result.deployment_conversation_id
  };
}

/**
 * Envia mensagem do colaborador e retorna a resposta do agente.
 */
async function chat(sessionId, userMessage, conversationId) {
  return callAbacus(`${userMessage}${BREVITY_HINT}`, conversationId);
}

/**
 * Gera análise emocional estruturada ao encerrar a sessão, com base no
 * histórico real de mensagens salvo no banco (não em memória — necessário
 * porque cada invocação serverless pode cair em uma instância diferente).
 */
async function generateEmotionalAnalysis(userId, sessionId) {
  const history = await db.query(
    `SELECT role, content FROM messages WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId]
  );

  const prompt = `Com base na conversa abaixo, gere uma análise emocional em JSON:

${history.rows.map((m) => `${m.role === 'user' ? 'Colaborador' : 'Harmoni'}: ${m.content}`).join('\n')}

Retorne APENAS JSON válido, sem texto antes ou depois. Regras importantes para não quebrar o JSON:
- NUNCA use aspas duplas (") dentro dos textos — se precisar dar ênfase a uma palavra, use aspas simples (') ou nenhuma pontuação especial.
- Não quebre linha no meio de um valor de texto.

{
  "indicadores": { "energia": 0-100, "estresse": 0-100, "riscoExaustao": 0-100, "engajamento": 0-100, "indiceGeral": 0-100 },
  "statusGeral": "Saudável|Moderado|Atenção|Crítico",
  "analise": { "contextoEmocional": "...", "pontosAtencao": "...", "evolucao": "..." },
  "planoAcao": [{ "titulo": "...", "descricao": "..." }],
  "proximaSessaoEmDias": 14
}`;

  // A IA nem sempre devolve JSON perfeitamente válido (ex: aspas duplas
  // não escapadas dentro dos textos) — como é probabilística, tentamos
  // de novo antes de recorrer ao fallback fixo.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { reply: raw } = await callAbacus(prompt);
    try {
      const extracted = extractJsonObject(raw) || raw;
      // A resposta da Abacus é remontada a partir de segmentos e pode conter
      // quebras de linha literais dentro de strings do JSON (inválido no
      // spec) — fora de strings, espaço em branco é irrelevante para o
      // parser, então é seguro normalizar tudo para espaço.
      const cleaned = extracted.replace(/[\r\n\t]+/g, ' ');
      return JSON.parse(cleaned);
    } catch (err) {
      console.error(`Falha ao parsear análise da Abacus (tentativa ${attempt}):`, err.message, '| raw:', raw.slice(0, 800));
    }
  }

  return { indicadores: { energia: 70, estresse: 40, riscoExaustao: 30, engajamento: 75, indiceGeral: 70 }, statusGeral: 'Moderado', analise: {}, planoAcao: [] };
}

/**
 * Extrai o primeiro objeto JSON balanceado de um texto (ignorando chaves
 * dentro de strings), em vez de simplesmente pegar da primeira '{' até a
 * última '}' — mais robusto contra texto extra que a Abacus às vezes
 * adiciona antes/depois do JSON.
 */
function extractJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

async function getUserMemory(userId) {
  const result = await db.query(
    `SELECT score_geral, created_at FROM reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3`,
    [userId]
  );
  if (result.rows.length === 0) return {};
  const scores = result.rows.map((r) => r.score_geral);
  const avg    = scores.reduce((a, b) => a + b, 0) / scores.length;
  return {
    lastSessionDate: result.rows[0].created_at,
    lastScore: result.rows[0].score_geral,
    trend: scores[0] > avg ? 'melhora' : scores[0] < avg ? 'piora' : 'estável'
  };
}

module.exports = { chat, generateEmotionalAnalysis, getUserMemory };
