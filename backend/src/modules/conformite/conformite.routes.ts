/**
 * §CDC — API Conformité entreprise
 * Calcul de score, historique, blocage/déblocage manuel DG/DAF
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { prisma } from "../../lib/prisma";
import { recalculerConformiteEntreprise, calculerScoreDetail } from "./conformite.service";
import { ApiError } from "../../middleware/error.middleware";

export const conformiteRouter = Router();
conformiteRouter.use(requireAuth);

// Simuler le score sans persister (pré-calcul)
conformiteRouter.get("/preview/:entrepriseId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const e = await prisma.entreprise.findFirst({ where: { id: req.params.entrepriseId, deletedAt: null } });
    if (!e) throw new ApiError(404, "Entreprise introuvable");
    const detail = calculerScoreDetail(e);
    res.json({ detail, entreprise: { id: e.id, raisonSociale: e.raisonSociale, scoreActuel: e.scoreConformite, statutActuel: e.statut } });
  } catch (err) { next(err); }
});

// Recalculer et persister le score
conformiteRouter.post("/recalculer/:entrepriseId", requireRole("ADMIN","DG","DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { commentaire } = req.body as { commentaire?: string };
    const detail = await recalculerConformiteEntreprise(req.params.entrepriseId, req.user?.email, commentaire);
    res.json({ detail, message: `Score mis à jour : ${detail.score}/100 → ${detail.statut}` });
  } catch (err) { next(err); }
});

// Blocage manuel (ex: suspension administrative)
conformiteRouter.post("/bloquer/:entrepriseId", requireRole("ADMIN","DG","DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { motif } = req.body as { motif: string };
    if (!motif) throw new ApiError(400, "Motif de blocage obligatoire");
    await prisma.entreprise.update({
      where: { id: req.params.entrepriseId },
      data: { statut: "BLOQUE", motifBlocage: motif, autoriseContracterEtat: false },
    });
    res.json({ message: "Entreprise bloquée", motif });
  } catch (err) { next(err); }
});

// Déblocage après régularisation
conformiteRouter.post("/debloquer/:entrepriseId", requireRole("ADMIN","DG","DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.entreprise.update({
      where: { id: req.params.entrepriseId },
      data: { autoriseContracterEtat: true, estRadie: false },
    });
    // Recalcule automatiquement
    const detail = await recalculerConformiteEntreprise(req.params.entrepriseId, req.user?.email, "Déblocage manuel après régularisation");
    res.json({ detail, message: `Entreprise débloquée — score : ${detail.score}/100 → ${detail.statut}` });
  } catch (err) { next(err); }
});

// Historique des vérifications
conformiteRouter.get("/historique/:entrepriseId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const historique = await prisma.conformiteVerification.findMany({
      where: { entrepriseId: req.params.entrepriseId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(historique);
  } catch (err) { next(err); }
});

// Toutes les entreprises bloquées (tableau de bord DAF/DG)
conformiteRouter.get("/bloquees", requireRole("ADMIN","DG","DAF","DMC"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const bloquees = await prisma.entreprise.findMany({
      where: { deletedAt: null, statut: { in: ["BLOQUE","A_REGULARISER"] } },
      select: { id: true, raisonSociale: true, nif: true, statut: true, scoreConformite: true, motifBlocage: true, dateVerification: true },
      orderBy: [{ statut: "asc" }, { scoreConformite: "asc" }],
    });
    res.json(bloquees);
  } catch (err) { next(err); }
});
