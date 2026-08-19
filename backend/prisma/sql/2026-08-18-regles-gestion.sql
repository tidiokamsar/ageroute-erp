-- Migration manuelle — ERP AGEROUTE — 18/08/2026 (corrigée 19/08)
-- Objet : registre des règles de gestion paramétrables (A1-A10).
--
-- ⚠️ NOMMAGE : toutes les colonnes sont en camelCase entre guillemets —
-- c'est ce que Prisma attend (valeurDefaut, pas valeur_defaut).
--
-- ⚠️ MODE D'EMPLOI (§3.1 / §5.5 AGENTS.md) :
--   1. pg_dump -Fc avant toute opération de schéma ;
--   2. appliquer via psql — JAMAIS `prisma db push` ;
--   3. le client Prisma se régénère au build (schéma déjà à jour).
--
-- Idempotent : si la table existe déjà (avec les bons noms), rien ne change.
-- Si elle existe avec des noms snake_case (version antérieure), les colonnes
-- sont renommées.

-- ─── Table principale ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS regle_gestion (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cle             TEXT NOT NULL,
  categorie       TEXT NOT NULL,
  libelle         TEXT NOT NULL,
  description     TEXT,
  type            TEXT NOT NULL,
  options         JSONB,
  portee          TEXT NOT NULL DEFAULT 'GLOBAL',
  "porteeId"      TEXT NOT NULL DEFAULT '',
  valeur          TEXT NOT NULL,
  "valeurDefaut"  TEXT NOT NULL,
  "dateEffet"     TIMESTAMP(3) NOT NULL DEFAULT now(),
  statut          TEXT NOT NULL DEFAULT 'BROUILLON',
  "saisiPar"      UUID,
  "validePar"     UUID,
  "valideAt"      TIMESTAMP(3),
  motif           TEXT NOT NULL DEFAULT '',
  version         INT NOT NULL DEFAULT 1,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT now()
);

-- Renommer les colonnes si la table existait avec des noms snake_case
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'regle_gestion' AND column_name = 'portee_id') THEN
    ALTER TABLE regle_gestion RENAME COLUMN portee_id TO "porteeId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'regle_gestion' AND column_name = 'valeur_defaut') THEN
    ALTER TABLE regle_gestion RENAME COLUMN valeur_defaut TO "valeurDefaut";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'regle_gestion' AND column_name = 'date_effet') THEN
    ALTER TABLE regle_gestion RENAME COLUMN date_effet TO "dateEffet";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'regle_gestion' AND column_name = 'saisi_par') THEN
    ALTER TABLE regle_gestion RENAME COLUMN saisi_par TO "saisiPar";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'regle_gestion' AND column_name = 'valide_par') THEN
    ALTER TABLE regle_gestion RENAME COLUMN valide_par TO "validePar";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'regle_gestion' AND column_name = 'valide_at') THEN
    ALTER TABLE regle_gestion RENAME COLUMN valide_at TO "valideAt";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'regle_gestion' AND column_name = 'created_at') THEN
    ALTER TABLE regle_gestion RENAME COLUMN created_at TO "createdAt";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'regle_gestion' AND column_name = 'updated_at') THEN
    ALTER TABLE regle_gestion RENAME COLUMN updated_at TO "updatedAt";
  END IF;
END $$;

-- Contraintes (recréées car les anciennes référencent les anciens noms)
ALTER TABLE regle_gestion DROP CONSTRAINT IF EXISTS regle_gestion_uniq;
ALTER TABLE regle_gestion ADD CONSTRAINT regle_gestion_uniq
  UNIQUE (cle, portee, "porteeId", "dateEffet", version);

ALTER TABLE regle_gestion DROP CONSTRAINT IF EXISTS regle_gestion_portee_ck;
ALTER TABLE regle_gestion ADD CONSTRAINT regle_gestion_portee_ck
  CHECK (portee IN ('GLOBAL','BAILLEUR','TYPE_MARCHE','MARCHE'));

ALTER TABLE regle_gestion DROP CONSTRAINT IF EXISTS regle_gestion_statut_ck;
ALTER TABLE regle_gestion ADD CONSTRAINT regle_gestion_statut_ck
  CHECK (statut IN ('BROUILLON','SOUMISE','APPROUVEE','REJETEE','GELEE','ARCHIVE'));

-- Index (avec les bons noms de colonnes)
DROP INDEX IF EXISTS regle_gestion_resolution_idx;
CREATE INDEX regle_gestion_resolution_idx
  ON regle_gestion (cle, portee, "porteeId", "dateEffet" DESC);

DROP INDEX IF EXISTS regle_gestion_statut_idx;
CREATE INDEX regle_gestion_statut_idx ON regle_gestion (statut);

DROP INDEX IF EXISTS regle_gestion_statut_portee_idx;
CREATE INDEX regle_gestion_statut_portee_idx
  ON regle_gestion (statut, portee, "porteeId");

-- ─── Historique immuable (append-only) ────────────────────────────────────────
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

-- Renommage si nécessaire
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'regle_gestion_historique' AND column_name = 'regle_id') THEN
    ALTER TABLE regle_gestion_historique RENAME COLUMN regle_id TO "regleId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'regle_gestion_historique' AND column_name = 'date_effet') THEN
    ALTER TABLE regle_gestion_historique RENAME COLUMN date_effet TO "dateEffet";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'regle_gestion_historique' AND column_name = 'saisi_par') THEN
    ALTER TABLE regle_gestion_historique RENAME COLUMN saisi_par TO "saisiPar";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'regle_gestion_historique' AND column_name = 'valide_par') THEN
    ALTER TABLE regle_gestion_historique RENAME COLUMN valide_par TO "validePar";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'regle_gestion_historique' AND column_name = 'created_at') THEN
    ALTER TABLE regle_gestion_historique RENAME COLUMN created_at TO "createdAt";
  END IF;
END $$;

DROP INDEX IF EXISTS regle_gestion_histo_cle_idx;
CREATE INDEX regle_gestion_histo_cle_idx ON regle_gestion_historique (cle);

DROP INDEX IF EXISTS regle_gestion_histo_regle_idx;
CREATE INDEX regle_gestion_histo_regle_idx ON regle_gestion_historique ("regleId");

-- Contrainte de clé étrangère
ALTER TABLE regle_gestion_historique DROP CONSTRAINT IF EXISTS regle_gestion_histo_fk;
ALTER TABLE regle_gestion_historique ADD CONSTRAINT regle_gestion_histo_fk
  FOREIGN KEY ("regleId") REFERENCES regle_gestion(id) ON DELETE CASCADE;
