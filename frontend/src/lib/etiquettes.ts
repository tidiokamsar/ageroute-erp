/**
 * Lot L2.2 (A9) — Libellés d'états officiels, source unique.
 *
 * Avant ce lot, les libellés étaient recopiés dans Badge.tsx, BiPage,
 * DashboardPage et AttachementsPage — avec des tables incomplètes : la table
 * des badges ne connaissait que 6 des 14 statuts de décompte et ignorait
 * trois bailleurs, si bien que l'écran affichait des codes bruts
 * (« EN_CIRCUIT_FINANCIER », « BADEA ») dans des cas parfaitement normaux.
 *
 * Les défauts ci-dessous couvrent l'intégralité des énumérations Prisma. La
 * règle `ETQ_MAPPINGS` (A9) permet à l'agence de les renommer sans livraison —
 * un bailleur peut exiger « Décompte visé » là où l'ERP dit « Validé ».
 */

export type DomaineEtiquette = "DECOMPTE" | "MARCHE" | "ENTREPRISE" | "TYPE_DECOMPTE" | "FINANCEMENT" | "ATTACHEMENT";

export type Etiquettes = Partial<Record<DomaineEtiquette, Record<string, string>>>;

/** Libellés livrés — exhaustifs au regard des énumérations du schéma. */
export const ETIQUETTES_DEFAUT: Record<DomaineEtiquette, Record<string, string>> = {
  DECOMPTE: {
    BROUILLON: "Brouillon",
    SOUMIS: "Soumis",
    DEPOSE: "Déposé",
    EN_CONTROLE: "En contrôle",
    EN_CORRECTION: "En correction",
    EN_VALIDATION: "En validation",
    VISA_DAF: "Visa DAF",
    VISA_DG: "Visa DG",
    VALIDE_DG: "Validé DG",
    EN_CIRCUIT_FINANCIER: "Circuit financier",
    ORDONNANCE: "Ordonnancé",
    VALIDE: "Validé",
    REJETE: "Rejeté",
    PAYE: "Payé",
  },
  MARCHE: {
    BROUILLON: "Brouillon",
    EN_PREPARATION: "En préparation",
    SIGNE: "Signé",
    NOTIFIE: "Notifié",
    EN_EXECUTION: "En exécution",
    ACTIF: "Actif",
    SUSPENDU: "Suspendu",
    EN_AVENANT: "En avenant",
    EN_RECEPTION_PROVISOIRE: "Réception provisoire",
    EN_RECEPTION_DEFINITIVE: "Réception définitive",
    RESILIE: "Résilié",
    SOLDE: "Soldé",
    CLOTURE: "Clôturé",
  },
  ENTREPRISE: {
    EN_ATTENTE: "En attente",
    A_REGULARISER: "À régulariser",
    CONFORME: "Conforme",
    AUTORISE: "Autorisée à contracter",
    ALERTE: "Alerte",
    BLOQUE: "Bloquée",
    SUSPENDU: "Suspendue",
    ARCHIVE: "Archivée",
  },
  TYPE_DECOMPTE: {
    AVANCE: "Avance",
    PROVISOIRE: "Provisoire",
    PARTIEL: "Partiel",
    INTERMEDIAIRE: "Intermédiaire",
    FINAL: "Final",
    CLOTURE: "Clôture",
    APRES_AVENANT: "Après avenant",
  },
  ATTACHEMENT: {
    BROUILLON: "Brouillon",
    SOUMIS: "Soumis",
    EN_CONTROLE_MISSION: "Contrôle Mission",
    EN_CONTROLE_TECHNIQUE: "Contrôle Technique",
    DEMANDE_CORRECTION: "Correction requise",
    VALIDE: "Validé",
    REJETE: "Rejeté",
  },
  FINANCEMENT: {
    BANQUE_MONDIALE: "Banque Mondiale",
    BAD: "BAD",
    BUDGET_NATIONAL: "Budget National",
    FER: "FER",
    BOAD: "BOAD",
    BID: "BID",
    UE: "UE",
    BADEA: "BADEA",
    AFD: "AFD",
    KFW: "KfW",
    AUTRE: "Autre",
  },
};

/**
 * Libellé d'un code technique. Fonction PURE : la surcharge éventuelle est
 * passée en argument, jamais lue d'un état global.
 *
 * Ordre de résolution : surcharge de l'agence → libellé livré → code brut.
 * Le repli sur le code garantit qu'un nouvel état ajouté au schéma reste
 * lisible, faute de mieux, au lieu de produire une case vide.
 */
export function libelleStatut(domaine: DomaineEtiquette, code: string | null | undefined, surcharges?: Etiquettes): string {
  if (!code) return "—";
  return surcharges?.[domaine]?.[code] ?? ETIQUETTES_DEFAUT[domaine][code] ?? code;
}

/** Lit la règle ETQ_MAPPINGS sans jamais faire échouer l'affichage. */
export function parserEtiquettes(brut: string | null | undefined): Etiquettes {
  if (!brut) return {};
  try {
    const parse = JSON.parse(brut);
    return parse && typeof parse === "object" && !Array.isArray(parse) ? (parse as Etiquettes) : {};
  } catch {
    // Une règle mal formée ne doit pas vider l'écran : on retombe sur les
    // libellés livrés. La validation à la saisie (L0.2) empêche normalement ce cas.
    return {};
  }
}
