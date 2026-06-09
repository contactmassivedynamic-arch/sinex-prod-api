const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const { envoyerRapport, testerConnexion } = require('../utils/emailService');
const { genererPDF, genererExcel } = require('../utils/rapportGenerateur');
const formules = require('../utils/formules');

const DG = 'directeur_general';

// GET config
router.get('/config', auth, role(DG), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM config_email_rapports WHERE id=1').catch(()=>({rows:[]}));
    res.json(rows[0]||{});
  } catch { res.json({}); }
});

// POST sauvegarder config
router.post('/config', auth, role(DG), async (req, res) => {
  try {
    const { smtp_host, smtp_port, smtp_user, smtp_pass, destinataires, emails_supplementaires, objet_email, message_email, actif, frequence } = req.body;
    await pool.query(`
      INSERT INTO config_email_rapports (id,smtp_host,smtp_port,smtp_user,smtp_pass,destinataires,emails_supplementaires,objet_email,message_email,actif,frequence)
      VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (id) DO UPDATE SET
        smtp_host=$1,smtp_port=$2,smtp_user=$3,smtp_pass=$4,
        destinataires=$5,emails_supplementaires=$6,
        objet_email=$7,message_email=$8,actif=$9,frequence=$10`,
      [smtp_host||'smtp.gmail.com',smtp_port||'587',smtp_user,smtp_pass,
       JSON.stringify(destinataires||['dg']),emails_supplementaires||'',
       objet_email||'Rapport {type} {mois} — SINEX SA',
       message_email||'Bonjour,\n\nVeuillez trouver ci-joint le rapport de production SINEX SA.\n\nCordialement,\n{dg}',
       actif||false, frequence||'mensuel']
    );
    res.json({message:'Configuration sauvegardée ✓'});
  } catch(e) { res.status(500).json({message:e.message}); }
});

// POST tester connexion SMTP
router.post('/tester', auth, role(DG), async (req, res) => {
  try {
    await testerConnexion(req.body);
    res.json({message:'Connexion SMTP OK ✓'});
  } catch(e) { res.status(400).json({message:'Erreur SMTP: '+e.message}); }
});

// POST envoyer maintenant
router.post('/envoyer', auth, role(DG), async (req, res) => {
  try {
    const { type_rapport, mois } = req.body;
    const moisRap = mois || new Date().toISOString().slice(0,7);

    const { rows: cfg } = await pool.query('SELECT * FROM config_email_rapports WHERE id=1').catch(()=>({rows:[]}));
    if (!cfg[0]?.smtp_user) return res.status(400).json({message:'SMTP non configuré'});

    const config = { ...cfg[0], destinataires: cfg[0].destinataires || ['dg'] };

    // Récupérer nom DG
    const { rows: dg } = await pool.query(`SELECT nom_complet FROM utilisateurs WHERE id=$1`,[req.user.id]).catch(()=>({rows:[]}));
    const dgNom = dg[0]?.nom_complet || 'Boumzina Raïna';

    // Générer les rapports
    const donnees = { dg_nom: dgNom, saisies:[], totaux:{c12:0,c24:0,f615:0,f605:0,f61:0,hilio:0}, consommations_cumulees:{}, rebuts_cumules:{}, rebuts:[] };

    // Charger données production basiques
    try {
      const { rows: pj } = await pool.query(`SELECT id,date_production,statut,jours_ouvres FROM productions_jour WHERE TO_CHAR(date_production,'YYYY-MM')=$1 ORDER BY date_production`,[moisRap]);
      for (const p of pj) {
        const { rows: lg } = await pool.query(`SELECT fp.code,lp.cartons_produits FROM lignes_production lp JOIN formats_produits fp ON fp.id=lp.format_id WHERE lp.production_id=$1`,[p.id]);
        const prods = {}; lg.forEach(l=>{prods[l.code]=parseInt(l.cartons_produits)||0;});
        donnees.saisies.push({date_production:p.date_production instanceof Date?p.date_production.toISOString().slice(0,10):String(p.date_production).slice(0,10),statut:p.statut,jours_ouvres:p.jours_ouvres,c12:prods.C12||0,c24:prods.C24||0,f615:prods.F615||0,f605:prods.F605||0,f61:prods.F61||0,hilio:prods.HILIO||0,rebuts:{pref32:0,pref17:0,bouchons:0,ctn_c12:0,ctn_c24:0,hilio:0,etiquettes:0},saisi_par_nom:'Opérateur'});
      }
      const v = donnees.saisies.filter(s=>s.statut==='valide');
      donnees.totaux = {c12:v.reduce((a,s)=>a+s.c12,0),c24:v.reduce((a,s)=>a+s.c24,0),f615:v.reduce((a,s)=>a+s.f615,0),f605:v.reduce((a,s)=>a+s.f605,0),f61:v.reduce((a,s)=>a+s.f61,0),hilio:v.reduce((a,s)=>a+s.hilio,0)};
    } catch {}

    console.log('[EMAIL] Génération PDF/Excel...');
    const [pdfBuffer, excelBuffer] = await Promise.all([
      genererPDF(type_rapport||'production', donnees, moisRap).catch(e=>{console.error('[EMAIL] PDF error:',e.message);return null;}),
      genererExcel(type_rapport||'production', donnees, moisRap).catch(e=>{console.error('[EMAIL] Excel error:',e.message);return null;}),
    ]);
    console.log('[EMAIL] PDF:', pdfBuffer?.length||0, 'bytes | Excel:', excelBuffer?.length||0, 'bytes');
    console.log('[EMAIL] Config SMTP:', config.smtp_host, config.smtp_port, config.smtp_user);
    console.log('[EMAIL] Destinataires:', config.destinataires, config.emails_supplementaires);

    const result = await envoyerRapport({ config, pdfBuffer, excelBuffer, type_rapport:type_rapport||'production', mois:moisRap, dgNom });

    // Enregistrer
    await pool.query(`INSERT INTO rapports (type_rapport,titre,periode_debut,genere_par_id,statut_envoi) VALUES ($1,$2,$3,$4,'envoye')`,
      [type_rapport||'production',`Rapport envoyé par email — ${moisRap}`,moisRap,req.user.id]).catch(()=>{});

    res.json({message:`Email envoyé ✓ — ${result.destinataires.length} destinataire(s)`, destinataires: result.destinataires});
  } catch(e) { res.status(500).json({message:e.message}); }
});

module.exports = router;
