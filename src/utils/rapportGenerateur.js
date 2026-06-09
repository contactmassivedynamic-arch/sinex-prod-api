/**
 * Générateur de rapports PDF et Excel — SINEX-SA
 * Structure identique à l'application
 */
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const PRIX_PF = {C12:2116.10,C24:2033.90,F615:1032.00,F605:429.00,F61:1186.00,HILIO:169.00};
const CD_UNIT = {C12:1037,C24:1136,F615:450.79,F605:282.79,F61:438.79,HILIO:75.23};

const fmt  = n => Math.round(parseFloat(n)||0).toLocaleString('fr-FR');
const fmtP = n => ((parseFloat(n)||0)*100).toFixed(2)+'%';
const fmtD = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

// ═══════════════════════════════════════════════
// EXCEL
// ═══════════════════════════════════════════════

async function genererExcel(type, donnees, mois) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SINEX-SA'; wb.created = new Date();

  switch(type) {
    case 'production': return excelProduction(wb, donnees, mois);
    case 'atp':        return excelATP(wb, donnees, mois);
    case 'stocks':     return excelStocks(wb, donnees, mois);
    case 'tresorerie': return excelTresorerie(wb, donnees, mois);
    case 'rebuts':     return excelRebuts(wb, donnees, mois);
    default:           return excelProduction(wb, donnees, mois);
  }
}

function addTitre(ws, titre, sous, cols, couleur='0891B2') {
  ws.mergeCells(`A1:${String.fromCharCode(64+cols)}1`);
  const c1 = ws.getCell('A1');
  c1.value = titre;
  c1.font = {bold:true,size:14,color:{argb:'FF'+couleur}};
  c1.alignment = {horizontal:'center',vertical:'middle'};
  c1.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF0F172A'}};
  ws.getRow(1).height = 28;

  ws.mergeCells(`A2:${String.fromCharCode(64+cols)}2`);
  const c2 = ws.getCell('A2');
  c2.value = sous;
  c2.font = {italic:true,size:10,color:{argb:'FF94A3B8'}};
  c2.alignment = {horizontal:'center'};
  c2.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF0F172A'}};
  ws.getRow(2).height = 18;
}

function addEntete(ws, labels, couleur='0891B2') {
  const row = ws.addRow(labels);
  row.eachCell(cell => {
    cell.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF'+couleur}};
    cell.font = {bold:true,color:{argb:'FFFFFFFF'},size:10};
    cell.alignment = {horizontal:'center',vertical:'middle'};
    cell.border = {bottom:{style:'medium',color:{argb:'FFCBD5E1'}}};
  });
  row.height = 20;
  return row;
}

function addLigne(ws, vals, opts={}) {
  const row = ws.addRow(vals);
  row.eachCell((cell,i) => {
    cell.border = {
      top:{style:'thin',color:{argb:'FFCBD5E1'}},
      left:{style:'thin',color:{argb:'FFCBD5E1'}},
      bottom:{style:'thin',color:{argb:'FFCBD5E1'}},
      right:{style:'thin',color:{argb:'FFCBD5E1'}},
    };
    if (opts.bold) cell.font = {bold:true};
    if (opts.couleurs && opts.couleurs[i]) cell.font = {...(cell.font||{}),color:{argb:'FF'+opts.couleurs[i]}};
    if (opts.bg) cell.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF'+opts.bg}};
    if (opts.aligns && opts.aligns[i]) cell.alignment = {horizontal:opts.aligns[i]};
  });
  return row;
}

function addSousTitre(ws, titre, cols, couleur='1E3A5F') {
  ws.addRow([]);
  ws.mergeCells(`A${ws.rowCount}:${String.fromCharCode(64+cols)}${ws.rowCount}`);
  const cell = ws.getCell(`A${ws.rowCount}`);
  cell.value = titre;
  cell.font = {bold:true,size:11,color:{argb:'FF22D3EE'}};
  cell.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF'+couleur}};
  cell.alignment = {horizontal:'left'};
  ws.getRow(ws.rowCount).height = 18;
  ws.addRow([]);
}

