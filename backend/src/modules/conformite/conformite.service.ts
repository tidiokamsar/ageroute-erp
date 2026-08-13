/**
 * §CDC — Service de conformité entreprise
 * Règle bloquante : une entreprise non conforme ne peut pas soumettre,
 * valider ni être payée sur un décompte.
 *
 * Score 0-100 :
 *   VERT   (≥ 70) → CONFORME     → dossier traitable
 *   ORANGE (40-69)→ A_REGULARISER → en attente de régularisation
 *   ROUGE  (< 40) → BLOQUE        → aucun traitement possible
 *
 * Éléments bloquants absolus (score forcé à 0) :
 *   - estRadie = true
 *   - autoriseContracterEtat = false
 */

import { prisma } from "../../lib/prisma";

interface CritereResult {
  code: string;
  libelle: string;
  poids: number;
  obtenu: number;
  ok: boolean;
  detail?: string;
}

export interface ScoreDetail {
  score: number;
  statut: "CONFORME" | "A_REGULARISER" | "BLOQUE";
  bloquantAbsolu: boolean;
  raisonBlocage?: string;
  criteres: CritereResult[];
}

function dateExpiree(d: Date | null | undefined): boolean {
  if (!d) return true; // pas de date → considérée expirée
  return new Date(d) < new Date();
}

export function calculerScoreDetail(e: {
  nif: string | null;
  numerotva: string | null;
  assujettTVA: boolean;
  regimeFiscal: string | null;
  regulariteFiscale: boolean;
  attestationFiscaleExpire: Date | null;
  regulariteSociale: boolean;
  attestationSocialeExpire: Date | null;
  attestationValide: boolean;
  cautionBancaire: boolean;
  estRadie: boolean;
  autoriseContracterEtat: boolean;
}): ScoreDetail {
  // Blocage absolu
  if (e.estRadie) {
    return {
      score: 0, statut: "BLOQUE", bloquantAbsolu: true,
      raisonBlocage: "Entreprise radiée du registre du commerce",
      criteres: [],
    };
  }
  if (!e.autoriseContracterEtat) {
    return {
      score: 0, statut: "BLOQUE", bloquantAbsolu: true,
      raisonBlocage: "Entreprise non autorisée à contracter avec l'État",
      criteres: [],
    };
  }

  const criteres: CritereResult[] = [];

  // NIF valide (15 pts)
  const nifOk = !!(e.nif && e.nif.trim().length >= 6);
  criteres.push({ code: "NIF", libelle: "NIF valide et renseigné", poids: 15, obtenu: nifOk ? 15 : 0, ok: nifOk,
    detail: nifOk ? `NIF : ${e.nif}` : "NIF absent ou invalide (min 6 caractères)" });

  // TVA (15 pts si assujetti ; crédit si non assujetti)
  let tvaOk = false;
  let tvaPoids = 15;
  if (e.assujettTVA) {
    tvaOk = !!(e.numerotva && e.numerotva.trim().length >= 4);
    criteres.push({ code: "TVA", libelle: "Numéro TVA (assujetti)", poids: tvaPoids, obtenu: tvaOk ? tvaPoids : 0, ok: tvaOk,
      detail: tvaOk ? `N° TVA : ${e.numerotva}` : "Entreprise assujettie TVA mais numéro manquant" });
  } else {
    // Non assujetti → crédit automatique
    tvaOk = true;
    criteres.push({ code: "TVA", libelle: "Régime fiscal (non assujetti TVA)", poids: tvaPoids, obtenu: tvaPoids, ok: true,
      detail: `Régime : ${e.regimeFiscal ?? "Non renseigné"} — non assujetti TVA` });
  }

  // Régularité fiscale (20 pts)
  const fiscOk = e.regulariteFiscale && !dateExpiree(e.attestationFiscaleExpire);
  criteres.push({ code: "FISC", libelle: "Régularité fiscale + attestation valide", poids: 20, obtenu: fiscOk ? 20 : (e.regulariteFiscale ? 10 : 0), ok: fiscOk,
    detail: !e.regulariteFiscale ? "Régularité fiscale non confirmée" :
      dateExpiree(e.attestationFiscaleExpire) ? "Attestation fiscale expirée" : "OK" });

  // Régularité sociale (15 pts)
  const socOk = e.regulariteSociale && !dateExpiree(e.attestationSocialeExpire);
  criteres.push({ code: "SOC", libelle: "Régularité sociale + attestation valide", poids: 15, obtenu: socOk ? 15 : (e.regulariteSociale ? 7 : 0), ok: socOk,
    detail: !e.regulariteSociale ? "Régularité sociale non confirmée" :
      dateExpiree(e.attestationSocialeExpire) ? "Attestation sociale expirée" : "OK" });

  // Documents légaux valides (20 pts)
  const docsOk = e.attestationValide;
  criteres.push({ code: "DOCS", libelle: "Documents légaux (RCCM, agréments, pièces)", poids: 20, obtenu: docsOk ? 20 : 0, ok: docsOk,
    detail: docsOk ? "Documents valides" : "Documents légaux manquants ou non vérifiés" });

  // Caution bancaire (15 pts)
  const cautionOk = e.cautionBancaire;
  criteres.push({ code: "CAUTION", libelle: "Caution / garantie bancaire valide", poids: 15, obtenu: cautionOk ? 15 : 0, ok: cautionOk,
    detail: cautionOk ? "Caution bancaire valide" : "Caution bancaire absente ou expirée" });

  const score = criteres.reduce((s, c) => s + c.obtenu, 0);
  const statut: "CONFORME" | "A_REGULARISER" | "BLOQUE" =
    score >= 70 ? "CONFORME" : score >= 40 ? "A_REGULARISER" : "BLOQUE";

  return { score, statut, bloquantAbsolu: false, criteres };
}

