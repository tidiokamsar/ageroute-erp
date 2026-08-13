/** Complément : remplir les modules vides, connectés aux données existantes. */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const j = (n: number) => new Date(Date.now() - n * 86400000);
const step = async (nom: string, fn: () => Promise<unknown>) => { try { await fn(); console.log("OK", nom); } catch (e: any) { console.log("ÉCHEC", nom, "→", (e.message ?? "").split("\n").slice(-3).join(" ").slice(0, 160)); } };

async function main() {
  const m1 = await prisma.marche.findUnique({ where: { reference: "MCHE-2024-001" } });
  const m2 = await prisma.marche.findUnique({ where: { reference: "MCHE-2024-008" } });
  const m3 = await prisma.marche.findUnique({ where: { reference: "MCHE-2025-002" } });
  const m4 = await prisma.marche.findUnique({ where: { reference: "MCHE-2025-011" } });
  const decs = await prisma.decompte.findMany({ select: { id: true, reference: true, statut: true, netAPayer: true, marcheId: true, entrepriseId: true } });
  const byRef = (r: string) => decs.find((d) => d.reference === r)!;
  const ents = await prisma.entreprise.findMany();

  await step("paiements (2 décomptes payés)", async () => {
    for (const d of decs.filter((x) => x.statut === "PAYE"))
      await prisma.paiement.create({ data: { decompteId: d.id, montantGnf: d.netAPayer, statut: "EXECUTE", dateOrdre: j(125), dateExecution: j(120), reference: `VIR-2026-${d.reference.slice(-5)}`, banque: "BCRG", typeCircuit: "BUDGET", refDntcp: `DNTCP-${d.reference.slice(-4)}`, refBcrg: `BCRG-${d.reference.slice(-4)}` } });
  });

  await step("lots (m1)", async () => {
    await prisma.lot.create({ data: { marcheId: m1!.id, numero: "LOT-1", designation: "Section PK0–PK17", montantGnf: 68_000_000_000n } });
    await prisma.lot.create({ data: { marcheId: m1!.id, numero: "LOT-2", designation: "Section PK17–PK34", montantGnf: 58_000_000_000n } });
  });

  await step("lignes des décomptes soumis", async () => {
    const L: [string, [string, string, string, number, number][]][] = [
      ["MCHE-2024-001-DP-03", [["R-003", "Revêtement PK6-PK11", "m2", 65000, 85000], ["O-004", "Assainissement PK8", "ml", 1200, 350000]]],
      ["MCHE-2025-002-DP-01", [["V-001", "Pavage voirie Ratoma", "m2", 42000, 95000]]],
    ];
    for (const [ref, lignes] of L) {
      const d = byRef(ref);
      for (const [c, des, u, q, pu] of lignes)
        await prisma.decompteLigne.create({ data: { decompteId: d.id, codeArticle: c, designation: des, unite: u, quantiteContrat: q * 3, quantiteCourante: q, quantiteCumulee: q, prixUnitaire: BigInt(pu), montantBrut: BigInt(q * pu) } as any });
    }
  });

  await step("contacts entreprises", async () => {
    for (const e of ents)
      await prisma.contactEntreprise.create({ data: { entrepriseId: e.id, nom: "Directeur de projet", prenom: e.sigle ?? "", fonction: "Directeur de projet", telephone: "+224 621 11 22 33", email: e.email ?? "", principal: true } });
  });

  await step("documents entreprises (attestations)", async () => {
    for (const e of ents) {
      await prisma.documentEntreprise.create({ data: { entrepriseId: e.id, type: "ATTESTATION_FISCALE" as any, libelle: "Attestation fiscale DGI", numero: `DGI-${e.nif?.slice(-4)}`, url: "/api/uploads/files/seed-pv-opr.pdf", dateEmission: j(180), dateExpiration: e.attestationFiscaleExpire, valide: e.statut === "CONFORME" } });
      await prisma.documentEntreprise.create({ data: { entrepriseId: e.id, type: "REGISTRE_COMMERCE" as any, libelle: "RCCM", numero: e.rccm ?? "", url: "/api/uploads/files/seed-attachement-signe.pdf", dateEmission: j(900), valide: true } });
    }
  });

  await step("liens portail (CompanyUser + CompanyMarket)", async () => {
    const pu = await prisma.user.findMany({ where: { role: "ENTREPRISE" as any, entrepriseId: { not: null } } });
    for (const u of pu) {
      await prisma.companyUser.create({ data: { entrepriseId: u.entrepriseId!, userId: u.id, roleType: "ADMIN", isPrimary: true, canSubmitDocuments: true, canDeposerDecompte: true } }).catch(() => {});
      const mm = [m1, m2, m3, m4].find((x) => x?.entrepriseId === u.entrepriseId);
      if (mm) await prisma.companyMarket.create({ data: { entrepriseId: u.entrepriseId!, marcheId: mm.id } as any }).catch(() => {});
    }
  });

  await step("historique statuts marchés", async () => {
    for (const mm of [m1, m2, m3]) {
      await prisma.historiqueStatutMarche.create({ data: { marcheId: mm!.id, statutAvant: "SIGNE", statutApres: "EN_EXECUTION", commentaire: "OS de démarrage notifié", auteur: "seed" } as any });
    }
  });

  await step("financements (source + enveloppe + allocations)", async () => {
    const fs1 = await (prisma as any).fundingSource.create({ data: { code: "BAD-PCBR-2024", label: "Convention BAD — PCBR", type: "BAILLEUR", currency: "GNF", totalAmount: 200_000_000_000n, statut: "active" } });
    const env1 = await prisma.fundingEnvelope.create({ data: { fundingSourceId: fs1.id, envelopeCode: "BAD-ENV-TRAVAUX", label: "Enveloppe Travaux RN1", totalAmount: 150_000_000_000n, allocatedAmount: 136_080_000_000n, consumedAmount: 19_600_000_000n, availableAmount: 13_920_000_000n, startDate: j(400), statut: "active" } });
    await prisma.fundingAllocation.create({ data: { fundingEnvelopeId: env1.id, marcheId: m1!.id, projetId: m1!.projetId, allocationAmount: 136_080_000_000n, committedAmount: 136_080_000_000n, consumedAmount: 19_600_000_000n, allocationReason: "Marché RN1 Conakry–Coyah" } });
    const fs2 = await (prisma as any).fundingSource.create({ data: { code: "FER-2025", label: "Fonds d'Entretien Routier 2025", type: "FER", currency: "GNF", totalAmount: 80_000_000_000n, statut: "active" } });
    const env2 = await prisma.fundingEnvelope.create({ data: { fundingSourceId: fs2.id, envelopeCode: "FER-ENV-RN3", label: "Enveloppe Entretien RN3", totalAmount: 45_000_000_000n, allocatedAmount: 38_400_000_000n, consumedAmount: 10_560_000_000n, availableAmount: 6_600_000_000n, startDate: j(300), statut: "active" } });
    await prisma.fundingAllocation.create({ data: { fundingEnvelopeId: env2.id, marcheId: m2!.id, projetId: m2!.projetId, allocationAmount: 38_400_000_000n, committedAmount: 38_400_000_000n, consumedAmount: 10_560_000_000n, allocationReason: "Marché entretien RN3" } });
  });

  await step("pièces obligatoires + GED des décomptes traités", async () => {
    const ok = { decompteSigné: true, attachements: true, facture: true, rapportAvancement: true, photosChantier: true, pvContradictoire: true };
    for (const d of decs.filter((x) => ["PAYE", "EN_CIRCUIT_FINANCIER", "VISA_DAF"].includes(x.statut)))
      await prisma.decompte.update({ where: { id: d.id }, data: { piecesObligatoires: ok as any } });
    const d11 = byRef("MCHE-2024-001-DP-01");
    await prisma.document.create({ data: { decompteId: d11.id, type: "PV", nom: "Attachement contradictoire signé", cheminFichier: "/api/uploads/files/seed-attachement-signe.pdf", mimeType: "application/pdf", uploadePar: "seed" } });
    await prisma.document.create({ data: { decompteId: d11.id, type: "FACTURE", nom: "Facture SOGEA n° F-2026-118", cheminFichier: "/api/uploads/files/seed-pv-opr.pdf", mimeType: "application/pdf", uploadePar: "seed" } });
  });

  console.log("COMPLÉMENT TERMINÉ");
}
main().finally(() => prisma.$disconnect());
