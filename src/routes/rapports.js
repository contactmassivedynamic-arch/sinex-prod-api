const router  = require('express').Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const { genererExcel, genererPDF } = require('../utils/rapportGenerateur');
const formules = require('../utils/formules');

router.get('/', auth, async (req, res) => {
  try {
    const {mois} = req.query;
    let q = `SELECT r.id,r.type_rapport,r.titre,r.periode_debut,r.genere_le,r.statut_envoi,
      u.nom_complet AS genere_par_nom FROM rapports r
      LEFT JOIN utilisateurs u ON u.id=r.genere_par_id WHERE 1=1`;
    const params=[];
    if (mois && mois!=='all') { params.push(mois); q+=` AND r.periode_debut=$${params.length}`; }
    q+=` ORDER BY r.genere_le DESC`;
    const {rows} = await pool.query(q, params);
    res.json(rows);
  } catch(err) { res.status(500).json({message:'Erreur serveur'}); }
});

router.post('/generer', auth, async (req, res) => {
  try {
    const {type_rapport, format, mois} = req.body;
    const moisRap = mois || new Date().toISOString().slice(0,7);
    let donnees = {};

    // ── Données production ──
    if (['production','rebuts'].includes(type_rapport)) {
      const {rows:saisies} = await pool.query(
        `SELECT pj.*,u.nom_complet AS saisi_par_nom,
          COALESCE(json_object_agg(fp.code,lp.cartons_produits) FILTER (WHERE fp.code IS NOT NULL),'{}') AS prods,
          COALESCE(json_build_object('pref32',COALESCE(r.pref32,0),'pref17',COALESCE(r.pref17,0),
            'bouchons',COALESCE(r.bouchons,0),'ctn_c12',COALESCE(r.ctn_c12,0),
            'ctn_c24',COALESCE(r.ctn_c24,0),'hilio',COALESCE(r.hilio_rebut,0),
            'etiquettes',COALESCE(r.etiquettes,0)),'{}') AS rebuts_data
         FROM productions_jour pj
         LEFT JOIN utilisateurs u ON u.id=pj.saisi_par
         LEFT JOIN lignes_production lp ON lp.production_id=pj.id
         LEFT JOIN formats_produits fp ON fp.id=lp.format_id
         LEFT JOIN rebuts r ON r.production_id=pj.id
         WHERE TO_CHAR(pj.date_production,'YYYY-MM')=$1
         GROUP BY pj.id,u.nom_complet,r.pref32,r.pref17,r.bouchons,r.ctn_c12,r.ctn_c24,r.hilio_rebut,r.etiquettes
         ORDER BY pj.date_production`, [moisRap]
      );
      donnees.saisies = saisies.map(s=>({
        ...s, c12:s.prods?.C12||0, c24:s.prods?.C24||0,
        f615:s.prods?.F615||0, f605:s.prods?.F605||0,
        f61:s.prods?.F61||0, hilio:s.prods?.HILIO||0,
        rebuts: s.rebuts_data,
      }));
      const valides = donnees.saisies.filter(s=>s.statut==='valide');
      donnees.totaux = {
        c12:valides.reduce((a,s)=>a+(s.c12||0),0),
        c24:valides.reduce((a,s)=>a+(s.c24||0),0),
        f615:valides.reduce((a,s)=>a+(s.f615||0),0),
        f605:valides.reduce((a,s)=>a+(s.f605||0),0),
        f61:valides.reduce((a,s)=>a+(s.f61||0),0),
        hilio:valides.reduce((a,s)=>a+(s.hilio||0),0),
      };
      // Consommations cumulées
      const consCum={}, rebCum={};
      valides.forEach(s=>{
        const prods={C12:s.c12,C24:s.c24,F615:s.f615,F605:s.f605,F61:s.f61,HILIO:s.hilio};
        const conso=formules.calcConsommations(prods);
        Object.entries(conso).forEach(([k,v])=>{consCum[k]=(consCum[k]||0)+v;});
        if (s.rebuts) {
          rebCum.PREF_32G=(rebCum.PREF_32G||0)+(s.rebuts.pref32||0);
          rebCum.PREF_17G=(rebCum.PREF_17G||0)+(s.rebuts.pref17||0);
          rebCum.BOUCH_VERT=(rebCum.BOUCH_VERT||0)+(s.rebuts.bouchons||0);
          rebCum.CTN_15L=(rebCum.CTN_15L||0)+(s.rebuts.ctn_c12||0);
          rebCum.CTN_05L=(rebCum.CTN_05L||0)+(s.rebuts.ctn_c24||0);
          rebCum.ETI_15L=(rebCum.ETI_15L||0)+(s.rebuts.etiquettes||0);
        }
      });
      donnees.consommations_cumulees=consCum;
      donnees.rebuts_cumules=rebCum;
      // Rebuts pour rapport rebuts
      donnees.rebuts=valides.flatMap(s=>[
        {date:s.date_production,intrant:'Préformes 32g',quantite:s.rebuts?.pref32||0,prix:53,valeur:(s.rebuts?.pref32||0)*53},
        {date:s.date_production,intrant:'Préformes 17g',quantite:s.rebuts?.pref17||0,prix:28,valeur:(s.rebuts?.pref17||0)*28},
        {date:s.date_production,intrant:'Bouchons',quantite:s.rebuts?.bouchons||0,prix:5,valeur:(s.rebuts?.bouchons||0)*5},
        {date:s.date_production,intrant:'Cartons C12',quantite:s.rebuts?.ctn_c12||0,prix:233,valeur:(s.rebuts?.ctn_c12||0)*233},
        {date:s.date_production,intrant:'Cartons C24',quantite:s.rebuts?.ctn_c24||0,prix:200,valeur:(s.rebuts?.ctn_c24||0)*200},
        {date:s.date_production,intrant:'Étiquettes',quantite:s.rebuts?.etiquettes||0,prix:9,valeur:(s.rebuts?.etiquettes||0)*9},
      ]).filter(r=>r.quantite>0);
    }

    // ── Données ATP ──
    if (type_rapport==='atp') {
      const {rows:atpRows} = await pool.query(`SELECT * FROM atp WHERE periode=$1`,[moisRap]);
      donnees.atp = atpRows[0]||{};
      const {rows:objRows} = await pool.query(
        `SELECT code_produit,quantite FROM atp_objectifs WHERE atp_id=$1`,[donnees.atp.id||0]
      ).catch(()=>({rows:[]}));
      donnees.objectifs={C12:0,C24:0,F615:0,F605:0,F61:0,HILIO:0};
      objRows.forEach(r=>{donnees.objectifs[r.code_produit]=parseFloat(r.quantite||0);});
      const {rows:realRows} = await pool.query(
        `SELECT fp.code,COALESCE(SUM(lp.cartons_produits),0) AS q FROM lignes_production lp
         JOIN formats_produits fp ON fp.id=lp.format_id JOIN productions_jour pj ON pj.id=lp.production_id
         WHERE TO_CHAR(pj.date_production,'YYYY-MM')=$1 AND pj.statut='valide' GROUP BY fp.code`,[moisRap]
      );
      donnees.realisations={C12:0,C24:0,F615:0,F605:0,F61:0,HILIO:0};
      realRows.forEach(r=>{donnees.realisations[r.code]=parseFloat(r.q||0);});
      donnees.charges=donnees.atp.charges_indirectes||{};
      donnees.totalCI=Object.values(donnees.charges).reduce((s,v)=>s+parseFloat(v||0),0);
    }

    // ── Données stocks ──
    if (type_rapport==='stocks') {
      const {rows:articles} = await pool.query(`
        SELECT sa.*,
          COALESCE(SUM(CASE WHEN sm.type_mouvement='entree' THEN sm.quantite
            WHEN sm.type_mouvement='sortie' THEN -sm.quantite ELSE 0 END),0) AS stock_actuel,
          COALESCE(SUM(CASE WHEN sm.type_mouvement='entree' THEN sm.quantite
            WHEN sm.type_mouvement='sortie' THEN -sm.quantite ELSE 0 END),0)*sa.prix_unitaire_ht AS valeur_stock_ht
        FROM stocks_articles sa
        LEFT JOIN stocks_mouvements sm ON sm.article_id=sa.id
        WHERE sa.actif=true GROUP BY sa.id ORDER BY sa.classe,sa.libelle`
      );
      donnees.articles=articles;
      const {rows:mvts} = await pool.query(`
        SELECT sm.*,sa.libelle AS article_libelle,sa.code AS article_code,sa.unite,sa.classe,
          sm.quantite*sa.prix_unitaire_ht AS valeur_ht,u.nom_complet AS saisi_par_nom
        FROM stocks_mouvements sm JOIN stocks_articles sa ON sa.id=sm.article_id
        LEFT JOIN utilisateurs u ON u.id=sm.saisi_par_id
        WHERE TO_CHAR(sm.date_mouvement,'YYYY-MM')=$1 ORDER BY sm.date_mouvement DESC`,[moisRap]
      );
      donnees.mouvements=mvts;
    }

    // ── Données trésorerie ──
    if (type_rapport==='tresorerie') {
      const {rows:comptes} = await pool.query(`
        SELECT c.*,COALESCE(SUM(CASE WHEN m.sens='credit' THEN m.montant_fcfa
          WHEN m.sens='debit' THEN -m.montant_fcfa ELSE 0 END),0) AS solde_fcfa
        FROM comptes_tresorerie c LEFT JOIN tresorerie_mouvements m ON m.compte_id=c.id
        WHERE c.actif=true GROUP BY c.id ORDER BY c.type_compte DESC,c.libelle`
      );
      donnees.comptes=comptes;
      const {rows:mvts} = await pool.query(`
        SELECT m.*,c.libelle AS compte_libelle,u.nom_complet AS saisi_par_nom,
          SUM(CASE WHEN m2.sens='credit' THEN m2.montant_fcfa WHEN m2.sens='debit' THEN -m2.montant_fcfa ELSE 0 END)
            OVER (PARTITION BY m.compte_id ORDER BY m.date_mouvement,m.id) AS solde_apres
        FROM tresorerie_mouvements m JOIN comptes_tresorerie c ON c.id=m.compte_id
        LEFT JOIN utilisateurs u ON u.id=m.saisi_par_id
        LEFT JOIN tresorerie_mouvements m2 ON m2.compte_id=m.compte_id
          AND (m2.date_mouvement<m.date_mouvement OR (m2.date_mouvement=m.date_mouvement AND m2.id<=m.id))
        WHERE TO_CHAR(m.date_mouvement,'YYYY-MM')=$1 ORDER BY m.date_mouvement DESC,m.id DESC`,[moisRap]
      );
      donnees.mouvements=mvts;
    }

    // ── Récupérer nom DG ──
    try {
      const {rows:dgRows} = await pool.query(
        `SELECT nom_complet FROM utilisateurs WHERE id=$1`,[req.user.id]
      );
      donnees.dg_nom = dgRows[0]?.nom_complet || req.user.nom_complet || 'Boumzina Raïna';
    } catch { donnees.dg_nom = 'Boumzina Raïna'; }

    // ── Générer fichier ──
    let buffer, contentType, fileName;
    if (format==='Excel'||format==='excel') {
      buffer = await genererExcel(type_rapport, donnees, moisRap);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      fileName = `SINEX_${type_rapport}_${moisRap}.xlsx`;
    } else {
      buffer = await genererPDF(type_rapport, donnees, moisRap);
      contentType = 'application/pdf';
      fileName = `SINEX_${type_rapport}_${moisRap}.pdf`;
    }

    // Historique
    pool.query(
      `INSERT INTO rapports (type_rapport,titre,periode_debut,genere_par_id,statut_envoi)
       VALUES ($1,$2,$3,$4,'genere')`,
      [type_rapport,`Rapport ${type_rapport} ${moisRap}`,moisRap,req.user.id]
    ).catch(()=>{});

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);

  } catch(err) {
    console.error('[RAPPORTS]',err);
    res.status(500).json({message:err.message||'Erreur génération rapport'});
  }
});

module.exports = router;
