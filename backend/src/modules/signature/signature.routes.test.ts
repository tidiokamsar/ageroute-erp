import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../../middleware/error.middleware";

test("signature legacy — POST /signer est retiré sans mutation et oriente vers signature-audit", async () => {
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/ageroute_test";
  // Secrets d'essai d'au moins 48 caractères, distincts l'un de l'autre et
  // sans motif devinable : ce sont les exigences que config/env.ts impose
  // désormais au démarrage. Des valeurs plus courtes faisaient échouer le
  // chargement du module, pas la règle métier que ce test vérifie.
  process.env.JWT_SECRET ??= "essai-acces-9f2c7a13e5b84d60a1c8f47b2e93d015a6c7";
  process.env.JWT_REFRESH_SECRET ??= "essai-rafraichissement-4b81d3e07a62c95f18ad3e2b74c60915";

  const { legacySignatureRetired } = await import("./signature.routes");
  let erreur: unknown;
  const next = ((err?: unknown) => { erreur = err; }) as NextFunction;

  legacySignatureRetired({} as Request, {} as Response, next);

  assert.ok(erreur instanceof ApiError);
  assert.equal(erreur.statusCode, 410);
  assert.match(erreur.message, /signature directe a été retirée/i);
  assert.match(erreur.message, /\/api\/signature-audit/);
});
