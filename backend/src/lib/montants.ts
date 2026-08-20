/**
 * Formatage des montants pour les documents imprimés.
 *
 * ⚠️ POURQUOI CE MODULE EXISTE
 * `Intl.NumberFormat("fr-GN")` sépare les milliers par une ESPACE FINE
 * INSÉCABLE (U+202F) et précède le symbole monétaire d'une espace insécable
 * (U+00A0). Les polices standard de PDFKit sont encodées en WinAnsi, qui ne
 * connaît ni l'un ni l'autre : à l'impression, chaque séparateur devenait une
 * BARRE OBLIQUE. Un décompte affichait « 3 /985 /163 /390 » au lieu de
 * « 3 985 163 390 » — illisible sur une pièce comptable officielle.
 *
 * On formate donc en `fr-FR` puis on remplace toute espace exotique par une
 * espace ordinaire, et on écrit « GNF » plutôt que le symbole local « FG »,
 * pour rester cohérent avec le reste de l'application.
 */

/** Espaces produites par ICU que WinAnsi ne sait pas représenter. */
const ESPACES_EXOTIQUES = /[    ]/g;

/** Remplace toute espace non représentable par une espace ordinaire. */
export function normaliserEspaces(texte: string): string {
  return texte.replace(ESPACES_EXOTIQUES, " ");
}

/** Montant en francs guinéens, sans symbole : « 3 985 163 390 ». */
export function formaterMontant(valeur: bigint | number | null | undefined): string {
  return normaliserEspaces(
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(valeur ?? 0)),
  );
}

/** Montant suivi de la devise : « 3 985 163 390 GNF ». */
export function formaterMontantGnf(valeur: bigint | number | null | undefined): string {
  return `${formaterMontant(valeur)} GNF`;
}
