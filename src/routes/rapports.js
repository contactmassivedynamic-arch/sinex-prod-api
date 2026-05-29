const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');

// GET /api/rapports
router.get('/', auth, async (req, res) => {
  try {
    const { mois, type } = req.query;
    let q = `
      SELECT r.*, u.nom_complet AS genere_par_nom
      FROM rapports r
      LEFT JOIN utilisateurs u ON u.id = r.genere_par_id
      WHERE 1=1
    `;
    const params = [];
    if (mois && mois !== 'Tous les mois') {
      params.push(mois);
      q += ` AND TO_CHAR(r.genere_le,'YYYY-MM') = $${params.length}`;
    }
    if (type && type !== 'Tous les types') {
      params.push(type);
      q += ` AND r.type_rapport = $${params.length}`;
    }
    q += ` ORDER BY r.genere_le DESC LIMIT 50`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
