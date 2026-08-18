import test from "node:test";
import assert from "node:assert/strict";
import { REGLES_DEFAUT } from "../../lib/regles";
import {
  METADONNEES,
  MOTIF_LONGUEUR_MIN,
  estCleConnue,
  peutValiderRegle,
  validerDemande,
  validerValeur,
} from "./regles.catalogue";

/**
 * Lot L0.2 — matrice de validation et principe des quatre yeux.
 * Chaque rejet exigé par la spécification a son cas : auto-validation, motif
 * trop court, type incohérent, clé inconnue, date d'effet passée, portée sans
 * identifiant.
 */

const AUJOURDHUI = new Date("2026-08-18T10:00:00Z");
const DEMANDE_VALIDE = {
  cle: "RG_TAUX_ARMP",
  valeur: "0.8",
  portee: "GLOBAL",
  motif: "Relèvement du taux ARMP décidé par la DAF",
};

// ─── Catalogue ────────────────────────────────────────────────────────────────

test("catalogue — chaque clé de REGLES_DEFAUT possède ses métadonnées", () => {
  const manquantes = Object.keys(REGLES_DEFAUT).filter((c) => !(c in METADONNEES));
  assert.deepEqual(manquantes, [], "clés sans métadonnées");
});

test("catalogue — aucune métadonnée orpheline", () => {
  const orphelines = Object.keys(METADONNEES).filter((c) => !(c in REGLES_DEFAUT));
  assert.deepEqual(orphelines, []);
});

test("catalogue — les valeurs par défaut sont elles-mêmes valides", () => {
  for (const cle of Object.keys(REGLES_DEFAUT) as (keyof typeof REGLES_DEFAUT)[]) {
    assert.equal(validerValeur(cle, REGLES_DEFAUT[cle]), null, `défaut invalide pour ${cle}`);
  }
});

test("catalogue — clé inconnue reconnue comme telle", () => {
  assert.equal(estCleConnue("RG_TAUX_ARMP"), true);
  assert.equal(estCleConnue("RG_INVENTEE"), false);
});

// ─── Validation des valeurs par type ─────────────────────────────────────────

test("type ENUM — hors des choix admis : rejet", () => {
  assert.equal(validerValeur("RG_ASSIETTE_RETENUE_GARANTIE", "TTC"), null);
  assert.match(String(validerValeur("RG_ASSIETTE_RETENUE_GARANTIE", "NET")), /hors des choix/);
});

test("type NUMBER — hors bornes : rejet", () => {
  assert.equal(validerValeur("RG_TAUX_ARMP", "0.6"), null);
  assert.match(String(validerValeur("RG_TAUX_ARMP", "150")), /inférieure ou égale/);
  assert.match(String(validerValeur("RG_TAUX_ARMP", "-1")), /supérieure ou égale/);
  assert.match(String(validerValeur("RG_TAUX_ARMP", "beaucoup")), /doit être un nombre/);
});

test("type BOOLEAN — seuls true et false", () => {
  assert.equal(validerValeur("RG_NET_PLANCHER_ZERO", "true"), null);
  assert.equal(validerValeur("RG_NET_PLANCHER_ZERO", "false"), null);
  assert.match(String(validerValeur("RG_NET_PLANCHER_ZERO", "oui")), /true.*false/);
});

test("type MULTI — rôle inexistant : rejet", () => {
  assert.equal(validerValeur("WF_ROLES_ORDONNANCEMENT", "ADMIN,DAF"), null);
  assert.match(String(validerValeur("WF_ROLES_ORDONNANCEMENT", "ADMIN,SORCIER")), /Valeurs inconnues : SORCIER/);
});

test("type JSON — JSON invalide : rejet", () => {
  assert.equal(validerValeur("CF_SCORE_PONDERATIONS", '{"NIF":20}'), null);
  assert.match(String(validerValeur("CF_SCORE_PONDERATIONS", "{NIF:20")), /JSON valide/);
});

test("valeur vide — admise seulement là où le défaut est vide", () => {
  assert.equal(validerValeur("RG_TAUX_AVANCE_DEMARRAGE", ""), null, "interrupteur optionnel");
  assert.match(String(validerValeur("RG_TAUX_ARMP", "")), /ne peut pas être vide/);
});

// ─── Validation de la demande complète ───────────────────────────────────────

test("demande recevable — aucune erreur", () => {
  assert.deepEqual(validerDemande(DEMANDE_VALIDE, AUJOURDHUI), []);
});

test("rejet — clé inconnue", () => {
  const erreurs = validerDemande({ ...DEMANDE_VALIDE, cle: "RG_FANTAISIE" }, AUJOURDHUI);
  assert.ok(erreurs.some((e) => /Clé de règle inconnue/.test(e)));
});

