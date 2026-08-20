import { test } from "node:test";
import assert from "node:assert/strict";
import { separerMotDePasse, userCreateSchema } from "./users.payload";

const CORPS_VALIDE = {
  email: "moise.sidibe@ageroute.gov.gn",
  nomComplet: "Moise SIDIBE",
  password: "motdepasse-provisoire-28c",
  role: "DG" as const,
  nom: "SIDIBE",
  prenom: "Moise",
  fonction: "Directeur General",
};

/**
 * Le défaut corrigé : `password` restait dans l'objet transmis à Prisma, qui
 * refusait la création avec « Unknown argument `password` ». Aucun compte ne
 * pouvait être créé par l'API ni par l'écran d'administration.
 */
test("le mot de passe ne figure pas dans les colonnes envoyees a Prisma", () => {
  const { colonnes } = separerMotDePasse(userCreateSchema.parse(CORPS_VALIDE));
  assert.ok(!("password" in colonnes), "password ne doit jamais atteindre prisma.user.create");
  assert.equal(Object.keys(colonnes).includes("password"), false);
});

test("le mot de passe est restitue a part, pour le hachage", () => {
  const { password } = separerMotDePasse(userCreateSchema.parse(CORPS_VALIDE));
  assert.equal(password, CORPS_VALIDE.password);
});

test("toutes les colonnes du modele sont conservees", () => {
  const { colonnes } = separerMotDePasse(userCreateSchema.parse(CORPS_VALIDE));
  assert.equal(colonnes.email, CORPS_VALIDE.email);
  assert.equal(colonnes.nomComplet, CORPS_VALIDE.nomComplet);
  assert.equal(colonnes.role, "DG");
  assert.equal(colonnes.nom, "SIDIBE");
  assert.equal(colonnes.prenom, "Moise");
  assert.equal(colonnes.fonction, "Directeur General");
  assert.equal(colonnes.actif, true, "actif vaut true par defaut");
});

test("un compte peut etre cree dormant", () => {
  const { colonnes } = separerMotDePasse(userCreateSchema.parse({ ...CORPS_VALIDE, actif: false }));
  assert.equal(colonnes.actif, false);
});

test("l'identite officielle reste facultative", () => {
  const { colonnes } = separerMotDePasse(
    userCreateSchema.parse({
      email: "famo.mansare@ageroute.gov.gn",
      nomComplet: "Famo MANSARE",
      password: "motdepasse-provisoire",
      role: "DAF",
    }),
  );
  assert.equal(colonnes.nom, undefined);
  assert.equal(colonnes.fonction, undefined);
});

test("un mot de passe trop court est refuse", () => {
  assert.throws(() => userCreateSchema.parse({ ...CORPS_VALIDE, password: "court" }));
});

test("une adresse invalide est refusee", () => {
  assert.throws(() => userCreateSchema.parse({ ...CORPS_VALIDE, email: "pas-une-adresse" }));
});

/**
 * Écart relevé lors de la désignation des signataires : l'API n'accepte que 9
 * des 14 rôles de l'énumération Prisma. Les rôles externes — BAILLEUR, BUDGET,
 * TRESOR, FER_AGT, BCRG — ne peuvent pas être attribués à la création. Ce test
 * fige le comportement actuel pour que l'écart soit visible et décidé, plutôt
 * que découvert en production.
 */
test("les roles externes ne sont pas acceptes a la creation — ecart connu", () => {
  for (const role of ["BAILLEUR", "BUDGET", "TRESOR", "FER_AGT", "BCRG"]) {
    assert.throws(
      () => userCreateSchema.parse({ ...CORPS_VALIDE, role }),
      `le role ${role} est refuse par l'API alors qu'il existe en base`,
    );
  }
});

test("les neuf roles acceptes le restent", () => {
  for (const role of ["ADMIN", "DG", "DAF", "DMC", "UGP", "MISSION", "TECHNIQUE", "ENTREPRISE", "AUDITEUR"]) {
    const { colonnes } = separerMotDePasse(userCreateSchema.parse({ ...CORPS_VALIDE, role }));
    assert.equal(colonnes.role, role);
  }
});
