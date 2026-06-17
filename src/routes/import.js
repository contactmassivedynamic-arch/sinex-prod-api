const router  = require('express').Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const role    = require('../middleware/role');

const DG = 'directeur_general';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20*1024*1024 } });

function parseDate(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return new Date(d.y, d.m-1, d.d);
  }
  if (val instanceof Date) return isNaN(val)?null:val;
  if (typeof val === 'string') {
    const fr = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (fr) return new Date(parseInt(fr[3]),parseInt(fr[2])-1,parseInt(fr[1]));
    const iso = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(parseInt(iso[1]),parseInt(iso[2])-1,parseInt(iso[3]));
    const d = new Date(val);
    if (!isNaN(d)) return d;
  }
  return null;
}

function num(v) { return Math.abs(parseFloat(String(v||'0').replace(/\s/g,'').replace(',','.'))||0); }

// ══ IMPORT PRODUCTION ══════════════════════════════════════════════
// Feuille SAISIE_JOURNALIERE — lecture par index de colonne
// Col: A=0 Date | B=1 C12 | C=2 C24 | D=3 F615 | E=4 F605 | F=5 F61 | G=6 HILIO
//      H=7 Préf32 | I=8 Préf17 | J=9 Bouch | K=10 CtnC12 | L=11 CtnC24
//      M=12 Sachets HILIO rebuts | N=13 Étiq C12 (1,5L) | O=14 Étiq C24 (0,5L)
//      P=15 Total rebuts (calculé — ignoré) | Q=16 Jours ouvrés
router.post('/production', auth, role(DG), upload.single('fichier'), async (req, res) => {
  const client = await pool.connect();
  try {
    if (!req.file) return res.status(400).json({message:'Fichier manquant'});
    const wb = XLSX.read(req.file.buffer, {type:'buffer', cellDates:true, raw:false});

    const sheetName = wb.SheetNames.find(n=>
      n.toLowerCase().includes('saisie') || n.toLowerCase().includes('journali')
    ) || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) return res.status(400).json({message:'Feuille SAISIE_JOURNALIERE introuvable'});

    // Lire par index (header:1) à partir de la ligne 7 (skip 6 lignes titre/en-têtes)
    const rawRows = XLSX.utils.sheet_to_json(ws, {header:1, defval:'', raw:false});
    const dataRows = rawRows.slice(6).filter(r => {
      const v = String(r[0]||'').trim();
      return v !== '' && !v.toUpperCase().includes('TOTAL') && !v.toUpperCase().includes('DATE');
    });

    console.log(`[IMPORT PROD] Feuille: ${sheetName} — ${dataRows.length} lignes`);

    await client.query('BEGIN');
    let inserted=0, skipped=0, erreurs=[];

    for (const row of dataRows) {
      const date = parseDate(row[0]);
      if (!date || isNaN(date.getTime())) { skipped++; continue; }

      // Produits finis — cols B à G (index 1-6)
      const c12   = num(row[1]);
      const c24   = num(row[2]);
      const f615  = num(row[3]);
      const f605  = num(row[4]);
      const f61   = num(row[5]);
      const hilio = num(row[6]);

      // Rebuts — cols H à O (index 7-14)
      const pref32   = num(row[7]);   // H — Préformes 32g
      const pref17   = num(row[8]);   // I — Préformes 17g
      const bouchons = num(row[9]);   // J — Bouchons
      const ctn_c12  = num(row[10]);  // K — Cartons C12
      const ctn_c24  = num(row[11]);  // L — Cartons C24
      const hilio_r  = num(row[12]);  // M — Sachets HILIO (NOUVEAU)
      const etiq_c12 = num(row[13]);  // N — Étiquettes C12 1,5L (SCINDÉ)
      const etiq_c24 = num(row[14]);  // O — Étiquettes C24 0,5L (SCINDÉ)
      // row[15] = Total rebuts auto — ignoré
      const jours    = parseFloat(row[16])||1; // Q — Jours ouvrés

      try {
        const {rows: pj} = await client.query(
          `INSERT INTO productions_jour (date_production,jours_ouvres,saisi_par_id,statut)
           VALUES ($1,$2,$3,'valide')
           ON CONFLICT (date_production) DO UPDATE SET
             jours_ouvres=EXCLUDED.jours_ouvres, statut='valide'
           RETURNING id`,
          [date, jours, req.user.id]
        );
        const pjId = pj[0].id;

        // Lignes production — supprimer puis réinsérer
        await client.query('DELETE FROM lignes_production WHERE production_id=$1',[pjId]);
        const BTL = {C12:12,C24:24,F615:6,F605:6,F61:6,HILIO:30};
        for (const [code,qte] of [['C12',c12],['C24',c24],['F615',f615],['F605',f605],['F61',f61],['HILIO',hilio]]) {
          if (!qte) continue;
          const {rows:fp} = await client.query('SELECT id FROM formats_produits WHERE code=$1',[code]);
          if (fp[0]) await client.query(
            `INSERT INTO lignes_production (production_id,format_id,cartons_produits,bouteilles_total)
             VALUES ($1,$2,$3,$4) ON CONFLICT (production_id,format_id) DO UPDATE SET cartons_produits=$3,bouteilles_total=$4`,
            [pjId, fp[0].id, qte, qte*(BTL[code]||0)]
          );
        }

        // Rebuts — supprimer puis réinsérer (sans restriction sur valeurs nulles)
        await client.query('DELETE FROM rebuts WHERE production_id=$1',[pjId]);
        await client.query(
          `INSERT INTO rebuts
             (production_id,pref32,pref17,bouchons,ctn_c12,ctn_c24,hilio_rebut,etiq_c12,etiq_c24)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [pjId, pref32, pref17, bouchons, ctn_c12, ctn_c24, hilio_r, etiq_c12, etiq_c24]
        );

        inserted++;
      } catch(e) {
        erreurs.push(`${date.toLocaleDateString('fr-FR')}: ${e.message}`);
        console.error('[IMPORT PROD ROW]', e.message);
      }
    }

    await client.query('COMMIT');
    await pool.query(
      `INSERT INTO import_historique (type_import,nom_fichier,lignes_importees,statut,importe_par_id)
       VALUES ('production',$1,$2,'success',$3)`,
      [req.file.originalname, inserted, req.user.id]
    ).catch(()=>{});

    console.log(`[IMPORT PROD] ✅ ${inserted} journées importées, ${skipped} ignorées`);
    res.json({message:`Import production ✓ — ${inserted} journée(s) importée(s)`, inserted, skipped, erreurs});
  } catch(e) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('[IMPORT PROD ERR]', e.message);
    res.status(500).json({message:e.message});
  } finally { client.release(); }
});

// ══ IMPORT STOCKS ══════════════════════════════════════════════════
// Feuilles CLASSE_1_Consommables | CLASSE_2_EPI_Pieces
// Cols: 0=N° | 1=Code | 2=Désignation | 3=Unité | 4=Prix | 5=StockDébut | 6=Sorties | 7=Entrées | 8=SoldeFin
router.post('/stocks', auth, role(DG), upload.single('fichier'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({message:'Fichier manquant'});
    const wb = XLSX.read(req.file.buffer, {type:'buffer', cellDates:true, raw:false});

    const sheets = wb.SheetNames.filter(n=>
      n.toUpperCase().includes('CLASSE') ||
      n.toUpperCase().includes('CONSOMMABLE') ||
      n.toUpperCase().includes('EPI') ||
      n.toUpperCase().includes('PIECE')
    );
    if (!sheets.length) return res.status(400).json({message:'Aucune feuille CLASSE_1 ou CLASSE_2 trouvée'});

    const mois = req.body.mois || new Date().toISOString().slice(0,7);
    const dateMois = new Date(mois+'-01');
    let inserted=0, skipped=0, erreurs=[];

    for (const sheetName of sheets) {
      const ws = wb.Sheets[sheetName];
      const classe = sheetName.includes('1') || sheetName.toUpperCase().includes('CONSOMMABLE') ? 1 : 2;
      const rawRows = XLSX.utils.sheet_to_json(ws, {header:1, defval:'', raw:false});
      const dataRows = rawRows.slice(5).filter(r => {
        const code = String(r[1]||'').trim();
        return code !== '' && !code.toUpperCase().includes('CODE') &&
               !code.toUpperCase().includes('TOTAL') && !code.toUpperCase().includes('N°');
      });

      console.log(`[IMPORT STK] Feuille ${sheetName} (Classe ${classe}) — ${dataRows.length} articles`);

      for (const row of dataRows) {
        const code    = String(row[1]||'').trim().toUpperCase();
        const libelle = String(row[2]||'').trim();
        const unite   = String(row[3]||'pièce').trim();
        const prix    = num(row[4]);
        const debut   = num(row[5]);
        const sorties = num(row[6]);
        const entrees = num(row[7]);

        if (!code || !libelle) { skipped++; continue; }
        if (debut===0 && sorties===0 && entrees===0) { skipped++; continue; }

        try {
          const {rows:art} = await pool.query(
            `INSERT INTO stocks_articles (code,libelle,unite,classe,prix_unitaire_ht,actif)
             VALUES ($1,$2,$3,$4,$5,true)
             ON CONFLICT (code) DO UPDATE SET
               libelle=$2, unite=$3,
               prix_unitaire_ht=CASE WHEN $5>0 THEN $5 ELSE stocks_articles.prix_unitaire_ht END,
               actif=true
             RETURNING id`,
            [code, libelle, unite, classe, prix]
          );
          const artId = art[0].id;

          if (debut>0) await pool.query(
            `INSERT INTO stocks_mouvements (article_id,type_mouvement,quantite,date_mouvement,motif,saisi_par_id)
             VALUES ($1,'entree',$2,$3,'Report solde mois précédent',$4)`,
            [artId, debut, dateMois, req.user.id]
          );
          if (sorties>0) await pool.query(
            `INSERT INTO stocks_mouvements (article_id,type_mouvement,quantite,date_mouvement,motif,saisi_par_id)
             VALUES ($1,'sortie',$2,$3,'Sortie du mois',$4)`,
            [artId, sorties, dateMois, req.user.id]
          );
          if (entrees>0) await pool.query(
            `INSERT INTO stocks_mouvements (article_id,type_mouvement,quantite,date_mouvement,motif,saisi_par_id)
             VALUES ($1,'entree',$2,$3,'Entrée du mois',$4)`,
            [artId, entrees, dateMois, req.user.id]
          );
          inserted++;
        } catch(e) {
          erreurs.push(`${code}: ${e.message}`);
          console.error('[IMPORT STK ROW]', code, e.message);
        }
      }
    }

    await pool.query(
      `INSERT INTO import_historique (type_import,nom_fichier,lignes_importees,statut,importe_par_id)
       VALUES ('stocks',$1,$2,'success',$3)`,
      [req.file.originalname, inserted, req.user.id]
    ).catch(()=>{});

    res.json({message:`Import stocks ✓ — ${inserted} article(s), ${skipped} ignoré(s)`, inserted, skipped, erreurs});
  } catch(e) {
    console.error('[IMPORT STK ERR]', e.message);
    res.status(500).json({message:e.message});
  }
});

// ══ IMPORT TRÉSORERIE ══════════════════════════════════════════════
// Feuilles CAISSE_DEF | BSIC_TOGO | BOA_TOGO | BATG_TOGO
// Cols: 0=Date | 1=Entrée | 2=Sortie | 3=Nature | 4=Libellé | 5=Montant(auto) | 6=Pièce | 7=Saisi par
router.post('/tresorerie', auth, role(DG), upload.single('fichier'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({message:'Fichier manquant'});
    const wb = XLSX.read(req.file.buffer, {type:'buffer', cellDates:true, raw:false});

    const CODES = ['CAISSE_DEF','BSIC_TOGO','BOA_TOGO','BATG_TOGO'];
    let inserted=0, skipped=0, erreurs=[];

    for (const code of CODES) {
      const ws = wb.Sheets[code];
      if (!ws) continue;

      const {rows:comptes} = await pool.query('SELECT id FROM comptes_tresorerie WHERE code=$1',[code]);
      if (!comptes[0]) { console.warn('[IMPORT TRES] Compte non trouvé:', code); continue; }
      const compteId = comptes[0].id;

      const rawRows = XLSX.utils.sheet_to_json(ws, {header:1, defval:'', raw:false});
      const dataRows = rawRows.slice(5).filter(r => {
        const d = String(r[0]||'').trim();
        return d !== '' && !d.toUpperCase().includes('DATE') && !d.toUpperCase().includes('TOTAL');
      });

      console.log(`[IMPORT TRES] Feuille ${code} — ${dataRows.length} lignes`);

      for (const row of dataRows) {
        const entree  = num(row[1]);
        const sortie  = num(row[2]);
        const nature  = String(row[3]||'').trim();
        const libelle = String(row[4]||'').trim();
        const piece   = String(row[6]||'').trim();

        if (entree===0 && sortie===0) { skipped++; continue; }
        if (!libelle && !nature) { skipped++; continue; }

        const sens    = entree>0 ? 'credit' : 'debit';
        const montant = entree>0 ? entree : sortie;
        const date    = parseDate(row[0]) || new Date();

        try {
          await pool.query(
            `INSERT INTO tresorerie_mouvements
               (compte_id,sens,montant_fcfa,date_mouvement,description,nature_operation,piece_justificative,saisi_par_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [compteId, sens, montant, date, libelle||nature, nature, piece, req.user.id]
          );
          inserted++;
        } catch(e) {
          skipped++;
          erreurs.push(`${code} ${date.toLocaleDateString('fr-FR')}: ${e.message}`);
        }
      }
    }

    // Feuille CREDITS
    const ws_cr = wb.Sheets['CREDITS'];
    let cr_inserted=0;
    if (ws_cr) {
      const rawCr = XLSX.utils.sheet_to_json(ws_cr, {header:1, defval:'', raw:false});
      const dataCr = rawCr.slice(6).filter(r => {
        const cr = String(r[2]||'').trim();
        return cr !== '' && !cr.toUpperCase().includes('CRÉANCIER') && !cr.toUpperCase().includes('TOTAL');
      });
      for (const row of dataCr) {
        const emprunte  = num(row[4]);
        const creancier = String(row[2]||'').trim();
        if (!creancier || emprunte===0) continue;
        try {
          await pool.query(
            `INSERT INTO credits (creancier,nature_credit,montant_fcfa,montant_rembourse,date_contrat,statut,saisi_par_id)
             VALUES ($1,$2,$3,$4,$5,'actif',$6) ON CONFLICT DO NOTHING`,
            [creancier, String(row[3]||'').trim(), emprunte, num(row[5]), parseDate(row[0])||new Date(), req.user.id]
          );
          cr_inserted++;
        } catch(e) { erreurs.push(`Crédit ${creancier}: ${e.message}`); }
      }
    }

    await pool.query(
      `INSERT INTO import_historique (type_import,nom_fichier,lignes_importees,statut,importe_par_id)
       VALUES ('tresorerie',$1,$2,'success',$3)`,
      [req.file.originalname, inserted+cr_inserted, req.user.id]
    ).catch(()=>{});

    res.json({
      message:`Import trésorerie ✓ — ${inserted} mouvement(s) + ${cr_inserted} crédit(s), ${skipped} ignoré(s)`,
      inserted, cr_inserted, skipped, erreurs
    });
  } catch(e) {
    console.error('[IMPORT TRES ERR]', e.message);
    res.status(500).json({message:e.message});
  }
});

// GET historique
router.get('/historique', auth, async (req, res) => {
  try {
    const {rows} = await pool.query(
      `SELECT h.*, u.nom_complet AS importe_par_nom
       FROM import_historique h
       LEFT JOIN utilisateurs u ON u.id=h.importe_par_id
       ORDER BY h.created_at DESC LIMIT 50`
    ).catch(()=>({rows:[]}));
    res.json(rows);
  } catch { res.json([]); }
});

module.exports = router;
