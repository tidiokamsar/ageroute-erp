-- Rôle DSF — Direction de la Structuration Financière
--
-- Décision du 20/08/2026 : Abdoulaye DABO n'est pas Directeur Général mais
-- Directeur de la Structuration Financière. Aucun des 14 rôles existants ne
-- correspondait. Le rôle est créé HORS CIRCUIT : il n'est ajouté à aucune des
-- 11 définitions de workflow et ne signe aucun décompte. Le circuit de
-- validation en service n'est pas modifié.
--
-- ⚠️ OPÉRATION NON RÉVERSIBLE. PostgreSQL ne propose pas de « DROP VALUE » sur
-- un type énuméré : retirer 'DSF' imposerait de recréer le type "Role" et de
-- réécrire toutes les colonnes qui l'utilisent. Sauvegarde pg_dump -Fc
-- préalable obligatoire, avec copie hors du serveur.
--
-- Idempotent par `IF NOT EXISTS` (PostgreSQL 10+). La base tourne en 16.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DSF';
