/**
 * Générateur de rapports PDF et Excel — SINEX-SA
 * Design sobre, police agrandie, sections en chiffres romains
 */
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs   = require('fs');
let charts = null;
try { charts = require('./chartGenerator'); } catch(e) { console.warn('[CHARTS] chartGenerator non disponible'); }

const LOGO_PATH = path.join(__dirname, 'logo_sinex.png');
const SIG_PATH  = path.join(__dirname, 'signature_dg.png');

const PRIX_PF = {C12:2116.10,C24:2033.90,F615:1032.00,F605:429.00,F61:1186.00,HILIO:169.00};
const CD_UNIT = {C12:1037,C24:1136,F615:450.79,F605:282.79,F61:438.79,HILIO:75.23};

// Séparateur milliers = espace (pas de virgule ni slash)
const fmt  = n => {
  const v = Math.round(parseFloat(n)||0);
  return v.toLocaleString('fr-FR').replace(/\u202f/g,' ').replace(/\u00a0/g,' ');
};
const fmtP = n => ((parseFloat(n)||0)*100).toFixed(2)+' %';
const fmtD = d => { try{return new Date(d).toLocaleDateString('fr-FR');}catch{return'—';} };
const strDate = d => { try{ return (d instanceof Date ? d : new Date(d)).toISOString().slice(0,10); } catch{return'—';} };

const ROMAINS = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];

// Palette sobre — gris, bleu marine, noir
const C = {
  fond:    '#0F172A', // bleu très foncé
  header:  '#1E293B', // bleu foncé
  section: '#334155', // gris bleu
  accent:  '#475569', // gris moyen
  texte:   '#1E293B', // presque noir
  clair:   '#F8FAFC', // gris très clair
  blanc:   '#FFFFFF',
  bordure: '#CBD5E1', // gris clair
  vert:    '#166534', // vert foncé sobre
  rouge:   '#991B1B', // rouge foncé sobre
  ambre:   '#92400E', // ambre foncé sobre
};

const TITRES = {
  production:'RAPPORT DE PRODUCTION MENSUEL',
  atp:'RAPPORT FINANCIER ATP',
  stocks:'ÉTAT DES STOCKS',
  tresorerie:'RAPPORT DE TRÉSORERIE',
  rebuts:'RAPPORT DES REBUTS',
  tendances:'ANALYSE DES TENDANCES',
};

// ═══════════════════════════════════════════════
// EXCEL
// ═══════════════════════════════════════════════

async function genererExcel(type, donnees, mois) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SINEX-SA'; wb.created = new Date();
  switch(type) {
    case 'production': return xlProduction(wb,donnees,mois);
    case 'atp':        return xlATP(wb,donnees,mois);
    case 'stocks':     return xlStocks(wb,donnees,mois);
    case 'tresorerie': return xlTresorerie(wb,donnees,mois);
    case 'rebuts':     return xlRebuts(wb,donnees,mois);
    case 'tendances':  return xlTendances(wb,donnees,mois);
    default:           return xlProduction(wb,donnees,mois);
  }
}

const colLetter = n => String.fromCharCode(64+Math.min(n,26));

function xlHeader(ws, titre, ncols) {
  ws.mergeCells(`A1:${colLetter(ncols)}3`);
  const c = ws.getCell('A1');
  c.value = 'Société Industrielle d\'Ingénierie et d\'Exploitation (SINEX-SA)\n' +
    'TEL: (+228) 93 88 79 92 / 91 49 25 94  —  ssinex.sa@gmail.com\n' +
    'BP. 7518 Défalé-Niamtougou, Quartier Tamdè (TOGO)';
  c.font = {bold:true, size:11, color:{argb:'FF0F172A'}};
  c.alignment = {horizontal:'center', vertical:'middle', wrapText:true};
  c.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFF1F5F9'}};
  ws.getRow(1).height = 52;
  ws.addRow([]);

  ws.mergeCells(`A5:${colLetter(ncols)}5`);
  const ct = ws.getCell('A5');
  ct.value = titre + '  —  ' + new Date().toLocaleDateString('fr-FR');
  ct.font = {bold:true, size:12, color:{argb:'FFF8FAFC'}};
  ct.alignment = {horizontal:'center', vertical:'middle'};
  ct.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FF0F172A'}};
  ws.getRow(5).height = 24;
  ws.addRow([]);
}

function xlSection(ws, num, titre, ncols) {
  ws.addRow([]);
  ws.mergeCells(`A${ws.rowCount}:${colLetter(ncols)}${ws.rowCount}`);
  const c = ws.getCell(`A${ws.rowCount}`);
  c.value = `${ROMAINS[(num-1)%10]}. ${titre}`;
  c.font = {bold:true, size:11, color:{argb:'FFF8FAFC'}};
  c.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FF1E293B'}};
  c.alignment = {horizontal:'left', indent:1};
  ws.getRow(ws.rowCount).height = 20;
  ws.addRow([]);
}

function xlEntete(ws, labels) {
  const row = ws.addRow(labels);
  row.eachCell(cell => {
    cell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FF334155'}};
    cell.font = {bold:true, color:{argb:'FFF8FAFC'}, size:10};
    cell.alignment = {horizontal:'center', vertical:'middle', wrapText:true};
    cell.border = {bottom:{style:'medium', color:{argb:'FF475569'}}};
  });
  row.height = 22;
}

function xlLigne(ws, vals, opts={}) {
  const row = ws.addRow(vals);
  row.eachCell((cell,i) => {
    cell.border = {
      top:{style:'thin',color:{argb:'FFCBD5E1'}},
      bottom:{style:'thin',color:{argb:'FFCBD5E1'}},
      left:{style:'thin',color:{argb:'FFCBD5E1'}},
      right:{style:'thin',color:{argb:'FFCBD5E1'}},
    };
    if (opts.bold) cell.font = {...(cell.font||{}), bold:true};
    if (opts.bg) cell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FF'+opts.bg.replace('#','')}};
    if (opts.color) cell.font = {...(cell.font||{}), color:{argb:'FF'+opts.color.replace('#','')}};
    cell.font = {...(cell.font||{}), size:10};
  });
  return row;
}

function xlSignature(ws, dgNom, ncols) {
  ws.addRow([]); ws.addRow([]);
  ws.mergeCells(`A${ws.rowCount}:${colLetter(ncols)}${ws.rowCount}`);
  const c1 = ws.getCell(`A${ws.rowCount}`);
  c1.value = `Fait à Défalé, le ${new Date().toLocaleDateString('fr-FR')}`;
  c1.font = {italic:true, size:11, color:{argb:'FF334155'}};
  c1.alignment = {horizontal:'left'};
  ws.addRow([]);
  ws.mergeCells(`A${ws.rowCount}:${colLetter(ncols)}${ws.rowCount}`);
  const c2 = ws.getCell(`A${ws.rowCount}`);
  c2.value = `Le Directeur Général : ${dgNom||'Boumzina Raïna'}`;
  c2.font = {bold:true, size:12, color:{argb:'FF0F172A'}};
  c2.alignment = {horizontal:'right'};
}

