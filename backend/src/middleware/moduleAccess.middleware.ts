import type { Request, Response, NextFunction } from "express";
import { ApiError } from "./error.middleware";
import { isModuleDenied } from "../lib/modules.catalog";

/**
 * Bloque l'accès à un module UNIQUEMENT s'il a été explicitement retiré à
 * l'utilisateur (override allowed=false). Sans override, le rôle continue de
 * décider → comportement non régressif. L'admin n'est jamais bloqué.
 */
export function checkModuleAccess(moduleKey: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(new ApiError(401, "Authentification requise"));
      if (req.user.role === "ADMIN") return next();
      if (await isModuleDenied(req.user.id, moduleKey)) {
        return next(new ApiError(403, "Accès à ce module retiré par l'administrateur"));
      }
      next();
    } catch (err) { next(err); }
  };
}
