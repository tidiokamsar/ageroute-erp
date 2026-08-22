-- AuditAction.CONFIRM_BCRG — valeur déclarée dans schema.prisma (commit 94b1c45)
-- mais JAMAIS créée en base : aucune migration ne l'accompagnait.
--
-- Découvert le 22/08/2026 par la preuve PostgreSQL du service de paiement
-- (paiements.service.pg.test.ts, sur copie restaurée) : la confirmation BCRG
-- écrit un audit d'action CONFIRM_BCRG, PostgreSQL refusait la valeur
-- (« invalid input value for enum "AuditAction" »), la transaction se défaisait.
-- Conséquence en production : la SEULE voie vers PAYE était cassée — aucune
-- confirmation bancaire ne pouvait aboutir. Invisible jusqu'ici parce
-- qu'aucun compte BCRG n'existe et que personne n'avait jamais confirmé.
--
-- ⚠️ ALTER TYPE ... ADD VALUE est IRRÉVERSIBLE (pas de DROP VALUE) et ne
-- s'exécute pas dans un bloc transactionnel : lancer ce fichier seul, jamais
-- dans un BEGIN. Idempotent par IF NOT EXISTS.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CONFIRM_BCRG';
