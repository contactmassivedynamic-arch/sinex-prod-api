const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

const DG  = 'directeur_general';
const OPE = 'operateur';

// GET /api/production?mois=2026-05
router.get('/', auth, async (req, res) => {
  try {
    const { mois } = req.query;
    let query = `
      SELECT pj.*, u.nom_complet AS saisi_par_nom,
        pj.c12, pj.c24, pj.f615, pj.f605, pj.f61, pj.hilio,
        pj.jours_ouvres, pj.statut, pj.date_production,
        json_build_object(
          'pref32', COALESCE(r.pref32,0), 'pref17', COALESCE(r.pref17,0),
          'bouchons', COALESCE(r.bouchons,0), 'ctn_c12', COALESCE(r.ctn_c12,0),
          'ctn_c24', COALESCE(r.ctn_c24,0), 'hilio', COALESCE(r.hilio_rebut,0),
          'etiquettes', COALESCE(r.etiquettes,0)
        ) AS rebuts
      FROM productions_jour pj
      LEFT JOIN utilisateurs u ON u.id = pj.saisi_par_id
      LEFT JOIN rebuts r ON r.production_id = pj.id
    `;
    const params = [];
    if (mois) {
      query += ` WHERE TO_CHAR(pj.date_production, 'YYYY-MM') = $1`;
      params.push(mois);
    }
    query += ` ORDER BY pj.date_production DESC`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/production — créer une saisie
router.post('/', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { date_production, jours_ouvres, productions, rebuts } = req.body;
    await client.query('BEGIN');

    // Insérer la journée de production
    const { rows } = await client.query(
      `INSERT INTO productions_jour
        (date_production, jours_ouvres, c12, c24, f615, f605, f61, hilio, saisi_par_id, statut)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'en_attente')
       RETURNING id`,
      [
        date_production, jours_ouvres,
        productions.find(p=>p.code==='C12')?.quantite||0,
        productions.find(p=>p.code==='C24')?.quantite||0,
        productions.find(p=>p.code==='F615')?.quantite||0,
        productions.find(p=>p.code==='F605')?.quantite||0,
        productions.find(p=>p.code==='F61')?.quantite||0,
        productions.find(p=>p.code==='HILIO')?.quantite||0,
        req.user.id,
      ]
    );

    const prodId = rows[0].id;

    // Insérer les rebuts
    if (rebuts) {
      await client.query(
        `INSERT INTO rebuts (production_id, pref32, pref17, bouchons, ctn_c12, ctn_c24, hilio_rebut, etiquettes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [prodId, rebuts.pref32||0, rebuts.pref17||0, rebuts.bouchons||0,
         rebuts.ctn_c12||0, rebuts.ctn_c24||0, rebuts.hilio||0, rebuts.etiquettes||0]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Saisie enregistrée avec succès', id: prodId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// PUT /api/production/:id/valider — valider une saisie (DG uniquement)
router.put('/:id/valider', auth, role(DG), async (req, res) => {
  try {
    await pool.query(
      `UPDATE productions_jour SET statut='valide', valide_par_id=$1, valide_le=NOW() WHERE id=$2`,
      [req.user.id, req.params.id]
    );
    res.json({ message: 'Saisie validée avec succès' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /api/production/:id
router.delete('/:id', auth, role(DG), async (req, res) => {
  try {
    await pool.query('DELETE FROM rebuts WHERE production_id=$1', [req.params.id]);
    await pool.query('DELETE FROM productions_jour WHERE id=$1', [req.params.id]);
    res.json({ message: 'Saisie supprimée' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/production/kpis/mois-courant
router.get('/kpis/mois-courant', auth, async (req, res) => {
  try {
    const { mois } = req.query;
    const m = mois || new Date().toISOString().slice(0,7);
    const { rows } = await pool.query(
      `SELECT
        COALESCE(SUM(c12),0)   AS c12,
        COALESCE(SUM(c24),0)   AS c24,
        COALESCE(SUM(f615),0)  AS f615,
        COALESCE(SUM(f605),0)  AS f605,
        COALESCE(SUM(f61),0)   AS f61,
        COALESCE(SUM(hilio),0) AS hilio,
        COALESCE(SUM(jours_ouvres),0) AS jours_ouvres
       FROM productions_jour
       WHERE TO_CHAR(date_production,'YYYY-MM')=$1 AND statut='valide'`,
      [m]
    );
    res.json({ kpis: rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/production/kpis/evolution
router.get('/kpis/evolution', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT TO_CHAR(date_production,'YYYY-MM') AS mois,
        SUM(c12) AS c12, SUM(c24) AS c24, SUM(hilio) AS hilio
       FROM productions_jour WHERE statut='valide'
       GROUP BY mois ORDER BY mois DESC LIMIT 6`
    );
    res.json(rows.reverse());
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
