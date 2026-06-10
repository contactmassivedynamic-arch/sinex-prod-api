const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const { Resend } = require('resend');
const { genererPDF, genererExcel } = require('../utils/rapportGenerateur');

const DG = 'directeur_general';

function getResend(config) {
  const apiKey = process.env.RESEND_API_KEY || config?.resend_api_key;
  if (!apiKey) throw new Error('Clé API Resend manquante — configurez RESEND_API_KEY dans Railway');
  return new Resend(apiKey);
}

const DEST_DEF = {
  dg:  'boumzinaraina@gmail.com',
  pdg: 'pdg@ceco.tg',
  pca: 'pca.sinex@gmail.com',
};

// Charger les données selon le type de rapport
async function chargerDonnees(type, moisRap, dgNom) {
  const d = { dg_nom: dgNom, saisies:[], totaux:{c12:0,c24:0,f615:0,f605:0,f61:0,hilio:0}, consommations_cumulees:{}, rebuts_cumules:{}, rebuts:[] };

  if (['production','rebuts'].includes(type)) {
    try {
      const { rows: pj } = await pool.query(`SELECT id,date_production,statut,jours_ouvres FROM productions_jour WHERE TO_CHAR(date_production,'YYYY-MM')=$1 ORDER BY date_production`,[moisRap]);
      for (const p of pj) {
        const { rows: lg } = await pool.query(`SELECT fp.code,lp.cartons_produits FROM lignes_production lp JOIN formats_produits fp ON fp.id=lp.format_id WHERE lp.production_id=$1`,[p.id]);
        const prods={}; lg.forEach(l=>{prods[l.code]=parseInt(l.cartons_produits)||0;});
        const { rows: rb } = await pool.query(`SELECT * FROM rebuts WHERE production_id=$1`,[p.id]).catch(()=>({rows:[]}));
        const r = rb[0]||{};
        d.saisies.push({
          date_production: p.date_production instanceof Date ? p.date_production.toISOString().slice(0,10) : String(p.date_production).slice(0,10),
          statut:p.statut, jours_ouvres:p.jours_ouvres, saisi_par_nom:'Opérateur',
          c12:prods.C12||0,c24:prods.C24||0,f615:prods.F615||0,f605:prods.F605||0,f61:prods.F61||0,hilio:prods.HILIO||0,
          rebuts:{pref32:parseInt(r.pref32)||0,pref17:parseInt(r.pref17)||0,bouchons:parseInt(r.bouchons)||0,ctn_c12:parseInt(r.ctn_c12)||0,ctn_c24:parseInt(r.ctn_c24)||0,hilio:parseInt(r.hilio_rebut)||0,etiquettes:parseInt(r.etiquettes)||0},
        });
      }
      const v=d.saisies.filter(s=>s.statut==='valide');
      d.totaux={c12:v.reduce((a,s)=>a+s.c12,0),c24:v.reduce((a,s)=>a+s.c24,0),f615:v.reduce((a,s)=>a+s.f615,0),f605:v.reduce((a,s)=>a+s.f605,0),f61:v.reduce((a,s)=>a+s.f61,0),hilio:v.reduce((a,s)=>a+s.hilio,0)};
      v.forEach(s=>{d.rebuts.push({date:s.date_production,intrant:'Préformes 32g',quantite:s.rebuts.pref32,prix:53,valeur:s.rebuts.pref32*53},{date:s.date_production,intrant:'Préformes 17g',quantite:s.rebuts.pref17,prix:28,valeur:s.rebuts.pref17*28});});
      d.rebuts = d.rebuts.filter(r=>r.quantite>0);
    } catch(e) { console.error('[chargerDonnees prod]',e.message); }
  }

  if (type === 'atp') {
    try {
      const { rows: atpR } = await pool.query(`SELECT * FROM atp WHERE periode=$1`,[moisRap]).catch(()=>({rows:[]}));
      const atp = atpR[0]||{};
      const { rows: objR } = await pool.query(`SELECT code_produit,quantite FROM atp_objectifs WHERE atp_id=$1`,[atp.id]).catch(()=>({rows:[]}));
      const { rows: realR } = await pool.query(`SELECT fp.code,COALESCE(SUM(lp.cartons_produits),0) AS q FROM lignes_production lp JOIN formats_produits fp ON fp.id=lp.format_id JOIN productions_jour pj ON pj.id=lp.production_id WHERE TO_CHAR(pj.date_production,'YYYY-MM')=$1 AND pj.statut='valide' GROUP BY fp.code`,[moisRap]).catch(()=>({rows:[]}));
      const objectifs={C12:0,C24:0,F615:0,F605:0,F61:0,HILIO:0};
      objR.forEach(r=>{objectifs[r.code_produit]=parseFloat(r.quantite||0);});
      const realisations={C12:0,C24:0,F615:0,F605:0,F61:0,HILIO:0};
      realR.forEach(r=>{realisations[r.code]=parseFloat(r.q||0);});
      const charges=atp.charges_indirectes||{};
      const totalCI=Object.values(charges).reduce((s,v)=>s+parseFloat(v||0),0);
      d.atp=atp; d.objectifs=objectifs; d.realisations=realisations; d.charges=charges; d.totalCI=totalCI;
    } catch(e) { console.error('[chargerDonnees atp]',e.message); d.atp={}; d.objectifs={}; d.realisations={}; d.charges={}; d.totalCI=0; }
  }

  if (type === 'stocks') {
    try {
      const { rows: arts } = await pool.query(`SELECT sa.*,COALESCE(SUM(CASE WHEN sm.type_mouvement='entree' THEN sm.quantite WHEN sm.type_mouvement='sortie' THEN -sm.quantite ELSE 0 END),0) AS stock_actuel,COALESCE(SUM(CASE WHEN sm.type_mouvement='entree' THEN sm.quantite WHEN sm.type_mouvement='sortie' THEN -sm.quantite ELSE 0 END),0)*sa.prix_unitaire_ht AS valeur_stock_ht FROM stocks_articles sa LEFT JOIN stocks_mouvements sm ON sm.article_id=sa.id WHERE sa.actif=true GROUP BY sa.id ORDER BY sa.classe,sa.libelle`);
      const { rows: mvts } = await pool.query(`SELECT sm.*,sa.libelle AS article_libelle,sa.classe,sa.unite,sm.quantite*sa.prix_unitaire_ht AS valeur_ht FROM stocks_mouvements sm JOIN stocks_articles sa ON sa.id=sm.article_id WHERE TO_CHAR(sm.date_mouvement,'YYYY-MM')=$1 ORDER BY sm.date_mouvement DESC`,[moisRap]);
      d.articles=arts; d.mouvements=mvts;
    } catch(e) { console.error('[chargerDonnees stocks]',e.message); d.articles=[]; d.mouvements=[]; }
  }

  if (type === 'tresorerie') {
    try {
      const { rows: comptes } = await pool.query(`SELECT c.*,COALESCE(SUM(CASE WHEN m.sens='credit' THEN m.montant_fcfa WHEN m.sens='debit' THEN -m.montant_fcfa ELSE 0 END),0) AS solde_fcfa FROM comptes_tresorerie c LEFT JOIN tresorerie_mouvements m ON m.compte_id=c.id WHERE c.actif=true GROUP BY c.id ORDER BY c.libelle`);
      const { rows: mvts } = await pool.query(`SELECT m.*,c.libelle AS compte_libelle,SUM(CASE WHEN m2.sens='credit' THEN m2.montant_fcfa WHEN m2.sens='debit' THEN -m2.montant_fcfa ELSE 0 END) OVER (PARTITION BY m.compte_id ORDER BY m.date_mouvement,m.id) AS solde_apres FROM tresorerie_mouvements m JOIN comptes_tresorerie c ON c.id=m.compte_id LEFT JOIN tresorerie_mouvements m2 ON m2.compte_id=m.compte_id AND (m2.date_mouvement<m.date_mouvement OR (m2.date_mouvement=m.date_mouvement AND m2.id<=m.id)) WHERE TO_CHAR(m.date_mouvement,'YYYY-MM')=$1 ORDER BY m.date_mouvement DESC`,[moisRap]);
      d.comptes=comptes; d.mouvements=mvts;
    } catch(e) { console.error('[chargerDonnees tres]',e.message); d.comptes=[]; d.mouvements=[]; }
  }

  if (type === 'tendances') {
    try {
      const annee=moisRap.slice(0,4);
      const { rows: histR } = await pool.query(`SELECT TO_CHAR(pj.date_production,'YYYY-MM') AS mois,COALESCE(SUM(lp.cartons_produits*CASE fp.code WHEN 'C12' THEN 2116.10 WHEN 'C24' THEN 2033.90 WHEN 'F615' THEN 1032 WHEN 'F605' THEN 429 WHEN 'F61' THEN 1186 WHEN 'HILIO' THEN 169 ELSE 0 END),0) AS ca_ht,COALESCE(SUM(lp.cartons_produits*CASE fp.code WHEN 'C12' THEN 1037 WHEN 'C24' THEN 1136 WHEN 'F615' THEN 450.79 WHEN 'F605' THEN 282.79 WHEN 'F61' THEN 438.79 WHEN 'HILIO' THEN 75.23 ELSE 0 END),0) AS cd_ht FROM productions_jour pj JOIN lignes_production lp ON lp.production_id=pj.id JOIN formats_produits fp ON fp.id=lp.format_id WHERE pj.statut='valide' AND pj.date_production>=NOW()-INTERVAL '12 months' GROUP BY mois ORDER BY mois`);
      d.historique=histR.map(r=>({...r,mb_ht:parseFloat(r.ca_ht||0)-parseFloat(r.cd_ht||0),tmb:parseFloat(r.ca_ht||0)>0?(parseFloat(r.ca_ht||0)-parseFloat(r.cd_ht||0))/parseFloat(r.ca_ht||0):0}));
      const { rows: cred } = await pool.query(`SELECT COALESCE(SUM(montant_fcfa),0) AS total FROM credits WHERE statut='actif'`).catch(()=>({rows:[{total:0}]}));
      d.credits_total=parseFloat(cred[0]?.total||0);
      const { rows: ci } = await pool.query(`SELECT COALESCE(SUM((charges_indirectes->>'salaires')::numeric+(charges_indirectes->>'electricite')::numeric+(charges_indirectes->>'carburant')::numeric+(charges_indirectes->>'loyer')::numeric+(charges_indirectes->>'maintenance')::numeric+(charges_indirectes->>'autres')::numeric),0) AS total FROM atp WHERE periode>=$1`,[annee+'-01']).catch(()=>({rows:[{total:0}]}));
      d.ci_total=parseFloat(ci[0]?.total||0);
      d.vol_moyens={C12:0,C24:0,F615:0,F605:0,F61:0,HILIO:0};
      d.jours_moyens=0; d.stocks_mp=[];
    } catch(e) { console.error('[chargerDonnees tend]',e.message); d.historique=[]; d.credits_total=0; d.ci_total=0; }
  }

  return d;
}

