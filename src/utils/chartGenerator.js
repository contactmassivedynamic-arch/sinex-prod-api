/**
 * Génération de graphiques PNG haute résolution pour les rapports PDF SINEX SA
 * Utilise @napi-rs/canvas — rendu natif sans dépendances système
 */
const { createCanvas } = require('@napi-rs/canvas');

// ── Palette SINEX SA ─────────────────────────────
const COULEURS = {
  c12:   '#0891B2', // cyan
  c24:   '#7C3AED', // violet
  f615:  '#059669', // vert
  f605:  '#D97706', // amber
  f61:   '#DC2626', // rouge
  hilio: '#0D9488', // teal
  bg:    '#0F172A', // fond sombre
  bg2:   '#1E293B',
  bg3:   '#334155',
  text:  '#F1F5F9',
  text2: '#94A3B8',
  grid:  '#334155',
  blanc: '#FFFFFF',
};

const PALETTE = [COULEURS.c12, COULEURS.c24, COULEURS.f615, COULEURS.f605, COULEURS.f61, COULEURS.hilio,
                 '#F472B6','#FB923C','#A3E635','#38BDF8'];

const fmt = n => Math.round(parseFloat(n)||0).toLocaleString('fr-FR');
const W = 900, H = 380;

function creerCanvas(w=W, h=H) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  // Fond sombre SINEX SA
  ctx.fillStyle = COULEURS.bg2;
  ctx.fillRect(0, 0, w, h);
  return { canvas, ctx };
}

function dessinerGrille(ctx, x0, y0, w, h, nbLignes=5, nbCols=0) {
  ctx.strokeStyle = COULEURS.grid;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([3, 4]);
  for (let i=0; i<=nbLignes; i++) {
    const y = y0 + (h/nbLignes)*i;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0+w, y); ctx.stroke();
  }
  if (nbCols > 0) {
    for (let i=0; i<=nbCols; i++) {
      const x = x0 + (w/nbCols)*i;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0+h); ctx.stroke();
    }
  }
  ctx.setLineDash([]);
}

function texte(ctx, txt, x, y, opts={}) {
  const { color=COULEURS.text, size=11, bold=false, align='left', maxWidth } = opts;
  ctx.fillStyle = color;
  ctx.font = `${bold?'bold ':''} ${size}px Arial`;
  ctx.textAlign = align;
  if (maxWidth) ctx.fillText(String(txt), x, y, maxWidth);
  else ctx.fillText(String(txt), x, y);
}

function arrondiRect(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath(); ctx.fill();
}

// ── 1. BARRES PRODUCTION PAR FORMAT ─────────────
function graphiqueBarresProduction(totaux) {
  const { canvas, ctx } = creerCanvas(W, H);
  const PAD = {t:50,r:30,b:70,l:80};
  const gw = W-PAD.l-PAD.r, gh = H-PAD.t-PAD.b;

  const formats = [
    {code:'C12',label:'C12',val:totaux.c12||0,col:COULEURS.c12},
    {code:'C24',label:'C24',val:totaux.c24||0,col:COULEURS.c24},
    {code:'F615',label:'F6/1,5L',val:totaux.f615||0,col:COULEURS.f615},
    {code:'F605',label:'F6/0,5L',val:totaux.f605||0,col:COULEURS.f605},
    {code:'F61',label:'F6/1L',val:totaux.f61||0,col:COULEURS.f61},
    {code:'HILIO',label:'HILIO',val:totaux.hilio||0,col:COULEURS.hilio},
  ];

  const maxVal = Math.max(...formats.map(f=>f.val), 1);
  const barW = (gw / formats.length) * 0.6;
  const gap  = (gw / formats.length);

  // Titre
  texte(ctx, 'Production par format (cartons/fardeaux/packs)', W/2, 28, {size:13,bold:true,align:'center',color:COULEURS.text});

  // Grille
  dessinerGrille(ctx, PAD.l, PAD.t, gw, gh, 5);

  // Axe Y labels
  for (let i=0; i<=5; i++) {
    const val = Math.round(maxVal/5*i);
    const y = PAD.t + gh - (gh/5)*i;
    texte(ctx, fmt(val), PAD.l-8, y+4, {size:9,color:COULEURS.text2,align:'right'});
  }

  // Barres
  formats.forEach((f, i) => {
    const x = PAD.l + gap*i + (gap-barW)/2;
    const bh = (f.val/maxVal)*gh;
    const y  = PAD.t + gh - bh;

    // Barre avec dégradé simulé (barre + reflet)
    arrondiRect(ctx, x, y, barW, bh, 4, f.col);

    // Reflet clair en haut
    const grad = ctx.createLinearGradient(x, y, x, y+bh*0.4);
    grad.addColorStop(0, 'rgba(255,255,255,0.15)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barW, bh*0.4);

    // Valeur au-dessus
    if (f.val > 0) {
      texte(ctx, fmt(f.val), x+barW/2, y-6, {size:9,bold:true,align:'center',color:f.col});
    }

    // Label en bas
    texte(ctx, f.label, x+barW/2, PAD.t+gh+18, {size:10,align:'center',color:COULEURS.text});
  });

  // Axes
  ctx.strokeStyle = COULEURS.text2; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t+gh); ctx.lineTo(PAD.l+gw, PAD.t+gh); ctx.stroke();

  return canvas.toBuffer('image/png');
}

