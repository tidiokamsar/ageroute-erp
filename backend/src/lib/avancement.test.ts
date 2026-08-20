import { test } from "node:test";
import assert from "node:assert/strict";
import { calculerAvancement, libelleBaseAvancement } from "./avancement";

/**
 * Le défaut réel : un budget absent était remplacé par 1 franc, ce qui a produit
 * « 202 668 805 200 % » sur l'écran Projet dès que les décomptes ont été
 * correctement rattachés. Ces tests interdisent tout dénominateur fabriqué.
 */
test("un budget absent ne produit JAMAIS un pourcentage aberrant", () => {
  const a = calculerAvancement({ budgetGnf: 0, totalMarcheHtGnf: 0, montantGnf: 2_026_688_052 });
  assert.equal(a.taux, null, "non calculable, donc null — pas un nombre");
  assert.equal(a.base, "AUCUNE");
  assert.equal(a.reference, 0);
});

test("sans budget mais avec des marches, la reference est le montant engage", () => {
  const a = calculerAvancement({ budgetGnf: 0, totalMarcheHtGnf: 100_000_000, montantGnf: 25_000_000 });
  assert.equal(a.base, "MARCHES");
  assert.equal(a.reference, 100_000_000);
  assert.equal(a.taux, 25);
});

test("le budget prime sur le montant engage quand il existe", () => {
  const a = calculerAvancement({ budgetGnf: 200_000_000, totalMarcheHtGnf: 100_000_000, montantGnf: 50_000_000 });
  assert.equal(a.base, "BUDGET");
  assert.equal(a.taux, 25);
});

test("aucun taux ne depasse silencieusement 100 % sans etre visible", () => {
  const a = calculerAvancement({ budgetGnf: 100, totalMarcheHtGnf: 0, montantGnf: 150 });
  assert.equal(a.taux, 150, "un depassement reel doit se voir, pas etre ecrete");
});

test("un montant nul donne 0 %, pas null, quand la reference existe", () => {
  const a = calculerAvancement({ budgetGnf: 1_000, totalMarcheHtGnf: 0, montantGnf: 0 });
  assert.equal(a.taux, 0);
  assert.equal(a.base, "BUDGET");
});

test("les valeurs negatives ou absurdes sont neutralisees", () => {
  assert.equal(calculerAvancement({ budgetGnf: -5, totalMarcheHtGnf: 0, montantGnf: 10 }).taux, null);
  assert.equal(calculerAvancement({ budgetGnf: 100, totalMarcheHtGnf: 0, montantGnf: -10 }).taux, 0);
  assert.equal(calculerAvancement({ budgetGnf: NaN, totalMarcheHtGnf: NaN, montantGnf: 10 }).taux, null);
});

test("le taux est arrondi a deux decimales", () => {
  const a = calculerAvancement({ budgetGnf: 3, totalMarcheHtGnf: 0, montantGnf: 1 });
  assert.equal(a.taux, 33.33);
});

test("la base utilisee est dite en clair, pour que l'ecran ne laisse pas croire a un budget", () => {
  assert.match(libelleBaseAvancement("MARCHES"), /budget du projet non saisi/);
  assert.match(libelleBaseAvancement("AUCUNE"), /aucune référence/);
  assert.equal(libelleBaseAvancement("BUDGET"), "budget du projet");
});
