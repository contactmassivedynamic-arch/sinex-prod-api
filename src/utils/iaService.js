/**
 * Service IA — Analyse intelligente des données SINEX SA
 * Utilise Claude claude-sonnet-4-20250514 via API Anthropic
 */
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PRIX_PF = {C12:2116.10,C24:2033.90,F615:1032.00,F605:429.00,F61:1186.00,HILIO:169.00};
const CD_UNIT = {C12:1037,C24:1136,F615:450.79,F605:282.79,F61:438.79,HILIO:75.23};
const fmt = n => Math.round(parseFloat(n)||0).toLocaleString('fr-FR').replace(/\u202f/g,' ').replace(/\u00a0/g,' ');
const fmtP = n => ((parseFloat(n)||0)*100).toFixed(2)+' %';

/**
 * Analyse IA du dashboard — KPIs du mois
 */
async function analyserDashboard(donnees) {
  const { kpis, caMois, caCumule, cpf, mois, atp, stocks_alertes } = donnees;

  const prompt = `Tu es un expert en gestion industrielle et analyse financière. 
Tu analyses les données mensuelles de SINEX SA, une société de production d'eau minérale HILIO basée à Défalé, Togo.

DONNÉES DU MOIS ${mois} :

PRODUCTION VALIDÉE :
- C12 (cartons 12×1,5L) : ${kpis?.c12||0} cartons → CA : ${fmt((kpis?.c12||0)*PRIX_PF.C12)} FCFA
- C24 (cartons 24×0,5L) : ${kpis?.c24||0} cartons → CA : ${fmt((kpis?.c24||0)*PRIX_PF.C24)} FCFA
- F6/1,5L : ${kpis?.f615||0} fardeaux → CA : ${fmt((kpis?.f615||0)*PRIX_PF.F615)} FCFA
- F6/0,5L : ${kpis?.f605||0} fardeaux → CA : ${fmt((kpis?.f605||0)*PRIX_PF.F605)} FCFA
- F6/1L : ${kpis?.f61||0} fardeaux → CA : ${fmt((kpis?.f61||0)*PRIX_PF.F61)} FCFA
- HILIO (sachets) : ${kpis?.hilio||0} packs → CA : ${fmt((kpis?.hilio||0)*PRIX_PF.HILIO)} FCFA
- Jours ouvrés : ${kpis?.jours_ouvres||0}

INDICATEURS FINANCIERS :
- CA HT mensuel : ${fmt(caMois)} FCFA
- CA HT cumulé ${mois?.slice(0,4)} : ${fmt(caCumule)} FCFA
- CPF (Coefficient Performance Financière) : ${cpf?.toFixed(2)||'N/A'}
- CAHTP (objectif) : ${fmt(atp?.CAHTP||0)} FCFA
- CAHTR (réalisé) : ${fmt(atp?.CAHTR||0)} FCFA
- MBHTR (marge réelle) : ${fmt(atp?.MBHTR||0)} FCFA
- TMBHTR : ${fmtP(atp?.TMBHTR||0)}
- Taux avancement : ${atp?.taux_avancement ? ((atp.taux_avancement)*100).toFixed(1)+'%' : 'N/A'}

STOCKS :
- Alertes stock : ${stocks_alertes||0} article(s) en rupture ou stock faible

Génère une analyse de gestion professionnelle et concise en français avec :
1. **Synthèse** (2-3 phrases sur la performance globale du mois)
2. **Points forts** (ce qui va bien)
3. **Points d'attention** (risques ou écarts à surveiller)
4. **Recommandations** (3 actions concrètes et prioritaires)

Sois direct, précis et orienté action. Utilise les chiffres réels. Maximum 300 mots.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

/**
 * Analyse IA pour rapport PDF
 */
async function analyserRapport(type, donnees, mois) {
  let prompt = '';

  if (type === 'production') {
    const t = donnees.totaux || {};
    const caTotal = Object.entries(t).reduce((s,[k,v])=>s+(v||0)*(PRIX_PF[k.toUpperCase()]||0),0);
    const cdTotal = Object.entries(t).reduce((s,[k,v])=>s+(v||0)*(CD_UNIT[k.toUpperCase()]||0),0);
    const nbValides = (donnees.saisies||[]).filter(s=>s.statut==='valide').length;
    const nbTotal   = (donnees.saisies||[]).length;

    prompt = `Expert en gestion industrielle, analyse ce rapport de production SINEX SA pour ${mois} :

PRODUCTION :
- Journées saisies : ${nbTotal} (dont ${nbValides} validées)
- C12 : ${fmt(t.c12||0)} cartons | C24 : ${fmt(t.c24||0)} cartons | HILIO : ${fmt(t.hilio||0)} packs
- CA HT total : ${fmt(caTotal)} FCFA | CD HT : ${fmt(cdTotal)} FCFA | MB : ${fmt(caTotal-cdTotal)} FCFA
- TMB : ${caTotal>0?fmtP((caTotal-cdTotal)/caTotal):'N/A'}

En 150 mots maximum, donne :
1. Bilan de production du mois
2. Alerte si données incomplètes ou performances faibles
3. Une recommandation opérationnelle clé`;

  } else if (type === 'atp') {
    const atp = donnees.atp || {};
    const cahtp = parseFloat(atp.proj_ca_ht||0);
    const cahtr = parseFloat(atp.real_ca_ht||0);
    const taux  = cahtp > 0 ? cahtr/cahtp : 0;

    prompt = `Expert financier, analyse cet ATP SINEX SA pour ${mois} :

- CAHTP (objectif) : ${fmt(cahtp)} FCFA
- CAHTR (réalisé) : ${fmt(cahtr)} FCFA
- Taux avancement : ${(taux*100).toFixed(1)}%
- MBHTR : ${fmt(parseFloat(atp.real_marge_brute_ht||0))} FCFA
- TMBHTR : ${fmtP(atp.taux_marge_brute||0)}
- Charges indirectes : ${fmt(donnees.totalCI||0)} FCFA

En 150 mots, donne :
1. Évaluation de l'atteinte des objectifs
2. Qualité de la marge
3. Recommandation financière prioritaire`;

  } else if (type === 'tendances') {
    const hist = donnees.historique || [];
    const caTotal = hist.reduce((s,m)=>s+parseFloat(m.ca_ht||0),0);
    const nbMois  = hist.length || 1;
    const credits = donnees.credits_total || 0;

    prompt = `Expert en stratégie industrielle, analyse les tendances SINEX SA :

- Période analysée : ${nbMois} mois
- CA HT moyen mensuel : ${fmt(caTotal/nbMois)} FCFA
- Total dettes : ${fmt(credits)} FCFA
- Taux utilisation usine : ${donnees.jours_moyens>0?((donnees.jours_moyens/26)*100).toFixed(0)+'%':'N/D'}

En 200 mots, donne :
1. Tendance générale de l'activité
2. Capacité financière à rembourser les dettes
3. Les 2 leviers opérationnels les plus impactants pour augmenter le CA`;

  } else {
    prompt = `Expert en gestion, donne une analyse concise en 100 mots du rapport ${type} de SINEX SA pour ${mois}.`;
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

module.exports = { analyserDashboard, analyserRapport };
