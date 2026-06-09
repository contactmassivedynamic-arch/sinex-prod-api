/**
 * Générateur de rapports PDF et Excel — SINEX SA
 * Design moderne avec logo, graphiques et signature DG
 */
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const PRIX_PF = {C12:2116.10,C24:2033.90,F615:1032.00,F605:429.00,F61:1186.00,HILIO:169.00};
const CD_UNIT = {C12:1037,C24:1136,F615:450.79,F605:282.79,F61:438.79,HILIO:75.23};

const fmt  = n => Math.round(parseFloat(n)||0).toLocaleString('fr-FR');
const fmtP = n => ((parseFloat(n)||0)*100).toFixed(2)+'%';
const fmtD = d => { try{return new Date(d).toLocaleDateString('fr-FR');}catch{return'—';} };

// Logo SINEX SA en texte stylisé (SVG-like dans PDF)
function drawLogoZone(doc, x, y, w, h) {
  // Fond bleu foncé
  doc.save();
  doc.rect(x,y,w,h).fill('#0F172A');
  // Cercle décoratif
  doc.circle(x+h/2,y+h/2,h/2-4).fillOpacity(0.15).fill('#22D3EE').fillOpacity(1);
  // Texte SINEX
  doc.fillColor('#22D3EE').fontSize(18).font('Helvetica-Bold').text('SINEX',x+h+5,y+4,{width:w-h-10});
  doc.fillColor('#94A3B8').fontSize(8).font('Helvetica').text('SA',x+h+5,y+24,{width:w-h-10});
  doc.restore();
}

// ═══════════════════════════════════════════════
// EXCEL — helpers
// ═══════════════════════════════════════════════

async function genererExcel(type, donnees, mois) {
  const wb = new ExcelJS.Workbook();
  wb.creator='SINEX SA'; wb.created=new Date();
  switch(type) {
    case 'production': return excelProduction(wb,donnees,mois);
    case 'atp':        return excelATP(wb,donnees,mois);
    case 'stocks':     return excelStocks(wb,donnees,mois);
    case 'tresorerie': return excelTresorerie(wb,donnees,mois);
    case 'rebuts':     return excelRebuts(wb,donnees,mois);
    default:           return excelProduction(wb,donnees,mois);
  }
}

function xlHeader(ws,titre,sous,ncols,couleur='0891B2') {
  // Ligne logo/société
  ws.mergeCells(`A1:${col(ncols)}1`);
  const c1=ws.getCell('A1');
  c1.value='SINEX SA — '+titre;
  c1.font={bold:true,size:14,color:{argb:'FF'+couleur}};
  c1.alignment={horizontal:'center',vertical:'middle'};
  c1.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0F172A'}};
  ws.getRow(1).height=30;

  ws.mergeCells(`A2:${col(ncols)}2`);
  const c2=ws.getCell('A2');
  c2.value=sous+' — Généré le '+new Date().toLocaleDateString('fr-FR');
  c2.font={italic:true,size:10,color:{argb:'FF94A3B8'}};
  c2.alignment={horizontal:'center'};
  c2.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0F172A'}};
  ws.getRow(2).height=16;

  ws.addRow([]); // spacer
}

function col(n) { return String.fromCharCode(64+Math.min(n,26)); }

function xlEntete(ws,labels,couleur='0891B2') {
  const row=ws.addRow(labels);
  row.eachCell(cell=>{
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+couleur}};
    cell.font={bold:true,color:{argb:'FFFFFFFF'},size:10};
    cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
    cell.border={bottom:{style:'medium',color:{argb:'FFCBD5E1'}}};
  });
  row.height=20;
}

function xlLigne(ws,vals,opts={}) {
  const row=ws.addRow(vals);
  row.eachCell((cell,i)=>{
    cell.border={top:{style:'thin',color:{argb:'FFCBD5E1'}},left:{style:'thin',color:{argb:'FFCBD5E1'}},bottom:{style:'thin',color:{argb:'FFCBD5E1'}},right:{style:'thin',color:{argb:'FFCBD5E1'}}};
    if(opts.bold) cell.font={...(cell.font||{}),bold:true};
    if(opts.couleurs?.[i]) cell.font={...(cell.font||{}),color:{argb:'FF'+opts.couleurs[i]}};
    if(opts.bg) cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+opts.bg}};
    if(opts.aligns?.[i]) cell.alignment={horizontal:opts.aligns[i]};
  });
  return row;
}

function xlSection(ws,titre,ncols,couleur='1E3A5F') {
  ws.addRow([]);
  ws.mergeCells(`A${ws.rowCount}:${col(ncols)}${ws.rowCount}`);
  const cell=ws.getCell(`A${ws.rowCount}`);
  cell.value=titre;
  cell.font={bold:true,size:11,color:{argb:'FF22D3EE'}};
  cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+couleur}};
  cell.alignment={horizontal:'left'};
  ws.getRow(ws.rowCount).height=18;
  ws.addRow([]);
}

