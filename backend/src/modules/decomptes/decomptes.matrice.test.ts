import test from "node:test";
import assert from "node:assert/strict";
import { resoudreRegles, type ReglesEffectives } from "../../lib/regles";
import { calcDecompteRegles } from "./decomptes.calc.regles";

/**
 * Lot L1.3 — Matrice combinatoire du moteur financier paramétré.
 *
 * Le lot L1.1 vérifie surtout la PARITÉ avec la formule historique. Ici on
 * couvre l'espace des arbitrages : que se passe-t-il quand la DAF change
 * réellement un paramètre ? Les assertions sont, autant que possible,
 * INDÉPENDANTES de l'implémentation — on vérifie des relations entre deux
 * exécutions (« basculer A1 ne doit toucher que la retenue et le net ») plutôt
 * que de recopier la formule, ce qui ne prouverait rien.
 *
 * TABLEAU DE COUVERTURE
 * ─────────────────────────────────────────────────────────────────────────────
 *  Axe  Règle                          Valeurs couvertes
 *  A1   RG_ASSIETTE_RETENUE_GARANTIE   TTC, HT
 *  A2   RG_FORMULE_PRECOMPTE_TVA       PRORATA_9_118, TAUX_HT, TAUX_TTC
 *  A3   RG_ARMP_INCLUSE_TTC            true, false   (+ assiette HT / TTC)
 *  A4   RG_NET_PLANCHER_ZERO           true, false   (net négatif)
 *  A5   RG_PENALITE_MODE + PLAFOND     SAISIE, FORMULE × plafond 0 / 10 / 100
 *  A6   RG_AVANCE_MODE                 UNIQUE, DEMARRAGE_APPRO (+ plafond)
 *  A7   RG_ARRONDI_MODE                FRANC_PROCHE, FRANC_INF, FRANC_SUP
 *  Montants : 1 000 GNF, 1 000 000 GNF, 1 000 000 000 GNF, 25 000 000 000 GNF
 * ─────────────────────────────────────────────────────────────────────────────
 */

const DEFAUTS = resoudreRegles([]);
const avec = (surcharges: Partial<Record<string, string>>): ReglesEffectives =>
  ({ ...DEFAUTS, ...surcharges }) as ReglesEffectives;

/** Échelles de référence, du décompte modeste au marché réel en milliards. */
const MONTANTS = [1_000n, 1_000_000n, 1_000_000_000n, 25_000_000_000n];

const A1 = ["TTC", "HT"] as const;
const A2 = ["PRORATA_9_118", "TAUX_HT", "TAUX_TTC"] as const;
const A3 = ["true", "false"] as const;

const calc = (ht: bigint, r: ReglesEffectives, extra: Record<string, unknown> = {}) =>
  calcDecompteRegles({ montantPeriodeHtGnf: ht, ...extra }, r);

// ═══ Matrice A1 × A2 × A3 — 12 combinaisons × 4 échelles ════════════════════

test("matrice A1×A2×A3 — 12 combinaisons sur 4 échelles : invariants structurels", () => {
  let combinaisons = 0;
  for (const a1 of A1) for (const a2 of A2) for (const a3 of A3) {
    combinaisons++;
    const regles = avec({ RG_ASSIETTE_RETENUE_GARANTIE: a1, RG_FORMULE_PRECOMPTE_TVA: a2, RG_ARMP_INCLUSE_TTC: a3 });
    for (const ht of MONTANTS) {
      const r = calc(ht, regles);
      const etiquette = `A1=${a1} A2=${a2} A3=${a3} HT=${ht}`;

      // Tous les montants restent des entiers positifs ou nuls.
      for (const [nom, v] of Object.entries(r)) {
        assert.equal(typeof v, "bigint", `${etiquette} — ${nom} doit être un bigint`);
        if (nom !== "netAPayer") assert.ok((v as bigint) >= 0n, `${etiquette} — ${nom} négatif`);
      }

      // Le TTC contient le HT et la TVA, et l'ARMP seulement si elle est incluse.
      const ttcAttendu = ht + r.tva + (a3 === "true" ? r.montantArmpGnf : 0n);
      assert.equal(r.montantTtcGnf, ttcAttendu, `${etiquette} — composition du TTC`);

      // Aucune déduction ne peut excéder l'assiette qui la porte.
      assert.ok(r.retenueGarantie <= r.montantTtcGnf, `${etiquette} — retenue > TTC`);
      assert.ok(r.precompteTvaGnf <= r.montantTtcGnf, `${etiquette} — précompte > TTC`);
      assert.ok(r.netAPayer <= r.montantTtcGnf, `${etiquette} — net > TTC`);
    }
  }
  assert.equal(combinaisons, 12, "la matrice doit couvrir exactement 12 combinaisons");
});

