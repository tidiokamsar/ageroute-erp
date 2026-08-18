/**
 * Portail Entreprise — accès en libre-service pour les comptes ENTREPRISE.
 * Réécrit contre le schéma Prisma actuel le 17/08/2026 (l'ancienne version
 * provenait d'un état antérieur de la source : middleware/auth inexistant,
 * champs marche.attachements / montantHtGnf / filtre marcheId obsolètes).
 * Endpoints alignés sur la consommation réelle du frontend
 * (PortailEntreprisePage.tsx) : profil, mes-marches, mes-decomptes,
 * mes-garanties, mes-paiements, mes-receptions, suivi, deposer-decompte.
 */
import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { ApiError } from "../../middleware/error.middleware";
import { logAudit } from "../../lib/audit";
import { notifyNextStep } from "../../lib/mailer";

export const portailRouter = Router();
portailRouter.use(requireAuth);

// Seuls les ENTREPRISE (et ADMIN pour le support) peuvent accéder au portail
function entrepriseOnly(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Authentification requise" });
  if (!["ENTREPRISE", "ADMIN"].includes(req.user.role)) {
    return res.status(403).json({ error: "Accès réservé aux comptes entreprise" });
  }
  next();
}

function wrap(handler: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try { await handler(req, res); } catch (err) { next(err); }
  };
}

// ─── Résoudre l'entreprise de l'utilisateur connecté ──────────────────────────
async function getEntrepriseId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { entrepriseId: true } });
  return user?.entrepriseId ?? null;
}

// ─── GET /api/portail/profil — infos de mon entreprise ────────────────────────
portailRouter.get("/profil", entrepriseOnly, wrap(async (req, res) => {
  const entrepriseId = await getEntrepriseId(req.user!.id);
  if (!entrepriseId) throw new ApiError(404, "Aucune entreprise liée à ce compte");

  const entreprise = await prisma.entreprise.findUnique({
    where: { id: entrepriseId },
    include: {
      contacts: { where: { principal: true }, take: 1 },
      alertes: { where: { acquittee: false } },
    },
  });
  if (!entreprise) throw new ApiError(404, "Entreprise introuvable");
  res.json(entreprise);
}));

// ─── GET /api/portail/mes-marches — marchés de mon entreprise ─────────────────
portailRouter.get("/mes-marches", entrepriseOnly, wrap(async (req, res) => {
  const entrepriseId = await getEntrepriseId(req.user!.id);
  if (!entrepriseId) throw new ApiError(404, "Aucune entreprise liée");

  const marches = await prisma.marche.findMany({
    where: { entrepriseId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { decomptes: true } },
      projet: { select: { code: true, intitule: true, region: true } },
    },
  });
  res.json(marches);
}));

// ─── GET /api/portail/mes-decomptes — décomptes de mon entreprise (+ BPMN) ────
portailRouter.get("/mes-decomptes", entrepriseOnly, wrap(async (req, res) => {
  const entrepriseId = await getEntrepriseId(req.user!.id);
  if (!entrepriseId) throw new ApiError(404, "Aucune entreprise liée");

  const decomptes = await prisma.decompte.findMany({
    where: { entrepriseId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      marche: { select: { reference: true, intitule: true, montantInitialGnf: true } },
    },
  });

  // Enrichir avec l'état BPMN pour chaque décompte
  const ids = decomptes.map(d => d.id);
  let bpmnMap: Record<string, { statut: string; etape: number; stepNom?: string }> = {};
  if (ids.length > 0) {
    const instances = await prisma.$queryRaw<Array<{ entity_id: string; statut: string; etape_actuelle: number; step_nom: string | null }>>`
      SELECT bi.entity_id, bi.statut, bi.etape_actuelle,
             bs.nom AS step_nom
      FROM bpmn_instances bi
      LEFT JOIN bpmn_steps bs ON bs.definition_id = bi.definition_id AND bs.ordre = bi.etape_actuelle
      WHERE bi.module_type = 'DECOMPTE' AND bi.entity_id = ANY(${ids}::text[])
    `;
    for (const row of instances) {
      bpmnMap[row.entity_id] = { statut: row.statut, etape: row.etape_actuelle, stepNom: row.step_nom ?? undefined };
    }
  }

  res.json(decomptes.map(d => ({ ...d, bpmn: bpmnMap[d.id] ?? null })));
}));

// ─── GET /api/portail/mes-garanties — cautions de mes marchés ─────────────────
portailRouter.get("/mes-garanties", entrepriseOnly, wrap(async (req, res) => {
  const entrepriseId = await getEntrepriseId(req.user!.id);
  if (!entrepriseId) throw new ApiError(404, "Aucune entreprise liée");

  const garanties = await prisma.garantie.findMany({
    where: { marche: { entrepriseId, deletedAt: null } },
    orderBy: { createdAt: "desc" },
    include: { marche: { select: { reference: true, intitule: true } } },
  });
  res.json(garanties);
}));