function xlSignature(ws,dgNom,ncols) {
  ws.addRow([]); ws.addRow([]);
  ws.mergeCells(`A${ws.rowCount}:${col(ncols)}${ws.rowCount}`);
  const c=ws.getCell(`A${ws.rowCount}`);
  c.value=`Fait à Défalé, le ${new Date().toLocaleDateString('fr-FR')} — Signé par le Directeur Général : ${dgNom||'Boumzina Raïna'}`;
  c.font={italic:true,size:10,color:{argb:'FF64748B'}};
  c.alignment={horizontal:'right'};
}

// ── Excel Production ──────────────────────────
async function excelProduction(wb,d,mois) {
  const ws=wb.addWorksheet('Production');
  ws.columns=[
    {key:'date',width:14},{key:'c12',width:9},{key:'c24',width:9},
    {key:'f615',width:9},{key:'f605',width:9},{key:'f61',width:9},
    {key:'hilio',width:9},{key:'jours',width:8},{key:'statut',width:13},{key:'op',width:20},
  ];
  xlHeader(ws,'RAPPORT DE PRODUCTION MENSUEL — '+mois,'Saisies journalières validées',10);
  xlSection(ws,'📊 Saisies journalières',10);
  xlEntete(ws,['Date','C12','C24','F6/1,5L','F6/0,5L','F6/1L','HILIO','Jours','Statut','Opérateur']);
  (d.saisies||[]).forEach((s,i)=>{
    const row=xlLigne(ws,[s.date_production?.slice(0,10)||'—',s.c12||0,s.c24||0,s.f615||0,s.f605||0,s.f61||0,s.hilio||0,s.jours_ouvres||1,s.statut==='valide'?'✓ Validé':'En attente',s.saisi_par_nom||'—']);
    if(i%2===0) row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
    if(s.statut==='valide') row.getCell(9).font={color:{argb:'FF059669'},bold:true};
  });

  xlSection(ws,'✅ Totaux — Productions validées',10,'059669');
  xlEntete(ws,['Format','Unité','Qté produite','Contenu','CA HT (FCFA)','CD HT (FCFA)','MB HT (FCFA)','TMB HT','',''],'059669');
  [['C12','cartons',12,'btl 1,5L'],['C24','cartons',24,'btl 0,5L'],['F615','fardeaux',6,'btl 1,5L'],['F605','fardeaux',6,'btl 0,5L'],['F61','fardeaux',6,'btl 1L'],['HILIO','packs',30,'sachets']].forEach(([code,unite,mult,desc])=>{
    const q=(d.totaux||{})[code.toLowerCase()]||0, ca=q*(PRIX_PF[code]||0), cd=q*(CD_UNIT[code]||0);
    xlLigne(ws,[code,unite,fmt(q),q*mult+' '+desc,fmt(ca),fmt(cd),fmt(ca-cd),ca>0?fmtP((ca-cd)/ca):'—','','']);
  });
  const t=d.totaux||{}, caT=Object.entries(t).reduce((s,[k,v])=>s+(v||0)*(PRIX_PF[k.toUpperCase()]||0),0);
  const cdT=Object.entries(t).reduce((s,[k,v])=>s+(v||0)*(CD_UNIT[k.toUpperCase()]||0),0);
  xlLigne(ws,['TOTAL','','','',fmt(caT),fmt(cdT),fmt(caT-cdT),caT>0?fmtP((caT-cdT)/caT):'—','',''],{bold:true,bg:'0F172A',couleurs:{5:'22D3EE',6:'EF4444',7:'34D399',8:'F59E0B'}});

  xlSection(ws,'📦 Consommation réelle des intrants',10,'D97706');
  xlEntete(ws,['Intrant','Code','Consommé théo.','Rebuts','Total réel','Prix HT','Valeur HT (FCFA)','','',''],'D97706');
  [['Préformes 32g','PREF_32G',53],['Préformes 17g','PREF_17G',28],['Bouchons vert','BOUCH_VERT',5],['Étiquettes 1,5L','ETI_15L',9],['Étiquettes 0,5L','ETI_05L',6],['Étiquettes 1L','ETI_1L',7],['Cartons C12','CTN_15L',233],['Cartons C24','CTN_05L',200]].forEach(([nom,code,prix])=>{
    const theo=(d.consommations_cumulees||{})[code]||0, reb=(d.rebuts_cumules||{})[code]||0;
    xlLigne(ws,[nom,code,fmt(theo),fmt(reb),fmt(theo+reb),fmt(prix),fmt((theo+reb)*prix),'','','']);
  });

  xlSignature(ws,d.dg_nom,10);
  return wb.xlsx.writeBuffer();
}

