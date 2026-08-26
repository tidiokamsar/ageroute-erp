import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { ApiError } from "./error.middleware";
import {
  assertResourceScope,
  buildDecompteScopeWhere,
  requireAttachementLigneScope,
} from "./resourceAccess.middleware";

const baseUser = {
  id: "user-1",
  email: "user@ageroute.gov.gn",
  nomComplet: "Utilisateur Test",
  entrepriseId: null,
};

test("le filtre d'une entreprise ne couvre que ses propres décomptes", () => {
  const scope = buildDecompteScopeWhere(
    { ...baseUser, role: "ENTREPRISE", entrepriseId: "entreprise-1" },
    null,
  );
  assert.deepEqual(scope, {
    deletedAt: null,
    marche: { deletedAt: null },
    entrepriseId: "entreprise-1",
  });
});

test("une entreprise sans rattachement ne voit aucune ressource", () => {
  const scope = buildDecompteScopeWhere(
    { ...baseUser, role: "ENTREPRISE" },
    null,
  );
  assert.deepEqual(scope, {
    deletedAt: null,
    marche: { deletedAt: null },
    id: { in: [] },
  });
});

test("le filtre d'un agent terrain est limité aux marchés affectés", () => {
  const scope = buildDecompteScopeWhere(
    { ...baseUser, role: "MISSION" },
    ["marche-1", "marche-2"],
  );
  assert.deepEqual(scope, {
    deletedAt: null,
    marche: { deletedAt: null },
    marcheId: { in: ["marche-1", "marche-2"] },
  });
});

test("une ressource hors entreprise ou hors marché affecté est masquée par un 404", () => {
  assert.throws(
    () => assertResourceScope(
      { ...baseUser, role: "ENTREPRISE", entrepriseId: "entreprise-1" },
      "marche-1",
      "entreprise-2",
      null,
    ),
    (error: unknown) => error instanceof ApiError && error.statusCode === 404,
  );
  assert.throws(
    () => assertResourceScope(
      { ...baseUser, role: "TECHNIQUE" },
      "marche-2",
      "entreprise-2",
      ["marche-1"],
    ),
    (error: unknown) => error instanceof ApiError && error.statusCode === 404,
  );
});

test("un administrateur conserve le périmètre global actif", () => {
  const scope = buildDecompteScopeWhere({ ...baseUser, role: "ADMIN" }, null);
  assert.deepEqual(scope, {
    deletedAt: null,
    marche: { deletedAt: null },
  });
  assert.doesNotThrow(() => assertResourceScope(
    { ...baseUser, role: "ADMIN" },
    "marche-2",
    "entreprise-2",
    null,
  ));
});

test("une ligne d'attachement hors entreprise est masquée par un 404", async (t) => {
  const delegate = prisma.attachementLigne as unknown as {
    findFirst: (...args: unknown[]) => Promise<unknown>;
  };
  const originalFindFirst = delegate.findFirst;
  delegate.findFirst = async () => ({
    attachement: {
      decompte: { marcheId: "marche-2", entrepriseId: "entreprise-2" },
    },
  });
  t.after(() => { delegate.findFirst = originalFindFirst; });
  const req = {
    user: { ...baseUser, role: "ENTREPRISE", entrepriseId: "entreprise-1" },
  } as Request;
  let received: unknown;
  await requireAttachementLigneScope(
    req,
    {} as Response,
    ((error?: unknown) => { received = error; }) as NextFunction,
    "ligne-2",
  );
  assert.ok(received instanceof ApiError);
  assert.equal(received.statusCode, 404);
  assert.equal(received.message, "Ressource introuvable");
});

test("une ligne absente et une ligne interdite utilisent toutes deux le statut 404", async (t) => {
  const delegate = prisma.attachementLigne as unknown as {
    findFirst: (...args: unknown[]) => Promise<unknown>;
  };
  const originalFindFirst = delegate.findFirst;
  delegate.findFirst = async () => null;
  t.after(() => { delegate.findFirst = originalFindFirst; });
  const req = {
    user: { ...baseUser, role: "ENTREPRISE", entrepriseId: "entreprise-1" },
  } as Request;
  let received: unknown;
  await requireAttachementLigneScope(
    req,
    {} as Response,
    ((error?: unknown) => { received = error; }) as NextFunction,
    "ligne-inexistante",
  );
  assert.ok(received instanceof ApiError);
  assert.equal(received.statusCode, 404);
  assert.equal(received.message, "Ressource introuvable");
});
