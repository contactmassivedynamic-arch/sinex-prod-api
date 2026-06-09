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
    text: corps,
    html: '<div style="font-family:Arial,sans-serif">' +
          '<h2 style="color:#0891B2">SINEX SA</h2>' +
          '<p>' + corps.split('\n').join('<br>') + '</p>' +
          '<hr><p style="color:#64748B;font-size:11px">Rapport automatique — SINEX SA</p>' +
          '</div>',
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
