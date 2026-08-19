/**
 * Tests — verrou du correctif du défaut 2 (déploiement bloqué du 19/08).
 * Le moteur DOIT accepter les statuts "VALIDE" (ancien) ET "APPROUVEE"/"GELEE"
 * (nouveau cycle L0.2). Sans cela, après la migration VALIDE→APPROUVEE,
 * le moteur ignorerait silencieusement toutes les règles DAF.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resoudreRegles, type RegleRecord } from "./regles";

function regle(statut: string): RegleRecord {
  return {
    cle: "RG_ASSIETTE_RETENUE_GARANTIE",
    portee: "GLOBAL", porteeId: "",
    valeur: "HT",
    dateEffet: new Date("2026-01-01"),
    version: 1, statut,
  };
}

test("DÉFAUT 2 — le moteur accepte le statut ancien VALIDE", () => {
  const r = resoudreRegles([regle("VALIDE")]);
  assert.equal(r.RG_ASSIETTE_RETENUE_GARANTIE, "HT");
});

test("DÉFAUT 2 — le moteur accepte le nouveau statut APPROUVEE", () => {
  const r = resoudreRegles([regle("APPROUVEE")]);
  assert.equal(r.RG_ASSIETTE_RETENUE_GARANTIE, "HT");
});

test("DÉFAUT 2 — le moteur accepte le statut GELEE (règle figée mais active)", () => {
  const r = resoudreRegles([regle("GELEE")]);
  assert.equal(r.RG_ASSIETTE_RETENUE_GARANTIE, "HT");
});

test("DÉFAUT 2 — les statuts non actifs sont toujours ignorés", () => {
  for (const statut of ["BROUILLON", "SOUMISE", "REJETEE", "ARCHIVE"]) {
    const r = resoudreRegles([regle(statut)]);
    assert.equal(r.RG_ASSIETTE_RETENUE_GARANTIE, "TTC", `${statut} doit être ignoré`);
  }
});

test("DÉFAUT 2 — transition VALIDE→APPROUVEE : le moteur suit sans interruption", () => {
  const avant = resoudreRegles([regle("VALIDE")]);
  const apres = resoudreRegles([regle("APPROUVEE")]);
  assert.deepEqual(avant, apres, "La migration VALIDE→APPROUVEE ne doit RIEN changer au résultat");
});
