CREATE TABLE IF NOT EXISTS import_historique (
  id              SERIAL PRIMARY KEY,
  type_import     VARCHAR(50) NOT NULL,
  nom_fichier     VARCHAR(300),
  lignes_importees INTEGER DEFAULT 0,
  statut          VARCHAR(20) DEFAULT 'success',
  importe_par_id  INTEGER,
  created_at      TIMESTAMP DEFAULT NOW()
);
