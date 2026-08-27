const router  = require('express').Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const role    = require('../middleware/role');
const { PRIX_PF, calcCAHT, calcMarges } = require('../utils/formules');

const DG = 'directeur_general';

function getMoisSuivant(mois) {
  const [a,m] = mois.split('-').map(Number);
  return m===12?`${a+1}-01`:`${a}-${String(m+1).padStart(2,'0')}`;
}

// GET /api/atp/mois
router.get('/mois', auth, async (req, res) => {
  try {
    const mois = req.query.mois || new Date().toISOString().slice(0,7);
    const moisSuiv = getMoisSuivant(mois);

    const {rows:atpRows} = await pool.query(`SELECT * FROM atp WHERE periode=$1`,[mois]);
    const atp = atpRows[0] || null;

    const objectifs = {C12:0,C24:0,F615:0,F605:0,F61:0,HILIO:0};
    if (atp) {
      const {rows:objRows} = await pool.query(`SELECT code_produit,quantite FROM atp_objectifs WHERE atp_id=$1`,[atp.id]);
      objRows.forEach(r=>{ objectifs[r.code_produit]=parseFloat(r.quantite||0); });
    }

    const {rows:realRows} = await pool.query(
      `SELECT fp.code, COALESCE(SUM(lp.cartons_produits),0) AS quantite
       FROM lignes_production lp
       JOIN formats_produits fp ON fp.id=lp.format_id
       JOIN productions_jour pj ON pj.id=lp.production_id
       WHERE TO_CHAR(pj.date_production,'YYYY-MM')=$1 AND pj.statut='valide'
       GROUP BY fp.code`,[mois]
    );
    const realisations = {C12:0,C24:0,F615:0,F605:0,F61:0,HILIO:0};
    realRows.forEach(r=>{ realisations[r.code]=parseFloat(r.quantite||0); });

    const charges = atp?.charges_indirectes || {salaires:0,electricite:0,carburant:0,loyer:0,maintenance:0,autres:0};
    const totalCI = Object.values(charges).reduce((s,v)=>s+parseFloat(v||0),0);

    const previsions = {C12:0,C24:0,F615:0,F605:0,F61:0,HILIO:0};
    const {rows:atpSuiv} = await pool.query(`SELECT id FROM atp WHERE periode=$1`,[moisSuiv]);
    if (atpSuiv[0]) {
      const {rows:prevRows} = await pool.query(`SELECT code_produit,quantite FROM atp_objectifs WHERE atp_id=$1`,[atpSuiv[0].id]);
      prevRows.forEach(r=>{ previsions[r.code_produit]=parseFloat(r.quantite||0); });
    }

    // CAHTP calculé automatiquement
    const CAHTP = calcCAHT(objectifs);
    // CDHTP = valeur manuelle sauvegardée (proj_cd_ht) ou 0
    const CDHTP = parseFloat(atp?.proj_cd_ht || 0);
    const MBHTP = CAHTP - CDHTP;
    const TMBHTP = CAHTP>0 ? MBHTP/CAHTP : 0;
    const mP = calcMarges(CAHTP, CDHTP);

    // CAHTR calculé automatiquement
    const CAHTR = calcCAHT(realisations);
    // CDHTR = valeur manuelle sauvegardée (real_cd_ht) ou 0
    const CDHTR = parseFloat(atp?.real_cd_ht || 0);
    const MBHTR = CAHTR - CDHTR;
    const TMBHTR = CAHTR>0 ? MBHTR/CAHTR : 0;
    const mR = calcMarges(CAHTR, CDHTR);

    res.json({
      mois, atp_id: atp?.id||null,
      objectifs, realisations, previsions, charges, totalCI,
      CAHTP, CDHTP, MBHTP, TMBHTP,
      bmfMtP:mP.bmfMt, fsMtP:mP.fsMt, ammMtP:mP.ammMt,
      bmfTxP:mP.bmfTx, fsTxP:mP.fsTx, ammTxP:mP.ammTx,
      CAHTR, CDHTR, MBHTR, TMBHTR,
      bmfMtR:mR.bmfMt, fsMtR:mR.fsMt, ammMtR:mR.ammMt,
      bmfTxR:mR.bmfTx, fsTxR:mR.fsTx, ammTxR:mR.ammTx,
      taux_avancement: CAHTP>0 ? CAHTR/CAHTP : 0,
    });
  } catch(err) {
    console.error('[ATP GET]', err.message);
    res.status(500).json({message:'Erreur serveur'});
  }
});

