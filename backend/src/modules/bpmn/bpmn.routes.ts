/**
 * Moteur BPMN générique — AGEROUTE ERP
 * 5 modules : PROJET | MARCHE | ATTACHEMENT | DECOMPTE | CONFORMITE
 * Utilise les tables bpmn_definitions / bpmn_steps / bpmn_instances / bpmn_actions
 * Compatible avec Prisma $queryRaw (tables hors schéma Prisma)
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { requireAuth } from "../../middleware/auth.middleware";
import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import { requireBpmnSubmissionScope } from "../../middleware/resourceAccess.middleware";
import { notifyNextStep, notifyDecision, notifyApprouve } from "../../lib/mailer";
import { rolesEffectifs } from "../../lib/delegations";
import { etapesCircuitFinancier } from "../../lib/circuit-definitions";
import { z } from "zod";
import { getMarchesAffectes } from "../../lib/affectations";
import { canAccessWorkflowResource, isHumanBpmnStep, type WorkflowResourceScope } from "../workflow/workflow.access";

export const bpmnRouter = Router();
bpmnRouter.use(requireAuth);

// ─── Types internes ───────────────────────────────────────────────────────────

interface BpmnDef { id: string; module_type: string; nom: string; description: string; version: number; actif: boolean; }
interface BpmnStep { id: string; definition_id: string; ordre: number; nom: string; type_tache: string; role_requis: string | null; description: string; sla_jours: number; is_optional: boolean; is_system: boolean; }
interface BpmnInstance { id: string; definition_id: string; module_type: string; entity_id: string; etape_actuelle: number; statut: string; suspended: boolean; audit_requis: boolean; created_at: Date; updated_at: Date; }
interface BpmnAction { id: string; instance_id: string; step_id: string; user_id: string | null; decision: string; commentaire: string | null; created_at: Date; }
type BpmnTask = BpmnInstance & { def_nom: string; step_nom: string; step_role: string | null; step_ordre: number; step_type: string; step_is_system: boolean; };

const DECISIONS = ["APPROUVE","REJETE","DEMANDE_CORRECTION","DEMANDE_COMPLEMENT","SUSPENDRE","AUDIT"] as const;
const ROLES_SUPERV = ["DG","ADMIN"];
const MODULES = ["PROJET","MARCHE","ATTACHEMENT","DECOMPTE","CONFORMITE"] as const;

// ─── Helpers queries raw ──────────────────────────────────────────────────────

async function getDefinition(moduleType: string): Promise<BpmnDef | null> {
  const rows = await prisma.$queryRaw<BpmnDef[]>`
    SELECT * FROM bpmn_definitions WHERE module_type = ${moduleType} AND actif = true LIMIT 1
  `;
  return rows[0] ?? null;
}

async function getSteps(definitionId: string): Promise<BpmnStep[]> {
  return prisma.$queryRaw<BpmnStep[]>`
    SELECT * FROM bpmn_steps WHERE definition_id = ${definitionId} ORDER BY ordre ASC
  `;
}

async function getInstance(moduleType: string, entityId: string): Promise<BpmnInstance | null> {
  const rows = await prisma.$queryRaw<BpmnInstance[]>`
    SELECT * FROM bpmn_instances WHERE module_type = ${moduleType} AND entity_id = ${entityId} LIMIT 1
  `;
  return rows[0] ?? null;
}

async function getInstanceById(id: string): Promise<BpmnInstance | null> {
  const rows = await prisma.$queryRaw<BpmnInstance[]>`SELECT * FROM bpmn_instances WHERE id = ${id} LIMIT 1`;
  return rows[0] ?? null;
}

async function getBpmnResourceScope(moduleType: string, entityId: string): Promise<WorkflowResourceScope | null> {
  if (moduleType === "MARCHE") {
    const marche = await prisma.marche.findFirst({
      where: { id: entityId, deletedAt: null },
      select: { id: true, entrepriseId: true },
    });
    return marche ? { entrepriseId: marche.entrepriseId, marcheIds: [marche.id] } : null;
  }

  if (moduleType === "DECOMPTE") {
    const decompte = await prisma.decompte.findFirst({
      where: { id: entityId, deletedAt: null, marche: { deletedAt: null } },
      select: { marcheId: true, entrepriseId: true },
    });
    return decompte ? { entrepriseId: decompte.entrepriseId, marcheIds: [decompte.marcheId] } : null;
  }

  if (moduleType === "ATTACHEMENT") {
    const attachement = await prisma.attachement.findFirst({
      where: { id: entityId, decompte: { deletedAt: null, marche: { deletedAt: null } } },
      select: { decompte: { select: { marcheId: true, entrepriseId: true } } },
    });
    return attachement
      ? { entrepriseId: attachement.decompte.entrepriseId, marcheIds: [attachement.decompte.marcheId] }
      : null;
  }

  if (moduleType === "PROJET") {
    const projet = await prisma.projet.findFirst({
      where: { id: entityId, deletedAt: null },
      select: {
        marches: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
    });
    return projet ? { entrepriseId: null, marcheIds: projet.marches.map((marche) => marche.id) } : null;
  }

  if (moduleType === "CONFORMITE") {
    const entreprise = await prisma.entreprise.findFirst({
      where: { id: entityId, deletedAt: null },
      select: {
        id: true,
        marches: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
    });
    return entreprise
      ? { entrepriseId: entreprise.id, marcheIds: entreprise.marches.map((marche) => marche.id) }
      : null;
  }

  return null;
}

async function isBpmnResourceInScope(req: Request, instance: BpmnInstance): Promise<boolean> {
  if (!req.user) return false;
  const resource = await getBpmnResourceScope(instance.module_type, instance.entity_id);
  if (!resource) return false;
  const effectiveRoles = await rolesEffectifs(req.user.id, req.user.role);
  const isSupervisor = req.user.role === "ADMIN" || effectiveRoles.includes("DG");
  const marchesAffectes = isSupervisor ? null : await getMarchesAffectes(req.user.id, req.user.role);
  return canAccessWorkflowResource(
    { role: req.user.role, entrepriseId: req.user.entrepriseId },
    resource,
    marchesAffectes,
  );
}

async function getActions(instanceId: string): Promise<(BpmnAction & { user_nom: string; user_role: string; step_nom: string; step_ordre: number })[]> {
  return prisma.$queryRaw`
    SELECT ba.*, u."nomComplet" as user_nom, u.role as user_role,
           bs.nom as step_nom, bs.ordre as step_ordre
    FROM bpmn_actions ba
    LEFT JOIN users u ON u.id = ba.user_id
    LEFT JOIN bpmn_steps bs ON bs.id = ba.step_id
    WHERE ba.instance_id = ${instanceId}
    ORDER BY ba.created_at ASC
  `;
}

// Récupère les emails de tous les utilisateurs actifs d'un rôle donné
async function getEmailsByRole(role: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { role: role as never, actif: true },
    select: { email: true },
  });
  return users.map(u => u.email);
}

// Récupère le label d'une entité (ref ou intitulé selon le module)
async function getEntityRef(moduleType: string, entityId: string): Promise<string> {
  try {
    if (moduleType === "PROJET") {
      const rows = await prisma.$queryRaw<{ code: string; intitule: string }[]>`SELECT code, intitule FROM projets WHERE id = ${entityId} LIMIT 1`;
      return rows[0] ? `${rows[0].code} — ${rows[0].intitule}` : entityId;
    }
    if (moduleType === "MARCHE") {
      const rows = await prisma.$queryRaw<{ reference: string; intitule: string }[]>`SELECT reference, intitule FROM marches WHERE id = ${entityId} LIMIT 1`;
      return rows[0] ? `${rows[0].reference} — ${rows[0].intitule}` : entityId;
    }
    if (moduleType === "ATTACHEMENT") {
      const rows = await prisma.$queryRaw<{ code: string }[]>`SELECT code FROM attachements WHERE id = ${entityId} LIMIT 1`;
      return rows[0]?.code ?? entityId;
    }
    if (moduleType === "DECOMPTE") {
      const rows = await prisma.$queryRaw<{ reference: string }[]>`SELECT reference FROM decomptes WHERE id = ${entityId} LIMIT 1`;
      return rows[0]?.reference ?? entityId;
    }
    if (moduleType === "CONFORMITE") {
      const rows = await prisma.$queryRaw<{ "raisonSociale": string }[]>`SELECT "raisonSociale" FROM entreprises WHERE id = ${entityId} LIMIT 1`;
      return rows[0]?.["raisonSociale"] ?? entityId;
    }
  } catch (_) {}
  return entityId;
}

// Met à jour le statut de l'entité dans sa table métier
async function updateEntityStatut(moduleType: string, entityId: string, statutLabel: string) {
  try {
    if (moduleType === "PROJET") {
      await prisma.$executeRaw`UPDATE projets SET statut = ${statutLabel}::text::"StatutProjet" WHERE id = ${entityId}`;
    } else if (moduleType === "MARCHE") {
      await prisma.$executeRaw`UPDATE marches SET statut = ${statutLabel}::text::"StatutMarche" WHERE id = ${entityId}`;
    } else if (moduleType === "ATTACHEMENT") {
      await prisma.$executeRaw`UPDATE attachements SET statut = ${statutLabel}::text::"StatutAttachement" WHERE id = ${entityId}`;
    } else if (moduleType === "CONFORMITE") {
      await prisma.$executeRaw`UPDATE entreprises SET "statutConformite" = ${statutLabel}::text::"StatutEntreprise" WHERE id = ${entityId}`;
    }
  } catch (_) { /* mapping statut non bloquant */ }
}

