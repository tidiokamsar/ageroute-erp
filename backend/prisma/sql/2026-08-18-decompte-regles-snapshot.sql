-- Migration manuelle — ERP AGEROUTE — 18/08/2026
-- Objet : lot L1.2 — snapshot des règles de gestion par décompte.
--
-- ⚠️ MODE D'EMPLOI (§3.1 / §5.5 AGENTS.md) :
--   1. pg_dump -Fc avant toute opération de schéma ;
--   2. appliquer via psql — JAMAIS `prisma db push` ;
--   3. le client Prisma se régénère au build (schéma déjà à jour).
--
-- Colonne nullable : les décomptes existants restent « sans snapshot » ;
-- l'audit de rejeu les signale explicitement (antérieurs au mécanisme).

ALTER TABLE decomptes ADD COLUMN IF NOT EXISTS "reglesSnapshot" JSONB;

COMMENT ON COLUMN decomptes."reglesSnapshot" IS
  'L1.2 — règles effectives (A1-A7) figées au dernier calcul : { regles, methode: GLOBAL|LIGNES, dateCalcul }. Rejouabilité auditoire.';
