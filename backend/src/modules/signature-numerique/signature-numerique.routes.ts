/**
 * Routes du service transversal signature-numerique.
 *
 * DÉCISION D'ARCHITECTURE (23/08/2026, docs/adr/ADR-003) : ce module n'est PAS
 * une application autonome de recherche, de téléversement ou de signature. Les
 * modules métier l'appellent depuis la page du document ; le signataire ne
 * téléverse rien, ne cherche rien, ne choisit aucun certificat.
 *
 *   GET  /etat                          — configuration effective, santé, portes
 *   GET  /decomptes/:id/eligibilite     — le bouton « Signer » a-t-il le droit d'exister ?
 *   POST /decomptes/:id/preparer        — gel + empreinte + demande (2 temps, §3)
 *   GET  /demandes/:id/pdf              — le PDF EXACT qui sera signé
 *   POST /demandes/:id/confirmer        — consentement + réauthentification + apposition
 *   GET  /decomptes/:id/documents       — chaîne des documents signés
 *   GET  /documents/:id/pdf, /rapport   — consultation et rapport de validation
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import fs from "node:fs";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { ApiError } from "../../middleware/error.middleware";
import { assertDecompteAutorise, entrepriseDuCompte } from "../../lib/perimetre";
import { preparerSignatureDecompte, confirmerSignature, lireDemandePdf, eligibiliteSignature, etatSignature, cheminAbsolu } from "../../lib/signature/orchestrateur";

export const signatureNumeriqueRouter = Router();
signatureNumeriqueRouter.use(requireAuth);

const ROLES_SIGNATAIRES = ["ADMIN", "DG", "DAF", "DMC", "UGP", "MISSION", "TECHNIQUE"] as const;

signatureNumeriqueRouter.get("/etat", requireRole("ADMIN", "DG", "DAF", "DMC"), async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json(await etatSignature()); } catch (err) { next(err); }
});

signatureNumeriqueRouter.get("/decomptes/:id/eligibilite", async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await eligibiliteSignature(req, req.params.id)); } catch (err) { next(err); }
});

signatureNumeriqueRouter.post("/decomptes/:id/preparer", requireRole(...ROLES_SIGNATAIRES), async (req: Request, res: Response, next: NextFunction) => {
  try { res.status(201).json(await preparerSignatureDecompte(req, req.params.id)); } catch (err) { next(err); }
});

signatureNumeriqueRouter.get("/demandes/:id/pdf", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chemin } = await lireDemandePdf(req, req.params.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, no-store");
    res.sendFile(chemin);
  } catch (err) { next(err); }
});

signatureNumeriqueRouter.post("/demandes/:id/confirmer", requireRole(...ROLES_SIGNATAIRES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const corps = z.object({ motDePasse: z.string().min(1), consentement: z.boolean() }).parse(req.body);
    res.json(await confirmerSignature(req, req.params.id, corps));
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
      orderBy: { rang: "asc" },
      select: { id: true, reference: true, rang: true, etape: true, mode: true, prestataire: true, niveauPades: true, filigrane: true, validationIndication: true, sha256Signe: true, signeParEmail: true, signeParRole: true, signeParQualite: true, createdAt: true },
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
    res.setHeader("Content-Disposition", `attachment; filename="dossier-${doc.reference}-r${doc.rang}-signe.pdf"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.sendFile(abs);
  } catch (err) { next(err); }
});

signatureNumeriqueRouter.get("/documents/:id/rapport", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await prisma.sigDocumentFinalise.findUnique({ where: { id: req.params.id } });
    if (!doc) throw new ApiError(404, "Document introuvable");
    await verifierAcces(req, doc.decompteId);
    res.json({ id: doc.id, rang: doc.rang, etape: doc.etape, validationIndication: doc.validationIndication, rapport: doc.rapportValidation, mode: doc.mode, prestataire: doc.prestataire });
  } catch (err) { next(err); }
});
