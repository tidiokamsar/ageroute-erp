import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { entrepriseCreateSchema, entrepriseUpdateSchema, documentSchema, contactSchema } from "./entreprises.schema";
import { entreprisesService, checkEligibilite, computeScore } from "./entreprises.service";
import { ApiError } from "../../middleware/error.middleware";
import { z } from "zod";
import { entrepriseIdOf } from "../../lib/scope";
import { getMarchesAffectes } from "../../lib/affectations";

export const entreprisesRouter = Router();
entreprisesRouter.use(requireAuth);

// ─── Stats globales ───────────────────────────────────────────────────────────

entreprisesRouter.get("/stats", async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json(await entreprisesService.stats()); } catch (err) { next(err); }
});

// ─── Liste + filtres ──────────────────────────────────────────────────────────

entreprisesRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Périmètre : titulaires des marchés affectés, ou sa propre entreprise
    // pour un compte ENTREPRISE.
    let entrepriseIds: string[] | null = null;
    if (req.user?.role === "ENTREPRISE") {
      const mienne = await entrepriseIdOf(req.user.id);
      entrepriseIds = mienne ? [mienne] : [];
    } else if (req.user) {
      const affectes = await getMarchesAffectes(req.user.id, req.user.role);
      if (affectes) {
        const { prisma } = await import("../../lib/prisma");
        const marches = await prisma.marche.findMany({
          where: { id: { in: affectes } }, select: { entrepriseId: true },
        });
        entrepriseIds = [...new Set(marches.map((m) => m.entrepriseId))];
      }
    }

    res.json(await entreprisesService.list({
      entrepriseIds,
      page:      Number(req.query.page) || 1,
      pageSize:  Number(req.query.pageSize) || 20,
      search:    req.query.search as string,
      statut:    req.query.statut as string,
      scoreGte:  req.query.scoreGte !== undefined ? Number(req.query.scoreGte) : undefined,
      scoreLt:   req.query.scoreLt  !== undefined ? Number(req.query.scoreLt)  : undefined,
    }));
  } catch (err) { next(err); }
});

// ─── CRUD ─────────────────────────────────────────────────────────────────────

entreprisesRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await entreprisesService.getById(req.params.id)); } catch (err) { next(err); }
});

entreprisesRouter.post("/", requireRole("ADMIN","DMC","DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    res.status(201).json(await entreprisesService.create(entrepriseCreateSchema.parse(req.body) as never, req.user.id));
  } catch (err) { next(err); }
});

entreprisesRouter.put("/:id", requireRole("ADMIN","DMC","DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    res.json(await entreprisesService.update(req.params.id, entrepriseUpdateSchema.parse(req.body) as never, req.user.id));
  } catch (err) { next(err); }
});

entreprisesRouter.delete("/:id", requireRole("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    await entreprisesService.remove(req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) { next(err); }
});

// ─── Conformité ───────────────────────────────────────────────────────────────

// Recalcul manuel du score
entreprisesRouter.post("/:id/conformite/verifier", requireRole("ADMIN","DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const { commentaire } = z.object({ commentaire: z.string().optional() }).parse(req.body);
    res.json(await entreprisesService.verifierConformite(req.params.id, req.user.id, commentaire));
  } catch (err) { next(err); }
});

// Éligibilité (utilisée par décomptes/marchés — retourne ok + raisons)
entreprisesRouter.get("/:id/eligibilite", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await checkEligibilite(req.params.id));
  } catch (err) { next(err); }
});

// Blocage admin
entreprisesRouter.post("/:id/bloquer", requireRole("ADMIN","DG","DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const { motif } = z.object({ motif: z.string().min(3) }).parse(req.body);
    res.json(await entreprisesService.bloquer(req.params.id, motif, req.user.id));
  } catch (err) { next(err); }
});

// Déblocage après régularisation
entreprisesRouter.post("/:id/debloquer", requireRole("ADMIN","DG","DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const { commentaire } = z.object({ commentaire: z.string().min(3) }).parse(req.body);
    res.json(await entreprisesService.debloquer(req.params.id, commentaire, req.user.id));
  } catch (err) { next(err); }
});

// ─── Documents ────────────────────────────────────────────────────────────────

entreprisesRouter.get("/:id/documents", async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await entreprisesService.listDocuments(req.params.id)); } catch (err) { next(err); }
});

entreprisesRouter.post("/:id/documents", requireRole("ADMIN","DMC","DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    res.status(201).json(await entreprisesService.addDocument(req.params.id, documentSchema.parse(req.body) as never, req.user.id));
  } catch (err) { next(err); }
});

entreprisesRouter.post("/:id/documents/:docId/valider", requireRole("ADMIN","DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const { valide, observations } = z.object({ valide: z.boolean(), observations: z.string().optional() }).parse(req.body);
    res.json(await entreprisesService.validerDocument(req.params.docId, valide, req.user.id, observations));
  } catch (err) { next(err); }
});

entreprisesRouter.delete("/:id/documents/:docId", requireRole("ADMIN","DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    res.json(await entreprisesService.removeDocument(req.params.docId, req.user.id));
  } catch (err) { next(err); }
});

// ─── Contacts ─────────────────────────────────────────────────────────────────

entreprisesRouter.get("/:id/contacts", async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await entreprisesService.listContacts(req.params.id)); } catch (err) { next(err); }
});

entreprisesRouter.post("/:id/contacts", requireRole("ADMIN","DMC","DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await entreprisesService.addContact(req.params.id, contactSchema.parse(req.body) as never));
  } catch (err) { next(err); }
});

entreprisesRouter.delete("/:id/contacts/:cid", requireRole("ADMIN","DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await entreprisesService.removeContact(req.params.cid);
    res.status(204).send();
  } catch (err) { next(err); }
});

// ─── Alertes ─────────────────────────────────────────────────────────────────

entreprisesRouter.get("/:id/alertes", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inclure = req.query.toutes === "true";
    res.json(await entreprisesService.listAlertes(req.params.id, inclure));
  } catch (err) { next(err); }
});

entreprisesRouter.post("/:id/alertes/:aid/acquitter", requireRole("ADMIN","DMC","DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    res.json(await entreprisesService.acquitterAlerte(req.params.aid, req.user.id));
  } catch (err) { next(err); }
});

// ─── Performance ─────────────────────────────────────────────────────────────

entreprisesRouter.get("/:id/performance", async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await entreprisesService.getPerformance(req.params.id)); } catch (err) { next(err); }
});

// ─── Historique conformité ────────────────────────────────────────────────────

entreprisesRouter.get("/:id/historique-conformite", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prisma } = await import("../../lib/prisma");
    const data = await prisma.conformiteVerification.findMany({
      where: { entrepriseId: req.params.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(data);
  } catch (err) { next(err); }
});

// ─── Marchés et décomptes liés ────────────────────────────────────────────────

entreprisesRouter.get("/:id/marches", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prisma } = await import("../../lib/prisma");
    const data = await prisma.marche.findMany({
      where: { entrepriseId: req.params.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { decomptes: true } } },
    });
    res.json(data);
  } catch (err) { next(err); }
});

entreprisesRouter.get("/:id/decomptes", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prisma } = await import("../../lib/prisma");
    const data = await prisma.decompte.findMany({
      where: { entrepriseId: req.params.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { marche: { select: { reference: true, intitule: true } } },
    });
    res.json(data);
  } catch (err) { next(err); }
});
