/**
 * §22 CDC — Paramétrage métier (sans développement lourd)
 * SLA, circuits, règles calcul, types pièces, droits profils
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/error.middleware";
import { REGLES_DEFAUT, type CleRegles } from "../../lib/regles";
import { simulerAvecSurcharges } from "./simulateur";
import { z } from "zod";

export const parametrageRouter = Router();
parametrageRouter.use(requireAuth);

// Paramètres par défaut (initialisés si absents)
const DEFAULTS: { cle: string; valeur: string; type: string; categorie: string; libelle: string }[] = [
  { cle:"SLA_MISSION",           valeur:"7",   type:"NUMBER", categorie:"SLA",      libelle:"SLA Mission de contrôle (jours)" },
  { cle:"SLA_TECHNIQUE",         valeur:"5",   type:"NUMBER", categorie:"SLA",      libelle:"SLA Direction Technique (jours)" },
  { cle:"SLA_DMC",               valeur:"5",   type:"NUMBER", categorie:"SLA",      libelle:"SLA DMC (jours)" },
  { cle:"SLA_DAF",               valeur:"3",   type:"NUMBER", categorie:"SLA",      libelle:"SLA DAF (jours)" },
  { cle:"SLA_DG",                valeur:"2",   type:"NUMBER", categorie:"SLA",      libelle:"SLA DG (jours)" },
  { cle:"SLA_BAILLEUR",          valeur:"10",  type:"NUMBER", categorie:"SLA",      libelle:"SLA Bailleur (jours)" },
  { cle:"SEUIL_ALERTE_CONSOMMATION", valeur:"95", type:"NUMBER", categorie:"CALCUL", libelle:"Seuil alerte consommation contractuelle (%)" },
  { cle:"TAUX_TVA_DEFAUT",       valeur:"18",  type:"NUMBER", categorie:"CALCUL",   libelle:"Taux TVA par défaut (%)" },
  { cle:"TAUX_RG_DEFAUT",        valeur:"5",   type:"NUMBER", categorie:"CALCUL",   libelle:"Taux retenue de garantie par défaut (%)" },
  { cle:"TAUX_AVANCE_DEFAUT",    valeur:"20",  type:"NUMBER", categorie:"CALCUL",   libelle:"Taux avance de démarrage par défaut (%)" },
  { cle:"PIECES_OBLIGATOIRES",   valeur:'["decompteSigné","attachements","facture","rapportAvancement","photosChantier"]', type:"JSON", categorie:"WORKFLOW", libelle:"Pièces obligatoires pour soumission" },
  { cle:"ALERTE_EMAIL_ACTIF",    valeur:"true", type:"BOOLEAN", categorie:"ALERTES", libelle:"Activer les alertes email" },
  { cle:"ALERTE_RETARD_JOURS",   valeur:"3",   type:"NUMBER", categorie:"ALERTES",  libelle:"Délai avant alerte retard de traitement (jours)" },
  { cle:"ALERTE_EXPIRATION_GARANTIE_JOURS", valeur:"30", type:"NUMBER", categorie:"ALERTES", libelle:"Préavis expiration garantie (jours)" },
];

parametrageRouter.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const params = await prisma.parametreMetier.findMany({ orderBy: [{ categorie:"asc"}, {cle:"asc"}] });
    res.json(params);
  } catch (err) { next(err); }
});

parametrageRouter.get("/defaults", async (_req: Request, res: Response, next: NextFunction) => {
  res.json(DEFAULTS);
});

parametrageRouter.post("/init", requireRole("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    let created = 0;
    for (const d of DEFAULTS) {
      const exists = await prisma.parametreMetier.findUnique({ where: { cle: d.cle } });
      if (!exists) { await prisma.parametreMetier.create({ data: d }); created++; }
    }
    res.json({ message: `${created} paramètre(s) initialisé(s)`, total: DEFAULTS.length });
  } catch (err) { next(err); }
});

parametrageRouter.put("/:cle", requireRole("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { valeur } = z.object({ valeur: z.string() }).parse(req.body);
    const param = await prisma.parametreMetier.findUnique({ where: { cle: req.params.cle } });
    if (!param) throw new ApiError(404, `Paramètre "${req.params.cle}" introuvable`);
    const updated = await prisma.parametreMetier.update({ where: { cle: req.params.cle }, data: { valeur } });
    res.json(updated);
  } catch (err) { next(err); }
});

// ─── L0.3 — Simulateur de règles financières (A1-A7) ─────────────────────────
// Calcule un décompte d'exemple ligne à ligne, avant/après application d'un
// jeu de règles proposé — SANS rien appliquer. Outil d'aide à l'arbitrage DAF.
const corpsSimulation = z.object({
  regles: z.record(z.string()).optional(),
  montantHtGnf: z.number().positive(),
  tauxTva: z.number().min(0).max(100).optional(),
  tauxRg: z.number().min(0).max(100).optional(),
  tauxAvance: z.number().min(0).max(100).optional(),
  penalitesGnf: z.number().nonnegative().optional(),
  revisionPrixGnf: z.number().nonnegative().optional(),
}).superRefine((corps, ctx) => {
  const clesInconnues = Object.keys(corps.regles ?? {}).filter((c) => !(c in REGLES_DEFAUT));
  if (clesInconnues.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Clés de règles inconnues : ${clesInconnues.join(", ")}` });
  }
});

parametrageRouter.post("/regles/simuler", requireRole("ADMIN", "DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const corps = corpsSimulation.parse(req.body);
    const surcharges = Object.fromEntries(
      Object.entries(corps.regles ?? {}).map(([cle, valeur]) => [cle, String(valeur)]),
    ) as Partial<Record<CleRegles, string>>;

    const { avant, apres } = simulerAvecSurcharges({
      montantHtGnf: BigInt(Math.round(corps.montantHtGnf)),
      penalitesGnf: corps.penalitesGnf !== undefined ? BigInt(Math.round(corps.penalitesGnf)) : undefined,
      revisionPrixGnf: corps.revisionPrixGnf !== undefined ? BigInt(Math.round(corps.revisionPrixGnf)) : undefined,
      tauxTva: corps.tauxTva ?? 18,
      tauxRg: corps.tauxRg ?? 5,
      tauxAvance: corps.tauxAvance ?? 20,
    }, surcharges);

    const lignes = avant.lignes.map((ligne) => {
      const apresLigne = apres.lignes.find((l) => l.cle === ligne.cle);
      return {
        cle: ligne.cle,
        libelle: ligne.libelle,
        formuleApres: apresLigne?.formule ?? ligne.formule,
        avantGnf: ligne.montantGnf,
        apresGnf: apresLigne?.montantGnf ?? ligne.montantGnf,
        ecartGnf: (BigInt(apresLigne?.montantGnf ?? ligne.montantGnf) - BigInt(ligne.montantGnf)).toString(),
      };
    });

    res.json({
      montantHtGnf: corps.montantHtGnf,
      surcharges,
      lignes,
      netAvantGnf: avant.netAPayerGnf,
      netApresGnf: apres.netAPayerGnf,
      message: "Simulation — aucune règle n'a été appliquée ni enregistrée",
    });
  } catch (err) { next(err); }
});

parametrageRouter.post("/upsert", requireRole("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cle, valeur, type, categorie, libelle } = z.object({
      cle:      z.string().min(2),
      valeur:   z.string(),
      type:     z.enum(["STRING","NUMBER","JSON","BOOLEAN"]).optional(),
      categorie:z.string().optional(),
      libelle:  z.string().optional(),
    }).parse(req.body);
    const result = await prisma.parametreMetier.upsert({
      where: { cle },
      create: { cle, valeur, type: type ?? "STRING", categorie: categorie ?? "GENERAL", libelle: libelle ?? cle },
      update: { valeur },
    });
    res.json(result);
  } catch (err) { next(err); }
});
