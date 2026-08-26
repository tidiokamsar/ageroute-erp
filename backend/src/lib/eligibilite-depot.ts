/**
 * Éligibilité d'une entreprise à DÉPOSER un décompte sur un marché donné.
 *
 * Le contrôle existant (`checkEligibilite`) ne portait que sur l'entreprise :
 * blocage, radiation, suspension, IBAN, attestations fiscale et sociale. Il
 * ignorait entièrement le marché et ses garanties.
 *
 * Deux défauts constatés en production le 20/08/2026 :
 *
 *  1. La route de dépôt du portail exigeait `marche.statut === "ACTIF"`. Or
 *     AUCUN marché ne porte ce statut : trois sont `EN_EXECUTION`, un `SIGNE`.
 *     `ACTIF` est un alias de rétrocompatibilité. Le dépôt échouait donc pour
 *     100 % des marchés, avec le message « Dépôt impossible : marché
 *     EN_EXECUTION » — incompréhensible pour l'entreprise.
 *
 *  2. La garantie de bonne exécution du marché MCHE-2025-002 est expirée depuis
 *     le 30/07/2026 et reste marquée `active = true`. Rien ne l'empêchait de
 *     déposer : la régularité des garanties n'était contrôlée nulle part.
 *
 * Logique PURE, testable sans base. Les données sont chargées par l'appelant.
 *
 * Décision DAF du 26/08/2026 : l'exigence de garantie de bonne exécution est
 * INCONDITIONNELLE — les appelants (portail : /eligibilite, /soumettre,
 * /deposer-decompte) passent désormais exigeBonneExecution: true. Un marché
 * sans aucune caution enregistrée n'autorise AUCUN dépôt. Le paramètre reste
 * au contrat de la fonction pour les tests et un éventuel retour explicite.
 */

/** Statuts de marché autorisant le dépôt d'un décompte. */
export const STATUTS_MARCHE_DEPOT = [
  "ACTIF",                    // alias historique de EN_EXECUTION
  "EN_EXECUTION",
  "EN_AVENANT",
  "EN_RECEPTION_PROVISOIRE",
  "EN_RECEPTION_DEFINITIVE",
];

/** Explication du refus quand le marché n'est pas en phase de dépôt. */
export function motifStatutMarche(statut: string): string | null {
  if (STATUTS_MARCHE_DEPOT.includes(statut)) return null;
  switch (statut) {
    case "BROUILLON":
    case "EN_PREPARATION":
      return "Le marché n'est pas encore finalisé.";
    case "SIGNE":
    case "NOTIFIE":
      return "Le marché n'a pas démarré : l'ordre de service de démarrage n'est pas émis.";
    case "SUSPENDU":
      return "Le marché est suspendu.";
    case "RESILIE":
      return "Le marché est résilié.";
    case "SOLDE":
    case "CLOTURE":
      return "Le marché est soldé : plus aucun décompte ne peut y être déposé.";
    default:
      return `Le marché est au statut « ${statut.replace(/_/g, " ")} », qui n'autorise pas le dépôt.`;
  }
}

export interface GarantieControle {
  type: string;
  active: boolean;
  dateExpiration: Date | string | null;
}

/**
 * Une garantie compte-t-elle comme valide aujourd'hui ?
 *
 * ⚠️ Le drapeau `active` ne suffit pas : il n'est jamais remis à jour à
 * l'échéance. Une garantie expirée depuis trois semaines reste `active = true`
 * en base. La date fait foi, pas le drapeau.
 */
export function garantieValide(g: GarantieControle, maintenant: Date): boolean {
  if (!g.active) return false;
  if (!g.dateExpiration) return true; // sans échéance déclarée, on ne présume pas l'expiration
  return new Date(g.dateExpiration).getTime() > maintenant.getTime();
}

export interface ResultatEligibilite {
  autorise: boolean;
  /** Motifs bloquants — vide si le dépôt est autorisé. */
  blocages: string[];
  /** Signalements non bloquants, à afficher à l'entreprise. */
  avertissements: string[];
}

export function verifierEligibiliteDepot(params: {
  /** Motifs déjà relevés sur l'entreprise (checkEligibilite). */
  blocagesEntreprise: string[];
  statutMarche: string;
  garanties: GarantieControle[];
  /** Le marché exige-t-il une garantie de bonne exécution ? */
  exigeBonneExecution: boolean;
  /** Nombre d'attachements rattachés au marché. */
  nbAttachements: number;
  maintenant: Date;
}): ResultatEligibilite {
  const blocages = [...params.blocagesEntreprise];
  const avertissements: string[] = [];

  const motifStatut = motifStatutMarche(params.statutMarche);
  if (motifStatut) blocages.push(motifStatut);

  const bonneExec = params.garanties.filter((g) => g.type === "BONNE_EXECUTION");
  const bonneExecValide = bonneExec.some((g) => garantieValide(g, params.maintenant));
  if (params.exigeBonneExecution) {
    if (bonneExec.length === 0) {
      blocages.push("Aucune garantie de bonne exécution n'est enregistrée pour ce marché.");
    } else if (!bonneExecValide) {
      blocages.push(
        "La garantie de bonne exécution est expirée. Faites-la proroger par votre banque " +
        "et transmettez l'avenant de caution avant de déposer.",
      );
    }
  }

  // L'avance est un cas distinct : son expiration n'empêche pas de déposer un
  // décompte de travaux, mais elle doit être signalée — l'avance restant à
  // récupérer n'est alors plus couverte.
  for (const g of params.garanties.filter((g) => g.type === "AVANCE")) {
    if (!garantieValide(g, params.maintenant)) {
      avertissements.push("La garantie d'avance est expirée ou levée : l'avance restant à récupérer n'est plus couverte.");
      break;
    }
  }

  if (params.nbAttachements === 0) {
    blocages.push(
      "Aucun attachement n'existe sur ce marché. Le décompte doit s'appuyer sur un " +
      "constat contradictoire : établissez l'attachement avant de déposer.",
    );
  }

  return { autorise: blocages.length === 0, blocages, avertissements };
}
