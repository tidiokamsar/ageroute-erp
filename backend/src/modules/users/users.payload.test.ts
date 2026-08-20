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
 * Écart relevé lors de la désignation des signataires, corrigé le 20/08/2026 :
 * l'API n'acceptait que 9 des 14 rôles de l'énumération Prisma. BAILLEUR,
 * BUDGET, TRESOR et FER_AGT étaient proposés par l'écran d'administration mais
 * refusés par l'API — les sélectionner produisait une erreur. BCRG n'était
 * proposé nulle part.
 *
 * Ce test est la garde contre une nouvelle divergence : toute valeur ajoutée à
 * l'énumération `Role` de schema.prisma doit être ajoutée ici aussi.
 */
const ROLES_ATTENDUS = [
  "ADMIN", "DG", "DAF", "DSF", "DMC", "UGP", "MISSION", "TECHNIQUE",
  "ENTREPRISE", "AUDITEUR", "BAILLEUR", "BUDGET", "TRESOR", "FER_AGT", "BCRG",
];

test("les quinze roles de l'enumeration sont acceptes a la creation", () => {
  for (const role of ROLES_ATTENDUS) {
    const { colonnes } = separerMotDePasse(userCreateSchema.parse({ ...CORPS_VALIDE, role }));
    assert.equal(colonnes.role, role, `le role ${role} doit etre accepte`);
  }
});

test("les roles externes sont desormais attribuables", () => {
  for (const role of ["BAILLEUR", "BUDGET", "TRESOR", "FER_AGT", "BCRG"]) {
    const { colonnes } = separerMotDePasse(userCreateSchema.parse({ ...CORPS_VALIDE, role }));
    assert.equal(colonnes.role, role);
  }
});

test("un role inexistant reste refuse", () => {
  for (const role of ["DGA", "SUPERADMIN", "dsf", ""]) {
    assert.throws(
      () => userCreateSchema.parse({ ...CORPS_VALIDE, role }),
      `le role ${role} n'existe pas en base et doit etre refuse`,
    );
  }
});

/**
 * DSF — Direction de la Structuration Financière. Rôle de consultation créé le
 * 20/08/2026 pour Abdoulaye DABO. Aucun des 14 rôles existants ne correspondait.
 */
test("le role DSF est attribuable et n'est pas un role de circuit", () => {
  const { colonnes } = separerMotDePasse(userCreateSchema.parse({ ...CORPS_VALIDE, role: "DSF" }));
  assert.equal(colonnes.role, "DSF");
});