test("A1 — basculer l'assiette de la retenue ne touche QUE la retenue et le net", () => {
  for (const ht of MONTANTS) {
    const surTtc = calc(ht, avec({ RG_ASSIETTE_RETENUE_GARANTIE: "TTC" }));
    const surHt = calc(ht, avec({ RG_ASSIETTE_RETENUE_GARANTIE: "HT" }));

    assert.equal(surHt.tva, surTtc.tva);
    assert.equal(surHt.montantArmpGnf, surTtc.montantArmpGnf);
    assert.equal(surHt.montantTtcGnf, surTtc.montantTtcGnf);
    assert.equal(surHt.precompteTvaGnf, surTtc.precompteTvaGnf);
    assert.equal(surHt.avanceRecuperee, surTtc.avanceRecuperee);

    // Ce que la retenue perd, le net le gagne — exactement.
    assert.equal(surHt.netAPayer - surTtc.netAPayer, surTtc.retenueGarantie - surHt.retenueGarantie, `HT=${ht}`);
    // Avec une TVA positive, l'assiette TTC est plus large que l'assiette HT.
    assert.ok(surHt.retenueGarantie <= surTtc.retenueGarantie, `HT=${ht}`);
  }
});

test("A2 — changer la formule du précompte ne touche QUE le précompte et le net", () => {
  for (const ht of MONTANTS) {
    const reference = calc(ht, avec({ RG_FORMULE_PRECOMPTE_TVA: "PRORATA_9_118" }));
    for (const formule of ["TAUX_HT", "TAUX_TTC"] as const) {
      const variante = calc(ht, avec({ RG_FORMULE_PRECOMPTE_TVA: formule }));
      assert.equal(variante.tva, reference.tva);
      assert.equal(variante.montantTtcGnf, reference.montantTtcGnf);
      assert.equal(variante.retenueGarantie, reference.retenueGarantie);
      assert.equal(variante.avanceRecuperee, reference.avanceRecuperee);
      assert.equal(
        variante.netAPayer - reference.netAPayer,
        reference.precompteTvaGnf - variante.precompteTvaGnf,
        `${formule} HT=${ht}`,
      );
    }
  }
});

test("A3 — sortir l'ARMP du TTC réduit le TTC d'exactement l'ARMP", () => {
  for (const ht of MONTANTS) {
    const incluse = calc(ht, avec({ RG_ARMP_INCLUSE_TTC: "true" }));
    const exclue = calc(ht, avec({ RG_ARMP_INCLUSE_TTC: "false" }));
    assert.equal(incluse.montantArmpGnf, exclue.montantArmpGnf, "le montant de la redevance ne change pas");
    assert.equal(incluse.montantTtcGnf - exclue.montantTtcGnf, incluse.montantArmpGnf, `HT=${ht}`);
    // L'ARMP incluse est ajoutée au TTC puis redéduite du net : son effet net
    // passe uniquement par l'élargissement du précompte et de la retenue.
    const ecartNet = exclue.netAPayer - incluse.netAPayer;
    const ecartDeductions = (incluse.precompteTvaGnf + incluse.retenueGarantie) - (exclue.precompteTvaGnf + exclue.retenueGarantie);
    assert.equal(ecartNet, ecartDeductions, `HT=${ht}`);
  }
});

test("A3 — assiette TTC de l'ARMP : redevance plus élevée qu'en assiette HT", () => {
  for (const ht of MONTANTS) {
    const surHt = calc(ht, avec({ RG_ARMP_ASSIETTE: "HT" }));
    const surTtc = calc(ht, avec({ RG_ARMP_ASSIETTE: "TTC" }));
    assert.ok(surTtc.montantArmpGnf >= surHt.montantArmpGnf, `HT=${ht}`);
  }
});

// ═══ A4 — bornage du net à payer ════════════════════════════════════════════