// ── Excel Production ──────────────────────────
async function xlProduction(wb, d, mois='') {
  const ws = wb.addWorksheet('Production');
  ws.columns = [
    {key:'a',width:14},{key:'b',width:10},{key:'c',width:10},{key:'d',width:10},
    {key:'e',width:10},{key:'f',width:10},{key:'g',width:10},{key:'h',width:8},
    {key:'i',width:14},{key:'j',width:22},
  ];
  xlHeader(ws,'RAPPORT DE PRODUCTION MENSUEL',10);
  let sec=1;

  xlSection(ws,sec++,'Saisies journalières',10);
  xlEntete(ws,['Date','C12','C24','F6/1,5L','F6/0,5L','F6/1L','HILIO','Jours','Statut','Opérateur']);
  (d.saisies||[]).forEach((s,i)=>{
    const row=xlLigne(ws,[strDate(s.date_production)||'—',s.c12||0,s.c24||0,s.f615||0,s.f605||0,s.f61||0,s.hilio||0,s.jours_ouvres||1,s.statut==='valide'?'Validé':'En attente',s.saisi_par_nom||'—']);
    if(i%2===0) row.eachCell(c=>{if(!c.fill?.fgColor?.argb||c.fill.fgColor.argb==='FF000000') c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
  });

  xlSection(ws,sec++,'Totaux — Productions validées',10);
  xlEntete(ws,['Format','Unité','Qté produite','Contenu','CA HT (FCFA)','CD HT (FCFA)','MB HT (FCFA)','TMB HT','','']);
  [['C12','cartons',12,'btl 1,5L'],['C24','cartons',24,'btl 0,5L'],['F615','fardeaux',6,'btl 1,5L'],['F605','fardeaux',6,'btl 0,5L'],['F61','fardeaux',6,'btl 1L'],['HILIO','packs',30,'sachets']].forEach(([code,unite,mult,desc])=>{
    const q=(d.totaux||{})[code.toLowerCase()]||0,ca=q*(PRIX_PF[code]||0),cd=q*(CD_UNIT[code]||0);
    xlLigne(ws,[code,unite,fmt(q),q*mult+' '+desc,fmt(ca),fmt(cd),fmt(ca-cd),ca>0?fmtP((ca-cd)/ca):'—','','']);
  });
  const t=d.totaux||{};
  const caT=Object.entries(t).reduce((s,[k,v])=>s+(v||0)*(PRIX_PF[k.toUpperCase()]||0),0);
  const cdT=Object.entries(t).reduce((s,[k,v])=>s+(v||0)*(CD_UNIT[k.toUpperCase()]||0),0);
  xlLigne(ws,['TOTAL','','','',fmt(caT),fmt(cdT),fmt(caT-cdT),caT>0?fmtP((caT-cdT)/caT):'—','',''],{bold:true,bg:'#0F172A',color:'#F8FAFC'});

  xlSection(ws,sec++,'Consommation réelle des intrants',10);
  xlEntete(ws,['Intrant','Code','Consommé théorique','Rebuts saisis','Total réel','Prix HT (FCFA)','Valeur HT (FCFA)','','','']);
  [['Préformes 32g','PREF_32G',53],['Préformes 17g','PREF_17G',28],['Bouchons vert','BOUCH_VERT',5],['Étiquettes 1,5L','ETI_15L',9],['Étiquettes 0,5L','ETI_05L',6],['Étiquettes 1L','ETI_1L',7],['Cartons C12','CTN_15L',233],['Cartons C24','CTN_05L',200]].forEach(([nom,code,prix])=>{
    const theo=(d.consommations_cumulees||{})[code]||0,reb=(d.rebuts_cumules||{})[code]||0;
    xlLigne(ws,[nom,code,fmt(theo),fmt(reb),fmt(theo+reb),fmt(prix),fmt((theo+reb)*prix),'','','']);
  });

  xlSignature(ws,d.dg_nom,10);
  return wb.xlsx.writeBuffer();
}

// ── Excel ATP ─────────────────────────────────
async function xlATP(wb, d, mois='') {
  const ws = wb.addWorksheet('ATP');
  ws.columns=[{key:'a',width:40},{key:'b',width:22},{key:'c',width:22},{key:'d',width:14}];
  xlHeader(ws,'RAPPORT FINANCIER ATP',4);
  let sec=1;

  const atp=d.atp||{},obj=d.objectifs||{},real=d.realisations||{};
  const cahtp=parseFloat(atp.proj_ca_ht||0),cdhtp=parseFloat(atp.proj_cd_ht||0);
  const cahtr=parseFloat(atp.real_ca_ht||0),cdhtr=parseFloat(atp.real_cd_ht||0);
  const tmbhtp=parseFloat(atp.proj_tmb||0),tmbhtr=parseFloat(atp.taux_marge_brute||0);

  xlSection(ws,sec++,'Objectifs de production — Projection',4);
  xlEntete(ws,['Produit','Qté objectif','Prix vente HT (FCFA)','CAHTP (FCFA)']);
  ['C24','C12','F605','F615','F61','HILIO'].forEach(c=>{
    const q=obj[c]||0;
    xlLigne(ws,[c,fmt(q),fmt(PRIX_PF[c]||0),fmt(q*(PRIX_PF[c]||0))]);
  });
  xlLigne(ws,['TOTAL CAHTP','','',fmt(cahtp)],{bold:true,bg:'#0F172A',color:'#F8FAFC'});

  xlSection(ws,sec++,'Réalisation en cours — Cumulé automatique',4);
  xlEntete(ws,['Produit','Qté réalisée','Montant HT (FCFA)','Avancement']);
  ['C24','C12','F605','F615','F61','HILIO'].forEach(c=>{
    const q=real[c]||0,mt=q*(PRIX_PF[c]||0),om=(obj[c]||0)*(PRIX_PF[c]||0);
    xlLigne(ws,[c,fmt(q),fmt(mt),om>0?((mt/om)*100).toFixed(1)+' %':'—']);
  });
  xlLigne(ws,['TOTAL CAHTR','',fmt(cahtr),cahtp>0?((cahtr/cahtp)*100).toFixed(1)+' %':'—'],{bold:true,bg:'#0F172A',color:'#F8FAFC'});

  xlSection(ws,sec++,'Marges brutes — Projection',4);
  xlEntete(ws,['#','Libellé','Montant prévisionnel (FCFA)','']);
  xlLigne(ws,['1','CAHTP',fmt(cahtp),'']);
  xlLigne(ws,['2','CDHTP',fmt(cdhtp),'']);
  xlLigne(ws,['3','MBHTP = CAHTP − CDHTP',fmt(cahtp-cdhtp),''],{bold:true});
  xlLigne(ws,['4','TMBHTP = MBHTP / CAHTP','',fmtP(tmbhtp)],{bold:true});
  ws.addRow([]);
  xlEntete(ws,['Rubrique','Montant (FCFA)','Taux','']);
  const bmfP=tmbhtp>0?(cahtp*0.35)/(tmbhtp*0.15):0,fsP=tmbhtp>0?(cahtp*0.35)/(tmbhtp*0.10):0;
  xlLigne(ws,['BMF',fmt(bmfP),fmtP(tmbhtp*0.15/0.35),'']);
  xlLigne(ws,['Frais de Siège',fmt(fsP),fmtP(tmbhtp*0.10/0.35),'']);
  xlLigne(ws,['Amortissement',fmt(fsP),fmtP(tmbhtp*0.10/0.35),'']);
  const mbhtpXl=cahtp-cdhtp;
  const bmfPxl=mbhtpXl*(15/35),fsPxl=mbhtpXl*(10/35);
  const bmfTxPxl=tmbhtp*(15/35),fsTxPxl=tmbhtp*(10/35);
  xlLigne(ws,['TOTAL',fmt(bmfPxl+fsPxl+fsPxl),fmtP(bmfTxPxl+fsTxPxl+fsTxPxl),''],{bold:true,bg:'#0F172A',color:'#F8FAFC'});

  xlSection(ws,sec++,'Marges brutes — Réalisation',4);
  xlEntete(ws,['#','Libellé','Montant réalisé (FCFA)','']);
  xlLigne(ws,['5','CAHTR',fmt(cahtr),'']);
  xlLigne(ws,['6','CDHTR',fmt(cdhtr),'']);
  xlLigne(ws,['7','MBHTR = CAHTR − CDHTR',fmt(cahtr-cdhtr),''],{bold:true});
  xlLigne(ws,['8','TMBHTR = MBHTR / CAHTR','',fmtP(tmbhtr)],{bold:true});
  ws.addRow([]);
  xlEntete(ws,['Rubrique','Montant réalisé (FCFA)','Taux réalisé','']);
  const bmfR=tmbhtr>0?(cahtr*0.35)/(tmbhtr*0.15):0,fsR=tmbhtr>0?(cahtr*0.35)/(tmbhtr*0.10):0;
  xlLigne(ws,['BMF',fmt(bmfR),fmtP(tmbhtr*0.15/0.35),'']);
  xlLigne(ws,['Frais de Siège',fmt(fsR),fmtP(tmbhtr*0.10/0.35),'']);
  xlLigne(ws,['Amortissement',fmt(fsR),fmtP(tmbhtr*0.10/0.35),'']);
  const mbhtrXl=cahtr-cdhtr;
  const bmfRxl=mbhtrXl*(15/35),fsRxl=mbhtrXl*(10/35);
  const bmfTxRxl=tmbhtr*(15/35),fsTxRxl=tmbhtr*(10/35);
  xlLigne(ws,['TOTAL',fmt(bmfRxl+fsRxl+fsRxl),fmtP(bmfTxRxl+fsTxRxl+fsTxRxl),''],{bold:true,bg:'#0F172A',color:'#F8FAFC'});

  if(d.charges&&Object.values(d.charges).some(v=>parseFloat(v||0)>0)){
    xlSection(ws,sec++,'Charges indirectes (CIHT)',4);
    xlEntete(ws,['Nature','Montant (FCFA)','','']);
    [['Salaires',d.charges.salaires],['Électricité',d.charges.electricite],['Carburant',d.charges.carburant],['Loyer',d.charges.loyer],['Maintenance',d.charges.maintenance],['Autres',d.charges.autres]].forEach(([l,v])=>{if(parseFloat(v||0)>0)xlLigne(ws,[l,fmt(v),'','']);});
    xlLigne(ws,['TOTAL CIHT',fmt(d.totalCI||0),'',''],{bold:true,bg:'#0F172A',color:'#F8FAFC'});
  }

  xlSignature(ws,d.dg_nom,4);
  return wb.xlsx.writeBuffer();
}

// ── Excel Stocks ──────────────────────────────
async function xlStocks(wb, d, mois='') {
  const ws1=wb.addWorksheet('Stocks actuels');
  ws1.columns=[{key:'a',width:35},{key:'b',width:14},{key:'c',width:9},{key:'d',width:10},{key:'e',width:14},{key:'f',width:14},{key:'g',width:18},{key:'h',width:13},{key:'i',width:12}];
  xlHeader(ws1,'ÉTAT DES STOCKS',9);
  let sec=1;
  [1,2,3].forEach(cl=>{
    const arts=(d.articles||[]).filter(a=>parseInt(a.classe)===cl);
    if(!arts.length) return;
    const t={1:'Classe 1 — Consommables de production',2:'Classe 2 — EPI et Pièces de rechange',3:'Classe 3 — Produits finis'};
    xlSection(ws1,sec++,t[cl],9);
    xlEntete(ws1,['Article','Code','Cl.','Unité','Stock actuel','Prix HT','Valeur HT','Seuil alerte','Statut']);
    arts.forEach((a,i)=>{
      const stock=parseFloat(a.stock_actuel||0),st=stock<=0?'Rupture':a.seuil_alerte&&stock<=a.seuil_alerte?'Faible':'OK';
      const row=xlLigne(ws1,[a.libelle,a.code,cl,a.unite,fmt(stock),fmt(a.prix_unitaire_ht||0),fmt(a.valeur_stock_ht||0),a.seuil_alerte||0,st]);
      if(i%2===0) row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
    });
  });
  xlSignature(ws1,d.dg_nom,9);

  const ws2=wb.addWorksheet('Mouvements');
  ws2.columns=[{key:'a',width:13},{key:'b',width:30},{key:'c',width:8},{key:'d',width:10},{key:'e',width:13},{key:'f',width:16},{key:'g',width:30}];
  xlHeader(ws2,'MOUVEMENTS DE STOCK',7);
  xlSection(ws2,1,'Historique des entrées et sorties',7);
  xlEntete(ws2,['Date','Article','Cl.','Type','Quantité','Valeur HT','Motif']);
  (d.mouvements||[]).forEach((m,i)=>{
    const row=xlLigne(ws2,[strDate(m.date_mouvement)||'—',m.article_libelle||'—',m.classe,m.type_mouvement==='entree'?'Entrée':'Sortie',fmt(m.quantite),fmt(m.valeur_ht||0),m.motif||'—']);
    if(i%2===0) row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
  });
  return wb.xlsx.writeBuffer();
}

// ── Excel Trésorerie ──────────────────────────
async function xlTresorerie(wb, d, mois='') {
  const ws=wb.addWorksheet('Trésorerie');
  ws.columns=[{key:'a',width:13},{key:'b',width:22},{key:'c',width:30},{key:'d',width:16},{key:'e',width:16},{key:'f',width:18}];
  xlHeader(ws,'RAPPORT DE TRÉSORERIE',6);
  xlSection(ws,1,'Soldes des comptes',6);
  xlEntete(ws,['Compte','Type','Banque','Solde (FCFA)','','']);
  (d.comptes||[]).forEach((c,i)=>{
    const row=xlLigne(ws,[c.libelle,c.type_compte||'—',c.banque||'—',fmt(c.solde_fcfa||0),'','']);
    if(i%2===0) row.eachCell(c2=>{c2.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
  });
  xlLigne(ws,['TOTAL TRÉSORERIE','','',fmt((d.comptes||[]).reduce((s,c)=>s+parseFloat(c.solde_fcfa||0),0)),'',''],{bold:true,bg:'#0F172A',color:'#F8FAFC'});
  xlSection(ws,2,'Brouillard de caisse',6);
  xlEntete(ws,['Date','Compte','Libellé','Entrée (FCFA)','Sortie (FCFA)','Solde cumulé']);
  (d.mouvements||[]).forEach((m,i)=>{
    const isC=m.sens==='credit';
    const row=xlLigne(ws,[fmtD(m.date_mouvement),m.compte_libelle||'—',m.description||'—',isC?fmt(m.montant_fcfa||0):'',!isC?fmt(m.montant_fcfa||0):'',fmt(m.solde_apres||0)]);
    if(i%2===0) row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
  });
  xlSignature(ws,d.dg_nom,6);
  return wb.xlsx.writeBuffer();
}

// ── Excel Rebuts ──────────────────────────────
async function xlRebuts(wb, d, mois='') {
  const ws=wb.addWorksheet('Rebuts');
  ws.columns=[{key:'a',width:13},{key:'b',width:28},{key:'c',width:14},{key:'d',width:14},{key:'e',width:16}];
  xlHeader(ws,'RAPPORT DES REBUTS',5);
  xlSection(ws,1,'Rebuts par date et intrant',5);
  xlEntete(ws,['Date','Intrant','Quantité','Prix HT unit.','Valeur HT (FCFA)']);
  const rebuts=d.rebuts||[];
  if(rebuts.length===0) {
    xlLigne(ws,['Aucun rebut enregistré pour cette période','','','','']);
  } else {
    rebuts.forEach((r,i)=>{
      const row=xlLigne(ws,[strDate(r.date)||'—',r.intrant||'—',fmt(r.quantite||0),fmt(r.prix||0),fmt(r.valeur||0)]);
      if(i%2===0) row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
    });
    const totVal=rebuts.reduce((s,r)=>s+(r.valeur||0),0);
    xlLigne(ws,['TOTAL','',fmt(rebuts.reduce((s,r)=>s+(r.quantite||0),0)),'',fmt(totVal)],{bold:true,bg:'#0F172A',color:'#F8FAFC'});
  }
  xlSignature(ws,d.dg_nom,5);
  return wb.xlsx.writeBuffer();
}

// ═══════════════════════════════════════════════
// PDF — design sobre avec logo transparent
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
// FONCTIONS GRAPHIQUES PDF
// ═══════════════════════════════════════════════

// Graphique barres verticales
function pdfBarChart(doc, titre, labels, values, options={}) {
  const { color='#0891B2', maxVal=null, unite='', width=doc.page.width-90, height=90 } = options;
  if (!values.length) return;
  if (doc.y > doc.page.height-height-40) { doc.addPage(); drawWatermark(doc); doc.moveDown(0.5); }

  doc.fillColor('#1E293B').fontSize(8).font('Helvetica-Bold').text(titre, 45, doc.y);
  doc.moveDown(0.3);

  const x0=45, y0=doc.y, barW=Math.min(30, (width-40)/labels.length-4);
  const maxV = maxVal || Math.max(...values, 1);
  const scaleH = (height-20) / maxV;

  // Fond
  doc.rect(x0, y0, width, height).fill('#0F172A').stroke();

  // Lignes de référence
  [0.25,0.5,0.75,1].forEach(p => {
    const yL = y0+height-20-(height-20)*p;
    doc.moveTo(x0+30,yL).lineTo(x0+width-5,yL).lineWidth(0.3).stroke('#1E3A5F');
    doc.fillColor('#475569').fontSize(6).font('Helvetica')
       .text(fmt(maxV*p)+unite, x0+2, yL-3, {width:26, align:'right'});
  });

  // Barres
  const totalW = labels.length*(barW+4);
  const startX = x0+30+(width-30-totalW)/2;
  labels.forEach((lbl,i) => {
    const val = values[i]||0;
    const bH  = Math.max(1, val*scaleH);
    const bX  = startX + i*(barW+4);
    const bY  = y0+height-20-bH;

    // Barre avec dégradé
    const alpha = 0.5+0.5*(val/maxV);
    doc.rect(bX, bY, barW, bH).fill(color);
    doc.rect(bX, bY, barW*0.4, bH).fill('#FFFFFF20');

    // Valeur au dessus
    if (val > 0) {
      doc.fillColor('#F8FAFC').fontSize(5.5).font('Helvetica-Bold')
         .text(val>=1000?Math.round(val/1000)+'k':String(Math.round(val)), bX-2, bY-8, {width:barW+4, align:'center'});
    }
    // Label dessous
    doc.fillColor('#94A3B8').fontSize(5.5).font('Helvetica')
       .text(lbl, bX-2, y0+height-18, {width:barW+4, align:'center'});
  });
  doc.y = y0+height+6;
  doc.moveDown(0.5);
}

// Graphique courbe
function pdfLineChart(doc, titre, labels, series, options={}) {
  const { width=doc.page.width-90, height=80 } = options;
  if (doc.y > doc.page.height-height-40) { doc.addPage(); drawWatermark(doc); doc.moveDown(0.5); }
  doc.fillColor('#1E293B').fontSize(8).font('Helvetica-Bold').text(titre, 45, doc.y);
  doc.moveDown(0.3);

  const x0=45, y0=doc.y;
  const colors=['#22D3EE','#34D399','#F59E0B','#F87171'];
  const allVals = series.flatMap(s=>s.values);
  const maxV = Math.max(...allVals, 1);
  const scaleH=(height-20)/maxV;
  const stepW=(width-40)/(labels.length-1||1);

  doc.rect(x0,y0,width,height).fill('#0F172A').stroke();

  // Grille
  [0.25,0.5,0.75,1].forEach(p=>{
    const yL=y0+height-20-(height-20)*p;
    doc.moveTo(x0+35,yL).lineTo(x0+width-5,yL).lineWidth(0.3).stroke('#1E3A5F');
    doc.fillColor('#475569').fontSize(6).font('Helvetica')
       .text(Math.round(maxV*p/1000)+'k', x0+2, yL-3, {width:30, align:'right'});
  });

  // Labels X
  labels.forEach((lbl,i)=>{
    const xP=x0+35+i*stepW;
    doc.fillColor('#94A3B8').fontSize(5.5).font('Helvetica')
       .text(lbl, xP-15, y0+height-14, {width:30, align:'center'});
  });

  // Courbes
  series.forEach((s,si)=>{
    const col=colors[si%colors.length];
    const pts=s.values.map((v,i)=>({x:x0+35+i*stepW, y:y0+height-20-v*scaleH}));
    if (pts.length<2) return;
    doc.moveTo(pts[0].x,pts[0].y);
    pts.slice(1).forEach(p=>doc.lineTo(p.x,p.y));
    doc.lineWidth(1.5).stroke(col);
    pts.forEach(p=>doc.circle(p.x,p.y,2).fill(col));
  });

  // Légende
  if (series.length>1) {
    series.forEach((s,si)=>{
      doc.rect(x0+40+si*70, y0+height+2, 8, 5).fill(colors[si%colors.length]);
      doc.fillColor('#CBD5E1').fontSize(6).font('Helvetica')
         .text(s.label, x0+50+si*70, y0+height+2, {width:60});
    });
  }
  doc.y = y0+height+14;
  doc.moveDown(0.5);
}

// Camembert (donut)
function pdfDonut(doc, titre, labels, values, options={}) {
  const { size=70 } = options;
  if (!values.length||values.every(v=>v===0)) return;
  if (doc.y > doc.page.height-size*2-40) { doc.addPage(); drawWatermark(doc); doc.moveDown(0.5); }

  const colors=['#0891B2','#34D399','#F59E0B','#F87171','#A78BFA','#FB923C'];
  const cx=45+size, cy=doc.y+size;
  const total=values.reduce((s,v)=>s+v,0)||1;
  let angle=-Math.PI/2;

  doc.fillColor('#1E293B').fontSize(8).font('Helvetica-Bold')
     .text(titre, 45, doc.y);
  doc.moveDown(0.3);
  const yStart=doc.y;

  // Secteurs
  values.forEach((v,i)=>{
    const sweep=(v/total)*Math.PI*2;
    const c=colors[i%colors.length];
    const x1=cx+size*Math.cos(angle), y1=cy+size*Math.sin(angle);
    const x2=cx+size*Math.cos(angle+sweep), y2=cy+size*Math.sin(angle+sweep);
    const lg=sweep>Math.PI?1:0;
    doc.path(`M ${cx} ${cy} L ${x1} ${y1} A ${size} ${size} 0 ${lg} 1 ${x2} ${y2} Z`).fill(c);
    angle+=sweep;
  });
  // Trou central
  doc.circle(cx,cy,size*0.55).fill('#0F172A');

  // Légende droite
  const lx=cx+size+15, ly=yStart;
  values.forEach((v,i)=>{
    const pct=((v/total)*100).toFixed(1);
    doc.rect(lx,ly+i*14,8,8).fill(colors[i%colors.length]);
    doc.fillColor('#CBD5E1').fontSize(7).font('Helvetica')
       .text(labels[i]+' — '+pct+'%', lx+11, ly+i*14+1, {width:120});
  });

  doc.y = Math.max(doc.y, yStart+values.length*14)+10;
  doc.moveDown(0.5);
}

// Jauge simple (progress bar)
function pdfJauge(doc, label, valeur, maxi, options={}) {
  const { color='#0891B2', width=doc.page.width-90 } = options;
  if (doc.y > doc.page.height-30) { doc.addPage(); drawWatermark(doc); doc.moveDown(0.5); }
  const pct = Math.min(1, (valeur||0)/(maxi||1));
  const y=doc.y;
  doc.fillColor('#CBD5E1').fontSize(7.5).font('Helvetica-Bold')
     .text(label, 45, y, {width:120, continued:false});
  doc.rect(175,y+1,width-135,8).fill('#1E293B');
  const barCol = pct>=0.75?'#34D399':pct>=0.50?'#F59E0B':'#F87171';
  if (pct>0) doc.rect(175,y+1,(width-135)*pct,8).fill(barCol);
  doc.fillColor('#F8FAFC').fontSize(7).font('Helvetica-Bold')
     .text(fmtP(pct)+' ('+fmt(valeur)+' / '+fmt(maxi)+')', 178+(width-135)*pct+2, y+1, {width:100});
  doc.moveDown(1.0);
}

function pdfGraphique(doc, imgBuffer, titre, h=200) {
  if (!imgBuffer) return;
  try {
    if (doc.y + h + 30 > doc.page.height - 80) {
      doc.addPage(); drawWatermark(doc); doc.moveDown(0.5);
    }
    if (titre) {
      doc.fillColor('#64748B').fontSize(8.5).font('Helvetica-Bold')
         .text(titre.toUpperCase(), 45, doc.y, {width:doc.page.width-90});
      doc.moveDown(0.3);
    }
    const W = doc.page.width - 90;
    doc.image(imgBuffer, 45, doc.y, {width:W, height:h});
    doc.y += h + 12;
    doc.moveDown(0.3);
  } catch(e) { console.error('[CHART INSERT]', e.message); }
}

function drawWatermark(doc) {
  try {
    if (!fs.existsSync(LOGO_PATH)) return;
    const W = doc.page.width;
    const H = doc.page.height;
    const logoSize = Math.min(W, H) * 0.55; // 55% de la largeur de la page
    const x = (W - logoSize) / 2;
    const y = (H - logoSize) / 2;
    doc.save();
    doc.opacity(0.13); // visible et discret
    doc.image(LOGO_PATH, x, y, {width: logoSize, height: logoSize, fit:[logoSize,logoSize], align:'center', valign:'center'});
    doc.restore();
  } catch(e) {}
}

async function genererPDF(type, donnees, mois) {
  return new Promise((resolve,reject) => {
    try {
      const doc = new PDFDocument({margin:45, size:'A4', autoFirstPage:true});
      const bufs=[];
      doc.on('data',b=>bufs.push(b));
      doc.on('end',()=>resolve(Buffer.concat(bufs)));
      doc.on('error',reject);

      // Filigrane sur la première page
      drawWatermark(doc);
      pdfEntete(doc, type, mois, donnees.dg_nom);

      switch(type) {
        case 'production': pdfProduction(doc,donnees); break;
        case 'atp':        pdfATP(doc,donnees); break;
        case 'stocks':     pdfStocks(doc,donnees); break;
        case 'tresorerie': pdfTresorerie(doc,donnees); break;
        case 'rebuts':     pdfRebuts(doc,donnees); break;
        case 'tendances':  pdfTendances(doc,donnees); break;
    default:           pdfProduction(doc,donnees);
      }

      pdfSignature(doc, donnees.dg_nom);
      doc.end();
    } catch(e) { reject(e); }
  });
}

function pdfEntete(doc, type, mois, dgNom) {
  const W = doc.page.width;

  // Fond entête blanc cassé
  doc.rect(0,0,W,110).fill('#F8FAFC');
  // Bande gauche sobre
  doc.rect(0,0,4,110).fill('#334155');

  // Logo avec fond transparent
  try {
    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, 15, 10, {width:80, height:80});
    }
  } catch(e) {}

  // Informations société
  const tx = 105;
  doc.fillColor('#0F172A').fontSize(13).font('Helvetica-Bold')
     .text('Société Industrielle d\'Ingénierie et d\'Exploitation (SINEX-SA)', tx, 15, {width:W-tx-45});
  doc.fillColor('#334155').fontSize(10).font('Helvetica')
     .text('TEL: (+228) 93 88 79 92 / 91 49 25 94', tx, 38, {width:W-tx-45});
  doc.fillColor('#475569').fontSize(10)
     .text('E-mail: ssinex.sa@gmail.com', tx, 52, {width:W-tx-45});
  doc.fillColor('#64748B').fontSize(10)
     .text('BP. 7518 Défalé-Niamtougou, Quartier Tamdè (TOGO), Rue Ancienne Nationale', tx, 66, {width:W-tx-45});
  doc.fillColor('#94A3B8').fontSize(9)
     .text(`Document généré le ${new Date().toLocaleDateString('fr-FR')} — DG : ${dgNom||'Boumzina Raïna'}`, tx, 83, {width:W-tx-45});

  // Ligne séparatrice
  doc.rect(0,110,W,1).fill('#CBD5E1');

  // Bandeau titre — sobre bleu foncé
  doc.rect(0,111,W,38).fill('#1E293B');
  doc.fillColor('#F8FAFC').fontSize(14).font('Helvetica-Bold')
     .text(`${TITRES[type]||'RAPPORT'} — ${mois}`, 45, 122, {align:'center', width:W-90});

  doc.rect(0,149,W,2).fill('#475569');
  doc.moveDown(5.5);
}

function pdfSignature(doc, dgNom) {
  if (doc.y > doc.page.height-110) doc.addPage();
  doc.moveDown(2.5);
  const W = doc.page.width - 90;
  doc.moveTo(45, doc.y).lineTo(doc.page.width-45, doc.y).lineWidth(0.5).stroke('#CBD5E1');
  doc.moveDown(0.5);
  doc.fillColor('#475569').fontSize(10).font('Helvetica')
     .text(`Fait à Défalé, le ${new Date().toLocaleDateString('fr-FR')}`, 45, doc.y, {width:W/2});
  const sy = doc.y - 14;
  // Signature + cachet uniquement (sans texte nom/titre)
  try {
    if (fs.existsSync(SIG_PATH)) {
      doc.image(SIG_PATH, doc.page.width-375, sy, {width:352, height:143, fit:[352,143]});
    } else {
      doc.roundedRect(doc.page.width-375, sy, 352, 143, 5)
         .lineWidth(1.5).stroke('#0F172A');
      doc.fillColor('#0F172A').fontSize(8).font('Helvetica-Bold')
         .text('SINEX SA — CACHET OFFICIEL', doc.page.width-373, sy+50, {width:348, align:'center'});
      doc.fillColor('#334155').fontSize(9).font('Helvetica-Bold')
         .text(dgNom||'Boumzina Raïna', doc.page.width-373, sy+65, {width:348, align:'center'});
      doc.fillColor('#0891B2').fontSize(8).font('Helvetica')
         .text('Directeur Général', doc.page.width-373, sy+80, {width:348, align:'center'});
    }
  } catch(e) { console.error('Signature error:', e.message); }
  doc.moveDown(4);

  // Pied de page
  const py = doc.page.height-22;
  doc.rect(0,py-2,doc.page.width,24).fill('#0F172A');
  doc.fillColor('#64748B').fontSize(8).font('Helvetica')
     .text(`SINEX-SA — Document confidentiel — ${new Date().toLocaleDateString('fr-FR')}`,
       45, py+4, {align:'center', width:doc.page.width-90});
}

let _sec=0;
function pdfSection(doc, titre) {
  _sec++;
  if (doc.y > doc.page.height-110) {
    doc.addPage();
    drawWatermark(doc);
    doc.rect(0,0,doc.page.width,2).fill('#475569');
    doc.moveDown(0.5);
  }
  doc.moveDown(0.5);
  const y=doc.y;
  doc.rect(45,y,doc.page.width-90,18).fill('#1E293B');
  doc.fillColor('#F8FAFC').fontSize(10).font('Helvetica-Bold')
     .text(`${ROMAINS[(_sec-1)%10]}. ${titre}`, 49, y+4, {width:doc.page.width-100, lineBreak:false});
  doc.moveDown(1.1);
}

function resetSec() { _sec=0; }

function pdfTableau(doc, entetes, lignes, widths=null) {
  if (!Array.isArray(lignes)||lignes.length===0) {
    doc.fillColor('#64748B').fontSize(10).font('Helvetica-Oblique')
       .text('Aucune donnée disponible pour cette période.', 49, doc.y);
    doc.moveDown(0.6);
    return;
  }
  const W=doc.page.width-90, n=entetes.length;
  const cols=widths||Array(n).fill(Math.floor(W/n));
  const rowH=15;

  const drawEntetes=()=>{
    let x=45, y=doc.y;
    doc.rect(45,y,W,rowH).fill('#334155');
    entetes.forEach((e,i)=>{
      doc.fillColor('#F8FAFC').fontSize(9).font('Helvetica-Bold')
         .text(String(e),x+2,y+3,{width:cols[i]-4,ellipsis:true,lineBreak:false});
      x+=cols[i];
    });
    doc.moveDown(0.9);
  };
  drawEntetes();

  lignes.forEach((ligne,li)=>{
    if(doc.y>doc.page.height-70){
      doc.addPage();
      drawWatermark(doc);
      doc.rect(0,0,doc.page.width,2).fill('#475569');
      doc.moveDown(0.5);
      drawEntetes();
    }
    const ry=doc.y;
    if(li%2===0) doc.rect(45,ry-1,W,rowH-1).fill('#F1F5F9');
    // Bordure légère
    doc.rect(45,ry-1,W,rowH-1).lineWidth(0.3).stroke('#E2E8F0');
    let x=45;
    (ligne||[]).forEach((val,i)=>{
      if(i>=cols.length) return;
      const color=(typeof val==='object'&&val?.color)?val.color:'#1E293B';
      const text=(typeof val==='object'&&val?.text)?String(val.text):String(val??'—');
      const bold=typeof val==='object'&&val?.bold;
      doc.fillColor(color).fontSize(9.5).font(bold?'Helvetica-Bold':'Helvetica')
         .text(text,x+3,ry+2,{width:cols[i]-6,ellipsis:true,lineBreak:false});
      x+=cols[i];
    });
    doc.moveDown(0.85);
  });
  doc.moveDown(0.3);
}

function pdfLigneTotale(doc, vals, widths) {
  if (doc.y > doc.page.height-60) { doc.addPage(); drawWatermark(doc); doc.moveDown(0.5); }
  const W=doc.page.width-90;
  const y=doc.y;
  doc.rect(45,y-1,W,15).fill('#1E293B');
  let x=45;
  vals.forEach((v,i)=>{
    if(i>=widths.length) return;
    const text=typeof v==='object'?String(v.text||''):String(v||'');
    doc.fillColor('#F8FAFC').fontSize(8.5).font('Helvetica-Bold')
       .text(text,x+3,y+2,{width:widths[i]-6,ellipsis:true,lineBreak:false});
    x+=widths[i];
  });
  doc.moveDown(0.85);
}

function pdfProduction(doc, d) {
  resetSec();

  // Totaux saisies
  const saisies = d.saisies||[];
  const valides = saisies.filter(s=>s.statut==='valide');
  const totJours = saisies.reduce((a,s)=>a+(parseFloat(s.jours_ouvres)||0),0);

  pdfSection(doc,'Saisies journalières de production');
  pdfTableau(doc,
    ['Date','C12','C24','F6/1,5L','F6/0,5L','F6/1L','HILIO','Jrs','Statut'],
    saisies.map(s=>[
      strDate(s.date_production)||'—',
      fmt(s.c12||0),fmt(s.c24||0),fmt(s.f615||0),fmt(s.f605||0),fmt(s.f61||0),fmt(s.hilio||0),
      s.jours_ouvres||1,
      {text:s.statut==='valide'?'Validé':'Attente',
       color:s.statut==='valide'?C.vert:C.ambre,
       bold:s.statut==='valide'},
    ]),
    [55,38,38,42,42,38,38,28,55]
  );
  // Ligne total saisies
  pdfLigneTotale(doc,[
    `TOTAL — ${valides.length} validée(s) / ${saisies.length} saisie(s)`,
    fmt(saisies.reduce((a,s)=>a+(s.c12||0),0)),
    fmt(saisies.reduce((a,s)=>a+(s.c24||0),0)),
    fmt(saisies.reduce((a,s)=>a+(s.f615||0),0)),
    fmt(saisies.reduce((a,s)=>a+(s.f605||0),0)),
    fmt(saisies.reduce((a,s)=>a+(s.f61||0),0)),
    fmt(saisies.reduce((a,s)=>a+(s.hilio||0),0)),
    fmt(totJours),'',
  ],[55,38,38,42,42,38,38,28,55]);

  // Graphique barres production journalière
  const joursLabels = saisies.map(s=>strDate(s.date_production).slice(5));
  const joursC12    = saisies.map(s=>s.c12||0);
  const joursC24    = saisies.map(s=>s.c24||0);
  if (joursLabels.length>0) {
    pdfBarChart(doc,'Production C12 journalière (cartons)',joursLabels,joursC12,{color:'#0891B2',unite:' ctn'});
    pdfBarChart(doc,'Production C24 journalière (cartons)',joursLabels,joursC24,{color:'#34D399',unite:' ctn'});
  }

  // Graphique barres production
  if (charts) {
    try { pdfGraphique(doc, charts.graphiqueBarresProduction(d.totaux||{}), 'Graphique — Production par format', 200); } catch(e) {}
  }
  pdfSection(doc,'Totaux des productions validées');
  const t=d.totaux||{};
  let caTotal=0,cdTotal=0,qtyTotal=0;
  pdfTableau(doc,['Format','Qté','CA HT (FCFA)','CD HT (FCFA)','MB HT (FCFA)','TMB HT'],
    [['C12',12],['C24',24],['F615',6],['F605',6],['F61',6],['HILIO',30]].map(([code])=>{
      const q=(t[code.toLowerCase()]||0),ca=q*(PRIX_PF[code]||0),cd=q*(CD_UNIT[code]||0);
      caTotal+=ca; cdTotal+=cd; qtyTotal+=q;
      return [code,fmt(q),fmt(ca),fmt(cd),fmt(ca-cd),ca>0?fmtP((ca-cd)/ca):'—'];
    }),
    [55,45,95,95,95,55]
  );
  pdfLigneTotale(doc,[
    'TOTAL GÉNÉRAL',fmt(qtyTotal),fmt(caTotal),fmt(cdTotal),
    fmt(caTotal-cdTotal),caTotal>0?fmtP((caTotal-cdTotal)/caTotal):'—',
  ],[55,45,95,95,95,55]);

  // Donut mix produits CA
  const donutCodes=['c12','c24','f615','f605','f61','hilio'];
  const donutLabels=['C12','C24','F6/1,5L','F6/0,5L','F6/1L','HILIO'];
  const donutVals=donutCodes.map(k=>(t[k]||0)*(PRIX_PF[k.toUpperCase()]||0));
  if (donutVals.some(v=>v>0)) {
    pdfDonut(doc,'Répartition du CA HT par format',
      donutLabels.filter((_,i)=>donutVals[i]>0),
      donutVals.filter(v=>v>0));
  }

  pdfSection(doc,'Consommation réelle des intrants');
  const cc=d.consommations_cumulees||{},rc=d.rebuts_cumules||{};
  let valeurTotale=0;
  pdfTableau(doc,['Intrant','Théorique','Rebuts','Total réel','Prix HT','Valeur HT'],
    [['Préformes 32g','PREF_32G',53],['Préformes 17g','PREF_17G',28],['Bouchons','BOUCH_VERT',5],
     ['Étiq. 1,5L','ETI_15L',9],['Étiq. 0,5L','ETI_05L',6],['Cartons C12','CTN_15L',233],['Cartons C24','CTN_05L',200]].map(([nom,code,prix])=>{
      const theo=cc[code]||0,reb=rc[code]||0,val=(theo+reb)*prix;
      valeurTotale+=val;
      return [nom,fmt(theo),fmt(reb),fmt(theo+reb),fmt(prix),fmt(val)];
    }),
    [100,52,52,52,52,82]
  );
  pdfLigneTotale(doc,['TOTAL VALEUR INTRANTS','','','','',fmt(valeurTotale)],[100,52,52,52,52,82]);
}

function pdfATP(doc, d) {
  resetSec();
  const atp=d.atp||{},obj=d.objectifs||{},real=d.realisations||{};
  const cahtp=parseFloat(atp.proj_ca_ht||0),cdhtp=parseFloat(atp.proj_cd_ht||0);
  const cahtr=parseFloat(atp.real_ca_ht||0),cdhtr=parseFloat(atp.real_cd_ht||0);
  const tmbhtp=parseFloat(atp.proj_tmb||0),tmbhtr=parseFloat(atp.taux_marge_brute||0);

  // Calculs totaux objectifs
  const qtyObjTotal = ['C24','C12','F605','F615','F61','HILIO'].reduce((a,c)=>a+(obj[c]||0),0);
  const cahtpCalc   = ['C24','C12','F605','F615','F61','HILIO'].reduce((a,c)=>a+(obj[c]||0)*(PRIX_PF[c]||0),0);

  pdfSection(doc,'Objectifs de production — Projection');
  pdfTableau(doc,['Produit','Qté objectif','Prix vente HT (FCFA)','CAHTP (FCFA)'],
    ['C24','C12','F605','F615','F61','HILIO'].map(c=>[c,fmt(obj[c]||0),fmt(PRIX_PF[c]||0),fmt((obj[c]||0)*(PRIX_PF[c]||0))]),
    [70,90,140,140]
  );
  pdfLigneTotale(doc,['TOTAL',fmt(qtyObjTotal),'',fmt(cahtpCalc)],[70,90,140,140]);

  const qtyRealTotal = ['C24','C12','F605','F615','F61','HILIO'].reduce((a,c)=>a+(real[c]||0),0);
  const cahtrCalc    = ['C24','C12','F605','F615','F61','HILIO'].reduce((a,c)=>a+(real[c]||0)*(PRIX_PF[c]||0),0);

  pdfSection(doc,'Réalisation en cours — Cumulé automatique');
  pdfTableau(doc,['Produit','Qté réalisée','Montant HT (FCFA)','Avancement'],
    ['C24','C12','F605','F615','F61','HILIO'].map(c=>{
      const q=real[c]||0,mt=q*(PRIX_PF[c]||0),om=(obj[c]||0)*(PRIX_PF[c]||0);
      return [c,fmt(q),fmt(mt),om>0?((mt/om)*100).toFixed(1)+' %':'—'];
    }),
    [70,90,140,140]
  );
  pdfLigneTotale(doc,['TOTAL',fmt(qtyRealTotal),fmt(cahtrCalc),cahtpCalc>0?((cahtrCalc/cahtpCalc)*100).toFixed(1)+' %':'—'],[70,90,140,140]);

  // Jauges avancement par format
  pdfSection(doc,'Avancement par format');
  ['C24','C12','F615','F605','F61','HILIO'].forEach(code=>{
    const obj=real[code]||0, ob2=d.objectifs&&d.objectifs[code]||obj*1.2||1;
    if(obj>0||ob2>0) pdfJauge(doc,code,obj,Math.max(ob2,obj));
  });

  // Graphique avancement ATP
  if (charts) {
    try { pdfGraphique(doc, charts.graphiqueAvancementATP(d.objectifs||{}, d.realisations||{}), 'Graphique — Objectifs vs Réalisations ATP', 180); } catch(e) {}
  }
  // Graphique camembert MB
  const mbhtp2 = cahtp - cdhtp;
  if (charts && mbhtp2 > 0) {
    try { pdfGraphique(doc, charts.graphiqueCamembertMB(mbhtp2*(15/35), mbhtp2*(10/35), mbhtp2*(10/35)), 'Graphique — Répartition MBHTP', 200); } catch(e) {}
  }
  pdfSection(doc,'Marges brutes — Projection');
  pdfTableau(doc,['#','Libellé','Prévisionnel (FCFA)',''],
    [['1','CAHTP',fmt(cahtp),''],
     ['2','CDHTP',fmt(cdhtp),''],
     ['3',{text:'MBHTP = CAHTP − CDHTP',bold:true},{text:fmt(cahtp-cdhtp),bold:true},''],
     ['4','TMBHTP = MBHTP / CAHTP','',{text:fmtP(tmbhtp),bold:true}]],
    [25,155,155,105]
  );
  const mbhtp = cahtp - cdhtp;
  const bmfP = mbhtp*(15/35), fsP = mbhtp*(10/35), ammP = mbhtp*(10/35);
  const bmfTxP = tmbhtp*(15/35), fsTxP = tmbhtp*(10/35), ammTxP = tmbhtp*(10/35);
  pdfSection(doc,'Répartition MBHTP prévisionnelle');
  pdfTableau(doc,['Rubrique','Montant (FCFA)','Taux',''],
    [['BMF',fmt(bmfP),fmtP(bmfTxP),''],['Frais de Siège',fmt(fsP),fmtP(fsTxP),''],['Amortissement',fmt(ammP),fmtP(ammTxP),'']],
    [110,145,110,75]
  );
  pdfLigneTotale(doc,['TOTAL RÉPARTITION',fmt(bmfP+fsP+ammP),fmtP(bmfTxP+fsTxP+ammTxP),''],[110,145,110,75]);

  pdfSection(doc,'Marges brutes — Réalisation');
  pdfTableau(doc,['#','Libellé','Réalisé (FCFA)',''],
    [['5','CAHTR',fmt(cahtr),''],
     ['6','CDHTR',fmt(cdhtr),''],
     ['7',{text:'MBHTR = CAHTR − CDHTR',bold:true},{text:fmt(cahtr-cdhtr),bold:true},''],
     ['8','TMBHTR = MBHTR / CAHTR','',{text:fmtP(tmbhtr),bold:true}]],
    [25,155,155,105]
  );
  const mbhtr = cahtr - cdhtr;
  const bmfR = mbhtr*(15/35), fsR = mbhtr*(10/35), ammR = mbhtr*(10/35);
  const bmfTxR = tmbhtr*(15/35), fsTxR = tmbhtr*(10/35), ammTxR = tmbhtr*(10/35);
  pdfSection(doc,'Répartition MBHTR réalisée');
  pdfTableau(doc,['Rubrique','Montant réalisé (FCFA)','Taux réalisé',''],
    [['BMF',fmt(bmfR),fmtP(bmfTxR),''],['Frais de Siège',fmt(fsR),fmtP(fsTxR),''],['Amortissement',fmt(ammR),fmtP(ammTxR),'']],
    [110,145,110,75]
  );
  pdfLigneTotale(doc,['TOTAL RÉPARTITION',fmt(bmfR+fsR+ammR),fmtP(bmfTxR+fsTxR+ammTxR),''],[110,145,110,75]);

  if(d.charges&&Object.values(d.charges).some(v=>parseFloat(v||0)>0)){
    pdfSection(doc,'Charges indirectes (CIHT)');
    pdfTableau(doc,['Nature','Montant (FCFA)','',''],
      [['Salaires',d.charges.salaires],['Électricité',d.charges.electricite],['Carburant',d.charges.carburant],['Loyer',d.charges.loyer],['Maintenance',d.charges.maintenance],['Autres',d.charges.autres]].filter(([,v])=>parseFloat(v||0)>0).map(([l,v])=>[l,fmt(v),'','']),
      [130,155,75,80]
    );
  }
}

function pdfStocks(doc, d) {
  resetSec();
  [1,2,3].forEach(cl=>{
    const arts=(d.articles||[]).filter(a=>parseInt(a.classe)===cl);
    if(!arts.length) return;
    const t={1:'Classe 1 — Consommables de production',2:'Classe 2 — EPI et Pièces de rechange',3:'Classe 3 — Produits finis'};
    pdfSection(doc,t[cl]);
    pdfTableau(doc,['Article','Code','Unité','Stock actuel','Valeur HT (FCFA)','Statut'],
      arts.map(a=>{
        const stock=parseFloat(a.stock_actuel||0);
        const st=stock<=0?'Rupture':a.seuil_alerte&&stock<=a.seuil_alerte?'Faible':'OK';
        return [a.libelle,a.code,a.unite,fmt(stock),fmt(a.valeur_stock_ht||0),
          {text:st,color:st==='Rupture'?C.rouge:st==='Faible'?C.ambre:C.vert,bold:true}];
      }),
      [135,62,42,52,85,58]
    );
  });
}

function pdfTresorerie(doc, d) {
  resetSec();
  pdfSection(doc,'Soldes des comptes');
  pdfTableau(doc,['Compte','Type','Solde (FCFA)',''],
    [...(d.comptes||[]).map(c=>[c.libelle,c.type_compte||'—',fmt(c.solde_fcfa||0),''])
     ,['TOTAL TRÉSORERIE','',{text:fmt((d.comptes||[]).reduce((s,c)=>s+parseFloat(c.solde_fcfa||0),0)),bold:true},'']],
    [160,70,135,75]
  );

  // Graphique flux trésorerie
  if (charts && d.mouvements && d.mouvements.length > 0) {
    try { pdfGraphique(doc, charts.graphiqueFluxTresorerie(d.mouvements), 'Graphique — Flux de trésorerie par compte', 200); } catch(e) {}
  }
  const totalEntrees=(d.mouvements||[]).filter(m=>m.sens==='credit').reduce((a,m)=>a+parseFloat(m.montant_fcfa||0),0);
  const totalSorties=(d.mouvements||[]).filter(m=>m.sens==='debit').reduce((a,m)=>a+parseFloat(m.montant_fcfa||0),0);
  pdfSection(doc,'Brouillard de caisse');
  pdfTableau(doc,['Date','Compte','Libellé','Entrée (FCFA)','Sortie (FCFA)','Solde'],
    (d.mouvements||[]).map(m=>{
      const isC=m.sens==='credit';
      return [fmtD(m.date_mouvement),m.compte_libelle||'—',m.description||'—',
        isC?fmt(m.montant_fcfa||0):'—',
        !isC?fmt(m.montant_fcfa||0):'—',
        fmt(m.solde_apres||0)];
    }),
    [58,82,98,68,68,66]
  );
  pdfLigneTotale(doc,[`TOTAL — ${(d.mouvements||[]).length} mouvement(s)`,'','',fmt(totalEntrees),fmt(totalSorties),''],[58,82,98,68,68,66]);

  // Donut Entrées vs Sorties
  if (totalEntrees>0||totalSorties>0) {
    pdfDonut(doc,'Répartition Entrées / Sorties',
      ['Entrées','Sorties'],
      [totalEntrees,totalSorties]
    );
  }

  // Barres soldes par compte
  if ((d.comptes||[]).length>0) {
    pdfBarChart(doc,'Soldes par compte de trésorerie (FCFA)',
      d.comptes.map(c=>c.libelle?.slice(0,10)||c.code),
      d.comptes.map(c=>Math.abs(parseFloat(c.solde_fcfa||0))),
      {color:'#34D399'}
    );
  }
}

function pdfRebuts(doc, d) {
  resetSec();
  const rebuts = d.rebuts||[];
  pdfSection(doc,'Rebuts par date et intrant');
  if(rebuts.length===0){
    doc.fillColor('#64748B').fontSize(10).font('Helvetica-Oblique')
       .text('Aucun rebut enregistré pour cette période.', 49, doc.y);
    doc.moveDown(0.6);
  } else {
    pdfTableau(doc,['Date','Intrant','Quantité','Prix HT unit.','Valeur HT (FCFA)'],
      rebuts.map(r=>[strDate(r.date)||'—',r.intrant||'—',fmt(r.quantite||0),fmt(r.prix||0),fmt(r.valeur||0)]),
      [65,125,60,70,90]
    );
    const totVal=rebuts.reduce((s,r)=>s+(r.valeur||0),0);
    doc.moveDown(0.5);
    doc.fillColor('#1E293B').fontSize(11).font('Helvetica-Bold')
       .text(`Total valeur des rebuts : ${fmt(totVal)} FCFA`, 45, doc.y, {align:'right',width:doc.page.width-90});
  }
}


// ═══════════════════════════════════════════════
// TENDANCES — Analyse financière avancée
// ═══════════════════════════════════════════════

function pdfTendances(doc, d) {
  resetSec();
  const hist         = d.historique || [];
  const credits_total= d.credits_total || 0;
  const ci_total     = d.ci_total || 0;
  const nbMois       = hist.length || 1;
  const caTotal      = hist.reduce((s,m)=>s+parseFloat(m.ca_ht||0),0);
  const cdTotal      = hist.reduce((s,m)=>s+parseFloat(m.cd_ht||0),0);
  const mbTotal      = hist.reduce((s,m)=>s+parseFloat(m.mb_ht||0),0);
  const caMoyen      = caTotal / nbMois;
  const mbMoyen      = mbTotal / nbMois;
  const tmbMoyen     = caTotal > 0 ? mbTotal/caTotal : 0;

  // Capacités de l'usine
  const HEURES_SHIFT    = 8;    // heures par shift
  const SHIFTS_JOUR     = 2;    // shifts par jour
  const JOURS_OUVRABLES = 26;   // jours/mois
  const HEURES_MOIS     = HEURES_SHIFT * SHIFTS_JOUR * JOURS_OUVRABLES; // 416h

  // Rendements théoriques par format (cartons/heure)
  const REND_THEO = {C12:15, C24:18, F615:20, F605:22, F61:20, HILIO:25};

  // Capacité max théorique mensuelle (cartons)
  const CAP_MAX = {};
  Object.entries(REND_THEO).forEach(([code,rh])=>{CAP_MAX[code]=rh*HEURES_MOIS;});

  // Volumes réels moyens depuis historique
  const volMoyens = d.vol_moyens || {C12:0,C24:0,F615:0,F605:0,F61:0,HILIO:0};

  // ── I. POTENTIEL HORAIRE DE L'USINE ──
  // Graphique jauge utilisation usine
  if (charts && d.jours_moyens > 0) {
    try { pdfGraphique(doc, charts.graphiqueJaugeUsine(d.jours_moyens/26), 'Graphique — Taux utilisation usine', 180); } catch(e) {}
  }
  // Graphique évolution CA
  if (charts && hist.length >= 2) {
    try { pdfGraphique(doc, charts.graphiqueCourbeCA(hist), 'Graphique — Évolution CA HT et MB HT', 220); } catch(e) {}
  }
  pdfSection(doc, "Potentiel horaire et capacite de l'usine");
  pdfTableau(doc,
    ['Parametre','Valeur','Detail'],
    [
      ["Heures productives / shift",        HEURES_SHIFT+" h",      "Temps de production net"],
      ["Shifts / jour",                     SHIFTS_JOUR+" shifts",  "Configuration actuelle"],
      ["Jours ouvres / mois",               JOURS_OUVRABLES+" j",   "Base de calcul mensuelle"],
      ["Heures productives totales / mois", HEURES_MOIS+" h",       "Capacite nominale usine"],
      ["Jours reellement travailles / mois",fmt(d.jours_moyens||0), "Moyenne observee"],
      ["Taux utilisation usine",            d.jours_moyens>0?((d.jours_moyens/JOURS_OUVRABLES)*100).toFixed(1)+" %":"--", d.jours_moyens>0&&(d.jours_moyens/JOURS_OUVRABLES)>=0.85?"Bon niveau":"Marge d'optimisation possible"],
    ],
    [155,90,200]
  );

  // ── II. RENDEMENT PAR FORMAT ──
  pdfSection(doc, "Rendement par format de production");
  pdfTableau(doc,
    ['Format','Rend. theo. (ctn/h)','Vol. moyen/mois','Cap. max/mois','Taux utilisation','Ecart potentiel'],
    Object.entries(REND_THEO).map(([code,rth])=>{
      const volReel = volMoyens[code]||0;
      const capMax  = CAP_MAX[code];
      const txUtil  = capMax > 0 ? volReel/capMax : 0;
      const ecart   = capMax - volReel;
      return [
        code,
        rth+" ctn/h",
        fmt(volReel)+" ctn",
        fmt(capMax)+" ctn",
        {text:fmtP(txUtil), color:txUtil>=0.75?'#166534':txUtil>=0.50?'#92400E':'#991B1B', bold:txUtil>=0.75},
        {text:"+"+fmt(ecart)+" ctn possibles", color:'#0D72B0'},
      ];
    }),
    [55,80,75,75,75,80]
  );
  pdfLigneTotale(doc,[
    "TOTAL","",
    fmt(Object.values(volMoyens).reduce((s,v)=>s+v,0))+" ctn",
    fmt(Object.values(CAP_MAX).reduce((s,v)=>s+v,0))+" ctn",
    fmtP(Object.values(volMoyens).reduce((s,v)=>s+v,0)/Object.values(CAP_MAX).reduce((s,v)=>s+v,0)||0),
    "",
  ],[55,80,75,75,75,80]);

  // Jauges taux utilisation par format
  pdfSection(doc,'Taux utilisation par format');
  Object.entries(REND_THEO).forEach(([code,rth])=>{
    const vol=volMoyens[code]||0, cap=CAP_MAX[code]||1;
    pdfJauge(doc,code,vol,cap,{color:'#0891B2'});
  });

  // ── III. IMPACT CA D'UNE MEILLEURE UTILISATION ──
  pdfSection(doc, "Impact CA d'une meilleure utilisation des capacites");

  const caActuel = caMoyen;
  const scenarios = [
    ["Utilisation a 70%", 0.70],
    ["Utilisation a 80%", 0.80],
    ["Utilisation a 90%", 0.90],
    ["Utilisation a 100% (max)", 1.00],
  ];

  pdfTableau(doc,
    ['Scenario','Vol. total (ctn)','CA HT estime (FCFA)','Gain vs actuel (FCFA)','MB estimee (FCFA)'],
    scenarios.map(([label, tx])=>{
      const volSim = Object.entries(REND_THEO).reduce((s,[code,rh])=>s+rh*HEURES_MOIS*tx,0);
      // Repartition proportionnelle par format
      const caSim = Object.entries(REND_THEO).reduce((s,[code,rh])=>{
        const q = rh*HEURES_MOIS*tx/Object.values(REND_THEO).length;
        return s + q*(PRIX_PF[code]||0);
      },0);
      const mbSim = caSim * tmbMoyen;
      return [
        label,
        fmt(Math.round(volSim))+" ctn",
        fmt(Math.round(caSim)),
        {text:"+"+fmt(Math.round(caSim-caActuel)), color:'#166534'},
        fmt(Math.round(mbSim)),
      ];
    }),
    [115,75,95,95,80]
  );

  // ── IV. DISPONIBILITE MATIERES PREMIERES ──
  pdfSection(doc, "Disponibilite des matieres premieres critiques");

  const stocks_mp = d.stocks_mp || [];
  if (stocks_mp.length > 0) {
    pdfTableau(doc,
      ['Matiere premiere','Stock actuel','Besoin mensuel','Couverture','Statut','Fournisseur'],
      stocks_mp.map(mp=>{
        const couv = mp.besoin_mensuel > 0 ? mp.stock/mp.besoin_mensuel : 0;
        return [
          mp.libelle,
          fmt(mp.stock)+" "+mp.unite,
          fmt(mp.besoin_mensuel)+" "+mp.unite,
          couv.toFixed(1)+" mois",
          {text: couv>=2?"OK": couv>=1?"Surveiller":"CRITIQUE",
           color: couv>=2?"#166534":couv>=1?"#92400E":"#991B1B", bold:couv<1},
          mp.fournisseur||"--",
        ];
      }),
      [100,65,65,55,65,90]
    );
  } else {
    doc.fillColor('#64748B').fontSize(9.5).font('Helvetica-Oblique')
       .text("Saisissez les stocks dans la page Stocks pour activer cette analyse.", 49, doc.y, {width:doc.page.width-94});
    doc.moveDown(0.5);
  }

  // Barres couverture stocks MP
  if (stocks_mp.length>0) {
    const mpCodes  = stocks_mp.map(m=>m.libelle.slice(0,8));
    const mpCouvs  = stocks_mp.map(m=>m.besoin_mensuel>0?Math.min(3,m.stock/m.besoin_mensuel):0);
    pdfBarChart(doc,'Couverture stocks (mois)',mpCodes,mpCouvs,{color:'#34D399',unite:' mois'});
  }

  // ── V. OPTIMISATION TEMPS DE TRAVAIL ──
  pdfSection(doc, "Optimisation du temps de travail");
  pdfTableau(doc,
    ['Action','Impact attendu','Priorite','Delai mise en oeuvre'],
    [
      ["Reduire les arrets non planifies (pannes)",           "+5 a +8% capacite",    "Haute",   "1 a 3 mois"],
      ["Optimiser les changements de format",                 "+3 a +5% capacite",    "Moyenne", "1 mois"],
      ["Ajouter un 3eme shift (si demande suffisante)",       "+50% capacite",        "Haute",   "3 a 6 mois"],
      ["Reduire les arrets pour rupture MP",                  "+2 a +4% capacite",    "Haute",   "Immediat"],
      ["Standardiser les procedures de nettoyage",            "+1 a +2% capacite",    "Basse",   "1 mois"],
      ["Maintenance preventive reguliere",                    "+3 a +5% disponibilite","Haute",  "Continu"],
    ],
    [155,90,55,120]
  );

  // ── VI. CAPACITE DE REMBOURSEMENT ──
  pdfSection(doc, "Capacite de remboursement de la dette");

  const excedentBrut  = mbMoyen - (ci_total/nbMois||0);
  const reserveExploit= excedentBrut * 0.30;
  const capaciteRemb  = Math.max(0, excedentBrut - reserveExploit);
  const coefRemb      = credits_total > 0 ? capaciteRemb/credits_total : 0;
  const dureeRemb     = capaciteRemb > 0 ? Math.ceil(credits_total/capaciteRemb) : 0;

  pdfTableau(doc,
    ['Indicateur','Valeur (FCFA)','Base de calcul'],
    [
      ["MB mensuelle moyenne",         fmt(mbMoyen),          "Moyenne des mois analyses"],
      ["Charges indirectes mensuelles",fmt(ci_total/nbMois||0),"CI saisies ATP"],
      ["Excedent Brut Exploitation",   fmt(excedentBrut),     "MB - Charges indirectes"],
      ["Reserve exploitation (30%)",   fmt(reserveExploit),   "Securite operationnelle"],
      [{text:"Capacite de remboursement",bold:true},{text:fmt(capaciteRemb),bold:true},"EBE - Reserve"],
    ],
    [170,110,160]
  );

  if (credits_total > 0) {
    // Graphique plan remboursement
    if (charts && capaciteRemb > 0) {
      try { pdfGraphique(doc, charts.graphiqueRemboursement(credits_total, capaciteRemb), 'Graphique — Évolution du capital restant dû', 200); } catch(e) {}
    }
    doc.moveDown(0.5);
    pdfSection(doc, "Coefficient et plan de remboursement");
    pdfTableau(doc,
      ['Parametre','Valeur','Interpretation'],
      [
        ["Total des dettes",             fmt(credits_total)+" FCFA", "Credits actifs SINEX SA"],
        ["Capacite mensuelle",           fmt(capaciteRemb)+" FCFA",  "Disponible chaque mois"],
        [{text:"Coefficient remboursement",bold:true},{text:coefRemb.toFixed(4),bold:true,color:coefRemb>=0.05?'#166534':'#92400E'},coefRemb>=0.10?"Solide (>=10%/mois)":coefRemb>=0.05?"Acceptable (5-10%/mois)":"Faible (<5%/mois)"],
        [{text:"Duree remboursement",bold:true},{text:dureeRemb>0?dureeRemb+" mois":"N/A",bold:true},dureeRemb>0?"Soit "+Math.ceil(dureeRemb/12)+" an(s) et "+(dureeRemb%12)+" mois":"Capacite insuffisante"],
        ["Frequence recommandee",        capaciteRemb>0?"Mensuelle":"Trimestrielle", capaciteRemb>=credits_total*0.10?"Remboursement accelere possible":"Remboursement standard"],
      ],
      [160,110,170]
    );

    // Plan 12 mois
    if (dureeRemb > 0) {
      pdfSection(doc, "Plan de remboursement previsionnel (12 mois)");
      const lignes = [];
      let restant = credits_total;
      const now = new Date();
      for (let i=1; i<=Math.min(dureeRemb,12); i++) {
        const d2 = new Date(now.getFullYear(), now.getMonth()+i, 1);
        const label = "Mois "+i+" - "+d2.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
        const remb  = Math.min(capaciteRemb, restant);
        restant    -= remb;
        lignes.push([label, fmt(capaciteRemb)+" F", fmt(remb)+" F", fmt(Math.max(0,restant))+" F",
          restant<=0?{text:"Solde",bold:true,color:'#166534'}:"En cours"]);
        if (restant<=0) break;
      }
      pdfTableau(doc, ['Periode','Capacite dispo.','Remboursement','Capital restant','Statut'], lignes, [110,75,75,85,70]);
    }
  }
}

async function xlTendances(wb, d, mois) {
  const ws = wb.addWorksheet('Tendances');
  ws.columns = [{key:'a',width:40},{key:'b',width:20},{key:'c',width:20},{key:'d',width:20}];
  xlHeader(ws,'ANALYSE DES TENDANCES ET OPTIMISATION',4);
  let sec=1;

  const hist=d.historique||[], credits_total=d.credits_total||0, ci_total=d.ci_total||0;
  const nbMois=hist.length||1;
  const caTotal=hist.reduce((s,m)=>s+parseFloat(m.ca_ht||0),0);
  const cdTotal=hist.reduce((s,m)=>s+parseFloat(m.cd_ht||0),0);
  const mbTotal=hist.reduce((s,m)=>s+parseFloat(m.mb_ht||0),0);
  const caMoyen=caTotal/nbMois, cdMoyen=cdTotal/nbMois;
  const tmbMoyen=caTotal>0?mbTotal/caTotal:0;
  const excedent=mbTotal/nbMois-(ci_total/nbMois||0);
  const capaciteRemb=Math.max(0,excedent*0.70);
  const coefRemb=credits_total>0?capaciteRemb/credits_total:0;
  const dureeRemb=capaciteRemb>0?Math.ceil(credits_total/capaciteRemb):0;

  xlSection(ws,sec++,"Leviers d'augmentation du CA",4);
  xlEntete(ws,['Produit','Marge unitaire (FCFA)','Taux de marge','Recommandation']);
  Object.entries({C12:PRIX_PF.C12-CD_UNIT.C12,C24:PRIX_PF.C24-CD_UNIT.C24,F615:PRIX_PF.F615-CD_UNIT.F615,F605:PRIX_PF.F605-CD_UNIT.F605,F61:PRIX_PF.F61-CD_UNIT.F61,HILIO:PRIX_PF.HILIO-CD_UNIT.HILIO})
    .sort((a,b)=>b[1]-a[1]).forEach(([code,marge])=>{
      const tx=marge/PRIX_PF[code];
      xlLigne(ws,[code,fmt(marge),fmtP(tx),tx>=0.40?'⭐ Prioritaire':tx>=0.25?'✓ Favorable':'⚠ Optimiser']);
    });

  xlSection(ws,sec++,"Simulation augmentation CA",4);
  xlEntete(ws,['Scénario','CA simulé (FCFA)','MB simulée (FCFA)','TMB estimé']);
  [['Base',1,1],['+10% volume',1.1,1.05],['+20% volume',1.2,1.10],['+30% volume',1.3,1.15],['+10% prix',1.1,1.0]].forEach(([s,cv,cc])=>{
    xlLigne(ws,[s,fmt(caMoyen*cv),fmt(caMoyen*cv-cdMoyen*cc),fmtP((caMoyen*cv-cdMoyen*cc)/(caMoyen*cv))]);
  });

  xlSection(ws,sec++,"Capacite de remboursement",4);
  xlEntete(ws,['Indicateur','Valeur (FCFA)','','']);
  xlLigne(ws,['MB mensuelle moyenne',fmt(mbTotal/nbMois),'','']);
  xlLigne(ws,['Charges indirectes mensuelles',fmt(ci_total/nbMois||0),'','']);
  xlLigne(ws,['Excedent Brut Exploitation',fmt(excedent),'',''],{bold:true});
  xlLigne(ws,['Capacite remboursement mensuelle',fmt(capaciteRemb),'',''],{bold:true,bg:'#0F172A',color:'#F8FAFC'});

  xlSection(ws,sec++,"Coefficient de remboursement",4);
  xlEntete(ws,['Paramètre','Valeur','Interprétation','']);
  xlLigne(ws,['Total des dettes',fmt(credits_total)+' FCFA','','']);
  xlLigne(ws,['Coefficient de remboursement',coefRemb.toFixed(4),coefRemb>=0.10?'Solide':coefRemb>=0.05?'Acceptable':'Faible',''],{bold:true});
  xlLigne(ws,['Durée de remboursement',dureeRemb>0?dureeRemb+' mois':'N/A',dureeRemb>0?Math.ceil(dureeRemb/12)+' an(s)':'','']);
  xlLigne(ws,['Fréquence recommandée',capaciteRemb>0?'Mensuelle':'Trimestrielle','','']);

  xlSignature(ws,d.dg_nom,4);
  return wb.xlsx.writeBuffer();
}

module.exports = { genererExcel, genererPDF };