// ── 2. COURBE CA / MB EVOLUTION ─────────────────
function graphiqueCourbeCA(historique) {
  const { canvas, ctx } = creerCanvas(W, H);
  const PAD = {t:50,r:30,b:70,l:90};
  const gw = W-PAD.l-PAD.r, gh = H-PAD.t-PAD.b;

  if (!historique || historique.length < 2) {
    texte(ctx, 'Historique insuffisant (minimum 2 mois)', W/2, H/2, {size:13,align:'center',color:COULEURS.text2});
    return canvas.toBuffer('image/png');
  }

  const maxCA = Math.max(...historique.map(m=>parseFloat(m.ca_ht||0)), 1);
  const series = [
    { key:'ca_ht', label:'CA HT', color:COULEURS.c12, pts:[] },
    { key:'mb_ht', label:'MB HT', color:COULEURS.f615, pts:[] },
  ];

  historique.forEach((m, i) => {
    const x = PAD.l + (gw/(historique.length-1))*i;
    series.forEach(s => {
      const val = parseFloat(m[s.key]||0);
      const y = PAD.t + gh - (val/maxCA)*gh;
      s.pts.push({x, y, val});
    });
  });

  texte(ctx, 'Évolution CA HT et MB HT (FCFA)', W/2, 28, {size:13,bold:true,align:'center'});
  dessinerGrille(ctx, PAD.l, PAD.t, gw, gh, 5);

  // Axe Y
  for (let i=0; i<=5; i++) {
    const val = Math.round(maxCA/5*i);
    const y = PAD.t + gh - (gh/5)*i;
    texte(ctx, fmt(val), PAD.l-8, y+4, {size:8,color:COULEURS.text2,align:'right'});
  }

  // Zone sous la courbe CA
  ctx.beginPath();
  ctx.moveTo(series[0].pts[0].x, PAD.t+gh);
  series[0].pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(series[0].pts[series[0].pts.length-1].x, PAD.t+gh);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, PAD.t, 0, PAD.t+gh);
  grad.addColorStop(0, 'rgba(8,145,178,0.25)');
  grad.addColorStop(1, 'rgba(8,145,178,0.02)');
  ctx.fillStyle = grad; ctx.fill();

  // Courbes
  series.forEach(s => {
    ctx.beginPath(); ctx.moveTo(s.pts[0].x, s.pts[0].y);
    s.pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = s.color; ctx.lineWidth = 2.5;
    ctx.setLineDash(s.key==='mb_ht'?[6,3]:[]);
    ctx.stroke(); ctx.setLineDash([]);

    // Points
    s.pts.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2);
      ctx.fillStyle = s.color; ctx.fill();
      ctx.strokeStyle = COULEURS.bg2; ctx.lineWidth = 1.5; ctx.stroke();
    });
  });

  // Labels X
  historique.forEach((m, i) => {
    const x = PAD.l + (gw/(historique.length-1))*i;
    texte(ctx, m.mois?.slice(0,7)||'', x, PAD.t+gh+18, {size:9,align:'center',color:COULEURS.text2});
  });

  // Légende
  series.forEach((s,i) => {
    const lx = PAD.l + i*120;
    arrondiRect(ctx, lx, H-20, 12, 3, 2, s.color);
    texte(ctx, s.label, lx+16, H-16, {size:10,color:COULEURS.text});
  });

  ctx.strokeStyle = COULEURS.text2; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t+gh); ctx.lineTo(PAD.l+gw, PAD.t+gh); ctx.stroke();

  return canvas.toBuffer('image/png');
}

