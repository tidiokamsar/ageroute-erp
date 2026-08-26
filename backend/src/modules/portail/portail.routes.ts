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
import { verifierEligibiliteDepot } from "../../lib/eligibilite-depot";
import { notifyWorkflowStep } from "../notifications/notifications.service";
import { logAudit } from "../../lib/audit";
import { notifyNextStep } from "../../lib/mailer";
import { access } from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env";
import { checkModuleAccess } from "../../middleware/moduleAccess.middleware";
import { getStoredFilenameFromUploadUrl, portailDecompteRequestSchema } from "./portail.decompte.schema";
import { creerBrouillonDecomptePortail } from "./portail.decompte.service";

export const portailRouter = Router();
portailRouter.use(requireAuth);

const PIECES_REQUISES_DECOMPTE = ["decompteSigné", "attachements", "facture", "rapportAvancement"] as const;

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
      _count: { select: { documents: true } },
    },
  });

  // Étape courante de chaque décompte.
  //
  // ⚠️ Cet enrichissement interrogeait les tables BPMN, qui comptent 0 instance
  // depuis toujours : la colonne « Étape » du portail affichait donc « — » pour
  // tous les décomptes, y compris ceux en cours de contrôle. L'entreprise ne
  // pouvait pas savoir qui détenait son dossier.
  const ids = decomptes.map((d) => d.id);
  const etapeParDecompte: Record<string, { circuit: string; etape: string; role: string; position: string } | null> = {};

  if (ids.length > 0) {
    const instances = await prisma.workflowInstance.findMany({
      where: { decompteId: { in: ids } },
      orderBy: { createdAt: "desc" },
      include: { definition: { include: { etapes: { orderBy: { ordre: "asc" } } } } },
    });
    for (const inst of instances) {
      if (!inst.decompteId || etapeParDecompte[inst.decompteId]) continue;
      const courante = inst.definition.etapes[inst.etapeActuelle];
      etapeParDecompte[inst.decompteId] = courante
        ? {
            circuit: inst.definition.nom,
            etape: courante.nom,
            role: courante.roleRequis,
            position: `${inst.etapeActuelle + 1}/${inst.definition.etapes.length}`,
          }
        : { circuit: inst.definition.nom, etape: "Circuit achevé", role: "", position: `${inst.definition.etapes.length}/${inst.definition.etapes.length}` };
    }
  }

  res.json(decomptes.map((d) => ({
    ...d,
    etapeCourante: etapeParDecompte[d.id] ?? null,
    nbPieces: d._count.documents,
    // Un brouillon n'est pas encore dans le circuit : l'entreprise doit pouvoir
    // l'envoyer, et l'écran doit le lui proposer.
    peutEtreEnvoye: ["BROUILLON", "EN_CORRECTION"].includes(d.statut),
  })));
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

// ─── GET /api/portail/eligibilite/:marcheId ──────────────────────────────────
/**
 * Ce que l'entreprise a le droit de faire sur ce marché, AVANT de saisir.
 *
 * Sans cette route, l'entreprise remplissait tout le formulaire et découvrait le
 * refus au moment de l'envoi — parfois pour une caution expirée qu'elle aurait pu
 * faire proroger entre-temps. Le blocage doit être connu au début, pas à la fin.
 */
portailRouter.get("/eligibilite/:marcheId", entrepriseOnly, wrap(async (req, res) => {
  const entrepriseId = await getEntrepriseId(req.user!.id);
  if (!entrepriseId) throw new ApiError(404, "Aucune entreprise liée");

  const marche = await prisma.marche.findFirst({
    where: { id: req.params.marcheId, entrepriseId, deletedAt: null },
    select: { id: true, reference: true, statut: true },
  });
  if (!marche) throw new ApiError(404, "Marché introuvable");

  const { checkEligibilite } = await import("../entreprises/entreprises.service");
  const [{ raisons }, garanties, nbAttachements] = await Promise.all([
    checkEligibilite(entrepriseId),
    prisma.garantie.findMany({ where: { marcheId: marche.id }, select: { type: true, active: true, dateExpiration: true } }),
    prisma.attachement.count({ where: { decompte: { marcheId: marche.id, deletedAt: null } } }),
  ]);

  const controle = verifierEligibiliteDepot({
    blocagesEntreprise: raisons,
    statutMarche: marche.statut,
    garanties,
    exigeBonneExecution: garanties.some((g) => g.type === "BONNE_EXECUTION"),
    nbAttachements,
    maintenant: new Date(),
  });

  res.json({ marche, ...controle, garanties });
}));

