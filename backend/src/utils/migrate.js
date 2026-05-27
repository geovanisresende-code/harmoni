/**
 * Script de migração do banco de dados
 * Execute: node src/utils/migrate.js
 */

require('dotenv').config();
const db = require('../config/db');

const migrations = `

-- Extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Empresas
CREATE TABLE IF NOT EXISTS companies (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  cnpj            VARCHAR(18) UNIQUE,
  contact_email   VARCHAR(255),
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Usuários
CREATE TABLE IF NOT EXISTS users (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  role            VARCHAR(50)  DEFAULT 'collaborator', -- collaborator | hr | admin
  company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Sessões de análise emocional
CREATE TABLE IF NOT EXISTS sessions (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          VARCHAR(20) DEFAULT 'active', -- active | completed | abandoned
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  finished_at     TIMESTAMPTZ
);

-- Mensagens da sessão
CREATE TABLE IF NOT EXISTS messages (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL, -- user | assistant
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Relatórios emocionais
CREATE TABLE IF NOT EXISTS reports (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES sessions(id),
  score_geral     INTEGER NOT NULL CHECK (score_geral BETWEEN 0 AND 100),
  indicators      JSONB NOT NULL,  -- { energia, estresse, riscoExaustao, engajamento }
  analysis        JSONB,           -- { contextoEmocional, pontosAtencao, evolucao }
  action_plan     JSONB,           -- [{ titulo, descricao }]
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Assinaturas (integração Stripe)
CREATE TABLE IF NOT EXISTS subscriptions (
  id                      UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan                    VARCHAR(50)  DEFAULT 'starter', -- starter | pro | enterprise
  status                  VARCHAR(50)  DEFAULT 'inactive',
  collaborator_limit      INTEGER DEFAULT 50,
  stripe_customer_id      VARCHAR(255),
  stripe_subscription_id  VARCHAR(255),
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_reports_user_id    ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_session   ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_users_company      ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user      ON sessions(user_id);

`;

async function migrate() {
  try {
    console.log('🔄 Rodando migrações...');
    await db.query(migrations);
    console.log('✅ Migrações concluídas com sucesso!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro na migração:', err.message);
    process.exit(1);
  }
}

migrate();
