import test from "node:test";
import assert from "node:assert/strict";
import { REGLES_DEFAUT } from "../../lib/regles";
import {
  DOMAINES_ETIQUETTES,
  METADONNEES,
  MOTIF_LONGUEUR_MIN,
  estCleConnue,
  peutValiderRegle,
  validerDemande,
  validerEtiquettes,
  validerPonderations,
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

// ─── A9 — Étiquettes d'états officiels (lot L2.2) ────────────────────────────

test("étiquettes — forme conforme acceptée", () => {
  assert.equal(validerEtiquettes({ DECOMPTE: { VALIDE: "Décompte visé" } }), null);
  assert.equal(validerEtiquettes({}), null, "aucune surcharge = valide");
});

test("étiquettes — un domaine inconnu est refusé", () => {
  const message = validerEtiquettes({ FACTURE: { PAYE: "Réglée" } });
  assert.match(String(message), /Domaine d'étiquette inconnu : FACTURE/);
});

test("étiquettes — tous les domaines déclarés sont acceptés", () => {
  for (const domaine of DOMAINES_ETIQUETTES) {
    assert.equal(validerEtiquettes({ [domaine]: { CODE: "Libellé" } }), null, domaine);
  }
});

test("étiquettes — un libellé vide ou non textuel est refusé", () => {
  assert.match(String(validerEtiquettes({ DECOMPTE: { VALIDE: "" } })), /Libellé vide/);
  assert.match(String(validerEtiquettes({ DECOMPTE: { VALIDE: "   " } })), /Libellé vide/);
  assert.match(String(validerEtiquettes({ DECOMPTE: { VALIDE: 42 } })), /non textuel/);
  assert.match(String(validerEtiquettes({ DECOMPTE: { VALIDE: null } })), /Libellé vide/);
});

test("étiquettes — structure aberrante refusée (tableau, chaîne, domaine non objet)", () => {
  assert.match(String(validerEtiquettes([])), /doivent être un objet/);
  assert.match(String(validerEtiquettes("VALIDE=Visé")), /doivent être un objet/);
  assert.match(String(validerEtiquettes(null)), /doivent être un objet/);
  assert.match(String(validerEtiquettes({ DECOMPTE: "Visé" })), /doit contenir un objet/);
  assert.match(String(validerEtiquettes({ DECOMPTE: ["Visé"] })), /doit contenir un objet/);
});

test("étiquettes — ETQ_MAPPINGS est validé au passage par validerValeur", () => {
  assert.equal(validerValeur("ETQ_MAPPINGS", '{"DECOMPTE":{"VALIDE":"Décompte visé"}}'), null);
  assert.match(String(validerValeur("ETQ_MAPPINGS", '{"FACTURE":{"X":"Y"}}')), /Domaine d'étiquette inconnu/);
  assert.match(String(validerValeur("ETQ_MAPPINGS", "pas du json")), /JSON valide/);
});

test("étiquettes — une demande complète est recevable de bout en bout", () => {
  const erreurs = validerDemande({
    cle: "ETQ_MAPPINGS",
    valeur: '{"DECOMPTE":{"ORDONNANCE":"Mandaté"}}',
    portee: "BAILLEUR",
    porteeId: "BAD",
    motif: "Terminologie imposée par la Banque africaine de développement",
  }, AUJOURDHUI);
  assert.deepEqual(erreurs, []);
});

// ─── A10 — Pondérations du score de conformité (lot L3.2) ────────────────────

test("pondérations — le jeu par défaut totalise 100 et passe la validation", () => {
  assert.equal(validerPonderations({ NIF: 15, TVA: 15, FISC: 20, SOC: 15, DOCS: 20, CAUTION: 15 }), null);
  assert.equal(validerValeur("CF_SCORE_PONDERATIONS", REGLES_DEFAUT.CF_SCORE_PONDERATIONS), null);
});

test("pondérations — un critère inconnu est refusé (sinon ignoré en silence)", () => {
  // Le service applique { ...defaut, ...saisie } : une clé mal orthographiée
  // n'aurait aucun effet et le score resterait au défaut sans alerte.
  const message = validerPonderations({ NIF: 15, ANCIENNETE: 10 });
  assert.match(String(message), /Critère de conformité inconnu : ANCIENNETE/);
});

test("pondérations — un poids hors bornes ou non numérique est refusé", () => {
  assert.match(String(validerPonderations({ NIF: -5 })), /entre 0 et 100/);
  assert.match(String(validerPonderations({ NIF: 120 })), /entre 0 et 100/);
  assert.match(String(validerPonderations({ NIF: "quinze" })), /entre 0 et 100/);
});

test("pondérations — un jeu complet ne totalisant pas 100 est refusé", () => {
  const message = validerPonderations({ NIF: 10, TVA: 10, FISC: 10, SOC: 10, DOCS: 10, CAUTION: 10 });
  assert.match(String(message), /doit faire 100 \(actuellement 60\)/);
});

test("pondérations — un jeu PARTIEL est accepté (complété par les défauts)", () => {
  // Ne remonter qu'un critère est un usage légitime : le service complète le
  // reste. On ne peut donc pas exiger un total de 100 dans ce cas.
  assert.equal(validerPonderations({ FISC: 25 }), null);
});

test("pondérations — structure aberrante refusée", () => {
  assert.match(String(validerPonderations([])), /doivent être un objet/);
  assert.match(String(validerPonderations("NIF=15")), /doivent être un objet/);
  assert.match(String(validerPonderations(null)), /doivent être un objet/);
});
