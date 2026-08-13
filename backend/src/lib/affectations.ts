/**
 * Affectations agent ↔ marchés — périmètre de visibilité.
 * Renvoie la liste des marcheIds affectés, ou null si l'agent n'a aucune
 * affectation (= pas de restriction, compatibilité avec l'existant).
 * Seuls les rôles terrain sont scopés (MISSION, TECHNIQUE).
 */
import { prisma } from "./prisma";

export const ROLES_SCOPES = ["MISSION", "TECHNIQUE"];

export async function getMarchesAffectes(userId: string, role: string): Promise<string[] | null> {
  if (!ROLES_SCOPES.includes(role)) return null;
  const rows = await prisma.marcheAffectation.findMany({ where: { userId }, select: { marcheId: true } });
  if (rows.length === 0) return null;
  return rows.map((r) => r.marcheId);
}
