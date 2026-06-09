/**
 * Service d'envoi email automatique — SINEX SA
 */
const nodemailer = require('nodemailer');

function creerTransport(config) {
  const port = parseInt(config.smtp_port || 465);
  // Gmail : port 465 SSL ou port 587 STARTTLS
  return nodemailer.createTransport({
    host:   config.smtp_host || 'smtp.gmail.com',
    port:   port,
    secure: port === 465,
    auth: {
      user: config.smtp_user,
      pass: config.smtp_pass,
    },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 30000,
    greetingTimeout:   20000,
    socketTimeout:     45000,
  });
}

async function envoyerRapport({ config, pdfBuffer, excelBuffer, type_rapport, mois, dgNom }) {
  console.log('[SMTP] Création transport...');
  const transporter = creerTransport(config);
  console.log('[SMTP] Transport créé, envoi direct...');

  const moisLabel = new Date(mois+'-01').toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  const sujet = (config.objet_email||'Rapport {mois} SINEX SA')
    .replace('{mois}',moisLabel).replace('{type}',type_rapport);
  const corps = (config.message_email||'Bonjour,\n\nVeuillez trouver ci-joint le rapport de production SINEX SA.\n\nCordialement,\n{dg}')
    .replace('{dg}',dgNom||'Boumzina Raïna').replace('{mois}',moisLabel);

  const destinataires = [];
  const DEST_DEF = {
    dg:  'boumzinaraina@gmail.com',
    pdg: 'pdg@ceco.tg',
    pca: 'pca.sinex@gmail.com',
  };
  const destList = Array.isArray(config.destinataires)
    ? config.destinataires
    : (typeof config.destinataires === 'string'
        ? JSON.parse(config.destinataires || '[]')
        : []);

  destList.forEach(d => {
    if(DEST_DEF[d]) destinataires.push(DEST_DEF[d]);
  });
  if(config.emails_supplementaires){
    config.emails_supplementaires.split(',').forEach(e=>{
      const t=e.trim(); if(t) destinataires.push(t);
    });
  }
  // Si toujours vide, envoyer au DG par défaut
  if(!destinataires.length) destinataires.push('dg@sinex-sa.tg');
  console.log('[SMTP] Envoi vers:', destinataires.join(', '));

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
