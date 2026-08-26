import { z } from "zod";
import { ALLOWED_MIME_TYPES, isSafeStoredFilename } from "../uploads/uploads.security";

export const REQUIRED_PORTAIL_DECOMPTE_PIECES = [
  "DECOMPTE",
  "ATTACHEMENT",
  "FACTURE",
  "RAPPORT_AVANCEMENT",
] as const;

const PIECE_LABELS: Record<(typeof REQUIRED_PORTAIL_DECOMPTE_PIECES)[number], string> = {
  DECOMPTE: "Décompte signé",
  ATTACHEMENT: "Attachements validés",
  FACTURE: "Facture",
  RAPPORT_AVANCEMENT: "Rapport d’avancement",
};

const UPLOAD_URL_PREFIX = "/api/uploads/files/";

export function getStoredFilenameFromUploadUrl(value: string): string | null {
  if (!value.startsWith(UPLOAD_URL_PREFIX)) return null;
  const filename = value.slice(UPLOAD_URL_PREFIX.length);
  return isSafeStoredFilename(filename) ? filename : null;
}

function isProtectedUploadUrl(value: string): boolean {
  return getStoredFilenameFromUploadUrl(value) !== null;
}

export const portailDecomptePieceSchema = z.object({
  type: z.enum(["DECOMPTE", "ATTACHEMENT", "FACTURE", "RAPPORT_AVANCEMENT", "PHOTO", "PV"]),
  nom: z.string().trim().min(1, "Le nom du fichier est requis").max(255),
  cheminFichier: z.string().refine(isProtectedUploadUrl, "Référence de fichier invalide"),
  mimeType: z.string().refine((value) => ALLOWED_MIME_TYPES.has(value), "Type de fichier non autorisé"),
  tailleOctets: z.number().int().positive().max(20 * 1024 * 1024),
  legende: z.string().trim().max(500).default(""),
}).strict();

export const portailDecomptePiecesSchema = z.array(portailDecomptePieceSchema)
  .min(REQUIRED_PORTAIL_DECOMPTE_PIECES.length, "Le dossier du décompte est obligatoire")
  .max(6, "Le dossier contient trop de lignes documentaires")
  .superRefine((pieces, context) => {
    const seen = new Set<string>();
    const seenPaths = new Set<string>();
    pieces.forEach((piece, index) => {
      if (seen.has(piece.type)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "type"],
          message: `Une seule pièce est autorisée pour la ligne ${piece.type}`,
        });
      }
      seen.add(piece.type);
      if (seenPaths.has(piece.cheminFichier)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "cheminFichier"],
          message: "Un m\u00eame fichier ne peut pas \u00eatre utilis\u00e9 sur plusieurs lignes",
        });
      }
      seenPaths.add(piece.cheminFichier);
    });

    for (const requiredType of REQUIRED_PORTAIL_DECOMPTE_PIECES) {
      if (!seen.has(requiredType)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Pièce obligatoire manquante : ${PIECE_LABELS[requiredType]}`,
        });
      }
    }
  });

export type PortailDecomptePiece = z.infer<typeof portailDecomptePieceSchema>;

const portailDecompteLigneSchema = z.object({
  designation: z.string().trim().min(1, "La désignation est requise").max(500),
  unite: z.string().trim().min(1, "L’unité est requise").max(50),
  quantite: z.number().finite().positive("La quantité doit être strictement positive").max(1_000_000_000),
  prixUnitaire: z.number()
    .finite()
    .int("Le prix unitaire doit être un nombre entier de GNF")
    .positive("Le prix unitaire doit être strictement positif")
    .safe("Le prix unitaire dépasse la limite de précision autorisée"),
  // Valeur d’affichage calculée par le navigateur. Elle est acceptée pour
  // compatibilité, puis supprimée : le serveur recalcule toujours le montant.
  montantBrut: z.unknown().optional(),
}).strict().transform(({ montantBrut: _montantBrut, ...ligne }) => ligne);

const portailDecompteRequestRawSchema = z.object({
  marcheId: z.string().uuid("Identifiant du marché invalide"),
  type: z.enum(["PARTIEL", "DEFINITIF", "AVANCE", "REGULARISATION"]),
  observations: z.string().trim().max(2_000).optional(),
  lignes: z.array(portailDecompteLigneSchema)
    .min(1, "Ajoutez au moins une ligne au décompte")
    .max(500, "Le décompte contient trop de lignes"),
  pieces: portailDecomptePiecesSchema,
  // Anciens agrégats envoyés par certains clients. Ils ne sont jamais
  // utilisés pour une écriture financière et disparaissent du résultat parsé.
  montantHtGnf: z.unknown().optional(),
  montantTtcGnf: z.unknown().optional(),
  netAPayer: z.unknown().optional(),
}).strict();

export const portailDecompteRequestSchema = portailDecompteRequestRawSchema.transform(({
  montantHtGnf: _montantHtGnf,
  montantTtcGnf: _montantTtcGnf,
  netAPayer: _netAPayer,
  ...decompte
}) => decompte);

export type PortailDecompteRequest = z.infer<typeof portailDecompteRequestSchema>;
