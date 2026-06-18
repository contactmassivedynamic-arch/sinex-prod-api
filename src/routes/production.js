const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

const DG  = 'directeur_general';
const OP  = ['operateur','directeur_general','pdg','pca','conseil_admin'];

// GET /api/production?mois=YYYY-MM
router.get('/', auth, async (req, res) => {
  try {
    const { mois } = req.query;
    const params = mois ? [mois] : [new Date().toISOString().slice(0,7)];

    const { rows } = await pool.query(`
      SELECT
        pj.id,
        pj.date_production,
        pj.statut,
        pj.jours_ouvres,
        pj.remarques,
        pj.saisie_le AS created_at,
        pj.saisi_par AS saisi_par_id,
        u.nom_complet AS saisi_par_nom,
        COALESCE(
          (SELECT json_object_agg(fp2.code, lp2.cartons_produits)
           FROM lignes_production lp2
           JOIN formats_produits fp2 ON fp2.id = lp2.format_id
           WHERE lp2.production_id = pj.id),
          '{}'::json
        ) AS productions,
        COALESCE(
          (SELECT json_build_object(
            'pref32',    COALESCE(rb2.pref32,0),
            'pref17',    COALESCE(rb2.pref17,0),
            'bouchons',  COALESCE(rb2.bouchons,0),
            'ctn_c12',   COALESCE(rb2.ctn_c12,0),
            'ctn_c24',   COALESCE(rb2.ctn_c24,0),
            'hilio',     COALESCE(rb2.hilio_rebut,0),
            'etiq_c12',  COALESCE(rb2.etiq_c12,0),
            'etiq_c24',  COALESCE(rb2.etiq_c24,0)
           )
           FROM rebuts rb2 WHERE rb2.production_id = pj.id),
          '{}'::json
        ) AS rebuts
      FROM productions_jour pj
      LEFT JOIN utilisateurs u ON u.id = pj.saisi_par
      WHERE TO_CHAR(pj.date_production, 'YYYY-MM') = $1
      ORDER BY pj.date_production DESC
    `, params);

    const data = rows.map(s => ({
      ...s,
      c12:   parseInt(s.productions?.C12  || 0),
      c24:   parseInt(s.productions?.C24  || 0),
      f615:  parseInt(s.productions?.F615 || 0),
      f605:  parseInt(s.productions?.F605 || 0),
      f61:   parseInt(s.productions?.F61  || 0),
      hilio: parseInt(s.productions?.HILIO|| 0),
    }));

    res.json(data);
  } catch(e) {
    console.error('[GET PRODUCTION]', e.message);
    res.status(500).json({ message: e.message });
  }
});

// POST /api/production — créer saisie
router.post('/', auth, async (req, res) => {
  try {
    const { date_production, jours_ouvres, productions, rebuts } = req.body;
    if (!date_production) return res.status(400).json({ message: 'Date requise' });

    const { rows: exist } = await pool.query(
      'SELECT id FROM productions_jour WHERE date_production=$1', [date_production]
    );
    if (exist[0]) return res.status(409).json({ message: 'Une saisie existe déjà pour cette date' });

    const { rows: pj } = await pool.query(
      `INSERT INTO productions_jour (date_production,jours_ouvres,saisi_par,statut)
       VALUES ($1,$2,$3,'en_attente') RETURNING id`,
      [date_production, jours_ouvres||1, req.user.id]
    );
    const pjId = pj[0].id;

    for (const p of (productions||[])) {
      if (!p.quantite) continue;
      const { rows: fp } = await pool.query('SELECT id FROM formats_produits WHERE code=$1',[p.code]);
      if (fp[0]) await pool.query(
        `INSERT INTO lignes_production (production_id,format_id,cartons_produits)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [pjId, fp[0].id, p.quantite]
      );
    }

    if (rebuts) {
      await pool.query(
        `INSERT INTO rebuts (production_id,pref32,pref17,bouchons,ctn_c12,ctn_c24,hilio_rebut,etiq_c12,etiq_c24)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [pjId, rebuts.pref32||0, rebuts.pref17||0, rebuts.bouchons||0,
         rebuts.ctn_c12||0, rebuts.ctn_c24||0, rebuts.hilio||0,
         rebuts.etiq_c12||0, rebuts.etiq_c24||0]
      );
    }

    res.status(201).json({ message: 'Saisie enregistrée ✓', id: pjId });
  } catch(e) {
    console.error('[POST PRODUCTION]', e.message);
    res.status(500).json({ message: e.message });
  }
});

// PUT /api/production/:id — modifier saisie (DG)
router.put('/:id', auth, role(DG), async (req, res) => {
  try {
    const { id } = req.params;
    const { jours_ouvres, productions, rebuts } = req.body;

    await pool.query(
      'UPDATE productions_jour SET jours_ouvres=$1 WHERE id=$2',
      [jours_ouvres||1, id]
    );

    if (productions) {
      await pool.query('DELETE FROM lignes_production WHERE production_id=$1',[id]);
      for (const p of productions) {
        if (!p.quantite) continue;
        const { rows: fp } = await pool.query('SELECT id FROM formats_produits WHERE code=$1',[p.code]);
        if (fp[0]) await pool.query(
          `INSERT INTO lignes_production (production_id,format_id,cartons_produits)
           VALUES ($1,$2,$3)`,
          [id, fp[0].id, p.quantite]
        );
      }
    }

    if (rebuts) {
      await pool.query('DELETE FROM rebuts WHERE production_id=$1',[id]);
      await pool.query(
        `INSERT INTO rebuts (production_id,pref32,pref17,bouchons,ctn_c12,ctn_c24,hilio_rebut,etiq_c12,etiq_c24)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, rebuts.pref32||0, rebuts.pref17||0, rebuts.bouchons||0,
         rebuts.ctn_c12||0, rebuts.ctn_c24||0, rebuts.hilio||0,
         rebuts.etiq_c12||0, rebuts.etiq_c24||0]
      );
    }

    res.json({ message: 'Saisie modifiée ✓' });
  } catch(e) {
    console.error('[PUT PRODUCTION]', e.message);
    res.status(500).json({ message: e.message });
  }
});

// POST /api/production/:id/valider — valider (DG)
router.post('/:id/valider', auth, role(DG), async (req, res) => {
  try {
    await pool.query(
      "UPDATE productions_jour SET statut='valide' WHERE id=$1", [req.params.id]
    );
    res.json({ message: 'Production validée ✓' });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
});

// DELETE /api/production/:id
router.delete('/:id', auth, role(DG), async (req, res) => {
  try {
    await pool.query('DELETE FROM lignes_production WHERE production_id=$1',[req.params.id]);
    await pool.query('DELETE FROM rebuts WHERE production_id=$1',[req.params.id]);
    await pool.query('DELETE FROM productions_jour WHERE id=$1',[req.params.id]);
    res.json({ message: 'Saisie supprimée ✓' });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
