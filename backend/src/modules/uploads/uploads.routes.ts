/**
 * Pièces jointes — dépôt et téléchargement authentifiés (P0-2 REVUE-2026-08-13).
 *
 * Modèle (réconcilié le 18/08/2026 — fusion du correctif serveur cc77489 et
 * de l'intégration frontend) :
 *   1. POST /api/uploads            — authentifié + au moins un module
 *                                     documentaire ; multer 20 Mo, types
 *                                     filtrés, nom opaque, octets magiques
 *                                     vérifiés, dépôt journalisé ;
 *   2. GET  /api/uploads/sign/:f    — authentifié : périmètre vérifié PAR
 *                                     DOCUMENT (module, isolation entreprise,
 *                                     affectations) puis délivrance d'une URL
 *                                     signée HMAC-SHA-256 valable 15 minutes ;
 *   3. GET  /api/uploads/files/:f   — accessible sans en-tête Authorization
 *                                     (le frontend ouvre par navigation :
 *                                     window.open / <a> / <img>) mais token
 *                                     HMAC + expiration obligatoires.
 *
 * Le périmètre est contrôlé à la SIGNATURE : c'est le moment où l'utilisateur
 * est authentifié. Pendant les 15 minutes de validité du lien, le fichier
 * reste accessible au porteur du token — fenêtre courte, assumée.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { mkdirSync } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { requireAuth } from "../../middleware/auth.middleware";
import { ApiError } from "../../middleware/error.middleware";
import { logAudit } from "../../lib/audit";
import { getEffectiveModules } from "../../lib/modules.catalog";
import { getMarchesAffectes } from "../../lib/affectations";
import { entrepriseIdOf } from "../../lib/scope";
import { ALLOWED_MIME_TYPES, buildStoredFilename, isSafeStoredFilename, peutLireReference, signerLienFichier, verifierLienFichier } from "./uploads.security";

export const uploadsRouter = Router();
// Pas de requireAuth au niveau du routeur : /files/:filename doit rester
// joignable par navigation (sans en-tête Authorization) — sa protection est
// le token HMAC ; les deux autres routes portent requireAuth individuellement.

const DOCUMENT_MODULES = ["attachements", "decomptes", "receptions", "entreprises", "financements"];
mkdirSync(env.UPLOAD_DIR, { recursive: true });

const LINK_TTL_MS = 15 * 60 * 1000;
const EXT_MIME = new Map([...ALLOWED_MIME_TYPES.entries()].map(([mime, ext]) => [ext, mime]));

async function requireDocumentModule(req: Request, _res: Response, next: NextFunction) {
  try {
    const modules = await getEffectiveModules(req.user!.id, req.user!.role);
    if (!DOCUMENT_MODULES.some((moduleKey) => modules.includes(moduleKey))) throw new ApiError(403, "Aucun module documentaire autorisé");
    next();
  } catch (error) { next(error); }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: env.UPLOAD_DIR,
    filename: (_req, file, callback) => {
      const filename = buildStoredFilename(file.mimetype);
      if (!filename) return callback(new Error("Type de fichier non autorisé"), "");
      callback(null, filename);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, ALLOWED_MIME_TYPES.has(file.mimetype)),
});

// Signatures magiques — le contenu doit correspondre au type déclaré
// (un « PDF » renommé contenant un exécutable doit être refusé).
const MAGIC_BYTES: Record<string, number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46],                                    // %PDF
  "image/png":       [0x89, 0x50, 0x4e, 0x47],                                    // \x89PNG
  "image/jpeg":      [0xff, 0xd8, 0xff],                                          // \xff\xd8\xff
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":       [0x50, 0x4b, 0x03, 0x04], // ZIP
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [0x50, 0x4b, 0x03, 0x04],
  "application/vnd.ms-excel": [0xd0, 0xcf, 0x11, 0xe0],                          // OLE2
  "application/msword":       [0xd0, 0xcf, 0x11, 0xe0],
};

function signatureConforme(filePath: string, mimeType: string): boolean {
  const attendu = MAGIC_BYTES[mimeType];
  if (!attendu) return true; // type non couvert : le filtre MIME reste le seul contrôle
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(attendu.length);
    const lus = fs.readSync(fd, buf, 0, attendu.length, 0);
    if (lus < attendu.length) return false;
    return attendu.every((b, i) => buf[i] === b);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* ignore */ } }
  }
}