// ── Excel ATP ─────────────────────────────────
async function excelATP(wb,d,mois) {
  const ws=wb.addWorksheet('ATP');
  ws.columns=[{key:'a',width:35},{key:'b',width:20},{key:'c',width:20},{key:'d',width:14}];
  xlHeader(ws,'RAPPORT FINANCIER ATP — '+mois,'Analyse des Tableaux de Production',4,'D97706');

  const atp=d.atp||{}, obj=d.objectifs||{}, real=d.realisations||{};
  const cahtp=parseFloat(atp.proj_ca_ht||0), cdhtp=parseFloat(atp.proj_cd_ht||0);
  const cahtr=parseFloat(atp.real_ca_ht||0), cdhtr=parseFloat(atp.real_cd_ht||0);
  const tmbhtp=parseFloat(atp.proj_tmb||0), tmbhtr=parseFloat(atp.taux_marge_brute||0);

  xlSection(ws,'📊 Objectifs de production — Projection',4,'D97706');
  xlEntete(ws,['Produit','Qté objectif','Prix vente HT','CAHTP (FCFA)'],'D97706');
  ['C24','C12','F605','F615','F61','HILIO'].forEach(code=>{
    const q=obj[code]||0;
    xlLigne(ws,[code,fmt(q),parseFloat(PRIX_PF[code]||0).toLocaleString('fr-FR',{minimumFractionDigits:2})+' FCFA',fmt(q*(PRIX_PF[code]||0))]);
  });
  xlLigne(ws,['TOTAL CAHTP','','',fmt(cahtp)],{bold:true,bg:'0F172A',couleurs:{4:'22D3EE'}});

  xlSection(ws,'✅ Réalisation en cours — Cumulé automatique',4,'059669');
  xlEntete(ws,['Produit','Qté réalisée','Montant HT (FCFA)','Avancement'],'059669');
  ['C24','C12','F605','F615','F61','HILIO'].forEach(code=>{
    const q=real[code]||0, mt=q*(PRIX_PF[code]||0), obj_mt=(obj[code]||0)*(PRIX_PF[code]||0);
    xlLigne(ws,[code,fmt(q),fmt(mt),obj_mt>0?((mt/obj_mt)*100).toFixed(1)+'%':'—']);
  });
  xlLigne(ws,['TOTAL CAHTR','',fmt(cahtr),cahtp>0?((cahtr/cahtp)*100).toFixed(1)+'%':'—'],{bold:true,bg:'0F172A',couleurs:{3:'34D399'}});

  xlSection(ws,'📐 Marges brutes — Projection',4,'0891B2');
  xlEntete(ws,['#','Libellé','Montant prévisionnel (FCFA)','']);
  xlLigne(ws,['1','CAHTP',fmt(cahtp),''],{couleurs:{3:'22D3EE'}});
  xlLigne(ws,['2','CDHTP',fmt(cdhtp),''],{couleurs:{3:'EF4444'}});
  xlLigne(ws,['3','MBHTP = CAHTP − CDHTP',fmt(cahtp-cdhtp),''],{bold:true,couleurs:{3:'F59E0B'}});
  xlLigne(ws,['4','TMBHTP = MBHTP / CAHTP','',fmtP(tmbhtp)],{bold:true,couleurs:{4:'F59E0B'}});
  ws.addRow([]);
  xlEntete(ws,['Rubrique','Montant (FCFA)','Taux',''],'7C3AED');
  const bmfP=tmbhtp>0?(cahtp*0.35)/(tmbhtp*0.15):0, fsP=tmbhtp>0?(cahtp*0.35)/(tmbhtp*0.10):0, ammP=tmbhtp>0?(cahtp*0.35)/(tmbhtp*0.10):0;
  xlLigne(ws,['BMF',fmt(bmfP),fmtP(tmbhtp*0.15/0.35),'']);
  xlLigne(ws,['Frais de Siège',fmt(fsP),fmtP(tmbhtp*0.10/0.35),'']);
  xlLigne(ws,['Amortissement',fmt(ammP),fmtP(tmbhtp*0.10/0.35),'']);
  xlLigne(ws,['TOTAL MB répartie',fmt(bmfP+fsP+ammP),'32%',''],{bold:true,bg:'0F172A',couleurs:{2:'7C3AED'}});

  xlSection(ws,'📐 Marges brutes — Réalisation',4,'059669');
  xlEntete(ws,['#','Libellé','Montant réalisé (FCFA)',''],'059669');
  xlLigne(ws,['5','CAHTR',fmt(cahtr),''],{couleurs:{3:'34D399'}});
  xlLigne(ws,['6','CDHTR',fmt(cdhtr),''],{couleurs:{3:'EF4444'}});
  xlLigne(ws,['7','MBHTR = CAHTR − CDHTR',fmt(cahtr-cdhtr),''],{bold:true,couleurs:{3:'34D399'}});
  xlLigne(ws,['8','TMBHTR = MBHTR / CAHTR','',fmtP(tmbhtr)],{bold:true,couleurs:{4:'34D399'}});
  ws.addRow([]);
  xlEntete(ws,['Rubrique','Montant réalisé (FCFA)','Taux réalisé',''],'059669');
  const bmfR=tmbhtr>0?(cahtr*0.35)/(tmbhtr*0.15):0, fsR=tmbhtr>0?(cahtr*0.35)/(tmbhtr*0.10):0, ammR=tmbhtr>0?(cahtr*0.35)/(tmbhtr*0.10):0;
  xlLigne(ws,['BMF',fmt(bmfR),fmtP(tmbhtr*0.15/0.35),'']);
  xlLigne(ws,['Frais de Siège',fmt(fsR),fmtP(tmbhtr*0.10/0.35),'']);
  xlLigne(ws,['Amortissement',fmt(ammR),fmtP(tmbhtr*0.10/0.35),'']);
  xlLigne(ws,['TOTAL MB répartie',fmt(bmfR+fsR+ammR),fmtP(tmbhtr*0.35/0.35),''],{bold:true,bg:'0F172A',couleurs:{2:'34D399'}});

  if (d.charges && Object.values(d.charges).some(v=>parseFloat(v)>0)) {
    xlSection(ws,'💼 Charges indirectes (CIHT)',4,'7C3AED');
    xlEntete(ws,['Nature','Montant (FCFA)','',''],'7C3AED');
    [['Salaires',d.charges.salaires],['Électricité',d.charges.electricite],['Carburant',d.charges.carburant],['Loyer',d.charges.loyer],['Maintenance',d.charges.maintenance],['Autres',d.charges.autres]].forEach(([l,v])=>{if(parseFloat(v)>0)xlLigne(ws,[l,fmt(v),'','']);});
    xlLigne(ws,['TOTAL CIHT',fmt(d.totalCI||0),'',''],{bold:true,bg:'0F172A',couleurs:{2:'8B5CF6'}});
  }

  xlSignature(ws,d.dg_nom,4);
  return wb.xlsx.writeBuffer();
}

