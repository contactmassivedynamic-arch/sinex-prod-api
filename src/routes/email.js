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
        resend_api_key=COALESCE($1,resend_api_key),
        destinataires=$2, emails_supplementaires=$3,
        objet_email=$4, message_email=$5, actif=$6, frequence=$7`,
      [resend_api_key||null,
       JSON.stringify(destinataires||['dg']),
       emails_supplementaires||'',
       objet_email||'Rapport {type} {mois} — SINEX SA',
       message_email||'Bonjour,\n\nVeuillez trouver ci-joint le rapport.\n\nCordialement,\n{dg}',
       actif||false, frequence||'mensuel']
    );
    res.json({message:'Configuration sauvegardée ✓'});
  } catch(e) { console.error('[CONFIG ERROR]', e.message, e.detail||''); res.status(500).json({message:e.message}); }
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
    const { type_rapport, mois } = req.body;
    const moisRap = mois || new Date().toISOString().slice(0,7);

    const { rows: cfg } = await pool.query('SELECT * FROM config_email_rapports WHERE id=1').catch(()=>({rows:[]}));
    if (!cfg[0]) return res.status(400).json({message:'Configuration email non trouvée'});

    const resend = getResend(cfg[0]);
    const config = cfg[0];

    // Destinataires
    const destinataires = [];
    const destList = Array.isArray(config.destinataires)
      ? config.destinataires
      : JSON.parse(config.destinataires||'["dg"]');
    destList.forEach(d => { if(DEST_DEF[d]) destinataires.push(DEST_DEF[d]); });
    if (config.emails_supplementaires) {
      config.emails_supplementaires.split(',').forEach(e => { const t=e.trim(); if(t) destinataires.push(t); });
    }
    if (!destinataires.length) destinataires.push('boumzinaraina@gmail.com');
    console.log('[RESEND] Envoi vers:', destinataires.join(', '));

    // Nom DG
    const { rows: dg } = await pool.query(
      `SELECT u.nom_complet FROM utilisateurs u LEFT JOIN roles r ON r.id=u.role_id
       WHERE u.email='dg@sinex-sa.tg' OR r.nom_role='directeur_general' LIMIT 1`
    ).catch(()=>({rows:[]}));
    const dgNom = dg[0]?.nom_complet || 'Boumzina Raïna';

    // Générer données et rapports
    const donnees = { dg_nom:dgNom, saisies:[], totaux:{c12:0,c24:0,f615:0,f605:0,f61:0,hilio:0}, consommations_cumulees:{}, rebuts_cumules:{}, rebuts:[] };
    try {
      const { rows: pj } = await pool.query(`SELECT id,date_production,statut,jours_ouvres FROM productions_jour WHERE TO_CHAR(date_production,'YYYY-MM')=$1`,[moisRap]);
      for (const p of pj) {
        const { rows: lg } = await pool.query(`SELECT fp.code,lp.cartons_produits FROM lignes_production lp JOIN formats_produits fp ON fp.id=lp.format_id WHERE lp.production_id=$1`,[p.id]);
        const prods={}; lg.forEach(l=>{prods[l.code]=parseInt(l.cartons_produits)||0;});
        donnees.saisies.push({date_production:p.date_production instanceof Date?p.date_production.toISOString().slice(0,10):String(p.date_production).slice(0,10),statut:p.statut,jours_ouvres:p.jours_ouvres,c12:prods.C12||0,c24:prods.C24||0,f615:prods.F615||0,f605:prods.F605||0,f61:prods.F61||0,hilio:prods.HILIO||0,rebuts:{pref32:0,pref17:0,bouchons:0,ctn_c12:0,ctn_c24:0,hilio:0,etiquettes:0},saisi_par_nom:'Opérateur'});
      }
      const v=donnees.saisies.filter(s=>s.statut==='valide');
      donnees.totaux={c12:v.reduce((a,s)=>a+s.c12,0),c24:v.reduce((a,s)=>a+s.c24,0),f615:v.reduce((a,s)=>a+s.f615,0),f605:v.reduce((a,s)=>a+s.f605,0),f61:v.reduce((a,s)=>a+s.f61,0),hilio:v.reduce((a,s)=>a+s.hilio,0)};
    } catch(e) { console.error('[ENVOYER getData]', e.message); }

    const type = type_rapport || 'production';
    const [pdfBuffer, excelBuffer] = await Promise.all([
      genererPDF(type, donnees, moisRap).catch(e=>{console.error('[PDF]',e.message);return null;}),
      genererExcel(type, donnees, moisRap).catch(e=>{console.error('[XL]',e.message);return null;}),
    ]);

    const moisLabel = new Date(moisRap+'-01').toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
    const sujet = (config.objet_email||'Rapport {type} {mois} — SINEX SA')
      .replace('{type}',type).replace('{mois}',moisLabel);
    const corps = (config.message_email||'Bonjour,\n\nVeuillez trouver ci-joint le rapport.\n\nCordialement,\n{dg}')
      .replace('{dg}',dgNom).replace('{mois}',moisLabel);

    const attachments = [];
    if (pdfBuffer) attachments.push({filename:`SINEX_${type}_${moisRap}.pdf`, content:pdfBuffer.toString('base64')});
    if (excelBuffer) attachments.push({filename:`SINEX_${type}_${moisRap}.xlsx`, content:excelBuffer.toString('base64')});

    const result = await resend.emails.send({
      from: 'SINEX SA Dashboard <dashboard@sinex-sa.com>',
      to: destinataires,
      subject: sujet,
      text: corps,
      html: '<p>'+corps.split('\n').join('<br>')+'</p>',
      attachments,
    });

    if (result.error) throw new Error(result.error.message);
    console.log('[RESEND] Email envoyé:', result.data?.id, '→', destinataires.join(', '));

    await pool.query(`INSERT INTO rapports (type_rapport,titre,periode_debut,genere_par_id,statut_envoi) VALUES ($1,$2,$3,$4,'envoye')`,
      [type,`Rapport envoyé — ${moisRap}`,moisRap,req.user.id]).catch(()=>{});

    res.json({message:`Email envoyé ✓ — ${destinataires.length} destinataire(s)`, destinataires});
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