test("A4 — sans plancher, des pénalités écrasantes rendent le net négatif", () => {
  const r = calc(1_000_000n, avec({ RG_NET_PLANCHER_ZERO: "false" }), { penalites: 5_000_000n });
  assert.ok(r.netAPayer < 0n, "le net doit pouvoir devenir négatif quand le plancher est désactivé");
});

test("A4 — avec plancher, le net est ramené à zéro sans jamais passer sous zéro", () => {
  for (const penalites of [2_000_000n, 5_000_000n, 1_000_000_000n]) {
    const r = calc(1_000_000n, avec({ RG_NET_PLANCHER_ZERO: "true" }), { penalites });
    assert.equal(r.netAPayer, 0n, `pénalités=${penalites}`);
  }
});

test("A4 — le plancher ne modifie pas un net déjà positif", () => {
  const sans = calc(1_000_000_000n, avec({ RG_NET_PLANCHER_ZERO: "false" }));
  const avecPlancher = calc(1_000_000_000n, avec({ RG_NET_PLANCHER_ZERO: "true" }));
  assert.ok(sans.netAPayer > 0n);
  assert.equal(avecPlancher.netAPayer, sans.netAPayer);
});

test("A4 — le report de l'excédent est EFFECTIF (décision DAF du 26/08/2026)", () => {
  // Ce test figeait autrefois une LACUNE : la règle était déclarée sans
  // effet. La décision DAF du 26/08/2026 l'implémente : le reliquat non
  // absorbé est reporté sur le décompte suivant, borné aux pénalités.
  const sans = calc(1_000_000n, avec({ RG_REPORT_PENALITES: "false", RG_NET_PLANCHER_ZERO: "true" }), { penalites: 5_000_000n });
  const avecReport = calc(1_000_000n, avec({ RG_REPORT_PENALITES: "true", RG_NET_PLANCHER_ZERO: "true" }), { penalites: 5_000_000n });
  assert.equal(sans.penalitesReporteesGnf, 0n, "report inactif : aucun reliquat");
  // Net avant pénalités = 830 242 GNF ; pénalités 5 000 000 → excédent
  // 4 169 758 (inférieur aux pénalités : intégralement reporté, sans borne).
  assert.equal(avecReport.penalitesReporteesGnf, 4_169_758n, "l'excédent non absorbé est reporté");
  assert.equal(avecReport.netAPayer, 0n);
  assert.equal(avecReport.netAPayer, sans.netAPayer);
});

// ═══ A5 — pénalités de retard ═══════════════════════════════════════════════

test("A5 — mode SAISIE : les jours de retard sont ignorés", () => {
  const sansRetard = calc(1_000_000_000n, avec({ RG_PENALITE_MODE: "SAISIE" }), { penalites: 1_000n });
  const avecRetard = calc(1_000_000_000n, avec({ RG_PENALITE_MODE: "SAISIE" }), { penalites: 1_000n, joursRetard: 90 });
  assert.equal(avecRetard.netAPayer, sansRetard.netAPayer);
});

test("A5 — mode FORMULE : la pénalité croît avec les jours de retard", () => {
  const regles = avec({ RG_PENALITE_MODE: "FORMULE", RG_PENALITE_PLAFOND_PCT: "100" });
  const nets = [0, 10, 30, 90].map((j) => calc(1_000_000_000n, regles, { joursRetard: j }).netAPayer);
  for (let i = 1; i < nets.length; i++) {
    assert.ok(nets[i] < nets[i - 1], `le net doit décroître quand le retard augmente (étape ${i})`);
  }
});

test("A5 — plafond des pénalités : 10 % borne la déduction, 0 % l'annule", () => {
  const base = { joursRetard: 3650 }; // dix ans de retard : sans plafond, absurde
  const net100 = calc(1_000_000_000n, avec({ RG_PENALITE_MODE: "FORMULE", RG_PENALITE_PLAFOND_PCT: "100" }), base).netAPayer;
  const net10 = calc(1_000_000_000n, avec({ RG_PENALITE_MODE: "FORMULE", RG_PENALITE_PLAFOND_PCT: "10" }), base).netAPayer;
  const net0 = calc(1_000_000_000n, avec({ RG_PENALITE_MODE: "FORMULE", RG_PENALITE_PLAFOND_PCT: "0" }), base).netAPayer;

  assert.ok(net100 < net10, "sans plafond effectif, la pénalité est plus lourde");
  assert.ok(net10 < net0, "un plafond à 0 % annule la pénalité");
  // À 0 %, le résultat rejoint celui d'un décompte sans retard.
  assert.equal(net0, calc(1_000_000_000n, avec({ RG_PENALITE_MODE: "FORMULE", RG_PENALITE_PLAFOND_PCT: "0" })).netAPayer);
});

