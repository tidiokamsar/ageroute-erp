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
import { chargerRegles } from "../../lib/regles";
import { calcDecompteRegles } from "../decomptes/decomptes.calc.regles";
import { construireSnapshot } from "../decomptes/decomptes.regles.audit";
import { bordereauDepuisTypes, clePourType } from "../../lib/pieces-obligatoires";
import { formaterMontant } from "../../lib/montants";
import { getStoredFilenameFromUploadUrl, portailDecompteRequestSchema } from "./portail.decompte.schema";
import { calculerMontantLigneGnf } from "./portail.decompte.service";
import { access } from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env";
import { z } from "zod";

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
    peutEtreEnvoye: d.statut === "BROUILLON",
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
    // Décision DAF du 26/08/2026 : exigence inconditionnelle (voir /eligibilite).
    exigeBonneExecution: true,
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
    decompte.statut === "BROUILLON"
      ? "Ce décompte est un brouillon : il n'est pas encore entré dans le circuit. Envoyez-le pour démarrer la validation."
      : piecesRetournees.length > 0
        ? `${piecesRetournees.length} pièce(s) vous ont été retournée(s) : corrigez-les et redéposez-les.`
        // Une correction demandée sur le FOND — un montant, un cumul — ne
        // retourne aucune pièce : l'entreprise ne voyait alors ni consigne ni
        // bouton, et son dossier restait immobile sans qu'elle sache pourquoi.
        // Le motif est dans la dernière décision du circuit, affichée à côté.
        : decompte.statut === "EN_CORRECTION"
          ? "Une correction vous est demandée : reprenez le décompte selon le motif indiqué, puis renvoyez-le au circuit."
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
  // EN_CORRECTION est resoumissible par le déposant : c'est tout l'objet de la
  // demande de correction, qui arrête le circuit et lui renvoie le dossier.
  // Auparavant seul BROUILLON passait ici, et la route interne qui accepte
  // EN_CORRECTION est fermée aux comptes entreprise : le dossier restait
  // bloqué jusqu'à ce qu'un agent le resoumette à sa place — ce que la
  // production montre déjà.
  if (!["BROUILLON", "EN_CORRECTION"].includes(decompte.statut)) {
    throw new ApiError(400, `Ce décompte est déjà dans le circuit (statut « ${decompte.statut.replace(/_/g, " ")} »).`);
  }

  const { checkEligibilite } = await import("../entreprises/entreprises.service");
  const [{ raisons }, garanties, nbAttachements, dejaOuvert] = await Promise.all([
    checkEligibilite(entrepriseId),
    prisma.garantie.findMany({ where: { marcheId: decompte.marcheId }, select: { type: true, active: true, dateExpiration: true } }),
    prisma.attachement.count({ where: { decompte: { marcheId: decompte.marcheId, deletedAt: null } } }),
    // Seul un circuit VIVANT interdit la resoumission. La recherche ne
    // filtrait pas le statut : après une demande de correction, l'instance
    // arrêtée (REJETE) du circuit précédent déclenchait un 409 et fermait la
    // seule porte restante au déposant.
    prisma.workflowInstance.findFirst({
      where: { decompteId: decompte.id, statut: { in: ["EN_ATTENTE", "EN_COURS", "APPROUVE"] } },
      select: { id: true, statut: true },
    }),
  ]);
  if (dejaOuvert) {
    throw new ApiError(409, dejaOuvert.statut === "APPROUVE"
      ? "Le circuit de ce décompte est déjà approuvé."
      : "Un circuit est déjà ouvert pour ce décompte.");
  }

  const controle = verifierEligibiliteDepot({
    blocagesEntreprise: raisons,
    statutMarche: decompte.marche.statut,
    garanties,
    // Décision DAF du 26/08/2026 : exigence inconditionnelle (voir /eligibilite).
    exigeBonneExecution: true,
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

// ─── POST /api/portail/deposer-decompte — soumettre un décompte ───────────────
// Revue du 20/08/2026 : ce dépôt créait le décompte au statut SOUMIS et
// démarrait l'ANCIEN moteur BPMN générique (bpmn_instances) — sans RG9, sans
// ligne dans l'onglet Validations, invisible dans /suivi (qui lit le circuit
// unifié) — pendant que /soumettre du même fichier créait, lui, une instance
// du circuit unifié. Double moteur, double statut (SOUMIS vs DEPOSE).
// Désormais : circuit unifié, statut DEPOSE, calcul par le moteur de règles
// (BigInt pur, taux du marché et paramétrage A1-A7 — l'ancien code codait
// 18 % / 0,6 % / 9-118e / 5 % en dur en arithmétique flottante).
portailRouter.post("/deposer-decompte", entrepriseOnly, wrap(async (req, res) => {
  const entrepriseId = await getEntrepriseId(req.user!.id);
  if (!entrepriseId) throw new ApiError(404, "Aucune entreprise liée");

  // Corps STRICT : le dossier est exigé pièce par pièce, et les lignes portent
  // désignation, unité, quantité et prix unitaire. Le schéma précédent
  // acceptait un `montantBrut` calculé par le NAVIGATEUR et le sommait tel
  // quel : le montant d'un décompte dépendait donc du client. Ici le serveur
  // recalcule chaque ligne en arithmétique entière et ignore tout agrégat reçu.
  const { marcheId, type, observations, lignes, pieces } = portailDecompteRequestSchema.parse(req.body);

  // Le marché doit appartenir à cette entreprise et être actif
  const marche = await prisma.marche.findFirst({
    where: { id: marcheId, entrepriseId, deletedAt: null },
  });
  if (!marche) throw new ApiError(403, "Marché non trouvé ou non accessible");

  // ── Verrou de dépôt (lib/eligibilite-depot.ts) ────────────────────────────
  // La condition précédente exigeait `statut === "ACTIF"`. Or AUCUN marché ne
  // porte ce statut — ACTIF est un alias historique. Le dépôt échouait donc
  // pour 100 % des marchés. Et la régularité des garanties n'était contrôlée
  // nulle part : une caution de bonne exécution expirée depuis trois semaines
  // n'empêchait rien.
  const { checkEligibilite } = await import("../entreprises/entreprises.service");
  const [{ raisons }, garanties, nbAttachements] = await Promise.all([
    checkEligibilite(entrepriseId),
    prisma.garantie.findMany({
      where: { marcheId },
      select: { type: true, active: true, dateExpiration: true },
    }),
    prisma.attachement.count({ where: { decompte: { marcheId, deletedAt: null } } }),
  ]);

  const controle = verifierEligibiliteDepot({
    blocagesEntreprise: raisons,
    statutMarche: marche.statut,
    garanties,
    // Décision DAF du 26/08/2026 : l'exigence est INCONDITIONNELLE — un marché
    // sans aucune caution de bonne exécution enregistrée n'autorise AUCUN
    // dépôt (l'ancien exigence dérivée de garanties.some(...) laissait passer
    // les marchés où la caution n'avait jamais été saisie).
    exigeBonneExecution: true,
    nbAttachements,
    maintenant: new Date(),
  });

  if (!controle.autorise) {
    throw new ApiError(403, `Dépôt bloqué — ${controle.blocages.join(" ")}`);
  }

  // Référence à partir du nombre de décomptes existants du marché.
  // `deletedAt: null` comme partout ailleurs : sans ce filtre la numérotation
  // comptait les décomptes logiquement supprimés et divergeait de la série
  // produite par la saisie interne, qui l'applique.
  const nbExistants = await prisma.decompte.count({ where: { marcheId, deletedAt: null } });
  const numStr = String(nbExistants + 1).padStart(2, "0");
  const typeCode = type === "PARTIEL" ? "DP" : type === "FINAL" ? "DF" : type === "AVANCE" ? "DA" : "DI";
  const reference = `${marche.reference}-${typeCode}-${numStr}`;

  // Numéro de dossier — identifiant métier employé en aval : en-tête des
  // documents officiels, situation de marché, recherche globale. Le dépôt
  // portail ne le posait pas : ces dossiers s'imprimaient « N° Dossier — » et
  // restaient introuvables par leur numéro.
  const annee = new Date().getFullYear();
  const nbDossiers = await prisma.decompte.count({ where: { numeroDossier: { startsWith: `ED-${annee}-` } } });
  const numeroDossier = `ED-${annee}-${String(nbDossiers + 1).padStart(4, "0")}`;

  // Le circuit doit exister AVANT la création : un décompte déposé sans
  // circuit est un dossier perdu (constat de la revue : dépôts SOUMIS qui
  // n'entraient jamais dans la chaîne de validation).
  const definition = await prisma.workflowDefinition.findFirst({
    where: { financement: marche.financement, actif: true },
    include: { etapes: { orderBy: { ordre: "asc" } } },
  });
  if (!definition) throw new ApiError(400, `Aucun circuit défini pour le financement ${marche.financement}.`);

  // Montant HT : recalculé ligne à ligne par le serveur, quantité × prix
  // unitaire en arithmétique entière (aucune multiplication flottante, arrondi
  // au franc le plus proche). Les agrégats éventuellement envoyés par le client
  // ont été écartés par le schéma : ils ne peuvent pas influencer le montant.
  const montantsLignes = lignes.map((l, i) => {
    const montant = calculerMontantLigneGnf(l.quantite, l.prixUnitaire);
    if (montant <= 0n) throw new ApiError(400, `La ligne ${i + 1} produit un montant nul`);
    return montant;
  });
  const htSaisi = montantsLignes.reduce((s, m) => s + m, 0n);

  // Cascade fiscale par le moteur de règles officiel (A1-A7) : mêmes taux que
  // le marché, mêmes formules que la saisie interne, snapshot figé pour rejeu.
  // A4 — report de l'excédent de pénalités (décision DAF du 26/08/2026) : le
  // dépôt absorbe le report en attente du décompte précédent du marché.
  const reportPrecedent = await prisma.decompte.findFirst({
    where: { marcheId, deletedAt: null, penalitesReporteesGnf: { gt: 0n } },
    orderBy: { createdAt: "desc" },
    select: { id: true, penalitesReporteesGnf: true },
  });
  // ── Dossier de pièces : présence réelle et propriété ──────────────────────
  // Le schéma a garanti que chaque référence est un lien d'upload protégé et
  // que les quatre pièces requises sont là. Reste à vérifier que les fichiers
  // existent vraiment et qu'ils appartiennent bien au déposant — sans quoi une
  // référence devinée rattacherait la pièce d'autrui à son propre décompte.
  const fichiersPieces = pieces.map((p) => getStoredFilenameFromUploadUrl(p.cheminFichier)!);
  const [presences, possedes, dejaRattachee] = await Promise.all([
    Promise.all(fichiersPieces.map(async (f) => {
      try { await access(path.resolve(env.UPLOAD_DIR, f)); return true; } catch { return false; }
    })),
    prisma.auditLog.count({
      where: { userId: req.user!.id, action: "CREATE", entityType: "Upload", entityId: { in: fichiersPieces } },
    }),
    prisma.document.findFirst({
      where: { cheminFichier: { in: pieces.map((p) => p.cheminFichier) } },
      select: { id: true },
    }),
  ]);
  if (presences.some((ok) => !ok)) throw new ApiError(400, "Une pièce du dossier n'a pas été téléversée");
  if (possedes !== fichiersPieces.length) throw new ApiError(403, "Une pièce du dossier ne vous appartient pas");
  if (dejaRattachee) throw new ApiError(409, "Une pièce du dossier est déjà rattachée à un autre décompte");

  // Cumul des périodes antérieures du marché — sans lui, chaque dépôt se croit
  // le premier : `cumulActuelHtGnf` ne portait que la période courante, et le
  // suivi d'avancement du marché repartait de zéro à chaque décompte.
  const anterieurs = await prisma.decompte.aggregate({
    where: { marcheId, deletedAt: null, statut: { not: "REJETE" } },
    _sum: { montantPeriodeHtGnf: true },
  });
  const cumulPrecedentHtGnf = anterieurs._sum.montantPeriodeHtGnf ?? 0n;
  const penalitesImputees = reportPrecedent?.penalitesReporteesGnf ?? 0n;

  // Plafond du marché. Le seul canal où l'entreprise saisit elle-même ses
  // montants était aussi le seul à échapper au garde-fou anti-dépassement :
  // les contrôles automatiques ne tournent que sur la saisie interne, et le
  // contrôle d'éligibilité ne regarde ni cumul ni montant du contrat. Un dépôt
  // pouvait donc porter le cumul bien au-delà du contrat et remonter jusqu'à
  // l'ordonnancement sans qu'aucun écran ne le signale.
  const plafondMarche = marche.montantActualiseGnf ?? marche.montantInitialGnf;
  if (plafondMarche > 0n && cumulPrecedentHtGnf + htSaisi > plafondMarche) {
    const depassement = cumulPrecedentHtGnf + htSaisi - plafondMarche;
    throw new ApiError(400,
      `Plafond du marché dépassé de ${formaterMontant(depassement)} GNF : `
      + `cumul ${formaterMontant(cumulPrecedentHtGnf + htSaisi)} GNF pour un contrat de ${formaterMontant(plafondMarche)} GNF. `
      + "Un avenant est nécessaire avant ce dépôt.");
  }

  const regles = await chargerRegles({ marcheId, bailleur: marche.financement, typeMarche: marche.type });
  const calc = calcDecompteRegles({
    montantPeriodeHtGnf: htSaisi,
    cumulPrecedentHtGnf,
    penalites: penalitesImputees,
    tauxTva: marche.tauxTva ?? undefined,
    tauxRetenueGarantie: marche.tauxRetenueGarantie ?? undefined,
    tauxAvance: marche.tauxAvance ?? undefined,
  }, regles);

  // Décompte DEPOSE + instance du circuit unifié : une seule transaction.
  // L'ancien code créait SOUMIS + instance BPMN (moteur hérité, sans RG9).
  const decompte = await prisma.$transaction(async (tx) => {
    const d = await tx.decompte.create({
      data: {
        reference,
        type,
        statut: "DEPOSE" as never,
        marcheId,
        entrepriseId,
        observations,
        // Champs que le moteur de calcul ne RENVOIE pas : il les reçoit en
        // entrée. Les omettre laissait `montantPeriodeHtGnf` au défaut 0
        // pendant que TVA, TTC et net étaient calculés dessus — décompte
        // arithmétiquement incohérent, non rejouable par l'audit, et invisible
        // dans la consommation du marché. `penalites` porte le total imputé
        // (ici le report absorbé), sans quoi la créance disparaît sans trace.
        montantPeriodeHtGnf: htSaisi,
        cumulPrecedentHtGnf,
        penalites: penalitesImputees,
        // §5 CDC — horodatage et numéro de dossier, comme la saisie interne.
        // Sans dateDepot, le dossier sort du suivi des retards de la DG (les
        // NULL passent en dernier) et la situation de marché imprime la date
        // du jour comme date de dépôt. Sans numéro, il est introuvable par la
        // recherche globale, qui interroge référence OU numéro de dossier.
        dateDepot: new Date(),
        numeroDossier,
        // ⚠️ LIMITE CONNUE : le détail des lignes déclarées (désignation,
        // unité, quantité, prix unitaire) n'est PAS conservé. Le modèle
        // DecompteLigne est bâti sur le bordereau de prix du marché — il exige
        // codeArticle et quantiteContrat, que le portail ne demande pas à
        // l'entreprise. Les y forcer inventerait des données. Conséquence
        // assumée en attendant l'arbitrage : le contrôleur ne voit que le
        // montant total et doit ouvrir les pièces jointes pour le détail.
        ...calc,
        reglesSnapshot: construireSnapshot(regles, "GLOBAL") as never,
        // Bordereau déduit des pièces réellement jointes, via le référentiel
        // unique : le circuit de validation lira exactement ce que le dépôt a
        // exigé. Auparavant le portail laissait ce champ nul et le contrôle
        // des pièces à la soumission était donc entièrement sauté.
        piecesObligatoires: bordereauDepuisTypes(pieces.map((p) => p.type)) as never,
        // Les pièces deviennent des documents rattachés — pas des cases cochées.
        documents: {
          create: pieces.map((p) => ({
            type: clePourType(p.type),
            nom: p.nom,
            description: p.legende || undefined,
            cheminFichier: p.cheminFichier,
            mimeType: p.mimeType,
            tailleOctets: p.tailleOctets,
            uploadePar: req.user!.id,
          })),
        },
      },
    });
    const instance = await tx.workflowInstance.create({
      data: { definitionId: definition.id, decompteId: d.id, etapeActuelle: 0, statut: "EN_COURS" },
    });
    // Le dépôt est TRACÉ comme une action de circuit, au même titre que les
    // deux autres portes d'entrée. Sans cette ligne, le déposant n'apparaît
    // dans aucun des deux registres que lit la règle de séparation des tâches
    // (RG9) : il pourrait ensuite valider la première étape de son propre
    // dossier sans rencontrer d'obstacle.
    if (definition.etapes.length > 0) {
      await tx.workflowAction.create({
        data: {
          instanceId: instance.id, etapeId: definition.etapes[0].id, userId: req.user!.id,
          decision: "SOUMISSION", commentaire: "Dépôt du décompte par l'entreprise (portail)",
        },
      });
    }
    // Consommer le report absorbé : la créance reportable passe au dépôt
    // courant (calc.penalitesReporteesGnf). La condition `gt: 0` rend la
    // consommation atomique : deux dépôts simultanés ne peuvent pas absorber
    // deux fois la même créance — le second ne met à jour aucune ligne.
    if (reportPrecedent) {
      await tx.decompte.updateMany({
        where: { id: reportPrecedent.id, penalitesReporteesGnf: { gt: 0n } },
        data: { penalitesReporteesGnf: 0n },
      });
    }
    await logAudit({
      userId: req.user!.id, action: "CREATE", entityType: "Decompte", entityId: d.id,
      after: { via: "portail", reference, statut: "DEPOSE", origine: "portail-entreprise", wfInstanceId: instance.id, reportPenalitesAbsorbeGnf: (reportPrecedent?.penalitesReporteesGnf ?? 0n).toString() }, tx,
    });
    return { d, instance };
  });

  // Notification du premier intervenant du circuit (non bloquant).
  if (definition.etapes.length > 0) {
    await notifyWorkflowStep(definition.etapes[0], reference, decompte.instance.id).catch(() => {});
  }

  res.status(201).json({
    message: `Décompte déposé — circuit « ${definition.nom} » démarré, ${definition.etapes.length} étapes.`,
    decompte: decompte.d,
    avertissements: controle.avertissements,
  });
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