// ── 3. CAMEMBERT RÉPARTITION MBHTP ──────────────
function graphiqueCamembertMB(bmf, fs, amm) {
  const { canvas, ctx } = creerCanvas(420, 340);
  const cx = 180, cy = 170, r = 120;
  const total = bmf + fs + amm;
  if (total === 0) return null;

  texte(ctx, 'Répartition MBHTP', 210, 24, {size:13,bold:true,align:'center'});

  const slices = [
    { label:'BMF',          val:bmf, color:COULEURS.c12  },
    { label:'Frais Siège',  val:fs,  color:COULEURS.f615  },
    { label:'Amortissement',val:amm, color:COULEURS.c24   },
  ];

  let angle = -Math.PI/2;
  slices.forEach(s => {
    const sweep = (s.val/total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle+sweep);
    ctx.closePath();
    ctx.fillStyle = s.color; ctx.fill();
    ctx.strokeStyle = COULEURS.bg2; ctx.lineWidth = 2; ctx.stroke();

    // Étiquette pourcentage
    const midA = angle + sweep/2;
    const lx = cx + Math.cos(midA)*r*0.65;
    const ly = cy + Math.sin(midA)*r*0.65;
    texte(ctx, ((s.val/total)*100).toFixed(1)+'%', lx, ly+4, {size:11,bold:true,align:'center'});
    angle += sweep;
  });

  // Cercle central (donut)
  ctx.beginPath(); ctx.arc(cx, cy, r*0.45, 0, Math.PI*2);
  ctx.fillStyle = COULEURS.bg2; ctx.fill();
  texte(ctx, fmt(total), cx, cy-4, {size:11,bold:true,align:'center'});
  texte(ctx, 'FCFA', cx, cy+12, {size:9,align:'center',color:COULEURS.text2});

  // Légende
  slices.forEach((s, i) => {
    const ly = 80 + i*32;
    arrondiRect(ctx, 316, ly, 14, 14, 3, s.color);
    texte(ctx, s.label, 336, ly+11, {size:10});
    texte(ctx, fmt(s.val)+' F', 336, ly+23, {size:9,color:COULEURS.text2});
  });

  return canvas.toBuffer('image/png');
}

