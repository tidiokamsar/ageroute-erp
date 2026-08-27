import { logAudit } from "../../lib/audit";
import { entrepriseDuCompte, assertMarcheAutorise } from "../../lib/perimetre";
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { decompteCreateSchema, decompteUpdateSchema } from "./decomptes.schema";
import { decomptesService, assertDecompteModifiable } from "./decomptes.service";
import { ApiError } from "../../middleware/error.middleware";
import { entrepriseIdOf } from "../../lib/scope";
import { getMarchesAffectes } from "../../lib/affectations";
import { chargerRegles, nombreRegles } from "../../lib/regles";
import { calcDecompteRegles } from "./decomptes.calc.regles";
import { construireSnapshot, rejouerCalcul, lireSnapshot } from "./decomptes.regles.audit";
import { z } from "zod";
import { CLES_PIECES } from "../../lib/pieces-obligatoires";
import type { StatutDecompte } from "@prisma/client";
import { decompteDocumentsRouter } from "./decomptes.documents.routes";

export const decomptesRouter = Router();
decomptesRouter.use(requireAuth);

/**
 * Garde de périmètre sur TOUTE route désignant un décompte par :id.
 *
 * Constat C2 de la revue du 20/08/2026 : les listes filtraient par affectation,
 * mais les 21 routes objet (GET /:id, PUT /:id, POST /:id/lignes…) ne
 * vérifiaient que l'isolation ENTREPRISE — jamais l'affectation des rôles à
 * périmètre. Un agent MISSION affecté au marché A pouvait lire et modifier un
 * décompte du marché B par son identifiant (IDOR).
 *
 * `router.param` s'exécute pour chaque route portant :id — y compris celles
 * qui seront ajoutées plus tard : impossible d'oublier la garde sur une
 * nouvelle route. Les routes littérales (/, /stats) sont déclarées avant et ne
 * passent pas ici. Refus en 404, jamais 403 : un 403 confirmerait l'existence
 * du dossier à quelqu'un qui n'a pas à la connaître.
 */
decomptesRouter.param("id", async (req: Request, _res: Response, next: NextFunction, id: string) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const d = await (await import("../../lib/prisma")).prisma.decompte.findFirst({
      where: { id, deletedAt: null },
      select: { marcheId: true, entrepriseId: true },
    });
    if (!d) throw new ApiError(404, "Décompte introuvable");
    if (req.user.role === "ENTREPRISE") {
      if (d.entrepriseId !== (await entrepriseIdOf(req.user.id))) throw new ApiError(404, "Décompte introuvable");
    } else {
      const affectes = await getMarchesAffectes(req.user.id, req.user.role);
      if (affectes !== null && !affectes.includes(d.marcheId)) throw new ApiError(404, "Décompte introuvable");
    }
    next();
  } catch (err) { next(err); }
});

// Pièces justificatives réelles (fichiers) — voir decomptes.documents.routes.ts
decomptesRouter.use("/:id/documents", decompteDocumentsRouter);

decomptesRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Périmètres : isolation des comptes ENTREPRISE + affectations terrain
    // Refuse un compte entreprise sans rattachement plutôt que de renvoyer
    // null — le repli `?? req.query.entrepriseId` ci-dessous laissait alors le
    // CLIENT choisir le filtre, donc n'en appliquer aucun.
    const entrepriseScope = await entrepriseDuCompte(req);
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

decomptesRouter.get("/stats", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Mêmes règles que la liste : isolation ENTREPRISE + affectations terrain.
    const entrepriseId = req.user?.role === "ENTREPRISE" ? await entrepriseIdOf(req.user.id) : null;
    const marcheIds = req.user ? await getMarchesAffectes(req.user.id, req.user.role) : null;
    res.json(await decomptesService.stats({ entrepriseId, marcheIds }));
  } catch (err) { next(err); }
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
    const marcheDeclare = (body as never as { marcheId: string }).marcheId;
    // Périmètre d'affectation sur le marché DÉCLARÉ. La garde `router.param`
    // ne couvre pas cette route, qui ne porte pas d'identifiant : un agent à
    // périmètre (MISSION, TECHNIQUE, UGP, BAILLEUR) pouvait donc créer un
    // décompte sur le marché d'autrui — dossier qu'il ne pourrait plus relire,
    // mais qui existe, porte un numéro et entre dans les agrégats financiers
    // de ce marché. `POST /api/attachements` faisait déjà ce contrôle.
    await assertMarcheAutorise(req, marcheDeclare);
    const marche = await prisma.marche.findFirst({ where: { id: marcheDeclare, deletedAt: null } });
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
    // Schéma dérivé du RÉFÉRENTIEL UNIQUE (revue 27/08/2026) : l'énumération
    // en dur rejetait silencieusement toute pièce ajoutée au référentiel.
    const pieces = z.object(
      Object.fromEntries(CLES_PIECES.map((cle) => [cle, z.boolean().optional()])) as unknown as Record<string, z.ZodTypeAny>,
    ).parse(req.body);
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

