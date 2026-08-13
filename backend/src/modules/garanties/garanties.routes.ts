/**
 * Gestion des Garanties marchés
 * Types : AVANCE | BONNE_EXECUTION | RETENUE | SOUMISSION | DEFAUT
 * Alertes expiration : 30 jours avant
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import { z } from "zod";

export const garantiesRouter = Router();
garantiesRouter.use(requireAuth);

const schema = z.object({
  marcheId:      z.string().uuid(),
  type:          z.enum(["AVANCE","BONNE_EXECUTION","RETENUE","SOUMISSION","DEFAUT"]),
  montantGnf:    z.number().positive().transform((v) => BigInt(Math.round(v))),
  dateEmission:  z.coerce.date().optional(),
  dateExpiration:z.coerce.date().optional(),
  banque:        z.string().optional(),
  reference:     z.string().optional(),
  observations:  z.string().optional(),
  active:        z.boolean().optional(),
});

// Toutes les garanties d'un marché
garantiesRouter.get("/marche/:marcheId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const garanties = await prisma.garantie.findMany({
      where: { marcheId: req.params.marcheId },
      orderBy: { dateExpiration: "asc" },
    });
    res.json(garanties);
  } catch (err) { next(err); }
});

// Liste globale avec alertes expiration
garantiesRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { expirantes, active } = req.query;
    const where: Record<string,unknown> = {};
    if (active !== undefined) where.active = active === "true";
    if (expirantes === "true") {
      const soon = new Date(); soon.setDate(soon.getDate() + 30);
      where.active = true;
      where.dateExpiration = { lte: soon, gte: new Date() };
    }
    const garanties = await prisma.garantie.findMany({
      where,
      include: { marche: { select: { reference: true, intitule: true, entreprise: { select: { raisonSociale: true } } } } },
      orderBy: { dateExpiration: "asc" },
    });
    // Enrichissement : statut d'expiration
    const enriched = garanties.map((g) => ({
      ...g,
      expireeDans: g.dateExpiration ? Math.ceil((new Date(g.dateExpiration).getTime() - Date.now()) / 86400000) : null,
      statutExpiration: !g.dateExpiration ? "SANS_DATE" :
        new Date(g.dateExpiration) < new Date() ? "EXPIREE" :
        new Date(g.dateExpiration) < new Date(Date.now() + 30 * 86400000) ? "BIENTOT" : "VALIDE",
    }));
    res.json(enriched);
  } catch (err) { next(err); }
});

// Créer une garantie
garantiesRouter.post("/", requireRole("ADMIN","DAF","DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const data = schema.parse(req.body);
    const garantie = await prisma.garantie.create({ data });
    await logAudit({ userId: req.user.id, action: "CREATE", entityType: "Garantie", entityId: garantie.id, after: { type: data.type } });
    res.status(201).json(garantie);
  } catch (err) { next(err); }
});

// Modifier
garantiesRouter.put("/:id", requireRole("ADMIN","DAF","DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const data = schema.partial().parse(req.body);
    const garantie = await prisma.garantie.update({ where: { id: req.params.id }, data });
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "Garantie", entityId: garantie.id });
    res.json(garantie);
  } catch (err) { next(err); }
});

// Appeler une garantie (exécution)
garantiesRouter.post("/:id/appel", requireRole("ADMIN","DG","DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const garantie = await prisma.garantie.update({
      where: { id: req.params.id },
      data: { appelGarantie: true, dateAppel: new Date(), observations: req.body.observations },
    });
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "Garantie", entityId: garantie.id, after: { appelGarantie: true } });
    res.json({ garantie, message: "Garantie appelée" });
  } catch (err) { next(err); }
});

// Supprimer (soft: désactiver)
garantiesRouter.delete("/:id", requireRole("ADMIN","DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const garantie = await prisma.garantie.update({ where: { id: req.params.id }, data: { active: false } });
    await logAudit({ userId: req.user.id, action: "DELETE", entityType: "Garantie", entityId: garantie.id });
    res.json({ message: "Garantie désactivée" });
  } catch (err) { next(err); }
});

// Dashboard garanties : synthèse + alertes
garantiesRouter.get("/dashboard/synthese", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const in30 = new Date(Date.now() + 30 * 86400000);
    const [actives, expirees, bientot, montantTotalRaw] = await Promise.all([
      prisma.garantie.count({ where: { active: true } }),
      prisma.garantie.count({ where: { active: true, dateExpiration: { lt: now } } }),
      prisma.garantie.count({ where: { active: true, dateExpiration: { gte: now, lte: in30 } } }),
      prisma.garantie.aggregate({ where: { active: true }, _sum: { montantGnf: true } }),
    ]);
    res.json({ actives, expirees, bientot, montantTotalGnf: montantTotalRaw._sum.montantGnf?.toString() ?? "0" });
  } catch (err) { next(err); }
});
