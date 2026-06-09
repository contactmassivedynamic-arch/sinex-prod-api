/**
 * Graphiques professionnels SINEX SA — Style moderne fond blanc
 */
const { createCanvas } = require('@napi-rs/canvas');

// ── Palette professionnelle ──────────────────────
const C = {
  bleu:    '#1A6FB0',
  cyan:    '#0EA5E9',
  vert:    '#16A34A',
  vert2:   '#22C55E',
  orange:  '#EA580C',
  rouge:   '#DC2626',
  violet:  '#7C3AED',
  teal:    '#0D9488',
  amber:   '#D97706',
  rose:    '#DB2777',
  // Neutres
  blanc:   '#FFFFFF',
  fond:    '#F8FAFC',
  fond2:   '#F1F5F9',
  bordure: '#E2E8F0',
  texte:   '#1E293B',
  texte2:  '#475569',
  texte3:  '#94A3B8',
  grille:  '#E8EFF5',
};

const SERIE = [C.bleu,C.vert,C.orange,C.violet,C.teal,C.rose,C.cyan,C.amber,C.rouge,C.vert2];

const fmt = n => {
  const v = Math.round(parseFloat(n)||0);
  if (v >= 1000000) return (v/1000000).toFixed(1)+'M';
  if (v >= 1000) return (v/1000).toFixed(0)+'k';
  return v.toLocaleString('fr-FR');
};

// ── Utilitaires canvas ───────────────────────────
function creer(w, h) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  // Fond blanc
  ctx.fillStyle = C.blanc;
  ctx.fillRect(0, 0, w, h);
  return { canvas, ctx };
}

function txt(ctx, texte, x, y, {size=11,bold=false,color=C.texte,align='left',italic=false}={}) {
  ctx.fillStyle = color;
  ctx.font = `${italic?'italic ':''}${bold?'bold ':''} ${size}px "Arial"`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(String(texte), x, y);
}

function rectArr(ctx, x, y, w, h, r=4, color=C.bleu) {
  if (w <= 0 || h <= 0) return;
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
  ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
}

function grille(ctx, x0, y0, w, h, n=5) {
  ctx.strokeStyle = C.grille; ctx.lineWidth = 1;
  ctx.setLineDash([]);
  for (let i=0; i<=n; i++) {
    const y = y0 + (h/n)*i;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0+w, y); ctx.stroke();
  }
}

function axes(ctx, x0, y0, w, h) {
  ctx.strokeStyle = C.bordure; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(x0, y0+h); ctx.lineTo(x0+w, y0+h);
  ctx.stroke();
}

function titre(ctx, texte, W, y=28) {
  txt(ctx, texte, W/2, y, {size:14, bold:true, color:C.texte, align:'center'});
}

function sousTitre(ctx, texte, W, y=46) {
  txt(ctx, texte, W/2, y, {size:10, color:C.texte3, align:'center'});
}

function legende(ctx, items, x0, y, gap=120) {
  items.forEach((item, i) => {
    const x = x0 + i*gap;
    rectArr(ctx, x, y-5, 12, 12, 2, item.color);
    txt(ctx, item.label, x+16, y+1, {size:9.5, color:C.texte2});
  });
}

