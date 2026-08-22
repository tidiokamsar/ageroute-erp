import { test } from "node:test";
import assert from "node:assert/strict";
import { formaterMontant, formaterMontantGnf, normaliserEspaces } from "./montants";

/**
 * Le défaut corrigé : `Number(bigint)` arrondissait silencieusement au-delà de
 * 2^53 sur les documents imprimés, alors que la base était exacte.
 */
test("un BigInt au-dela de 2^53 est formate sans perte", () => {
  const limite = 9_007_199_254_740_993n; // 2^53 + 1 : Number l'arrondirait à …992
  assert.equal(formaterMontant(limite), "9 007 199 254 740 993");
});

test("un tres grand montant reste exact jusqu'au dernier chiffre", () => {
  assert.equal(formaterMontant(123_456_789_012_345_678_901n), "123 456 789 012 345 678 901");
});

test("les montants courants sont inchanges", () => {
  assert.equal(formaterMontant(3_985_163_390n), "3 985 163 390");
  assert.equal(formaterMontant(3_985_163_390), "3 985 163 390");
  assert.equal(formaterMontant(0n), "0");
  assert.equal(formaterMontant(null), "0");
  assert.equal(formaterMontant(undefined), "0");
});

test("un Number hors plage sure est REFUSE plutot qu'arrondi", () => {
  assert.throws(() => formaterMontant(9_007_199_254_740_993), RangeError);
});

test("un Number non fini ne produit pas NaN sur un document", () => {
  assert.equal(formaterMontant(Number.NaN), "0");
  assert.equal(formaterMontant(Number.POSITIVE_INFINITY), "0");
});

test("les separateurs sont des espaces ordinaires, jamais des espaces fines", () => {
  const rendu = formaterMontant(1_000_000n);
  assert.ok(!/[   ]/.test(rendu), "aucune espace exotique");
  assert.equal(rendu, "1 000 000");
});

test("la devise est ajoutee en toutes lettres", () => {
  assert.equal(formaterMontantGnf(1500n), "1 500 GNF");
});

test("normaliserEspaces remplace les espaces ICU", () => {
  assert.equal(normaliserEspaces("1 000 GNF"), "1 000 GNF");
});