// GET config
router.get('/config', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM config_email_rapports WHERE id=1').catch(()=>({rows:[]}));
    res.json(rows[0]||{});
  } catch { res.json({}); }
});

// POST sauvegarder config
router.post('/config', auth, role(DG), async (req, res) => {
  try {
    const { resend_api_key, destinataires, emails_supplementaires, objet_email, message_email, actif, frequence } = req.body;
    await pool.query(`
      INSERT INTO config_email_rapports (id,resend_api_key,destinataires,emails_supplementaires,objet_email,message_email,actif,frequence)
      VALUES (1,$1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (id) DO UPDATE SET
        resend_api_key=COALESCE(EXCLUDED.resend_api_key,config_email_rapports.resend_api_key),
        destinataires=EXCLUDED.destinataires,
        emails_supplementaires=EXCLUDED.emails_supplementaires,
        objet_email=EXCLUDED.objet_email,
        message_email=EXCLUDED.message_email,
        actif=EXCLUDED.actif,
        frequence=EXCLUDED.frequence`,
      [resend_api_key||null,
       JSON.stringify(destinataires||['dg']),
       emails_supplementaires||'',
       objet_email||'Rapport {type} {mois} — SINEX SA',
       message_email||'Bonjour,\n\nVeuillez trouver ci-joint les rapports.\n\nCordialement,\n{dg}',
       actif||false, frequence||'mensuel']
    );
    res.json({message:'Configuration sauvegardée ✓'});
  } catch(e) { console.error('[CONFIG ERROR]', e.message); res.status(500).json({message:e.message}); }
});

