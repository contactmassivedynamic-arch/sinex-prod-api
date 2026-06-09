const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

const DG = 'directeur_general';

// GET /api/credits
router.get('/', auth, async (req, res) => {
  try {
    const { categorie } = req.query;
    let q = `SELECT c.*, u.nom_complet AS saisi_par_nom
      FROM credits c LEFT JOIN utilisateurs u ON u.id=c.saisi_par_id
      WHERE c.statut='actif'`;
    const params = [];
    if (categorie && categorie !== 'all') {
      params.push(categorie);
      q += ` AND c.categorie=$${params.length}`;
    }
    q += ` ORDER BY c.date_credit DESC, c.created_at DESC`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch(err) { res.status(500).json({message:'Erreur serveur'}); }
});

// POST /api/credits
router.post('/', auth, role(DG), async (req, res) => {
  try {
    const { categorie, libelle, montant_fcfa, date_echeance, date_credit, beneficiaire, description } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO credits (categorie,libelle,montant_fcfa,date_echeance,date_credit,beneficiaire,description,saisi_par_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [categorie||'autre_credit', libelle, montant_fcfa, date_echeance||null, date_credit||new Date(), beneficiaire||'', description||'', req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch(err) { res.status(500).json({message:err.message}); }
});

// PUT /api/credits/:id
router.put('/:id', auth, role(DG), async (req, res) => {
  try {
    const { categorie, libelle, montant_fcfa, date_echeance, date_credit, beneficiaire, description } = req.body;
    await pool.query(
      `UPDATE credits SET categorie=$1,libelle=$2,montant_fcfa=$3,date_echeance=$4,date_credit=$5,beneficiaire=$6,description=$7 WHERE id=$8`,
      [categorie, libelle, montant_fcfa, date_echeance||null, date_credit, beneficiaire||'', description||'', req.params.id]
    );
    res.json({message:'Crédit modifié ✓'});
  } catch(err) { res.status(500).json({message:err.message}); }
});

// DELETE /api/credits/:id
router.delete('/:id', auth, role(DG), async (req, res) => {
  try {
    await pool.query(`UPDATE credits SET statut='supprime' WHERE id=$1`,[req.params.id]);
    res.json({message:'Crédit supprimé ✓'});
  } catch(err) { res.status(500).json({message:err.message}); }
});

// GET /api/credits/totaux — totaux par catégorie
router.get('/totaux', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT categorie, COUNT(*) AS nombre, SUM(montant_fcfa) AS total
       FROM credits WHERE statut='actif'
       GROUP BY categorie ORDER BY total DESC`
    );
    res.json(rows);
  } catch(err) { res.status(500).json({message:'Erreur serveur'}); }
});

module.exports = router;
