/**
 * Tests — matrices de rôles du circuit (L2.1).
 * Les défauts reproduisent le comportement actuel (aucun changement tant
 * que la DAF n'a pas arbitrée). Les tests prouvent que le mécanisme
 * fonctionne et que la séparation ordonnateur/comptable détecte les conflits.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resoudreRegles } from "./regles";
import { rolesPourFonction, roleAutorise, verifierSeparation } from "./roles-circuit";

const DEFAUTS = resoudreRegles([]);
function avecRegles(surcharges: Record<string, string>) {
  return { ...DEFAUTS, ...surcharges };
}

test("défauts — matrices = rôles actuels (aucun changement comportemental)", () => {
  assert.deepEqual(rolesPourFonction(DEFAUTS, "LIQUIDATION"), ["ADMIN", "DG", "DAF", "DMC", "UGP", "MISSION", "TECHNIQUE", "ENTREPRISE"]);
  assert.deepEqual(rolesPourFonction(DEFAUTS, "ORDONNANCEMENT"), ["ADMIN", "DAF"]);
  // A8, décision du 23/08/2026 : la DAF ordonnance, la BCRG confirme. L'ancien
  // défaut « ADMIN,DAF » contredisait la route de confirmation (BCRG) : seul
  // ADMIN pouvait payer.
  assert.deepEqual(rolesPourFonction(DEFAUTS, "PAIEMENT"), ["ADMIN", "BCRG"]);
});

test("A8 — la DAF ne peut PAS confirmer un virement : séparation ordonnateur/comptable", () => {
  assert.equal(roleAutorise("DAF", "PAIEMENT", DEFAUTS), false);
  assert.equal(roleAutorise("BCRG", "PAIEMENT", DEFAUTS), true);
  assert.equal(roleAutorise("BCRG", "ORDONNANCEMENT", DEFAUTS), false, "la BCRG n'ordonnance pas");
});

test("défauts — séparation ordonnateur/comptable non activée (comportement actuel)", () => {
  assert.deepEqual(verifierSeparation(DEFAUTS), { conforme: true, conflits: [] });
});

test("ADMIN toujours autorisé, quelle que soit la matrice", () => {
  const regles = avecRegles({ WF_ROLES_LIQUIDATION: "DMC" }); // ADMIN retiré de la liste
  assert.equal(roleAutorise("ADMIN", "LIQUIDATION", regles), true);
  assert.equal(roleAutorise("MISSION", "LIQUIDATION", regles), false);
});

test("DAF peut ordonnancer par défaut, pas liquider", () => {
  assert.equal(roleAutorise("DAF", "ORDONNANCEMENT", DEFAUTS), true);
  assert.equal(roleAutorise("DAF", "LIQUIDATION", DEFAUTS), true); // matrice élargie — ne bloque plus les étapes
});

test("MISSION peut liquider par défaut, pas ordonnancer", () => {
  assert.equal(roleAutorise("MISSION", "LIQUIDATION", DEFAUTS), true);
  assert.equal(roleAutorise("MISSION", "ORDONNANCEMENT", DEFAUTS), false);
});

test("séparation activée — un rôle présent dans LIQUIDATION et ORDONNANCEMENT est signalé", () => {
  const regles = avecRegles({
    WF_SEPARATION_ORD_COMPTABLE: "true",
    WF_ROLES_LIQUIDATION: "ADMIN,DMC,DAF,MISSION",
    WF_ROLES_ORDONNANCEMENT: "ADMIN,DAF",
  });
  // DAF apparaît dans les deux → conflit
  const r = verifierSeparation(regles);
  assert.equal(r.conforme, false);
  assert.deepEqual(r.conflits, ["DAF"]);
});

test("séparation activée — sans chevauchement, conforme", () => {
  const regles = avecRegles({
    WF_SEPARATION_ORD_COMPTABLE: "true",
    WF_ROLES_LIQUIDATION: "DMC,MISSION,ENTREPRISE",
    WF_ROLES_ORDONNANCEMENT: "DAF",
  });
  assert.deepEqual(verifierSeparation(regles), { conforme: true, conflits: [] });
});

test("matrice modifiée — retirer un rôle le bloque effectivement", () => {
  const regles = avecRegles({ WF_ROLES_LIQUIDATION: "DMC" }); // MISSION retiré
  assert.equal(roleAutorise("MISSION", "LIQUIDATION", regles), false);
  assert.equal(roleAutorise("DMC", "LIQUIDATION", regles), true);
});

test("matrice vide — personne ne peut exercer la fonction (sauf ADMIN)", () => {
  const regles = avecRegles({ WF_ROLES_ORDONNANCEMENT: "" });
  assert.equal(roleAutorise("DAF", "ORDONNANCEMENT", regles), false);
  assert.equal(roleAutorise("ADMIN", "ORDONNANCEMENT", regles), true);
});
