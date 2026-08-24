/**
 * Orchestrateur de signature — flux en DEUX TEMPS, intégré aux documents métier.
 *
 * Exigence du 23/08/2026 (« SIGNATURE INTÉGRÉE AUX DOCUMENTS ») : jamais de
 * signature en un clic. Le signataire voit le PDF EXACT qui sera signé, son
 * empreinte, son identité et l'étape ; il consent explicitement ; il se
 * réauthentifie ; alors seulement la signature est apposée — sur les octets
 * gelés, pas sur une régénération.
 *
 *   PRÉPARER  : garde-fous → étape active du circuit → RG9 → gel du PDF (ou
 *               reprise du dernier PDF signé de la chaîne) → vérification des
 *               signatures précédentes → demande avec empreinte et expiration.
 *   CONFIRMER : consentement + réauthentification → réservation atomique de la
 *               demande (anti double-clic, anti-rejeu) → recomparaison de
 *               l'empreinte → signature INCRÉMENTALE → validation → conservation
 *               → clôture de l'étape du circuit → notification du suivant.
 *
 * Immutabilité (§7) : dès la première signature, le document courant est le PDF
 * signé conservé — jamais régénéré. La signature suivante part de lui.
 */
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { Request } from "express";
import { prisma } from "../prisma";
import { env } from "../../config/env";
import { ApiError } from "../../middleware/error.middleware";
import { logAudit } from "../audit";
import { rolesEffectifs } from "../delegations";
import { chargerRegles, booleenRegles } from "../regles";
import { verifierSeparationTaches, statutPourRoleEtape, libelleEtapeValidation } from "../moteur-validation";
import { etapesCircuitFinancier } from "../circuit-definitions";
import { notifyWorkflowStep } from "../../modules/notifications/notifications.service";
import { chargerConfigurationSignature } from "./configuration";
import { fabriquerPrestataire, fabriquerValidation } from "./fabrique";
import { genererDossierDecompte } from "../../modules/documents/dossier-decompte.routes";

const SOUS_DOSSIER = "signatures";
const VALIDITE_DEMANDE_MS = 15 * 60 * 1000;

