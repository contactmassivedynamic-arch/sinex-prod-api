const router  = require('express').Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Convertir date Excel (numérique ou string) en objet Date
function parseDate(val) {
  if (!val) return null;
  // Numérique Excel (ex: 46012)
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return new Date(d.y, d.m-1, d.d);
  }
  // String JJ/MM/AAAA ou AAAA-MM-JJ
  if (typeof val === 'string') {
    const fr = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (fr) return new Date(parseInt(fr[3]), parseInt(fr[2])-1, parseInt(fr[1]));
    const iso = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2])-1, parseInt(iso[3]));
    const d = new Date(val);
    if (!isNaN(d)) return d;
  }
  if (val instanceof Date) return val;
  return null;
}

function num(val) { return parseFloat(String(val||'0').replace(/\s/g,'').replace(',','.')) || 0; }

// POST /api/import/excel — import production
router.post('/production', auth, upload.single('fichier'), async (req, res) => {
  const client = await pool.connect();
  try {
    if (!req.file) return res.status(400).json({ message: 'Fichier manquant' });
    const wb = XLSX.read(req.file.buffer, { type:'buffer', cellDates:true });

    // Chercher la feuille "Saisie_Journaliere" ou prendre la 1ère
    const sheetName = wb.SheetNames.find(n=>n.toLowerCase().includes('saisie')||n.toLowerCase().includes('production')) || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    // Lire à partir de la ligne 8 (après entêtes)
    const data = XLSX.utils.sheet_to_json(ws, { defval:'', range:6 });

    await client.query('BEGIN');
    let importes = 0, erreurs = [];

    for (const row of data) {
      // Colonnes du modèle SINEX SA
      const dateVal = row['Date production'] || row['Date'] || row['DATE'];
      const date = parseDate(dateVal);
      if (!date || isNaN(date.getTime())) continue;

      // Ignorer la ligne TOTAL
      const premVal = String(dateVal||'').toUpperCase();
      if (premVal.includes('TOTAL') || premVal.includes('MOIS')) continue;

      const jours  = num(row['Jours ouvrés'] || row['Jours'] || row['JOURS'] || 1);
      const c12    = num(row['C12 (cartons)']  || row['C12']  || 0);
      const c24    = num(row['C24 (cartons)']  || row['C24']  || 0);
      const f615   = num(row['F6/1,5L (fardeaux)'] || row['F6/1,5L'] || row['F615'] || 0);
      const f605   = num(row['F6/0,5L (fardeaux)'] || row['F6/0,5L'] || row['F605'] || 0);
      const f61    = num(row['F6/1L (fardeaux)']   || row['F6/1L']   || row['F61']  || 0);
      const hilio  = num(row['HILIO (packs)'] || row['HILIO'] || 0);
      const p32    = num(row['Reb. Préf.32g']  || row['Reb. Pref.32g']  || row['Rebut Préf.32g'] || 0);
      const p17    = num(row['Reb. Préf.17g']  || row['Reb. Pref.17g']  || row['Rebut Préf.17g'] || 0);
      const bouch  = num(row['Reb. Bouchons']  || row['Rebut Bouchons'] || 0);
      const ctn12  = num(row['Reb. Cartons']   || row['Rebut Cartons']  || 0);
      const etiq   = num(row['Reb. Étiquettes']|| row['Reb. Etiquettes']|| row['Rebut Étiq.'] || 0);

      try {
        // Insérer/mettre à jour production_jour
        const { rows: pjRows } = await client.query(
          `INSERT INTO productions_jour (date_production, jours_ouvres, saisi_par, statut, remarques)
           VALUES ($1,$2,$3,'en_attente','Import Excel')
           ON CONFLICT (date_production) DO UPDATE SET
             jours_ouvres=EXCLUDED.jours_ouvres, remarques='Import Excel mis à jour'
           RETURNING id`,
          [date, jours || 1, req.user.id]
        );
        const pjId = pjRows[0].id;

        // Supprimer anciennes lignes
        await client.query('DELETE FROM lignes_production WHERE production_id=$1', [pjId]);
        await client.query('DELETE FROM rebuts WHERE production_id=$1', [pjId]);

        // Insérer lignes production
        const formats = [
          ['C12', c12], ['C24', c24], ['F615', f615],
          ['F605', f605], ['F61', f61], ['HILIO', hilio],
        ];
        const BTL = {C12:12,C24:24,F615:6,F605:6,F61:6,HILIO:30};
        for (const [code, qte] of formats) {
          if (!qte) continue;
          const { rows: fmtRows } = await client.query(
            `SELECT id FROM formats_produits WHERE code=$1`, [code]
          );
          if (fmtRows[0]) {
            await client.query(
              `INSERT INTO lignes_production (production_id, format_id, cartons_produits, bouteilles_total)
               VALUES ($1,$2,$3,$4)`,
              [pjId, fmtRows[0].id, qte, qte*(BTL[code]||0)]
            );
          }
        }

        // Insérer rebuts si présents
        if (p32||p17||bouch||ctn12||etiq) {
          await client.query(
            `INSERT INTO rebuts (production_id,pref32,pref17,bouchons,ctn_c12,ctn_c24,hilio_rebut,etiquettes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [pjId, p32, p17, bouch, ctn12, 0, 0, etiq]
          );
        }
        importes++;
      } catch(e) {
        erreurs.push(`Ligne ${date.toLocaleDateString('fr-FR')}: ${e.message}`);
      }
    }

    await client.query('COMMIT');

    // Enregistrer historique
    await pool.query(
      `INSERT INTO import_historique (type_import, nom_fichier, lignes_importees, statut, importe_par_id)
       VALUES ('production',$1,$2,'success',$3)`,
      [req.file.originalname, importes, req.user.id]
    ).catch(()=>{});

    res.json({ message:`Import production réussi — ${importes} journée(s) importée(s)`, importes, erreurs });
  } catch(err) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('[IMPORT PROD]', err.message);
    res.status(500).json({ message: err.message });
  } finally { client.release(); }
});

// POST /api/import/stocks
router.post('/stocks', auth, upload.single('fichier'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Fichier manquant' });
    const wb = XLSX.read(req.file.buffer, { type:'buffer', cellDates:true });

    // Feuilles à traiter
    const sheets = ['Entrees_Stock','Sorties_Stock'];
    let importes = 0, erreurs = [];

    for (const sheetName of sheets) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const isSortie = sheetName.toLowerCase().includes('sort');
      const data = XLSX.utils.sheet_to_json(ws, { defval:'', range:6 });

      for (const row of data) {
        const code = String(row['Code article']||row['Code']||'').trim();
        const libelle = String(row['Désignation article']||row['Désignation']||row['Article']||'').trim();
        if (!code && !libelle) continue;
        const premVal = String(code||libelle).toUpperCase();
        if (premVal.includes('TOTAL') || premVal.includes('CODE')) continue;

        const qte  = num(row['Quantité entrée']||row['Quantité sortie']||row['Quantité']||row['Quantite']||0);
        if (!qte) continue;

        const dateVal = row['Date entrée']||row['Date sortie']||row['Date'];
        const date = parseDate(dateVal) || new Date();
        const motif  = String(row['Fournisseur / Motif']||row['Motif sortie']||row['Motif']||'Import Excel').trim();

        try {
          const { rows: art } = await pool.query(
            `SELECT id FROM stocks_articles WHERE code=$1 OR LOWER(libelle)=LOWER($2) LIMIT 1`,
            [code, libelle]
          );
          if (!art[0]) { erreurs.push(`Article introuvable: ${code||libelle}`); continue; }

          await pool.query(
            `INSERT INTO stocks_mouvements (article_id, type_mouvement, quantite, date_mouvement, motif, saisi_par_id)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [art[0].id, isSortie?'sortie':'entree', qte, date, motif, req.user.id]
          );
          importes++;
        } catch(e) { erreurs.push(`${code||libelle}: ${e.message}`); }
      }
    }

    await pool.query(
      `INSERT INTO import_historique (type_import, nom_fichier, lignes_importees, statut, importe_par_id)
       VALUES ('stocks',$1,$2,'success',$3)`,
      [req.file.originalname, importes, req.user.id]
    ).catch(()=>{});

    res.json({ message:`Import stocks réussi — ${importes} mouvement(s) importé(s)`, importes, erreurs });
  } catch(err) {
    console.error('[IMPORT STK]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/import/tresorerie
router.post('/tresorerie', auth, upload.single('fichier'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Fichier manquant' });
    const wb = XLSX.read(req.file.buffer, { type:'buffer', cellDates:true });

    const sheetName = wb.SheetNames.find(n=>n.toLowerCase().includes('brouillard')) || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { defval:'', range:6 });

    let importes = 0, erreurs = [];

    for (const row of data) {
      const compteNom = String(row['Compte']||'').trim();
      const libelle   = String(row['Libellé']||row['Libelle']||'').trim();
      const sensRaw   = String(row['Sens']||row['SENS']||'').trim().toUpperCase();
      if (!compteNom || !sensRaw) continue;
      if (compteNom.toUpperCase().includes('TOTAL') || compteNom.toUpperCase().includes('SOLDE')) continue;

      const montant = num(row['Montant (FCFA)']||row['Montant']||0);
      if (!montant) continue;

      const sens  = sensRaw === 'ENTREE' || sensRaw === 'CRÉDIT' || sensRaw === 'CREDIT' ? 'credit' : 'debit';
      const dateVal = row['Date'];
      const date  = parseDate(dateVal) || new Date();
      const nature = String(row['Nature opération']||row['Nature']||'import_excel').trim();

      try {
        // Chercher le compte par code ou libelle
        // Mapping codes modèle → codes réels base
        const mappingComptes = {
          'CAISSE_DEFALE': 'CAISSE_DEF',
          'CAISSE_DIVERS': 'CAISSE_LOM',
          'BOA_TOGO':      'BOA_TOGO',
          'BSIC_TOGO':     'BSIC_TOGO',
          'BATG_TOGO':     'BATG_TOGO',
        };
        const codeReel = mappingComptes[compteNom] || compteNom;
        const { rows: cpt } = await pool.query(
          `SELECT id FROM comptes_tresorerie
           WHERE code=$1 OR code ILIKE $2 OR libelle ILIKE $2 LIMIT 1`,
          [codeReel, `%${compteNom.replace('_',' ')}%`]
        );
        if (!cpt[0]) { erreurs.push(`Compte introuvable: ${compteNom}`); continue; }

        await pool.query(
          `INSERT INTO tresorerie_mouvements (compte_id, sens, montant_fcfa, date_mouvement, description, type_operation, saisi_par_id)
           VALUES ($1,$2,$3,$4,$5,'import_excel',$6)`,
          [cpt[0].id, sens, montant, date, libelle||'Import Excel', req.user.id]
        );
        importes++;
      } catch(e) { erreurs.push(`${compteNom}: ${e.message}`); }
    }

    // Feuille crédits si présente
    const wsCredits = wb.Sheets['Gestion_Credits'];
    if (wsCredits) {
      const credData = XLSX.utils.sheet_to_json(wsCredits, { defval:'', range:6 });
      for (const row of credData) {
        const libelle = String(row['Libellé']||row['Libelle']||'').trim();
        const cat     = String(row['Catégorie']||row['Categorie']||'autre_credit').trim();
        const montant = num(row['Montant (FCFA)']||0);
        if (!libelle || !montant) continue;
        if (libelle.toUpperCase().includes('TOTAL')) continue;

        const benef   = String(row['Bénéficiaire']||'').trim();
        const dateVal = row['Date crédit']||row['Date'];
        const dateC   = parseDate(dateVal) || new Date();
        const dateE   = parseDate(row['Date échéance']||row['Date echeance']);

        try {
          await pool.query(
            `INSERT INTO credits (categorie, libelle, montant_fcfa, date_credit, date_echeance, beneficiaire, saisi_par_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [cat, libelle, montant, dateC, dateE||null, benef, req.user.id]
          );
          importes++;
        } catch(e) { erreurs.push(`Crédit ${libelle}: ${e.message}`); }
      }
    }

    await pool.query(
      `INSERT INTO import_historique (type_import, nom_fichier, lignes_importees, statut, importe_par_id)
       VALUES ('tresorerie',$1,$2,'success',$3)`,
      [req.file.originalname, importes, req.user.id]
    ).catch(()=>{});

    res.json({ message:`Import trésorerie réussi — ${importes} ligne(s) importée(s)`, importes, erreurs });
  } catch(err) {
    console.error('[IMPORT TRES]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/import/historique
router.get('/historique', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT h.*, u.nom_complet AS importe_par_nom
       FROM import_historique h
       LEFT JOIN utilisateurs u ON u.id=h.importe_par_id
       ORDER BY h.created_at DESC LIMIT 50`
    ).catch(()=>({rows:[]}));
    res.json(rows);
  } catch { res.json([]); }
});

// Route ancienne compatibilité
router.post('/excel', auth, upload.single('fichier'), async (req, res) => {
  const type = req.body?.type;
  if (type === 'production') return router.handle({...req, url:'/production'}, res, ()=>{});
  res.status(400).json({ message: 'Utilisez /api/import/production, /api/import/stocks ou /api/import/tresorerie' });
});

module.exports = router;
