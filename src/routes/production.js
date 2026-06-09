const router  = require('express').Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const role    = require('../middleware/role');
const { PRIX_PF, COMPO, calcCAHT, calcCDHT, calcMarges } = require('../utils/formules');

const DG  = 'directeur_general';
const BTL = {C12:12, C24:24, F615:6, F605:6, F61:6, HILIO:30};
const PF  = {C12:'PF_C12',C24:'PF_C24',F615:'PF_F615',F605:'PF_F605',F61:'PF_F61',HILIO:'PF_HILIO'};

async function mettreAJourStocksATP(client, prodId, userId) {
  const {rows:lignes} = await client.query(
    `SELECT fp.code, lp.cartons_produits FROM lignes_production lp
     JOIN formats_produits fp ON fp.id=lp.format_id WHERE lp.production_id=$1`,[prodId]
  );
  const {rows:rebutRows} = await client.query(`SELECT * FROM rebuts WHERE production_id=$1`,[prodId]);
  const rebuts = rebutRows[0]||{};
  const {rows:prodRows} = await client.query(`SELECT date_production FROM productions_jour WHERE id=$1`,[prodId]);
  const dateProd = prodRows[0]?.date_production;
  const mois = dateProd ? new Date(dateProd).toISOString().slice(0,7) : new Date().toISOString().slice(0,7);

  const productions = {};
  for (const l of lignes) productions[l.code] = parseInt(l.cartons_produits)||0;

  const rebutsIntrants = {
    PREF_32G:rebuts.pref32||0, PREF_17G:rebuts.pref17||0,
    BOUCH_VERT:rebuts.bouchons||0, CTN_15L:rebuts.ctn_c12||0,
    CTN_05L:rebuts.ctn_c24||0, FILM_HILIO:rebuts.hilio_rebut||0, ETI_15L:rebuts.etiquettes||0,
  };

  const caHT = calcCAHT(productions);
  const cdHT = calcCDHT(productions, rebutsIntrants);
  const {mbHT, tmbHT, bmfMt, fsMt, ammMt} = calcMarges(caHT, cdHT);

  // Consommations intrants
  const conso = {};
  for (const [fmt,qte] of Object.entries(productions)) {
    if (!qte) continue;
    const c = COMPO[fmt];
    if (!c) continue;
    for (const [intrant,qteUnit] of Object.entries(c)) {
      if (!conso[intrant]) conso[intrant]=0;
      conso[intrant] += parseFloat(qte)*qteUnit;
    }
  }
  for (const [intrant,qte] of Object.entries(rebutsIntrants)) {
    if (!conso[intrant]) conso[intrant]=0;
    conso[intrant] += parseFloat(qte)||0;
  }

  // Sorties MP
  for (const [artCode,qte] of Object.entries(conso)) {
    if (qte<=0) continue;
    const {rows:artRows} = await client.query(`SELECT id FROM stocks_articles WHERE code=$1`,[artCode]);
    if (!artRows[0]) continue;
    await client.query(
      `INSERT INTO stocks_mouvements (article_id,type_mouvement,quantite,date_mouvement,motif,saisi_par_id)
       VALUES ($1,'sortie',$2,$3,'Consommation production validée',$4)`,
      [artRows[0].id,qte,dateProd,userId]
    );
  }

  // Entrées PF
  for (const [fmt,qte] of Object.entries(productions)) {
    if (!qte) continue;
    const pfCode = PF[fmt];
    if (!pfCode) continue;
    const {rows:pfRows} = await client.query(`SELECT id FROM stocks_articles WHERE code=$1`,[pfCode]);
    if (!pfRows[0]) continue;
    await client.query(
      `INSERT INTO stocks_mouvements (article_id,type_mouvement,quantite,date_mouvement,motif,saisi_par_id)
       VALUES ($1,'entree',$2,$3,$4,$5)`,
      [pfRows[0].id,qte,dateProd,`Production validée — ${fmt}`,userId]
    );
  }

  // ATP
  if (caHT>0) {
    const {rows:atpRows} = await client.query(`SELECT * FROM atp WHERE periode=$1`,[mois]);
    if (atpRows[0]) {
      const newCA=parseFloat(atpRows[0].real_ca_ht||0)+caHT;
      const newCD=parseFloat(atpRows[0].real_cd_ht||0)+cdHT;
      const newMB=newCA-newCD;
      const newTMB=newCA>0?newMB/newCA:0;
      const taux=atpRows[0].proj_ca_ht>0?newCA/atpRows[0].proj_ca_ht:0;
      const {bmfMt:b,fsMt:f,ammMt:a}=calcMarges(newCA,newCD);
      await client.query(
        `UPDATE atp SET real_ca_ht=$1,real_cd_ht=$2,real_marge_brute_ht=$3,
         taux_marge_brute=$4,taux_avancement_ca=$5,bmf_mt=$6,fs_mt=$7,amm_mt=$8 WHERE periode=$9`,
        [newCA,newCD,newMB,newTMB,taux,b,f,a,mois]
      );
    } else {
      const {bmfMt:b,fsMt:f,ammMt:a}=calcMarges(caHT,cdHT);
      await client.query(
        `INSERT INTO atp (periode,statut,real_ca_ht,real_cd_ht,real_marge_brute_ht,taux_marge_brute,bmf_mt,fs_mt,amm_mt)
         VALUES ($1,'en_cours',$2,$3,$4,$5,$6,$7,$8)`,
        [mois,caHT,cdHT,mbHT,tmbHT,b,f,a]
      );
    }
  }
}

