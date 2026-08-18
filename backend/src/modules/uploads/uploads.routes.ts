import { Router, type NextFunction, type Request, type Response } from "express";
import { mkdirSync } from "node:fs";
import path from "node:path";
import multer from "multer";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { requireAuth } from "../../middleware/auth.middleware";
import { ApiError } from "../../middleware/error.middleware";
import { getEffectiveModules } from "../../lib/modules.catalog";
import { getMarchesAffectes } from "../../lib/affectations";
import { entrepriseIdOf } from "../../lib/scope";
import { ALLOWED_MIME_TYPES, buildStoredFilename, isSafeStoredFilename } from "./uploads.security";

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth);

const DOCUMENT_MODULES = ["attachements", "decomptes", "receptions", "entreprises", "financements"];
mkdirSync(env.UPLOAD_DIR, { recursive: true });

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

uploadsRouter.post("/", requireDocumentModule, upload.single("file"), (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new ApiError(400, "Fichier absent ou type non autorisé");
    res.status(201).json({
      url: "/api/uploads/files/" + req.file.filename,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  } catch (error) { next(error); }
});

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
  if (!req.user || !modules.includes(reference.moduleKey)) return false;
  if (req.user.role === "ENTREPRISE") {
    // Le jeton ne porte pas l'entreprise : on la résout en base, comme le fait
    // déjà le module portail (lib/scope.ts). Sans cela le test comparait à
    // undefined et refusait à toute entreprise l'accès à ses propres pièces.
    const entrepriseId = await entrepriseIdOf(req.user.id);
    return Boolean(entrepriseId && reference.entrepriseId === entrepriseId);
  }
  const marches = await getMarchesAffectes(req.user.id, req.user.role);
  return marches === null || Boolean(reference.marcheId && marches.includes(reference.marcheId));
}

uploadsRouter.get("/files/:filename", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filename = req.params.filename;
    if (!isSafeStoredFilename(filename)) throw new ApiError(404, "Fichier introuvable");
    const url = "/api/uploads/files/" + filename;
    const [references, modules] = await Promise.all([findReferences(url), getEffectiveModules(req.user!.id, req.user!.role)]);
    const decisions = await Promise.all(references.map((reference) => canReadReference(req, reference, modules)));
    if (!decisions.some(Boolean)) throw new ApiError(404, "Fichier introuvable");
    res.setHeader("Cache-Control", "private, no-store");
    res.sendFile(path.resolve(env.UPLOAD_DIR, filename), (error) => {
      if (error && !res.headersSent) next(new ApiError(404, "Fichier introuvable"));
    });
  } catch (error) { next(error); }
});
