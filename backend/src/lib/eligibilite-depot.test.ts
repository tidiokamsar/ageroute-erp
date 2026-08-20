import { test } from "node:test";
import assert from "node:assert/strict";
import {
  verifierEligibiliteDepot, garantieValide, motifStatutMarche, STATUTS_MARCHE_DEPOT,
} from "./eligibilite-depot";

const MAINTENANT = new Date("2026-08-20T12:00:00Z");

function base(surcharge: Partial<Parameters<typeof verifierEligibiliteDepot>[0]> = {}) {
  return verifierEligibiliteDepot({
    blocagesEntreprise: [],
    statutMarche: "EN_EXECUTION",
    garanties: [{ type: "BONNE_EXECUTION", active: true, dateExpiration: "2027-05-01" }],
    exigeBonneExecution: true,
    nbAttachements: 1,
    maintenant: MAINTENANT,
    ...surcharge,
  });
}

// ─────────────────── Statut du marché ───────────────────
/**
 * La route exigeait `statut === "ACTIF"`. Or aucun marché ne porte ce statut :
 * trois sont EN_EXECUTION, un SIGNE. Le dépôt échouait donc pour 100 % des
 * marchés, avec un message incompréhensible pour l'entreprise.
 */
test("un marche EN_EXECUTION autorise le depot", () => {
  assert.equal(base({ statutMarche: "EN_EXECUTION" }).autorise, true);
});

test("l'alias historique ACTIF reste accepte", () => {
  assert.equal(base({ statutMarche: "ACTIF" }).autorise, true);
});

test("tous les statuts d'execution declares sont acceptes", () => {
  for (const statut of STATUTS_MARCHE_DEPOT) {
    assert.equal(motifStatutMarche(statut), null, statut);
  }
});

test("un marche non demarre explique POURQUOI il refuse", () => {
  const r = base({ statutMarche: "SIGNE" });
  assert.equal(r.autorise, false);
  assert.match(r.blocages.join(" "), /ordre de service de démarrage/);
});

test("un marche solde refuse tout nouveau depot", () => {
  const r = base({ statutMarche: "SOLDE" });
  assert.equal(r.autorise, false);
  assert.match(r.blocages.join(" "), /soldé/);
});

test("un statut inconnu refuse sans planter", () => {
  const r = base({ statutMarche: "STATUT_IMPREVU" });
  assert.equal(r.autorise, false);
  assert.match(r.blocages.join(" "), /STATUT IMPREVU/);
});

// ─────────────────── Garanties ───────────────────
/**
 * Le drapeau `active` n'est jamais remis à jour à l'échéance : la garantie de
 * bonne exécution de MCHE-2025-002 est expirée depuis le 30/07/2026 et reste
 * `active = true` en base. La date fait foi.
 */
test("une garantie expirée est invalide MEME si le drapeau actif est vrai", () => {
  const g = { type: "BONNE_EXECUTION", active: true, dateExpiration: "2026-07-30" };
  assert.equal(garantieValide(g, MAINTENANT), false);
});

test("une garantie levee est invalide meme si sa date court encore", () => {
  assert.equal(garantieValide({ type: "BONNE_EXECUTION", active: false, dateExpiration: "2027-01-01" }, MAINTENANT), false);
});

test("une garantie sans echeance declaree n'est pas presumee expiree", () => {
  assert.equal(garantieValide({ type: "BONNE_EXECUTION", active: true, dateExpiration: null }, MAINTENANT), true);
});

test("le cas reel : bonne execution expiree bloque le depot", () => {
  const r = base({ garanties: [{ type: "BONNE_EXECUTION", active: true, dateExpiration: "2026-07-30" }] });
  assert.equal(r.autorise, false);
  assert.match(r.blocages.join(" "), /garantie de bonne exécution est expirée/);
  assert.match(r.blocages.join(" "), /proroger/, "le message dit quoi faire");
});

test("l'absence totale de garantie de bonne execution bloque", () => {
  const r = base({ garanties: [] });
  assert.equal(r.autorise, false);
  assert.match(r.blocages.join(" "), /Aucune garantie de bonne exécution/);
});

test("un marche qui n'exige pas de bonne execution n'est pas bloque", () => {
  assert.equal(base({ garanties: [], exigeBonneExecution: false }).autorise, true);
});

/**
 * L'avance est un cas distinct : son expiration ne doit pas empêcher de déposer
 * un décompte de travaux, mais elle doit être signalée.
 */
test("une garantie d'avance expiree avertit sans bloquer", () => {
  const r = base({
    garanties: [
      { type: "BONNE_EXECUTION", active: true, dateExpiration: "2027-05-01" },
      { type: "AVANCE", active: true, dateExpiration: "2026-01-01" },
    ],
  });
  assert.equal(r.autorise, true, "le depot reste possible");
  assert.match(r.avertissements.join(" "), /avance restant à récupérer n'est plus couverte/);
});

// ─────────────────── Attachement et entreprise ───────────────────
test("aucun attachement bloque, en disant pourquoi", () => {
  const r = base({ nbAttachements: 0 });
  assert.equal(r.autorise, false);
  assert.match(r.blocages.join(" "), /constat contradictoire/);
});

test("les motifs entreprise sont conserves et cumules", () => {
  const r = base({
    blocagesEntreprise: ["Attestation fiscale expirée"],
    garanties: [{ type: "BONNE_EXECUTION", active: true, dateExpiration: "2026-07-30" }],
  });
  assert.equal(r.autorise, false);
  assert.equal(r.blocages.length, 2, "l'entreprise ET la garantie sont signalees");
  assert.match(r.blocages.join(" "), /Attestation fiscale/);
});

test("tout est en regle : le depot est autorise sans avertissement", () => {
  const r = base();
  assert.equal(r.autorise, true);
  assert.deepEqual(r.blocages, []);
  assert.deepEqual(r.avertissements, []);
});
