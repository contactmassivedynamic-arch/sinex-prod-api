const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

const DG = 'directeur_general';

// GET /api/stocks/soldes
router.get('/soldes', auth, async (req, res) => {
  try {
    const {rows} = await pool.query(`
      SELECT sa.id, sa.code, sa.libelle, sa.unite, sa.classe,
        sa.seuil_alerte, sa.prix_unitaire_ht,
        COALESCE(SUM(
          CASE WHEN sm.type_mouvement='entree' THEN sm.quantite
               WHEN sm.type_mouvement='sortie' THEN -sm.quantite
               ELSE 0 END
        ),0) AS stock_actuel,
        COALESCE(SUM(
          CASE WHEN sm.type_mouvement='entree' THEN sm.quantite
               WHEN sm.type_mouvement='sortie' THEN -sm.quantite
               ELSE 0 END
        ),0) * sa.prix_unitaire_ht AS valeur_stock_ht,
        CASE WHEN COALESCE(SUM(
          CASE WHEN sm.type_mouvement='entree' THEN sm.quantite
               WHEN sm.type_mouvement='sortie' THEN -sm.quantite ELSE 0 END
        ),0) <= 0 THEN true ELSE false END AS alerte_stock
      FROM stocks_articles sa
      LEFT JOIN stocks_mouvements sm ON sm.article_id=sa.id
      WHERE sa.actif=true
      GROUP BY sa.id, sa.code, sa.libelle, sa.unite, sa.classe, sa.seuil_alerte, sa.prix_unitaire_ht
      ORDER BY sa.classe, sa.libelle
    `);
    res.json(rows);
  } catch(err) { res.status(500).json({message:'Erreur serveur'}); }
});

// GET /api/stocks/alertes
router.get('/alertes', auth, async (req, res) => {
  try {
    const {rows} = await pool.query(`
      SELECT sa.id, sa.code, sa.libelle, sa.unite, sa.classe,
        sa.seuil_alerte, sa.prix_unitaire_ht,
        COALESCE(SUM(
          CASE WHEN sm.type_mouvement='entree' THEN sm.quantite
               WHEN sm.type_mouvement='sortie' THEN -sm.quantite ELSE 0 END
        ),0) AS stock_actuel,
        COALESCE(SUM(
          CASE WHEN sm.type_mouvement='entree' THEN sm.quantite
               WHEN sm.type_mouvement='sortie' THEN -sm.quantite ELSE 0 END
        ),0) * sa.prix_unitaire_ht AS valeur_stock_ht,
        true AS alerte_stock
      FROM stocks_articles sa
      LEFT JOIN stocks_mouvements sm ON sm.article_id=sa.id
      WHERE sa.actif=true
      GROUP BY sa.id, sa.code, sa.libelle, sa.unite, sa.classe, sa.seuil_alerte, sa.prix_unitaire_ht
      HAVING COALESCE(SUM(
        CASE WHEN sm.type_mouvement='entree' THEN sm.quantite
             WHEN sm.type_mouvement='sortie' THEN -sm.quantite ELSE 0 END
      ),0) <= COALESCE(sa.seuil_alerte,0)
      ORDER BY sa.classe, sa.libelle
    `);
    res.json(rows);
  } catch(err) { res.status(500).json({message:'Erreur serveur'}); }
});

// GET /api/stocks/mouvements — avec filtres mois + type + classe
router.get('/mouvements', auth, async (req, res) => {
  try {
    const {mois, type, classe} = req.query;
    let q = `
      SELECT sm.id, sm.type_mouvement, sm.quantite, sm.date_mouvement,
        sm.motif, sm.created_at,
        sa.libelle AS article_libelle, sa.code AS article_code,
        sa.unite, sa.classe, sa.prix_unitaire_ht,
        sm.quantite * sa.prix_unitaire_ht AS valeur_ht,
        u.nom_complet AS saisi_par_nom
      FROM stocks_mouvements sm
      JOIN stocks_articles sa ON sa.id=sm.article_id
      LEFT JOIN utilisateurs u ON u.id=sm.saisi_par_id
      WHERE 1=1
    `;
    const params = [];
    if (mois) { params.push(mois); q += ` AND TO_CHAR(sm.date_mouvement,'YYYY-MM')=$${params.length}`; }
    if (type && type!=='all') { params.push(type); q += ` AND sm.type_mouvement=$${params.length}`; }
    if (classe && classe!=='all') { params.push(parseInt(classe)); q += ` AND sa.classe=$${params.length}`; }
    q += ` ORDER BY sm.date_mouvement DESC, sm.created_at DESC`;
    const {rows} = await pool.query(q, params);
    res.json(rows);
  } catch(err) { res.status(500).json({message:'Erreur serveur'}); }
});

// POST /api/stocks/mouvements — ajouter entrée
router.post('/mouvements', auth, async (req, res) => {
  try {
    const {article_id, type_mouvement, quantite, date_mouvement, motif} = req.body;
    await pool.query(
      `INSERT INTO stocks_mouvements (article_id,type_mouvement,quantite,date_mouvement,motif,saisi_par_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [article_id, type_mouvement||'entree', quantite, date_mouvement||new Date(), motif||'Approvisionnement', req.user.id]
    );
    res.status(201).json({message:'Mouvement enregistré ✓'});
  } catch(err) { res.status(500).json({message:err.message}); }
});

// PUT /api/stocks/mouvements/:id — modifier un mouvement (DG uniquement)
router.put('/mouvements/:id', auth, role(DG), async (req, res) => {
  try {
    const {quantite, date_mouvement, motif, type_mouvement} = req.body;
    await pool.query(
      `UPDATE stocks_mouvements SET quantite=$1, date_mouvement=$2, motif=$3, type_mouvement=$4 WHERE id=$5`,
      [quantite, date_mouvement, motif, type_mouvement, req.params.id]
    );
    res.json({message:'Mouvement modifié ✓'});
  } catch(err) { res.status(500).json({message:err.message}); }
});

// DELETE /api/stocks/mouvements/:id — supprimer (DG uniquement)
router.delete('/mouvements/:id', auth, role(DG), async (req, res) => {
  try {
    await pool.query(`DELETE FROM stocks_mouvements WHERE id=$1`,[req.params.id]);
    res.json({message:'Mouvement supprimé ✓'});
  } catch(err) { res.status(500).json({message:err.message}); }
});

// PUT /api/stocks/articles/:id/prix — modifier prix HT (DG uniquement)
router.put('/articles/:id/prix', auth, role(DG), async (req, res) => {
  try {
    const {prix_unitaire_ht} = req.body;
    await pool.query(
      `UPDATE stocks_articles SET prix_unitaire_ht=$1 WHERE id=$2`,
      [prix_unitaire_ht, req.params.id]
    );
    res.json({message:'Prix mis à jour ✓'});
  } catch(err) { res.status(500).json({message:err.message}); }
});

module.exports = router;
