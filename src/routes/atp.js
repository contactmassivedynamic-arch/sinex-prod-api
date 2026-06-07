const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

const DG = 'directeur_general';

// POST /api/atp/objectifs — saisir les objectifs prévisionnels
router.post('/objectifs', auth, role(DG), async (req, res) => {
  const client = await pool.connect();
  try {
    const { mois, objectifs } = req.body;
    if (!mois || !objectifs) return res.status(400).json({ message: 'Données manquantes' });

    await client.query('BEGIN');

    // Calculer CA prévisionnel
    const PRIX = {C12:2116.10,C24:2033.90,F615:1032.00,F605:429.00,F61:1186.00,HILIO:169.00};
    let caObj = 0;
    for (const [code, qty] of Object.entries(objectifs)) {
      caObj += (parseFloat(qty)||0) * (PRIX[code]||0);
    }
    const cdObj  = caObj * 0.65;
    const mbObj  = caObj - cdObj;
    const tmbObj = caObj > 0 ? mbObj / caObj : 0;

    // Upsert ATP
    const { rows } = await client.query(
      `INSERT INTO atp (periode, statut, proj_ca_ht, proj_cd_ht, proj_mb_ht, proj_tmb)
       VALUES ($1, 'en_cours', $2, $3, $4, $5)
       ON CONFLICT (periode) DO UPDATE SET
         proj_ca_ht=$2, proj_cd_ht=$3, proj_mb_ht=$4, proj_tmb=$5
       RETURNING id`,
      [mois, caObj, cdObj, mbObj, tmbObj]
    );

    // Stocker les objectifs détaillés dans atp_objectifs si la table existe
    try {
      await client.query(`DELETE FROM atp_objectifs WHERE atp_id=$1`, [rows[0].id]);
      for (const [code, qty] of Object.entries(objectifs)) {
        if (!qty || qty === 0) continue;
        await client.query(
          `INSERT INTO atp_objectifs (atp_id, code_produit, quantite, prix_ht, montant_ht)
           VALUES ($1, $2, $3, $4, $5)`,
          [rows[0].id, code, parseFloat(qty)||0, PRIX[code]||0, (parseFloat(qty)||0)*(PRIX[code]||0)]
        );
      }
    } catch { /* table atp_objectifs peut ne pas exister */ }

    await client.query('COMMIT');
    res.json({ message: 'Objectifs enregistrés ✓', atp_id: rows[0].id, ca_previsionnel: caObj });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ATP OBJECTIFS]', err);
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  } finally { client.release(); }
});

// POST /api/atp/charges — saisir les charges indirectes
router.post('/charges', auth, role(DG), async (req, res) => {
  try {
    const { mois, charges } = req.body;
    if (!mois || !charges) return res.status(400).json({ message: 'Données manquantes' });

    const totalCI = Object.values(charges).reduce((s, v) => s + (parseFloat(v)||0), 0);

    // Mettre à jour l'ATP avec les charges indirectes
    await pool.query(
      `UPDATE atp SET
        charges_indirectes = $1::jsonb
       WHERE periode = $2`,
      [JSON.stringify(charges), mois]
    );

    res.json({ message: 'Charges enregistrées ✓', total_charges_indirectes: totalCI });
  } catch (err) {
    console.error('[ATP CHARGES]', err);
    // Si la colonne n'existe pas, on la crée
    try {
      await pool.query(`ALTER TABLE atp ADD COLUMN IF NOT EXISTS charges_indirectes JSONB DEFAULT '{}'`);
      await pool.query(`UPDATE atp SET charges_indirectes=$1::jsonb WHERE periode=$2`, [JSON.stringify(req.body.charges), req.body.mois]);
      res.json({ message: 'Charges enregistrées ✓' });
    } catch (err2) {
      res.status(500).json({ message: err2.message || 'Erreur serveur' });
    }
  }
});

module.exports = router;
