/**
 * Moteur de validation — source unique de vérité du parcours d'un décompte.
 *
 * CONTEXTE. Trois systèmes de validation coexistaient sans se parler :
 *   1. `decompte_validations_avancees` — écrivait `decompte.statut` en direct ;
 *   2. `workflow_instances` / `workflow_actions` — connaissait seul l'ordre des
 *      onze circuits par bailleur, mais ne remplissait pas l'onglet Validations ;
 *   3. `bpmn_instances` / `bpmn_actions` — 0 instance, 0 action : jamais utilisé.
 *
 * Conséquence constatée en production le 20/08/2026 : sur 8 décomptes, 3
 * portaient des validations sans aucune instance de circuit, et l'écran
 * affichait simultanément « EN_VALIDATION » et une étape de workflow différente.
 *
 * DÉCISION. Le workflow est la source de vérité ; la ligne de validation devient
 * une PROJECTION écrite par ce moteur, dans la même transaction que l'action et
 * le statut. Les trois écritures réussissent ensemble ou échouent ensemble.
 *
 * Ce module ne contient que de la logique PURE, pour être testable sans base.
 */
import type { StatutDecompte } from "@prisma/client";

/** Décisions acceptées par le moteur. */
export type Decision = "APPROUVE" | "REJETE" | "DEMANDE_CORRECTION" | "DEMANDE_COMPLEMENT" | "SUSPENDRE" | "AUDIT";

/** Décisions qui font AVANCER ou reculer le dossier — soumises à RG9. */
export const DECISIONS_ENGAGEANTES: Decision[] = ["APPROUVE", "REJETE", "DEMANDE_CORRECTION"];

/**
 * RG9 — séparation des tâches.
 *
 * La règle était présente dans le code sous la forme d'un bloc vide portant le
 * commentaire « RG9 temporairement désactivé » : la même personne pouvait
 * soumettre un décompte ET le valider, à toutes les étapes.
 *
 * Principe retenu : sur un circuit à plusieurs étapes, **une personne
 * n'intervient qu'une fois**. Elle ne peut pas valider une étape si elle a déjà
 * agi sur ce décompte — création, soumission ou étape antérieure.
 *
 * Aucun contournement par le rôle : un ADMIN n'est pas exempté, sinon la règle
 * ne protège rien. L'échappatoire légitime est la délégation formelle, pas le
 * privilège technique. La règle reste désactivable par paramétrage
 * (`WF_SEPARATION_TACHES`) pour une direction dont l'effectif ne permet pas de
 * distinguer les intervenants — mais ce doit être une décision explicite et
 * tracée, pas un oubli dans le code.
 */
export function verifierSeparationTaches(params: {
  utilisateurId: string;
  /** Identifiants de tous ceux qui ont déjà agi sur ce décompte. */
  intervenantsAnterieurs: string[];
  /** Décision demandée — seules les décisions engageantes sont contrôlées. */
  decision: Decision;
  /** Règle active ? (paramètre WF_SEPARATION_TACHES) */
  active: boolean;
}): { autorise: boolean; motif?: string } {
  if (!params.active) return { autorise: true };
  if (!DECISIONS_ENGAGEANTES.includes(params.decision)) return { autorise: true };
  if (!params.intervenantsAnterieurs.includes(params.utilisateurId)) return { autorise: true };
  return {
    autorise: false,
    motif:
      "Séparation des tâches (RG9) : vous êtes déjà intervenu sur ce décompte. " +
      "Une même personne ne peut pas engager deux étapes du circuit. " +
      "Faites intervenir un autre agent du rôle attendu, ou établissez une délégation formelle.",
  };
}

/**
 * Statut du décompte quand le dossier arrive sur une étape donnée.
 * Table unique : c'était auparavant deux tables divergentes, l'une dans la route
 * de validation, l'autre dans le moteur de workflow.
 */
export function statutPourRoleEtape(roleEtape: string): StatutDecompte {
  switch (roleEtape) {
    case "MISSION":
    case "TECHNIQUE":
      return "EN_CONTROLE";
    case "DMC":
    case "UGP":
      return "EN_VALIDATION";
    case "DAF":
      return "VISA_DAF";
    case "DGA":
    case "DG":
      return "VISA_DG";
    case "BAILLEUR":
    case "BUDGET":
    case "TRESOR":
    case "FER_AGT":
    case "BCRG":
      return "EN_CIRCUIT_FINANCIER";
    default:
      return "EN_VALIDATION";
  }
}

/**
 * Étape à inscrire dans la ligne de validation (onglet Validations).
 * La colonne `etape` de `decompte_validations_avancees` porte historiquement un
 * libellé de service ; on le dérive du rôle de l'étape de workflow pour que les
 * deux vues racontent la même histoire.
 */
export function libelleEtapeValidation(roleEtape: string): string {
  const connus = ["SOUMISSION", "MISSION", "TECHNIQUE", "DMC", "DAF", "DG", "UGP"];
  return connus.includes(roleEtape) ? roleEtape : "DMC";
}

/**
 * Décision de workflow traduite dans le vocabulaire de la ligne de validation.
 * `decompte_validations_avancees.decision` ne connaît que trois valeurs.
 */
export function decisionValidation(decision: Decision): "APPROUVE" | "REJETE" | "CORRECTION" {
  if (decision === "APPROUVE") return "APPROUVE";
  if (decision === "REJETE") return "REJETE";
  return "CORRECTION";
}

/** Une décision doit-elle produire une ligne dans l'onglet Validations ? */
export function produitUneValidation(decision: Decision): boolean {
  return DECISIONS_ENGAGEANTES.includes(decision);
}
