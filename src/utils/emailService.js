/**
 * Service d'envoi email automatique — SINEX SA
 */
const nodemailer = require('nodemailer');

function creerTransport(config) {
  return nodemailer.createTransport({
    host:   config.smtp_host   || 'smtp.gmail.com',
    port:   parseInt(config.smtp_port || 587),
    secure: config.smtp_port === '465',
    auth: {
      user: config.smtp_user,
      pass: config.smtp_pass,
    },
    tls: { rejectUnauthorized: false }
  });
}

async function envoyerRapport({ config, pdfBuffer, excelBuffer, type_rapport, mois, dgNom }) {
  const transporter = creerTransport(config);

  const moisLabel = new Date(mois+'-01').toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  const sujet = (config.objet_email||'Rapport {mois} SINEX SA')
    .replace('{mois}',moisLabel).replace('{type}',type_rapport);
  const corps = (config.message_email||'Bonjour,\n\nVeuillez trouver ci-joint le rapport de production SINEX SA.\n\nCordialement,\n{dg}')
    .replace('{dg}',dgNom||'Boumzina Raïna').replace('{mois}',moisLabel);

  const destinataires = [];
  const DEST_DEF = {
    dg:  'dg@sinex-sa.tg',
    pdg: 'pdg@ceco.tg',
    pca: 'pca@sinex-sa.tg',
  };
  (config.destinataires||['dg']).forEach(d=>{
    if(DEST_DEF[d]) destinataires.push(DEST_DEF[d]);
  });
  if(config.emails_supplementaires){
    config.emails_supplementaires.split(',').forEach(e=>{
      const t=e.trim(); if(t) destinataires.push(t);
    });
  }
  if(!destinataires.length) throw new Error('Aucun destinataire configuré');

  const attachments = [];
  if(pdfBuffer) attachments.push({
    filename: `SINEX_${type_rapport}_${mois}.pdf`,
    content: pdfBuffer, contentType: 'application/pdf'
  });
  if(excelBuffer) attachments.push({
    filename: `SINEX_${type_rapport}_${mois}.xlsx`,
    content: excelBuffer,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  await transporter.sendMail({
    from: `"SINEX SA Dashboard" <${config.smtp_user}>`,
    to:   destinataires.join(', '),
    subject: sujet,
    text:    corps,
    html:    corps.replace(/\n/g,'<br>'),
    attachments,
  });
  return { destinataires, sujet };
}

async function testerConnexion(config) {
  const transporter = creerTransport(config);
  await transporter.verify();
  return true;
}

module.exports = { envoyerRapport, testerConnexion };
