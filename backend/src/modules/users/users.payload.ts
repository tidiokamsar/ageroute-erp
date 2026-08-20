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

export const userCreateSchema = z.object({
  email: z.string().email(),
  nomComplet: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "DG", "DAF", "DMC", "UGP", "MISSION", "TECHNIQUE", "ENTREPRISE", "AUDITEUR"]),
  actif: z.boolean().default(true),
  // Identité officielle portée sur les documents signés. Sans elle, les
  // cartouches de visa restaient vides même sur une pièce validée, et
  // l'historique des validations affichait l'adresse e-mail du valideur.
  nom: z.string().optional(),
  prenom: z.string().optional(),
  fonction: z.string().optional(),
  // Spécimen de signature déposé via /api/uploads — apposé sur les documents.
  signatureUrl: z.string().optional(),
});

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
