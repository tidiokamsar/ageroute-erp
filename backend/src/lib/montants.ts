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

const FORMAT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/**
 * Montant en francs guinéens, sans symbole : « 3 985 163 390 ».
 *
 * Un BigInt est formaté TEL QUEL — `Intl.NumberFormat` l'accepte nativement.
 * L'ancienne version passait par `Number(valeur)` : au-delà de 2^53 (environ
 * 9 007 199 254 740 992 GNF) les derniers chiffres étaient silencieusement
 * arrondis sur le document imprimé, alors que la base et les calculs, eux,
 * étaient exacts. Constat « exactitude BigInt incomplète » de la revue du
 * 22/08/2026. Un nombre hors de la plage sûre est refusé plutôt qu'arrondi :
 * un montant faux sur une pièce comptable est pire qu'une erreur franche.
 */
export function formaterMontant(valeur: bigint | number | null | undefined): string {
  if (valeur === null || valeur === undefined) return normaliserEspaces(FORMAT.format(0));
  if (typeof valeur === "bigint") return normaliserEspaces(FORMAT.format(valeur));
  if (!Number.isFinite(valeur)) return normaliserEspaces(FORMAT.format(0));
  if (!Number.isSafeInteger(Math.trunc(valeur))) {
    throw new RangeError(`Montant ${valeur} hors de la plage entière sûre : transmettre un BigInt`);
  }
  return normaliserEspaces(FORMAT.format(valeur));
}

/** Montant suivi de la devise : « 3 985 163 390 GNF ». */
export function formaterMontantGnf(valeur: bigint | number | null | undefined): string {
  return `${formaterMontant(valeur)} GNF`;
}
