/**
 * Référentiel Projets — AGEROUTE ERP
 * Module parent de Marchés, Attachements et Décomptes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import { z } from "zod";

export const projetsRouter = Router();
projetsRouter.use(requireAuth);

const projetCreateSchema = z.object({
  code:                z.string().min(2).toUpperCase(),
  intitule:            z.string().min(3),
  description:         z.string().optional(),
  type:                z.enum(["TRAVAUX_ROUTIERS","PONT_OUVRAGE_ART","PISTE_RURALE","BITUMAGE",
                               "REHABILITATION","ENTRETIEN_COURANT","ENTRETIEN_PERIODIQUE",
                               "ETUDE_TECHNIQUE","SUPERVISION","AUTRE"]).optional(),
  categorie:           z.string().optional(),
  programme:           z.string().optional(),
  axeStrategique:      z.string().optional(),
  region:              z.string().optional(),
  prefecture:          z.string().optional(),
  commune:             z.string().optional(),
  troncon:             z.string().optional(),
  pkDebut:             z.number().optional(),
  pkFin:               z.number().optional(),
  latGps:              z.number().optional(),
  lonGps:              z.number().optional(),
  directionPorteuse:   z.string().optional(),
  responsableNom:      z.string().optional(),
  chefProjetNom:       z.string().optional(),
  missionControle:     z.string().optional(),
  ugp:                 z.string().optional(),
  dateOs:              z.string().optional(),
  dateDemarrage:       z.string().optional(),
  datePrevFinTravaux:  z.string().optional(),
  delaiMois:           z.number().int().optional(),
  sourceFinancement:   z.string().optional(),
  bailleurPrincipal:   z.string().optional(),
  bailleurSecondaire:  z.string().optional(),
  budgetInitialGnf:    z.number().min(0).optional(),
  budgetReviseGnf:     z.number().min(0).optional(),
  avancementPhysique:  z.number().min(0).max(100).optional(),
  niveauConfiance:     z.enum(["FAIBLE","MOYEN","ELEVE"]).optional(),
  observations:        z.string().optional(),
});

const includeBase = {
  _count: { select: { marches: true, decomptes: true, attachements: true, historique: true } },
};

// GET /projets
projetsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page     = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Number(req.query.pageSize) || 50);
    const where: Record<string, unknown> = { deletedAt: null };
    if (req.query.statut)   where.statut = req.query.statut;
    if (req.query.type)     where.type   = req.query.type;
    if (req.query.region)   where.region = { contains: req.query.region as string, mode: "insensitive" };
    if (req.query.bailleur) where.bailleurPrincipal = { contains: req.query.bailleur as string, mode: "insensitive" };
    if (req.query.search)   where.OR = [
      { intitule:    { contains: req.query.search as string, mode: "insensitive" } },
      { code:        { contains: req.query.search as string, mode: "insensitive" } },
      { troncon:     { contains: req.query.search as string, mode: "insensitive" } },
      { bailleurPrincipal: { contains: req.query.search as string, mode: "insensitive" } },
    ];
    const [data, total] = await Promise.all([
      prisma.projet.findMany({ where, skip: (page-1)*pageSize, take: pageSize, orderBy: { createdAt: "desc" }, include: includeBase }),
      prisma.projet.count({ where }),
    ]);
    res.json({ data, total, page, pageSize, totalPages: Math.ceil(total/pageSize)||1 });
  } catch (err) { next(err); }
});

// GET /projets/stats
projetsRouter.get("/stats", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [total, parStatut, budgetAgg, payeAgg] = await Promise.all([
      prisma.projet.count({ where: { deletedAt: null } }),
      prisma.projet.groupBy({ by: ["statut"], where: { deletedAt: null }, _count: { id: true } }),
      prisma.projet.aggregate({ where: { deletedAt: null }, _sum: { budgetInitialGnf: true } }),
      prisma.projet.aggregate({ where: { deletedAt: null }, _sum: { montantPayeGnf: true } }),
    ]);
    const sm: Record<string, number> = {};
    for (const row of parStatut) sm[row.statut] = row._count.id;
    res.json({
      total,
      enExecution:    sm["EN_EXECUTION"]    ?? 0,
      suspendus:      sm["SUSPENDU"]        ?? 0,
      clos:           sm["CLOS"]            ?? 0,
      enRetard:       sm["EN_RETARD"]       ?? 0,
      approuves:      sm["APPROUVE"]        ?? 0,
      budgetTotalGnf: (budgetAgg._sum.budgetInitialGnf ?? 0n).toString(),
      montantPayeGnf: (payeAgg._sum.montantPayeGnf    ?? 0n).toString(),
    });
  } catch (err) { next(err); }
});

// GET /projets/:id
projetsRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projet = await prisma.projet.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        ...includeBase,
        historique: { orderBy: { changedAt: "desc" }, take: 20 },
        marches: {
          where: { deletedAt: null },
          include: { entreprise: { select: { raisonSociale: true } } },
          orderBy: { createdAt: "desc" },
        },
        decomptes: {
          where: { deletedAt: null },
          select: { id: true, reference: true, statut: true, montantPeriodeHtGnf: true, montantTtcGnf: true, netAPayer: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 30,
        },
        attachements: {
          select: { id: true, code: true, statut: true, montantHtGnf: true, montantTtcGnf: true, natureTravaux: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 30,
        },
      },
    });
    if (!projet) throw new ApiError(404, "Projet introuvable");
    res.json(projet);
  } catch (err) { next(err); }
});

// POST /projets
projetsRouter.post("/", requireRole("ADMIN","DMC","DAF","DG"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const body = projetCreateSchema.parse(req.body);
    const data: Record<string, unknown> = {
      ...body,
      budgetInitialGnf: body.budgetInitialGnf ? BigInt(Math.round(body.budgetInitialGnf)) : 0n,
      budgetReviseGnf:  body.budgetReviseGnf  ? BigInt(Math.round(body.budgetReviseGnf))  : 0n,
      dateOs:            body.dateOs            ? new Date(body.dateOs)            : undefined,
      dateDemarrage:     body.dateDemarrage     ? new Date(body.dateDemarrage)     : undefined,
      datePrevFinTravaux:body.datePrevFinTravaux? new Date(body.datePrevFinTravaux): undefined,
    };
    const projet = await prisma.projet.create({ data: data as never });
    await prisma.projetStatusHistory.create({
      data: { projetId: projet.id, nouveauStatut: "PREPARATION", motif: "Création du projet", changedByEmail: req.user.email },
    });
    await logAudit({ userId: req.user.id, action: "CREATE", entityType: "Projet", entityId: projet.id, after: projet });
    res.status(201).json(projet);
  } catch (err) { next(err); }
});

// PUT /projets/:id
projetsRouter.put("/:id", requireRole("ADMIN","DMC","DAF","DG"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const before = await prisma.projet.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!before) throw new ApiError(404, "Projet introuvable");
    const body = projetCreateSchema.partial().parse(req.body);
    const data: Record<string, unknown> = { ...body };
    if (body.budgetInitialGnf !== undefined) data.budgetInitialGnf = BigInt(Math.round(body.budgetInitialGnf));
    if (body.budgetReviseGnf  !== undefined) data.budgetReviseGnf  = BigInt(Math.round(body.budgetReviseGnf));
    if (body.dateOs)             data.dateOs             = new Date(body.dateOs);
    if (body.dateDemarrage)      data.dateDemarrage      = new Date(body.dateDemarrage);
    if (body.datePrevFinTravaux) data.datePrevFinTravaux = new Date(body.datePrevFinTravaux);
    const updated = await prisma.projet.update({ where: { id: req.params.id }, data: data as never });
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "Projet", entityId: req.params.id, before, after: updated });
    res.json(updated);
  } catch (err) { next(err); }
});

// PATCH /projets/:id/statut
projetsRouter.patch("/:id/statut", requireRole("ADMIN","DMC","DAF","DG"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const { statut, motif } = z.object({
      statut: z.enum(["PREPARATION","EN_VALIDATION","APPROUVE","EN_EXECUTION","SUSPENDU",
                      "EN_RETARD","EN_AVENANT","RECEPTION_PARTIELLE","RECEPTION_DEFINITIVE","CLOS","ANNULE"]),
      motif:  z.string().optional(),
    }).parse(req.body);
    const before = await prisma.projet.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!before) throw new ApiError(404, "Projet introuvable");
    const updated = await prisma.projet.update({ where: { id: req.params.id }, data: { statut, motifStatut: motif } as never });
    await prisma.projetStatusHistory.create({
      data: { projetId: req.params.id, ancienStatut: before.statut, nouveauStatut: statut, motif, changedByEmail: req.user.email },
    });
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "Projet", entityId: req.params.id,
      before: { statut: before.statut }, after: { statut, motif } });
    res.json(updated);
  } catch (err) { next(err); }
});

// PATCH /projets/:id/avancement
projetsRouter.patch("/:id/avancement", requireRole("ADMIN","DMC","DG"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      avancementPhysique: z.number().min(0).max(100).optional(),
      scoreDelai:         z.number().min(0).max(1).optional(),
      scoreCout:          z.number().min(0).max(1).optional(),
      scoreRisque:        z.number().min(0).max(1).optional(),
      niveauConfiance:    z.enum(["FAIBLE","MOYEN","ELEVE"]).optional(),
    }).parse(req.body);
    const updated = await prisma.projet.update({ where: { id: req.params.id }, data: body as never });
    res.json(updated);
  } catch (err) { next(err); }
});

// GET /projets/:id/kpis
projetsRouter.get("/:id/kpis", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projet = await prisma.projet.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        _count: { select: { marches: true, decomptes: true, attachements: true } },
        decomptes: { select: { statut: true, montantPeriodeHtGnf: true, netAPayer: true } },
        marches:   { select: { statut: true, montantInitialGnf: true }, where: { deletedAt: null } },
      },
    });
    if (!projet) throw new ApiError(404, "Projet introuvable");

    const totalMarcheHt   = projet.marches.reduce((s, m) => s + Number(m.montantInitialGnf), 0);
    const totalDecompteHt = projet.decomptes.reduce((s, d) => s + Number(d.montantPeriodeHtGnf), 0);
    const totalPaye       = projet.decomptes.filter((d) => d.statut === "PAYE").reduce((s, d) => s + Number(d.netAPayer), 0);
    const budget          = Number(projet.budgetReviseGnf) || Number(projet.budgetInitialGnf) || 1;
    const avancFinancier  = budget > 0 ? Math.round(totalPaye / budget * 10000) / 100 : 0;
    const tauxDecaiss     = budget > 0 ? Math.round(Number(projet.montantPayeGnf) / budget * 10000) / 100 : 0;

    const dsm: Record<string, number> = {};
    for (const d of projet.decomptes) dsm[d.statut] = (dsm[d.statut] ?? 0) + 1;

    let ecartJours: number | null = null;
    if (projet.datePrevFinTravaux) ecartJours = Math.floor((projet.datePrevFinTravaux.getTime() - Date.now()) / 86400000);

    res.json({
      avancementPhysique:  projet.avancementPhysique,
      avancementFinancier: avancFinancier,
      tauxDecaissement:    tauxDecaiss,
      budgetInitialGnf:    projet.budgetInitialGnf.toString(),
      budgetReviseGnf:     projet.budgetReviseGnf.toString(),
      montantEngageGnf:    totalMarcheHt.toString(),
      montantDecaisseGnf:  totalPaye.toString(),
      montantRestantGnf:   Math.max(0, budget - totalPaye).toString(),
      ecartJours,
      scoreDelai:          projet.scoreDelai,
      scoreCout:           projet.scoreCout,
      scoreRisque:         projet.scoreRisque,
      niveauConfiance:     projet.niveauConfiance,
      nombreMarches:       projet._count.marches,
      nombreDecomptes:     projet._count.decomptes,
      nombreAttachements:  projet._count.attachements,
      decompteParStatut:   dsm,
      totalMarcheHtGnf:    totalMarcheHt.toString(),
      totalDecompteHtGnf:  totalDecompteHt.toString(),
      generatedAt:         new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

// GET /projets/:id/status-history
projetsRouter.get("/:id/status-history", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const history = await prisma.projetStatusHistory.findMany({
      where: { projetId: req.params.id },
      orderBy: { changedAt: "desc" },
    });
    res.json(history);
  } catch (err) { next(err); }
});

// DELETE /projets/:id
projetsRouter.delete("/:id", requireRole("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const before = await prisma.projet.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!before) throw new ApiError(404, "Projet introuvable");
    if (before.statut === "EN_EXECUTION") throw new ApiError(409, "Impossible de supprimer un projet EN_EXECUTION");
    await prisma.projet.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    await logAudit({ userId: req.user.id, action: "DELETE", entityType: "Projet", entityId: req.params.id, before });
    res.status(204).send();
  } catch (err) { next(err); }
});
