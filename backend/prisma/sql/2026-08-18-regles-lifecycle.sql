-- Migration manuelle — ERP AGEROUTE — 18/08/2026
-- Objet : L0.2 — cycle de vie complet des règles de gestion
-- (BROUILLON → SOUMISE → APPROUVEE/REJETEE → GELEE)
--
-- ⚠️ MODE D'EMPLOI (§3.1 / §5.5 AGENTS.md) :
--   1. pg_dump -Fc avant toute opération de schéma ;
--   2. appliquer via psql — JAMAIS `prisma db push` ;
--   3. le client Prisma se régénère au build.

-- Étendre la contrainte CHECK avec les nouveaux états
ALTER TABLE regle_gestion DROP CONSTRAINT IF EXISTS regle_gestion_statut_ck;
ALTER TABLE regle_gestion ADD CONSTRAINT regle_gestion_statut_ck
  CHECK (statut IN ('BROUILLON','SOUMISE','APPROUVEE','REJETEE','GELEE','ARCHIVE'));

-- Champ motif_rejet pour les règles rejetées (motif obligatoire)
ALTER TABLE regle_gestion ADD COLUMN IF NOT EXISTS "motifRejet" TEXT;

-- Champ soumis_at pour tracer la soumission (distinct de valide_at)
ALTER TABLE regle_gestion ADD COLUMN IF NOT EXISTS "soumisAt" TIMESTAMP(3);
ALTER TABLE regle_gestion ADD COLUMN IF NOT EXISTS "soumisPar" UUID;

-- Index pour la recherche par statut + portée
CREATE INDEX IF NOT EXISTS regle_gestion_statut_portee_idx
  ON regle_gestion (statut, portee, portee_id);

-- Valeurs existantes : VALIDE → APPROUVEE (migration des données)
UPDATE regle_gestion SET statut = 'APPROUVEE' WHERE statut = 'VALIDE';

COMMENT ON COLUMN regle_gestion."motifRejet" IS 'Motif obligatoire du rejet (quatre yeux)';
COMMENT ON COLUMN regle_gestion."soumisAt" IS 'Horodatage de la soumission à validation';
COMMENT ON COLUMN regle_gestion."soumisPar" IS 'UUID du saisisseur qui a soumis la règle';