// Signature/vérification déportées dans uploads.security.ts (fonctions pures,
// couvertes par uploads.security.test.ts). Comportement inchangé.
function signToken(filename: string, expires: number): string {
  return signerLienFichier(env.JWT_SECRET, filename, expires);
}

function verifyToken(filename: string, expires: number, token: string): boolean {
  return verifierLienFichier(env.JWT_SECRET, filename, expires, token);
}

// ─── POST /api/uploads — dépôt d'une pièce jointe ─────────────────────────────
uploadsRouter.post("/", requireAuth, requireDocumentModule, (req: Request, res: Response, next: NextFunction) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return next(new ApiError(400, "Fichier trop volumineux — maximum 20 Mo"));
      }
      return next(new ApiError(400, "Fichier absent ou type non autorisé"));
    }
    const file = req.file;
    if (!file) return next(new ApiError(400, "Aucun fichier reçu (champ attendu : file)"));
    if (!signatureConforme(file.path, file.mimetype)) {
      try { fs.unlinkSync(file.path); } catch { /* ignore */ }
      return next(new ApiError(400, "Le contenu du fichier ne correspond pas à son type déclaré"));
    }
    // Journalisation non bloquante — ne doit jamais faire échouer le dépôt
    logAudit({
      userId: req.user!.id,
      action: "CREATE",
      entityType: "Upload",
      entityId: file.filename,
      after: { originalName: file.originalname, mimeType: file.mimetype, size: file.size },
    }).catch(() => {});
    res.status(201).json({
      url: "/api/uploads/files/" + file.filename,
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    });
  });
});

// ─── Résolution du périmètre par document (correctif serveur cc77489) ─────────
type FileReference = { moduleKey: string; marcheId?: string; entrepriseId?: string };

async function findReferences(url: string): Promise<FileReference[]> {
  const references: FileReference[] = [];
  const [media, document, entrepriseDocument, fundingDocument, receptions] = await Promise.all([
    prisma.attachementMedia.findFirst({
      where: { urlPublique: url, attachement: { decompte: { deletedAt: null, marche: { deletedAt: null } } } },
      select: { attachement: { select: { decompte: { select: { marcheId: true, entrepriseId: true } } } } },
    }),
    prisma.document.findFirst({
      where: { cheminFichier: url, estArchive: false, decompte: { deletedAt: null, marche: { deletedAt: null } } },
      select: { decompte: { select: { marcheId: true, entrepriseId: true } } },
    }),
    prisma.documentEntreprise.findFirst({ where: { url, entreprise: { deletedAt: null } }, select: { entrepriseId: true } }),
    prisma.fundingDocument.findFirst({ where: { cheminFichier: url }, select: { id: true } }),
    prisma.reception.findMany({ select: { pieces: true, marcheId: true, marche: { select: { entrepriseId: true, deletedAt: true } } } }),
  ]);
  if (media) references.push({ moduleKey: "attachements", marcheId: media.attachement.decompte.marcheId, entrepriseId: media.attachement.decompte.entrepriseId });
  if (document) references.push({ moduleKey: "decomptes", marcheId: document.decompte.marcheId, entrepriseId: document.decompte.entrepriseId });
  if (entrepriseDocument) references.push({ moduleKey: "entreprises", entrepriseId: entrepriseDocument.entrepriseId });
  if (fundingDocument) references.push({ moduleKey: "financements" });
  for (const reception of receptions) {
    if (reception.marche.deletedAt) continue;
    const pieces = Array.isArray(reception.pieces) ? reception.pieces : [];
    if (pieces.some((piece) => typeof piece === "object" && piece !== null && (piece as { url?: unknown }).url === url)) {
      references.push({ moduleKey: "receptions", marcheId: reception.marcheId, entrepriseId: reception.marche.entrepriseId });
    }
  }
  return references;
}