// ─── GET /api/portail/suivi/:decompteId — parcours réel du décompte ───────────
/**
 * Suivi d'un décompte par l'entreprise qui l'a déposé.
 *
 * ⚠️ Cette route lisait les tables BPMN, qui comptent 0 instance et 0 action
 * depuis toujours. L'entreprise recevait donc systématiquement une instance
 * nulle, aucune étape et aucun journal : elle ne pouvait ni voir où en était son
 * dossier, ni savoir qu'un complément lui était demandé.
 *
 * Elle lit désormais le circuit réel, et rend TOUT ce dont une entreprise a
 * besoin pour agir : l'étape courante et qui la détient, l'historique des
 * décisions, les visas, ses pièces avec leur statut et le motif de retour, et
 * les paiements. C'est la vue qui lui permet de s'exécuter sans téléphoner.
 */
portailRouter.get("/suivi/:decompteId", entrepriseOnly, wrap(async (req, res) => {
  const entrepriseId = await getEntrepriseId(req.user!.id);
  if (!entrepriseId) throw new ApiError(404, "Aucune entreprise liée");

  const decompte = await prisma.decompte.findFirst({
    where: { id: req.params.decompteId, entrepriseId, deletedAt: null },
    include: {
      marche: { select: { reference: true, intitule: true, statut: true } },
      paiements: {
        where: { deletedAt: null }, orderBy: { createdAt: "asc" },
        select: { reference: true, montantGnf: true, statut: true, dateExecution: true },
      },
      documents: {
        where: { estArchive: false }, orderBy: { createdAt: "asc" },
        select: { id: true, type: true, nom: true, version: true, statutValidation: true, motifRetour: true, valideAt: true, createdAt: true },
      },
      validationsAvancees: {
        orderBy: { valideAt: "asc" },
        select: { etape: true, decision: true, commentaire: true, valideRole: true, valideAt: true },
      },
    },
  });
  if (!decompte) throw new ApiError(404, "Décompte introuvable");

  const instance = await prisma.workflowInstance.findFirst({
    where: { decompteId: decompte.id },
    orderBy: { createdAt: "desc" },
    include: {
      definition: { include: { etapes: { orderBy: { ordre: "asc" } } } },
      actions: { orderBy: { createdAt: "asc" }, include: { etape: { select: { nom: true, roleRequis: true } } } },
    },
  });

  const etapes = instance
    ? instance.definition.etapes.map((e, i) => ({
        ordre: i + 1,
        nom: e.nom,
        roleRequis: e.roleRequis,
        etat: i < instance.etapeActuelle ? "FRANCHIE" : i === instance.etapeActuelle ? "EN_COURS" : "A_VENIR",
      }))
    : [];

  // Ce que l'entreprise doit faire, s'il y a lieu. Une pièce retournée ne compte
  // pas comme fournie : c'est l'action attendue d'elle, et elle doit la voir.
  const piecesRetournees = decompte.documents.filter((d) => d.statutValidation === "RETOURNE");
  const actionAttendue =
    decompte.statut === "EN_CORRECTION"
      ? "Ce décompte vous a été retourné : corrigez les pièces signalées puis resoumettez le dossier."
      : decompte.statut === "BROUILLON"
        ? "Ce décompte est un brouillon : il n'est pas encore entré dans le circuit. Envoyez-le pour démarrer la validation."
        : piecesRetournees.length > 0
        ? `${piecesRetournees.length} pièce(s) vous ont été retournée(s) : corrigez-les et redéposez-les.`
        : null;

  res.json({
    decompte,
    instance: instance
      ? { id: instance.id, statut: instance.statut, etapeActuelle: instance.etapeActuelle, circuit: instance.definition.nom }
      : null,
    anterieurAuDispositif: !instance && decompte.validationsAvancees.length > 0,
    etapes,
    etapeCourante: etapes.find((e) => e.etat === "EN_COURS") ?? null,
    actions: instance?.actions.map((a) => ({
      etape: a.etape?.nom ?? a.etape?.roleRequis,
      decision: a.decision,
      commentaire: a.commentaire,
      date: a.createdAt,
    })) ?? [],
    piecesRetournees,
    actionAttendue,
  });
}));

