require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Prix HT en FCFA — vos valeurs + estimations marché Afrique de l'Ouest
const PRIX = [
  // Classe 1 — Consommables production
  { code:'PREF_32G',    prix:53      }, // Préformes 32g
  { code:'PREF_17G',    prix:28      }, // Préformes 17g
  { code:'BOUCH_VERT',  prix:5       }, // Bouchons vert
  { code:'ETI_15L',     prix:9       }, // Étiquettes 1,5L
  { code:'ETI_05L',     prix:6       }, // Étiquettes 0,5L
  { code:'ETI_1L',      prix:7       }, // Étiquettes 1L (estimé entre 0,5L et 1,5L)
  { code:'CTN_15L',     prix:233     }, // Cartons 1,5L
  { code:'CTN_05L',     prix:200     }, // Cartons 0,5L
  { code:'ENCRE',       prix:55085   }, // Encre
  { code:'MAKEUP',      prix:24576   }, // Make-up
  { code:'NETTOYANT',   prix:23729   }, // Nettoyant
  { code:'SCOTCH',      prix:459     }, // Scotch
  { code:'FILM_FAR_05', prix:1394    }, // Films Fardeler 0,5L
  { code:'PLASTIC_NOIR',prix:850     }, // Plastic Noir (estimé ~marché local)
  { code:'FILM_FAR_15', prix:1394    }, // Films Fardeler 1,5L
  { code:'FILM_HILIO',  prix:1314    }, // Film HILIO
  { code:'PACK_SACHET', prix:24153   }, // Pack sachet d'emballage

  // Classe 2 — Consommables, EPI, Pièces, Énergie
  { code:'GASOIL',      prix:636     }, // Gasoil (par litre)
  { code:'GANTS',       prix:51      }, // Gants
  { code:'CACHE_NEZ',   prix:58      }, // Cache-nez
  { code:'CHARLOTTE',   prix:51      }, // Charlottes
  { code:'HYPOCHLOR',   prix:1780    }, // Hypochlorite de calcium
  { code:'TUBE_CHLORE', prix:3500    }, // Tube test chlore (estimé marché)
  { code:'DPD_N1',      prix:12300   }, // DPD n°1
  { code:'DPD_N4',      prix:12300   }, // DPD n°4
  { code:'ROUL_KOYO',   prix:5085    }, // Roulement KOYO
  { code:'BLACK_RUB',   prix:1483    }, // Black rubber
  { code:'WHITE_RUB',   prix:1695    }, // White rubber
  { code:'GOMME_TAM',   prix:2966    }, // Gomme tampon
  { code:'GOMME_BLC',   prix:424     }, // Gomme blanc
  { code:'TEFLON_PAG',  prix:2500    }, // Téflon pagne (estimé)
  { code:'SILICONE',    prix:2119    }, // Silicone
  { code:'SONDE',       prix:85000   }, // Sonde (estimé capteur industriel)
  { code:'ARRET_URG',   prix:25000   }, // Arrêt d'urgence (estimé)
  { code:'ROUL_608',    prix:2500    }, // Roulement 608-2Z (estimé)
  { code:'ROUL_6006',   prix:8475    }, // Roulement 6006 TRIBLOC
  { code:'DENT_PAIRE',  prix:15254   }, // Dent paire
  { code:'RACC_D10',    prix:1695    }, // Raccord DIAM10
  { code:'COUDE_D10',   prix:1695    }, // Coude DIAM10
  { code:'VICE',        prix:7500    }, // Vice
  { code:'REGLE_UV',    prix:1695    }, // Règle lampe UV
  { code:'LAMPE_UV',    prix:3390    }, // Lampe UV
  { code:'VANNE',       prix:22000   }, // Vanne
  { code:'FLOTTEUR',    prix:1695    }, // Flotteur
  { code:'ELEC_SOU',    prix:30169   }, // Électrovanne soufflage 24VDC
  { code:'ELEC_4V310_08',prix:29661  }, // Électrovanne 4V310-08
  { code:'ELEC_4V310_10',prix:29661  }, // Électrovanne 4V310-10
  { code:'ROUL_RINC',   prix:2119    }, // Rouleau de rinçage
  { code:'JOINT_RINC',  prix:424     }, // Joint torique rinceuse
  { code:'FOURCHE',     prix:4237    }, // Fourche
  { code:'TEFLON_COL',  prix:3814    }, // Téflon collant
  { code:'CONTACT_LC1', prix:5932    }, // Contacteur LC1-D3210M7
  { code:'BTN_POUS',    prix:4237    }, // Bouton poussoir
  { code:'FILTRE_50',   prix:28000   }, // Filtre 50cm
  { code:'FILTRE_25',   prix:20000   }, // Filtre 25cm
  { code:'FILTRE_CHB',  prix:15000   }, // Filtre charbon (estimé)
  { code:'FILTRE_SEP',  prix:65000   }, // Filtre séparateur OV6073
  { code:'FILTRE_AIR',  prix:35000   }, // Filtre d'air
  { code:'ELEC_KOYO',   prix:15254   }, // Électrovanne KOYO
  { code:'VANNE_ARR',   prix:18000   }, // Vanne d'arrêt
  { code:'BANDE_ETI',   prix:150000  }, // Bande étiqueteuse
  { code:'GOUSSE_FIL',  prix:12000   }, // Gousse filtre
  { code:'MEMB_RO',     prix:194915  }, // Membrane Filtre RO
  { code:'THERMOSTAT',  prix:50000   }, // Thermostat
  { code:'FILTRE_HUI',  prix:40000   }, // Filtre à huile
  { code:'ELEC_DATE',   prix:60000   }, // Électrode dateuse
  { code:'EHT_MOD',     prix:85000   }, // EHT Module
  { code:'CONN_WIFI',   prix:12000   }, // Connecteur câble WiFi
  { code:'VANNE_RO',    prix:75000   }, // Vanne traitement RO
  { code:'STATOR',      prix:45000   }, // Stator
  { code:'VERIN_DSBC',  prix:55000   }, // Vérin DSBC-40-25-PPVA-M3
  { code:'JOINT_SOUF',  prix:8000    }, // Joint souffleuse
  { code:'BOUCHNEUSE',  prix:12000   }, // Bouchneuse
  { code:'COUDE_SOUF',  prix:1695    }, // Coude souffleuse
  { code:'ELEC_YBLOC',  prix:11000   }, // Électrovanne tri bloc
  { code:'VIS_ROUL',    prix:14831   }, // Vis de support roulement
  { code:'SUPP_ROUL',   prix:4237    }, // Support roulement
  { code:'TEL_GXP',     prix:65000   }, // Téléphone GXP
  { code:'VERIN_FESTO', prix:40000   }, // Vérin Festo
  { code:'CHIFFONS',    prix:48      }, // Chiffons (par kg)
  { code:'HUILE_VID',   prix:2644    }, // Huile vidange
  { code:'FILTRE_AIR2', prix:35000   }, // Filtre à air
  { code:'ECROU_M8',    prix:25       }, // Écrou M8 (estimé)
  { code:'RONDELLE_M8', prix:15       }, // Rondelle M8 (estimé)
  { code:'RACC_LAIT',   prix:1500    }, // Raccord Té laiton (estimé)
  { code:'GOMME_NOIR',  prix:500     }, // Gomme Noir (estimé)
  { code:'COURROIE',    prix:12000   }, // Courroie (estimé industriel)
  { code:'STERIL_UV',   prix:85000   }, // Stérilisateur UV (estimé)
  { code:'TEFLON_CLS',  prix:424     }, // Téflon classique
  { code:'VANNE_KOYO2', prix:2542    }, // Vanne koyo sans bobine
  { code:'RACC_DN40',   prix:847     }, // Raccord DN40 PVC
  { code:'MANCH_DN40',  prix:1017    }, // Manchon DN40 PVC
  { code:'RACC_DN25',   prix:191     }, // Raccord Té DN25 PVC
  { code:'RESIST_CH',   prix:4237    }, // Résistances chauffantes
  { code:'HUMID_520',   prix:180000  }, // Humidimètre
  { code:'RELAIS_OMRON',prix:72450   }, // Relais OMRON
  { code:'RELAIS_SCHN', prix:65000   }, // Relais SCHNEIDER (estimé proche OMRON)
];

async function run() {
  console.log(`\n🔄 Mise à jour de ${PRIX.length} prix HT...\n`);
  let ok = 0; let notFound = 0;

  for (const { code, prix } of PRIX) {
    const { rowCount } = await pool.query(
      `UPDATE stocks_articles SET prix_unitaire_ht = $1 WHERE code = $2`,
      [prix, code]
    );
    if (rowCount > 0) {
      console.log(`✅ ${code} → ${prix.toLocaleString('fr-FR')} FCFA`);
      ok++;
    } else {
      console.log(`⚠️  ${code} → introuvable`);
      notFound++;
    }
  }

  console.log(`\n✅ ${ok} articles mis à jour`);
  if (notFound > 0) console.log(`⚠️  ${notFound} articles introuvables`);
  pool.end();
}

run().catch(console.error);
