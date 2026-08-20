/**
 * Pièces justificatives d'un décompte — fichiers réels.
 *
 * ⚠️ POURQUOI CE MODULE EXISTE
 * Les « pièces obligatoires » n'étaient qu'un JSON de booléens : on cochait
 * « facture » sans jamais déposer de facture. Rien n'était téléversé, rien ne
 * suivait le dossier, et l'entreprise n'avait aucun endroit où fournir ses
 * justificatifs. Le modèle `Document` existait pourtant, complet — mais aucune
 * route ne l'employait.
 *
 * Ici, une pièce est un FICHIER : déposé via /api/uploads (qui contrôle le type
 * et rend le nom non devinable), puis rattaché au décompte avec sa nature. La
 * case n'est plus déclarative : elle est cochée parce qu'un document existe.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/error.middleware";
import { logAudit } from "../../lib/audit";
import { assertDecompteAutorise, entrepriseDuCompte } from "../../lib/perimetre";

export const decompteDocumentsRouter = Router({ mergeParams: true });

/** Natures attendues — miroir du bordereau de pièces affiché à l'écran. */
export const NATURES_PIECES = [
  { cle: "decompteSigné",     libelle: "Décompte signé",          requis: true },
  { cle: "attachements",      libelle: "Attachements validés §9", requis: true },
  { cle: "facture",           libelle: "Facture de l'entreprise", requis: true },
  { cle: "rapportAvancement", libelle: "Rapport d'avancement",    requis: true },
  { cle: "photosChantier",    libelle: "Photos de chantier",      requis: false },
  { cle: "pvContradictoire",  libelle: "PV contradictoire",       requis: false },
] as const;

const CLES = NATURES_PIECES.map((n) => n.cle);

/** Le décompte doit être dans le périmètre de l'appelant, et le sien s'il est entreprise. */
async function assertAcces(req: Request, decompteId: string): Promise<{ id: string; entrepriseId: string; statut: string }> {
  await assertDecompteAutorise(req, decompteId, async (id) => {
    const d = await prisma.decompte.findUnique({ where: { id }, select: { marcheId: true } });
    return d?.marcheId ?? null;
  });
  const decompte = await prisma.decompte.findFirst({
    where: { id: decompteId, deletedAt: null },
    select: { id: true, entrepriseId: true, statut: true },
  });
  if (!decompte) throw new ApiError(404, "Décompte introuvable");

  const mienne = await entrepriseDuCompte(req);
  if (mienne && decompte.entrepriseId !== mienne) throw new ApiError(404, "Décompte introuvable");
  return decompte;
}

/**
 * GET /api/decomptes/:id/documents
 * Les pièces déposées, regroupées par nature, avec l'état d'avancement du
 * bordereau — c'est ce que l'écran et l'impression consomment.
 */
decompteDocumentsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decompteId = req.params.id;
    await assertAcces(req, decompteId);

    const documents = await prisma.document.findMany({
      where: { decompteId, estArchive: false },
      orderBy: { createdAt: "desc" },
    });

    // Nom lisible du déposant : une pièce justificative doit dire qui l'a fournie.
    const ids = [...new Set(documents.map((d) => d.uploadePar).filter(Boolean) as string[])];
    const auteurs = ids.length
      ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, nomComplet: true, role: true } })
      : [];
    const parId = new Map(auteurs.map((a) => [a.id, a]));

    const parNature = NATURES_PIECES.map((n) => {
      const pieces = documents.filter((d) => d.type === n.cle);
      return {
        ...n,
        fourni: pieces.length > 0,
        documents: pieces.map((d) => ({
          id: d.id, nom: d.nom, description: d.description,
          url: d.cheminFichier, mimeType: d.mimeType, tailleOctets: d.tailleOctets,
          version: d.version, createdAt: d.createdAt,
          statutValidation: d.statutValidation,
          motifRetour: d.motifRetour,
          valideAt: d.valideAt,
          deposePar: d.uploadePar ? (parId.get(d.uploadePar)?.nomComplet ?? d.uploadePar) : null,
          roleDeposant: d.uploadePar ? (parId.get(d.uploadePar)?.role ?? null) : null,
        })),
      };
    });

    const requis = parNature.filter((n) => n.requis);
    res.json({
      pieces: parNature,
      complet: requis.every((n) => n.fourni),
      fournis: parNature.filter((n) => n.fourni).length,
      requisFournis: requis.filter((n) => n.fourni).length,
      requisTotal: requis.length,
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/decomptes/:id/documents
 * Rattache un fichier déjà déposé sur /api/uploads. On ne reçoit pas le binaire
 * ici : le dépôt contrôle déjà le type et la taille, et produit une URL signée.
 */
decompteDocumentsRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const decompteId = req.params.id;
    const decompte = await assertAcces(req, decompteId);

    const corps = z.object({
      type: z.enum(CLES as unknown as [string, ...string[]]),
      nom: z.string().min(1),
      url: z.string().min(1),
      mimeType: z.string().optional(),
      tailleOctets: z.number().int().positive().optional(),
      description: z.string().optional(),
    }).parse(req.body);

    // Qui dépose : l'entreprise titulaire fournit ses justificatifs.
    // L'ADMIN reste autorisé pour les régularisations, la MISSION et la
    // DIRECTION TECHNIQUE ne déposent pas — elles contrôlent.
    if (!["ENTREPRISE", "ADMIN"].includes(req.user.role)) {
      throw new ApiError(403, "Le dépôt des pièces revient à l'entreprise titulaire ; votre rôle valide ou retourne les pièces déposées");
    }

    // Une pièce ne se rattache plus à un décompte déjà payé : le dossier est clos.
    if (decompte.statut === "PAYE") {
      throw new ApiError(409, "Décompte payé — le dossier est clos, aucune pièce ne peut y être ajoutée");
    }

    // Nouvelle version si la nature est déjà pourvue : on garde l'historique
    // plutôt que d'écraser une pièce justificative.
    const precedent = await prisma.document.findFirst({
      where: { decompteId, type: corps.type },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const document = await prisma.document.create({
      data: {
        decompteId, type: corps.type, nom: corps.nom,
        description: corps.description, cheminFichier: corps.url,
        mimeType: corps.mimeType, tailleOctets: corps.tailleOctets,
        version: (precedent?.version ?? 0) + 1,
        uploadePar: req.user.id,
        statutValidation: "DEPOSE",
      },
    });

    // Le bordereau déclaratif reste alimenté, mais il découle désormais des
    // fichiers réellement présents — plus d'une case cochée à vide.
    await synchroniserBordereau(decompteId);

    await logAudit({
      userId: req.user.id, action: "CREATE", entityType: "DocumentDecompte", entityId: document.id,
      after: { decompteId, type: corps.type, nom: corps.nom, version: document.version },
      ipAddress: req.ip,
    });

    res.status(201).json(document);
  } catch (err) { next(err); }
});

/**
 * DELETE /api/decomptes/:id/documents/:documentId
 * Archivage, pas suppression : une pièce justificative retirée doit rester
 * traçable (AGENTS.md §3.4).
 */
decompteDocumentsRouter.delete("/:documentId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const decompteId = req.params.id;
    await assertAcces(req, decompteId);

    const document = await prisma.document.findFirst({ where: { id: req.params.documentId, decompteId } });
    if (!document) throw new ApiError(404, "Pièce introuvable");

    await prisma.document.update({ where: { id: document.id }, data: { estArchive: true } });
    await synchroniserBordereau(decompteId);

    await logAudit({
      userId: req.user.id, action: "DELETE", entityType: "DocumentDecompte", entityId: document.id,
      before: { type: document.type, nom: document.nom }, ipAddress: req.ip,
    });

    res.status(204).send();
  } catch (err) { next(err); }
});