// ── Excel Production ──────────────────────────
async function excelProduction(wb, d, mois) {
  const ws = wb.addWorksheet('Production');
  ws.columns = [
    {key:'date',width:14},{key:'c12',width:10},{key:'c24',width:10},
    {key:'f615',width:10},{key:'f605',width:10},{key:'f61',width:10},
    {key:'hilio',width:10},{key:'jours',width:8},{key:'statut',width:14},
    {key:'operateur',width:20},
  ];
  addTitre(ws,'RAPPORT DE PRODUCTION MENSUEL — '+mois,'SINEX-SA — Eau Minérale HILIO — Défalé, Togo',10);
  ws.addRow([]);

  // Tableau saisies journalières
  addSousTitre(ws,'📊 Saisies journalières',10);
  addEntete(ws,['Date','C12','C24','F6/1,5L','F6/0,5L','F6/1L','HILIO','Jours','Statut','Opérateur']);

  const saisies = d.saisies||[];
  saisies.forEach((s,i) => {
    const row = addLigne(ws,[
      s.date_production?.slice(0,10)||'—',
      s.c12||0,s.c24||0,s.f615||0,s.f605||0,s.f61||0,s.hilio||0,
      s.jours_ouvres||1,
      s.statut==='valide'?'✓ Validé':'En attente',
      s.saisi_par_nom||'—',
    ]);
    if (i%2===0) row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
    if (s.statut==='valide') row.getCell(9).font={color:{argb:'FF059669'},bold:true};
  });

  // Totaux productions validées
  addSousTitre(ws,'✅ Totaux productions validées',10);
  addEntete(ws,['Format','Qté produite','Contenu','CA HT (FCFA)','CD HT (FCFA)','MB HT (FCFA)','','','','']);
  const t = d.totaux||{};
  [['C12','cartons',12,'btl 1,5L'],['C24','cartons',24,'btl 0,5L'],
   ['F615','fardeaux',6,'btl 1,5L'],['F605','fardeaux',6,'btl 0,5L'],
   ['F61','fardeaux',6,'btl 1L'],['HILIO','packs',30,'sachets']].forEach(([code,unite,mult,desc])=>{
    const q=t[code.toLowerCase()]||0;
    const ca=q*(PRIX_PF[code]||0), cd=q*(CD_UNIT[code]||0), mb=ca-cd;
    addLigne(ws,[`${code} (${unite})`,fmt(q)+' '+unite,q*mult+' '+desc,fmt(ca),fmt(cd),fmt(mb),'','','','']);
  });
  const caTotal=Object.entries(t).reduce((s,[k,v])=>s+(v||0)*(PRIX_PF[k.toUpperCase()]||0),0);
  const cdTotal=Object.entries(t).reduce((s,[k,v])=>s+(v||0)*(CD_UNIT[k.toUpperCase()]||0),0);
  addLigne(ws,['TOTAL','','',fmt(caTotal),fmt(cdTotal),fmt(caTotal-cdTotal),'','','',''],{bold:true,bg:'1E3A5F',couleurs:{1:'22D3EE',4:'22D3EE',5:'EF4444',6:'34D399'}});

  // Consommations réelles
  addSousTitre(ws,'📦 Consommation réelle des intrants',10);
  addEntete(ws,['Intrant','Consommé théorique','Rebuts saisis','Total réel','Prix HT unit.','Valeur HT (FCFA)','','','',''],'D97706');
  const rebCum=d.rebuts_cumules||{};
  const consCum=d.consommations_cumulees||{};
  [
    ['Préformes 32g','PREF_32G',53],['Préformes 17g','PREF_17G',28],
    ['Bouchons vert','BOUCH_VERT',5],['Étiquettes 1,5L','ETI_15L',9],
    ['Étiquettes 0,5L','ETI_05L',6],['Étiquettes 1L','ETI_1L',7],
    ['Cartons C12','CTN_15L',233],['Cartons C24','CTN_05L',200],
  ].forEach(([nom,code,prix])=>{
    const theo=consCum[code]||0, reb=rebCum[code]||0, total=theo+reb;
    addLigne(ws,[nom,fmt(theo),fmt(reb),fmt(total),fmt(prix),fmt(total*prix),'','','','']);
  });

  return wb.xlsx.writeBuffer();
}

