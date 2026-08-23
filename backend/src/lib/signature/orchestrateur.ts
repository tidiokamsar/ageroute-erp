/**
 * Orchestrateur de signature — le seul chemin par lequel un document signé
 * peut exister.
 *
 * Séquence (PLAN-SIGNATURE-NUMERIQUE §1) :
 *   1. garde-fous de configuration — refus net si la signature n'est pas active ;
 *   2. génération CANONIQUE du dossier côté serveur, gelé, avec filigrane
 *      imposé hors mode provider ;
 *   3. empreinte SHA-256 du document tel qu'il part ;
 *   4. signature par l'adaptateur prestataire — l'ERP ne voit aucune clé ;
 *   5. empreinte du document revenu ;
 *   6. validation par le service DSS, ou NON_VERIFIE dit en clair ;
 *   7. conservation du PDF signé hors du dépôt documentaire ordinaire ;
 *   8. ligne d'exploitation + audit, dans une transaction.
 */
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Request } from "express";
import { prisma } from "../prisma";
import { env } from "../../config/env";
import { ApiError } from "../../middleware/error.middleware";
import { logAudit } from "../audit";
import { chargerConfigurationSignature } from "./configuration";
import { fabriquerPrestataire, fabriquerValidation } from "./fabrique";
import { genererDossierDecompte } from "../../modules/documents/dossier-decompte.routes";

const SOUS_DOSSIER = "signatures";

function repertoireSignatures(): string {
  const dir = path.join(env.UPLOAD_DIR, SOUS_DOSSIER);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

export async function signerDecompte(req: Request, decompteId: string, motif: string) {
  if (!req.user) throw new ApiError(401, "Authentification requise");

  const cfg = await chargerConfigurationSignature();
  if (!cfg.actif) throw new ApiError(409, `Signature impossible — ${cfg.motifBlocage}`);

  const signataire = await prisma.user.findFirst({
    where: { id: req.user.id, actif: true },
    select: { id: true, email: true, nomComplet: true, nom: true, prenom: true, fonction: true, role: true },
  });
  if (!signataire) throw new ApiError(403, "Signataire introuvable ou inactif");
  // Principe n°5 de l'audit : une signature est celle d'une personne. Les
  // comptes de fonction n'ont pas de prénom ; le seul toléré est la BCRG, qui
  // ne signe pas de décompte. On refuse plutôt que de signer « Direction ».
  if (!signataire.prenom || !signataire.nom) {
    throw new ApiError(403, "Ce compte n'est pas nominatif (nom et prénom absents) : il ne peut pas signer. Voir L0-FICHE-DESIGNATION-SIGNATAIRES.md.");
  }

  // 2. Génération canonique — le périmètre est contrôlé dans genererDossierDecompte.
  const filigrane = cfg.filigraneImpose ? cfg.filigraneTexte : undefined;
  const dossier = await genererDossierDecompte(req, decompteId, { filigrane });
  const empreinteSource = sha256(dossier.pdf);

  // 4. Signature par le prestataire.
  const prestataire = fabriquerPrestataire(cfg);
  const resultat = await prestataire.signerPdf(dossier.pdf, {
    reference: dossier.reference,
    signataire: { id: signataire.id, email: signataire.email, nom: `${signataire.prenom} ${signataire.nom}`, role: signataire.role, qualite: signataire.fonction ?? undefined },
    niveau: cfg.niveau,
    motif,
    tsaUrl: cfg.tsaUrl || undefined,
  });
  const empreinteSignee = sha256(resultat.pdfSigne);

  // 6. Validation.
  const validation = fabriquerValidation(cfg);
  const nomFichier = `dossier-${dossier.reference}-${randomUUID().slice(0, 8)}.pdf`;
  let indication: string = "NON_VERIFIE";
  let rapport: Record<string, unknown> = {};
  try {
    const v = await validation.validerPdf(resultat.pdfSigne, nomFichier);
    indication = v.indication; rapport = v.rapport;
  } catch (e) {
    indication = "NON_VERIFIE";
    rapport = { erreur: `Validation impossible : ${(e as Error).message}` };
  }

  // 7. Conservation.
  const chemin = path.join(repertoireSignatures(), nomFichier);
  fs.writeFileSync(chemin, resultat.pdfSigne);

  // 8. Ligne d'exploitation + audit, ensemble.
  const ligne = await prisma.$transaction(async (tx) => {
    const l = await tx.sigDocumentFinalise.create({
      data: {
        decompteId: dossier.decompteId,
        reference: dossier.reference,
        cheminFichier: `${SOUS_DOSSIER}/${nomFichier}`,
        sha256Source: empreinteSource,
        sha256Signe: empreinteSignee,
        mode: cfg.mode,
        prestataire: resultat.prestataire,
        niveauPades: resultat.niveauObtenu,
        filigrane: !!filigrane,
        tsaUrl: cfg.tsaUrl || null,
        validationIndication: indication,
        rapportValidation: rapport as object,
        signeParId: signataire.id,
        signeParEmail: signataire.email,
        signeParRole: signataire.role,
        signeParQualite: signataire.fonction,
      },
    });
    await logAudit({
      userId: signataire.id, action: "SIGN", entityType: "Decompte", entityId: dossier.decompteId,
      after: { sigDocumentId: l.id, mode: cfg.mode, prestataire: resultat.prestataire, niveau: resultat.niveauObtenu, filigrane: !!filigrane, validation: indication, sha256Signe: empreinteSignee, simule: prestataire.simule },
      tx,
    });
    return l;
  });

  return {
    id: ligne.id,
    reference: ligne.reference,
    mode: cfg.mode,
    prestataire: resultat.prestataire,
    simule: prestataire.simule,
    niveauPades: resultat.niveauObtenu,
    filigrane: !!filigrane,
    validationIndication: indication,
    sha256Signe: empreinteSignee,
    valeurJuridique: cfg.mode === "provider" ? "À ÉTABLIR — sous réserve de la porte de production" : "AUCUNE — laboratoire / simulation",
  };
}

/** État complet, pour l'écran d'administration : configuration + santé des services. */
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

export function cheminAbsolu(cheminFichier: string): string {
  const abs = path.resolve(env.UPLOAD_DIR, cheminFichier);
  if (!abs.startsWith(path.resolve(env.UPLOAD_DIR) + path.sep)) throw new ApiError(404, "Document introuvable");
  return abs;
}
