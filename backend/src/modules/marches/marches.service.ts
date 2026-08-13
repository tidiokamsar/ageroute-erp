import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";

const include = { entreprise: true, lots: true, avenants: true, garanties: true };

export const marchesService = {
  async list(params: { page?: number; pageSize?: number; search?: string; statut?: string; financement?: string; entrepriseId?: string; retard?: boolean }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, params.pageSize ?? 20);
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.search) where.OR = [
      { intitule:   { contains: params.search, mode: "insensitive" } },
      { reference:  { contains: params.search, mode: "insensitive" } },
      { tronconCode:{ contains: params.search, mode: "insensitive" } },
      { numContrat: { contains: params.search, mode: "insensitive" } },
    ];
    if (params.statut)      where.statut       = params.statut;
    if (params.financement) where.financement   = params.financement;
    if (params.entrepriseId)where.entrepriseId  = params.entrepriseId;
    if (params.retard)      where.AND = [
      { statut: { in: ["EN_EXECUTION","ACTIF"] } },
      { dateFinPrevue: { lt: new Date() } },
    ];
    const [data, total] = await Promise.all([
      prisma.marche.findMany({
        where,
        include: {
          entreprise: { select: { id: true, raisonSociale: true, statut: true, scoreConformite: true } },
          lots:       { where: { deletedAt: null } },
          _count:     { select: { decomptes: true, garanties: true, avenants: true, receptions: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.marche.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 };
  },

  async getById(id: string) {
    const m = await prisma.marche.findFirst({
      where: { id, deletedAt: null },
      include: {
        entreprise: true,
        projet:     { select: { id: true, code: true, nom: true } },
        lots:       { where: { deletedAt: null } },
        avenants:   { orderBy: { numero: "asc" } },
        garanties:  { orderBy: { createdAt: "asc" } },
        receptions: { orderBy: { createdAt: "asc" } },
        ordresService: { orderBy: { numero: "asc" } },
        historiqueStatuts: { orderBy: { createdAt: "desc" }, take: 20 },
        _count:     { select: { decomptes: true, bpuArticles: true } },
      },
    });
    if (!m) throw new ApiError(404, "Marché introuvable");
    return m;
  },

  async getByNumContrat(numContrat: string) {
    return prisma.marche.findFirst({
      where: { numContrat, deletedAt: null },
      include: { entreprise: { select: { id: true, raisonSociale: true, statut: true } }, decomptes: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 10 } },
    });
  },

  async create(data: Record<string, unknown>, userId: string) {
    const entreprise = await prisma.entreprise.findUnique({ where: { id: data.entrepriseId as string } });
    if (!entreprise) throw new ApiError(404, "Entreprise introuvable");
    if (entreprise.statut === "BLOQUE") throw new ApiError(400, `Entreprise bloquée (${entreprise.motifBlocage ?? "non conforme"})`);
    // À la création, le montant actualisé = montant initial (avant tout avenant).
    if ((data.montantActualiseGnf == null) && data.montantInitialGnf != null) {
      data.montantActualiseGnf = data.montantInitialGnf;
    }
    const created = await prisma.marche.create({ data: data as never });
    await logAudit({ userId, action: "CREATE", entityType: "Marche", entityId: created.id, after: created });
    return created;
  },

  async update(id: string, data: Record<string, unknown>, userId: string) {
    const before = await prisma.marche.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Marché introuvable");
    const updated = await prisma.marche.update({ where: { id }, data: data as never });
    await logAudit({ userId, action: "UPDATE", entityType: "Marche", entityId: id, before, after: updated });
    return updated;
  },

  async remove(id: string, userId: string) {
    const before = await prisma.marche.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Marché introuvable");
    await prisma.marche.update({ where: { id }, data: { deletedAt: new Date() } });
    await logAudit({ userId, action: "DELETE", entityType: "Marche", entityId: id, before });
  },

  async addAvenant(marcheId: string, data: { objet: string; montantSupplementaireGnf?: number; prolongationJours?: number; dateSignature?: Date; observations?: string }, userId: string) {
    const marche = await prisma.marche.findFirst({ where: { id: marcheId, deletedAt: null }, include: { avenants: true } });
    if (!marche) throw new ApiError(404, "Marché introuvable");
    const numero = marche.avenants.length + 1;
    const avenant = await prisma.avenant.create({
      data: { marcheId, numero, ...data, montantSupplementaireGnf: BigInt(data.montantSupplementaireGnf ?? 0) },
    });
    // Recalcule montant actualisé
    const totalAvenants = [...marche.avenants, avenant].reduce((s, a) => s + Number(a.montantSupplementaireGnf), 0);
    await prisma.marche.update({ where: { id: marcheId }, data: { montantActualiseGnf: BigInt(Number(marche.montantInitialGnf) + totalAvenants) } });
    await logAudit({ userId, action: "UPDATE", entityType: "Avenant", entityId: avenant.id, after: avenant });
    return avenant;
  },

  async stats() {
    const [total, actifs, enExecution, suspendus, enRetard, montantTotal] = await Promise.all([
      prisma.marche.count({ where: { deletedAt: null } }),
      prisma.marche.count({ where: { deletedAt: null, statut: { in: ["ACTIF","EN_EXECUTION"] } } }),
      prisma.marche.count({ where: { deletedAt: null, statut: "EN_EXECUTION" } }),
      prisma.marche.count({ where: { deletedAt: null, statut: "SUSPENDU" } }),
      prisma.marche.count({ where: { deletedAt: null, statut: { in: ["ACTIF","EN_EXECUTION"] }, dateFinPrevue: { lt: new Date() } } }),
      prisma.marche.aggregate({ where: { deletedAt: null }, _sum: { montantInitialGnf: true } }),
    ]);
    return { total, actifs, enExecution, suspendus, enRetard, montantTotalGnf: montantTotal._sum.montantInitialGnf?.toString() ?? "0" };
  },
};