// ─── GET /api/bpmn/definitions ────────────────────────────────────────────────
bpmnRouter.get("/definitions", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const defs = await prisma.$queryRaw<(BpmnDef & { nb_etapes: number })[]>`
      SELECT bd.*, (SELECT COUNT(*)::int FROM bpmn_steps bs WHERE bs.definition_id = bd.id) as nb_etapes
      FROM bpmn_definitions bd WHERE bd.actif = true ORDER BY bd.module_type
    `;
    // Enrichir avec les étapes
    const enriched = await Promise.all(defs.map(async (d) => ({
      ...d,
      etapes: await getSteps(d.id),
    })));
    res.json(enriched);
  } catch (err) { next(err); }
});

// ─── GET /api/bpmn/definition/:moduleType ────────────────────────────────────
bpmnRouter.get("/definition/:moduleType", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const def = await getDefinition(req.params.moduleType.toUpperCase());
    if (!def) throw new ApiError(404, `Aucune définition BPMN pour le module ${req.params.moduleType}`);
    const etapes = await getSteps(def.id);
    res.json({ ...def, etapes });
  } catch (err) { next(err); }
});

// ─── POST /api/bpmn/soumettre/:moduleType/:entityId ──────────────────────────
bpmnRouter.post("/soumettre/:moduleType/:entityId", requireBpmnSubmissionScope, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const { moduleType, entityId } = req.params;
    const mt = moduleType.toUpperCase();
    const resource = await getBpmnResourceScope(mt, entityId);
    const marchesAffectes = await getMarchesAffectes(req.user.id, req.user.role);
    if (!resource || !canAccessWorkflowResource(
      { role: req.user.role, entrepriseId: req.user.entrepriseId }, resource, marchesAffectes,
    )) throw new ApiError(404, "Ressource introuvable");
    const existing = await getInstance(mt, entityId);
    if (existing) throw new ApiError(409, `Instance BPMN déjà existante pour cette entité (statut: ${existing.statut})`);

    const def = await getDefinition(mt);
    if (!def) throw new ApiError(400, `Aucun circuit BPMN défini pour le module ${mt}`);

    const steps = await getSteps(def.id);
    const [instance] = await prisma.$queryRaw<BpmnInstance[]>`
      INSERT INTO bpmn_instances (definition_id, module_type, entity_id, etape_actuelle, statut, created_by_id)
      VALUES (${def.id}, ${mt}, ${entityId}, 0, 'EN_COURS', ${req.user.id})
      RETURNING *
    `;

    // Mise à jour statut entité selon le module
    const statutInitial: Record<string, string> = {
      PROJET: "EN_VALIDATION", MARCHE: "UNDER_REVIEW",
      ATTACHEMENT: "SOUMIS", DECOMPTE: "DEPOSE", CONFORMITE: "SUBMITTED",
    };
    await updateEntityStatut(mt, entityId, statutInitial[mt] ?? "EN_VALIDATION").catch((e) => { console.error("[BPMN] updateEntityStatut:", e); });

    await logAudit({ userId: req.user.id, action: "CREATE", entityType: `BpmnInstance_${mt}`, entityId: instance.id, after: { moduleType: mt, entityId, definitionId: def.id } });

    res.status(201).json({
      instance,
      definition: { ...def, etapes: steps },
      message: `Dossier soumis — circuit "${def.nom}" démarré (${steps.length} étapes)`,
    });
  } catch (err) { next(err); }
});

