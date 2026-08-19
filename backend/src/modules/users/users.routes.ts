import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import bcrypt from "bcryptjs";
import { z } from "zod";

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole("ADMIN"));

const userCreateSchema = z.object({
  email: z.string().email(),
  nomComplet: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "DG", "DAF", "DMC", "UGP", "MISSION", "TECHNIQUE", "ENTREPRISE", "AUDITEUR"]),
  actif: z.boolean().default(true),
});

usersRouter.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({ select: { id: true, email: true, nomComplet: true, role: true, actif: true, derniereConnexion: true, createdAt: true }, orderBy: { nomComplet: "asc" } });
    res.json(users);
  } catch (err) { next(err); }
});

usersRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const data = userCreateSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(data.password, 12);
    const created = await prisma.user.create({ data: { ...data, passwordHash } });
    await logAudit({ userId: req.user.id, action: "CREATE", entityType: "User", entityId: created.id });
    res.status(201).json({ id: created.id, email: created.email, nomComplet: created.nomComplet, role: created.role });
  } catch (err) { next(err); }
});

usersRouter.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const data = userCreateSchema.partial().omit({ password: true }).parse(req.body);
    const updated = await prisma.user.update({ where: { id: req.params.id }, data });
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "User", entityId: req.params.id });
    res.json({ id: updated.id, email: updated.email, nomComplet: updated.nomComplet, role: updated.role, actif: updated.actif });
  } catch (err) { next(err); }
});

// Désactiver / réactiver
usersRouter.put("/:id/actif", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const { actif } = z.object({ actif: z.boolean() }).parse(req.body);
    await prisma.user.update({ where: { id: req.params.id }, data: { actif } });
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "User", entityId: req.params.id, after: { actif } });
    res.json({ message: actif ? "Compte activé" : "Compte désactivé" });
  } catch (err) { next(err); }
});

// Reset mot de passe
usersRouter.post("/:id/reset-password", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const { password } = z.object({ password: z.string().min(8) }).parse(req.body);
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash } });
    // Révoquer tous les refresh tokens
    await prisma.refreshToken.updateMany({ where: { userId: req.params.id }, data: { revoked: true } });
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "User", entityId: req.params.id, after: { action: "password_reset" } });
    res.json({ message: "Mot de passe réinitialisé" });
  } catch (err) { next(err); }
});

usersRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    if (req.params.id === req.user.id) throw new ApiError(400, "Vous ne pouvez pas supprimer votre propre compte");
    await prisma.user.delete({ where: { id: req.params.id } });
    await logAudit({ userId: req.user.id, action: "DELETE", entityType: "User", entityId: req.params.id });
    res.status(204).send();
  } catch (err) { next(err); }
});

// ─── Affectations marchés (périmètre de visibilité MISSION/TECHNIQUE/BAILLEUR) ─
/**
 * Périmètre de travail d'un agent.
 *
 * ⚠️ SÉMANTIQUE : pour les rôles scopés (MISSION, TECHNIQUE, BAILLEUR),
 * AUCUNE affectation = AUCUN accès — et non « accès à tout », comme le
 * disaient l'ancien commentaire et le texte de l'écran. C'est `lib/affectations.ts`
 * qui fait foi : `getMarchesAffectes` renvoie la liste des marchés confiés,
 * vide si l'agent n'en a aucun.
 *
 * La réponse porte la liste COMPLÈTE des marchés, chacun marqué `affecte`.
 * L'écran d'administration en a besoin pour proposer des cases à cocher :
 * en ne renvoyant que les marchés déjà affectés, on ne pouvait qu'en retirer,
 * jamais en ajouter.
 */
usersRouter.get("/:id/affectations", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true, nomComplet: true } });
    if (!user) throw new ApiError(404, "Utilisateur introuvable");

    const [affectations, tousMarches] = await Promise.all([
      prisma.marcheAffectation.findMany({
        where: { userId: req.params.id },
        select: { id: true, marcheId: true, marche: { select: { reference: true, intitule: true, financement: true, statut: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.marche.findMany({
        where: { deletedAt: null },
        select: { id: true, reference: true, intitule: true, statut: true, financement: true, entreprise: { select: { raisonSociale: true } } },
        orderBy: [{ statut: "asc" }, { reference: "asc" }],
      }),
    ]);

    const affectes = new Set(affectations.map((a) => a.marcheId));

    res.json({
      user,
      scopable: ["MISSION", "TECHNIQUE", "BAILLEUR"].includes(user.role),
      affectations,
      marches: tousMarches.map((m) => ({ ...m, affecte: affectes.has(m.id) })),
      nbAffectes: affectes.size,
    });
  } catch (err) { next(err); }
});

usersRouter.put("/:id/affectations", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const { marcheIds } = z.object({ marcheIds: z.array(z.string().uuid()).max(500) }).parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true } });
    if (!user) throw new ApiError(404, "Utilisateur introuvable");
    if (!["MISSION", "TECHNIQUE", "BAILLEUR"].includes(user.role)) {
      throw new ApiError(400, `Le rôle ${user.role} n'est pas soumis au périmètre d'affectation (concernés : MISSION, TECHNIQUE, BAILLEUR)`);
    }
    if (marcheIds.length > 0) {
      const existants = await prisma.marche.count({ where: { id: { in: marcheIds }, deletedAt: null } });
      if (existants !== marcheIds.length) throw new ApiError(400, "Un ou plusieurs marchés sont introuvables");
    }

    const avant = await prisma.marcheAffectation.findMany({ where: { userId: req.params.id }, select: { marcheId: true } });
    const ancienneListe = avant.map((a) => a.marcheId);

    await prisma.$transaction([
      prisma.marcheAffectation.deleteMany({ where: { userId: req.params.id, marcheId: { notIn: marcheIds } } }),
      prisma.marcheAffectation.createMany({
        data: marcheIds
          .filter((mid) => !ancienneListe.includes(mid))
          .map((marcheId) => ({ userId: req.params.id, marcheId })),
        skipDuplicates: true,
      }),
    ]);

    await logAudit({
      userId: req.user.id, action: "UPDATE", entityType: "UserAffectations", entityId: req.params.id,
      before: { marcheIds: ancienneListe }, after: { marcheIds },
    });
    res.json({ message: `${marcheIds.length} marché(s) affecté(s) — périmètre de visibilité mis à jour` });
  } catch (err) { next(err); }
});