test("A5 — assiette TTC : pénalité plus lourde qu'en assiette HT", () => {
  const base = { joursRetard: 100 };
  const surHt = calc(1_000_000_000n, avec({ RG_PENALITE_MODE: "FORMULE", RG_PENALITE_ASSIETTE: "HT" }), base);
  const surTtc = calc(1_000_000_000n, avec({ RG_PENALITE_MODE: "FORMULE", RG_PENALITE_ASSIETTE: "TTC" }), base);
  assert.ok(surTtc.netAPayer < surHt.netAPayer);
});

// ═══ A6 — avances ═══════════════════════════════════════════════════════════

test("A6 — mode UNIQUE : la récupération suit le taux d'avance", () => {
  const r = calc(1_000_000_000n, avec({ RG_AVANCE_MODE: "UNIQUE" }), { tauxAvance: 30 });
  assert.equal(r.avanceRecuperee, 300_000_000n);
});

test("A6 — mode DEMARRAGE_APPRO : les deux natures s'additionnent", () => {
  const regles = avec({
    RG_AVANCE_MODE: "DEMARRAGE_APPRO",
    RG_TAUX_AVANCE_DEMARRAGE: "15",
    RG_TAUX_AVANCE_APPROVISIONNEMENT: "10",
  });
  const r = calc(1_000_000_000n, regles);
  assert.equal(r.avanceRecuperee, 250_000_000n, "15 % + 10 % du HT");
});

test("A6 — DEMARRAGE_APPRO sans taux renseignés : repli sur le mode unique", () => {
  const incomplet = avec({ RG_AVANCE_MODE: "DEMARRAGE_APPRO", RG_TAUX_AVANCE_DEMARRAGE: "", RG_TAUX_AVANCE_APPROVISIONNEMENT: "" });
  const r = calc(1_000_000_000n, incomplet, { tauxAvance: 20 });
  assert.equal(r.avanceRecuperee, 200_000_000n, "aucune récupération fantaisiste faute de paramétrage");
});

test("A6 — le plafond d'avance prime sur les deux modes", () => {
  const solde = 50_000_000n;
  for (const regles of [
    avec({ RG_AVANCE_MODE: "UNIQUE" }),
    avec({ RG_AVANCE_MODE: "DEMARRAGE_APPRO", RG_TAUX_AVANCE_DEMARRAGE: "15", RG_TAUX_AVANCE_APPROVISIONNEMENT: "10" }),
  ]) {
    const r = calc(1_000_000_000n, regles, { avanceRestanteGnf: solde });
    assert.equal(r.avanceRecuperee, solde, "on ne récupère jamais plus que le solde dû");
  }
});

test("A6 — solde d'avance négatif (sur-récupération passée) : aucune déduction", () => {
  const r = calc(1_000_000_000n, DEFAUTS, { avanceRestanteGnf: -5_000n });
  assert.equal(r.avanceRecuperee, 0n);
});

// ═══ A7 — arrondi ═══════════════════════════════════════════════════════════

test("A7 — les trois modes encadrent le même résultat au franc près", () => {
  // HT = 3 GNF, TVA 18 % → 0,54 GNF : le mode d'arrondi devient visible.
  const inf = calc(3n, avec({ RG_ARRONDI_MODE: "FRANC_INF" }));
  const proche = calc(3n, avec({ RG_ARRONDI_MODE: "FRANC_PROCHE" }));
  const sup = calc(3n, avec({ RG_ARRONDI_MODE: "FRANC_SUP" }));

  assert.equal(inf.tva, 0n, "0,54 tronqué");
  assert.equal(proche.tva, 1n, "0,54 arrondi au plus proche");
  assert.equal(sup.tva, 1n, "0,54 arrondi au supérieur");
  assert.ok(inf.tva <= proche.tva && proche.tva <= sup.tva);
});

