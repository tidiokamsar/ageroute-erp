-- Migration manuelle — ERP AGEROUTE — 18/08/2026
-- Objet : registre des règles de gestion paramétrables (A1-A10).
-- Référence : PLAN-DEV-PARAMETRAGE-A1-A10.md §1.1
--
-- ⚠️ MODE D'EMPLOI (§3.1 / §5.5 AGENTS.md) :
--   1. pg_dump -Fc avant toute opération de schéma ;
--   2. appliquer via psql — JAMAIS `prisma db push` ;
--   3. le client Prisma se régénère au build (schéma déjà à jour).
--
-- Ces tables ne changent AUCUN comportement tant qu'elles sont vides :
-- le moteur (lib/regles.ts) retombe sur les valeurs par défaut = code actuel.
--
-- ⚠️ NOMMAGE DES COLONNES — camelCase entre guillemets, PAS snake_case.
-- Les modèles Prisma RegleGestion / RegleGestionHistorique ne portent pas de
-- @map sur leurs champs : Prisma interroge donc "porteeId", "dateEffet", etc.
-- Une première version de ce fichier créait portee_id / date_effet ; toute
-- lecture échouait alors par « column "porteeId" does not exist », ce qui
-- cassait chargerRegles() — donc les décomptes, le circuit financier, la
-- conformité et les circuits de rôles. Corrigé le 18/08/2026 après incident.

CREATE TABLE IF NOT EXISTS regle_gestion (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cle            TEXT NOT NULL,
  categorie      TEXT NOT NULL,
  libelle        TEXT NOT NULL,
  description    TEXT,
  type           TEXT NOT NULL,
  options        JSONB,
  portee         TEXT NOT NULL DEFAULT 'GLOBAL',
  "porteeId"     TEXT NOT NULL DEFAULT '',
  valeur         TEXT NOT NULL,
  "valeurDefaut" TEXT NOT NULL,
  "dateEffet"    TIMESTAMP(3) NOT NULL DEFAULT now(),
  statut         TEXT NOT NULL DEFAULT 'BROUILLON',
  "saisiPar"     UUID,
  "validePar"    UUID,
  "valideAt"     TIMESTAMP(3),
  motif          TEXT NOT NULL DEFAULT '',
  version        INT NOT NULL DEFAULT 1,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT regle_gestion_uniq UNIQUE (cle, portee, "porteeId", "dateEffet", version),
  CONSTRAINT regle_gestion_portee_ck CHECK (portee IN ('GLOBAL','BAILLEUR','TYPE_MARCHE','MARCHE')),
  CONSTRAINT regle_gestion_statut_ck CHECK (statut IN ('BROUILLON','VALIDE','ARCHIVE'))
);

-- Rattrapage idempotent : bases ayant reçu la première version en snake_case.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'regle_gestion' AND column_name = 'portee_id') THEN
    ALTER TABLE regle_gestion RENAME COLUMN portee_id     TO "porteeId";
    ALTER TABLE regle_gestion RENAME COLUMN valeur_defaut TO "valeurDefaut";
    ALTER TABLE regle_gestion RENAME COLUMN date_effet    TO "dateEffet";
    ALTER TABLE regle_gestion RENAME COLUMN saisi_par     TO "saisiPar";
    ALTER TABLE regle_gestion RENAME COLUMN valide_par    TO "validePar";
    ALTER TABLE regle_gestion RENAME COLUMN valide_at     TO "valideAt";
    ALTER TABLE regle_gestion RENAME COLUMN created_at    TO "createdAt";
    ALTER TABLE regle_gestion RENAME COLUMN updated_at    TO "updatedAt";
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS regle_gestion_resolution_idx
  ON regle_gestion (cle, portee, "porteeId", "dateEffet" DESC);

CREATE INDEX IF NOT EXISTS regle_gestion_statut_idx ON regle_gestion (statut);

-- Historique immuable (append-only) — pièce d'audit de chaque changement.
CREATE TABLE IF NOT EXISTS regle_gestion_historique (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "regleId"   UUID NOT NULL,
  cle         TEXT NOT NULL,
  ancienne    TEXT,
  nouvelle    TEXT NOT NULL,
  "dateEffet" TIMESTAMP(3) NOT NULL,
  "saisiPar"  UUID NOT NULL,
  "validePar" UUID,
  motif       TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'regle_gestion_historique' AND column_name = 'regle_id') THEN
    ALTER TABLE regle_gestion_historique RENAME COLUMN regle_id   TO "regleId";
    ALTER TABLE regle_gestion_historique RENAME COLUMN date_effet TO "dateEffet";
    ALTER TABLE regle_gestion_historique RENAME COLUMN saisi_par  TO "saisiPar";
    ALTER TABLE regle_gestion_historique RENAME COLUMN valide_par TO "validePar";
    ALTER TABLE regle_gestion_historique RENAME COLUMN created_at TO "createdAt";
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS regle_gestion_histo_cle_idx ON regle_gestion_historique (cle);
CREATE INDEX IF NOT EXISTS regle_gestion_histo_regle_idx ON regle_gestion_historique ("regleId");
