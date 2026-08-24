import { describe, it, expect } from "vitest";
import { contientJetonRfc3161 } from "./adaptateur-signserver";

const OID_HEX = "060b2a864886f70d010910020e";

function pdfFactice(contenusHex: string[]): Buffer {
  const corps = contenusHex.map((h, i) => `${i} 0 obj\n<< /ByteRange [0 1 2 3] /Contents <${h}> >>\nendobj`).join("\n");
  return Buffer.from(`%PDF-1.7\n${corps}\n%%EOF`, "latin1");
}

describe("contientJetonRfc3161", () => {
  it("détecte l'OID signature-time-stamp dans un bloc /Contents hexadécimal", () => {
    expect(contientJetonRfc3161(pdfFactice(["deadbeef" + OID_HEX + "cafe"]))).toBe(true);
  });

  it("ne détecte rien quand aucun CMS ne porte le jeton — un niveau T annoncé sans jeton était le défaut corrigé", () => {
    expect(contientJetonRfc3161(pdfFactice(["deadbeefcafe0102"]))).toBe(false);
    expect(contientJetonRfc3161(Buffer.from("%PDF-1.7 sans signature", "latin1"))).toBe(false);
  });

  it("tolère les espaces et sauts de ligne dans l'hexadécimal (sérialisation PDF réelle)", () => {
    const hex = "dead beef\n" + OID_HEX.slice(0, 6) + " \n" + OID_HEX.slice(6) + " cafe";
    expect(contientJetonRfc3161(pdfFactice([hex]))).toBe(true);
  });

  it("ne matche pas un OID à cheval sur un décalage impair (faux positif d'alignement)", () => {
    // L'OID précédé d'un demi-octet : la chaîne hex le contient, les octets décodés non.
    expect(contientJetonRfc3161(pdfFactice(["a" + OID_HEX + "b0"]))).toBe(false);
  });
});