// ── Excel Stocks ──────────────────────────────
async function excelStocks(wb,d,mois) {
  const ws1=wb.addWorksheet('Stocks actuels');
  ws1.columns=[{key:'a',width:35},{key:'b',width:14},{key:'c',width:9},{key:'d',width:10},{key:'e',width:14},{key:'f',width:14},{key:'g',width:18},{key:'h',width:13},{key:'i',width:12}];
  xlHeader(ws1,'ÉTAT DES STOCKS — '+mois,'Inventaire complet par classe',9,'059669');
  [1,2,3].forEach(cl=>{
    const arts=(d.articles||[]).filter(a=>parseInt(a.classe)===cl);
    if(!arts.length) return;
    xlSection(ws1,cl===1?'📦 Classe 1 — Consommables production':cl===2?'🔧 Classe 2 — EPI & Pièces de rechange':'✅ Classe 3 — Produits finis',9,cl===1?'0891B2':cl===2?'7C3AED':'059669');
    xlEntete(ws1,['Article','Code','Cl.','Unité','Stock actuel','Prix HT','Valeur HT','Seuil alerte','Statut'],cl===1?'0891B2':cl===2?'7C3AED':'059669');
    arts.forEach((a,i)=>{
      const stock=parseFloat(a.stock_actuel||0), statut=stock<=0?'Rupture':a.seuil_alerte&&stock<=a.seuil_alerte?'Faible':'OK';
      const row=xlLigne(ws1,[a.libelle,a.code,cl,a.unite,fmt(stock),fmt(a.prix_unitaire_ht||0),fmt(a.valeur_stock_ht||0),a.seuil_alerte||0,statut]);
      if(i%2===0) row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
      row.getCell(9).font={color:{argb:statut==='Rupture'?'FFDC2626':statut==='Faible'?'FFD97706':'FF059669'},bold:true};
    });
  });
  xlSignature(ws1,d.dg_nom,9);

  const ws2=wb.addWorksheet('Mouvements');
  ws2.columns=[{key:'a',width:13},{key:'b',width:30},{key:'c',width:8},{key:'d',width:10},{key:'e',width:13},{key:'f',width:16},{key:'g',width:30}];
  xlHeader(ws2,'MOUVEMENTS DE STOCK — '+mois,'Historique des entrées et sorties',7,'0891B2');
  xlEntete(ws2,['Date','Article','Cl.','Type','Quantité','Valeur HT','Motif']);
  (d.mouvements||[]).forEach((m,i)=>{
    const row=xlLigne(ws2,[m.date_mouvement?.slice(0,10)||'—',m.article_libelle||'—',m.classe,m.type_mouvement==='entree'?'↑ Entrée':'↓ Sortie',fmt(m.quantite),fmt(m.valeur_ht||0),m.motif||'—']);
    if(i%2===0) row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
    row.getCell(4).font={color:{argb:m.type_mouvement==='entree'?'FF059669':'FFDC2626'},bold:true};
  });
  return wb.xlsx.writeBuffer();
}

