/**
 * Référentiel UNIQUE des pièces d'un dossier de décompte.
 *
 * ⚠️ POURQUOI CE MODULE EXISTE
 * La liste des pièces vivait en deux exemplaires divergents : le bordereau
 * (`NATURES_PIECES`, avec un drapeau `requis`) déclarait QUATRE pièces
 * obligatoires — photos de chantier et PV contradictoire étant facultatifs —
 * tandis que la soumission au circuit (`workflow.routes.ts`) recopiait la liste
 * en dur et en exigeait CINQ, photos comprises. L'écran affichait donc une
 * pièce comme facultative pendant que l'API la refusait, et un dossier déposé
 * sans photos devenait insoumissible.
 *
 * Désormais une seule déclaration fait foi. Rendre une pièce obligatoire, ou
 * cesser de l'exiger, se fait en changeant `requis` ICI — le bordereau, la
 * soumission interne et le dépôt portail suivent ensemble, sans qu'aucune
 * liste n'ait à être recopiée.
 */

/**
 * Natures attendues — miroir du bordereau de pièces affiché à l'écran.
 *
 * Chaque pièce porte ses DEUX identifiants : `cle`, employée par le bordereau
 * interne (`decompte.piecesObligatoires`), et `type`, employé par le dépôt du
 * portail entreprise. Les deux nomenclatures existaient déjà, chacune de son
 * côté ; les réunir ici évite qu'une pièce ajoutée d'un côté manque de l'autre.
 */
export const NATURES_PIECES = [
  { cle: "decompteSigné",     type: "DECOMPTE",           libelle: "Décompte signé",          requis: true },
  { cle: "attachements",      type: "ATTACHEMENT",        libelle: "Attachements validés",    requis: true },
  { cle: "facture",           type: "FACTURE",            libelle: "Facture de l'entreprise", requis: true },
  { cle: "rapportAvancement", type: "RAPPORT_AVANCEMENT", libelle: "Rapport d'avancement",    requis: true },
  { cle: "photosChantier",    type: "PHOTO",              libelle: "Photos de chantier",      requis: false },
  { cle: "pvContradictoire",  type: "PV",                 libelle: "PV contradictoire",       requis: false },
] as const;

export type ClePiece = (typeof NATURES_PIECES)[number]["cle"];
export type TypePiece = (typeof NATURES_PIECES)[number]["type"];

/** Toutes les clés du bordereau, obligatoires ou non. */
export const CLES_PIECES: readonly string[] = NATURES_PIECES.map((n) => n.cle);

/** Les seules pièces dont l'absence bloque la soumission au circuit. */
export const PIECES_REQUISES = NATURES_PIECES.filter((n) => n.requis);

/**
 * Libellés des pièces requises absentes du bordereau d'un décompte.
 *
 * `bordereau` nul (dossier dont les pièces n'ont jamais été renseignées, cas
 * des dépôts portail antérieurs) ⇒ aucun blocage : on ne refuse pas un dossier
 * au motif d'un bordereau jamais ouvert. Une pièce requise absente ou à `false`
 * est en revanche manquante — `false` et `undefined` se valent ici.
 */
export function piecesRequisesManquantes(bordereau: Record<string, boolean> | null | undefined): string[] {
  if (!bordereau) return [];
  return PIECES_REQUISES.filter((n) => !bordereau[n.cle]).map((n) => n.libelle);
}

// ─── Nomenclature du portail entreprise ──────────────────────────────────────

/** Tous les types de pièce acceptés au dépôt, obligatoires ou non. */
export const TYPES_PIECES = NATURES_PIECES.map((n) => n.type) as readonly TypePiece[];

/** Les types dont le dépôt portail exige la présence. */
export const TYPES_PIECES_REQUIS = PIECES_REQUISES.map((n) => n.type) as readonly TypePiece[];

/** Libellé lisible d'un type de pièce, pour les messages d'erreur. */
export function libellePourType(type: string): string {
  return NATURES_PIECES.find((n) => n.type === type)?.libelle ?? type;
}

/** Clé du bordereau interne correspondant à un type de pièce du portail. */
export function clePourType(type: string): ClePiece {
  const nature = NATURES_PIECES.find((n) => n.type === type);
  if (!nature) throw new Error(`Type de pièce inconnu du référentiel : ${type}`);
  return nature.cle;
}

/**
 * Bordereau interne déduit des types de pièces réellement déposés au portail.
 *
 * C'est le pont entre les deux nomenclatures : le dépôt raisonne en `type`, le
 * circuit de validation lit `cle`. Une pièce déposée coche sa case ; les autres
 * restent à `false`. Les cases facultatives non cochées ne bloquent rien —
 * `piecesRequisesManquantes` ne regarde que les pièces requises.
 */
export function bordereauDepuisTypes(typesDeposes: readonly string[]): Record<ClePiece, boolean> {
  const presents = new Set(typesDeposes);
  return Object.fromEntries(
    NATURES_PIECES.map((n) => [n.cle, presents.has(n.type)]),
  ) as Record<ClePiece, boolean>;
}
