import { test } from "node:test";
import assert from "node:assert/strict";
import { etapesCircuitFinancier, etapesWorkflow } from "./circuit-definitions";

/**
 * Ce fichier protège une règle MÉTIER contre une « correction » bien
 * intentionnée.
 *
 * Trois audits successifs ont signalé comme un défaut le fait qu'un service
 * (Trésor, Budget, FER) intervienne à la fois dans le circuit de validation et
 * dans le circuit financier. L'AGEROUTE a confirmé le 27/08/2026 qu'il s'agit
 * de DEUX ACTES DISTINCTS : le visa d'approbation, puis l'ordre de paiement.
 *
 * Supprimer la seconde intervention ferait payer un décompte du seul fait
 * qu'il a été jugé régulier — ce que la séparation de l'ordonnateur et du
 * comptable interdit. Ces tests échouent si quelqu'un tente la fusion.
 */

test("le circuit FINANCIER redemande bien les services qui ont déjà visé — ce n'est pas une redondance", () => {
  for (const financement of ["FER", "BUDGET_NATIONAL"]) {
    const valides = new Set(etapesWorkflow(financement).map((e) => e.roleOuService));
    const financiers = etapesCircuitFinancier(financement).map((e) => e.roleOuService);
    const communs = financiers.filter((r) => valides.has(r));
    assert.ok(
      communs.length > 0,
      `${financement} : le circuit financier doit redemander au moins un service ayant visé `
      + "(visa d'approbation ≠ ordre de paiement). Voir l'entête de circuit-definitions.ts.",
    );
  }
});

test("le TRÉSOR vise puis ordonne le paiement, sur les deux circuits nationaux", () => {
  for (const financement of ["FER", "BUDGET_NATIONAL"]) {
    assert.ok(
      etapesWorkflow(financement).some((e) => e.roleOuService === "TRESOR"),
      `${financement} : le Trésor doit viser dans le circuit de validation`,
    );
    assert.ok(
      etapesCircuitFinancier(financement).some((e) => e.roleOuService === "TRESOR"),
      `${financement} : le Trésor doit ordonner le paiement dans le circuit financier`,
    );
  }
});

test("chaque étape financière nomme l'ACTE attendu, pas seulement le service", () => {
  // Un agent voyait « Trésor Public » à deux endroits sans savoir lequel
  // appelait sa signature. Toute étape dont le service intervient deux fois
  // doit donc porter un libellé qui distingue l'acte.
  for (const financement of ["FER", "BUDGET_NATIONAL", "BAD"]) {
    const etapes = etapesCircuitFinancier(financement);
    const parService = new Map<string, string[]>();
    for (const e of etapes) {
      parService.set(e.roleOuService, [...(parService.get(e.roleOuService) ?? []), e.nom]);
    }
    for (const [service, noms] of parService) {
      if (noms.length > 1) {
        assert.equal(new Set(noms).size, noms.length,
          `${financement} : ${service} intervient ${noms.length} fois avec des libellés identiques (${noms.join(", ")})`);
      }
    }
  }
});

test("tout circuit financier se termine par l'exécution du virement", () => {
  for (const financement of ["FER", "BUDGET_NATIONAL", "BAD", "BANQUE_MONDIALE"]) {
    const etapes = etapesCircuitFinancier(financement);
    const derniere = etapes[etapes.length - 1];
    assert.equal(derniere.roleOuService, "BCRG",
      `${financement} : le décaissement effectif revient à la banque centrale`);
    assert.match(derniere.nom, /virement/i,
      `${financement} : la dernière étape doit nommer l'exécution du virement`);
  }
});
