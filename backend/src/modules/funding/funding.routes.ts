/**
 * Module Gestion des Financements
 * Sources de financement → Enveloppes → Affectations (projet/marché/décompte) → Consommations
 * Couvre : traçabilité multi-bailleurs, suivi budgétaire par source, reporting de conformité
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { checkModuleAccess } from "../../middleware/moduleAccess.middleware";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/error.middleware";
import { z } from "zod";

export const fundingRouter = Router();
// Ce routeur définit des chemins de premier niveau (/fundings, /funding-documents,
// /funding-envelopes) : il se monte donc à la racine /api, pas sous un préfixe.
// Le contrôle d'accès au module est porté ici plutôt qu'au montage, pour ne pas
// s'appliquer aux routes voisines.
fundingRouter.use(requireAuth, checkModuleAccess("financements"));

const WRITE_ROLES = ["ADMIN", "DAF", "DG"] as const;

// ─── Helpers ───────────────────────────────────────────────────────────────

async function recalcEnvelope(envelopeId: string) {
  const allocations = await prisma.fundingAllocation.findMany({
    where: { fundingEnvelopeId: envelopeId, statut: { not: "rejected" } },
  });
  const allocatedAmount = allocations.reduce((s, a) => s + a.allocationAmount, 0n);
  const consumedAmount = allocations.reduce((s, a) => s + a.consumedAmount, 0n);
  const envelope = await prisma.fundingEnvelope.findUnique({ where: { id: envelopeId } });
  if (!envelope) return;
  const availableAmount = envelope.totalAmount - allocatedAmount;
  let statut = envelope.statut;
  if (statut === "active" || statut === "partially_consumed" || statut === "exhausted") {
    statut = consumedAmount >= envelope.totalAmount && envelope.totalAmount > 0n ? "exhausted"
      : consumedAmount > 0n ? "partially_consumed" : "active";
  }
  await prisma.fundingEnvelope.update({
    where: { id: envelopeId },
    data: { allocatedAmount, consumedAmount, availableAmount, statut },
  });
}

async function logStatusChange(entityType: string, entityId: string, oldStatus: string, newStatus: string, userId: string, commentaire?: string) {
  await prisma.fundingStatusHistory.create({
    data: { entityType, entityId, oldStatus, newStatus, changedBy: userId, commentaire },
  });
}

// ─── Sources de financement ────────────────────────────────────────────────

fundingRouter.get("/fundings", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { statut, search } = req.query;
    const where: any = {};
    if (statut) where.statut = statut;
    if (search) where.OR = [
      { sourceCode: { contains: String(search), mode: "insensitive" } },
      { nom: { contains: String(search), mode: "insensitive" } },
      { donorName: { contains: String(search), mode: "insensitive" } },
    ];
    const sources = await prisma.fundingSource.findMany({
      where,
      include: {
        envelopes: { select: { totalAmount: true, allocatedAmount: true, consumedAmount: true, availableAmount: true } },
        _count: { select: { envelopes: true, documents: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const result = sources.map(s => ({
      ...s,
      totalAmount: s.envelopes.reduce((sum, e) => sum + e.totalAmount, 0n),
      allocatedAmount: s.envelopes.reduce((sum, e) => sum + e.allocatedAmount, 0n),
      consumedAmount: s.envelopes.reduce((sum, e) => sum + e.consumedAmount, 0n),
      availableAmount: s.envelopes.reduce((sum, e) => sum + e.availableAmount, 0n),
    }));
    res.json(result);
  } catch (err) { next(err); }
});

fundingRouter.post("/fundings", requireRole(...WRITE_ROLES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const body = z.object({
      sourceCode: z.string().min(2),
      sourceType: z.enum(["ETAT", "BAILLEUR", "BANQUE", "FONDS_INTERNE", "CONTREPARTIE", "DON"]),
      nom: z.string().min(2),
      donorName: z.string().optional(),
      currencyCode: z.string().default("GNF"),
    }).parse(req.body);

    const existing = await prisma.fundingSource.findUnique({ where: { sourceCode: body.sourceCode } });
    if (existing) throw new ApiError(409, "Code source déjà utilisé");

    const source = await prisma.fundingSource.create({
      data: { ...body, createdBy: req.user.id },
    });
    res.status(201).json(source);
  } catch (err) { next(err); }
});

fundingRouter.get("/fundings/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const source = await prisma.fundingSource.findUnique({
      where: { id: req.params.id },
      include: {
        envelopes: { orderBy: { createdAt: "desc" } },
        documents: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!source) throw new ApiError(404, "Source de financement introuvable");
    res.json(source);
  } catch (err) { next(err); }
});

fundingRouter.patch("/fundings/:id", requireRole(...WRITE_ROLES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const body = z.object({
      nom: z.string().optional(),
      donorName: z.string().optional(),
      statut: z.enum(["draft", "pending_approval", "approved", "active", "partially_consumed", "exhausted", "suspended", "closed", "archived"]).optional(),
      commentaire: z.string().optional(),
    }).parse(req.body);

    const existing = await prisma.fundingSource.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new ApiError(404, "Source introuvable");

    const { commentaire, ...data } = body;
    const updated = await prisma.fundingSource.update({
      where: { id: req.params.id },
      data: { ...data, updatedBy: req.user.id },
    });

    if (body.statut && body.statut !== existing.statut) {
      await logStatusChange("FUNDING_SOURCE", req.params.id, existing.statut, body.statut, req.user.id, commentaire);
    }
    res.json(updated);
  } catch (err) { next(err); }
});

// ─── Documents de financement ──────────────────────────────────────────────

fundingRouter.post("/fundings/:id/documents", requireRole(...WRITE_ROLES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      documentType: z.enum(["CONVENTION", "AVENANT", "RAPPORT", "JUSTIFICATIF"]),
      documentNumber: z.string().optional(),
      cheminFichier: z.string().optional(),
      issueDate: z.coerce.date().optional(),
      expiryDate: z.coerce.date().optional(),
    }).parse(req.body);

    const source = await prisma.fundingSource.findUnique({ where: { id: req.params.id } });
    if (!source) throw new ApiError(404, "Source introuvable");

    const doc = await prisma.fundingDocument.create({
      data: { fundingSourceId: req.params.id, ...body },
    });
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

fundingRouter.patch("/funding-documents/:id/verify", requireRole(...WRITE_ROLES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const body = z.object({
      validationStatus: z.enum(["valid", "expired", "rejected"]),
    }).parse(req.body);
    const doc = await prisma.fundingDocument.update({
      where: { id: req.params.id },
      data: { validationStatus: body.validationStatus, verifiedBy: req.user.id, verifiedAt: new Date() },
    });
    res.json(doc);
  } catch (err) { next(err); }
});

// ─── Enveloppes ─────────────────────────────────────────────────────────────

fundingRouter.post("/fundings/:id/envelopes", requireRole(...WRITE_ROLES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      envelopeCode: z.string().min(2),
      label: z.string().min(2),
      totalAmount: z.number().nonnegative(),
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional(),
    }).parse(req.body);

    if (body.startDate && body.endDate && body.endDate < body.startDate) {
      throw new ApiError(400, "La date de fin doit être postérieure à la date de début");
    }

    const source = await prisma.fundingSource.findUnique({ where: { id: req.params.id } });
    if (!source) throw new ApiError(404, "Source introuvable");

    const existing = await prisma.fundingEnvelope.findUnique({ where: { envelopeCode: body.envelopeCode } });
    if (existing) throw new ApiError(409, "Code enveloppe déjà utilisé");

    const totalAmount = BigInt(Math.round(body.totalAmount));
    const envelope = await prisma.fundingEnvelope.create({
      data: {
        fundingSourceId: req.params.id,
        envelopeCode: body.envelopeCode,
        label: body.label,
        totalAmount,
        availableAmount: totalAmount,
        startDate: body.startDate,
        endDate: body.endDate,
      },
    });
    res.status(201).json(envelope);
  } catch (err) { next(err); }
});

fundingRouter.get("/funding-envelopes/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const envelope = await prisma.fundingEnvelope.findUnique({
      where: { id: req.params.id },
      include: {
        fundingSource: { select: { sourceCode: true, nom: true, sourceType: true, currencyCode: true } },
        allocations: {
          orderBy: { createdAt: "desc" },
          include: {
            projet: { select: { code: true, intitule: true } },
            marche: { select: { reference: true, intitule: true } },
            decompte: { select: { reference: true } },
          },
        },
      },
    });
    if (!envelope) throw new ApiError(404, "Enveloppe introuvable");
    res.json(envelope);
  } catch (err) { next(err); }
});

fundingRouter.patch("/funding-envelopes/:id", requireRole(...WRITE_ROLES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const body = z.object({
      statut: z.enum(["draft", "pending_approval", "approved", "active", "partially_consumed", "exhausted", "suspended", "closed", "archived"]).optional(),
      commentaire: z.string().optional(),
    }).parse(req.body);

    const existing = await prisma.fundingEnvelope.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new ApiError(404, "Enveloppe introuvable");

    if (body.statut === "closed" && existing.availableAmount > 0n && !body.commentaire) {
      throw new ApiError(400, "Justification obligatoire pour clôturer une enveloppe avec solde restant");
    }

    const { commentaire, ...data } = body;
    const updated = await prisma.fundingEnvelope.update({ where: { id: req.params.id }, data });

    if (body.statut && body.statut !== existing.statut) {
      await logStatusChange("FUNDING_ENVELOPE", req.params.id, existing.statut, body.statut, req.user.id, commentaire);
    }
    res.json(updated);
  } catch (err) { next(err); }
});

// ─── Affectations ───────────────────────────────────────────────────────────

fundingRouter.post("/funding-envelopes/:id/allocations", requireRole(...WRITE_ROLES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      projetId: z.string().optional(),
      marcheId: z.string().optional(),
      decompteId: z.string().optional(),
      allocationAmount: z.number().positive(),
      allocationReason: z.string().optional(),
    }).parse(req.body);

    const envelope = await prisma.fundingEnvelope.findUnique({ where: { id: req.params.id } });
    if (!envelope) throw new ApiError(404, "Enveloppe introuvable");

    if (envelope.statut === "closed" || envelope.statut === "archived" || envelope.statut === "suspended") {
      throw new ApiError(400, "Enveloppe non disponible pour affectation (statut: " + envelope.statut + ")");
    }

    if (body.projetId) {
      const projet = await prisma.projet.findUnique({ where: { id: body.projetId } });
      if (projet?.statut === "CLOS") throw new ApiError(400, "Affectation impossible : projet clos");
    }

    const allocationAmount = BigInt(Math.round(body.allocationAmount));
    const newAllocatedTotal = envelope.allocatedAmount + allocationAmount;
    if (newAllocatedTotal > envelope.totalAmount) {
      throw new ApiError(400, "Le montant affecté dépasserait le total de l'enveloppe (disponible: " + envelope.availableAmount.toString() + ")");
    }

    const allocation = await prisma.fundingAllocation.create({
      data: {
        fundingEnvelopeId: req.params.id,
        projetId: body.projetId,
        marcheId: body.marcheId,
        decompteId: body.decompteId,
        allocationAmount,
        allocationReason: body.allocationReason,
        statut: "approved",
      },
    });

    await recalcEnvelope(req.params.id);
    res.status(201).json(allocation);
  } catch (err) { next(err); }
});

fundingRouter.get("/funding-allocations/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const allocation = await prisma.fundingAllocation.findUnique({
      where: { id: req.params.id },
      include: {
        fundingEnvelope: { include: { fundingSource: { select: { nom: true, sourceCode: true } } } },
        consumptions: { orderBy: { consumedAt: "desc" } },
        projet: { select: { code: true, intitule: true } },
        marche: { select: { reference: true, intitule: true } },
        decompte: { select: { reference: true } },
      },
    });
    if (!allocation) throw new ApiError(404, "Affectation introuvable");
    res.json(allocation);
  } catch (err) { next(err); }
});

// ─── Consommations ──────────────────────────────────────────────────────────

fundingRouter.post("/funding-allocations/:id/consume", requireRole(...WRITE_ROLES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      entityType: z.enum(["DECOMPTE", "MARCHE", "AUTRE"]),
      entityId: z.string(),
      montant: z.number().positive(),
      consumptionType: z.enum(["ENGAGEMENT", "LIQUIDATION", "PAIEMENT"]),
    }).parse(req.body);

    const allocation = await prisma.fundingAllocation.findUnique({
      where: { id: req.params.id },
      include: { fundingEnvelope: true },
    });
    if (!allocation) throw new ApiError(404, "Affectation introuvable");

    if (allocation.fundingEnvelope.statut !== "active" && allocation.fundingEnvelope.statut !== "partially_consumed") {
      throw new ApiError(400, "Enveloppe non active, consommation refusée");
    }

    const montant = BigInt(Math.round(body.montant));
    const disponibleSurAllocation = allocation.allocationAmount - allocation.consumedAmount;
    if (montant > disponibleSurAllocation) {
      throw new ApiError(400, "Montant supérieur au disponible sur l'affectation (" + disponibleSurAllocation.toString() + ")");
    }

    const consumption = await prisma.$transaction(async (tx) => {
      const c = await tx.fundingConsumption.create({
        data: {
          fundingAllocationId: req.params.id,
          entityType: body.entityType,
          entityId: body.entityId,
          montant,
          consumptionType: body.consumptionType,
        },
      });
      await tx.fundingAllocation.update({
        where: { id: req.params.id },
        data: { consumedAmount: allocation.consumedAmount + montant },
      });
      return c;
    });

    await recalcEnvelope(allocation.fundingEnvelopeId);
    res.status(201).json(consumption);
  } catch (err) { next(err); }
});

// Consommation automatique appelée depuis le workflow décompte lors de la certification
export async function autoConsumeFromDecompte(decompteId: string, montantGnf: bigint) {
  const allocation = await prisma.fundingAllocation.findFirst({
    where: { decompteId, statut: { not: "rejected" } },
    include: { fundingEnvelope: true },
  });
  if (!allocation) return null;
  if (allocation.fundingEnvelope.statut !== "active" && allocation.fundingEnvelope.statut !== "partially_consumed") return null;

  const disponible = allocation.allocationAmount - allocation.consumedAmount;
  const montant = montantGnf > disponible ? disponible : montantGnf;
  if (montant <= 0n) return null;

  const consumption = await prisma.$transaction(async (tx) => {
    const c = await tx.fundingConsumption.create({
      data: {
        fundingAllocationId: allocation.id,
        entityType: "DECOMPTE",
        entityId: decompteId,
        montant,
        consumptionType: "PAIEMENT",
      },
    });
    await tx.fundingAllocation.update({
      where: { id: allocation.id },
      data: { consumedAmount: allocation.consumedAmount + montant },
    });
    return c;
  });

  await recalcEnvelope(allocation.fundingEnvelopeId);
  return consumption;
}

// ─── Audit trail ─────────────────────────────────────────────────────────────

fundingRouter.get("/fundings/:id/audit-trail", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const envelopes = await prisma.fundingEnvelope.findMany({ where: { fundingSourceId: req.params.id }, select: { id: true } });
    const envelopeIds = envelopes.map(e => e.id);
    const allocations = await prisma.fundingAllocation.findMany({ where: { fundingEnvelopeId: { in: envelopeIds } }, select: { id: true } });
    const allocationIds = allocations.map(a => a.id);

    const history = await prisma.fundingStatusHistory.findMany({
      where: {
        OR: [
          { entityType: "FUNDING_SOURCE", entityId: req.params.id },
          { entityType: "FUNDING_ENVELOPE", entityId: { in: envelopeIds } },
          { entityType: "FUNDING_ALLOCATION", entityId: { in: allocationIds } },
        ],
      },
      orderBy: { changedAt: "desc" },
      take: 50,
    });

    const consumptions = await prisma.fundingConsumption.findMany({
      where: { fundingAllocationId: { in: allocationIds } },
      orderBy: { consumedAt: "desc" },
      take: 50,
    });

    const events = [
      ...history.map(h => ({ type: "STATUT", entityType: h.entityType, date: h.changedAt, desc: h.oldStatus + " -> " + h.newStatus, commentaire: h.commentaire })),
      ...consumptions.map(c => ({ type: "CONSOMMATION", entityType: c.entityType, date: c.consumedAt, desc: c.consumptionType + " : " + c.montant.toString() + " GNF" })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json(events);
  } catch (err) { next(err); }
});

// ─── Documents expirant bientôt (alerte conformité) ───────────────────────────

fundingRouter.get("/fundings/alerts/expiring-documents", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);
    const docs = await prisma.fundingDocument.findMany({
      where: {
        expiryDate: { lte: in30Days },
        validationStatus: { not: "rejected" },
      },
      include: { fundingSource: { select: { sourceCode: true, nom: true } } },
      orderBy: { expiryDate: "asc" },
    });
    res.json(docs);
  } catch (err) { next(err); }
});
