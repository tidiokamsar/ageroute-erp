/**
 * Audit de rejeu et gel des règles financières — lot L1.2.
 * PLAN-TRAVAIL-AGENT-PARAMETRAGE.md §3 / PLAN-DEV-PARAMETRAGE §1.2.
 *
 * Deux mécanismes :
 *  1. SNAPSHOT — chaque calcul d'un décompte fige les règles effectives qui
 *     ont servi (colonne Decompte.reglesSnapshot). Le rejeu recalcul TOUJOURS
 *     avec le snapshot : un décompte reste explicable même après arbitrage.
 *     Deux méthodes : GLOBAL (calcul d'ensemble du service — rejeu complet)
 *     et LIGNES (totaux sommés depuis les lignes — le rejeu vérifie la
 *     combinaison finale du net, les composants étant des sommes d'arrondis).
 *  2. GEL — une règle FINANCE ne peut pas être validée pendant que des
 *     décomptes sont en circuit sur sa portée (sauf statuts fermés).
 */
import { prisma } from "../../lib/prisma";
import { resoudreRegles, type ReglesEffectives } from "../../lib/regles";
import { calcDecompteRegles } from "./decomptes.calc.regles";

export type MethodeCalcul = "GLOBAL" | "LIGNES";

export interface SnapshotRegles {
  regles: ReglesEffectives;
  methode: MethodeCalcul;
  dateCalcul: string;
}

export function construireSnapshot(regles: ReglesEffectives, methode: MethodeCalcul): SnapshotRegles {
  return { regles, methode, dateCalcul: new Date().toISOString() };
}

export interface DecompteRejouable {
  montantPeriodeHtGnf: bigint;
  cumulPrecedentHtGnf: bigint;
  penalites: bigint;
  revisionPrix: bigint;
  tva: bigint;
  montantArmpGnf: bigint;
  montantTtcGnf: bigint;
  precompteTvaGnf: bigint;
  retenueGarantie: bigint;
  avanceRecuperee: bigint;
  netAPayer: bigint;
}

export interface TauxMarche {
  tauxTva: number;
  tauxRetenueGarantie: number;
  tauxAvance: number;
}

export interface ResultatRejeu {
  erreur?: string;
  concordance?: boolean;
  methode?: MethodeCalcul;
  differences?: { champ: string; enregistre: string; recalcule: string }[];
}

/** Rejoue le calcul d'un décompte avec SON snapshot et compare aux montants stockés. */
export function rejouerCalcul(decompte: DecompteRejouable, taux: TauxMarche, snapshot: SnapshotRegles | null): ResultatRejeu {
  if (!snapshot || !snapshot.regles) {
    return { erreur: "Décompte antérieur au mécanisme de snapshot (L1.2) — rejeu impossible avec les règles d'origine. Un recalcul informatif avec les règles actuelles reste possible via l'API métier." };
  }

  if (snapshot.methode === "LIGNES") {
    // Les composants sont des sommes d'arrondis ligne à ligne : on vérifie la
    // COMBINAISON du net selon les règles du snapshot (assiettes, inclusion
    // ARMP, plancher), pas les arrondis individuels.
    const r = snapshot.regles;
    const attendu =
      decompte.montantTtcGnf - decompte.precompteTvaGnf - decompte.retenueGarantie
      - (r.RG_ARMP_INCLUSE_TTC === "true" ? decompte.montantArmpGnf : 0n)
      - decompte.avanceRecuperee - decompte.penalites + decompte.revisionPrix;
    let net = attendu;
    let plancherApplique = false;
    if (r.RG_NET_PLANCHER_ZERO === "true" && net < 0n) { net = 0n; plancherApplique = true; }
    return {
      concordance: net === decompte.netAPayer,
      methode: "LIGNES",
      differences: net === decompte.netAPayer ? [] : [{
        champ: plancherApplique ? "netAPayer (plancher appliqué au rejeu)" : "netAPayer",
        enregistre: decompte.netAPayer.toString(),
        recalcule: net.toString(),
      }],
    };
  }

  // Méthode GLOBAL : recalcul complet depuis les entrées, avec le snapshot.
  const recalcule = calcDecompteRegles({
    montantPeriodeHtGnf: decompte.montantPeriodeHtGnf,
    cumulPrecedentHtGnf: decompte.cumulPrecedentHtGnf,
    penalites: decompte.penalites,
    revisionPrix: decompte.revisionPrix,
    tauxTva: taux.tauxTva,
    tauxRetenueGarantie: taux.tauxRetenueGarantie,
    tauxAvance: taux.tauxAvance,
  }, snapshot.regles);

  const comparaisons: [string, bigint, bigint][] = [
    ["tva", decompte.tva, recalcule.tva],
    ["montantArmpGnf", decompte.montantArmpGnf, recalcule.montantArmpGnf],
    ["montantTtcGnf", decompte.montantTtcGnf, recalcule.montantTtcGnf],
    ["precompteTvaGnf", decompte.precompteTvaGnf, recalcule.precompteTvaGnf],
    ["retenueGarantie", decompte.retenueGarantie, recalcule.retenueGarantie],
    ["avanceRecuperee", decompte.avanceRecuperee, recalcule.avanceRecuperee],
    ["cumulActuelHtGnf", decompte.montantPeriodeHtGnf + decompte.cumulPrecedentHtGnf, recalcule.cumulActuelHtGnf],
    ["netAPayer", decompte.netAPayer, recalcule.netAPayer],
  ];
  const differences = comparaisons
    .filter(([, enregistre, calc]) => enregistre !== calc)
    .map(([champ, enregistre, calc]) => ({ champ, enregistre: enregistre.toString(), recalcule: calc.toString() }));

  return { concordance: differences.length === 0, methode: "GLOBAL", differences };
}

