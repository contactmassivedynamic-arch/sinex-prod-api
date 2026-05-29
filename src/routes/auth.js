const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, mot_de_passe } = req.body;
    if (!email || !mot_de_passe)
      return res.status(400).json({ message: 'Email et mot de passe requis' });

    const { rows } = await pool.query(
      `SELECT u.*, r.nom AS nom_role
       FROM utilisateurs u
       JOIN roles r ON r.id = u.role_id
       WHERE u.email = $1 AND u.actif = true`,
      [email.toLowerCase().trim()]
    );

    const user = rows[0];
    if (!user) return res.status(401).json({ message: 'Email ou mot de passe incorrect' });

    const ok = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
    if (!ok) return res.status(401).json({ message: 'Email ou mot de passe incorrect' });

    // Mettre à jour dernière connexion
    await pool.query('UPDATE utilisateurs SET derniere_connexion = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { id: user.id, email: user.email, nom_role: user.nom_role, nom_complet: user.nom_complet },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      token,
      utilisateur: {
        id:          user.id,
        nom_complet: user.nom_complet,
        email:       user.email,
        nom_role:    user.nom_role,
        role:        user.nom_role,
      }
    });
  } catch (err) {
    console.error('[AUTH] Login error:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/auth/profil
router.get('/profil', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.nom_complet, u.email, u.actif, u.derniere_connexion, r.nom AS nom_role
       FROM utilisateurs u JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Utilisateur introuvable' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
