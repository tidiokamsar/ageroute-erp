/**
 * §16 CDC — Circuits financiers post-validation DG
 * §16.1 Circuit FER : DG → FER → Budget/MEF → DNTCP → BCRG → Paiement
 * §16.2 Circuit Bailleurs : DG → UGP → Demande décaissement → Non-objection → Décaissement → Paiement
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import { rolesEffectifs } from "../../lib/delegations";
import { getMarchesAffectes } from "../../lib/affectations";
import { z } from "zod";

export const circuitFinancierRouter = Router();
circuitFinancierRouter.use(requireAuth);

// F12 — définitions unifiées : voir lib/circuit-definitions.ts
import { etapesCircuitFinancier, type EtapeCircuit } from "../../lib/circuit-definitions";
import { roleAutorise } from "../../lib/roles-circuit";
import { chargerRegles } from "../../lib/regles";
import { filtreParDecompte } from "../../lib/perimetre";
function etapesPourFinancement(financement: string, bailleurNom?: string): EtapeCircuit[] {
  return etapesCircuitFinancier(financement);
}

// Déclencher le circuit financier après validation DG
circuitFinancierRouter.post("/declencher/:decompteId", requireRole("ADMIN","DG"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const decompte = await prisma.decompte.findFirst({
      where: { id: req.params.decompteId, deletedAt: null },
      include: { marche: true, circuitFinancier: true },
    });
    if (!decompte) throw new ApiError(404, "Décompte introuvable");
    if (!["VALIDE_DG","VALIDE"].includes(decompte.statut)) {
      throw new ApiError(400, "Le circuit financier ne peut être déclenché qu'après validation DG");
    }
    if (decompte.circuitFinancier) {
      throw new ApiError(400, "Un circuit financier existe déjà pour ce décompte");
    }

    const financement = decompte.marche.financement;
    const typeCircuit = financement === "FER" ? "FER" : financement === "BUDGET_NATIONAL" ? "BUDGET" : "BAILLEUR";
    const etapes = etapesPourFinancement(financement);

    const circuit = await prisma.circuitFinancier.create({
      data: {
        decompteId: decompte.id,
        type: typeCircuit,
        bailleurNom: decompte.marche.bailleur ?? undefined,
        etapeActuelle: 0,
        statut: "EN_COURS",
        etapes: { create: etapes },
      },
      include: { etapes: { orderBy: { ordre: "asc" } } },
    });

    await prisma.decompte.update({
      where: { id: decompte.id },
      data: { statut: "EN_CIRCUIT_FINANCIER" },
    });

    await logAudit({
      userId: req.user.id, action: "CREATE", entityType: "CircuitFinancier",
      entityId: circuit.id, after: { type: typeCircuit, decompteId: decompte.id },
    });

    res.status(201).json({ circuit, message: `Circuit ${typeCircuit} démarré (${etapes.length} étapes)` });
  } catch (err) { next(err); }
});

// Valider une étape du circuit financier
circuitFinancierRouter.post("/:circuitId/etape", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const { statut, commentaire, dateVisa } = z.object({
      statut:      z.enum(["VALIDE","REJETE"]),
      commentaire: z.string().optional(),
      dateVisa:    z.string().optional(),
    }).parse(req.body);

    const circuit = await prisma.circuitFinancier.findFirst({
      where: { id: req.params.circuitId, statut: "EN_COURS" },
      include: { etapes: { orderBy: { ordre: "asc" } } },
    });
    if (!circuit) throw new ApiError(404, "Circuit introuvable ou terminé");

    const etapeCourante = circuit.etapes[circuit.etapeActuelle];
    if (!etapeCourante) throw new ApiError(400, "Aucune étape courante");

    // Périmètre d'affectation (revue du 20/08/2026, complément) : le service
    // de l'étape autorise la FONCTION, l'affectation autorise le MARCHÉ —
    // un agent scopé non affecté ne valide pas l'étape financière d'un
    // marché hors de son périmètre. Refus en 404.
    const affectesEtape = await getMarchesAffectes(req.user.id, req.user.role);
    if (affectesEtape !== null) {
      const d = await prisma.decompte.findUnique({ where: { id: circuit.decompteId }, select: { marcheId: true } });
      if (!d || !affectesEtape.includes(d.marcheId)) throw new ApiError(404, "Circuit introuvable");
    }

    // Vérifier que l'utilisateur a le bon rôle (ou ADMIN) — délégations actives incluses
    const mesRoles = await rolesEffectifs(req.user.id, req.user.role);
    if (req.user.role !== "ADMIN" && !mesRoles.includes(etapeCourante.roleOuService as string)) {
      throw new ApiError(403, `Cette étape requiert le service ${etapeCourante.roleOuService}`);
    }

    // NOTE L2.1 : le rôle d'étape (roleOuService) CI-DESSUS est l'autorisation
    // — la matrice ne s'applique pas aux validations d'étapes du circuit.

    // Mettre à jour l'étape courante
    await prisma.circuitFinancierEtape.update({
      where: { id: etapeCourante.id },
      data: {
        statut,
        commentaire,
        dateVisa: dateVisa ? new Date(dateVisa) : new Date(),
        validePar: req.user.email,
        valideAt: new Date(),
      },
    });

    if (statut === "REJETE") {
      await prisma.circuitFinancier.update({ where: { id: circuit.id }, data: { statut: "REJETE" } });
      await prisma.decompte.update({ where: { id: circuit.decompteId }, data: { statut: "REJETE" } });
      return res.json({ statut: "REJETE", message: `Circuit rejeté à l'étape ${etapeCourante.nom}` });
    }

    const prochainIndex = circuit.etapeActuelle + 1;
    if (prochainIndex >= circuit.etapes.length) {
      // Le circuit terminé prouve l'ordonnancement, pas le transfert bancaire.
      await prisma.circuitFinancier.update({ where: { id: circuit.id }, data: { statut: "TERMINE", etapeActuelle: prochainIndex } });
      await prisma.decompte.update({ where: { id: circuit.decompteId }, data: { statut: "ORDONNANCE" } });
      await logAudit({ userId: req.user.id, action: "APPROVE", entityType: "CircuitFinancier", entityId: circuit.id });
      return res.json({
        statut: "TERMINE",
        decompteStatut: "ORDONNANCE",
        message: "Circuit financier terminé — décompte ordonnancé, en attente de confirmation bancaire",
      });
    }

    // Enregistrer date de transmission pour la prochaine étape
    const prochaineEtape = circuit.etapes[prochainIndex];
    await prisma.circuitFinancierEtape.update({
      where: { id: prochaineEtape.id },
      data: { dateTransmission: new Date(), statut: "EN_COURS" },
    });
    await prisma.circuitFinancier.update({
      where: { id: circuit.id },
      data: { etapeActuelle: prochainIndex },
    });

    res.json({ statut: "EN_COURS", etapeActuelle: prochainIndex, prochaineEtape: prochaineEtape.nom });
  } catch (err) { next(err); }
});

// Récupérer le circuit d'un décompte
circuitFinancierRouter.get("/decompte/:decompteId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const circuit = await prisma.circuitFinancier.findUnique({
      where: { decompteId: req.params.decompteId },
      include: { etapes: { orderBy: { ordre: "asc" } } },
    });
    res.json(circuit ?? null);
  } catch (err) { next(err); }
});

// Tous les circuits, avec filtre de statut optionnel (tableau de bord DAF/DG)
/**
 * Deux routes appelées par l'écran « Circuit financier » (FinancierPage) avec
 * un rafraîchissement toutes les 30 s, et qui N'EXISTAIENT PAS côté serveur :
 * l'écran répondait 404 en silence, les compteurs restaient à zéro et la liste
 * des décomptes validés DG en attente de circuit était toujours vide.
 * Constat « routes fantômes » de la revue du 22/08/2026.
 *
 * Déclarées AVANT `GET /` et `GET /decompte/:id` ; leurs premiers segments
 * littéraux (`stats`, `pending`) ne collisionnent avec aucune route paramétrée.
 */
