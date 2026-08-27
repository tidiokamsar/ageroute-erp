/**
 * Module Délégation d'intérim — CRUD des délégations de validation.
 * Un titulaire (ou un admin) désigne un suppléant sur une période donnée.
 * Le suppléant hérite temporairement du rôle du titulaire dans le workflow.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/error.middleware";
import { logAudit } from "../../lib/audit";
import { chargerRegles } from "../../lib/regles";
import { verifierDelegation } from "../../lib/delegations.regles";
import { z } from "zod";

export const delegationsRouter = Router();
delegationsRouter.use(requireAuth);

const userSel = { select: { id: true, nomComplet: true, email: true, role: true } };

// Liste — ADMIN voit tout ; sinon les délégations données ou reçues par l'utilisateur
delegationsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const where = req.user.role === "ADMIN"
      ? {}
      : { OR: [{ titulaireId: req.user.id }, { suppleantId: req.user.id }] };
    const list = await prisma.delegation.findMany({
      where,
      include: { titulaire: userSel, suppleant: userSel },
      orderBy: { createdAt: "desc" },
    });
    res.json(list);
  } catch (err) { next(err); }
});

// Mes rôles délégués actifs (pour badge UI + affichage)
delegationsRouter.get("/mes-roles", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const now = new Date();
    const dels = await prisma.delegation.findMany({
      where: { suppleantId: req.user.id, actif: true, dateDebut: { lte: now }, dateFin: { gte: now } },
      include: { titulaire: userSel },
    });
    res.json({ rolesDelegues: [...new Set(dels.map((d) => d.titulaire.role))], delegations: dels });
  } catch (err) { next(err); }
});

// Créer — ADMIN, ou le titulaire lui-même
delegationsRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const body = z.object({
      titulaireId: z.string().min(1),
      suppleantId: z.string().min(1),
      dateDebut: z.string().min(1),
      dateFin: z.string().min(1),
      motif: z.string().optional(),
    }).parse(req.body);

    if (req.user.role !== "ADMIN" && req.user.id !== body.titulaireId) {
      throw new ApiError(403, "Seul le titulaire ou un administrateur peut créer cette délégation");
    }

    // ── Bornes de l'acte ──────────────────────────────────────────────────────
    // Deux revues du 27/08/2026 ont porté sur ce point ; les contrôles sont
    // désormais réunis dans lib/delegations.regles.ts — fonction PURE, testée,
    // paramétrable — plutôt que dispersés ici en conditions successives :
    //   durée maximale et date d'effet (WF_DELEGATION_DUREE_MAX_JOURS),
    //   rôles non délégables et suppléant éligible
    //   (WF_DELEGATION_ROLES_NON_DELEGABLES : un DAF ne délègue pas son visa à
    //   l'entreprise attributaire, et ADMIN est refusé À LA CRÉATION plutôt que
    //   neutralisé en aval, où l'acte n'était qu'un leurre),
    //   comptes actifs, motif obligatoire, non-cumul de suppléants,
    //   et détection de boucle par parcours du graphe des délégations actives.
    // La route ne fait plus que rassembler les faits que la règle exige.
    const [titulaire, suppleant] = await Promise.all([
      prisma.user.findUnique({ where: { id: body.titulaireId }, select: { id: true, role: true, actif: true } }),
      prisma.user.findUnique({ where: { id: body.suppleantId }, select: { id: true, role: true, actif: true } }),
    ]);
    if (!titulaire) throw new ApiError(404, "Titulaire introuvable");
    if (!suppleant) throw new ApiError(404, "Suppléant introuvable");

    const dateDebut = new Date(body.dateDebut);
    const dateFin = new Date(body.dateFin);
    if (Number.isNaN(dateDebut.getTime()) || Number.isNaN(dateFin.getTime())) {
      throw new ApiError(400, "Dates invalides");
    }

    // TOUTES les délégations actives : le parcours de boucle traverse aussi
    // celles qui ne concernent ni le titulaire ni le suppléant proposés.
    const [regles, existantes] = await Promise.all([
      chargerRegles({}),
      prisma.delegation.findMany({
        where: { actif: true },
        select: { id: true, titulaireId: true, suppleantId: true, dateDebut: true, dateFin: true, actif: true },
      }),
    ]);

    const verdict = verifierDelegation({
      titulaire, suppleant, dateDebut, dateFin,
      motif: body.motif, existantes, regles, maintenant: new Date(),
    });
    if (!verdict.autorise) throw new ApiError(400, verdict.motif ?? "Délégation refusée");

    const created = await prisma.delegation.create({
      data: {
        titulaireId: body.titulaireId,
        suppleantId: body.suppleantId,
        dateDebut,
        dateFin,
        motif: body.motif,
      },
      include: { titulaire: userSel, suppleant: userSel },
    });
    await logAudit({ userId: req.user.id, action: "CREATE", entityType: "Delegation", entityId: created.id, after: created });
    res.status(201).json(created);
  } catch (err) { next(err); }
});

// Activer / désactiver
delegationsRouter.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const body = z.object({ actif: z.boolean() }).parse(req.body);
    const del = await prisma.delegation.findUnique({ where: { id: req.params.id } });
    if (!del) throw new ApiError(404, "Délégation introuvable");
    if (req.user.role !== "ADMIN" && req.user.id !== del.titulaireId) throw new ApiError(403, "Non autorisé");
    const updated = await prisma.delegation.update({ where: { id: req.params.id }, data: { actif: body.actif } });
    // `before` manquait : on lisait « la délégation a été modifiée » sans savoir
    // si elle venait d'être activée ou révoquée.
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "Delegation", entityId: del.id, before: del, after: updated });
    res.json(updated);
  } catch (err) { next(err); }
});

// Supprimer
delegationsRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const del = await prisma.delegation.findUnique({ where: { id: req.params.id } });
    if (!del) throw new ApiError(404, "Délégation introuvable");
    if (req.user.role !== "ADMIN" && req.user.id !== del.titulaireId) throw new ApiError(403, "Non autorisé");
    await prisma.delegation.delete({ where: { id: req.params.id } });
    await logAudit({ userId: req.user.id, action: "DELETE", entityType: "Delegation", entityId: del.id, before: del });
    res.status(204).send();
  } catch (err) { next(err); }
});
