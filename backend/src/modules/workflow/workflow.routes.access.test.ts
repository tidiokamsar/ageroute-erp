import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4";
process.env.JWT_REFRESH_SECRET = "Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2H1g0F9e8D7c6";

type RouteHandler = (req: Record<string, unknown>, res: Record<string, unknown>, next: (error?: unknown) => void) => Promise<unknown>;

async function loadRoutes() {
  const [{ prisma }, { workflowRouter }, { bpmnRouter }] = await Promise.all([
    import("../../lib/prisma"),
    import("./workflow.routes"),
    import("../bpmn/bpmn.routes"),
  ]);
  return { prisma, workflowRouter, bpmnRouter };
}

function getRouteHandler(router: unknown, path: string, method: "get" | "post"): RouteHandler {
  const stack = (router as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: RouteHandler }> } }> }).stack;
  const layer = stack.find((candidate) => candidate.route?.path === path && candidate.route.methods[method]);
  assert.ok(layer?.route, `Route ${method.toUpperCase()} ${path} introuvable`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function createResponse() {
  let body: unknown;
  const response = {
    json(payload: unknown) {
      body = payload;
      return response;
    },
  };
  return { response, getBody: () => body };
}

function captureNext() {
  let error: unknown;
  return {
    next(value?: unknown) { error = value; },
    getError: () => error,
  };
}

function assertApiError(error: unknown, statusCode: number) {
  assert.ok(error instanceof Error);
  assert.equal((error as Error & { statusCode?: number }).statusCode, statusCode);
}

function replacePrismaProperty(
  t: TestContext,
  prisma: object,
  property: string,
  value: object,
) {
  const previous = Object.getOwnPropertyDescriptor(prisma, property);
  Object.defineProperty(prisma, property, { configurable: true, writable: true, value });
  t.after(() => {
    if (previous) Object.defineProperty(prisma, property, previous);
    else delete (prisma as Record<string, unknown>)[property];
  });
}

test("les listes workflow et BPMN d'une ENTREPRISE sont toujours vides", async () => {
  const { workflowRouter, bpmnRouter } = await loadRoutes();
  const actor = {
    id: "user-entreprise",
    email: "entreprise@example.test",
    role: "ENTREPRISE",
    nomComplet: "Entreprise",
    entrepriseId: "entreprise-a",
  };

  for (const [router, path] of [[workflowRouter, "/mes-taches"], [bpmnRouter, "/mes-taches"]] as const) {
    const { response, getBody } = createResponse();
    const { next, getError } = captureNext();
    await getRouteHandler(router, path, "get")({ user: actor }, response, next);
    assert.deepEqual(getBody(), []);
    assert.equal(getError(), undefined);
  }
});

test("une action workflow MISSION sans affectation est masquée par un 404", async (t: TestContext) => {
  const { prisma, workflowRouter } = await loadRoutes();
  replacePrismaProperty(t, prisma, "workflowInstance", {
    findFirst: async () => ({
      id: "workflow-a",
      etapeActuelle: 0,
      definition: { etapes: [{ id: "etape-a", nom: "Mission", roleRequis: "MISSION" }] },
      decompte: { id: "decompte-a", marcheId: "marche-a", entrepriseId: "entreprise-a" },
    }),
  });
  replacePrismaProperty(t, prisma, "marcheAffectation", { findMany: async () => [] });
  replacePrismaProperty(t, prisma, "projetAffectation", { findMany: async () => [] });
  replacePrismaProperty(t, prisma, "delegation", { findMany: async () => [] });

  const { response } = createResponse();
  const { next, getError } = captureNext();
  await getRouteHandler(workflowRouter, "/:instanceId/action", "post")({
    user: { id: "mission-a", email: "mission@example.test", role: "MISSION", nomComplet: "Mission", entrepriseId: null },
    params: { instanceId: "workflow-a" },
    body: { decision: "APPROUVE" },
  }, response, next);

  assertApiError(getError(), 404);
});

test("une action BPMN MISSION sans affectation est masquée par un 404", async (t: TestContext) => {
  const { prisma, bpmnRouter } = await loadRoutes();
  t.mock.method(prisma, "$queryRaw", async () => ([{
    id: "bpmn-a",
    definition_id: "definition-a",
    module_type: "DECOMPTE",
    entity_id: "decompte-a",
    etape_actuelle: 0,
    statut: "EN_COURS",
    suspended: false,
    audit_requis: false,
    created_at: new Date(),
    updated_at: new Date(),
  }]) as never);
  replacePrismaProperty(t, prisma, "decompte", {
    findFirst: async () => ({ marcheId: "marche-a", entrepriseId: "entreprise-a" }),
  });
  replacePrismaProperty(t, prisma, "marcheAffectation", { findMany: async () => [] });
  replacePrismaProperty(t, prisma, "projetAffectation", { findMany: async () => [] });
  replacePrismaProperty(t, prisma, "delegation", { findMany: async () => [] });

  const { response } = createResponse();
  const { next, getError } = captureNext();
  await getRouteHandler(bpmnRouter, "/:instanceId/action", "post")({
    user: { id: "mission-a", email: "mission@example.test", role: "MISSION", nomComplet: "Mission", entrepriseId: null },
    params: { instanceId: "bpmn-a" },
    body: { decision: "APPROUVE" },
  }, response, next);

  assertApiError(getError(), 404);
});

test("une SERVICE_TASK refuse toute action humaine, y compris ADMIN, avec un 403", async (t: TestContext) => {
  const { prisma, bpmnRouter } = await loadRoutes();
  let rawQueryCount = 0;
  t.mock.method(prisma, "$queryRaw", async () => {
    rawQueryCount += 1;
    if (rawQueryCount === 1) {
      return [{
        id: "bpmn-service",
        definition_id: "definition-a",
        module_type: "DECOMPTE",
        entity_id: "decompte-a",
        etape_actuelle: 0,
        statut: "EN_COURS",
        suspended: false,
        audit_requis: false,
        created_at: new Date(),
        updated_at: new Date(),
      }] as never;
    }
    return [{
      id: "step-service",
      definition_id: "definition-a",
      ordre: 1,
      nom: "Traitement automatique",
      type_tache: "SERVICE_TASK",
      role_requis: null,
      description: "",
      sla_jours: 0,
      is_optional: false,
      is_system: true,
    }] as never;
  });
  replacePrismaProperty(t, prisma, "decompte", {
    findFirst: async () => ({ marcheId: "marche-a", entrepriseId: "entreprise-a" }),
  });
  replacePrismaProperty(t, prisma, "delegation", { findMany: async () => [] });
  t.mock.method(prisma, "$executeRaw", async () => {
    assert.fail("Aucune écriture ne doit être exécutée pour une SERVICE_TASK");
  });

  const { response } = createResponse();
  const { next, getError } = captureNext();
  await getRouteHandler(bpmnRouter, "/:instanceId/action", "post")({
    user: { id: "admin-a", email: "admin@example.test", role: "ADMIN", nomComplet: "Admin", entrepriseId: null },
    params: { instanceId: "bpmn-service" },
    body: { decision: "APPROUVE" },
  }, response, next);

  assertApiError(getError(), 403);
});
