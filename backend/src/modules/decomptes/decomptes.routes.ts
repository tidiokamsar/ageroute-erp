import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { decompteCreateSchema, decompteUpdateSchema } from "./decomptes.schema";
import { decomptesService } from "./decomptes.service";
import { ApiError } from "../../middleware/error.middleware";
import { entrepriseIdOf } from "../../lib/scope";
import { getMarchesAffectes } from "../../lib/affectations";
import { chargerRegles, nombreRegles } from "../../lib/regles";
import { calcDecompteRegles } from "./decomptes.calc.regles";
import { z } from "zod";

export const decomptesRouter = Router();
decomptesRouter.use(requireAuth);

decomptesRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Périmètres : isolation des comptes ENTREPRISE + affectations terrain
    const entrepriseScope = req.user?.role === "ENTREPRISE" ? await entrepriseIdOf(req.user.id) : null;
    const affectes = req.user ? await getMarchesAffectes(req.user.id, req.user.role) : null;
    res.json(await decomptesService.list({
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
      marcheId: req.query.marcheId as string,
      statut: req.query.statut as string,
      entrepriseId: entrepriseScope ?? (req.query.entrepriseId as string),
      marcheIds: affectes ?? undefined,
      aTraiter: req.query.aTraiter === "1" || req.query.aTraiter === "true",
      role: req.user?.role,
    }));
  } catch (err) { next(err); }
});

decomptesRouter.get("/stats", async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json(await decomptesService.stats()); } catch (err) { next(err); }
});

decomptesRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const d = await decomptesService.getById(req.params.id);
    // Isolation entreprise : un décompte d'une autre entreprise est « introuvable »
    if (req.user?.role === "ENTREPRISE" && d.entrepriseId !== (await entrepriseIdOf(req.user.id))) {
      throw new ApiError(404, "Décompte introuvable");
    }
    res.json(d);
  } catch (err) { next(err); }
});

// §5 CDC — dépôt du décompte — VÉRIFICATION CONFORMITÉ ENTREPRISE AVANT CRÉATION
decomptesRouter.post("/", requireRole("ADMIN","DMC","MISSION","ENTREPRISE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const body = decompteCreateSchema.parse(req.body);
    // Récupérer l'entreprise via le marché
    const { prisma } = await import("../../lib/prisma");
    const marche = await prisma.marche.findFirst({ where: { id: (body as never as { marcheId: string }).marcheId, deletedAt: null } });
    // Isolation entreprise : le marché (et l'entreprise déclarée) doivent être les siens
    if (req.user.role === "ENTREPRISE") {
      const mienne = await entrepriseIdOf(req.user.id);
      const entrepriseDeclaree = (body as never as { entrepriseId?: string }).entrepriseId;
      if (!marche || marche.entrepriseId !== mienne || (entrepriseDeclaree && entrepriseDeclaree !== mienne)) {
        throw new ApiError(403, "Ce marché n'appartient pas à votre entreprise");
      }
      (body as never as { entrepriseId?: string }).entrepriseId = mienne;
    }
    if (marche) {
      const { checkEligibilite } = await import("../entreprises/entreprises.service");
      const { eligible, raisons } = await checkEligibilite(marche.entrepriseId);
      if (!eligible) throw new ApiError(403, `Dépôt bloqué — ${raisons.join(" ; ")}`);
    }
    res.status(201).json(await decomptesService.create(body as never, req.user.id));
  } catch (err) { next(err); }
});

decomptesRouter.put("/:id", requireRole("ADMIN","DMC","MISSION","ENTREPRISE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    res.json(await decomptesService.update(req.params.id, decompteUpdateSchema.parse(req.body) as never, req.user.id));
  } catch (err) { next(err); }
});

// §6 CDC — pièces obligatoires
decomptesRouter.patch("/:id/pieces", requireRole("ADMIN","DMC","MISSION","ENTREPRISE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const pieces = z.object({
      decompteSigné:     z.boolean().optional(),
      attachements:      z.boolean().optional(),
      facture:           z.boolean().optional(),
      rapportAvancement: z.boolean().optional(),
      photosChantier:    z.boolean().optional(),
      pvContradictoire:  z.boolean().optional(),
    }).parse(req.body);
    res.json(await decomptesService.updatePieces(req.params.id, pieces as Record<string,boolean>, req.user.id));
  } catch (err) { next(err); }
});

