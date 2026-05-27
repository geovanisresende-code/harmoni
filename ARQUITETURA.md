# Harmoni — Arquitetura da Plataforma

> Plataforma SaaS B2B de análise emocional e prevenção de exaustão para colaboradores.

---

## Visão Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                        USUÁRIO FINAL                            │
│         Colaborador (browser)    │    Gestor de RH (browser)    │
└──────────────────────┬───────────┴──────────────┬──────────────┘
                       │ HTTPS                     │ HTTPS
                       ▼                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONT-END (HTML/CSS/JS)                       │
│  login ─ index ─ chat ─ indicadores ─ historico ─ relatorio     │
│  dashboard-rh ─ colaboradores ─ billing                         │
│                                                                  │
│  Hospedagem sugerida: Vercel / Netlify / GitHub Pages           │
└──────────────────────────────────────────────────────────────────┘
                       │ REST API
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                  BACKEND — Node.js / Express                     │
│                                                                  │
│  /api/auth          → JWT login, register, refresh              │
│  /api/sessions      → Sessões de análise + mensagens IA         │
│  /api/reports       → CRUD de relatórios emocionais             │
│  /api/indicators    → Indicadores individuais e empresa         │
│  /api/collaborators → Gestão de colaboradores (HR)              │
│  /api/companies     → Dados e stats da empresa                  │
│  /api/billing       → Assinatura Stripe + webhooks              │
│                                                                  │
│  Hospedagem sugerida: Railway / Render / Fly.io                 │
└──────────────────────────────────────────────────────────────────┘
         │                    │                     │
         ▼                    ▼                     ▼
┌─────────────┐   ┌───────────────────┐   ┌───────────────────┐
│ PostgreSQL  │   │  AI Orchestrator  │   │     Stripe API    │
│             │   │                   │   │                   │
│  users      │   │  OpenAI / Claude  │   │  Subscriptions    │
│  sessions   │   │  GPT-4o-mini      │   │  Invoices         │
│  messages   │   │  Prompt base      │   │  Webhooks         │
│  reports    │   │  Memória usuário  │   │  Customer Portal  │
│  companies  │   │  Análise emocional│   └───────────────────┘
│  subscript. │   │  Geração relatório│
└─────────────┘   └───────────────────┘
```

---

## Stack Tecnológica

| Camada | Tecnologia | Razão |
|--------|-----------|-------|
| Front-end | HTML5 + CSS3 + JS puro | Zero dependências, carregamento rápido |
| Estilo | Glassmorphism + harmoni.css | Visual premium e consistente |
| Gráficos | Chart.js (CDN) | Leve e flexível |
| Backend | Node.js 20 + Express 4 | Rápido, ecossistema amplo |
| Banco de dados | PostgreSQL 15 | Relacional, JSONB para indicadores |
| Autenticação | JWT (jsonwebtoken) | Stateless, escalável |
| IA | OpenAI GPT-4o-mini | Custo-benefício para produção |
| Billing | Stripe | Padrão de mercado, webhooks confiáveis |
| Hash de senhas | bcryptjs | Seguro e estável |
| Hospedagem API | Railway ou Render | Deploy simples, PostgreSQL incluso |
| Hospedagem Front | Vercel ou Netlify | CDN global, HTTPS automático |

---

## Estrutura de Arquivos

```
harmoni/
├── harmoni.css                 ← CSS global compartilhado
├── login.html
├── index.html                  ← Dashboard colaborador
├── chat.html                   ← Chat com IA
├── indicadores.html
├── historico.html
├── relatorio.html              ← Relatório individual detalhado
├── dashboard-rh.html           ← Painel do gestor de RH
├── colaboradores.html          ← Gestão de colaboradores
├── billing.html                ← Assinatura & cobrança
├── assets/
│   ├── logo.png
│   └── background.png
│
└── backend/
    ├── package.json
    ├── .env.example
    └── src/
        ├── server.js           ← Entry point
        ├── config/
        │   └── db.js           ← Pool PostgreSQL
        ├── middleware/
        │   └── auth.js         ← JWT + Role guard
        ├── routes/
        │   ├── auth.js
        │   ├── sessions.js
        │   ├── reports.js
        │   ├── indicators.js
        │   ├── collaborators.js
        │   ├── companies.js
        │   └── billing.js
        ├── services/
        │   └── aiOrchestrator.js  ← Camada própria de IA
        └── utils/
            └── migrate.js      ← Script de criação do banco
