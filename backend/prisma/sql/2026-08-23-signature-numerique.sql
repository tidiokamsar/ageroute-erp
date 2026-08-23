-- Module signature-numerique — lot L1 (laboratoire), 23/08/2026
--
-- Décision : prestataire, TSA, validation et ancres de confiance sont
-- CONFIGURABLES DANS L'ADMINISTRATION (Paramétrage → Signature électronique),
-- jamais figés dans le code. Les clés vivent dans parametres_metier, catégorie
-- SIGNATURE ; les SECRETS (mot de passe, clé client mTLS) restent dans
-- l'environnement du conteneur — jamais en base, jamais dans Git.
--
-- Garde-fous (cf. lib/signature/configuration.ts) : SIG_MODE = disabled par
-- défaut ; le mode laboratory exige SIGNATURE_LAB_AUTORISE=oui dans
-- l'environnement ; le mode provider exige en plus des ancres de confiance et
-- SIGNATURE_PRODUCTION_AUTORISEE=oui — qui ne doit PAS être posé tant que la
-- porte NO_GO_SIGNATURE_PRODUCTION est maintenue.
--
-- Additif, idempotent. Colonnes en camelCase quoté (modèles sans @map).

INSERT INTO parametres_metier (id, cle, valeur, type, categorie, libelle, "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'SIG_MODE',                 'disabled',   'STRING', 'SIGNATURE', 'Mode de signature : disabled | laboratory | provider', now(), now()),
  (gen_random_uuid()::text, 'SIG_PRESTATAIRE_TYPE',     'simule',     'STRING', 'SIGNATURE', 'Prestataire : simule | signserver', now(), now()),
  (gen_random_uuid()::text, 'SIG_PRESTATAIRE_URL',      '',           'STRING', 'SIGNATURE', 'URL du prestataire de signature (ex. http://signserver:8080)', now(), now()),
  (gen_random_uuid()::text, 'SIG_PRESTATAIRE_WORKER',   'PDFSignerLab','STRING','SIGNATURE', 'Nom du worker de signature PDF chez le prestataire', now(), now()),
  (gen_random_uuid()::text, 'SIG_PRESTATAIRE_AUTH',     'aucune',     'STRING', 'SIGNATURE', 'Authentification vers le prestataire : aucune | basic | mtls (secrets en environnement)', now(), now()),
  (gen_random_uuid()::text, 'SIG_TSA_URL',              '',           'STRING', 'SIGNATURE', 'URL de l''autorité d''horodatage RFC 3161 (utilisée par le prestataire)', now(), now()),
  (gen_random_uuid()::text, 'SIG_DSS_URL',              '',           'STRING', 'SIGNATURE', 'URL du service de validation DSS (ex. http://dss:8080/dss-webapp)', now(), now()),
  (gen_random_uuid()::text, 'SIG_NIVEAU_PADES',         'B',          'STRING', 'SIGNATURE', 'Niveau PAdES demandé : B | T | LT | LTA', now(), now()),
  (gen_random_uuid()::text, 'SIG_ANCRES_CONFIANCE',     '',           'STRING', 'SIGNATURE', 'Certificats racine de confiance (PEM, concaténés) — laboratoire ou prestataire agréé', now(), now()),
  (gen_random_uuid()::text, 'SIG_FILIGRANE_TEXTE',      'SIMULATION — SANS VALEUR JURIDIQUE', 'STRING', 'SIGNATURE', 'Filigrane apposé sur tout document signé hors mode provider', now(), now())
ON CONFLICT (cle) DO NOTHING;

-- Documents finalisés et signés : le PDF gelé, ses empreintes, le prestataire,
-- le niveau obtenu et le rapport de validation. Le PDF lui-même porte les
-- preuves (PAdES) ; cette table n'est qu'une copie d'exploitation.
CREATE TABLE IF NOT EXISTS sig_documents_finalises (
  id                    TEXT NOT NULL,
  "decompteId"          TEXT NOT NULL,
  reference             TEXT NOT NULL,
  "cheminFichier"       TEXT NOT NULL,
  "sha256Source"        TEXT NOT NULL,
  "sha256Signe"         TEXT NOT NULL,
  mode                  TEXT NOT NULL,
  prestataire           TEXT NOT NULL,
  "niveauPades"         TEXT NOT NULL,
  filigrane             BOOLEAN NOT NULL DEFAULT true,
  "tsaUrl"              TEXT,
  "validationIndication" TEXT NOT NULL DEFAULT 'NON_VERIFIE',
  "rapportValidation"   JSONB,
  "signeParId"          TEXT NOT NULL,
  "signeParEmail"       TEXT NOT NULL,
  "signeParRole"        TEXT NOT NULL,
  "signeParQualite"     TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sig_documents_finalises_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS "sig_documents_finalises_decompteId_idx" ON sig_documents_finalises ("decompteId");
