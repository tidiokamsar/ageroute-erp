import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const j = (n: number) => new Date(Date.now() - n * 86400000);
async function main() {
  const m1 = await prisma.marche.findUnique({ where: { reference: "MCHE-2024-001" } });
  const m2 = await prisma.marche.findUnique({ where: { reference: "MCHE-2024-008" } });
  const m3 = await prisma.marche.findUnique({ where: { reference: "MCHE-2025-002" } });
  for (const mm of [m1, m2, m3])
    await prisma.historiqueStatutMarche.create({ data: { marcheId: mm!.id, statutAvant: "SIGNE", statutApres: "EN_EXECUTION", motif: "OS de démarrage notifié", userEmail: "seed@ageroute.gov.gn" } as any });
  console.log("OK historique");
  const fs1 = await (prisma as any).fundingSource.create({ data: { sourceCode: "BAD-PCBR-2024", sourceType: "BAILLEUR", nom: "Convention BAD — PCBR", donorName: "Banque Africaine de Développement", currencyCode: "GNF", statut: "active", createdBy: "seed" } });
  const env1 = await prisma.fundingEnvelope.create({ data: { fundingSourceId: fs1.id, envelopeCode: "BAD-ENV-TRAVAUX", label: "Enveloppe Travaux RN1", totalAmount: 150_000_000_000n, allocatedAmount: 136_080_000_000n, consumedAmount: 19_600_000_000n, availableAmount: 13_920_000_000n, startDate: j(400), statut: "active" } });
  await prisma.fundingAllocation.create({ data: { fundingEnvelopeId: env1.id, marcheId: m1!.id, projetId: m1!.projetId, allocationAmount: 136_080_000_000n, committedAmount: 136_080_000_000n, consumedAmount: 19_600_000_000n, allocationReason: "Marché RN1 Conakry–Coyah" } });
  const fs2 = await (prisma as any).fundingSource.create({ data: { sourceCode: "FER-2025", sourceType: "FONDS_INTERNE", nom: "Fonds d'Entretien Routier 2025", currencyCode: "GNF", statut: "active", createdBy: "seed" } });
  const env2 = await prisma.fundingEnvelope.create({ data: { fundingSourceId: fs2.id, envelopeCode: "FER-ENV-RN3", label: "Enveloppe Entretien RN3", totalAmount: 45_000_000_000n, allocatedAmount: 38_400_000_000n, consumedAmount: 10_560_000_000n, availableAmount: 6_600_000_000n, startDate: j(300), statut: "active" } });
  await prisma.fundingAllocation.create({ data: { fundingEnvelopeId: env2.id, marcheId: m2!.id, projetId: m2!.projetId, allocationAmount: 38_400_000_000n, committedAmount: 38_400_000_000n, consumedAmount: 10_560_000_000n, allocationReason: "Marché entretien RN3" } });
  console.log("OK financements");
}
main().finally(() => prisma.$disconnect());
