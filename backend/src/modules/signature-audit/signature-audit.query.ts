/**
 * Construction du filtre SQL de la piste d'audit des signatures.
 *
 * Fonction PURE, isolée du routeur pour être testable — même parti pris que
 * `decomptes.calc.ts`. Elle existe pour qu'une régression sur l'injection SQL
 * (REVUE §10) soit détectée par un test plutôt que par un audit manuel : les
 * valeurs venant du client doivent rester des paramètres liés, jamais du texte
 * concaténé dans la requête.
 */
import { Prisma } from "@prisma/client";

export interface SignatureAuditFiltre {
  status?: unknown;
  objectType?: unknown;
}

export function buildSignatureAuditWhere(filtre: SignatureAuditFiltre): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`1=1`];
  if (filtre.status) conditions.push(Prisma.sql`AND so.status = ${String(filtre.status)}`);
  if (filtre.objectType) conditions.push(Prisma.sql`AND so.object_type = ${String(filtre.objectType)}`);
  return Prisma.join(conditions, " ");
}

/** Borne la pagination : jamais de valeur hors plage injectée dans LIMIT/OFFSET. */
export function bornerPagination(pageSize: unknown, page: unknown): { limit: number; page: number; offset: number } {
  const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 200);
  const pageCourante = Math.max(Number(page) || 1, 1);
  return { limit, page: pageCourante, offset: (pageCourante - 1) * limit };
}
