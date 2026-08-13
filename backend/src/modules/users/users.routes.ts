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
