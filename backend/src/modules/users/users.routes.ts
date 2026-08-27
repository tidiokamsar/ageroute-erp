import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import bcrypt from "bcryptjs";
import { z } from "zod";
// Schéma et découpage du payload : extraits pour être testables sans express ni
// Prisma, selon la convention de tests du dépôt.
import { userCreateSchema, userUpdateSchema, separerMotDePasse } from "./users.payload";
// Source unique des rôles à périmètre. La liste était recopiée en dur ici, si
// bien qu'ajouter un rôle scopé dans lib/affectations.ts ne suffisait pas :
// l'écran d'administration continuait de refuser de lui affecter des marchés.
import { ROLES_SCOPES, getMarchesAffectes } from "../../lib/affectations";

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole("ADMIN"));

usersRouter.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({ select: { id: true, email: true, nomComplet: true, nom: true, prenom: true, fonction: true, signatureUrl: true, role: true, actif: true, derniereConnexion: true, createdAt: true }, orderBy: { nomComplet: "asc" } });
    res.json(users);
  } catch (err) { next(err); }
});

usersRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const { password, colonnes } = separerMotDePasse(userCreateSchema.parse(req.body));
    const passwordHash = await bcrypt.hash(password, 12);
    const created = await prisma.user.create({ data: { ...colonnes, passwordHash } });
    await logAudit({ userId: req.user.id, action: "CREATE", entityType: "User", entityId: created.id });
    res.status(201).json({ id: created.id, email: created.email, nomComplet: created.nomComplet, role: created.role });
  } catch (err) { next(err); }
});

usersRouter.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const data = userUpdateSchema.parse(req.body);
    const updated = await prisma.user.update({ where: { id: req.params.id }, data });
    if (data.role !== undefined || data.actif === false) {
      await prisma.refreshToken.updateMany({ where: { userId: req.params.id }, data: { revoked: true } });
    }
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "User", entityId: req.params.id });
    res.json({ id: updated.id, email: updated.email, nomComplet: updated.nomComplet, nom: updated.nom, prenom: updated.prenom, fonction: updated.fonction, signatureUrl: updated.signatureUrl, role: updated.role, actif: updated.actif });
  } catch (err) { next(err); }
});