/**
 * Mutation générique de statut — ROUTE RETIRÉE DU SERVICE le 20/08/2026.
 *
 * Elle permettait à six rôles de poser directement `VALIDE` ou `PAYE`, sans
 * vérifier l'état source, le circuit ni les visas : ce seul endpoint annulait
 * tout ce que le moteur de validation garantit (RG9, transaction, projection).
 * Constat n°1 de la revue — un décompte pouvait passer de brouillon à payé.
 *
 * Le statut est désormais une DONNÉE DÉRIVÉE, jamais une entrée :
 *   · le parcours passe par POST /api/workflow/:instanceId/action ;
 *   · `PAYE` viendra du seul rapprochement des paiements confirmés.
 * Aucun écran n'appelait cette route (vérifié) ; elle répond 410 plutôt que
 * de disparaître en 404 muet, pour qu'un script resté dessus comprenne.
 */
decomptesRouter.post("/:id/statut", requireRole("ADMIN","DAF","DG","DMC","TECHNIQUE","UGP"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const instance = await (await import("../../lib/prisma")).prisma.workflowInstance.findFirst({
      where: { decompteId: req.params.id, statut: "EN_COURS" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    throw new ApiError(
      410,
      instance
        ? `Route retirée du service : le statut d'un décompte n'est plus une entrée. Utilisez le circuit : POST /api/workflow/${instance.id}/action.`
        : "Route retirée du service : le statut d'un décompte n'est plus une entrée. Soumettez d'abord le décompte au circuit : POST /api/workflow/soumettre/" + req.params.id + ".",
    );
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
    // A4 — report de l'excédent de pénalités (décision DAF du 26/08/2026) :
    // absorption du report en attente du décompte précédent du marché, puis
    // écrêtage du propre excédent, reporté sur le décompte suivant. La colonne
    // `penalites` porte le total imputé (saisies + report entrant) pour que le
    // rejeu d'audit concorde. Le report est borné aux pénalités imputées.
    const reportPrecedent = await prisma.decompte.findFirst({
      // Bornée aux décomptes ANTÉRIEURS : le filtre `id != courant` laissait
      // un décompte ancien aspirer le report d'un décompte POSTÉRIEUR déjà en
      // circuit, et le remettre à zéro sans que son net soit recalculé.
      where: { marcheId: decompte.marcheId, deletedAt: null, penalitesReporteesGnf: { gt: 0n }, createdAt: { lt: decompte.createdAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true, penalitesReporteesGnf: true },
    });
    const penalitesImputees = totalPen + (reportPrecedent?.penalitesReporteesGnf ?? 0n);
    let totalNet = totalTtc - totalPrecomp - totalRetenue - (reglesTotaux.RG_ARMP_INCLUSE_TTC === "true" ? totalArmp : 0n) - totalAvance - penalitesImputees;
    let reportSortant = 0n;
    if (reglesTotaux.RG_NET_PLANCHER_ZERO === "true" && totalNet < 0n) {
      const excedent = -totalNet;
      if (reglesTotaux.RG_REPORT_PENALITES === "true") {
        reportSortant = excedent > penalitesImputees ? penalitesImputees : excedent;
      }
      totalNet = 0n;
    }

    // Totaux, nouveau report et consommation de l'ancien : une transaction.
    await prisma.$transaction(async (tx) => {
      await tx.decompte.update({
        where: { id: req.params.id },
        data: {
          montantPeriodeHtGnf: totalBrut,
          tva:             totalTva,
          montantArmpGnf:  totalArmp,
          montantTtcGnf:   totalTtc,
          precompteTvaGnf: totalPrecomp,
          retenueGarantie: totalRetenue,
          avanceRecuperee: totalAvance,
          penalites:       penalitesImputees,
          netAPayer:       totalNet,
          penalitesReporteesGnf: reportSortant,
          // L1.2 — règles figées ayant servi à la combinaison du net (rejeu)
          reglesSnapshot:  construireSnapshot(reglesTotaux, "LIGNES") as never,
        },
      });
      if (reportPrecedent) {
        // Consommation ATOMIQUE : la condition `gt: 0` garantit qu'une seule
        // écriture absorbe la créance. Sans elle, deux créations concurrentes
        // lisaient le même report hors transaction et le déduisaient toutes
        // deux — l'entreprise se voyait retenir deux fois la même pénalité.
        await tx.decompte.updateMany({ where: { id: reportPrecedent.id, penalitesReporteesGnf: { gt: 0n } }, data: { penalitesReporteesGnf: 0n } });
      }
    });

    res.status(201).json({ ...ligne, prixUnitaire: ligne.prixUnitaire.toString(), montantBrut: ligne.montantBrut.toString(), montantNet: ligne.montantNet.toString() });
  } catch (err) { next(err); }
});

decomptesRouter.put("/:id/lignes/:ligneId", requireRole("ADMIN", "DMC", "MISSION", "ENTREPRISE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const body = ligneSchema.parse(req.body);
    const { prisma } = await import("../../lib/prisma");
    // Un dossier visé ne se modifie plus, et une modification de montant se trace.
    await assertDecompteModifiable(req.params.id);
    const ligne = await prisma.decompteLigne.findFirst({ where: { id: req.params.ligneId, decompteId: req.params.id } });
    if (!ligne) throw new ApiError(404, "Ligne introuvable");
    const updated = await prisma.decompteLigne.update({ where: { id: req.params.ligneId }, data: body as never });
    await logAudit({
      userId: req.user.id, action: "UPDATE", entityType: "DecompteLigne", entityId: updated.id,
      before: ligne, after: updated,
    });
    res.json(updated);
  } catch (err) { next(err); }
});

decomptesRouter.delete("/:id/lignes/:ligneId", requireRole("ADMIN", "DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const { prisma } = await import("../../lib/prisma");
    await assertDecompteModifiable(req.params.id);
    // La ligne est détruite PHYSIQUEMENT — il n'y a pas de suppression logique
    // sur ce modèle. Sa trace d'audit est donc la seule chose qui subsistera :
    // sans elle, une ligne de facturation disparaissait sans laisser d'empreinte.
    const ligne = await prisma.decompteLigne.findFirst({ where: { id: req.params.ligneId, decompteId: req.params.id } });
    if (!ligne) throw new ApiError(404, "Ligne introuvable");
    await prisma.decompteLigne.delete({ where: { id: req.params.ligneId } });
    await logAudit({
      userId: req.user.id, action: "DELETE", entityType: "DecompteLigne", entityId: req.params.ligneId,
      before: ligne, after: { decompteId: req.params.id, supprimee: true },
    });
    res.status(204).send();
  } catch (err) { next(err); }
});

// POST /:id/calculate — recalcule total depuis lignes (avec taux custom)
decomptesRouter.post("/:id/calculate", requireRole("ADMIN", "DMC", "MISSION", "ENTREPRISE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const { prisma } = await import("../../lib/prisma");
    const before = await assertDecompteModifiable(req.params.id);

    // Les taux ne viennent PLUS du corps de la requête. Cette route les
    // acceptait — vatRate, retentionRate, advanceRecoveryRate — et recalculait
    // en virgule flottante, hors du moteur de règles : n'importe quel appelant
    // pouvait donc imposer une TVA à 0 et réécrire le net à payer. L'écran
    // envoyait de toute façon les taux DU MARCHÉ ; ils sont désormais lus à la
    // source, et la cascade fiscale passe par le moteur (A1-A7), en entiers.
    // Les pénalités déjà imputées sont conservées : le corps par défaut les
    // remettait silencieusement à zéro à chaque clic sur « Recalculer ».
    const lignes = await prisma.decompteLigne.findMany({ where: { decompteId: req.params.id } });
    const totalHt = lignes.reduce((s, l) => s + l.montantBrut, 0n);

    const regles = await chargerRegles({
      marcheId: before.marcheId, bailleur: before.marche.financement, typeMarche: before.marche.type,
    });
    const calc = calcDecompteRegles({
      montantPeriodeHtGnf: totalHt,
      cumulPrecedentHtGnf: before.cumulPrecedentHtGnf,
      penalites: before.penalites,
      tauxTva: before.marche.tauxTva ?? undefined,
      tauxRetenueGarantie: before.marche.tauxRetenueGarantie ?? undefined,
      tauxAvance: before.marche.tauxAvance ?? undefined,
    }, regles);

    const updated = await prisma.decompte.update({
      where: { id: req.params.id },
      data: { montantPeriodeHtGnf: totalHt, ...calc, reglesSnapshot: construireSnapshot(regles, "LIGNES") as never },
    });
    await logAudit({
      userId: req.user.id, action: "UPDATE", entityType: "Decompte", entityId: req.params.id,
      before: {
        montantPeriodeHtGnf: before.montantPeriodeHtGnf, tva: before.tva, retenueGarantie: before.retenueGarantie,
        avanceRecuperee: before.avanceRecuperee, penalites: before.penalites, netAPayer: before.netAPayer,
      },
      after: {
        recalcul: "depuis les lignes", lignes: lignes.length,
        montantPeriodeHtGnf: totalHt, tva: calc.tva, retenueGarantie: calc.retenueGarantie,
        avanceRecuperee: calc.avanceRecuperee, netAPayer: calc.netAPayer,
      },
    });

    res.json({
      totalBrut: totalHt, tva: calc.tva, retenue: calc.retenueGarantie, avance: calc.avanceRecuperee,
      penalites: before.penalites, netAPayer: calc.netAPayer, lignesCount: lignes.length,
    });
  } catch (err) { next(err); }
});

