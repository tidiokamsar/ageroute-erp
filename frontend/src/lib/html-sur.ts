/**
 * Gabarit HTML sûr pour les impressions composées côté navigateur.
 *
 * Constat n°7 de la revue (XSS persistante) : `bordereau.ts` construisait du
 * HTML par interpolation de données métier non échappées — commentaires,
 * réserves, observations, noms de pièces — puis l'injectait par
 * `document.write`. Un commentaire contenant `<img src=x onerror=…>` exécutait
 * du script dans la fenêtre d'impression, avec accès au `localStorage` (jetons)
 * de la fenêtre parente.
 *
 * Principe : TOUTE valeur interpolée dans un gabarit `h\`…\`` est échappée.
 * Seul un fragment produit par `h` lui-même — donc déjà sûr — est inséré tel
 * quel. Un tableau est rendu élément par élément selon la même règle. Il n'y a
 * pas d'échappatoire « brut » : s'il en fallait un, ce serait le signe qu'une
 * donnée devrait être construite autrement.
 */

/** Fragment HTML déjà sûr — ne peut être produit que par `h`. */
export class FragmentSur {
  constructor(readonly html: string) {}
  toString(): string { return this.html; }
}

const REMPLACEMENTS: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Échappe une valeur scalaire pour un contexte texte ou attribut entre guillemets. */
export function echapper(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return "";
  return String(valeur).replace(/[&<>"']/g, (c) => REMPLACEMENTS[c]);
}

function rendre(valeur: unknown): string {
  if (valeur instanceof FragmentSur) return valeur.html;
  if (Array.isArray(valeur)) return valeur.map(rendre).join("");
  return echapper(valeur);
}

/** Gabarit balisé : `h\`<td>${donnee}</td>\`` — `donnee` est toujours échappée. */
export function h(morceaux: TemplateStringsArray, ...valeurs: unknown[]): FragmentSur {
  let sortie = "";
  morceaux.forEach((m, i) => {
    sortie += m;
    if (i < valeurs.length) sortie += rendre(valeurs[i]);
  });
  return new FragmentSur(sortie);
}

/**
 * Ouvre une fenêtre d'impression isolée de la fenêtre parente.
 * `opener = null` : même si un script s'exécutait dans la fenêtre enfant, il
 * n'aurait pas accès à la fenêtre de l'application ni à ses jetons.
 */
export function ouvrirImpression(document: FragmentSur): void {
  const win = window.open("", "_blank");
  if (!win) return;
  win.opener = null;
  win.document.write(document.html);
  win.document.close();
  setTimeout(() => win.print(), 500);
}