// §10 CDC — relancer les contrôles automatiques
decomptesRouter.post("/:id/controles", async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await decomptesService.refreshControles(req.params.id)); } catch (err) { next(err); }
});

// §11 CDC — analyse DMC
decomptesRouter.patch("/:id/analyse-dmc", requireRole("ADMIN","DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const { analyseDmc } = z.object({ analyseDmc: z.string().min(10) }).parse(req.body);
    res.json(await decomptesService.updateAnalyseDmc(req.params.id, analyseDmc, req.user.id));
  } catch (err) { next(err); }
});

// §12 CDC — visa financier DAF
decomptesRouter.patch("/:id/visa-financier", requireRole("ADMIN","DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const visa = z.object({
      visaFinancier: z.enum(["ACCORDE","REFUSE"]),
      commentaireFinancier: z.string().min(10),
    }).parse(req.body);
    res.json(await decomptesService.updateVisaFinancier(req.params.id, visa, req.user.id));
  } catch (err) { next(err); }
});

decomptesRouter.post("/:id/statut", requireRole("ADMIN","DAF","DG","DMC","TECHNIQUE","UGP"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const { statut } = z.object({ statut: z.enum(["SOUMIS","EN_VALIDATION","VALIDE","REJETE","PAYE"]) }).parse(req.body);
    res.json(await decomptesService.changeStatut(req.params.id, statut, req.user.id));
  } catch (err) { next(err); }
});

decomptesRouter.delete("/:id", requireRole("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    await decomptesService.remove(req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) { next(err); }
});

// ── LIGNES BPU ──────────────────────────────────────────────────────────────

decomptesRouter.get("/:id/lignes", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prisma } = await import("../../lib/prisma");
    const lignes = await prisma.decompteLigne.findMany({
      where: { decompteId: req.params.id },
      orderBy: { createdAt: "asc" },
    });
    res.json(lignes);
  } catch (err) { next(err); }
});

// Schéma commun de saisie d'une ligne BPU (création et mise à jour complète)
const ligneSchema = z.object({
  codeArticle:       z.string().min(1),
  designation:       z.string().min(2),
  unite:             z.string().min(1),
  quantiteContrat:   z.number().positive(),
  quantitePrecedent: z.number().min(0).default(0),
  quantiteCourante:  z.number().min(0),
  prixUnitaire:      z.number().positive(),
  tauxTva:           z.number().min(0).default(18),
  tauxRetenue:       z.number().min(0).default(5),
  tauxAvance:        z.number().min(0).default(0),
  montantPenalite:   z.number().min(0).default(0),
  motifPenalite:     z.string().optional(),
  attachementLigneId:z.string().optional(),
  observations:      z.string().optional(),
});