// ── L1.2 — REJEU D'AUDIT : recalculer un décompte avec SES règles figées ─────
decomptesRouter.get("/:id/recalcul-audit", requireRole("ADMIN", "DAF", "DG", "AUDITEUR"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prisma } = await import("../../lib/prisma");
    const d = await prisma.decompte.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!d) throw new ApiError(404, "Décompte introuvable");
    const marche = await prisma.marche.findUnique({ where: { id: d.marcheId } });
    if (!marche) throw new ApiError(404, "Marché introuvable");

    const resultat = rejouerCalcul(
      {
        montantPeriodeHtGnf: d.montantPeriodeHtGnf,
        cumulPrecedentHtGnf: d.cumulPrecedentHtGnf,
        penalites: d.penalites,
        revisionPrix: d.revisionPrix,
        tva: d.tva,
        montantArmpGnf: d.montantArmpGnf,
        montantTtcGnf: d.montantTtcGnf,
        precompteTvaGnf: d.precompteTvaGnf,
        retenueGarantie: d.retenueGarantie,
        avanceRecuperee: d.avanceRecuperee,
        netAPayer: d.netAPayer,
      },
      { tauxTva: marche.tauxTva, tauxRetenueGarantie: marche.tauxRetenueGarantie, tauxAvance: marche.tauxAvance },
      lireSnapshot(d.reglesSnapshot),
    );

    if (resultat.erreur) return res.status(422).json({ erreur: resultat.erreur, reference: d.reference });
    res.json({
      reference: d.reference,
      ...resultat,
      message: resultat.concordance
        ? "Concordance — les montants enregistrés correspondent exactement au recalcul avec les règles figées."
        : "ÉCART DÉTECTÉ — les montants enregistrés divergent du rejeu avec les règles figées. À examiner (audit).",
    });
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

    // Identité du signataire — une pièce comptable doit dire QUI a validé, à
    // quel titre, et porter sa signature. Le nom est resservi depuis le compte
    // plutôt que depuis l'instantané `valideNom`, qui contenait l'adresse
    // e-mail sur les validations anciennes.
    const ids = [...new Set(validations.map((v) => v.validePar).filter(Boolean) as string[])];
    const agents = ids.length
      ? await prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, nomComplet: true, nom: true, prenom: true, fonction: true, signatureUrl: true },
        })
      : [];
    const parId = new Map(agents.map((a) => [a.id, a]));

    res.json(validations.map((v) => {
      const a = v.validePar ? parId.get(v.validePar) : undefined;
      const nomAffiche = a
        ? ([a.prenom, a.nom].filter(Boolean).join(" ") || a.nomComplet)
        : v.valideNom;
      return {
        ...v,
        signataire: {
          nom: nomAffiche,
          fonction: a?.fonction ?? null,
          signatureUrl: a?.signatureUrl ?? null,
        },
      };
    }));
  } catch (err) { next(err); }
});

