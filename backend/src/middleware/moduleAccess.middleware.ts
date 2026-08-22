import type { Request, Response, NextFunction } from "express";
import { ApiError } from "./error.middleware";
import { getEffectiveModules } from "../lib/modules.catalog";

export type EffectiveModulesResolver = (userId: string, role: string) => Promise<string[]>;

/**
 * Applique côté API la même liste effective que la navigation : droits du rôle
 * complétés ou retirés par les overrides individuels. L'admin reste exempté.
 */
export function checkModuleAccess(
  moduleKey: string,
  resolveEffectiveModules: EffectiveModulesResolver = getEffectiveModules,
) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(new ApiError(401, "Authentification requise"));
      if (req.user.role === "ADMIN") return next();

      const modules = await resolveEffectiveModules(req.user.id, req.user.role);
      if (!modules.includes(moduleKey)) {
        return next(new ApiError(403, "Accès à ce module non autorisé"));
      }
      next();
    } catch (err) { next(err); }
  };
}
