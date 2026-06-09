/**
 * Générateur de rapports PDF et Excel — SINEX-SA
 * Avec logo officiel, en-tête complet, sections numérotées en chiffres romains
 */
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const LOGO_PATH = path.join(__dirname, 'logo_sinex.png');

const PRIX_PF = {C12:2116.10,C24:2033.90,F615:1032.00,F605:429.00,F61:1186.00,HILIO:169.00};
const CD_UNIT = {C12:1037,C24:1136,F615:450.79,F605:282.79,F61:438.79,HILIO:75.23};

// Formatage nombres avec espace comme séparateur de milliers
const fmt  = n => {
  const v = Math.round(parseFloat(n)||0);
  return v.toLocaleString('fr-FR').replace(/\u202f/g,' ').replace(/\u00a0/g,' ');
};
const fmtP = n => ((parseFloat(n)||0)*100).toFixed(2)+'%';
const fmtD = d => { try{return new Date(d).toLocaleDateString('fr-FR');}catch{return'—';} };

const ROMAINS = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];

const TITRES_TYPE = {
  production:'RAPPORT DE PRODUCTION MENSUEL',
  atp:'RAPPORT FINANCIER ATP',
  stocks:'ÉTAT DES STOCKS',
  tresorerie:'RAPPORT DE TRÉSORERIE',
  rebuts:'RAPPORT DES REBUTS',
  tendances:'ANALYSE DES TENDANCES',
};
const COULEURS_TYPE = {
  production:'#22D3EE',atp:'#F59E0B',stocks:'#34D399',
  tresorerie:'#34D399',rebuts:'#EF4444',tendances:'#8B5CF6',
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

function col(n) { return String.fromCharCode(64+Math.min(n,26)); }

function xlHeader(ws, titre, ncols) {
  // Logo (placeholder texte dans Excel)
  ws.mergeCells(`A1:${col(ncols)}3`);
  const c=ws.getCell('A1');
  c.value = 'Société Industrielle d\'Ingénierie et d\'Exploitation (SINEX-SA)\n' +
    'TEL: (+228) 93 88 79 92 / 91 49 25 94  –  E-mail: ssinex.sa@gmail.com\n' +
    'S/C BP. 7518 Défalé-Niamtougou, Quartier Tamdè (TOGO), Rue Ancienne Nationale';
  c.font = {bold:true, size:11, color:{argb:'FF0F172A'}};
  c.alignment = {horizontal:'center', vertical:'middle', wrapText:true};
  c.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F5F9'}};
  ws.getRow(1).height = 50;

  ws.addRow([]);

  ws.mergeCells(`A5:${col(ncols)}5`);
  const ct=ws.getCell('A5');
  ct.value = titre + ' — ' + new Date().toLocaleDateString('fr-FR');
  ct.font = {bold:true, size:13, color:{argb:'FF0891B2'}};
  ct.alignment = {horizontal:'center', vertical:'middle'};
  ct.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF0F172A'}};
  ws.getRow(5).height = 24;
  ws.addRow([]);
}

function xlSection(ws, num, titre, ncols, couleur='1E3A5F') {
  ws.addRow([]);
  ws.mergeCells(`A${ws.rowCount}:${col(ncols)}${ws.rowCount}`);
  const cell = ws.getCell(`A${ws.rowCount}`);
  cell.value = `${ROMAINS[num-1] || num}. ${titre}`;
  cell.font = {bold:true, size:11, color:{argb:'FF22D3EE'}};
  cell.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF'+couleur}};
  cell.alignment = {horizontal:'left'};
  ws.getRow(ws.rowCount).height = 18;
  ws.addRow([]);
}

function xlEntete(ws, labels, couleur='0891B2') {
  const row = ws.addRow(labels);
  row.eachCell(cell => {
    cell.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF'+couleur}};
    cell.font = {bold:true, color:{argb:'FFFFFFFF'}, size:10};
    cell.alignment = {horizontal:'center',vertical:'middle',wrapText:true};
    cell.border = {bottom:{style:'medium',color:{argb:'FFCBD5E1'}}};
  });
  row.height = 20;
}

function xlLigne(ws, vals, opts={}) {
  const row = ws.addRow(vals);
  row.eachCell((cell,i) => {
    cell.border = {top:{style:'thin',color:{argb:'FFCBD5E1'}},left:{style:'thin',color:{argb:'FFCBD5E1'}},bottom:{style:'thin',color:{argb:'FFCBD5E1'}},right:{style:'thin',color:{argb:'FFCBD5E1'}}};
    if (opts.bold) cell.font = {...(cell.font||{}),bold:true};
    if (opts.couleurs?.[i]) cell.font = {...(cell.font||{}),color:{argb:'FF'+opts.couleurs[i]}};
    if (opts.bg) cell.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF'+opts.bg}};
    if (opts.aligns?.[i]) cell.alignment = {horizontal:opts.aligns[i]};
  });
  return row;
}

function xlSignature(ws, dgNom, ncols) {
  ws.addRow([]); ws.addRow([]);
  ws.mergeCells(`A${ws.rowCount}:${col(ncols)}${ws.rowCount}`);
  const c = ws.getCell(`A${ws.rowCount}`);
  c.value = `Fait à Défalé-Niamtougou, le ${new Date().toLocaleDateString('fr-FR')}`;
  c.font = {italic:true, size:10, color:{argb:'FF64748B'}};
  c.alignment = {horizontal:'left'};
  ws.addRow([]);
  ws.mergeCells(`A${ws.rowCount}:${col(ncols)}${ws.rowCount}`);
  const c2 = ws.getCell(`A${ws.rowCount}`);
  c2.value = `Le Directeur Général : ${dgNom||'Boumzina Raïna'}`;
  c2.font = {bold:true, size:11, color:{argb:'FF0F172A'}};
  c2.alignment = {horizontal:'right'};
}

// ── Excel Production ──────────────────────────
async function xlProduction(wb, d, mois) {
  const ws = wb.addWorksheet('Production');
  ws.columns = [
    {key:'a',width:14},{key:'b',width:9},{key:'c',width:9},{key:'d',width:9},
    {key:'e',width:9},{key:'f',width:9},{key:'g',width:9},{key:'h',width:8},
    {key:'i',width:13},{key:'j',width:20},
  ];
  xlHeader(ws,'RAPPORT DE PRODUCTION MENSUEL — '+mois,10);

  xlSection(ws,1,'Saisies journalières',10);
  xlEntete(ws,['Date','C12','C24','F6/1,5L','F6/0,5L','F6/1L','HILIO','Jours','Statut','Opérateur']);
  (d.saisies||[]).forEach((s,i)=>{
    const row=xlLigne(ws,[s.date_production?.slice(0,10)||'—',s.c12||0,s.c24||0,s.f615||0,s.f605||0,s.f61||0,s.hilio||0,s.jours_ouvres||1,s.statut==='valide'?'✓ Validé':'En attente',s.saisi_par_nom||'—']);
    if(i%2===0) row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
    if(s.statut==='valide') row.getCell(9).font={color:{argb:'FF059669'},bold:true};
  });

  xlSection(ws,2,'Totaux — Productions validées',10,'059669');
  xlEntete(ws,['Format','Unité','Qté produite','Contenu','CA HT (FCFA)','CD HT (FCFA)','MB HT (FCFA)','TMB HT','',''],'059669');
  [['C12','cartons',12,'btl 1,5L'],['C24','cartons',24,'btl 0,5L'],['F615','fardeaux',6,'btl 1,5L'],['F605','fardeaux',6,'btl 0,5L'],['F61','fardeaux',6,'btl 1L'],['HILIO','packs',30,'sachets']].forEach(([code,unite,mult,desc])=>{
    const q=(d.totaux||{})[code.toLowerCase()]||0,ca=q*(PRIX_PF[code]||0),cd=q*(CD_UNIT[code]||0);
    xlLigne(ws,[code,unite,fmt(q),q*mult+' '+desc,fmt(ca),fmt(cd),fmt(ca-cd),ca>0?fmtP((ca-cd)/ca):'—','','']);
  });
  const t=d.totaux||{};
  const caT=Object.entries(t).reduce((s,[k,v])=>s+(v||0)*(PRIX_PF[k.toUpperCase()]||0),0);
  const cdT=Object.entries(t).reduce((s,[k,v])=>s+(v||0)*(CD_UNIT[k.toUpperCase()]||0),0);
  xlLigne(ws,['TOTAL','','','',fmt(caT),fmt(cdT),fmt(caT-cdT),caT>0?fmtP((caT-cdT)/caT):'—','',''],{bold:true,bg:'0F172A',couleurs:{5:'22D3EE',6:'EF4444',7:'34D399'}});

  xlSection(ws,3,'Consommation réelle des intrants',10,'D97706');
  xlEntete(ws,['Intrant','Code','Consommé théo.','Rebuts','Total réel','Prix HT','Valeur HT (FCFA)','','',''],'D97706');
  [['Préformes 32g','PREF_32G',53],['Préformes 17g','PREF_17G',28],['Bouchons vert','BOUCH_VERT',5],['Étiquettes 1,5L','ETI_15L',9],['Étiquettes 0,5L','ETI_05L',6],['Étiquettes 1L','ETI_1L',7],['Cartons C12','CTN_15L',233],['Cartons C24','CTN_05L',200]].forEach(([nom,code,prix])=>{
    const theo=(d.consommations_cumulees||{})[code]||0,reb=(d.rebuts_cumules||{})[code]||0;
    xlLigne(ws,[nom,code,fmt(theo),fmt(reb),fmt(theo+reb),fmt(prix),fmt((theo+reb)*prix),'','','']);
  });

  xlSignature(ws,d.dg_nom,10);
  return wb.xlsx.writeBuffer();
}

// ── Excel ATP ─────────────────────────────────
async function xlATP(wb, d, mois) {
  const ws = wb.addWorksheet('ATP');
  ws.columns = [{key:'a',width:38},{key:'b',width:22},{key:'c',width:22},{key:'d',width:14}];
  xlHeader(ws,'RAPPORT FINANCIER ATP — '+mois,4);

  const atp=d.atp||{},obj=d.objectifs||{},real=d.realisations||{};
  const cahtp=parseFloat(atp.proj_ca_ht||0),cdhtp=parseFloat(atp.proj_cd_ht||0);
  const cahtr=parseFloat(atp.real_ca_ht||0),cdhtr=parseFloat(atp.real_cd_ht||0);
  const tmbhtp=parseFloat(atp.proj_tmb||0),tmbhtr=parseFloat(atp.taux_marge_brute||0);

  xlSection(ws,1,'Objectifs de production — Projection',4,'D97706');
  xlEntete(ws,['Produit','Qté objectif','Prix vente HT (FCFA)','CAHTP (FCFA)'],'D97706');
  ['C24','C12','F605','F615','F61','HILIO'].forEach(c=>{
    const q=obj[c]||0;
    xlLigne(ws,[c,fmt(q),fmt(PRIX_PF[c]||0),fmt(q*(PRIX_PF[c]||0))]);
  });
  xlLigne(ws,['TOTAL CAHTP','','',fmt(cahtp)],{bold:true,bg:'0F172A',couleurs:{4:'22D3EE'}});

  xlSection(ws,2,'Réalisation en cours — Cumulé automatique',4,'059669');
  xlEntete(ws,['Produit','Qté réalisée','Montant HT (FCFA)','Avancement'],'059669');
  ['C24','C12','F605','F615','F61','HILIO'].forEach(c=>{
    const q=real[c]||0,mt=q*(PRIX_PF[c]||0),om=(obj[c]||0)*(PRIX_PF[c]||0);
    xlLigne(ws,[c,fmt(q),fmt(mt),om>0?((mt/om)*100).toFixed(1)+'%':'—']);
  });
  xlLigne(ws,['TOTAL CAHTR','',fmt(cahtr),cahtp>0?((cahtr/cahtp)*100).toFixed(1)+'%':'—'],{bold:true,bg:'0F172A',couleurs:{3:'34D399'}});

  xlSection(ws,3,'Marges brutes — Projection',4,'0891B2');
  xlEntete(ws,['#','Libellé','Montant prévisionnel (FCFA)','']);
  xlLigne(ws,['1','CAHTP',fmt(cahtp),''],{couleurs:{3:'22D3EE'}});
  xlLigne(ws,['2','CDHTP',fmt(cdhtp),''],{couleurs:{3:'EF4444'}});
  xlLigne(ws,['3','MBHTP = CAHTP − CDHTP',fmt(cahtp-cdhtp),''],{bold:true,couleurs:{3:'F59E0B'}});
  xlLigne(ws,['4','TMBHTP = MBHTP / CAHTP','',fmtP(tmbhtp)],{bold:true,couleurs:{4:'F59E0B'}});
  ws.addRow([]);
  xlEntete(ws,['Rubrique','Montant (FCFA)','Taux',''],'7C3AED');
  const bmfP=tmbhtp>0?(cahtp*0.35)/(tmbhtp*0.15):0,fsP=tmbhtp>0?(cahtp*0.35)/(tmbhtp*0.10):0;
  xlLigne(ws,['BMF',fmt(bmfP),fmtP(tmbhtp*0.15/0.35),'']);
  xlLigne(ws,['Frais de Siège',fmt(fsP),fmtP(tmbhtp*0.10/0.35),'']);
  xlLigne(ws,['Amortissement',fmt(fsP),fmtP(tmbhtp*0.10/0.35),'']);
  xlLigne(ws,['TOTAL',fmt(bmfP+fsP+fsP),'32%',''],{bold:true,bg:'0F172A',couleurs:{2:'7C3AED'}});

  xlSection(ws,4,'Marges brutes — Réalisation',4,'059669');
  xlEntete(ws,['#','Libellé','Montant réalisé (FCFA)',''],'059669');
  xlLigne(ws,['5','CAHTR',fmt(cahtr),''],{couleurs:{3:'34D399'}});
  xlLigne(ws,['6','CDHTR',fmt(cdhtr),''],{couleurs:{3:'EF4444'}});
  xlLigne(ws,['7','MBHTR = CAHTR − CDHTR',fmt(cahtr-cdhtr),''],{bold:true,couleurs:{3:'34D399'}});
  xlLigne(ws,['8','TMBHTR = MBHTR / CAHTR','',fmtP(tmbhtr)],{bold:true,couleurs:{4:'34D399'}});
  ws.addRow([]);
  xlEntete(ws,['Rubrique','Montant réalisé (FCFA)','Taux réalisé',''],'059669');
  const bmfR=tmbhtr>0?(cahtr*0.35)/(tmbhtr*0.15):0,fsR=tmbhtr>0?(cahtr*0.35)/(tmbhtr*0.10):0;
  xlLigne(ws,['BMF',fmt(bmfR),fmtP(tmbhtr*0.15/0.35),'']);
  xlLigne(ws,['Frais de Siège',fmt(fsR),fmtP(tmbhtr*0.10/0.35),'']);
  xlLigne(ws,['Amortissement',fmt(fsR),fmtP(tmbhtr*0.10/0.35),'']);
  xlLigne(ws,['TOTAL',fmt(bmfR+fsR+fsR),fmtP((bmfR+fsR+fsR)>0?0.32:0),''],{bold:true,bg:'0F172A',couleurs:{2:'34D399'}});

  if(d.charges&&Object.values(d.charges).some(v=>parseFloat(v)>0)){
    xlSection(ws,5,'Charges indirectes (CIHT)',4,'7C3AED');
    xlEntete(ws,['Nature','Montant (FCFA)','',''],'7C3AED');
    [['Salaires',d.charges.salaires],['Électricité',d.charges.electricite],['Carburant',d.charges.carburant],['Loyer',d.charges.loyer],['Maintenance',d.charges.maintenance],['Autres',d.charges.autres]].forEach(([l,v])=>{if(parseFloat(v||0)>0)xlLigne(ws,[l,fmt(v),'','']);});
    xlLigne(ws,['TOTAL CIHT',fmt(d.totalCI||0),'',''],{bold:true,bg:'0F172A',couleurs:{2:'8B5CF6'}});
  }

  xlSignature(ws,d.dg_nom,4);
  return wb.xlsx.writeBuffer();
}

// ── Excel Stocks ──────────────────────────────
async function xlStocks(wb, d, mois) {
  const ws1 = wb.addWorksheet('Stocks actuels');
  ws1.columns=[{key:'a',width:35},{key:'b',width:14},{key:'c',width:9},{key:'d',width:10},{key:'e',width:14},{key:'f',width:14},{key:'g',width:18},{key:'h',width:13},{key:'i',width:12}];
  xlHeader(ws1,'ÉTAT DES STOCKS — '+mois,9);
  let sec=1;
  [1,2,3].forEach(cl=>{
    const arts=(d.articles||[]).filter(a=>parseInt(a.classe)===cl);
    if(!arts.length) return;
    const titres={1:'Classe 1 — Consommables de production',2:'Classe 2 — EPI et Pièces de rechange',3:'Classe 3 — Produits finis'};
    const coul={1:'0891B2',2:'7C3AED',3:'059669'};
    xlSection(ws1,sec++,titres[cl],9,coul[cl]);
    xlEntete(ws1,['Article','Code','Cl.','Unité','Stock actuel','Prix HT','Valeur HT','Seuil alerte','Statut'],coul[cl]);
    arts.forEach((a,i)=>{
      const stock=parseFloat(a.stock_actuel||0),statut=stock<=0?'Rupture':a.seuil_alerte&&stock<=a.seuil_alerte?'Faible':'OK';
      const row=xlLigne(ws1,[a.libelle,a.code,cl,a.unite,fmt(stock),fmt(a.prix_unitaire_ht||0),fmt(a.valeur_stock_ht||0),a.seuil_alerte||0,statut]);
      if(i%2===0) row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
      row.getCell(9).font={color:{argb:statut==='Rupture'?'FFDC2626':statut==='Faible'?'FFD97706':'FF059669'},bold:true};
    });
  });
  xlSignature(ws1,d.dg_nom,9);

  const ws2=wb.addWorksheet('Mouvements');
  ws2.columns=[{key:'a',width:13},{key:'b',width:30},{key:'c',width:8},{key:'d',width:10},{key:'e',width:13},{key:'f',width:16},{key:'g',width:30}];
  xlHeader(ws2,'MOUVEMENTS DE STOCK — '+mois,7);
  xlSection(ws2,1,'Historique des entrées et sorties',7);
  xlEntete(ws2,['Date','Article','Cl.','Type','Quantité','Valeur HT','Motif']);
  (d.mouvements||[]).forEach((m,i)=>{
    const row=xlLigne(ws2,[m.date_mouvement?.slice(0,10)||'—',m.article_libelle||'—',m.classe,m.type_mouvement==='entree'?'↑ Entrée':'↓ Sortie',fmt(m.quantite),fmt(m.valeur_ht||0),m.motif||'—']);
    if(i%2===0) row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
    row.getCell(4).font={color:{argb:m.type_mouvement==='entree'?'FF059669':'FFDC2626'},bold:true};
  });
  return wb.xlsx.writeBuffer();
}

// ── Excel Trésorerie ──────────────────────────
async function xlTresorerie(wb, d, mois) {
  const ws=wb.addWorksheet('Trésorerie');
  ws.columns=[{key:'a',width:13},{key:'b',width:22},{key:'c',width:30},{key:'d',width:16},{key:'e',width:16},{key:'f',width:18}];
  xlHeader(ws,'RAPPORT DE TRÉSORERIE — '+mois,6);
  xlSection(ws,1,'Soldes des comptes',6,'34D399');
  xlEntete(ws,['Compte','Type','Banque','Solde (FCFA)','',''],'34D399');
  (d.comptes||[]).forEach((c,i)=>{
    const row=xlLigne(ws,[c.libelle,c.type_compte||'—',c.banque||'—',fmt(c.solde_fcfa||0),'','']);
    if(i%2===0) row.eachCell(c2=>{c2.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
    row.getCell(4).font={bold:true,color:{argb:'FF22D3EE'}};
  });
  xlLigne(ws,['TOTAL TRÉSORERIE','','',fmt((d.comptes||[]).reduce((s,c)=>s+parseFloat(c.solde_fcfa||0),0)),'',''],{bold:true,bg:'0F172A',couleurs:{4:'34D399'}});
  xlSection(ws,2,'Brouillard de caisse',6,'0891B2');
  xlEntete(ws,['Date','Compte','Libellé','Entrée (FCFA)','Sortie (FCFA)','Solde cumulé']);
  (d.mouvements||[]).forEach((m,i)=>{
    const isC=m.sens==='credit';
    const row=xlLigne(ws,[fmtD(m.date_mouvement),m.compte_libelle||'—',m.description||'—',isC?fmt(m.montant_fcfa||0):'',!isC?fmt(m.montant_fcfa||0):'',fmt(m.solde_apres||0)]);
    if(i%2===0) row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
    if(isC) row.getCell(4).font={color:{argb:'FF059669'},bold:true};
    else row.getCell(5).font={color:{argb:'FFDC2626'},bold:true};
    row.getCell(6).font={color:{argb:'FF22D3EE'},bold:true};
  });
  xlSignature(ws,d.dg_nom,6);
  return wb.xlsx.writeBuffer();
}

// ── Excel Rebuts ──────────────────────────────
async function xlRebuts(wb, d, mois) {
  const ws=wb.addWorksheet('Rebuts');
  ws.columns=[{key:'a',width:13},{key:'b',width:28},{key:'c',width:14},{key:'d',width:14},{key:'e',width:16}];
  xlHeader(ws,'RAPPORT DES REBUTS — '+mois,5);
  xlSection(ws,1,'Rebuts par date et intrant',5,'DC2626');
  xlEntete(ws,['Date','Intrant','Quantité','Prix HT unit.','Valeur HT (FCFA)'],'DC2626');
  const rebuts=d.rebuts||[];
  rebuts.forEach((r,i)=>{
    const row=xlLigne(ws,[r.date?.slice(0,10)||'—',r.intrant||'—',fmt(r.quantite||0),fmt(r.prix||0),fmt(r.valeur||0)]);
    if(i%2===0) row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
    row.getCell(5).font={color:{argb:'FFDC2626'}};
  });
  const totVal=rebuts.reduce((s,r)=>s+(r.valeur||0),0);
  xlLigne(ws,['TOTAL','',fmt(rebuts.reduce((s,r)=>s+(r.quantite||0),0)),'',fmt(totVal)],{bold:true,bg:'0F172A',couleurs:{5:'EF4444'}});
  xlSignature(ws,d.dg_nom,5);
  return wb.xlsx.writeBuffer();
}

// ═══════════════════════════════════════════════
// PDF — design moderne avec logo officiel
// ═══════════════════════════════════════════════

async function genererPDF(type, donnees, mois) {
  return new Promise((resolve,reject) => {
    try {
      const doc = new PDFDocument({margin:40, size:'A4'});
      const bufs = [];
      doc.on('data', b => bufs.push(b));
      doc.on('end', () => resolve(Buffer.concat(bufs)));
      doc.on('error', reject);

      drawEntete(doc, type, mois, donnees.dg_nom);

      switch(type) {
        case 'production': pdfProduction(doc, donnees); break;
        case 'atp':        pdfATP(doc, donnees); break;
        case 'stocks':     pdfStocks(doc, donnees); break;
        case 'tresorerie': pdfTresorerie(doc, donnees); break;
        case 'rebuts':     pdfRebuts(doc, donnees); break;
        default:           pdfProduction(doc, donnees);
      }

      drawSignature(doc, donnees.dg_nom);
      doc.end();
    } catch(e) { reject(e); }
  });
}

function drawEntete(doc, type, mois, dgNom) {
  const W = doc.page.width;
  const couleur = COULEURS_TYPE[type] || '#22D3EE';

  // Fond entête
  doc.rect(0, 0, W, 90).fill('#F8FAFC');
  doc.rect(0, 0, 5, 90).fill(couleur);

  // Logo
  try {
    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, 15, 8, {width:70, height:70});
    }
  } catch(e) {}

  // Informations société
  const tx = 95;
  doc.fillColor('#0F172A').fontSize(12).font('Helvetica-Bold')
     .text('Société Industrielle d\'Ingénierie et d\'Exploitation (SINEX-SA)', tx, 12, {width: W-tx-40});
  doc.fillColor('#475569').fontSize(8.5).font('Helvetica')
     .text('TEL: (+228) 93 88 79 92 / 91 49 25 94  –  E-mail: ssinex.sa@gmail.com', tx, 32, {width: W-tx-40});
  doc.fillColor('#64748B').fontSize(8)
     .text('S/C BP. 7518 Défalé-Niamtougou, Quartier Tamdè (TOGO), Rue Ancienne Nationale', tx, 46, {width: W-tx-40});
  doc.fillColor('#94A3B8').fontSize(7.5)
     .text(`Document généré le ${new Date().toLocaleDateString('fr-FR')} par ${dgNom||'Boumzina Raïna'}`, tx, 62, {width: W-tx-40});

  // Ligne séparatrice
  doc.rect(0, 90, W, 3).fill(couleur);

  // Titre rapport
  doc.rect(0, 93, W, 32).fill('#0F172A');
  doc.fillColor(couleur).fontSize(13).font('Helvetica-Bold')
     .text(`${TITRES_TYPE[type]||'RAPPORT'} — ${mois}`, 40, 103, {align:'center', width: W-80});

  doc.rect(0, 125, W, 2).fill(couleur);
  doc.moveDown(4.5);
}

function drawSignature(doc, dgNom) {
  if (doc.y > doc.page.height-100) doc.addPage();
  doc.moveDown(2);
  const W = doc.page.width - 80;
  doc.moveTo(40, doc.y).lineTo(doc.page.width-40, doc.y).lineWidth(0.5).stroke('#CBD5E1');
  doc.moveDown(0.5);
  doc.fillColor('#475569').fontSize(9).font('Helvetica')
     .text(`Fait à Défalé-Niamtougou, le ${new Date().toLocaleDateString('fr-FR')}`, 40, doc.y, {width:W/2});
  doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold')
     .text(`Le Directeur Général`, 40+W/2, doc.y-12, {width:W/2, align:'right'});
  doc.fillColor('#334155').fontSize(9).font('Helvetica')
     .text(dgNom||'Boumzina Raïna', 40+W/2, doc.y+2, {width:W/2, align:'right'});
  doc.moveDown(1.5);
  doc.moveTo(doc.page.width-170, doc.y).lineTo(doc.page.width-40, doc.y).stroke('#334155');
  doc.fillColor('#94A3B8').fontSize(7.5).font('Helvetica-Oblique')
     .text('Signature & Cachet', doc.page.width-170, doc.y+3, {width:130, align:'center'});

  // Pied de page
  const py = doc.page.height - 20;
  doc.rect(0, py-2, doc.page.width, 22).fill('#0F172A');
  doc.fillColor('#475569').fontSize(7).font('Helvetica')
     .text(`SINEX-SA — Confidentiel — ${new Date().toLocaleDateString('fr-FR')}`,
       40, py+3, {align:'center', width:doc.page.width-80});
}

let sectionCounter = 0;
function resetSections() { sectionCounter = 0; }

function pdfSection(doc, titre, couleur='#22D3EE') {
  if (doc.y > doc.page.height-100) {
    doc.addPage();
    doc.rect(0,0,doc.page.width,3).fill(couleur);
    doc.moveDown(0.5);
  }
  sectionCounter++;
  doc.moveDown(0.4);
  const y = doc.y;
  doc.rect(40, y, doc.page.width-80, 16).fill('#1E3A5F');
  doc.fillColor(couleur).fontSize(9).font('Helvetica-Bold')
     .text(`${ROMAINS[sectionCounter-1]||sectionCounter}. ${titre}`, 44, y+3, {width:doc.page.width-90, lineBreak:false});
  doc.moveDown(0.9);
}

function pdfTableau(doc, entetes, lignes, couleur='#0891B2', widths=null) {
  if (!Array.isArray(lignes) || lignes.length===0) {
    doc.fillColor('#94A3B8').fontSize(8).font('Helvetica-Oblique')
       .text('Aucune donnée disponible', 45, doc.y);
    doc.moveDown(0.5);
    return;
  }
  const W = doc.page.width-80, n = entetes.length;
  const cols = widths || Array(n).fill(Math.floor(W/n));
  const rowH = 14;

  const dessinEntete = () => {
    let x=40, y=doc.y;
    doc.rect(40,y,W,rowH).fill(couleur);
    entetes.forEach((e,i)=>{
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold')
         .text(String(e), x+2, y+3, {width:cols[i]-4, ellipsis:true, lineBreak:false});
      x+=cols[i];
    });
    doc.moveDown(0.85);
  };
  dessinEntete();

  lignes.forEach((ligne,li) => {
    if (doc.y > doc.page.height-65) {
      doc.addPage();
      doc.rect(0,0,doc.page.width,3).fill(couleur);
      doc.moveDown(0.5);
      dessinEntete();
    }
    const ry = doc.y;
    if (li%2===0) doc.rect(40,ry-1,W,rowH-1).fill('#F1F5F9');
    let x=40;
    (ligne||[]).forEach((val,i)=>{
      if (i>=cols.length) return;
      const color=(typeof val==='object'&&val?.color)?val.color:'#334155';
      const text=(typeof val==='object'&&val?.text)?String(val.text):String(val??'—');
      const bold=typeof val==='object'&&val?.bold;
      doc.fillColor(color).fontSize(7.5).font(bold?'Helvetica-Bold':'Helvetica')
         .text(text, x+2, ry+2, {width:cols[i]-4, ellipsis:true, lineBreak:false});
      x+=cols[i];
    });
    doc.moveDown(0.75);
  });
}

function pdfProduction(doc, d) {
  resetSections();
  pdfSection(doc,'Saisies journalières de production');
  pdfTableau(doc,
    ['Date','C12','C24','F6/1,5L','F6/0,5L','F6/1L','HILIO','Jrs','Statut'],
    (d.saisies||[]).map(s=>[
      s.date_production?.slice(0,10)||'—',
      fmt(s.c12||0),fmt(s.c24||0),fmt(s.f615||0),fmt(s.f605||0),fmt(s.f61||0),fmt(s.hilio||0),
      s.jours_ouvres||1,
      {text:s.statut==='valide'?'Validé':'Attente',color:s.statut==='valide'?'#059669':'#D97706',bold:s.statut==='valide'},
    ]),
    '#0891B2',[55,36,36,40,40,36,36,28,57]
  );

  pdfSection(doc,'Totaux des productions validées','#34D399');
  const t=d.totaux||{};
  pdfTableau(doc,['Format','Qté','CA HT (FCFA)','CD HT (FCFA)','MB HT (FCFA)','TMB HT'],
    [['C12',12],['C24',24],['F615',6],['F605',6],['F61',6],['HILIO',30]].map(([code])=>{
      const q=(t[code.toLowerCase()]||0),ca=q*(PRIX_PF[code]||0),cd=q*(CD_UNIT[code]||0);
      return [code,fmt(q),{text:fmt(ca),color:'#22D3EE'},{text:fmt(cd),color:'#EF4444'},{text:fmt(ca-cd),color:'#34D399'},ca>0?fmtP((ca-cd)/ca):'—'];
    }),
    '#059669',[55,40,90,90,90,55]
  );

  pdfSection(doc,'Consommation réelle des intrants','#F59E0B');
  const cc=d.consommations_cumulees||{},rc=d.rebuts_cumules||{};
  pdfTableau(doc,['Intrant','Théorique','Rebuts','Total réel','Prix HT','Valeur HT'],
    [['Préformes 32g','PREF_32G',53],['Préformes 17g','PREF_17G',28],['Bouchons','BOUCH_VERT',5],
     ['Étiq. 1,5L','ETI_15L',9],['Étiq. 0,5L','ETI_05L',6],['Cartons C12','CTN_15L',233],['Cartons C24','CTN_05L',200]].map(([nom,code,prix])=>{
      const theo=cc[code]||0,reb=rc[code]||0;
      return [nom,fmt(theo),{text:fmt(reb),color:'#F59E0B'},fmt(theo+reb),fmt(prix),{text:fmt((theo+reb)*prix),color:'#22D3EE'}];
    }),
    '#D97706',[90,48,48,48,48,78]
  );
}

function pdfATP(doc, d) {
  resetSections();
  const atp=d.atp||{},obj=d.objectifs||{},real=d.realisations||{};
  const cahtp=parseFloat(atp.proj_ca_ht||0),cdhtp=parseFloat(atp.proj_cd_ht||0);
  const cahtr=parseFloat(atp.real_ca_ht||0),cdhtr=parseFloat(atp.real_cd_ht||0);
  const tmbhtp=parseFloat(atp.proj_tmb||0),tmbhtr=parseFloat(atp.taux_marge_brute||0);

  pdfSection(doc,'Objectifs de production — Projection','#F59E0B');
  pdfTableau(doc,['Produit','Qté objectif','Prix vente HT (FCFA)','CAHTP (FCFA)'],
    ['C24','C12','F605','F615','F61','HILIO'].map(c=>[c,fmt(obj[c]||0),fmt(PRIX_PF[c]||0),{text:fmt((obj[c]||0)*(PRIX_PF[c]||0)),color:'#22D3EE'}]),
    '#D97706',[70,80,130,120]
  );

  pdfSection(doc,'Réalisation en cours — Cumulé automatique','#34D399');
  pdfTableau(doc,['Produit','Qté réalisée','Montant HT (FCFA)','Avancement'],
    ['C24','C12','F605','F615','F61','HILIO'].map(c=>{
      const q=real[c]||0,mt=q*(PRIX_PF[c]||0),om=(obj[c]||0)*(PRIX_PF[c]||0);
      return [c,fmt(q),{text:fmt(mt),color:'#34D399'},{text:om>0?((mt/om)*100).toFixed(1)+'%':'—',color:om>0&&mt>=om?'#34D399':'#F59E0B'}];
    }),
    '#059669',[70,80,130,120]
  );

  pdfSection(doc,'Marges brutes — Projection');
  pdfTableau(doc,['#','Libellé','Prévisionnel (FCFA)',''],
    [['1','CAHTP',{text:fmt(cahtp),color:'#22D3EE'},''],
     ['2','CDHTP',{text:fmt(cdhtp),color:'#EF4444'},''],
     ['3',{text:'MBHTP',bold:true},{text:fmt(cahtp-cdhtp),color:'#F59E0B',bold:true},''],
     ['4','TMBHTP = MBHTP / CAHTP','',{text:fmtP(tmbhtp),color:'#F59E0B',bold:true}]],
    '#0891B2',[25,145,140,90]
  );
  const bmfP=tmbhtp>0?(cahtp*0.35)/(tmbhtp*0.15):0,fsP=tmbhtp>0?(cahtp*0.35)/(tmbhtp*0.10):0;
  pdfSection(doc,'Répartition MBHTP prévisionnelle','#7C3AED');
  pdfTableau(doc,['Rubrique','Montant (FCFA)','Taux',''],
    [['BMF',fmt(bmfP),fmtP(tmbhtp*0.15/0.35),''],['Frais de Siège',fmt(fsP),fmtP(tmbhtp*0.10/0.35),''],['Amortissement',fmt(fsP),fmtP(tmbhtp*0.10/0.35),'']],
    '#7C3AED',[100,130,100,70]
  );

  pdfSection(doc,'Marges brutes — Réalisation','#34D399');
  pdfTableau(doc,['#','Libellé','Réalisé (FCFA)',''],
    [['5','CAHTR',{text:fmt(cahtr),color:'#34D399'},''],
     ['6','CDHTR',{text:fmt(cdhtr),color:'#EF4444'},''],
     ['7',{text:'MBHTR',bold:true},{text:fmt(cahtr-cdhtr),color:'#34D399',bold:true},''],
     ['8','TMBHTR = MBHTR / CAHTR','',{text:fmtP(tmbhtr),color:'#34D399',bold:true}]],
    '#059669',[25,145,140,90]
  );
  const bmfR=tmbhtr>0?(cahtr*0.35)/(tmbhtr*0.15):0,fsR=tmbhtr>0?(cahtr*0.35)/(tmbhtr*0.10):0;
  pdfSection(doc,'Répartition MBHTR réalisée','#059669');
  pdfTableau(doc,['Rubrique','Montant réalisé (FCFA)','Taux réalisé',''],
    [['BMF',fmt(bmfR),fmtP(tmbhtr*0.15/0.35),''],['Frais de Siège',fmt(fsR),fmtP(tmbhtr*0.10/0.35),''],['Amortissement',fmt(fsR),fmtP(tmbhtr*0.10/0.35),'']],
    '#059669',[100,130,100,70]
  );

  if(d.charges&&Object.values(d.charges).some(v=>parseFloat(v||0)>0)){
    pdfSection(doc,'Charges indirectes (CIHT)','#8B5CF6');
    pdfTableau(doc,['Nature','Montant (FCFA)','',''],
      [['Salaires',d.charges.salaires],['Électricité',d.charges.electricite],['Carburant',d.charges.carburant],['Loyer',d.charges.loyer],['Maintenance',d.charges.maintenance],['Autres',d.charges.autres]].filter(([,v])=>parseFloat(v||0)>0).map(([l,v])=>[l,{text:fmt(v),color:'#8B5CF6'},'','']),
      '#7C3AED',[120,140,60,80]
    );
  }
}

function pdfStocks(doc, d) {
  resetSections();
  [1,2,3].forEach(cl=>{
    const arts=(d.articles||[]).filter(a=>parseInt(a.classe)===cl);
    if(!arts.length) return;
    const titres={1:'Classe 1 — Consommables de production',2:'Classe 2 — EPI et Pièces de rechange',3:'Classe 3 — Produits finis'};
    const couleurs={1:'#22D3EE',2:'#8B5CF6',3:'#34D399'};
    pdfSection(doc,titres[cl],couleurs[cl]);
    pdfTableau(doc,['Article','Code','Unité','Stock','Valeur HT','Statut'],
      arts.map(a=>{
        const stock=parseFloat(a.stock_actuel||0);
        const st=stock<=0?'Rupture':a.seuil_alerte&&stock<=a.seuil_alerte?'Faible':'OK';
        return [a.libelle,a.code,a.unite,fmt(stock),fmt(a.valeur_stock_ht||0),{text:st,color:st==='Rupture'?'#EF4444':st==='Faible'?'#F59E0B':'#34D399',bold:true}];
      }),
      couleurs[cl].replace('#',''),[130,60,40,50,80,55]
    );
  });
}

function pdfTresorerie(doc, d) {
  resetSections();
  pdfSection(doc,'Soldes des comptes','#34D399');
  pdfTableau(doc,['Compte','Type','Solde (FCFA)',''],
    (d.comptes||[]).map(c=>[c.libelle,c.type_compte||'—',{text:fmt(c.solde_fcfa||0),color:'#22D3EE',bold:true},''])
    .concat([[{text:'TOTAL',bold:true},'',{text:fmt((d.comptes||[]).reduce((s,c)=>s+parseFloat(c.solde_fcfa||0),0)),bold:true,color:'#34D399'},'']]),
    '34D399',[150,70,130,50]
  );

  pdfSection(doc,'Brouillard de caisse');
  pdfTableau(doc,['Date','Compte','Libellé','Entrée (FCFA)','Sortie (FCFA)','Solde'],
    (d.mouvements||[]).map(m=>{
      const isC=m.sens==='credit';
      return [fmtD(m.date_mouvement),m.compte_libelle||'—',m.description||'—',
        isC?{text:fmt(m.montant_fcfa||0),color:'#34D399'}:'—',
        !isC?{text:fmt(m.montant_fcfa||0),color:'#EF4444'}:'—',
        {text:fmt(m.solde_apres||0),color:'#22D3EE'}];
    }),
    '#0891B2',[55,80,95,65,65,65]
  );
}

function pdfRebuts(doc, d) {
  resetSections();
  const rebuts = d.rebuts||[];
  pdfSection(doc,'Rebuts par date et intrant','#EF4444');
  pdfTableau(doc,['Date','Intrant','Quantité','Prix HT unit.','Valeur HT (FCFA)'],
    rebuts.map(r=>[r.date?.slice(0,10)||'—',r.intrant||'—',fmt(r.quantite||0),fmt(r.prix||0),{text:fmt(r.valeur||0),color:'#EF4444'}]),
    '#DC2626',[65,110,55,60,80]
  );
  if(rebuts.length>0){
    const totVal=rebuts.reduce((s,r)=>s+(r.valeur||0),0);
    doc.moveDown(0.5);
    doc.fillColor('#EF4444').fontSize(10).font('Helvetica-Bold')
       .text(`Total valeur des rebuts : ${fmt(totVal)} FCFA`, 40, doc.y, {align:'right',width:doc.page.width-80});
  }
}

module.exports = { genererExcel, genererPDF };
