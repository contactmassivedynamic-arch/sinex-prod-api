/**
 * Générateur de rapports PDF et Excel — SINEX-SA
 */
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const COULEURS = {
  cyan:   '0891B2',
  green:  '059669',
  amber:  'D97706',
  red:    'DC2626',
  purple: '7C3AED',
  dark:   '0F172A',
  light:  'F1F5F9',
  white:  'FFFFFF',
  border: 'CBD5E1',
};

// ── EXCEL ────────────────────────────────────────────────

async function genererExcel(type, donnees, mois) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SINEX-SA';
  wb.created = new Date();

  switch(type) {
    case 'production': return genererExcelProduction(wb, donnees, mois);
    case 'atp':        return genererExcelATP(wb, donnees, mois);
    case 'stocks':     return genererExcelStocks(wb, donnees, mois);
    case 'rebuts':     return genererExcelRebuts(wb, donnees, mois);
    default:           return genererExcelProduction(wb, donnees, mois);
  }
}

function styleEntete(row, couleur = COULEURS.cyan) {
  row.eachCell(cell => {
    cell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FF'+couleur}};
    cell.font = {bold:true, color:{argb:'FF'+COULEURS.white}, size:11};
    cell.alignment = {vertical:'middle', horizontal:'center'};
    cell.border = {
      bottom:{style:'medium', color:{argb:'FF'+COULEURS.border}},
    };
  });
  row.height = 22;
}

function styleCellule(cell, opts={}) {
  if (opts.bold)    cell.font = {...(cell.font||{}), bold:true};
  if (opts.couleur) cell.font = {...(cell.font||{}), color:{argb:'FF'+opts.couleur}};
  if (opts.bg)      cell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FF'+opts.bg}};
  if (opts.align)   cell.alignment = {horizontal:opts.align};
  cell.border = {
    top:{style:'thin',color:{argb:'FFCBD5E1'}},
    left:{style:'thin',color:{argb:'FFCBD5E1'}},
    bottom:{style:'thin',color:{argb:'FFCBD5E1'}},
    right:{style:'thin',color:{argb:'FFCBD5E1'}},
  };
}

async function genererExcelProduction(wb, donnees, mois) {
  const ws = wb.addWorksheet('Production');
  ws.columns = [
    {key:'date',  width:15},{key:'c12',  width:10},{key:'c24',  width:10},
    {key:'f615',  width:12},{key:'f605', width:12},{key:'f61',  width:12},
    {key:'hilio', width:10},{key:'jours',width:10},{key:'statut',width:14},
  ];

  // Titre
  ws.mergeCells('A1:I1');
  const titreCell = ws.getCell('A1');
  titreCell.value = `RAPPORT DE PRODUCTION MENSUEL — ${mois}`;
  titreCell.font = {bold:true, size:14, color:{argb:'FF'+COULEURS.cyan}};
  titreCell.alignment = {horizontal:'center'};
  titreCell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FF0F172A'}};
  ws.getRow(1).height = 30;

  ws.mergeCells('A2:I2');
  ws.getCell('A2').value = 'SINEX-SA — Eau Minérale HILIO — Défalé, Togo';
  ws.getCell('A2').alignment = {horizontal:'center'};
  ws.getCell('A2').font = {italic:true, color:{argb:'FF64748B'}};

  // Entêtes
  const entete = ws.addRow(['Date','C12','C24','F6/1,5L','F6/0,5L','F6/1L','HILIO','Jours','Statut']);
  styleEntete(entete);

  // Données
  const saisies = donnees.saisies || [];
  saisies.forEach(s => {
    const row = ws.addRow([
      s.date_production?.slice(0,10)||'—',
      s.c12||0, s.c24||0, s.f615||0, s.f605||0, s.f61||0, s.hilio||0,
      s.jours_ouvres||1,
      s.statut==='valide'?'✓ Validé':'En attente',
    ]);
    if (s.statut==='valide') {
      row.getCell(9).font = {color:{argb:'FF'+COULEURS.green}, bold:true};
    }
    row.eachCell((cell,i) => {
      if (i>1) styleCellule(cell, {align:'center'});
    });
  });

  // Totaux
  ws.addRow([]);
  const totaux = donnees.totaux || {};
  const totRow = ws.addRow(['TOTAUX',totaux.c12||0,totaux.c24||0,totaux.f615||0,totaux.f605||0,totaux.f61||0,totaux.hilio||0,'','']);
  styleEntete(totRow, COULEURS.green);

  return wb.xlsx.writeBuffer();
}

