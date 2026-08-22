import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculerPositionPaiement,
  convertirMontantGnf,
  evaluerConfirmation,
  verifierNouvelOrdre,
} from "./paiements.regles";

test("GNF — une chaîne entière supérieure à 2^53 reste exacte", () => {
  assert.equal(convertirMontantGnf("9007199254740993"), 9_007_199_254_740_993n);
});

test("GNF — un Number unsafe est refusé avant toute conversion BigInt", () => {
  assert.throws(
    () => convertirMontantGnf(9_007_199_254_740_993),
    /entier positif sûr/,
  );
});

test("GNF — les décimaux, zéros et chaînes non numériques sont refusés", () => {
  for (const valeur of [0, 1.5, "0", "1.5", "1e6", " 100 "] as const) {
    assert.throws(() => convertirMontantGnf(valeur));
  }
});

test("position — un montant confirmé réel remplace la réservation nominale", () => {
  const position = calculerPositionPaiement([
    { montantGnf: 60n, montantReelGnf: 59n, confirmeAt: new Date("2026-08-21") },
    { montantGnf: 40n, montantReelGnf: null, confirmeAt: null },
  ]);
  assert.deepEqual(position, { confirmeGnf: 59n, reserveGnf: 40n, engagementGnf: 99n });
});

test("ordonnancement — le cumul réel et réservé ne peut pas dépasser le net", () => {
  const position = { confirmeGnf: 60n, reserveGnf: 30n, engagementGnf: 90n };
  assert.equal(verifierNouvelOrdre({ netAPayerGnf: 100n, position, montantGnf: 10n }).autorise, true);
  assert.equal(verifierNouvelOrdre({ netAPayerGnf: 100n, position, montantGnf: 11n }).autorise, false);
});

test("confirmation partielle — le décompte reste ORDONNANCE", () => {
  const resultat = evaluerConfirmation({
    netAPayerGnf: 100n,
    positionAutresPaiements: { confirmeGnf: 0n, reserveGnf: 0n, engagementGnf: 0n },
    montantReelGnf: 60n,
  });
  assert.equal(resultat.autorise, true);
  assert.equal(resultat.confirmeApresGnf, 60n);
  assert.equal(resultat.decomptePaye, false);
});

test("confirmation exacte — seul le cumul réel égal au net clôture le décompte", () => {
  const resultat = evaluerConfirmation({
    netAPayerGnf: 100n,
    positionAutresPaiements: { confirmeGnf: 60n, reserveGnf: 0n, engagementGnf: 60n },
    montantReelGnf: 40n,
  });
  assert.equal(resultat.autorise, true);
  assert.equal(resultat.confirmeApresGnf, 100n);
  assert.equal(resultat.decomptePaye, true);
});

test("confirmation — un ordre encore ouvert empêche une clôture prématurée", () => {
  const resultat = evaluerConfirmation({
    netAPayerGnf: 100n,
    positionAutresPaiements: { confirmeGnf: 0n, reserveGnf: 40n, engagementGnf: 40n },
    montantReelGnf: 60n,
  });
  assert.equal(resultat.autorise, true);
  assert.equal(resultat.engagementApresGnf, 100n);
  assert.equal(resultat.decomptePaye, false);
});

test("confirmation — tout dépassement réel ou réservé est refusé", () => {
  const resultat = evaluerConfirmation({
    netAPayerGnf: 100n,
    positionAutresPaiements: { confirmeGnf: 60n, reserveGnf: 10n, engagementGnf: 70n },
    montantReelGnf: 31n,
  });
  assert.equal(resultat.autorise, false);
  assert.equal(resultat.engagementApresGnf, 101n);
  assert.equal(resultat.decomptePaye, false);
});
