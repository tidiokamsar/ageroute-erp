import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import { assertEntrepriseConforme } from "../conformite/conformite.service";

// §4 CDC — champs marché complets pour affichage référentiel
const marcheInclude = {
  select: {
    id: true, reference: true, intitule: true, objet: true,
    financement: true, type: true,
    montantInitialGnf: true, montantActualiseGnf: true,
    tauxTva: true, tauxRetenueGarantie: true, tauxAvance: true,
    dateOs: true, delaiMois: true, regionNom: true,
    missionControle: true, directionTechnique: true,
    numContrat: true, bailleur: true, pkDebut: true, pkFin: true,
    entreprise: { select: { id: true, raisonSociale: true, statut: true } },
  },
};

const include = {
  marche: marcheInclude,
  lot: true,
  attachements: true,
  paiements: { where: { deletedAt: null } },
  entreprise: { select: { id: true, raisonSociale: true, statut: true, motifBlocage: true } },
};

// Calcul piloté par le registre de règles (A1-A7) — lot L1.1.
// remplace la copie inline flottante (qui renvoyait des noms de champs
// inconnus de Prisma : armp/ttc/precompteTva → erreur « Unknown arg »).
import { chargerRegles } from "../../lib/regles";
import { calcDecompteRegles, type CalcReglesInput } from "./decomptes.calc.regles";

async function calculerDecompte(data: CalcReglesInput, marche: { id: string; financement: string; type: string }) {
  const regles = await chargerRegles({ marcheId: marche.id, bailleur: marche.financement, typeMarche: marche.type });
  return calcDecompteRegles(data, regles);
}

// §10 CDC — contrôles automatiques
async function runControlesAuto(decompte: {
  id: string; marcheId: string; netAPayer: bigint; montantPeriodeHtGnf: bigint;
  tva: bigint; retenueGarantie: bigint; avanceRecuperee: bigint;
  marche: { montantInitialGnf: bigint; montantActualiseGnf: bigint | null; tauxTva: number; tauxRetenueGarantie: number; tauxAvance: number };
}) {
  // Montant déjà payé sur ce marché (autres décomptes soldés)
  const dejaPaye = await prisma.decompte.aggregate({
    where: { marcheId: decompte.marcheId, statut: { in: ["VALIDE","PAYE"] }, id: { not: decompte.id } },
    _sum: { netAPayer: true },
  });

  const montantContrat = decompte.marche.montantActualiseGnf ?? decompte.marche.montantInitialGnf;
  const totalDejaPaye  = dejaPaye._sum.netAPayer ?? 0n;
  const cumulAvecCourant = totalDejaPaye + decompte.netAPayer;
  const resteContrat   = montantContrat - totalDejaPaye;
  const tauxConsomme   = montantContrat > 0n ? Math.round(Number(cumulAvecCourant) * 100 / Number(montantContrat)) : 0;

  const alertes: { niveau: string; code: string; message: string }[] = [];

  // Dépassement montant
  if (cumulAvecCourant > montantContrat) {
    alertes.push({
      niveau: "CRITIQUE",
      code: "DEPASSEMENT_MONTANT",
      message: `Dépassement du contrat : cumul ${Number(cumulAvecCourant).toLocaleString("fr-GN")} GNF > contrat ${Number(montantContrat).toLocaleString("fr-GN")} GNF`,
    });
  } else if (tauxConsomme >= 95) {
    alertes.push({
      niveau: "AVERTISSEMENT",
      code: "CONSOMMATION_ELEVEE",
      message: `Consommation à ${tauxConsomme}% du contrat — reste ${Number(resteContrat).toLocaleString("fr-GN")} GNF`,
    });
  }

  // TVA
  const tvaTh = BigInt(Math.round(Number(decompte.montantPeriodeHtGnf) * decompte.marche.tauxTva / 100));
  if (Math.abs(Number(decompte.tva) - Number(tvaTh)) > 1000) {
    alertes.push({
      niveau: "ERREUR",
      code: "TVA_INCORRECTE",
      message: `TVA incorrecte : calculée ${Number(decompte.tva).toLocaleString("fr-GN")} GNF, attendu ${Number(tvaTh).toLocaleString("fr-GN")} GNF (taux ${decompte.marche.tauxTva}%)`,
    });
  }

  // Retenue de garantie — modèle AGEROUTE : appliquée sur TTC (HT + TVA + ARMP)
  const ht   = Number(decompte.montantPeriodeHtGnf);
  const tvaN = Math.round(ht * decompte.marche.tauxTva / 100);
  const armpN= Math.round(ht * 0.006);
  const ttcN = ht + tvaN + armpN;
  const rgTh = BigInt(Math.round(ttcN * decompte.marche.tauxRetenueGarantie / 100));
  if (Math.abs(Number(decompte.retenueGarantie) - Number(rgTh)) > 1000) {
    alertes.push({
      niveau: "ERREUR",
      code: "RG_INCORRECTE",
      message: `RG incorrecte : calculée ${Number(decompte.retenueGarantie).toLocaleString("fr-GN")} GNF, attendu ${Number(rgTh).toLocaleString("fr-GN")} GNF (5% du TTC)`,
    });
  }

  return {
    ok: alertes.filter((a) => a.niveau === "CRITIQUE" || a.niveau === "ERREUR").length === 0,
    alertes,
    montantContrat: montantContrat.toString(),
    dejaPaye: totalDejaPaye.toString(),
    cumulAvecCourant: cumulAvecCourant.toString(),
    resteContrat: resteContrat.toString(),
    tauxConsomme,
    generatedAt: new Date().toISOString(),
  };
}

