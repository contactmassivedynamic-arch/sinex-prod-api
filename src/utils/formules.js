/**
 * FORMULES SINEX-SA — Module central synchronisé
 * Utilisé par toutes les routes : production, dashboard, ATP
 */

// ── PRIX DE VENTE HT DES PRODUITS FINIS ─────────────────
const PRIX_PF = {
  C12:  2116.10,
  C24:  2033.90,
  F615: 1032.00,
  F605:  429.00,
  F61:  1186.00,
  HILIO: 169.00,
};

// ── PRIX HT DES INTRANTS ────────────────────────────────
const PRIX_INTRANTS = {
  PREF_32G:    53,
  PREF_17G:    28,
  BOUCH_VERT:   5,
  ETI_15L:      9,
  ETI_05L:      6,
  ETI_1L:       7,
  CTN_15L:    233,
  CTN_05L:    200,
  FILM_FAR_15: 1394,  // FCFA/kg
  FILM_FAR_05: 1394,  // FCFA/kg
  FILM_HILIO:  1314,  // FCFA/kg
  PACK_SACHET: 16.10, // 24153 FCFA / 1500 packs
};

// ── COMPOSITIONS : quantité d'intrant par unité produite ─
const COMPO = {
  C12:  { PREF_32G:12, BOUCH_VERT:12, ETI_15L:12, CTN_15L:1 },
  C24:  { PREF_17G:24, BOUCH_VERT:24, ETI_05L:24, CTN_05L:1 },
  F615: { PREF_32G:6,  BOUCH_VERT:6,  ETI_15L:6,  FILM_FAR_15:0.035 },
  F605: { PREF_17G:6,  BOUCH_VERT:6,  ETI_05L:6,  FILM_FAR_05:0.035 },
  F61:  { PREF_32G:6,  BOUCH_VERT:6,  ETI_1L:6,   FILM_FAR_05:0.035 },
  HILIO:{ PACK_SACHET:1, FILM_HILIO:0.045 },
};

// ── CD HT UNITAIRE PAR FORMAT ────────────────────────────
// C12  = 12×53 + 12×5 + 12×9 + 1×233  = 636+60+108+233 = 1 037
// C24  = 24×28 + 24×5 + 24×6 + 1×200  = 672+120+144+200 = 1 136
// F615 = 6×53 + 6×5 + 6×9 + 0.035×1394= 318+30+54+48.79 = 450.79
// F605 = 6×28 + 6×5 + 6×6 + 0.035×1394= 168+30+36+48.79 = 282.79
// F61  = 6×53 + 6×5 + 6×7 + 0.035×1394= 318+30+42+48.79 = 438.79
// HILIO= 1×16.10 + 0.045×1314         = 16.10+59.13 = 75.23
function calcCDHTUnitaire(format) {
  const compo = COMPO[format];
  if (!compo) return 0;
  return Object.entries(compo).reduce((s, [intrant, qte]) => {
    return s + qte * (PRIX_INTRANTS[intrant] || 0);
  }, 0);
}

/**
 * Calcul CAHTP ou CAHTR
 * CA HT = Σ(Qté × Prix vente HT)
 */
function calcCAHT(productions) {
  return Object.entries(productions).reduce((s, [fmt, qte]) => {
    return s + (parseFloat(qte) || 0) * (PRIX_PF[fmt] || 0);
  }, 0);
}

/**
 * Calcul CDHTP ou CDHTR
 * CD HT = Σ(Qté intrant consommé × Prix HT intrant)
 * = Σ(Qté produit × CD HT unitaire du format)
 * + Σ(Qté rebut × Prix HT intrant)
 */
function calcCDHT(productions, rebuts = {}) {
  // CD des productions
  let cdHT = Object.entries(productions).reduce((s, [fmt, qte]) => {
    return s + (parseFloat(qte) || 0) * calcCDHTUnitaire(fmt);
  }, 0);

  // CD des rebuts (intrants gâchés)
  const rebutsPrix = {
    PREF_32G:   PRIX_INTRANTS.PREF_32G,
    PREF_17G:   PRIX_INTRANTS.PREF_17G,
    BOUCH_VERT: PRIX_INTRANTS.BOUCH_VERT,
    CTN_15L:    PRIX_INTRANTS.CTN_15L,
    CTN_05L:    PRIX_INTRANTS.CTN_05L,
    FILM_HILIO: PRIX_INTRANTS.FILM_HILIO,
    ETI_15L:    PRIX_INTRANTS.ETI_15L,
  };
  for (const [intrant, qte] of Object.entries(rebuts)) {
    cdHT += (parseFloat(qte) || 0) * (rebutsPrix[intrant] || 0);
  }
  return cdHT;
}

/**
 * Calcul consommations théoriques en quantité d'intrants
 */
function calcConsommations(productions) {
  const conso = {};
  for (const [fmt, qte] of Object.entries(productions)) {
    if (!qte || qte === 0) continue;
    const compo = COMPO[fmt];
    if (!compo) continue;
    for (const [intrant, qteUnit] of Object.entries(compo)) {
      if (!conso[intrant]) conso[intrant] = 0;
      conso[intrant] += parseFloat(qte) * qteUnit;
    }
  }
  return conso;
}

/**
 * Calcul MB HT, TMB HT et répartition MB
 * Formules identiques pour P (prévisionnel) et R (réalisé)
 * On distingue par le suffixe P ou R dans les noms de variables
 */
function calcMarges(caHT, cdHT) {
  const mbHT  = caHT - cdHT;
  const tmbHT = caHT > 0 ? mbHT / caHT : 0;

  // Répartition MB : 35% = 15% BMF + 10% FS + 10% AMM
  const bmfMt = tmbHT > 0 ? (caHT * 0.35) / (tmbHT * 0.15) : 0;
  const fsMt  = tmbHT > 0 ? (caHT * 0.35) / (tmbHT * 0.10) : 0;
  const ammMt = tmbHT > 0 ? (caHT * 0.35) / (tmbHT * 0.10) : 0;
  const bmfTx = tmbHT * 0.15 / 0.35;
  const fsTx  = tmbHT * 0.10 / 0.35;
  const ammTx = tmbHT * 0.10 / 0.35;

  return { mbHT, tmbHT, bmfMt, fsMt, ammMt, bmfTx, fsTx, ammTx };
}

/**
 * CPF = CAHTR cumulé / (CDHTR cumulé + CIHT cumulée)
 */
function calcCPF(caCumule, cdCumule, ciCumule) {
  const denom = cdCumule + ciCumule;
  return denom > 0 ? caCumule / denom : 0;
}

module.exports = {
  PRIX_PF, PRIX_INTRANTS, COMPO,
  calcCDHTUnitaire, calcCAHT, calcCDHT,
  calcConsommations, calcMarges, calcCPF,
};
