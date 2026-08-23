/**
 * Routes du module signature-numerique.
 *   GET  /etat                         — configuration effective, santé, portes (ADMIN, DG, DAF)
 *   POST /decomptes/:id/signer         — signe le dossier complet d'un décompte
 *   GET  /decomptes/:id/documents      — documents signés d'un décompte
 *   GET  /documents/:id/pdf            — le PDF signé (session + périmètre)
 *   GET  /documents/:id/rapport        — rapport de validation DSS
 * Le périmètre est contrôlé par genererDossierDecompte (à la signature) et par
 * assertDecompteAutorise (à la lecture). La configuration se modifie par
 * l'administration : PUT /api/parametrage/:cle, catégorie SIGNATURE.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import fs from "node:fs";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { ApiError } from "../../middleware/error.middleware";
import { assertDecompteAutorise, entrepriseDuCompte } from "../../lib/perimetre";
import { signerDecompte, etatSignature, cheminAbsolu } from "../../lib/signature/orchestrateur";

export const signatureNumeriqueRouter = Router();
signatureNumeriqueRouter.use(requireAuth);

signatureNumeriqueRouter.get("/etat", requireRole("ADMIN", "DG", "DAF", "DMC"), async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json(await etatSignature()); } catch (err) { next(err); }
});

// DGA sera ajouté ici quand le rôle existera (lot « versionnement des circuits »).
signatureNumeriqueRouter.post("/decomptes/:id/signer", requireRole("ADMIN", "DG", "DAF", "DMC", "UGP", "MISSION", "TECHNIQUE"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { motif } = z.object({ motif: z.string().trim().min(5).max(200) }).parse(req.body);
    res.status(201).json(await signerDecompte(req, req.params.id, motif));
  } catch (err) { next(err); }
});

async function verifierAcces(req: Request, decompteId: string) {
  const d = await prisma.decompte.findFirst({ where: { id: decompteId, deletedAt: null }, select: { marcheId: true, entrepriseId: true } });
  if (!d) throw new ApiError(404, "Décompte introuvable");
  const ent = await entrepriseDuCompte(req);
  if (ent && d.entrepriseId !== ent) throw new ApiError(404, "Décompte introuvable");
  await assertDecompteAutorise(req, decompteId, async () => d.marcheId);
}

signatureNumeriqueRouter.get("/decomptes/:id/documents", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await verifierAcces(req, req.params.id);
    const docs = await prisma.sigDocumentFinalise.findMany({
      where: { decompteId: req.params.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, reference: true, mode: true, prestataire: true, niveauPades: true, filigrane: true, validationIndication: true, sha256Signe: true, signeParEmail: true, signeParRole: true, signeParQualite: true, createdAt: true },
    });
    res.json(docs);
  } catch (err) { next(err); }
});

signatureNumeriqueRouter.get("/documents/:id/pdf", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await prisma.sigDocumentFinalise.findUnique({ where: { id: req.params.id } });
    if (!doc) throw new ApiError(404, "Document introuvable");
    await verifierAcces(req, doc.decompteId);
    const abs = cheminAbsolu(doc.cheminFichier);
    if (!fs.existsSync(abs)) throw new ApiError(404, "Fichier signé absent du stockage");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="dossier-${doc.reference}-signe.pdf"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.sendFile(abs);
  } catch (err) { next(err); }
});

signatureNumeriqueRouter.get("/documents/:id/rapport", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await prisma.sigDocumentFinalise.findUnique({ where: { id: req.params.id } });
    if (!doc) throw new ApiError(404, "Document introuvable");
    await verifierAcces(req, doc.decompteId);
    res.json({ id: doc.id, validationIndication: doc.validationIndication, rapport: doc.rapportValidation, mode: doc.mode, prestataire: doc.prestataire });
  } catch (err) { next(err); }
});
