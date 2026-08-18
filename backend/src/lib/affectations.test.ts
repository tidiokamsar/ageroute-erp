/**
 * Tests — périmètres d'affectation (lib/affectations).
 * Le registre ROLES_SCOPES décide quels rôles sont restreignables par marché.
 * Un bug ici change la visibilité de tout un rôle : à verrouiller par test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLES_SCOPES } from "./affectations";

test("rôles soumis au périmètre d'affectation — terrain + bailleur, pas les directions", () => {
  assert.ok(ROLES_SCOPES.includes("MISSION"), "MISSION scopé");
  assert.ok(ROLES_SCOPES.includes("TECHNIQUE"), "TECHNIQUE scopé");
  assert.ok(ROLES_SCOPES.includes("BAILLEUR"), "BAILLEUR scopé (un représentant bailleur ne voit que ses marchés)");
  // Les directions et l'admin ne sont PAS scopés : vue agence
  for (const horsPerimetre of ["ADMIN", "DG", "DAF", "DMC", "UGP", "ENTREPRISE"]) {
    assert.ok(!ROLES_SCOPES.includes(horsPerimetre), `${horsPerimetre} ne doit pas être scopé`);
  }
});
