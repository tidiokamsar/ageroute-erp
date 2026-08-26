/**
 * Module Révision de prix (FIDIC) — indexation contractuelle.
 * Formule : P = P0 × ( a + Σ bi · Ii,t / Ii,0 )
 *   a           = coeffFixe (part non révisable)
 *   bi          = composante.coefficient (poids)
 *   Ii,0        = composante.valeurBase (indice à la date de base)
 *   Ii,t        = IndexMensuel(code, année, mois) de la période du décompte
 * Le montant de révision = montantHt × (coeff − 1). Reste une SUGGESTION éditable.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/error.middleware";
import { logAudit } from "../../lib/audit";
import { z } from "zod";
import { assertMarcheAutorise } from "../../lib/perimetre";

export const revisionRouter = Router();
revisionRouter.use(requireAuth);

// ── Formule d'un marché ──────────────────────────────────────────────────────
revisionRouter.get("/marches/:marcheId/formule", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Périmètre d'affectation (revue 20/08/2026) : l'import existait, la
    // vérification n'était jamais faite — formule et calcul ouverts.
    await assertMarcheAutorise(req, req.params.marcheId);
    const formule = await prisma.formuleRevision.findUnique({
      where: { marcheId: req.params.marcheId },
      include: { composantes: { orderBy: { nom: "asc" } } },
    });
    res.json(formule);
  } catch (err) { next(err); }
});

// Créer / mettre à jour la formule + remplacer ses composantes
revisionRouter.put("/marches/:marcheId/formule", requireRole("ADMIN", "DMC", "DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const body = z.object({
      coeffFixe: z.number().min(0).max(1),
      actif: z.boolean().optional(),
      composantes: z.array(z.object({
        nom: z.string().min(1),
        coefficient: z.number().min(0).max(1),
        indexCode: z.string().min(1),
        valeurBase: z.number().positive(),
      })),
    }).parse(req.body);

    const marche = await prisma.marche.findUnique({ where: { id: req.params.marcheId }, select: { id: true } });
    if (!marche) throw new ApiError(404, "Marché introuvable");

    // Contrôle cohérence : a + Σ bi ≈ 1
    const somme = body.coeffFixe + body.composantes.reduce((s, c) => s + c.coefficient, 0);
    const coherent = Math.abs(somme - 1) < 0.001;

    const formule = await prisma.formuleRevision.upsert({
      where: { marcheId: req.params.marcheId },
      create: {
        marcheId: req.params.marcheId,
        coeffFixe: body.coeffFixe,
        actif: body.actif ?? true,
        composantes: { create: body.composantes },
      },
      update: {
        coeffFixe: body.coeffFixe,
        actif: body.actif ?? true,
        composantes: { deleteMany: {}, create: body.composantes },
      },
      include: { composantes: true },
    });
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "FormuleRevision", entityId: formule.id, after: formule });
    res.json({ formule, coherent, somme: Math.round(somme * 1000) / 1000 });
  } catch (err) { next(err); }
});

// ── Index mensuels ───────────────────────────────────────────────────────────
revisionRouter.get("/index", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = req.query.code as string | undefined;
    const list = await prisma.indexMensuel.findMany({
      where: code ? { code } : {},
      orderBy: [{ code: "asc" }, { annee: "desc" }, { mois: "desc" }],
      take: 500,
    });
    res.json(list);
  } catch (err) { next(err); }
});

// Codes d'index distincts (pour les listes déroulantes)
revisionRouter.get("/index/codes", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await prisma.indexMensuel.findMany({
      distinct: ["code"],
      select: { code: true, libelle: true },
      orderBy: { code: "asc" },
    });
    res.json(rows);
  } catch (err) { next(err); }
});

// Saisir / mettre à jour une valeur d'index (unique par code+année+mois)
revisionRouter.post("/index", requireRole("ADMIN", "DMC", "DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const body = z.object({
      code: z.string().min(1),
      libelle: z.string().min(1),
      annee: z.number().int().min(2000).max(2100),
      mois: z.number().int().min(1).max(12),
      valeur: z.number().positive(),
    }).parse(req.body);

    const idx = await prisma.indexMensuel.upsert({
      where: { code_annee_mois: { code: body.code, annee: body.annee, mois: body.mois } },
      create: body,
      update: { libelle: body.libelle, valeur: body.valeur },
    });
    res.status(201).json(idx);
  } catch (err) { next(err); }
});

// ── Calcul de la révision pour une période ───────────────────────────────────
revisionRouter.get("/marches/:marcheId/calcul", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({
      annee: z.coerce.number().int().min(2000).max(2100),
      mois: z.coerce.number().int().min(1).max(12),
      montantHt: z.coerce.number().nonnegative(),
    }).parse(req.query);

    const formule = await prisma.formuleRevision.findUnique({
      where: { marcheId: req.params.marcheId },
      include: { composantes: true },
    });
    if (!formule || !formule.actif) {
      return res.json({ applicable: false, message: "Aucune formule de révision active pour ce marché", revisionMontant: 0 });
    }

    const details: { nom: string; indexCode: string; valeurBase: number; valeurActuelle: number | null; ratio: number | null; contribution: number | null }[] = [];
    const manquants: string[] = [];
    let coeff = formule.coeffFixe;

    for (const c of formule.composantes) {
      const idx = await prisma.indexMensuel.findUnique({
        where: { code_annee_mois: { code: c.indexCode, annee: q.annee, mois: q.mois } },
      });
      if (!idx) {
        manquants.push(`${c.indexCode} (${q.mois}/${q.annee})`);
        details.push({ nom: c.nom, indexCode: c.indexCode, valeurBase: c.valeurBase, valeurActuelle: null, ratio: null, contribution: null });
        continue;
      }
      const ratio = idx.valeur / c.valeurBase;
      const contribution = c.coefficient * ratio;
      coeff += contribution;
      details.push({ nom: c.nom, indexCode: c.indexCode, valeurBase: c.valeurBase, valeurActuelle: idx.valeur, ratio: Math.round(ratio * 10000) / 10000, contribution: Math.round(contribution * 10000) / 10000 });
    }

    if (manquants.length > 0) {
      return res.json({
        applicable: false,
        message: `Indices manquants pour la période : ${manquants.join(", ")}. Saisissez-les avant de calculer.`,
        manquants, details, revisionMontant: 0,
      });
    }

    const coefficient = Math.round(coeff * 10000) / 10000;
    const revisionMontant = Math.round(q.montantHt * (coeff - 1));
    res.json({
      applicable: true,
      coefficient,
      revisionMontant,
      periode: { annee: q.annee, mois: q.mois },
      montantHt: q.montantHt,
      details,
    });
  } catch (err) { next(err); }
});
