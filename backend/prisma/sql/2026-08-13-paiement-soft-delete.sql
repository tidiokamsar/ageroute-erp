-- Migration manuelle — ERP AGEROUTE — 13/08/2026
-- Objet : soft-delete des paiements (AGENTS.md §3.4 : « Pas de suppression
-- physique sur décomptes / paiements / audit : deletedAt »).
--
-- ⚠️ MODE D'EMPLOI (§3.1 / §5.5) :
--   1. pg_dump -Fc avant toute opération de schéma ;
--   2. appliquer ce fichier via psql — JAMAIS `prisma db push` ;
--   3. le client Prisma est régénéré au build du backend (schéma déjà à jour).
--
-- La colonne est nullable : les paiements existants restent « non supprimés ».

ALTER TABLE paiements ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "paiements_deletedAt_idx" ON paiements ("deletedAt");
