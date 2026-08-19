/**
 * Moteur Workflow BPMN — AGEROUTE ERP
 * §7 CDC Décomptes : MISSION → TECHNIQUE → DMC → DAF → DG → [FER/BUDGET/TRESOR]
 * 6 décisions : APPROUVE | REJETE | DEMANDE_CORRECTION | DEMANDE_COMPLEMENT | SUSPENDRE | AUDIT
 * DG/ADMIN : visibilité sur TOUTES les instances en cours (rôle superviseur)
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { requireAuth } from "../../middleware/auth.middleware";
import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import { notifyWorkflowStep } from "../notifications/notifications.service";
import { assertEntrepriseConforme } from "../conformite/conformite.service";
import { rolesEffectifs } from "../../lib/delegations";
import { roleAutorise } from "../../lib/roles-circuit";
import { chargerRegles } from "../../lib/regles";
import { etapesCircuitFinancier } from "../../lib/circuit-definitions";
import { z } from "zod";

export const workflowRouter = Router();
workflowRouter.use(requireAuth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DECISIONS = ["APPROUVE","REJETE","DEMANDE_CORRECTION","DEMANDE_COMPLEMENT","SUSPENDRE","AUDIT"] as const;
type Decision = typeof DECISIONS[number];

const ROLES_SUPERVISEURS = ["DG","ADMIN"];

const includeInstance = {
  definition: { include: { etapes: { orderBy: { ordre: "asc" as const } } } },
  actions: {
    include: {
      user: { select: { id: true, nomComplet: true, role: true, email: true } },
      etape: { select: { id: true, nom: true, ordre: true, roleRequis: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  decompte: {
    include: {
      marche: { select: { id: true, reference: true, intitule: true, financement: true } },
      entreprise: { select: { id: true, raisonSociale: true } },
    },
  },
};

// ─── Soumettre un décompte au workflow ────────────────────────────────────────
workflowRouter.post("/soumettre/:decompteId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const decompte = await prisma.decompte.findFirst({
      where: { id: req.params.decompteId, deletedAt: null },
      include: { marche: true, entreprise: true },
    });
    if (!decompte) throw new ApiError(404, "Décompte introuvable");
    if (decompte.statut !== "BROUILLON") throw new ApiError(400, "Seul un décompte BROUILLON peut être soumis");

    await assertEntrepriseConforme(decompte.entrepriseId);
    if (decompte.marche.statut !== "ACTIF") throw new ApiError(400, "Le marché n'est pas actif");

    // F5 — au moins un attachement pour ce marché (validé ou en cours)
    const attExistant = await prisma.attachement.count({
      where: { decompte: { marcheId: decompte.marcheId, deletedAt: null } },
    });
    if (attExistant === 0) {
      throw new ApiError(400, "Aucun attachement pour ce marché — le décompte ne peut pas être soumis");
    }

    const pieces = decompte.piecesObligatoires as Record<string, boolean> | null;
    if (pieces) {
      const manquantes = Object.entries({
        decompteSigné: "Décompte signé", attachements: "Attachements",
        facture: "Facture", rapportAvancement: "Rapport d'avancement",
        photosChantier: "Photos de chantier",
      }).filter(([k]) => !pieces[k]).map(([, v]) => v);
      if (manquantes.length) throw new ApiError(400, `Pièces manquantes : ${manquantes.join(", ")}`);
    }

    const wfDef = await prisma.workflowDefinition.findFirst({
      where: { financement: decompte.marche.financement, actif: true },
      include: { etapes: { orderBy: { ordre: "asc" } } },
    });
    if (!wfDef) throw new ApiError(400, `Aucun circuit défini pour ${decompte.marche.financement}`);

    const existingInstance = await prisma.workflowInstance.findFirst({ where: { decompteId: decompte.id } });
    if (existingInstance) throw new ApiError(409, "Une instance de workflow existe déjà pour ce décompte");

    const instance = await prisma.workflowInstance.create({
      data: { definitionId: wfDef.id, decompteId: decompte.id, etapeActuelle: 0, statut: "EN_COURS" },
    });
    await prisma.decompte.update({ where: { id: decompte.id }, data: { statut: "DEPOSE" } });
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "Decompte", entityId: decompte.id, after: { statut: "DEPOSE", wfInstanceId: instance.id } });

    if (wfDef.etapes.length > 0) {
      await notifyWorkflowStep(wfDef.etapes[0], decompte.reference, instance.id).catch(() => {});
    }
    res.json({ instance, message: `Décompte soumis — circuit "${wfDef.nom}" démarré (${wfDef.etapes.length} étapes)` });
  } catch (err) { next(err); }
});

// ─── Action sur une étape ─────────────────────────────────────────────────────
workflowRouter.post("/:instanceId/action", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");

    const { decision, commentaire } = z.object({
      decision: z.enum(DECISIONS),
      commentaire: z.string().optional(),
    }).parse(req.body);

    if (decision !== "APPROUVE" && (!commentaire || commentaire.trim().length < 5)) {
      throw new ApiError(400, `Commentaire motivé obligatoire pour "${decision}" (min 5 caractères)`);
    }

    const instance = await prisma.workflowInstance.findFirst({
      where: { id: req.params.instanceId, statut: "EN_COURS" },
      include: {
        definition: { include: { etapes: { orderBy: { ordre: "asc" } } } },
        decompte: true,
      },
    });
    if (!instance) throw new ApiError(404, "Instance introuvable ou déjà terminée");

    const etapeCourante = instance.definition.etapes[instance.etapeActuelle];
    if (!etapeCourante) throw new ApiError(400, "Aucune étape courante trouvée");

    // Rôles effectifs : rôle propre + rôles délégués actifs (délégation d'intérim)
    const mesRoles = await rolesEffectifs(req.user.id, req.user.role);
    const isAdmin  = req.user.role === "ADMIN";
    const isSuperv = isAdmin || mesRoles.includes("DG");

    // Superviseurs (DG/ADMIN) peuvent SUSPENDRE/AUDIT sur toute étape
    if (["SUSPENDRE","AUDIT"].includes(decision) && !isSuperv) {
      throw new ApiError(403, "Seule la Direction Générale peut suspendre ou demander un audit");
    }
    // Pour APPROUVE/REJETE/CORRECTION/COMPLEMENT : vérifier le rôle de l'étape
    if (!["SUSPENDRE","AUDIT"].includes(decision) && !isAdmin && !mesRoles.includes(etapeCourante.roleRequis)) {
      throw new ApiError(403, `Étape "${etapeCourante.nom}" réservée au rôle ${etapeCourante.roleRequis} (vous êtes ${req.user.role})`);
    }

    // NOTE L2.1 : la matrice WF_ROLES_LIQUIDATION ne bloque PAS la validation
    // d'étape — le rôle d'étape (roleRequis) CI-DESSUS est l'autorisation.
    // La matrice s'applique uniquement à la création/modification de décomptes.

    // Un traitement suspendu bloque toute décision, sauf levée par la DG/ADMIN
    if (instance.decompte?.traitementSuspendu && !isSuperv) {
      throw new ApiError(403, "Traitement suspendu par la Direction Générale — aucune action possible");
    }

    // Enregistrer l'action
    await prisma.workflowAction.create({
      data: { instanceId: instance.id, etapeId: etapeCourante.id, userId: req.user.id, decision, commentaire },
    });
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "WorkflowInstance", entityId: instance.id, after: { decision, etape: etapeCourante.nom, commentaire } });

    // ── Traitement selon la décision ──────────────────────────────────────────

    if (decision === "REJETE") {
      await prisma.workflowInstance.update({ where: { id: instance.id }, data: { statut: "REJETE" } });
      await prisma.decompte.update({ where: { id: instance.decompteId! }, data: { statut: "REJETE" } });
      return res.json({ statut: "REJETE", message: `Décompte rejeté à l'étape "${etapeCourante.nom}"` });
    }

    if (decision === "DEMANDE_CORRECTION") {
      await prisma.decompte.update({ where: { id: instance.decompteId! }, data: { statut: "REJETE" } });
      return res.json({ statut: "CORRECTION_REQUISE", message: `Correction demandée par ${etapeCourante.nom} : ${commentaire}` });
    }

    if (decision === "DEMANDE_COMPLEMENT") {
      await prisma.decompte.update({ where: { id: instance.decompteId! }, data: { statut: "EN_VALIDATION" } });
      return res.json({ statut: "COMPLEMENT_REQUIS", message: `Complément demandé : ${commentaire}` });
    }

    if (decision === "SUSPENDRE") {
      await prisma.decompte.update({ where: { id: instance.decompteId! }, data: { traitementSuspendu: true } });
      return res.json({ statut: "SUSPENDU", message: `Traitement suspendu par la DG : ${commentaire}` });
    }

    if (decision === "AUDIT") {
      await prisma.decompte.update({ where: { id: instance.decompteId! }, data: { auditRequis: true } });
      return res.json({ statut: "AUDIT_REQUIS", message: `Audit complémentaire demandé : ${commentaire}` });
    }

    // APPROUVE → passer à l'étape suivante
    const prochainIndex = instance.etapeActuelle + 1;
    if (prochainIndex >= instance.definition.etapes.length) {
      // Fin du circuit : VALIDE_DG puis circuit financier
      await prisma.workflowInstance.update({ where: { id: instance.id }, data: { statut: "APPROUVE", etapeActuelle: prochainIndex } });
      await prisma.decompte.update({ where: { id: instance.decompteId! }, data: { statut: "VALIDE_DG" } });
      // Déclencher circuit financier automatiquement
      try {
        const dec = await prisma.decompte.findUnique({ where: { id: instance.decompteId! }, include: { marche: true } });
        if (dec && !await prisma.circuitFinancier.findUnique({ where: { decompteId: dec.id } })) {
          const fin = dec.marche.financement;
          const typeCircuit = fin === "FER" ? "FER" : fin === "BUDGET_NATIONAL" ? "BUDGET" : "BAILLEUR";
          const etapesDefs = etapesCircuitFinancier(fin).map(e => ({ordre: e.ordre, nom: e.nom, roleOuService: e.roleOuService}));
          await prisma.circuitFinancier.create({ data: { decompteId: dec.id, type: typeCircuit, bailleurNom: dec.marche.bailleur ?? undefined, etapes: { create: etapesDefs } } });
          await prisma.decompte.update({ where: { id: dec.id }, data: { statut: "EN_CIRCUIT_FINANCIER" } });
        }
      } catch (_) { /* non bloquant */ }
      return res.json({ statut: "VALIDE_DG", message: "Décompte validé par la Direction Générale — circuit financier déclenché" });
    }

    // Avancer à l'étape suivante
    await prisma.workflowInstance.update({ where: { id: instance.id }, data: { etapeActuelle: prochainIndex } });
    const prochaineEtape = instance.definition.etapes[prochainIndex];

    let prochainStatut = "EN_VALIDATION";
    if (["MISSION","TECHNIQUE"].includes(prochaineEtape.roleRequis)) prochainStatut = "EN_CONTROLE";
    else if (prochaineEtape.roleRequis === "DG") prochainStatut = "EN_VALIDATION";
    await prisma.decompte.update({ where: { id: instance.decompteId! }, data: { statut: prochainStatut as never } });

    await notifyWorkflowStep(prochaineEtape, instance.decompte?.reference ?? "", instance.id).catch(() => {});

    res.json({ statut: prochainStatut, etapeActuelle: prochainIndex, prochaineEtape: prochaineEtape.nom, roleRequis: prochaineEtape.roleRequis });
  } catch (err) { next(err); }
});

