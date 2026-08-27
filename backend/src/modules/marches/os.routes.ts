import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { assertMarcheAutoriseEtPropre } from "../../lib/perimetre";
import { requireRole } from "../../middleware/rbac.middleware";
import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import { z } from "zod";

export const osRouter = Router({ mergeParams: true }); // /api/marches/:marcheId/os
osRouter.use(requireAuth);

const osSchema = z.object({
  type: z.enum(["DEMARRAGE", "ARRET", "REPRISE", "MODIFICATION", "PROLONGATION"]),
  objet: z.string().min(1),
  dateEmission: z.coerce.date(),
  dateEffet: z.coerce.date().optional(),
  impactDelaiJours: z.number().int().optional(),
  impactMontantGnf: z.number().transform((v) => BigInt(Math.round(v))).optional(),
  observations: z.string().optional(),
});

osRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Périmètre d'affectation + appartenance (revue 27/08/2026) — voir bpu.
    await assertMarcheAutoriseEtPropre(req, req.params.marcheId, async (id) => {
      const m = await prisma.marche.findFirst({ where: { id, deletedAt: null }, select: { entrepriseId: true } });
      return m?.entrepriseId ?? null;
    });
    const os = await prisma.ordreService.findMany({
      where: { marcheId: req.params.marcheId },
      orderBy: { numero: "asc" },
    });
    res.json(os);
  } catch (err) { next(err); }
});

osRouter.post("/", requireRole("ADMIN", "DMC", "DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const data = osSchema.parse(req.body);
    // Numérotation automatique
    const last = await prisma.ordreService.findFirst({ where: { marcheId: req.params.marcheId }, orderBy: { numero: "desc" } });
    const numero = (last?.numero ?? 0) + 1;
    const created = await prisma.ordreService.create({ data: { ...data, marcheId: req.params.marcheId, numero } });
    // Si prolongation, met à jour dateFinPrevue du marché
    if (data.type === "PROLONGATION" && data.impactDelaiJours) {
      const marche = await prisma.marche.findUnique({ where: { id: req.params.marcheId } });
      if (marche?.dateFinPrevue) {
        const newDate = new Date(marche.dateFinPrevue);
        newDate.setDate(newDate.getDate() + data.impactDelaiJours);
        await prisma.marche.update({ where: { id: req.params.marcheId }, data: { dateFinPrevue: newDate } });
      }
    }
    await logAudit({ userId: req.user.id, action: "CREATE", entityType: "OrdreService", entityId: created.id });
    res.status(201).json(created);
  } catch (err) { next(err); }
});