router.get('/', auth, async (req,res) => {
  try {
    const {mois}=req.query;
    let q=`SELECT pj.id,pj.date_production,pj.statut,pj.jours_ouvres,pj.remarques,
      pj.saisie_le AS created_at,pj.saisi_par AS saisi_par_id,u.nom_complet AS saisi_par_nom,
      COALESCE(json_object_agg(fp.code,lp.cartons_produits) FILTER (WHERE fp.code IS NOT NULL),'{}') AS productions,
      COALESCE(json_build_object('pref32',COALESCE(r.pref32,0),'pref17',COALESCE(r.pref17,0),
        'bouchons',COALESCE(r.bouchons,0),'ctn_c12',COALESCE(r.ctn_c12,0),
        'ctn_c24',COALESCE(r.ctn_c24,0),'hilio',COALESCE(r.hilio_rebut,0),
        'etiquettes',COALESCE(r.etiquettes,0)),'{}') AS rebuts
      FROM productions_jour pj
      LEFT JOIN utilisateurs u ON u.id=pj.saisi_par
      LEFT JOIN lignes_production lp ON lp.production_id=pj.id
      LEFT JOIN formats_produits fp ON fp.id=lp.format_id
      LEFT JOIN rebuts r ON r.production_id=pj.id`;
    const params=[];
    if(mois){q+=` WHERE TO_CHAR(pj.date_production,'YYYY-MM')=$1`;params.push(mois);}
    q+=` GROUP BY pj.id,u.nom_complet,r.pref32,r.pref17,r.bouchons,r.ctn_c12,r.ctn_c24,r.hilio_rebut,r.etiquettes ORDER BY pj.date_production DESC`;
    const {rows}=await pool.query(q,params);
    res.json(rows.map(r=>({...r,
      c12:r.productions?.C12||0,c24:r.productions?.C24||0,
      f615:r.productions?.F615||0,f605:r.productions?.F605||0,
      f61:r.productions?.F61||0,hilio:r.productions?.HILIO||0,
    })));
  } catch(err){res.status(500).json({message:'Erreur serveur'});}
});

