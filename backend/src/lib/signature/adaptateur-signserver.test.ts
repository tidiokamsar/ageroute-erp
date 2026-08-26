import { test } from "node:test";
import assert from "node:assert/strict";
import { contientJetonRfc3161 } from "./adaptateur-signserver";

const OID_HEX = "060b2a864886f70d010910020e";

function pdfFactice(contenusHex: string[]): Buffer {
  const corps = contenusHex.map((h, i) => `${i} 0 obj\n<< /ByteRange [0 1 2 3] /Contents <${h}> >>\nendobj`).join("\n");
  return Buffer.from(`%PDF-1.7\n${corps}\n%%EOF`, "latin1");
}

test("détecte l'OID signature-time-stamp dans un bloc /Contents hexadécimal", () => {
  assert.equal(contientJetonRfc3161(pdfFactice(["deadbeef" + OID_HEX + "cafe"])), true);
});

test("ne détecte rien sans jeton — un niveau T annoncé sans jeton était le défaut corrigé", () => {
  assert.equal(contientJetonRfc3161(pdfFactice(["deadbeefcafe0102"])), false);
  assert.equal(contientJetonRfc3161(Buffer.from("%PDF-1.7 sans signature", "latin1")), false);
});

test("tolère les espaces et sauts de ligne dans l'hexadécimal (sérialisation PDF réelle)", () => {
  const hex = "dead beef\n" + OID_HEX.slice(0, 6) + " \n" + OID_HEX.slice(6) + " cafe";
  assert.equal(contientJetonRfc3161(pdfFactice([hex])), true);
});

test("ne matche pas un OID à cheval sur un décalage impair (faux positif d'alignement)", () => {
  assert.equal(contientJetonRfc3161(pdfFactice(["a" + OID_HEX + "b0"])), false);
});
