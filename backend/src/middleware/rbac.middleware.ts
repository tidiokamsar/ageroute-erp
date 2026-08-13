import type { Request, Response, NextFunction } from "express";
import { ApiError } from "./error.middleware";
import type { Role } from "@prisma/client";

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new ApiError(401, "Authentification requise"));
    if (!roles.includes(req.user.role as Role)) return next(new ApiError(403, "Accès refusé"));
    next();
  };
}
