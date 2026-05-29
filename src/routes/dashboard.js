const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');

// GET /api/dashboard/consolide?mois=2026-05
router.get('/consolide', auth, async (req, res) => {
  try {
    const { mois } = req.query;
    const m = mois || new Date().toISOString().slice(0,7);

    // KPIs production du mois
    const { rows: kpiRows } = await pool.query(
      `SELECT
        COALESCE(SUM(c12),0)   AS c12,
        COALESCE(SUM(c24),0)   AS c24,
        COALESCE(SUM(f615),0)  AS f615,
        COALESCE(SUM(f605),0)  AS f605,
        COALESCE(SUM(f61),0)   AS f61,
        COALESCE(SUM(hilio),0) AS hilio,
        COALESCE(SUM(jours_ouvres),0) AS jours_ouvres
       FROM productions_jour
       WHERE TO_CHAR(date_production,'YYYY-MM')=$1 AND statut='valide'`,
      [m]
    );

    // Évolution 6 mois
    const { rows: evoRows } = await pool.query(
      `SELECT TO_CHAR(date_production,'YYYY-MM') AS mois,
        SUM(c12) AS c12, SUM(c24) AS c24, SUM(hilio) AS hilio
       FROM productions_jour WHERE statut='valide'
       GROUP BY mois ORDER BY mois DESC LIMIT 6`
    );

    // Rebuts du mois
    const { rows: rebutRows } = await pool.query(
      `SELECT
        'Préformes 32g' AS nom, COALESCE(SUM(r.pref32),0) AS quantite FROM rebuts r
        JOIN productions_jour p ON p.id=r.production_id
        WHERE TO_CHAR(p.date_production,'YYYY-MM')=$1 AND p.statut='valide'
       UNION ALL
       SELECT 'Préformes 17g', COALESCE(SUM(r.pref17),0) FROM rebuts r
        JOIN productions_jour p ON p.id=r.production_id
        WHERE TO_CHAR(p.date_production,'YYYY-MM')=$1 AND p.statut='valide'
       UNION ALL
       SELECT 'Bouchons', COALESCE(SUM(r.bouchons),0) FROM rebuts r
        JOIN productions_jour p ON p.id=r.production_id
        WHERE TO_CHAR(p.date_production,'YYYY-MM')=$1 AND p.statut='valide'
       UNION ALL
       SELECT 'Cartons', COALESCE(SUM(r.ctn_c12+r.ctn_c24),0) FROM rebuts r
        JOIN productions_jour p ON p.id=r.production_id
        WHERE TO_CHAR(p.date_production,'YYYY-MM')=$1 AND p.statut='valide'
       UNION ALL
       SELECT 'Étiquettes', COALESCE(SUM(r.etiquettes),0) FROM rebuts r
        JOIN productions_jour p ON p.id=r.production_id
        WHERE TO_CHAR(p.date_production,'YYYY-MM')=$1 AND p.statut='valide'`,
      [m]
    );

    // ATP du mois
    const { rows: atpRows } = await pool.query(
      `SELECT * FROM atp WHERE periode=$1 LIMIT 1`, [m]
    );

    res.json({
      kpis:   kpiRows[0] || {},
      evolution: evoRows.reverse(),
      rebuts: rebutRows,
      atp:    atpRows[0] || null,
      data:   atpRows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
