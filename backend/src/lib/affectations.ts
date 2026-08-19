/**
 * Affectations agent ↔ marchés — périmètre de visibilité.
 *
 * Renvoie :
 *   null       → pas de restriction (rôles non scopés : ADMIN, DG, DAF, etc.)
 *   []         → RIEN (rôle scopé SANS affectation : l'agent ne voit aucun marché)
 *   [ids...]   → restreint aux marchés affectés
 *
 * Rôles scopés : MISSION, TECHNIQUE (terrain) et BAILLEUR.
 * SANS affectation, ces rôles ne voient RIEN — l'administrateur doit
 * explicitement affecter des marchés via PUT /api/users/:id/affectations.
 */
import { prisma } from "./prisma";

export const ROLES_SCOPES = ["MISSION", "TECHNIQUE", "BAILLEUR"];

export async function getMarchesAffectes(userId: string, role: string): Promise<string[] | null> {
  if (!ROLES_SCOPES.includes(role)) return null;
  const rows = await prisma.marcheAffectation.findMany({ where: { userId }, select: { marcheId: true } });
  // Rôle scopé sans affectation → voient RIEN (pas tout comme avant)
  return rows.map((r) => r.marcheId);
}