// ── 4. BARRES AVANCEMENT ATP ─────────────────────
function graphiqueAvancementATP(objectifs, realisations) {
  const codes = ['C12','C24','F615','F605','F61','HILIO'];
  const { canvas, ctx } = creerCanvas(W, 300);
  const PAD = {t:45,r:30,b:55,l:90};
  const gw = W-PAD.l-PAD.r, gh = 300-PAD.t-PAD.b;

  texte(ctx, 'Avancement ATP — Objectifs vs Réalisations', W/2, 26, {size:13,bold:true,align:'center'});

  const maxVal = Math.max(...codes.flatMap(c=>[objectifs[c]||0,realisations[c]||0]),1);
  const grpW = gw/codes.length;
  const barW = grpW*0.3;

  dessinerGrille(ctx, PAD.l, PAD.t, gw, gh, 4);

  codes.forEach((code, i) => {
    const obj  = objectifs[code]||0;
    const real = realisations[code]||0;
    const x0   = PAD.l + grpW*i + grpW*0.05;

    // Barre objectif (semi-transparent)
    const bhObj  = (obj/maxVal)*gh;
    ctx.fillStyle = 'rgba(148,163,184,0.3)';
    ctx.fillRect(x0, PAD.t+gh-bhObj, barW, bhObj);
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth=1;
    ctx.strokeRect(x0, PAD.t+gh-bhObj, barW, bhObj);

    // Barre réalisation
    const bhReal = (real/maxVal)*gh;
    const txAvancement = obj>0?real/obj:0;
    const col = txAvancement>=0.9?COULEURS.f615:txAvancement>=0.7?COULEURS.f605:COULEURS.f61;
    arrondiRect(ctx, x0+barW+2, PAD.t+gh-bhReal, barW, bhReal, 3, col);

    // Taux
    texte(ctx, obj>0?((real/obj)*100).toFixed(0)+'%':'--',
      x0+barW+2+barW/2, PAD.t+gh-bhReal-8, {size:9,bold:true,align:'center',color:col});

    texte(ctx, code, x0+barW+1, PAD.t+gh+16, {size:10,align:'center',color:COULEURS.text});
  });

  // Légende
  ctx.fillStyle = 'rgba(148,163,184,0.3)';
  ctx.fillRect(PAD.l, 270, 12, 12);
  texte(ctx, 'Objectif', PAD.l+16, 281, {size:10,color:COULEURS.text2});
  arrondiRect(ctx, PAD.l+100, 270, 12, 12, 2, COULEURS.f615);
  texte(ctx, 'Réalisation', PAD.l+116, 281, {size:10,color:COULEURS.text2});

  ctx.strokeStyle = COULEURS.text2; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t+gh); ctx.lineTo(PAD.l+gw, PAD.t+gh); ctx.stroke();

  return canvas.toBuffer('image/png');
}

// ── 5. BARRES STOCKS PAR CLASSE ──────────────────
function graphiqueStocks(articles) {
  if (!articles || articles.length === 0) return null;
  const top = articles.filter(a=>parseFloat(a.stock_actuel||0)>0).slice(0,10);
  if (top.length === 0) return null;

  const h = Math.max(300, top.length*32+80);
  const { canvas, ctx } = creerCanvas(W, h);
  const PAD = {t:40,r:120,b:30,l:160};
  const gw = W-PAD.l-PAD.r, gh = h-PAD.t-PAD.b;

  texte(ctx, 'Top articles en stock (valeur HT)', W/2, 24, {size:13,bold:true,align:'center'});

  const maxVal = Math.max(...top.map(a=>parseFloat(a.valeur_stock_ht||0)),1);
  const barH = (gh/top.length)*0.6;
  const gap  = gh/top.length;

  top.forEach((art, i) => {
    const val = parseFloat(art.valeur_stock_ht||0);
    const bw  = (val/maxVal)*gw;
    const y   = PAD.t + gap*i + (gap-barH)/2;
    const stock = parseFloat(art.stock_actuel||0);
    const isAlert = art.seuil_alerte && stock <= art.seuil_alerte;
    const col = isAlert ? COULEURS.f605 : COULEURS.c12;

    arrondiRect(ctx, PAD.l, y, Math.max(bw,2), barH, 3, col);

    // Libellé
    const lbl = (art.libelle||'').slice(0,22);
    texte(ctx, lbl, PAD.l-6, y+barH/2+4, {size:9,align:'right',color:COULEURS.text});

    // Valeur
    texte(ctx, fmt(val)+' FCFA', PAD.l+bw+6, y+barH/2+4, {size:9,color:col});
  });

  return canvas.toBuffer('image/png');
}