// ── Excel ATP ─────────────────────────────────
async function excelATP(wb, d, mois) {
  const ws = wb.addWorksheet('ATP');
  ws.columns = [{key:'libelle',width:35},{key:'prev',width:20},{key:'reel',width:20},{key:'taux',width:14}];
  addTitre(ws,'RAPPORT FINANCIER ATP — '+mois,'SINEX-SA — Analyse des Tableaux de Production',4,'D97706');
  ws.addRow([]);

  const atp = d.atp||{};
  const obj = d.objectifs||{};
  const real = d.realisations||{};

  // Objectifs de production
  addSousTitre(ws,'📊 Objectifs de production — Projection',4);
  addEntete(ws,['Produit','Qté objectif','Prix unit. HT','CAHTP (FCFA)'],'D97706');
  ['C24','C12','F605','F615','F61','HILIO'].forEach(code=>{
    const q=obj[code]||0;
    addLigne(ws,[code,fmt(q),fmtPrix(PRIX_PF[code]),fmt(q*(PRIX_PF[code]||0))]);
  });
  const cahtp=atp.proj_ca_ht||0;
  addLigne(ws,['TOTAL CA HT Prévisionnel','','',fmt(cahtp)],{bold:true,bg:'1E3A5F'});

  // Réalisations
  addSousTitre(ws,'✅ Réalisation en cours — Cumulé automatique',4);
  addEntete(ws,['Produit','Qté réalisée','Montant HT (FCFA)','Avancement'],'059669');
  const cahtr=atp.real_ca_ht||0;
  ['C24','C12','F605','F615','F61','HILIO'].forEach(code=>{
    const q=real[code]||0, mt=q*(PRIX_PF[code]||0);
    const obj_mt=(obj[code]||0)*(PRIX_PF[code]||0);
    const tx=obj_mt>0?((mt/obj_mt)*100).toFixed(1)+'%':'—';
    addLigne(ws,[code,fmt(q),fmt(mt),tx]);
  });
  addLigne(ws,['TOTAL CAHTR','',fmt(cahtr),cahtp>0?((cahtr/cahtp)*100).toFixed(1)+'%':'—'],{bold:true,bg:'1E3A5F'});

  // Marges projection
  addSousTitre(ws,'📐 Marges brutes — Projection',4);
  addEntete(ws,['#','Libellé','Montant (FCFA)',''],'0891B2');
  const cdhtp=atp.proj_cd_ht||0, mbhtp=atp.proj_mb_ht||0, tmbhtp=atp.proj_tmb||0;
  addLigne(ws,['1','CAHTP',fmt(cahtp),'']);
  addLigne(ws,['2','CDHTP',fmt(cdhtp),'']);
  addLigne(ws,['3','MBHTP',fmt(mbhtp),''],{bold:true});
  addLigne(ws,['4','TMBHTP','',fmtP(tmbhtp)],{bold:true});

  // Répartition prévision
  addSousTitre(ws,'Répartition MBHTP prévisionnelle',4);
  addEntete(ws,['Rubrique','Montant (FCFA)','Taux',''],'7C3AED');
  const bmfMtP=tmbhtp>0?(cahtp*0.35)/(tmbhtp*0.15):0;
  const fsMtP =tmbhtp>0?(cahtp*0.35)/(tmbhtp*0.10):0;
  const ammMtP=tmbhtp>0?(cahtp*0.35)/(tmbhtp*0.10):0;
  addLigne(ws,['BMF',fmt(bmfMtP),fmtP(tmbhtp*0.15/0.35),'']);
  addLigne(ws,['Frais de Siège',fmt(fsMtP),fmtP(tmbhtp*0.10/0.35),'']);
  addLigne(ws,['Amortissement',fmt(ammMtP),fmtP(tmbhtp*0.10/0.35),'']);
  addLigne(ws,['TOTAL',fmt(bmfMtP+fsMtP+ammMtP),'32%',''],{bold:true,bg:'1E3A5F'});

  // Marges réalisation
  addSousTitre(ws,'📐 Marges brutes — Réalisation',4);
  addEntete(ws,['#','Libellé','Montant (FCFA)',''],'059669');
  const cdhtr=atp.real_cd_ht||0, mbhtr=atp.real_marge_brute_ht||0, tmbhtr=atp.taux_marge_brute||0;
  addLigne(ws,['5','CAHTR',fmt(cahtr),'']);
  addLigne(ws,['6','CDHTR',fmt(cdhtr),'']);
  addLigne(ws,['7','MBHTR',fmt(mbhtr),''],{bold:true});
  addLigne(ws,['8','TMBHTR','',fmtP(tmbhtr)],{bold:true});

  // Répartition réalisation
  addSousTitre(ws,'Répartition MBHTR réalisée',4);
  addEntete(ws,['Rubrique','Montant (FCFA)','Taux',''],'059669');
  const bmfMtR=tmbhtr>0?(cahtr*0.35)/(tmbhtr*0.15):0;
  const fsMtR =tmbhtr>0?(cahtr*0.35)/(tmbhtr*0.10):0;
  const ammMtR=tmbhtr>0?(cahtr*0.35)/(tmbhtr*0.10):0;
  addLigne(ws,['BMF',fmt(bmfMtR),fmtP(tmbhtr*0.15/0.35),'']);
  addLigne(ws,['Frais de Siège',fmt(fsMtR),fmtP(tmbhtr*0.10/0.35),'']);
  addLigne(ws,['Amortissement',fmt(ammMtR),fmtP(tmbhtr*0.10/0.35),'']);
  addLigne(ws,['TOTAL',fmt(bmfMtR+fsMtR+ammMtR),fmtP(tmbhtr*0.35/0.35),''],{bold:true,bg:'1E3A5F'});

  // Charges indirectes
  if (d.charges && Object.keys(d.charges).length>0) {
    addSousTitre(ws,'💼 Charges indirectes (CIHT)',4);
    addEntete(ws,['Nature','Montant (FCFA)','',''],'7C3AED');
    [['Salaires',d.charges.salaires],['Électricité',d.charges.electricite],
     ['Carburant',d.charges.carburant],['Loyer',d.charges.loyer],
     ['Maintenance',d.charges.maintenance],['Autres',d.charges.autres]].forEach(([l,v])=>{
      if (v>0) addLigne(ws,[l,fmt(v),'','']);
    });
    addLigne(ws,['TOTAL CIHT',fmt(d.totalCI||0),'',''],{bold:true,bg:'1E3A5F'});
  }

  return wb.xlsx.writeBuffer();
}

