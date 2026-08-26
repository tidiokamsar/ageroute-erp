/**
 * Recherche globale — un champ unique qui trouve marché, décompte, attachement,
 * entreprise. Respecte le périmètre d'affectation des agents terrain.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../../lib/prisma";
import { getMarchesAffectes } from "../../lib/affectations";
import { entrepriseDuCompte } from "../../lib/perimetre";
import { ApiError } from "../../middleware/error.middleware";

export const searchRouter = Router();

searchRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return res.json({ marches: [], decomptes: [], attachements: [], entreprises: [] });

    const affectes = await getMarchesAffectes(req.user.id, req.user.role);
    const scopeMarche = affectes ? { id: { in: affectes } } : {};
    const scopeParMarche = affectes ? { marcheId: { in: affectes } } : {};
    // Isolation ENTREPRISE (revue du 20/08/2026) : la recherche était le
    // contournement du cloisonnement — un compte entreprise y retrouvait
    // marchés, décomptes, attachements et fiches (NIF) de toute l'agence.
    const mienne = await entrepriseDuCompte(req);

    const ci = { contains: q, mode: "insensitive" as const };

    const [marches, decomptes, attachements, entreprises] = await Promise.all([
      prisma.marche.findMany({
        where: { deletedAt: null, ...scopeMarche, ...(mienne ? { entrepriseId: mienne } : {}), OR: [{ reference: ci }, { intitule: ci }, { numContrat: ci }, { tronconCode: ci }] },
        select: { id: true, reference: true, intitule: true, statut: true },
        take: 5,
      }),
      prisma.decompte.findMany({
        where: { deletedAt: null, ...scopeParMarche, ...(mienne ? { entrepriseId: mienne } : {}), OR: [{ reference: ci }, { numeroDossier: ci }] },
        select: { id: true, reference: true, numeroDossier: true, statut: true, entreprise: { select: { raisonSociale: true } } },
        take: 5,
      }),
      prisma.attachement.findMany({
        where: { decompte: { ...(affectes ? { marcheId: { in: affectes } } : {}), ...(mienne ? { entrepriseId: mienne } : {}) }, OR: [{ code: ci }, { natureTravaux: ci }] },
        select: { id: true, code: true, statut: true, decompte: { select: { reference: true } } },
        take: 5,
      }),
      prisma.entreprise.findMany({
        where: { deletedAt: null, ...(mienne ? { id: mienne } : {}), OR: [{ raisonSociale: ci }, { nif: ci }, { rccm: ci }, { sigle: ci }] },
        select: { id: true, raisonSociale: true, nif: true, statut: true },
        take: 5,
      }),
    ]);

    res.json({ marches, decomptes, attachements, entreprises });
  } catch (err) { next(err); }
});
