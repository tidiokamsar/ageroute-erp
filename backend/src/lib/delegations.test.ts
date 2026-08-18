/**
 * Tests — portée des rôles avec délégation d'intérim (lib/delegations).
 * La fonction pure porteeRoles() est le cœur du contrôle d'accès des
 * workflows : rôle propre + rôles délégués actifs, ADMIN non héritable.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { porteeRoles } from "./delegations";

test("porteeRoles — le rôle propre est toujours porté", () => {
  assert.deepEqual(porteeRoles("DAF", []), ["DAF"]);
});

test("porteeRoles — les rôles délégués actifs sont ajoutés", () => {
  assert.deepEqual(porteeRoles("MISSION", ["DMC", "TECHNIQUE"]), ["MISSION", "DMC", "TECHNIQUE"]);
});

test("porteeRoles — le suppléant d'un DG porte le rôle DG (supervision)", () => {
  const roles = porteeRoles("DAF", ["DG"]);
  assert.ok(roles.includes("DG"));
});

test("porteeRoles — ADMIN n'est JAMAIS héritable par délégation (anti-élévation)", () => {
  const roles = porteeRoles("DAF", ["ADMIN", "DG"]);
  assert.ok(!roles.includes("ADMIN"), "le rôle ADMIN ne doit pas être délégable");
  assert.ok(roles.includes("DG"));
});

test("porteeRoles — déduplication des rôles identiques", () => {
  assert.deepEqual(porteeRoles("DMC", ["DMC", "DMC"]), ["DMC"]);
});

test("porteeRoles — un DAF déléguant DMC : le titulaire garde son rôle, le suppléant porte DAF", () => {
  // Le titulaire (DAF) garde uniquement DAF ; le suppléant (MISSION) porte MISSION + DAF
  assert.deepEqual(porteeRoles("DAF", []), ["DAF"]);
  assert.deepEqual(porteeRoles("MISSION", ["DAF"]), ["MISSION", "DAF"]);
});

test("porteeRoles — cas limite : liste de délégations vide pour un rôle interne", () => {
  assert.deepEqual(porteeRoles("DG", []), ["DG"]);
});
