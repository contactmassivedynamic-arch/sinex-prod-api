const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');

router.get('/consolide', auth, async (req, res) => {
  try {
    const m = req.query.mois || new Date().toISOString().slice(0,7);

    // KPIs production
    const {rows:kpiRows} = await pool.query(
      `SELECT fp.code, COALESCE(SUM(lp.cartons_produits),0) AS total
       FROM lignes_production lp
       JOIN formats_produits fp ON fp.id=lp.format_id
       JOIN productions_jour pj ON pj.id=lp.production_id
       WHERE TO_CHAR(pj.date_production,'YYYY-MM')=$1 AND pj.statut='valide'
       GROUP BY fp.code`,
      [m]
    );
    const kpis={c12:0,c24:0,f615:0,f605:0,f61:0,hilio:0,jours_ouvres:'—'};
    kpiRows.forEach(r=>{ kpis[r.code.toLowerCase()]=parseInt(r.total); });

    // Jours ouvrés
    const {rows:jr} = await pool.query(
      `SELECT COALESCE(SUM(jours_ouvres),0) AS jours FROM productions_jour WHERE TO_CHAR(date_production,'YYYY-MM')=$1 AND statut='valide'`,[m]
    );
    kpis.jours_ouvres = parseFloat(jr[0]?.jours||0);

    // Évolution 6 mois
    const {rows:evoRows} = await pool.query(
      `SELECT TO_CHAR(pj.date_production,'YYYY-MM') AS mois, fp.code, SUM(lp.cartons_produits) AS total
       FROM lignes_production lp
       JOIN formats_produits fp ON fp.id=lp.format_id
       JOIN productions_jour pj ON pj.id=lp.production_id
       WHERE pj.statut='valide' AND pj.date_production>=NOW()-INTERVAL '6 months'
       GROUP BY mois,fp.code ORDER BY mois`
    );
    const evoMap={};
    evoRows.forEach(r=>{
      if(!evoMap[r.mois]) evoMap[r.mois]={mois:r.mois,c12:0,c24:0,hilio:0};
      if(['c12','c24','hilio'].includes(r.code.toLowerCase())) evoMap[r.mois][r.code.toLowerCase()]=parseInt(r.total);
    });

    // Rebuts du mois
    const {rows:rebutRows} = await pool.query(
      `SELECT
        'Préformes 32g' AS nom, COALESCE(SUM(r.pref32),0) AS quantite FROM rebuts r
        JOIN productions_jour p ON p.id=r.production_id
        WHERE TO_CHAR(p.date_production,'YYYY-MM')=$1 AND p.statut='valide'
       UNION ALL
       SELECT 'Préformes 17g', COALESCE(SUM(r.pref17),0) FROM rebuts r
        JOIN productions_jour p ON p.id=r.production_id WHERE TO_CHAR(p.date_production,'YYYY-MM')=$1 AND p.statut='valide'
       UNION ALL
       SELECT 'Bouchons', COALESCE(SUM(r.bouchons),0) FROM rebuts r
        JOIN productions_jour p ON p.id=r.production_id WHERE TO_CHAR(p.date_production,'YYYY-MM')=$1 AND p.statut='valide'
       UNION ALL
       SELECT 'Cartons', COALESCE(SUM(r.ctn_c12+r.ctn_c24),0) FROM rebuts r
        JOIN productions_jour p ON p.id=r.production_id WHERE TO_CHAR(p.date_production,'YYYY-MM')=$1 AND p.statut='valide'
       UNION ALL
       SELECT 'Étiquettes', COALESCE(SUM(r.etiquettes),0) FROM rebuts r
        JOIN productions_jour p ON p.id=r.production_id WHERE TO_CHAR(p.date_production,'YYYY-MM')=$1 AND p.statut='valide'`,
      [m]
    );

    // ATP
    const {rows:atpRows} = await pool.query(`SELECT * FROM atp WHERE periode=$1`,[m]);

    res.json({
      kpis,
      evolution: Object.values(evoMap),
      rebuts: rebutRows,
      atp: atpRows[0]||null,
      data: atpRows,
    });
  } catch(err) {
    console.error('[DASHBOARD]',err);
    res.status(500).json({message:'Erreur serveur'});
  }
});

module.exports = router;