circuitFinancierRouter.get("/stats/daf", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [enCoursCircuit, terminesCircuit, paiementsValides, paiementsEnAttente, montantPaye] = await Promise.all([
      prisma.circuitFinancier.count({ where: { statut: "EN_COURS" } }),
      prisma.circuitFinancier.count({ where: { statut: "TERMINE" } }),
      prisma.paiement.count({ where: { deletedAt: null, statut: "EXECUTE" } }),
      prisma.paiement.count({ where: { deletedAt: null, statut: { in: ["EN_ATTENTE", "ORDONNE"] } } }),
      prisma.paiement.aggregate({ where: { deletedAt: null, statut: "EXECUTE" }, _sum: { montantGnf: true } }),
    ]);
    res.json({
      enCoursCircuit,
      terminesCircuit,
      paiementsValides,
      paiementsEnAttente,
      // BigInt sérialisé en chaîne par le patch global — jamais converti en Number.
      montantPayeGnf: (montantPaye._sum.montantGnf ?? 0n).toString(),
    });
  } catch (err) { next(err); }
});

circuitFinancierRouter.get("/pending", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Décomptes validés par la DG dont le circuit financier n'a pas été ouvert.
    const decomptes = await prisma.decompte.findMany({
      where: { deletedAt: null, statut: "VALIDE_DG", circuitFinancier: null },
      select: {
        id: true, reference: true, netAPayer: true,
        marche: { select: { intitule: true, financement: true } },
        entreprise: { select: { raisonSociale: true } },
      },
      orderBy: { updatedAt: "asc" },
    });
    // Forme plate attendue par l'écran (marche_intitule, entreprise, financement).
    res.json(decomptes.map((d) => ({
      id: d.id,
      reference: d.reference,
      netAPayer: d.netAPayer.toString(),
      marche_intitule: d.marche.intitule,
      financement: d.marche.financement,
      entreprise: d.entreprise.raisonSociale,
    })));
  } catch (err) { next(err); }
});

circuitFinancierRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { statut } = z.object({ statut: z.enum(["EN_COURS", "TERMINE", "REJETE"]).optional() }).parse(req.query);
    const circuits = await prisma.circuitFinancier.findMany({
      where: statut ? { statut } : undefined,
      include: {
        etapes: { orderBy: { ordre: "asc" } },
        decompte: { include: { marche: { select: { reference: true, intitule: true, financement: true } }, entreprise: { select: { raisonSociale: true } } } },
      },
      orderBy: { dateCreation: "asc" },
    });
    res.json(circuits);
  } catch (err) { next(err); }
});
