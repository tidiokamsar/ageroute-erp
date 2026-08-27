-- Migration manuelle — ERP AGEROUTE — 27/08/2026
-- Objet : F-GO1 — 2FA (TOTP) pour les rôles financiers.
--
-- ⚠️ MODE D'EMPLOI (§3.1 / §5.5 AGENTS.md) :
--   1. pg_dump -Fc avant toute opération ;
--   2. psql uniquement — JAMAIS prisma db push.

ALTER TABLE users ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "twoFactorActif" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "twoFactorCodesSecours" JSONB;

COMMENT ON COLUMN users."twoFactorSecret" IS 'F-GO1 — secret TOTP base32 (RFC 6238), lisible pour vérification HMAC';
COMMENT ON COLUMN users."twoFactorCodesSecours" IS 'F-GO1 — codes de secours hachés [{hash, utilise}]';

-- Valeurs 2FA de l'enum d'audit (idempotent, une par appel — PostgreSQL
-- n'accepte pas ADD VALUE dans une transaction avec usage immédiat).
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LOGIN_2FA';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LOGIN_2FA_EN_ATTENTE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LOGIN_2FA_ENROLEMENT_REQUIS';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LOGIN_2FA_SECOURS';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LOGIN_2FA_ECHEC';