// ─── GET /api/portail/mes-paiements — paiements de mes décomptes ──────────────
portailRouter.get("/mes-paiements", entrepriseOnly, wrap(async (req, res) => {
  const entrepriseId = await getEntrepriseId(req.user!.id);
  if (!entrepriseId) throw new ApiError(404, "Aucune entreprise liée");

  const paiements = await prisma.paiement.findMany({
    where: { deletedAt: null, decompte: { entrepriseId, deletedAt: null } },
    orderBy: { createdAt: "desc" },
    include: { decompte: { select: { reference: true, marche: { select: { reference: true } } } } },
  });
  res.json(paiements);
}));

// ─── GET /api/portail/mes-receptions — PV de réception de mes marchés ─────────
portailRouter.get("/mes-receptions", entrepriseOnly, wrap(async (req, res) => {
  const entrepriseId = await getEntrepriseId(req.user!.id);
  if (!entrepriseId) throw new ApiError(404, "Aucune entreprise liée");

  const receptions = await prisma.reception.findMany({
    where: { marche: { entrepriseId, deletedAt: null } },
    orderBy: { createdAt: "desc" },
    include: { marche: { select: { reference: true, intitule: true } } },
  });
  res.json(receptions);
}));

// ─── GET /api/portail/suivi/:decompteId — état BPMN d'un décompte ─────────────
portailRouter.get("/suivi/:decompteId", entrepriseOnly, wrap(async (req, res) => {
  const entrepriseId = await getEntrepriseId(req.user!.id);
  if (!entrepriseId) throw new ApiError(404, "Aucune entreprise liée");

  const decompte = await prisma.decompte.findFirst({
    where: { id: req.params.decompteId, entrepriseId, deletedAt: null },
    include: { marche: { select: { reference: true, intitule: true } } },
  });
  if (!decompte) throw new ApiError(404, "Décompte introuvable");

  const rows = await prisma.$queryRaw<Array<{
    id: string; statut: string; etape_actuelle: number;
    step_nom: string | null; step_role: string | null; sla_jours: number | null; total_etapes: number;
  }>>`
    SELECT bi.id, bi.statut, bi.etape_actuelle,
           bs.nom AS step_nom, bs.role_requis AS step_role, bs.sla_jours,
           (SELECT COUNT(*) FROM bpmn_steps WHERE definition_id = bi.definition_id)::int AS total_etapes
    FROM bpmn_instances bi
    LEFT JOIN bpmn_steps bs ON bs.definition_id = bi.definition_id AND bs.ordre = bi.etape_actuelle
    WHERE bi.module_type = 'DECOMPTE' AND bi.entity_id = ${decompte.id}
  `;
  const instance = rows[0] ?? null;

  // Toutes les étapes
  const steps = instance ? await prisma.$queryRaw<Array<{
    ordre: number; nom: string; type: string; role_requis: string | null; sla_jours: number; is_system: boolean;
  }>>`SELECT ordre, nom, type, role_requis, sla_jours, is_system FROM bpmn_steps
      WHERE definition_id = (SELECT definition_id FROM bpmn_instances WHERE id = ${instance.id})
      ORDER BY ordre` : [];

  // Journal des actions
  const actions = instance ? await prisma.$queryRaw<Array<{
    decision: string; commentaire: string; created_at: Date;
    decideur_nom: string | null; step_nom: string | null;
  }>>`
    SELECT ba.decision, ba.commentaire, ba.created_at,
           u.nom_complet AS decideur_nom, bs.nom AS step_nom
    FROM bpmn_actions ba
    JOIN bpmn_instances bi ON bi.id = ba.instance_id
    JOIN bpmn_steps bs ON bs.id = ba.step_id
    LEFT JOIN users u ON u.id = ba.decideur_id
    WHERE ba.instance_id = ${instance.id}
    ORDER BY ba.created_at ASC
  ` : [];

  res.json({ decompte, instance, steps, actions });
}));

