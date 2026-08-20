-- Affectation d'un agent à un PROJET — périmètre de visibilité
--
-- Décision du 20/08/2026 : les coordinateurs de projet (TECHNIQUE, UGP) et les
-- chefs de Mission sont affectés « aux projets ou aux marchés ». L'affectation
-- par marché existait déjà (marche_affectations) ; celle par projet manquait.
--
-- Pourquoi une table et non une simple sélection dans l'écran : un marché ajouté
-- plus tard à un projet doit être couvert AUTOMATIQUEMENT. Avec un stockage par
-- marché uniquement, l'administrateur devrait réaffecter à chaque nouveau
-- marché — et l'oubli se traduirait par un coordinateur qui ne voit pas son
-- propre marché, sans message d'erreur.
--
-- Périmètre effectif = marchés affectés directement ∪ marchés des projets affectés.
--
-- ⚠️ COLONNES EN camelCase QUOTÉ. Les modèles Prisma de ce projet n'ont pas de
-- `@map` : Prisma interroge "userId" et "projetId". Une table en snake_case
-- s'appliquerait sans erreur puis TOUTE lecture échouerait.
-- Structure calquée sur marche_affectations, vérifiée sur la base.
--
-- Additif et idempotent. Aucune donnée existante n'est touchée.

CREATE TABLE IF NOT EXISTS projet_affectations (
  id          TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "projetId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT projet_affectations_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS "projet_affectations_userId_projetId_key"
  ON projet_affectations ("userId", "projetId");

CREATE INDEX IF NOT EXISTS "projet_affectations_userId_idx"
  ON projet_affectations ("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projet_affectations_userId_fkey'
  ) THEN
    ALTER TABLE projet_affectations
      ADD CONSTRAINT "projet_affectations_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projet_affectations_projetId_fkey'
  ) THEN
    ALTER TABLE projet_affectations
      ADD CONSTRAINT "projet_affectations_projetId_fkey"
      FOREIGN KEY ("projetId") REFERENCES projets(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;
