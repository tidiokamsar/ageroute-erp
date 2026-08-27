-- Migration manuelle — ERP AGEROUTE — 27/08/2026
-- Objet : refresh tokens stockés par empreinte SHA-256 (revue du 26/08/2026 —
-- constat « refresh tokens en clair » : un dump de base livrait des sessions
-- valides 7 jours, présentables telles quelles à /api/auth/refresh).
--
-- Le schéma ne change PAS (colonne token text) : seul le contenu change.
-- Les jetons existants, stockés en clair, sont PURGÉS : leur conversion en
-- empreinte exigerait pgcrypto (extension non garantie) et une fenêtre où
-- les deux formats coexisteraient. La purge répersionne une reconnexion
-- unique des sessions ouvertes — alignée sur la doctrine « la rotation
-- invalide les jetons existants ».
--
-- ⚠️ MODE D'EMPLOI (§3.1 / §5.5 AGENTS.md) :
--   1. pg_dump -Fc avant toute opération ;
--   2. appliquer ce fichier via psql — JAMAIS `prisma db push` ;
--   3. déployer dans la foulée le backend qui écrit/lit des empreintes :
--      appliquer la purge SANS déployer déconnecterait tout le monde.

DELETE FROM refresh_tokens;
