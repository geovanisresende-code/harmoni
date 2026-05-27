require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');

const authRoutes          = require('./routes/auth');
const sessionRoutes       = require('./routes/sessions');
const reportRoutes        = require('./routes/reports');
const indicatorRoutes     = require('./routes/indicators');
const collaboratorRoutes  = require('./routes/collaborators');
const companyRoutes       = require('./routes/companies');
const billingRoutes       = require('./routes/billing');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Segurança & logging ──────────────────────────
app.use(helmet());
app.use(morgan('dev'));

// ── CORS ─────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ── Body parsers ─────────────────────────────────
// Webhook do Stripe precisa de raw body
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ── Rotas ────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/sessions',      sessionRoutes);
app.use('/api/reports',       reportRoutes);
app.use('/api/indicators',    indicatorRoutes);
app.use('/api/collaborators', collaboratorRoutes);
app.use('/api/companies',     companyRoutes);
app.use('/api/billing',       billingRoutes);

// ── Health check ─────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// ── Error handler global ─────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Erro interno do servidor'
  });
});

app.listen(PORT, () => {
  console.log(`🟢 Harmoni API rodando em http://localhost:${PORT}`);
});
