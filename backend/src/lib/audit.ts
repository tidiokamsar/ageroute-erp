import { prisma } from "./prisma";
import { serializeForJson } from "./bigint";
import type { AuditAction } from "@prisma/client";

export async function logAudit(params: {
  userId?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
}) {
  await prisma.auditLog.create({
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
