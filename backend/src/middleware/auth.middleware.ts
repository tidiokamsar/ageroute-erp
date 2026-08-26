import type { Request, Response, NextFunction } from "express";
import { verifyAccess } from "../lib/jwt";
import { ApiError } from "./error.middleware";
import { prisma } from "../lib/prisma";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: string; nomComplet: string; entrepriseId: string | null };
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new ApiError(401, "Token manquant");
    const token = header.slice(7);
    const payload = verifyAccess(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, nomComplet: true, entrepriseId: true, actif: true },
    });
    if (!user?.actif) throw new ApiError(401, "Utilisateur inactif ou introuvable");
    req.user = { id: user.id, email: user.email, role: user.role, nomComplet: user.nomComplet, entrepriseId: user.entrepriseId };
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    next(new ApiError(401, "Token invalide ou expiré"));
  }
}
