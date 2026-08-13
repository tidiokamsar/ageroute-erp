/**
 * §22 CDC — Paramétrage métier (sans développement lourd)
 * SLA, circuits, règles calcul, types pièces, droits profils
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/error.middleware";
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
