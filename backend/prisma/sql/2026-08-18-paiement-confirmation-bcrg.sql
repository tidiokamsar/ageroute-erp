-- Migration manuelle — ERP AGEROUTE — 18/08/2026
-- Objet : F10 — confirmation bancaire BCRG sur les paiements + F11 solde payé
--
-- ⚠️ MODE D'EMPLOI (§3.1 / §5.5 AGENTS.md) :
--   1. pg_dump -Fc avant toute opération de schéma ;
--   2. appliquer via psql — JAMAIS `prisma db push` ;
--   3. le client Prisma se régénère au build.

-- F10 : le paiement est préparé par la DAF, confirmé par la BCRG
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS "montantReelGnf" BIGINT;
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS "dateReelleTransfert" TIMESTAMP(3);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS "confirmePar" TEXT;
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS "confirmeAt" TIMESTAMP(3);

COMMENT ON COLUMN paiements."montantReelGnf" IS 'F10 — montant réel transféré par la BCRG (peut différer du montant ordonnancé)';
COMMENT ON COLUMN paiements."dateReelleTransfert" IS 'F10 — date réelle du virement bancaire (confirmée par la BCRG)';
COMMENT ON COLUMN paiements."confirmePar" IS 'F10 — email de l\'agent BCRG qui confirme le virement';
COMMENT ON COLUMN paiements."confirmeAt" IS 'F10 — horodatage de la confirmation bancaire';