test("A7 — sur des montants ronds, les trois modes donnent le même résultat", () => {
  for (const ht of [1_000_000n, 1_000_000_000n]) {
    const inf = calc(ht, avec({ RG_ARRONDI_MODE: "FRANC_INF" }));
    const sup = calc(ht, avec({ RG_ARRONDI_MODE: "FRANC_SUP" }));
    assert.equal(inf.tva, sup.tva, `HT=${ht} — pas d'écart quand la division tombe juste`);
  }
});

test("A7 — l'écart entre modes reste borné à quelques francs, jamais proportionnel", () => {
  const inf = calc(25_000_000_001n, avec({ RG_ARRONDI_MODE: "FRANC_INF" }));
  const sup = calc(25_000_000_001n, avec({ RG_ARRONDI_MODE: "FRANC_SUP" }));
  const ecart = sup.netAPayer - inf.netAPayer;
  assert.ok(ecart > -100n && ecart < 100n, `écart de ${ecart} GNF sur 25 milliards : l'arrondi ne doit jamais dériver`);
});

// ═══ Échelle et cohérence générale ══════════════════════════════════════════

test("échelle — doubler le HT double le net à payer, au franc d'arrondi près", () => {
  const simple = calc(1_000_000_000n, DEFAUTS).netAPayer;
  const double = calc(2_000_000_000n, DEFAUTS).netAPayer;
  const ecart = double - simple * 2n;
  assert.ok(ecart > -10n && ecart < 10n, `écart de ${ecart} GNF`);
});

test("échelle — 25 milliards GNF : aucune perte de précision (résultat exact en entiers)", () => {
  const r = calc(25_000_000_000n, DEFAUTS);
  assert.equal(r.tva, 4_500_000_000n, "18 % exact");
  assert.equal(r.montantArmpGnf, 150_000_000n, "0,6 % exact");
  assert.equal(r.avanceRecuperee, 5_000_000_000n, "20 % exact");
});

test("montant nul — tout est à zéro, aucun résidu d'arrondi", () => {
  const r = calc(0n, DEFAUTS);
  for (const [nom, v] of Object.entries(r)) assert.equal(v, 0n, `${nom} devrait être nul`);
});

// ═══ Ancres de non-régression ═══════════════════════════════════════════════

test("ancres — valeurs de référence figées pour 1 000 000 000 GNF HT", () => {
  // Valeurs constatées le 18/08/2026 sur le moteur paramétré. Elles ne sont pas
  // une vérité métier : elles gèlent le comportement actuel pour qu'aucune
  // évolution ne le change en silence. Toute modification volontaire doit
  // mettre ce tableau à jour ET passer par la DAF (AGENTS.md §3.3).
  const HT = 1_000_000_000n;

  const defaut = calc(HT, DEFAUTS);
  assert.equal(defaut.tva, 180_000_000n);
  assert.equal(defaut.montantArmpGnf, 6_000_000n);
  assert.equal(defaut.montantTtcGnf, 1_186_000_000n);
  assert.equal(defaut.precompteTvaGnf, 90_457_627n);
  assert.equal(defaut.retenueGarantie, 59_300_000n);
  assert.equal(defaut.avanceRecuperee, 200_000_000n);
  assert.equal(defaut.netAPayer, 830_242_373n);

  const assietteHt = calc(HT, avec({ RG_ASSIETTE_RETENUE_GARANTIE: "HT" }));
  assert.equal(assietteHt.retenueGarantie, 50_000_000n);
  assert.equal(assietteHt.netAPayer, 839_542_373n);

  const precompteHt = calc(HT, avec({ RG_FORMULE_PRECOMPTE_TVA: "TAUX_HT" }));
  assert.equal(precompteHt.precompteTvaGnf, 90_000_000n);
  assert.equal(precompteHt.netAPayer, 830_700_000n);

  const armpExclue = calc(HT, avec({ RG_ARMP_INCLUSE_TTC: "false" }));
  assert.equal(armpExclue.montantTtcGnf, 1_180_000_000n);
  assert.equal(armpExclue.precompteTvaGnf, 90_000_000n);
  assert.equal(armpExclue.retenueGarantie, 59_000_000n);
  assert.equal(armpExclue.netAPayer, 831_000_000n);
});
