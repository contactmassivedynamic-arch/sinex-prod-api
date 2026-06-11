const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

const DG = 'directeur_general';

// GET /api/stocks/soldes?mois=YYYY-MM
router.get('/soldes', auth, async (req, res) => {
  try {
    const { mois } = req.query;
    const params = [];
    let moisFilter = '';
    if (mois) { params.push(mois); moisFilter = `AND TO_CHAR(sm.date_mouvement,'YYYY-MM')=$${params.length}`; }

    const {rows} = await pool.query(`
      SELECT
        sa.id, sa.code, sa.libelle, sa.unite, sa.classe,
        sa.seuil_alerte, sa.prix_unitaire_ht,
        -- Stock actuel (tous mouvements confondus)
        COALESCE(SUM(
          CASE WHEN sm.type_mouvement='entree' THEN sm.quantite
               WHEN sm.type_mouvement='sortie' THEN -sm.quantite ELSE 0 END
        ),0) AS stock_actuel,
        -- Stock début mois (report mois précédent)
        COALESCE(SUM(
          CASE WHEN sm.type_mouvement='entree' AND sm.motif='Report solde mois précédent' ${moisFilter} THEN sm.quantite ELSE 0 END
        ),0) AS stock_debut,
        -- Sorties du mois
        COALESCE(SUM(
          CASE WHEN sm.type_mouvement='sortie' ${moisFilter} THEN sm.quantite ELSE 0 END
        ),0) AS sorties_mois,
        -- Entrées du mois (hors report)
        COALESCE(SUM(
          CASE WHEN sm.type_mouvement='entree' AND sm.motif!='Report solde mois précédent' ${moisFilter} THEN sm.quantite ELSE 0 END
        ),0) AS entrees_mois,
        -- Solde fin = début + entrées - sorties
        COALESCE(SUM(
          CASE WHEN sm.type_mouvement='entree' ${moisFilter} THEN sm.quantite
               WHEN sm.type_mouvement='sortie' ${moisFilter} THEN -sm.quantite ELSE 0 END
        ),0) AS solde_fin,
        COALESCE(SUM(
          CASE WHEN sm.type_mouvement='entree' THEN sm.quantite
               WHEN sm.type_mouvement='sortie' THEN -sm.quantite ELSE 0 END
        ),0) * sa.prix_unitaire_ht AS valeur_stock_ht
      FROM stocks_articles sa
      LEFT JOIN stocks_mouvements sm ON sm.article_id=sa.id
      WHERE sa.actif=true
      GROUP BY sa.id, sa.code, sa.libelle, sa.unite, sa.classe, sa.seuil_alerte, sa.prix_unitaire_ht
      ORDER BY sa.classe, sa.libelle
    `, params);
    res.json(rows);
  } catch(err) { console.error('[SOLDES]',err.message); res.status(500).json({message:err.message}); }
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

// GET /api/stocks/mouvements/resume — vue agrégée par article (comme le fichier Excel)
router.get('/mouvements/resume', auth, async (req, res) => {
  try {
    const {mois, classe} = req.query;
    const params = [];
    let whereClause = 'WHERE sa.actif=true';
    if (classe && classe!=='all') { params.push(parseInt(classe)); whereClause += ` AND sa.classe=$${params.length}`; }

    // Construire filtre mois pour les mouvements
    let moisFilter = '';
    if (mois) { params.push(mois); moisFilter = `AND TO_CHAR(sm.date_mouvement,'YYYY-MM')=$${params.length}`; }

    const q = `
      SELECT
        ROW_NUMBER() OVER (ORDER BY sa.classe, sa.libelle) AS num,
        sa.code,
        sa.libelle,
        sa.unite,
        sa.prix_unitaire_ht AS prix_ht,
        sa.classe,
        COALESCE(SUM(CASE WHEN sm.type_mouvement='entree' AND sm.motif='Report solde mois précédent' ${moisFilter} THEN sm.quantite ELSE 0 END),0) AS stock_debut,
        COALESCE(SUM(CASE WHEN sm.type_mouvement='sortie' ${moisFilter} THEN sm.quantite ELSE 0 END),0) AS sorties,
        COALESCE(SUM(CASE WHEN sm.type_mouvement='entree' AND sm.motif!='Report solde mois précédent' ${moisFilter} THEN sm.quantite ELSE 0 END),0) AS entrees,
        COALESCE(SUM(CASE WHEN sm.type_mouvement='entree' ${moisFilter} THEN sm.quantite ELSE 0 END),0) -
        COALESCE(SUM(CASE WHEN sm.type_mouvement='sortie' ${moisFilter} THEN sm.quantite ELSE 0 END),0) AS solde_fin,
        (COALESCE(SUM(CASE WHEN sm.type_mouvement='entree' ${moisFilter} THEN sm.quantite ELSE 0 END),0) -
         COALESCE(SUM(CASE WHEN sm.type_mouvement='sortie' ${moisFilter} THEN sm.quantite ELSE 0 END),0)) * sa.prix_unitaire_ht AS valeur_ht
      FROM stocks_articles sa
      LEFT JOIN stocks_mouvements sm ON sm.article_id=sa.id
      ${whereClause}
      GROUP BY sa.id, sa.code, sa.libelle, sa.unite, sa.prix_unitaire_ht, sa.classe
      ORDER BY sa.classe, sa.libelle
    `;
    const {rows} = await pool.query(q, params);
    res.json(rows);
  } catch(err) { console.error('[STOCKS RESUME]',err.message); res.status(500).json({message:err.message}); }
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

// PUT /api/stocks/articles/:id — modifier article (DG)
router.put('/articles/:id', auth, role(DG), async (req, res) => {
  try {
    const {libelle, unite, seuil_alerte} = req.body;
    await pool.query(
      `UPDATE stocks_articles SET libelle=$1, unite=$2, seuil_alerte=$3 WHERE id=$4`,
      [libelle, unite, seuil_alerte, req.params.id]
    );
    res.json({message:'Article modifié ✓'});
  } catch(err) { res.status(500).json({message:err.message}); }
});

// DELETE /api/stocks/articles/:id — supprimer article (DG)
router.delete('/articles/:id', auth, role(DG), async (req, res) => {
  try {
    await pool.query(`UPDATE stocks_articles SET actif=false WHERE id=$1`,[req.params.id]);
    res.json({message:'Article supprimé ✓'});
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
