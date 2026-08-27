import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import { assertEntrepriseConforme } from "../conformite/conformite.service";
import { motifStatutMarche } from "../../lib/eligibilite-depot";
import { formaterMontant } from "../../lib/montants";

/** |a - b| en entier — Math.abs ne prend pas de BigInt. */
function ecartAbsolu(a: bigint, b: bigint): bigint { return a > b ? a - b : b - a; }

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
import { CLES_PIECES } from "../../lib/pieces-obligatoires";
import { calcDecompteRegles, type CalcReglesInput } from "./decomptes.calc.regles";
import { construireSnapshot } from "./decomptes.regles.audit";

async function calculerDecompte(data: CalcReglesInput, marche: { id: string; financement: string; type: string }) {
  const regles = await chargerRegles({ marcheId: marche.id, bailleur: marche.financement, typeMarche: marche.type });
  return { result: calcDecompteRegles(data, regles), snapshot: construireSnapshot(regles, "GLOBAL") };
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
  // Arithmétique ENTIÈRE — constat « exactitude BigInt incomplète » de la revue
  // du 22/08/2026 : ces contrôles reconvertissaient les montants en Number et
  // pouvaient diverger du moteur de calcul (entier) au-delà de 2^53. Les
  // assiettes et taux sont INCHANGÉS — seule la représentation change.
  const tauxConsomme   = montantContrat > 0n ? Number((cumulAvecCourant * 100n) / montantContrat) : 0;

  const alertes: { niveau: string; code: string; message: string }[] = [];

  // Dépassement montant
  if (cumulAvecCourant > montantContrat) {
    alertes.push({
      niveau: "CRITIQUE",
      code: "DEPASSEMENT_MONTANT",
      message: `Dépassement du contrat : cumul ${formaterMontant(cumulAvecCourant)} GNF > contrat ${formaterMontant(montantContrat)} GNF`,
    });
  } else if (tauxConsomme >= 95) {
    alertes.push({
      niveau: "AVERTISSEMENT",
      code: "CONSOMMATION_ELEVEE",
      message: `Consommation à ${tauxConsomme}% du contrat — reste ${formaterMontant(resteContrat)} GNF`,
    });
  }

  // TVA
  // Taux exprimé en centièmes de pour-cent (18 % -> 1800) pour rester entier.
  const tauxTvaCpc = BigInt(Math.round(decompte.marche.tauxTva * 100));
  const tvaTh = (decompte.montantPeriodeHtGnf * tauxTvaCpc) / 10000n;
  if (ecartAbsolu(decompte.tva, tvaTh) > 1000n) {
    alertes.push({
      niveau: "ERREUR",
      code: "TVA_INCORRECTE",
      message: `TVA incorrecte : calculée ${formaterMontant(decompte.tva)} GNF, attendu ${formaterMontant(tvaTh)} GNF (taux ${decompte.marche.tauxTva}%)`,
    });
  }

  // Retenue de garantie — modèle AGEROUTE : appliquée sur TTC (HT + TVA + ARMP)
  const ht   = decompte.montantPeriodeHtGnf;
  const tvaN = (ht * tauxTvaCpc) / 10000n;
  const armpN= (ht * 6n) / 1000n;                       // 0,6 % — assiette inchangée
  const ttcN = ht + tvaN + armpN;
  const tauxRgCpc = BigInt(Math.round(decompte.marche.tauxRetenueGarantie * 100));
  const rgTh = (ttcN * tauxRgCpc) / 10000n;
  if (ecartAbsolu(decompte.retenueGarantie, rgTh) > 1000n) {
    alertes.push({
      niveau: "ERREUR",
      code: "RG_INCORRECTE",
      message: `RG incorrecte : calculée ${formaterMontant(decompte.retenueGarantie)} GNF, attendu ${formaterMontant(rgTh)} GNF (5% du TTC)`,
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
  // Moteur workflow interne (instances Prisma)
  const instances = await prisma.workflowInstance.findMany({
    where: { statut: "EN_COURS" },
    select: {
      decompteId: true,
      etapeActuelle: true,
      definition: { select: { etapes: { orderBy: { ordre: "asc" }, select: { roleRequis: true } } } },
    },
  });
  const fromWorkflow = instances
    .filter((inst) => inst.definition.etapes[inst.etapeActuelle]?.roleRequis === role)
    .map((inst) => inst.decompteId)
    .filter((id): id is string => !!id);

  // Moteur BPMN générique (décomptes déposés via le portail entreprise) :
  // sans cette fusion, ces décomptes n'apparaissent JAMAIS dans « À traiter ».
  let fromBpmn: string[] = [];
  try {
    const rows = await prisma.$queryRaw<{ entity_id: string }[]>`
      SELECT bi.entity_id
      FROM bpmn_instances bi
      JOIN bpmn_steps bs ON bs.definition_id = bi.definition_id AND bs.ordre = bi.etape_actuelle + 1
      WHERE bi.statut = 'EN_COURS' AND bi.module_type = 'DECOMPTE'
        AND bs.role_requis = ${role}
        AND COALESCE(bs.is_system, false) = false`;
    fromBpmn = rows.map((r) => r.entity_id);
  } catch { /* tables bpmn absentes : environnement vierge */ }

  return [...new Set([...fromWorkflow, ...fromBpmn])];
}

/**
 * Statuts dans lesquels un décompte reste modifiable.
 *
 * Un dossier engagé dans le circuit ne l'est plus : ses montants ont été visés.
 * Pour le corriger, la voie est la demande de correction, qui arrête le circuit
 * et le renvoie au déposant en EN_CORRECTION.
 */
export const STATUTS_DECOMPTE_MODIFIABLES = ["BROUILLON", "EN_CORRECTION"];

/** Refuse toute écriture sur un décompte engagé, et renvoie le dossier chargé. */
export async function assertDecompteModifiable(id: string) {
  const decompte = await prisma.decompte.findFirst({ where: { id, deletedAt: null }, include: { marche: true } });
  if (!decompte) throw new ApiError(404, "Décompte introuvable");
  if (!STATUTS_DECOMPTE_MODIFIABLES.includes(decompte.statut)) {
    throw new ApiError(409,
      `Ce décompte est engagé dans le circuit (statut « ${decompte.statut} ») et n'est plus modifiable. `
      + "Pour le corriger, demandez une correction depuis l'étape en cours : le dossier repartira au déposant.");
  }
  return decompte;
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
    // DG désormais filtré comme les autres (il voit les dossiers à SON étape,
    // pas toute la file) ; seul l'ADMIN garde la vue globale. Les rôles créateurs
    // voient aussi leurs BROUILLONs (à compléter/soumettre).
    if (params.aTraiter && params.role && params.role !== "ADMIN") {
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
          paiements: { where: { deletedAt: null }, select: { montantGnf: true, confirmeAt: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.decompte.count({ where }),
    ]);

    // F11 — solde payé / restant pour chaque décompte
    const dataAvecSolde = data.map((d) => {
      const dejaPaye = (d as unknown as { paiements: Array<{ montantGnf: bigint; confirmeAt: Date | null }> }).paiements
        .reduce((s, p) => s + p.montantGnf, 0n);
      const confirmeParBanque = (d as unknown as { paiements: Array<{ montantGnf: bigint; confirmeAt: Date | null }> }).paiements
        .every((p) => p.confirmeAt !== null);
      return {
        ...d,
        dejaPayeGnf: dejaPaye.toString(),
        resteAPayerGnf: (d.netAPayer - dejaPaye).toString(),
        confirmeParBanque,
      };
    });
    return { data: dataAvecSolde, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 };
  },

  async getById(id: string) {
    const d = await prisma.decompte.findFirst({ where: { id, deletedAt: null }, include });
    if (!d) throw new ApiError(404, "Décompte introuvable");
    // F11 — solde payé / restant
    const dejaPaye = d.paiements?.reduce((s, p) => s + p.montantGnf, 0n) ?? 0n;
    return { ...d, dejaPayeGnf: dejaPaye.toString(), resteAPayerGnf: (d.netAPayer - dejaPaye).toString() };
  },

  async create(data: Record<string, unknown>, userId: string) {
    const marche = await prisma.marche.findFirst({
      where: { id: data.marcheId as string, deletedAt: null },
      include: { entreprise: true },
    });
    if (!marche) throw new ApiError(404, "Marché introuvable");
    // ⚠️ `ACTIF` est un alias historique : AUCUN marché ne le porte en base
    // (trois EN_EXECUTION, un SIGNE au 20/08/2026). L'ancien test
    // `statut !== "ACTIF"` rendait la création de décompte impossible sur
    // 100 % des marchés réels — les décomptes existants venaient du script de
    // peuplement, ce qui a masqué le défaut. lib/eligibilite-depot.ts fait foi.
    const motifMarche = motifStatutMarche(marche.statut);
    if (motifMarche) throw new ApiError(400, `Décompte impossible — ${motifMarche}`);

    const entreprise = await prisma.entreprise.findUnique({ where: { id: data.entrepriseId as string } });
    if (!entreprise) throw new ApiError(404, "Entreprise introuvable");
    // §CDC — Règle bloquante : conformité fiscale et administrative obligatoire
    await assertEntrepriseConforme(data.entrepriseId as string);

    // §5 CDC — référence + numéro dossier auto. Le count()+1 n'est pas atomique :
    // deux dépôts simultanés calculent le même numéro, la contrainte unique
    // refuse le second (P2002) — on RECALCULE et réessaie plutôt que d'échouer.
    const year = new Date().getFullYear();
    let reference = (data.reference as string | undefined)?.trim();
    let numeroDossier = "";
    for (let tentative = 0; tentative < 5; tentative++) {
      if (!reference) {
        const count = await prisma.decompte.count({ where: { marcheId: marche.id } });
        reference = `${marche.reference}/D-${String(count + 1 + tentative).padStart(2, "0")}`;
      }
      const dossierCount = await prisma.decompte.count({ where: { numeroDossier: { startsWith: `ED-${year}-` } } });
      numeroDossier = `ED-${year}-${String(dossierCount + 1 + tentative).padStart(4, "0")}`;
      const dejaPris = await prisma.decompte.findFirst({ where: { OR: [{ reference }, { numeroDossier }] }, select: { id: true } });
      if (!dejaPris) break;
    }

    // §5 CDC — horodatage automatique
    const dateDepot = (data.dateDepot as Date | undefined) ?? new Date();

    // Pièces par défaut (toutes non fournies) — dérivées du RÉFÉRENTIEL
    // UNIQUE (lib/pieces-obligatoires.ts) : une pièce ajoutée là s'applique
    // ici sans copie à maintenir.
    const piecesObligatoires = Object.fromEntries(CLES_PIECES.map((cle) => [cle, false]));

    // A4 — report de l'excédent de pénalités (décision DAF du 26/08/2026) :
    // ce décompte absorbe d'abord le report en attente du décompte précédent
    // du marché (une seule créance reportable par marché) ; son propre
    // excédent, s'il en reste, devient le nouveau report.
    const reportPrecedent = await prisma.decompte.findFirst({
      where: { marcheId: marche.id, deletedAt: null, penalitesReporteesGnf: { gt: 0n } },
      orderBy: { createdAt: "desc" },
      select: { id: true, penalitesReporteesGnf: true },
    });

    const { result: calculated, snapshot } = await calculerDecompte({
      ...(data as object),
      // Pénalités saisies + report entrant : la colonne `penalites` porte le
      // total imputé, pour que le rejeu d'audit concorde avec le calcul.
      penalites: ((data.penalites as bigint | undefined) ?? 0n) + (reportPrecedent?.penalitesReporteesGnf ?? 0n),
      tauxTva: marche.tauxTva,
      tauxRetenueGarantie: marche.tauxRetenueGarantie,
      tauxAvance: marche.tauxAvance,
    } as CalcReglesInput, marche);

    const created = await prisma.$transaction(async (tx) => {
      const c = await tx.decompte.create({
        data: { ...(data as object), reference, numeroDossier, dateDepot, piecesObligatoires, ...calculated, reglesSnapshot: snapshot as never } as never,
        include,
      });
      // Consommer le report absorbé : la créance reportable passe au
      // décompte courant (calculated.penalitesReporteesGnf).
      if (reportPrecedent) {
        // Consommation ATOMIQUE : la condition `gt: 0` garantit qu'une seule
        // écriture absorbe la créance. Sans elle, deux créations concurrentes
        // lisaient le même report hors transaction et le déduisaient toutes
        // deux — l'entreprise se voyait retenir deux fois la même pénalité.
        await tx.decompte.updateMany({ where: { id: reportPrecedent.id, penalitesReporteesGnf: { gt: 0n } }, data: { penalitesReporteesGnf: 0n } });
      }
      return c;
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
    // findFirst + deletedAt: un décompte supprimé (suppression logique) restait
    // modifiable par son identifiant — constat C3 de la revue du 20/08/2026.
    const before = await prisma.decompte.findFirst({ where: { id, deletedAt: null }, include: { marche: true } });
    if (!before) throw new ApiError(404, "Décompte introuvable");

    // Un dossier engagé dans le circuit n'est plus modifiable (revue du
    // 27/08/2026). La seule garde était « pas encore payé » : un décompte
    // DEPOSE, visé par la Mission, la Direction Technique, la DMC puis la DAF
    // restait entièrement modifiable par son déposant — montants compris —
    // sans changement de statut, sans invalider les visas et sans laisser de
    // trace dans l'onglet Validations. Le rejeu d'audit concordait, puisque le
    // snapshot était réécrit avec les nouveaux montants : la DG signait alors
    // un net que personne n'avait contrôlé.
    // Pour corriger un dossier engagé, la voie est la demande de correction,
    // qui le renvoie au déposant en EN_CORRECTION et arrête le circuit.
    const STATUTS_MODIFIABLES = ["BROUILLON", "EN_CORRECTION"];
    if (!STATUTS_MODIFIABLES.includes(before.statut)) {
      throw new ApiError(409,
        `Ce décompte est engagé dans le circuit (statut « ${before.statut} ») et n'est plus modifiable. `
        + "Pour le corriger, demandez une correction depuis l'étape en cours : le dossier repartira au déposant.");
    }
    const { result: calculated, snapshot } = await calculerDecompte({
      ...before,
      ...(data as object),
      tauxTva: before.marche.tauxTva,
      tauxRetenueGarantie: before.marche.tauxRetenueGarantie,
      tauxAvance: before.marche.tauxAvance,
    } as CalcReglesInput, before.marche);
    const updated = await prisma.decompte.update({ where: { id }, data: { ...(data as object), ...calculated, reglesSnapshot: snapshot as never } as never });
    await logAudit({ userId, action: "UPDATE", entityType: "Decompte", entityId: id, before, after: updated });
    return updated;
  },

  // §6 CDC — mettre à jour les pièces obligatoires
  async updatePieces(id: string, pieces: Record<string, boolean>, userId: string) {
    const before = await prisma.decompte.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new ApiError(404, "Décompte introuvable");
    // Même garde que update() (revue du 27/08/2026 — complément du correctif
    // 6 de la revue générale) : un dossier engagé est figé, bordereau compris
    // — décocher une pièce après les visas contournerait « engagé = figé ».
    const STATUTS_MODIFIABLES = ["BROUILLON", "EN_CORRECTION"];
    if (!STATUTS_MODIFIABLES.includes(before.statut)) {
      throw new ApiError(409,
        `Ce décompte est engagé dans le circuit (statut « ${before.statut} ») — son bordereau de pièces n'est plus modifiable. `
        + "Pour le corriger, demandez une correction depuis l'étape en cours.");
    }
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

  // changeStatut a été retiré le 20/08/2026 : le statut d'un décompte est une
  // donnée dérivée du circuit de validation, jamais une entrée. Voir la route
  // POST /:id/statut (410) pour le contexte complet.

  async remove(id: string, userId: string) {
    const before = await prisma.decompte.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Décompte introuvable");
    if (before.statut === "PAYE") throw new ApiError(400, "Impossible de supprimer un décompte payé");
    await prisma.decompte.update({ where: { id }, data: { deletedAt: new Date() } });
    await logAudit({ userId, action: "DELETE", entityType: "Decompte", entityId: id, before });
  },

  /**
   * Compteurs de tête d'écran.
   *
   * ⚠️ Ils DOIVENT porter le même périmètre que la liste. Sans cela, un agent
   * dont la liste ne montre qu'un marché lisait quand même « 6 décomptes,
   * 11,7 Md GNF payés » sur l'ensemble de l'agence : le cloisonnement était
   * contredit par les chiffres affichés juste au-dessus.
   */
  async stats(portee?: { entrepriseId?: string | null; marcheIds?: string[] | null }) {
    const base: Record<string, unknown> = { deletedAt: null };
    if (portee?.entrepriseId) base.entrepriseId = portee.entrepriseId;
    if (portee?.marcheIds) base.marcheId = { in: portee.marcheIds };

    const [total, enAttente, valides, payes, montantEngageRaw, montantPayeRaw] = await Promise.all([
      prisma.decompte.count({ where: base }),
      prisma.decompte.count({ where: { ...base, statut: { in: ["DEPOSE","EN_CONTROLE","EN_VALIDATION"] } } }),
      prisma.decompte.count({ where: { ...base, statut: "VALIDE" } }),
      prisma.decompte.count({ where: { ...base, statut: "PAYE" } }),
      prisma.decompte.aggregate({ where: base, _sum: { netAPayer: true } }),
      prisma.decompte.aggregate({ where: { ...base, statut: "PAYE" }, _sum: { netAPayer: true } }),
    ]);
    return {
      total, enAttente, valides, payes,
      montantEngageGnf: montantEngageRaw._sum.netAPayer?.toString() ?? "0",
      montantPayeGnf: montantPayeRaw._sum.netAPayer?.toString() ?? "0",
    };
  },
};