// ── Excel Stocks ──────────────────────────────
async function excelStocks(wb, d, mois) {
  // Feuille 1 : Stocks actuels
  const ws1 = wb.addWorksheet('Stocks actuels');
  ws1.columns = [
    {key:'libelle',width:35},{key:'code',width:14},{key:'classe',width:10},
    {key:'unite',width:10},{key:'stock',width:14},{key:'prix',width:14},
    {key:'valeur',width:18},{key:'seuil',width:14},{key:'statut',width:12},
  ];
  addTitre(ws1,'ÉTAT DES STOCKS — '+mois,'SINEX-SA — Inventaire complet par classe',9,'059669');
  ws1.addRow([]);

  [1,2,3].forEach(cl => {
    const arts = (d.articles||[]).filter(a=>parseInt(a.classe)===cl);
    if (!arts.length) return;
    addSousTitre(ws1,`${cl===1?'📦 Classe 1 — Consommables production':cl===2?'🔧 Classe 2 — EPI & Pièces de rechange':'✅ Classe 3 — Produits finis'}`,9,'059669');
    addEntete(ws1,['Article','Code','Classe','Unité','Stock actuel','Prix HT','Valeur HT','Seuil alerte','Statut'],'059669');
    arts.forEach((a,i)=>{
      const stock=parseFloat(a.stock_actuel||0);
      const statut=stock<=0?'Rupture':a.seuil_alerte&&stock<=a.seuil_alerte?'Faible':'OK';
      const row = addLigne(ws1,[a.libelle,a.code,`Cl.${a.classe}`,a.unite,fmt(stock),fmt(a.prix_unitaire_ht||0),fmt(a.valeur_stock_ht||0),a.seuil_alerte||0,statut]);
      if (i%2===0) row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
      const couleurStatut=statut==='Rupture'?'DC2626':statut==='Faible'?'D97706':'059669';
      row.getCell(9).font={color:{argb:'FF'+couleurStatut},bold:true};
    });
  });

  // Feuille 2 : Mouvements
  const ws2 = wb.addWorksheet('Mouvements');
  ws2.columns = [
    {key:'date',width:14},{key:'article',width:30},{key:'classe',width:8},
    {key:'type',width:10},{key:'qte',width:12},{key:'valeur',width:16},{key:'motif',width:30},
  ];
  addTitre(ws2,'MOUVEMENTS DE STOCK — '+mois,'SINEX-SA — Historique des entrées et sorties',7,'0891B2');
  ws2.addRow([]);
  addEntete(ws2,['Date','Article','Classe','Type','Quantité','Valeur HT','Motif']);
  (d.mouvements||[]).forEach((m,i)=>{
    const row = addLigne(ws2,[
      m.date_mouvement?.slice(0,10)||'—',m.article_libelle||'—',`Cl.${m.classe}`,
      m.type_mouvement==='entree'?'↑ Entrée':'↓ Sortie',
      fmt(m.quantite),fmt(m.valeur_ht||0),m.motif||'—',
    ]);
    if (i%2===0) row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
    row.getCell(4).font={color:{argb:m.type_mouvement==='entree'?'FF059669':'FFDC2626'},bold:true};
  });

  return wb.xlsx.writeBuffer();
}