// ── 1. BARRES PRODUCTION ─────────────────────────
function graphiqueBarresProduction(totaux) {
  const W=860, H=380;
  const { canvas, ctx } = creer(W, H);
  const PAD = {t:70, r:30, b:60, l:70};
  const gw = W-PAD.l-PAD.r, gh = H-PAD.t-PAD.b;

  titre(ctx, 'Production mensuelle par format', W);
  sousTitre(ctx, 'Quantités produites (cartons / fardeaux / packs)', W);

  const data = [
    {label:'C12',      val:totaux.c12  ||0, color:C.bleu},
    {label:'C24',      val:totaux.c24  ||0, color:C.cyan},
    {label:'F6/1,5L',  val:totaux.f615 ||0, color:C.vert},
    {label:'F6/0,5L',  val:totaux.f605 ||0, color:C.amber},
    {label:'F6/1L',    val:totaux.f61  ||0, color:C.orange},
    {label:'HILIO',    val:totaux.hilio||0, color:C.violet},
  ];

  const maxVal = Math.max(...data.map(d=>d.val), 1);
  const barW = (gw/data.length)*0.55;
  const gap  = gw/data.length;

  grille(ctx, PAD.l, PAD.t, gw, gh);

  // Axe Y
  for (let i=0; i<=5; i++) {
    const v = Math.round(maxVal/5*i);
    const y = PAD.t + gh - (gh/5)*i;
    txt(ctx, fmt(v), PAD.l-8, y, {size:9, color:C.texte3, align:'right'});
    if (i>0) { ctx.strokeStyle=C.grille; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l+gw, y); ctx.stroke(); }
  }

  data.forEach((d, i) => {
    const x  = PAD.l + gap*i + (gap-barW)/2;
    const bh = Math.max((d.val/maxVal)*gh, 2);
    const y  = PAD.t + gh - bh;

    // Ombre douce
    ctx.shadowColor = 'rgba(0,0,0,0.08)';
    ctx.shadowBlur  = 6; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 3;
    rectArr(ctx, x, y, barW, bh, 5, d.color);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Valeur au-dessus
    if (d.val > 0) {
      txt(ctx, fmt(d.val), x+barW/2, y-10, {size:9.5, bold:true, color:d.color, align:'center'});
    }
    txt(ctx, d.label, x+barW/2, PAD.t+gh+22, {size:10.5, color:C.texte2, align:'center'});
  });

  axes(ctx, PAD.l, PAD.t, gw, gh);

  // Ligne de fond gris pour les barres
  ctx.fillStyle = C.fond2;
  data.forEach((d, i) => {
    const x = PAD.l + gap*i + (gap-barW)/2;
    ctx.fillRect(x, PAD.t, barW, gh);
  });
  // Redessiner les barres par-dessus
  data.forEach((d, i) => {
    const x  = PAD.l + gap*i + (gap-barW)/2;
    const bh = Math.max((d.val/maxVal)*gh, 2);
    const y  = PAD.t + gh - bh;
    rectArr(ctx, x, y, barW, bh, 5, d.color);
    if (d.val > 0) txt(ctx, fmt(d.val), x+barW/2, y-10, {size:9.5, bold:true, color:d.color, align:'center'});
  });

  axes(ctx, PAD.l, PAD.t, gw, gh);
  return canvas.toBuffer('image/png');
}

// ── 2. COURBE EVOLUTION CA/MB ────────────────────
function graphiqueCourbeCA(historique) {
  const W=860, H=360;
  const { canvas, ctx } = creer(W, H);
  const PAD = {t:70, r:30, b:55, l:80};
  const gw = W-PAD.l-PAD.r, gh = H-PAD.t-PAD.b;

  if (!historique || historique.length < 2) {
    txt(ctx, 'Données insuffisantes (minimum 2 mois requis)', W/2, H/2, {size:12, color:C.texte3, align:'center'});
    return canvas.toBuffer('image/png');
  }

  titre(ctx, 'Évolution CA HT et Marge Brute', W);
  sousTitre(ctx, 'Tendance mensuelle en FCFA', W);

  const maxVal = Math.max(...historique.map(m=>parseFloat(m.ca_ht||0)), 1);
  const series = [
    {key:'ca_ht', label:'CA HT',    color:C.bleu,   dash:[]},
    {key:'mb_ht', label:'MB HT',    color:C.vert,   dash:[6,3]},
  ];

  grille(ctx, PAD.l, PAD.t, gw, gh);

  // Axe Y
  for (let i=0; i<=5; i++) {
    const v = Math.round(maxVal/5*i);
    const y = PAD.t + gh - (gh/5)*i;
    txt(ctx, fmt(v), PAD.l-8, y, {size:8.5, color:C.texte3, align:'right'});
  }

  // Zone sous CA
  const ptsCa = historique.map((m,i)=>({
    x: PAD.l + (gw/(historique.length-1))*i,
    y: PAD.t + gh - (parseFloat(m.ca_ht||0)/maxVal)*gh,
  }));
  ctx.beginPath();
  ctx.moveTo(ptsCa[0].x, PAD.t+gh);
  ptsCa.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(ptsCa[ptsCa.length-1].x, PAD.t+gh);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, PAD.t, 0, PAD.t+gh);
  grad.addColorStop(0, 'rgba(26,111,176,0.15)');
  grad.addColorStop(1, 'rgba(26,111,176,0.01)');
  ctx.fillStyle = grad; ctx.fill();

  // Courbes
  series.forEach(s => {
    const pts = historique.map((m,i)=>({
      x: PAD.l + (gw/(historique.length-1))*i,
      y: PAD.t + gh - (parseFloat(m[s.key]||0)/maxVal)*gh,
    }));
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = s.color; ctx.lineWidth = 2.5;
    ctx.setLineDash(s.dash); ctx.stroke(); ctx.setLineDash([]);

    // Points
    pts.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI*2);
      ctx.fillStyle = C.blanc; ctx.fill();
      ctx.strokeStyle = s.color; ctx.lineWidth = 2.5; ctx.stroke();
    });
  });

  // Labels X
  historique.forEach((m, i) => {
    const x = PAD.l + (gw/(historique.length-1))*i;
    txt(ctx, (m.mois||'').slice(0,7), x, PAD.t+gh+22, {size:9, color:C.texte3, align:'center'});
  });

  axes(ctx, PAD.l, PAD.t, gw, gh);
  legende(ctx, series.map(s=>({label:s.label,color:s.color})), PAD.l, H-10);
  return canvas.toBuffer('image/png');
}

