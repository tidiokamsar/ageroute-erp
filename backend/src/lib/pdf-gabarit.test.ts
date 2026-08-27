import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { documentEstDefinitif } from "./pdf-gabarit";

const SOURCE = readFileSync(path.join(__dirname, "pdf-gabarit.ts"), "utf8");
const ROUTES = readFileSync(
  path.join(__dirname, "..", "modules", "documents", "documents-officiels.routes.ts"), "utf8");

test("un dossier qui n a pas franchi son circuit n est jamais définitif", () => {
  // Ces statuts sortaient tous sous la mention « Document officiel », avec
  // l'en-tête, le net à payer et cinq cartouches prêts à signer.
  for (const statut of ["BROUILLON", "SOUMIS", "DEPOSE", "EN_CONTROLE", "EN_CORRECTION",
    "EN_VALIDATION", "VISA_DAF", "VISA_DG", "REJETE",
    "EN_ATTENTE", "PROGRAMME", "REFUSE"]) {
    assert.equal(documentEstDefinitif(statut), false, `${statut} ne doit pas être définitif`);
  }
});

test("VISA_DAF et VISA_DG désignent l étape courante, pas un visa obtenu", () => {
  // statutPourRoleEtape() porte le rôle de l'étape EN COURS : le dossier est
  // arrivé chez le DAF/DG, il n'a pas été visé par eux. Les imprimer comme des
  // actes définitifs ferait passer une instruction en cours pour une décision.
  assert.equal(documentEstDefinitif("VISA_DAF"), false);
  assert.equal(documentEstDefinitif("VISA_DG"), false);
});

test("les statuts terminaux des trois documents restent définitifs", () => {
  for (const statut of ["VALIDE_DG", "VALIDE", "EN_CIRCUIT_FINANCIER", "ORDONNANCE", "PAYE",
    "REALISE", "AVEC_RESERVES", "CLOTURE"]) {
    assert.equal(documentEstDefinitif(statut), true, `${statut} doit rester définitif`);
  }
});

test("sans statut connu, la mention officielle reste — mais aucune route n en est là", () => {
  // Le repli conserve le comportement d'origine pour un appelant tiers ; les
  // trois documents officiels, eux, DOIVENT transmettre le statut réel.
  assert.equal(documentEstDefinitif(undefined), false);
  const appels = ROUTES.match(/creerDocumentOfficiel\(\{[\s\S]*?\}\)/g) ?? [];
  assert.equal(appels.length, 3, "trois documents officiels attendus");
  for (const appel of appels) {
    assert.match(appel, /statut:/, `un document officiel s'imprime sans statut :\n${appel}`);
  }
  const pieds = ROUTES.match(/ajouterPiedDePage\(doc, \[[\s\S]*?\]\s*,?\s*[^)]*\)/g) ?? [];
  assert.equal(pieds.length, 3, "trois pieds de page attendus");
  for (const pied of pieds) {
    assert.match(pied, /\],\s*\w+\.statut\)/, `un pied de page s'imprime sans statut :\n${pied}`);
  }
});

test("la mention « Document officiel » est conditionnée, jamais inconditionnelle", () => {
  const mentions = SOURCE.split("\n").filter((l) => l.includes("Document officiel") && l.includes("doc."));
  assert.equal(mentions.length, 0,
    "la mention ne doit plus être écrite directement dans un appel de rendu :\n" + mentions.join("\n"));
  assert.match(SOURCE, /const definitif = statut === undefined \|\| documentEstDefinitif\(statut\)/);
});
