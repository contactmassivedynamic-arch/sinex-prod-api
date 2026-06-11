const router   = require('express').Router();
const pool     = require('../db/pool');
const auth     = require('../middleware/auth');
const role     = require('../middleware/role');
const multer   = require('multer');
const XLSX     = require('xlsx');
const path     = require('path');

const DG  = 'directeur_general';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10*1024*1024 } });

function strDate(v) {
  if (!v) return new Date();
  if (typeof v === 'number') {
    const d = new Date(Math.round((v-25569)*86400*1000));
    return isNaN(d)?new Date():d;
  }
  const d = new Date(v);
  return isNaN(d)?new Date():d;
}

function numVal(v) { return Math.abs(parseFloat(v)||0); }

// ══ IMPORT PRODUCTION ══════════════════════════════════════════════
// Feuille attendue : SAISIE_JOURNALIERE
// Colonnes : Date|C12|C24|F615|F605|F61|HILIO|Préf32|Préf17|Bouch|CtnC12|CtnC24|Sachets|Étiq|TotalRebuts|JoursOuvrés
router.post('/production', auth, role(DG), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({message:'Fichier manquant'});
    const wb = XLSX.read(req.file.buffer, {type:'buffer',cellDates:true});

    // Chercher la feuille SAISIE_JOURNALIERE
    const ws = wb.Sheets['SAISIE_JOURNALIERE'] || wb.Sheets[wb.SheetNames.find(n=>n.toUpperCase().includes('SAISIE')||n.toUpperCase().includes('PROD'))];
    if (!ws) return res.status(400).json({message:'Feuille SAISIE_JOURNALIERE introuvable'});

    const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
    let inserted=0, skipped=0;

    for (let i=0; i<rows.length; i++) {
      const row = rows[i];
      if (!row[0] || String(row[0]).trim()==='' || String(row[0]).toUpperCase().includes('DATE') || String(row[0]).toUpperCase().includes('TOTAL')) continue;

      const dateVal = strDate(row[0]);
      const c12   = parseInt(row[1])||0;
      const c24   = parseInt(row[2])||0;
      const f615  = parseInt(row[3])||0;
      const f605  = parseInt(row[4])||0;
      const f61   = parseInt(row[5])||0;
      const hilio = parseInt(row[6])||0;
      const pref32  = parseInt(row[7])||0;
      const pref17  = parseInt(row[8])||0;
      const bouchons= parseInt(row[9])||0;
      const ctn_c12 = parseInt(row[10])||0;
      const ctn_c24 = parseInt(row[11])||0;
      const hilio_r = parseInt(row[12])||0;
      const etiq    = parseInt(row[13])||0;
      const jours   = parseFloat(row[15])||1;

      if (c12===0&&c24===0&&f615===0&&f605===0&&f61===0&&hilio===0) { skipped++; continue; }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: pj } = await client.query(
          `INSERT INTO productions_jour (date_production,statut,jours_ouvres,saisi_par_id)
           VALUES ($1,'valide',$2,$3) ON CONFLICT (date_production) DO UPDATE SET statut='valide',jours_ouvres=$2 RETURNING id`,
          [dateVal, jours, req.user.id]
        );
        const prodId = pj[0].id;

        const formats = [['C12',c12],['C24',c24],['F615',f615],['F605',f605],['F61',f61],['HILIO',hilio]];
        for (const [code,qte] of formats) {
          if (qte>0) {
            const { rows: fp } = await client.query('SELECT id FROM formats_produits WHERE code=$1',[code]);
            if (fp[0]) {
              await client.query(
                `INSERT INTO lignes_production (production_id,format_id,cartons_produits)
                 VALUES ($1,$2,$3) ON CONFLICT (production_id,format_id) DO UPDATE SET cartons_produits=$3`,
                [prodId, fp[0].id, qte]
              );
            }
          }
        }
        // Rebuts
        await client.query(
          `INSERT INTO rebuts (production_id,pref32,pref17,bouchons,ctn_c12,ctn_c24,hilio_rebut,etiquettes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (production_id) DO UPDATE SET pref32=$2,pref17=$3,bouchons=$4,ctn_c12=$5,ctn_c24=$6,hilio_rebut=$7,etiquettes=$8`,
          [prodId, pref32, pref17, bouchons, ctn_c12, ctn_c24, hilio_r, etiq]
        );
        await client.query('COMMIT');
        inserted++;
      } catch(e) { await client.query('ROLLBACK'); skipped++; console.error('[IMPORT PROD]',e.message); }
      finally { client.release(); }
    }

    await pool.query(`INSERT INTO import_historique (type_import,nom_fichier,lignes_importees,statut,importe_par_id) VALUES ('production',$1,$2,'success',$3)`,
      [req.file.originalname, inserted, req.user.id]).catch(()=>{});
    res.json({message:`Import production terminé ✓ — ${inserted} ligne(s) importée(s), ${skipped} ignorée(s)`, inserted, skipped});
  } catch(e) { console.error('[IMPORT PROD ERR]',e.message); res.status(500).json({message:e.message}); }
});

