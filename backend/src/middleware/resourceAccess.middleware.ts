import type { NextFunction, Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getMarchesAffectes } from "../lib/affectations";
import { ApiError } from "./error.middleware";

type ScopeUser = NonNullable<Request["user"]>;

const activeDecompteScope: Prisma.DecompteWhereInput = {
  deletedAt: null,
  marche: { deletedAt: null },
};

export function buildDecompteScopeWhere(
  user: ScopeUser,
  marchesAffectes: string[] | null,
): Prisma.DecompteWhereInput {
  if (user.role === "ENTREPRISE") {
    return user.entrepriseId
      ? { ...activeDecompteScope, entrepriseId: user.entrepriseId }
      : { ...activeDecompteScope, id: { in: [] } };
  }
  if (marchesAffectes !== null) {
    return { ...activeDecompteScope, marcheId: { in: marchesAffectes } };
  }
  return { ...activeDecompteScope };
}

export async function getDecompteScopeWhere(req: Request): Promise<Prisma.DecompteWhereInput> {
  if (!req.user) throw new ApiError(401, "Authentification requise");
  const marchesAffectes = await getMarchesAffectes(req.user.id, req.user.role);
  return buildDecompteScopeWhere(req.user, marchesAffectes);
}

export function assertResourceScope(
  user: ScopeUser,
  marcheId: string,
  entrepriseId: string,
  marchesAffectes: string[] | null,
) {
  if (user.role === "ENTREPRISE" && user.entrepriseId !== entrepriseId) {
    throw new ApiError(404, "Ressource introuvable");
  }
  if (marchesAffectes !== null && !marchesAffectes.includes(marcheId)) {
    throw new ApiError(404, "Ressource introuvable");
  }
}

async function assertScope(req: Request, marcheId: string, entrepriseId: string) {
  if (!req.user) throw new ApiError(401, "Authentification requise");
  const marches = await getMarchesAffectes(req.user.id, req.user.role);
  assertResourceScope(req.user, marcheId, entrepriseId, marches);
}

export async function requireDecompteScope(req: Request, _res: Response, next: NextFunction, id: string) {
  try {
    const resource = await prisma.decompte.findFirst({
      where: { id, deletedAt: null, marche: { deletedAt: null } },
      select: { marcheId: true, entrepriseId: true },
    });
    if (!resource) throw new ApiError(404, "D\u00e9compte introuvable");
    await assertScope(req, resource.marcheId, resource.entrepriseId);
    next();
  } catch (error) { next(error); }
}

export async function requireAttachementScope(req: Request, _res: Response, next: NextFunction, id: string) {
  try {
    const resource = await prisma.attachement.findFirst({
      where: { id, decompte: { deletedAt: null, marche: { deletedAt: null } } },
      select: { decompte: { select: { marcheId: true, entrepriseId: true } } },
    });
    if (!resource) throw new ApiError(404, "Attachement introuvable");
    await assertScope(req, resource.decompte.marcheId, resource.decompte.entrepriseId);
    next();
  } catch (error) { next(error); }
}

export async function requireAttachementLigneScope(req: Request, _res: Response, next: NextFunction, ligneId: string) {
  try {
    const resource = await prisma.attachementLigne.findFirst({
      where: {
        id: ligneId,
        attachement: { decompte: { deletedAt: null, marche: { deletedAt: null } } },
      },
      select: {
        attachement: {
          select: { decompte: { select: { marcheId: true, entrepriseId: true } } },
        },
      },
    });
    if (!resource) throw new ApiError(404, "Ressource introuvable");
    await assertScope(
      req,
      resource.attachement.decompte.marcheId,
      resource.attachement.decompte.entrepriseId,
    );
    next();
  } catch (error) { next(error); }
}

export async function requireBodyMarcheScope(req: Request, _res: Response, next: NextFunction) {
  try {
    const marcheId = typeof req.body?.marcheId === "string" ? req.body.marcheId : undefined;
    if (!marcheId) throw new ApiError(400, "March\u00e9 requis");
    const marche = await prisma.marche.findFirst({
      where: { id: marcheId, deletedAt: null },
      select: { id: true, entrepriseId: true },
    });
    if (!marche) throw new ApiError(404, "March\u00e9 introuvable");
    await assertScope(req, marche.id, marche.entrepriseId);
    if (req.user?.role === "ENTREPRISE" && req.body.entrepriseId && req.body.entrepriseId !== marche.entrepriseId) {
      throw new ApiError(404, "Ressource introuvable");
    }
    next();
  } catch (error) { next(error); }
}

export async function requireBodyDecompteScope(req: Request, _res: Response, next: NextFunction) {
  try {
    const decompteId = typeof req.body?.decompteId === "string" ? req.body.decompteId : undefined;
    if (!decompteId) throw new ApiError(400, "D\u00e9compte requis");
    const resource = await prisma.decompte.findFirst({
      where: { id: decompteId, deletedAt: null, marche: { deletedAt: null } },
      select: { marcheId: true, entrepriseId: true },
    });
    if (!resource) throw new ApiError(404, "D\u00e9compte introuvable");
    await assertScope(req, resource.marcheId, resource.entrepriseId);
    next();
  } catch (error) { next(error); }
}

export function requireDecompteParamScope(paramName: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const id = req.params[paramName];
      const resource = await prisma.decompte.findFirst({
        where: { id, deletedAt: null, marche: { deletedAt: null } },
        select: { marcheId: true, entrepriseId: true },
      });
      if (!resource) throw new ApiError(404, "D\u00e9compte introuvable");
      await assertScope(req, resource.marcheId, resource.entrepriseId);
      next();
    } catch (error) { next(error); }
  };
}

export async function requireBpmnSubmissionScope(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const moduleType = req.params.moduleType?.toUpperCase();
    const roles: Record<string, string[]> = {
      DECOMPTE: ["ADMIN", "DMC", "MISSION", "ENTREPRISE"],
      ATTACHEMENT: ["ADMIN", "DMC", "MISSION", "TECHNIQUE", "ENTREPRISE"],
      MARCHE: ["ADMIN", "DMC", "DAF", "DG"],
      PROJET: ["ADMIN", "DMC", "DAF", "DG", "UGP"],
      CONFORMITE: ["ADMIN", "DMC", "DAF", "DG"],
    };
    if (!roles[moduleType]?.includes(req.user.role)) throw new ApiError(403, "Soumission BPMN non autoris\u00e9e");
    if (moduleType === "DECOMPTE") {
      const resource = await prisma.decompte.findFirst({
        where: { id: req.params.entityId, deletedAt: null, marche: { deletedAt: null } },
        select: { marcheId: true, entrepriseId: true },
      });
      if (!resource) throw new ApiError(404, "D\u00ecompte introuvable");
      await assertScope(req, resource.marcheId, resource.entrepriseId);
    }
    if (moduleType === "ATTACHEMENT") {
      const resource = await prisma.attachement.findFirst({
        where: { id: req.params.entityId, decompte: { deletedAt: null, marche: { deletedAt: null } } },
        select: { decompte: { select: { marcheId: true, entrepriseId: true } } },
      });
      if (!resource) throw new ApiError(404, "Attachement introuvable");
      await assertScope(req, resource.decompte.marcheId, resource.decompte.entrepriseId);
    }
    next();
  } catch (error) { next(error); }
}
