const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

const DG = 'directeur_general';

// GET /api/utilisateurs — liste tous les utilisateurs (DG uniquement)
router.get('/', auth, role(DG), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.nom_complet, u.email, u.actif, u.created_at, u.derniere_connexion, r.nom AS nom_role
       FROM utilisateurs u JOIN roles r ON r.id = u.role_id
       ORDER BY u.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/utilisateurs — créer un utilisateur (DG uniquement)
router.post('/', auth, role(DG), async (req, res) => {
  try {
    const { nom_complet, email, nom_role, mot_de_passe } = req.body;
    if (!nom_complet || !email || !nom_role || !mot_de_passe)
      return res.status(400).json({ message: 'Tous les champs sont requis' });
    if (mot_de_passe.length < 8)
      return res.status(400).json({ message: 'Mot de passe : minimum 8 caractères' });

    // Vérifier unicité email
    const { rows: ex } = await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [email.toLowerCase()]);
    if (ex.length > 0) return res.status(409).json({ message: 'Cet email est déjà utilisé' });

    // Récupérer l'id du rôle
    const { rows: roles } = await pool.query('SELECT id FROM roles WHERE nom = $1', [nom_role]);
    if (!roles[0]) return res.status(400).json({ message: 'Rôle invalide' });

    const hash = await bcrypt.hash(mot_de_passe, 12);
    const { rows } = await pool.query(
      `INSERT INTO utilisateurs (nom_complet, email, role_id, mot_de_passe, actif)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, nom_complet, email, actif, created_at`,
      [nom_complet, email.toLowerCase(), roles[0].id, hash]
    );
    res.status(201).json({ message: 'Utilisateur créé avec succès', utilisateur: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/utilisateurs/:id — modifier nom, email, rôle, actif (DG uniquement)
router.put('/:id', auth, role(DG), async (req, res) => {
  try {
    const { id } = req.params;
    const { nom_complet, email, nom_role, actif } = req.body;

    // Construire la requête dynamiquement
    const updates = [];
    const values  = [];
    let idx = 1;

    if (nom_complet !== undefined) { updates.push(`nom_complet = $${idx++}`); values.push(nom_complet); }
    if (email       !== undefined) { updates.push(`email = $${idx++}`);       values.push(email.toLowerCase()); }
    if (actif       !== undefined) { updates.push(`actif = $${idx++}`);       values.push(actif); }

    if (nom_role !== undefined) {
      const { rows: roles } = await pool.query('SELECT id FROM roles WHERE nom = $1', [nom_role]);
      if (!roles[0]) return res.status(400).json({ message: 'Rôle invalide' });
      updates.push(`role_id = $${idx++}`);
      values.push(roles[0].id);
    }

    if (updates.length === 0) return res.status(400).json({ message: 'Aucune modification fournie' });

    values.push(id);
    await pool.query(`UPDATE utilisateurs SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    res.json({ message: 'Utilisateur modifié avec succès' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/utilisateurs/:id/mot-de-passe — changer le mot de passe (DG uniquement)
router.put('/:id/mot-de-passe', auth, role(DG), async (req, res) => {
  try {
    const { mot_de_passe } = req.body;
    if (!mot_de_passe || mot_de_passe.length < 8)
      return res.status(400).json({ message: 'Minimum 8 caractères' });

    const hash = await bcrypt.hash(mot_de_passe, 12);
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1 WHERE id = $2', [hash, req.params.id]);
    res.json({ message: 'Mot de passe modifié avec succès' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /api/utilisateurs/:id — supprimer (DG uniquement)
router.delete('/:id', auth, role(DG), async (req, res) => {
  try {
    // Empêcher la suppression du compte DG connecté
    if (req.params.id === String(req.user.id))
      return res.status(400).json({ message: 'Impossible de supprimer votre propre compte' });

    await pool.query('DELETE FROM utilisateurs WHERE id = $1', [req.params.id]);
    res.json({ message: 'Utilisateur supprimé' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
