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
import { situationBordereauRouter } from "./modules/marches/marches.situation.routes";
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
import { delegationsRouter } from "./modules/delegations/delegations.routes";
import { exportRouter } from "./modules/export/export.routes";
import { rapportBailleurRouter } from "./modules/export/rapport-bailleur.routes";
import { documentsOfficielsRouter } from "./modules/documents/documents-officiels.routes";
import { dossierDecompteRouter } from "./modules/documents/dossier-decompte.routes";
import { dossierMarcheRouter } from "./modules/documents/dossier-marche.routes";
import { fundingRouter } from "./modules/funding/funding.routes";
import { portailRouter } from "./modules/portail/portail.routes";
import { revisionRouter } from "./modules/revision/revision.routes";
import { searchRouter } from "./modules/search/search.routes";
import { signatureAuditRouter } from "./modules/signature-audit/signature-audit.routes";
import { signatureNumeriqueRouter } from "./modules/signature-numerique/signature-numerique.routes";
import { uploadsRouter } from "./modules/uploads/uploads.routes";
import { requireAuth } from "./middleware/auth.middleware";
import { requireRole } from "./middleware/rbac.middleware";
import { checkModuleAccess } from "./middleware/moduleAccess.middleware";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";
import { prisma } from "./lib/prisma";
import { logAudit } from "./lib/audit";