// ── Excel Trésorerie ──────────────────────────
async function excelTresorerie(wb,d,mois) {
  const ws=wb.addWorksheet('Trésorerie');
  ws.columns=[{key:'a',width:13},{key:'b',width:22},{key:'c',width:30},{key:'d',width:16},{key:'e',width:16},{key:'f',width:18}];
  xlHeader(ws,'RAPPORT DE TRÉSORERIE — '+mois,'Brouillard de caisse et soldes',6,'34D399');

  xlSection(ws,'💰 Soldes des comptes',6,'34D399');
  xlEntete(ws,['Compte','Type','Banque','Solde (FCFA)','',''],'34D399');
  (d.comptes||[]).forEach((c,i)=>{
    const row=xlLigne(ws,[c.libelle,c.type_compte||'—',c.banque||'—',fmt(c.solde_fcfa||0),'','']);
    if(i%2===0) row.eachCell(c2=>{c2.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
    row.getCell(4).font={bold:true,color:{argb:'FF22D3EE'}};
  });
  xlLigne(ws,['TOTAL TRÉSORERIE','','',fmt((d.comptes||[]).reduce((s,c)=>s+parseFloat(c.solde_fcfa||0),0)),'',''],{bold:true,bg:'0F172A',couleurs:{4:'34D399'}});

  xlSection(ws,'📋 Brouillard de caisse',6,'0891B2');
  xlEntete(ws,['Date','Compte','Libellé','↑ Entrée (FCFA)','↓ Sortie (FCFA)','Solde cumulé']);
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
async function excelRebuts(wb,d,mois) {
  const ws=wb.addWorksheet('Rebuts');
  ws.columns=[{key:'a',width:13},{key:'b',width:28},{key:'c',width:14},{key:'d',width:14},{key:'e',width:16}];
  xlHeader(ws,'RAPPORT DES REBUTS — '+mois,'Analyse des pertes par intrant',5,'DC2626');
  xlSection(ws,'📉 Rebuts par date et intrant',5,'DC2626');
  xlEntete(ws,['Date','Intrant','Quantité','Prix HT unit.','Valeur HT (FCFA)'],'DC2626');
  const rebuts=d.rebuts||[];
  rebuts.forEach((r,i)=>{
    const row=xlLigne(ws,[r.date?.slice(0,10)||'—',r.intrant||'—',fmt(r.quantite||0),fmt(r.prix||0),fmt(r.valeur||0)]);
    if(i%2===0) row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};});
    row.getCell(5).font={color:{argb:'FFDC2626'}};
  });
  const totalVal=rebuts.reduce((s,r)=>s+(r.valeur||0),0);
  xlLigne(ws,['TOTAL','',fmt(rebuts.reduce((s,r)=>s+(r.quantite||0),0)),'',fmt(totalVal)],{bold:true,bg:'0F172A',couleurs:{5:'EF4444'}});
  xlSignature(ws,d.dg_nom,5);
  return wb.xlsx.writeBuffer();
}

// ═══════════════════════════════════════════════
// PDF — design moderne
// ═══════════════════════════════════════════════

async function genererPDF(type, donnees, mois) {
  return new Promise((resolve,reject) => {
    try {
      const doc=new PDFDocument({margin:40,size:'A4',info:{Title:`SINEX SA — Rapport ${type} ${mois}`,Author:'SINEX SA',Creator:'SINEX SA Dashboard'}});
      const bufs=[];
      doc.on('data',b=>bufs.push(b));
      doc.on('end',()=>resolve(Buffer.concat(bufs)));
      doc.on('error',reject);

      drawPDFEntete(doc, type, mois, donnees.dg_nom);

      switch(type) {
        case 'production': pdfProduction(doc,donnees); break;
        case 'atp':        pdfATP(doc,donnees); break;
        case 'stocks':     pdfStocks(doc,donnees); break;
        case 'tresorerie': pdfTresorerie(doc,donnees); break;
        case 'rebuts':     pdfRebuts(doc,donnees); break;
        default:           pdfProduction(doc,donnees);
      }

      drawPDFSignature(doc, donnees.dg_nom);
      doc.end();
    } catch(e) { reject(e); }
  });
}

const COULEURS_TYPE = {production:'#22D3EE',atp:'#F59E0B',stocks:'#34D399',tresorerie:'#34D399',rebuts:'#EF4444',tendances:'#8B5CF6'};
const TITRES_TYPE = {production:'RAPPORT DE PRODUCTION MENSUEL',atp:'RAPPORT FINANCIER ATP',stocks:'ÉTAT DES STOCKS',tresorerie:'RAPPORT DE TRÉSORERIE',rebuts:'RAPPORT DES REBUTS',tendances:'ANALYSE DES TENDANCES'};

