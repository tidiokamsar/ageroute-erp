/**
 * Service Entreprises — Moteur conformité 10 critères / 100 pts
 * VERT ≥70 | ORANGE 40-69 | ROUGE <40
 * Blocage direct si radiation / suspension / interdit de soumission
 */
import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import type { StatutEntreprise } from "@prisma/client";

// ─── Moteur de scoring ────────────────────────────────────────────────────────

interface EntrepriseData {
  nif?: string | null;
  rccm?: string | null;
  raisonSociale?: string | null;
  regulariteFiscale?: boolean;
  attestationFiscaleExpire?: Date | string | null;
  regulariteSociale?: boolean;
  attestationSocialeExpire?: Date | string | null;
  assujettTVA?: boolean;
  iban?: string | null;
  agrement?: string | null;
  estRadie?: boolean;
  estSuspendu?: boolean;
  estInterditSoumission?: boolean;
  autoriseContracterEtat?: boolean;
}

export interface ScoreDetail {
  nif:               { ok: boolean; pts: number; max: number };
  rccm:              { ok: boolean; pts: number; max: number };
  raisonSociale:     { ok: boolean; pts: number; max: number };
  regulariteFiscale: { ok: boolean; pts: number; max: number };
  attestFiscale:     { ok: boolean; pts: number; max: number; expire?: string };
  regulariteSociale: { ok: boolean; pts: number; max: number };
  attestSociale:     { ok: boolean; pts: number; max: number; expire?: string };
  iban:              { ok: boolean; pts: number; max: number };
  agrement:          { ok: boolean; pts: number; max: number };
  integrite:         { ok: boolean; pts: number; max: number };
}

export function computeScore(data: EntrepriseData): {
  score: number;
  statut: StatutEntreprise;
  detail: ScoreDetail;
  bloquantDirect: boolean;
} {
  const today = new Date();

  const fiscaleOk   = !!data.attestationFiscaleExpire && new Date(data.attestationFiscaleExpire) > today;
  const socialeOk   = !data.assujettTVA
    ? true
    : !!data.attestationSocialeExpire && new Date(data.attestationSocialeExpire) > today;
  const integrite   = !data.estRadie && !data.estSuspendu && !data.estInterditSoumission && (data.autoriseContracterEtat !== false);
  const bloquantDirect = !integrite;

  const detail: ScoreDetail = {
    nif:               { ok: !!data.nif,                pts: !!data.nif ? 10 : 0,                max: 10 },
    rccm:              { ok: !!data.rccm,               pts: !!data.rccm ? 10 : 0,               max: 10 },
    raisonSociale:     { ok: !!data.raisonSociale,      pts: !!data.raisonSociale ? 5 : 0,       max: 5  },
    regulariteFiscale: { ok: !!data.regulariteFiscale,  pts: !!data.regulariteFiscale ? 20 : 0,  max: 20 },
    attestFiscale:     {
      ok: fiscaleOk,
      pts: fiscaleOk ? 15 : 0,
      max: 15,
      expire: data.attestationFiscaleExpire ? new Date(data.attestationFiscaleExpire).toISOString() : undefined,
    },
    regulariteSociale: { ok: !!data.regulariteSociale,  pts: !!data.regulariteSociale ? 15 : 0,  max: 15 },
    attestSociale:     {
      ok: socialeOk,
      pts: socialeOk ? 10 : 0,
      max: 10,
      expire: data.attestationSocialeExpire ? new Date(data.attestationSocialeExpire).toISOString() : undefined,
    },
    iban:              { ok: !!data.iban,               pts: !!data.iban ? 10 : 0,               max: 10 },
    agrement:          { ok: !!data.agrement,           pts: !!data.agrement ? 5 : 0,            max: 5  },
    integrite:         { ok: integrite,                 pts: integrite ? 0 : 0,                  max: 0  },
  };

  let score = Object.values(detail).reduce((s, c) => s + c.pts, 0);
  if (bloquantDirect) score = Math.min(score, 29); // force ROUGE si radiation/suspension

  const statut: StatutEntreprise = score >= 70 ? "CONFORME" : score >= 40 ? "A_REGULARISER" : "BLOQUE";
  return { score, statut, detail, bloquantDirect };
}

