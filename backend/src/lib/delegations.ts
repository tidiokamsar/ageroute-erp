/**
 * Délégation d'intérim — un suppléant peut agir au nom d'un titulaire absent.
 * getRolesDelegues renvoie les rôles qu'un utilisateur "porte" actuellement
 * via une délégation active (période en cours), en plus de son rôle propre.
 */
import { prisma } from "./prisma";

export async function getRolesDelegues(userId: string): Promise<string[]> {
  const now = new Date();
  const dels = await prisma.delegation.findMany({
    where: {
      suppleantId: userId,
      actif: true,
      dateDebut: { lte: now },
      dateFin: { gte: now },
    },
    include: { titulaire: { select: { role: true } } },
  });
  return [...new Set(dels.map((d) => d.titulaire.role as string))];
}

/**
 * Rôles effectifs portés par un utilisateur : son rôle propre + les rôles
 * délégués actifs. ADMIN n'est JAMAIS héritable par délégation — déléguer le
 * rôle administrateur reviendrait à créer une élévation de privilèges.
 * Fonction pure (testée) ; utiliser rolesEffectifs() côté requête.
 */
export function porteeRoles(userRole: string, rolesDelegues: string[]): string[] {
  return [...new Set([userRole, ...rolesDelegues.filter((r) => r !== "ADMIN")])];
}

/** Rôles effectifs d'un utilisateur, délégations actives incluses. */
export async function rolesEffectifs(userId: string, userRole: string): Promise<string[]> {
  return porteeRoles(userRole, await getRolesDelegues(userId));
}