// IDs des décomptes dont l'étape de workflow COURANTE attend une action du rôle donné.
// Utilisé par la vue "À traiter" : chaque profil ne voit que ce qui attend SA décision
// (dès qu'il approuve, l'étape passe au rôle suivant et le décompte sort de sa liste).
async function decompteIdsATraiterPour(role: string): Promise<string[]> {
  const instances = await prisma.workflowInstance.findMany({
    where: { statut: "EN_COURS" },
    select: {
      decompteId: true,
      etapeActuelle: true,
      definition: { select: { etapes: { orderBy: { ordre: "asc" }, select: { roleRequis: true } } } },
    },
  });
  return instances
    .filter((inst) => inst.definition.etapes[inst.etapeActuelle]?.roleRequis === role)
    .map((inst) => inst.decompteId)
    .filter((id): id is string => !!id);
}

export const decomptesService = {
  async list(params: { page?: number; pageSize?: number; marcheId?: string; statut?: string; entrepriseId?: string; aTraiter?: boolean; role?: string; marcheIds?: string[] }) {
    const page     = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, params.pageSize ?? 20);
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.marcheId)    where.marcheId    = params.marcheId;
    if (params.marcheIds)   where.marcheId    = { in: params.marcheIds }; // périmètre d'affectation
    if (params.statut)      where.statut      = params.statut;
    if (params.entrepriseId) where.entrepriseId = params.entrepriseId;

    // Vue "À traiter" : uniquement les dossiers en attente d'une action de CE rôle.
    // ADMIN/DG gardent la vue globale (rôle superviseur). Les rôles créateurs voient
    // aussi leurs BROUILLONs (à compléter/soumettre) — c'est une action qui leur incombe.
    if (params.aTraiter && params.role && !["ADMIN", "DG"].includes(params.role)) {
      const ids = await decompteIdsATraiterPour(params.role);
      const orClauses: Record<string, unknown>[] = [{ id: { in: ids } }];
      if (["DMC", "MISSION", "ENTREPRISE"].includes(params.role)) {
        orClauses.push({ statut: "BROUILLON" });
      }
      where.OR = orClauses;
    }
    const [data, total] = await Promise.all([
      prisma.decompte.findMany({
        where,
        include: {
          marche: marcheInclude,
          entreprise: { select: { id: true, raisonSociale: true, statut: true } },
          lot: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.decompte.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 };
  },

  async getById(id: string) {
    const d = await prisma.decompte.findFirst({ where: { id, deletedAt: null }, include });
    if (!d) throw new ApiError(404, "Décompte introuvable");
    return d;
  },

  async create(data: Record<string, unknown>, userId: string) {
    const marche = await prisma.marche.findFirst({
      where: { id: data.marcheId as string, deletedAt: null },
      include: { entreprise: true },
    });
    if (!marche) throw new ApiError(404, "Marché introuvable");
    if (marche.statut !== "ACTIF") throw new ApiError(400, `Décompte impossible : marché "${marche.statut}"`);

    const entreprise = await prisma.entreprise.findUnique({ where: { id: data.entrepriseId as string } });
    if (!entreprise) throw new ApiError(404, "Entreprise introuvable");
    // §CDC — Règle bloquante : conformité fiscale et administrative obligatoire
    await assertEntrepriseConforme(data.entrepriseId as string);

    // §5 CDC — référence + numéro dossier auto
    let reference = (data.reference as string | undefined)?.trim();
    if (!reference) {
      const count = await prisma.decompte.count({ where: { marcheId: marche.id } });
      reference = `${marche.reference}/D-${String(count + 1).padStart(2, "0")}`;
    }
    const year = new Date().getFullYear();
    const dossierCount = await prisma.decompte.count({ where: { numeroDossier: { startsWith: `ED-${year}-` } } });
    const numeroDossier = `ED-${year}-${String(dossierCount + 1).padStart(4, "0")}`;

    // §5 CDC — horodatage automatique
    const dateDepot = (data.dateDepot as Date | undefined) ?? new Date();

    // Pièces par défaut (toutes non fournies)
    const piecesObligatoires = {
      decompteSigné: false, attachements: false, facture: false,
      rapportAvancement: false, photosChantier: false, pvContradictoire: false,
    };

    const calculated = await calculerDecompte({
      ...(data as object),
      tauxTva: marche.tauxTva,
      tauxRetenueGarantie: marche.tauxRetenueGarantie,
      tauxAvance: marche.tauxAvance,
    } as CalcReglesInput, marche);

    const created = await prisma.decompte.create({
      data: { ...(data as object), reference, numeroDossier, dateDepot, piecesObligatoires, ...calculated } as never,
      include,
    });

    // §10 CDC — contrôles auto
    const controles = await runControlesAuto({
      id: created.id,
      marcheId: created.marcheId,
      netAPayer: created.netAPayer,
      montantPeriodeHtGnf: created.montantPeriodeHtGnf,
      tva: created.tva,
      retenueGarantie: created.retenueGarantie,
      avanceRecuperee: created.avanceRecuperee,
      marche: {
        montantInitialGnf: marche.montantInitialGnf,
        montantActualiseGnf: marche.montantActualiseGnf ?? null,
        tauxTva: marche.tauxTva,
        tauxRetenueGarantie: marche.tauxRetenueGarantie,
        tauxAvance: marche.tauxAvance,
      },
    });

    await prisma.decompte.update({ where: { id: created.id }, data: { controleAutoResultats: controles as never } });

    await logAudit({ userId, action: "CREATE", entityType: "Decompte", entityId: created.id, after: created });

    const accuse = {
      numero: `AR-${numeroDossier}`,
      numeroDossier,
      reference,
      dateHorodatage: dateDepot.toISOString(),
      dateHorodatageFormatee: dateDepot.toLocaleString("fr-GN", { timeZone: "Africa/Conakry" }),
      marcheReference: marche.reference,
      marcheIntitule: marche.intitule,
      entreprise: entreprise.raisonSociale,
      financement: marche.financement,
      type: data.type as string,
      netAPayer: calculated.netAPayer.toString(),
      alertesControle: controles.alertes.length,
      message: `Décompte ${reference} (dossier ${numeroDossier}) enregistré. ${controles.alertes.length > 0 ? `⚠ ${controles.alertes.length} alerte(s) détectée(s) — vérifier les contrôles avant soumission.` : "Aucune anomalie détectée."}`,
    };

    return { decompte: { ...created, controleAutoResultats: controles }, accuse };
  },

  async update(id: string, data: Record<string, unknown>, userId: string) {
    const before = await prisma.decompte.findUnique({ where: { id }, include: { marche: true } });
    if (!before) throw new ApiError(404, "Décompte introuvable");
    if (before.statut === "PAYE") throw new ApiError(400, "Décompte payé, modification impossible");
    const calculated = await calculerDecompte({
      ...before,
      ...(data as object),
      tauxTva: before.marche.tauxTva,
      tauxRetenueGarantie: before.marche.tauxRetenueGarantie,
      tauxAvance: before.marche.tauxAvance,
    } as CalcReglesInput, before.marche);
    const updated = await prisma.decompte.update({ where: { id }, data: { ...(data as object), ...calculated } as never });
    await logAudit({ userId, action: "UPDATE", entityType: "Decompte", entityId: id, before, after: updated });
    return updated;
  },

  // §6 CDC — mettre à jour les pièces obligatoires
  async updatePieces(id: string, pieces: Record<string, boolean>, userId: string) {
    const before = await prisma.decompte.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Décompte introuvable");
    const updated = await prisma.decompte.update({ where: { id }, data: { piecesObligatoires: pieces as never } });
    await logAudit({ userId, action: "UPDATE", entityType: "Decompte", entityId: id, before, after: { piecesObligatoires: pieces } });
    return updated;
  },

  // §11 CDC — sauvegarder l'analyse DMC
  async updateAnalyseDmc(id: string, analyseDmc: string, userId: string) {
    const updated = await prisma.decompte.update({ where: { id }, data: { analyseDmc } });
    await logAudit({ userId, action: "UPDATE", entityType: "Decompte", entityId: id, after: { analyseDmc } });
    return updated;
  },

  // §12 CDC — visa financier DAF
  async updateVisaFinancier(id: string, visa: { visaFinancier: string; commentaireFinancier: string }, userId: string) {
    const updated = await prisma.decompte.update({ where: { id }, data: visa });
    await logAudit({ userId, action: "UPDATE", entityType: "Decompte", entityId: id, after: visa });
    return updated;
  },

  // §10 CDC — relancer les contrôles
  async refreshControles(id: string) {
    const d = await prisma.decompte.findUnique({ where: { id }, include: { marche: true } });
    if (!d) throw new ApiError(404, "Décompte introuvable");
    const controles = await runControlesAuto({
      id: d.id, marcheId: d.marcheId, netAPayer: d.netAPayer,
      montantPeriodeHtGnf: d.montantPeriodeHtGnf, tva: d.tva,
      retenueGarantie: d.retenueGarantie, avanceRecuperee: d.avanceRecuperee,
      marche: {
        montantInitialGnf: d.marche.montantInitialGnf,
        montantActualiseGnf: d.marche.montantActualiseGnf ?? null,
        tauxTva: d.marche.tauxTva,
        tauxRetenueGarantie: d.marche.tauxRetenueGarantie,
        tauxAvance: d.marche.tauxAvance,
      },
    });
    await prisma.decompte.update({ where: { id }, data: { controleAutoResultats: controles as never } });
    return controles;
  },

  async changeStatut(id: string, statut: string, userId: string) {
    const before = await prisma.decompte.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Décompte introuvable");
    const updated = await prisma.decompte.update({ where: { id }, data: { statut: statut as never } });
    await logAudit({ userId, action: "APPROVE", entityType: "Decompte", entityId: id, before, after: updated });
    return updated;
  },

  async remove(id: string, userId: string) {
    const before = await prisma.decompte.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Décompte introuvable");
    if (before.statut === "PAYE") throw new ApiError(400, "Impossible de supprimer un décompte payé");
    await prisma.decompte.update({ where: { id }, data: { deletedAt: new Date() } });
    await logAudit({ userId, action: "DELETE", entityType: "Decompte", entityId: id, before });
  },

  async stats() {
    const [total, enAttente, valides, payes, montantEngageRaw, montantPayeRaw] = await Promise.all([
      prisma.decompte.count({ where: { deletedAt: null } }),
      prisma.decompte.count({ where: { deletedAt: null, statut: { in: ["DEPOSE","EN_CONTROLE","EN_VALIDATION"] } } }),
      prisma.decompte.count({ where: { deletedAt: null, statut: "VALIDE" } }),
      prisma.decompte.count({ where: { deletedAt: null, statut: "PAYE" } }),
      prisma.decompte.aggregate({ where: { deletedAt: null }, _sum: { netAPayer: true } }),
      prisma.decompte.aggregate({ where: { deletedAt: null, statut: "PAYE" }, _sum: { netAPayer: true } }),
    ]);
    return {
      total, enAttente, valides, payes,
      montantEngageGnf: montantEngageRaw._sum.netAPayer?.toString() ?? "0",
      montantPayeGnf: montantPayeRaw._sum.netAPayer?.toString() ?? "0",
    };
  },
};