// ─── Vérification éligibilité (utilisée par décomptes/marchés) ────────────────

export async function checkEligibilite(entrepriseId: string): Promise<{
  eligible: boolean;
  raisons: string[];
  statut: string;
  score: number;
}> {
  const e = await prisma.entreprise.findFirst({ where: { id: entrepriseId, deletedAt: null } });
  if (!e) return { eligible: false, raisons: ["Entreprise introuvable"], statut: "BLOQUE", score: 0 };

  const raisons: string[] = [];
  if (e.statut === "BLOQUE")          raisons.push(`Entreprise bloquée : ${e.motifBlocage ?? "non conforme"}`);
  if (e.estRadie)                     raisons.push("Entreprise radiée du registre");
  if (e.estSuspendu)                  raisons.push("Entreprise suspendue");
  if (e.estInterditSoumission)        raisons.push("Interdite de soumissionner");
  if (!e.iban)                        raisons.push("IBAN / RIB manquant (requis pour paiement)");

  const today = new Date();
  if (e.attestationFiscaleExpire && new Date(e.attestationFiscaleExpire) <= today)
    raisons.push("Attestation fiscale expirée");
  if (e.assujettTVA && e.attestationSocialeExpire && new Date(e.attestationSocialeExpire) <= today)
    raisons.push("Attestation sociale expirée");

  return { eligible: raisons.length === 0, raisons, statut: e.statut, score: e.scoreConformite };
}

// ─── Génération des alertes préventives ──────────────────────────────────────

export async function genererAlertes(entrepriseId: string): Promise<void> {
  const e = await prisma.entreprise.findFirst({ where: { id: entrepriseId, deletedAt: null } });
  if (!e) return;
  const today = new Date();
  const j7   = new Date(Date.now() + 7  * 86400000);
  const j30  = new Date(Date.now() + 30 * 86400000);

  const alertesToCreate: { type: string; niveau: string; message: string; echeance?: Date }[] = [];

  const checkExpiry = (expire: Date | null | undefined, label: string, type: string) => {
    if (!expire) return;
    const exp = new Date(expire);
    if (exp <= today) {
      alertesToCreate.push({ type, niveau: "CRITIQUE",      message: `${label} expirée depuis le ${exp.toLocaleDateString("fr-GN")}`, echeance: exp });
    } else if (exp <= j7) {
      alertesToCreate.push({ type, niveau: "URGENT",        message: `${label} expire dans moins de 7 jours (${exp.toLocaleDateString("fr-GN")})`, echeance: exp });
    } else if (exp <= j30) {
      alertesToCreate.push({ type, niveau: "AVERTISSEMENT", message: `${label} expire le ${exp.toLocaleDateString("fr-GN")} (J-30)`, echeance: exp });
    }
  };

  checkExpiry(e.attestationFiscaleExpire, "Attestation fiscale", "EXPIRATION_FISCALE");
  checkExpiry(e.attestationSocialeExpire, "Attestation sociale", "EXPIRATION_SOCIALE");
  if (e.estRadie)    alertesToCreate.push({ type: "RADIATION",       niveau: "CRITIQUE",      message: "Entreprise radiée du registre" });
  if (e.estSuspendu) alertesToCreate.push({ type: "SUSPENSION",      niveau: "CRITIQUE",      message: "Entreprise suspendue" });
  if (!e.iban)       alertesToCreate.push({ type: "DOCUMENT_MANQUANT",niveau: "AVERTISSEMENT", message: "IBAN / RIB bancaire manquant" });

  // Ne créer que les alertes pas encore présentes et non acquittées
  for (const a of alertesToCreate) {
    const exists = await prisma.alerteEntreprise.findFirst({
      where: { entrepriseId, type: a.type, acquittee: false },
    });
    if (!exists) {
      await prisma.alerteEntreprise.create({ data: { entrepriseId, ...a } });
    }
  }
}

