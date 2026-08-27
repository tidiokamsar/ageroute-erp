/**
 * Tests — plafond réglementaire des avenants (revue du 27/08/2026).
 *
 * Le test qui existait vérifiait la VALEUR de la règle et refaisait
 * l'arithmétique dans le test. Il passait au vert alors que rien, dans
 * `addAvenant`, ne consultait la règle : un avenant à +30 % était créé sans un
 * mot. Ceux-ci exercent la fonction que la route appelle, et relisent la route
 * pour vérifier qu'elle l'appelle bien.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { REGLES_DEFAUT, type ReglesEffectives } from "./regles";
import { verifierPlafondAvenant, plafondGnf, pourcentagePlafond, type DemandeAvenant } from "./avenants.regles";

const REGLES = { ...REGLES_DEFAUT } as unknown as ReglesEffectives;
const INITIAL = 126_000_000_000n; // MCHE-2024-001, marché réel

function demande(over: Partial<DemandeAvenant> = {}): DemandeAvenant {
  return {
    montantInitialGnf: INITIAL,
    avenantsExistants: [],
    montantSupplementaireGnf: 1_000_000_000n,
    regles: REGLES,
    ...over,
  };
}

test("un avenant sous le plafond passe", () => {
  const v = verifierPlafondAvenant(demande());
  assert.equal(v.autorise, true);
  assert.equal(v.plafondGnf, 31_500_000_000n); // 25 % de 126 Md
});

test("un avenant à +30 % du marché est refusé — le cas du runbook", () => {
  // Ce contrôle renvoyait 201 en production : la règle existait, personne ne
  // la lisait.
  const v = verifierPlafondAvenant(demande({ montantSupplementaireGnf: INITIAL * 30n / 100n }));
  assert.equal(v.autorise, false);
  assert.equal(v.code, "PLAFOND_DEPASSE");
  assert.match(v.motif ?? "", /ARMP/);
});

test("le plafond porte sur le CUMUL, pas sur chaque avenant pris seul", () => {
  // Sinon dix avenants à 20 % chacun passent un par un.
  const existants = [
    { montantSupplementaireGnf: 20_000_000_000n, statut: "APPROUVE" },
    { montantSupplementaireGnf: 10_000_000_000n, statut: "VALIDE_TECHNIQUE" },
  ];
  const v = verifierPlafondAvenant(demande({ avenantsExistants: existants, montantSupplementaireGnf: 5_000_000_000n }));
  assert.equal(v.autorise, false);
  assert.equal(v.cumulApresGnf, 35_000_000_000n);
});

test("un avenant annulé ne pèse plus sur le cumul", () => {
  const existants = [
    { montantSupplementaireGnf: 30_000_000_000n, statut: "ANNULE" },
    { montantSupplementaireGnf: 1_000_000_000n, statut: "APPROUVE" },
  ];
  const v = verifierPlafondAvenant(demande({ avenantsExistants: existants }));
  assert.equal(v.autorise, true);
  assert.equal(v.cumulApresGnf, 2_000_000_000n);
});

test("l approbation ARMP ouvre le dépassement, et le trace", () => {
  // Le dépassement n'est pas ouvert par un drapeau technique : il l'est par la
  // référence de l'approbation du régulateur, portée par l'avenant lui-même.
  const v = verifierPlafondAvenant(demande({
    montantSupplementaireGnf: INITIAL * 40n / 100n,
    approbationArmpRef: "ARMP/2026/AV/0142",
  }));
  assert.equal(v.autorise, true);
  assert.equal(v.code, "DEROGATION_ARMP");
});

test("une référence ARMP vide ou blanche ne vaut pas dérogation", () => {
  for (const ref of ["", "   ", undefined, null]) {
    const v = verifierPlafondAvenant(demande({
      montantSupplementaireGnf: INITIAL * 40n / 100n, approbationArmpRef: ref,
    }));
    assert.equal(v.autorise, false, `référence « ${String(ref)} » ne doit pas ouvrir le dépassement`);
  }
});

test("le plafond exact est autorisé, le franc de trop ne l est pas", () => {
  assert.equal(verifierPlafondAvenant(demande({ montantSupplementaireGnf: 31_500_000_000n })).autorise, true);
  assert.equal(verifierPlafondAvenant(demande({ montantSupplementaireGnf: 31_500_000_001n })).autorise, false);
});

test("un montant négatif est refusé", () => {
  const v = verifierPlafondAvenant(demande({ montantSupplementaireGnf: -1n }));
  assert.equal(v.code, "MONTANT_NEGATIF");
});

test("le pourcentage suit le paramétrage, y compris fractionnaire", () => {
  assert.equal(pourcentagePlafond(REGLES), 25);
  assert.equal(pourcentagePlafond({ ...REGLES, RG_PLAFOND_AVENANTS_PCT: "abc" }), 25);
  assert.equal(plafondGnf(INITIAL, 12.5), 15_750_000_000n);
  const v = verifierPlafondAvenant(demande({
    regles: { ...REGLES, RG_PLAFOND_AVENANTS_PCT: "50" },
    montantSupplementaireGnf: INITIAL * 40n / 100n,
  }));
  assert.equal(v.autorise, true);
});

test("l arithmétique reste exacte au-delà du domaine des flottants", () => {
  // Le recalcul du montant actualisé passait par Number() : au-delà de
  // 9 007 milliards, le cumul aurait été arrondi sur le montant d'un marché.
  const enorme = 10_000_000_000_000_000n;
  assert.equal(plafondGnf(enorme, 25), 2_500_000_000_000_000n);
  assert.equal(plafondGnf(enorme, 25) + 1n > 2_500_000_000_000_000n, true);
});

test("la route consulte bien la règle, et le recalcul reste en BigInt", () => {
  const service = readFileSync(
    path.join(__dirname, "..", "modules", "marches", "marches.service.ts"), "utf8");
  assert.match(service, /verifierPlafondAvenant\(/,
    "addAvenant doit consulter la règle — c'est précisément ce qui manquait");
  const bloc = service.slice(service.indexOf("async addAvenant"), service.indexOf("async stats"));
  assert.doesNotMatch(bloc, /Number\(a\.montantSupplementaireGnf\)/,
    "le cumul des avenants ne doit pas repasser par un flottant");
  const routes = readFileSync(
    path.join(__dirname, "..", "modules", "marches", "marches.routes.ts"), "utf8");
  assert.match(routes, /approbationArmpRef:\s+z\.string/,
    "la route doit accepter la référence ARMP, sinon la dérogation est inatteignable");
});
