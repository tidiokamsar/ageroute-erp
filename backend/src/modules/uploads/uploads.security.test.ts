import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStoredFilename, isSafeStoredFilename, peutLireReference, signerLienFichier, verifierLienFichier } from "./uploads.security";

test("les noms stockes sont aleatoires, opaques et sur liste blanche", () => {
  const first = buildStoredFilename("application/pdf");
  const second = buildStoredFilename("application/pdf");
  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first, second);
  assert.match(first, /^[a-f0-9]{48}\.pdf$/);
  assert.equal(buildStoredFilename("text/html"), null);
});

test("les traversees et anciens noms previsibles sont refuses", () => {
  assert.equal(isSafeStoredFilename("../contrat.pdf"), false);
  assert.equal(isSafeStoredFilename("..%2fcontrat.pdf"), false);
  assert.equal(isSafeStoredFilename("contrat_1700000000000_abcde.pdf"), false);
  assert.equal(isSafeStoredFilename("a".repeat(48) + ".pdf"), true);
});

/**
 * Contrôles n°6 et n°7 du runbook (ouverture d'une pièce jointe par URL signée,
 * et refus d'un accès sans jeton). Prouvés ici par test : ces cas s'exécutent à
 * chaque `npm test`, là où une vérification manuelle ne vaut que pour un jour.
 */
const SECRET = "K7v2wQfR9sLpZ1nT4xJ8cH3mB6yD0aE5gU7iO2kN4rV9tW1qX3zC5bM8fY0hS2jP";
const FICHIER = "b".repeat(48) + ".pdf";
const AUTRE_FICHIER = "c".repeat(48) + ".pdf";

test("lien signé — un jeton valide est accepté", () => {
  const expires = Date.now() + 15 * 60 * 1000;
  const token = signerLienFichier(SECRET, FICHIER, expires);
  assert.equal(verifierLienFichier(SECRET, FICHIER, expires, token), true);
});

test("lien signé — un jeton émis pour un autre fichier est refusé", () => {
  const expires = Date.now() + 15 * 60 * 1000;
  const token = signerLienFichier(SECRET, FICHIER, expires);
  assert.equal(verifierLienFichier(SECRET, AUTRE_FICHIER, expires, token), false);
});

test("lien signé — modifier l'échéance invalide le jeton (pas de prolongation)", () => {
  const expires = Date.now() + 15 * 60 * 1000;
  const token = signerLienFichier(SECRET, FICHIER, expires);
  assert.equal(verifierLienFichier(SECRET, FICHIER, expires + 3_600_000, token), false);
});

test("lien signé — un secret différent ne valide pas (jeton non forgeable)", () => {
  const expires = Date.now() + 15 * 60 * 1000;
  const token = signerLienFichier("Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2H1g0F9e8D7c6B5a4Z3y2X1w0V9u8", FICHIER, expires);
  assert.equal(verifierLienFichier(SECRET, FICHIER, expires, token), false);
});

test("lien signé — jeton absent, vide, tronqué ou fantaisiste : refusé sans exception", () => {
  const expires = Date.now() + 15 * 60 * 1000;
  const valide = signerLienFichier(SECRET, FICHIER, expires);
  for (const mauvais of ["", "  ", "deadbeef", valide.slice(0, -1), valide + "0", valide.toUpperCase()]) {
    assert.equal(verifierLienFichier(SECRET, FICHIER, expires, mauvais), false, `jeton refusé : ${mauvais.slice(0, 12)}`);
  }
  // @ts-expect-error — entrée non conforme volontaire : ne doit pas lever
  assert.equal(verifierLienFichier(SECRET, FICHIER, expires, undefined), false);
});

test("lien signé — un jeton est opaque et de longueur fixe (HMAC-SHA256)", () => {
  const token = signerLienFichier(SECRET, FICHIER, Date.now());
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.ok(!token.includes(FICHIER));
});

/**
 * Matrice d'habilitation en lecture des pièces jointes.
 * Ces cas verrouillent la correction du 18/08/2026 : le code comparait
 * `req.user.entrepriseId`, champ jamais renseigné, ce qui refusait à TOUTE
 * entreprise l'accès à ses propres pièces. L'entreprise est désormais résolue
 * en base ; ces tests garantissent que la résolution n'a pas ouvert l'accès
 * aux pièces des autres.
 */
const MODULES = ["attachements", "decomptes", "entreprises"];
const PIECE_A = { moduleKey: "decomptes", marcheId: "marche-1", entrepriseId: "ent-A" };
const PIECE_B = { moduleKey: "decomptes", marcheId: "marche-2", entrepriseId: "ent-B" };

test("habilitation — une entreprise accède à sa propre pièce", () => {
  assert.equal(peutLireReference("ENTREPRISE", PIECE_A, MODULES, "ent-A", null), true);
});

test("habilitation — une entreprise n'accède PAS à la pièce d'une autre", () => {
  assert.equal(peutLireReference("ENTREPRISE", PIECE_B, MODULES, "ent-A", null), false);
});

test("habilitation — compte ENTREPRISE sans entreprise liée : aucun accès", () => {
  assert.equal(peutLireReference("ENTREPRISE", PIECE_A, MODULES, null, null), false);
});

test("habilitation — une entreprise ne profite jamais de l'absence d'affectation", () => {
  // marchesAffectes = null signifie « pas de restriction » pour les rôles
  // internes ; ce raccourci ne doit JAMAIS s'appliquer au rôle ENTREPRISE.
  assert.equal(peutLireReference("ENTREPRISE", PIECE_B, MODULES, null, null), false);
  assert.equal(peutLireReference("ENTREPRISE", PIECE_B, MODULES, "", null), false);
});

test("habilitation — rôle interne sans affectation : accès à tout le périmètre", () => {
  assert.equal(peutLireReference("DMC", PIECE_A, MODULES, null, null), true);
  assert.equal(peutLireReference("DMC", PIECE_B, MODULES, null, null), true);
});

test("habilitation — rôle interne affecté : limité à ses marchés", () => {
  assert.equal(peutLireReference("MISSION", PIECE_A, MODULES, null, ["marche-1"]), true);
  assert.equal(peutLireReference("MISSION", PIECE_B, MODULES, null, ["marche-1"]), false);
});

test("habilitation — module non autorisé : refus quel que soit le rôle", () => {
  assert.equal(peutLireReference("DMC", PIECE_A, ["entreprises"], null, null), false);
  assert.equal(peutLireReference("ENTREPRISE", PIECE_A, ["entreprises"], "ent-A", null), false);
});

test("habilitation — pièce sans marché pour un rôle affecté : refus", () => {
  const sansMarche = { moduleKey: "entreprises", entrepriseId: "ent-A" };
  assert.equal(peutLireReference("MISSION", sansMarche, MODULES, null, ["marche-1"]), false);
});
