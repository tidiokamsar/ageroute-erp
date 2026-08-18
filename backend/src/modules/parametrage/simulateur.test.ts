/**
 * Tests — simulateur de règles financières (lot L0.3).
 * DoD du plan de travail :
 *  1. simulation avec les défauts = valeurs actuelles du moteur
 *     (comparaison directe avec calcDecompte, formule officielle protégée) ;
 *  2. A1 = HT ne change QUE la retenue de garantie (et le net en conséquence) ;
 *  3. bornes et modes : plancher A4, ARMP hors TTC, arrondis A7, avance A6.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcDecompte } from "../decomptes/decomptes.calc";
import { simulerDecompte, simulerAvecSurcharges } from "./simulateur";
import { resoudreRegles } from "../../lib/regles";

const DEFAUTS = resoudreRegles([]);

function montant(lignes: ReturnType<typeof simulerDecompte>["lignes"], cle: string): bigint {
  return BigInt(lignes.find((l) => l.cle === cle)!.montantGnf);
}

function simulerDefauts(e: { montantHtGnf: bigint; penalitesGnf?: bigint; revisionPrixGnf?: bigint; tauxTva?: number; tauxRg?: number; tauxAvance?: number }) {
  return simulerDecompte({
    montantHtGnf: e.montantHtGnf,
    penalitesGnf: e.penalitesGnf,
    revisionPrixGnf: e.revisionPrixGnf,
    tauxTva: e.tauxTva ?? 18,
    tauxRg: e.tauxRg ?? 5,
    tauxAvance: e.tauxAvance ?? 20,
  }, DEFAUTS);
}

test("DoD — aux défauts, la simulation reproduit exactement calcDecompte (cas de référence 1 000 000 GNF)", () => {
  const ref = calcDecompte({ montantPeriodeHtGnf: 1_000_000n });
  const sim = simulerDefauts({ montantHtGnf: 1_000_000n });
  assert.equal(montant(sim.lignes, "TVA"), ref.tva);
  assert.equal(montant(sim.lignes, "ARMP"), ref.armp);
  assert.equal(montant(sim.lignes, "TTC"), ref.ttc);
  assert.equal(montant(sim.lignes, "PRECOMPTE"), ref.precompteTva);
  assert.equal(montant(sim.lignes, "RETENUE_GARANTIE"), ref.retenueGarantie);
  assert.equal(montant(sim.lignes, "AVANCE"), ref.avanceRecuperee);
  assert.equal(sim.netAPayerGnf, ref.netAPayer.toString());
});

test("DoD — aux défauts, égalité sur un montant d'échelle réelle (25 milliards GNF) avec taux personnalisés", () => {
  const ref = calcDecompte({ montantPeriodeHtGnf: 25_000_000_000n, tauxTva: 18, tauxRetenueGarantie: 5, tauxAvance: 20 });
  const sim = simulerDefauts({ montantHtGnf: 25_000_000_000n });
  assert.equal(sim.netAPayerGnf, ref.netAPayer.toString());
  assert.equal(montant(sim.lignes, "PRECOMPTE"), ref.precompteTva);
  assert.equal(montant(sim.lignes, "RETENUE_GARANTIE"), ref.retenueGarantie);
});

test("DoD — aux défauts, égalité avec pénalités et révision (taux 10/8/15)", () => {
  const ref = calcDecompte({ montantPeriodeHtGnf: 1_000_000n, penalites: 50_000n, revisionPrix: 20_000n, tauxTva: 10, tauxRetenueGarantie: 8, tauxAvance: 15 });
  const sim = simulerDefauts({ montantHtGnf: 1_000_000n, penalitesGnf: 50_000n, revisionPrixGnf: 20_000n, tauxTva: 10, tauxRg: 8, tauxAvance: 15 });
  assert.equal(sim.netAPayerGnf, ref.netAPayer.toString());
});

test("DoD — A1 = HT ne change QUE la retenue de garantie (et le net)", () => {
  const { avant, apres } = simulerAvecSurcharges(
    { montantHtGnf: 1_000_000n, tauxTva: 18, tauxRg: 5, tauxAvance: 20 },
    { RG_ASSIETTE_RETENUE_GARANTIE: "HT" },
  );
  for (const cle of ["HT", "TVA", "ARMP", "TTC", "PRECOMPTE", "AVANCE", "PENALITES", "REVISION"]) {
    assert.equal(montant(apres.lignes, cle), montant(avant.lignes, cle), `${cle} ne doit pas bouger`);
  }
  assert.notEqual(montant(apres.lignes, "RETENUE_GARANTIE"), montant(avant.lignes, "RETENUE_GARANTIE"));
  // HT 5 % = 50 000 < TTC 5 % = 59 300 : l'écart attendu est exactement la TVA×5 %
  assert.equal(montant(apres.lignes, "RETENUE_GARANTIE"), 50_000n);
  assert.equal(BigInt(apres.netAPayerGnf) - BigInt(avant.netAPayerGnf), 9_300n);
});

test("A4 — plancher à zéro : net négatif ramené à 0, mention dans la formule", () => {
  const entree = { montantHtGnf: 1_000_000n, penalitesGnf: 2_000_000n, tauxTva: 18, tauxRg: 5, tauxAvance: 20 };
  const sansPlancher = simulerDecompte(entree, DEFAUTS);
  assert.ok(BigInt(sansPlancher.netAPayerGnf) < 0n, "comportement actuel : net négatif autorisé");
  const avecPlancher = simulerDecompte(entree, { ...DEFAUTS, RG_NET_PLANCHER_ZERO: "true" });
  assert.equal(avecPlancher.netAPayerGnf, "0");
  assert.ok(avecPlancher.lignes.find((l) => l.cle === "NET")!.formule.includes("plancher 0"));
});

test("A3 — ARMP hors TTC : le TTC exclut l'ARMP (et le net ne la déduit plus)", () => {
  const horsTtc = simulerDecompte({ montantHtGnf: 1_000_000n, tauxTva: 18, tauxRg: 5, tauxAvance: 20 }, { ...DEFAUTS, RG_ARMP_INCLUSE_TTC: "false" });
  assert.equal(montant(horsTtc.lignes, "TTC"), 1_180_000n); // HT + TVA, sans ARMP
});

test("A2 — formule TAUX_HT du précompte appliquée sur le HT", () => {
  const r = simulerDecompte({ montantHtGnf: 1_000_000n, tauxTva: 18, tauxRg: 5, tauxAvance: 20 }, { ...DEFAUTS, RG_FORMULE_PRECOMPTE_TVA: "TAUX_HT", RG_TAUX_PRECOMPTE_HT: "9" });
  assert.equal(montant(r.lignes, "PRECOMPTE"), 90_000n); // 1 000 000 × 9 %
});

test("A7 — les trois modes d'arrondi encadrent le résultat exact à 1 franc près", () => {
  // HT = 3 GNF, TVA 18 % → 0,54 : INF 0, PROCHE 1 (0,54 ≥ 0,5), SUP 1
  const e = { montantHtGnf: 3n, tauxTva: 18, tauxRg: 5, tauxAvance: 20 };
  const inf = simulerDecompte(e, { ...DEFAUTS, RG_ARRONDI_MODE: "FRANC_INF" });
  const proche = simulerDecompte(e, { ...DEFAUTS, RG_ARRONDI_MODE: "FRANC_PROCHE" });
  const sup = simulerDecompte(e, { ...DEFAUTS, RG_ARRONDI_MODE: "FRANC_SUP" });
  const tvaInf = montant(inf.lignes, "TVA"), tvaProche = montant(proche.lignes, "TVA"), tvaSup = montant(sup.lignes, "TVA");
  assert.ok(tvaInf <= tvaProche && tvaProche <= tvaSup && tvaSup - tvaInf <= 1n);
  assert.equal(tvaInf, 0n);
  assert.equal(tvaProche, 1n);
});

test("A6 — mode DEMARRAGE_APPRO avec deux taux cumulés sur le HT", () => {
  const r = simulerDecompte(
    { montantHtGnf: 1_000_000n, tauxTva: 18, tauxRg: 5, tauxAvance: 20 },
    { ...DEFAUTS, RG_AVANCE_MODE: "DEMARRAGE_APPRO", RG_TAUX_AVANCE_DEMARRAGE: "15", RG_TAUX_AVANCE_APPROVISIONNEMENT: "10" },
  );
  assert.equal(montant(r.lignes, "AVANCE"), 250_000n); // 15 % + 10 % de 1 000 000
});

test("simulerAvecSurcharges — la fusion passe par resoudreRegles (mêmes priorités que la production)", () => {
  const { apres } = simulerAvecSurcharges(
    { montantHtGnf: 1_000_000n, tauxTva: 18, tauxRg: 5, tauxAvance: 20 },
    { RG_TAUX_ARMP: "1" },
  );
  assert.equal(montant(apres.lignes, "ARMP"), 10_000n); // 1 000 000 × 1 %
});
