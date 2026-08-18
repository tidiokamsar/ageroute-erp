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

CREATE TABLE IF NOT EXISTS regle_gestion (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cle           TEXT NOT NULL,
  categorie     TEXT NOT NULL,
  libelle       TEXT NOT NULL,
  description   TEXT,
  type          TEXT NOT NULL,
  options       JSONB,
  portee        TEXT NOT NULL DEFAULT 'GLOBAL',
  portee_id     TEXT NOT NULL DEFAULT '',
  valeur        TEXT NOT NULL,
  valeur_defaut TEXT NOT NULL,
  date_effet    TIMESTAMP(3) NOT NULL DEFAULT now(),
  statut        TEXT NOT NULL DEFAULT 'BROUILLON',
  saisi_par     UUID,
  valide_par    UUID,
  valide_at     TIMESTAMP(3),
  motif         TEXT NOT NULL DEFAULT '',
  version       INT NOT NULL DEFAULT 1,
  created_at    TIMESTAMP(3) NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT regle_gestion_uniq UNIQUE (cle, portee, portee_id, date_effet, version),
  CONSTRAINT regle_gestion_portee_ck CHECK (portee IN ('GLOBAL','BAILLEUR','TYPE_MARCHE','MARCHE')),
  CONSTRAINT regle_gestion_statut_ck CHECK (statut IN ('BROUILLON','VALIDE','ARCHIVE'))
);
CREATE INDEX IF NOT EXISTS regle_gestion_resolution_idx
  ON regle_gestion (cle, portee, portee_id, date_effet DESC);

CREATE INDEX IF NOT EXISTS regle_gestion_statut_idx ON regle_gestion (statut);

-- Historique immuable (append-only) — pièce d'audit de chaque changement.
CREATE TABLE IF NOT EXISTS regle_gestion_historique (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regle_id   UUID NOT NULL,
  cle        TEXT NOT NULL,
  ancienne   TEXT,
  nouvelle   TEXT NOT NULL,
  date_effet TIMESTAMP(3) NOT NULL,
  saisi_par  UUID NOT NULL,
  valide_par UUID,
  motif      TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS regle_gestion_histo_cle_idx ON regle_gestion_historique (cle);
CREATE INDEX IF NOT EXISTS regle_gestion_histo_regle_idx ON regle_gestion_historique (regle_id);
