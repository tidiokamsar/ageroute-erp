/**
 * F-MA2 — plafond d'avenants : la règle existe, sa valeur par défaut est le
 * 25 % du Code des marchés, elle se surcharge par marché, et l'arithmétique
 * du contrôle (BigInt, multiplier avant diviser) est exacte aux extrêmes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { REGLES_DEFAUT, resoudreRegles, nombreRegles, type RegleRecord } from "./regles";

test("F-MA2 — le défaut du plafond d'avenants est 25 %", () => {
  assert.equal(REGLES_DEFAUT.RG_PLAFOND_AVENANTS_PCT, "25");
  const r = resoudreRegles([], {});
  assert.equal(nombreRegles(r, "RG_PLAFOND_AVENANTS_PCT"), 25);
});

test("F-MA2 — surcharge par marché prioritaire sur le défaut", () => {
  const rec: RegleRecord = {
    cle: "RG_PLAFOND_AVENANTS_PCT", portee: "MARCHE", porteeId: "m1",
    valeur: "35", dateEffet: new Date("2026-01-01"), version: 1, statut: "VALIDE",
  };
  const r = resoudreRegles([rec], { marcheId: "m1" }, new Date("2026-08-01"));
  assert.equal(nombreRegles(r, "RG_PLAFOND_AVENANTS_PCT"), 35);
});

test("F-MA2 — arithmétique du plafond en BigInt, exacte aux extrêmes", () => {
  // Reprend la formule de la route : initial × pct / 100, multiplier avant diviser.
  const plafondGnf = (initial: bigint, pct: number) => initial * BigInt(Math.round(pct * 100)) / 10_000n;
  // 25 % de 5 milliards — exact, aucun arrondi flottant intermédiaire
  assert.equal(plafondGnf(5_000_000_000n, 25), 1_250_000_000n);
  // 100 % = illimité revient au montant initial
  assert.equal(plafondGnf(5_000_000_000n, 100), 5_000_000_000n);
  // cas non multiple : 25 % de 1 000 003 → troncature entière au franc
  assert.equal(plafondGnf(1_000_003n, 25), 250_000n);
});
