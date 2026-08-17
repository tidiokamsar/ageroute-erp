import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { marcheCreateSchema, marcheUpdateSchema } from "./marches.schema";
import { marchesService } from "./marches.service";
import { ApiError } from "../../middleware/error.middleware";
import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { z } from "zod";
import { StatutMarche } from "@prisma/client";

export const marchesRouter = Router();
marchesRouter.use(requireAuth);

// ─── Lecture liste ─────────────────────────────────────────────────────────

marchesRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await marchesService.list({
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
      search: req.query.search as string,
      statut: req.query.statut as string,
      financement: req.query.financement as string,
      entrepriseId: req.query.entrepriseId as string,
      retard: req.query.retard === "true",
    }));
  } catch (err) { next(err); }
});

marchesRouter.get("/stats", async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json(await marchesService.stats()); } catch (err) { next(err); }
});

marchesRouter.get("/by-contrat/:numContrat", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const m = await marchesService.getByNumContrat(req.params.numContrat);
    if (!m) return res.status(404).json({ error: "Marché introuvable" });
    res.json(m);
  } catch (err) { next(err); }
});

// ─── Fiche complète ────────────────────────────────────────────────────────

marchesRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await marchesService.getById(req.params.id)); } catch (err) { next(err); }
});

// ─── §13 — Situation financière consolidée ─────────────────────────────────

marchesRouter.get("/:id/situation", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const marche = await prisma.marche.findFirst({
      where: { id, deletedAt: null },
      include: {
        entreprise: { select: { id: true, raisonSociale: true, statut: true, scoreConformite: true } },
        projet: { select: { id: true, code: true, nom: true } },
        decomptes: {
          where: { deletedAt: null },
          select: { statut: true, netAPayer: true, retenueGarantie: true, avanceRecuperee: true, penalites: true, type: true },
        },
        avenants: { select: { montantSupplementaireGnf: true, prolongationJours: true, statut: true } },
        garanties: { where: { active: true }, select: { type: true, montantGnf: true, dateExpiration: true, active: true } },
        receptions: { orderBy: { createdAt: "desc" } },
        ordresService: { orderBy: { numero: "asc" } },
        historiqueStatuts: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!marche) throw new ApiError(404, "Marché introuvable");

    const dec = marche.decomptes;
    const montantCertifie   = dec.filter(d => ["VALIDE","VALIDE_DG","PAYE","ORDONNANCE","EN_CIRCUIT_FINANCIER"].includes(d.statut)).reduce((s, d) => s + Number(d.netAPayer), 0);
    const montantPaye       = dec.filter(d => d.statut === "PAYE").reduce((s, d) => s + Number(d.netAPayer), 0);
    const montantEnCours    = dec.filter(d => ["BROUILLON","DEPOSE","EN_CONTROLE","EN_VALIDATION","EN_CORRECTION"].includes(d.statut)).reduce((s, d) => s + Number(d.netAPayer), 0);
    const retenues          = dec.reduce((s, d) => s + Number(d.retenueGarantie), 0);
    const avances           = dec.reduce((s, d) => s + Number(d.avanceRecuperee), 0);
    const penalites         = dec.reduce((s, d) => s + Number(d.penalites), 0);
    const montantActualise  = Number(marche.montantActualiseGnf ?? marche.montantInitialGnf);
    const soldeRestant      = montantActualise - montantCertifie;

    // Vérification retard
    const finPrevue = marche.dateFinPrevue;
    const estEnRetard = marche.statut === "EN_EXECUTION" && finPrevue && new Date() > new Date(finPrevue);
    const joursRetard = estEnRetard && finPrevue
      ? Math.floor((Date.now() - new Date(finPrevue).getTime()) / 86400000)
      : 0;
    const penalitesCalculees = estEnRetard
      ? Math.min(joursRetard * Number(marche.penalitesJourGnf), montantActualise * marche.plafondPenalitesPct / 100)
      : 0;

    res.json({
      marche: {
        ...marche,
        montantInitialGnf: marche.montantInitialGnf.toString(),
        montantActualiseGnf: marche.montantActualiseGnf?.toString(),
        montantAvanceGnf: marche.montantAvanceGnf.toString(),
        penalitesJourGnf: marche.penalitesJourGnf.toString(),
        avanceComplementaireGnf: marche.avanceComplementaireGnf.toString(),
      },
      financier: {
        montantContratHt:   montantActualise,
        montantCertifie,
        montantPaye,
        montantEnCours,
        soldeRestant,
        tauxConsommation:   montantActualise > 0 ? Math.round(montantCertifie / montantActualise * 100 * 100) / 100 : 0,
        tauxPaiement:       montantActualise > 0 ? Math.round(montantPaye    / montantActualise * 100 * 100) / 100 : 0,
        retenues,
        avances,
        penalites,
        nbDecomptes:        dec.length,
        nbDecomptesEnCours: dec.filter(d => !["PAYE","REJETE"].includes(d.statut)).length,
      },
      retard: { estEnRetard, joursRetard, penalitesCalculees },
    });
  } catch (err) { next(err); }
});

