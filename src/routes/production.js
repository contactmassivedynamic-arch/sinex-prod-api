const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

const DG = 'directeur_general';

// GET /api/production?mois=2026-05
router.get('/', auth, async (req, res) => {
  try {
    const { mois } = req.query;
    let q = `
      SELECT pj.id, pj.date_production, pj.statut, pj.jours_ouvres,
        pj.remarques, pj.saisie_le AS created_at, pj.saisi_par AS saisi_par_id,
        u.nom_complet AS saisi_par_nom,
        COALESCE(json_object_agg(fp.code, lp.cartons_produits) FILTER (WHERE fp.code IS NOT NULL), '{}') AS productions,
        COALESCE(json_build_object(
          'pref32', COALESCE(r.pref32,0),'pref17', COALESCE(r.pref17,0),
          'bouchons', COALESCE(r.bouchons,0),'ctn_c12', COALESCE(r.ctn_c12,0),
          'ctn_c24', COALESCE(r.ctn_c24,0),'hilio', COALESCE(r.hilio_rebut,0),
          'etiquettes', COALESCE(r.etiquettes,0)
        ), '{}') AS rebuts
      FROM productions_jour pj
      LEFT JOIN utilisateurs u ON u.id::text = pj.saisi_par::text
      LEFT JOIN lignes_production lp ON lp.production_id = pj.id
      LEFT JOIN formats_produits fp ON fp.id = lp.format_id
      LEFT JOIN rebuts r ON r.production_id = pj.id
    `;
    const params = [];
    if (mois) { q += ` WHERE TO_CHAR(pj.date_production,'YYYY-MM')=$1`; params.push(mois); }
    q += ` GROUP BY pj.id,u.nom_complet,r.pref32,r.pref17,r.bouchons,r.ctn_c12,r.ctn_c24,r.hilio_rebut,r.etiquettes ORDER BY pj.date_production DESC`;
    const { rows } = await pool.query(q, params);
    const result = rows.map(r=>({...r,
      c12:r.productions?.C12||0,c24:r.productions?.C24||0,
      f615:r.productions?.F615||0,f605:r.productions?.F605||0,
      f61:r.productions?.F61||0,hilio:r.productions?.HILIO||0,
    }));
    res.json(result);
  } catch (err) { console.error('[PROD GET]',err); res.status(500).json({message:'Erreur serveur'}); }
});

// POST /api/production
router.post('/', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { date_production, jours_ouvres, productions, rebuts, remarques } = req.body;
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO productions_jour (date_production,jours_ouvres,saisi_par,statut,remarques)
       VALUES ($1,$2,$3,'en_attente',$4) RETURNING id`,
      [date_production, jours_ouvres||1, req.user.id, remarques||'']
    );
    const prodId = rows[0].id;
    const BTL={C12:12,C24:24,F615:6,F605:6,F61:6,HILIO:30};
    for (const prod of productions) {
      if (!prod.quantite||prod.quantite===0) continue;
      const {rows:fmtRows} = await client.query(`SELECT id FROM formats_produits WHERE code=$1`,[prod.code]);
      if (!fmtRows[0]) continue;
      await client.query(
        `INSERT INTO lignes_production (production_id,format_id,cartons_produits,bouteilles_total) VALUES ($1,$2,$3,$4)`,
        [prodId,fmtRows[0].id,prod.quantite,prod.quantite*(BTL[prod.code]||0)]
      );
    }
    if (rebuts) {
      await client.query(
        `INSERT INTO rebuts (production_id,pref32,pref17,bouchons,ctn_c12,ctn_c24,hilio_rebut,etiquettes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [prodId,rebuts.pref32||0,rebuts.pref17||0,rebuts.bouchons||0,rebuts.ctn_c12||0,rebuts.ctn_c24||0,rebuts.hilio||0,rebuts.etiquettes||0]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({message:'Saisie enregistrée',id:prodId});
  } catch(err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({message:err.message||'Erreur'}); }
  finally { client.release(); }
});

// PUT /api/production/:id/valider
router.put('/:id/valider', auth, role(DG), async (req,res) => {
  try {
    await pool.query(`UPDATE productions_jour SET statut='valide',valide_par=$1,modifie_le=NOW() WHERE id=$2`,[req.user.id,req.params.id]);
    res.json({message:'Saisie validée'});
  } catch(err) { res.status(500).json({message:'Erreur serveur'}); }
});

// DELETE /api/production/:id
router.delete('/:id', auth, role(DG), async (req,res) => {
  try {
    await pool.query('DELETE FROM rebuts WHERE production_id=$1',[req.params.id]);
    await pool.query('DELETE FROM lignes_production WHERE production_id=$1',[req.params.id]);
    await pool.query('DELETE FROM productions_jour WHERE id=$1',[req.params.id]);
    res.json({message:'Saisie supprimée'});
  } catch(err) { res.status(500).json({message:'Erreur serveur'}); }
});

// GET /api/production/kpis/mois-courant
router.get('/kpis/mois-courant', auth, async (req,res) => {
  try {
    const m = req.query.mois||new Date().toISOString().slice(0,7);
    const {rows} = await pool.query(
      `SELECT fp.code, COALESCE(SUM(lp.cartons_produits),0) AS total
       FROM lignes_production lp
       JOIN formats_produits fp ON fp.id=lp.format_id
       JOIN productions_jour pj ON pj.id=lp.production_id
       WHERE TO_CHAR(pj.date_production,'YYYY-MM')=$1 AND pj.statut='valide'
       GROUP BY fp.code`,
      [m]
    );
    const kpis={c12:0,c24:0,f615:0,f605:0,f61:0,hilio:0,jours_ouvres:0};
    rows.forEach(r=>{ kpis[r.code.toLowerCase()]=parseInt(r.total); });
    const {rows:jr} = await pool.query(
      `SELECT COALESCE(SUM(jours_ouvres),0) AS jours FROM productions_jour WHERE TO_CHAR(date_production,'YYYY-MM')=$1 AND statut='valide'`,[m]
    );
    kpis.jours_ouvres = parseFloat(jr[0]?.jours||0);
    res.json({kpis});
  } catch(err) { res.status(500).json({message:'Erreur serveur'}); }
});

// GET /api/production/kpis/evolution
router.get('/kpis/evolution', auth, async (req,res) => {
  try {
    const {rows} = await pool.query(
      `SELECT TO_CHAR(pj.date_production,'YYYY-MM') AS mois, fp.code, SUM(lp.cartons_produits) AS total
       FROM lignes_production lp
       JOIN formats_produits fp ON fp.id=lp.format_id
       JOIN productions_jour pj ON pj.id=lp.production_id
       WHERE pj.statut='valide' AND pj.date_production>=NOW()-INTERVAL '6 months'
       GROUP BY mois,fp.code ORDER BY mois`
    );
    const map={};
    rows.forEach(r=>{
      if(!map[r.mois]) map[r.mois]={mois:r.mois,c12:0,c24:0,hilio:0};
      if(['c12','c24','hilio'].includes(r.code.toLowerCase())) map[r.mois][r.code.toLowerCase()]=parseInt(r.total);
    });
    res.json(Object.values(map));
  } catch(err) { res.status(500).json({message:'Erreur serveur'}); }
});

module.exports = router;
