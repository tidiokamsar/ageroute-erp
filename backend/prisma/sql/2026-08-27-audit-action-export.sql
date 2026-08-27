-- Migration manuelle — ERP AGEROUTE — 27/08/2026
-- Objet : valeur EXPORT de l'enum AuditAction — la génération de PDF
-- (dossiers complets, PDF officiels) était journalisée « UPDATE », ce qui
-- faussait la piste d'audit : un téléchargement apparaissait comme une
-- modification d'entité (constat de la revue du 27/08/2026).
--
-- ⚠️ MODE D'EMPLOI (§3.1 / §5.5 AGENTS.md) :
--   1. pg_dump -Fc avant toute opération ;
--   2. psql uniquement — JAMAIS prisma db push ;
--   3. la valeur est ajoutée SANS perte : les entrées existantes « UPDATE »
--      restent lisibles ; seules les NOUVELLES générations portent EXPORT.
--      (La réécriture rétroactive des faux UPDATE n'est pas souhaitable :
--      on ne réécrit pas l'historique d'audit.)

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXPORT';
