require('dotenv').config();
const { Pool }  = require('pg');
const bcrypt    = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

async function run() {
  try {
    const hash = await bcrypt.hash('Sinex@2026!', 12);
    const r = await pool.query(
      'UPDATE utilisateurs SET mot_de_passe = $1',
      [hash]
    );
    console.log('✅ Mots de passe réinitialisés — Lignes modifiées:', r.rowCount);
  } catch (err) {
    console.error('❌ Erreur:', err.message);
  } finally {
    pool.end();
  }
}

run();