function repertoire(...segments: string[]): string {
  const dir = path.join(env.UPLOAD_DIR, SOUS_DOSSIER, ...segments);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

export function cheminAbsolu(cheminFichier: string): string {
  const abs = path.resolve(env.UPLOAD_DIR, cheminFichier);
  if (!abs.startsWith(path.resolve(env.UPLOAD_DIR) + path.sep)) throw new ApiError(404, "Document introuvable");
  return abs;
}

async function signataireNominatif(userId: string) {
  const u = await prisma.user.findFirst({
    where: { id: userId, actif: true },
    select: { id: true, email: true, nomComplet: true, nom: true, prenom: true, fonction: true, role: true, passwordHash: true },
  });
  if (!u) throw new ApiError(403, "Signataire introuvable ou inactif");
  // §2 et §13 : un compte fonctionnel peut RECEVOIR la tâche, jamais signer.
  if (!u.prenom || !u.nom) {
    throw new ApiError(403, "Ce compte n'est pas nominatif (nom et prénom absents) : il ne peut pas signer. La personne qui traite doit utiliser son propre compte.");
  }
  return u;
}

/** Étape active du circuit pour ce décompte, et droit du signataire sur elle. */
async function etapeActivePour(userId: string, role: string, decompteId: string) {
  const instance = await prisma.workflowInstance.findFirst({
    where: { decompteId, statut: "EN_COURS" },
    include: { definition: { include: { etapes: { orderBy: { ordre: "asc" } } } }, decompte: { select: { reference: true, traitementSuspendu: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (!instance) throw new ApiError(409, "Ce document n'est pas dans un circuit de validation actif : rien à signer.");
  if (instance.decompte?.traitementSuspendu) throw new ApiError(409, "Traitement suspendu par la Direction Générale.");
  const etape = instance.definition.etapes[instance.etapeActuelle];
  if (!etape) throw new ApiError(409, "Aucune étape courante sur ce circuit.");
  const roles = await rolesEffectifs(userId, role);
  if (!roles.includes(etape.roleRequis)) {
    throw new ApiError(403, `L'étape courante « ${etape.nom} » attend le rôle ${etape.roleRequis} — ce n'est pas votre étape.`);
  }
  return { instance, etape };
}

/** RG9 sur les deux registres, comme dans le moteur de validation. */
async function verifierRg9(instanceId: string, decompteId: string, userId: string, marcheId: string | null) {
  const regles = await chargerRegles({ marcheId: marcheId ?? undefined });
  const [actions, validations] = await Promise.all([
    prisma.workflowAction.findMany({ where: { instanceId }, select: { userId: true } }),
    prisma.decompteValidation.findMany({ where: { decompteId }, select: { validePar: true } }),
  ]);
  const rg9 = verifierSeparationTaches({
    utilisateurId: userId,
    intervenantsAnterieurs: [...actions.map((a) => a.userId), ...validations.map((v) => v.validePar)],
    decision: "APPROUVE",
    active: booleenRegles(regles, "WF_SEPARATION_TACHES"),
  });
  if (!rg9.autorise) throw new ApiError(403, rg9.motif!);
}

// ─────────────────────────────── PRÉPARER ────────────────────────────────────
export async function preparerSignatureDecompte(req: Request, decompteId: string) {
  if (!req.user) throw new ApiError(401, "Authentification requise");
  const cfg = await chargerConfigurationSignature();
  if (!cfg.actif) throw new ApiError(409, `Signature impossible — ${cfg.motifBlocage}`);

  const signataire = await signataireNominatif(req.user.id);
  const { instance, etape } = await etapeActivePour(signataire.id, signataire.role, decompteId);
  const marcheId = (await prisma.decompte.findUnique({ where: { id: decompteId }, select: { marcheId: true } }))?.marcheId ?? null;
  await verifierRg9(instance.id, decompteId, signataire.id, marcheId);

  // §11 — aucun processus concurrent : une demande vivante bloque les autres.
  const enCours = await prisma.sigDemandeSignature.findFirst({
    where: { decompteId, statut: { in: ["EN_ATTENTE", "EN_COURS"] }, expiresAt: { gt: new Date() } },
  });
  if (enCours && enCours.signataireId !== signataire.id) {
    throw new ApiError(409, "Un autre processus de signature est en cours sur ce document.");
  }
  if (enCours) {
    // Le même signataire ré-ouvre sa fenêtre : on lui rend SA demande.
    return chargerDemandePourAffichage(enCours.id, signataire);
  }

  // §6–§7 — base de la signature : le DERNIER PDF SIGNÉ de la chaîne s'il
  // existe (immutabilité + incrémental), sinon le dossier généré et GELÉ.
  const precedent = await prisma.sigDocumentFinalise.findFirst({ where: { decompteId }, orderBy: { rang: "desc" } });
  let cheminGele: string;
  let empreinte: string;
  let rang: number;
  if (precedent) {
    const abs = cheminAbsolu(precedent.cheminFichier);
    if (!fs.existsSync(abs)) throw new ApiError(409, "Le document signé précédent est absent du stockage — chaîne rompue, alerte à remonter.");
    const octets = fs.readFileSync(abs);
    if (sha256(octets) !== precedent.sha256Signe) {
      await logAudit({ userId: signataire.id, action: "REJECT", entityType: "Decompte", entityId: decompteId, after: { alerte: "EMPREINTE_CHAINE_DIVERGENTE", document: precedent.id } });
      throw new ApiError(409, "L'empreinte du document signé précédent ne correspond plus au fichier : signature bloquée, incident à traiter.");
    }
    // §6 — vérifier les signatures précédentes avant d'en ajouter une.
    const validation = fabriquerValidation(cfg);
    try {
      const v = await validation.validerPdf(octets, `chaine-${precedent.reference}.pdf`);
      if (v.indication === "FAILED") {
        await logAudit({ userId: signataire.id, action: "REJECT", entityType: "Decompte", entityId: decompteId, after: { alerte: "SIGNATURE_PRECEDENTE_INVALIDE", document: precedent.id } });
        throw new ApiError(409, "Une signature précédente est INVALIDE : la poursuite du circuit est bloquée et une alerte a été consignée.");
      }
      if (v.indication === "INDETERMINATE" && cfg.mode === "provider") {
        throw new ApiError(409, "Une signature précédente est INDÉTERMINÉE : en mode prestataire, la poursuite est bloquée.");
      }
      // En laboratoire, INDETERMINATE est l'état attendu tant que la chaîne de
      // confiance de test n'est pas enrôlée : consigné, non bloquant.
    } catch (e) {
      if (e instanceof ApiError) throw e;
      // Validateur injoignable : on le dit, on ne bloque pas la chaîne en labo.
      if (cfg.mode === "provider") throw new ApiError(409, "Le service de validation est injoignable : signature bloquée en mode prestataire.");
    }
    cheminGele = precedent.cheminFichier;
    empreinte = precedent.sha256Signe;
    rang = precedent.rang + 1;
  } else {
    const filigrane = cfg.filigraneImpose ? cfg.filigraneTexte : undefined;
    const dossier = await genererDossierDecompte(req, decompteId, { filigrane });
    const nom = `gele-${dossier.reference}-${randomUUID().slice(0, 8)}.pdf`;
    fs.writeFileSync(path.join(repertoire("geles"), nom), dossier.pdf);
    cheminGele = path.join(SOUS_DOSSIER, "geles", nom);
    empreinte = sha256(dossier.pdf);
    rang = 1;
  }

  const demande = await prisma.sigDemandeSignature.create({
    data: {
      decompteId,
      cheminFichier: cheminGele,
      sha256: empreinte,
      signataireId: signataire.id,
      etape: etape.nom,
      roleEtape: etape.roleRequis,
      niveau: cfg.niveau,
      mode: cfg.mode,
      rang,
      expiresAt: new Date(Date.now() + VALIDITE_DEMANDE_MS),
    },
  });
  await logAudit({ userId: signataire.id, action: "CREATE", entityType: "SigDemande", entityId: demande.id, after: { decompteId, etape: etape.nom, rang, sha256: empreinte } });
  return chargerDemandePourAffichage(demande.id, signataire);
}

async function chargerDemandePourAffichage(demandeId: string, signataire: { id: string; prenom: string | null; nom: string | null; fonction: string | null; role: string }) {
  const d = await prisma.sigDemandeSignature.findUnique({ where: { id: demandeId } });
  if (!d) throw new ApiError(404, "Demande introuvable");
  const decompte = await prisma.decompte.findUnique({ where: { id: d.decompteId }, select: { reference: true } });
  return {
    demandeId: d.id,
    document: { reference: decompte?.reference ?? d.decompteId, version: `chaîne rang ${d.rang}`, sha256: d.sha256 },
    signataire: { nom: `${signataire.prenom} ${signataire.nom}`, qualite: signataire.fonction ?? "(qualité non renseignée)", role: signataire.role },
    etape: d.etape,
    niveau: d.niveau,
    mode: d.mode,
    date: new Date().toISOString(),
    expiresAt: d.expiresAt.toISOString(),
    consentement: "Je confirme avoir consulté le document dans son intégralité et j'accepte d'apposer ma signature électronique sur cette version exacte.",
    urlPdf: `/api/signature-numerique/demandes/${d.id}/pdf`,
  };
}

/** Le PDF exact d'une demande — pour la fenêtre de consultation, rien d'autre. */
export async function lireDemandePdf(req: Request, demandeId: string): Promise<{ chemin: string; reference: string }> {
  if (!req.user) throw new ApiError(401, "Authentification requise");
  const d = await prisma.sigDemandeSignature.findUnique({ where: { id: demandeId } });
  if (!d || d.signataireId !== req.user.id) throw new ApiError(404, "Demande introuvable");
  if (d.statut !== "EN_ATTENTE" || d.expiresAt < new Date()) throw new ApiError(410, "Demande expirée ou déjà traitée — recommencez depuis le document.");
  return { chemin: cheminAbsolu(d.cheminFichier), reference: d.decompteId };
}

// ─────────────────────────────── CONFIRMER ───────────────────────────────────
export async function confirmerSignature(req: Request, demandeId: string, corps: { motDePasse: string; consentement: boolean }) {
  if (!req.user) throw new ApiError(401, "Authentification requise");
  if (corps.consentement !== true) throw new ApiError(400, "Le consentement explicite est requis : cochez la déclaration après avoir consulté le document.");

  const signataire = await signataireNominatif(req.user.id);
  // §3.11 — réauthentification : le mot de passe du compte, revérifié à l'instant.
  const motDePasseValide = await bcrypt.compare(corps.motDePasse, signataire.passwordHash);
  if (!motDePasseValide) {
    await logAudit({ userId: signataire.id, action: "LOGIN_FAILED", entityType: "SigDemande", entityId: demandeId, after: { motif: "reauthentification_echouee" } });
    throw new ApiError(401, "Réauthentification échouée : mot de passe incorrect.");
  }

  // §11 — réservation ATOMIQUE : un seul appel gagne, double clic et rejeu perdent.
  const reserve = await prisma.sigDemandeSignature.updateMany({
    where: { id: demandeId, signataireId: signataire.id, statut: "EN_ATTENTE", expiresAt: { gt: new Date() } },
    data: { statut: "EN_COURS" },
  });
  if (reserve.count !== 1) throw new ApiError(409, "Demande expirée, déjà signée ou introuvable — aucun document n'a été signé.");

  const demande = await prisma.sigDemandeSignature.findUnique({ where: { id: demandeId } });
  if (!demande) throw new ApiError(404, "Demande introuvable");

  const annuler = async (motif: string, message: string): Promise<never> => {
    await prisma.sigDemandeSignature.update({ where: { id: demande.id }, data: { statut: "ANNULEE", motifAnnulation: motif } });
    throw new ApiError(409, message);
  };

  const cfg = await chargerConfigurationSignature();
  if (!cfg.actif) return annuler("configuration_inactive", `Signature impossible — ${cfg.motifBlocage}`);
  if (cfg.mode !== demande.mode) return annuler("mode_change", "Le mode de signature a changé depuis la consultation. Aucune signature n'a été apposée.");

  // §2 — l'étape doit être ENCORE active : personne n'a validé entre-temps.
  const { instance, etape } = await etapeActivePour(signataire.id, signataire.role, demande.decompteId).catch(async (e) => {
    await prisma.sigDemandeSignature.update({ where: { id: demande.id }, data: { statut: "ANNULEE", motifAnnulation: "etape_plus_active" } });
    throw e;
  });
  if (etape.nom !== demande.etape) return annuler("etape_changee", "L'étape du circuit a changé depuis la consultation. Aucune signature n'a été apposée.");
  const marcheId = (await prisma.decompte.findUnique({ where: { id: demande.decompteId }, select: { marcheId: true } }))?.marcheId ?? null;
  await verifierRg9(instance.id, demande.decompteId, signataire.id, marcheId).catch(async (e) => {
    await prisma.sigDemandeSignature.update({ where: { id: demande.id }, data: { statut: "ANNULEE", motifAnnulation: "rg9" } });
    throw e;
  });

  // §11 — recalcul de l'empreinte des octets gelés, comparaison avec CELLE
  // PRÉSENTÉE au signataire. Toute divergence = message imposé, mot pour mot.
  const abs = cheminAbsolu(demande.cheminFichier);
  if (!fs.existsSync(abs)) return annuler("fichier_absent", "Le document a changé depuis sa consultation. Aucune signature n'a été apposée. Veuillez consulter la nouvelle version.");
  const octets = fs.readFileSync(abs);
  if (sha256(octets) !== demande.sha256) {
    await logAudit({ userId: signataire.id, action: "REJECT", entityType: "SigDemande", entityId: demande.id, after: { alerte: "SUBSTITUTION_PDF" } });
    return annuler("empreinte_divergente", "Le document a changé depuis sa consultation. Aucune signature n'a été apposée. Veuillez consulter la nouvelle version.");
  }

  // Signature INCRÉMENTALE des octets exacts consultés.
  const prestataire = fabriquerPrestataire(cfg);
  const resultat = await prestataire.signerPdf(octets, {
    reference: demande.decompteId,
    signataire: { id: signataire.id, email: signataire.email, nom: `${signataire.prenom} ${signataire.nom}`, role: signataire.role, qualite: signataire.fonction ?? undefined },
    niveau: cfg.niveau,
    motif: `Signature de l'étape « ${demande.etape} »`,
    tsaUrl: cfg.tsaUrl || undefined,
  });
  const empreinteSignee = sha256(resultat.pdfSigne);

  // Vérification immédiate de la signature produite.
  const validation = fabriquerValidation(cfg);
  let indication = "NON_VERIFIE";
  let rapport: Record<string, unknown> = {};
  try {
    const v = await validation.validerPdf(resultat.pdfSigne, `signe-${demande.id}.pdf`);
    indication = v.indication; rapport = v.rapport;
  } catch (e) { rapport = { erreur: `Validation impossible : ${(e as Error).message}` }; }

  const nomSigne = `signe-${demande.decompteId.slice(0, 8)}-r${demande.rang}-${randomUUID().slice(0, 8)}.pdf`;
  fs.writeFileSync(path.join(repertoire(), nomSigne), resultat.pdfSigne);
  const reference = (await prisma.decompte.findUnique({ where: { id: demande.decompteId }, select: { reference: true } }))?.reference ?? demande.decompteId;

  // Transaction : conservation + clôture de la demande + CLÔTURE DE L'ÉTAPE
  // (action, projection, avancement, statut) + audit — tout ou rien.
  const dernierEtape = instance.etapeActuelle + 1 >= instance.definition.etapes.length;
  const prochaineEtape = dernierEtape ? null : instance.definition.etapes[instance.etapeActuelle + 1];
  const ligne = await prisma.$transaction(async (tx) => {
    const l = await tx.sigDocumentFinalise.create({
      data: {
        decompteId: demande.decompteId, reference, cheminFichier: `${SOUS_DOSSIER}/${nomSigne}`,
        sha256Source: demande.sha256, sha256Signe: empreinteSignee,
        mode: cfg.mode, prestataire: resultat.prestataire, niveauPades: resultat.niveauObtenu,
        filigrane: cfg.filigraneImpose, tsaUrl: cfg.tsaUrl || null,
        validationIndication: indication, rapportValidation: rapport as object,
        signeParId: signataire.id, signeParEmail: signataire.email, signeParRole: signataire.role, signeParQualite: signataire.fonction,
        rang: demande.rang, etape: demande.etape, demandeId: demande.id,
      },
    });
    await tx.sigDemandeSignature.update({ where: { id: demande.id }, data: { statut: "SIGNEE", confirmeAt: new Date() } });
    await tx.workflowAction.create({
      data: { instanceId: instance.id, etapeId: etape.id, userId: signataire.id, decision: "APPROUVE", commentaire: `Signature électronique (${cfg.mode}, ${resultat.prestataire}, sha256 ${empreinteSignee.slice(0, 16)}…)` },
    });
    await tx.decompteValidation.create({
      data: {
        decompteId: demande.decompteId, etape: libelleEtapeValidation(etape.roleRequis), decision: "APPROUVE",
        commentaire: `Signature électronique de l'étape « ${demande.etape} »`,
        validePar: signataire.id, valideNom: signataire.email, valideRole: signataire.role, signatureRef: l.id,
      },
    });
    if (dernierEtape) {
      await tx.workflowInstance.update({ where: { id: instance.id }, data: { statut: "APPROUVE", etapeActuelle: instance.etapeActuelle + 1 } });
      await tx.decompte.update({ where: { id: demande.decompteId }, data: { statut: "VALIDE_DG" } });
    } else {
      await tx.workflowInstance.update({ where: { id: instance.id }, data: { etapeActuelle: instance.etapeActuelle + 1 } });
      await tx.decompte.update({ where: { id: demande.decompteId }, data: { statut: statutPourRoleEtape(prochaineEtape!.roleRequis) } });
    }
    await logAudit({
      userId: signataire.id, action: "SIGN", entityType: "Decompte", entityId: demande.decompteId,
      after: { sigDocumentId: l.id, demandeId: demande.id, etape: demande.etape, rang: demande.rang, mode: cfg.mode, prestataire: resultat.prestataire, validation: indication, sha256Signe: empreinteSignee, simule: prestataire.simule },
      tx,
    });
    return l;
  });

  // Effets non transactionnels — rejoignables, jamais garants de cohérence.
  if (dernierEtape) {
    try {
      const dec = await prisma.decompte.findUnique({ where: { id: demande.decompteId }, include: { marche: true } });
      if (dec && !await prisma.circuitFinancier.findUnique({ where: { decompteId: dec.id } })) {
        const fin = dec.marche.financement;
        const typeCircuit = fin === "FER" ? "FER" : fin === "BUDGET_NATIONAL" ? "BUDGET" : "BAILLEUR";
        const etapesDefs = etapesCircuitFinancier(fin).map((e) => ({ ordre: e.ordre, nom: e.nom, roleOuService: e.roleOuService }));
        await prisma.circuitFinancier.create({ data: { decompteId: dec.id, type: typeCircuit, bailleurNom: dec.marche.bailleur ?? undefined, etapes: { create: etapesDefs } } });
        await prisma.decompte.update({ where: { id: dec.id }, data: { statut: "EN_CIRCUIT_FINANCIER" } });
      }
    } catch { /* relançable */ }
  } else if (prochaineEtape) {
    await notifyWorkflowStep(prochaineEtape, reference, instance.id).catch(() => {});
  }

  return {
    id: ligne.id,
    reference,
    etape: demande.etape,
    rang: demande.rang,
    etapeSuivante: prochaineEtape?.nom ?? null,
    circuitTermine: dernierEtape,
    mode: cfg.mode,
    prestataire: resultat.prestataire,
    simule: prestataire.simule,
    niveauPades: resultat.niveauObtenu,
    filigrane: cfg.filigraneImpose,
    validationIndication: indication,
    sha256Signe: empreinteSignee,
    valeurJuridique: cfg.mode === "provider" ? "À ÉTABLIR — sous réserve de la porte de production" : "AUCUNE — laboratoire / simulation",
  };
}

// ─────────────────────────────── ÉLIGIBILITÉ ─────────────────────────────────
/** Le bouton « Signer ce document » n'apparaît que si TOUT est réuni (§2). */
export async function eligibiliteSignature(req: Request, decompteId: string) {
  if (!req.user) throw new ApiError(401, "Authentification requise");
  const motifs: string[] = [];
  const cfg = await chargerConfigurationSignature();
  if (!cfg.actif) motifs.push(cfg.motifBlocage!);
  try { await signataireNominatif(req.user.id); } catch (e) { motifs.push((e as ApiError).message); }
  let etapeNom: string | null = null;
  try {
    const { etape, instance } = await etapeActivePour(req.user.id, req.user.role, decompteId);
    etapeNom = etape.nom;
    const marcheId = (await prisma.decompte.findUnique({ where: { id: decompteId }, select: { marcheId: true } }))?.marcheId ?? null;
    await verifierRg9(instance.id, decompteId, req.user.id, marcheId);
  } catch (e) { motifs.push((e as ApiError).message); }
  return { autorise: motifs.length === 0, etape: etapeNom, mode: cfg.mode, motifs };
}

// ─────────────────────────────── ÉTAT ADMIN ──────────────────────────────────
export async function etatSignature() {
  const cfg = await chargerConfigurationSignature();
  const prestataire = fabriquerPrestataire(cfg);
  const validation = fabriquerValidation(cfg);
  const [santePrestataire, santeValidation] = await Promise.all([prestataire.sante(), validation.sante()]);
  return {
    configuration: { ...cfg, ancresConfiance: cfg.ancresConfiance ? `${cfg.ancresConfiance.split("-----BEGIN").length - 1} certificat(s)` : "aucune" },
    prestataire: { nom: prestataire.nom, simule: prestataire.simule, sante: santePrestataire },
    validation: { nom: validation.nom, sante: santeValidation },
    environnement: {
      nodeEnv: process.env.NODE_ENV ?? "development",
      laboratoireAutorise: process.env.SIGNATURE_LAB_AUTORISE === "oui",
      productionAutorisee: process.env.SIGNATURE_PRODUCTION_AUTORISEE === "oui",
    },
    portes: {
      GO_CADRAGE_ARCHITECTURE: "OUVERT",
      GO_LABORATOIRE_HORS_PRODUCTION: cfg.mode === "laboratory" && cfg.actif ? "ACTIF" : "PRÊT — EN ATTENTE D'AUTORISATION",
      NO_GO_SIGNATURE_PRODUCTION: process.env.SIGNATURE_PRODUCTION_AUTORISEE === "oui" ? "LEVÉE (!)" : "MAINTENU",
    },
  };
}
