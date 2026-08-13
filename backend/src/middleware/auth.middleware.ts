import type { Request, Response, NextFunction } from "express";
import { verifyAccess } from "../lib/jwt";
import { ApiError } from "./error.middleware";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: string };
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new ApiError(401, "Token manquant");
    const token = header.slice(7);
    const payload = verifyAccess(token);
    req.user = { id: payload.userId, email: payload.email, role: payload.role };
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    next(new ApiError(401, "Token invalide ou expiré"));
  }
}
