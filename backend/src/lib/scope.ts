/**
 * Périmètres de données — isolation ENTREPRISE et affectations terrain.
 * Les comptes ENTREPRISE ne doivent voir/agir que sur les données de leur
 * propre entreprise ; les rôles terrain (MISSION, TECHNIQUE) ayant des
 * affectations de marchés sont restreints à ceux-ci (sans affectation =
 * pas de restriction, compatibilité existante).
 */
import { prisma } from "./prisma";

/** entrepriseId de l'utilisateur connecté (null si non lié ou rôle interne). */
export async function entrepriseIdOf(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { entrepriseId: true } });
  return u?.entrepriseId ?? null;
}

/** true si l'utilisateur est un compte entreprise (donc soumis à l'isolation). */
export function estCompteEntreprise(role: string | undefined): boolean {
  return role === "ENTREPRISE";
}
