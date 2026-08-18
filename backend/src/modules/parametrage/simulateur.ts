/**
 * Simulateur de règles financières (A1-A7) — lot L0.3.
 * PLAN-TRAVAIL-AGENT-PARAMETRAGE.md §3 / PLAN-DEV-PARAMETRAGE §1.3.
 *
 * Fonction PURE, arithmétique entière (multiplier avant diviser, arrondi
 * selon RG_ARRONDI_MODE) : elle calcule ce que DONNERAIT le moteur avec un
 * jeu de règles donné. Elle ne touche NI decomptes.calc.ts (formule officielle
 * protégée §3.3 AGENTS.md) NI le moteur de production — c'est le lot L1.1 qui
 * généralisera le calcul réel sur ce même modèle, avec preuve de non-régression.
 *
 * INVARIANT (testé) : avec les valeurs par défaut, la simulation reproduit
 * exactement les résultats de calcDecompte (decomptes.calc.ts).
 */
import { resoudreRegles, type CleRegles, type RegleRecord, type ReglesEffectives } from "../../lib/regles";

export interface LigneSimulation {
  cle: string;
  libelle: string;
  formule: string;
  montantGnf: string;
}

export interface ResultatSimulation {
  lignes: LigneSimulation[];
  netAPayerGnf: string;
}

export interface EntreeSimulation {
  montantHtGnf: bigint;
  penalitesGnf?: bigint;
  revisionPrixGnf?: bigint;
  tauxTva: number;
  tauxRg: number;
  tauxAvance: number;
}

/** Arrondi entier : FRANC_PROCHE (demi vers le haut), FRANC_INF, FRANC_SUP. */
function arrondir(numerateur: bigint, denominateur: bigint, mode: string): bigint {
  if (denominateur === 1n) return numerateur;
  if (mode === "FRANC_INF") return numerateur / denominateur;
  if (mode === "FRANC_SUP") return (numerateur + denominateur - 1n) / denominateur;
  return (numerateur + denominateur / 2n) / denominateur; // FRANC_PROCHE
}

/** base × taux % en entiers : base·taux·100 arrondi sur 10 000. */
function pourcent(base: bigint, taux: number, mode: string): bigint {
  return arrondir(base * BigInt(Math.round(taux * 100)), 10_000n, mode);
}

