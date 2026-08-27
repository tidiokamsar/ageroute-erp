/**
 * Masquage des valeurs sensibles avant journalisation.
 *
 * Motif : le gestionnaire d'erreurs journalisait l'erreur telle quelle. Or une
 * erreur Prisma incorpore dans son message l'intégralité du payload refusé. Une
 * création d'utilisateur qui échoue écrivait donc le mot de passe EN CLAIR dans
 * `docker logs`, où il reste tant que le conteneur vit.
 *
 * Le correctif de `users.routes.ts` supprime la cause de cet échec précis. Ce
 * module traite le mécanisme : n'importe quelle erreur portant un secret dans
 * son message le verrait autrement recopié dans les journaux.
 */

const CLES_SENSIBLES = [
  "password",
  "passwordHash",
  "motDePasse",
  "pwd",           // abréviations rencontrées dans les messages Prisma
  "newPassword",
  "token",
  "accessToken",
  "refreshToken",
  "jwt",
  "secret",
  "clientSecret",
  "authorization",
  "apiKey",
  "privateKey",
].join("|");

export const MASQUE = "«masqué»";

// Couvre `password: "x"`, `"password":"x"` et `password = "x"`, en guillemets
// doubles comme simples. Le nom de la clé est conservé : savoir QU'UN mot de
// passe figurait dans le payload aide au diagnostic, connaître sa valeur non.
const GUILLEMETS_DOUBLES = new RegExp(`("?(?:${CLES_SENSIBLES})"?\\s*[:=]\\s*")([^"]*)(")`, "gi");
const GUILLEMETS_SIMPLES = new RegExp(`("?(?:${CLES_SENSIBLES})"?\\s*[:=]\\s*')([^']*)(')`, "gi");

export function masquerSecrets(texte: string): string {
  return texte
    .replace(GUILLEMETS_DOUBLES, (_m, avant: string, _valeur: string, apres: string) => `${avant}${MASQUE}${apres}`)
    .replace(GUILLEMETS_SIMPLES, (_m, avant: string, _valeur: string, apres: string) => `${avant}${MASQUE}${apres}`);
}

/**
 * Rend une erreur journalisable : trace complète si elle existe, message sinon,
 * dans les deux cas expurgée des valeurs sensibles.
 */
export function erreurJournalisable(err: unknown): string {
  if (err instanceof Error) {
    return masquerSecrets(err.stack ?? `${err.name}: ${err.message}`);
  }
  return masquerSecrets(String(err));
}
