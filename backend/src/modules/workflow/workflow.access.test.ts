import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessWorkflowResource, canSeeWorkflowTask, isHumanBpmnStep } from "./workflow.access";

const resource = { entrepriseId: "entreprise-a", marcheIds: ["marche-a", "marche-b"] };

test("une entreprise ne peut accéder qu'à ses propres ressources et à aucune tâche interne", () => {
  assert.equal(canAccessWorkflowResource({ role: "ENTREPRISE", entrepriseId: "entreprise-a" }, resource, null), true);
  assert.equal(canAccessWorkflowResource({ role: "ENTREPRISE", entrepriseId: "entreprise-b" }, resource, null), false);
  assert.equal(canSeeWorkflowTask("ENTREPRISE", "ENTREPRISE", false, true), false);
});

test("MISSION et TECHNIQUE sont refusés sans affectation ou hors marché affecté", () => {
  const mission = { role: "MISSION", entrepriseId: null };
  assert.equal(canAccessWorkflowResource(mission, resource, []), false);
  assert.equal(canAccessWorkflowResource(mission, resource, ["marche-c"]), false);
  assert.equal(canAccessWorkflowResource(mission, resource, ["marche-b"]), true);
  assert.equal(canSeeWorkflowTask("MISSION", "MISSION", false, false), false);
  assert.equal(canSeeWorkflowTask("MISSION", "MISSION", false, true), true);
});

test("les autres rôles restent contrôlés par le rôle de l'étape", () => {
  assert.equal(canAccessWorkflowResource({ role: "DAF", entrepriseId: null }, resource, null), true);
  assert.equal(canSeeWorkflowTask("DAF", "DMC", false, true), false);
  assert.equal(canSeeWorkflowTask("ADMIN", "DMC", true, true), true);
});

test("aucune action humaine n'est autorisée sur une tâche système", () => {
  assert.equal(isHumanBpmnStep("SERVICE_TASK", false), false);
  assert.equal(isHumanBpmnStep("USER_TASK", true), false);
  assert.equal(isHumanBpmnStep("USER_TASK", false), true);
});
