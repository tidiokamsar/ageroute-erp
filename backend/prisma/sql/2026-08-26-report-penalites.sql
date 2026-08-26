-- Migration manuelle — ERP AGEROUTE — 26/08/2026
-- Objet : report de l'excédent de pénalités sur le décompte suivant
-- (décision DAF du 26/08/2026, règles A4 : RG_NET_PLANCHER_ZERO = true et
-- RG_REPORT_PENALITES = true — le net est borné à zéro et la part de
-- pénalités non absorbée est reportée).
--
-- ⚠️ MODE D'EMPLOI (§3.1 / §5.5 AGENTS.md) :
--   1. pg_dump -Fc avant toute opération de schéma ;
--   2. appliquer ce fichier via psql — JAMAIS `prisma db push` ;
--   3. le client Prisma est régénéré au build du backend (schéma déjà à jour).
--
-- Colonne Prisma : Decompte.penalitesReporteesGnf (BigInt, défaut 0).
-- Sans cette colonne, le client régénéré échoue à chaque lecture du modèle.

ALTER TABLE decomptes
  ADD COLUMN IF NOT EXISTS "penalitesReporteesGnf" BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN decomptes."penalitesReporteesGnf" IS
  'A4 — excédent de pénalités reporté sur le décompte suivant du même marché (décision DAF 26/08/2026) ; consommé au calcul du décompte suivant';