// ── Excel Trésorerie ──────────────────────────
async function excelTresorerie(wb, d, mois) {
  const ws = wb.addWorksheet('Trésorerie');
  ws.columns = [
    {key:'date',width:14},{key:'compte',width:22},{key:'libelle',width:30},
    {key:'entree',width:16},{key:'sortie',width:16},{key:'solde',width:18},
  ];
  addTitre(ws,'RAPPORT DE TRÉSORERIE — '+mois,'SINEX-SA — Brouillard de caisse',6,'34D399');
  ws.addRow([]);

  // Soldes par compte
  addSousTitre(ws,'💰 Soldes des comptes',6,'34D399');
  addEntete(ws,['Compte','Type','Banque','Solde (FCFA)','',''],'34D399');
  (d.comptes||[]).forEach((c,i)=>{
    const row=addLigne(ws,[c.libelle,c.type_compte||'—',c.banque||'—',fmt(c.solde_fcfa||0),'','']);
    if (i%2===0) row.eachCell(c2=>{c2.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
    row.getCell(4).font={bold:true,color:{argb:'FF22D3EE'}};
  });
  const total=(d.comptes||[]).reduce((s,c)=>s+parseFloat(c.solde_fcfa||0),0);
  addLigne(ws,['TOTAL TRÉSORERIE','','',fmt(total),'',''],{bold:true,bg:'1E3A5F'});

  // Brouillard de caisse
  addSousTitre(ws,'📋 Brouillard de caisse',6,'34D399');
  addEntete(ws,['Date','Compte','Libellé','Entrée (FCFA)','Sortie (FCFA)','Solde cumulé'],'34D399');
  (d.mouvements||[]).forEach((m,i)=>{
    const isC=m.sens==='credit';
    const row=addLigne(ws,[
      fmtD(m.date_mouvement),m.compte_libelle||'—',m.description||'—',
      isC?fmt(m.montant_fcfa||0):'',
      !isC?fmt(m.montant_fcfa||0):'',
      fmt(m.solde_apres||0),
    ]);
    if (i%2===0) row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
    if (isC) row.getCell(4).font={color:{argb:'FF059669'},bold:true};
    else row.getCell(5).font={color:{argb:'FFDC2626'},bold:true};
    row.getCell(6).font={color:{argb:'FF22D3EE'},bold:true};
  });

  return wb.xlsx.writeBuffer();
}

// ── Excel Rebuts ──────────────────────────────
async function excelRebuts(wb, d, mois) {
  const ws = wb.addWorksheet('Rebuts');
  ws.columns = [{key:'date',width:14},{key:'intrant',width:28},{key:'qte',width:14},{key:'prix',width:14},{key:'valeur',width:16}];
  addTitre(ws,'RAPPORT DES REBUTS — '+mois,'SINEX-SA — Analyse des pertes par intrant',5,'DC2626');
  ws.addRow([]);
  addEntete(ws,['Date','Intrant','Quantité','Prix HT unit.','Valeur HT (FCFA)'],'DC2626');
  (d.rebuts||[]).forEach((r,i)=>{
    const row=addLigne(ws,[r.date?.slice(0,10)||'—',r.intrant||'—',fmt(r.quantite||0),fmt(r.prix||0),fmt(r.valeur||0)]);
    if (i%2===0) row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
  });
  return wb.xlsx.writeBuffer();
}

function fmtPrix(n) { return parseFloat(n||0).toLocaleString('fr-FR',{minimumFractionDigits:2})+' FCFA'; }

// ═══════════════════════════════════════════════
// PDF
// ═══════════════════════════════════════════════

async function genererPDF(type, donnees, mois) {
  return new Promise((resolve,reject) => {
    const doc = new PDFDocument({margin:40,size:'A4'});
    const bufs = [];
    doc.on('data',b=>bufs.push(b));
    doc.on('end',()=>resolve(Buffer.concat(bufs)));
    doc.on('error',reject);

    // En-tête global
    doc.rect(0,0,doc.page.width,65).fill('#0F172A');
    doc.fillColor('#22D3EE').fontSize(16).font('Helvetica-Bold').text('SINEX-SA — Eau Minérale HILIO',40,12);
    doc.fillColor('#94A3B8').fontSize(9).font('Helvetica').text('Défalé, Togo — Rapport généré le '+new Date().toLocaleDateString('fr-FR'),40,35);
    doc.fillColor('#64748B').fontSize(9).text('Document confidentiel — Usage interne uniquement',40,48);

    const TITRES = {
      production:'RAPPORT DE PRODUCTION MENSUEL',
      atp:'RAPPORT FINANCIER ATP',
      stocks:'ÉTAT DES STOCKS',
      tresorerie:'RAPPORT DE TRÉSORERIE',
      rebuts:'RAPPORT DES REBUTS',
      tendances:'ANALYSE DES TENDANCES',
    };
    const COULEURS_TYPE = {
      production:'#22D3EE', atp:'#F59E0B', stocks:'#34D399',
      tresorerie:'#34D399', rebuts:'#EF4444', tendances:'#8B5CF6',
    };

    doc.moveDown(2);
    doc.fillColor(COULEURS_TYPE[type]||'#22D3EE').fontSize(14).font('Helvetica-Bold')
       .text(`${TITRES[type]||'RAPPORT'} — ${mois}`,{align:'center'});
    doc.moveDown(0.3);
    doc.moveTo(40,doc.y).lineTo(doc.page.width-40,doc.y).lineWidth(0.5).stroke('#334155');
    doc.moveDown(0.5);

    switch(type) {
      case 'production':  pdfProduction(doc,donnees); break;
      case 'atp':         pdfATP(doc,donnees); break;
      case 'stocks':      pdfStocks(doc,donnees); break;
      case 'tresorerie':  pdfTresorerie(doc,donnees); break;
      case 'rebuts':      pdfRebuts(doc,donnees); break;
      default:            pdfProduction(doc,donnees);
    }

    // Pied de page
    const py = doc.page.height-30;
    doc.moveTo(40,py-5).lineTo(doc.page.width-40,py-5).stroke('#334155');
    doc.fillColor('#64748B').fontSize(8)
       .text(`SINEX-SA — Confidentiel — ${new Date().toLocaleDateString('fr-FR')}`,40,py,{align:'center',width:doc.page.width-80});

    doc.end();
  });
}

// Helpers PDF
function pdfTitreSec(doc, titre, couleur='#22D3EE') {
  if (doc.y > doc.page.height-120) doc.addPage();
  doc.moveDown(0.5);
  doc.fillColor('#1E3A5F').rect(40,doc.y,doc.page.width-80,16).fill();
  doc.fillColor(couleur).fontSize(10).font('Helvetica-Bold').text(titre,44,doc.y-14);
  doc.moveDown(0.8);
}

function pdfTableau(doc, entetes, lignes, couleurEntete='#0891B2', widths=null) {
  const W = doc.page.width-80;
  const n = entetes.length;
  const cols = widths || Array(n).fill(Math.floor(W/n));
  const rowH = 14;

  // Entête
  let x=40, y=doc.y;
  if (y > doc.page.height-120) { doc.addPage(); y=doc.y; }
  doc.fillColor(couleurEntete).rect(40,y,W,rowH).fill();
  entetes.forEach((e,i) => {
    doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold')
       .text(e,x+2,y+3,{width:cols[i]-4,ellipsis:true});
    x+=cols[i];
  });
  doc.moveDown(0.9);

  lignes.forEach((ligne,li) => {
    if (doc.y > doc.page.height-60) {
      doc.addPage();
      // Répéter entête
      x=40; y=doc.y;
      doc.fillColor(couleurEntete).rect(40,y,W,rowH).fill();
      entetes.forEach((e,i)=>{
        doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold').text(e,x+2,y+3,{width:cols[i]-4,ellipsis:true});
        x+=cols[i];
      });
      doc.moveDown(0.9);
    }
    const ry = doc.y;
    if (li%2===0) doc.fillColor('#F8FAFC').rect(40,ry-1,W,rowH-1).fill();
    x=40;
    ligne.forEach((val,i)=>{
      const color = (typeof val==='object'&&val?.color) ? val.color : '#334155';
      const text  = (typeof val==='object'&&val?.text)  ? val.text  : String(val||'—');
      const bold  = typeof val==='object'&&val?.bold;
      doc.fillColor(color).fontSize(7.5).font(bold?'Helvetica-Bold':'Helvetica')
         .text(text,x+2,ry+2,{width:cols[i]-4,ellipsis:true});
      x+=cols[i];
    });
    doc.moveDown(0.75);
  });
}

function pdfProduction(doc, d) {
  const saisies = d.saisies||[];
  const t = d.totaux||{};

  pdfTitreSec(doc,'📊 Saisies journalières');
  pdfTableau(doc,
    ['Date','C12','C24','F615','F605','F61','HILIO','Jours','Statut'],
    saisies.map(s=>[
      s.date_production?.slice(0,10)||'—',
      fmt(s.c12||0),fmt(s.c24||0),fmt(s.f615||0),fmt(s.f605||0),fmt(s.f61||0),fmt(s.hilio||0),
      s.jours_ouvres||1,
      {text:s.statut==='valide'?'✓ Validé':'En attente',color:s.statut==='valide'?'#059669':'#D97706',bold:s.statut==='valide'},
    ]),
    '#0891B2',[55,40,40,40,40,40,40,32,55]
  );

  pdfTitreSec(doc,'✅ Totaux productions validées','#34D399');
  pdfTableau(doc,
    ['Format','Qté','CA HT (FCFA)','CD HT (FCFA)','MB HT (FCFA)'],
    [['C12','cartons'],['C24','cartons'],['F615','fardeaux'],['F605','fardeaux'],['F61','fardeaux'],['HILIO','packs']].map(([code,u])=>{
      const q=t[code.toLowerCase()]||0,ca=q*(PRIX_PF[code]||0),cd=q*(CD_UNIT[code]||0);
      return [code+' ('+u+')',fmt(q)+' '+u,{text:fmt(ca),color:'#22D3EE'},{text:fmt(cd),color:'#EF4444'},{text:fmt(ca-cd),color:'#34D399'}];
    }),
    '#059669',[80,60,100,100,100]
  );

  pdfTitreSec(doc,'📦 Consommation réelle des intrants','#F59E0B');
  const consCum=d.consommations_cumulees||{}, rebCum=d.rebuts_cumules||{};
  pdfTableau(doc,
    ['Intrant','Théorique','Rebuts','Total réel','Prix HT','Valeur HT'],
    [['Préformes 32g','PREF_32G',53],['Préformes 17g','PREF_17G',28],['Bouchons','BOUCH_VERT',5],
     ['Étiq. 1,5L','ETI_15L',9],['Étiq. 0,5L','ETI_05L',6],['Cartons C12','CTN_15L',233],['Cartons C24','CTN_05L',200]].map(([nom,code,prix])=>{
      const theo=consCum[code]||0,reb=rebCum[code]||0,total=theo+reb;
      return [nom,fmt(theo),{text:fmt(reb),color:'#F59E0B'},fmt(total),fmt(prix),{text:fmt(total*prix),color:'#22D3EE'}];
    }),
    '#D97706',[90,55,50,55,55,75]
  );
}

function pdfATP(doc, d) {
  const atp=d.atp||{}, obj=d.objectifs||{}, real=d.realisations||{}, ch=d.charges||{};
  const cahtp=atp.proj_ca_ht||0, cdhtp=atp.proj_cd_ht||0;
  const cahtr=atp.real_ca_ht||0, cdhtr=atp.real_cd_ht||0;
  const tmbhtp=atp.proj_tmb||0, tmbhtr=atp.taux_marge_brute||0;

  pdfTitreSec(doc,'📊 Objectifs de production — Projection','#F59E0B');
  pdfTableau(doc,['Produit','Qté obj.','Prix vente HT','CAHTP (FCFA)'],
    ['C24','C12','F605','F615','F61','HILIO'].map(c=>{
      const q=obj[c]||0;
      return [c,fmt(q),fmtPrix(PRIX_PF[c]),{text:fmt(q*(PRIX_PF[c]||0)),color:'#22D3EE'}];
    }),
    '#D97706',[80,70,120,130]
  );

  pdfTitreSec(doc,'✅ Réalisation en cours','#34D399');
  pdfTableau(doc,['Produit','Qté réal.','Montant HT','Avancement'],
    ['C24','C12','F605','F615','F61','HILIO'].map(c=>{
      const q=real[c]||0,mt=q*(PRIX_PF[c]||0);
      const obj_mt=(obj[c]||0)*(PRIX_PF[c]||0);
      const tx=obj_mt>0?((mt/obj_mt)*100).toFixed(1)+'%':'—';
      return [c,fmt(q),{text:fmt(mt),color:'#34D399'},{text:tx,color:parseFloat(tx)>=100?'#34D399':'#F59E0B'}];
    }),
    '#059669',[80,70,130,120]
  );

  pdfTitreSec(doc,'📐 Marges brutes — Projection');
  pdfTableau(doc,['#','Libellé','Prévisionnel (FCFA)',''],
    [
      ['1','CAHTP',{text:fmt(cahtp),color:'#22D3EE'},''],
      ['2','CDHTP',{text:fmt(cdhtp),color:'#EF4444'},''],
      ['3',{text:'MBHTP',bold:true},{text:fmt(cahtp-cdhtp),color:'#F59E0B',bold:true},''],
      ['4','TMBHTP','',{text:fmtP(tmbhtp),color:'#F59E0B',bold:true}],
    ],
    '#0891B2',[30,150,140,80]
  );

  pdfTitreSec(doc,'Répartition MBHTP','#7C3AED');
  const bmfP=tmbhtp>0?(cahtp*0.35)/(tmbhtp*0.15):0;
  const fsP =tmbhtp>0?(cahtp*0.35)/(tmbhtp*0.10):0;
  const ammP=tmbhtp>0?(cahtp*0.35)/(tmbhtp*0.10):0;
  pdfTableau(doc,['Rubrique','Montant (FCFA)','Taux',''],
    [['BMF',fmt(bmfP),fmtP(tmbhtp*0.15/0.35),''],['Frais de Siège',fmt(fsP),fmtP(tmbhtp*0.10/0.35),''],['Amortissement',fmt(ammP),fmtP(tmbhtp*0.10/0.35),'']],
    '#7C3AED',[100,140,100,60]
  );

  pdfTitreSec(doc,'📐 Marges brutes — Réalisation','#34D399');
  pdfTableau(doc,['#','Libellé','Réalisé (FCFA)',''],
    [
      ['5','CAHTR',{text:fmt(cahtr),color:'#34D399'},''],
      ['6','CDHTR',{text:fmt(cdhtr),color:'#EF4444'},''],
      ['7',{text:'MBHTR',bold:true},{text:fmt(cahtr-cdhtr),color:'#34D399',bold:true},''],
      ['8','TMBHTR','',{text:fmtP(tmbhtr),color:'#34D399',bold:true}],
    ],
    '#059669',[30,150,140,80]
  );

  if (Object.values(ch).some(v=>v>0)) {
    pdfTitreSec(doc,'💼 Charges indirectes (CIHT)','#8B5CF6');
    pdfTableau(doc,['Nature','Montant (FCFA)','',''],
      [['Salaires',fmt(ch.salaires||0),'',''],['Électricité',fmt(ch.electricite||0),'',''],
       ['Carburant',fmt(ch.carburant||0),'',''],['Loyer',fmt(ch.loyer||0),'',''],
       ['Maintenance',fmt(ch.maintenance||0),'',''],['Autres',fmt(ch.autres||0),'',''],
       [{text:'TOTAL CIHT',bold:true},{text:fmt(d.totalCI||0),bold:true,color:'#8B5CF6'},'','']],
      '#7C3AED',[120,150,60,70]
    );
  }
}

function pdfStocks(doc, d) {
  [1,2,3].forEach(cl=>{
    const arts=(d.articles||[]).filter(a=>parseInt(a.classe)===cl);
    if (!arts.length) return;
    const titres={1:'📦 Classe 1 — Consommables production',2:'🔧 Classe 2 — EPI & Pièces',3:'✅ Classe 3 — Produits finis'};
    const couleurs={1:'#22D3EE',2:'#8B5CF6',3:'#34D399'};
    pdfTitreSec(doc,titres[cl],couleurs[cl]);
    pdfTableau(doc,['Article','Code','Unité','Stock actuel','Valeur HT','Statut'],
      arts.map(a=>{
        const stock=parseFloat(a.stock_actuel||0);
        const statut=stock<=0?'Rupture':a.seuil_alerte&&stock<=a.seuil_alerte?'Faible':'OK';
        const sc=statut==='Rupture'?'#EF4444':statut==='Faible'?'#F59E0B':'#34D399';
        return [a.libelle,a.code,a.unite,fmt(stock),fmt(a.valeur_stock_ht||0),{text:statut,color:sc,bold:true}];
      }),
      couleurs[cl].replace('#',''),[130,60,40,55,80,55]
    );
  });
}

function pdfTresorerie(doc, d) {
  pdfTitreSec(doc,'💰 Soldes des comptes','#34D399');
  pdfTableau(doc,['Compte','Type','Solde (FCFA)',''],
    (d.comptes||[]).map(c=>[c.libelle,c.type_compte||'—',{text:fmt(c.solde_fcfa||0),color:'#22D3EE',bold:true},''])
    .concat([[{text:'TOTAL',bold:true},'',{text:fmt((d.comptes||[]).reduce((s,c)=>s+parseFloat(c.solde_fcfa||0),0)),bold:true,color:'#34D399'},'']]),
    '34D399',[150,70,130,50]
  );

  pdfTitreSec(doc,'📋 Brouillard de caisse');
  pdfTableau(doc,['Date','Compte','Libellé','Entrée','Sortie','Solde'],
    (d.mouvements||[]).map(m=>{
      const isC=m.sens==='credit';
      return [
        fmtD(m.date_mouvement),m.compte_libelle||'—',
        m.description||'—',
        isC?{text:fmt(m.montant_fcfa||0),color:'#34D399'}:'—',
        !isC?{text:fmt(m.montant_fcfa||0),color:'#EF4444'}:'—',
        {text:fmt(m.solde_apres||0),color:'#22D3EE'},
      ];
    }),
    '0891B2',[55,80,100,65,65,65]
  );
}

function pdfRebuts(doc, d) {
  pdfTitreSec(doc,'📉 Rebuts par date et intrant','#EF4444');
  pdfTableau(doc,['Date','Intrant','Quantité','Prix HT','Valeur HT'],
    (d.rebuts||[]).map(r=>[
      r.date?.slice(0,10)||'—',r.intrant||'—',fmt(r.quantite||0),
      fmt(r.prix||0),{text:fmt(r.valeur||0),color:'#EF4444'},
    ]),
    'DC2626',[65,110,60,60,85]
  );
}

module.exports = { genererExcel, genererPDF };
