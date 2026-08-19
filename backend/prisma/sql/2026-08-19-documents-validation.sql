-- Migration manuelle — ERP AGEROUTE — 19/08/2026
-- Objet : circuit de validation des pièces justificatives d'un décompte.
--
-- Règle métier : l'ENTREPRISE dépose les pièces, la MISSION et la DIRECTION
-- TECHNIQUE les valident — ou les retournent avec un motif. Sans état par
-- pièce, un dossier « complet » ne disait rien de la recevabilité des
-- justificatifs : la seule information disponible était leur présence.
--
-- ⚠️ NOMMAGE : camelCase entre guillemets — c'est ce que Prisma attend.
--
-- ⚠️ MODE D'EMPLOI (§3.1 AGENTS.md) :
--   1. pg_dump -Fc avant toute opération de schéma ;
--   2. appliquer via psql — JAMAIS `prisma db push` ;
--   3. le client Prisma se régénère au build.
--
-- Additive et idempotente : les pièces déjà déposées prennent l'état DEPOSE,
-- ce qui correspond exactement à leur situation réelle.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS "statutValidation" TEXT NOT NULL DEFAULT 'DEPOSE';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS "valideParId"     TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS "valideAt"        TIMESTAMP(3);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS "motifRetour"     TEXT;

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_statut_validation_ck;
ALTER TABLE documents ADD CONSTRAINT documents_statut_validation_ck
  CHECK ("statutValidation" IN ('DEPOSE','VALIDE','RETOURNE'));

CREATE INDEX IF NOT EXISTS documents_decompte_statut_idx
  ON documents ("decompteId", "statutValidation");

COMMENT ON COLUMN documents."statutValidation" IS 'DEPOSE (par l''entreprise) | VALIDE (Mission/Technique) | RETOURNE (à corriger)';
COMMENT ON COLUMN documents."motifRetour" IS 'Motif obligatoire lorsqu''une pièce est retournée à l''entreprise';
