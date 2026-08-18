/**
 * Moteur de calcul des décomptes PARAMÉTRÉ PAR LES RÈGLES (A1-A7) — lot L1.1.
 * PLAN-TRAVAIL-AGENT-PARAMETRAGE.md §3 / PLAN-DEV-PARAMETRAGE §1.2.
 *
 * Ce moteur généralise la formule officielle (decomptes.calc.ts, protégée
 * §3.3 AGENTS.md — NON MODIFIÉE) : mêmes mathématiques aux valeurs par
 * défaut (preuve : tests de parité bit à bit + propriété aléatoire), mais
 * arithmétique ENTIÈRE pure (multiplier avant diviser, arrondi
 * RG_ARRONDI_MODE) et constantes pilotées par le registre de règles.
 *
 * Les noms de champs du résultat sont EXACTEMENT les colonnes du modèle
 * Decompte — le service peut étaler le résultat dans prisma.create/update
 * (l'ancienne copie inline renvoyait armp/ttc/precompteTva, inconnus de
 * Prisma : erreur « Unknown arg » à l'exécution — corrigé par construction).
 */
import { nombreRegles, type ReglesEffectives } from "../../lib/regles";

export interface CalcReglesInput {
  montantPeriodeHtGnf?: bigint;
  cumulPrecedentHtGnf?: bigint;
  penalites?: bigint;
  revisionPrix?: bigint;
  tauxTva?: number;
  tauxRetenueGarantie?: number;
  tauxAvance?: number;
  /** Solde d'avance restant à récupérer : la récupération est plafonnée. */
  avanceRestanteGnf?: bigint;
  /** Jours de retard — utilisés uniquement en mode pénalités FORMULE (A5). */
  joursRetard?: number;
}

export interface CalcReglesResult {
  cumulActuelHtGnf: bigint;
  tva: bigint;
  montantArmpGnf: bigint;
  montantTtcGnf: bigint;
  precompteTvaGnf: bigint;
  retenueGarantie: bigint;
  avanceRecuperee: bigint;
  netAPayer: bigint;
}

/** Arrondi entier : FRANC_PROCHE (demi vers le haut), FRANC_INF, FRANC_SUP. */
function arrondir(numerateur: bigint, denominateur: bigint, mode: string): bigint {
  if (denominateur === 1n) return numerateur;
  if (mode === "FRANC_INF") return numerateur / denominateur;
  if (mode === "FRANC_SUP") return (numerateur + denominateur - 1n) / denominateur;
  return (numerateur + denominateur / 2n) / denominateur;
}

/** base × taux % en entiers : base·taux·100 arrondi sur 10 000. */
function pourcent(base: bigint, taux: number, mode: string): bigint {
  return arrondir(base * BigInt(Math.round(taux * 100)), 10_000n, mode);
}

export function calcDecompteRegles(data: CalcReglesInput, regles: ReglesEffectives): CalcReglesResult {
  const mode = regles.RG_ARRONDI_MODE;
  const ht = data.montantPeriodeHtGnf ?? 0n;
  const cumulActuel = (data.cumulPrecedentHtGnf ?? 0n) + ht;
  const tauxTva = data.tauxTva ?? 18;
  const tauxRG = data.tauxRetenueGarantie ?? 5;
  const tauxAvance = data.tauxAvance ?? 20;

  // TVA — sur le HT (inchangé par les arbitrages A1-A10)
  const tva = pourcent(ht, tauxTva, mode);

  // ARMP (A3) — assiette HT ou TTC, incluse ou non dans le TTC
  const assietteArmp = regles.RG_ARMP_ASSIETTE === "TTC" ? ht + tva : ht;
  const armp = pourcent(assietteArmp, nombreRegles(regles, "RG_TAUX_ARMP"), mode);
  const armpIncluse = regles.RG_ARMP_INCLUSE_TTC === "true";
  const ttc = ht + tva + (armpIncluse ? armp : 0n);

  // Précompte TVA (A2) — PRORATA_9_118 (usage actuel), TAUX_HT ou TAUX_TTC
  let precompte: bigint;
  switch (regles.RG_FORMULE_PRECOMPTE_TVA) {
    case "TAUX_HT":
      precompte = pourcent(ht, nombreRegles(regles, "RG_TAUX_PRECOMPTE_HT"), mode);
      break;
    case "TAUX_TTC":
      precompte = pourcent(ttc, nombreRegles(regles, "RG_TAUX_PRECOMPTE_HT"), mode);
      break;
    default:
      precompte = arrondir(ttc * 9n, 118n, mode);
  }

  // Retenue de garantie (A1) — assiette TTC (usage actuel) ou HT
  const assietteRG = regles.RG_ASSIETTE_RETENUE_GARANTIE === "HT" ? ht : ttc;
  const retenueGarantie = pourcent(assietteRG, tauxRG, mode);

  // Avance (A6) — nature unique (usage actuel) ou démarrage + approvisionnement
  let avanceRecuperee: bigint;
  if (
    regles.RG_AVANCE_MODE === "DEMARRAGE_APPRO" &&
    regles.RG_TAUX_AVANCE_DEMARRAGE && regles.RG_TAUX_AVANCE_APPROVISIONNEMENT
  ) {
    avanceRecuperee =
      pourcent(ht, nombreRegles(regles, "RG_TAUX_AVANCE_DEMARRAGE"), mode) +
      pourcent(ht, nombreRegles(regles, "RG_TAUX_AVANCE_APPROVISIONNEMENT"), mode);
  } else {
    avanceRecuperee = pourcent(ht, tauxAvance, mode);
  }
  // Plafond d'avance : ne jamais récupérer plus que le solde restant dû
  if (data.avanceRestanteGnf !== undefined && avanceRecuperee > data.avanceRestanteGnf) {
    avanceRecuperee = data.avanceRestanteGnf < 0n ? 0n : data.avanceRestanteGnf;
  }

  // Pénalités (A5) — saisies (usage actuel) ou calculées par jour de retard
  let penalites = data.penalites ?? 0n;
  if (regles.RG_PENALITE_MODE === "FORMULE" && data.joursRetard !== undefined) {
    const assiettePenalite = regles.RG_PENALITE_ASSIETTE === "TTC" ? ttc : ht;
    const tauxJournalier = nombreRegles(regles, "RG_PENALITE_TAUX_JOURNALIER");
    if (tauxJournalier > 0) {
      penalites = assiettePenalite * BigInt(data.joursRetard) / BigInt(Math.round(tauxJournalier));
      const plafondPct = nombreRegles(regles, "RG_PENALITE_PLAFOND_PCT");
      if (plafondPct < 100) {
        const plafond = pourcent(assiettePenalite, plafondPct, mode);
        if (penalites > plafond) penalites = plafond;
      }
    }
  }

  // Net à payer — ARMP déduite seulement si elle a été incluse dans le TTC
  let netAPayer = ttc - precompte - retenueGarantie - (armpIncluse ? armp : 0n) - avanceRecuperee - penalites + (data.revisionPrix ?? 0n);
  if (regles.RG_NET_PLANCHER_ZERO === "true" && netAPayer < 0n) netAPayer = 0n;

  return {
    cumulActuelHtGnf: cumulActuel,
    tva,
    montantArmpGnf: armp,
    montantTtcGnf: ttc,
    precompteTvaGnf: precompte,
    retenueGarantie,
    avanceRecuperee,
    netAPayer,
  };
}