// ─── POST /api/portail/deposer-decompte — soumettre un décompte ───────────────
portailRouter.post("/deposer-decompte", entrepriseOnly, wrap(async (req, res) => {
  const entrepriseId = await getEntrepriseId(req.user!.id);
  if (!entrepriseId) throw new ApiError(404, "Aucune entreprise liée");

  const { marcheId, type, numero, observations, lignes } = req.body;
  if (!marcheId || !type) throw new ApiError(400, "marcheId et type sont requis");

  // Le marché doit appartenir à cette entreprise et être actif
  const marche = await prisma.marche.findFirst({
    where: { id: marcheId, entrepriseId, deletedAt: null },
  });
  if (!marche) throw new ApiError(403, "Marché non trouvé ou non accessible");
  if (marche.statut !== "ACTIF") throw new ApiError(400, `Dépôt impossible : marché "${marche.statut}"`);

  // Mêmes règles bloquantes que la route interne (§5 CDC) : conformité obligatoire
  const { checkEligibilite } = await import("../entreprises/entreprises.service");
  const { eligible, raisons } = await checkEligibilite(entrepriseId);
  if (!eligible) throw new ApiError(403, `Dépôt bloqué — ${raisons.join(" ; ")}`);

  // Référence à partir du nombre de décomptes existants du marché
  const nbExistants = await prisma.decompte.count({ where: { marcheId } });
  const numStr = String(nbExistants + 1).padStart(2, "0");
  const typeCode = type === "PARTIEL" ? "DP" : type === "FINAL" ? "DF" : type === "AVANCE" ? "DA" : "DI";
  const reference = `${marche.reference}-${typeCode}-${numStr}`;

  // Montants depuis les lignes si fournies (sinon valeurs transmises)
  let montantHtGnf = BigInt((req.body.montantHtGnf ?? 0) as string | number);
  let montantTtcGnf = BigInt((req.body.montantTtcGnf ?? 0) as string | number);
  let montantNetGnf = BigInt((req.body.netAPayer ?? 0) as string | number);

  if (lignes && Array.isArray(lignes) && lignes.length > 0) {
    const ht = lignes.reduce((s: number, l: { montantBrut?: number }) => s + (l.montantBrut ?? 0), 0);
    montantHtGnf = BigInt(Math.round(ht));
    const tva = Math.round(ht * 0.18);
    const armp = Math.round(ht * 0.006);
    const ttc = ht + tva + armp;
    const precompte = Math.round(ttc * 9 / 118);
    const rg = Math.round(ttc * 0.05);
    montantTtcGnf = BigInt(Math.round(ttc));
    montantNetGnf = BigInt(Math.round(ttc - precompte - rg - armp));
  }

  const decompte = await prisma.decompte.create({
    data: {
      reference,
      type: type as never,
      statut: "SOUMIS" as never,
      marcheId,
      entrepriseId,
      observations,
      montantPeriodeHtGnf: montantHtGnf,
      montantTtcGnf,
      netAPayer: montantNetGnf,
    },
  });
  await logAudit({ userId: req.user!.id, action: "CREATE", entityType: "Decompte", entityId: decompte.id, after: { via: "portail", reference } });

  // Lancer le circuit BPMN automatiquement
  const [defRows] = await prisma.$queryRaw<[{ id: string }]>`
    SELECT id FROM bpmn_definitions WHERE module_type = 'DECOMPTE' AND actif = TRUE LIMIT 1
  `;
  if (defRows?.id) {
    const instanceId = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO bpmn_instances (id, definition_id, module_type, entity_id, soumetteur_id)
      VALUES (${instanceId}, ${defRows.id}, 'DECOMPTE', ${decompte.id}, ${req.user!.id})
      ON CONFLICT (module_type, entity_id) DO NOTHING
    `;

    // Notifier les MISSION (première étape réelle après la vérification système)
    const missionEmails = await prisma.user.findMany({
      where: { role: "MISSION", actif: true },
      select: { email: true },
    });
    if (missionEmails.length > 0) {
      const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { nomComplet: true } });
      void notifyNextStep({
        to: missionEmails.map(u => u.email),
        moduleType: "DECOMPTE",
        entityRef: reference,
        stepNom: "Vérification mission contrôle",
        roleRequis: "MISSION",
        soumetteurNom: user?.nomComplet ?? req.user!.email,
        entityId: decompte.id,
      });
    }
  }

  res.status(201).json({ message: "Décompte déposé et circuit lancé", decompte });
}));

// ─── GET /api/portail/mes-attachements — attachements de mes marchés ──────────
// (les attachements sont rattachés aux décomptes, eux-mêmes rattachés aux marchés)
portailRouter.get("/mes-attachements", entrepriseOnly, wrap(async (req, res) => {
  const entrepriseId = await getEntrepriseId(req.user!.id);
  if (!entrepriseId) throw new ApiError(404, "Aucune entreprise liée");

  const attachements = await prisma.attachement.findMany({
    where: { decompte: { marche: { entrepriseId, deletedAt: null } } },
    orderBy: { createdAt: "desc" },
    include: { decompte: { select: { reference: true, marche: { select: { reference: true, intitule: true } } } } },
  });
  res.json(attachements);
}));
