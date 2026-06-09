/**
 * Service d'envoi email — SINEX SA
 * Via Resend (https://resend.com) — contourne les blocages SMTP de Railway
 */
const { Resend } = require('resend');

const DEST_DEF = {
  dg:  'boumzinaraina@gmail.com',
  pdg: 'pdg@ceco.tg',
  pca: 'pca.sinex@gmail.com',
};

async function envoyerRapport({ config, pdfBuffer, excelBuffer, type_rapport, mois, dgNom }) {
  const apiKey = config.resend_api_key || process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Clé API Resend non configurée');

  const resend = new Resend(apiKey);

  const moisLabel = new Date(mois+'-01').toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  const sujet = (config.objet_email||'Rapport {type} {mois} — SINEX SA')
    .replace('{mois}',moisLabel).replace('{type}',type_rapport).replace('{annee}',mois.slice(0,4));
  const corps = (config.message_email||'Bonjour,\n\nVeuillez trouver ci-joint le rapport.\n\nCordialement,\n{dg}')
    .replace('{dg}',dgNom||'Boumzina Raïna').replace('{mois}',moisLabel);

  // Construire liste destinataires
  const destinataires = [];
  const destList = Array.isArray(config.destinataires)
    ? config.destinataires
    : (typeof config.destinataires === 'string' ? JSON.parse(config.destinataires||'[]') : []);
  destList.forEach(d => { if(DEST_DEF[d]) destinataires.push(DEST_DEF[d]); });
  if (config.emails_supplementaires) {
    config.emails_supplementaires.split(',').forEach(e => { const t=e.trim(); if(t) destinataires.push(t); });
  }
  if (!destinataires.length) destinataires.push('boumzinaraina@gmail.com');
  console.log('[RESEND] Envoi vers:', destinataires.join(', '));

  // Pièces jointes
  const attachments = [];
  if (pdfBuffer) attachments.push({
    filename: `SINEX_${type_rapport}_${mois}.pdf`,
    content: pdfBuffer.toString('base64'),
  });
  if (excelBuffer) attachments.push({
    filename: `SINEX_${type_rapport}_${mois}.xlsx`,
    content: excelBuffer.toString('base64'),
  });

  const result = await resend.emails.send({
    from: 'SINEX SA Dashboard <onboarding@resend.dev>',
    to: destinataires,
    subject: sujet,
    text: corps.replace(/\\n/g,'\n'),
    html: `<div style="font-family:Arial,sans-serif;max-width:600px">`+
          `<div style="background:#0F172A;padding:16px;border-radius:8px 8px 0 0">`+
          `<h2 style="color:#22D3EE;margin:0">SINEX SA — Tableau de bord</h2>`+
          `<p style="color:#94A3B8;margin:4px 0 0">Défalé, Togo</p></div>`+
          `<div style="padding:20px;background:#F8FAFC;border:1px solid #E2E8F0">`+
          `<p>${corps.replace(/\\n/g,'<br>').replace(/
/g,'<br>')}</p>`+
          `<hr style="border-color:#E2E8F0">`+
          `<p style="color:#64748B;font-size:12px">Rapport généré automatiquement — SINEX SA Dashboard</p>`+
          `</div></div>`,
    attachments,
  });

  if (result.error) throw new Error(result.error.message);
  console.log('[RESEND] Email envoyé, id:', result.data?.id);
  return { destinataires, sujet };
}

async function testerConnexion(config) {
  const apiKey = config.resend_api_key || process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Clé API Resend manquante');
  const resend = new Resend(apiKey);
  const r = await resend.emails.send({
    from: 'SINEX SA <onboarding@resend.dev>',
    to: [config.smtp_user || 'boumzinaraina@gmail.com'],
    subject: 'Test configuration email — SINEX SA',
    text: 'Configuration email opérationnelle ✓ — SINEX SA Dashboard',
  });
  if (r.error) throw new Error(r.error.message);
  return true;
}

module.exports = { envoyerRapport, testerConnexion };