// ─── GET /api/bpmn/instance/:moduleType/:entityId ────────────────────────────
bpmnRouter.get("/instance/:moduleType/:entityId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mt = req.params.moduleType.toUpperCase();

    const instance = await getInstance(mt, req.params.entityId);
    if (!instance) return res.json(null);
    if (!await isBpmnResourceInScope(req, instance)) throw new ApiError(404, "Instance BPMN introuvable");

    const [def, steps, actions] = await Promise.all([
      getDefinition(mt),
      getSteps(instance.definition_id),
      getActions(instance.id),
    ]);

    const etapeCourante = steps[instance.etape_actuelle] ?? null;
    const derniereAction = actions[actions.length - 1];
    const debutEtape = derniereAction ? new Date(derniereAction.created_at) : new Date(instance.created_at);
    const joursEnCours = Math.floor((Date.now() - debutEtape.getTime()) / 86400000);
    const enRetardSla  = etapeCourante?.sla_jours != null && joursEnCours > etapeCourante.sla_jours;

    res.json({ instance, definition: def, etapes: steps, actions, etapeCourante, joursEnCours, enRetardSla });
  } catch (err) { next(err); }
});

// ─── POST /api/bpmn/:instanceId/action ───────────────────────────────────────
bpmnRouter.post("/:instanceId/action", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");

    const { decision, commentaire } = z.object({
      decision:    z.enum(DECISIONS),
      commentaire: z.string().optional(),
    }).parse(req.body);

    if (decision !== "APPROUVE" && (!commentaire || commentaire.trim().length < 5)) {
      throw new ApiError(400, `Commentaire motivé obligatoire pour "${decision}" (min 5 caractères)`);
    }

    const instance = await getInstanceById(req.params.instanceId);
    if (!instance) throw new ApiError(404, "Instance BPMN introuvable");
    if (!await isBpmnResourceInScope(req, instance)) throw new ApiError(404, "Instance BPMN introuvable");
    if (instance.statut !== "EN_COURS") throw new ApiError(400, `Instance déjà terminée (statut: ${instance.statut})`);

    const steps = await getSteps(instance.definition_id);
    const etapeCourante = steps[instance.etape_actuelle];
    if (!etapeCourante) throw new ApiError(400, "Aucune étape courante");
    if (!isHumanBpmnStep(etapeCourante.type_tache, etapeCourante.is_system)) {
      throw new ApiError(403, "Une tâche système ne peut pas être exécutée par un utilisateur");
    }

    // Rôles effectifs : rôle propre + rôles délégués actifs (délégation d'intérim)
    const mesRoles = await rolesEffectifs(req.user.id, req.user.role);
    const isAdmin  = req.user.role === "ADMIN";
    const isSuperv = isAdmin || mesRoles.includes("DG");

    if (["SUSPENDRE","AUDIT"].includes(decision) && !isSuperv) {
      throw new ApiError(403, "Seule la Direction Générale peut suspendre ou demander un audit");
    }
    // Une instance suspendue bloque toute décision, sauf superviseur (levée)
    if (instance.suspended && !isSuperv) {
      throw new ApiError(403, "Instance suspendue par la Direction Générale — aucune action possible");
    }
    if (!["SUSPENDRE","AUDIT"].includes(decision) && !isAdmin) {
      if (etapeCourante.role_requis && !mesRoles.includes(etapeCourante.role_requis)) {
        // Les étapes SERVICE_TASK ne nécessitent pas de rôle spécifique
        if (etapeCourante.type_tache !== "SERVICE_TASK") {
          throw new ApiError(403, `Étape "${etapeCourante.nom}" requiert le rôle ${etapeCourante.role_requis}`);
        }
      }
    }

    // Enregistrer l'action
    await prisma.$executeRaw`
      INSERT INTO bpmn_actions (instance_id, step_id, user_id, decision, commentaire)
      VALUES (${instance.id}, ${etapeCourante.id}, ${req.user.id}, ${decision}, ${commentaire ?? null})
    `;

    // Pré-calcul pour notifications
    const entityRef        = await getEntityRef(instance.module_type, instance.entity_id);
    const soumetteurEmail  = req.user.email;
    // Récupérer le nom complet du décideur
    const decideurUser     = await prisma.user.findUnique({ where: { id: req.user.id }, select: { nomComplet: true } });
    const decideurNom      = decideurUser?.nomComplet ?? req.user.email;

    // Traitement selon la décision
    if (decision === "REJETE") {
      await prisma.$executeRaw`UPDATE bpmn_instances SET statut='REJETE', updated_at=NOW() WHERE id=${instance.id}`;
      await updateEntityStatut(instance.module_type, instance.entity_id, "REJETE").catch((e) => { console.error("[BPMN] updateEntityStatut:", e); });
      // Notifier le soumetteur du rejet
      void notifyDecision({
        to: soumetteurEmail, moduleType: instance.module_type, entityRef,
        decision: "REJETE", stepNom: etapeCourante.nom, decideurNom,
        commentaire: commentaire ?? "", entityId: instance.entity_id,
      });
      return res.json({ statut: "REJETE", message: `Dossier rejeté à l'étape "${etapeCourante.nom}"` });
    }

    if (decision === "DEMANDE_CORRECTION") {
      await updateEntityStatut(instance.module_type, instance.entity_id, "DEMANDE_CORRECTION").catch((e) => { console.error("[BPMN] updateEntityStatut:", e); });
      void notifyDecision({
        to: soumetteurEmail, moduleType: instance.module_type, entityRef,
        decision: "DEMANDE_CORRECTION", stepNom: etapeCourante.nom, decideurNom,
        commentaire: commentaire ?? "", entityId: instance.entity_id,
      });
      return res.json({ statut: "CORRECTION_REQUISE", message: `Correction demandée par ${etapeCourante.nom} : ${commentaire}` });
    }

    if (decision === "DEMANDE_COMPLEMENT") {
      void notifyDecision({
        to: soumetteurEmail, moduleType: instance.module_type, entityRef,
        decision: "DEMANDE_COMPLEMENT", stepNom: etapeCourante.nom, decideurNom,
        commentaire: commentaire ?? "", entityId: instance.entity_id,
      });
      return res.json({ statut: "COMPLEMENT_REQUIS", message: `Complément demandé : ${commentaire}` });
    }

    if (decision === "SUSPENDRE") {
      await prisma.$executeRaw`UPDATE bpmn_instances SET suspended=true, updated_at=NOW() WHERE id=${instance.id}`;
      void notifyDecision({
        to: soumetteurEmail, moduleType: instance.module_type, entityRef,
        decision: "SUSPENDRE", stepNom: etapeCourante.nom, decideurNom,
        commentaire: commentaire ?? "", entityId: instance.entity_id,
      });
      return res.json({ statut: "SUSPENDU", message: `Traitement suspendu par la DG : ${commentaire}` });
    }

    if (decision === "AUDIT") {
      await prisma.$executeRaw`UPDATE bpmn_instances SET audit_requis=true, updated_at=NOW() WHERE id=${instance.id}`;
      return res.json({ statut: "AUDIT_REQUIS", message: `Audit demandé : ${commentaire}` });
    }

    // APPROUVE → passer à l'étape suivante
    const prochainIndex = instance.etape_actuelle + 1;

    if (prochainIndex >= steps.length) {
      // Fin du circuit — approbation finale
      await prisma.$executeRaw`UPDATE bpmn_instances SET statut='APPROUVE', etape_actuelle=${prochainIndex}, updated_at=NOW() WHERE id=${instance.id}`;

      const statutFinal: Record<string, string> = {
        PROJET:      "APPROUVE",
        MARCHE:      "SIGNE",
        ATTACHEMENT: "VALIDE",
        DECOMPTE:    "VALIDE_DG",
        CONFORMITE:  "CONFORME",
      };
      await updateEntityStatut(instance.module_type, instance.entity_id, statutFinal[instance.module_type] ?? "APPROUVE").catch((e) => { console.error("[BPMN] updateEntityStatut:", e); });
      await logAudit({ userId: req.user.id, action: "APPROVE", entityType: `Bpmn_${instance.module_type}`, entityId: instance.entity_id });

      // F4 — Décomptes : déclencher le circuit financier après validation DG
      // (même logique que le moteur workflow interne — sans cela, les dépôts
      // via le portail entreprise restent bloqués à VALIDE_DG sans paiement)
      if (instance.module_type === "DECOMPTE") {
        try {
          const dec = await prisma.decompte.findUnique({
            where: { id: instance.entity_id },
            include: { marche: true, circuitFinancier: true },
          });
          if (dec && !dec.circuitFinancier && (dec.statut === "VALIDE_DG" || dec.statut === "VALIDE")) {
            const fin = dec.marche.financement;
            const typeCircuit = fin === "FER" ? "FER" : fin === "BUDGET_NATIONAL" ? "BUDGET" : "BAILLEUR";
            const etapesDefs = etapesCircuitFinancier(fin).map(e => ({ordre: e.ordre, nom: e.nom, roleOuService: e.roleOuService}));
            await prisma.circuitFinancier.create({
              data: {
                decompteId: dec.id, type: typeCircuit,
                bailleurNom: dec.marche.bailleur ?? undefined,
                etapes: { create: etapesDefs },
              },
            });
            await prisma.decompte.update({
              where: { id: dec.id },
              data: { statut: "EN_CIRCUIT_FINANCIER" },
            });
          }
        } catch (_) { /* non bloquant — le circuit manuel reste possible */ }
      }

      // Notifier DG + soumetteur + rôle précédent de l'approbation finale
      const dgEmails = await getEmailsByRole("DG");
      void notifyApprouve({
        to: [...dgEmails, soumetteurEmail].filter(Boolean),
        moduleType: instance.module_type,
        entityRef,
        nbEtapes: steps.length,
      });

      return res.json({ statut: "APPROUVE", message: `Circuit "${instance.module_type}" validé avec succès — dossier approuvé` });
    }

    // Avancer à l'étape suivante — notifier les approbateurs de la prochaine étape
    await prisma.$executeRaw`UPDATE bpmn_instances SET etape_actuelle=${prochainIndex}, updated_at=NOW() WHERE id=${instance.id}`;
    const prochaineEtape = steps[prochainIndex];

    if (prochaineEtape.role_requis && !prochaineEtape.is_system) {
      const nextEmails = await getEmailsByRole(prochaineEtape.role_requis);
      if (nextEmails.length > 0) {
        void notifyNextStep({
          to: nextEmails,
          moduleType: instance.module_type,
          entityRef,
          stepNom: prochaineEtape.nom,
          roleRequis: prochaineEtape.role_requis,
          soumetteurNom: decideurNom,
          commentairePrecedent: commentaire,
          entityId: instance.entity_id,
        });
      }
    }

    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: `Bpmn_${instance.module_type}`, entityId: instance.entity_id,
      after: { etape: prochainIndex, decision, prochaineEtape: prochaineEtape.nom } });

    res.json({
      statut:         "EN_COURS",
      etapeActuelle:  prochainIndex,
      prochaineEtape: prochaineEtape.nom,
      roleRequis:     prochaineEtape.role_requis,
      isSystemTask:   prochaineEtape.is_system,
    });
  } catch (err) { next(err); }
});