// ─── §17 — Checklist conformité avant activation ────────────────────────────

marchesRouter.get("/:id/checklist", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const marche = await prisma.marche.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        entreprise: true,
        garanties: { where: { active: true } },
        ordresService: { where: { type: "DEMARRAGE" } },
      },
    });
    if (!marche) throw new ApiError(404, "Marché introuvable");

    const checks = {
      entreprise_conforme:   marche.entreprise.statut !== "BLOQUE",
      garantie_bonne_exec:   marche.garanties.some(g => g.type === "BONNE_EXECUTION"),
      garantie_avance:       marche.tauxAvance > 0
        ? marche.garanties.some(g => g.type === "AVANCE")
        : true,
      os_demarrage_emis:     marche.ordresService.length > 0,
      financement_defini:    !!marche.financement,
      contrat_signe:         !!marche.dateSignature,
      budget_indentifie:     !!marche.ligneBudgetaireId || !["BUDGET_NATIONAL","FER"].includes(marche.financement as string),
      entreprise_nif:        !!marche.entreprise.nif,
    };

    const allOk = Object.values(checks).every(Boolean);
    res.json({ checks, allOk, pretAExecuter: allOk });
  } catch (err) { next(err); }
});

// ─── §4 — Machine d'états : transition de statut ───────────────────────────

const TRANSITIONS_AUTORISEES: Record<StatutMarche, StatutMarche[]> = {
  BROUILLON:                 ["EN_PREPARATION"],
  EN_PREPARATION:            ["SIGNE","RESILIE"],
  SIGNE:                     ["NOTIFIE","RESILIE"],
  NOTIFIE:                   ["EN_EXECUTION","RESILIE"],
  EN_EXECUTION:              ["SUSPENDU","EN_AVENANT","EN_RECEPTION_PROVISOIRE","RESILIE"],
  ACTIF:                     ["SUSPENDU","EN_AVENANT","EN_RECEPTION_PROVISOIRE","RESILIE"],
  SUSPENDU:                  ["EN_EXECUTION","ACTIF","RESILIE"],
  EN_AVENANT:                ["EN_EXECUTION","ACTIF","RESILIE"],
  EN_RECEPTION_PROVISOIRE:   ["EN_RECEPTION_DEFINITIVE","EN_EXECUTION","ACTIF","RESILIE"],
  EN_RECEPTION_DEFINITIVE:   ["CLOTURE","SOLDE"],
  RESILIE:                   [],
  SOLDE:                     ["CLOTURE"],
  CLOTURE:                   [],
};

