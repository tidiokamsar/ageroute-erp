import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluerGardeFous } from "./configuration";

/**
 * Les garde-fous contre une activation accidentelle (mandat du 20/08/2026, §6).
 * Chacun est indépendant : en contourner un seul ne suffit jamais.
 */
const vide = {};

test("G1 — par defaut la signature est desactivee", () => {
  const c = evaluerGardeFous({}, vide);
  assert.equal(c.mode, "disabled");
  assert.equal(c.actif, false);
  assert.match(c.motifBlocage!, /disabled/);
});

test("G1 — une valeur de mode inconnue retombe sur disabled", () => {
  assert.equal(evaluerGardeFous({ SIG_MODE: "production" }, vide).mode, "disabled");
});

test("G2 — le laboratoire exige l'autorisation explicite de l'environnement", () => {
  const sans = evaluerGardeFous({ SIG_MODE: "laboratory" }, { NODE_ENV: "production" });
  assert.equal(sans.actif, false);
  assert.match(sans.motifBlocage!, /SIGNATURE_LAB_AUTORISE/);
  const avec = evaluerGardeFous({ SIG_MODE: "laboratory" }, { NODE_ENV: "production", SIGNATURE_LAB_AUTORISE: "oui" });
  assert.equal(avec.actif, true);
});

test("G3 — la production reste NO-GO sans l'autorisation explicite", () => {
  const c = evaluerGardeFous(
    { SIG_MODE: "provider", SIG_PRESTATAIRE_TYPE: "signserver", SIG_PRESTATAIRE_URL: "https://psc.example", SIG_ANCRES_CONFIANCE: "-----BEGIN CERTIFICATE-----x" },
    { SIGNATURE_LAB_AUTORISE: "oui" },
  );
  assert.equal(c.actif, false);
  assert.match(c.motifBlocage!, /NO_GO_SIGNATURE_PRODUCTION/);
});

test("G4 — la production refuse un prestataire simule, des ancres vides, une URL non HTTPS", () => {
  const base = { SIG_MODE: "provider", SIG_PRESTATAIRE_TYPE: "signserver", SIG_PRESTATAIRE_URL: "https://psc.example", SIG_ANCRES_CONFIANCE: "-----BEGIN CERTIFICATE-----x" };
  const envOk = { SIGNATURE_PRODUCTION_AUTORISEE: "oui" };
  assert.match(evaluerGardeFous({ ...base, SIG_PRESTATAIRE_TYPE: "simule" }, envOk).motifBlocage!, /simulé/);
  assert.match(evaluerGardeFous({ ...base, SIG_ANCRES_CONFIANCE: "" }, envOk).motifBlocage!, /ancres/);
  assert.match(evaluerGardeFous({ ...base, SIG_PRESTATAIRE_URL: "http://psc.example" }, envOk).motifBlocage!, /HTTPS/);
  assert.equal(evaluerGardeFous(base, envOk).actif, true);
});

test("G5 — le filigrane est impose dans tout mode sauf provider, texte configurable, presence non", () => {
  const lab = evaluerGardeFous({ SIG_MODE: "laboratory", SIG_FILIGRANE_TEXTE: "" }, { SIGNATURE_LAB_AUTORISE: "oui" });
  assert.equal(lab.filigraneImpose, true);
  assert.equal(lab.filigraneTexte, "SIMULATION — SANS VALEUR JURIDIQUE", "un texte vide retombe sur la mention par defaut");
  const prod = evaluerGardeFous(
    { SIG_MODE: "provider", SIG_PRESTATAIRE_TYPE: "signserver", SIG_PRESTATAIRE_URL: "https://x", SIG_ANCRES_CONFIANCE: "-----BEGIN CERTIFICATE-----x" },
    { SIGNATURE_PRODUCTION_AUTORISEE: "oui" },
  );
  assert.equal(prod.filigraneImpose, false);
});

test("un prestataire SignServer sans URL est refuse, meme en laboratoire autorise", () => {
  const c = evaluerGardeFous({ SIG_MODE: "laboratory", SIG_PRESTATAIRE_TYPE: "signserver" }, { SIGNATURE_LAB_AUTORISE: "oui" });
  assert.equal(c.actif, false);
  assert.match(c.motifBlocage!, /URL/);
});

test("le niveau PAdES inconnu retombe sur B", () => {
  assert.equal(evaluerGardeFous({ SIG_NIVEAU_PADES: "XL" }, vide).niveau, "B");
  assert.equal(evaluerGardeFous({ SIG_NIVEAU_PADES: "LTA" }, vide).niveau, "LTA");
});