async function canReadReference(req: Request, reference: FileReference, modules: string[]): Promise<boolean> {
  if (!req.user) return false;
  // Le jeton ne porte pas l'entreprise : on la résout en base, comme le fait
  // déjà le module portail (lib/scope.ts). La décision elle-même est déportée
  // dans uploads.security.ts pour être couverte par des tests.
  const entrepriseId = req.user.role === "ENTREPRISE" ? await entrepriseIdOf(req.user.id) : null;
  const marches = req.user.role === "ENTREPRISE" ? null : await getMarchesAffectes(req.user.id, req.user.role);
  return peutLireReference(req.user.role, reference, modules, entrepriseId, marches);
}

// ─── GET /api/uploads/sign/:filename — URL signée après contrôle du périmètre ─
uploadsRouter.get("/sign/:filename", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filename = req.params.filename;
    if (!isSafeStoredFilename(filename)) throw new ApiError(404, "Fichier introuvable");
    if (!fs.existsSync(path.join(env.UPLOAD_DIR, filename))) throw new ApiError(404, "Fichier introuvable");

    // Périmètre vérifié ICI, utilisateur authentifié : le fichier doit être
    // référencé par une entité accessible à l'utilisateur (module + isolation
    // entreprise + affectations). Un fichier non référencé n'est pas délivré.
    const url = "/api/uploads/files/" + filename;
    const [references, modules] = await Promise.all([findReferences(url), getEffectiveModules(req.user!.id, req.user!.role)]);
    const decisions = await Promise.all(references.map((reference) => canReadReference(req, reference, modules)));
    if (references.length === 0 || !decisions.some(Boolean)) throw new ApiError(404, "Fichier introuvable");

    const expires = Date.now() + LINK_TTL_MS;
    const token = signToken(filename, expires);
    res.json({
      url: `/api/uploads/files/${filename}?expires=${expires}&token=${token}`,
      expires: new Date(expires).toISOString(),
    });
  } catch (err) { next(err); }
});

// ─── GET /api/uploads/files/:filename — téléchargement par URL signée ────────
/**
 * Téléchargement : SESSION EXIGÉE + périmètre revérifié + lien signé.
 *
 * Décision du 23/08/2026 (revue du 22/08, constat « pièces insuffisamment
 * protégées ») : le lien signé suffisait seul. Partagé, copié depuis un journal
 * ou un historique de navigateur, il donnait le fichier à quiconque jusqu'à son
 * expiration. Désormais :
 *   1. l'appelant est authentifié (requireAuth) ;
 *   2. le périmètre est revérifié AU MOMENT DU TÉLÉCHARGEMENT — pas seulement à
 *      la signature : une affectation retirée entre les deux ferme l'accès ;
 *   3. le lien signé reste exigé, comme second facteur à durée courte.
 * Le client envoie donc le jeton de session (fetch + Authorization) et ouvre le
 * blob reçu — un simple window.open(url) ne porte pas d'en-tête.
 */
uploadsRouter.get("/files/:filename", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filename = req.params.filename;
    if (!isSafeStoredFilename(filename)) throw new ApiError(404, "Fichier introuvable");

    const expires = Number(req.query.expires);
    const token = String(req.query.token ?? "");
    if (!Number.isFinite(expires) || expires < Date.now()) {
      throw new ApiError(401, "Lien expiré — rechargez la page et réessayez");
    }
    if (!token || !verifyToken(filename, expires, token)) {
      throw new ApiError(403, "Lien de téléchargement invalide");
    }

    const url = "/api/uploads/files/" + filename;
    const [references, modules] = await Promise.all([findReferences(url), getEffectiveModules(req.user!.id, req.user!.role)]);
    const decisions = await Promise.all(references.map((reference) => canReadReference(req, reference, modules)));
    if (references.length === 0 || !decisions.some(Boolean)) throw new ApiError(404, "Fichier introuvable");

    const filePath = path.resolve(env.UPLOAD_DIR, filename);
    if (!filePath.startsWith(path.resolve(env.UPLOAD_DIR) + path.sep) || !fs.existsSync(filePath)) {
      throw new ApiError(404, "Fichier introuvable");
    }

    const ext = path.extname(filename).toLowerCase();
    res.setHeader("Content-Type", EXT_MIME.get(ext) ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.sendFile(filePath);
  } catch (err) { next(err); }
});