// ── 3. DONUT RÉPARTITION MB ──────────────────────
function graphiqueCamembertMB(bmf, fs, amm) {
  const W=500, H=300;
  const { canvas, ctx } = creer(W, H);
  const cx=160, cy=155, r=105, ri=58;
  const total = bmf+fs+amm;
  if (!total) return null;

  titre(ctx, 'Répartition de la Marge Brute', W);

  const slices = [
    {label:'BMF',           val:bmf, color:C.bleu},
    {label:'Frais Siège',   val:fs,  color:C.vert},
    {label:'Amortissement', val:amm, color:C.violet},
  ];

  let angle = -Math.PI/2;
  slices.forEach(s => {
    const sweep = (s.val/total)*Math.PI*2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle+sweep);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.shadowColor = 'rgba(0,0,0,0.08)'; ctx.shadowBlur=4; ctx.shadowOffsetY=2;
    ctx.fill();
    ctx.shadowBlur=0; ctx.shadowOffsetY=0;
    ctx.strokeStyle = C.blanc; ctx.lineWidth=2; ctx.stroke();

    // Pourcentage
    const mid = angle+sweep/2;
    const lx = cx+Math.cos(mid)*r*0.68;
    const ly = cy+Math.sin(mid)*r*0.68;
    txt(ctx, ((s.val/total)*100).toFixed(1)+'%', lx, ly, {size:10.5,bold:true,color:C.blanc,align:'center'});
    angle += sweep;
  });

  // Centre donut blanc
  ctx.beginPath(); ctx.arc(cx, cy, ri, 0, Math.PI*2);
  ctx.fillStyle = C.blanc;
  ctx.shadowColor = 'rgba(0,0,0,0.06)'; ctx.shadowBlur=8;
  ctx.fill(); ctx.shadowBlur=0;
  txt(ctx, fmt(total), cx, cy-7, {size:11,bold:true,color:C.texte,align:'center'});
  txt(ctx, 'FCFA', cx, cy+9, {size:9,color:C.texte3,align:'center'});
  txt(ctx, 'total', cx, cy+22, {size:8.5,color:C.texte3,align:'center'});

  // Légende à droite
  slices.forEach((s, i) => {
    const ly = 90 + i*52;
    rectArr(ctx, 300, ly, 14, 14, 3, s.color);
    txt(ctx, s.label, 320, ly+7, {size:10.5,color:C.texte});
    txt(ctx, fmt(s.val)+' FCFA', 320, ly+22, {size:9.5,color:C.texte2});
    txt(ctx, ((s.val/total)*100).toFixed(1)+'%', 460, ly+7, {size:10,bold:true,color:s.color,align:'right'});
  });

  return canvas.toBuffer('image/png');
}

