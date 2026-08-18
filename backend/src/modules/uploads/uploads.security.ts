import path from "node:path";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ALLOWED_MIME_TYPES = new Map([
  ["application/pdf", ".pdf"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
  ["application/vnd.ms-excel", ".xls"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
  ["application/msword", ".doc"],
]);

export function buildStoredFilename(mimeType: string): string | null {
  const extension = ALLOWED_MIME_TYPES.get(mimeType);
  return extension ? randomBytes(24).toString("hex") + extension : null;
}

export function isSafeStoredFilename(filename: string): boolean {
  return Boolean(filename) &&
    !filename.includes("\0") &&
    !filename.includes("..") &&
    path.basename(filename) === filename &&
    /^[a-f0-9]{48}\.(pdf|jpg|png|xlsx|xls|docx|doc)$/.test(filename);
}

export interface ReferenceFichier {
  moduleKey: string;
  marcheId?: string;
  entrepriseId?: string;
}

/**
 * Décision d'accès en lecture à une pièce jointe, une fois le contexte résolu.
 *
 * Fonction PURE : l'appelant résout d'abord l'entreprise de l'utilisateur et
 * ses marchés affectés, puis délègue ici. Cela rend la matrice d'habilitation
 * testable sans base de données.
 *
 * @param entrepriseIdUtilisateur entreprise liée au compte, null si aucune
 * @param marchesAffectes         ids des marchés affectés, ou null = aucune restriction
 */
export function peutLireReference(
  role: string,
  reference: ReferenceFichier,
  modulesAutorises: string[],
  entrepriseIdUtilisateur: string | null,
  marchesAffectes: string[] | null,
): boolean {
  if (!modulesAutorises.includes(reference.moduleKey)) return false;
  if (role === "ENTREPRISE") {
    // Isolation stricte : une entreprise ne voit que ses propres pièces, et
    // un compte sans entreprise liée ne voit rien (jamais d'accès par défaut).
    return Boolean(entrepriseIdUtilisateur && reference.entrepriseId === entrepriseIdUtilisateur);
  }
  return marchesAffectes === null || Boolean(reference.marcheId && marchesAffectes.includes(reference.marcheId));
}

/**
 * Lien de téléchargement signé.
 *
 * La signature couvre le nom du fichier ET l'échéance : un jeton valable pour
 * un fichier ne l'est pour aucun autre, et il cesse de l'être passé le délai.
 * Le secret est fourni par l'appelant (env.JWT_SECRET côté serveur) pour que
 * ces fonctions restent pures et testables.
 */
export function signerLienFichier(secret: string, filename: string, expires: number): string {
  return createHmac("sha256", secret).update(`${filename}:${expires}`).digest("hex");
}

export function verifierLienFichier(secret: string, filename: string, expires: number, token: string): boolean {
  const attendu = Buffer.from(signerLienFichier(secret, filename, expires));
  const fourni = Buffer.from(String(token ?? ""));
  // Comparaison à temps constant — mais seulement à longueur égale, sinon
  // timingSafeEqual lève au lieu de renvoyer false.
  return attendu.length === fourni.length && timingSafeEqual(attendu, fourni);
}
