import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Toute route montée doit être authentifiée QUELQUE PART.
 *
 * Le défaut corrigé : `/api/search` était monté sans `requireAuth`, et son
 * handler testait `req.user` — que rien ne renseignait alors. Résultat, 401
 * pour tout le monde, administrateurs compris, et le champ de recherche de
 * l'en-tête était mort depuis son montage. Le commentaire du code affirmait
 * pourtant « authentification vérifiée en handler » : un handler ne peut pas
 * s'authentifier lui-même, il ne peut que constater l'absence d'utilisateur.
 *
 * Deux emplacements sont acceptables : `requireAuth` au montage dans app.ts,
 * ou posé par le routeur lui-même. Ce test vérifie qu'il y en a bien un.
 */

const RACINE = path.resolve(__dirname);
const APP = readFileSync(path.join(RACINE, "app.ts"), "utf8");

/** Routes délibérément publiques, avec la raison de leur exemption. */
const PUBLIQUES = new Map<string, string>([
  ["/api/auth", "connexion et rafraîchissement — /me pose requireAuth lui-même"],
  ["/api/public", "consultation publique : Géoportail, vérification de signature"],
  ["/api", "limiteurs de débit et routeur de financements, monté en dernier"],
]);

function routeursDuFichier(source: string): Map<string, string> {
  const trouves = new Map<string, string>();
  for (const ligne of source.split("\n")) {
    const m = ligne.match(/app\.use\("(\/api[^"]*)"\s*,\s*(.*)\)\s*;?\s*$/);
    if (!m) continue;
    const [, chemin, reste] = m;
    const routeur = reste.match(/(\w+Router)\s*\)?\s*$/)?.[1];
    if (routeur) trouves.set(routeur, `${chemin}|${reste}`);
  }
  return trouves;
}

function fichierDuRouteur(nom: string): string | null {
  const pile = [path.join(RACINE, "modules")];
  while (pile.length) {
    const dossier = pile.pop()!;
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const complet = path.join(dossier, e.name);
      if (e.isDirectory()) { pile.push(complet); continue; }
      if (!e.name.endsWith(".ts") || e.name.endsWith(".test.ts")) continue;
      if (readFileSync(complet, "utf8").includes(`export const ${nom}`)) return complet;
    }
  }
  return null;
}

test("chaque routeur monté est authentifié, au montage ou par lui-même", () => {
  const routeurs = routeursDuFichier(APP);
  assert.ok(routeurs.size > 10, `montages détectés : ${routeurs.size} — l'analyse d'app.ts a échoué`);

  const nus: string[] = [];
  for (const [routeur, contexte] of routeurs) {
    const [chemin, reste] = contexte.split("|");
    if (PUBLIQUES.has(chemin)) continue;
    if (reste.includes("requireAuth")) continue;

    const fichier = fichierDuRouteur(routeur);
    assert.ok(fichier, `routeur ${routeur} introuvable dans les modules`);
    if (!readFileSync(fichier, "utf8").includes("requireAuth")) nus.push(`${chemin} (${routeur})`);
  }

  assert.deepEqual(nus, [], `Routes sans authentification : ${nus.join(", ")}`);
});
