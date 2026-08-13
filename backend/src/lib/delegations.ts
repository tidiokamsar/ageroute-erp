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
