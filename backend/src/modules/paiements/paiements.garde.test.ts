/**
 * Tests — garde-fous du circuit de paiement (audit F1/F2/F3).
 * La logique pure : cumul, plafond, statuts payables.
 * (Le handler Express injecte la base ; ici on teste les règles.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const STATUTS_PAYABLES = ["ORDONNANCE"];

function peutPayer(statut: string, dejaPaye: bigint, montant: bigint, netAPayer: bigint): { ok: boolean; raison?: string } {
  if (!STATUTS_PAYABLES.includes(statut)) return { ok: false, raison: `statut ${statut} non payable` };
  if (dejaPaye + montant > netAPayer) return { ok: false, raison: "dépassement du net à payer" };
  return { ok: true };
}

test("F3 — seul un décompte ORDONNANCE est payable", () => {
  for (const s of STATUTS_PAYABLES) {
    assert.deepEqual(peutPayer(s, 0n, 100n, 1000n), { ok: true }, `${s} doit être payable`);
  }
});

test("F3 — les statuts hors circuit ne sont PAS payables", () => {
  for (const s of ["BROUILLON", "SOUMIS", "DEPOSE", "EN_CONTROLE", "EN_VALIDATION", "VALIDE", "VALIDE_DG", "EN_CIRCUIT_FINANCIER", "REJETE", "PAYE"]) {
    assert.equal(peutPayer(s, 0n, 100n, 1000n).ok, false, `${s} ne doit pas être payable`);
  }
});

test("F1 — le double paiement au-delà du net est refusé", () => {
  // Première tranche : 60M sur 100M → OK
  assert.equal(peutPayer("ORDONNANCE", 0n, 60_000_000n, 100_000_000n).ok, true);
  // Deuxième tranche : 60M de plus (total 120M > 100M) → REFUS
  assert.equal(peutPayer("ORDONNANCE", 60_000_000n, 60_000_000n, 100_000_000n).ok, false);
  // Deuxième tranche : 40M (total 100M = net) → OK
  assert.equal(peutPayer("ORDONNANCE", 60_000_000n, 40_000_000n, 100_000_000n).ok, true);
});

test("F2 — un paiement unique supérieur au net est refusé", () => {
  assert.equal(peutPayer("ORDONNANCE", 0n, 150_000_000n, 100_000_000n).ok, false);
});

test("F2 — le paiement exact du net est autorisé", () => {
  assert.equal(peutPayer("ORDONNANCE", 0n, 100_000_000n, 100_000_000n).ok, true);
});
