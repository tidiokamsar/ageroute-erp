/**
 * L2.2 — Libellés d'états officiels unifiés.
 * Fin du doublon SOUMIS/DEPOSE : le backend garde ses codes techniques,
 * l'affichage (frontend) utilise ces libellés officiels.
 * Chargés depuis la règle ETQ_MAPPINGS si elle existe, sinon ces défauts.
 */

export const LIBELLES_STATUTS: Record<string, string> = {
  // Décomptes
  BROUILLON: "Brouillon",
  SOUMIS: "Déposé",           // L2.2 : SOUMIS = déposé par l'entreprise
  DEPOSE: "Déposé",           // alias technique
  EN_CONTROLE: "En contrôle",
  EN_CORRECTION: "En correction",
  EN_VALIDATION: "En validation",
  VISA_DAF: "Visa DAF",
  VISA_DG: "Visa DG",
  VALIDE_DG: "Validé DG",
  EN_CIRCUIT_FINANCIER: "En circuit financier",
  ORDONNANCE: "Ordonnancé",
  VALIDE: "Validé",
  REJETE: "Rejeté",
  PAYE: "Payé",

  // Marchés
  ACTIF: "Actif",
  SIGNE: "Signé",
  NOTIFIE: "Notifié",
  EN_EXECUTION: "En exécution",
  EN_AVENANT: "En avenant",
  EN_RECEPTION_PROVISOIRE: "Réception provisoire",
  EN_RECEPTION_DEFINITIVE: "Réception définitive",
  SOLDE: "Soldé",
  SUSPENDU: "Suspendu",
  RESILIE: "Résilié",

  // Attachements
  VALIDE_ATT: "Validé",
  DEMANDE_CORRECTION: "Correction demandée",

  // Workflows
  EN_COURS: "En cours",
  APPROUVE: "Approuvé",
  SUSPENDU_WF: "Suspendu",
  TERMINE: "Terminé",
  ANNULE: "Annulé",
};

/** Obtient le libellé officiel d'un statut technique. */
export function libelleStatut(statut: string): string {
  return LIBELLES_STATUTS[statut] ?? statut;
}

/** Obtient la classe CSS de badge selon le statut. */
export function classeStatut(statut: string): string {
  if (["PAYE", "VALIDE", "VALIDE_DG", "APPROUVE", "ACTIF", "SIGNE"].includes(statut)) return "bg-green-100 text-green-700";
  if (["REJETE", "RESILIE", "ANNULE"].includes(statut)) return "bg-red-100 text-red-700";
  if (["BROUILLON", "EN_COURS"].includes(statut)) return "bg-gray-100 text-gray-600";
  if (["EN_CORRECTION", "DEMANDE_CORRECTION"].includes(statut)) return "bg-amber-100 text-amber-700";
  if (["SUSPENDU", "SUSPENDU_WF"].includes(statut)) return "bg-purple-100 text-purple-700";
  return "bg-blue-100 text-blue-700";
}
