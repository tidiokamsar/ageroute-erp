/**
 * Tests — garde-fous du circuit de paiement (audit F1/F2/F3).
 * La logique pure : cumul, plafond, statuts payables.
 * (Le handler Express injecte la base ; ici on teste les règles.)
 *
 * Revue 27/08/2026 : ce fichier testait une COPIE LOCALE des règles (STATUTS_PAYABLES
 * et peutPayer redéfinis ici) — une divergence entre le code productif et le test
 * serait passée inaperçue. Il teste désormais les fonctions RÉELLES de
 * paiements.regles.ts, consommées par le service. La garde de statut (F3) vit
 * dans le service (ORDONNANCE exigé, lignes 60/129) et est couverte par les
 * tests PG (paiements.service.pg.test.ts, PG_TEST=1).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifierNouvelOrdre, evaluerConfirmation, type PositionPaiement } from "./paiements.regles";

const pos = (over: Partial<PositionPaiement> = {}): PositionPaiement => ({
  engagementGnf: 0n,
  confirmeGnf: 0n,
  reserveGnf: 0n,
  ...over,
});

test("F1 — un nouvel ordre ne dépasse jamais le net à payer (fonction réelle)", () => {
  const ok = verifierNouvelOrdre({ netAPayerGnf: 1000n, position: pos({ engagementGnf: 0n }), montantGnf: 1000n });
  assert.equal(ok.autorise, true);
  assert.equal(ok.engagementApresGnf, 1000n);

  const depasse = verifierNouvelOrdre({ netAPayerGnf: 1000n, position: pos({ engagementGnf: 900n }), montantGnf: 200n });
  assert.equal(depasse.autorise, false);
  assert.match(depasse.motif ?? "", /Dépassement du net à payer/);
});

test("F1 — la confirmation compte le montant réel, réserves comprises (fonction réelle)", () => {
  const ok = evaluerConfirmation({ netAPayerGnf: 1000n, positionAutresPaiements: pos({ confirmeGnf: 0n, reserveGnf: 100n }), montantReelGnf: 800n });
  assert.equal(ok.autorise, true);
  assert.equal(ok.engagementApresGnf, 900n);
  assert.equal(ok.decomptePaye, false);

  const trop = evaluerConfirmation({ netAPayerGnf: 1000n, positionAutresPaiements: pos({ confirmeGnf: 500n, reserveGnf: 100n }), montantReelGnf: 500n });
  assert.equal(trop.autorise, false);
});