// POST /api/atp/objectifs — CDHTP saisi manuellement
router.post('/objectifs', auth, role(DG), async (req, res) => {
  const client = await pool.connect();
  try {
    const { mois, objectifs, cdhtp_manuel } = req.body;
    await client.query('BEGIN');

    const CAHTP = calcCAHT(objectifs);
    const CDHTP = parseFloat(cdhtp_manuel || 0);
    const MBHTP = CAHTP - CDHTP;
    const TMBHTP = CAHTP>0 ? MBHTP/CAHTP : 0;
    const { bmfMt, fsMt, ammMt } = calcMarges(CAHTP, CDHTP);

    const {rows} = await client.query(
      `INSERT INTO atp (periode,statut,proj_ca_ht,proj_cd_ht,proj_mb_ht,proj_tmb,bmf_mt,fs_mt,amm_mt)
       VALUES ($1,'en_cours',$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (periode) DO UPDATE SET
         proj_ca_ht=$2, proj_cd_ht=$3, proj_mb_ht=$4, proj_tmb=$5,
         bmf_mt=$6, fs_mt=$7, amm_mt=$8
       RETURNING id`,
      [mois, CAHTP, CDHTP, MBHTP, TMBHTP, bmfMt, fsMt, ammMt]
    );
    const atpId = rows[0].id;
    await client.query(`DELETE FROM atp_objectifs WHERE atp_id=$1`,[atpId]);
    for (const [code,qte] of Object.entries(objectifs)) {
      if (!qte || parseFloat(qte)===0) continue;
      await client.query(
        `INSERT INTO atp_objectifs (atp_id,code_produit,quantite,prix_ht,montant_ht) VALUES ($1,$2,$3,$4,$5)`,
        [atpId, code, parseFloat(qte), PRIX_PF[code]||0, parseFloat(qte)*(PRIX_PF[code]||0)]
      );
    }
    await client.query('COMMIT');
    res.json({message:'Objectifs enregistrés ✓', CAHTP, CDHTP, MBHTP, TMBHTP});
  } catch(err) {
    await client.query('ROLLBACK');
    console.error('[ATP OBJ]', err.message);
    res.status(500).json({message:err.message});
  } finally { client.release(); }
});

// POST /api/atp/charges
router.post('/charges', auth, role(DG), async (req, res) => {
  try {
    const { mois, charges } = req.body;
    const totalCI = Object.values(charges).reduce((s,v)=>s+parseFloat(v||0),0);
    const r = await pool.query(
      `UPDATE atp SET charges_indirectes=$1::jsonb WHERE periode=$2 RETURNING id`,
      [JSON.stringify(charges), mois]
    );
    if (r.rowCount===0) {
      await pool.query(
        `INSERT INTO atp (periode,statut,charges_indirectes) VALUES ($1,'en_cours',$2::jsonb)`,
        [mois, JSON.stringify(charges)]
      );
    }
    res.json({message:'Charges enregistrées ✓', totalCI});
  } catch(err) { res.status(500).json({message:err.message}); }
});

// POST /api/atp/previsions — CDHTP mois suivant saisi manuellement
router.post('/previsions', auth, role(DG), async (req, res) => {
  const client = await pool.connect();
  try {
    const { mois, previsions, cdhtp_manuel } = req.body;
    const moisSuiv = getMoisSuivant(mois);

    const CAHTP = calcCAHT(previsions);
    const CDHTP = parseFloat(cdhtp_manuel || 0);
    const MBHTP = CAHTP - CDHTP;
    const TMBHTP = CAHTP>0 ? MBHTP/CAHTP : 0;
    const { bmfMt, fsMt, ammMt } = calcMarges(CAHTP, CDHTP);

    await client.query('BEGIN');
    const {rows} = await client.query(
      `INSERT INTO atp (periode,statut,proj_ca_ht,proj_cd_ht,proj_mb_ht,proj_tmb,bmf_mt,fs_mt,amm_mt)
       VALUES ($1,'en_cours',$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (periode) DO UPDATE SET
         proj_ca_ht=$2, proj_cd_ht=$3, proj_mb_ht=$4, proj_tmb=$5
       RETURNING id`,
      [moisSuiv, CAHTP, CDHTP, MBHTP, TMBHTP, bmfMt, fsMt, ammMt]
    );
    await client.query(`DELETE FROM atp_objectifs WHERE atp_id=$1`,[rows[0].id]);
    for (const [code,qte] of Object.entries(previsions)) {
      if (!qte || parseFloat(qte)===0) continue;
      await client.query(
        `INSERT INTO atp_objectifs (atp_id,code_produit,quantite,prix_ht,montant_ht) VALUES ($1,$2,$3,$4,$5)`,
        [rows[0].id, code, parseFloat(qte), PRIX_PF[code]||0, parseFloat(qte)*(PRIX_PF[code]||0)]
      );
    }
    await client.query('COMMIT');
    res.json({message:`Prévisions → Objectifs ${moisSuiv} ✓`, CAHTP, CDHTP});
  } catch(err) {
    await client.query('ROLLBACK');
    res.status(500).json({message:err.message});
  } finally { client.release(); }
});

// POST /api/atp/cdhtr — CDHTR saisi manuellement (réalisation)
router.post('/cdhtr', auth, role(DG), async (req, res) => {
  try {
    const { mois, cdhtr } = req.body;
    const CDHTR = parseFloat(cdhtr || 0);
    const r = await pool.query(
      `UPDATE atp SET real_cd_ht=$1 WHERE periode=$2 RETURNING id`,
      [CDHTR, mois]
    );
    if (r.rowCount===0) {
      await pool.query(
        `INSERT INTO atp (periode,statut,real_cd_ht) VALUES ($1,'en_cours',$2)`,
        [mois, CDHTR]
      );
    }
    res.json({message:'CDHTR enregistré ✓', CDHTR});
  } catch(err) {
    console.error('[ATP CDHTR]', err.message);
    res.status(500).json({message:err.message});
  }
});

module.exports = router;