marchesRouter.post("/:id/transition", requireRole("ADMIN","DG","DAF","DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const { statut, motif, pieceRef } = z.object({
      statut:   z.nativeEnum(StatutMarche),
      motif:    z.string().optional(),
      pieceRef: z.string().optional(),
    }).parse(req.body);

    const marche = await prisma.marche.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!marche) throw new ApiError(404, "Marché introuvable");

    const autorisees = TRANSITIONS_AUTORISEES[marche.statut as StatutMarche] ?? [];
    if (!autorisees.includes(statut)) {
      throw new ApiError(400, `Transition ${marche.statut} → ${statut} non autorisée. Transitions possibles : [${autorisees.join(", ")}]`);
    }

    // Vérification checklist si on passe EN_EXECUTION
    if (statut === "EN_EXECUTION") {
      const garanties = await prisma.garantie.findMany({ where: { marcheId: marche.id, active: true } });
      const hasBonneExec = garanties.some(g => g.type === "BONNE_EXECUTION");
      if (!hasBonneExec) throw new ApiError(400, "Impossible de démarrer : garantie de bonne exécution manquante");
      const ent = await prisma.entreprise.findUnique({ where: { id: marche.entrepriseId } });
      if (ent?.statut === "BLOQUE") throw new ApiError(400, "Impossible de démarrer : entreprise bloquée");
    }

    // Vérification avant clôture
    if (statut === "CLOTURE") {
      const decomptesEnCours = await prisma.decompte.count({
        where: { marcheId: marche.id, deletedAt: null, statut: { notIn: ["PAYE","REJETE"] } },
      });
      if (decomptesEnCours > 0) throw new ApiError(400, `Clôture impossible : ${decomptesEnCours} décompte(s) non soldé(s)`);
    }

    const statutAvant = marche.statut;
    const [updated] = await prisma.$transaction([
      prisma.marche.update({ where: { id: req.params.id }, data: { statut, updatedBy: req.user.id } }),
      prisma.historiqueStatutMarche.create({
        data: { marcheId: req.params.id, statutAvant: statutAvant as StatutMarche, statutApres: statut, motif, pieceRef, userId: req.user.id, userEmail: req.user.email },
      }),
    ]);

    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "Marche", entityId: req.params.id, before: { statut: statutAvant }, after: { statut } });
    res.json({ marche: updated, message: `Marché passé en ${statut}` });
  } catch (err) { next(err); }
});

// ─── Historique des statuts ─────────────────────────────────────────────────

marchesRouter.get("/:id/historique-statuts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const historique = await prisma.historiqueStatutMarche.findMany({
      where: { marcheId: req.params.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(historique);
  } catch (err) { next(err); }
});

// ─── CRUD principal ─────────────────────────────────────────────────────────

marchesRouter.post("/", requireRole("ADMIN","DMC","DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    res.status(201).json(await marchesService.create(marcheCreateSchema.parse(req.body) as never, req.user.id));
  } catch (err) { next(err); }
});

marchesRouter.put("/:id", requireRole("ADMIN","DMC","DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    res.json(await marchesService.update(req.params.id, marcheUpdateSchema.parse(req.body) as never, req.user.id));
  } catch (err) { next(err); }
});

// ─── Statut simple (rétrocompat) ────────────────────────────────────────────

marchesRouter.put("/:id/statut", requireRole("ADMIN","DMC","DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const { statut } = z.object({ statut: z.nativeEnum(StatutMarche) }).parse(req.body);
    const updated = await prisma.marche.update({ where: { id: req.params.id }, data: { statut } });
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "Marche", entityId: req.params.id, after: { statut } });
    res.json(updated);
  } catch (err) { next(err); }
});

marchesRouter.delete("/:id", requireRole("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    await marchesService.remove(req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) { next(err); }
});

// ─── Avenants ───────────────────────────────────────────────────────────────

marchesRouter.get("/:id/avenants", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await prisma.avenant.findMany({
      where: { marcheId: req.params.id },
      orderBy: { numero: "asc" },
    }));
  } catch (err) { next(err); }
});

marchesRouter.post("/:id/avenants", requireRole("ADMIN","DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const data = z.object({
      objet:                    z.string().min(1),
      motif:                    z.string().optional(),
      impactPerimetre:          z.string().optional(),
      montantSupplementaireGnf: z.number().optional(),
      prolongationJours:        z.number().int().optional(),
      dateSignature:            z.coerce.date().optional(),
      observations:             z.string().optional(),
    }).parse(req.body);
    res.status(201).json(await marchesService.addAvenant(req.params.id, data, req.user.id));
  } catch (err) { next(err); }
});