// ─── POST /api/portail/soumettre/:decompteId — envoyer un brouillon ───────────
/**
 * Envoi d'un brouillon dans le circuit par l'entreprise elle-même.
 *
 * L'entreprise pouvait créer un brouillon mais pas l'envoyer : la seule route de
 * soumission passe par le module workflow, fermé à son rôle. Son décompte restait
 * donc indéfiniment à l'état BROUILLON, invisible des services.
 *
 * Le verrou de dépôt est appliqué ici aussi : un brouillon créé avant
 * l'expiration d'une caution ne doit pas pouvoir entrer dans le circuit après.
 */
portailRouter.post("/soumettre/:decompteId", entrepriseOnly, wrap(async (req, res) => {
  const entrepriseId = await getEntrepriseId(req.user!.id);
  if (!entrepriseId) throw new ApiError(404, "Aucune entreprise liée");

  const decompte = await prisma.decompte.findFirst({
    where: { id: req.params.decompteId, entrepriseId, deletedAt: null },
    include: { marche: true },
  });
  if (!decompte) throw new ApiError(404, "Décompte introuvable");
  if (!["BROUILLON", "EN_CORRECTION"].includes(decompte.statut)) {
    throw new ApiError(400, `Ce décompte est déjà dans le circuit (statut « ${decompte.statut.replace(/_/g, " ")} »).`);
  }
  const [nbLignes, documentsActifs] = await Promise.all([
    prisma.decompteLigne.count({ where: { decompteId: decompte.id } }),
    prisma.document.findMany({
      where: { decompteId: decompte.id, estArchive: false, statutValidation: { not: "RETOURNE" } },
      select: { type: true },
    }),
  ]);
  if (nbLignes < 1) throw new ApiError(409, "Ajoutez au moins une ligne avant de soumettre le décompte.");
  const typesPresents = new Set(documentsActifs.map((document) => document.type));
  const piecesManquantes = PIECES_REQUISES_DECOMPTE.filter((type) => !typesPresents.has(type));
  if (piecesManquantes.length > 0) {
    throw new ApiError(409, `Dossier incomplet — pièces obligatoires manquantes : ${piecesManquantes.join(", ")}.`);
  }

  const { checkEligibilite } = await import("../entreprises/entreprises.service");
  const [{ raisons }, garanties, nbAttachements, dejaOuvert] = await Promise.all([
    checkEligibilite(entrepriseId),
    prisma.garantie.findMany({ where: { marcheId: decompte.marcheId }, select: { type: true, active: true, dateExpiration: true } }),
    prisma.attachement.count({ where: { decompte: { marcheId: decompte.marcheId, deletedAt: null } } }),
    prisma.workflowInstance.findFirst({
      where: { decompteId: decompte.id, statut: { in: ["EN_ATTENTE", "EN_COURS", "APPROUVE"] } },
      select: { id: true },
    }),
  ]);
  if (dejaOuvert) throw new ApiError(409, "Un circuit est déjà ouvert pour ce décompte.");

  const controle = verifierEligibiliteDepot({
    blocagesEntreprise: raisons,
    statutMarche: decompte.marche.statut,
    garanties,
    exigeBonneExecution: garanties.some((g) => g.type === "BONNE_EXECUTION"),
    nbAttachements,
    maintenant: new Date(),
  });
  if (!controle.autorise) throw new ApiError(403, `Envoi bloqué — ${controle.blocages.join(" ")}`);

  const definition = await prisma.workflowDefinition.findFirst({
    where: { financement: decompte.marche.financement, actif: true },
    include: { etapes: { orderBy: { ordre: "asc" } } },
  });
  if (!definition) throw new ApiError(400, `Aucun circuit défini pour le financement ${decompte.marche.financement}.`);

  // Soumission ATOMIQUE et TRACÉE — même contrat que la porte interne
  // (workflow.routes.ts) : l'action « SOUMISSION » rend le déposant visible
  // pour RG9, et l'ensemble réussit ou échoue d'un bloc.
  const instance = await prisma.$transaction(async (tx) => {
    const inst = await tx.workflowInstance.create({
      data: { definitionId: definition.id, decompteId: decompte.id, etapeActuelle: 0, statut: "EN_COURS" },
    });
    if (definition.etapes.length > 0) {
      await tx.workflowAction.create({
        data: { instanceId: inst.id, etapeId: definition.etapes[0].id, userId: req.user!.id, decision: "SOUMISSION", commentaire: "Dépôt du décompte par l'entreprise (portail)" },
      });
    }
    await tx.decompte.update({ where: { id: decompte.id }, data: { statut: "DEPOSE" } });
    await logAudit({
      userId: req.user!.id, action: "UPDATE", entityType: "Decompte", entityId: decompte.id,
      after: { statut: "DEPOSE", origine: "portail-entreprise", wfInstanceId: inst.id }, tx,
    });
    return inst;
  });

  // Notification du PREMIER intervenant — sans elle, le dossier attend que
  // quelqu'un pense à regarder.
  if (definition.etapes.length > 0) {
    await notifyWorkflowStep(definition.etapes[0], decompte.reference, instance.id).catch(() => {});
  }

  res.json({
    message: `Décompte envoyé — circuit « ${definition.nom} » démarré, ${definition.etapes.length} étapes.`,
    premiereEtape: definition.etapes[0]?.nom ?? null,
    avertissements: controle.avertissements,
  });
}));

