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
CREATE INDEX IF NOT EXISTS uploads_"userId"_idx ON uploads("userId");
COMMENT ON TABLE uploads IS 'Propriété des pièces téléversées avant rattachement (revue 27/08/2026) — remplace le comptage du journal d''audit';