function drawPDFEntete(doc, type, mois, dgNom) {
  const W=doc.page.width, couleur=COULEURS_TYPE[type]||'#22D3EE';

  // Bande supérieure foncée
  doc.rect(0,0,W,75).fill('#0F172A');

  // Logo SINEX SA
  doc.roundedRect(40,12,90,40,4).fill('#1E3A5F');
  doc.fillColor(couleur).fontSize(20).font('Helvetica-Bold').text('SINEX',45,15);
  doc.fillColor('#FFFFFF').fontSize(12).font('Helvetica-Bold').text('SA',102,22);
  doc.fillColor('#94A3B8').fontSize(7).font('Helvetica').text('Société des Eaux',45,38);
  doc.fillColor('#94A3B8').fontSize(7).text('du Nord — Extrême',45,48);

  // Infos société
  doc.fillColor('#E2E8F0').fontSize(11).font('Helvetica-Bold').text('SINEX SA',145,14);
  doc.fillColor('#94A3B8').fontSize(8).font('Helvetica').text('Défalé, Togo',145,28);
  doc.fillColor('#64748B').fontSize(7).text(`Rapport généré le ${new Date().toLocaleDateString('fr-FR')} par ${dgNom||'Boumzina Raïna'}`,145,40);
  doc.fillColor('#475569').fontSize(7).text('Document confidentiel — Usage interne uniquement',145,52);

  // Ligne décorative
  doc.rect(0,75,W,4).fill(couleur);

  // Titre du rapport
  doc.rect(0,79,W,36).fill('#1E293B');
  doc.fillColor(couleur).fontSize(14).font('Helvetica-Bold')
     .text(`${TITRES_TYPE[type]||'RAPPORT'} — ${mois}`, 40, 88, {align:'center',width:W-80});

  doc.moveDown(3.5);
}

function drawPDFSignature(doc, dgNom) {
  if (doc.y > doc.page.height-90) doc.addPage();
  doc.moveDown(2);
  doc.moveTo(40,doc.y).lineTo(doc.page.width-40,doc.y).lineWidth(0.5).stroke('#334155');
  doc.moveDown(0.5);
  const W=doc.page.width-80;
  doc.fillColor('#94A3B8').fontSize(8).font('Helvetica')
     .text(`Fait à Défalé, le ${new Date().toLocaleDateString('fr-FR')}`,40,doc.y,{width:W/2,continued:false});
  doc.fillColor('#334155').fontSize(9).font('Helvetica-Bold')
     .text(`Directeur Général : ${dgNom||'Boumzina Raïna'}`,40+W/2,doc.y-12,{width:W/2,align:'right'});
  doc.fillColor('#64748B').fontSize(8).font('Helvetica-Oblique')
     .text('Signature & Cachet',40+W/2,doc.y+2,{width:W/2,align:'right'});
  // Ligne de signature
  doc.moveTo(doc.page.width-160,doc.y+20).lineTo(doc.page.width-40,doc.y+20).stroke('#334155');

  // Pied de page
  doc.rect(0,doc.page.height-22,doc.page.width,22).fill('#0F172A');
  doc.fillColor('#475569').fontSize(7).font('Helvetica')
     .text(`SINEX SA — Confidentiel — ${new Date().toLocaleDateString('fr-FR')}`,
       40,doc.page.height-15,{align:'center',width:doc.page.width-80});
}

// Helpers PDF
function pdfSection(doc,titre,couleur='#22D3EE') {
  if(doc.y>doc.page.height-100) { doc.addPage(); drawPDFBandeau(doc); }
  doc.moveDown(0.4);
  const y=doc.y;
  doc.rect(40,y,doc.page.width-80,16).fill('#1E3A5F');
  doc.fillColor(couleur).fontSize(9).font('Helvetica-Bold').text(titre,44,y+3,{width:doc.page.width-90});
  doc.moveDown(0.9);
}

function drawPDFBandeau(doc) {
  doc.rect(0,0,doc.page.width,4).fill('#22D3EE');
}

function pdfTableau(doc,entetes,lignes,couleur='#0891B2',widths=null) {
  const W=doc.page.width-80, n=entetes.length;
  const cols=widths||Array(n).fill(Math.floor(W/n));
  const rowH=14;

  const dessinerEntete=()=>{
    let x=40,y=doc.y;
    doc.rect(40,y,W,rowH).fill(couleur);
    entetes.forEach((e,i)=>{
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold').text(String(e),x+2,y+3,{width:cols[i]-4,ellipsis:true,lineBreak:false});
      x+=cols[i];
    });
    doc.moveDown(0.85);
  };
  dessinerEntete();

  lignes.forEach((ligne,li)=>{
    if(doc.y>doc.page.height-70){doc.addPage();drawPDFBandeau(doc);dessinerEntete();}
    const ry=doc.y;
    if(li%2===0) doc.rect(40,ry-1,W,rowH-1).fill('#F1F5F9');
    let x=40;
    ligne.forEach((val,i)=>{
      const color=(typeof val==='object'&&val?.color)?val.color:'#334155';
      const text=(typeof val==='object'&&val?.text)?String(val.text):String(val??'—');
      const bold=typeof val==='object'&&val?.bold;
      doc.fillColor(color).fontSize(7.5).font(bold?'Helvetica-Bold':'Helvetica')
         .text(text,x+2,ry+2,{width:cols[i]-4,ellipsis:true,lineBreak:false});
      x+=cols[i];
    });
    doc.moveDown(0.75);
  });
}