decomptesRouter.post("/:id/lignes", requireRole("ADMIN", "DMC", "MISSION", "ENTREPRISE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const body = ligneSchema.parse(req.body);

    const { prisma } = await import("../../lib/prisma");
    const decompte = await prisma.decompte.findUnique({ where: { id: req.params.id }, include: { marche: true } });
    if (!decompte) throw new ApiError(404, "Décompte introuvable");

    const qCumulee    = body.quantitePrecedent + body.quantiteCourante;
    const depassement = qCumulee > body.quantiteContrat;
    // Montant brut saisi (quantité × prix) puis cascade fiscale par le moteur
    // de règles (A1-A7) — lot L1.1, arithmétique entière, mêmes règles que le
    // calcul global du décompte (portée : ce marché).
    const montantBrut = Math.round(body.quantiteCourante * body.prixUnitaire); // HT (saisie)
    const regles = await chargerRegles({ marcheId: decompte.marcheId, bailleur: decompte.marche.financement, typeMarche: decompte.marche.type });
    const calc = calcDecompteRegles({
      montantPeriodeHtGnf: BigInt(montantBrut),
      tauxTva: body.tauxTva,
      tauxRetenueGarantie: body.tauxRetenue,
      tauxAvance: body.tauxAvance,
      penalites: BigInt(body.montantPenalite),
    }, regles);
    const tauxArmp = nombreRegles(regles, "RG_TAUX_ARMP");
    const montantPenalite = body.montantPenalite;

    const ligne = await prisma.decompteLigne.create({
      data: {
        decompteId:    req.params.id,
        codeArticle:   body.codeArticle,
        designation:   body.designation,
        unite:         body.unite,
        quantiteContrat:   body.quantiteContrat,
        quantitePrecedent: body.quantitePrecedent,
        quantiteCourante:  body.quantiteCourante,
        quantiteCumulee:   qCumulee,
        prixUnitaire:  BigInt(Math.round(body.prixUnitaire)),
        montantBrut:       BigInt(montantBrut),
        tauxTva:           body.tauxTva,
        montantTva:        calc.tva,
        tauxArmp:          tauxArmp,
        montantArmp:       calc.montantArmpGnf,
        montantTtc:        calc.montantTtcGnf,
        precompteTva:      calc.precompteTvaGnf,
        tauxRetenue:       body.tauxRetenue,
        montantRetenue:    calc.retenueGarantie,
        tauxAvance:        body.tauxAvance,
        montantAvanceRecup:calc.avanceRecuperee,
        montantPenalite:   BigInt(montantPenalite),
        motifPenalite:     body.motifPenalite,
        montantNet:        calc.netAPayer,
        statut:        depassement ? "ALERTE" : "OK",
        depassement,
        attachementLigneId:body.attachementLigneId,
        observations:  body.observations,
      },
    });

    // Recalcul du décompte global depuis les lignes — sommes en BigInt
    // (plus aucune conversion flottante) et net borné par les règles (A4)
    const toutesLignes = await prisma.decompteLigne.findMany({ where: { decompteId: req.params.id } });
    const somme = (champ: "montantBrut" | "montantTva" | "montantArmp" | "montantTtc" | "precompteTva" | "montantRetenue" | "montantAvanceRecup" | "montantPenalite") =>
      toutesLignes.reduce((s, l) => s + (l[champ] as bigint), 0n);
    const totalBrut = somme("montantBrut"), totalTva = somme("montantTva"), totalArmp = somme("montantArmp");
    const totalTtc = somme("montantTtc"), totalPrecomp = somme("precompteTva");
    const totalRetenue = somme("montantRetenue"), totalAvance = somme("montantAvanceRecup"), totalPen = somme("montantPenalite");
    const reglesTotaux = await chargerRegles({ marcheId: decompte.marcheId, bailleur: decompte.marche.financement, typeMarche: decompte.marche.type });
    let totalNet = totalTtc - totalPrecomp - totalRetenue - (reglesTotaux.RG_ARMP_INCLUSE_TTC === "true" ? totalArmp : 0n) - totalAvance - totalPen;
    if (reglesTotaux.RG_NET_PLANCHER_ZERO === "true" && totalNet < 0n) totalNet = 0n;

    await prisma.decompte.update({
      where: { id: req.params.id },
      data: {
        montantPeriodeHtGnf: totalBrut,
        tva:             totalTva,
        montantArmpGnf:  totalArmp,
        montantTtcGnf:   totalTtc,
        precompteTvaGnf: totalPrecomp,
        retenueGarantie: totalRetenue,
        avanceRecuperee: totalAvance,
        penalites:       totalPen,
        netAPayer:       totalNet,
      },
    });

    res.status(201).json({ ...ligne, prixUnitaire: ligne.prixUnitaire.toString(), montantBrut: ligne.montantBrut.toString(), montantNet: ligne.montantNet.toString() });
  } catch (err) { next(err); }
});

decomptesRouter.put("/:id/lignes/:ligneId", requireRole("ADMIN", "DMC", "MISSION", "ENTREPRISE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = ligneSchema.parse(req.body);
    const { prisma } = await import("../../lib/prisma");
    const ligne = await prisma.decompteLigne.findFirst({ where: { id: req.params.ligneId, decompteId: req.params.id } });
    if (!ligne) throw new ApiError(404, "Ligne introuvable");
    const updated = await prisma.decompteLigne.update({ where: { id: req.params.ligneId }, data: body as never });
    res.json(updated);
  } catch (err) { next(err); }
});

decomptesRouter.delete("/:id/lignes/:ligneId", requireRole("ADMIN", "DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prisma } = await import("../../lib/prisma");
    await prisma.decompteLigne.delete({ where: { id: req.params.ligneId } });
    res.status(204).send();
  } catch (err) { next(err); }
});