// POST tester
router.post('/tester', auth, role(DG), async (req, res) => {
  try {
    const { rows: cfg } = await pool.query('SELECT * FROM config_email_rapports WHERE id=1').catch(()=>({rows:[]}));
    const resend = getResend(cfg[0]);
    const result = await resend.emails.send({
      from: 'SINEX SA Dashboard <dashboard@sinex-sa.com>',
      to: ['boumzinaraina@gmail.com'],
      subject: 'Test email — SINEX SA Dashboard',
      text: 'Configuration email opérationnelle ✓ — SINEX SA Dashboard',
      html: '<p>Configuration email <strong>opérationnelle ✓</strong> — SINEX SA Dashboard</p>',
    });
    if (result.error) throw new Error(result.error.message);
    console.log('[RESEND TEST] Email envoyé:', result.data?.id);
    res.json({message:'Email de test envoyé ✓ — vérifiez boumzinaraina@gmail.com'});
  } catch(e) {
    console.error('[RESEND TEST ERROR]', e.message);
    res.status(400).json({message:'Erreur: '+e.message});
  }
});

// POST envoyer maintenant
router.post('/envoyer', auth, role(DG), async (req, res) => {
  try {
    const { type_rapport, types_rapport, mois } = req.body;
    const moisRap = mois || new Date().toISOString().slice(0,7);

    const { rows: cfg } = await pool.query('SELECT * FROM config_email_rapports WHERE id=1').catch(()=>({rows:[]}));
    if (!cfg[0]) return res.status(400).json({message:'Configuration email non trouvée'});

    const resend = getResend(cfg[0]);
    const config = cfg[0];

    // Liste des types à envoyer
    const liste = types_rapport || (type_rapport ? [type_rapport] : ['production']);
    const types = Array.isArray(liste) ? liste : [liste];
    console.log('[ENVOYER] Types:', types.join(', '), '| Mois:', moisRap);

    // Destinataires
    const destinataires = [];
    const destList = Array.isArray(config.destinataires) ? config.destinataires : JSON.parse(config.destinataires||'["dg"]');
    destList.forEach(d => { if(DEST_DEF[d]) destinataires.push(DEST_DEF[d]); });
    if (config.emails_supplementaires) {
      config.emails_supplementaires.split(',').forEach(e => { const t=e.trim(); if(t) destinataires.push(t); });
    }
    if (!destinataires.length) destinataires.push('boumzinaraina@gmail.com');
    console.log('[ENVOYER] Destinataires:', destinataires.join(', '));

    // Nom DG
    const { rows: dg } = await pool.query(`SELECT u.nom_complet FROM utilisateurs u LEFT JOIN roles r ON r.id=u.role_id WHERE u.email='dg@sinex-sa.tg' OR r.nom_role='directeur_general' LIMIT 1`).catch(()=>({rows:[]}));
    const dgNom = dg[0]?.nom_complet || 'Boumzina Raïna';

    // Générer tous les rapports demandés
    const attachments = [];
    for (const type of types) {
      console.log('[ENVOYER] Génération:', type);
      const donnees = await chargerDonnees(type, moisRap, dgNom);
      const [pdfBuf, xlBuf] = await Promise.all([
        genererPDF(type, donnees, moisRap).catch(e=>{console.error('[PDF]',type,e.message);return null;}),
        genererExcel(type, donnees, moisRap).catch(e=>{console.error('[XL]',type,e.message);return null;}),
      ]);
      if (pdfBuf) attachments.push({filename:`SINEX_${type}_${moisRap}.pdf`, content:pdfBuf.toString('base64')});
      if (xlBuf)  attachments.push({filename:`SINEX_${type}_${moisRap}.xlsx`, content:xlBuf.toString('base64')});
      console.log('[ENVOYER]', type, '→', (pdfBuf?'PDF ✓':'PDF ✗'), (xlBuf?'Excel ✓':'Excel ✗'));
    }

    const moisLabel = new Date(moisRap+'-01').toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
    const sujet = `Rapports SINEX SA — ${moisLabel} (${types.length} rapport(s))`;
    const corps = (config.message_email||'Bonjour,\n\nVeuillez trouver ci-joint les rapports SINEX SA.\n\nCordialement,\n{dg}')
      .replace('{dg}',dgNom).replace('{mois}',moisLabel);

    const result = await resend.emails.send({
      from: 'SINEX SA Dashboard <dashboard@sinex-sa.com>',
      to: destinataires,
      subject: sujet,
      text: corps,
      html: '<p>'+corps.split('\n').join('<br>')+'</p><p style="color:#64748B;font-size:12px">'+attachments.length+' pièce(s) jointe(s)</p>',
      attachments,
    });

    if (result.error) throw new Error(result.error.message);
    console.log('[RESEND] Email envoyé:', result.data?.id, '→', attachments.length, 'pièces jointes');

    await pool.query(`INSERT INTO rapports (type_rapport,titre,periode_debut,genere_par_id,statut_envoi) VALUES ($1,$2,$3,$4,'envoye')`,
      [types.join('+'),`Rapports envoyés — ${moisRap}`,moisRap,req.user.id]).catch(()=>{});

    res.json({message:`Email envoyé ✓ — ${types.length} rapport(s), ${attachments.length} pièces jointes`, destinataires});
  } catch(e) {
    console.error('[ENVOYER ERROR]', e.message);
    res.status(500).json({message:e.message});
  }
});

// POST redémarrer crons
router.post('/redemarrer', auth, role(DG), async (req, res) => {
  try {
    const { demarrerCrons } = require('../utils/cronJobs');
    await demarrerCrons();
    res.json({message:'Crons redémarrés ✓'});
  } catch(e) { res.status(500).json({message:e.message}); }
});

module.exports = router;
