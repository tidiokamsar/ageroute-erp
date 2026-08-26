/**
 * Tests — moteur de règles de gestion (lib/regles, lot L0.1).
 * La résolution est pure : cascades de portée, dates d'effet, versions,
 * statuts, clés inconnues, et surtout l'invariant du programme :
 * SANS règles en table, les valeurs effectives = comportement actuel.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { REGLES_DEFAUT, resoudreRegles, nombreRegles, booleenRegles, type RegleRecord } from "./regles";

const J0 = new Date("2026-01-01T00:00:00Z");
const J1 = new Date("2026-06-01T00:00:00Z");
const J2 = new Date("2026-08-01T00:00:00Z");

function rec(partial: Partial<RegleRecord>): RegleRecord {
  return {
    cle: "RG_ASSIETTE_RETENUE_GARANTIE", portee: "GLOBAL", porteeId: "",
    valeur: "HT", dateEffet: J0, version: 1, statut: "VALIDE", ...partial,
  };
}

test("invariant du programme — sans règles, les défauts s'appliquent (dont les décisions DAF du 26/08/2026)", () => {
  const r = resoudreRegles([], {}, J2);
  assert.equal(r.RG_ASSIETTE_RETENUE_GARANTIE, "TTC");
  assert.equal(r.RG_FORMULE_PRECOMPTE_TVA, "PRORATA_9_118");
  assert.equal(r.RG_TAUX_ARMP, "0.6");
  // Décision DAF 26/08/2026 : net borné à zéro, excédent de pénalités reporté.
  assert.equal(r.RG_NET_PLANCHER_ZERO, "true");
  assert.equal(r.RG_REPORT_PENALITES, "true");
  assert.equal(r.RG_PENALITE_MODE, "SAISIE");
  assert.equal(r.RG_AVANCE_MODE, "UNIQUE");
  assert.equal(r.RG_ARRONDI_MODE, "FRANC_PROCHE");
  assert.deepEqual(Object.keys(r).sort(), Object.keys(REGLES_DEFAUT).sort());
});

test("une règle VALIDE globale surcharge le défaut", () => {
  const r = resoudreRegles([rec({ valeur: "HT" })], {}, J2);
  assert.equal(r.RG_ASSIETTE_RETENUE_GARANTIE, "HT");
});

test("cascade de portée — MARCHE bat TYPE_MARCHE bat BAILLEUR bat GLOBAL", () => {
  const r = resoudreRegles([
    rec({ portee: "GLOBAL", valeur: "TTC" }),
    rec({ portee: "BAILLEUR", porteeId: "BM", valeur: "HT" }),
    rec({ portee: "TYPE_MARCHE", porteeId: "TRAVAUX", valeur: "TTC" }),
    rec({ portee: "MARCHE", porteeId: "M1", valeur: "HT" }),
  ], { bailleur: "BM", typeMarche: "TRAVAUX", marcheId: "M1" }, J2);
  assert.equal(r.RG_ASSIETTE_RETENUE_GARANTIE, "HT"); // la plus spécifique

  const r2 = resoudreRegles([
    rec({ portee: "GLOBAL", valeur: "TTC" }),
    rec({ portee: "BAILLEUR", porteeId: "BM", valeur: "HT" }),
    rec({ portee: "TYPE_MARCHE", porteeId: "TRAVAUX", valeur: "TTC" }),
  ], { bailleur: "BM", typeMarche: "TRAVAUX", marcheId: "M1" }, J2);
  assert.equal(r2.RG_ASSIETTE_RETENUE_GARANTIE, "TTC"); // type de marché bat bailleur
});

test("portée non applicable au contexte — ignorée", () => {
  const r = resoudreRegles([rec({ portee: "MARCHE", porteeId: "M2", valeur: "HT" })], { marcheId: "M1" }, J2);
  assert.equal(r.RG_ASSIETTE_RETENUE_GARANTIE, "TTC"); // défaut conservé
});

test("date d'effet future — ignorée (règle pas encore en vigueur)", () => {
  const r = resoudreRegles([rec({ dateEffet: new Date("2027-01-01T00:00:00Z") })], {}, J2);
  assert.equal(r.RG_ASSIETTE_RETENUE_GARANTIE, "TTC");
});

test("statut BROUILLON ou ARCHIVE — ignoré (quatre yeux obligatoires)", () => {
  for (const statut of ["BROUILLON", "ARCHIVE"]) {
    const r = resoudreRegles([rec({ statut })], {}, J2);
    assert.equal(r.RG_ASSIETTE_RETENUE_GARANTIE, "TTC");
  }
});

test("à portée égale — date d'effet la plus récente puis version la plus haute", () => {
  const r = resoudreRegles([
    rec({ dateEffet: J0, version: 1, valeur: "HT" }),
    rec({ dateEffet: J1, version: 1, valeur: "TTC" }),
  ], {}, J2);
  assert.equal(r.RG_ASSIETTE_RETENUE_GARANTIE, "TTC");

  const r2 = resoudreRegles([
    rec({ dateEffet: J1, version: 1, valeur: "HT" }),
    rec({ dateEffet: J1, version: 2, valeur: "TTC" }),
  ], {}, J2);
  assert.equal(r2.RG_ASSIETTE_RETENUE_GARANTIE, "TTC");
});

test("clé inconnue — ignorée sans erreur", () => {
  const r = resoudreRegles([rec({ cle: "RG_INEXISTANTE", valeur: "X" })], {}, J2);
  assert.equal("RG_INEXISTANTE" in r, false);
});

test("accès typé — nombre et booléen avec repli sur le défaut", () => {
  const r = resoudreRegles([], {}, J2);
  assert.equal(nombreRegles(r, "RG_TAUX_ARMP"), 0.6);
  // Décision DAF 26/08/2026 : plancher du net actif par défaut.
  assert.equal(booleenRegles(r, "RG_NET_PLANCHER_ZERO"), true);
  assert.equal(booleenRegles(r, "RG_ARMP_INCLUSE_TTC"), true);
  // valeur numérique corrompue → repli sur le défaut, jamais de NaN silencieux
  const corrompu = { ...r, RG_TAUX_ARMP: "pas-un-nombre" } as typeof r;
  assert.equal(nombreRegles(corrompu, "RG_TAUX_ARMP"), 0.6);
});
