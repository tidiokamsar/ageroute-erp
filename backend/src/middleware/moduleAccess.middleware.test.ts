import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { ApiError } from "./error.middleware";
import { checkModuleAccess, type EffectiveModulesResolver } from "./moduleAccess.middleware";

type Appel = { erreur: unknown; appelsResolver: number };

async function appeler(
  role: string | null,
  modules: string[] = [],
  erreurResolver?: Error,
): Promise<Appel> {
  let erreur: unknown;
  let appelsResolver = 0;
  const resolver: EffectiveModulesResolver = async () => {
    appelsResolver += 1;
    if (erreurResolver) throw erreurResolver;
    return modules;
  };
  const middleware = checkModuleAccess("signatures", resolver);
  const req = (role === null ? {} : {
    user: { id: "utilisateur-1", email: "agent@ageroute.gov.gn", role },
  }) as Request;
  const next = ((err?: unknown) => { erreur = err; }) as NextFunction;

  await middleware(req, {} as Response, next);
  return { erreur, appelsResolver };
}

test("module — une requête non authentifiée reçoit 401 sans interroger les droits", async () => {
  const resultat = await appeler(null);
  assert.ok(resultat.erreur instanceof ApiError);
  assert.equal(resultat.erreur.statusCode, 401);
  assert.equal(resultat.appelsResolver, 0);
});

test("module — ADMIN reste autorisé sans interroger les droits", async () => {
  const resultat = await appeler("ADMIN", []);
  assert.equal(resultat.erreur, undefined);
  assert.equal(resultat.appelsResolver, 0);
});

test("module — le module doit être présent dans la liste effective", async () => {
  const autorise = await appeler("DG", ["dashboard", "signatures"]);
  assert.equal(autorise.erreur, undefined);
  assert.equal(autorise.appelsResolver, 1);

  const refuse = await appeler("ENTREPRISE", ["decomptes"]);
  assert.ok(refuse.erreur instanceof ApiError);
  assert.equal(refuse.erreur.statusCode, 403);
  assert.equal(refuse.erreur.message, "Accès à ce module non autorisé");
  assert.equal(refuse.appelsResolver, 1);
});

test("module — une liste effective vide refuse par défaut", async () => {
  const resultat = await appeler("DSF", []);
  assert.ok(resultat.erreur instanceof ApiError);
  assert.equal(resultat.erreur.statusCode, 403);
});

test("module — une erreur du resolver est transmise au gestionnaire Express", async () => {
  const panne = new Error("base indisponible");
  const resultat = await appeler("DG", [], panne);
  assert.equal(resultat.erreur, panne);
});
