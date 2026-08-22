import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import { entrepriseIdOf } from "../../lib/scope";
import { roleAutorise } from "../../lib/roles-circuit";
import { chargerRegles } from "../../lib/regles";
import { confirmationBcrgSchema, paiementCreateSchema } from "./paiements.schema";
import { confirmerPaiementBcrg, creerOrdrePaiement } from "./paiements.service";

export const paiementsRouter = Router();
paiementsRouter.use(requireAuth);

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
    const data = paiementCreateSchema.parse(req.body);

    // L2.1 — matrice de rôles : l'ORDONNANCEMENT (préparation du paiement)
    // exige que le rôle soit autorisé par WF_ROLES_ORDONNANCEMENT.
    const reglesPaiement = await chargerRegles();
    if (!roleAutorise(req.user.role, "ORDONNANCEMENT", reglesPaiement)) {
      throw new ApiError(403, "Votre rôle " + req.user.role + " n'est pas autorisé à ordonnancer (matrice WF_ROLES_ORDONNANCEMENT)");
    }

    const paiement = await creerOrdrePaiement(data, req.user);
    res.status(201).json(paiement);
  } catch (err) { next(err); }
});
// ─── F8 — Confirmation bancaire BCRG : DAF prépare, BCRG confirme le virement réel ──
paiementsRouter.post("/:id/confirmation-bcrg", requireRole("ADMIN", "BCRG"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const body = confirmationBcrgSchema.parse(req.body);

    // L2.1 — matrice PAIEMENT : la décision métier sur les rôles autorisés
    // reste portée par WF_ROLES_PAIEMENT.
    const reglesConfirmation = await chargerRegles();
    if (!roleAutorise(req.user.role, "PAIEMENT", reglesConfirmation)) {
      throw new ApiError(403, "Votre rôle " + req.user.role + " n'est pas autorisé à confirmer le paiement (matrice WF_ROLES_PAIEMENT)");
    }

    const resultat = await confirmerPaiementBcrg(req.params.id, body, req.user);
    res.json({
      ...resultat.paiement,
      cumulConfirmeGnf: resultat.cumulConfirmeGnf,
      decomptePaye: resultat.decomptePaye,
      message: resultat.decomptePaye
        ? "Virement confirmé — décompte définitivement payé"
        : "Virement confirmé",
    });
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
