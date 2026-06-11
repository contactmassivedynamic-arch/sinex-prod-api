const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

const DG = 'directeur_general';

// GET /api/tresorerie/soldes
router.get('/soldes', auth, async (req, res) => {
  try {
    const {rows} = await pool.query(`
      SELECT c.id, c.code, c.libelle, c.type_compte, c.banque,
        COALESCE(SUM(
          CASE WHEN m.sens='credit' THEN m.montant_fcfa
               WHEN m.sens='debit'  THEN -m.montant_fcfa ELSE 0 END
        ),0) AS solde_fcfa
      FROM comptes_tresorerie c
      LEFT JOIN tresorerie_mouvements m ON m.compte_id=c.id
      WHERE c.actif=true
      GROUP BY c.id, c.code, c.libelle, c.type_compte, c.banque
      ORDER BY c.type_compte DESC, c.libelle
    `);
    res.json(rows);
  } catch(err) { res.status(500).json({message:'Erreur serveur'}); }
});

// GET /api/tresorerie/mouvements — avec filtres mois + sens + compte
router.get('/mouvements', auth, async (req, res) => {
  try {
    const {mois, type, compte_id, annee} = req.query;
    let q = `
      SELECT m.id, m.sens, m.montant_fcfa, m.date_mouvement,
        m.description, m.type_operation, m.created_at,
        c.libelle AS compte_libelle, c.code AS compte_code, c.type_compte,
        u.nom_complet AS saisi_par_nom,
        SUM(CASE WHEN m2.sens='credit' THEN m2.montant_fcfa WHEN m2.sens='debit' THEN -m2.montant_fcfa ELSE 0 END)
          OVER (PARTITION BY m.compte_id ORDER BY m.date_mouvement, m.id) AS solde_apres
      FROM tresorerie_mouvements m
      JOIN comptes_tresorerie c ON c.id=m.compte_id
      LEFT JOIN utilisateurs u ON u.id=m.saisi_par_id
      LEFT JOIN tresorerie_mouvements m2 ON m2.compte_id=m.compte_id
        AND (m2.date_mouvement < m.date_mouvement OR (m2.date_mouvement=m.date_mouvement AND m2.id<=m.id))
      WHERE 1=1
    `;
    const params = [];
    if (mois) { params.push(mois); q += ` AND TO_CHAR(m.date_mouvement,'YYYY-MM')=$${params.length}`; }
    if (annee) { params.push(annee); q += ` AND TO_CHAR(m.date_mouvement,'YYYY')=$${params.length}`; }
    if (type && type!=='all') { params.push(type); q += ` AND m.sens=$${params.length}`; }
    if (compte_id && compte_id!=='all') { params.push(compte_id); q += ` AND m.compte_id=$${params.length}`; }
    q += ` ORDER BY m.date_mouvement DESC, m.id DESC`;
    const {rows} = await pool.query(q, params);
    res.json(rows);
  } catch(err) { res.status(500).json({message:'Erreur serveur'}); }
});

// POST /api/tresorerie/mouvements — ajouter
router.post('/mouvements', auth, async (req, res) => {
  try {
    const {compte_id, sens, montant_fcfa, date_mouvement, description, type_operation} = req.body;
    await pool.query(
      `INSERT INTO tresorerie_mouvements (compte_id,sens,montant_fcfa,date_mouvement,description,type_operation,saisi_par_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [compte_id, sens, montant_fcfa, date_mouvement||new Date(), description||'', type_operation||'autre', req.user.id]
    );
    res.status(201).json({message:'Mouvement enregistré ✓'});
  } catch(err) { res.status(500).json({message:err.message}); }
});

// PUT /api/tresorerie/mouvements/:id — modifier (DG uniquement)
router.put('/mouvements/:id', auth, role(DG), async (req, res) => {
  try {
    const {sens, montant_fcfa, date_mouvement, description, type_operation} = req.body;
    await pool.query(
      `UPDATE tresorerie_mouvements SET sens=$1,montant_fcfa=$2,date_mouvement=$3,description=$4,type_operation=$5 WHERE id=$6`,
      [sens, montant_fcfa, date_mouvement, description, type_operation, req.params.id]
    );
    res.json({message:'Mouvement modifié ✓'});
  } catch(err) { res.status(500).json({message:err.message}); }
});

// DELETE /api/tresorerie/mouvements/:id — supprimer (DG uniquement)
router.delete('/tresorerie/mouvements/:id', auth, role(DG), async (req, res) => {
  try {
    await pool.query(`DELETE FROM tresorerie_mouvements WHERE id=$1`,[req.params.id]);
    res.json({message:'Mouvement supprimé ✓'});
  } catch(err) { res.status(500).json({message:err.message}); }
});

// GET /api/tresorerie/flux — flux mensuels pour graphiques
router.get('/flux', auth, async (req, res) => {
  try {
    const annee = req.query.annee || new Date().getFullYear();
    const {rows} = await pool.query(`
      SELECT TO_CHAR(date_mouvement,'YYYY-MM') AS mois,
        COALESCE(SUM(CASE WHEN sens='credit' THEN montant_fcfa ELSE 0 END),0) AS entrees,
        COALESCE(SUM(CASE WHEN sens='debit'  THEN montant_fcfa ELSE 0 END),0) AS sorties
      FROM tresorerie_mouvements
      WHERE TO_CHAR(date_mouvement,'YYYY')=$1
      GROUP BY mois ORDER BY mois
    `,[String(annee)]);
    res.json(rows);
  } catch(err) { res.status(500).json({message:'Erreur serveur'}); }
});

module.exports = router;
