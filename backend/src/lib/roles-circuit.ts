/**
 * L2.1 — Matrices de rôles du circuit, consommées au runtime.
 * PLAN-TRAVAIL-AGENT-PARAMETRAGE.md §3 / PLAN-DEV §1.2.
 *
 * Les règles WF_ROLES_LIQUIDATION / ORDONNANCEMENT / PAIEMENT définissent
 * quels rôles peuvent exercer chaque fonction, EN PLUS des rôles d'étape
 * (workflow, BPMN, circuit financier). WF_SEPARATION_ORD_COMPTABLE active
 * le contrôle de séparation des fonctions (PEFA PI-24 : un même rôle ne
 * peut pas liquider ET ordonnancer).
 *
 * FONCTIONS PURES (testées) : la résolution des rôles et le contrôle de
 * séparation n'ont pas de dépendance externe.
 */
import { chargerRegles, type ReglesEffectives } from "./regles";

/** Rôles autorisés pour une fonction du circuit, selon les règles actives. */
export function rolesPourFonction(
  regles: ReglesEffectives,
  fonction: "LIQUIDATION" | "ORDONNANCEMENT" | "PAIEMENT",
): string[] {
  const cle = `WF_ROLES_${fonction}` as keyof ReglesEffectives;
  const brut = regles[cle] ?? "";
  return brut.split(",").map((r) => r.trim()).filter(Boolean);
}

/** Vérifie si un rôle est autorisé pour la fonction (matrice + ADMIN bypass). */
export function roleAutorise(
  role: string,
  fonction: "LIQUIDATION" | "ORDONNANCEMENT" | "PAIEMENT",
  regles: ReglesEffectives,
): boolean {
  if (role === "ADMIN") return true; // l'admin technique garde tous les droits
  return rolesPourFonction(regles, fonction).includes(role);
}

/**
 * Contrôle de séparation ordonnateur/comptable (PEFA) :
 * si activé, aucun rôle ne peut apparaître simultanément en LIQUIDATION
 * et ORDONNANCEMENT. Retourne la liste des conflits (vide = conforme).
 */
export function verifierSeparation(
  regles: ReglesEffectives,
): { conforme: boolean; conflits: string[] } {
  if (regles.WF_SEPARATION_ORD_COMPTABLE !== "true") return { conforme: true, conflits: [] };
  const liquidation = new Set(rolesPourFonction(regles, "LIQUIDATION").filter((r) => r !== "ADMIN"));
  const ordonnancement = new Set(rolesPourFonction(regles, "ORDONNANCEMENT").filter((r) => r !== "ADMIN"));
  const conflits = [...liquidation].filter((r) => ordonnancement.has(r));
  return { conforme: conflits.length === 0, conflits };
}

/** Rôles effectifs (avec délégations) + contrôle de matrice pour une action. */
export async function peutExercerFonction(
  userId: string,
  role: string,
  fonction: "LIQUIDATION" | "ORDONNANCEMENT" | "PAIEMENT",
  ctx?: { marcheId?: string; bailleur?: string; typeMarche?: string },
): Promise<boolean> {
  const regles = await chargerRegles(ctx);
  return roleAutorise(role, fonction, regles);
}
