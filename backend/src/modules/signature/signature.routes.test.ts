import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../../middleware/error.middleware";

test("signature legacy — POST /signer est retiré sans mutation et oriente vers signature-audit", async () => {
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/ageroute_test";
  process.env.JWT_SECRET = "TestAccess_4ad47fd8b5a24f56ac7caa54c1d5eec56224c1fc";
  process.env.JWT_REFRESH_SECRET = "TestRefresh_390e665a3b0645b48caf1f2b3f6d18f5c2ad9a31";

  const { legacySignatureRetired } = await import("./signature.routes");
  let erreur: unknown;
  const next = ((err?: unknown) => { erreur = err; }) as NextFunction;

  legacySignatureRetired({} as Request, {} as Response, next);

  assert.ok(erreur instanceof ApiError);
  assert.equal(erreur.statusCode, 410);
  assert.match(erreur.message, /signature directe a été retirée/i);
  assert.match(erreur.message, /\/api\/signature-audit/);
});
