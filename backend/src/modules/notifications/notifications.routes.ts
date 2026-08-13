import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { verifierSlaEtEscalader } from "./notifications.service";
import { prisma } from "../../lib/prisma";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

// Déclencher la vérification SLA manuellement (admin ou cron)
notificationsRouter.post("/sla/verifier", requireRole("ADMIN"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await verifierSlaEtEscalader();
    res.json({ message: `Vérification SLA terminée — ${result.escalades} escalades envoyées`, ...result });
  } catch (err) { next(err); }
});

// Instances en retard SLA (pour dashboard admin)
notificationsRouter.get("/sla/retards", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const instances = await prisma.workflowInstance.findMany({
      where: { statut: "EN_COURS" },
      include: {
        definition: { include: { etapes: { orderBy: { ordre: "asc" } } } },
        actions: { orderBy: { createdAt: "desc" }, take: 1 },
        decompte: { select: { reference: true, marche: { select: { reference: true } } } },
      },
    });

    const maintenant = new Date();
    const retards = instances
      .map((inst) => {
        const etape = inst.definition.etapes[inst.etapeActuelle];
        if (!etape) return null;
        const debut = inst.actions[0]?.createdAt ?? inst.createdAt;
        const joursEcoules = Math.floor((maintenant.getTime() - debut.getTime()) / (1000 * 60 * 60 * 24));
        const retard = joursEcoules - etape.slaDays;
        return retard > 0 ? { instanceId: inst.id, decompteRef: inst.decompte?.reference, etape: etape.nom, roleRequis: etape.roleRequis, joursRetard: retard } : null;
      })
      .filter(Boolean);

    res.json(retards);
  } catch (err) { next(err); }
});
