const router   = require('express').Router();
const pool     = require('../db/pool');
const auth     = require('../middleware/auth');
const { genererExcel, genererPDF } = require('../utils/rapportGenerateur');
const formules = require('../utils/formules');

// Mapping code produit sécurisé
const mapCode = (code) => {
  const m = {'C12':'c12','C24':'c24','F615':'f615','F605':'f605','F61':'f61','HILIO':'hilio',
             'c12':'c12','c24':'c24','f615':'f615','f605':'f605','f61':'f61','hilio':'hilio'};
  return m[code] || null;
};

// GET /api/rapports
router.get('/', auth, async (req, res) => {
  try {
    const { mois } = req.query;
    let q = `SELECT r.id, r.type_rapport, r.titre, r.periode_debut, r.genere_le,
      r.statut_envoi, u.nom_complet AS genere_par_nom
      FROM rapports r LEFT JOIN utilisateurs u ON u.id=r.genere_par_id WHERE 1=1`;
    const params = [];
    if (mois && mois !== 'all') { params.push(mois); q += ` AND r.periode_debut=$${params.length}`; }
    q += ` ORDER BY r.genere_le DESC`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch(err) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// POST /api/rapports/generer
router.post('/generer', auth, async (req, res) => {
  try {
    const { type_rapport, format, mois } = req.body;
    const moisRap = mois || new Date().toISOString().slice(0, 7);
    let donnees = {};

    // Nom DG
    try {
      const { rows: dg } = await pool.query(
        `SELECT nom_complet FROM utilisateurs WHERE id=$1`, [req.user.id]
      );
      donnees.dg_nom = dg[0]?.nom_complet || 'Boumzina Raïna';
    } catch { donnees.dg_nom = 'Boumzina Raïna'; }

    // ── PRODUCTION & REBUTS ──────────────────────
    if (['production', 'rebuts'].includes(type_rapport)) {
      let pjRows = [];
      try {
        const r = await pool.query(
          `SELECT id, date_production, statut, jours_ouvres
           FROM productions_jour
           WHERE TO_CHAR(date_production, 'YYYY-MM') = $1
           ORDER BY date_production`, [moisRap]
        );
        pjRows = r.rows;
      } catch(e) {
        console.error('[RAPPORT] Erreur SELECT productions_jour:', e.message);
        pjRows = [];
      }

      const saisies = [];
      for (const pj of pjRows) {
        let prods = {c12:0,c24:0,f615:0,f605:0,f61:0,hilio:0};
        let rebuts = {pref32:0,pref17:0,bouchons:0,ctn_c12:0,ctn_c24:0,hilio:0,etiquettes:0};

        try {
          const lr = await pool.query(
            `SELECT fp.code, lp.cartons_produits
             FROM lignes_production lp
             JOIN formats_produits fp ON fp.id = lp.format_id
             WHERE lp.production_id = $1`, [pj.id]
          );
          lr.rows.forEach(l => {
            const k = mapCode(l.code);
            if (k) prods[k] = parseInt(l.cartons_produits) || 0;
          });
        } catch(e) { console.error('[RAPPORT] Erreur lignes_production:', e.message); }

        try {
          const rr = await pool.query(
            `SELECT pref32, pref17, bouchons, ctn_c12, ctn_c24, hilio_rebut, etiquettes
             FROM rebuts WHERE production_id = $1`, [pj.id]
          );
          if (rr.rows[0]) {
            const rb = rr.rows[0];
            rebuts = {
              pref32:     parseInt(rb.pref32)      || 0,
              pref17:     parseInt(rb.pref17)      || 0,
              bouchons:   parseInt(rb.bouchons)    || 0,
              ctn_c12:    parseInt(rb.ctn_c12)     || 0,
              ctn_c24:    parseInt(rb.ctn_c24)     || 0,
              hilio:      parseInt(rb.hilio_rebut) || 0,
              etiquettes: parseInt(rb.etiquettes)  || 0,
            };
          }
        } catch(e) { console.error('[RAPPORT] Erreur rebuts:', e.message); }

        saisies.push({
          date_production: pj.date_production instanceof Date ? pj.date_production.toISOString().slice(0,10) : String(pj.date_production).slice(0,10),
          statut:          pj.statut,
          jours_ouvres:    pj.jours_ouvres,
          saisi_par_nom:   'Opérateur',
          c12:   prods.c12,
          c24:   prods.c24,
          f615:  prods.f615,
          f605:  prods.f605,
          f61:   prods.f61,
          hilio: prods.hilio,
          rebuts,
        });
      }

      donnees.saisies = saisies;
      const valides = saisies.filter(s => s.statut === 'valide');

      donnees.totaux = {
        c12:   valides.reduce((a, s) => a + s.c12,   0),
        c24:   valides.reduce((a, s) => a + s.c24,   0),
        f615:  valides.reduce((a, s) => a + s.f615,  0),
        f605:  valides.reduce((a, s) => a + s.f605,  0),
        f61:   valides.reduce((a, s) => a + s.f61,   0),
        hilio: valides.reduce((a, s) => a + s.hilio, 0),
      };

      const consCum = {}, rebCum = {};
      valides.forEach(s => {
        try {
          const conso = formules.calcConsommations({
            C12: s.c12, C24: s.c24, F615: s.f615,
            F605: s.f605, F61: s.f61, HILIO: s.hilio,
          });
          Object.entries(conso).forEach(([k, v]) => { consCum[k] = (consCum[k] || 0) + v; });
        } catch(e) { console.error('[RAPPORT] Erreur calcConsommations:', e.message); }

        rebCum.PREF_32G   = (rebCum.PREF_32G   || 0) + s.rebuts.pref32;
        rebCum.PREF_17G   = (rebCum.PREF_17G   || 0) + s.rebuts.pref17;
        rebCum.BOUCH_VERT = (rebCum.BOUCH_VERT || 0) + s.rebuts.bouchons;
        rebCum.CTN_15L    = (rebCum.CTN_15L    || 0) + s.rebuts.ctn_c12;
        rebCum.CTN_05L    = (rebCum.CTN_05L    || 0) + s.rebuts.ctn_c24;
        rebCum.ETI_15L    = (rebCum.ETI_15L    || 0) + s.rebuts.etiquettes;
      });
      donnees.consommations_cumulees = consCum;
      donnees.rebuts_cumules = rebCum;

      donnees.rebuts = valides.flatMap(s => [
        { date: s.date_production, intrant: 'Préformes 32g',  quantite: s.rebuts.pref32,     prix: 53,  valeur: s.rebuts.pref32     * 53  },
        { date: s.date_production, intrant: 'Préformes 17g',  quantite: s.rebuts.pref17,     prix: 28,  valeur: s.rebuts.pref17     * 28  },
        { date: s.date_production, intrant: 'Bouchons',       quantite: s.rebuts.bouchons,   prix: 5,   valeur: s.rebuts.bouchons   * 5   },
        { date: s.date_production, intrant: 'Cartons C12',    quantite: s.rebuts.ctn_c12,    prix: 233, valeur: s.rebuts.ctn_c12    * 233 },
        { date: s.date_production, intrant: 'Cartons C24',    quantite: s.rebuts.ctn_c24,    prix: 200, valeur: s.rebuts.ctn_c24    * 200 },
        { date: s.date_production, intrant: 'Étiquettes',     quantite: s.rebuts.etiquettes, prix: 9,   valeur: s.rebuts.etiquettes * 9   },
      ]).filter(r => r.quantite > 0);
    }

    // ── ATP ─────────────────────────────────────
    if (type_rapport === 'atp') {
      try {
        const { rows: atpRows } = await pool.query(`SELECT * FROM atp WHERE periode=$1`, [moisRap]);
        donnees.atp = atpRows[0] || {};
        if (donnees.atp.id) {
          const { rows: objRows } = await pool.query(
            `SELECT code_produit, quantite FROM atp_objectifs WHERE atp_id=$1`, [donnees.atp.id]
          ).catch(() => ({ rows: [] }));
          donnees.objectifs = { C12:0, C24:0, F615:0, F605:0, F61:0, HILIO:0 };
          objRows.forEach(r => { donnees.objectifs[r.code_produit] = parseFloat(r.quantite || 0); });
        } else {
          donnees.objectifs = { C12:0, C24:0, F615:0, F605:0, F61:0, HILIO:0 };
        }
        const { rows: realRows } = await pool.query(
          `SELECT fp.code, COALESCE(SUM(lp.cartons_produits),0) AS q
           FROM lignes_production lp
           JOIN formats_produits fp ON fp.id = lp.format_id
           JOIN productions_jour pj ON pj.id = lp.production_id
           WHERE TO_CHAR(pj.date_production,'YYYY-MM')=$1 AND pj.statut='valide'
           GROUP BY fp.code`, [moisRap]
        );
        donnees.realisations = { C12:0, C24:0, F615:0, F605:0, F61:0, HILIO:0 };
        realRows.forEach(r => { donnees.realisations[r.code] = parseFloat(r.q || 0); });
        donnees.charges = donnees.atp.charges_indirectes || {};
        donnees.totalCI = Object.values(donnees.charges).reduce((s, v) => s + parseFloat(v || 0), 0);
      } catch(e) {
        console.error('[RAPPORT ATP]', e.message);
        donnees.atp = {}; donnees.objectifs = {}; donnees.realisations = {}; donnees.charges = {}; donnees.totalCI = 0;
      }
    }

    // ── STOCKS ──────────────────────────────────
    if (type_rapport === 'stocks') {
      try {
        const { rows: articles } = await pool.query(`
          SELECT sa.*,
            COALESCE(SUM(CASE WHEN sm.type_mouvement='entree' THEN sm.quantite
              WHEN sm.type_mouvement='sortie' THEN -sm.quantite ELSE 0 END),0) AS stock_actuel,
            COALESCE(SUM(CASE WHEN sm.type_mouvement='entree' THEN sm.quantite
              WHEN sm.type_mouvement='sortie' THEN -sm.quantite ELSE 0 END),0)*sa.prix_unitaire_ht AS valeur_stock_ht
          FROM stocks_articles sa
          LEFT JOIN stocks_mouvements sm ON sm.article_id=sa.id
          WHERE sa.actif=true GROUP BY sa.id ORDER BY sa.classe,sa.libelle`
        );
        donnees.articles = articles;
        const { rows: mvts } = await pool.query(`
          SELECT sm.*, sa.libelle AS article_libelle, sa.classe,
            sa.unite, sm.quantite*sa.prix_unitaire_ht AS valeur_ht
          FROM stocks_mouvements sm
          JOIN stocks_articles sa ON sa.id=sm.article_id
          WHERE TO_CHAR(sm.date_mouvement,'YYYY-MM')=$1
          ORDER BY sm.date_mouvement DESC`, [moisRap]
        );
        donnees.mouvements = mvts;
      } catch(e) { console.error('[RAPPORT STOCKS]', e.message); donnees.articles=[]; donnees.mouvements=[]; }
    }

    // ── TRÉSORERIE ──────────────────────────────
    if (type_rapport === 'tresorerie') {
      try {
        const { rows: comptes } = await pool.query(`
          SELECT c.*, COALESCE(SUM(CASE WHEN m.sens='credit' THEN m.montant_fcfa
            WHEN m.sens='debit' THEN -m.montant_fcfa ELSE 0 END),0) AS solde_fcfa
          FROM comptes_tresorerie c LEFT JOIN tresorerie_mouvements m ON m.compte_id=c.id
          WHERE c.actif=true GROUP BY c.id ORDER BY c.libelle`
        );
        donnees.comptes = comptes;
        const { rows: mvts } = await pool.query(`
          SELECT m.*, c.libelle AS compte_libelle,
            SUM(CASE WHEN m2.sens='credit' THEN m2.montant_fcfa WHEN m2.sens='debit' THEN -m2.montant_fcfa ELSE 0 END)
              OVER (PARTITION BY m.compte_id ORDER BY m.date_mouvement,m.id) AS solde_apres
          FROM tresorerie_mouvements m
          JOIN comptes_tresorerie c ON c.id=m.compte_id
          LEFT JOIN tresorerie_mouvements m2 ON m2.compte_id=m.compte_id
            AND (m2.date_mouvement<m.date_mouvement OR (m2.date_mouvement=m.date_mouvement AND m2.id<=m.id))
          WHERE TO_CHAR(m.date_mouvement,'YYYY-MM')=$1
          ORDER BY m.date_mouvement DESC,m.id DESC`, [moisRap]
        );
        donnees.mouvements = mvts;
      } catch(e) { console.error('[RAPPORT TRES]', e.message); donnees.comptes=[]; donnees.mouvements=[]; }
    }

    // ── Générer ──────────────────────────────────
    const isExcel = format === 'Excel' || format === 'excel';
    const buffer = isExcel
      ? await genererExcel(type_rapport, donnees, moisRap)
      : await genererPDF(type_rapport, donnees, moisRap);
    const contentType = isExcel
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf';
    const fileName = `SINEX_${type_rapport}_${moisRap}.${isExcel?'xlsx':'pdf'}`;

    pool.query(
      `INSERT INTO rapports (type_rapport,titre,periode_debut,genere_par_id,statut_envoi)
       VALUES ($1,$2,$3,$4,'genere')`,
      [type_rapport, `Rapport ${type_rapport} ${moisRap}`, moisRap, req.user.id]
    ).catch(() => {});

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);

  } catch(err) {
    console.error('[RAPPORTS ERROR]', err.message);
    console.error(err.stack?.split('\n').slice(0,5).join('\n'));
    res.status(500).json({ message: err.message || 'Erreur génération rapport' });
  }
});

// DELETE /api/rapports/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM rapports WHERE id=$1',[req.params.id]);
    res.json({message:'Rapport supprimé ✓'});
  } catch(err) { res.status(500).json({message:'Erreur serveur'}); }
});

// DELETE /api/rapports/historique — vider tout
router.delete('/historique', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM rapports');
    res.json({message:'Historique effacé ✓'});
  } catch(err) { res.status(500).json({message:'Erreur serveur'}); }
});

module.exports = router;
