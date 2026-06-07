require('dotenv').config();
const { Pool }  = require('pg');
const bcrypt    = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const USERS = [
  { nom_complet:'Boumzina Raïna',       email:'dg@sinex-sa.tg',        role:'directeur_general' },
  { nom_complet:'Opérateur 1',          email:'op1@sinex-sa.tg',       role:'operateur'         },
  { nom_complet:'Opérateur 2',          email:'op2@sinex-sa.tg',       role:'operateur'         },
  { nom_complet:'Opérateur',            email:'operateur@sinex-sa.tg', role:'operateur'         },
  { nom_complet:'Président DG',         email:'pdg@ceco.tg',           role:'pdg'               },
  { nom_complet:'Président CA',         email:'pca@sinex-sa.tg',       role:'pca'               },
  { nom_complet:'Membre CA 1',          email:'ca1@sinex-sa.tg',       role:'conseil_admin'     },
  { nom_complet:'Membre CA 2',          email:'ca2@sinex-sa.tg',       role:'conseil_admin'     },
  { nom_complet:'Membre CA 3',          email:'ca3@sinex-sa.tg',       role:'conseil_admin'     },
  { nom_complet:'Conseil Admin',        email:'ca@sinex-sa.tg',        role:'conseil_admin'     },
];

async function run() {
  try {
    const hash = await bcrypt.hash('Sinex@2026!', 12);
    console.log('Hash généré ✓');

    for (const u of USERS) {
      // Récupérer l'id du rôle
      const { rows: roles } = await pool.query('SELECT id FROM roles WHERE nom=$1', [u.role]);
      if (!roles[0]) { console.log(`❌ Rôle introuvable: ${u.role}`); continue; }

      await pool.query(
        `INSERT INTO utilisateurs (nom_complet, email, mot_de_passe, role_id, actif)
         VALUES ($1,$2,$3,$4,true)
         ON CONFLICT (email) DO UPDATE SET mot_de_passe=$3`,
        [u.nom_complet, u.email, hash, roles[0].id]
      );
      console.log(`✅ ${u.nom_complet} (${u.email})`);
    }
    console.log('\n✅ Tous les utilisateurs créés — MDP: Sinex@2026!');
  } catch (err) {
    console.error('❌ Erreur:', err.message);
  } finally {
    pool.end();
  }
}

run();
