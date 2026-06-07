const { Pool } = require('pg');
require('dotenv').config();

console.log('[DB] Connexion vers:', process.env.DATABASE_URL ? process.env.DATABASE_URL.slice(0,40)+'...' : 'URL MANQUANTE');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('connect', () => console.log('[DB] ✅ Connexion établie'));
pool.on('error', (err) => console.error('[DB] ❌ Erreur:', err.message));

module.exports = pool;