router.post('/', auth, async (req,res) => {
  const client=await pool.connect();
  try {
    const {date_production,jours_ouvres,productions,rebuts,remarques}=req.body;
    await client.query('BEGIN');
    const {rows}=await client.query(
      `INSERT INTO productions_jour (date_production,jours_ouvres,saisi_par,statut,remarques)
       VALUES ($1,$2,$3,'en_attente',$4)
       ON CONFLICT (date_production) DO UPDATE SET
         jours_ouvres=EXCLUDED.jours_ouvres,remarques=EXCLUDED.remarques,
         statut='en_attente',modifie_le=NOW()
       RETURNING id`,
      [date_production,jours_ouvres||1,req.user.id,remarques||'']
    );
    const prodId=rows[0].id;
    await client.query('DELETE FROM lignes_production WHERE production_id=$1',[prodId]);
    await client.query('DELETE FROM rebuts WHERE production_id=$1',[prodId]);
    for(const prod of productions){
      if(!prod.quantite||prod.quantite===0) continue;
      const {rows:fmtRows}=await client.query(`SELECT id FROM formats_produits WHERE code=$1`,[prod.code]);
      if(!fmtRows[0]) continue;
      await client.query(
        `INSERT INTO lignes_production (production_id,format_id,cartons_produits,bouteilles_total) VALUES ($1,$2,$3,$4)`,
        [prodId,fmtRows[0].id,prod.quantite,prod.quantite*(BTL[prod.code]||0)]
      );
    }
    if(rebuts){
      await client.query(
        `INSERT INTO rebuts (production_id,pref32,pref17,bouchons,ctn_c12,ctn_c24,hilio_rebut,etiquettes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [prodId,rebuts.pref32||0,rebuts.pref17||0,rebuts.bouchons||0,
         rebuts.ctn_c12||0,rebuts.ctn_c24||0,rebuts.hilio||0,rebuts.etiquettes||0]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({message:'Saisie enregistrée — en attente de validation DG',id:prodId});
  } catch(err){await client.query('ROLLBACK');res.status(500).json({message:err.message});}
  finally{client.release();}
});

// PUT /api/production/:id — modifier après validation (DG uniquement)
router.put('/:id', auth, role(DG), async (req,res) => {
  const client=await pool.connect();
  try {
    const {jours_ouvres,productions,rebuts,remarques}=req.body;
    await client.query('BEGIN');

    // Annuler les anciens mouvements de stock liés
    const {rows:pj}=await client.query(`SELECT date_production,statut FROM productions_jour WHERE id=$1`,[req.params.id]);
    if (pj[0]?.statut==='valide') {
      await client.query(`DELETE FROM stocks_mouvements WHERE motif LIKE 'Production validée%' AND date_mouvement=$1`,[pj[0].date_production]);
      await client.query(`DELETE FROM stocks_mouvements WHERE motif='Consommation production validée' AND date_mouvement=$1`,[pj[0].date_production]);
      // Recalculer ATP (soustraire ancien CA)
    }

    await client.query(
      `UPDATE productions_jour SET jours_ouvres=$1,remarques=$2,modifie_le=NOW() WHERE id=$3`,
      [jours_ouvres||1,remarques||'',req.params.id]
    );
    await client.query('DELETE FROM lignes_production WHERE production_id=$1',[req.params.id]);
    await client.query('DELETE FROM rebuts WHERE production_id=$1',[req.params.id]);

    for(const prod of productions){
      if(!prod.quantite||prod.quantite===0) continue;
      const {rows:fmtRows}=await client.query(`SELECT id FROM formats_produits WHERE code=$1`,[prod.code]);
      if(!fmtRows[0]) continue;
      await client.query(
        `INSERT INTO lignes_production (production_id,format_id,cartons_produits,bouteilles_total) VALUES ($1,$2,$3,$4)`,
        [req.params.id,fmtRows[0].id,prod.quantite,prod.quantite*(BTL[prod.code]||0)]
      );
    }
    if(rebuts){
      await client.query(
        `INSERT INTO rebuts (production_id,pref32,pref17,bouchons,ctn_c12,ctn_c24,hilio_rebut,etiquettes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [req.params.id,rebuts.pref32||0,rebuts.pref17||0,rebuts.bouchons||0,
         rebuts.ctn_c12||0,rebuts.ctn_c24||0,rebuts.hilio||0,rebuts.etiquettes||0]
      );
    }

    // Recalculer stocks et ATP si validé
    if (pj[0]?.statut==='valide') {
      await mettreAJourStocksATP(client,req.params.id,req.user.id);
    }

    await client.query('COMMIT');
    res.json({message:'Saisie modifiée ✓'});
  } catch(err){await client.query('ROLLBACK');res.status(500).json({message:err.message});}
  finally{client.release();}
});

router.put('/:id/valider', auth, role(DG), async (req,res) => {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows:pj}=await client.query(`SELECT date_production FROM productions_jour WHERE id=$1`,[req.params.id]);
    if(pj[0]){
      await client.query(`DELETE FROM stocks_mouvements WHERE motif LIKE 'Production validée%' AND date_mouvement=$1`,[pj[0].date_production]);
      await client.query(`DELETE FROM stocks_mouvements WHERE motif='Consommation production validée' AND date_mouvement=$1`,[pj[0].date_production]);
    }
    await client.query(`UPDATE productions_jour SET statut='valide',valide_par=$1,modifie_le=NOW() WHERE id=$2`,[req.user.id,req.params.id]);
    await mettreAJourStocksATP(client,req.params.id,req.user.id);
    await client.query('COMMIT');
    res.json({message:'✓ Production validée — Stocks et ATP mis à jour'});
  } catch(err){await client.query('ROLLBACK');res.status(500).json({message:err.message});}
  finally{client.release();}
});

