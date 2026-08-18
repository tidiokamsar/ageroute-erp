/**
 * L0.2 — API CRUD des règles de gestion, validation quatre yeux et gel.
 * PLAN-TRAVAIL-AGENT-PARAMETRAGE.md §3, spécification Codex complète.
 *
 * Cycle de vie : BROUILLON → SOUMISE → APPROUVEE ou REJETEE → GELEE
 * - Seule une règle BROUILLON est modifiable
 * - L'auteur ne peut jamais approuver sa propre règle (quatre yeux)
 * - Une règle GELEE est immuable
 * - Toute correction d'une règle APPROUVEE crée une nouvelle version
 * - Gel financier (L1.2) : une règle FINANCE ne peut être approuvée
 *   que si aucun décompte n'est en circuit sur sa portée
 * - Tout est journalisé (logAudit + regle_gestion_historique)
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { REGLES_DEFAUT, invaliderCacheRegles, type CleRegles } from "../../lib/regles";
import { verifierGelFinancier, compterDecomptesEnCircuit } from "../decomptes/decomptes.regles.audit";
import { z } from "zod";

export const reglesCrudRouter = Router();
reglesCrudRouter.use(requireAuth);

// ─── Schémas de validation ─────────────────────────────────────────────────────
const corpsRegle = z.object({
  cle: z.string().refine((c) => c in REGLES_DEFAUT, { message: "Clé de règle inconnue" }),
  valeur: z.string().min(1).max(500),
  categorie: z.enum(["FINANCE", "WORKFLOW", "ETATS", "CONFORMITE"]),
  libelle: z.string().min(3).max(200),
  description: z.string().max(1000).optional(),
  type: z.enum(["ENUM", "NUMBER", "BOOLEAN", "MULTI", "JSON"]),
  options: z.record(z.unknown()).optional(),
  portee: z.enum(["GLOBAL", "BAILLEUR", "TYPE_MARCHE", "MARCHE"]).default("GLOBAL"),
  porteeId: z.string().default(""),
  dateEffet: z.coerce.date().refine((d) => d >= new Date(new Date().toDateString()), { message: "La date d'effet ne peut pas être dans le passé" }),
  motif: z.string().min(10, "Motif obligatoire (minimum 10 caractères)"),
});

const corpsModification = corpsRegle.partial().omit({ cle: true, categorie: true });

const corpsRejet = z.object({
  motifRejet: z.string().min(10, "Motif de rejet obligatoire (minimum 10 caractères)"),
});

const corpsGel = z.object({
  motif: z.string().min(10, "Motif du gel obligatoire"),
});

// ─── Helpers ───────────────────────────────────────────────────────────────────
function validerCoherencePortee(portee: string, porteeId: string): void {
  if (portee !== "GLOBAL" && !porteeId) {
    throw new ApiError(400, `La portée ${portee} exige un porteeId`);
  }
}

async function ecrireHistorique(
  regleId: string, cle: string, ancienne: string | null, nouvelle: string,
  dateEffet: Date, saisiPar: string, validePar: string | null, motif: string,
): Promise<void> {
  await prisma.regleGestionHistorique.create({
    data: { regleId, cle, ancienne, nouvelle, dateEffet, saisiPar, validePar, motif },
  });
}

// ─── GET /api/parametrage/regles — liste filtrée + paginée ─────────────────────
reglesCrudRouter.get("/regles", requireRole("ADMIN", "DAF", "DG"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const where: Record<string, unknown> = {};

    if (req.query.statut) where.statut = String(req.query.statut);
    if (req.query.categorie) where.categorie = String(req.query.categorie);
    if (req.query.cle) where.cle = { contains: String(req.query.cle), mode: "insensitive" };
    if (req.query.portee) where.portee = String(req.query.portee);
    if (req.query.porteeId) where.porteeId = String(req.query.porteeId);

    const orderBy: Record<string, string> = {};
    const tri = String(req.query.tri ?? "createdAt");
    const sens = String(req.query.sens ?? "desc");
    if (["cle", "statut", "categorie", "dateEffet", "createdAt", "version"].includes(tri)) {
      orderBy[tri] = sens === "asc" ? "asc" : "desc";
    } else {
      orderBy.createdAt = "desc";
    }

    const [data, total] = await Promise.all([
      prisma.regleGestion.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.regleGestion.count({ where }),
    ]);

    res.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 });
  } catch (err) { next(err); }
});

// ─── GET /api/parametrage/regles/:id ───────────────────────────────────────────
reglesCrudRouter.get("/regles/:id", requireRole("ADMIN", "DAF", "DG"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const regle = await prisma.regleGestion.findUnique({
      where: { id: req.params.id },
      include: { historiques: { orderBy: { createdAt: "desc" } } },
    });
    if (!regle) throw new ApiError(404, "Règle introuvable");
    res.json(regle);
  } catch (err) { next(err); }
});

// ─── POST /api/parametrage/regles — créer un BROUILLON ────────────────────────
reglesCrudRouter.post("/regles", requireRole("ADMIN", "DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const corps = corpsRegle.parse(req.body);
    validerCoherencePortee(corps.portee, corps.porteeId);

    // Vérifier qu'une règle active n'existe pas déjà pour cette clé/portée/période
    const existante = await prisma.regleGestion.findFirst({
      where: {
        cle: corps.cle,
        portee: corps.portee,
        porteeId: corps.porteeId,
        statut: { in: ["APPROUVEE", "GELEE"] },
        dateEffet: corps.dateEffet,
      },
    });
    if (existante) {
      throw new ApiError(409, `Une règle ${existante.statut} existe déjà pour ${corps.cle}/${corps.portee} à cette date d'effet (version ${existante.version})`);
    }

    // Numéro de version : max existant + 1
    const derniereVersion = await prisma.regleGestion.findFirst({
      where: { cle: corps.cle, portee: corps.portee, porteeId: corps.porteeId },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const regle = await prisma.regleGestion.create({
      data: {
        ...corps,
        options: corps.options as never,
        valeurDefaut: REGLES_DEFAUT[corps.cle as CleRegles] ?? "",
        version: (derniereVersion?.version ?? 0) + 1,
        statut: "BROUILLON",
        saisiPar: req.user.id,
      },
    });

    await ecrireHistorique(regle.id, regle.cle, null, regle.valeur, regle.dateEffet, req.user.id, null, `Création brouillon — ${corps.motif}`);
    await logAudit({ userId: req.user.id, action: "CREATE", entityType: "RegleGestion", entityId: regle.id, after: { cle: regle.cle, valeur: regle.valeur, statut: "BROUILLON" } });

    res.status(201).json(regle);
  } catch (err) { next(err); }
});

// ─── PATCH /api/parametrage/regles/:id — modifier un BROUILLON ────────────────
reglesCrudRouter.patch("/regles/:id", requireRole("ADMIN", "DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const corps = corpsModification.parse(req.body);
    const regle = await prisma.regleGestion.findUnique({ where: { id: req.params.id } });
    if (!regle) throw new ApiError(404, "Règle introuvable");

    if (regle.statut !== "BROUILLON") {
      throw new ApiError(400, `Une règle ${regle.statut} n'est pas modifiable — créez une nouvelle version`);
    }
    if (corps.portee) validerCoherencePortee(corps.portee, corps.porteeId ?? regle.porteeId);

    const ancienne = regle.valeur;
    const updated = await prisma.regleGestion.update({
      where: { id: req.params.id },
      data: { ...corps, options: corps.options as never },
    });

    await ecrireHistorique(updated.id, updated.cle, ancienne, updated.valeur, updated.dateEffet, req.user.id, null, `Modification brouillon — ${corps.motif ?? "sans motif"}`);
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "RegleGestion", entityId: updated.id, before: { valeur: ancienne }, after: { valeur: updated.valeur } });

    res.json(updated);
  } catch (err) { next(err); }
});

// ─── POST /:id/soumettre — BROUILLON → SOUMISE ─────────────────────────────────
reglesCrudRouter.post("/regles/:id/soumettre", requireRole("ADMIN", "DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const regle = await prisma.regleGestion.findUnique({ where: { id: req.params.id } });
    if (!regle) throw new ApiError(404, "Règle introuvable");

    if (regle.statut !== "BROUILLON") {
      throw new ApiError(400, `Transition interdite : ${regle.statut} → SOUMISE (seul un BROUILLON peut être soumis)`);
    }

    const updated = await prisma.regleGestion.update({
      where: { id: req.params.id },
      data: { statut: "SOUMISE", soumisAt: new Date(), soumisPar: req.user.id },
    });

    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "RegleGestion", entityId: updated.id, after: { statut: "SOUMISE" } });
    res.json({ ...updated, message: "Règle soumise à validation — un validateur différent du saisisseur doit approuver" });
  } catch (err) { next(err); }
});

// ─── POST /:id/approuver — SOUMISE → APPROUVEE (quatre yeux + gel) ─────────────
reglesCrudRouter.post("/regles/:id/approuver", requireRole("ADMIN", "DAF", "DG"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const regle = await prisma.regleGestion.findUnique({ where: { id: req.params.id } });
    if (!regle) throw new ApiError(404, "Règle introuvable");

    if (regle.statut !== "SOUMISE") {
      throw new ApiError(400, `Transition interdite : ${regle.statut} → APPROUVEE (seul une SOUMISE peut être approuvée)`);
    }

    // QUATRE YEUX : l'approbateur doit être différent du saisisseur
    if (regle.soumisPar === req.user.id) {
      await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "RegleGestion", entityId: regle.id, after: { tentative: "auto-approbation REFUSÉE" } });
      throw new ApiError(403, "Quatre yeux : vous ne pouvez pas approuver une règle que vous avez vous-même soumise");
    }

    // GEL FINANCIER (L1.2) : une règle FINANCE ne peut pas être approuvée
    // si des décomptes sont en circuit sur sa portée
    if (regle.categorie === "FINANCE") {
      const enCircuit = await compterDecomptesEnCircuit(regle.portee, regle.porteeId);
      const decision = verifierGelFinancier(regle.categorie, enCircuit);
      if (!decision.autorise) {
        throw new ApiError(409, decision.message);
      }
    }

    // Transaction : approuver + historique + invalidation cache
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.regleGestion.update({
        where: { id: req.params.id, statut: "SOUMISE" }, // optimistic locking
        data: {
          statut: "APPROUVEE",
          validePar: req.user!.id,
          valideAt: new Date(),
        },
      });

      await tx.regleGestionHistorique.create({
        data: {
          regleId: updated.id, cle: updated.cle,
          ancienne: null, nouvelle: updated.valeur,
          dateEffet: updated.dateEffet,
          saisiPar: updated.soumisPar ?? "inconnu",
          validePar: req.user!.id,
          motif: `Approbation quatre yeux — ${updated.motif}`,
        },
      });

      return updated;
    });

    invaliderCacheRegles();
    await logAudit({ userId: req.user.id, action: "APPROVE", entityType: "RegleGestion", entityId: result.id, after: { statut: "APPROUVEE", validePar: req.user.email } });

    res.json({ ...result, message: "Règle approuvée — active à compter de sa date d'effet" });
  } catch (err) {
    // Gérer le conflit de concurrence (optimistic locking)
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return next(new ApiError(409, "Conflit de concurrence : la règle a été modifiée entre-temps"));
    }
    next(err);
  }
});

// ─── POST /:id/rejeter — SOUMISE → REJETEE (motif obligatoire) ─────────────────
reglesCrudRouter.post("/regles/:id/rejeter", requireRole("ADMIN", "DAF", "DG"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const corps = corpsRejet.parse(req.body);
    const regle = await prisma.regleGestion.findUnique({ where: { id: req.params.id } });
    if (!regle) throw new ApiError(404, "Règle introuvable");

    if (regle.statut !== "SOUMISE") {
      throw new ApiError(400, `Transition interdite : ${regle.statut} → REJETEE (seul une SOUMISE peut être rejetée)`);
    }

    // Quatre yeux : le rejeteur doit aussi être différent du soumetteur
    if (regle.soumisPar === req.user.id) {
      throw new ApiError(403, "Quatre yeux : vous ne pouvez pas rejeter une règle que vous avez vous-même soumise");
    }

    const updated = await prisma.regleGestion.update({
      where: { id: req.params.id },
      data: { statut: "REJETEE", motifRejet: corps.motifRejet, validePar: req.user.id, valideAt: new Date() },
    });

    await ecrireHistorique(updated.id, updated.cle, updated.valeur, updated.valeur, updated.dateEffet, updated.soumisPar ?? "", req.user.id, `Rejet — ${corps.motifRejet}`);
    await logAudit({ userId: req.user.id, action: "REJECT", entityType: "RegleGestion", entityId: updated.id, after: { statut: "REJETEE", motifRejet: corps.motifRejet } });

    res.json({ ...updated, message: "Règle rejetée — le motif est conservé dans l'historique" });
  } catch (err) { next(err); }
});

// ─── POST /:id/geler — APPROUVEE → GELEE (immuable) ────────────────────────────
reglesCrudRouter.post("/regles/:id/geler", requireRole("ADMIN", "DG"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const corps = corpsGel.parse(req.body);
    const regle = await prisma.regleGestion.findUnique({ where: { id: req.params.id } });
    if (!regle) throw new ApiError(404, "Règle introuvable");

    if (regle.statut !== "APPROUVEE") {
      throw new ApiError(400, `Transition interdite : ${regle.statut} → GELEE (seul une APPROUVEE peut être gelée)`);
    }

    const updated = await prisma.regleGestion.update({
      where: { id: req.params.id },
      data: { statut: "GELEE" },
    });

    await ecrireHistorique(updated.id, updated.cle, updated.valeur, updated.valeur, updated.dateEffet, updated.soumisPar ?? "", req.user.id, `Gel — ${corps.motif}`);
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "RegleGestion", entityId: updated.id, after: { statut: "GELEE" } });

    res.json({ ...updated, message: "Règle gelée — immuable jusqu'à décision explicite de dégel" });
  } catch (err) { next(err); }
});
