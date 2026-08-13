import { z } from "zod";

export const marcheCreateSchema = z.object({
  reference: z.string().min(1),
  intitule: z.string().min(1),
  objet: z.string().optional(),
  type: z.enum(["TRAVAUX", "SERVICES", "FOURNITURES", "ETUDES"]),
  procedure: z.enum(["APPEL_OFFRES_OUVERT", "APPEL_OFFRES_RESTREINT", "GRES_A_GRES", "CONSULTATION"]),
  financement: z.enum(["BANQUE_MONDIALE", "BAD", "BUDGET_NATIONAL", "FER", "BOAD", "BID", "UE", "BADEA", "AFD", "KFW", "AUTRE"]),
  entrepriseId: z.string().uuid(),
  coTraitants: z.string().optional(),
  missionControle: z.string().optional(),
  directionTechnique: z.string().optional(),
  tronconCode: z.string().optional(),
  regionNom: z.string().optional(),
  pkDebut: z.number().optional(),
  pkFin: z.number().optional(),
  montantInitialGnf: z.number().positive().transform((v) => BigInt(Math.round(v))),
  montantActualiseGnf: z.number().positive().transform((v) => BigInt(Math.round(v))).optional(),
  tauxTva: z.number().min(0).max(100).optional(),
  tauxRetenueGarantie: z.number().min(0).max(100).optional(),
  tauxAvance: z.number().min(0).max(100).optional(),
  dateOs: z.coerce.date().optional(),
  dateDebutPrevue: z.coerce.date().optional(),
  dateFinPrevue: z.coerce.date().optional(),
  dateFinReelle: z.coerce.date().optional(),
  delaiMois: z.number().int().positive().optional(),
  numContrat: z.string().optional(),
  bailleur: z.string().optional(),
  observations: z.string().optional(),
});

export const marcheUpdateSchema = marcheCreateSchema.partial().omit({ entrepriseId: true });
export type MarcheCreateInput = z.infer<typeof marcheCreateSchema>;
