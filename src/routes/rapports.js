const router  = require('express').Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const { genererExcel, genererPDF } = require('../utils/rapportGenerateur');

// GET /api/rapports — lister les rapports générés
router.get('/', auth, async (req, res) => {
  try {
    const {mois} = req.query;
    let q = `
      SELECT r.id, r.type_rapport, r.titre, r.periode_debut, r.periode_fin,
        r.genere_le, r.statut_envoi, u.nom_complet AS genere_par_nom
      FROM rapports r
      LEFT JOIN utilisateurs u ON u.id=r.genere_par_id
      WHERE 1=1
    `;
    const params = [];
    if (mois && mois !== 'all') {
      params.push(mois);
      q += ` AND r.periode_debut=$${params.length}`;
    }
    q += ` ORDER BY r.genere_le DESC`;
    const {rows} = await pool.query(q, params);
    res.json(rows);
  } catch(err) { res.status(500).json({message:'Erreur serveur'}); }
});

// POST /api/rapports/generer — générer et télécharger un rapport
router.post('/generer', auth, async (req, res) => {
  try {
    const {type_rapport, format, mois} = req.body;
    const moisRap = mois || new Date().toISOString().slice(0,7);

    // Récupérer les données selon le type
    let donnees = {};

    if (type_rapport === 'production' || type_rapport === 'rebuts') {
      const {rows:saisies} = await pool.query(
        `SELECT pj.*, u.nom_complet AS saisi_par_nom,
          COALESCE(json_object_agg(fp.code,lp.cartons_produits) FILTER (WHERE fp.code IS NOT NULL),'{}') AS prods,
          COALESCE(json_build_object('pref32',COALESCE(r.pref32,0),'pref17',COALESCE(r.pref17,0),
            'bouchons',COALESCE(r.bouchons,0),'ctn_c12',COALESCE(r.ctn_c12,0),
            'ctn_c24',COALESCE(r.ctn_c24,0),'hilio',COALESCE(r.hilio_rebut,0),
            'etiquettes',COALESCE(r.etiquettes,0)),'{}') AS rebuts
         FROM productions_jour pj
         LEFT JOIN utilisateurs u ON u.id=pj.saisi_par
         LEFT JOIN lignes_production lp ON lp.production_id=pj.id
         LEFT JOIN formats_produits fp ON fp.id=lp.format_id
         LEFT JOIN rebuts r ON r.production_id=pj.id
         WHERE TO_CHAR(pj.date_production,'YYYY-MM')=$1
         GROUP BY pj.id,u.nom_complet,r.pref32,r.pref17,r.bouchons,r.ctn_c12,r.ctn_c24,r.hilio_rebut,r.etiquettes
         ORDER BY pj.date_production`,
        [moisRap]
      );
      donnees.saisies = saisies.map(s=>({
        ...s,
        c12:s.prods?.C12||0, c24:s.prods?.C24||0,
        f615:s.prods?.F615||0, f605:s.prods?.F605||0,
        f61:s.prods?.F61||0, hilio:s.prods?.HILIO||0,
      }));
      donnees.totaux = {
        c12:  donnees.saisies.filter(s=>s.statut==='valide').reduce((a,s)=>a+(s.c12||0),0),
        c24:  donnees.saisies.filter(s=>s.statut==='valide').reduce((a,s)=>a+(s.c24||0),0),
        f615: donnees.saisies.filter(s=>s.statut==='valide').reduce((a,s)=>a+(s.f615||0),0),
        f605: donnees.saisies.filter(s=>s.statut==='valide').reduce((a,s)=>a+(s.f605||0),0),
        f61:  donnees.saisies.filter(s=>s.statut==='valide').reduce((a,s)=>a+(s.f61||0),0),
        hilio:donnees.saisies.filter(s=>s.statut==='valide').reduce((a,s)=>a+(s.hilio||0),0),
      };
      if (type_rapport === 'rebuts') {
        donnees.rebuts = donnees.saisies.flatMap(s=>[
          {date:s.date_production,intrant:'Préformes 32g',   quantite:s.rebuts?.pref32||0,   valeur:(s.rebuts?.pref32||0)*53},
          {date:s.date_production,intrant:'Préformes 17g',   quantite:s.rebuts?.pref17||0,   valeur:(s.rebuts?.pref17||0)*28},
          {date:s.date_production,intrant:'Bouchons',        quantite:s.rebuts?.bouchons||0, valeur:(s.rebuts?.bouchons||0)*5},
          {date:s.date_production,intrant:'Cartons C12',     quantite:s.rebuts?.ctn_c12||0,  valeur:(s.rebuts?.ctn_c12||0)*233},
          {date:s.date_production,intrant:'Cartons C24',     quantite:s.rebuts?.ctn_c24||0,  valeur:(s.rebuts?.ctn_c24||0)*200},
          {date:s.date_production,intrant:'Étiquettes',      quantite:s.rebuts?.etiquettes||0,valeur:(s.rebuts?.etiquettes||0)*9},
        ]).filter(r=>r.quantite>0);
      }
    }

    if (type_rapport === 'atp') {
      const {rows:atpRows} = await pool.query(`SELECT * FROM atp WHERE periode=$1`,[moisRap]);
      donnees.atp = atpRows[0] || {};
    }

    if (type_rapport === 'stocks') {
      const {rows:articles} = await pool.query(`
        SELECT sa.*, COALESCE(SUM(
          CASE WHEN sm.type_mouvement='entree' THEN sm.quantite
               WHEN sm.type_mouvement='sortie' THEN -sm.quantite ELSE 0 END),0) AS stock_actuel,
          COALESCE(SUM(CASE WHEN sm.type_mouvement='entree' THEN sm.quantite
               WHEN sm.type_mouvement='sortie' THEN -sm.quantite ELSE 0 END),0)*sa.prix_unitaire_ht AS valeur_stock_ht
        FROM stocks_articles sa
        LEFT JOIN stocks_mouvements sm ON sm.article_id=sa.id
        WHERE sa.actif=true
        GROUP BY sa.id ORDER BY sa.classe,sa.libelle
      `);
      donnees.articles = articles;
    }

    // Générer le fichier
    let buffer, contentType, fileName;

    if (format === 'Excel' || format === 'excel') {
      buffer = await genererExcel(type_rapport, donnees, moisRap);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      fileName = `SINEX_${type_rapport}_${moisRap}.xlsx`;
    } else {
      buffer = await genererPDF(type_rapport, donnees, moisRap);
      contentType = 'application/pdf';
      fileName = `SINEX_${type_rapport}_${moisRap}.pdf`;
    }

    // Enregistrer dans l'historique
    try {
      await pool.query(
        `INSERT INTO rapports (type_rapport, titre, periode_debut, genere_par_id, statut_envoi)
         VALUES ($1,$2,$3,$4,'genere')`,
        [type_rapport, `Rapport ${type_rapport} ${moisRap}`, moisRap, req.user.id]
      );
    } catch { /* ok si erreur */ }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);

  } catch(err) {
    console.error('[RAPPORTS GENERER]', err);
    res.status(500).json({message: err.message || 'Erreur génération rapport'});
  }
});

// GET /api/rapports/:id/telecharger
router.get('/:id/telecharger', auth, async (req, res) => {
  try {
    const {rows} = await pool.query(`SELECT * FROM rapports WHERE id=$1`,[req.params.id]);
    if (!rows[0]) return res.status(404).json({message:'Rapport introuvable'});
    res.json({message:'Rapport disponible', rapport: rows[0]});
  } catch(err) { res.status(500).json({message:'Erreur serveur'}); }
});

module.exports = router;
