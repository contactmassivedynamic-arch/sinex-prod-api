/**
 * Cron jobs — envoi automatique des rapports SINEX SA
 */
const cron = require('node-cron');
const pool = require('../db/pool');
const { genererPDF, genererExcel } = require('./rapportGenerateur');
const { envoyerRapport } = require('./emailService');
const formules = require('./formules');

async function getDonneesProd(moisRap) {
  const donnees = { saisies:[], totaux:{c12:0,c24:0,f615:0,f605:0,f61:0,hilio:0}, consommations_cumulees:{}, rebuts_cumules:{}, rebuts:[], dg_nom:'Boumzina Raïna' };
  try {
    const { rows: dg } = await pool.query(
      `SELECT u.nom_complet FROM utilisateurs u LEFT JOIN roles r ON r.id=u.role_id
       WHERE u.email='dg@sinex-sa.tg' OR r.nom_role='directeur_general' LIMIT 1`
    );
    donnees.dg_nom = dg[0]?.nom_complet || 'Boumzina Raïna';

    const { rows: pj } = await pool.query(
      `SELECT id, date_production, statut, jours_ouvres FROM productions_jour
       WHERE TO_CHAR(date_production,'YYYY-MM')=$1 ORDER BY date_production`, [moisRap]
    );
    for (const p of pj) {
      const { rows: lg } = await pool.query(
        `SELECT fp.code, lp.cartons_produits FROM lignes_production lp
         JOIN formats_produits fp ON fp.id=lp.format_id WHERE lp.production_id=$1`, [p.id]
      );
      const prods = {}; lg.forEach(l => { prods[l.code] = parseInt(l.cartons_produits)||0; });
      donnees.saisies.push({
        date_production: p.date_production instanceof Date ? p.date_production.toISOString().slice(0,10) : String(p.date_production).slice(0,10),
        statut: p.statut, jours_ouvres: p.jours_ouvres,
        c12:prods.C12||0, c24:prods.C24||0, f615:prods.F615||0,
        f605:prods.F605||0, f61:prods.F61||0, hilio:prods.HILIO||0,
        rebuts:{pref32:0,pref17:0,bouchons:0,ctn_c12:0,ctn_c24:0,hilio:0,etiquettes:0},
        saisi_par_nom:'Opérateur',
      });
    }
    const v = donnees.saisies.filter(s=>s.statut==='valide');
    donnees.totaux = {
      c12:v.reduce((a,s)=>a+s.c12,0), c24:v.reduce((a,s)=>a+s.c24,0),
      f615:v.reduce((a,s)=>a+s.f615,0), f605:v.reduce((a,s)=>a+s.f605,0),
      f61:v.reduce((a,s)=>a+s.f61,0), hilio:v.reduce((a,s)=>a+s.hilio,0),
    };
    v.forEach(s => {
      const conso = formules.calcConsommations({C12:s.c12,C24:s.c24,F615:s.f615,F605:s.f605,F61:s.f61,HILIO:s.hilio});
      Object.entries(conso).forEach(([k,v2]) => { donnees.consommations_cumulees[k]=(donnees.consommations_cumulees[k]||0)+v2; });
    });
  } catch(e) { console.error('[CRON getData]', e.message); }
  return donnees;
}

async function envoyerRapportAuto(types, moisRap) {
  try {
    const { rows: cfg } = await pool.query('SELECT * FROM config_email_rapports WHERE id=1').catch(()=>({rows:[]}));
    if (!cfg[0]?.smtp_user || !cfg[0]?.actif) return;
    const config = { ...cfg[0], destinataires: cfg[0].destinataires || ['dg'] };

    for (const type of types) {
      try {
        const donnees = await getDonneesProd(moisRap);
        const [pdfBuffer, excelBuffer] = await Promise.all([
          genererPDF(type, donnees, moisRap).catch(()=>null),
          genererExcel(type, donnees, moisRap).catch(()=>null),
        ]);
        const result = await envoyerRapport({ config, pdfBuffer, excelBuffer, type_rapport:type, mois:moisRap, dgNom:donnees.dg_nom });
        await pool.query(
          `INSERT INTO rapports (type_rapport,titre,periode_debut,statut_envoi) VALUES ($1,$2,$3,'envoye')`,
          [type, `Rapport auto ${type} ${moisRap}`, moisRap]
        ).catch(()=>{});
        console.log(`[CRON] Rapport ${type} envoyé → ${result.destinataires.join(', ')}`);
      } catch(e) { console.error(`[CRON] Erreur envoi ${type}:`, e.message); }
    }
  } catch(e) { console.error('[CRON envoyerRapportAuto]', e.message); }
}

function getMoisPrecedent() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth()-1);
  return d.toISOString().slice(0,7);
}

function getMoisCourant() {
  return new Date().toISOString().slice(0,7);
}

async function demarrerCrons() {
  try {
    const { rows: cfg } = await pool.query('SELECT * FROM config_email_rapports WHERE id=1').catch(()=>({rows:[]}));
    if (!cfg[0]?.actif) { console.log('[CRON] Envoi auto désactivé'); return; }
    const config = cfg[0];
    const types  = Array.isArray(config.types) ? config.types : ['production','atp'];
    const freq   = config.frequence || 'mensuel';

    // Arrêter les anciens jobs
    cron.getTasks().forEach(t => t.stop());

    if (freq === 'quotidien') {
      const [h,m] = (config.heure_quotidien||'07:00').split(':');
      cron.schedule(`${m} ${h} * * *`, async () => {
        console.log('[CRON] Envoi quotidien');
        await envoyerRapportAuto(types, getMoisCourant());
      }, { timezone:'Africa/Lome' });
      console.log(`[CRON] Planifié quotidien à ${config.heure_quotidien}`);

    } else if (freq === 'hebdomadaire') {
      const [h,m] = (config.heure_hebdo||'08:00').split(':');
      const jour  = config.jour_semaine || '1';
      cron.schedule(`${m} ${h} * * ${jour}`, async () => {
        console.log('[CRON] Envoi hebdomadaire');
        await envoyerRapportAuto(types, getMoisCourant());
      }, { timezone:'Africa/Lome' });
      console.log(`[CRON] Planifié hebdomadaire jour ${jour} à ${config.heure_hebdo}`);

    } else {
      // Mensuel — le 28 du mois à l'heure configurée
      const [h,m] = (config.heure_mensuel||'08:00').split(':');
      const jour  = config.jour_mois === 'dernier' ? 'L' : (config.jour_mois || '28');
      cron.schedule(`${m} ${h} ${jour} * *`, async () => {
        console.log('[CRON] Envoi mensuel');
        await envoyerRapportAuto(types, getMoisPrecedent());
      }, { timezone:'Africa/Lome' });
      console.log(`[CRON] Planifié mensuel le ${jour} à ${config.heure_mensuel}`);

      // Fin de mois si activé
      if (config.fin_de_mois) {
        const [hf,mf] = (config.heure_fin_mois||'18:00').split(':');
        cron.schedule(`${mf} ${hf} 28-31 * *`, async () => {
          const today = new Date();
          const lastDay = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
          if (today.getDate() === lastDay) {
            console.log('[CRON] Envoi fin de mois');
            await envoyerRapportAuto(types, getMoisCourant());
          }
        }, { timezone:'Africa/Lome' });
        console.log(`[CRON] Planifié fin de mois à ${config.heure_fin_mois}`);
      }
    }
  } catch(e) { console.error('[CRON demarrerCrons]', e.message); }
}

module.exports = { demarrerCrons, envoyerRapportAuto };
