const router  = require('express').Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const { calcCAHT, calcCDHT, calcMarges, calcCPF } = require('../utils/formules');

router.get('/consolide', auth, async (req, res) => {
  try {
    const moisRaw = req.query.mois || new Date().toISOString().slice(0,7);
    // Extraire uniquement YYYY-MM (ignorer le cache-busting &_t=...)
    const mois = moisRaw.split('&')[0].slice(0,7);
    const annee = mois.slice(0,4);

    // KPIs production du mois
    const {rows:kpiRows} = await pool.query(
      `SELECT fp.code, COALESCE(SUM(lp.cartons_produits),0) AS total
       FROM lignes_production lp
       JOIN formats_produits fp ON fp.id=lp.format_id
       JOIN productions_jour pj ON pj.id=lp.production_id
       WHERE TO_CHAR(pj.date_production,'YYYY-MM')=$1 AND pj.statut='valide'
       GROUP BY fp.code`, [mois]
    );
    const kpis={c12:0,c24:0,f615:0,f605:0,f61:0,hilio:0,jours_ouvres:0};
    kpiRows.forEach(r=>{kpis[r.code.toLowerCase()]=parseInt(r.total);});
    const {rows:jr}=await pool.query(
      `SELECT COALESCE(SUM(jours_ouvres),0) AS jours FROM productions_jour WHERE TO_CHAR(date_production,'YYYY-MM')=$1 AND statut='valide'`,[mois]
    );
    kpis.jours_ouvres=parseFloat(jr[0]?.jours||0);

    const prods={C12:kpis.c12,C24:kpis.c24,F615:kpis.f615,F605:kpis.f605,F61:kpis.f61,HILIO:kpis.hilio};
    const caMois  = calcCAHT(prods);
    const cdMois  = calcCDHT(prods, {});
    const marges  = calcMarges(caMois, cdMois);

    const {rows:atpAnnee} = await pool.query(
      `SELECT COALESCE(SUM(real_ca_ht),0) AS ca_cumule, COALESCE(SUM(real_cd_ht),0) AS cd_cumule
       FROM atp WHERE periode LIKE $1`, [`${annee}-%`]
    );
    const caCumule = parseFloat(atpAnnee[0]?.ca_cumule||0);
    const cdCumule = parseFloat(atpAnnee[0]?.cd_cumule||0);

    const {rows:ciRows} = await pool.query(
      `SELECT charges_indirectes FROM atp WHERE periode LIKE $1`, [`${annee}-%`]
    );
    const ciCumule = ciRows.reduce((s,r)=>{
      if(!r.charges_indirectes) return s;
      return s + Object.values(r.charges_indirectes).reduce((a,b)=>a+parseFloat(b||0),0);
    },0);

    const cpf = calcCPF(caCumule, cdCumule, ciCumule);

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

    // Rebuts — etiq_c12 et etiq_c24 séparées, sans etiquettes
    const {rows:rebutRows} = await pool.query(
      `SELECT 'Préformes' AS nom, COALESCE(SUM(r.pref32+r.pref17),0) AS quantite FROM rebuts r
        JOIN productions_jour p ON p.id=r.production_id WHERE TO_CHAR(p.date_production,'YYYY-MM')=$1 AND p.statut='valide'
       UNION ALL
       SELECT 'Bouchons', COALESCE(SUM(r.bouchons),0) FROM rebuts r
        JOIN productions_jour p ON p.id=r.production_id WHERE TO_CHAR(p.date_production,'YYYY-MM')=$1 AND p.statut='valide'
       UNION ALL
       SELECT 'Étiq C12 (1,5L)', COALESCE(SUM(r.etiq_c12),0) FROM rebuts r
        JOIN productions_jour p ON p.id=r.production_id WHERE TO_CHAR(p.date_production,'YYYY-MM')=$1 AND p.statut='valide'
       UNION ALL
       SELECT 'Étiq C24 (0,5L)', COALESCE(SUM(r.etiq_c24),0) FROM rebuts r
        JOIN productions_jour p ON p.id=r.production_id WHERE TO_CHAR(p.date_production,'YYYY-MM')=$1 AND p.statut='valide'
       UNION ALL
       SELECT 'Cartons', COALESCE(SUM(r.ctn_c12+r.ctn_c24),0) FROM rebuts r
        JOIN productions_jour p ON p.id=r.production_id WHERE TO_CHAR(p.date_production,'YYYY-MM')=$1 AND p.statut='valide'
       UNION ALL
       SELECT 'Sachets HILIO', COALESCE(SUM(r.hilio_rebut),0) FROM rebuts r
        JOIN productions_jour p ON p.id=r.production_id WHERE TO_CHAR(p.date_production,'YYYY-MM')=$1 AND p.statut='valide'`,
      [mois]
    );

    const {rows:atpRows} = await pool.query(`SELECT * FROM atp WHERE periode=$1`,[mois]);

    res.json({
      kpis, caMois, cdMois, ...marges,
      caCumule, cdCumule, ciCumule, cpf,
      evolution: Object.values(evoMap),
      rebuts: rebutRows,
      atp: atpRows[0]||null,
      data: atpRows,
    });
  } catch(err){
    console.error('[DASHBOARD]',err);
    res.status(500).json({message:'Erreur serveur'});
  }
});

module.exports = router;
