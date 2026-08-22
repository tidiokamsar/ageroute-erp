import { z } from "zod";
import { convertirMontantGnf } from "./paiements.regles";

/**
 * Compatibilité contrôlée : une chaîne entière est préférée; un ancien client
 * peut encore envoyer un Number uniquement s'il est entier, positif et sûr.
 */
export const montantGnfSchema = z.union([
  z.string().regex(/^[1-9]\d*$/, "Le montant GNF doit être une chaîne d'entier positif"),
  z.number().int().positive().safe("Le montant GNF dépasse la précision sûre de Number"),
]).transform(convertirMontantGnf);

export const paiementCreateSchema = z.object({
  decompteId: z.string().uuid(),
  montantGnf: montantGnfSchema,
  dateOrdre: z.coerce.date().optional(),
  dateExecution: z.coerce.date().optional(),
  reference: z.string().trim().min(3),
  banque: z.string().optional(),
  observations: z.string().optional(),
});

export const confirmationBcrgSchema = z.object({
  montantReelGnf: montantGnfSchema,
  dateReelleTransfert: z.coerce.date(),
  observations: z.string().optional(),
});
