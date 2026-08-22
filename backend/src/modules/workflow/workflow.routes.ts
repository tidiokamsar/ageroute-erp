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
import { etapesCircuitFinancier } from "../../lib/circuit-definitions";
import { z } from "zod";
// Moteur unique de validation : RG9, statut d'étape et projection de la ligne
// de validation. Voir lib/moteur-validation.ts pour le contexte.
import {
  verifierSeparationTaches, statutPourRoleEtape, libelleEtapeValidation,
  decisionValidation, produitUneValidation,
} from "../../lib/moteur-validation";
import { chargerRegles, booleenRegles } from "../../lib/regles";
import { motifStatutMarche } from "../../lib/eligibilite-depot";
import { getMarchesAffectes } from "../../lib/affectations";

export const workflowRouter = Router();
workflowRouter.use(requireAuth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DECISIONS = ["APPROUVE","REJETE","DEMANDE_CORRECTION","DEMANDE_COMPLEMENT","SUSPENDRE","AUDIT"] as const;
// Identique au type `Decision` de lib/moteur-validation.ts, dont il est la
// source : la liste DECISIONS alimente aussi le schema zod de la route.
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
    // `ACTIF` est un alias historique : AUCUN marché ne le porte en base (trois
    // sont EN_EXECUTION, un SIGNE). Cette condition rendait la soumission
    // impossible sur 100 % des marchés. Voir lib/eligibilite-depot.ts.
    const motifMarche = motifStatutMarche(decompte.marche.statut);
    if (motifMarche) throw new ApiError(400, `Soumission impossible — ${motifMarche}`);

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

    // Soumission ATOMIQUE, et TRACÉE comme une action de circuit.
    // Constat A2 de la revue du 20/08/2026 : la soumission n'écrivait ni dans
    // workflow_actions ni dans les validations — le soumetteur était donc
    // INVISIBLE pour RG9, et « soumettre puis valider la 1re étape » passait
    // sans obstacle. L'action « SOUMISSION » rattachée à la première étape
    // rend le soumetteur opposable à la séparation des tâches.
    const instance = await prisma.$transaction(async (tx) => {
      const inst = await tx.workflowInstance.create({
        data: { definitionId: wfDef.id, decompteId: decompte.id, etapeActuelle: 0, statut: "EN_COURS" },
      });
      if (wfDef.etapes.length > 0) {
        await tx.workflowAction.create({
          data: { instanceId: inst.id, etapeId: wfDef.etapes[0].id, userId: req.user!.id, decision: "SOUMISSION", commentaire: "Dépôt du décompte au circuit" },
        });
      }
      await tx.decompte.update({ where: { id: decompte.id }, data: { statut: "DEPOSE" } });
      await logAudit({ userId: req.user!.id, action: "UPDATE", entityType: "Decompte", entityId: decompte.id, after: { statut: "DEPOSE", wfInstanceId: inst.id }, tx });
      return inst;
    });

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

    // ── RG9 — séparation des tâches ───────────────────────────────────────────
    // Une personne n'engage qu'une étape du circuit. Les intervenants antérieurs
    // sont lus dans LES DEUX registres : actions de workflow et lignes de
    // validation — l'historique d'avant l'unification vit dans le second.
    const reglesEffectives = await chargerRegles({ marcheId: instance.decompte?.marcheId ?? undefined });
    const [actionsAnterieures, validationsAnterieures] = await Promise.all([
      prisma.workflowAction.findMany({ where: { instanceId: instance.id }, select: { userId: true } }),
      instance.decompteId
        ? prisma.decompteValidation.findMany({ where: { decompteId: instance.decompteId }, select: { validePar: true } })
        : Promise.resolve([] as Array<{ validePar: string }>),
    ]);
    const intervenantsAnterieurs = [
      ...actionsAnterieures.map((a) => a.userId),
      ...validationsAnterieures.map((v) => v.validePar),
    ];
    const rg9 = verifierSeparationTaches({
      utilisateurId: req.user.id,
      intervenantsAnterieurs,
      decision: decision as Decision,
      active: booleenRegles(reglesEffectives, "WF_SEPARATION_TACHES"),
    });
    if (!rg9.autorise) throw new ApiError(403, rg9.motif!);

    // ── Décider des effets AVANT d'écrire quoi que ce soit ────────────────────
    // Constat A1 de la revue du 20/08/2026 : la transaction ne couvrait que
    // l'action et sa projection ; le statut du décompte, l'avancement d'étape
    // et l'audit étaient écrits APRÈS, hors transaction. Une panne entre les
    // deux recréait exactement la divergence que ce moteur devait éliminer :
    // l'onglet Validations disait « approuvé », le circuit restait sur place.
    //
    // Ici, tous les effets sont calculés d'abord (pur, sans écriture), puis
    // écrits dans UNE SEULE $transaction : action, projection, instance,
    // statut du décompte, audit. Seule la notification sort de l'atomicité —
    // elle est rejouable, pas la cohérence.
    const prochainIndex = instance.etapeActuelle + 1;
    const dernierEtape = prochainIndex >= instance.definition.etapes.length;
    const prochaineEtape = dernierEtape ? null : instance.definition.etapes[prochainIndex];

    let majInstance: { statut?: "APPROUVE" | "REJETE"; etapeActuelle?: number } | null = null;
    let majDecompte: Record<string, unknown> | null = null;
    let reponse: Record<string, unknown>;

    switch (decision) {
      case "REJETE":
        majInstance = { statut: "REJETE" };
        majDecompte = { statut: "REJETE" };
        reponse = { statut: "REJETE", message: `Décompte rejeté à l'étape "${etapeCourante.nom}"` };
        break;
      case "DEMANDE_CORRECTION":
        majDecompte = { statut: "REJETE" };
        reponse = { statut: "CORRECTION_REQUISE", message: `Correction demandée par ${etapeCourante.nom} : ${commentaire}` };
        break;
      case "DEMANDE_COMPLEMENT":
        majDecompte = { statut: "EN_VALIDATION" };
        reponse = { statut: "COMPLEMENT_REQUIS", message: `Complément demandé : ${commentaire}` };
        break;
      case "SUSPENDRE":
        majDecompte = { traitementSuspendu: true };
        reponse = { statut: "SUSPENDU", message: `Traitement suspendu par la DG : ${commentaire}` };
        break;
      case "AUDIT":
        majDecompte = { auditRequis: true };
        reponse = { statut: "AUDIT_REQUIS", message: `Audit complémentaire demandé : ${commentaire}` };
        break;
      default: // APPROUVE
        if (dernierEtape) {
          majInstance = { statut: "APPROUVE", etapeActuelle: prochainIndex };
          majDecompte = { statut: "VALIDE_DG" };
          reponse = { statut: "VALIDE_DG", message: "Décompte validé par la Direction Générale — circuit financier déclenché" };
        } else {
          // Table de correspondance UNIQUE (lib/moteur-validation.ts) — elle
          // vivait en deux exemplaires divergents avant l'unification.
          const prochainStatut = statutPourRoleEtape(prochaineEtape!.roleRequis);
          majInstance = { etapeActuelle: prochainIndex };
          majDecompte = { statut: prochainStatut };
          reponse = { statut: prochainStatut, etapeActuelle: prochainIndex, prochaineEtape: prochaineEtape!.nom, roleRequis: prochaineEtape!.roleRequis };
        }
    }

    await prisma.$transaction(async (tx) => {
      await tx.workflowAction.create({
        data: { instanceId: instance.id, etapeId: etapeCourante.id, userId: req.user!.id, decision, commentaire },
      });
      if (instance.decompteId && produitUneValidation(decision as Decision)) {
        await tx.decompteValidation.create({
          data: {
            decompteId: instance.decompteId,
            etape: libelleEtapeValidation(etapeCourante.roleRequis),
            decision: decisionValidation(decision as Decision),
            commentaire: commentaire ?? "(sans commentaire)",
            validePar: req.user!.id,
            valideNom: req.user!.email,
            valideRole: req.user!.role,
          },
        });
      }
      if (majInstance) {
        await tx.workflowInstance.update({ where: { id: instance.id }, data: majInstance });
      }
      if (majDecompte && instance.decompteId) {
        await tx.decompte.update({ where: { id: instance.decompteId }, data: majDecompte });
      }
      await logAudit({
        userId: req.user!.id, action: "UPDATE", entityType: "WorkflowInstance", entityId: instance.id,
        after: { decision, etape: etapeCourante.nom, commentaire }, tx,
      });
    });

    // ── Effets NON transactionnels : rejouables, jamais garants de cohérence ──
    if (decision === "APPROUVE" && dernierEtape && instance.decompteId) {
      // Déclencher le circuit financier. Hors transaction à dessein : son échec
      // laisse un décompte VALIDE_DG cohérent, relançable — alors que l'inclure
      // ferait échouer la validation DG pour un problème du circuit aval.
      try {
        const dec = await prisma.decompte.findUnique({ where: { id: instance.decompteId }, include: { marche: true } });
        if (dec && !await prisma.circuitFinancier.findUnique({ where: { decompteId: dec.id } })) {
          const fin = dec.marche.financement;
          const typeCircuit = fin === "FER" ? "FER" : fin === "BUDGET_NATIONAL" ? "BUDGET" : "BAILLEUR";
          const etapesDefs = etapesCircuitFinancier(fin).map(e => ({ordre: e.ordre, nom: e.nom, roleOuService: e.roleOuService}));
          await prisma.circuitFinancier.create({ data: { decompteId: dec.id, type: typeCircuit, bailleurNom: dec.marche.bailleur ?? undefined, etapes: { create: etapesDefs } } });
          await prisma.decompte.update({ where: { id: dec.id }, data: { statut: "EN_CIRCUIT_FINANCIER" } });
        }
      } catch (_) { /* non bloquant — relançable */ }
    }
    if (decision === "APPROUVE" && prochaineEtape) {
      await notifyWorkflowStep(prochaineEtape, instance.decompte?.reference ?? "", instance.id).catch(() => {});
    }

    res.json(reponse);
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

    // Périmètre d'affectation — même règle que les listes (marchés, décomptes,
    // attachements). Sans ce filtre, un agent MISSION voyait les tâches de TOUS
    // les marchés dès lors que l'étape courante requérait son rôle, y compris
    // ceux d'une autre équipe de contrôle : les listes étaient cloisonnées, les
    // tâches ne l'étaient pas.
    const marchesAffectes = isSuperv ? null : await getMarchesAffectes(req.user.id, req.user.role);

    const instances = await prisma.workflowInstance.findMany({
      where: {
        statut: "EN_COURS" as const,
        ...(marchesAffectes !== null ? { decompte: { marcheId: { in: marchesAffectes } } } : {}),
      },
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
/**
 * Circuit d'un décompte.
 *
 * Renvoie `null` quand aucune instance n'existe — mais un `null` sec ne
 * distingue pas deux situations très différentes : un décompte jamais soumis,
 * et un décompte ANTÉRIEUR à l'unification des circuits, validé et payé à
 * l'époque où la validation s'écrivait hors du workflow.
 *
 * Constaté le 20/08/2026 : 3 décomptes sur 8, tous au statut PAYE, portaient
 * cinq validations chacun sans aucune instance. Leur reconstituer un circuit
 * a posteriori fabriquerait un historique qui n'a pas eu lieu. On les qualifie
 * plutôt, et l'écran le dit.
 */
workflowRouter.get("/decompte/:decompteId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.workflowInstance.findFirst({
      where: { decompteId: req.params.decompteId },
      include: includeInstance,
      orderBy: { createdAt: "desc" },
    });
    if (instance) return res.json(instance);

    const [nbValidations, decompte] = await Promise.all([
      prisma.decompteValidation.count({ where: { decompteId: req.params.decompteId } }),
      prisma.decompte.findUnique({ where: { id: req.params.decompteId }, select: { statut: true } }),
    ]);

    if (nbValidations > 0) {
      return res.json({
        instance: null,
        anterieurAuDispositif: true,
        nbValidations,
        statutDecompte: decompte?.statut ?? null,
        message:
          `Dossier antérieur à l'unification des circuits : ${nbValidations} validation(s) ` +
          "ont été enregistrées avant que le circuit ne devienne la source unique du parcours. " +
          "Aucune instance n'est reconstituée — l'historique du circuit n'a pas eu lieu et ne " +
          "sera pas fabriqué. Les validations restent consultables dans l'onglet Validations.",
      });
    }

    res.json(null);
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
