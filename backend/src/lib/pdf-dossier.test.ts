import { test } from "node:test";
import assert from "node:assert/strict";
import { doitChangerDePage, limiteBasse, tronquer, fmtDate, assainirTexte, RESERVE_PIED } from "./pdf-dossier";

/**
 * Le défaut que ces règles évitent : l'ancien gabarit écrivait à des positions
 * fixes sans jamais vérifier la place restante. Un dossier de plusieurs sections
 * se superposait au pied de page, ou sortait de la feuille.
 */
test("un bloc qui tient sur la page ne provoque pas de saut", () => {
  assert.equal(doitChangerDePage(100, 50, 780), false);
});

test("un bloc qui deborde provoque un saut", () => {
  assert.equal(doitChangerDePage(760, 50, 780), true);
});

test("le cas limite exact ne saute pas", () => {
  assert.equal(doitChangerDePage(730, 50, 780), false);
});

test("un point au-dela de la limite saute", () => {
  assert.equal(doitChangerDePage(731, 50, 780), true);
});

test("la limite basse reserve la place du pied de page", () => {
  assert.equal(limiteBasse(842), 842 - RESERVE_PIED);
  assert.ok(limiteBasse(842) < 842, "on ne doit jamais ecrire jusqu'au bord");
});

/** Les libellés longs débordaient sur la colonne voisine. */
test("un texte court est rendu tel quel", () => {
  assert.equal(tronquer("Béton", 20), "Béton");
});

test("un texte long est coupe et signale par une ellipse", () => {
  const t = tronquer("Fourniture et mise en oeuvre de beton bitumineux", 20);
  assert.equal(t.length, 20);
  assert.ok(t.endsWith("…"));
});

test("les espaces multiples et retours a la ligne sont normalises", () => {
  assert.equal(tronquer("  Béton   \n  arme ", 40), "Béton arme");
});

test("une valeur absente devient un tiret, jamais une case vide", () => {
  assert.equal(tronquer(null, 10), "—");
  assert.equal(tronquer(undefined, 10), "—");
  assert.equal(tronquer("   ", 10), "—");
});

test("une longueur maximale minuscule reste geree", () => {
  assert.equal(tronquer("abcdef", 1), "a");
});

/** « Invalid Date » dans un document officiel serait inacceptable. */
test("une date absente devient un tiret", () => {
  assert.equal(fmtDate(null), "—");
  assert.equal(fmtDate(undefined), "—");
});

test("une date invalide devient un tiret, jamais Invalid Date", () => {
  assert.equal(fmtDate("pas-une-date"), "—");
  assert.ok(!fmtDate("pas-une-date").includes("Invalid"));
});

test("une date valide est rendue au format francais", () => {
  const rendu = fmtDate(new Date("2026-02-28T10:00:00Z"));
  assert.match(rendu, /^\d{2}\/\d{2}\/\d{4}$/);
});

test("l'heure est ajoutee quand elle est demandee", () => {
  const avec = fmtDate(new Date("2026-02-28T10:00:00Z"), true);
  const sans = fmtDate(new Date("2026-02-28T10:00:00Z"), false);
  assert.ok(avec.length > sans.length, "le format avec heure est plus long");
});

/**
 * Les polices standard de PDFKit (WinAnsi) ne portent ni la flèche ni le signe
 * moins typographique. Constaté sur le premier dossier généré : « → » sortait
 * en « !' » et « − » en guillemet. Même famille que l'espace fine insécable qui
 * s'imprimait « / » au milieu des montants.
 */
test("la fleche est remplacee par un equivalent imprimable", () => {
  assert.equal(assainirTexte("01/07/2026 → 31/07/2026"), "01/07/2026 -> 31/07/2026");
});

test("le signe moins typographique devient un tiret simple", () => {
  assert.equal(assainirTexte("− 264 977 165 GNF"), "- 264 977 165 GNF");
});

test("les espaces fines et insecables deviennent des espaces normales", () => {
  assert.equal(assainirTexte("2 929 296 000"), "2 929 296 000");
});

test("les comparateurs et apostrophes courbes sont substitues", () => {
  assert.equal(assainirTexte("≤ ≥ ≠"), "<= >= !=");
  assert.equal(assainirTexte("l’agent"), "l'agent");
});

test("les caracteres bien supportes ne sont pas touches", () => {
  const intact = "Béton armé — 60 × 60 « ml » … 0,6 %";
  assert.equal(assainirTexte(intact), intact);
});

test("tronquer assainit avant de couper", () => {
  assert.ok(!tronquer("A → B", 20).includes("→"));
});