// Workflow avenant — validation par étapes
marchesRouter.post("/:id/avenants/:aid/valider", requireRole("ADMIN","DMC","DAF","DG"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const { action } = z.object({ action: z.enum(["VALIDE_TECHNIQUE","VALIDE_FINANCIER","VISE_DG","APPROUVE","ANNULE"]) }).parse(req.body);
    const now = new Date();
    let updateData: Record<string, unknown> = { statut: action };
    if (action === "VALIDE_TECHNIQUE") { updateData = { ...updateData, valideTechniquePar: req.user.id, valideTechniqueAt: now }; }
    if (action === "VALIDE_FINANCIER") { updateData = { ...updateData, valideFinancierPar: req.user.id, valideFinancierAt: now }; }
    if (action === "VISE_DG" || action === "APPROUVE") { updateData = { ...updateData, visaDgPar: req.user.id, visaDgAt: now }; }

    const avenant = await prisma.avenant.update({ where: { id: req.params.aid }, data: updateData });
    if (action === "APPROUVE") {
      // Recalcul montant actualisé du marché
      const marche = await prisma.marche.findUnique({ where: { id: req.params.id }, include: { avenants: true } });
      if (marche) {
        const totalAvenants = marche.avenants.filter(a => a.statut === "APPROUVE").reduce((s, a) => s + Number(a.montantSupplementaireGnf), 0);
        await prisma.marche.update({ where: { id: req.params.id }, data: { montantActualiseGnf: BigInt(Number(marche.montantInitialGnf) + totalAvenants) } });
      }
    }
    res.json({ avenant, message: `Avenant ${action}` });
  } catch (err) { next(err); }
});

// ─── Garanties ──────────────────────────────────────────────────────────────

marchesRouter.get("/:id/garanties", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await prisma.garantie.findMany({ where: { marcheId: req.params.id }, orderBy: { createdAt: "asc" } }));
  } catch (err) { next(err); }
});

marchesRouter.post("/:id/garanties", requireRole("ADMIN","DMC","DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const data = z.object({
      type:           z.string().min(1),
      montantGnf:     z.number().positive().transform(v => BigInt(Math.round(v))),
      banque:         z.string().optional(),
      reference:      z.string().optional(),
      dateEmission:   z.coerce.date().optional(),
      dateExpiration: z.coerce.date().optional(),
      observations:   z.string().optional(),
    }).parse(req.body);
    const g = await prisma.garantie.create({ data: { ...data, marcheId: req.params.id } });
    await logAudit({ userId: req.user.id, action: "CREATE", entityType: "Garantie", entityId: g.id });
    res.status(201).json(g);
  } catch (err) { next(err); }
});

marchesRouter.put("/:id/garanties/:gid", requireRole("ADMIN","DMC","DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const data = z.object({
      type:           z.string().optional(),
      montantGnf:     z.number().optional().transform(v => v !== undefined ? BigInt(Math.round(v)) : undefined),
      banque:         z.string().optional(),
      reference:      z.string().optional(),
      active:         z.boolean().optional(),
      dateExpiration: z.coerce.date().optional(),
      observations:   z.string().optional(),
    }).parse(req.body);
    const g = await prisma.garantie.update({ where: { id: req.params.gid }, data });
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "Garantie", entityId: req.params.gid });
    res.json(g);
  } catch (err) { next(err); }
});

// ─── Lots ────────────────────────────────────────────────────────────────────

marchesRouter.get("/:id/lots", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await prisma.lot.findMany({ where: { marcheId: req.params.id, deletedAt: null }, orderBy: { numero: "asc" } }));
  } catch (err) { next(err); }
});

