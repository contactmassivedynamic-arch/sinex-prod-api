const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

const DG = 'directeur_general';

// GET /api/tresorerie/soldes
router.get('/soldes', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT ct.id, ct.libelle, ct.type_compte, ct.banque,
        COALESCE(v.solde_fcfa, 0) AS solde_fcfa,
        MAX(tm.date_mouvement) AS dernier_mouvement
      FROM comptes_tresorerie ct
      LEFT JOIN v_soldes_tresorerie v ON v.compte_id = ct.id
      LEFT JOIN tresorerie_mouvements tm ON tm.compte_id = ct.id
      WHERE ct.actif = true
      GROUP BY ct.id, ct.libelle, ct.type_compte, ct.banque, v.solde_fcfa
      ORDER BY ct.type_compte, ct.libelle
    `);

    const total = rows.reduce((s,c) => s + parseFloat(c.solde_fcfa||0), 0);
    const totalCaisse = rows.filter(c=>c.type_compte==='caisse').reduce((s,c)=>s+parseFloat(c.solde_fcfa||0),0);
    const totalBanque = rows.filter(c=>c.type_compte==='banque').reduce((s,c)=>s+parseFloat(c.solde_fcfa||0),0);

    res.json({
      comptes: rows,
      consolide: { total_consolide: total, total_caisse: totalCaisse, total_banque: totalBanque }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/tresorerie/mouvements
router.get('/mouvements', auth, async (req, res) => {
  try {
    const { compte_id, type } = req.query;
    let q = `
      SELECT tm.*, ct.libelle AS compte_libelle,
        u.nom_complet AS saisi_par,
        CASE WHEN tm.sens = 'credit' THEN 'credit' ELSE 'debit' END AS sens
      FROM tresorerie_mouvements tm
      JOIN comptes_tresorerie ct ON ct.id = tm.compte_id
      LEFT JOIN utilisateurs u ON u.id = tm.saisi_par_id
      WHERE 1=1
    `;
    const params = [];
    if (compte_id) { params.push(compte_id); q += ` AND tm.compte_id = $${params.length}`; }
    if (type && type !== 'all') { params.push(type); q += ` AND tm.sens = $${params.length}`; }
    q += ` ORDER BY tm.date_mouvement DESC LIMIT 200`;
    const { rows } = await pool.query(q, params);

    // Calculer solde cumulé
    let solde = 0;
    const avecSolde = [...rows].reverse().map(m => {
      if (m.sens === 'credit') solde += parseFloat(m.montant_fcfa||0);
      else solde -= parseFloat(m.montant_fcfa||0);
      return { ...m, solde_apres: solde };
    }).reverse();

    res.json(avecSolde);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/tresorerie/mouvements
router.post('/mouvements', auth, async (req, res) => {
  try {
    const { compte_id, sens, montant_fcfa, date_mouvement, description, type_operation } = req.body;
    if (!compte_id || !sens || !montant_fcfa)
      return res.status(400).json({ message: 'Champs requis manquants' });

    await pool.query(
      `INSERT INTO tresorerie_mouvements (compte_id, sens, montant_fcfa, date_mouvement, description, type_operation, saisi_par_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [compte_id, sens, montant_fcfa, date_mouvement||new Date(), description, type_operation||'autre', req.user.id]
    );
    res.status(201).json({ message: 'Mouvement enregistré' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/tresorerie/comptes/:id
router.put('/comptes/:id', auth, role(DG), async (req, res) => {
  try {
    const { solde_initial } = req.body;
    await pool.query('UPDATE comptes_tresorerie SET solde_initial=$1 WHERE id=$2', [solde_initial, req.params.id]);
    res.json({ message: 'Solde mis à jour' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