// Désactiver / réactiver
usersRouter.put("/:id/actif", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const { actif } = z.object({ actif: z.boolean() }).parse(req.body);
    await prisma.user.update({ where: { id: req.params.id }, data: { actif } });
    if (!actif) {
      await prisma.refreshToken.updateMany({ where: { userId: req.params.id }, data: { revoked: true } });
    }
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
 * ⚠️ SÉMANTIQUE : pour les rôles scopés (voir `ROLES_SCOPES`),
 * AUCUNE affectation = AUCUN accès — et non « accès à tout », comme le
 * disaient l'ancien commentaire et le texte de l'écran. C'est `lib/affectations.ts`
 * qui fait foi : `getMarchesAffectes` renvoie la liste des marchés confiés,
 * vide si l'agent n'en a aucun.
 *
 * La réponse porte la liste COMPLÈTE des marchés et des projets, chacun marqué
 * `affecte`. L'écran d'administration en a besoin pour proposer des cases à
 * cocher : en ne renvoyant que les éléments déjà affectés, on ne pouvait qu'en
 * retirer, jamais en ajouter.
 *
 * Deux niveaux : par marché (précis) et par projet (couvre tous ses marchés,
 * y compris ceux ajoutés plus tard). `couvertParProjet` signale les marchés
 * visibles par la seconde voie sans case cochée sur la première.
 */
usersRouter.get("/:id/affectations", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true, nomComplet: true } });
    if (!user) throw new ApiError(404, "Utilisateur introuvable");

    const [affectations, affectationsProjets, tousMarches, tousProjets] = await Promise.all([
      prisma.marcheAffectation.findMany({
        where: { userId: req.params.id },
        select: { id: true, marcheId: true, marche: { select: { reference: true, intitule: true, financement: true, statut: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.projetAffectation.findMany({
        where: { userId: req.params.id },
        select: { id: true, projetId: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.marche.findMany({
        where: { deletedAt: null },
        select: { id: true, reference: true, intitule: true, statut: true, financement: true, projetId: true, entreprise: { select: { raisonSociale: true } } },
        orderBy: [{ statut: "asc" }, { reference: "asc" }],
      }),
      prisma.projet.findMany({
        where: { deletedAt: null },
        select: { id: true, code: true, intitule: true, statut: true },
        orderBy: { code: "asc" },
      }),
    ]);

    const affectes = new Set(affectations.map((a) => a.marcheId));
    const projetsAffectes = new Set(affectationsProjets.map((a) => a.projetId));

    // Un marché couvert par un projet affecté est signalé comme tel : sans
    // cette distinction, l'écran afficherait une case décochée pour un marché
    // que l'agent voit pourtant — et l'administrateur croirait à une erreur.
    const marches = tousMarches.map((m) => ({
      ...m,
      affecte: affectes.has(m.id),
      couvertParProjet: m.projetId ? projetsAffectes.has(m.projetId) : false,
    }));

    res.json({
      user,
      scopable: ROLES_SCOPES.includes(user.role),
      rolesScopes: ROLES_SCOPES,
      affectations,
      affectationsProjets,
      marches,
      projets: tousProjets.map((p) => ({
        ...p,
        affecte: projetsAffectes.has(p.id),
        nbMarches: tousMarches.filter((m) => m.projetId === p.id).length,
      })),
      nbAffectes: affectes.size,
      nbProjetsAffectes: projetsAffectes.size,
      nbMarchesVisibles: marches.filter((m) => m.affecte || m.couvertParProjet).length,
    });
  } catch (err) { next(err); }
});

usersRouter.put("/:id/affectations", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    // `projetIds` est facultatif : un appelant qui ne connaît que les marchés
    // (ancien écran, script) continue de fonctionner sans effacer les projets ?
    // Non — il les efface, et c'est voulu : l'écran envoie toujours l'état
    // complet du périmètre. Un PUT partiel silencieux serait pire.
    const { marcheIds, projetIds } = z
      .object({
        marcheIds: z.array(z.string().uuid()).max(500),
        projetIds: z.array(z.string().uuid()).max(500).default([]),
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true } });
    if (!user) throw new ApiError(404, "Utilisateur introuvable");
    if (!ROLES_SCOPES.includes(user.role)) {
      throw new ApiError(400, `Le rôle ${user.role} n'est pas soumis au périmètre d'affectation (concernés : ${ROLES_SCOPES.join(", ")})`);
    }
    if (marcheIds.length > 0) {
      const existants = await prisma.marche.count({ where: { id: { in: marcheIds }, deletedAt: null } });
      if (existants !== marcheIds.length) throw new ApiError(400, "Un ou plusieurs marchés sont introuvables");
    }
    if (projetIds.length > 0) {
      const existants = await prisma.projet.count({ where: { id: { in: projetIds }, deletedAt: null } });
      if (existants !== projetIds.length) throw new ApiError(400, "Un ou plusieurs projets sont introuvables");
    }

    const [avantMarches, avantProjets] = await Promise.all([
      prisma.marcheAffectation.findMany({ where: { userId: req.params.id }, select: { marcheId: true } }),
      prisma.projetAffectation.findMany({ where: { userId: req.params.id }, select: { projetId: true } }),
    ]);
    const ancienneListe = avantMarches.map((a) => a.marcheId);
    const anciensProjets = avantProjets.map((a) => a.projetId);

    await prisma.$transaction([
      prisma.marcheAffectation.deleteMany({ where: { userId: req.params.id, marcheId: { notIn: marcheIds } } }),
      prisma.marcheAffectation.createMany({
        data: marcheIds
          .filter((mid) => !ancienneListe.includes(mid))
          .map((marcheId) => ({ userId: req.params.id, marcheId })),
        skipDuplicates: true,
      }),
      prisma.projetAffectation.deleteMany({ where: { userId: req.params.id, projetId: { notIn: projetIds } } }),
      prisma.projetAffectation.createMany({
        data: projetIds
          .filter((pid) => !anciensProjets.includes(pid))
          .map((projetId) => ({ userId: req.params.id, projetId })),
        skipDuplicates: true,
      }),
    ]);

    await logAudit({
      userId: req.user.id, action: "UPDATE", entityType: "UserAffectations", entityId: req.params.id,
      before: { marcheIds: ancienneListe, projetIds: anciensProjets }, after: { marcheIds, projetIds },
    });

    // Le périmètre réel est recalculé : c'est lui qu'il faut annoncer, pas le
    // nombre de cases cochées. Un projet affecté vaut tous ses marchés.
    const perimetre = await getMarchesAffectes(req.params.id, user.role);
    res.json({
      message: `Périmètre mis à jour — ${projetIds.length} projet(s) et ${marcheIds.length} marché(s) cochés`,
      nbProjets: projetIds.length,
      nbAffectes: marcheIds.length,
      nbMarchesVisibles: perimetre?.length ?? 0,
    });
  } catch (err) { next(err); }
});