marchesRouter.post("/:id/lots", requireRole("ADMIN","DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const data = z.object({
      numero:      z.string().min(1),
      designation: z.string().min(1),
      montantGnf:  z.number().positive().transform(v => BigInt(Math.round(v))),
    }).parse(req.body);
    const lot = await prisma.lot.create({ data: { ...data, marcheId: req.params.id } });
    await logAudit({ userId: req.user.id, action: "CREATE", entityType: "Lot", entityId: lot.id });
    res.status(201).json(lot);
  } catch (err) { next(err); }
});

marchesRouter.put("/:id/lots/:lid", requireRole("ADMIN","DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const data = z.object({
      numero:      z.string().optional(),
      designation: z.string().optional(),
      montantGnf:  z.number().optional().transform(v => v !== undefined ? BigInt(Math.round(v)) : undefined),
    }).parse(req.body);
    const lot = await prisma.lot.update({ where: { id: req.params.lid }, data });
    res.json(lot);
  } catch (err) { next(err); }
});

// ─── Réceptions du marché ────────────────────────────────────────────────────

marchesRouter.get("/:id/receptions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await prisma.reception.findMany({
      where: { marcheId: req.params.id },
      orderBy: { createdAt: "asc" },
    }));
  } catch (err) { next(err); }
});

// ─── Décomptes du marché ─────────────────────────────────────────────────────

marchesRouter.get("/:id/decomptes", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await prisma.decompte.findMany({
      where: { marcheId: req.params.id, deletedAt: null },
      include: { entreprise: { select: { raisonSociale: true } } },
      orderBy: { createdAt: "desc" },
    }));
  } catch (err) { next(err); }
});

// ─── Paiements liés ──────────────────────────────────────────────────────────

marchesRouter.get("/:id/paiements", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decomptes = await prisma.decompte.findMany({
      where: { marcheId: req.params.id, deletedAt: null },
      select: { id: true },
    });
    const paiements = await prisma.paiement.findMany({
      where: { decompteId: { in: decomptes.map(d => d.id) }, deletedAt: null },
      include: { decompte: { select: { reference: true, type: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(paiements);
  } catch (err) { next(err); }
});

// ─── Ordres de service ────────────────────────────────────────────────────────

marchesRouter.get("/:id/os", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await prisma.ordreService.findMany({
      where: { marcheId: req.params.id },
      orderBy: { numero: "asc" },
    }));
  } catch (err) { next(err); }
});

marchesRouter.post("/:id/os", requireRole("ADMIN","DMC","DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const data = z.object({
      type:            z.enum(["DEMARRAGE","ARRET","REPRISE","REPRISE_APRES_SUSPENSION","MODIFICATION","PROLONGATION","PRISE_EN_CHARGE"]),
      objet:           z.string().min(1),
      dateEmission:    z.coerce.date(),
      dateEffet:       z.coerce.date().optional(),
      impactDelaiJours: z.number().int().optional(),
      impactMontantGnf: z.number().transform(v => BigInt(Math.round(v))).optional(),
      observations:    z.string().optional(),
    }).parse(req.body);
    const last = await prisma.ordreService.findFirst({ where: { marcheId: req.params.id }, orderBy: { numero: "desc" } });
    const numero = (last?.numero ?? 0) + 1;
    const created = await prisma.ordreService.create({ data: { ...data, marcheId: req.params.id, numero } });
    // Si OS de démarrage, met à jour dateOs du marché
    if (data.type === "DEMARRAGE" && !req.body._noUpdate) {
      await prisma.marche.update({ where: { id: req.params.id }, data: { dateOs: data.dateEmission } });
    }
    // Si prolongation, met à jour dateFinPrevue
    if (data.type === "PROLONGATION" && data.impactDelaiJours) {
      const marche = await prisma.marche.findUnique({ where: { id: req.params.id } });
      if (marche?.dateFinPrevue) {
        const newDate = new Date(marche.dateFinPrevue);
        newDate.setDate(newDate.getDate() + data.impactDelaiJours);
        await prisma.marche.update({ where: { id: req.params.id }, data: { dateFinPrevue: newDate } });
      }
    }
    await logAudit({ userId: req.user.id, action: "CREATE", entityType: "OrdreService", entityId: created.id });
    res.status(201).json(created);
  } catch (err) { next(err); }
});
