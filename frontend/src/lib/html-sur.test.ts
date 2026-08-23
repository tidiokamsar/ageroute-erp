import { describe, it, expect } from "vitest";
import { h, echapper, FragmentSur } from "./html-sur";

/**
 * Première suite de tests du frontend — constat « aucun test frontend » de la
 * revue du 22/08/2026. Elle commence par le gabarit qui a fermé la XSS des
 * impressions : c'est le code dont une régression serait la plus coûteuse.
 */
describe("echapper", () => {
  it("neutralise les cinq caracteres HTML", () => {
    expect(echapper(`<a href="x" title='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });
  it("rend vide null et undefined", () => {
    expect(echapper(null)).toBe("");
    expect(echapper(undefined)).toBe("");
  });
  it("convertit les nombres sans les alterer", () => {
    expect(echapper(12345)).toBe("12345");
  });
});

describe("h — gabarit sur", () => {
  it("echappe toute donnee interpolee", () => {
    const commentaire = `<img src=x onerror="alert(1)">`;
    const out = String(h`<td>${commentaire}</td>`);
    expect(out).toBe(`<td>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</td>`);
    expect(out).not.toContain("<img");
  });

  it("insere tel quel un fragment produit par h", () => {
    const ligne = h`<tr><td>ok</td></tr>`;
    expect(String(h`<table>${ligne}</table>`)).toBe("<table><tr><td>ok</td></tr></table>");
  });

  it("rend un tableau element par element, selon la meme regle", () => {
    const reserves = ["a", "</td><script>1</script>"];
    const out = String(h`<ul>${reserves.map((r) => h`<li>${r}</li>`)}</ul>`);
    expect(out).toBe("<ul><li>a</li><li>&lt;/td&gt;&lt;script&gt;1&lt;/script&gt;</li></ul>");
  });

  it("ne laisse aucune echappatoire : une chaine qui imite un fragment reste echappee", () => {
    const faux = "<b>pas un fragment</b>";
    expect(String(h`${faux}`)).toBe("&lt;b&gt;pas un fragment&lt;/b&gt;");
    expect(h`x`).toBeInstanceOf(FragmentSur);
  });

  it("conserve les fragments vides des ternaires", () => {
    const cond = false;
    expect(String(h`<p>${cond ? h`<b>oui</b>` : ""}</p>`)).toBe("<p></p>");
  });
});