router.delete('/:id', auth, role(DG), async (req,res) => {
  try {
    await pool.query('DELETE FROM rebuts WHERE production_id=$1',[req.params.id]);
    await pool.query('DELETE FROM lignes_production WHERE production_id=$1',[req.params.id]);
    await pool.query('DELETE FROM productions_jour WHERE id=$1',[req.params.id]);
    res.json({message:'Saisie supprimée'});
  } catch{res.status(500).json({message:'Erreur serveur'});}
});

router.get('/kpis/mois-courant', auth, async (req,res) => {
  try {
    const m=req.query.mois||new Date().toISOString().slice(0,7);
    const {rows}=await pool.query(
      `SELECT fp.code,COALESCE(SUM(lp.cartons_produits),0) AS total
       FROM lignes_production lp JOIN formats_produits fp ON fp.id=lp.format_id
       JOIN productions_jour pj ON pj.id=lp.production_id
       WHERE TO_CHAR(pj.date_production,'YYYY-MM')=$1 AND pj.statut='valide' GROUP BY fp.code`,[m]
    );
    const kpis={c12:0,c24:0,f615:0,f605:0,f61:0,hilio:0,jours_ouvres:0};
    rows.forEach(r=>{kpis[r.code.toLowerCase()]=parseInt(r.total);});
    const {rows:jr}=await pool.query(
      `SELECT COALESCE(SUM(jours_ouvres),0) AS jours FROM productions_jour WHERE TO_CHAR(date_production,'YYYY-MM')=$1 AND statut='valide'`,[m]
    );
    kpis.jours_ouvres=parseFloat(jr[0]?.jours||0);
    res.json({kpis});
  } catch{res.status(500).json({message:'Erreur serveur'});}
});

router.get('/kpis/evolution', auth, async (req,res) => {
  try {
    const {rows}=await pool.query(
      `SELECT TO_CHAR(pj.date_production,'YYYY-MM') AS mois,fp.code,SUM(lp.cartons_produits) AS total
       FROM lignes_production lp JOIN formats_produits fp ON fp.id=lp.format_id
       JOIN productions_jour pj ON pj.id=lp.production_id
       WHERE pj.statut='valide' AND pj.date_production>=NOW()-INTERVAL '6 months'
       GROUP BY mois,fp.code ORDER BY mois`
    );
    const map={};
    rows.forEach(r=>{
      if(!map[r.mois]) map[r.mois]={mois:r.mois,c12:0,c24:0,hilio:0};
      if(['c12','c24','hilio'].includes(r.code.toLowerCase())) map[r.mois][r.code.toLowerCase()]=parseInt(r.total);
    });
    res.json(Object.values(map));
  } catch{res.status(500).json({message:'Erreur serveur'});}
});

module.exports = router;