export function simulerDecompte(e: EntreeSimulation, regles: ReglesEffectives): ResultatSimulation {
  const mode = regles.RG_ARRONDI_MODE;
  const ht = e.montantHtGnf;

  const tva = pourcent(ht, e.tauxTva, mode);

  const assietteArmp = regles.RG_ARMP_ASSIETTE === "TTC" ? ht + tva : ht;
  const armp = pourcent(assietteArmp, Number(regles.RG_TAUX_ARMP), mode);
  const armpIncluse = regles.RG_ARMP_INCLUSE_TTC === "true";
  const ttc = ht + tva + (armpIncluse ? armp : 0n);

  let precompte: bigint;
  let formulePrecompte: string;
  switch (regles.RG_FORMULE_PRECOMPTE_TVA) {
    case "TAUX_HT":
      precompte = pourcent(ht, Number(regles.RG_TAUX_PRECOMPTE_HT), mode);
      formulePrecompte = `HT × ${regles.RG_TAUX_PRECOMPTE_HT} %`;
      break;
    case "TAUX_TTC":
      precompte = pourcent(ttc, Number(regles.RG_TAUX_PRECOMPTE_HT), mode);
      formulePrecompte = `TTC × ${regles.RG_TAUX_PRECOMPTE_HT} %`;
      break;
    default: // PRORATA_9_118 — comportement actuel
      precompte = arrondir(ttc * 9n, 118n, mode);
      formulePrecompte = "TTC × 9/118";
  }

  const assietteRG = regles.RG_ASSIETTE_RETENUE_GARANTIE === "HT" ? ht : ttc;
  const retenue = pourcent(assietteRG, e.tauxRg, mode);

  let avance: bigint;
  let formuleAvance: string;
  const tauxDemarrage = Number(regles.RG_TAUX_AVANCE_DEMARRAGE);
  const tauxAppro = Number(regles.RG_TAUX_AVANCE_APPROVISIONNEMENT);
  if (regles.RG_AVANCE_MODE === "DEMARRAGE_APPRO" && regles.RG_TAUX_AVANCE_DEMARRAGE && regles.RG_TAUX_AVANCE_APPROVISIONNEMENT) {
    avance = pourcent(ht, tauxDemarrage, mode) + pourcent(ht, tauxAppro, mode);
    formuleAvance = `HT × ${regles.RG_TAUX_AVANCE_DEMARRAGE} % + HT × ${regles.RG_TAUX_AVANCE_APPROVISIONNEMENT} %`;
  } else {
    avance = pourcent(ht, e.tauxAvance, mode);
    formuleAvance = `HT × ${e.tauxAvance} %`;
  }

  const penalites = e.penalitesGnf ?? 0n;
  const revision = e.revisionPrixGnf ?? 0n;
  let net = ttc - precompte - retenue - (armpIncluse ? armp : 0n) - avance - penalites + revision;
  const plancherApplique = regles.RG_NET_PLANCHER_ZERO === "true" && net < 0n;
  if (plancherApplique) net = 0n;

  const lignes: LigneSimulation[] = [
    { cle: "HT",              libelle: "Montant HT de la période",        formule: "saisie",                                   montantGnf: ht.toString() },
    { cle: "TVA",             libelle: "TVA",                             formule: `HT × ${e.tauxTva} %`,                      montantGnf: tva.toString() },
    { cle: "ARMP",            libelle: "Redevance ARMP",                  formule: `${regles.RG_ARMP_ASSIETTE} × ${regles.RG_TAUX_ARMP} %${armpIncluse ? " (incluse dans le TTC)" : " (hors TTC)"}`, montantGnf: armp.toString() },
    { cle: "TTC",             libelle: "Total TTC",                       formule: `HT + TVA${armpIncluse ? " + ARMP" : ""}`,  montantGnf: ttc.toString() },
    { cle: "PRECOMPTE",       libelle: "Précompte TVA",                   formule: formulePrecompte,                           montantGnf: precompte.toString() },
    { cle: "RETENUE_GARANTIE",libelle: "Retenue de garantie",             formule: `${assietteRG === ht ? "HT" : "TTC"} × ${e.tauxRg} %`, montantGnf: retenue.toString() },
    { cle: "AVANCE",          libelle: "Avance récupérée",                formule: formuleAvance,                              montantGnf: avance.toString() },
    { cle: "PENALITES",       libelle: "Pénalités",                       formule: "saisie",                                   montantGnf: penalites.toString() },
    { cle: "REVISION",        libelle: "Révision des prix",               formule: "saisie",                                   montantGnf: revision.toString() },
    { cle: "NET",             libelle: "Net à payer",                     formule: `TTC − Précompte − Retenue${armpIncluse ? " − ARMP" : ""} − Avance − Pénalités + Révision${plancherApplique ? " — plancher 0 appliqué (RG_NET_PLANCHER_ZERO)" : ""}`, montantGnf: net.toString() },
  ];

  return { lignes, netAPayerGnf: net.toString() };
}

/**
 * Simule avant/après : « avant » = défauts (= comportement actuel du moteur),
 * « après » = défauts surchargés par les règles proposées. La fusion passe par
 * resoudreRegles (mêmes règles de priorité que la production).
 */
export function simulerAvecSurcharges(
  e: EntreeSimulation,
  surcharges: Partial<Record<CleRegles, string>>,
): { avant: ResultatSimulation; apres: ResultatSimulation } {
  const avant = simulerDecompte(e, resoudreRegles([]));
  const records: RegleRecord[] = Object.entries(surcharges).map(([cle, valeur]) => ({
    cle, portee: "GLOBAL", porteeId: "", valeur: String(valeur),
    dateEffet: new Date(0), version: 1, statut: "VALIDE",
  }));
  const apres = simulerDecompte(e, resoudreRegles(records));
  return { avant, apres };
}
