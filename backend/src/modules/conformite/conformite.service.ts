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
import { chargerRegles, nombreRegles, resoudreRegles, type ReglesEffectives } from "../../lib/regles";

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

// L3.1 — poids des critères paramétrables (CF_SCORE_PONDERATIONS)
interface Poids { NIF: number; TVA: number; FISC: number; SOC: number; DOCS: number; CAUTION: number; }
const POIDS_DEFAUT: Poids = { NIF: 15, TVA: 15, FISC: 20, SOC: 15, DOCS: 20, CAUTION: 15 };

function poidsDepuisRegles(regles: ReglesEffectives): Poids {
  try {
    const brut = JSON.parse(regles.CF_SCORE_PONDERATIONS) as Partial<Poids>;
    return { ...POIDS_DEFAUT, ...brut };
  } catch { return POIDS_DEFAUT; }
}

export function calculerScoreDetailAvecRegles(e: {
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
}, regles?: ReglesEffectives): ScoreDetail {
  const poids = poidsDepuisRegles(regles ?? resoudreRegles([]));
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
  criteres.push({ code: "NIF", libelle: "NIF valide et renseigné", poids: poids.NIF, obtenu: nifOk ? poids.NIF : 0, ok: nifOk,
    detail: nifOk ? `NIF : ${e.nif}` : "NIF absent ou invalide (min 6 caractères)" });

  // TVA (15 pts si assujetti ; crédit si non assujetti)
  let tvaOk = false;
  let tvaPoids = poids.TVA;
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
  criteres.push({ code: "FISC", libelle: "Régularité fiscale + attestation valide", poids: poids.FISC, obtenu: fiscOk ? poids.FISC : (e.regulariteFiscale ? Math.round(poids.FISC / 2) : 0), ok: fiscOk,
    detail: !e.regulariteFiscale ? "Régularité fiscale non confirmée" :
      dateExpiree(e.attestationFiscaleExpire) ? "Attestation fiscale expirée" : "OK" });

  // Régularité sociale (15 pts)
  const socOk = e.regulariteSociale && !dateExpiree(e.attestationSocialeExpire);
  criteres.push({ code: "SOC", libelle: "Régularité sociale + attestation valide", poids: poids.SOC, obtenu: socOk ? poids.SOC : (e.regulariteSociale ? Math.round(poids.SOC / 2) : 0), ok: socOk,
    detail: !e.regulariteSociale ? "Régularité sociale non confirmée" :
      dateExpiree(e.attestationSocialeExpire) ? "Attestation sociale expirée" : "OK" });

  // Documents légaux valides (20 pts)
  const docsOk = e.attestationValide;
  criteres.push({ code: "DOCS", libelle: "Documents légaux (RCCM, agréments, pièces)", poids: poids.DOCS, obtenu: docsOk ? poids.DOCS : 0, ok: docsOk,
    detail: docsOk ? "Documents valides" : "Documents légaux manquants ou non vérifiés" });

  // Caution bancaire (15 pts)
  const cautionOk = e.cautionBancaire;
  criteres.push({ code: "CAUTION", libelle: "Caution / garantie bancaire valide", poids: poids.CAUTION, obtenu: cautionOk ? poids.CAUTION : 0, ok: cautionOk,
    detail: cautionOk ? "Caution bancaire valide" : "Caution bancaire absente ou expirée" });

  const score = criteres.reduce((s, c) => s + c.obtenu, 0);
  const seuilConforme = nombreRegles(regles ?? resoudreRegles([]), "CF_SEUIL_CONFORME" as never) || 70;
  const seuilRegulariser = nombreRegles(regles ?? resoudreRegles([]), "CF_SEUIL_REGULARISER" as never) || 40;
  const statut: "CONFORME" | "A_REGULARISER" | "BLOQUE" =
    score >= seuilConforme ? "CONFORME" : score >= seuilRegulariser ? "A_REGULARISER" : "BLOQUE";

  return { score, statut, bloquantAbsolu: false, criteres };
}

// Alias rétro-compatibilité
export { calculerScoreDetailAvecRegles as calculerScoreDetail };

export async function recalculerConformiteEntreprise(
  entrepriseId: string,
  auteur?: string,
  commentaire?: string,
): Promise<ScoreDetail> {
  const e = await prisma.entreprise.findUniqueOrThrow({ where: { id: entrepriseId } });

  const ancien = { score: e.scoreConformite, statut: e.statut as string };
  const regles = await chargerRegles();
  const detail = calculerScoreDetailAvecRegles(e, regles);
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
