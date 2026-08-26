/**
 * §21 CDC — Tableaux de bord adaptés par profil
 * §17 CDC — Suivi statut temps réel
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { prisma } from "../../lib/prisma";
import { getMarchesAffectes } from "../../lib/affectations";
import { entrepriseIdOf } from "../../lib/scope";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

// §21 — Tableau de bord général (adapté par rôle) — servi sur / et /stats (alias)
async function generalDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const role = req.user?.role ?? "ADMIN";
    // Vue par profil : les rôles scopés ne voient que leurs marchés affectés
    const affectes = req.user ? await getMarchesAffectes(req.user.id, role) : null;
    // Revue du 20/08/2026 : ce filtre était déclaré puis jamais alimenté — un
    // compte ENTREPRISE recevait les agrégats et montants payés de TOUTE
    // l'agence. Il borne désormais tous les compteurs et agrégats ci-dessous.
    const mienne = role === "ENTREPRISE" && req.user ? await entrepriseIdOf(req.user.id) : null;
    const entrepriseFilter: Record<string,unknown> = mienne ? { entrepriseId: mienne } : {};
    const marcheScope = affectes ? { marcheId: { in: affectes } } : {};
    const marcheScopeNonDeleted = affectes ? { deletedAt: null, ...marcheScope } : { deletedAt: null };
    const marchesWhere = {
      deletedAt: null,
      ...(affectes ? { id: { in: affectes } } : {}),
      ...(mienne ? { entrepriseId: mienne } : {}),
    };

    const [
      totalDecomptes, enAttente, enCorrection, validesDg,
      enCircuitFinancier, payes, montantEngageRaw, montantPayeRaw,
      totalMarches, marchesActifs,
      totalEntreprises, entreprisesBloquees,
      decomptesByStatut,
    ] = await Promise.all([
      prisma.decompte.count({ where: { ...marcheScopeNonDeleted, ...entrepriseFilter } }),
      prisma.decompte.count({ where: { ...marcheScopeNonDeleted, statut: { in: ["DEPOSE","EN_CONTROLE","EN_VALIDATION"] }, ...entrepriseFilter } }),
      prisma.decompte.count({ where: { ...marcheScopeNonDeleted, statut: "EN_CORRECTION", ...entrepriseFilter } }),
      prisma.decompte.count({ where: { ...marcheScopeNonDeleted, statut: "VALIDE_DG", ...entrepriseFilter } }),
      prisma.decompte.count({ where: { ...marcheScopeNonDeleted, statut: "EN_CIRCUIT_FINANCIER", ...entrepriseFilter } }),
      prisma.decompte.count({ where: { ...marcheScopeNonDeleted, statut: "PAYE", ...entrepriseFilter } }),
      prisma.decompte.aggregate({ where: { ...marcheScopeNonDeleted, ...entrepriseFilter }, _sum: { netAPayer: true } }),
      prisma.decompte.aggregate({ where: { ...marcheScopeNonDeleted, statut: "PAYE", ...entrepriseFilter }, _sum: { netAPayer: true } }),
      prisma.marche.count({ where: marchesWhere }),
      // Revue 20/08/2026 : ce compteur ne comptait que l'alias "ACTIF" qu'aucun
      // marché ne porte — « marchés actifs » affichait toujours 0. Même règle
      // que marches.service.ts : EN_EXECUTION (statut réel) + ACTIF (alias).
      prisma.marche.count({ where: { ...marchesWhere, statut: { in: ["ACTIF","EN_EXECUTION"] } } }),
      prisma.entreprise.count({ where: { deletedAt: null } }),
      prisma.entreprise.count({ where: { deletedAt: null, statut: "BLOQUE" } }),
      prisma.decompte.groupBy({ by: ["statut"], where: { ...marcheScopeNonDeleted, ...entrepriseFilter }, _count: true }),
    ]);

    // Taux rejet/correction (30 derniers jours)
    const trente = new Date(); trente.setDate(trente.getDate() - 30);
    const [actionsTotal, actionsRejetees, actionsCorrection] = await Promise.all([
      prisma.workflowAction.count({ where: { createdAt: { gte: trente } } }),
      prisma.workflowAction.count({ where: { createdAt: { gte: trente }, decision: "REJETE" } }),
      prisma.workflowAction.count({ where: { createdAt: { gte: trente }, decision: { in: ["DEMANDE_CORRECTION","DEMANDE_COMPLEMENT"] } } }),
    ]);

    const circuitsEnCours = role !== "ENTREPRISE"
      ? await prisma.circuitFinancier.count({ where: { statut: "EN_COURS" } })
      : 0;

    const alertesNonEnvoyees = await prisma.alerte.count({ where: { envoye: false } });

    res.json({
      role,
      decomptes: {
        total: totalDecomptes, enAttente, enCorrection, validesDg,
        enCircuitFinancier, payes,
        montantEngageGnf: montantEngageRaw._sum.netAPayer?.toString() ?? "0",
        montantPayeGnf: montantPayeRaw._sum.netAPayer?.toString() ?? "0",
        byStatut: decomptesByStatut.reduce((acc: Record<string,number>, r) => { acc[r.statut] = r._count; return acc; }, {}),
      },
      marches: { total: totalMarches, actifs: marchesActifs },
      entreprises: { total: totalEntreprises, bloquees: entreprisesBloquees },
      workflow: {
        tauxRejet: actionsTotal > 0 ? Math.round(actionsRejetees * 100 / actionsTotal) : 0,
        tauxCorrection: actionsTotal > 0 ? Math.round(actionsCorrection * 100 / actionsTotal) : 0,
        circuitsFinanciersEnCours: circuitsEnCours,
      },
      alertes: { nonEnvoyees: alertesNonEnvoyees },
    });
  } catch (err) { next(err); }
}
dashboardRouter.get("/", generalDashboard);
dashboardRouter.get("/stats", generalDashboard);

// §21 — File d'attente par étape du circuit de validation (vue DG)
// Le frontend attend { pipeline: [{role, label, nb, montantTotal, dossiers[]}] }
dashboardRouter.get("/pipeline", requireRole("ADMIN", "DG"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const instances = await prisma.workflowInstance.findMany({
      where: { statut: "EN_COURS" },
      include: {
        definition: { include: { etapes: { orderBy: { ordre: "asc" } } } },
        decompte: {
          select: {
            id: true, reference: true, statut: true, netAPayer: true, createdAt: true,
            marche: { select: { reference: true, financement: true } },
            entreprise: { select: { raisonSociale: true } },
          },
        },
      },
    });

    const CHAINE: Array<{ role: string; label: string }> = [
      { role: "MISSION",   label: "Mission contrôle" },
      { role: "TECHNIQUE", label: "Direction Technique" },
      { role: "UGP",       label: "Unité de gestion" },
      { role: "DMC",       label: "Direction des marchés" },
      { role: "DAF",       label: "Visa financier" },
      { role: "DG",        label: "Approbation finale" },
    ];
    const parRole = new Map<string, { role: string; label: string; nb: number; montantTotal: number; dossiers: unknown[] }>(
      CHAINE.map((c) => [c.role, { ...c, nb: 0, montantTotal: 0, dossiers: [] }])
    );

    for (const inst of instances) {
      const etape = inst.definition.etapes[inst.etapeActuelle];
      const d = inst.decompte;
      if (!etape?.roleRequis || !d) continue;
      let step = parRole.get(etape.roleRequis);
      if (!step) { // étape avec un rôle hors chaîne standard (ex. délégation service)
        step = { role: etape.roleRequis, label: etape.nom, nb: 0, montantTotal: 0, dossiers: [] };
        parRole.set(etape.roleRequis, step);
      }
      step.nb++;
      step.montantTotal += Number(d.netAPayer);
      if (step.dossiers.length < 5) {
        step.dossiers.push({
          id: d.id, reference: d.reference, statut: d.statut,
          netAPayer: d.netAPayer.toString(), createdAt: d.createdAt.toISOString(),
          marche: d.marche, entreprise: d.entreprise,
        });
      }
    }

    res.json({ pipeline: [...parRole.values()] });
  } catch (err) { next(err); }
});

// §21 — Vue DAF : engagements, visas, ordonnancements, circuit financier
dashboardRouter.get("/daf", requireRole("ADMIN", "DAF", "DG"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [enAttenteVisa, visaAccorde, visaRefuse, ordonnances, montantOrdonnanceRaw] = await Promise.all([
      prisma.decompte.count({ where: { deletedAt: null, statut: "EN_VALIDATION", visaFinancier: null } }),
      prisma.decompte.count({ where: { deletedAt: null, visaFinancier: "ACCORDE" } }),
      prisma.decompte.count({ where: { deletedAt: null, visaFinancier: "REFUSE" } }),
      prisma.decompte.count({ where: { deletedAt: null, statut: "ORDONNANCE" } }),
      prisma.decompte.aggregate({ where: { deletedAt: null, statut: "ORDONNANCE" }, _sum: { netAPayer: true } }),
    ]);
    const circuitsEnCours = await prisma.circuitFinancier.findMany({
      where: { statut: "EN_COURS" },
      include: {
        etapes: { orderBy: { ordre: "asc" } },
        decompte: { include: { marche: { select: { reference: true, financement: true } }, entreprise: { select: { raisonSociale: true } } } },
      },
      take: 20,
    });
    res.json({ enAttenteVisa, visaAccorde, visaRefuse, ordonnances, montantOrdonnanceGnf: montantOrdonnanceRaw._sum.netAPayer?.toString() ?? "0", circuitsEnCours });
  } catch (err) { next(err); }
});

// §21 — Vue DMC : décomptes en cours, corrections, rejets
dashboardRouter.get("/dmc", requireRole("ADMIN", "DMC", "DG"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [enAnalyse, avecAnalyse, corrections, rejets] = await Promise.all([
      prisma.decompte.count({ where: { deletedAt: null, statut: "EN_VALIDATION", analyseDmc: null } }),
      prisma.decompte.count({ where: { deletedAt: null, analyseDmc: { not: null } } }),
      prisma.decompte.count({ where: { deletedAt: null, statut: "EN_CORRECTION" } }),
      prisma.decompte.count({ where: { deletedAt: null, statut: "REJETE" } }),
    ]);
    const dossiers = await prisma.decompte.findMany({
      where: { deletedAt: null, statut: { in: ["EN_VALIDATION","EN_CORRECTION"] } },
      include: { marche: { select: { reference: true, intitule: true, financement: true } }, entreprise: { select: { raisonSociale: true } } },
      orderBy: { dateDepot: "asc" },
      take: 20,
    });
    res.json({ enAnalyse, avecAnalyse, corrections, rejets, dossiers });
  } catch (err) { next(err); }
});

// §21 — Vue DG : encours, montants, retards, dossiers bloqués
dashboardRouter.get("/dg", requireRole("ADMIN", "DG"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [suspendus, avecAudit, enAttenteDg, montantEncours] = await Promise.all([
      prisma.decompte.count({ where: { deletedAt: null, traitementSuspendu: true } }),
      prisma.decompte.count({ where: { deletedAt: null, auditRequis: true } }),
      prisma.decompte.count({ where: { deletedAt: null, statut: "EN_VALIDATION" } }),
      prisma.decompte.aggregate({ where: { deletedAt: null, statut: { in: ["EN_VALIDATION","VALIDE_DG","EN_CIRCUIT_FINANCIER"] } }, _sum: { netAPayer: true } }),
    ]);
    const retards = await prisma.decompte.findMany({
      where: { deletedAt: null, statut: { in: ["DEPOSE","EN_CONTROLE","EN_VALIDATION"] } },
      include: { marche: { select: { reference: true, financement: true } }, entreprise: { select: { raisonSociale: true } } },
      orderBy: { dateDepot: "asc" },
      take: 10,
    });
    const soon = new Date(); soon.setDate(soon.getDate() + 30);
    const garantiesAExpirer = await prisma.garantie.count({
      where: { active: true, dateExpiration: { lte: soon, gte: new Date() } },
    });
    res.json({ suspendus, avecAudit, enAttenteDg, montantEncoursGnf: montantEncours._sum.netAPayer?.toString() ?? "0", retards, garantiesAExpirer });
  } catch (err) { next(err); }
});

// §21 — Vue UGP : demandes décaissement bailleurs
dashboardRouter.get("/ugp", requireRole("ADMIN", "UGP", "DG"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Périmètre d'affectation (revue 20/08/2026) : UGP est un rôle scopé —
    // sans ce filtre, il voyait les circuits de décaissement de toute l'agence.
    const affectesUgp = await getMarchesAffectes(req.user!.id, req.user!.role);
    const circuitsBailleur = await prisma.circuitFinancier.findMany({
      where: {
        type: "BAILLEUR", statut: "EN_COURS",
        ...(affectesUgp ? { decompte: { marcheId: { in: affectesUgp } } } : {}),
      },
      include: {
        etapes: { orderBy: { ordre: "asc" } },
        decompte: { include: { marche: { select: { reference: true, intitule: true, financement: true, bailleur: true } }, entreprise: { select: { raisonSociale: true } } } },
      },
      orderBy: { dateCreation: "asc" },
    });
    res.json({ circuitsBailleur });
  } catch (err) { next(err); }
});

// §17 CDC — Suivi statut temps réel (entreprise + services)
dashboardRouter.get("/statut/:decompteId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Cloisonnement (revue 20/08/2026) : ce suivi complet (circuit, agents,
    // montants) était lisible sur le décompte de n'importe qui. Mêmes règles
    // que le garde centralisé router.param("id") du module décomptes :
    // périmètre d'affectation + isolation ENTREPRISE, refus en 404.
    if (req.user) {
      const d = await prisma.decompte.findFirst({ where: { id: req.params.decompteId, deletedAt: null }, select: { marcheId: true, entrepriseId: true } });
      if (!d) return res.status(404).json({ error: "Décompte introuvable" });
      if (req.user.role === "ENTREPRISE") {
        if (d.entrepriseId !== (await entrepriseIdOf(req.user.id))) return res.status(404).json({ error: "Décompte introuvable" });
      } else {
        const affectes = await getMarchesAffectes(req.user.id, req.user.role);
        if (affectes !== null && !affectes.includes(d.marcheId)) return res.status(404).json({ error: "Décompte introuvable" });
      }
    }
    const decompte = await prisma.decompte.findFirst({
      where: { id: req.params.decompteId, deletedAt: null },
      include: {
        marche: { select: { reference: true, intitule: true, financement: true } },
        entreprise: { select: { raisonSociale: true } },
        circuitFinancier: { include: { etapes: { orderBy: { ordre: "asc" } } } },
        workflowInstances: {
          include: {
            actions: { include: { user: { select: { nomComplet: true, role: true } } }, orderBy: { createdAt: "asc" } },
            definition: { include: { etapes: { orderBy: { ordre: "asc" } } } },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    if (!decompte) return res.status(404).json({ error: "Décompte introuvable" });

    const STATUT_LABELS: Record<string,string> = {
      BROUILLON:"Brouillon",
      DEPOSE:"Déposé — accusé de réception émis",
      EN_CONTROLE:"En contrôle (Mission / Direction Technique)",
      EN_CORRECTION:"En correction — voir observations",
      EN_VALIDATION:"En validation (DMC / DAF / DG)",
      VALIDE_DG:"Validé Direction Générale",
      EN_CIRCUIT_FINANCIER:"En circuit de paiement",
      ORDONNANCE:"Ordonnancé",
      VALIDE:"Validé",
      REJETE:"Rejeté",
      PAYE:"Payé",
    };

    res.json({
      id: decompte.id,
      reference: decompte.reference,
      numeroDossier: decompte.numeroDossier,
      statut: decompte.statut,
      statutLabel: STATUT_LABELS[decompte.statut] ?? decompte.statut,
      dateDepot: decompte.dateDepot,
      datePaiement: decompte.datePaiement,
      traitementSuspendu: decompte.traitementSuspendu,
      auditRequis: decompte.auditRequis,
      marche: decompte.marche,
      entreprise: decompte.entreprise,
      workflow: decompte.workflowInstances[0] ?? null,
      circuitFinancier: decompte.circuitFinancier,
    });
  } catch (err) { next(err); }
});