// ─── Lever suspension ─────────────────────────────────────────────────────────
workflowRouter.post("/:instanceId/lever-suspension", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    if (!ROLES_SUPERVISEURS.includes(req.user.role)) throw new ApiError(403, "Réservé à la DG/ADMIN");
    const instance = await prisma.workflowInstance.findUnique({ where: { id: req.params.instanceId } });
    if (!instance) throw new ApiError(404, "Instance introuvable");
    await prisma.decompte.update({ where: { id: instance.decompteId! }, data: { traitementSuspendu: false } });
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "Decompte", entityId: instance.decompteId!, after: { traitementSuspendu: false } });
    res.json({ message: "Suspension levée" });
  } catch (err) { next(err); }
});

// ─── Mes tâches (+ superviseurs DG/ADMIN voient tout) ────────────────────────
workflowRouter.get("/mes-taches", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const isSuperv = (await rolesEffectifs(req.user.id, req.user.role)).includes("DG") || req.user.role === "ADMIN";

    const instances = await prisma.workflowInstance.findMany({
      where: { statut: "EN_COURS" as const },
      include: includeInstance,
      orderBy: { createdAt: "asc" },
    });

    // Pour non-superviseurs : filtrer sur l'étape courante qui leur appartient
    // (rôle propre ou rôle délégué actif)
    const mesRoles = isSuperv ? [] : await rolesEffectifs(req.user.id, req.user.role);
    const taches = isSuperv
      ? instances
      : instances.filter((inst) => {
          const etape = (inst as unknown as { definition: { etapes: Array<{ roleRequis: string }> } }).definition.etapes[inst.etapeActuelle];
          return etape && mesRoles.includes(etape.roleRequis);
        });

    // Enrichir avec metadata
    const enriched = taches.map((inst) => {
      const def = (inst as unknown as { definition: { etapes: Array<{ slaJours?: number; roleRequis: string; nom: string; ordre: number }> }; actions: Array<{ createdAt: Date }> });
      const etapeCourante = def.definition.etapes[inst.etapeActuelle];
      const derniereAction = def.actions[def.actions.length - 1];
      const debutEtape = derniereAction ? new Date(derniereAction.createdAt) : new Date(inst.createdAt);
      const joursEnCours = Math.floor((Date.now() - debutEtape.getTime()) / 86400000);
      const enRetardSla  = etapeCourante?.slaJours != null && joursEnCours > (etapeCourante.slaJours ?? 999);
      const peutAgir = isSuperv || (etapeCourante && mesRoles.includes(etapeCourante.roleRequis));
      return { ...inst, etapeCourante, joursEnCours, enRetardSla, peutAgir };
    });

    // ── Tâches du moteur BPMN générique (décomptes déposés via le portail
    //    entreprise) : mêmes règles de rôle, fusionnées dans la même liste.
    //    source:"BPMN" → le traitement se fait depuis la fiche décompte.
    try {
      interface LigneBpmn {
        id: string; entity_id: string; created_at: Date;
        step_nom: string | null; role_requis: string | null; sla_jours: number | null;
      }
      const lignes = isSuperv
        ? await prisma.$queryRaw<LigneBpmn[]>`
            SELECT bi.id, bi.entity_id, bi.created_at,
                   bs.nom AS step_nom, bs.role_requis, bs.sla_jours
            FROM bpmn_instances bi
            LEFT JOIN bpmn_steps bs ON bs.definition_id = bi.definition_id AND bs.ordre = bi.etape_actuelle + 1
            WHERE bi.statut = 'EN_COURS' AND bi.module_type = 'DECOMPTE'
            ORDER BY bi.created_at ASC`
        : await prisma.$queryRaw<LigneBpmn[]>`
            SELECT bi.id, bi.entity_id, bi.created_at,
                   bs.nom AS step_nom, bs.role_requis, bs.sla_jours
            FROM bpmn_instances bi
            JOIN bpmn_steps bs ON bs.definition_id = bi.definition_id AND bs.ordre = bi.etape_actuelle + 1
            WHERE bi.statut = 'EN_COURS' AND bi.module_type = 'DECOMPTE'
              AND bs.role_requis IN (${Prisma.join(mesRoles)})
              AND COALESCE(bs.is_system, false) = false
            ORDER BY bi.created_at ASC`;

      if (lignes.length > 0) {
        const decomptes = await prisma.decompte.findMany({
          where: { id: { in: lignes.map((l) => l.entity_id) } },
          select: {
            id: true, reference: true, statut: true, createdAt: true,
            marche: { select: { reference: true, intitule: true, financement: true } },
            entreprise: { select: { raisonSociale: true } },
          },
        });
        const parId = new Map(decomptes.map((d) => [d.id, d]));
        for (const l of lignes) {
          const d = parId.get(l.entity_id);
          if (!d) continue;
          const jours = Math.floor((Date.now() - new Date(l.created_at).getTime()) / 86400000);
          enriched.push({
            id: l.id,
            statut: "EN_COURS",
            source: "BPMN",
            createdAt: l.created_at,
            etapeCourante: { nom: l.step_nom ?? "—", roleRequis: l.role_requis ?? "", slaJours: l.sla_jours ?? undefined },
            definition: { financement: d.marche.financement, nom: "Circuit BPMN" },
            decompte: { id: d.id, reference: d.reference, statut: d.statut, marche: d.marche, entreprise: d.entreprise },
            actions: [],
            joursEnCours: jours,
            enRetardSla: l.sla_jours != null && jours > l.sla_jours,
            peutAgir: false, // traitement via la fiche décompte (BpmnPanel)
          } as never);
        }
      }
    } catch { /* tables bpmn absentes : environnement vierge */ }

    res.json(enriched);
  } catch (err) { next(err); }
});

