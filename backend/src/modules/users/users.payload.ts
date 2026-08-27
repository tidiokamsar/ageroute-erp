/**
 * Validation et découpage du corps de requête pour la création d'un utilisateur.
 *
 * Extrait de `users.routes.ts` pour être testable sans express ni Prisma, selon
 * la convention du dépôt (les tests portent sur la logique pure).
 *
 * L'invariant que ce module protège : `password` n'est PAS une colonne du modèle
 * `User` — seul `passwordHash` en est une. Transmettre l'objet validé tel quel à
 * `prisma.user.create` faisait échouer toute création avec « Unknown argument
 * `password` ». La création d'utilisateur était donc impossible, par l'API comme
 * par l'écran d'administration.
 */
import { z } from "zod";

const userChampsSchema = z.object({
  email: z.string().email(),
  nomComplet: z.string().min(1),
  password: z.string().min(8),
  // La liste doit refléter l'énumération `Role` de schema.prisma. Elle n'en
  // couvrait que 9 sur 14 : BAILLEUR, BUDGET, TRESOR, FER_AGT et BCRG existaient
  // en base et étaient proposés par l'écran d'administration, mais l'API les
  // refusait — créer un représentant de bailleur ou du Trésor était impossible.
  // DSF s'y ajoute (migration 2026-08-20-role-dsf.sql).
  role: z.enum([
    "ADMIN",
    "DG",
    "DAF",
    "DSF",
    "DMC",
    "UGP",
    "MISSION",
    "TECHNIQUE",
    "ENTREPRISE",
    "AUDITEUR",
    "BAILLEUR",
    "BUDGET",
    "TRESOR",
    "FER_AGT",
    "BCRG",
  ]),
  actif: z.boolean().default(true),
  // Identité officielle portée sur les documents signés. Sans elle, les
  // cartouches de visa restaient vides même sur une pièce validée, et
  // l'historique des validations affichait l'adresse e-mail du valideur.
  nom: z.string().optional(),
  prenom: z.string().optional(),
  fonction: z.string().optional(),
  // Spécimen de signature déposé via /api/uploads — apposé sur les documents.
  // Contraint (revue 27/08/2026) : c'était une chaîne libre affichée sur des
  // pièces officielles — un chemin interne uniquement, pas d'URL externe.
  signatureUrl: z.string().startsWith("/api/uploads/").max(300).optional(),
  // Entreprise rattachée. Ce champ n'existait pas : zod retirant les clés
  // inconnues, un compte ENTREPRISE créé par l'API se retrouvait sans
  // rattachement — et l'absence de rattachement vaut « aucune restriction »
  // dans les modules de lecture. Le compte voyait alors les décomptes, marchés
  // et exports de toute l'agence. Voir la vérification ci-dessous.
  entrepriseId: z.string().uuid().nullish(),
});

/** Cohérence rôle ↔ rattachement entreprise (bidirectionnelle). */
function coherenceRoleEntreprise(donnees: { role?: string; entrepriseId?: string | null }, contexte: z.RefinementCtx) {
  // Fermeture par défaut : un compte ENTREPRISE sans entreprise n'est pas un
  // compte à privilèges, c'est un compte incohérent. On refuse de le créer
  // plutôt que de le laisser hériter d'un périmètre vide interprété comme total.
  if (donnees.role === "ENTREPRISE" && !donnees.entrepriseId) {
    contexte.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["entrepriseId"],
      message: "Un compte entreprise doit être rattaché à une entreprise",
    });
  }
  // Symétrie : un rattachement sur un compte interne n'aurait aucun sens et
  // ferait basculer ses lectures dans l'isolation entreprise.
  if (donnees.role !== "ENTREPRISE" && donnees.entrepriseId) {
    contexte.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["entrepriseId"],
      message: "Seul un compte entreprise peut être rattaché à une entreprise",
    });
  }
}

// Création ET mise à jour (revue 27/08/2026 : la voie update utilisait un
// schéma dérivé sans la vérification — elle pouvait produire le couple
// incohérent que la création refuse).
export const userCreateSchema = userChampsSchema.superRefine(coherenceRoleEntreprise);

/**
 * Modification : les champs sont facultatifs et le mot de passe est écarté.
 * Dérivée de l'objet NU, avant affinement — un schéma affiné n'expose plus
 * `.partial()`. La cohérence rôle/entreprise est revérifiée APRÈS partial
 * (revue 27/08/2026 : la voie update pouvait produire le couple incohérent
 * que la création refuse — fail-closed à l'usage, mais incohérent en base).
 * Sur champs partiels, la vérification ne s'applique que si l'un des deux
 * côtés du couple est fourni.
 */
export const userUpdateSchema = userChampsSchema.partial().omit({ password: true });

/**
 * Cohérence rôle ↔ entreprise sur l'état FUSIONNÉ (revue 27/08/2026). Sur un
 * schéma partiel, vérifier la seule requête serait faux : changer le rôle en
 * ENTREPRISE sans renvoyer le rattachement — déjà présent en base — serait
 * refusé. La route PUT fournit l'état existant ; la vérification porte sur le
 * couple complet.
 */
export function verifierCoherenceUtilisateur(
  role: string | undefined,
  entrepriseId: string | null | undefined,
): string | null {
  if (role === "ENTREPRISE" && !entrepriseId) {
    return "Un compte entreprise doit être rattaché à une entreprise";
  }
  if (role && role !== "ENTREPRISE" && entrepriseId) {
    return "Seul un compte entreprise peut être rattaché à une entreprise";
  }
  return null;
}

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserCreateColonnes = Omit<UserCreateInput, "password">;

/**
 * Sépare le mot de passe en clair des colonnes du modèle. Le premier part au
 * hachage, les secondes seules vont à Prisma.
 */
export function separerMotDePasse(entree: UserCreateInput): {
  password: string;
  colonnes: UserCreateColonnes;
} {
  const { password, ...colonnes } = entree;
  return { password, colonnes };
}
