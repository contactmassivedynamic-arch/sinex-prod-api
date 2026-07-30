const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

const DG = 'directeur_general';

const ROLES_VALIDES = [
  'directeur_general','operateur','pdg','pca','conseil_admin'
];

// GET /api/utilisateurs
router.get('/', auth, role(DG), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nom_complet, email, role, actif, created_at
       FROM utilisateurs
       ORDER BY created_at DESC`
    );
    // Normaliser nom_role pour le frontend
    res.json(rows.map(u => ({ ...u, nom_role: u.role })));
  } catch (err) {
    console.error('[UTILISATEURS GET]', err.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/utilisateurs
router.post('/', auth, role(DG), async (req, res) => {
  try {
    const { nom_complet, email, nom_role, mot_de_passe } = req.body;
    if (!nom_complet || !email || !nom_role || !mot_de_passe)
      return res.status(400).json({ message: 'Tous les champs sont requis' });
    if (mot_de_passe.length < 8)
      return res.status(400).json({ message: 'Mot de passe : minimum 8 caractères' });
    if (!ROLES_VALIDES.includes(nom_role))
      return res.status(400).json({ message: `Rôle invalide. Valeurs acceptées : ${ROLES_VALIDES.join(', ')}` });

    const { rows: ex } = await pool.query('SELECT id FROM utilisateurs WHERE email=$1', [email.toLowerCase()]);
    if (ex.length > 0) return res.status(409).json({ message: 'Cet email est déjà utilisé' });

    const hash = await bcrypt.hash(mot_de_passe, 12);
    const { rows } = await pool.query(
      `INSERT INTO utilisateurs (nom_complet, email, role, mot_de_passe, actif)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, nom_complet, email, role, actif, created_at`,
      [nom_complet, email.toLowerCase(), nom_role, hash]
    );
    res.status(201).json({ message: 'Utilisateur créé ✓', utilisateur: { ...rows[0], nom_role: rows[0].role } });
  } catch (err) {
    console.error('[UTILISATEURS POST]', err.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/utilisateurs/:id
router.put('/:id', auth, role(DG), async (req, res) => {
  try {
    const { id } = req.params;
    const { nom_complet, email, nom_role, actif } = req.body;

    const updates = []; const values = []; let idx = 1;

    if (nom_complet !== undefined) { updates.push(`nom_complet=$${idx++}`); values.push(nom_complet); }
    if (email !== undefined)       { updates.push(`email=$${idx++}`);       values.push(email.toLowerCase()); }
    if (actif !== undefined)       { updates.push(`actif=$${idx++}`);       values.push(actif); }
    if (nom_role !== undefined) {
      if (!ROLES_VALIDES.includes(nom_role))
        return res.status(400).json({ message: 'Rôle invalide' });
      updates.push(`role=$${idx++}`); values.push(nom_role);
    }

    if (updates.length === 0) return res.status(400).json({ message: 'Aucune modification fournie' });

    values.push(id);
    await pool.query(`UPDATE utilisateurs SET ${updates.join(',')} WHERE id=$${idx}`, values);
    res.json({ message: 'Utilisateur modifié ✓' });
  } catch (err) {
    console.error('[UTILISATEURS PUT]', err.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/utilisateurs/:id/mot-de-passe
router.put('/:id/mot-de-passe', auth, role(DG), async (req, res) => {
  try {
    const { mot_de_passe } = req.body;
    if (!mot_de_passe || mot_de_passe.length < 8)
      return res.status(400).json({ message: 'Minimum 8 caractères' });
    const hash = await bcrypt.hash(mot_de_passe, 12);
    await pool.query('UPDATE utilisateurs SET mot_de_passe=$1 WHERE id=$2', [hash, req.params.id]);
    res.json({ message: 'Mot de passe modifié ✓' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /api/utilisateurs/:id
router.delete('/:id', auth, role(DG), async (req, res) => {
  try {
    if (req.params.id === String(req.user.id))
      return res.status(400).json({ message: 'Impossible de supprimer votre propre compte' });
    await pool.query('DELETE FROM utilisateurs WHERE id=$1', [req.params.id]);
    res.json({ message: 'Utilisateur supprimé ✓' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
