const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');
const { analyserDashboard, analyserRapport } = require('../utils/iaService');

// POST /api/ia/dashboard — analyse IA du dashboard
router.post('/dashboard', auth, async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(400).json({ message: 'Clé API Anthropic non configurée (variable ANTHROPIC_API_KEY)' });
    }
    const { kpis, caMois, caCumule, cpf, mois, atp, stocks_alertes } = req.body;
    const analyse = await analyserDashboard({ kpis, caMois, caCumule, cpf, mois, atp, stocks_alertes });
    res.json({ analyse, mois });
  } catch(err) {
    console.error('[IA DASHBOARD]', err.message);
    res.status(500).json({ message: 'Erreur analyse IA : ' + err.message });
  }
});

// POST /api/ia/rapport — analyse IA d'un rapport
router.post('/rapport', auth, async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(400).json({ message: 'Clé API Anthropic non configurée' });
    }
    const { type_rapport, mois, donnees } = req.body;
    const analyse = await analyserRapport(type_rapport, donnees, mois);
    res.json({ analyse });
  } catch(err) {
    console.error('[IA RAPPORT]', err.message);
    res.status(500).json({ message: 'Erreur analyse IA : ' + err.message });
  }
});

module.exports = router;
