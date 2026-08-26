import assert from "node:assert/strict";
import { test } from "node:test";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { decomptesService } from "./decomptes.service";

test("les filtres client de la liste restent sous le périmètre serveur", async (t) => {
  const delegate = prisma.decompte as unknown as {
    findMany: (args: unknown) => Promise<unknown[]>;
    count: (args: unknown) => Promise<number>;
  };
  let findManyArgs: unknown;
  let countArgs: unknown;
  const originalFindMany = delegate.findMany;
  const originalCount = delegate.count;
  delegate.findMany = async (args: unknown) => {
    findManyArgs = args;
    return [];
  };
  delegate.count = async (args: unknown) => {
    countArgs = args;
    return 0;
  };
  t.after(() => {
    delegate.findMany = originalFindMany;
    delegate.count = originalCount;
  });
  const scopeWhere: Prisma.DecompteWhereInput = {
    deletedAt: null,
    entrepriseId: "entreprise-1",
  };
  const result = await decomptesService.list({
    entrepriseId: "entreprise-2",
    marcheId: "marche-2",
    scopeWhere,
  });
  const expectedWhere = {
    AND: [
      scopeWhere,
      { marcheId: "marche-2", entrepriseId: "entreprise-2" },
    ],
  };
  assert.deepEqual((findManyArgs as { where: unknown }).where, expectedWhere);
  assert.deepEqual((countArgs as { where: unknown }).where, expectedWhere);
  assert.deepEqual(result, {
    data: [],
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  });
});

test("le OR de la vue à traiter ne peut pas contourner le périmètre serveur", async (t) => {
  const decompteDelegate = prisma.decompte as unknown as {
    findMany: (args: unknown) => Promise<unknown[]>;
    count: (args: unknown) => Promise<number>;
  };
  const workflowDelegate = prisma.workflowInstance as unknown as {
    findMany: (args: unknown) => Promise<unknown[]>;
  };
  let findManyArgs: unknown;
  const originalDecompteFindMany = decompteDelegate.findMany;
  const originalDecompteCount = decompteDelegate.count;
  const originalWorkflowFindMany = workflowDelegate.findMany;
  decompteDelegate.findMany = async (args: unknown) => {
    findManyArgs = args;
    return [];
  };
  decompteDelegate.count = async () => 0;
  workflowDelegate.findMany = async () => [{
    decompteId: "decompte-hors-scope",
    etapeActuelle: 0,
    definition: { etapes: [{ roleRequis: "MISSION" }] },
  }];
  t.after(() => {
    decompteDelegate.findMany = originalDecompteFindMany;
    decompteDelegate.count = originalDecompteCount;
    workflowDelegate.findMany = originalWorkflowFindMany;
  });
  const scopeWhere: Prisma.DecompteWhereInput = {
    deletedAt: null,
    marcheId: { in: ["marche-1"] },
  };
  await decomptesService.list({
    aTraiter: true,
    role: "MISSION",
    scopeWhere,
  });
  assert.deepEqual((findManyArgs as { where: unknown }).where, {
    AND: [
      scopeWhere,
      {
        OR: [
          { id: { in: ["decompte-hors-scope"] } },
          { statut: "BROUILLON" },
        ],
      },
    ],
  });
});
