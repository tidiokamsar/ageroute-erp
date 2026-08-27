-- Migration manuelle — ERP AGEROUTE — 27/08/2026
-- Objet : audit_logs.userId passe de ON DELETE SET NULL à ON DELETE RESTRICT.
--
-- Constat de la revue du 27/08/2026 : la contrainte audit_logs_userId_fkey
-- était en SET NULL (confdeltype='n'). Supprimer un compte VIDAIT l'auteur de
-- toutes ses entrées d'audit — sans erreur, sans trace, sans avertissement.
-- Un agent ayant visé des décomptes pouvait donc disparaître de la piste
-- d'audit par un seul DELETE /api/users/:id. Les autres liens sensibles
-- (workflow_actions, delegations) étaient déjà en RESTRICT ('r') : audit_logs
-- était le maillon faible.
--
-- ⚠️ MODE D'EMPLOI (§3.1 / §4 DEPLOIEMENT.md) :
--   1. pg_dump -Fc avant toute opération ;
--   2. psql uniquement — JAMAIS prisma db push ;
--   3. sans perte : aucune ligne n'est modifiée, seule la règle de suppression
--      change. Les 34 entrées déjà sans auteur (LOGIN_FAILED pour l'essentiel,
--      qui n'a légitimement pas d'auteur connu) restent telles quelles.
--
-- Effet fonctionnel : DELETE /api/users/:id renvoie 409 dès qu'une entrée
-- d'audit existe. La voie correcte reste la désactivation (PUT /:id/actif).

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS "audit_logs_userId_fkey";
ALTER TABLE audit_logs
  ADD CONSTRAINT "audit_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES users(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;
