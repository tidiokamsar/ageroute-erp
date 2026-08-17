import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import { entrepriseIdOf } from "../../lib/scope";
import { z } from "zod";

export const paiementsRouter = Router();
paiementsRouter.use(requireAuth);

const schema = z.object({
  decompteId: z.string().uuid(),
  montantGnf: z.number().positive().transform((v) => BigInt(Math.round(v))),
  dateOrdre: z.coerce.date().optional(),
  dateExecution: z.coerce.date().optional(),
  reference: z.string().optional(),
  banque: z.string().optional(),
  observations: z.string().optional(),
});

paiementsRouter.get("/decompte/:decompteId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Isolation entreprise : les paiements d'un décompte d'autrui sont « introuvables »
    if (req.user?.role === "ENTREPRISE") {
      const dec = await prisma.decompte.findUnique({ where: { id: req.params.decompteId }, select: { entrepriseId: true } });
      if (!dec || dec.entrepriseId !== (await entrepriseIdOf(req.user.id))) {
        throw new ApiError(404, "Décompte introuvable");
      }
    }
    const paiements = await prisma.paiement.findMany({
      where: { decompteId: req.params.decompteId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    res.json(paiements);
  } catch (err) { next(err); }
});

paiementsRouter.post("/", requireRole("ADMIN", "DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const data = schema.parse(req.body);
    const decompte = await prisma.decompte.findFirst({ where: { id: data.decompteId, deletedAt: null } });
    if (!decompte) throw new ApiError(404, "Décompte introuvable");
    if (!["VALIDE", "PAYE"].includes(decompte.statut)) throw new ApiError(400, "Le décompte doit être validé avant paiement");

    const p = await prisma.paiement.create({ data });
    // Marquer décompte PAYE
    await prisma.decompte.update({ where: { id: data.decompteId }, data: { statut: "PAYE", datePaiement: data.dateExecution ?? new Date() } });
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "Paiement", entityId: p.id, after: { montant: data.montantGnf.toString() } });
    res.status(201).json(p);
  } catch (err) { next(err); }
});

paiementsRouter.delete("/:id", requireRole("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    // §3.4 AGENTS.md — soft delete uniquement, avec trace de l'état avant suppression
    const before = await prisma.paiement.findUnique({ where: { id: req.params.id } });
    if (!before) throw new ApiError(404, "Paiement introuvable");
    await prisma.paiement.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    await logAudit({ userId: req.user.id, action: "DELETE", entityType: "Paiement", entityId: req.params.id, before });
    res.status(204).send();
  } catch (err) { next(err); }
});
