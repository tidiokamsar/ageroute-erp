import { test } from "node:test";
import assert from "node:assert/strict";
import { NATURES_PIECES, PIECES_REQUISES, CLES_PIECES, piecesRequisesManquantes } from "./pieces-obligatoires";

const COMPLET = {
  decompteSigné: true, attachements: true, facture: true,
  rapportAvancement: true, photosChantier: true, pvContradictoire: true,
};

test("le référentiel expose quatre pièces requises et deux facultatives", () => {
  assert.equal(PIECES_REQUISES.length, 4);
  assert.equal(CLES_PIECES.length, 6);
  const facultatives = NATURES_PIECES.filter((n) => !n.requis).map((n) => n.cle);
  assert.deepEqual([...facultatives], ["photosChantier", "pvContradictoire"]);
});

test("un bordereau complet ne bloque rien", () => {
  assert.deepEqual(piecesRequisesManquantes(COMPLET), []);
});

test("une pièce requise absente est signalée par son libellé", () => {
  assert.deepEqual(piecesRequisesManquantes({ ...COMPLET, facture: false }), ["Facture de l'entreprise"]);
  assert.deepEqual(piecesRequisesManquantes({ ...COMPLET, decompteSigné: false, facture: false }),
    ["Décompte signé", "Facture de l'entreprise"]);
});

test("une pièce requise ABSENTE de l'objet vaut manquante, comme false", () => {
  const { facture, ...sansFacture } = COMPLET;
  void facture;
  assert.deepEqual(piecesRequisesManquantes(sansFacture), ["Facture de l'entreprise"]);
});

// Le défaut corrigé : la soumission recopiait la liste en dur et exigeait les
// photos de chantier, que le bordereau déclare facultatives. Un dossier déposé
// par le portail sans photos devenait alors insoumissible en interne.
test("les pièces FACULTATIVES absentes ne bloquent jamais la soumission", () => {
  assert.deepEqual(piecesRequisesManquantes({ ...COMPLET, photosChantier: false, pvContradictoire: false }), []);
});

test("un bordereau jamais renseigné ne bloque pas — on ne refuse pas sur un bordereau non ouvert", () => {
  assert.deepEqual(piecesRequisesManquantes(null), []);
  assert.deepEqual(piecesRequisesManquantes(undefined), []);
});
