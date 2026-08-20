import { test } from "node:test";
import assert from "node:assert/strict";
import { MODULES } from "./modules.catalog";
import { ROLES_SCOPES } from "./affectations";
import { etapesWorkflow, etapesCircuitFinancier } from "./circuit-definitions";

/**
 * DSF — Direction de la Structuration Financière, créé le 20/08/2026.
 *
 * Le rôle est délibérément HORS CIRCUIT : la décision de gouvernance était
 * explicite — « le circuit actuel est validé et fonctionne, on n'y touche pas ».
 * Ces tests sont la garde de cette promesse. Si quelqu'un insère un jour DSF
 * dans une définition de workflow, ils échouent.
 */

const FINANCEMENTS = [
  "BANQUE_MONDIALE", "UE", "BAD", "BID", "BOAD", "BADEA", "AFD", "KFW",
  "BUDGET_NATIONAL", "FER", "AUTRE",
];

test("DSF n'apparait dans aucune etape de workflow, quel que soit le financement", () => {
  for (const financement of FINANCEMENTS) {
    const roles = etapesWorkflow(financement).flatMap((e) => JSON.stringify(e));
    assert.ok(
      !roles.some((r) => r.includes("DSF")),
      `DSF ne doit pas figurer dans le circuit ${financement}`,
    );
  }
});

test("DSF n'apparait dans aucune etape du circuit financier", () => {
  for (const financement of FINANCEMENTS) {
    const etapes = etapesCircuitFinancier(financement).map((e) => JSON.stringify(e));
    assert.ok(
      !etapes.some((e) => e.includes("DSF")),
      `DSF ne doit pas figurer dans le circuit financier ${financement}`,
    );
  }
});

test("DSF n'est pas un role scope : sa visibilite ne depend pas d'affectations", () => {
  assert.equal(ROLES_SCOPES.includes("DSF"), false);
});

/**
 * Le rôle voit le financier en lecture. Ce sont les `requireRole` de chaque
 * route qui accordent les actions, et aucune ne cite DSF : ouvrir le module
 * n'ouvre donc que la consultation.
 */
test("DSF accede aux modules de suivi financier", () => {
  const ouverts = MODULES.filter((m) => m.roles.includes("DSF")).map((m) => m.key).sort();
  for (const attendu of ["dashboard", "bi", "marches", "decomptes", "financements", "paiements", "financier", "garanties", "projets"]) {
    assert.ok(ouverts.includes(attendu), `le module ${attendu} doit etre ouvert a DSF`);
  }
});

test("DSF n'accede ni aux taches, ni a l'audit, ni a l'administration", () => {
  for (const ferme of ["workflow", "audit", "utilisateurs", "parametrage"]) {
    const module = MODULES.find((m) => m.key === ferme);
    assert.ok(module, `le module ${ferme} doit exister`);
    assert.equal(module.roles.includes("DSF"), false, `le module ${ferme} doit rester ferme a DSF`);
  }
});

test("le module Mes taches reste ferme a DSF — il n'a aucune validation a rendre", () => {
  const workflow = MODULES.find((m) => m.key === "workflow");
  assert.ok(workflow);
  assert.equal(workflow.roles.includes("DSF"), false);
});
