import assert from "node:assert/strict";
import test from "node:test";
import { portailDecomptePiecesSchema } from "./portail.decompte.schema";

type PieceType = "DECOMPTE" | "ATTACHEMENT" | "FACTURE" | "RAPPORT_AVANCEMENT" | "PHOTO" | "PV";

const filenameSeed: Record<PieceType, string> = {
  DECOMPTE: "a", ATTACHEMENT: "b", FACTURE: "c", RAPPORT_AVANCEMENT: "d", PHOTO: "e", PV: "f",
};

function piece(type: PieceType) {
  const filename = filenameSeed[type].repeat(48) + ".pdf";
  return {
    type,
    nom: type + ".pdf",
    cheminFichier: "/api/uploads/files/" + filename,
    mimeType: "application/pdf",
    tailleOctets: 1024,
    legende: "",
  };
}

const requiredPieces = [
  piece("DECOMPTE"),
  piece("ATTACHEMENT"),
  piece("FACTURE"),
  piece("RAPPORT_AVANCEMENT"),
];

test("accepte un dossier contenant toutes les pièces obligatoires", () => {
  assert.equal(portailDecomptePiecesSchema.safeParse(requiredPieces).success, true);
});

for (const mandatoryType of ["DECOMPTE", "ATTACHEMENT", "FACTURE", "RAPPORT_AVANCEMENT"] as const) {
  test(`refuse un dossier sans la pi\u00e8ce obligatoire ${mandatoryType}`, () => {
    const result = portailDecomptePiecesSchema.safeParse(requiredPieces.filter((item) => item.type !== mandatoryType));
    assert.equal(result.success, false);
    if (!result.success) assert.match(result.error.issues.map((issue) => issue.message).join(" "), /obligatoire/i);
  });
}

test("accepte les deux lignes documentaires optionnelles", () => {
  assert.equal(portailDecomptePiecesSchema.safeParse([...requiredPieces, piece("PHOTO"), piece("PV")]).success, true);
});

test("refuse deux fichiers pour la même ligne documentaire", () => {
  const result = portailDecomptePiecesSchema.safeParse([...requiredPieces, piece("FACTURE")]);
  assert.equal(result.success, false);
  if (!result.success) assert.match(result.error.issues.map((issue) => issue.message).join(" "), /Une seule pièce/);
});

test("refuse le m\u00eame fichier sur plusieurs lignes documentaires", () => {
  const duplicate = requiredPieces.map((item) => ({ ...item }));
  duplicate[1].cheminFichier = duplicate[0].cheminFichier;
  const result = portailDecomptePiecesSchema.safeParse(duplicate);
  assert.equal(result.success, false);
  if (!result.success) assert.match(result.error.issues.map((issue) => issue.message).join(" "), /m\u00eame fichier/);
});

test("refuse une référence de fichier externe ou manipulée", () => {
  const unsafe = requiredPieces.map((item) => ({ ...item }));
  unsafe[0].cheminFichier = "https://exemple.test/document.pdf";
  assert.equal(portailDecomptePiecesSchema.safeParse(unsafe).success, false);
});
