import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLES_SCOPES, fusionnerPerimetre } from "./affectations";

/**
 * Rôles à périmètre. UGP a été ajouté le 20/08/2026 : les coordinateurs de
 * projet, internes comme externes, sont affectés à des projets ou des marchés.
 *
 * ⚠️ Conséquence à ne jamais perdre de vue : ajouter un rôle ici le rend AVEUGLE
 * tant qu'on ne lui affecte rien. Pas d'affectation = ne voit rien.
 */
test("les quatre roles a perimetre sont declares", () => {
  assert.deepEqual(ROLES_SCOPES, ["MISSION", "TECHNIQUE", "UGP", "BAILLEUR"]);
});

test("UGP est desormais un role a perimetre", () => {
  assert.ok(ROLES_SCOPES.includes("UGP"));
});

test("les roles de direction ne sont pas a perimetre", () => {
  for (const role of ["ADMIN", "DG", "DGA", "DAF", "DSF", "DMC", "AUDITEUR", "ENTREPRISE"]) {
    assert.equal(ROLES_SCOPES.includes(role), false, `${role} ne doit pas etre scope`);
  }
});

/**
 * Fusion des deux niveaux d'affectation : marchés cochés directement, et
 * marchés hérités des projets affectés.
 */
test("un marche present aux deux niveaux n'apparait qu'une fois", () => {
  const perimetre = fusionnerPerimetre(["m1", "m2"], ["m2", "m3"]);
  assert.deepEqual(perimetre, ["m1", "m2", "m3"]);
});

test("sans affectation de projet, seul le niveau marche compte", () => {
  assert.deepEqual(fusionnerPerimetre(["m2", "m1"], []), ["m1", "m2"]);
});

test("sans affectation de marche, seul le niveau projet compte", () => {
  assert.deepEqual(fusionnerPerimetre([], ["m5", "m4"]), ["m4", "m5"]);
});

test("aucune affectation des deux cotes donne un perimetre VIDE, pas universel", () => {
  const perimetre = fusionnerPerimetre([], []);
  assert.deepEqual(perimetre, []);
  assert.equal(perimetre.length, 0, "un tableau vide signifie AUCUN acces");
});

test("les doublons internes a un niveau sont absorbes", () => {
  assert.deepEqual(fusionnerPerimetre(["m1", "m1", "m1"], ["m1"]), ["m1"]);
});

test("le resultat est stable, donc comparable d'un appel a l'autre", () => {
  const a = fusionnerPerimetre(["m3", "m1", "m2"], ["m2"]);
  const b = fusionnerPerimetre(["m2", "m3", "m1"], ["m1"]);
  assert.deepEqual(a, b);
});
