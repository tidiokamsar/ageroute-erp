-- Migration manuelle — ERP AGEROUTE — 19/08/2026
-- Objet : identité et signature des agents, pour les documents officiels.
--
-- POURQUOI
-- Les documents imprimés portaient des cartouches « Nom & Prénom : ……… »
-- vides, même sur une pièce validée, et l'historique des validations affichait
-- l'ADRESSE E-MAIL du valideur faute de mieux. Un décompte est une pièce
-- comptable : elle doit dire qui a validé, à quel titre, et porter sa
-- signature.
--
-- `nomComplet` existe déjà et reste la source d'affichage courante ; nom et
-- prénom le complètent pour les mentions officielles, où l'usage sépare les
-- deux. `fonction` porte le titre exact (« Chef de Mission de Contrôle »),
-- distinct du rôle applicatif.
--
-- `signatureUrl` référence un fichier déposé via /api/uploads — un spécimen
-- de signature. Il ne remplace pas le cachet cryptographique du module
-- Signature : il le complète, l'un pour ce qui se voit sur le papier, l'autre
-- pour ce qui est opposable.
--
-- ⚠️ MODE D'EMPLOI (§3.1 AGENTS.md) :
--   1. pg_dump -Fc avant toute opération de schéma ;
--   2. appliquer via psql — JAMAIS `prisma db push` ;
--   3. le client Prisma se régénère au build.
--
-- Additive et idempotente : aucune colonne existante n'est touchée.

ALTER TABLE users ADD COLUMN IF NOT EXISTS "nom"          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "prenom"       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "fonction"     TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "signatureUrl" TEXT;

COMMENT ON COLUMN users."nom"          IS 'Nom de famille, pour les mentions officielles des documents';
COMMENT ON COLUMN users."prenom"       IS 'Prénom, pour les mentions officielles des documents';
COMMENT ON COLUMN users."fonction"     IS 'Titre exact porté sur les documents (distinct du rôle applicatif)';
COMMENT ON COLUMN users."signatureUrl" IS 'Spécimen de signature déposé via /api/uploads — complète le cachet cryptographique, ne le remplace pas';

-- Reprise : décomposer nomComplet quand nom et prénom sont vides. Le premier
-- mot devient le prénom, le reste le nom — convention courante des comptes
-- existants (« Mohamed Keita »). Les cas particuliers se corrigent à l'écran.
UPDATE users
SET "prenom" = split_part("nomComplet", ' ', 1),
    "nom"    = NULLIF(regexp_replace("nomComplet", '^\S+\s*', ''), '')
WHERE "prenom" IS NULL AND "nom" IS NULL AND "nomComplet" IS NOT NULL;