function pdfProduction(doc,d) {
  pdfSection(doc,'📊 Saisies journalières');
  pdfTableau(doc,['Date','C12','C24','F6/1,5L','F6/0,5L','F6/1L','HILIO','Jrs','Statut'],
    (d.saisies||[]).map(s=>[
      s.date_production?.slice(0,10)||'—',fmt(s.c12||0),fmt(s.c24||0),
      fmt(s.f615||0),fmt(s.f605||0),fmt(s.f61||0),fmt(s.hilio||0),
      s.jours_ouvres||1,
      {text:s.statut==='valide'?'✓ Validé':'Attente',color:s.statut==='valide'?'#059669':'#D97706',bold:s.statut==='valide'},
    ]),
    '#0891B2',[55,38,38,42,42,38,38,28,55]
  );

  pdfSection(doc,'✅ Totaux productions validées','#34D399');
  const t=d.totaux||{};
  pdfTableau(doc,['Format','Qté','CA HT (FCFA)','CD HT (FCFA)','MB HT (FCFA)','TMB HT'],
    [['C12',12],['C24',24],['F615',6],['F605',6],['F61',6],['HILIO',30]].map(([code])=>{
      const q=(t[code.toLowerCase()]||0),ca=q*(PRIX_PF[code]||0),cd=q*(CD_UNIT[code]||0);
      return [code,fmt(q),{text:fmt(ca),color:'#22D3EE'},{text:fmt(cd),color:'#EF4444'},{text:fmt(ca-cd),color:'#34D399'},ca>0?fmtP((ca-cd)/ca):'—'];
    }),
    '#059669',[60,40,90,90,90,60]
  );

  pdfSection(doc,'📦 Consommation réelle des intrants','#F59E0B');
  const cc=d.consommations_cumulees||{}, rc=d.rebuts_cumules||{};
  pdfTableau(doc,['Intrant','Théorique','Rebuts','Total réel','Prix HT','Valeur HT'],
    [['Préformes 32g','PREF_32G',53],['Préformes 17g','PREF_17G',28],['Bouchons','BOUCH_VERT',5],
     ['Étiq. 1,5L','ETI_15L',9],['Étiq. 0,5L','ETI_05L',6],['Cartons C12','CTN_15L',233],['Cartons C24','CTN_05L',200]].map(([nom,code,prix])=>{
      const theo=cc[code]||0,reb=rc[code]||0;
      return [nom,fmt(theo),{text:fmt(reb),color:'#F59E0B'},fmt(theo+reb),fmt(prix),{text:fmt((theo+reb)*prix),color:'#22D3EE'}];
    }),
    '#D97706',[90,50,50,50,50,75]
  );
}

