/**
 * Gestion des Réceptions marchés
 * Types : OPR (Opération Préalable) | PROVISOIRE | DEFINITIVE
 * Statuts : EN_ATTENTE | PROGRAMME | REALISE | AVEC_RESERVES | REFUSE
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import { z } from "zod";
import { assertMarcheAutorise, filtreParMarche } from "../../lib/perimetre";

export const receptionsRouter = Router();
receptionsRouter.use(requireAuth);

const schema = z.object({
  marcheId:            z.string().uuid(),
  type:                z.enum(["OPR","PROVISOIRE","DEFINITIVE"]),
  statut:              z.enum(["EN_ATTENTE","PROGRAMME","REALISE","AVEC_RESERVES","REFUSE"]).optional(),
  datePrevu:           z.coerce.date().optional(),
  dateReelle:          z.coerce.date().optional(),
  pvNumero:            z.string().optional(),
  presentsEntreprise:  z.string().optional(),
  presentsAgeroute:    z.string().optional(),
  presentsAutres:      z.string().optional(),
  reserves:            z.array(z.string()).optional(),
  delaiLeveeReserves:  z.number().int().optional(),
  dateLeveeReserves:   z.coerce.date().optional(),
  observations:        z.string().optional(),
});

// Réceptions d'un marché
receptionsRouter.get("/marche/:marcheId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertMarcheAutorise(req, req.params.marcheId);
    const receptions = await prisma.reception.findMany({
      where: { marcheId: req.params.marcheId },
      orderBy: { createdAt: "asc" },
    });
    res.json(receptions);
  } catch (err) { next(err); }
});

// Liste globale avec filtres
receptionsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { statut, type, page = "1" } = req.query;
    // Périmètre : un PV de réception porte sur un marché.
    const where: Record<string,unknown> = { ...(await filtreParMarche(req)) };
    if (statut) where.statut = statut;
    if (type) where.type = type;
    const p = Math.max(1, Number(page));
    const [data, total] = await Promise.all([
      prisma.reception.findMany({
        where,
        include: {
          marche: { select: { reference: true, intitule: true, entreprise: { select: { raisonSociale: true } } } },
        },
        orderBy: { datePrevu: "asc" },
        skip: (p - 1) * 20,
        take: 20,
      }),
      prisma.reception.count({ where }),
    ]);
    res.json({ data, total, page: p, totalPages: Math.ceil(total / 20) || 1 });
  } catch (err) { next(err); }
});

// Créer une réception / PV
receptionsRouter.post("/", requireRole("ADMIN","DG","DMC","TECHNIQUE","MISSION"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const data = schema.parse(req.body);

    // Vérifier qu'il n'existe pas déjà ce type de réception pour ce marché
    const existing = await prisma.reception.findFirst({
      where: { marcheId: data.marcheId, type: data.type, statut: { not: "REFUSE" } },
    });
    if (existing && data.type === "DEFINITIVE") {
      throw new ApiError(400, "Une réception définitive existe déjà pour ce marché");
    }

    const reception = await prisma.reception.create({
      data: { ...data, reserves: (data.reserves ?? []) as unknown as object[] },
    });
    await logAudit({ userId: req.user.id, action: "CREATE", entityType: "Reception", entityId: reception.id, after: { type: data.type } });
    res.status(201).json(reception);
  } catch (err) { next(err); }
});

// Mettre à jour (résultats, PV, réserves)
receptionsRouter.put("/:id", requireRole("ADMIN","DG","DMC","TECHNIQUE","MISSION"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const data = schema.partial().parse(req.body);
    const reception = await prisma.reception.update({
      where: { id: req.params.id },
      data: { ...data, reserves: data.reserves !== undefined ? (data.reserves as unknown as object[]) : undefined },
    });
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "Reception", entityId: reception.id });
    res.json(reception);
  } catch (err) { next(err); }
});

// Signer le PV (valider définitivement)
receptionsRouter.post("/:id/signer", requireRole("ADMIN","DG","DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const { pvNumero, statut } = req.body as { pvNumero?: string; statut?: string };
    const reception = await prisma.reception.update({
      where: { id: req.params.id },
      data: {
        signedAt: new Date(),
        dateReelle: new Date(),
        pvNumero: pvNumero ?? undefined,
        statut: statut ?? "REALISE",
      },
    });
    // Si réception provisoire signée → marquer le marché comme en période de garantie
    if (reception.type === "PROVISOIRE") {
      await prisma.marche.update({ where: { id: reception.marcheId }, data: { statut: "CLOTURE" } });
    }
    await logAudit({ userId: req.user.id, action: "SIGN", entityType: "Reception", entityId: reception.id });
    res.json({ reception, message: `PV de ${reception.type} signé` });
  } catch (err) { next(err); }
});

// Lever les réserves
receptionsRouter.post("/:id/lever-reserves", requireRole("ADMIN","DG","DMC","TECHNIQUE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const reception = await prisma.reception.update({
      where: { id: req.params.id },
      data: { dateLeveeReserves: new Date(), statut: "REALISE", observations: req.body.observations },
    });
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "Reception", entityId: reception.id, after: { reservesLevees: true } });
    res.json({ reception, message: "Réserves levées — marché soldé" });
  } catch (err) { next(err); }
});

// Dashboard réceptions
receptionsRouter.get("/dashboard/synthese", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [opr, provisoires, definitives, avecReserves, enAttente] = await Promise.all([
      prisma.reception.count({ where: { type: "OPR", statut: "REALISE" } }),
      prisma.reception.count({ where: { type: "PROVISOIRE", statut: { in: ["REALISE","AVEC_RESERVES"] } } }),
      prisma.reception.count({ where: { type: "DEFINITIVE", statut: "REALISE" } }),
      prisma.reception.count({ where: { statut: "AVEC_RESERVES", dateLeveeReserves: null } }),
      prisma.reception.count({ where: { statut: "EN_ATTENTE" } }),
    ]);
    res.json({ opr, provisoires, definitives, avecReserves, enAttente });
  } catch (err) { next(err); }
});