// ── 6. TRÉSORERIE — FLUX ENTRÉES/SORTIES ─────────
function graphiqueFluxTresorerie(mouvements) {
  if (!mouvements || mouvements.length === 0) return null;

  // Agréger par compte
  const comptes = {};
  mouvements.forEach(m => {
    const lbl = m.compte_libelle || 'Inconnu';
    if (!comptes[lbl]) comptes[lbl] = {entrees:0, sorties:0};
    if (m.sens==='credit') comptes[lbl].entrees += parseFloat(m.montant_fcfa||0);
    else comptes[lbl].sorties += parseFloat(m.montant_fcfa||0);
  });

  const data = Object.entries(comptes);
  if (data.length === 0) return null;

  const { canvas, ctx } = creerCanvas(W, 320);
  const PAD = {t:45,r:30,b:60,l:90};
  const gw = W-PAD.l-PAD.r, gh = 320-PAD.t-PAD.b;

  texte(ctx, 'Flux de trésorerie par compte (FCFA)', W/2, 26, {size:13,bold:true,align:'center'});

  const maxVal = Math.max(...data.flatMap(([,v])=>[v.entrees,v.sorties]),1);
  const grpW = gw/data.length;
  const barW = grpW*0.28;

  dessinerGrille(ctx, PAD.l, PAD.t, gw, gh, 4);

  data.forEach(([compte, vals], i) => {
    const x0 = PAD.l + grpW*i + grpW*0.07;

    if (vals.entrees > 0) {
      const bh = (vals.entrees/maxVal)*gh;
      arrondiRect(ctx, x0, PAD.t+gh-bh, barW, bh, 3, COULEURS.f615);
      texte(ctx, fmt(vals.entrees), x0+barW/2, PAD.t+gh-bh-7, {size:8,align:'center',color:COULEURS.f615});
    }
    if (vals.sorties > 0) {
      const bh = (vals.sorties/maxVal)*gh;
      arrondiRect(ctx, x0+barW+3, PAD.t+gh-bh, barW, bh, 3, COULEURS.f61);
      texte(ctx, fmt(vals.sorties), x0+barW+3+barW/2, PAD.t+gh-bh-7, {size:8,align:'center',color:COULEURS.f61});
    }

    const lbl = compte.slice(0,12);
    texte(ctx, lbl, x0+barW, PAD.t+gh+16, {size:9,align:'center',color:COULEURS.text2});
  });

  // Légende
  arrondiRect(ctx, PAD.l, 300, 12, 10, 2, COULEURS.f615);
  texte(ctx, 'Entrées', PAD.l+16, 310, {size:10});
  arrondiRect(ctx, PAD.l+90, 300, 12, 10, 2, COULEURS.f61);
  texte(ctx, 'Sorties', PAD.l+106, 310, {size:10});

  ctx.strokeStyle = COULEURS.text2; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t+gh); ctx.lineTo(PAD.l+gw, PAD.t+gh); ctx.stroke();

  return canvas.toBuffer('image/png');
}

// ── 7. JAUGE UTILISATION USINE ───────────────────
function graphiqueJaugeUsine(tauxUtilisation) {
  const { canvas, ctx } = creerCanvas(300, 220);
  const cx=150, cy=160, r=110, rInt=70;

  texte(ctx, 'Utilisation usine', 150, 20, {size:12,bold:true,align:'center'});

  // Arc fond
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.strokeStyle = COULEURS.bg3; ctx.lineWidth=28; ctx.stroke();

  // Arc valeur
  const taux = Math.min(tauxUtilisation, 1);
  const col = taux>=0.80?COULEURS.f615:taux>=0.60?COULEURS.f605:COULEURS.f61;
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI + taux*Math.PI);
  ctx.strokeStyle = col; ctx.lineWidth=28; ctx.stroke();

  // Aiguille
  const angle = Math.PI + taux*Math.PI;
  const ax = cx + Math.cos(angle)*(r-14);
  const ay = cy + Math.sin(angle)*(r-14);
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ax, ay);
  ctx.strokeStyle = COULEURS.text; ctx.lineWidth=3; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI*2);
  ctx.fillStyle = COULEURS.text; ctx.fill();

  // Valeur centrale
  texte(ctx, (taux*100).toFixed(1)+'%', cx, cy-10, {size:22,bold:true,align:'center',color:col});
  texte(ctx, 'taux utilisation', cx, cy+10, {size:10,align:'center',color:COULEURS.text2});

  // Graduation 0% et 100%
  texte(ctx, '0%',  cx-r-10, cy+8, {size:9,color:COULEURS.text2});
  texte(ctx, '100%',cx+r-20,  cy+8, {size:9,color:COULEURS.text2});

  return canvas.toBuffer('image/png');
}