// POST /:id/calculate — recalcule total depuis lignes (avec taux custom)
decomptesRouter.post("/:id/calculate", requireRole("ADMIN", "DMC", "MISSION", "ENTREPRISE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      applyVat:            z.boolean().default(true),
      vatRate:             z.number().min(0).max(100).default(18),
      retentionRate:       z.number().min(0).max(100).default(5),
      advanceRecoveryRate: z.number().min(0).max(100).default(10),
      penaltyAmount:       z.number().min(0).default(0),
    }).parse(req.body);

    const { prisma } = await import("../../lib/prisma");
    const lignes = await prisma.decompteLigne.findMany({ where: { decompteId: req.params.id } });
    const totalBrut = lignes.reduce((s, l) => s + Number(l.montantBrut), 0);
    const tva       = body.applyVat ? Math.round(totalBrut * body.vatRate / 100) : 0;
    const retenue   = Math.round(totalBrut * body.retentionRate / 100);
    const avance    = Math.round(totalBrut * body.advanceRecoveryRate / 100);
    const net       = totalBrut + tva - retenue - avance - body.penaltyAmount;

    await prisma.decompte.update({
      where: { id: req.params.id },
      data: {
        montantPeriodeHtGnf: BigInt(totalBrut),
        tva:              BigInt(tva),
        retenueGarantie:  BigInt(retenue),
        avanceRecuperee:  BigInt(avance),
        penalites:        BigInt(body.penaltyAmount),
        netAPayer:        BigInt(net),
      },
    });

    res.json({ totalBrut, tva, retenue, avance, penalites: body.penaltyAmount, netAPayer: net, lignesCount: lignes.length });
  } catch (err) { next(err); }
});

// ── VALIDATIONS BPMN AVANCÉES ───────────────────────────────────────────────

decomptesRouter.get("/:id/validations-avancees", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prisma } = await import("../../lib/prisma");
    const validations = await prisma.decompteValidation.findMany({
      where: { decompteId: req.params.id },
      orderBy: { valideAt: "desc" },
    });
    res.json(validations);
  } catch (err) { next(err); }
});

decomptesRouter.post("/:id/validations-avancees", requireRole("ADMIN","DG","DAF","DMC","MISSION","TECHNIQUE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const body = z.object({
      etape:       z.enum(["SOUMISSION","MISSION","TECHNIQUE","DMC","DAF","DG","UGP"]),
      decision:    z.enum(["APPROUVE","REJETE","CORRECTION"]),
      commentaire: z.string().min(5),
      signatureRef:z.string().optional(),
    }).parse(req.body);

    const { prisma } = await import("../../lib/prisma");
    // RG9 — même personne ne peut pas soumettre et valider
    if (body.decision !== "CORRECTION") {
      const decompte = await prisma.decompte.findUnique({ where: { id: req.params.id } });
      // RG9 temporairement désactivé
    }

    const val = await prisma.decompteValidation.create({
      data: {
        decompteId:   req.params.id,
        etape:        body.etape,
        decision:     body.decision,
        commentaire:  body.commentaire,
        validePar:    req.user.id,
        valideNom:    req.user.email,
        valideRole:   req.user.role,
        signatureRef: body.signatureRef,
      },
    });

    // Mise à jour statut décompte selon décision
    const statutMap: Record<string, string> = {
      "SOUMISSION-APPROUVE": "SOUMIS",
      "MISSION-APPROUVE":    "EN_CONTROLE_TECHNIQUE",
      "TECHNIQUE-APPROUVE":  "EN_VALIDATION",
      "DMC-APPROUVE":        "VISA_DAF",
      "DAF-APPROUVE":        "VISA_DG",
      "DG-APPROUVE":         "VALIDE",
      "MISSION-REJETE":      "REJETE",
      "TECHNIQUE-REJETE":    "REJETE",
    };
    const key = `${body.etape}-${body.decision}`;
    if (statutMap[key]) {
      await prisma.decompte.update({ where: { id: req.params.id }, data: { statut: statutMap[key] as never } });
    }
    if (body.decision === "CORRECTION") {
      await prisma.decompte.update({ where: { id: req.params.id }, data: { statut: "BROUILLON" as never } });
    }

    res.status(201).json(val);
  } catch (err) { next(err); }
});

// ── COMMENTAIRES ─────────────────────────────────────────────────────────────

decomptesRouter.get("/:id/commentaires", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prisma } = await import("../../lib/prisma");
    const items = await prisma.decompteCommentaire.findMany({
      where: { decompteId: req.params.id },
      orderBy: { createdAt: "asc" },
    });
    res.json(items);
  } catch (err) { next(err); }
});