function pdfATP(doc,d) {
  const atp=d.atp||{},obj=d.objectifs||{},real=d.realisations||{};
  const cahtp=parseFloat(atp.proj_ca_ht||0),cdhtp=parseFloat(atp.proj_cd_ht||0);
  const cahtr=parseFloat(atp.real_ca_ht||0),cdhtr=parseFloat(atp.real_cd_ht||0);
  const tmbhtp=parseFloat(atp.proj_tmb||0),tmbhtr=parseFloat(atp.taux_marge_brute||0);

  pdfSection(doc,'📊 Objectifs de production — Projection','#F59E0B');
  pdfTableau(doc,['Produit','Qté objectif','Prix vente HT','CAHTP (FCFA)'],
    ['C24','C12','F605','F615','F61','HILIO'].map(c=>[c,fmt(obj[c]||0),parseFloat(PRIX_PF[c]||0).toLocaleString('fr-FR',{minimumFractionDigits:2})+' F',{text:fmt((obj[c]||0)*(PRIX_PF[c]||0)),color:'#22D3EE'}]),
    '#D97706',[70,80,110,140]
  );

  pdfSection(doc,'✅ Réalisation en cours','#34D399');
  pdfTableau(doc,['Produit','Qté réalisée','Montant HT','Avancement'],
    ['C24','C12','F605','F615','F61','HILIO'].map(c=>{
      const q=real[c]||0,mt=q*(PRIX_PF[c]||0),om=(obj[c]||0)*(PRIX_PF[c]||0);
      return [c,fmt(q),{text:fmt(mt),color:'#34D399'},{text:om>0?((mt/om)*100).toFixed(1)+'%':'—',color:om>0&&mt>=om?'#34D399':'#F59E0B'}];
    }),
    '#059669',[70,80,130,120]
  );

  pdfSection(doc,'📐 Marges brutes — Projection');
  pdfTableau(doc,['#','Libellé','Prévisionnel (FCFA)',''],
    [['1','CAHTP',{text:fmt(cahtp),color:'#22D3EE'},''],
     ['2','CDHTP',{text:fmt(cdhtp),color:'#EF4444'},''],
     ['3',{text:'MBHTP',bold:true},{text:fmt(cahtp-cdhtp),color:'#F59E0B',bold:true},''],
     ['4','TMBHTP = MBHTP/CAHTP','',{text:fmtP(tmbhtp),color:'#F59E0B',bold:true}]],
    '#0891B2',[25,145,145,85]
  );
  const bmfP=tmbhtp>0?(cahtp*0.35)/(tmbhtp*0.15):0,fsP=tmbhtp>0?(cahtp*0.35)/(tmbhtp*0.10):0,ammP=bmfP>0?fsP:0;
  pdfSection(doc,'Répartition MBHTP','#7C3AED');
  pdfTableau(doc,['Rubrique','Montant (FCFA)','Taux',''],
    [['BMF',fmt(bmfP),fmtP(tmbhtp*0.15/0.35),''],['Frais de Siège',fmt(fsP),fmtP(tmbhtp*0.10/0.35),''],['Amortissement',fmt(ammP),fmtP(tmbhtp*0.10/0.35),'']],
    '#7C3AED',[100,130,100,70]
  );

  pdfSection(doc,'📐 Marges brutes — Réalisation','#34D399');
  pdfTableau(doc,['#','Libellé','Réalisé (FCFA)',''],
    [['5','CAHTR',{text:fmt(cahtr),color:'#34D399'},''],
     ['6','CDHTR',{text:fmt(cdhtr),color:'#EF4444'},''],
     ['7',{text:'MBHTR',bold:true},{text:fmt(cahtr-cdhtr),color:'#34D399',bold:true},''],
     ['8','TMBHTR = MBHTR/CAHTR','',{text:fmtP(tmbhtr),color:'#34D399',bold:true}]],
    '#059669',[25,145,145,85]
  );
  const bmfR=tmbhtr>0?(cahtr*0.35)/(tmbhtr*0.15):0,fsR=tmbhtr>0?(cahtr*0.35)/(tmbhtr*0.10):0;
  pdfSection(doc,'Répartition MBHTR','#059669');
  pdfTableau(doc,['Rubrique','Montant réalisé (FCFA)','Taux réalisé',''],
    [['BMF',fmt(bmfR),fmtP(tmbhtr*0.15/0.35),''],['Frais de Siège',fmt(fsR),fmtP(tmbhtr*0.10/0.35),''],['Amortissement',fmt(fsR),fmtP(tmbhtr*0.10/0.35),'']],
    '#059669',[100,130,100,70]
  );

  if(d.charges&&Object.values(d.charges).some(v=>parseFloat(v)>0)) {
    pdfSection(doc,'💼 Charges indirectes (CIHT)','#8B5CF6');
    pdfTableau(doc,['Nature','Montant (FCFA)','',''],
      [['Salaires',d.charges.salaires],['Électricité',d.charges.electricite],['Carburant',d.charges.carburant],['Loyer',d.charges.loyer],['Maintenance',d.charges.maintenance],['Autres',d.charges.autres]].filter(([,v])=>parseFloat(v)>0).map(([l,v])=>[l,{text:fmt(v),color:'#8B5CF6'},'','']),
      '#7C3AED',[120,140,60,80]
    );
  }
}

function pdfStocks(doc,d) {
  [1,2,3].forEach(cl=>{
    const arts=(d.articles||[]).filter(a=>parseInt(a.classe)===cl);
    if(!arts.length) return;
    const titres={1:'📦 Classe 1 — Consommables production',2:'🔧 Classe 2 — EPI & Pièces de rechange',3:'✅ Classe 3 — Produits finis'};
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

function pdfTresorerie(doc,d) {
  pdfSection(doc,'💰 Soldes des comptes','#34D399');
  pdfTableau(doc,['Compte','Type','Solde (FCFA)',''],
    [...(d.comptes||[]).map(c=>[c.libelle,c.type_compte||'—',{text:fmt(c.solde_fcfa||0),color:'#22D3EE',bold:true},''])],
    '34D399',[150,70,130,50]
  );

  pdfSection(doc,'📋 Brouillard de caisse');
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

function pdfRebuts(doc,d) {
  pdfSection(doc,'📉 Rebuts par date et intrant','#EF4444');
  const rebuts=d.rebuts||[];
  pdfTableau(doc,['Date','Intrant','Quantité','Prix HT unit.','Valeur HT (FCFA)'],
    rebuts.map(r=>[r.date?.slice(0,10)||'—',r.intrant||'—',fmt(r.quantite||0),fmt(r.prix||0),{text:fmt(r.valeur||0),color:'#EF4444'}]),
    '#DC2626',[65,110,55,60,80]
  );
  if(rebuts.length>0) {
    const totalVal=rebuts.reduce((s,r)=>s+(r.valeur||0),0);
    doc.moveDown(0.5);
    doc.fillColor('#EF4444').fontSize(10).font('Helvetica-Bold')
       .text(`Total valeur des rebuts : ${fmt(totalVal)} FCFA`,40,doc.y,{align:'right',width:doc.page.width-80});
  }
}

module.exports = { genererExcel, genererPDF };
