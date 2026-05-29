const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

const DG = 'directeur_general';

// GET /api/stocks/soldes
router.get('/soldes', auth, async (req, res) => {
  try {
    const { classe } = req.query;
    let q = `
      SELECT sa.id, sa.code, sa.libelle, sa.unite, sa.classe, sa.seuil_alerte, sa.prix_unitaire_ht,
        COALESCE(v.stock_actuel, 0) AS stock_actuel,
        COALESCE(v.stock_actuel * sa.prix_unitaire_ht, 0) AS valeur_stock_ht,
        CASE WHEN COALESCE(v.stock_actuel,0) <= sa.seuil_alerte THEN true ELSE false END AS alerte_stock
      FROM stocks_articles sa
      LEFT JOIN v_soldes_stock v ON v.article_id = sa.id
      WHERE sa.actif = true
    `;
    const params = [];
    if (classe) { q += ` AND sa.classe = $1`; params.push(classe); }
    q += ` ORDER BY sa.classe, sa.libelle`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/stocks/alertes
router.get('/alertes', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT sa.id, sa.code, sa.libelle, sa.unite, sa.seuil_alerte,
        COALESCE(v.stock_actuel,0) AS stock_actuel,
        COALESCE(v.stock_actuel * sa.prix_unitaire_ht,0) AS valeur_stock_ht,
        CASE WHEN COALESCE(v.stock_actuel,0) <= sa.seuil_alerte THEN true ELSE false END AS alerte_stock,
        CASE WHEN COALESCE(v.stock_actuel,0) = 0 THEN 'out'
             WHEN COALESCE(v.stock_actuel,0) <= sa.seuil_alerte THEN 'low'
             ELSE 'ok' END AS statut
      FROM stocks_articles sa
      LEFT JOIN v_soldes_stock v ON v.article_id = sa.id
      WHERE sa.actif = true
      ORDER BY statut, sa.libelle
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/stocks/mouvements
router.get('/mouvements', auth, async (req, res) => {
  try {
    const { article_id, type_mouvement } = req.query;
    let q = `
      SELECT sm.*, sa.libelle AS article_libelle, sa.code, u.nom_complet AS saisi_par
      FROM stocks_mouvements sm
      JOIN stocks_articles sa ON sa.id = sm.article_id
      LEFT JOIN utilisateurs u ON u.id = sm.saisi_par_id
      WHERE 1=1
    `;
    const params = [];
    if (article_id)     { params.push(article_id);     q += ` AND sm.article_id = $${params.length}`; }
    if (type_mouvement) { params.push(type_mouvement); q += ` AND sm.type_mouvement = $${params.length}`; }
    q += ` ORDER BY sm.date_mouvement DESC LIMIT 100`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/stocks/mouvements
router.post('/mouvements', auth, async (req, res) => {
  try {
    const { article_id, type_mouvement, quantite, date_mouvement, motif } = req.body;
    if (!article_id || !type_mouvement || !quantite)
      return res.status(400).json({ message: 'Champs requis manquants' });

    await pool.query(
      `INSERT INTO stocks_mouvements (article_id, type_mouvement, quantite, date_mouvement, motif, saisi_par_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [article_id, type_mouvement, quantite, date_mouvement || new Date(), motif, req.user.id]
    );
    res.status(201).json({ message: 'Mouvement enregistré' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
