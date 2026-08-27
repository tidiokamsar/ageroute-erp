import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../../middleware/error.middleware";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/ageroute_test";
process.env.JWT_SECRET ??= "essai-acces-9f2c7a13e5b84d60a1c8f47b2e93d015a6c7";
process.env.JWT_REFRESH_SECRET ??= "essai-rafraichissement-4b81d3e07a62c95f18ad3e2b74c60915";

const SOURCE = readFileSync(path.join(__dirname, "bpmn.routes.ts"), "utf8");

test("le moteur BPMN refuse toute écriture, avec un 410 qui oriente vers le circuit unique", async () => {
  const { ecritureBpmnRetiree } = await import("./bpmn.routes");
  let erreur: unknown;
  ecritureBpmnRetiree({} as Request, {} as Response, ((e?: unknown) => { erreur = e; }) as NextFunction);

  assert.ok(erreur instanceof ApiError, "le refus doit être une ApiError");
  assert.equal((erreur as ApiError).statusCode, 410, "410 Gone : la route a existé, elle est retirée");
  assert.match((erreur as ApiError).message, /\/api\/workflow/, "le message doit orienter vers le circuit unique");
});

test("les trois routes d écriture portent le refus EN TÊTE de chaîne", () => {
  // Placé en tête, le refus s'exécute avant tout autre middleware : le handler
  // qui suit — conservé pour documenter ce que faisait ce moteur — n'est plus
  // jamais atteint. Placé ailleurs, il pourrait être court-circuité.
  for (const route of ['post("/soumettre/:moduleType/:entityId"', 'post("/:instanceId/action"', 'patch("/:instanceId/lever-suspension"']) {
    const ligne = SOURCE.split("\n").find((l) => l.includes(route));
    assert.ok(ligne, `route introuvable : ${route}`);
    const apresChemin = ligne!.slice(ligne!.indexOf(route) + route.length);
    const premierMiddleware = apresChemin.split(",")[1]?.trim() ?? "";
    assert.match(premierMiddleware, /ecritureBpmnRetiree/,
      `${route} : le refus doit être le PREMIER middleware, or c'est « ${premierMiddleware} »`);
  }
});

test("aucune écriture BPMN ne subsiste hors des trois routes retirées", () => {
  // Le moteur écrivait par SQL brut, hors de tout contrôle du circuit unique :
  // insertion d'instance, statut du décompte forcé, avancement d'étape — sans
  // séparation des tâches, sans contrôle d'affectation, sans ligne de
  // validation. Si une nouvelle écriture apparaît, elle doit être refusée aussi.
  const ecritures = SOURCE.match(/\$executeRaw|INSERT INTO bpmn_|UPDATE bpmn_/g) ?? [];
  const routesEcriture = (SOURCE.match(/bpmnRouter\.(post|put|delete|patch)\(/g) ?? []).length;
  assert.equal(routesEcriture, 3,
    `Le module expose ${routesEcriture} routes d'écriture ; seules les trois routes retirées sont attendues. `
    + "Toute nouvelle route d'écriture doit porter `ecritureBpmnRetiree` en tête.");
  assert.ok(ecritures.length > 0, "les écritures brutes restent dans le code retiré, pour mémoire");
});
