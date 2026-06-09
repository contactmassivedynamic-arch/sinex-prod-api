-- Créer la table credits si elle n'existe pas
CREATE TABLE IF NOT EXISTS credits (
  id              SERIAL PRIMARY KEY,
  categorie       VARCHAR(50) NOT NULL DEFAULT 'autre_credit',
  libelle         VARCHAR(200) NOT NULL,
  montant_fcfa    NUMERIC(15,2) NOT NULL DEFAULT 0,
  date_echeance   DATE,
  date_credit     DATE DEFAULT CURRENT_DATE,
  beneficiaire    VARCHAR(200),
  description     TEXT,
  statut          VARCHAR(20) DEFAULT 'actif',
  saisi_par_id    INTEGER,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credits_categorie ON credits(categorie);
CREATE INDEX IF NOT EXISTS idx_credits_statut ON credits(statut);