decomptesRouter.post("/:id/commentaires", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const body = z.object({
      contenu: z.string().min(2),
      type:    z.enum(["COMMENTAIRE","CORRECTION","INFORMATION","ALERTE"]).default("COMMENTAIRE"),
    }).parse(req.body);
    const { prisma } = await import("../../lib/prisma");
    const item = await prisma.decompteCommentaire.create({
      data: {
        decompteId: req.params.id,
        contenu:    body.contenu,
        auteurId:   req.user.id,
        auteurNom:  req.user.email,
        auteurRole: req.user.role,
        type:       body.type,
      },
    });
    res.status(201).json(item);
  } catch (err) { next(err); }
});

// ── CIRCUIT DE PAIEMENT §16 CDC ──────────────────────────────────────────────

decomptesRouter.get("/:id/payment-traces", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prisma } = await import("../../lib/prisma");
    const traces = await prisma.decomptePaymentTrace.findMany({
      where: { decompteId: req.params.id },
      orderBy: { createdAt: "asc" },
    });
    res.json(traces.map((t) => ({ ...t, montantGnf: t.montantGnf?.toString() })));
  } catch (err) { next(err); }
});

decomptesRouter.post("/:id/payment-traces", requireRole("ADMIN","DAF","DG"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const body = z.object({
      etape:            z.enum(["ORDONNANCEMENT","VISA_TRESOR","EMISSION","VIREMENT","PAIEMENT_FINAL"]),
      statut:           z.enum(["EN_ATTENTE","EN_COURS","VALIDE","REJETE"]),
      reference:        z.string().optional(),
      montantGnf:       z.number().optional(),
      dateTransmission: z.string().optional(),
      dateValidation:   z.string().optional(),
      operateurNom:     z.string().optional(),
      banqueReference:  z.string().optional(),
      observations:     z.string().optional(),
    }).parse(req.body);
    const { prisma } = await import("../../lib/prisma");
    const trace = await prisma.decomptePaymentTrace.create({
      data: {
        decompteId:       req.params.id,
        etape:            body.etape,
        statut:           body.statut,
        reference:        body.reference,
        montantGnf:       body.montantGnf ? BigInt(Math.round(body.montantGnf)) : undefined,
        dateTransmission: body.dateTransmission ? new Date(body.dateTransmission) : undefined,
        dateValidation:   body.dateValidation ? new Date(body.dateValidation) : undefined,
        operateurNom:     body.operateurNom,
        banqueReference:  body.banqueReference,
        observations:     body.observations,
      },
    });
    if (body.etape === "PAIEMENT_FINAL" && body.statut === "VALIDE") {
      await prisma.decompte.update({
        where: { id: req.params.id },
        data: { statut: "PAYE" as never, datePaiement: new Date() },
      });
    }
    res.status(201).json({ ...trace, montantGnf: trace.montantGnf?.toString() });
  } catch (err) { next(err); }
});

// KPIs enrichis §8 CDC
decomptesRouter.get("/stats/enrichis", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { prisma } = await import("../../lib/prisma");
    const [total, brouillons, soumis, enControle, valides, payes, rejetes,
      montantAttenteRaw, montantPayeRaw] = await Promise.all([
      prisma.decompte.count({ where: { deletedAt: null } }),
      prisma.decompte.count({ where: { deletedAt: null, statut: "BROUILLON" } }),
      prisma.decompte.count({ where: { deletedAt: null, statut: "SOUMIS" } }),
      prisma.decompte.count({ where: { deletedAt: null, statut: { in: ["EN_CONTROLE","EN_VALIDATION","VISA_DAF","VISA_DG"] } } }),
      prisma.decompte.count({ where: { deletedAt: null, statut: "VALIDE" } }),
      prisma.decompte.count({ where: { deletedAt: null, statut: "PAYE" } }),
      prisma.decompte.count({ where: { deletedAt: null, statut: "REJETE" } }),
      prisma.decompte.aggregate({ where: { deletedAt: null, statut: { notIn: ["PAYE","REJETE"] } }, _sum: { netAPayer: true } }),
      prisma.decompte.aggregate({ where: { deletedAt: null, statut: "PAYE" }, _sum: { netAPayer: true } }),
    ]);
    res.json({
      total, brouillons, soumis, enControle, valides, payes, rejetes,
      montantAttenteGnf: montantAttenteRaw._sum.netAPayer?.toString() ?? "0",
      montantPayeGnf: montantPayeRaw._sum.netAPayer?.toString() ?? "0",
    });
  } catch (err) { next(err); }
});