// ── 8. GRAPHIQUE REMBOURSEMENT DETTE ─────────────
function graphiqueRemboursement(credits_total, capaciteRemb) {
  if (!credits_total || credits_total === 0) return null;
  const duree = Math.min(Math.ceil(credits_total/capaciteRemb), 18);
  if (duree <= 0 || !isFinite(duree)) return null;

  const { canvas, ctx } = creerCanvas(W, 300);
  const PAD = {t:45,r:30,b:60,l:90};
  const gw = W-PAD.l-PAD.r, gh = 300-PAD.t-PAD.b;

  texte(ctx, 'Plan de remboursement prévisionnel (FCFA)', W/2, 26, {size:13,bold:true,align:'center'});

  const pts = [];
  let restant = credits_total;
  for (let i=0; i<=duree; i++) {
    pts.push({i, restant: Math.max(0, restant)});
    restant -= capaciteRemb;
  }

  const maxVal = credits_total;
  const xStep  = gw / duree;

  dessinerGrille(ctx, PAD.l, PAD.t, gw, gh, 4);

  // Zone sous la courbe
  ctx.beginPath();
  ctx.moveTo(PAD.l, PAD.t+gh);
  pts.forEach(p => {
    const x = PAD.l + p.i*xStep;
    const y = PAD.t + gh - (p.restant/maxVal)*gh;
    ctx.lineTo(x, y);
  });
  ctx.lineTo(PAD.l+gw, PAD.t+gh);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, PAD.t, 0, PAD.t+gh);
  grad.addColorStop(0, 'rgba(220,38,38,0.3)');
  grad.addColorStop(1, 'rgba(220,38,38,0.03)');
  ctx.fillStyle = grad; ctx.fill();

  // Courbe
  ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t + gh - (pts[0].restant/maxVal)*gh);
  pts.forEach(p => {
    const x = PAD.l + p.i*xStep;
    const y = PAD.t + gh - (p.restant/maxVal)*gh;
    ctx.lineTo(x, y);
  });
  ctx.strokeStyle = COULEURS.f61; ctx.lineWidth=2.5; ctx.stroke();

  // Labels
  pts.forEach(p => {
    if (p.i % Math.ceil(duree/6) === 0) {
      const x = PAD.l + p.i*xStep;
      texte(ctx, 'M'+p.i, x, PAD.t+gh+18, {size:9,align:'center',color:COULEURS.text2});
    }
  });

  for (let i=0; i<=4; i++) {
    const val = Math.round(maxVal/4*i);
    const y = PAD.t + gh - (gh/4)*i;
    texte(ctx, fmt(val), PAD.l-8, y+4, {size:8,align:'right',color:COULEURS.text2});
  }

  ctx.strokeStyle = COULEURS.text2; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t+gh); ctx.lineTo(PAD.l+gw, PAD.t+gh); ctx.stroke();

  texte(ctx, 'Solde: 0 à M'+duree, W/2, PAD.t+gh+40, {size:10,align:'center',color:COULEURS.f615});

  return canvas.toBuffer('image/png');
}

module.exports = {
  graphiqueBarresProduction,
  graphiqueCourbeCA,
  graphiqueCamembertMB,
  graphiqueAvancementATP,
  graphiqueStocks,
  graphiqueFluxTresorerie,
  graphiqueJaugeUsine,
  graphiqueRemboursement,
};