async function genererExcelATP(wb, donnees, mois) {
  const ws = wb.addWorksheet('ATP');
  ws.columns = [{key:'libelle',width:35},{key:'prev',width:18},{key:'reel',width:18},{key:'taux',width:12}];

  ws.mergeCells('A1:D1');
  ws.getCell('A1').value = `RAPPORT FINANCIER ATP — ${mois}`;
  ws.getCell('A1').font = {bold:true, size:14, color:{argb:'FF'+COULEURS.amber}};
  ws.getCell('A1').alignment = {horizontal:'center'};
  ws.getCell('A1').fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF0F172A'}};
  ws.getRow(1).height = 30;

  const entete = ws.addRow(['Indicateur','Prévisionnel (FCFA)','Réalisé (FCFA)','Taux (%)']);
  styleEntete(entete, COULEURS.amber);

  const atp = donnees.atp || {};
  const fmt = n => Math.round(parseFloat(n)||0).toLocaleString('fr-FR');
  const fmtP = n => ((parseFloat(n)||0)*100).toFixed(2)+'%';

  const lignes = [
    ['CAHTP / CAHTR', fmt(atp.proj_ca_ht||0), fmt(atp.real_ca_ht||0), atp.proj_ca_ht>0?((atp.real_ca_ht/atp.proj_ca_ht)*100).toFixed(1)+'%':'—'],
    ['CDHTP / CDHTR', fmt(atp.proj_cd_ht||0), fmt(atp.real_cd_ht||0), ''],
    ['MBHTP / MBHTR', fmt(atp.proj_mb_ht||0), fmt(atp.real_marge_brute_ht||0), ''],
    ['TMBHTP / TMBHTR', fmtP(atp.proj_tmb||0), fmtP(atp.taux_marge_brute||0), ''],
    ['BMF', fmt(atp.bmf_mt||0), '', ''],
    ['Frais de Siège', fmt(atp.fs_mt||0), '', ''],
    ['Amortissement', fmt(atp.amm_mt||0), '', ''],
  ];

  lignes.forEach((l,i) => {
    const row = ws.addRow(l);
    if (i===0) styleCellule(row.getCell(1), {bold:true, bg: COULEURS.light});
    row.eachCell(cell => styleCellule(cell));
  });

  return wb.xlsx.writeBuffer();
}

async function genererExcelStocks(wb, donnees, mois) {
  const ws = wb.addWorksheet('Stocks');
  ws.columns = [
    {key:'libelle',width:35},{key:'code',width:14},{key:'classe',width:10},
    {key:'unite',width:10},{key:'stock',width:14},{key:'prix',width:14},
    {key:'valeur',width:16},{key:'seuil',width:14},{key:'statut',width:12},
  ];

  ws.mergeCells('A1:I1');
  ws.getCell('A1').value = `ÉTAT DES STOCKS — ${mois}`;
  ws.getCell('A1').font = {bold:true,size:14,color:{argb:'FF'+COULEURS.green}};
  ws.getCell('A1').alignment = {horizontal:'center'};
  ws.getCell('A1').fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF0F172A'}};
  ws.getRow(1).height = 30;

  const entete = ws.addRow(['Article','Code','Classe','Unité','Stock actuel','Prix HT','Valeur HT','Seuil alerte','Statut']);
  styleEntete(entete, COULEURS.green);

  const articles = donnees.articles || [];
  articles.forEach(a => {
    const stock = parseFloat(a.stock_actuel||0);
    const statut = stock<=0?'Rupture':a.seuil_alerte&&stock<=a.seuil_alerte?'Faible':'OK';
    const row = ws.addRow([
      a.libelle, a.code, `Classe ${a.classe}`, a.unite,
      Math.round(stock), Math.round(a.prix_unitaire_ht||0),
      Math.round(a.valeur_stock_ht||0), a.seuil_alerte||0, statut,
    ]);
    const couleurStatut = statut==='Rupture'?COULEURS.red:statut==='Faible'?COULEURS.amber:COULEURS.green;
    row.getCell(9).font = {color:{argb:'FF'+couleurStatut}, bold:true};
    row.eachCell(cell => styleCellule(cell));
  });

  return wb.xlsx.writeBuffer();
}