// ══ IMPORT STOCKS ══════════════════════════════════════════════════
// Feuilles : CLASSE_1_Consommables | CLASSE_2_EPI_Pieces
// Colonnes : N°|Code|Désignation|Unité|Prix|StockDébut|Sorties|Entrées|SoldeFin|ValeurHT
router.post('/stocks', auth, role(DG), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({message:'Fichier manquant'});
    const wb = XLSX.read(req.file.buffer, {type:'buffer',cellDates:true});

    let inserted=0, skipped=0;
    const feuilles = wb.SheetNames.filter(n=>n.toUpperCase().includes('CLASSE'));

    for (const sheetName of feuilles) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
      const classe = sheetName.includes('1')?1:2;

      for (const row of rows) {
        const code = String(row[1]||'').trim().toUpperCase();
        if (!code || code==='CODE' || code==='N°' || code==='' || code==='TOTAL') continue;

        const libelle = String(row[2]||'').trim();
        const unite   = String(row[3]||'pièce').trim();
        const prix    = numVal(row[4]);
        const stock_debut = numVal(row[5]);
        const sorties     = numVal(row[6]);
        const entrees     = numVal(row[7]);
        const solde_fin   = numVal(row[8]);

        if (!libelle) { skipped++; continue; }

        const mois = req.body.mois || new Date().toISOString().slice(0,7);
        const date_mvt = new Date(mois+'-01');

        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          // Upsert article
          const { rows: art } = await client.query(
            `INSERT INTO stocks_articles (code,libelle,unite,classe,prix_unitaire_ht,actif)
             VALUES ($1,$2,$3,$4,$5,true)
             ON CONFLICT (code) DO UPDATE SET libelle=$2,unite=$3,prix_unitaire_ht=CASE WHEN $5>0 THEN $5 ELSE stocks_articles.prix_unitaire_ht END,actif=true
             RETURNING id`,
            [code, libelle, unite, classe, prix]
          );
          const artId = art[0].id;

          // Mouvement stock début (report)
          if (stock_debut > 0) {
            await client.query(
              `INSERT INTO stocks_mouvements (article_id,type_mouvement,quantite,date_mouvement,motif,saisi_par_id)
               VALUES ($1,'entree',$2,$3,'Report solde mois précédent',$4)`,
              [artId, stock_debut, date_mvt, req.user.id]
            );
          }
          // Sorties
          if (sorties > 0) {
            await client.query(
              `INSERT INTO stocks_mouvements (article_id,type_mouvement,quantite,date_mouvement,motif,saisi_par_id)
               VALUES ($1,'sortie',$2,$3,'Sortie du mois',$4)`,
              [artId, sorties, date_mvt, req.user.id]
            );
          }
          // Entrées
          if (entrees > 0) {
            await client.query(
              `INSERT INTO stocks_mouvements (article_id,type_mouvement,quantite,date_mouvement,motif,saisi_par_id)
               VALUES ($1,'entree',$2,$3,'Entrée du mois',$4)`,
              [artId, entrees, date_mvt, req.user.id]
            );
          }
          await client.query('COMMIT');
          inserted++;
        } catch(e) { await client.query('ROLLBACK'); skipped++; console.error('[IMPORT STKS]',code,e.message); }
        finally { client.release(); }
      }
    }

    await pool.query(`INSERT INTO import_historique (type_import,nom_fichier,lignes_importees,statut,importe_par_id) VALUES ('stocks',$1,$2,'success',$3)`,
      [req.file.originalname, inserted, req.user.id]).catch(()=>{});
    res.json({message:`Import stocks terminé ✓ — ${inserted} article(s) traité(s), ${skipped} ignoré(s)`, inserted, skipped});
  } catch(e) { console.error('[IMPORT STKS ERR]',e.message); res.status(500).json({message:e.message}); }
});

