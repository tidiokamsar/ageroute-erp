/**
 * §22 CDC — Paramétrage métier (sans développement lourd)
 * SLA, circuits, règles calcul, types pièces, droits profils
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/error.middleware";
import { REGLES_DEFAUT, chargerRegles, invaliderCacheRegles, type CleRegles } from "../../lib/regles";
import { logAudit } from "../../lib/audit";
import { METADONNEES, peutValiderRegle, validerDemande } from "./regles.catalogue";
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

// ═══════════════════════════════════════════════════════════════════════════
// Lot L0.2 — Registre des règles de gestion : CRUD + validation à quatre yeux
//
// Une règle est SAISIE (statut BROUILLON) puis VALIDÉE par une autre personne.
// Seules les règles VALIDE et à date sont consommées par le moteur (L0.1) :
// tant qu'une demande reste en brouillon, le comportement ne bouge pas.
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/parametrage/regles — défauts fusionnés avec les surcharges en base. */
parametrageRouter.get("/regles", requireRole("ADMIN", "DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { categorie, portee } = req.query as { categorie?: string; portee?: string };

    const enregistrements = await prisma.regleGestion.findMany({
      where: { ...(portee ? { portee } : {}) },
      orderBy: [{ cle: "asc" }, { dateEffet: "desc" }, { version: "desc" }],
    });

    const parCle = new Map<string, typeof enregistrements>();
    for (const r of enregistrements) {
      const liste = parCle.get(r.cle) ?? [];
      liste.push(r);
      parCle.set(r.cle, liste);
    }

    const regles = (Object.keys(REGLES_DEFAUT) as CleRegles[])
      .filter((cle) => !categorie || METADONNEES[cle].categorie === categorie)
      .map((cle) => {
        const meta = METADONNEES[cle];
        const versions = parCle.get(cle) ?? [];
        const derniereValide = versions.find((v) => v.statut === "VALIDE") ?? null;
        const enAttente = versions.filter((v) => v.statut === "BROUILLON");
        return {
          cle,
          categorie: meta.categorie,
          libelle: meta.libelle,
          type: meta.type,
          options: meta.options ?? null,
          valeurDefaut: REGLES_DEFAUT[cle],
          // Valeur effective GLOBALE : les portées fines sont résolues au calcul.
          valeurEffective: derniereValide?.valeur ?? REGLES_DEFAUT[cle],
          surchargee: Boolean(derniereValide),
          derniereModification: derniereValide
            ? { valeur: derniereValide.valeur, dateEffet: derniereValide.dateEffet, validePar: derniereValide.validePar, valideAt: derniereValide.valideAt, motif: derniereValide.motif, version: derniereValide.version }
            : null,
          enAttenteValidation: enAttente.map((v) => ({ id: v.id, valeur: v.valeur, portee: v.portee, porteeId: v.porteeId, dateEffet: v.dateEffet, saisiPar: v.saisiPar, motif: v.motif, version: v.version })),
        };
      });

    res.json({ regles, total: regles.length });
  } catch (err) { next(err); }
});

