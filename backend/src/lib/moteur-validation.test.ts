import { test } from "node:test";
import assert from "node:assert/strict";
import {
  verifierSeparationTaches, statutPourRoleEtape, libelleEtapeValidation,
  decisionValidation, produitUneValidation, DECISIONS_ENGAGEANTES,
} from "./moteur-validation";

// ─────────────────────────── RG9 — séparation des tâches ────────────────────
/**
 * La règle existait dans le code sous la forme d'un bloc VIDE portant le
 * commentaire « RG9 temporairement désactivé » : la même personne pouvait
 * soumettre un décompte et le valider, à toutes les étapes.
 */
test("RG9 refuse une personne deja intervenue sur le dossier", () => {
  const r = verifierSeparationTaches({
    utilisateurId: "u1",
    intervenantsAnterieurs: ["u1", "u2"],
    decision: "APPROUVE",
    active: true,
  });
  assert.equal(r.autorise, false);
  assert.match(r.motif!, /déjà intervenu/);
});

test("RG9 laisse passer une personne qui n'a pas encore agi", () => {
  const r = verifierSeparationTaches({
    utilisateurId: "u3",
    intervenantsAnterieurs: ["u1", "u2"],
    decision: "APPROUVE",
    active: true,
  });
  assert.equal(r.autorise, true);
});

test("RG9 s'applique au premier intervenant : aucun antecedent, aucun blocage", () => {
  const r = verifierSeparationTaches({
    utilisateurId: "u1", intervenantsAnterieurs: [], decision: "APPROUVE", active: true,
  });
  assert.equal(r.autorise, true);
});

test("RG9 couvre les trois decisions engageantes", () => {
  for (const decision of DECISIONS_ENGAGEANTES) {
    const r = verifierSeparationTaches({
      utilisateurId: "u1", intervenantsAnterieurs: ["u1"], decision, active: true,
    });
    assert.equal(r.autorise, false, `${decision} doit etre bloquee`);
  }
});

/**
 * Suspendre ou demander un audit ne fait pas avancer le dossier : ce sont des
 * actes de supervision, réservés à la DG. Les soumettre à RG9 empêcherait la DG
 * de suspendre un dossier qu'elle a elle-même approuvé plus tôt — l'inverse du
 * but recherché.
 */
test("RG9 n'entrave pas la supervision : suspendre et auditer restent possibles", () => {
  for (const decision of ["SUSPENDRE", "AUDIT", "DEMANDE_COMPLEMENT"] as const) {
    const r = verifierSeparationTaches({
      utilisateurId: "u1", intervenantsAnterieurs: ["u1"], decision, active: true,
    });
    assert.equal(r.autorise, true, `${decision} ne doit pas etre bloquee par RG9`);
  }
});

test("RG9 desactivee par parametrage laisse tout passer, sans exception cachee", () => {
  const r = verifierSeparationTaches({
    utilisateurId: "u1", intervenantsAnterieurs: ["u1"], decision: "APPROUVE", active: false,
  });
  assert.equal(r.autorise, true);
});

test("RG9 ne connait pas de privilege de role : l'identifiant seul decide", () => {
  // Aucun paramètre de rôle n'existe dans la signature : un ADMIN qui est déjà
  // intervenu est bloqué comme n'importe qui. C'est délibéré — une exemption
  // administrateur viderait la règle de son sens.
  const r = verifierSeparationTaches({
    utilisateurId: "admin-1", intervenantsAnterieurs: ["admin-1"], decision: "REJETE", active: true,
  });
  assert.equal(r.autorise, false);
});

// ──────────────────── Table unique étape → statut ───────────────────────────
/**
 * Deux tables divergentes coexistaient : l'une dans la route de validation,
 * l'autre dans le moteur de workflow. La même étape pouvait donc produire deux
 * statuts différents selon la porte empruntée.
 */
test("le controle terrain place le decompte en controle", () => {
  assert.equal(statutPourRoleEtape("MISSION"), "EN_CONTROLE");
  assert.equal(statutPourRoleEtape("TECHNIQUE"), "EN_CONTROLE");
});

test("les visas financiers ont chacun leur statut", () => {
  assert.equal(statutPourRoleEtape("DAF"), "VISA_DAF");
  assert.equal(statutPourRoleEtape("DG"), "VISA_DG");
});

test("le DGA partage le visa de direction generale", () => {
  assert.equal(statutPourRoleEtape("DGA"), "VISA_DG");
});

test("les intervenants externes placent le dossier en circuit financier", () => {
  for (const role of ["BAILLEUR", "BUDGET", "TRESOR", "FER_AGT", "BCRG"]) {
    assert.equal(statutPourRoleEtape(role), "EN_CIRCUIT_FINANCIER", role);
  }
});

test("un role inconnu ne fait pas planter le circuit", () => {
  assert.equal(statutPourRoleEtape("ROLE_INEXISTANT"), "EN_VALIDATION");
});

// ──────────────────── Projection vers l'onglet Validations ──────────────────
test("le libelle d'etape reste dans le vocabulaire de la table", () => {
  assert.equal(libelleEtapeValidation("MISSION"), "MISSION");
  assert.equal(libelleEtapeValidation("DAF"), "DAF");
  assert.equal(libelleEtapeValidation("DGA"), "DMC", "un role hors liste retombe sur une valeur acceptee");
});

test("les decisions de workflow sont traduites en trois valeurs", () => {
  assert.equal(decisionValidation("APPROUVE"), "APPROUVE");
  assert.equal(decisionValidation("REJETE"), "REJETE");
  assert.equal(decisionValidation("DEMANDE_CORRECTION"), "CORRECTION");
  assert.equal(decisionValidation("DEMANDE_COMPLEMENT"), "CORRECTION");
});

test("seules les decisions engageantes laissent une trace de validation", () => {
  assert.equal(produitUneValidation("APPROUVE"), true);
  assert.equal(produitUneValidation("REJETE"), true);
  assert.equal(produitUneValidation("DEMANDE_CORRECTION"), true);
  assert.equal(produitUneValidation("SUSPENDRE"), false, "une suspension n'est pas un visa");
  assert.equal(produitUneValidation("AUDIT"), false);
});
