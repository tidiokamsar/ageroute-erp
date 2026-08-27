-- Migration manuelle — ERP AGEROUTE — 27/08/2026
-- Objet : table dédiée à la propriété des pièces téléversées (revue du
-- 27/08/2026, relais Claude : la propriété était déduite du JOURNAL d'audit —
-- une piste d'audit n'est pas un index d'autorisation).
--
-- ⚠️ MODE D'EMPLOI (§3.1 / §5.5 AGENTS.md) :
--   1. pg_dump -Fc avant toute opération ;
--   2. psql uniquement — JAMAIS prisma db push ;
--   3. les pièces déjà téléversées ne sont PAS rétro-reportées : seuls les
--      NOUVEAUX téléversements créent une ligne. Un dépôt portail utilisant
--      une pièce antérieure sera refusé jusqu'à re-téléversement — accepté,
--      la fenêtre de dépôt est courte et l'échec est explicite (403).

CREATE TABLE IF NOT EXISTS uploads (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"        TEXT NOT NULL REFERENCES users(id),
  "storedFilename" TEXT NOT NULL UNIQUE,
  "originalName"  TEXT NOT NULL,
  "mimeType"      TEXT,
  "sizeOctets"    INTEGER,
  "createdAt"     TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "uploads_userId_idx" ON uploads("userId");
COMMENT ON TABLE uploads IS 'Propriété des pièces téléversées avant rattachement (revue 27/08/2026) — remplace le comptage du journal d''audit';

-- ─────────────────────────────────────────────────────────────────────────────
-- Complément du 27/08/2026 (second relais) — deux corrections à cette migration.
--
-- 1. L'index était écrit `uploads_"userId"_idx` : un identifiant PostgreSQL ne
--    peut pas mêler une partie nue et une partie entre guillemets. La commande
--    échouait en erreur de syntaxe. Exécutée sans ON_ERROR_STOP — ce que fait
--    le runbook — l'échec passait inaperçu : la table existait, le contrôle
--    proposé (« la table uploads existe-t-elle ? ») répondait oui, et l'index
--    manquait. Corrigé ci-dessus.
--
-- 2. REPRISE DE L'HISTORIQUE. La version initiale ne reportait pas les pièces
--    déjà déposées : « un dépôt portail utilisant une pièce antérieure sera
--    refusé jusqu'à re-téléversement ». Or ce refus est un 403 « une pièce du
--    dossier ne vous appartient pas » — un message d'accusation adressé à une
--    entreprise qui n'a rien fait de mal, pour un dossier qu'elle a déposé
--    régulièrement. Le journal d'audit porte déjà, pour chaque dépôt, le nom
--    stocké, le propriétaire, le nom d'origine, le type et la taille : on
--    reprend ces faits, sans rien inventer ni modifier une seule ligne d'audit.
--
--    Les fichiers présents sur le volume SANS entrée d'audit ne sont pas
--    repris : ils sont de fait orphelins, et la table les rend enfin visibles
--    comme tels.

INSERT INTO uploads (id, "userId", "storedFilename", "originalName", "mimeType", "sizeOctets", "createdAt")
SELECT
  gen_random_uuid()::text,
  a."userId",
  a."entityId",
  COALESCE(a.after->>'originalName', a."entityId"),
  a.after->>'mimeType',
  (a.after->>'size')::int,
  a."createdAt"
FROM audit_logs a
WHERE a."entityType" = 'Upload'
  AND a.action = 'CREATE'
  AND a."entityId" IS NOT NULL
  AND a."userId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM uploads u WHERE u."storedFilename" = a."entityId")
ON CONFLICT ("storedFilename") DO NOTHING;