/** POST /api/parametrage/regles — nouvelle demande (ou nouvelle version) en BROUILLON. */
parametrageRouter.post("/regles", requireRole("ADMIN", "DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const erreurs = validerDemande(req.body ?? {}, new Date());
    if (erreurs.length) throw new ApiError(400, erreurs.join(" ; "));

    const cle = String(req.body.cle) as CleRegles;
    const meta = METADONNEES[cle];
    const portee = String(req.body.portee ?? "GLOBAL");
    const porteeId = portee === "GLOBAL" ? "" : String(req.body.porteeId).trim();
    const dateEffet = req.body.dateEffet ? new Date(String(req.body.dateEffet)) : new Date();

    // Nouvelle version = incrément sur la version la plus haute de même portée.
    const derniere = await prisma.regleGestion.findFirst({
      where: { cle, portee, porteeId },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const creee = await prisma.regleGestion.create({
      data: {
        cle,
        categorie: meta.categorie,
        libelle: meta.libelle,
        type: meta.type,
        options: (meta.options ?? undefined) as never,
        portee,
        porteeId,
        valeur: String(req.body.valeur ?? "").trim(),
        valeurDefaut: REGLES_DEFAUT[cle],
        dateEffet,
        statut: "BROUILLON",
        saisiPar: req.user!.id,
        motif: String(req.body.motif).trim(),
        version: (derniere?.version ?? 0) + 1,
      },
    });

    await logAudit({
      userId: req.user!.id,
      action: "CREATE",
      entityType: "RegleGestion",
      entityId: creee.id,
      after: { cle, portee, porteeId, valeur: creee.valeur, dateEffet, motif: creee.motif, statut: "BROUILLON" },
      ipAddress: req.ip,
    });

    res.status(201).json(creee);
  } catch (err) { next(err); }
});

/** POST /api/parametrage/regles/:id/valider — quatre yeux, puis mise en vigueur. */
parametrageRouter.post("/regles/:id/valider", requireRole("ADMIN", "DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const regle = await prisma.regleGestion.findUnique({ where: { id: req.params.id } });
    if (!regle) throw new ApiError(404, "Règle introuvable");
    if (regle.statut !== "BROUILLON") throw new ApiError(409, `Seule une règle en brouillon peut être validée (statut actuel : ${regle.statut})`);

    const verdict = peutValiderRegle(req.user!.role, req.user!.id, regle.saisiPar);
    if (!verdict.ok) throw new ApiError(403, verdict.motif!);

    // Valeur en vigueur avant ce changement, pour la pièce d'audit.
    const precedente = await prisma.regleGestion.findFirst({
      where: { cle: regle.cle, portee: regle.portee, porteeId: regle.porteeId, statut: "VALIDE" },
      orderBy: [{ dateEffet: "desc" }, { version: "desc" }],
      select: { valeur: true },
    });

    const [validee] = await prisma.$transaction([
      prisma.regleGestion.update({
        where: { id: regle.id },
        data: { statut: "VALIDE", validePar: req.user!.id, valideAt: new Date() },
      }),
      prisma.regleGestionHistorique.create({
        data: {
          regleId: regle.id,
          cle: regle.cle,
          ancienne: precedente?.valeur ?? regle.valeurDefaut,
          nouvelle: regle.valeur,
          dateEffet: regle.dateEffet,
          saisiPar: regle.saisiPar ?? req.user!.id,
          validePar: req.user!.id,
          motif: regle.motif,
        },
      }),
    ]);

    await logAudit({
      userId: req.user!.id,
      action: "APPROVE",
      entityType: "RegleGestion",
      entityId: regle.id,
      before: { statut: "BROUILLON", valeur: precedente?.valeur ?? regle.valeurDefaut },
      after: { statut: "VALIDE", valeur: regle.valeur, dateEffet: regle.dateEffet, motif: regle.motif },
      ipAddress: req.ip,
    });

    // Le cache de résolution porte des valeurs devenues fausses.
    invaliderCacheRegles();

    res.json(validee);
  } catch (err) { next(err); }
});

/** GET /api/parametrage/regles/:cle/historique — piste d'audit d'une règle. */
parametrageRouter.get("/regles/:cle/historique", requireRole("ADMIN", "DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cle = req.params.cle;
    if (!(cle in REGLES_DEFAUT)) throw new ApiError(404, `Clé de règle inconnue : ${cle}`);

    const lignes = await prisma.regleGestionHistorique.findMany({
      where: { cle },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Les identifiants d'agents sont remplacés par des noms lisibles : une
    // piste d'audit doit se lire sans requête complémentaire.
    const ids = [...new Set(lignes.flatMap((l) => [l.saisiPar, l.validePar]).filter(Boolean) as string[])];
    const agents = ids.length
      ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, nomComplet: true, email: true } })
      : [];
    const parId = new Map(agents.map((a) => [a.id, a]));

    res.json({
      cle,
      valeurDefaut: REGLES_DEFAUT[cle as CleRegles],
      historique: lignes.map((l) => ({
        id: l.id,
        ancienne: l.ancienne,
        nouvelle: l.nouvelle,
        dateEffet: l.dateEffet,
        motif: l.motif,
        saisiPar: parId.get(l.saisiPar)?.nomComplet ?? l.saisiPar,
        validePar: l.validePar ? (parId.get(l.validePar)?.nomComplet ?? l.validePar) : null,
        createdAt: l.createdAt,
      })),
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/parametrage/regles/effectives — lot L2.2 (A9).
 *
 * Les libellés d'états sont nécessaires à TOUT utilisateur pour lire l'écran :
 * cette route est donc ouverte à tout compte authentifié, mais elle ne livre
 * alors que les étiquettes. Le jeu complet — seuils de conformité, matrices de
 * rôles — reste réservé aux profils de paramétrage.
 */
parametrageRouter.get("/regles/effectives", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bailleur, typeMarche, marcheId } = req.query as Record<string, string | undefined>;
    const regles = await chargerRegles({ bailleur, typeMarche, marcheId });

    const complet = req.user?.role === "ADMIN" || req.user?.role === "DAF";
    if (complet) return res.json({ regles, portee: "COMPLET" });

    res.json({ regles: { ETQ_MAPPINGS: regles.ETQ_MAPPINGS }, portee: "ETIQUETTES" });
  } catch (err) { next(err); }
});
