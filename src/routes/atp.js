const router  = require('express').Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const role    = require('../middleware/role');
const { PRIX_PF, calcCAHT, calcCDHT, calcMarges } = require('../utils/formules');

const DG = 'directeur_general';

// GET /api/atp/mois — récupérer toutes les données ATP d'un mois
router.get('/mois', auth, async (req, res) => {
  try {
    const mois = req.query.mois || new Date().toISOString().slice(0, 7);

    // ATP du mois
    const { rows: atpRows } = await pool.query(
      `SELECT * FROM atp WHERE periode = $1`, [mois]
    );
    const atp = atpRows[0] || null;

    // Objectifs par produit
    let objectifs = {};
    if (atp) {
      try {
        const { rows: objRows } = await pool.query(
          `SELECT code_produit, quantite FROM atp_objectifs WHERE atp_id = $1`, [atp.id]
        );
        objRows.forEach(r => { objectifs[r.code_produit] = parseFloat(r.quantite || 0); });
      } catch { /* table peut ne pas exister */ }
    }

    // Réalisations depuis productions validées
    const { rows: realRows } = await pool.query(
      `SELECT fp.code, COALESCE(SUM(lp.cartons_produits), 0) AS quantite
       FROM lignes_production lp
       JOIN formats_produits fp ON fp.id = lp.format_id
       JOIN productions_jour pj ON pj.id = lp.production_id
       WHERE TO_CHAR(pj.date_production, 'YYYY-MM') = $1 AND pj.statut = 'valide'
       GROUP BY fp.code`, [mois]
    );
    const realisations = {};
    realRows.forEach(r => { realisations[r.code] = parseFloat(r.quantite || 0); });

    // Charges indirectes
    let charges = {};
    if (atp?.charges_indirectes) charges = atp.charges_indirectes;

    // Prévisions mois suivant
    const moisSuiv = getMoisSuivant(mois);
    let previsions = {};
    try {
      const { rows: atpSuiv } = await pool.query(`SELECT id FROM atp WHERE periode=$1`, [moisSuiv]);
      if (atpSuiv[0]) {
        const { rows: prevRows } = await pool.query(
          `SELECT code_produit, quantite FROM atp_objectifs WHERE atp_id=$1`, [atpSuiv[0].id]
        );
        prevRows.forEach(r => { previsions[r.code_produit] = parseFloat(r.quantite || 0); });
      }
    } catch { /* ok */ }

    // Calculs CAHTP / CDHTP (prévisionnel)
    const CAHTP = calcCAHT(objectifs);
    const CDHTP = calcCDHT(objectifs, {});
    const margesP = calcMarges(CAHTP, CDHTP);

    // Calculs CAHTR / CDHTR (réalisé) depuis ATP base ou calcul direct
    const CAHTR = atp ? parseFloat(atp.real_ca_ht || 0) : calcCAHT(realisations);
    const CDHTR = atp ? parseFloat(atp.real_cd_ht || 0) : calcCDHT(realisations, {});
    const margesR = calcMarges(CAHTR, CDHTR);

    const totalCI = Object.values(charges).reduce((s, v) => s + parseFloat(v || 0), 0);

    res.json({
      mois, atp_id: atp?.id || null,
      // Prévisionnel
      objectifs, CAHTP, CDHTP, ...mapMarges(margesP, 'P'),
      // Réalisé
      realisations, CAHTR, CDHTR, ...mapMarges(margesR, 'R'),
      // Charges indirectes
      charges, totalCI,
      // Prévisions mois suivant
      previsions,
      // Taux avancement
      taux_avancement: CAHTP > 0 ? CAHTR / CAHTP : 0,
    });
  } catch (err) {
    console.error('[ATP GET]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

function mapMarges(m, suffix) {
  return {
    [`MBHT${suffix}`]:  m.mbHT,
    [`TMBHT${suffix}`]: m.tmbHT,
    [`bmfMt${suffix}`]: m.bmfMt,
    [`fsMt${suffix}`]:  m.fsMt,
    [`ammMt${suffix}`]: m.ammMt,
    [`bmfTx${suffix}`]: m.bmfTx,
    [`fsTx${suffix}`]:  m.fsTx,
    [`ammTx${suffix}`]: m.ammTx,
  };
}

function getMoisSuivant(mois) {
  const [annee, m] = mois.split('-').map(Number);
  if (m === 12) return `${annee + 1}-01`;
  return `${annee}-${String(m + 1).padStart(2, '0')}`;
}

// POST /api/atp/objectifs — saisir objectifs prévisionnels (DG)
router.post('/objectifs', auth, role(DG), async (req, res) => {
  const client = await pool.connect();
  try {
    const { mois, objectifs } = req.body;
    await client.query('BEGIN');

    const CAHTP = calcCAHT(objectifs);
    const CDHTP = calcCDHT(objectifs, {});
    const { mbHT: MBHTP, tmbHT: TMBHTP, bmfMt, fsMt, ammMt } = calcMarges(CAHTP, CDHTP);

    // Upsert ATP
    const { rows } = await client.query(
      `INSERT INTO atp (periode, statut, proj_ca_ht, proj_cd_ht, proj_mb_ht, proj_tmb, bmf_mt, fs_mt, amm_mt)
       VALUES ($1,'en_cours',$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (periode) DO UPDATE SET
         proj_ca_ht=$2, proj_cd_ht=$3, proj_mb_ht=$4, proj_tmb=$5,
         bmf_mt=EXCLUDED.bmf_mt, fs_mt=EXCLUDED.fs_mt, amm_mt=EXCLUDED.amm_mt
       RETURNING id`,
      [mois, CAHTP, CDHTP, MBHTP, TMBHTP, bmfMt, fsMt, ammMt]
    );

    const atpId = rows[0].id;

    // Supprimer anciens objectifs et réinsérer
    try {
      await client.query(`DELETE FROM atp_objectifs WHERE atp_id=$1`, [atpId]);
      for (const [code, qte] of Object.entries(objectifs)) {
        if (!qte || parseFloat(qte) === 0) continue;
        await client.query(
          `INSERT INTO atp_objectifs (atp_id, code_produit, quantite, prix_ht, montant_ht)
           VALUES ($1,$2,$3,$4,$5)`,
          [atpId, code, parseFloat(qte), PRIX_PF[code] || 0, parseFloat(qte) * (PRIX_PF[code] || 0)]
        );
      }
    } catch { /* atp_objectifs peut ne pas exister */ }

    await client.query('COMMIT');
    res.json({ message: 'Objectifs enregistrés ✓', CAHTP, CDHTP, MBHTP, TMBHTP: (TMBHTP*100).toFixed(2)+'%' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ATP OBJECTIFS]', err);
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  } finally { client.release(); }
});

// POST /api/atp/charges — saisir charges indirectes (DG)
router.post('/charges', auth, role(DG), async (req, res) => {
  try {
    const { mois, charges } = req.body;
    const totalCI = Object.values(charges).reduce((s, v) => s + parseFloat(v || 0), 0);

    // Ajouter colonne si manquante
    await pool.query(
      `ALTER TABLE atp ADD COLUMN IF NOT EXISTS charges_indirectes JSONB DEFAULT '{}'`
    ).catch(() => {});

    const result = await pool.query(
      `UPDATE atp SET charges_indirectes=$1::jsonb WHERE periode=$2 RETURNING id`,
      [JSON.stringify(charges), mois]
    );

    if (result.rowCount === 0) {
      await pool.query(
        `INSERT INTO atp (periode, statut, charges_indirectes) VALUES ($1,'en_cours',$2::jsonb)`,
        [mois, JSON.stringify(charges)]
      );
    }

    res.json({ message: 'Charges enregistrées ✓', totalCI });
  } catch (err) {
    console.error('[ATP CHARGES]', err);
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// POST /api/atp/previsions — saisir prévisions mois suivant (deviennent objectifs M+1)
router.post('/previsions', auth, role(DG), async (req, res) => {
  const client = await pool.connect();
  try {
    const { mois, previsions } = req.body;
    const moisSuiv = getMoisSuivant(mois);

    const CAHTP = calcCAHT(previsions);
    const CDHTP = calcCDHT(previsions, {});
    const { mbHT, tmbHT, bmfMt, fsMt, ammMt } = calcMarges(CAHTP, CDHTP);

    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO atp (periode, statut, proj_ca_ht, proj_cd_ht, proj_mb_ht, proj_tmb, bmf_mt, fs_mt, amm_mt)
       VALUES ($1,'en_cours',$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (periode) DO UPDATE SET
         proj_ca_ht=$2, proj_cd_ht=$3, proj_mb_ht=$4, proj_tmb=$5
       RETURNING id`,
      [moisSuiv, CAHTP, CDHTP, mbHT, tmbHT, bmfMt, fsMt, ammMt]
    );

    try {
      await client.query(`DELETE FROM atp_objectifs WHERE atp_id=$1`, [rows[0].id]);
      for (const [code, qte] of Object.entries(previsions)) {
        if (!qte || parseFloat(qte) === 0) continue;
        await client.query(
          `INSERT INTO atp_objectifs (atp_id, code_produit, quantite, prix_ht, montant_ht)
           VALUES ($1,$2,$3,$4,$5)`,
          [rows[0].id, code, parseFloat(qte), PRIX_PF[code]||0, parseFloat(qte)*(PRIX_PF[code]||0)]
        );
      }
    } catch { /* ok */ }

    await client.query('COMMIT');
    res.json({ message: `Prévisions enregistrées → Objectifs ${moisSuiv} ✓`, CAHTP });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: err.message || 'Erreur' });
  } finally { client.release(); }
});

module.exports = router;
