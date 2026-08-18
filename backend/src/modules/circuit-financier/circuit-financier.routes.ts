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
import { z } from "zod";

export const circuitFinancierRouter = Router();
circuitFinancierRouter.use(requireAuth);

// Étapes par type de circuit §16
// F6 — l'étape "Validation DG" est retirée : le circuit n'est déclenché
// qu'APRÈS validation DG par le workflow, la DG ne valide pas deux fois.
const ETAPES_FER = [
  { ordre:1, nom:"FER",              roleOuService:"FER_AGT" },
  { ordre:2, nom:"Budget / MEF",     roleOuService:"BUDGET" },
  { ordre:3, nom:"DNTCP",            roleOuService:"TRESOR" },
  { ordre:4, nom:"BCRG",             roleOuService:"BCRG" },
  { ordre:5, nom:"Paiement",         roleOuService:"DAF" },
];

const ETAPES_BUDGET = [
  { ordre:1, nom:"Budget / MEF",     roleOuService:"BUDGET" },
  { ordre:2, nom:"DNTCP",            roleOuService:"TRESOR" },
  { ordre:3, nom:"BCRG",             roleOuService:"BCRG" },
  { ordre:4, nom:"Paiement",         roleOuService:"DAF" },
];

const ETAPES_BAILLEUR = [
  { ordre:1, nom:"UGP",                      roleOuService:"UGP" },
  { ordre:2, nom:"Demande de décaissement",  roleOuService:"UGP" },
  { ordre:3, nom:"Non-objection bailleur",   roleOuService:"BAILLEUR" },
  { ordre:4, nom:"Décaissement",             roleOuService:"BAILLEUR" },
  { ordre:5, nom:"Paiement",                 roleOuService:"DAF" },
];

function etapesPourFinancement(financement: string, bailleurNom?: string): typeof ETAPES_FER {
  if (financement === "FER") return ETAPES_FER;
  if (financement === "BUDGET_NATIONAL") return ETAPES_BUDGET;
  return ETAPES_BAILLEUR; // BM, BAD, UE, BOAD, BID, BADEA, AFD, KFW, AUTRE
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

    // Vérifier que l'utilisateur a le bon rôle (ou ADMIN) — délégations actives incluses
    const mesRoles = await rolesEffectifs(req.user.id, req.user.role);
    if (req.user.role !== "ADMIN" && !mesRoles.includes(etapeCourante.roleOuService as string)) {
      throw new ApiError(403, `Cette étape requiert le service ${etapeCourante.roleOuService}`);
    }

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
      // Toutes les étapes validées → PAYE
      await prisma.circuitFinancier.update({ where: { id: circuit.id }, data: { statut: "PAYE", etapeActuelle: prochainIndex } });
      await prisma.decompte.update({ where: { id: circuit.decompteId }, data: { statut: "PAYE", datePaiement: new Date() } });
      await logAudit({ userId: req.user.id, action: "APPROVE", entityType: "CircuitFinancier", entityId: circuit.id });
      return res.json({ statut: "PAYE", message: "Paiement finalisé — toutes les étapes validées" });
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

// Tous les circuits en cours (tableau de bord DAF/DG)
circuitFinancierRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const statut = (req.query.statut as string) || "EN_COURS";
    const circuits = await prisma.circuitFinancier.findMany({
      where: { statut },
      include: {
        etapes: { orderBy: { ordre: "asc" } },
        decompte: { include: { marche: { select: { reference: true, intitule: true, financement: true } }, entreprise: { select: { raisonSociale: true } } } },
      },
      orderBy: { dateCreation: "asc" },
    });
    res.json(circuits);
  } catch (err) { next(err); }
});