// ─── PATCH /api/bpmn/:instanceId/lever-suspension ────────────────────────────
bpmnRouter.patch("/:instanceId/lever-suspension", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    if (!ROLES_SUPERV.includes(req.user.role)) throw new ApiError(403, "Réservé à la DG/ADMIN");
    await prisma.$executeRaw`UPDATE bpmn_instances SET suspended=false, updated_at=NOW() WHERE id=${req.params.instanceId}`;
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "BpmnInstance", entityId: req.params.instanceId, after: { suspended: false } });
    res.json({ message: "Suspension levée" });
  } catch (err) { next(err); }
});

// ─── GET /api/bpmn/mes-taches ─────────────────────────────────────────────────
bpmnRouter.get("/mes-taches", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    if (req.user.role === "ENTREPRISE") return res.json([]);

    const mesRoles = await rolesEffectifs(req.user.id, req.user.role);
    const isSuperv = req.user.role === "ADMIN" || mesRoles.includes("DG");
    const marchesAffectes = isSuperv ? null : await getMarchesAffectes(req.user.id, req.user.role);
    if (marchesAffectes !== null && marchesAffectes.length === 0) return res.json([]);

    let instances: BpmnTask[];
    if (isSuperv) {
      instances = await prisma.$queryRaw<BpmnTask[]>`
        SELECT bi.*, bd.nom as def_nom, bs.nom as step_nom, bs.role_requis as step_role, bs.ordre as step_ordre,
               bs.type_tache as step_type, bs.is_system as step_is_system
        FROM bpmn_instances bi
        JOIN bpmn_definitions bd ON bd.id = bi.definition_id
        JOIN bpmn_steps bs ON bs.definition_id = bi.definition_id AND bs.ordre = bi.etape_actuelle + 1
        WHERE bi.statut = 'EN_COURS'
          AND bs.type_tache <> 'SERVICE_TASK' AND COALESCE(bs.is_system, false) = false
        ORDER BY bi.created_at ASC`;
    } else {
      instances = await prisma.$queryRaw<BpmnTask[]>`
        SELECT bi.*, bd.nom as def_nom, bs.nom as step_nom, bs.role_requis as step_role, bs.ordre as step_ordre,
               bs.type_tache as step_type, bs.is_system as step_is_system
        FROM bpmn_instances bi
        JOIN bpmn_definitions bd ON bd.id = bi.definition_id
        JOIN bpmn_steps bs ON bs.definition_id = bi.definition_id AND bs.ordre = bi.etape_actuelle + 1
        WHERE bi.statut = 'EN_COURS' AND bs.role_requis IN (${Prisma.join(mesRoles)})
          AND bs.type_tache <> 'SERVICE_TASK' AND COALESCE(bs.is_system, false) = false
        ORDER BY bi.created_at ASC`;
    }

    const instancesDansPerimetre = (await Promise.all(instances.map(async (inst) => {
      const resource = await getBpmnResourceScope(inst.module_type, inst.entity_id);
      const resourceInScope = resource !== null && canAccessWorkflowResource(
        { role: req.user!.role, entrepriseId: req.user!.entrepriseId },
        resource,
        marchesAffectes,
      );
      const roleAutorise = isSuperv || Boolean(inst.step_role && mesRoles.includes(inst.step_role));
      return resourceInScope && roleAutorise ? inst : null;
    }))).filter((inst): inst is BpmnTask => inst !== null);

    const enriched = await Promise.all(instancesDansPerimetre.map(async (inst) => {
      const lastAction = await prisma.$queryRaw<{ created_at: Date }[]>`
        SELECT created_at FROM bpmn_actions WHERE instance_id = ${inst.id} ORDER BY created_at DESC LIMIT 1
      `;
      const debut = lastAction[0] ? new Date(lastAction[0].created_at) : new Date(inst.created_at);
      const joursEnCours = Math.floor((Date.now() - debut.getTime()) / 86400000);
      return {
        ...inst,
        joursEnCours,
        peutAgir: isHumanBpmnStep(inst.step_type, inst.step_is_system)
          && (isSuperv || Boolean(inst.step_role && mesRoles.includes(inst.step_role))),
      };
    }));

    res.json(enriched);
  } catch (err) { next(err); }
});
// ─── GET /api/bpmn/supervision ────────────────────────────────────────────────
bpmnRouter.get("/supervision", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    if (!ROLES_SUPERV.includes(req.user.role)) throw new ApiError(403, "Réservé à la DG/ADMIN");

    const [totaux, parModule, parEtape] = await Promise.all([
      prisma.$queryRaw<{ statut: string; nb: number }[]>`
        SELECT statut, COUNT(*)::int as nb FROM bpmn_instances GROUP BY statut
      `,
      prisma.$queryRaw<{ module_type: string; nb: number }[]>`
        SELECT module_type, COUNT(*)::int as nb FROM bpmn_instances WHERE statut='EN_COURS' GROUP BY module_type ORDER BY nb DESC
      `,
      prisma.$queryRaw<{ step_nom: string; role_requis: string; module_type: string; nb: number }[]>`
        SELECT bs.nom as step_nom, bs.role_requis, bi.module_type, COUNT(*)::int as nb
        FROM bpmn_instances bi
        JOIN bpmn_steps bs ON bs.definition_id = bi.definition_id AND bs.ordre = bi.etape_actuelle + 1
        WHERE bi.statut = 'EN_COURS'
        GROUP BY bs.nom, bs.role_requis, bi.module_type
        ORDER BY nb DESC
      `,
    ]);

    const statsMap: Record<string, number> = {};
    for (const r of totaux) statsMap[r.statut] = r.nb;

    res.json({
      enCours:  statsMap["EN_COURS"]  ?? 0,
      approuves: statsMap["APPROUVE"] ?? 0,
      rejetes:  statsMap["REJETE"]    ?? 0,
      suspendus: statsMap["SUSPENDU"] ?? 0,
      total:    Object.values(statsMap).reduce((a, b) => a + b, 0),
      parModule, parEtape,
    });
  } catch (err) { next(err); }
});

// ─── GET /api/bpmn/audit/:instanceId ─────────────────────────────────────────
bpmnRouter.get("/audit/:instanceId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await getInstanceById(req.params.instanceId);
    if (!instance || !await isBpmnResourceInScope(req, instance)) {
      throw new ApiError(404, "Instance BPMN introuvable");
    }
    const actions = await getActions(req.params.instanceId);
    res.json(actions);
  } catch (err) { next(err); }
});
