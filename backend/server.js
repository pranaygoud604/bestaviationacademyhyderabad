require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const webhookRoutes     = require('./routes/webhook');
const leadsRoutes       = require('./routes/leads');
const employeesRoutes   = require('./routes/employees');
const messagesRoutes    = require('./routes/messages');
const campaignsRoutes   = require('./routes/campaigns');
const pipelineRoutes    = require('./routes/pipeline');
const performanceRoutes = require('./routes/performance');
const followupsRoutes   = require('./routes/followups');
const revenueRoutes     = require('./routes/revenue');
const aviationRoutes    = require('./routes/aviation');
const adminRoutes       = require('./routes/admin');
const automationsRoutes = require('./routes/automations');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(
  express.json({
    verify: (req, _res, buf) => { req.rawBody = buf; },
  })
);
app.use(express.urlencoded({ extended: false }));

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin:         process.env.FRONTEND_URL || 'http://localhost:5173',
  methods:        ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/webhook',          webhookRoutes);
app.use('/api/leads',        leadsRoutes);
app.use('/api/employees',    employeesRoutes);
app.use('/api/messages',     messagesRoutes);
app.use('/api/campaigns',    campaignsRoutes);
app.use('/api/pipeline',     pipelineRoutes);
app.use('/api/performance',  performanceRoutes);
app.use('/api/followups',    followupsRoutes);
app.use('/api/revenue',      revenueRoutes);
app.use('/api/aviation',     aviationRoutes);
app.use('/api/admin',        adminRoutes);
app.use('/api/automations',  automationsRoutes);

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', ts: new Date().toISOString() })
);

// ── Serve React frontend in production ────────────────────────────────────────
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));
app.use((_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () =>
  console.log(`SkyHost CRM backend running on port ${PORT}`)
);