export function createApp() {
  const app = express();
  // Nombre de proxys de confiance devant Express. La topologie appartient au
  // DÉPLOIEMENT, pas au source : en production Traefik termine TLS puis nginx
  // relaie /api, soit deux sauts ; en développement il n'y en a aucun. Une
  // valeur trop basse fait voir à Express l'adresse du proxy — tous les
  // utilisateurs partagent alors un seul compteur de limitation ; une valeur
  // trop haute rend l'adresse cliente falsifiable par l'en-tête transmis.
  app.set("trust proxy", env.TRUST_PROXY);

  app.use(helmet({ crossOriginEmbedderPolicy: false }));
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "10mb" }));
  app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));

  // Garde-fou global — plafond d'appels API par adresse IP (anti-abus,
  // anti-énumération). Le /api/auth/login conserve sa limite stricte dédiée.
  app.use("/api", rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Trop de requêtes — réessayez plus tard" },
  }));

  app.use("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: "Trop de tentatives" } }));

  // Consultation publique (Géoportail, vérification de signature) : plafond
  // anti-abus. Il s'applique par adresse, faute d'identité à cet endroit.
  app.use("/api/public", rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Trop de requêtes" },
  }));

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

  // ─── Contrôle d'accès par module (override administrateur, §P0-4 AGENTS.md) ──
  // Piège documenté : requireAuth doit TOUJOURS précéder checkModuleAccess,
  // sinon req.user est indéfini et tout le monde reçoit 401.
  // checkModuleAccess applique la liste effective rôle + overrides et refuse
  // par défaut tout module absent ; l'ADMIN n'est jamais bloqué.
  app.use("/api/entreprises", requireAuth, checkModuleAccess("entreprises"), entreprisesRouter);
  app.use("/api/marches", requireAuth, checkModuleAccess("marches"), marchesRouter);
  app.use("/api/marches/:marcheId/bpu", requireAuth, checkModuleAccess("marches"), bpuRouter);
  app.use("/api/marches/:marcheId/os", requireAuth, checkModuleAccess("marches"), osRouter);
  app.use("/api/marches/:marcheId", situationBordereauRouter);
  app.use("/api/decomptes", requireAuth, checkModuleAccess("decomptes"), decomptesRouter);
  app.use("/api/attachements", requireAuth, checkModuleAccess("attachements"), attachementsRouter);
  app.use("/api/dashboard", requireAuth, checkModuleAccess("dashboard"), dashboardRouter);
  // users : ADMIN exigé au niveau du routeur (aucune clé de module nécessaire)
  app.use("/api/users", usersRouter);
  app.use("/api/workflow", requireAuth, checkModuleAccess("workflow"), workflowRouter);
  // bpmn = même espace fonctionnel « workflow » (tâches + supervision)
  app.use("/api/bpmn", requireAuth, checkModuleAccess("workflow"), bpmnRouter);
  // notifications : personnelles, authentification seule
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/routier", requireAuth, checkModuleAccess("routier"), routierRouter);
  app.use("/api/paiements", requireAuth, checkModuleAccess("paiements"), paiementsRouter);
  app.use("/api/signature", requireAuth, checkModuleAccess("signatures"), signatureRouter);
  app.use("/api/signature-audit", requireAuth, checkModuleAccess("signatures"), signatureAuditRouter);
  // Module signature-numerique (PAdES par prestataire configurable) — même
  // espace fonctionnel « signatures ». Désactivé par défaut (SIG_MODE).
  app.use("/api/signature-numerique", requireAuth, checkModuleAccess("signatures"), signatureNumeriqueRouter);
  // §6 CDC — référentiels projets + avenants
  app.use("/api/projets", requireAuth, checkModuleAccess("projets"), projetsRouter);
  app.use("/api/avenants", requireAuth, checkModuleAccess("avenants"), avenantsRouter);
  // §16 CDC — circuits financiers post-DG
  app.use("/api/circuit-financier", requireAuth, checkModuleAccess("financier"), circuitFinancierRouter);
  // §22 CDC — paramétrage métier
  app.use("/api/parametrage", requireAuth, checkModuleAccess("parametrage"), parametrageRouter);
  // §CDC — Conformité entreprise (score, blocage, historique) — rôles en route
  app.use("/api/conformite", requireAuth, conformiteRouter);
  // Gestion des Garanties marchés
  app.use("/api/garanties", requireAuth, checkModuleAccess("garanties"), garantiesRouter);
  // Gestion des Réceptions OPR / Provisoire / Définitive
  app.use("/api/receptions", requireAuth, checkModuleAccess("receptions"), receptionsRouter);
  // ─── Modules restaurés le 17/08/2026 ─────────────────────────────────────────
  // Présents dans la source mais non montés dans l'import du 13/08 (features 404).
  app.use("/api/delegations", requireAuth, checkModuleAccess("delegations"), delegationsRouter);
  // export : transversal (lecture multi-modules), authentification seule
  app.use("/api/export", requireAuth, exportRouter);
  app.use("/api/export", rapportBailleurRouter);
  // Le dossier complet est monté AVANT les documents unitaires : les deux
  // partagent le préfixe /decompte/:id, et le premier routeur qui répond gagne.
  app.use("/api/documents", dossierDecompteRouter);
  app.use("/api/documents", dossierMarcheRouter);
  app.use("/api/documents", documentsOfficielsRouter);
  // portail entreprise : rôle contrôlé en routeur (entrepriseOnly)
  app.use("/api/portail", portailRouter);
  app.use("/api/revision", requireAuth, checkModuleAccess("revision"), revisionRouter);
  // recherche globale : authentification + périmètre d'affectation vérifiés en handler
  app.use("/api/search", searchRouter);
  // Pièces jointes : dépôt authentifié + téléchargement par URL signée éphémère (P0-2)
  app.use("/api/uploads", uploadsRouter);

  // Financements — monté à la RACINE /api car ses chemins sont de premier
  // niveau (/fundings, /funding-documents, /funding-envelopes), ce qu'appelle
  // le frontend. Un montage sous /api/funding donnait /api/funding/fundings et
  // la page tombait en 404.
  // ⚠️ DOIT rester le DERNIER montage /api : son requireAuth interne s'applique
  // à toute requête qui l'atteint. Placé plus haut, il renvoyait 401 sur
  // /api/uploads/files/… et cassait les liens signés (qui n'ont pas d'en-tête
  // Authorization, par conception).
  app.use("/api", fundingRouter);
  // Résumé public agrégé pour l'intégration SharePoint (SIGTIR) — lecture seule, sans auth.
  // N'expose que des agrégats et quelques décomptes récents (déjà consultable via /api/public/marche/:numContrat).
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

  // Audit log endpoint — filtres optionnels (action, entité, utilisateur, période)
  // Revue 20/08/2026 : aucune restriction de rôle — tout compte authentifié
  // (ENTREPRISE inclus) lisait le journal complet (emails, userId, entités).
  // Rôles alignés sur la déclaration du catalogue (modules.catalog.ts : audit).
  app.get("/api/audit", requireAuth, checkModuleAccess("audit"), requireRole("ADMIN","DG","DAF","DMC","AUDITEUR"), async (req, res, next) => {
    try {
      const where: Record<string, unknown> = {};
      if (req.query.action)     where.action     = String(req.query.action);
      if (req.query.entityType) where.entityType = String(req.query.entityType);
      if (req.query.entityId)   where.entityId   = String(req.query.entityId);
      if (req.query.userId)     where.userId     = String(req.query.userId);
      if (req.query.du || req.query.au) {
        where.createdAt = {
          ...(req.query.du ? { gte: new Date(String(req.query.du)) } : {}),
          ...(req.query.au ? { lte: new Date(`${String(req.query.au)}T23:59:59.999Z`) } : {}),
        };
      }
      const take = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
      const logs = await prisma.auditLog.findMany({
        where,
        include: { user: { select: { nomComplet: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take,
      });
      res.json(logs);
    } catch (err) { next(err); }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
