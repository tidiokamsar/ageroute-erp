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

    if (body.titulaireId === body.suppleantId) throw new ApiError(400, "Le suppléant doit être différent du titulaire");
    if (req.user.role !== "ADMIN" && req.user.id !== body.titulaireId) {
      throw new ApiError(403, "Seul le titulaire ou un administrateur peut créer cette délégation");
    }
    if (new Date(body.dateFin) <= new Date(body.dateDebut)) throw new ApiError(400, "La date de fin doit être postérieure au début");

    // Revue 27/08/2026 (relais Claude) — deux garde-fous manquaient :
    //
    // 1. DURÉE MAXIMALE : une délégation sans limite de temps permettait un
    //    intérim perpétuité — même une année entière passait. Un intérim est
    //    un arrangement temporaire : 90 jours glissants, renouvelable.
    const DUREE_MAX_MS = 90 * 24 * 3600 * 1000;
    if (new Date(body.dateFin).getTime() - new Date(body.dateDebut).getTime() > DUREE_MAX_MS) {
      throw new ApiError(400, "Une délégation est limitée à 90 jours — renouvelez-la si l'absence se prolonge");
    }
    // Une délégation ne peut pas commencer dans un passé lointain (rétrodatage
    // d'un pouvoir déjà utilisé).
    if (new Date(body.dateDebut).getTime() < Date.now() - DUREE_MAX_MS) {
      throw new ApiError(400, "Une délégation ne peut pas commencer plus de 90 jours dans le passé");
    }

    // 2. CIRCULARITÉ : A délègue à B, B délègue à A — chaque porte faire
    //    suivre à l'autre un pouvoir que personne ne détient à la source.
    //    On remonte la chaîne des délégations actives : si le futur titulaire
    //    apparaît déjà comme suppléant en aval, la chaîne se mord la queue.
    const delegationActives = await prisma.delegation.findMany({
      where: { actif: true, dateFin: { gte: new Date() } },
      select: { titulaireId: true, suppleantId: true },
    });
    // Graphe titulaire → suppléants ; parcours en profondeur depuis le
    // suppléant proposé : si on retombe sur le titulaire, c'est un cycle.
    const parTitulaire = new Map<string, string[]>();
    for (const d of delegationActives) {
      parTitulaire.set(d.titulaireId, [...(parTitulaire.get(d.titulaireId) ?? []), d.suppleantId]);
    }
    const visites = new Set<string>([body.suppleantId]);
    const pile = [body.suppleantId];
    while (pile.length > 0) {
      const courant = pile.pop()!;
      for (const suivant of parTitulaire.get(courant) ?? []) {
        if (suivant === body.titulaireId) {
          throw new ApiError(400, "Circularité détectée : cette délégation fermerait une boucle (le titulaire est déjà suppléant dans la chaîne)");
        }
        if (!visites.has(suivant)) { visites.add(suivant); pile.push(suivant); }
      }
    }

    const created = await prisma.delegation.create({
      data: {
        titulaireId: body.titulaireId,
        suppleantId: body.suppleantId,
        dateDebut: new Date(body.dateDebut),
        dateFin: new Date(body.dateFin),
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
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "Delegation", entityId: del.id, after: updated });
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