// ─── Service principal ────────────────────────────────────────────────────────

const INCLUDE_FULL = {
  verificationsConformite: { orderBy: { createdAt: "desc" as const }, take: 10 },
  documents: { where: { actif: true }, orderBy: { type: "asc" as const } },
  contacts: { orderBy: { principal: "desc" as const } },
  alertes: { where: { acquittee: false }, orderBy: { createdAt: "desc" as const } },
  marches: {
    where: { deletedAt: null },
    select: { id: true, reference: true, intitule: true, statut: true, montantInitialGnf: true, dateFinPrevue: true },
  },
  decomptes: {
    where: { deletedAt: null },
    select: { id: true, reference: true, type: true, statut: true, netAPayer: true, createdAt: true },
    orderBy: { createdAt: "desc" as const },
    take: 20,
  },
  _count: { select: { marches: true, decomptes: true, documents: true, alertes: true } },
};

export const entreprisesService = {
  // ── Liste ─────────────────────────────────────────────────────────────────
  async list(params: {
    page?: number; pageSize?: number; search?: string; statut?: string;
    scoreLt?: number; scoreGte?: number;
    /** Restriction de périmètre : titulaires des marchés confiés à l'agent. */
    entrepriseIds?: string[] | null;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, params.pageSize ?? 20);
    const where: Record<string, unknown> = { deletedAt: null };
    // Un rôle scopé ne doit voir que les entreprises avec lesquelles il
    // travaille. Sans cela, la liste des marchés était cloisonnée mais le
    // référentiel des titulaires restait ouvert à toute l'agence.
    if (params.entrepriseIds) where.id = { in: params.entrepriseIds };
    if (params.search) where.OR = [
      { raisonSociale: { contains: params.search, mode: "insensitive" } },
      { nif:           { contains: params.search, mode: "insensitive" } },
      { rccm:          { contains: params.search, mode: "insensitive" } },
      { sigle:         { contains: params.search, mode: "insensitive" } },
    ];
    if (params.statut)  where.statut = params.statut;
    if (params.scoreGte !== undefined) where.scoreConformite = { gte: params.scoreGte };
    if (params.scoreLt  !== undefined) where.scoreConformite = { ...(where.scoreConformite as object ?? {}), lt: params.scoreLt };

    const [data, total] = await Promise.all([
      prisma.entreprise.findMany({
        where,
        include: {
          alertes: { where: { acquittee: false }, select: { type: true, niveau: true } },
          _count:  { select: { marches: true, decomptes: true } },
        },
        orderBy: { raisonSociale: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.entreprise.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 };
  },

  // ── Stats globales dashboard ───────────────────────────────────────────────
  async stats() {
    const [total, conformes, aRegulariser, bloques, radies, montantTotal] = await Promise.all([
      prisma.entreprise.count({ where: { deletedAt: null } }),
      prisma.entreprise.count({ where: { deletedAt: null, statut: "CONFORME" } }),
      prisma.entreprise.count({ where: { deletedAt: null, statut: "A_REGULARISER" } }),
      prisma.entreprise.count({ where: { deletedAt: null, statut: "BLOQUE" } }),
      prisma.entreprise.count({ where: { deletedAt: null, estRadie: true } }),
      prisma.marche.aggregate({ where: { deletedAt: null }, _sum: { montantInitialGnf: true } }),
    ]);
    const alertesUrgentes = await prisma.alerteEntreprise.count({ where: { acquittee: false, niveau: { in: ["URGENT", "CRITIQUE"] } } });
    return { total, conformes, aRegulariser, bloques, radies, alertesUrgentes, montantTotalGnf: montantTotal._sum.montantInitialGnf?.toString() ?? "0" };
  },

  // ── Fiche complète ─────────────────────────────────────────────────────────
  async getById(id: string) {
    const e = await prisma.entreprise.findFirst({ where: { id, deletedAt: null }, include: INCLUDE_FULL });
    if (!e) throw new ApiError(404, "Entreprise introuvable");
    return e;
  },

  // ── Créer ─────────────────────────────────────────────────────────────────
  async create(data: Record<string, unknown>, userId: string) {
    const { score, statut } = computeScore(data as EntrepriseData);
    const created = await prisma.entreprise.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { ...(data as any), scoreConformite: score, statut, dateVerification: new Date() },
    });
    await logAudit({ userId, action: "CREATE", entityType: "Entreprise", entityId: created.id, after: created });
    await genererAlertes(created.id);
    return created;
  },

  // ── Modifier ──────────────────────────────────────────────────────────────
  async update(id: string, data: Record<string, unknown>, userId: string) {
    const before = await prisma.entreprise.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Entreprise introuvable");
    const merged = { ...before, ...(data as object) };
    const { score, statut, detail } = computeScore(merged as EntrepriseData);
    const updated = await prisma.entreprise.update({
      where: { id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { ...(data as any), scoreConformite: score, statut, dateVerification: new Date() },
    });
    // Historique si statut ou score change
    if (before.scoreConformite !== score || before.statut !== statut) {
      await prisma.conformiteVerification.create({
        data: { entrepriseId: id, scoreAvant: before.scoreConformite, scoreApres: score, statutAvant: before.statut, statutApres: statut, detail: detail as never, auteur: userId, declencheurType: "MISE_A_JOUR" },
      });
    }
    await logAudit({ userId, action: "UPDATE", entityType: "Entreprise", entityId: id, before, after: updated });
    await genererAlertes(id);
    return updated;
  },

  // ── Supprimer (soft) ──────────────────────────────────────────────────────
  async remove(id: string, userId: string) {
    const before = await prisma.entreprise.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Entreprise introuvable");
    await prisma.entreprise.update({ where: { id }, data: { deletedAt: new Date() } });
    await logAudit({ userId, action: "DELETE", entityType: "Entreprise", entityId: id, before });
  },

  // ── Recalcul manuel conformité ─────────────────────────────────────────────
  async verifierConformite(id: string, userId: string, commentaire?: string) {
    const e = await prisma.entreprise.findFirst({ where: { id, deletedAt: null } });
    if (!e) throw new ApiError(404, "Entreprise introuvable");
    const { score, statut, detail } = computeScore(e as EntrepriseData);
    await prisma.entreprise.update({ where: { id }, data: { scoreConformite: score, statut, dateVerification: new Date() } });
    await prisma.conformiteVerification.create({
      data: { entrepriseId: id, scoreAvant: e.scoreConformite, scoreApres: score, statutAvant: e.statut, statutApres: statut, detail: detail as never, auteur: userId, commentaire, declencheurType: "MANUEL" },
    });
    await logAudit({ userId, action: "UPDATE", entityType: "Entreprise", entityId: id, before: { scoreConformite: e.scoreConformite, statut: e.statut }, after: { scoreConformite: score, statut } });
    await genererAlertes(id);
    return { score, statut, detail };
  },

  // ── Bloquer manuellement ──────────────────────────────────────────────────
  async bloquer(id: string, motif: string, userId: string) {
    const e = await prisma.entreprise.findFirst({ where: { id, deletedAt: null } });
    if (!e) throw new ApiError(404, "Entreprise introuvable");
    const updated = await prisma.entreprise.update({
      where: { id },
      data: { statut: "BLOQUE", motifBlocage: motif, scoreConformite: Math.min(e.scoreConformite, 29) },
    });
    await prisma.conformiteVerification.create({
      data: { entrepriseId: id, scoreAvant: e.scoreConformite, scoreApres: updated.scoreConformite, statutAvant: e.statut, statutApres: "BLOQUE", auteur: userId, commentaire: motif, declencheurType: "BLOCAGE_ADMIN" },
    });
    await logAudit({ userId, action: "UPDATE", entityType: "Entreprise", entityId: id, before: { statut: e.statut }, after: { statut: "BLOQUE", motifBlocage: motif } });
    return updated;
  },

  // ── Débloquer (après régularisation) ─────────────────────────────────────
  async debloquer(id: string, commentaire: string, userId: string) {
    const e = await prisma.entreprise.findFirst({ where: { id, deletedAt: null } });
    if (!e) throw new ApiError(404, "Entreprise introuvable");
    const { score, statut } = computeScore(e as EntrepriseData);
    if (statut === "BLOQUE") throw new ApiError(400, "L'entreprise reste non conforme après recalcul — régularisez d'abord les documents manquants");
    const updated = await prisma.entreprise.update({
      where: { id },
      data: { statut, scoreConformite: score, motifBlocage: null, dateVerification: new Date() },
    });
    await prisma.conformiteVerification.create({
      data: { entrepriseId: id, scoreAvant: e.scoreConformite, scoreApres: score, statutAvant: "BLOQUE", statutApres: statut, auteur: userId, commentaire, declencheurType: "DEBLOCAGE" },
    });
    await logAudit({ userId, action: "UPDATE", entityType: "Entreprise", entityId: id, before: { statut: "BLOQUE" }, after: { statut } });
    return updated;
  },

  // ── Documents ─────────────────────────────────────────────────────────────
  async listDocuments(entrepriseId: string) {
    return prisma.documentEntreprise.findMany({
      where: { entrepriseId, actif: true },
      orderBy: [{ type: "asc" }, { createdAt: "desc" }],
    });
  },
  async addDocument(entrepriseId: string, data: Record<string, unknown>, userId: string) {
    const e = await prisma.entreprise.findFirst({ where: { id: entrepriseId, deletedAt: null } });
    if (!e) throw new ApiError(404, "Entreprise introuvable");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await prisma.documentEntreprise.create({ data: { entrepriseId, ...(data as any) } });
    await logAudit({ userId, action: "CREATE", entityType: "DocumentEntreprise", entityId: doc.id, after: doc });
    // Recalcul conformité si doc clé
    const typesCles = ["ATTESTATION_FISCALE", "ATTESTATION_SOCIALE", "RELEVE_BANCAIRE"];
    if (typesCles.includes(String(data.type))) await this.verifierConformite(entrepriseId, userId, `Upload ${data.type}`);
    return doc;
  },
  async validerDocument(docId: string, valide: boolean, userId: string, observations?: string) {
    const doc = await prisma.documentEntreprise.findUnique({ where: { id: docId } });
    if (!doc) throw new ApiError(404, "Document introuvable");
    const updated = await prisma.documentEntreprise.update({
      where: { id: docId },
      data: { valide, verifieAt: new Date(), verifieBy: userId, observations },
    });
    await logAudit({ userId, action: "UPDATE", entityType: "DocumentEntreprise", entityId: docId, before: { valide: doc.valide }, after: { valide } });
    await this.verifierConformite(doc.entrepriseId, userId, `Validation document ${doc.type} → ${valide ? "OK" : "Refusé"}`);
    return updated;
  },
  async removeDocument(docId: string, userId: string) {
    const doc = await prisma.documentEntreprise.update({ where: { id: docId }, data: { actif: false } });
    await logAudit({ userId, action: "DELETE", entityType: "DocumentEntreprise", entityId: docId });
    return doc;
  },

  // ── Contacts ──────────────────────────────────────────────────────────────
  async listContacts(entrepriseId: string) {
    return prisma.contactEntreprise.findMany({ where: { entrepriseId }, orderBy: { principal: "desc" } });
  },
  async addContact(entrepriseId: string, data: Record<string, unknown>) {
    if (data.principal) await prisma.contactEntreprise.updateMany({ where: { entrepriseId }, data: { principal: false } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return prisma.contactEntreprise.create({ data: { entrepriseId, ...(data as any) } });
  },
  async removeContact(contactId: string) {
    return prisma.contactEntreprise.delete({ where: { id: contactId } });
  },

  // ── Alertes ───────────────────────────────────────────────────────────────
  async listAlertes(entrepriseId: string, inclureAcquittees = false) {
    return prisma.alerteEntreprise.findMany({
      where: { entrepriseId, acquittee: inclureAcquittees ? undefined : false },
      orderBy: [{ niveau: "desc" }, { createdAt: "desc" }],
    });
  },
  async acquitterAlerte(alerteId: string, userId: string) {
    return prisma.alerteEntreprise.update({
      where: { id: alerteId },
      data: { acquittee: true, acquitteeAt: new Date(), acquitteeBy: userId },
    });
  },

  // ── Performance calculée en temps réel ───────────────────────────────────
  async getPerformance(entrepriseId: string) {
    const [marches, decomptes] = await Promise.all([
      prisma.marche.findMany({ where: { entrepriseId, deletedAt: null }, select: { statut: true, montantInitialGnf: true, montantActualiseGnf: true } }),
      prisma.decompte.findMany({ where: { entrepriseId, deletedAt: null }, select: { statut: true, netAPayer: true, penalites: true } }),
    ]);

    const nbMarchesTotal   = marches.length;
    const nbMarchesEnCours = marches.filter(m => ["EN_EXECUTION","ACTIF","NOTIFIE","SIGNE"].includes(m.statut)).length;
    const nbMarchesClotures= marches.filter(m => ["CLOTURE","SOLDE"].includes(m.statut)).length;
    const nbMarchesResilies= marches.filter(m => m.statut === "RESILIE").length;
    const montantTotal     = marches.reduce((s, m) => s + Number(m.montantInitialGnf), 0);

    const nbDecomptes    = decomptes.length;
    const nbRejetes      = decomptes.filter(d => d.statut === "REJETE").length;
    const nbValides      = decomptes.filter(d => ["VALIDE","VALIDE_DG","PAYE","ORDONNANCE","EN_CIRCUIT_FINANCIER"].includes(d.statut)).length;
    const nbPayes        = decomptes.filter(d => d.statut === "PAYE").length;
    const montantCertifie= decomptes.filter(d => ["VALIDE","VALIDE_DG","PAYE","ORDONNANCE","EN_CIRCUIT_FINANCIER"].includes(d.statut)).reduce((s,d)=>s+Number(d.netAPayer),0);
    const montantPaye    = decomptes.filter(d => d.statut === "PAYE").reduce((s,d)=>s+Number(d.netAPayer),0);
    const montantPenalites = decomptes.reduce((s,d)=>s+Number(d.penalites),0);

    const tauxRejet  = nbDecomptes > 0 ? Math.round(nbRejetes / nbDecomptes * 100) : 0;
    const tauxPaiement = montantCertifie > 0 ? Math.round(montantPaye / montantCertifie * 100) : 0;

    // Score performance : base 100 - pénalités score - rejet score
    let scorePerf = 100;
    if (tauxRejet > 30) scorePerf -= 30;
    else if (tauxRejet > 10) scorePerf -= 15;
    if (nbMarchesResilies > 0) scorePerf -= 20;
    if (montantPenalites > 0) scorePerf -= 10;
    scorePerf = Math.max(0, scorePerf);

    return {
      marches:     { total: nbMarchesTotal, enCours: nbMarchesEnCours, clotures: nbMarchesClotures, resilies: nbMarchesResilies, montantTotalGnf: montantTotal.toString() },
      decomptes:   { total: nbDecomptes, rejetes: nbRejetes, valides: nbValides, payes: nbPayes, montantCertifieGnf: montantCertifie.toString(), montantPayeGnf: montantPaye.toString() },
      qualite:     { tauxRejet, tauxPaiement, montantPenalitesGnf: montantPenalites.toString(), scorePerformance: scorePerf },
    };
  },
};
