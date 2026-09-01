require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');

const { migrate }        = require('../backend/src/utils/migrate');
const authRoutes         = require('../backend/src/routes/auth');
const sessionRoutes      = require('../backend/src/routes/sessions');
const reportRoutes       = require('../backend/src/routes/reports');
const indicatorRoutes    = require('../backend/src/routes/indicators');
const collaboratorRoutes = require('../backend/src/routes/collaborators');
const companyRoutes      = require('../backend/src/routes/companies');
const billingRoutes      = require('../backend/src/routes/billing');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Webhook Stripe precisa de raw body
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Garante que as tabelas existem antes de qualquer rota tocar o banco
// (idempotente — CREATE TABLE IF NOT EXISTS — roda uma vez por cold start)
let migrated = null;
app.use((req, res, next) => {
  if (!migrated) migrated = migrate().catch((err) => { migrated = null; throw err; });
  migrated.then(() => next()).catch(next);
});

// Rotas
app.use('/api/auth',          authRoutes);
app.use('/api/sessions',      sessionRoutes);
app.use('/api/reports',       reportRoutes);
app.use('/api/indicators',    indicatorRoutes);
app.use('/api/collaborators', collaboratorRoutes);
app.use('/api/companies',     companyRoutes);
app.use('/api/billing',       billingRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
});

// Exporta para Vercel (serverless) e também roda local
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🟢 Harmoni API em http://localhost:${PORT}`));
}

module.exports = app;
