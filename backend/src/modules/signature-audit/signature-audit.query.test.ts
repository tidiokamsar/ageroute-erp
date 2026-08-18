import test from "node:test";
import assert from "node:assert/strict";
import { bornerPagination, buildSignatureAuditWhere } from "./signature-audit.query";

/**
 * Contrôle n°9 du runbook de déploiement (injection SQL sur signature-audit).
 * Vérifié ici par test plutôt que par une requête manuelle authentifiée :
 * la propriété est prouvée à chaque exécution de `npm test`, et une régression
 * future qui reviendrait à concaténer les entrées ferait échouer ces cas.
 */

const CHARGE_UTILE = "' OR 1=1--";

test("injection SQL — la charge utile reste un paramètre lié, jamais du texte SQL", () => {
  const where = buildSignatureAuditWhere({ status: CHARGE_UTILE });

  // La valeur hostile part dans les paramètres...
  assert.ok(where.values.includes(CHARGE_UTILE), "la valeur doit être passée en paramètre");
  // ...et n'apparaît nulle part dans le texte de la requête.
  assert.ok(!where.sql.includes(CHARGE_UTILE), "la valeur ne doit pas être inlinée dans le SQL");
  assert.ok(!where.sql.includes("1=1--"), "aucun fragment de la charge utile dans le SQL");
});

test("injection SQL — même traitement sur objectType", () => {
  const where = buildSignatureAuditWhere({ objectType: CHARGE_UTILE });
  assert.ok(where.values.includes(CHARGE_UTILE));
  assert.ok(!where.sql.includes(CHARGE_UTILE));
});

test("injection SQL — les deux filtres combinés donnent deux paramètres distincts", () => {
  const where = buildSignatureAuditWhere({ status: "SIGNE", objectType: "DECOMPTE" });
  assert.deepEqual(where.values, ["SIGNE", "DECOMPTE"]);
});

test("filtres absents — clause neutre, aucun paramètre", () => {
  const where = buildSignatureAuditWhere({});
  assert.equal(where.values.length, 0);
  assert.ok(where.sql.includes("1=1"));
});

test("valeurs non textuelles converties en chaîne (pas d'objet injecté)", () => {
  const where = buildSignatureAuditWhere({ status: { toString: () => "BIDON" } });
  assert.deepEqual(where.values, ["BIDON"]);
});

test("pagination — bornée entre 1 et 200, jamais négative", () => {
  assert.deepEqual(bornerPagination(1000, 1), { limit: 200, page: 1, offset: 0 });
  assert.deepEqual(bornerPagination(-5, -3), { limit: 1, page: 1, offset: 0 });
  assert.deepEqual(bornerPagination(undefined, undefined), { limit: 20, page: 1, offset: 0 });
  assert.deepEqual(bornerPagination(50, 3), { limit: 50, page: 3, offset: 100 });
});

test("pagination — une entrée non numérique retombe sur les valeurs par défaut", () => {
  assert.deepEqual(bornerPagination("10; DROP TABLE users", "abc"), { limit: 20, page: 1, offset: 0 });
});
