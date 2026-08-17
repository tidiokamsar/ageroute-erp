/**
 * ⚠️ MODULE HORS SERVICE — exclu de la compilation (voir backend/tsconfig.json).
 *
 * Ce routeur n'est PAS monté dans app.ts et il est incompatible avec l'état
 * actuel du code : il importe `middleware/auth` (inexistant — l'authentification
 * est dans `middleware/auth.middleware.ts`) et interroge le schéma Prisma avec
 * des champs/relations qui n'existent plus (`marche.attachements`,
 * `montantHtGnf`, filtre `marcheId` sur Attachement).
 *
 * Il provient d'une version antérieure de la source. Sa restauration (portail
 * entreprise) est une décision d'équipe : il faut le réécrire contre le schéma
 * actuel puis le monter dans app.ts. Le frontend (PortailEntreprisePage.tsx)
 * appelle ces endpoints — ils répondent 404 tant que ce module n'est pas remis
 * en service.
 */
import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate } from "../../middleware/auth";
import { notifyNextStep } from "../../lib/mailer";

export const portailRouter = Router();
portailRouter.use(authenticate);

// Middleware : seuls les ENTREPRISE (et ADMIN) peuvent accéder au portail
function entrepriseOnly(req: Request, res: Response, next: Function) {
  if (!["ENTREPRISE", "ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ error: "Accès réservé aux comptes entreprise" });
  }
  next();
}

// ─── Résoudre l'entreprise de l'utilisateur connecté ──────────────────────────
async function getEntrepriseId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { entrepriseId: true } });
  return user?.entrepriseId ?? null;
}

// ─── GET /api/portail/profil — infos de mon entreprise ────────────────────────
portailRouter.get("/profil", entrepriseOnly, async (req, res) => {
  try {
    const entrepriseId = await getEntrepriseId(req.user!.id);
    if (!entrepriseId) return res.status(404).json({ error: "Aucune entreprise liée à ce compte" });

    const entreprise = await prisma.entreprise.findUnique({
      where: { id: entrepriseId },
      include: {
        contacts: { where: { principal: true }, take: 1 },
        alertes: { where: { acquittee: false } },
      },
    });
    if (!entreprise) return res.status(404).json({ error: "Entreprise introuvable" });
    res.json(entreprise);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/portail/mes-marches — marchés de mon entreprise ─────────────────
portailRouter.get("/mes-marches", entrepriseOnly, async (req, res) => {
  try {
    const entrepriseId = await getEntrepriseId(req.user!.id);
    if (!entrepriseId) return res.status(404).json({ error: "Aucune entreprise liée" });

    const marches = await prisma.marche.findMany({
      where: { entrepriseId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { decomptes: true, attachements: true } },
        projet: { select: { code: true, intitule: true, region: true } },
      },
    });
    res.json(marches);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/portail/mes-decomptes — décomptes de mon entreprise ─────────────
portailRouter.get("/mes-decomptes", entrepriseOnly, async (req, res) => {
  try {
    const entrepriseId = await getEntrepriseId(req.user!.id);
    if (!entrepriseId) return res.status(404).json({ error: "Aucune entreprise liée" });

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

    const result = decomptes.map(d => ({ ...d, bpmn: bpmnMap[d.id] ?? null }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/portail/suivi/:decompteId — état BPMN d'un décompte ─────────────
portailRouter.get("/suivi/:decompteId", entrepriseOnly, async (req, res) => {
  try {
    const entrepriseId = await getEntrepriseId(req.user!.id);
    if (!entrepriseId) return res.status(404).json({ error: "Aucune entreprise liée" });

    const decompte = await prisma.decompte.findFirst({
      where: { id: req.params.decompteId, entrepriseId },
      include: { marche: { select: { reference: true, intitule: true } } },
    });
    if (!decompte) return res.status(404).json({ error: "Décompte introuvable" });

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
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/portail/deposer-decompte — soumettre un décompte ───────────────
portailRouter.post("/deposer-decompte", entrepriseOnly, async (req, res) => {
  try {
    const entrepriseId = await getEntrepriseId(req.user!.id);
    if (!entrepriseId) return res.status(404).json({ error: "Aucune entreprise liée" });

    const { marcheId, type, numero, observations, lignes } = req.body;
    if (!marcheId || !type) return res.status(400).json({ error: "marcheId et type sont requis" });

    // Vérifier que le marché appartient à cette entreprise
    const marche = await prisma.marche.findFirst({
      where: { id: marcheId, entrepriseId, deletedAt: null },
    });
    if (!marche) return res.status(403).json({ error: "Marché non trouvé ou non accessible" });

    // Compter les décomptes existants pour générer la référence
    const nbExistants = await prisma.decompte.count({ where: { marcheId } });
    const numStr = String(nbExistants + 1).padStart(2, "0");
    const typeCode = type === "PARTIEL" ? "DP" : type === "DEFINITIF" ? "DD" : type === "AVANCE" ? "DA" : "DR";
    const reference = `${marche.reference}-${typeCode}-${numStr}`;

    // Calculer les montants depuis les lignes si fournies
    let montantHtGnf = BigInt(req.body.montantHtGnf ?? 0);
    let montantTtcGnf = BigInt(req.body.montantTtcGnf ?? 0);
    let montantNetGnf = BigInt(req.body.netAPayer ?? 0);

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

    // Créer le décompte
    const decompte = await prisma.decompte.create({
      data: {
        reference,
        type: type as any,
        statut: "SOUMIS" as any,
        marcheId,
        entrepriseId,
        observations,
        montantHtGnf,
        montantTtcGnf,
        netAPayer: montantNetGnf,
      },
    });

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
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/portail/mes-attachements — attachements de mon entreprise ────────
portailRouter.get("/mes-attachements", entrepriseOnly, async (req, res) => {
  try {
    const entrepriseId = await getEntrepriseId(req.user!.id);
    if (!entrepriseId) return res.status(404).json({ error: "Aucune entreprise liée" });

    const marches = await prisma.marche.findMany({
      where: { entrepriseId, deletedAt: null },
      select: { id: true },
    });
    const marcheIds = marches.map(m => m.id);

    const attachements = await prisma.attachement.findMany({
      where: { marcheId: { in: marcheIds }, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { marche: { select: { reference: true, intitule: true } } },
    });
    res.json(attachements);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
