/**
 * Tests des calculs financiers du décompte (formule officielle AGEROUTE).
 * Runner : node:test (intégré Node 20). Lancer : tsx --test decomptes.calc.test.ts
 * Les valeurs attendues sont calculées à la main pour verrouiller la formule.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcDecompte } from "./decomptes.calc";

test("cas de base — 1 000 000 GNF, taux par défaut (18 / 5 / 20)", () => {
  const r = calcDecompte({ montantPeriodeHtGnf: 1_000_000n });
  assert.equal(r.tva, 180_000n);              // 1 000 000 × 18 %
  assert.equal(r.armp, 6_000n);               // 1 000 000 × 0,6 %
  assert.equal(r.ttc, 1_186_000n);            // HT + TVA + ARMP
  assert.equal(r.precompteTva, 90_458n);      // round(1 186 000 × 9/118)
  assert.equal(r.retenueGarantie, 59_300n);   // 1 186 000 × 5 %
  assert.equal(r.avanceRecuperee, 200_000n);  // 1 000 000 × 20 %
  assert.equal(r.netAPayer, 830_242n);        // TTC − précompte − retenue − ARMP − avance
  assert.equal(r.cumulActuelHtGnf, 1_000_000n);
});

test("pénalités et révision impactent le net à payer", () => {
  const base = calcDecompte({ montantPeriodeHtGnf: 1_000_000n });
  const r = calcDecompte({ montantPeriodeHtGnf: 1_000_000n, penalites: 50_000n, revisionPrix: 20_000n });
  // net = base − pénalités + révision
  assert.equal(r.netAPayer, base.netAPayer - 50_000n + 20_000n);
  assert.equal(r.netAPayer, 800_242n);
});

test("cumul précédent s'ajoute au cumul actuel mais pas au calcul de la période", () => {
  const r = calcDecompte({ montantPeriodeHtGnf: 1_000_000n, cumulPrecedentHtGnf: 5_000_000n });
  assert.equal(r.cumulActuelHtGnf, 6_000_000n);
  // les taxes ne portent que sur la période courante
  assert.equal(r.tva, 180_000n);
  assert.equal(r.netAPayer, 830_242n);
});

test("montant nul → tout à zéro", () => {
  const r = calcDecompte({ montantPeriodeHtGnf: 0n });
  assert.equal(r.tva, 0n);
  assert.equal(r.armp, 0n);
  assert.equal(r.ttc, 0n);
  assert.equal(r.precompteTva, 0n);
  assert.equal(r.retenueGarantie, 0n);
  assert.equal(r.avanceRecuperee, 0n);
  assert.equal(r.netAPayer, 0n);
});

test("taux personnalisés (RG 10 %, avance 0 %)", () => {
  const r = calcDecompte({ montantPeriodeHtGnf: 2_000_000n, tauxRetenueGarantie: 10, tauxAvance: 0 });
  // tva = 360 000 ; armp = 12 000 ; ttc = 2 372 000
  assert.equal(r.ttc, 2_372_000n);
  assert.equal(r.retenueGarantie, 237_200n);  // 2 372 000 × 10 %
  assert.equal(r.avanceRecuperee, 0n);        // avance désactivée
  // precompte = round(2 372 000 × 9/118) = 180 915
  assert.equal(r.precompteTva, 180_915n);
  // net = 2 372 000 − 180 915 − 237 200 − 12 000 − 0 = 1 941 885
  assert.equal(r.netAPayer, 1_941_885n);
});

test("le net à payer ne dépasse jamais le TTC (cohérence des déductions)", () => {
  const r = calcDecompte({ montantPeriodeHtGnf: 3_500_000n });
  assert.ok(r.netAPayer <= r.ttc, "net à payer doit être ≤ TTC");
  assert.ok(r.netAPayer > 0n, "net à payer doit rester positif");
});

test("tous les résultats sont des bigint (pas de flottant qui traîne)", () => {
  const r = calcDecompte({ montantPeriodeHtGnf: 1_234_567n });
  for (const [k, v] of Object.entries(r)) {
    assert.equal(typeof v, "bigint", `${k} doit être un bigint`);
  }
});

test("plafond avance — la récupération s'arrête au solde restant", () => {
  // avance calculée = 200 000 (20 %) mais il ne reste que 120 000 à récupérer
  const r = calcDecompte({ montantPeriodeHtGnf: 1_000_000n, avanceRestanteGnf: 120_000n });
  assert.equal(r.avanceRecuperee, 120_000n);
  // le net à payer augmente d'autant (200 000 − 120 000 = 80 000 de plus que le cas de base)
  const base = calcDecompte({ montantPeriodeHtGnf: 1_000_000n });
  assert.equal(r.netAPayer, base.netAPayer + 80_000n);
});

test("plafond avance — avance déjà intégralement récupérée → zéro déduction", () => {
  const r = calcDecompte({ montantPeriodeHtGnf: 1_000_000n, avanceRestanteGnf: 0n });
  assert.equal(r.avanceRecuperee, 0n);
});

test("plafond avance — solde négatif (sur-récupération passée) → zéro, jamais négatif", () => {
  const r = calcDecompte({ montantPeriodeHtGnf: 1_000_000n, avanceRestanteGnf: -50_000n });
  assert.equal(r.avanceRecuperee, 0n);
});

test("plafond avance — solde suffisant → récupération normale inchangée", () => {
  const r = calcDecompte({ montantPeriodeHtGnf: 1_000_000n, avanceRestanteGnf: 10_000_000n });
  assert.equal(r.avanceRecuperee, 200_000n);
});

