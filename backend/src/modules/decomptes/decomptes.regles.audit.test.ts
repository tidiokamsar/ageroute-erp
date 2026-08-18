/**
 * Tests — audit de rejeu et gel (lot L1.2).
 * Invariants :
 *  1. un décompte calculé par le moteur (défauts) rejoue CONFORME avec son
 *     snapshot GLOBAL ;
 *  2. le rejeu suit le SNAPSHOT, jamais les règles actuelles — changer les
 *     règles après coup ne doit pas fausser l'explication d'un décompte ;
 *  3. un montant altéré est détecté (écart listé champ par champ) ;
 *  4. voie LIGNES : la combinaison du net est vérifiée selon le snapshot ;
 *  5. sans snapshot (décomptes anciens) : message explicite, pas de silence ;
 *  6. gel : une règle FINANCE est bloquée si des décomptes sont en circuit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resoudreRegles } from "../../lib/regles";
import { calcDecompteRegles } from "./decomptes.calc.regles";
import { construireSnapshot, rejouerCalcul, lireSnapshot, verifierGelFinancier, type DecompteRejouable } from "./decomptes.regles.audit";

const DEFAUTS = resoudreRegles([]);
const TAUX = { tauxTva: 18, tauxRetenueGarantie: 5, tauxAvance: 20 };

function decompteCalculeAvec(regles = DEFAUTS, surcharges: Partial<DecompteRejouable> & { penalitesCalc?: bigint } = {}): DecompteRejouable {
  const penalites = surcharges.penalitesCalc ?? 50_000n;
  const r = calcDecompteRegles({ montantPeriodeHtGnf: 1_000_000n, penalites, ...TAUX }, regles);
  const { penalitesCalc, ...autres } = surcharges;
  return {
    montantPeriodeHtGnf: 1_000_000n,
    cumulPrecedentHtGnf: 250_000n,
    penalites,
    revisionPrix: 0n,
    ...r,
    ...autres,
  };
}

test("rejeu GLOBAL — concordance exacte pour un décompte issu du moteur (défauts)", () => {
  const d = decompteCalculeAvec();
  const resultat = rejouerCalcul(d, TAUX, construireSnapshot(DEFAUTS, "GLOBAL"));
  assert.equal(resultat.concordance, true);
  assert.deepEqual(resultat.differences, []);
  assert.equal(resultat.methode, "GLOBAL");
});

test("rejeu GLOBAL — le rejeu suit le SNAPSHOT, pas les règles actuelles", () => {
  // Décompte calculé avec les défauts (retenue sur TTC), snapshot figé A1=TTC
  const d = decompteCalculeAvec(DEFAUTS);
  // Un lecteur d'aujourd'hui utiliserait des règles arbitrées A1=HT : le rejeu
  // doit rester conforme AU SNAPSHOT (TTC) — pas de retouche rétrospective.
  const snapshotTtc = construireSnapshot({ ...DEFAUTS, RG_ASSIETTE_RETENUE_GARANTIE: "TTC" }, "GLOBAL");
  assert.equal(rejouerCalcul(d, TAUX, snapshotTtc).concordance, true);

  // Inversement : un décompte réellement calculé avec A1=HT (retenue 50 000)
  // rejoue conforme avec SON snapshot HT — et NON conforme avec un snapshot TTC
  const dHt = decompteCalculeAvec({ ...DEFAUTS, RG_ASSIETTE_RETENUE_GARANTIE: "HT" });
  assert.equal(rejouerCalcul(dHt, TAUX, construireSnapshot({ ...DEFAUTS, RG_ASSIETTE_RETENUE_GARANTIE: "HT" }, "GLOBAL")).concordance, true);
  const mauvais = rejouerCalcul(dHt, TAUX, construireSnapshot(DEFAUTS, "GLOBAL"));
  assert.equal(mauvais.concordance, false);
  assert.ok(mauvais.differences!.some((x) => x.champ === "retenueGarantie"));
});

test("rejeu GLOBAL — un montant altéré est détecté, champ identifié", () => {
  const d = decompteCalculeAvec();
  const altere = { ...d, netAPayer: d.netAPayer + 123_456n };
  const resultat = rejouerCalcul(altere, TAUX, construireSnapshot(DEFAUTS, "GLOBAL"));
  assert.equal(resultat.concordance, false);
  const ecart = resultat.differences!.find((x) => x.champ === "netAPayer");
  assert.ok(ecart);
  assert.equal(BigInt(ecart!.recalcule) - BigInt(ecart!.enregistre), -123_456n);
});

test("rejeu LIGNES — combinaison du net vérifiée selon le snapshot (plancher inclus)", () => {
  const d = decompteCalculeAvec(); // composants = sommes de lignes
  assert.equal(rejouerCalcul(d, TAUX, construireSnapshot(DEFAUTS, "LIGNES")).concordance, true);

  const altere = { ...d, netAPayer: d.netAPayer - 1n };
  assert.equal(rejouerCalcul(altere, TAUX, construireSnapshot(DEFAUTS, "LIGNES")).concordance, false);

  // Composants à combinaison NÉGATIVE (pénalités > montant, défauts sans plancher)
  const negatif = decompteCalculeAvec(DEFAUTS, { penalitesCalc: 2_000_000n });
  assert.ok(negatif.netAPayer < 0n, "précondition : combinaison négative");
  // Sans plancher dans le snapshot : le rejeu attend le négatif tel quel
  assert.equal(rejouerCalcul(negatif, TAUX, construireSnapshot(DEFAUTS, "LIGNES")).concordance, true);
  // Avec plancher dans le snapshot : le rejeu attend 0 → écart signalé
  const r = rejouerCalcul(negatif, TAUX, construireSnapshot({ ...DEFAUTS, RG_NET_PLANCHER_ZERO: "true" }, "LIGNES"));
  assert.equal(r.concordance, false);
  assert.equal(r.differences![0].recalcule, "0");
});

test("rejeu — sans snapshot (décomptes antérieurs) : message explicite, jamais de silence", () => {
  const d = decompteCalculeAvec();
  const r = rejouerCalcul(d, TAUX, null);
  assert.ok(r.erreur && r.erreur.includes("antérieur au mécanisme"));
  assert.equal(r.concordance, undefined);
  // lecture d'un JSON invalide → traité comme absent
  assert.equal(lireSnapshot("n'importe quoi"), null);
  assert.equal(lireSnapshot({ regles: {}, methode: "GLOBAL" })!.methode, "GLOBAL");
});

test("gel — règle FINANCE bloquée si des décomptes sont en circuit", () => {
  const refuse = verifierGelFinancier("FINANCE", 3);
  assert.equal(refuse.autorise, false);
  assert.ok(refuse.message.includes("3 décompte(s)"));
  assert.equal(verifierGelFinancier("FINANCE", 0).autorise, true);
  assert.equal(verifierGelFinancier("WORKFLOW", 5).autorise, true);
});
