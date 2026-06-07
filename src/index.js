require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const pool    = require('./db/pool');

const app = express();

// ── Sécurité & logs ──────────────────────────────────────
app.use(helmet());
app.use(morgan('dev'));

// ── CORS ─────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'https://sinex-prod-front.vercel.app',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) cb(null, true);
    else cb(new Error('CORS non autorisé'));
  },
  credentials: true,
}));

// ── Body parser ───────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/utilisateurs',  require('./routes/utilisateurs'));
app.use('/api/production',    require('./routes/production'));
app.use('/api/stocks',        require('./routes/stocks'));
app.use('/api/tresorerie',    require('./routes/tresorerie'));
app.use('/api/dashboard',     require('./routes/dashboard'));
app.use('/api/rapports',      require('./routes/rapports'));
app.use('/api/referentiels',  require('./routes/referentiels'));
app.use('/api/import',        require('./routes/import'));

// ── Health check ─────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connectée', env: process.env.NODE_ENV, timestamp: new Date() });
  } catch (err) {
    console.error('[HEALTH] DB error:', err.message, err.code);
    res.status(503).json({ status: 'error', db: 'déconnectée', error: err.message, code: err.code });
  }
});

// ── 404 ───────────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} introuvable` });
});

// ── Erreurs globales ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ message: 'Erreur serveur interne' });
});

// ── Démarrage ─────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`\n✅ SINEX API démarrée sur le port ${PORT} [${process.env.NODE_ENV}]`);
  try {
    await pool.query('SELECT 1');
    console.log('✅ PostgreSQL Railway connecté\n');
  } catch (err) {
    console.error('❌ Erreur connexion PostgreSQL:', err.message);
  }
});

module.exports = app;