// ══ IMPORT TRÉSORERIE ══════════════════════════════════════════════
// Feuilles : CAISSE_DEF | BSIC_TOGO | BOA_TOGO | BATG_TOGO
// Colonnes : Date | Entrée | Sortie | Nature | Libellé | Montant(auto) | Pièce just. | Saisi par
router.post('/tresorerie', auth, role(DG), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({message:'Fichier manquant'});
    const wb = XLSX.read(req.file.buffer, {type:'buffer',cellDates:true});

    const CODES_COMPTES = ['CAISSE_DEF','BSIC_TOGO','BOA_TOGO','BATG_TOGO'];
    let inserted=0, skipped=0;

    for (const code of CODES_COMPTES) {
      const ws = wb.Sheets[code];
      if (!ws) continue;

      // Trouver le compte en DB
      const { rows: comptes } = await pool.query('SELECT id FROM comptes_tresorerie WHERE code=$1',[code]);
      if (!comptes[0]) { console.warn('[IMPORT TRES] Compte non trouvé:',code); continue; }
      const compteId = comptes[0].id;

      const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});

      for (const row of rows) {
        // Ignorer les lignes sans date ou qui sont des en-têtes/totaux
        const dateRaw = row[0];
        if (!dateRaw || String(dateRaw).toUpperCase().includes('DATE') || String(dateRaw).toUpperCase().includes('TOTAL')) continue;

        const entree  = numVal(row[1]);
        const sortie  = numVal(row[2]);
        const nature  = String(row[3]||'').trim();
        const libelle = String(row[4]||'').trim();
        const piece   = String(row[6]||'').trim();
        const saisi   = String(row[7]||'').trim();

        // Il faut au moins une valeur (entrée ou sortie)
        if (entree===0 && sortie===0) { skipped++; continue; }
        if (!libelle && !nature) { skipped++; continue; }

        const sens    = entree > 0 ? 'credit' : 'debit';
        const montant = entree > 0 ? entree : sortie;
        const dateVal = strDate(dateRaw);

        try {
          await pool.query(
            `INSERT INTO tresorerie_mouvements
               (compte_id,sens,montant_fcfa,date_mouvement,description,nature_operation,piece_justificative,saisi_par_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [compteId, sens, montant, dateVal, libelle||nature, nature, piece, req.user.id]
          );
          inserted++;
        } catch(e) { skipped++; console.error('[IMPORT TRES]',code,e.message); }
      }
    }

    // Import crédits si feuille CREDITS présente
    const ws_cr = wb.Sheets['CREDITS'];
    let inserted_cr=0;
    if (ws_cr) {
      const rows_cr = XLSX.utils.sheet_to_json(ws_cr, {header:1, defval:''});
      for (const row of rows_cr) {
        const date_c = row[0]; const creancier=String(row[2]||'').trim(); const nature_c=String(row[3]||'').trim();
        const emprunte=numVal(row[4]); const rembourse=numVal(row[5]);
        if (!creancier||creancier==='Créancier / Banque'||emprunte===0) continue;
        try {
          await pool.query(
            `INSERT INTO credits (creancier,nature_credit,montant_fcfa,montant_rembourse,date_contrat,statut,saisi_par_id)
             VALUES ($1,$2,$3,$4,$5,'actif',$6) ON CONFLICT DO NOTHING`,
            [creancier, nature_c, emprunte, rembourse, strDate(date_c), req.user.id]
          );
          inserted_cr++;
        } catch(e) { console.error('[IMPORT CR]',e.message); }
      }
    }

    await pool.query(`INSERT INTO import_historique (type_import,nom_fichier,lignes_importees,statut,importe_par_id) VALUES ('tresorerie',$1,$2,'success',$3)`,
      [req.file.originalname, inserted+inserted_cr, req.user.id]).catch(()=>{});
    res.json({message:`Import trésorerie terminé ✓ — ${inserted} mouvement(s) + ${inserted_cr} crédit(s), ${skipped} ignoré(s)`, inserted, inserted_cr, skipped});
  } catch(e) { console.error('[IMPORT TRES ERR]',e.message); res.status(500).json({message:e.message}); }
});

// GET historique imports
router.get('/historique', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ih.*,u.nom_complet AS importe_par_nom FROM import_historique ih
       LEFT JOIN utilisateurs u ON u.id=ih.importe_par_id ORDER BY ih.created_at DESC LIMIT 50`
    );
    res.json(rows);
  } catch(e) { res.status(500).json({message:e.message}); }
});

module.exports = router;
