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

/** Natures attendues — miroir du bordereau de pièces affiché à l'écran. */
export const NATURES_PIECES = [
  { cle: "decompteSigné",     libelle: "Décompte signé",          requis: true },
  { cle: "attachements",      libelle: "Attachements validés",    requis: true },
  { cle: "facture",           libelle: "Facture de l'entreprise", requis: true },
  { cle: "rapportAvancement", libelle: "Rapport d'avancement",    requis: true },
  { cle: "photosChantier",    libelle: "Photos de chantier",      requis: false },
  { cle: "pvContradictoire",  libelle: "PV contradictoire",       requis: false },
] as const;

export type ClePiece = (typeof NATURES_PIECES)[number]["cle"];

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