// ─── Vue globale superviseur (toutes les instances) ───────────────────────────
workflowRouter.get("/supervision", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    if (!ROLES_SUPERVISEURS.includes(req.user.role)) throw new ApiError(403, "Réservé à la DG/ADMIN");

    const [enCours, approuves, rejetes, total] = await Promise.all([
      prisma.workflowInstance.count({ where: { statut: "EN_COURS" } }),
      prisma.workflowInstance.count({ where: { statut: "APPROUVE" } }),
      prisma.workflowInstance.count({ where: { statut: "REJETE" } }),
      prisma.workflowInstance.count(),
    ]);

    const parEtape = await prisma.$queryRaw`
      SELECT we.nom, we."roleRequis", COUNT(wi.id)::int as nb
      FROM workflow_instances wi
      JOIN workflow_etapes we ON we."definitionId" = wi."definitionId"
        AND we.ordre = wi."etapeActuelle" + 1
      WHERE wi.statut = 'EN_COURS'
      GROUP BY we.nom, we."roleRequis"
      ORDER BY nb DESC
    `;

    res.json({ enCours, approuves, rejetes, total, parEtape });
  } catch (err) { next(err); }
});

// ─── Instance par ID ──────────────────────────────────────────────────────────
workflowRouter.get("/instance/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.workflowInstance.findUnique({
      where: { id: req.params.id },
      include: includeInstance,
    });
    if (!instance) throw new ApiError(404, "Instance introuvable");
    res.json(instance);
  } catch (err) { next(err); }
});

// ─── Instance par décompte ────────────────────────────────────────────────────
workflowRouter.get("/decompte/:decompteId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.workflowInstance.findFirst({
      where: { decompteId: req.params.decompteId },
      include: includeInstance,
      orderBy: { createdAt: "desc" },
    });
    res.json(instance ?? null);
  } catch (err) { next(err); }
});

// ─── Définitions de workflow ──────────────────────────────────────────────────
workflowRouter.get("/definitions", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const defs = await prisma.workflowDefinition.findMany({
      include: { etapes: { orderBy: { ordre: "asc" } } },
      orderBy: { nom: "asc" },
    });
    res.json(defs);
  } catch (err) { next(err); }
});

// ─── Audit trail d'une instance ───────────────────────────────────────────────
workflowRouter.get("/:instanceId/audit", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actions = await prisma.workflowAction.findMany({
      where: { instanceId: req.params.instanceId },
      include: {
        user:  { select: { nomComplet: true, role: true, email: true } },
        etape: { select: { nom: true, ordre: true, roleRequis: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    res.json(actions);
  } catch (err) { next(err); }
});