/** Aligne le bordereau déclaratif sur les fichiers réellement présents. */
async function synchroniserBordereau(decompteId: string): Promise<void> {
  // Une pièce retournée ne compte pas comme fournie : le dossier reste
  // incomplet tant que l'entreprise n'a pas redéposé.
  const presents = await prisma.document.findMany({
    where: { decompteId, estArchive: false, statutValidation: { not: "RETOURNE" } },
    select: { type: true },
  });
  const types = new Set(presents.map((d) => d.type));
  const bordereau = Object.fromEntries(CLES.map((c) => [c, types.has(c)]));
  await prisma.decompte.update({ where: { id: decompteId }, data: { piecesObligatoires: bordereau } });
}


/**
 * POST /api/decomptes/:id/documents/:documentId/valider
 * POST /api/decomptes/:id/documents/:documentId/retourner
 *
 * Le contrôle des pièces revient à la Mission de contrôle et à la Direction
 * Technique. Retourner exige un motif : l'entreprise doit savoir quoi corriger,
 * et la décision doit rester opposable.
 */
const ROLES_CONTROLE = ["MISSION", "TECHNIQUE", "DMC", "ADMIN"];

decompteDocumentsRouter.post("/:documentId/valider", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    if (!ROLES_CONTROLE.includes(req.user.role)) {
      throw new ApiError(403, "Seules la Mission de contrôle et la Direction Technique valident les pièces");
    }
    const decompteId = req.params.id;
    await assertAcces(req, decompteId);

    const document = await prisma.document.findFirst({ where: { id: req.params.documentId, decompteId, estArchive: false } });
    if (!document) throw new ApiError(404, "Pièce introuvable");

    const maj = await prisma.document.update({
      where: { id: document.id },
      data: { statutValidation: "VALIDE", valideParId: req.user.id, valideAt: new Date(), motifRetour: null },
    });
    await synchroniserBordereau(decompteId);

    await logAudit({
      userId: req.user.id, action: "APPROVE", entityType: "DocumentDecompte", entityId: document.id,
      before: { statutValidation: document.statutValidation },
      after: { statutValidation: "VALIDE", type: document.type, nom: document.nom },
      ipAddress: req.ip,
    });

    res.json(maj);
  } catch (err) { next(err); }
});

decompteDocumentsRouter.post("/:documentId/retourner", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    if (!ROLES_CONTROLE.includes(req.user.role)) {
      throw new ApiError(403, "Seules la Mission de contrôle et la Direction Technique retournent les pièces");
    }
    const decompteId = req.params.id;
    await assertAcces(req, decompteId);

    const { motif } = z.object({ motif: z.string().min(10, "Le motif doit expliquer ce qui est à corriger (10 caractères minimum)") }).parse(req.body);

    const document = await prisma.document.findFirst({ where: { id: req.params.documentId, decompteId, estArchive: false } });
    if (!document) throw new ApiError(404, "Pièce introuvable");

    const maj = await prisma.document.update({
      where: { id: document.id },
      data: { statutValidation: "RETOURNE", valideParId: req.user.id, valideAt: new Date(), motifRetour: motif },
    });
    // La pièce retournée ne compte plus comme fournie.
    await synchroniserBordereau(decompteId);

    await logAudit({
      userId: req.user.id, action: "REJECT", entityType: "DocumentDecompte", entityId: document.id,
      before: { statutValidation: document.statutValidation },
      after: { statutValidation: "RETOURNE", motif, type: document.type },
      ipAddress: req.ip,
    });

    res.json(maj);
  } catch (err) { next(err); }
});
