import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import { entrepriseIdOf } from "../../lib/scope";
import { z } from "zod";

export const paiementsRouter = Router();
paiementsRouter.use(requireAuth);

const schema = z.object({
  decompteId: z.string().uuid(),
  montantGnf: z.number().positive().transform((v) => BigInt(Math.round(v))),
  dateOrdre: z.coerce.date().optional(),
  dateExecution: z.coerce.date().optional(),
  reference: z.string().min(3), // F9 — référence de virement obligatoire pour rapprochement bancaire
  banque: z.string().optional(),
  observations: z.string().optional(),
});

paiementsRouter.get("/decompte/:decompteId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Isolation entreprise : les paiements d'un décompte d'autrui sont « introuvables »
    if (req.user?.role === "ENTREPRISE") {
      const dec = await prisma.decompte.findUnique({ where: { id: req.params.decompteId }, select: { entrepriseId: true } });
      if (!dec || dec.entrepriseId !== (await entrepriseIdOf(req.user.id))) {
        throw new ApiError(404, "Décompte introuvable");
      }
    }
    const paiements = await prisma.paiement.findMany({
      where: { decompteId: req.params.decompteId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    res.json(paiements);
  } catch (err) { next(err); }
});

paiementsRouter.post("/", requireRole("ADMIN", "DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const data = schema.parse(req.body);

    // F3 — statuts corrects : le décompte doit avoir terminé sa validation DG
    const decompte = await prisma.decompte.findFirst({ where: { id: data.decompteId, deletedAt: null } });
    if (!decompte) throw new ApiError(404, "Décompte introuvable");
    const statutsPayables = ["VALIDE", "VALIDE_DG", "EN_CIRCUIT_FINANCIER", "ORDONNANCE"];
    if (!statutsPayables.includes(decompte.statut)) {
      throw new ApiError(400, `Le décompte est en statut "${decompte.statut}" — il doit être validé (DG/circuit) avant paiement`);
    }

    // F1 — double paiement : cumul des paiements existants vs net à payer
    const paiementsExistants = await prisma.paiement.findMany({
      where: { decompteId: data.decompteId, deletedAt: null },
      select: { montantGnf: true },
    });
    const dejaPaye = paiementsExistants.reduce((s, p) => s + p.montantGnf, 0n);
    const nouveauCumul = dejaPaye + data.montantGnf;
    if (nouveauCumul > decompte.netAPayer) {
      throw new ApiError(400, `Dépassement : déjà payé ${dejaPaye} GNF + ${data.montantGnf} GNF = ${nouveauCumul} GNF > net à payer ${decompte.netAPayer} GNF`);
    }

    // F7 — circuit financier : vérifier qu'il a atteint l'étape "Paiement" ou est terminé
    const circuit = await prisma.circuitFinancier.findFirst({ where: { decompteId: data.decompteId } });
    if (circuit && circuit.statut === "EN_COURS") {
      const etapes = await prisma.circuitFinancierEtape.findMany({
        where: { circuitId: circuit.id },
        orderBy: { ordre: "asc" },
      });
      const etapeCourante = etapes[circuit.etapeActuelle];
      if (etapeCourante && etapeCourante.nom !== "Paiement") {
        throw new ApiError(400, `Circuit financier en cours (étape: ${etapeCourante.nom}) — le paiement n'est possible qu'à l'étape "Paiement"`);
      }
    }

    const p = await prisma.paiement.create({ data });

    // Mettre à jour le statut : PAYE seulement si le cumul atteint le net
    if (nouveauCumul === decompte.netAPayer) {
      await prisma.decompte.update({ where: { id: data.decompteId }, data: { statut: "PAYE", datePaiement: data.dateExecution ?? new Date() } });
    }

    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "Paiement", entityId: p.id, after: { montant: data.montantGnf.toString(), cumul: nouveauCumul.toString() } });
    res.status(201).json(p);
  } catch (err) { next(err); }
});

// ─── F8 — Confirmation bancaire BCRG : DAF prépare, BCRG confirme le virement réel ──
paiementsRouter.post("/:id/confirmation-bcrg", requireRole("ADMIN", "BCRG"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const body = z.object({
      montantReelGnf: z.number().positive().transform((v) => BigInt(Math.round(v))),
      dateReelleTransfert: z.coerce.date(),
      observations: z.string().optional(),
    }).parse(req.body);

    const paiement = await prisma.paiement.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!paiement) throw new ApiError(404, "Paiement introuvable");
    if (paiement.confirmeAt) throw new ApiError(400, "Ce paiement a déjà été confirmé par la BCRG");

    // Le montant réel ne peut pas être nul ni dévier de plus de 1% du montant ordonnancé
    const ecart = body.montantReelGnf > paiement.montantGnf
      ? body.montantReelGnf - paiement.montantGnf
      : paiement.montantGnf - body.montantReelGnf;
    const seuilTolerance = paiement.montantGnf / 100n; // 1%
    if (ecart > seuilTolerance) {
      throw new ApiError(400, `Écart trop important : montant réel ${body.montantReelGnf} GNF vs ordonnancé ${paiement.montantGnf} GNF (écart ${ecart} GNF > 1%) — à arbitrer avec la DAF`);
    }

    const updated = await prisma.paiement.update({
      where: { id: req.params.id },
      data: {
        montantReelGnf: body.montantReelGnf,
        dateReelleTransfert: body.dateReelleTransfert,
        confirmePar: req.user.email,
        confirmeAt: new Date(),
      },
    });

    // Si tous les paiements du décompte sont confirmés, marquer le décompte définitivement PAYE
    const tous = await prisma.paiement.findMany({ where: { decompteId: paiement.decompteId, deletedAt: null } });
    const tousConfirmes = tous.every((p) => p.confirmeAt !== null);
    if (tousConfirmes) {
      await prisma.decompte.update({
        where: { id: paiement.decompteId },
        data: { statut: "PAYE", datePaiement: body.dateReelleTransfert },
      });
    }

    await logAudit({
      userId: req.user.id, action: "CONFIRM_BCRG", entityType: "Paiement", entityId: req.params.id,
      after: { montantReel: body.montantReelGnf.toString(), dateReelle: body.dateReelleTransfert.toISOString(), confirmePar: req.user.email },
    });

    res.json({ ...updated, tousConfirmes, message: tousConfirmes ? "Virement confirmé — décompte définitivement payé" : "Virement confirmé" });
  } catch (err) { next(err); }
});

paiementsRouter.delete("/:id", requireRole("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    // §3.4 AGENTS.md — soft delete uniquement, avec trace de l'état avant suppression
    const before = await prisma.paiement.findUnique({ where: { id: req.params.id } });
    if (!before) throw new ApiError(404, "Paiement introuvable");
    await prisma.paiement.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    await logAudit({ userId: req.user.id, action: "DELETE", entityType: "Paiement", entityId: req.params.id, before });
    res.status(204).send();
  } catch (err) { next(err); }
});