// ─── POST /api/portail/deposer-decompte — enregistrer un brouillon ────────────
portailRouter.post("/deposer-decompte", checkModuleAccess("decomptes"), entrepriseOnly, async (req, res, next) => {
  try {
    const entrepriseId = await getEntrepriseId(req.user!.id);
    if (!entrepriseId) return res.status(404).json({ error: "Aucune entreprise liée" });

    const payloadResult = portailDecompteRequestSchema.safeParse(req.body);
    if (!payloadResult.success) {
      return res.status(400).json({
        error: payloadResult.error.issues[0]?.message ?? "Données du brouillon invalides",
      });
    }
    const data = payloadResult.data;
    const filenames = data.pieces.map((piece) => getStoredFilenameFromUploadUrl(piece.cheminFichier)!);
    const [presencePieces, ownedUploads] = await Promise.all([
      Promise.all(data.pieces.map(async (piece) => {
        const filename = getStoredFilenameFromUploadUrl(piece.cheminFichier);
        if (!filename) return false;
        try {
          await access(path.resolve(env.UPLOAD_DIR, filename));
          return true;
        } catch {
          return false;
        }
      })),
      prisma.auditLog.count({
        where: {
          userId: req.user!.id,
          action: "CREATE",
          entityType: "Upload",
          entityId: { in: filenames },
        },
      }),
    ]);
    if (presencePieces.some((isPresent) => !isPresent)) {
      return res.status(400).json({ error: "Une pi\u00e8ce du dossier n\u2019a pas \u00e9t\u00e9 t\u00e9l\u00e9vers\u00e9e" });
    }
    if (ownedUploads !== filenames.length) {
      return res.status(403).json({ error: "Une pièce du dossier ne vous appartient pas" });
    }

    const decompte = await creerBrouillonDecomptePortail({
      data,
      entrepriseId,
      userId: req.user!.id,
      ipAddress: req.ip,
    });

    res.status(201).json({
      message: "Brouillon enregistré. Faites valider l’attachement métier avant de soumettre le décompte au circuit.",
      decompte,
    });
  } catch (err) {
    next(err);
  }
});

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
