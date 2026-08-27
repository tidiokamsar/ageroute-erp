/**
 * Tests — la suppression d'un compte ne doit JAMAIS effacer son auteur de la
 * piste d'audit (constat de la revue du 27/08/2026).
 *
 * Ces tests relisent le schéma et la route : ils ne demandent pas de base, et
 * ils échouent si quelqu'un rétablit un jour le SET NULL implicite.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const RACINE = path.join(__dirname, "..", "..", "..");
const SCHEMA = readFileSync(path.join(RACINE, "prisma", "schema.prisma"), "utf8");
const ROUTE = readFileSync(path.join(__dirname, "users.routes.ts"), "utf8");

function bloc(nom: string): string {
  const i = SCHEMA.indexOf(`model ${nom} {`);
  assert.ok(i >= 0, `modèle introuvable : ${nom}`);
  return SCHEMA.slice(i, SCHEMA.indexOf("\n}", i));
}

test("l entrée d audit retient son auteur : la relation est en RESTRICT", () => {
  // En SET NULL — l'état trouvé en production — un DELETE sur un compte
  // vidait `userId` de toutes ses entrées, sans erreur ni trace.
  const relation = bloc("AuditLog").split("\n").find((l) => l.includes("user ") && l.includes("@relation"));
  assert.ok(relation, "relation AuditLog → User introuvable");
  assert.match(relation!, /onDelete:\s*Restrict/,
    "la relation d'audit doit être en Restrict, sinon supprimer un compte anonymise son historique");
});

test("les autres liens de responsabilité restent bloquants", () => {
  // Une validation de workflow et une délégation nomment un responsable : les
  // détacher reviendrait à effacer qui a engagé l'Agence.
  for (const modele of ["WorkflowAction", "Delegation"]) {
    const b = bloc(modele);
    assert.doesNotMatch(b, /onDelete:\s*(SetNull|Cascade)/,
      `${modele} ne doit pas détacher ni supprimer en cascade son responsable`);
  }
});

test("userId reste facultatif — un échec de connexion n a pas d auteur connu", () => {
  // LOGIN_FAILED est journalisé sur une adresse qui ne correspond à aucun
  // compte : rendre la colonne obligatoire ferait perdre ces tentatives.
  assert.match(bloc("AuditLog"), /userId\s+String\?/);
});

test("la route de suppression refuse, elle ne détache pas", () => {
  assert.match(ROUTE, /P2003/, "la violation de clé étrangère doit être traduite");
  assert.match(ROUTE, /409/, "le refus doit être un 409, pas un 500 opaque");
  assert.doesNotMatch(ROUTE, /auditLog\.updateMany|auditLog\.deleteMany/,
    "aucune route ne doit réécrire ni purger la piste d'audit pour rendre un compte supprimable");
});