async function genererExcelRebuts(wb, donnees, mois) {
  const ws = wb.addWorksheet('Rebuts');
  ws.columns = [{key:'date',width:14},{key:'intrant',width:25},{key:'qte',width:14},{key:'valeur',width:16}];

  ws.mergeCells('A1:D1');
  ws.getCell('A1').value = `RAPPORT DES REBUTS — ${mois}`;
  ws.getCell('A1').font = {bold:true,size:14,color:{argb:'FF'+COULEURS.red}};
  ws.getCell('A1').alignment = {horizontal:'center'};
  ws.getCell('A1').fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF0F172A'}};
  ws.getRow(1).height = 30;

  const entete = ws.addRow(['Date','Intrant','Quantité','Valeur HT (FCFA)']);
  styleEntete(entete, COULEURS.red);

  const rebuts = donnees.rebuts || [];
  rebuts.forEach(r => {
    const row = ws.addRow([r.date?.slice(0,10)||'—', r.intrant||r.nom||'—', r.quantite||0, Math.round(r.valeur||0)]);
    row.eachCell(cell => styleCellule(cell));
  });

  return wb.xlsx.writeBuffer();
}

// ── PDF ─────────────────────────────────────────────────

async function genererPDF(type, donnees, mois) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({margin:40, size:'A4'});
    const buffers = [];
    doc.on('data', b => buffers.push(b));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // En-tête
    doc.rect(0,0,doc.page.width,70).fill('#0F172A');
    doc.fillColor('#22D3EE').fontSize(18).font('Helvetica-Bold')
       .text('SINEX-SA — Eau Minérale HILIO', 40, 15);
    doc.fillColor('#94A3B8').fontSize(10).font('Helvetica')
       .text(`Défalé, Togo — Rapport généré le ${new Date().toLocaleDateString('fr-FR')}`, 40, 40);

    const titres = {
      production: 'RAPPORT DE PRODUCTION MENSUEL',
      atp:        'RAPPORT FINANCIER ATP',
      stocks:     'ÉTAT DES STOCKS',
      rebuts:     'RAPPORT DES REBUTS',
      tendances:  'ANALYSE DES TENDANCES',
    };

    doc.moveDown(2);
    doc.fillColor('#0891B2').fontSize(16).font('Helvetica-Bold')
       .text(`${titres[type]||'RAPPORT'} — ${mois}`, {align:'center'});
    doc.moveDown();
    doc.moveTo(40,doc.y).lineTo(doc.page.width-40,doc.y).stroke('#CBD5E1');
    doc.moveDown();

    switch(type) {
      case 'production': genererPDFProduction(doc, donnees); break;
      case 'atp':        genererPDFATP(doc, donnees); break;
      case 'stocks':     genererPDFStocks(doc, donnees); break;
      default:           genererPDFProduction(doc, donnees);
    }

    // Pied de page
    doc.moveTo(40,doc.page.height-40).lineTo(doc.page.width-40,doc.page.height-40).stroke('#CBD5E1');
    doc.fillColor('#94A3B8').fontSize(8)
       .text(`SINEX-SA — Confidentiel — ${new Date().toLocaleDateString('fr-FR')}`,
         40, doc.page.height-30, {align:'center'});

    doc.end();
  });
}

function genererPDFProduction(doc, donnees) {
  const saisies = donnees.saisies || [];
  const fmt = n => Math.round(parseFloat(n)||0).toLocaleString('fr-FR');

  doc.fillColor('#334155').fontSize(11).font('Helvetica-Bold').text('Productions journalières');
  doc.moveDown(0.5);

  // Tableau simplifié
  const cols = ['Date','C12','C24','F615','F605','F61','HILIO','Statut'];
  const widths = [80,45,45,45,45,45,45,70];
  let x = 40; const y = doc.y;

  // Entête tableau
  doc.rect(40,y,doc.page.width-80,18).fill('#0891B2');
  cols.forEach((col,i) => {
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold')
       .text(col, x+3, y+4, {width:widths[i]-4});
    x += widths[i];
  });
  doc.moveDown(1.2);

  saisies.slice(0,20).forEach((s,idx) => {
    const rowY = doc.y;
    if (idx%2===0) doc.rect(40,rowY-2,doc.page.width-80,16).fill('#F8FAFC');
    x = 40;
    const vals = [
      s.date_production?.slice(0,10)||'—',
      fmt(s.c12||0), fmt(s.c24||0), fmt(s.f615||0),
      fmt(s.f605||0), fmt(s.f61||0), fmt(s.hilio||0),
      s.statut==='valide'?'✓ Validé':'En attente',
    ];
    vals.forEach((v,i) => {
      const color = i===7&&s.statut==='valide'?'#059669':'#334155';
      doc.fillColor(color).fontSize(8).font('Helvetica').text(v, x+3, rowY, {width:widths[i]-4});
      x += widths[i];
    });
    doc.moveDown(0.8);
  });

  // Totaux
  if (donnees.totaux) {
    doc.moveDown();
    const t = donnees.totaux;
    doc.rect(40,doc.y,doc.page.width-80,20).fill('#059669');
    doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold')
       .text(`TOTAUX : C12=${fmt(t.c12||0)} | C24=${fmt(t.c24||0)} | F615=${fmt(t.f615||0)} | HILIO=${fmt(t.hilio||0)}`,
         45, doc.y+5, {width:doc.page.width-90});
    doc.moveDown(1.5);
  }
}

