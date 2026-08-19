-- Migration manuelle — ERP AGEROUTE — 18/08/2026 (corrigée 19/08)
-- Objet : L0.2 — cycle de vie complet des règles de gestion
--
-- ⚠️ Cette migration suppose que 2026-08-18-regles-gestion.sql a été appliquée
-- (elle crée les tables avec les bons noms camelCase et les contraintes).
--
-- ⚠️ MODE D'EMPLOI (§3.1 / §5.5 AGENTS.md) :
--   1. pg_dump -Fc avant toute opération de schéma ;
--   2. appliquer via psql — JAMAIS `prisma db push`。

-- Nouvelles colonnes pour le cycle de vie
ALTER TABLE regle_gestion ADD COLUMN IF NOT EXISTS "motifRejet" TEXT;
ALTER TABLE regle_gestion ADD COLUMN IF NOT EXISTS "soumisAt" TIMESTAMP(3);
ALTER TABLE regle_gestion ADD COLUMN IF NOT EXISTS "soumisPar" UUID;

-- La contrainte CHECK des statuts est déjà gérée par la migration 1
-- (regle-gestion.sql) qui accepte tous les états du cycle de vie.

-- Migration des données existantes : VALIDE → APPROUVEE
-- (le moteur accepte les deux pendant la transition)
UPDATE regle_gestion SET statut = 'APPROUVEE' WHERE statut = 'VALIDE';

COMMENT ON COLUMN regle_gestion."motifRejet" IS 'Motif obligatoire du rejet (quatre yeux)';
COMMENT ON COLUMN regle_gestion."soumisAt" IS 'Horodatage de la soumission à validation';
COMMENT ON COLUMN regle_gestion."soumisPar" IS 'UUID du saisisseur qui a soumis la règle';
