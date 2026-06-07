if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const { Pool } = require('pg');

console.log('[DB] URL reçue:', process.env.DATABASE_URL ? process.env.DATABASE_URL.slice(0,50)+'...' : '❌ MANQUANTE');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('connect', () => console.log('[DB] ✅ Client connecté'));
pool.on('error', (err) => console.error('[DB] ❌ Erreur pool:', err.message));

module.exports = pool;