function genererPDFATP(doc, donnees) {
  const atp = donnees.atp || {};
  const fmt = n => Math.round(parseFloat(n)||0).toLocaleString('fr-FR')+' FCFA';
  const fmtP = n => ((parseFloat(n)||0)*100).toFixed(2)+'%';

  const lignes = [
    ['CAHTP (Prévisionnel)', fmt(atp.proj_ca_ht||0), '#0891B2'],
    ['CAHTR (Réalisé)',      fmt(atp.real_ca_ht||0), '#059669'],
    ['CDHTP (Charges dir. prévi.)', fmt(atp.proj_cd_ht||0), '#DC2626'],
    ['CDHTR (Charges dir. réel)',   fmt(atp.real_cd_ht||0), '#DC2626'],
    ['MBHTP (Marge prévi.)', fmt(atp.proj_mb_ht||0), '#D97706'],
    ['MBHTR (Marge réelle)', fmt(atp.real_marge_brute_ht||0), '#059669'],
    ['TMBHTP', fmtP(atp.proj_tmb||0), '#7C3AED'],
    ['TMBHTR', fmtP(atp.taux_marge_brute||0), '#7C3AED'],
    ['BMF', fmt(atp.bmf_mt||0), '#0891B2'],
    ['Frais de Siège', fmt(atp.fs_mt||0), '#0891B2'],
    ['Amortissement', fmt(atp.amm_mt||0), '#0891B2'],
  ];

  lignes.forEach((l,i) => {
    if (i%2===0) doc.rect(40,doc.y-2,doc.page.width-80,16).fill('#F8FAFC');
    doc.fillColor('#334155').fontSize(10).font('Helvetica-Bold').text(l[0], 45, doc.y, {width:280, continued:true});
    doc.fillColor(l[2]).font('Helvetica').text(l[1], {align:'right'});
    doc.moveDown(0.6);
  });
}

function genererPDFStocks(doc, donnees) {
  const articles = donnees.articles || [];
  const fmt = n => Math.round(parseFloat(n)||0).toLocaleString('fr-FR');
  const classes = [1,2,3];

  classes.forEach(cl => {
    const arts = articles.filter(a=>parseInt(a.classe)===cl);
    if (!arts.length) return;

    doc.fillColor('#334155').fontSize(11).font('Helvetica-Bold')
       .text(`Classe ${cl} — ${cl===1?'Consommables production':cl===2?'EPI & Pièces':'Produits finis'}`);
    doc.moveDown(0.5);

    arts.slice(0,15).forEach((a,i) => {
      const stock = parseFloat(a.stock_actuel||0);
      const statut = stock<=0?'RUPTURE':a.seuil_alerte&&stock<=a.seuil_alerte?'FAIBLE':'OK';
      const color = statut==='RUPTURE'?'#DC2626':statut==='FAIBLE'?'#D97706':'#059669';
      if (i%2===0) doc.rect(40,doc.y-2,doc.page.width-80,14).fill('#F8FAFC');
      doc.fillColor('#334155').fontSize(9).font('Helvetica')
         .text(a.libelle, 45, doc.y, {width:220, continued:true});
      doc.text(`${fmt(stock)} ${a.unite}`, {width:80, continued:true, align:'center'});
      doc.fillColor(color).font('Helvetica-Bold').text(statut, {align:'right'});
      doc.moveDown(0.6);
    });
    doc.moveDown(0.5);
  });
}

module.exports = { genererExcel, genererPDF };