/**
 * Validation d'une étape — ROUTE RETIRÉE DU SERVICE le 20/08/2026.
 *
 * Elle écrivait `decompte.statut` directement, avec sa PROPRE table de
 * correspondance étape -> statut, sans toucher au circuit de validation. D'où la
 * divergence constatée en production : sur 8 décomptes, 3 portaient des
 * validations sans aucune instance de circuit, et l'écran affichait un statut de
 * décompte incompatible avec l'étape de workflow courante.
 *
 * Le circuit est désormais la source unique du parcours. `POST /api/workflow/
 * :instanceId/action` écrit, dans UNE SEULE transaction : l'action de workflow,
 * la ligne de validation (onglet Validations) et le statut du décompte. Il
 * applique aussi RG9 — séparation des tâches.
 *
 * La route est conservée et répond explicitement, plutôt que supprimée : un
 * appelant resté sur l'ancienne interface doit comprendre ce qui a changé, pas
 * recevoir un 404 muet. Les données déjà écrites ne sont pas touchées.
 */
decomptesRouter.post("/:id/validations-avancees", requireRole("ADMIN","DG","DAF","DMC","MISSION","TECHNIQUE","UGP"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const { prisma } = await import("../../lib/prisma");

    const instance = await prisma.workflowInstance.findFirst({
      where: { decompteId: req.params.id, statut: "EN_COURS" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    throw new ApiError(
      410,
      instance
        ? `Route retirée du service. La validation passe par le circuit : POST /api/workflow/${instance.id}/action. ` +
          "La ligne de l'onglet Validations y est écrite automatiquement, dans la même transaction — " +
          "un appel séparé créerait un doublon."
        : "Route retirée du service, et aucun circuit n'est ouvert pour ce décompte. " +
          "Soumettez-le d'abord : POST /api/workflow/soumettre/" + req.params.id + ".",
    );
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
    // Une trace manuelle documente le circuit, mais ne prouve jamais le
    // transfert bancaire et ne modifie donc pas le statut du décompte.
    res.status(201).json({ ...trace, montantGnf: trace.montantGnf?.toString() });
  } catch (err) { next(err); }
});

// KPIs enrichis §8 CDC
decomptesRouter.get("/stats/enrichis", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prisma } = await import("../../lib/prisma");

    // C'est CET endpoint que l'écran interroge (celui de /stats ne sert que de
    // repli). Sans périmètre, un agent dont la liste ne montrait que ses deux
    // marchés lisait « Total 8 » et le montant payé de toute l'agence.
    const entrepriseId = req.user?.role === "ENTREPRISE" ? await entrepriseIdOf(req.user.id) : null;
    const marcheIds = req.user ? await getMarchesAffectes(req.user.id, req.user.role) : null;
    const base: Record<string, unknown> = { deletedAt: null };
    if (entrepriseId) base.entrepriseId = entrepriseId;
    if (marcheIds) base.marcheId = { in: marcheIds };

    const [total, brouillons, soumis, enControle, valides, payes, rejetes,
      montantAttenteRaw, montantPayeRaw] = await Promise.all([
      prisma.decompte.count({ where: base }),
      prisma.decompte.count({ where: { ...base, statut: "BROUILLON" } }),
      prisma.decompte.count({ where: { ...base, statut: "SOUMIS" } }),
      prisma.decompte.count({ where: { ...base, statut: { in: ["EN_CONTROLE","EN_VALIDATION","VISA_DAF","VISA_DG"] } } }),
      prisma.decompte.count({ where: { ...base, statut: "VALIDE" } }),
      prisma.decompte.count({ where: { ...base, statut: "PAYE" } }),
      prisma.decompte.count({ where: { ...base, statut: "REJETE" } }),
      prisma.decompte.aggregate({ where: { ...base, statut: { notIn: ["PAYE","REJETE"] } }, _sum: { netAPayer: true } }),
      prisma.decompte.aggregate({ where: { ...base, statut: "PAYE" }, _sum: { netAPayer: true } }),
    ]);
    res.json({
      total, brouillons, soumis, enControle, valides, payes, rejetes,
      montantAttenteGnf: montantAttenteRaw._sum.netAPayer?.toString() ?? "0",
      montantPayeGnf: montantPayeRaw._sum.netAPayer?.toString() ?? "0",
    });
  } catch (err) { next(err); }
});
