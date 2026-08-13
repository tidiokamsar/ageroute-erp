import "./lib/bigint"; // doit être importé en premier : patch sérialisation BigInt
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { authRouter } from "./modules/auth/auth.routes";
import { entreprisesRouter } from "./modules/entreprises/entreprises.routes";
import { marchesRouter } from "./modules/marches/marches.routes";
import { bpuRouter } from "./modules/marches/bpu.routes";
import { osRouter } from "./modules/marches/os.routes";
import { decomptesRouter } from "./modules/decomptes/decomptes.routes";
import { attachementsRouter } from "./modules/attachements/attachements.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { usersRouter } from "./modules/users/users.routes";
import { workflowRouter } from "./modules/workflow/workflow.routes";
import { notificationsRouter } from "./modules/notifications/notifications.routes";
import { routierRouter } from "./modules/routier/routier.routes";
import { signatureRouter } from "./modules/signature/signature.routes";
import { paiementsRouter } from "./modules/paiements/paiements.routes";
import { projetsRouter } from "./modules/projets/projets.routes";
import { avenantsRouter } from "./modules/avenants/avenants.routes";
import { circuitFinancierRouter } from "./modules/circuit-financier/circuit-financier.routes";
import { parametrageRouter } from "./modules/parametrage/parametrage.routes";
import { conformiteRouter } from "./modules/conformite/conformite.routes";
import { garantiesRouter } from "./modules/garanties/garanties.routes";
import { receptionsRouter } from "./modules/receptions/receptions.routes";
import { bpmnRouter } from "./modules/bpmn/bpmn.routes";
import { requireAuth } from "./middleware/auth.middleware";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";
import { checkModuleAccess } from "./middleware/moduleAccess.middleware";
// Modules livrés dans le binaire qui tourne en production mais absents de ce
// fichier : sans ces montages, un rebuild retire 7 routes de l'API sans la
// moindre erreur — les écrans correspondants cessent simplement de répondre.
import { delegationsRouter } from "./modules/delegations/delegations.routes";
import { revisionRouter } from "./modules/revision/revision.routes";
import { searchRouter } from "./modules/search/search.routes";
import { portailRouter } from "./modules/portail/portail.routes";
import { exportRouter } from "./modules/export/export.routes";
import { signatureAuditRouter } from "./modules/signature-audit/signature-audit.routes";
import { fundingRouter } from "./modules/funding/funding.routes";
import { prisma } from "./lib/prisma";
import { logAudit } from "./lib/audit";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);

  app.use(helmet({ crossOriginEmbedderPolicy: false }));
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "10mb" }));
  app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));

  app.use("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: "Trop de tentatives" } }));

  app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "ERP AGEROUTE", timestamp: new Date().toISOString() }));

  // Route publique pour le Géoportail (Console BDRI) : consulte un marché par numContrat
  // sans authentification ERP (l'utilisateur est déjà auth dans Console BDRI).
  app.get("/api/public/marche/:numContrat", async (req, res, next) => {
    try {
      const m = await prisma.marche.findFirst({
        where: { numContrat: req.params.numContrat, deletedAt: null },
        select: {
          id: true, reference: true, intitule: true, type: true, statut: true, financement: true,
          montantInitialGnf: true, montantActualiseGnf: true, dateOs: true, dateFinPrevue: true,
          tronconCode: true, regionNom: true,
          entreprise: { select: { raisonSociale: true, statut: true } },
          decomptes: {
            where: { deletedAt: null },
            select: { id: true, reference: true, type: true, statut: true, netAPayer: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      });
      if (!m) return res.status(404).json({ error: "Marché introuvable" });
      res.json(m);
    } catch (err) { next(err); }
  });

  app.use("/api/auth", authRouter);
  app.use("/api/entreprises", entreprisesRouter);
  app.use("/api/marches", marchesRouter);
  app.use("/api/marches/:marcheId/bpu", bpuRouter);
  app.use("/api/marches/:marcheId/os", osRouter);
  app.use("/api/decomptes", decomptesRouter);
  app.use("/api/attachements", attachementsRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/workflow", workflowRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/routier", routierRouter);
  app.use("/api/paiements", paiementsRouter);
  app.use("/api/signature", signatureRouter);
  // §6 CDC — référentiels projets + avenants
  app.use("/api/projets", projetsRouter);
  app.use("/api/avenants", avenantsRouter);
  // §16 CDC — circuits financiers post-DG
  app.use("/api/circuit-financier", circuitFinancierRouter);
  // §22 CDC — paramétrage métier
  app.use("/api/parametrage", parametrageRouter);
  // Délégation d'intérim (suppléants workflow)
  app.use("/api/delegations", requireAuth, checkModuleAccess("delegations"), delegationsRouter);
  // Révision de prix (FIDIC)
  app.use("/api/revision", requireAuth, checkModuleAccess("revision"), revisionRouter);
  // Recherche globale (respecte le périmètre d'affectation)
  app.use("/api/search", requireAuth, searchRouter);
  // §CDC — Conformité entreprise (score, blocage, historique)
  app.use("/api/conformite", conformiteRouter);
  // Gestion des Garanties marchés
  app.use("/api/garanties", garantiesRouter);
  // Gestion des Réceptions OPR / Provisoire / Définitive
  app.use("/api/receptions", receptionsRouter);
  // Moteur BPMN générique — 5 modules (Projet/Marché/Attachement/Décompte/Conformité)
  app.use("/api/bpmn", bpmnRouter);
  app.use("/api/portail", portailRouter);
  app.use("/api/export", exportRouter);
  app.use("/api/signature-audit", signatureAuditRouter);
  // Monté à la racine /api : doit rester APRÈS toutes les routes spécifiques,
  // sinon il les masque.
  app.use("/api", fundingRouter);

  // Résumé public agrégé pour l'intégration SharePoint (SIGTIR) — lecture seule, SANS authentification.
  // Publie le budget total et les derniers décomptes : le binaire en production ne l'expose PAS.
  // Le déployer tel quel ouvrirait cet accès sans décision explicite, d'où ce garde-fou :
  // activer en posant SIGTIR_PUBLIC_SUMMARY=true.
  if (process.env.SIGTIR_PUBLIC_SUMMARY === "true") {
  app.get("/api/public/sigtir-summary", async (_req, res, next) => {
    try {
      const [
        totalProjets, parStatutProjets, budgetAgg,
        totalEntreprises, entreprisesActives,
        alertesNonEnvoyees,
        decomptesRecents,
      ] = await Promise.all([
        prisma.projet.count({ where: { deletedAt: null } }),
        prisma.projet.groupBy({ by: ["statut"], where: { deletedAt: null }, _count: { id: true } }),
        prisma.projet.aggregate({ where: { deletedAt: null }, _sum: { budgetInitialGnf: true } }),
        prisma.entreprise.count({ where: { deletedAt: null } }),
        prisma.entreprise.count({ where: { deletedAt: null, autoriseContracterEtat: true, estRadie: false, estSuspendu: false } }),
        prisma.alerte.count({ where: { envoye: false } }),
        prisma.decompte.findMany({
          where: { deletedAt: null },
          select: {
            reference: true, statut: true, netAPayer: true, createdAt: true,
            marche: { select: { reference: true, intitule: true, tronconCode: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 4,
        }),
      ]);

      const parStatut: Record<string, number> = {};
      for (const row of parStatutProjets) parStatut[row.statut] = row._count.id;
      const enExecution = parStatut["EN_EXECUTION"] ?? 0;

      const avancAgg = await prisma.projet.aggregate({
        where: { deletedAt: null, statut: "EN_EXECUTION" },
        _avg: { avancementPhysique: true },
      });

      res.json({
        generatedAt: new Date().toISOString(),
        projets: { total: totalProjets, enExecution, parStatut },
        budgetTotalGnf: (budgetAgg._sum.budgetInitialGnf ?? 0n).toString(),
        tauxExecutionMoyen: Math.round((avancAgg._avg.avancementPhysique ?? 0) * 10) / 10,
        entreprises: { total: totalEntreprises, actives: entreprisesActives },
        alertesNonEnvoyees,
        decomptesRecents: decomptesRecents.map((d) => ({
          reference: d.reference,
          statut: d.statut,
          netAPayerGnf: d.netAPayer.toString(),
          date: d.createdAt,
          marche: d.marche.reference,
          intitule: d.marche.intitule,
          troncon: d.marche.tronconCode,
        })),
      });
    } catch (err) { next(err); }
  });
  }

  // Vérification publique par token (sans auth) — même handler que /api/signature/verifier/:token
  app.get("/api/public/verifier/:token", async (req, res, next) => {
    try {
      const decompte = await prisma.decompte.findFirst({
        where: { tokenSignature: req.params.token } as never,
        select: { reference: true, statut: true, netAPayer: true, marche: { select: { reference: true, intitule: true } } } as never,
      });
      if (!decompte) return res.status(404).json({ valide: false });
      res.json({ valide: true, decompte });
    } catch (err) { next(err); }
  });

  // Audit log endpoint
  app.get("/api/audit", requireAuth, async (req, res, next) => {
    try {
      const logs = await prisma.auditLog.findMany({
        include: { user: { select: { nomComplet: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: Number(req.query.limit) || 100,
      });
      res.json(logs);
    } catch (err) { next(err); }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
