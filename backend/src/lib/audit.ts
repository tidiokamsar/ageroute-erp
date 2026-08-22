import { prisma } from "./prisma";
import { serializeForJson } from "./bigint";
import type { AuditAction, Prisma } from "@prisma/client";

export async function logAudit(params: {
  userId?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  /**
   * Client transactionnel optionnel. Quand une décision métier et son audit
   * doivent réussir ou échouer ENSEMBLE (constat de la revue du 20/08/2026 :
   * « une action sensible sans audit » après panne intermédiaire), l'appelant
   * passe le `tx` de sa `$transaction` — l'entrée d'audit rejoint alors
   * l'atomicité de l'action. Sans `tx`, comportement inchangé.
   */
  tx?: Prisma.TransactionClient;
}) {
  await (params.tx ?? prisma).auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      // serializeForJson convertit les BigInt (montants) en chaînes : une colonne
      // Json Prisma n'accepte pas les BigInt bruts et lèverait à chaque create/update.
      before: params.before ? (serializeForJson(params.before) as object) : undefined,
      after: params.after ? (serializeForJson(params.after) as object) : undefined,
      ipAddress: params.ipAddress,
    },
  });
}
