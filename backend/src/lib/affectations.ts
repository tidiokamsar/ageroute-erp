/**
 * Affectations agent ↔ périmètre de visibilité.
 *
 * Renvoie :
 *   null       → pas de restriction (rôles non scopés : ADMIN, DG, DAF, DSF…)
 *   []         → RIEN (rôle scopé SANS affectation : l'agent ne voit aucun marché)
 *   [ids...]   → restreint aux marchés du périmètre
 *
 * Rôles scopés : MISSION (chef de Mission — prestataire externe), TECHNIQUE et
 * UGP (coordinateurs de projet internes), BAILLEUR.
 * SANS affectation, ces rôles ne voient RIEN — l'administrateur doit
 * explicitement affecter des marchés ou des projets via
 * PUT /api/users/:id/affectations.
 *
 * Deux niveaux d'affectation depuis le 20/08/2026 :
 *   · par MARCHÉ  — précis, figé ;
 *   · par PROJET  — couvre tous les marchés du projet, **y compris ceux ajoutés
 *     plus tard**. C'est la raison d'être du second niveau : sans lui,
 *     l'administrateur devrait réaffecter à chaque nouveau marché, et l'oubli se
 *     traduirait par un coordinateur qui ne voit pas son propre marché.
 */
import { prisma } from "./prisma";

export const ROLES_SCOPES = ["MISSION", "TECHNIQUE", "UGP", "BAILLEUR"];

/**
 * Fusion des deux niveaux, sans doublon. Pure — testée sans base.
 * L'ordre n'a pas de sens métier ; la stabilité facilite les comparaisons.
 */
export function fusionnerPerimetre(idsDirects: string[], idsParProjet: string[]): string[] {
  return [...new Set([...idsDirects, ...idsParProjet])].sort();
}

export async function getMarchesAffectes(userId: string, role: string): Promise<string[] | null> {
  if (!ROLES_SCOPES.includes(role)) return null;

  const [marches, projets] = await Promise.all([
    prisma.marcheAffectation.findMany({ where: { userId }, select: { marcheId: true } }),
    prisma.projetAffectation.findMany({ where: { userId }, select: { projetId: true } }),
  ]);

  let idsParProjet: string[] = [];
  if (projets.length > 0) {
    // `deletedAt: null` : un marché archivé ne doit pas rentrer dans le
    // périmètre par la porte du projet alors qu'il en sortirait par la sienne.
    const marchesDuProjet = await prisma.marche.findMany({
      where: { projetId: { in: projets.map((p) => p.projetId) }, deletedAt: null },
      select: { id: true },
    });
    idsParProjet = marchesDuProjet.map((m) => m.id);
  }

  // Rôle scopé sans aucune affectation → voit RIEN (et non tout, comme avant).
  return fusionnerPerimetre(marches.map((r) => r.marcheId), idsParProjet);
}
