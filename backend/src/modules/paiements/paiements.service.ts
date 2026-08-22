import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/error.middleware";
import {
  calculerPositionPaiement,
  evaluerConfirmation,
  verifierNouvelOrdre,
} from "./paiements.regles";

interface CreerOrdrePaiementInput {
  decompteId: string;
  montantGnf: bigint;
  dateOrdre?: Date;
  dateExecution?: Date;
  reference: string;
  banque?: string;
  observations?: string;
}

interface ConfirmerPaiementInput {
  montantReelGnf: bigint;
  dateReelleTransfert: Date;
  observations?: string;
}

interface ActeurPaiement {
  id: string;
  email: string;
}

async function verrouillerDecompte(tx: Prisma.TransactionClient, decompteId: string): Promise<void> {
  const lignes = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "decomptes"
    WHERE "id" = ${decompteId} AND "deletedAt" IS NULL
    FOR UPDATE
  `;
  if (lignes.length === 0) throw new ApiError(404, "Décompte introuvable");
}

async function verifierCircuitTermine(tx: Prisma.TransactionClient, decompteId: string): Promise<void> {
  const circuit = await tx.circuitFinancier.findUnique({
    where: { decompteId },
    select: { statut: true },
  });
  if (!circuit || circuit.statut !== "TERMINE") {
    throw new ApiError(400, "Le circuit financier doit être terminé avant tout ordonnancement ou paiement");
  }
}

export async function creerOrdrePaiement(input: CreerOrdrePaiementInput, acteur: ActeurPaiement) {
  return prisma.$transaction(async (tx) => {
    await verrouillerDecompte(tx, input.decompteId);

    const decompte = await tx.decompte.findFirst({
      where: { id: input.decompteId, deletedAt: null },
      select: { id: true, statut: true, netAPayer: true },
    });
    if (!decompte) throw new ApiError(404, "Décompte introuvable");
    if (decompte.statut !== "ORDONNANCE") {
      throw new ApiError(400, `Le décompte est en statut "${decompte.statut}" — il doit être ORDONNANCE avant paiement`);
    }
    await verifierCircuitTermine(tx, input.decompteId);

    const memeReference = await tx.paiement.findFirst({
      where: { decompteId: input.decompteId, reference: input.reference, deletedAt: null },
    });
    if (memeReference) {
      if (memeReference.montantGnf === input.montantGnf) return memeReference;
      throw new ApiError(409, "Cette référence de paiement existe déjà avec un montant différent");
    }

    const paiementsActifs = await tx.paiement.findMany({
      where: { decompteId: input.decompteId, deletedAt: null, statut: { not: "REJETE" } },
      select: { montantGnf: true, montantReelGnf: true, confirmeAt: true },
    });
    const position = calculerPositionPaiement(paiementsActifs);
    const controle = verifierNouvelOrdre({
      netAPayerGnf: decompte.netAPayer,
      position,
      montantGnf: input.montantGnf,
    });
    if (!controle.autorise) throw new ApiError(400, controle.motif!);

    const paiement = await tx.paiement.create({ data: input });
    await tx.auditLog.create({
      data: {
        userId: acteur.id,
        action: "UPDATE",
        entityType: "Paiement",
        entityId: paiement.id,
        after: {
          action: "ORDONNANCEMENT",
          montantGnf: input.montantGnf.toString(),
          engagementApresGnf: controle.engagementApresGnf.toString(),
          reference: input.reference,
        },
      },
    });
    return paiement;
  });
}

export async function confirmerPaiementBcrg(
  paiementId: string,
  input: ConfirmerPaiementInput,
  acteur: ActeurPaiement,
) {
  return prisma.$transaction(async (tx) => {
    const rattachement = await tx.paiement.findFirst({
      where: { id: paiementId, deletedAt: null },
      select: { decompteId: true },
    });
    if (!rattachement) throw new ApiError(404, "Paiement introuvable");

    await verrouillerDecompte(tx, rattachement.decompteId);

    // Relire après le verrou : une confirmation concurrente a pu terminer avant nous.
    const paiement = await tx.paiement.findFirst({ where: { id: paiementId, deletedAt: null } });
    if (!paiement) throw new ApiError(404, "Paiement introuvable");
    if (paiement.confirmeAt) throw new ApiError(409, "Ce paiement a déjà été confirmé par la BCRG");
    if (paiement.statut === "REJETE") throw new ApiError(400, "Un paiement rejeté ne peut pas être confirmé");

    const decompte = await tx.decompte.findFirst({
      where: { id: paiement.decompteId, deletedAt: null },
      select: { id: true, statut: true, netAPayer: true },
    });
    if (!decompte) throw new ApiError(404, "Décompte introuvable");
    if (decompte.statut !== "ORDONNANCE") {
      throw new ApiError(400, `Le décompte est en statut "${decompte.statut}" — confirmation bancaire impossible`);
    }
    await verifierCircuitTermine(tx, paiement.decompteId);

    const ecart = input.montantReelGnf > paiement.montantGnf
      ? input.montantReelGnf - paiement.montantGnf
      : paiement.montantGnf - input.montantReelGnf;
    const seuilTolerance = paiement.montantGnf / 100n;
    if (ecart > seuilTolerance) {
      throw new ApiError(
        400,
        `Écart trop important : montant réel ${input.montantReelGnf} GNF vs ordonnancé ${paiement.montantGnf} GNF (écart ${ecart} GNF > 1%) — à arbitrer avec la DAF`,
      );
    }

    const autresPaiements = await tx.paiement.findMany({
      where: {
        decompteId: paiement.decompteId,
        id: { not: paiement.id },
        deletedAt: null,
        statut: { not: "REJETE" },
      },
      select: { montantGnf: true, montantReelGnf: true, confirmeAt: true },
    });
    const positionAutresPaiements = calculerPositionPaiement(autresPaiements);
    const controle = evaluerConfirmation({
      netAPayerGnf: decompte.netAPayer,
      positionAutresPaiements,
      montantReelGnf: input.montantReelGnf,
    });
    if (!controle.autorise) throw new ApiError(400, controle.motif!);

    const confirmeAt = new Date();
    const updated = await tx.paiement.update({
      where: { id: paiement.id },
      data: {
        statut: "EXECUTE",
        montantReelGnf: input.montantReelGnf,
        dateReelleTransfert: input.dateReelleTransfert,
        dateExecution: input.dateReelleTransfert,
        confirmePar: acteur.email,
        confirmeAt,
        observations: input.observations ?? paiement.observations,
      },
    });

    if (controle.decomptePaye) {
      await tx.decompte.update({
        where: { id: paiement.decompteId },
        data: { statut: "PAYE", datePaiement: input.dateReelleTransfert },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: acteur.id,
        action: "CONFIRM_BCRG",
        entityType: "Paiement",
        entityId: paiement.id,
        after: {
          montantReelGnf: input.montantReelGnf.toString(),
          dateReelleTransfert: input.dateReelleTransfert.toISOString(),
          confirmePar: acteur.email,
          cumulConfirmeGnf: controle.confirmeApresGnf.toString(),
          engagementApresGnf: controle.engagementApresGnf.toString(),
          decomptePaye: controle.decomptePaye,
        },
      },
    });

    return {
      paiement: updated,
      cumulConfirmeGnf: controle.confirmeApresGnf,
      decomptePaye: controle.decomptePaye,
    };
  });
}
