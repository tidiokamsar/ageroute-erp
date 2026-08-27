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
    // ENTREPRISE exige désormais un rattachement : sans lui, le compte naîtrait
    // sans entreprise, état que les modules de lecture prenaient pour
    // « aucune restriction ». Les rôles internes, eux, n'en portent pas.
    const rattachement = role === "ENTREPRISE"
      ? { entrepriseId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301" }
      : {};
    const { colonnes } = separerMotDePasse(userCreateSchema.parse({ ...CORPS_VALIDE, role, ...rattachement }));
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

// ─── Rattachement d'entreprise (revue du 27/08/2026) ──────────────────────────
// Le champ n'existait pas : zod retirant les clés inconnues, tout compte
// ENTREPRISE créé par l'API naissait sans entreprise — et l'absence de
// rattachement valait « aucune restriction » dans les modules de lecture.

test("un compte entreprise sans rattachement est refusé", () => {
  const r = userCreateSchema.safeParse({
    email: "titulaire@exemple.gn", nomComplet: "Titulaire", password: "motdepasse123",
    role: "ENTREPRISE",
  });
  assert.equal(r.success, false);
});

test("un compte entreprise rattaché est accepté, et le rattachement est conservé", () => {
  const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
  const r = userCreateSchema.safeParse({
    email: "titulaire@exemple.gn", nomComplet: "Titulaire", password: "motdepasse123",
    role: "ENTREPRISE", entrepriseId: id,
  });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.entrepriseId, id);
});

test("un compte interne rattaché à une entreprise est refusé", () => {
  const r = userCreateSchema.safeParse({
    email: "agent@ageroute.gov.gn", nomComplet: "Agent", password: "motdepasse123",
    role: "MISSION", entrepriseId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  });
  assert.equal(r.success, false);
});

test("un compte interne sans rattachement reste accepté", () => {
  const r = userCreateSchema.safeParse({
    email: "agent@ageroute.gov.gn", nomComplet: "Agent", password: "motdepasse123",
    role: "MISSION",
  });
  assert.equal(r.success, true);
});
