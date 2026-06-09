/**
 * Générateur de rapports PDF et Excel — SINEX-SA
 * Design sobre, police agrandie, sections en chiffres romains
 */
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs   = require('fs');

const LOGO_PATH = path.join(__dirname, 'logo_sinex.png');

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
  doc.fillColor('#0F172A').fontSize(11).font('Helvetica-Bold')
     .text('Le Directeur Général', 45+W/2, sy, {width:W/2, align:'right'});
  doc.fillColor('#334155').fontSize(11).font('Helvetica')
     .text(dgNom||'Boumzina Raïna', 45+W/2, sy+16, {width:W/2, align:'right'});
  doc.moveDown(2.5);
  doc.moveTo(doc.page.width-180, doc.y).lineTo(doc.page.width-45, doc.y).stroke('#334155');
  doc.fillColor('#94A3B8').fontSize(9).font('Helvetica-Oblique')
     .text('Signature & Cachet', doc.page.width-180, doc.y+4, {width:135, align:'center'});

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

module.exports = { genererExcel, genererPDF };