export async function recalculerConformiteEntreprise(
  entrepriseId: string,
  auteur?: string,
  commentaire?: string,
): Promise<ScoreDetail> {
  const e = await prisma.entreprise.findUniqueOrThrow({ where: { id: entrepriseId } });

  const ancien = { score: e.scoreConformite, statut: e.statut as string };
  const detail = calculerScoreDetail(e);
  const motif = detail.bloquantAbsolu ? detail.raisonBlocage :
    detail.criteres.filter(c => !c.ok).map(c => c.libelle).join("; ") || undefined;

  await prisma.entreprise.update({
    where: { id: entrepriseId },
    data: {
      scoreConformite: detail.score,
      statut: detail.statut,
      motifBlocage: motif ?? null,
      dateVerification: new Date(),
    },
  });

  await prisma.conformiteVerification.create({
    data: {
      entrepriseId,
      scoreAvant: ancien.score,
      scoreApres: detail.score,
      statutAvant: ancien.statut,
      statutApres: detail.statut,
      detail: detail.criteres as object[],
      auteur,
      commentaire,
    },
  });

  return detail;
}

// Vérifier la conformité avant tout traitement de décompte
export async function assertEntrepriseConforme(entrepriseId: string): Promise<void> {
  const e = await prisma.entreprise.findUniqueOrThrow({ where: { id: entrepriseId } });
  if (e.estRadie) {
    throw Object.assign(new Error("BLOQUE_CONFORMITE"), {
      statusCode: 403,
      message: "BLOCAGE CONFORMITÉ — Entreprise radiée du registre du commerce. Dépôt, validation et paiement impossibles.",
    });
  }
  if (!e.autoriseContracterEtat) {
    throw Object.assign(new Error("BLOQUE_CONFORMITE"), {
      statusCode: 403,
      message: "BLOCAGE CONFORMITÉ — Entreprise non autorisée à contracter avec l'État.",
    });
  }
  if (e.statut === "BLOQUE") {
    throw Object.assign(new Error("BLOQUE_CONFORMITE"), {
      statusCode: 403,
      message: `BLOCAGE CONFORMITÉ (score ${e.scoreConformite}/100) — ${e.motifBlocage ?? "Conformité insuffisante"}. Régularisez avant tout dépôt.`,
    });
  }
}
