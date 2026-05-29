const router  = require('express').Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/excel', auth, upload.single('fichier'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Fichier Excel requis' });
    const { type } = req.body;

    const wb   = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

    let importes = 0;

    if (type === 'production') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const row of data) {
          if (!row['Date']) continue;
          const date = new Date(row['Date']);
          if (isNaN(date)) continue;
          const { rows } = await client.query(
            `INSERT INTO productions_jour
              (date_production, jours_ouvres, c12, c24, f615, f605, f61, hilio, saisi_par_id, statut)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'en_attente')
             ON CONFLICT (date_production) DO UPDATE SET
               c12=EXCLUDED.c12, c24=EXCLUDED.c24, f615=EXCLUDED.f615,
               f605=EXCLUDED.f605, f61=EXCLUDED.f61, hilio=EXCLUDED.hilio
             RETURNING id`,
            [date, row['Jours']||1, row['C12']||0, row['C24']||0,
             row['F06/1,5L']||row['F615']||0, row['F06/0,5L']||row['F605']||0,
             row['F06/1L']||row['F61']||0, row['HILIO']||0, req.user.id]
          );
          if (rows[0] && (row['Pref.32g']||row['Pref.17g'])) {
            await client.query(
              `INSERT INTO rebuts (production_id,pref32,pref17,bouchons,ctn_c12,ctn_c24,etiquettes)
               VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (production_id) DO UPDATE SET
                 pref32=EXCLUDED.pref32,pref17=EXCLUDED.pref17`,
              [rows[0].id, row['Pref.32g']||0, row['Pref.17g']||0,
               row['Bouchons']||0, row['Ctn C12']||0, row['Ctn C24']||0, row['Étiq.']||0]
            );
          }
          importes++;
        }
        await client.query('COMMIT');
      } catch(e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }

    } else if (type === 'stocks') {
      for (const row of data) {
        if (!row['Code'] && !row['Désignation']) continue;
        const { rows: art } = await pool.query(
          `SELECT id FROM stocks_articles WHERE code=$1 OR libelle=$2 LIMIT 1`,
          [row['Code']||'', row['Désignation']||row['Article']||'']
        );
        if (!art[0]) continue;
        await pool.query(
          `INSERT INTO stocks_mouvements (article_id, type_mouvement, quantite, date_mouvement, motif, saisi_par_id)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [art[0].id, row['Type']||'entree', row['Quantité']||row['Quantite']||0,
           row['Date']?new Date(row['Date']):new Date(), row['Motif']||'Import Excel', req.user.id]
        );
        importes++;
      }

    } else if (type === 'tresorerie') {
      for (const row of data) {
        if (!row['Compte'] && !row['Libellé']) continue;
        const { rows: cpt } = await pool.query(
          `SELECT id FROM comptes_tresorerie WHERE libelle ILIKE $1 LIMIT 1`,
          [`%${row['Compte']||''}%`]
        );
        if (!cpt[0]) continue;
        const entree  = parseFloat(row['Entrée']||row['Entree']||0);
        const sortie  = parseFloat(row['Sortie']||0);
        const montant = entree > 0 ? entree : sortie;
        const sens    = entree > 0 ? 'credit' : 'debit';
        if (!montant) continue;
        await pool.query(
          `INSERT INTO tresorerie_mouvements (compte_id, sens, montant_fcfa, date_mouvement, description, type_operation, saisi_par_id)
           VALUES ($1,$2,$3,$4,$5,'import_excel',$6)`,
          [cpt[0].id, sens, montant, row['Date']?new Date(row['Date']):new Date(),
           row['Libellé']||row['Libelle']||'Import Excel', req.user.id]
        );
        importes++;
      }
    }

    res.json({ message: 'Import réussi', importes, type });
  } catch (err) {
    console.error('[IMPORT]', err);
    res.status(500).json({ message: 'Erreur lors du traitement du fichier' });
  }
});

module.exports = router;
