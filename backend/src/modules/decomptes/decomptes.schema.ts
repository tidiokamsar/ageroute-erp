import { z } from "zod";

export const decompteCreateSchema = z.object({
  reference: z.string().optional(), // généré automatiquement si absent : <ref marché>/D-NN
  type: z.enum(["AVANCE", "PROVISOIRE", "PARTIEL", "INTERMEDIAIRE", "FINAL", "CLOTURE", "APRES_AVENANT"]),
  marcheId: z.string().uuid(),
  lotId: z.string().uuid().optional(),
  entrepriseId: z.string().uuid(),
  periodeDebut: z.coerce.date().optional(),
  periodeFin: z.coerce.date().optional(),
  montantPeriodeHtGnf: z.number().nonnegative().transform((v) => BigInt(Math.round(v))).optional(),
  cumulPrecedentHtGnf: z.number().nonnegative().transform((v) => BigInt(Math.round(v))).optional(),
  penalites: z.number().nonnegative().transform((v) => BigInt(Math.round(v))).optional(),
  revisionPrix: z.number().transform((v) => BigInt(Math.round(v))).optional(),
  dateDepot: z.coerce.date().optional(),
  observations: z.string().optional(),
});

export const decompteUpdateSchema = decompteCreateSchema.partial().omit({ marcheId: true, entrepriseId: true });
