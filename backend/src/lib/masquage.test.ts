import { test } from "node:test";
import assert from "node:assert/strict";
import { erreurJournalisable, masquerSecrets, MASQUE } from "./masquage";

/**
 * Le cas réel qui a motivé ce module : une création d'utilisateur refusée par
 * Prisma recopiait le mot de passe en clair dans les journaux du conteneur.
 * L'extrait ci-dessous reproduit le format exact du message d'erreur Prisma.
 */
const MESSAGE_PRISMA = `Invalid \`prisma.user.create()\` invocation
{
  data: {
    email: "moise.sidibe@ageroute.gov.gn",
    password: "4tLgvJ1XydNNvCCpKgQ1bJLZ5",
    passwordHash: "$2a$12$VntfdVPjgKaLVhP6aMY5",
    role: "DG"
  }
}
Unknown argument \`password\`.`;

test("le mot de passe en clair d'une erreur Prisma est masque", () => {
  const masque = masquerSecrets(MESSAGE_PRISMA);
  assert.ok(!masque.includes("4tLgvJ1XydNNvCCpKgQ1bJLZ5"), "le mot de passe ne doit plus apparaitre");
  assert.ok(!masque.includes("$2a$12$VntfdVPjgKaLVhP6aMY5"), "l'empreinte ne doit plus apparaitre");
  assert.ok(masque.includes(`password: "${MASQUE}"`));
  assert.ok(masque.includes(`passwordHash: "${MASQUE}"`));
});

test("les donnees non sensibles sont conservees pour le diagnostic", () => {
  const masque = masquerSecrets(MESSAGE_PRISMA);
  assert.ok(masque.includes("moise.sidibe@ageroute.gov.gn"), "l'email reste lisible");
  assert.ok(masque.includes(`role: "DG"`), "le role reste lisible");
  assert.ok(masque.includes("Unknown argument"), "la cause reste lisible");
  assert.ok(masque.includes("password:"), "le nom de la cle reste, seule la valeur part");
});

test("les formats JSON, guillemets simples et signe egal sont couverts", () => {
  assert.equal(masquerSecrets(`{"password":"abc"}`), `{"password":"${MASQUE}"}`);
  assert.equal(masquerSecrets(`token: 'xyz'`), `token: '${MASQUE}'`);
  assert.equal(masquerSecrets(`secret = "s3cr3t"`), `secret = "${MASQUE}"`);
});

test("toutes les cles sensibles declarees sont couvertes", () => {
  for (const cle of ["password", "passwordHash", "motDePasse", "token", "accessToken", "refreshToken", "secret", "clientSecret", "authorization", "apiKey", "privateKey"]) {
    const masque = masquerSecrets(`${cle}: "valeur-a-cacher"`);
    assert.ok(!masque.includes("valeur-a-cacher"), `la cle ${cle} doit etre masquee`);
  }
});

test("une valeur vide ou deja masquee ne casse rien", () => {
  assert.equal(masquerSecrets(`password: ""`), `password: "${MASQUE}"`);
  assert.equal(masquerSecrets(`password: "${MASQUE}"`), `password: "${MASQUE}"`);
});

test("un texte sans secret est rendu a l'identique", () => {
  const texte = `email: "a@b.gn", role: "DAF"`;
  assert.equal(masquerSecrets(texte), texte);
});

test("erreurJournalisable conserve la trace et masque le secret", () => {
  const err = new Error(MESSAGE_PRISMA);
  const journal = erreurJournalisable(err);
  assert.ok(!journal.includes("4tLgvJ1XydNNvCCpKgQ1bJLZ5"));
  assert.ok(journal.includes("Unknown argument"));
  assert.ok(journal.includes("masquage.test"), "la trace d'appel doit etre conservee");
});

test("erreurJournalisable accepte une valeur qui n'est pas une Error", () => {
  assert.equal(erreurJournalisable(`password: "fuite"`), `password: "${MASQUE}"`);
  assert.equal(erreurJournalisable(null), "null");
});
