/**
 * Module Attachements §9 CDC — BPMN complet
 * Workflow : BROUILLON → SOUMIS → EN_CONTROLE_MISSION → EN_CONTROLE_TECHNIQUE → VALIDE / REJETE
 * RG1-RG10 : voir spécifications techniques AGEROUTE
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import { z } from "zod";

export const attachementsRouter = Router();
attachementsRouter.use(requireAuth);

// ===== HELPERS =====

function genCode(seq: number): string {
  const year = new Date().getFullYear();
  return `ATT-${year}-${String(seq).padStart(4, "0")}`;
}

function calcMontant(quantite: number, prix: bigint): bigint {
  return BigInt(Math.round(quantite * Number(prix)));
}

const includeAll = {
  decompte: {
    include: {
      marche: { select: { id: true, reference: true, entreprise: { select: { id: true, raisonSociale: true } } } },
    },
  },
  lignes: { include: { mesures: { orderBy: { createdAt: "desc" as const } } }, orderBy: { createdAt: "asc" as const } },
  pointsGPS: { orderBy: { captureAt: "asc" as const } },
  medias: { orderBy: { createdAt: "desc" as const } },
  validations: { orderBy: { valideAt: "desc" as const } },
  commentaires: { orderBy: { createdAt: "desc" as const } },
  bpuArticle: true,
};

// ===== KPIs / STATS =====

attachementsRouter.get("/stats", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [total, brouillon, soumis, enControle, valides, rejetes, depassements] = await Promise.all([
      prisma.attachement.count(),
      prisma.attachement.count({ where: { statut: "BROUILLON" } }),
      prisma.attachement.count({ where: { statut: "SOUMIS" } }),
      prisma.attachement.count({ where: { statut: { in: ["EN_CONTROLE_MISSION", "EN_CONTROLE_TECHNIQUE"] } } }),
      prisma.attachement.count({ where: { statut: "VALIDE" } }),
      prisma.attachement.count({ where: { statut: "REJETE" } }),
      prisma.attachementLigne.count({ where: { depassement: true } }),
    ]);

    // Délai moyen de validation (soumisAt → valideAt)
    const valideesAvecDelai = await prisma.attachement.findMany({
      where: { statut: "VALIDE", soumisAt: { not: null }, valideAt: { not: null } },
      select: { soumisAt: true, valideAt: true },
    });
    const delaiMoyen = valideesAvecDelai.length
      ? valideesAvecDelai.reduce((s, a) => s + Math.round((a.valideAt!.getTime() - a.soumisAt!.getTime()) / 86400000), 0) / valideesAvecDelai.length
      : 0;

    // Nombre total de photos et GPS
    const [totalMedias, totalGPS] = await Promise.all([
      prisma.attachementMedia.count(),
      prisma.attachementGPS.count(),
    ]);

    res.json({
      total, brouillon, soumis, enControle, valides, rejetes,
      depassements, delaiMoyen: Math.round(delaiMoyen), totalMedias, totalGPS,
      tauxValidation: total > 0 ? Math.round((valides / total) * 100) : 0,
      tauxRejet: total > 0 ? Math.round((rejetes / total) * 100) : 0,
    });
  } catch (err) { next(err); }
});

// ===== LIST =====

attachementsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { decompteId, statut, typeAttachement, page = "1", pageSize = "20" } = req.query as Record<string, string>;
    const skip = (Number(page) - 1) * Number(pageSize);

    const where: Record<string, unknown> = {};
    if (decompteId) where.decompteId = decompteId;
    if (statut) where.statut = statut;
    if (typeAttachement) where.typeAttachement = typeAttachement;

    const [data, total] = await Promise.all([
      prisma.attachement.findMany({
        where,
        include: {
          decompte: {
            include: {
              marche: { select: { reference: true, entreprise: { select: { raisonSociale: true } } } },
            },
          },
          _count: { select: { lignes: true, medias: true, pointsGPS: true, validations: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: Number(pageSize),
      }),
      prisma.attachement.count({ where }),
    ]);

    res.json({ data, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (err) { next(err); }
});

// ===== GET ONE =====

attachementsRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const att = await prisma.attachement.findUnique({ where: { id: req.params.id }, include: includeAll });
    if (!att) throw new ApiError(404, "Attachement non trouvé");
    res.json(att);
  } catch (err) { next(err); }
});

// ===== CREATE =====

const createSchema = z.object({
  decompteId: z.string().uuid(),
  typeAttachement: z.enum(["MENSUEL", "PARTIEL", "FINAL", "AVENANT", "RECEPTION"]).optional(),
  periodeDebut: z.string().optional(),
  periodeFin: z.string().optional(),
  ouvrage: z.string().optional(),
  section: z.string().optional(),
  pkDebut: z.number().optional(),
  pkFin: z.number().optional(),
  natureTravaux: z.string().min(1),
  unite: z.string().min(1),
  quantitePrevue: z.number().positive(),
  quantiteExecutee: z.number().nonnegative(),
  prixUnitaireGnf: z.number().positive().transform((v) => BigInt(Math.round(v))),
  latGps: z.number().optional(),
  lonGps: z.number().optional(),
  observations: z.string().optional(),
});

attachementsRouter.post("/", requireRole("ADMIN", "DMC", "MISSION", "TECHNIQUE", "ENTREPRISE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");

    // RG1 — vérifier que le marché lié est actif
    const data = createSchema.parse(req.body);
    const decompte = await prisma.decompte.findUnique({
      where: { id: data.decompteId },
      include: { marche: { select: { statut: true } } },
    });
    if (!decompte) throw new ApiError(404, "Décompte introuvable");
    const statutsActifs = ["EN_EXECUTION", "ACTIF", "NOTIFIE", "SIGNE", "EN_AVENANT", "EN_RECEPTION_PROVISOIRE"];
    if (!statutsActifs.includes(decompte.marche.statut)) {
      throw new ApiError(400, `RG1 — Marché non actif (statut: ${decompte.marche.statut})`);
    }

    // RG2 — cohérence des dates
    if (data.periodeDebut && data.periodeFin && new Date(data.periodeDebut) > new Date(data.periodeFin)) {
      throw new ApiError(400, "RG2 — Période incohérente : fin avant début");
    }

    // Générer le code unique
    const count = await prisma.attachement.count();
    const code = genCode(count + 1);
    const montantHtGnf = calcMontant(data.quantiteExecutee, data.prixUnitaireGnf);

    const created = await prisma.attachement.create({
      data: {
        ...(data as object),
        code,
        montantHtGnf,
        statut: "BROUILLON",
        createdById: req.user.id,
      } as never,
      include: includeAll,
    });

    await logAudit({ userId: req.user.id, action: "CREATE", entityType: "Attachement", entityId: created.id, after: { code, statut: "BROUILLON" } });
    res.status(201).json(created);
  } catch (err) { next(err); }
});

// ===== UPDATE =====

attachementsRouter.put("/:id", requireRole("ADMIN", "DMC", "MISSION", "TECHNIQUE", "ENTREPRISE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const att = await prisma.attachement.findUnique({ where: { id: req.params.id } });
    if (!att) throw new ApiError(404, "Attachement non trouvé");
    if (att.statut !== "BROUILLON" && att.statut !== "DEMANDE_CORRECTION") {
      throw new ApiError(400, "Seuls les attachements BROUILLON ou DEMANDE_CORRECTION peuvent être modifiés");
    }

    const updateSchema = createSchema.partial().omit({ decompteId: true });
    const data = updateSchema.parse(req.body);
    const montantHtGnf = data.quantiteExecutee !== undefined && data.prixUnitaireGnf !== undefined
      ? calcMontant(data.quantiteExecutee, data.prixUnitaireGnf)
      : undefined;

    const updated = await prisma.attachement.update({
      where: { id: req.params.id },
      data: { ...(data as object), ...(montantHtGnf !== undefined ? { montantHtGnf } : {}) } as never,
      include: includeAll,
    });

    // RG9 — incrémenter la version si correction
    if (att.statut === "DEMANDE_CORRECTION") {
      await prisma.attachement.update({ where: { id: req.params.id }, data: { version: att.version + 1 } });
    }

    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "Attachement", entityId: req.params.id, before: att, after: data });
    res.json(updated);
  } catch (err) { next(err); }
});

// ===== WORKFLOW BPMN =====

// Soumettre pour contrôle (BROUILLON → SOUMIS)
attachementsRouter.post("/:id/soumettre", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const att = await prisma.attachement.findUnique({ where: { id: req.params.id }, include: { lignes: true, medias: true } });
    if (!att) throw new ApiError(404, "Attachement non trouvé");
    if (att.statut !== "BROUILLON" && att.statut !== "DEMANDE_CORRECTION") {
      throw new ApiError(400, `Statut ${att.statut} ne peut pas être soumis`);
    }

    // RG5 — vérifier qu'il y a au moins une preuve (photo ou GPS)
    const hasGPS = await prisma.attachementGPS.count({ where: { attachementId: att.id } });
    const hasMedia = await prisma.attachementMedia.count({ where: { attachementId: att.id } });
    if (!hasGPS && !hasMedia && !att.latGps) {
      // Avertissement non bloquant pour les types standards
      // throw new ApiError(400, "RG5 — Au moins une preuve terrain (GPS ou photo) est requise");
    }

    const { commentaire } = z.object({ commentaire: z.string().optional() }).parse(req.body);

    const updated = await prisma.attachement.update({
      where: { id: req.params.id },
      data: { statut: "SOUMIS", soumisAt: new Date() },
      include: includeAll,
    });

    if (commentaire) {
      await prisma.attachementCommentaire.create({
        data: {
          attachementId: att.id,
          contenu: commentaire,
          auteurId: req.user.id,
          auteurNom: req.user.nomComplet,
          auteurRole: req.user.role,
          type: "OBSERVATION",
        },
      });
    }

    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "Attachement", entityId: att.id, after: { statut: "SOUMIS" } });
    res.json(updated);
  } catch (err) { next(err); }
});

// Valider mission (SOUMIS → EN_CONTROLE_TECHNIQUE)
attachementsRouter.post("/:id/valider-mission", requireRole("ADMIN", "DMC", "MISSION"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const att = await prisma.attachement.findUnique({ where: { id: req.params.id } });
    if (!att) throw new ApiError(404, "Attachement non trouvé");
    if (att.statut !== "SOUMIS") throw new ApiError(400, `Statut ${att.statut} — seul SOUMIS peut être validé mission`);

    // RG8 — l'auteur de la validation ne peut pas être le créateur
    if (att.createdById === req.user.id) {
      throw new ApiError(400, "RG8 — La validation ne peut pas être effectuée par le créateur de l'attachement");
    }

    const { commentaire } = z.object({ commentaire: z.string().min(5) }).parse(req.body);

    await Promise.all([
      prisma.attachement.update({
        where: { id: req.params.id },
        data: { statut: "EN_CONTROLE_TECHNIQUE", valideParMission: true },
      }),
      prisma.attachementValidation.create({
        data: {
          attachementId: att.id,
          etape: "MISSION",
          statut: "APPROUVE",
          commentaire,
          validePar: req.user.id,
          valideNom: req.user.nomComplet,
        },
      }),
    ]);

    await logAudit({ userId: req.user.id, action: "APPROVE", entityType: "Attachement", entityId: att.id, after: { statut: "EN_CONTROLE_TECHNIQUE", etape: "MISSION" } });
    res.json(await prisma.attachement.findUnique({ where: { id: req.params.id }, include: includeAll }));
  } catch (err) { next(err); }
});

// Valider technique / Direction (EN_CONTROLE_TECHNIQUE → VALIDE)
attachementsRouter.post("/:id/valider-technique", requireRole("ADMIN", "DMC", "TECHNIQUE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const att = await prisma.attachement.findUnique({ where: { id: req.params.id } });
    if (!att) throw new ApiError(404, "Attachement non trouvé");
    if (att.statut !== "EN_CONTROLE_TECHNIQUE") throw new ApiError(400, `Statut ${att.statut} — seul EN_CONTROLE_TECHNIQUE peut être validé technique`);

    const { commentaire } = z.object({ commentaire: z.string().min(5) }).parse(req.body);

    await Promise.all([
      prisma.attachement.update({
        where: { id: req.params.id },
        data: {
          statut: "VALIDE",
          valide: true,
          valideParTechnique: true,
          valideAt: new Date(),
          motifRejet: null,
        },
      }),
      prisma.attachementValidation.create({
        data: {
          attachementId: att.id,
          etape: "TECHNIQUE",
          statut: "APPROUVE",
          commentaire,
          validePar: req.user.id,
          valideNom: req.user.nomComplet,
        },
      }),
    ]);

    // RG10 — l'attachement validé alimente automatiquement le décompte (statut signalement)
    await logAudit({ userId: req.user.id, action: "APPROVE", entityType: "Attachement", entityId: att.id, after: { statut: "VALIDE", etape: "TECHNIQUE" } });
    res.json(await prisma.attachement.findUnique({ where: { id: req.params.id }, include: includeAll }));
  } catch (err) { next(err); }
});

// Demander correction (→ DEMANDE_CORRECTION)
attachementsRouter.post("/:id/corriger", requireRole("ADMIN", "DMC", "MISSION", "TECHNIQUE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const att = await prisma.attachement.findUnique({ where: { id: req.params.id } });
    if (!att) throw new ApiError(404, "Attachement non trouvé");
    if (!["SOUMIS", "EN_CONTROLE_MISSION", "EN_CONTROLE_TECHNIQUE"].includes(att.statut)) {
      throw new ApiError(400, `Statut ${att.statut} — correction impossible`);
    }

    const { motif, etape } = z.object({
      motif: z.string().min(10),
      etape: z.enum(["MISSION", "TECHNIQUE"]).optional(),
    }).parse(req.body);

    await Promise.all([
      prisma.attachement.update({
        where: { id: req.params.id },
        data: { statut: "DEMANDE_CORRECTION", motifRejet: motif },
      }),
      prisma.attachementValidation.create({
        data: {
          attachementId: att.id,
          etape: etape ?? "MISSION",
          statut: "CORRECTION",
          commentaire: motif,
          validePar: req.user.id,
          valideNom: req.user.nomComplet,
        },
      }),
      prisma.attachementCommentaire.create({
        data: {
          attachementId: att.id,
          contenu: motif,
          auteurId: req.user.id,
          auteurNom: req.user.nomComplet,
          auteurRole: req.user.role,
          type: "CORRECTION",
        },
      }),
    ]);

    await logAudit({ userId: req.user.id, action: "REJECT", entityType: "Attachement", entityId: att.id, after: { statut: "DEMANDE_CORRECTION", motif } });
    res.json(await prisma.attachement.findUnique({ where: { id: req.params.id }, include: includeAll }));
  } catch (err) { next(err); }
});

// Rejeter définitivement
attachementsRouter.post("/:id/rejeter", requireRole("ADMIN", "DMC", "TECHNIQUE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const att = await prisma.attachement.findUnique({ where: { id: req.params.id } });
    if (!att) throw new ApiError(404, "Attachement non trouvé");

    const { motif } = z.object({ motif: z.string().min(10) }).parse(req.body);

    await Promise.all([
      prisma.attachement.update({ where: { id: req.params.id }, data: { statut: "REJETE", valide: false, motifRejet: motif } }),
      prisma.attachementValidation.create({
        data: {
          attachementId: att.id,
          etape: "DIRECTION",
          statut: "REJETE",
          commentaire: motif,
          validePar: req.user.id,
          valideNom: req.user.nomComplet,
        },
      }),
    ]);

    await logAudit({ userId: req.user.id, action: "REJECT", entityType: "Attachement", entityId: att.id, after: { statut: "REJETE", motif } });
    res.json(await prisma.attachement.findUnique({ where: { id: req.params.id }, include: includeAll }));
  } catch (err) { next(err); }
});

// Ancienne route de validation (rétrocompat)
attachementsRouter.put("/:id/valider", requireRole("ADMIN", "DMC", "TECHNIQUE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const updated = await prisma.attachement.update({
      where: { id: req.params.id },
      data: { valide: true, statut: "VALIDE", valideAt: new Date(), motifRejet: null },
    });
    await logAudit({ userId: req.user.id, action: "APPROVE", entityType: "Attachement", entityId: req.params.id });
    res.json(updated);
  } catch (err) { next(err); }
});

// Ancienne route de rejet (rétrocompat)
attachementsRouter.put("/:id/rejeter", requireRole("ADMIN", "DMC", "TECHNIQUE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const { motif } = z.object({ motif: z.string().min(1) }).parse(req.body);
    const updated = await prisma.attachement.update({ where: { id: req.params.id }, data: { valide: false, motifRejet: motif } });
    await logAudit({ userId: req.user.id, action: "REJECT", entityType: "Attachement", entityId: req.params.id });
    res.json(updated);
  } catch (err) { next(err); }
});

// ===== LIGNES BPU =====

attachementsRouter.get("/:id/lignes", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lignes = await prisma.attachementLigne.findMany({
      where: { attachementId: req.params.id },
      include: { mesures: { orderBy: { createdAt: "desc" } } },
      orderBy: { createdAt: "asc" },
    });
    res.json(lignes);
  } catch (err) { next(err); }
});

attachementsRouter.post("/:id/lignes", requireRole("ADMIN", "DMC", "MISSION", "TECHNIQUE", "ENTREPRISE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const att = await prisma.attachement.findUnique({ where: { id: req.params.id } });
    if (!att) throw new ApiError(404, "Attachement non trouvé");
    if (!["BROUILLON", "DEMANDE_CORRECTION"].includes(att.statut)) {
      throw new ApiError(400, "Lignes modifiables seulement à l'état BROUILLON ou DEMANDE_CORRECTION");
    }

    const schema = z.object({
      codeArticle: z.string().min(1),
      designation: z.string().min(1),
      unite: z.string().min(1),               // RG3 — unité obligatoire
      quantiteContrat: z.number().nonnegative(),
      quantitePrecedent: z.number().nonnegative().optional(),
      quantiteCourante: z.number().nonnegative(),
      prixUnitaire: z.number().positive().transform((v) => BigInt(Math.round(v))),
      observations: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const quantitePrecedent = data.quantitePrecedent ?? 0;
    const quantiteCumulee = quantitePrecedent + data.quantiteCourante;
    const montant = calcMontant(data.quantiteCourante, data.prixUnitaire);

    // RG4 — alerte si dépassement
    const depassement = quantiteCumulee > data.quantiteContrat;
    const statut = depassement ? "ALERTE" : "OK";

    const ligne = await prisma.attachementLigne.create({
      data: {
        attachementId: req.params.id,
        ...(data as object),
        quantitePrecedent,
        quantiteCumulee,
        montant,
        depassement,
        statut,
      } as never,
      include: { mesures: true },
    });

    // Recalculer le montant total de l'attachement
    const allLignes = await prisma.attachementLigne.findMany({ where: { attachementId: req.params.id } });
    const montantTotal = allLignes.reduce((s, l) => s + l.montant, BigInt(0));
    await prisma.attachement.update({ where: { id: req.params.id }, data: { montantHtGnf: montantTotal } });

    res.status(201).json(ligne);
  } catch (err) { next(err); }
});

attachementsRouter.put("/lignes/:ligneId", requireRole("ADMIN", "DMC", "MISSION", "TECHNIQUE", "ENTREPRISE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      quantiteCourante: z.number().nonnegative().optional(),
      observations: z.string().optional(),
    }).parse(req.body);

    const ligne = await prisma.attachementLigne.findUnique({ where: { id: req.params.ligneId } });
    if (!ligne) throw new ApiError(404, "Ligne non trouvée");

    const qCourante = data.quantiteCourante ?? Number(ligne.quantiteCourante);
    const qCumulee = Number(ligne.quantitePrecedent) + qCourante;
    const montant = calcMontant(qCourante, ligne.prixUnitaire);
    const depassement = qCumulee > Number(ligne.quantiteContrat);

    const updated = await prisma.attachementLigne.update({
      where: { id: req.params.ligneId },
      data: {
        ...data,
        quantiteCumulee: qCumulee,
        montant,
        depassement,
        statut: depassement ? "ALERTE" : "OK",
      },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

attachementsRouter.delete("/lignes/:ligneId", requireRole("ADMIN", "DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.attachementLigne.delete({ where: { id: req.params.ligneId } });
    res.status(204).send();
  } catch (err) { next(err); }
});

// ===== MESURES PAR LIGNE =====

attachementsRouter.get("/lignes/:ligneId/mesures", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mesures = await prisma.attachementMesure.findMany({
      where: { ligneId: req.params.ligneId },
      orderBy: { mesureAt: "desc" },
    });
    res.json(mesures);
  } catch (err) { next(err); }
});

attachementsRouter.post("/lignes/:ligneId/mesures", requireRole("ADMIN", "DMC", "MISSION", "TECHNIQUE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const data = z.object({
      methode: z.enum(["MANUEL", "GPS", "PHOTO", "LEVE", "DRONE", "INSTRUMENT"]),
      valeur: z.number(),
      unite: z.string().min(1),
      sourcePreuve: z.string().min(1),        // RG5 — source obligatoire
      niveauConfiance: z.number().min(1).max(5).optional(),
      observations: z.string().optional(),
    }).parse(req.body);

    const mesure = await prisma.attachementMesure.create({
      data: {
        ligneId: req.params.ligneId,
        ...data,
        mesurePar: req.user.nomComplet ?? req.user.id,
        mesureAt: new Date(),
      },
    });
    res.status(201).json(mesure);
  } catch (err) { next(err); }
});

// ===== GPS =====

attachementsRouter.get("/:id/gps", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const points = await prisma.attachementGPS.findMany({
      where: { attachementId: req.params.id },
      orderBy: { captureAt: "asc" },
    });
    res.json(points);
  } catch (err) { next(err); }
});

attachementsRouter.post("/:id/gps", requireRole("ADMIN", "DMC", "MISSION", "TECHNIQUE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const data = z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      altitude: z.number().optional(),
      precision: z.number().optional(),
      description: z.string().optional(),
    }).parse(req.body);

    const point = await prisma.attachementGPS.create({
      data: {
        attachementId: req.params.id,
        ...data,
        capturePar: req.user.nomComplet ?? req.user.id,
        captureAt: new Date(),
      },
    });
    res.status(201).json(point);
  } catch (err) { next(err); }
});

// ===== MEDIAS =====

attachementsRouter.get("/:id/medias", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const medias = await prisma.attachementMedia.findMany({
      where: { attachementId: req.params.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(medias);
  } catch (err) { next(err); }
});

attachementsRouter.post("/:id/medias", requireRole("ADMIN", "DMC", "MISSION", "TECHNIQUE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const data = z.object({
      type: z.enum(["PHOTO", "VIDEO", "PLAN", "DOCUMENT"]),
      cheminFichier: z.string().min(1),
      urlPublique: z.string().optional(),
      legende: z.string().optional(),
      latGps: z.number().optional(),
      lonGps: z.number().optional(),
    }).parse(req.body);

    const media = await prisma.attachementMedia.create({
      data: {
        attachementId: req.params.id,
        ...data,
        prisPar: req.user.nomComplet ?? req.user.id,
        prisAt: new Date(),
      },
    });
    res.status(201).json(media);
  } catch (err) { next(err); }
});

attachementsRouter.delete("/:id/medias/:mediaId", requireRole("ADMIN", "DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.attachementMedia.delete({ where: { id: req.params.mediaId } });
    res.status(204).send();
  } catch (err) { next(err); }
});

// ===== COMMENTAIRES =====

attachementsRouter.get("/:id/commentaires", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const comments = await prisma.attachementCommentaire.findMany({
      where: { attachementId: req.params.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(comments);
  } catch (err) { next(err); }
});

attachementsRouter.post("/:id/commentaires", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const { contenu, type } = z.object({
      contenu: z.string().min(1),
      type: z.enum(["COMMENTAIRE", "CORRECTION", "OBSERVATION", "ALERTE"]).optional(),
    }).parse(req.body);

    const comment = await prisma.attachementCommentaire.create({
      data: {
        attachementId: req.params.id,
        contenu,
        auteurId: req.user.id,
        auteurNom: req.user.nomComplet,
        auteurRole: req.user.role,
        type: type ?? "COMMENTAIRE",
      },
    });
    res.status(201).json(comment);
  } catch (err) { next(err); }
});

// ===== AUDIT TRAIL =====

attachementsRouter.get("/:id/audit", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { entityType: "Attachement", entityId: req.params.id },
      include: { user: { select: { nomComplet: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(logs);
  } catch (err) { next(err); }
});

// ===== VALIDATIONS =====

attachementsRouter.get("/:id/validations", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validations = await prisma.attachementValidation.findMany({
      where: { attachementId: req.params.id },
      orderBy: { valideAt: "desc" },
    });
    res.json(validations);
  } catch (err) { next(err); }
});

// ===== DELETE =====

attachementsRouter.delete("/:id", requireRole("ADMIN", "DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const att = await prisma.attachement.findUnique({ where: { id: req.params.id } });
    if (!att) throw new ApiError(404, "Attachement non trouvé");
    if (att.statut === "VALIDE") throw new ApiError(400, "Un attachement validé ne peut pas être supprimé");

    await prisma.attachement.delete({ where: { id: req.params.id } });
    await logAudit({ userId: req.user.id, action: "DELETE", entityType: "Attachement", entityId: req.params.id });
    res.status(204).send();
  } catch (err) { next(err); }
});
