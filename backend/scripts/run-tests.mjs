/**
 * Lanceur de tests portable.
 *
 * Le script npm utilisait le motif "src/**\/*.test.ts". Ce motif n'est développé
 * que par les lanceurs de Node 22 et supérieurs : sur Node 20 — la version de
 * l'image de production — la commande échouait avec « Could not find ». Les
 * tests ne s'exécutaient donc PAS sur la plateforme de déploiement, ni dans une
 * éventuelle intégration continue.
 *
 * La découverte est faite ici en JavaScript, sans dépendance ni glob de shell,
 * donc identique sous Linux, macOS et Windows. Le lanceur échoue explicitement
 * si aucun test n'est trouvé : un motif cassé ne doit jamais se traduire par un
 * succès silencieux.
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const RACINE = "src";

const fichiers = readdirSync(RACINE, { recursive: true, encoding: "utf8" })
  .filter((fichier) => fichier.endsWith(".test.ts"))
  .map((fichier) => path.join(RACINE, fichier))
  .sort();

if (fichiers.length === 0) {
  console.error(`Aucun fichier *.test.ts trouvé sous ${RACINE}/ — suite de tests introuvable, échec.`);
  process.exit(1);
}

console.log(`${fichiers.length} fichier(s) de test découvert(s).`);

const resultat = spawnSync(
  "npx",
  ["tsx", "--test", ...fichiers],
  { stdio: "inherit", shell: process.platform === "win32" },
);

process.exit(resultat.status ?? 1);