// ─── GEL — verrou de validation des règles FINANCE (branché par le lot L0.2) ──

/** Statuts pour lesquels un décompte est « en circuit » : ses montants ne
 *  doivent pas changer de règle sous lui. BROUILLON (modifiable) et statuts
 *  fermés (PAYE, REJETE) sont hors gel. */
export const STATUTS_EN_CIRCUIT = [
  "SOUMIS", "DEPOSE", "EN_CONTROLE", "EN_CORRECTION", "EN_VALIDATION",
  "VISA_DAF", "VISA_DG", "VALIDE_DG", "EN_CIRCUIT_FINANCIER", "ORDONNANCE",
] as const;

export interface DecisionGel {
  autorise: boolean;
  message: string;
}

/** Décision PURE du gel (le comptage en base est fait séparément — testable). */
export function verifierGelFinancier(categorie: string, decomptesEnCircuit: number): DecisionGel {
  if (categorie !== "FINANCE") return { autorise: true, message: "Règle hors catégorie FINANCE — gel non applicable." };
  if (decomptesEnCircuit <= 0) return { autorise: true, message: "Aucun décompte en circuit sur la portée — validation autorisée." };
  return {
    autorise: false,
    message: `Gel financier : ${decomptesEnCircuit} décompte(s) en circuit sur la portée de cette règle. Faites-les aboutir (payer/rejeter) ou attendez leur clôture avant de changer les règles — ou faites lever le gel par la DG (dérogation tracée).`,
  };
}

/** Nombre de décomptes en circuit sur la portée d'une règle (à appeler avant
 *  toute validation FINANCE — sera branché par le lot L0.2). */
export async function compterDecomptesEnCircuit(portee: string, porteeId: string): Promise<number> {
  const where: Record<string, unknown> = { deletedAt: null, statut: { in: [...STATUTS_EN_CIRCUIT] } };
  if (portee === "MARCHE") where.marcheId = porteeId;
  else if (portee === "BAILLEUR") where.marche = { financement: porteeId };
  else if (portee === "TYPE_MARCHE") where.marche = { type: porteeId };
  return prisma.decompte.count({ where });
}

/** Règles effectives complètes pour snapshot (défauts + VALIDE de la portée). */
export function reglesPourSnapshot(regles: ReglesEffectives): ReglesEffectives {
  return { ...regles };
}

/** Reconstruction d'un snapshot stocké (Json) vers le type — valeurs inconnues
 *  rabattues sur les défauts par sécurité. */
export function lireSnapshot(brut: unknown): SnapshotRegles | null {
  if (!brut || typeof brut !== "object") return null;
  const s = brut as Partial<SnapshotRegles>;
  if (!s.regles || typeof s.regles !== "object") return null;
  return {
    regles: { ...resoudreRegles([]), ...s.regles } as ReglesEffectives,
    methode: s.methode === "LIGNES" ? "LIGNES" : "GLOBAL",
    dateCalcul: typeof s.dateCalcul === "string" ? s.dateCalcul : "",
  };
}