test("rejet — motif absent ou trop court", () => {
  for (const motif of [undefined, "", "court", "         ", "ajustement".slice(0, 9)]) {
    const erreurs = validerDemande({ ...DEMANDE_VALIDE, motif }, AUJOURDHUI);
    assert.ok(erreurs.some((e) => e.includes(String(MOTIF_LONGUEUR_MIN))), `motif « ${motif} » aurait dû être rejeté`);
  }
  // La limite est un minimum inclusif : 10 caractères passent.
  assert.deepEqual(validerDemande({ ...DEMANDE_VALIDE, motif: "ajustement" }, AUJOURDHUI), []);
});

test("rejet — type incohérent avec la clé", () => {
  const erreurs = validerDemande({ ...DEMANDE_VALIDE, cle: "RG_ARRONDI_MODE", valeur: "AU_PIF" }, AUJOURDHUI);
  assert.ok(erreurs.some((e) => /hors des choix/.test(e)));
});

test("rejet — portée autre que GLOBAL sans identifiant", () => {
  const erreurs = validerDemande({ ...DEMANDE_VALIDE, portee: "BAILLEUR" }, AUJOURDHUI);
  assert.ok(erreurs.some((e) => /exige un identifiant de portée/.test(e)));
  assert.deepEqual(validerDemande({ ...DEMANDE_VALIDE, portee: "BAILLEUR", porteeId: "BAD" }, AUJOURDHUI), []);
});

test("rejet — portée inconnue", () => {
  const erreurs = validerDemande({ ...DEMANDE_VALIDE, portee: "REGION" }, AUJOURDHUI);
  assert.ok(erreurs.some((e) => /Portée inconnue/.test(e)));
});

test("rejet — date d'effet dans le passé ; aujourd'hui accepté", () => {
  const passe = validerDemande({ ...DEMANDE_VALIDE, dateEffet: "2026-08-17" }, AUJOURDHUI);
  assert.ok(passe.some((e) => /ne peut pas être dans le passé/.test(e)));

  assert.deepEqual(validerDemande({ ...DEMANDE_VALIDE, dateEffet: "2026-08-18" }, AUJOURDHUI), [], "le jour même est accepté");
  assert.deepEqual(validerDemande({ ...DEMANDE_VALIDE, dateEffet: "2026-12-01" }, AUJOURDHUI), []);
});

test("rejet — date d'effet illisible", () => {
  const erreurs = validerDemande({ ...DEMANDE_VALIDE, dateEffet: "la semaine prochaine" }, AUJOURDHUI);
  assert.ok(erreurs.some((e) => /illisible/.test(e)));
});

test("les motifs de rejet sont cumulés, pas arrêtés au premier", () => {
  const erreurs = validerDemande({ cle: "RG_INCONNUE", valeur: "x", portee: "MARCHE", motif: "court" }, AUJOURDHUI);
  assert.ok(erreurs.length >= 3, `attendu au moins 3 motifs, obtenu ${erreurs.length}`);
});

// ─── Quatre yeux ─────────────────────────────────────────────────────────────

test("quatre yeux — nul ne valide sa propre saisie, même ADMIN", () => {
  const verdict = peutValiderRegle("ADMIN", "user-1", "user-1");
  assert.equal(verdict.ok, false);
  assert.match(String(verdict.motif), /autre personne/);
});

test("quatre yeux — un DAF valide la saisie d'un autre", () => {
  assert.equal(peutValiderRegle("DAF", "user-2", "user-1").ok, true);
});

test("quatre yeux — un ADMIN valide la saisie d'un autre", () => {
  assert.equal(peutValiderRegle("ADMIN", "user-2", "user-1").ok, true);
});

test("quatre yeux — un DAF ne valide pas davantage sa propre saisie", () => {
  assert.equal(peutValiderRegle("DAF", "user-1", "user-1").ok, false);
});

test("quatre yeux — les autres rôles ne valident pas", () => {
  for (const role of ["DMC", "DG", "MISSION", "ENTREPRISE", "AUDITEUR"]) {
    const verdict = peutValiderRegle(role, "user-2", "user-1");
    assert.equal(verdict.ok, false, `${role} ne doit pas pouvoir valider`);
    assert.match(String(verdict.motif), /DAF ou ADMIN/);
  }
});

test("quatre yeux — saisiPar absent (règle importée) : le rôle décide seul", () => {
  assert.equal(peutValiderRegle("DAF", "user-2", null).ok, true);
  assert.equal(peutValiderRegle("DMC", "user-2", null).ok, false);
});
