/**
 * Tests — moteur de calcul paramétré (lot L1.1).
 * PREUVE CENTRALE : aux valeurs par défaut, calcDecompteRegles reproduit
 * BIT À BIT la référence historique calcDecompte (decomptes.calc.oracle.ts — oracle de test,
 * §3.3) — cas fixes + propriété aléatoire reproductible. Puis couverture des
 * arbitrages A1-A7 quand ils s'écartent des défauts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcDecompte } from "./decomptes.calc.oracle";
import { calcDecompteRegles, type CalcReglesInput } from "./decomptes.calc.regles";
import { resoudreRegles, type ReglesEffectives } from "../../lib/regles";

const DEFAUTS = resoudreRegles([]);

function avecRegles(surcharges: Partial<ReglesEffectives>): ReglesEffectives {
  return { ...DEFAUTS, ...surcharges };
}

// La parité bit à bit avec l'oracle historique vise la CASCADE FISCALE.
// Depuis la décision DAF du 26/08/2026, le plancher A4 est actif PAR DÉFAUT
// alors que l'oracle ne plancher pas : les comparaisons avec l'oracle le
// désactivent explicitement — il est couvert par son propre test et par la
// matrice A4 de decomptes.matrice.test.ts.
const PARITE = avecRegles({ RG_NET_PLANCHER_ZERO: "false" });

// Générateur pseudo-aléatoire reproductible (LCG) — la propriété est
// rejouable à l'identique en cas d'échec.
let graine = 20260818;
function alea(n: number): number {
  graine = (graine * 1103515245 + 12345) % 2147483648;
  return graine % n;
}

const TAUX_TVA = [0, 5, 10, 18, 25];
const TAUX_RG = [0, 5, 8, 10];
const TAUX_AV = [0, 10, 15, 20];

function comparer(r: ReturnType<typeof calcDecompteRegles>, ref: ReturnType<typeof calcDecompte>, contexte: string) {
  assert.equal(r.cumulActuelHtGnf, ref.cumulActuelHtGnf, `${contexte} : cumul`);
  assert.equal(r.tva, ref.tva, `${contexte} : tva`);
  assert.equal(r.montantArmpGnf, ref.armp, `${contexte} : armp`);
  assert.equal(r.montantTtcGnf, ref.ttc, `${contexte} : ttc`);
  assert.equal(r.precompteTvaGnf, ref.precompteTva, `${contexte} : precompte`);
  assert.equal(r.retenueGarantie, ref.retenueGarantie, `${contexte} : retenue`);
  assert.equal(r.avanceRecuperee, ref.avanceRecuperee, `${contexte} : avance`);
  assert.equal(r.netAPayer, ref.netAPayer, `${contexte} : net`);
}

test("parité — cas de référence 1 000 000 GNF, taux par défaut", () => {
  const ref = calcDecompte({ montantPeriodeHtGnf: 1_000_000n });
  comparer(calcDecompteRegles({ montantPeriodeHtGnf: 1_000_000n }, PARITE), ref, "1M");
});

test("parité — 25 milliards GNF (échelle réelle)", () => {
  const ref = calcDecompte({ montantPeriodeHtGnf: 25_000_000_000n });
  comparer(calcDecompteRegles({ montantPeriodeHtGnf: 25_000_000_000n }, PARITE), ref, "25Md");
});

test("parité — pénalités, révision, cumul précédent, taux 10/8/15", () => {
  const data: CalcReglesInput = {
    montantPeriodeHtGnf: 7_500_000n, cumulPrecedentHtGnf: 12_000_000n,
    penalites: 350_000n, revisionPrix: 125_000n,
    tauxTva: 10, tauxRetenueGarantie: 8, tauxAvance: 15,
  };
  const ref = calcDecompte(data);
  comparer(calcDecompteRegles(data, PARITE), ref, "10/8/15");
});

test("parité — plafond d'avance respecté (solde restant plus faible)", () => {
  const data: CalcReglesInput = { montantPeriodeHtGnf: 1_000_000n, avanceRestanteGnf: 120_000n };
  const ref = calcDecompte(data);
  assert.equal(ref.avanceRecuperee, 120_000n);
  comparer(calcDecompteRegles(data, PARITE), ref, "plafond avance");
});

test("propriété — 300 cas aléatoires reproductibles : parité bit à bit avec la référence", () => {
  for (let i = 0; i < 300; i++) {
    const ht = BigInt(alea(1_000_000_000_000)); // jusqu'à 10^12 GNF
    const data: CalcReglesInput = {
      montantPeriodeHtGnf: ht,
      cumulPrecedentHtGnf: BigInt(alea(1_000_000_000)),
      penalites: BigInt(alea(Number(ht >= 100n ? 100 : 1))) * (ht / 100n),
      revisionPrix: BigInt(alea(1000)),
      tauxTva: TAUX_TVA[alea(TAUX_TVA.length)],
      tauxRetenueGarantie: TAUX_RG[alea(TAUX_RG.length)],
      tauxAvance: TAUX_AV[alea(TAUX_AV.length)],
    };
    comparer(calcDecompteRegles(data, PARITE), calcDecompte(data), `cas aléatoire #${i} ht=${ht}`);
  }
});

test("A1 — assiette HT de la retenue : seule la retenue (et le net) changent", () => {
  const ht = 1_000_000n;
  const defaut = calcDecompteRegles({ montantPeriodeHtGnf: ht, tauxTva: 18, tauxRetenueGarantie: 5, tauxAvance: 20 }, DEFAUTS);
  const htAssiette = calcDecompteRegles({ montantPeriodeHtGnf: ht, tauxTva: 18, tauxRetenueGarantie: 5, tauxAvance: 20 }, avecRegles({ RG_ASSIETTE_RETENUE_GARANTIE: "HT" }));
  assert.equal(htAssiette.tva, defaut.tva);
  assert.equal(htAssiette.montantArmpGnf, defaut.montantArmpGnf);
  assert.equal(htAssiette.montantTtcGnf, defaut.montantTtcGnf);
  assert.equal(htAssiette.precompteTvaGnf, defaut.precompteTvaGnf);
  assert.equal(htAssiette.retenueGarantie, 50_000n); // HT × 5 %, contre 59 300 sur TTC
  assert.equal(htAssiette.netAPayer - defaut.netAPayer, 9_300n);
});

test("matrice A1×A2×A3 — 12 combinaisons s'exécutent et respectent leurs invariants", () => {
  for (const a1 of ["TTC", "HT"] as const) {
    for (const a2 of ["PRORATA_9_118", "TAUX_HT", "TAUX_TTC"] as const) {
      for (const a3 of ["HT", "TTC"] as const) {
        const r = calcDecompteRegles(
          { montantPeriodeHtGnf: 2_000_000n, tauxTva: 18, tauxRetenueGarantie: 5, tauxAvance: 20 },
          avecRegles({ RG_ASSIETTE_RETENUE_GARANTIE: a1, RG_FORMULE_PRECOMPTE_TVA: a2, RG_ARMP_ASSIETTE: a3 }),
        );
        assert.ok(r.montantTtcGnf > 0n);
        assert.ok(r.netAPayer < r.montantTtcGnf);
        // invariants propres
        if (a1 === "HT") assert.equal(r.retenueGarantie, 100_000n); // 2 M × 5 %
        if (a2 === "TAUX_HT") assert.equal(r.precompteTvaGnf, 180_000n); // 2 M × 9 %
        if (a3 === "TTC") assert.ok(r.montantArmpGnf > 12_000n); // assiette > HT
      }
    }
  }
});

test("A3 — ARMP hors TTC : TTC sans ARMP, net ne la déduit pas", () => {
  const r = calcDecompteRegles({ montantPeriodeHtGnf: 1_000_000n, tauxTva: 18, tauxRetenueGarantie: 5, tauxAvance: 20 }, avecRegles({ RG_ARMP_INCLUSE_TTC: "false" }));
  assert.equal(r.montantTtcGnf, 1_180_000n);
});

test("A4 — plancher à zéro du net à payer (décision DAF du 26/08/2026 : actif par défaut)", () => {
  const entree: CalcReglesInput = { montantPeriodeHtGnf: 1_000_000n, penalites: 2_000_000n, tauxTva: 18, tauxRetenueGarantie: 5, tauxAvance: 20 };
  assert.equal(calcDecompteRegles(entree, DEFAUTS).netAPayer, 0n, "défaut : net borné à zéro");
  assert.ok(calcDecompteRegles(entree, avecRegles({ RG_NET_PLANCHER_ZERO: "false" })).netAPayer < 0n, "plancher désactivé explicitement : net négatif");
});

test("A4 — report de l'excédent de pénalités sur le décompte suivant (décision DAF du 26/08/2026)", () => {
  const base = { tauxTva: 18, tauxRetenueGarantie: 5, tauxAvance: 20 } as const;
  // Cas de référence : HT 100 000 → net avant pénalités = 83 024 GNF.
  // Pénalités 200 000 : excédent 116 976, entièrement reportable (< pénalités).
  const r1 = calcDecompteRegles({ montantPeriodeHtGnf: 100_000n, penalites: 200_000n, ...base }, DEFAUTS);
  assert.equal(r1.netAPayer, 0n);
  assert.equal(r1.penalitesReporteesGnf, 116_976n, "excédent intégralement reporté");
  // Pénalités 90 000 : seule la part non absorbable (6 976) est reportée.
  const r2 = calcDecompteRegles({ montantPeriodeHtGnf: 100_000n, penalites: 90_000n, ...base }, DEFAUTS);
  assert.equal(r2.netAPayer, 0n);
  assert.equal(r2.penalitesReporteesGnf, 6_976n, "seule la part non absorbable est reportée");
  // Pénalités absorbables : rien à reporter.
  const r3 = calcDecompteRegles({ montantPeriodeHtGnf: 100_000n, penalites: 10_000n, ...base }, DEFAUTS);
  assert.ok(r3.netAPayer > 0n);
  assert.equal(r3.penalitesReporteesGnf, 0n, "rien à reporter quand le net reste positif");
  // Borne : le report ne dépasse jamais le montant des pénalités — un solde
  // négatif dû aux autres déductions (avance 200 %) n'est pas reportable.
  const r4 = calcDecompteRegles({ montantPeriodeHtGnf: 100_000n, penalites: 50_000n, tauxTva: 18, tauxRetenueGarantie: 5, tauxAvance: 200 }, DEFAUTS);
  assert.equal(r4.netAPayer, 0n);
  assert.equal(r4.penalitesReporteesGnf, 50_000n, "report borné au montant des pénalités");
  // Report désactivé explicitement : l'excédent est écrêté puis perdu.
  const r5 = calcDecompteRegles({ montantPeriodeHtGnf: 100_000n, penalites: 200_000n, ...base }, avecRegles({ RG_REPORT_PENALITES: "false" }));
  assert.equal(r5.netAPayer, 0n);
  assert.equal(r5.penalitesReporteesGnf, 0n, "report inactif : excédent non reporté");
  // Sans plancher : net négatif, rien n'est reporté (règle inchangée).
  const r6 = calcDecompteRegles({ montantPeriodeHtGnf: 100_000n, penalites: 200_000n, ...base }, avecRegles({ RG_NET_PLANCHER_ZERO: "false" }));
  assert.ok(r6.netAPayer < 0n);
  assert.equal(r6.penalitesReporteesGnf, 0n);
});

test("A5 — mode FORMULE : pénalités au 1/3000e plafonnées à 10 % de l'assiette", () => {
  const base = { montantPeriodeHtGnf: 3_000_000n, tauxTva: 18, tauxRetenueGarantie: 5, tauxAvance: 20 };
  const reglesFormule = avecRegles({ RG_PENALITE_MODE: "FORMULE", RG_PENALITE_PLAFOND_PCT: "10" });

  // 30 jours de retard : 3 000 000 × 30/3000 = 30 000 (< plafond 300 000)
  const court = calcDecompteRegles({ ...base, joursRetard: 30 }, reglesFormule);
  // 3 000 jours : brut 3 000 000 → plafonné à 10 % de l'assiette HT = 300 000
  const longs = calcDecompteRegles({ ...base, joursRetard: 3000 }, reglesFormule);
  assert.equal(court.netAPayer - longs.netAPayer, 270_000n, "écart de pénalités = plafond − 30 j");

  // Équivalence avec le mode SAISIE aux mêmes pénalités explicites
  const eqCourt = calcDecompteRegles({ ...base, penalites: 30_000n }, DEFAUTS);
  const eqLongs = calcDecompteRegles({ ...base, penalites: 300_000n }, DEFAUTS);
  assert.equal(court.netAPayer, eqCourt.netAPayer);
  assert.equal(longs.netAPayer, eqLongs.netAPayer);

  // Référence officielle inchangée en mode SAISIE (défaut)
  const refSaisie = calcDecompte({ montantPeriodeHtGnf: 3_000_000n, penalites: 123_456n });
  assert.equal(calcDecompteRegles({ ...base, penalites: 123_456n }, DEFAUTS).netAPayer, refSaisie.netAPayer);
});

test("A6 — avances démarrage + approvisionnement cumulées, avec plafond global", () => {
  const r = calcDecompteRegles(
    { montantPeriodeHtGnf: 1_000_000n, tauxTva: 18, tauxRetenueGarantie: 5, tauxAvance: 20 },
    avecRegles({ RG_AVANCE_MODE: "DEMARRAGE_APPRO", RG_TAUX_AVANCE_DEMARRAGE: "15", RG_TAUX_AVANCE_APPROVISIONNEMENT: "10" }),
  );
  assert.equal(r.avanceRecuperee, 250_000n);
  const plafonnee = calcDecompteRegles(
    { montantPeriodeHtGnf: 1_000_000n, avanceRestanteGnf: 100_000n, tauxTva: 18, tauxRetenueGarantie: 5, tauxAvance: 20 },
    avecRegles({ RG_AVANCE_MODE: "DEMARRAGE_APPRO", RG_TAUX_AVANCE_DEMARRAGE: "15", RG_TAUX_AVANCE_APPROVISIONNEMENT: "10" }),
  );
  assert.equal(plafonnee.avanceRecuperee, 100_000n);
});

test("A7 — trois modes d'arrondi encadrés à 1 franc (HT = 3 GNF, TVA 18 %)", () => {
  const base = { montantPeriodeHtGnf: 3n, tauxTva: 18, tauxRetenueGarantie: 5, tauxAvance: 20 };
  const inf = calcDecompteRegles(base, avecRegles({ RG_ARRONDI_MODE: "FRANC_INF" }));
  const proche = calcDecompteRegles(base, avecRegles({ RG_ARRONDI_MODE: "FRANC_PROCHE" }));
  const sup = calcDecompteRegles(base, avecRegles({ RG_ARRONDI_MODE: "FRANC_SUP" }));
  assert.equal(inf.tva, 0n);
  assert.equal(proche.tva, 1n); // 0,54 → 1 au demi vers le haut
  assert.equal(sup.tva, 1n);
});

test("nommage — le résultat porte EXACTEMENT les colonnes du modèle Decompte", () => {
  const r = calcDecompteRegles({ montantPeriodeHtGnf: 1_000_000n }, DEFAUTS);
  assert.deepEqual(Object.keys(r).sort(), [
    "avanceRecuperee", "cumulActuelHtGnf", "montantArmpGnf", "montantTtcGnf",
    "netAPayer", "penalitesReporteesGnf", "precompteTvaGnf", "retenueGarantie", "tva",
  ]);
});