```

---

## Schema do Banco de Dados

```sql
companies         → empresas clientes (B2B)
users             → colaboradores e gestores (role: collaborator | hr | admin)
sessions          → sessões de análise emocional
messages          → histórico de mensagens de cada sessão
reports           → relatórios com indicadores + análise + plano de ação
subscriptions     → plano, status e IDs Stripe de cada empresa
```

---

## AI Orchestrator — Fluxo

```
1. Usuário inicia sessão  →  aiOrchestrator.chat(userId, sessionId, '__INIT__', memory)
                                       │
2. Back busca memória     →  getUserMemory(userId) — últimas 3 sessões do banco
                                       │
3. Monta contexto         →  SYSTEM_PROMPT + contexto do usuário
                                       │
4. Troca de mensagens     →  OpenAI GPT-4o-mini — temperatura 0.75
                                       │
5. Usuário encerra        →  aiOrchestrator.generateEmotionalAnalysis()
                                       │
6. IA analisa histórico   →  Retorna JSON: indicadores + análise + plano de ação
                                       │
7. Backend salva          →  reports table → PostgreSQL
```

---

## Modelo de Cobrança (SaaS B2B)

| Plano | Preço | Colaboradores | Recursos |
|-------|-------|--------------|---------|
| Starter | R$ 50/colab/mês | Até 50 | Análise IA, relatórios, dashboard RH básico, alertas |
| Pro | R$ 80/colab/mês | Até 200 | + Relatórios customizados, dashboard avançado, histórico completo |
| Enterprise | Sob consulta | Ilimitado | + SSO, integração HR Systems, SLA 99.9%, white-label |

Cobrança recorrente via **Stripe Subscriptions**. Webhook atualiza o banco automaticamente.

---

## Segurança

- Senhas com **bcrypt** (cost factor 12)
- **JWT** com expiração de 7 dias
- **Helmet.js** — headers HTTP de segurança
- **Rate limiting** nas rotas de login (10 req/15min por IP)
- **CORS** restrito ao domínio do front-end
- Dados de colaboradores isolados por `company_id` em todas as queries
- **SSL** obrigatório em produção (PostgreSQL + HTTPS)
- Relatórios individuais acessíveis apenas pelo próprio colaborador ou pelo RH da empresa

---

## Roadmap de Implementação

### Fase 1 — MVP (4–6 semanas)
- [x] Front-end completo (todas as telas)
- [ ] Backend: auth + sessões + relatórios
- [ ] Integração OpenAI no AI Orchestrator
- [ ] PostgreSQL em produção (Railway)
- [ ] Deploy front-end (Vercel)

### Fase 2 — Billing (2–3 semanas)
- [ ] Integração Stripe completa
- [ ] Planos Starter e Pro
- [ ] Portal de clientes Stripe
- [ ] Webhooks e sincronização de status

### Fase 3 — Features avançadas (4–6 semanas)
- [ ] RAG / Base vetorial (pgvector ou Pinecone)
- [ ] Embeddings de sessões para análise longitudinal
- [ ] Dashboard RH com filtros avançados e exportação
- [ ] Envio de convites por e-mail (Resend / SendGrid)
- [ ] Notificações de risco para gestores

### Fase 4 — Enterprise (roadmap)
- [ ] SSO / SAML (via Auth0 ou Clerk)
- [ ] Integração com sistemas de RH (ADP, SAP, Gupy)
- [ ] Relatórios white-label
- [ ] API pública para integrações customizadas
- [ ] SLA e suporte dedicado

---

## Como Rodar Localmente

```bash
# 1. Instalar dependências
cd backend
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais

# 3. Criar banco de dados
npm run migrate

# 4. Iniciar servidor
npm run dev
# → API rodando em http://localhost:3000

# 5. Abrir front-end
# Abra login.html com Live Server (VS Code) ou qualquer servidor local
```

---

*Harmoni © 2026 — Documento de arquitetura interno*