// ── 4. BARRES GROUPÉES ATP ───────────────────────
function graphiqueAvancementATP(objectifs, realisations) {
  const W=860, H=320;
  const { canvas, ctx } = creer(W, H);
  const PAD = {t:70, r:30, b:55, l:70};
  const gw = W-PAD.l-PAD.r, gh = H-PAD.t-PAD.b;
  const codes = ['C12','C24','F615','F605','F61','HILIO'];

  titre(ctx, 'ATP — Objectifs vs Réalisations', W);
  sousTitre(ctx, 'Comparaison par format de production', W);

  const maxVal = Math.max(...codes.flatMap(c=>[objectifs[c]||0,realisations[c]||0]),1);
  const grpW = gw/codes.length;
  const barW = grpW*0.28;

  grille(ctx, PAD.l, PAD.t, gw, gh);

  for (let i=0; i<=5; i++) {
    const v = Math.round(maxVal/5*i);
    const y = PAD.t + gh - (gh/5)*i;
    txt(ctx, fmt(v), PAD.l-8, y, {size:8.5, color:C.texte3, align:'right'});
  }

  codes.forEach((code, i) => {
    const obj  = objectifs[code]||0;
    const real = realisations[code]||0;
    const x0   = PAD.l + grpW*i + grpW*0.1;
    const tx   = obj>0?real/obj:0;

    // Barre objectif (gris clair)
    const bhO = Math.max((obj/maxVal)*gh, 2);
    rectArr(ctx, x0, PAD.t+gh-bhO, barW, bhO, 4, C.fond2);
    ctx.strokeStyle = C.bordure; ctx.lineWidth=1.5;
    ctx.strokeRect(x0, PAD.t+gh-bhO, barW, bhO);

    // Barre réalisation
    const bhR = Math.max((real/maxVal)*gh, 2);
    const col = tx>=0.90?C.vert:tx>=0.70?C.amber:C.rouge;
    rectArr(ctx, x0+barW+4, PAD.t+gh-bhR, barW, bhR, 4, col);

    // Taux d'avancement
    txt(ctx, obj>0?Math.round(tx*100)+'%':'—',
      x0+barW+4+barW/2, PAD.t+gh-bhR-12,
      {size:9,bold:true,color:col,align:'center'});

    txt(ctx, code, x0+barW+2, PAD.t+gh+22, {size:10,color:C.texte2,align:'center'});
  });

  axes(ctx, PAD.l, PAD.t, gw, gh);
  legende(ctx, [
    {label:'Objectif',     color:C.fond2},
    {label:'Réalisation',  color:C.vert},
  ], PAD.l, H-10);
  return canvas.toBuffer('image/png');
}

// ── 5. BARRES HORIZONTALES STOCKS ───────────────
function graphiqueStocks(articles) {
  if (!articles||!articles.length) return null;
  const top = articles.filter(a=>parseFloat(a.valeur_stock_ht||0)>0)
    .sort((a,b)=>parseFloat(b.valeur_stock_ht||0)-parseFloat(a.valeur_stock_ht||0))
    .slice(0,8);
  if (!top.length) return null;

  const H = top.length*42+90;
  const W = 860;
  const { canvas, ctx } = creer(W, H);
  const PAD = {t:60, r:100, b:20, l:180};
  const gw = W-PAD.l-PAD.r, gh = H-PAD.t-PAD.b;

  titre(ctx, 'Valeur des stocks — Top articles', W);
  sousTitre(ctx, 'En FCFA HT', W);

  const maxVal = Math.max(...top.map(a=>parseFloat(a.valeur_stock_ht||0)),1);
  const barH = (gh/top.length)*0.55;
  const gap  = gh/top.length;

  top.forEach((art, i) => {
    const val  = parseFloat(art.valeur_stock_ht||0);
    const bw   = (val/maxVal)*gw;
    const y    = PAD.t + gap*i + (gap-barH)/2;
    const stock = parseFloat(art.stock_actuel||0);
    const alert = art.seuil_alerte && stock<=art.seuil_alerte;
    const col  = alert ? C.orange : (i%2===0?C.bleu:C.cyan);

    // Barre fond
    rectArr(ctx, PAD.l, y, gw, barH, 4, C.fond2);
    // Barre valeur
    ctx.shadowColor='rgba(0,0,0,0.08)'; ctx.shadowBlur=4;
    rectArr(ctx, PAD.l, y, Math.max(bw,4), barH, 4, col);
    ctx.shadowBlur=0;

    // Label gauche
    const lbl = (art.libelle||art.code||'').slice(0,24);
    txt(ctx, lbl, PAD.l-8, y+barH/2, {size:9.5, color:C.texte, align:'right'});

    // Valeur droite
    txt(ctx, fmt(val)+' F', PAD.l+bw+8, y+barH/2, {size:9, color:col});
    if (alert) txt(ctx, '⚠', PAD.l+gw+8, y+barH/2, {size:10, color:C.orange});
  });

  return canvas.toBuffer('image/png');
}

