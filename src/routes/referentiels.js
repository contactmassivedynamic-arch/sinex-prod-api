const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');

// GET /api/referentiels/formats
router.get('/formats', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT code, libelle, prix_unitaire_ht AS prix FROM formats_produits WHERE actif=true ORDER BY code`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/referentiels/intrants
router.get('/intrants', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT code, libelle, unite FROM stocks_articles WHERE actif=true ORDER BY libelle`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
