import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import { z } from "zod";
import { assertMarcheAutorise } from "../../lib/perimetre";
import { chargerRegles, nombreRegles } from "../../lib/regles";

export const avenantsRouter = Router();
avenantsRouter.use(requireAuth);

const avenantSchema = z.object({
  marcheId:                  z.string(),
  numero:                    z.number().int().positive(),
  objet:                     z.string().min(5),
  montantSupplementaireGnf:  z.number().default(0),
  prolongationJours:         z.number().int().default(0),
  dateSignature:             z.string().optional(),
  statut:                    z.enum(["ACTIF","ANNULE","EN_ATTENTE"]).optional(),
  observations:              z.string().optional(),
  // F-MA2 — dérogation explicite au plafond d'avenants : bloquante à défaut,
  // tracée avec motif obligatoire.
  derogationPlafond:         z.boolean().default(false),
});

avenantsRouter.get("/marche/:marcheId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertMarcheAutorise(req, req.params.marcheId);
    const avenants = await prisma.avenant.findMany({
      where: { marcheId: req.params.marcheId },
      orderBy: { numero: "asc" },
    });
    // Calcul cumulatif
    let cumulMontant = 0n;
    let cumulJours = 0;
    const enriched = avenants.map((a) => {
      cumulMontant += a.montantSupplementaireGnf;
      cumulJours += a.prolongationJours;
      return { ...a, cumulMontantGnf: cumulMontant.toString(), cumulJours };
    });
    res.json(enriched);
  } catch (err) { next(err); }
});

avenantsRouter.post("/", requireRole("ADMIN","DMC","DAF","DG"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const data = avenantSchema.parse(req.body);

    // Vérifier que le numéro n'existe pas déjà
    const exists = await prisma.avenant.findFirst({ where: { marcheId: data.marcheId, numero: data.numero } });
    if (exists) throw new ApiError(400, `L'avenant n°${data.numero} existe déjà pour ce marché`);

    const marche = await prisma.marche.findFirst({ where: { id: data.marcheId, deletedAt: null } });
    if (!marche) throw new ApiError(404, "Marché introuvable");

    // ── F-MA2 — plafond d'avenants paramétrable (Code des marchés usuel :
    // 25 % cumulé du montant initial ; à confirmer DMP — la règle
    // RG_PLAFOND_AVENANTS_PCT est bornée par marché/bailleur/type comme les
    // autres règles A1-A10). Contrôle BLOQUANT ; la dérogation exige un motif
    // (≥ 20 caractères) et reste TRACÉE dans l'audit.
    const reglesAv = await chargerRegles({ marcheId: marche.id, bailleur: marche.financement, typeMarche: marche.type });
    const plafondPct = nombreRegles(reglesAv, "RG_PLAFOND_AVENANTS_PCT");
    if (plafondPct < 100) {
      const cumulActuel = await prisma.avenant.aggregate({
        where: { marcheId: data.marcheId, statut: "ACTIF" },
        _sum: { montantSupplementaireGnf: true },
      });
      const cumulAvecCeluiCi = (cumulActuel._sum.montantSupplementaireGnf ?? 0n) + BigInt(data.montantSupplementaireGnf);
      const plafondGnf = marche.montantInitialGnf * BigInt(Math.round(plafondPct * 100)) / 10_000n;
      if (cumulAvecCeluiCi > plafondGnf) {
        const detail = `cumul avenants ${cumulAvecCeluiCi} GNF > plafond ${plafondPct} % du marché initial (${plafondGnf} GNF)`;
        if (!data.derogationPlafond) {
          throw new ApiError(400, `Plafond d'avenants dépassé — ${detail}. Une dérogation motivée (derogationPlafond + motif) est requise ; elle sera tracée.`);
        }
        if (!data.observations || data.observations.trim().length < 20) {
          throw new ApiError(400, "La dérogation au plafond d'avenants exige un motif d'au moins 20 caractères (champ observations)");
        }
      }
    }

    const avenant = await prisma.avenant.create({
      data: {
        ...data,
        montantSupplementaireGnf: BigInt(data.montantSupplementaireGnf),
        dateSignature: data.dateSignature ? new Date(data.dateSignature) : undefined,
      } as never,
    });

    // Mettre à jour montantActualiseGnf du marché
    const totalAvenants = await prisma.avenant.aggregate({
      where: { marcheId: data.marcheId, statut: "ACTIF" },
      _sum: { montantSupplementaireGnf: true },
    });
    const montantActualise = marche.montantInitialGnf + (totalAvenants._sum.montantSupplementaireGnf ?? 0n);
    await prisma.marche.update({ where: { id: data.marcheId }, data: { montantActualiseGnf: montantActualise } });

    await logAudit({
      userId: req.user.id, action: "CREATE", entityType: "Avenant", entityId: avenant.id,
      after: { ...avenant, ...(data.derogationPlafond ? { derogationPlafond: true, motifDerogation: data.observations } : {}) },
    });
    res.status(201).json(avenant);
  } catch (err) { next(err); }
});

avenantsRouter.put("/:id", requireRole("ADMIN","DMC","DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const before = await prisma.avenant.findUnique({ where: { id: req.params.id } });
    if (!before) throw new ApiError(404, "Avenant introuvable");
    const data = avenantSchema.partial().parse(req.body);
    const updated = await prisma.avenant.update({
      where: { id: req.params.id },
      data: {
        ...data,
        montantSupplementaireGnf: data.montantSupplementaireGnf !== undefined ? BigInt(data.montantSupplementaireGnf) : undefined,
        dateSignature: data.dateSignature ? new Date(data.dateSignature) : undefined,
      } as never,
    });
    // Re-calculer montant actualisé
    const totalAvenants = await prisma.avenant.aggregate({
      where: { marcheId: before.marcheId, statut: "ACTIF" },
      _sum: { montantSupplementaireGnf: true },
    });
    const marche = await prisma.marche.findUnique({ where: { id: before.marcheId } });
    if (marche) {
      const montantActualise = marche.montantInitialGnf + (totalAvenants._sum.montantSupplementaireGnf ?? 0n);
      await prisma.marche.update({ where: { id: before.marcheId }, data: { montantActualiseGnf: montantActualise } });
    }
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "Avenant", entityId: updated.id, before, after: updated });
    res.json(updated);
  } catch (err) { next(err); }
});

avenantsRouter.delete("/:id", requireRole("ADMIN","DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const avenant = await prisma.avenant.findUnique({ where: { id: req.params.id } });
    if (!avenant) throw new ApiError(404, "Avenant introuvable");
    await prisma.avenant.delete({ where: { id: req.params.id } });
    await logAudit({ userId: req.user.id, action: "DELETE", entityType: "Avenant", entityId: req.params.id, before: avenant });
    res.status(204).send();
  } catch (err) { next(err); }
});