// ── 6. BARRES FLUX TRÉSORERIE ────────────────────
function graphiqueFluxTresorerie(mouvements) {
  if (!mouvements||!mouvements.length) return null;
  const comptes={};
  mouvements.forEach(m=>{
    const lbl = (m.compte_libelle||'Inconnu').replace('Compte ','').replace(' (usine)','');
    if(!comptes[lbl]) comptes[lbl]={e:0,s:0};
    if(m.sens==='credit') comptes[lbl].e+=parseFloat(m.montant_fcfa||0);
    else comptes[lbl].s+=parseFloat(m.montant_fcfa||0);
  });
  const data=Object.entries(comptes);
  if(!data.length) return null;

  const W=860, H=340;
  const { canvas, ctx } = creer(W, H);
  const PAD={t:70,r:30,b:60,l:80};
  const gw=W-PAD.l-PAD.r, gh=H-PAD.t-PAD.b;

  titre(ctx, 'Flux de Trésorerie par Compte', W);
  sousTitre(ctx, 'Entrées et sorties en FCFA', W);

  const maxVal=Math.max(...data.flatMap(([,v])=>[v.e,v.s]),1);
  const grpW=gw/data.length, barW=grpW*0.3;

  grille(ctx, PAD.l, PAD.t, gw, gh);
  for(let i=0;i<=5;i++){
    const v=Math.round(maxVal/5*i), y=PAD.t+gh-(gh/5)*i;
    txt(ctx,fmt(v),PAD.l-8,y,{size:8.5,color:C.texte3,align:'right'});
  }

  data.forEach(([compte,vals],i)=>{
    const x0=PAD.l+grpW*i+grpW*0.07;
    if(vals.e>0){
      const bh=Math.max((vals.e/maxVal)*gh,2);
      ctx.shadowColor='rgba(0,0,0,0.08)';ctx.shadowBlur=4;
      rectArr(ctx,x0,PAD.t+gh-bh,barW,bh,4,C.vert);
      ctx.shadowBlur=0;
      txt(ctx,fmt(vals.e),x0+barW/2,PAD.t+gh-bh-10,{size:8.5,bold:true,color:C.vert,align:'center'});
    }
    if(vals.s>0){
      const bh=Math.max((vals.s/maxVal)*gh,2);
      ctx.shadowColor='rgba(0,0,0,0.08)';ctx.shadowBlur=4;
      rectArr(ctx,x0+barW+4,PAD.t+gh-bh,barW,bh,4,C.rouge);
      ctx.shadowBlur=0;
      txt(ctx,fmt(vals.s),x0+barW+4+barW/2,PAD.t+gh-bh-10,{size:8.5,bold:true,color:C.rouge,align:'center'});
    }
    txt(ctx,compte.slice(0,14),x0+barW+2,PAD.t+gh+22,{size:9,color:C.texte2,align:'center'});
  });

  axes(ctx,PAD.l,PAD.t,gw,gh);
  legende(ctx,[{label:'Entrées',color:C.vert},{label:'Sorties',color:C.rouge}],PAD.l,H-10);
  return canvas.toBuffer('image/png');
}

// ── 7. JAUGE DEMI-CERCLE UTILISATION ────────────
function graphiqueJaugeUsine(tauxUtilisation) {
  const W=400, H=240;
  const { canvas, ctx } = creer(W, H);
  const cx=200, cy=185, r=120, ri=72;
  const taux=Math.min(Math.max(tauxUtilisation,0),1);
  const col=taux>=0.80?C.vert:taux>=0.60?C.amber:C.rouge;

  titre(ctx, "Taux d'utilisation de l'usine", W);

  // Fond gris arc
  ctx.beginPath(); ctx.arc(cx,cy,r,Math.PI,0,false);
  ctx.strokeStyle=C.fond2; ctx.lineWidth=22; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx,cy,r,Math.PI,0,false);
  ctx.strokeStyle=C.bordure; ctx.lineWidth=22; ctx.stroke();

  // Arc valeur avec dégradé
  if(taux>0){
    ctx.beginPath(); ctx.arc(cx,cy,r,Math.PI,Math.PI+taux*Math.PI,false);
    ctx.strokeStyle=col; ctx.lineWidth=22;
    ctx.lineCap='round'; ctx.stroke(); ctx.lineCap='butt';
  }

  // Centre blanc
  ctx.beginPath(); ctx.arc(cx,cy,ri,0,Math.PI*2);
  ctx.fillStyle=C.blanc;
  ctx.shadowColor='rgba(0,0,0,0.06)';ctx.shadowBlur=8;
  ctx.fill();ctx.shadowBlur=0;

  // Valeur centrale
  txt(ctx,(taux*100).toFixed(1)+'%',cx,cy-12,{size:26,bold:true,color:col,align:'center'});
  txt(ctx,"utilisation",cx,cy+10,{size:10.5,color:C.texte3,align:'center'});

  // Marqueurs 0% et 100%
  txt(ctx,'0%',   cx-r-12, cy+12, {size:9,color:C.texte3,align:'center'});
  txt(ctx,'100%', cx+r+12, cy+12, {size:9,color:C.texte3,align:'center'});
  txt(ctx,'50%',  cx,      cy-r-12,{size:9,color:C.texte3,align:'center'});

  // Bande colorée selon niveau
  const lgd = col===C.vert?'Niveau optimal (≥80%)'
             :col===C.amber?'Niveau acceptable (60-80%)'
             :'Niveau insuffisant (<60%)';
  txt(ctx,lgd,cx,cy+30,{size:9.5,color:col,align:'center'});

  return canvas.toBuffer('image/png');
}

