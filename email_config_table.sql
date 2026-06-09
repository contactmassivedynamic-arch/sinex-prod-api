CREATE TABLE IF NOT EXISTS config_email_rapports (
  id                     INTEGER PRIMARY KEY DEFAULT 1,
  smtp_host              VARCHAR(200) DEFAULT 'smtp.gmail.com',
  smtp_port              VARCHAR(10)  DEFAULT '587',
  smtp_user              VARCHAR(200),
  smtp_pass              VARCHAR(200),
  destinataires          JSONB        DEFAULT '["dg"]',
  emails_supplementaires TEXT         DEFAULT '',
  objet_email            VARCHAR(300) DEFAULT 'Rapport {type} {mois} — SINEX SA',
  message_email          TEXT         DEFAULT 'Bonjour,\n\nVeuillez trouver ci-joint le rapport.\n\nCordialement,\n{dg}',
  actif                  BOOLEAN      DEFAULT false,
  frequence              VARCHAR(50)  DEFAULT 'mensuel',
  created_at             TIMESTAMP    DEFAULT NOW()
);