// ── 8. COURBE REMBOURSEMENT DETTE ───────────────
function graphiqueRemboursement(credits_total, capaciteRemb) {
  if(!credits_total||credits_total===0||capaciteRemb<=0) return null;
  const duree=Math.min(Math.ceil(credits_total/capaciteRemb),24);
  if(!isFinite(duree)||duree<=0) return null;

  const W=860, H=320;
  const { canvas, ctx } = creer(W, H);
  const PAD={t:70,r:30,b:55,l:80};
  const gw=W-PAD.l-PAD.r, gh=H-PAD.t-PAD.b;

  titre(ctx,'Plan de remboursement de la dette',W);
  sousTitre(ctx,'Capital restant dû mois par mois (FCFA)',W);

  const pts=[];
  let restant=credits_total;
  for(let i=0;i<=duree;i++){
    pts.push({i,restant:Math.max(0,restant)});
    restant-=capaciteRemb;
  }

  grille(ctx,PAD.l,PAD.t,gw,gh);
  for(let i=0;i<=5;i++){
    const v=Math.round(credits_total/5*i),y=PAD.t+gh-(gh/5)*i;
    txt(ctx,fmt(v),PAD.l-8,y,{size:8.5,color:C.texte3,align:'right'});
  }

  // Zone sous courbe
  ctx.beginPath();
  ctx.moveTo(PAD.l,PAD.t+gh);
  pts.forEach(p=>{ const x=PAD.l+(gw/duree)*p.i,y=PAD.t+gh-(p.restant/credits_total)*gh; ctx.lineTo(x,y); });
  ctx.lineTo(PAD.l+gw*(Math.min(duree,pts.length-1)/duree),PAD.t+gh);
  ctx.closePath();
  const grad=ctx.createLinearGradient(0,PAD.t,0,PAD.t+gh);
  grad.addColorStop(0,'rgba(220,38,38,0.12)');
  grad.addColorStop(1,'rgba(220,38,38,0.01)');
  ctx.fillStyle=grad;ctx.fill();

  // Courbe
  ctx.beginPath();
  pts.forEach((p,i)=>{ const x=PAD.l+(gw/duree)*p.i,y=PAD.t+gh-(p.restant/credits_total)*gh; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
  ctx.strokeStyle=C.rouge;ctx.lineWidth=2.5;ctx.stroke();

  // Points clés
  pts.filter(p=>p.i%Math.ceil(duree/6)===0||p.restant===0).forEach(p=>{
    const x=PAD.l+(gw/duree)*p.i,y=PAD.t+gh-(p.restant/credits_total)*gh;
    ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);
    ctx.fillStyle=C.blanc;ctx.fill();
    ctx.strokeStyle=C.rouge;ctx.lineWidth=2.5;ctx.stroke();
    txt(ctx,'M'+p.i,x,PAD.t+gh+22,{size:9,color:C.texte3,align:'center'});
  });

  // Marqueur solde 0
  if(duree<=24){
    ctx.strokeStyle=C.vert;ctx.lineWidth=1.5;ctx.setLineDash([4,3]);
    ctx.beginPath();ctx.moveTo(PAD.l+gw*(duree/duree),PAD.t);ctx.lineTo(PAD.l+gw,PAD.t+gh);ctx.stroke();
    ctx.setLineDash([]);
  }

  axes(ctx,PAD.l,PAD.t,gw,gh);
  txt(ctx,'Solde = 0 à M'+duree,PAD.l+gw-10,PAD.t+gh+22,{size:9,color:C.vert,align:'right'});
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
