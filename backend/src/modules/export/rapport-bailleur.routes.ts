/**
 * F-GO6 — Rapports bailleurs automatisés (Interim Financial Reports).
 * Génère les états de décaissement exigés par la Banque Mondiale, la BAD,
 * le FER et les autres bailleurs : situation financière par bailleur,
 * par projet, par marché, avec % décaissé et restes à payer.
 *
 * GET /api/export/rapport-bailleur              → JSON structuré
 * GET /api/export/rapport-bailleur/xlsx         → Excel (CSV formatté)
 * GET /api/export/rapport-bailleur/pdf          → PDF officiel A4
 *
 * Paramètres : ?bailleur=BM|BAD|FER|BUDGET_NATIONAL|...&projet=<id>&periode=YYYY-MM
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import PDFDocument from "pdfkit";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { logAudit } from "../../lib/audit";

export const rapportBailleurRouter = Router();
rapportBailleurRouter.use(requireAuth, requireRole("ADMIN", "DAF", "DG", "UGP", "BAILLEUR"));

// ─── Types ─────────────────────────────────────────────────────────────────────
interface MarcheBailleur {
  marcheId: string;
  reference: string;
  intitule: string;
  projet?: { code: string; intitule: string } | null;
  entreprise: string;
  statut: string;
  montantContratGnf: bigint;
  montantEngageGnf: bigint;   // somme netAPayer des décomptes non rejetés
  montantPayeGnf: bigint;     // somme des paiements confirmés
  resteAPayerGnf: bigint;
  pourcentageDecaisse: number;
  nombreDecomptes: number;
  nombrePaiements: number;
  dateDernierPaiement?: Date;
}

interface RapportBailleur {
  periode: { debut?: Date; fin?: Date; libelle: string };
  bailleur: string;
  synthese: {
    nombreMarches: number;
    nombreProjets: number;
    montantContratTotalGnf: bigint;
    montantEngageTotalGnf: bigint;
    montantPayeTotalGnf: bigint;
    resteAPayerTotalGnf: bigint;
    pourcentageDecaisseGlobal: number;
  };
  marches: MarcheBailleur[];
  projets: Array<{
    code: string;
    intitule: string;
    nombreMarches: number;
    montantContratGnf: bigint;
    montantPayeGnf: bigint;
    pourcentageDecaisse: number;
  }>;
  paiementsRecents: Array<{
    reference: string;
    marche: string;
    entreprise: string;
    montantGnf: bigint;
    dateOrdre?: Date;
    statut: string;
    confirmeBCRG: boolean;
  }>;
}

// ─── Calcul ────────────────────────────────────────────────────────────────────
async function calculerRapport(bailleur?: string, projetId?: string): Promise<RapportBailleur> {
  const whereMarche: Record<string, unknown> = { deletedAt: null };
  if (bailleur && bailleur !== "TOUS") {
    whereMarche.financement = bailleur;
  }
  if (projetId) {
    whereMarche.projetId = projetId;
  }

  const marches = await prisma.marche.findMany({
    where: whereMarche,
    include: {
      entreprise: { select: { raisonSociale: true } },
      projet: { select: { code: true, intitule: true } },
      decomptes: {
        where: { deletedAt: null, statut: { not: "REJETE" } },
        select: {
          netAPayer: true, statut: true,
          paiements: { where: { deletedAt: null }, select: { montantGnf: true, dateOrdre: true, statut: true, confirmeAt: true } },
        },
      },
    },
    orderBy: { reference: "asc" },
  });

  const lignes: MarcheBailleur[] = marches.map((m) => {
    const engage = m.decomptes.reduce((s: bigint, d: { netAPayer: bigint }) => s + d.netAPayer, 0n);
    const tousPaiements = m.decomptes.flatMap((d: { paiements: Array<{ montantGnf: bigint; dateOrdre?: Date | null }> }) => d.paiements);
    const paye = tousPaiements.reduce((s: bigint, p: { montantGnf: bigint }) => s + p.montantGnf, 0n);
    const montantContrat = m.montantActualiseGnf ?? m.montantInitialGnf;
    const datesPaiement = tousPaiements
      .map((p: { dateOrdre?: Date | null }) => p.dateOrdre)
      .filter((d): d is Date => d !== null && d !== undefined)
      .sort((a, b) => b.getTime() - a.getTime());

    return {
      marcheId: m.id,
      reference: m.reference,
      intitule: m.intitule,
      projet: m.projet,
      entreprise: m.entreprise.raisonSociale,
      statut: m.statut,
      montantContratGnf: montantContrat,
      montantEngageGnf: engage,
      montantPayeGnf: paye,
      resteAPayerGnf: engage - paye,
      pourcentageDecaisse: montantContrat > 0n ? Math.round(Number((paye * 10000n) / montantContrat)) / 100 : 0,
      nombreDecomptes: m.decomptes.length,
      nombrePaiements: tousPaiements.length,
      dateDernierPaiement: datesPaiement[0],
    };
  });

  // Synthèse
  const somme = (f: keyof MarcheBailleur): bigint =>
    lignes.reduce((s, l) => s + (l[f] as bigint), 0n);
  const contratTotal = somme("montantContratGnf");
  const payeTotal = somme("montantPayeGnf");

  // Grouper par projet
  const parProjet = new Map<string, { code: string; intitule: string; marches: MarcheBailleur[] }>();
  for (const l of lignes) {
    const key = l.projet?.code ?? "SANS_PROJET";
    if (!parProjet.has(key)) {
      parProjet.set(key, { code: key, intitule: l.projet?.intitule ?? "Sans projet", marches: [] });
    }
    parProjet.get(key)!.marches.push(l);
  }
  const projets = [...parProjet.values()].map((p) => {
    const pc = p.marches.reduce((s, m) => s + m.montantContratGnf, 0n);
    const pp = p.marches.reduce((s, m) => s + m.montantPayeGnf, 0n);
    return {
      code: p.code,
      intitule: p.intitule,
      nombreMarches: p.marches.length,
      montantContratGnf: pc,
      montantPayeGnf: pp,
      pourcentageDecaisse: pc > 0n ? Math.round(Number((pp * 10000n) / pc)) / 100 : 0,
    };
  });

  // Paiements récents (30 derniers jours)
  const il30j = new Date(); il30j.setDate(il30j.getDate() - 30);
  const paiementsQuery = await prisma.paiement.findMany({
    where: {
      deletedAt: null,
      createdAt: { gte: il30j },
      ...(bailleur && bailleur !== "TOUS" ? { decompte: { marche: { financement: bailleur } } } : {}),
    } as never,
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      reference: true, montantGnf: true, dateOrdre: true, statut: true, confirmeAt: true,
      decompte: { select: { marche: { select: { reference: true } }, entreprise: { select: { raisonSociale: true } } } },
    },
  });

  const libelleBailleur = bailleur && bailleur !== "TOUS"
    ? bailleur.replace(/_/g, " ")
    : "Tous bailleurs";

  return {
    periode: {
      libelle: `Période du ${il30j.toLocaleDateString("fr-FR")} au ${new Date().toLocaleDateString("fr-FR")}`,
      debut: il30j, fin: new Date(),
    },
    bailleur: libelleBailleur,
    synthese: {
      nombreMarches: lignes.length,
      nombreProjets: projets.length,
      montantContratTotalGnf: contratTotal,
      montantEngageTotalGnf: somme("montantEngageGnf"),
      montantPayeTotalGnf: payeTotal,
      resteAPayerTotalGnf: somme("resteAPayerGnf"),
      pourcentageDecaisseGlobal: contratTotal > 0n ? Math.round(Number((payeTotal * 10000n) / contratTotal)) / 100 : 0,
    },
    marches: lignes,
    projets,
    paiementsRecents: paiementsQuery.map((p) => ({
      reference: p.reference ?? "—",
      marche: p.decompte?.marche?.reference ?? "—",
      entreprise: p.decompte?.entreprise?.raisonSociale ?? "—",
      montantGnf: p.montantGnf,
      dateOrdre: p.dateOrdre ?? undefined,
      statut: p.statut,
      confirmeBCRG: p.confirmeAt !== null,
    })),
  };
}

function fmtGnf(v: bigint | number): string {
  return new Intl.NumberFormat("fr-GN", { maximumFractionDigits: 0 }).format(Number(v));
}

// ─── GET /rapport-bailleur — JSON ──────────────────────────────────────────────
rapportBailleurRouter.get("/rapport-bailleur", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rapport = await calculerRapport(
      req.query.bailleur as string | undefined,
      req.query.projet as string | undefined,
    );
    const serialise = JSON.parse(JSON.stringify(rapport, (_, v) => typeof v === "bigint" ? v.toString() : v));
    res.json(serialise);
  } catch (err) { next(err); }
});

// ─── GET /rapport-bailleur/xlsx — Excel (CSV formatté, compatible Excel) ───────
rapportBailleurRouter.get("/rapport-bailleur/xlsx", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new Error("Non authentifié");
    const r = await calculerRapport(req.query.bailleur as string | undefined, req.query.projet as string | undefined);

    const sep = ";"; // séparateur Excel FR
    const lignes: string[] = [];

    // En-tête
    lignes.push(`RAPPORT DE DÉCAISSEMENT — ${r.bailleur}`);
    lignes.push(r.periode.libelle);
    lignes.push(`Généré le ${new Date().toLocaleString("fr-FR")}`);
    lignes.push("");

    // Synthèse
    lignes.push("SYNTHÈSE");
    lignes.push(`Nombre de marchés${sep}${r.synthese.nombreMarches}`);
    lignes.push(`Nombre de projets${sep}${r.synthese.nombreProjets}`);
    lignes.push(`Montant total des contrats (GNF)${sep}${r.synthese.montantContratTotalGnf}`);
    lignes.push(`Montant engagé (GNF)${sep}${r.synthese.montantEngageTotalGnf}`);
    lignes.push(`Montant décaissé (GNF)${sep}${r.synthese.montantPayeTotalGnf}`);
    lignes.push(`Reste à décaisser (GNF)${sep}${r.synthese.resteAPayerTotalGnf}`);
    lignes.push(`% décaissé${sep}${r.synthese.pourcentageDecaisseGlobal}%`);
    lignes.push("");

    // Par projet
    lignes.push("SITUATION PAR PROJET");
    lignes.push(`Code${sep}Intitulé${sep}Nb marchés${sep}Contrat (GNF)${sep}Décaissé (GNF)${sep}% décaissé`);
    for (const p of r.projets) {
      lignes.push(`${p.code}${sep}${p.intitule}${sep}${p.nombreMarches}${sep}${p.montantContratGnf}${sep}${p.montantPayeGnf}${sep}${p.pourcentageDecaisse}%`);
    }
    lignes.push("");

    // Détail par marché
    lignes.push("DÉTAIL PAR MARCHÉ");
    lignes.push(`Référence${sep}Intitulé${sep}Projet${sep}Entreprise${sep}Statut${sep}Contrat (GNF)${sep}Engagé (GNF)${sep}Décaissé (GNF)${sep}Reste (GNF)${sep}% décaissé${sep}Nb décomptes${sep}Nb paiements${sep}Dernier paiement`);
    for (const m of r.marches) {
      lignes.push([
        m.reference, m.intitule, m.projet?.code ?? "", m.entreprise, m.statut,
        m.montantContratGnf, m.montantEngageGnf, m.montantPayeGnf, m.resteAPayerGnf,
        `${m.pourcentageDecaisse}%`, m.nombreDecomptes, m.nombrePaiements,
        m.dateDernierPaiement ? new Date(m.dateDernierPaiement).toLocaleDateString("fr-FR") : "",
      ].join(sep));
    }
    lignes.push("");

    // Paiements récents
    if (r.paiementsRecents.length > 0) {
      lignes.push("PAIEMENTS RÉCENTS (30 DERNIERS JOURS)");
      lignes.push(`Référence${sep}Marché${sep}Entreprise${sep}Montant (GNF)${sep}Date${sep}Statut${sep}Confirmé BCRG`);
      for (const p of r.paiementsRecents) {
        lignes.push([
          p.reference, p.marche, p.entreprise, p.montantGnf,
          p.dateOrdre ? new Date(p.dateOrdre).toLocaleDateString("fr-FR") : "",
          p.statut, p.confirmeBCRG ? "Oui" : "Non",
        ].join(sep));
      }
    }

    const csv = "\uFEFF" + lignes.join("\r\n"); // BOM pour accents Excel
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="rapport-bailleur-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);

    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "RapportBailleur", after: { format: "xlsx", bailleur: r.bailleur } });
  } catch (err) { next(err); }
});

// ─── GET /rapport-bailleur/pdf — PDF officiel ─────────────────────────────────
rapportBailleurRouter.get("/rapport-bailleur/pdf", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new Error("Non authentifié");
    const r = await calculerRapport(req.query.bailleur as string | undefined, req.query.projet as string | undefined);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="rapport-bailleur-${new Date().toISOString().slice(0, 10)}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    doc.pipe(res);

    // En-tête
    doc.rect(0, 0, 842, 60).fill("#1e3a5f");
    doc.fillColor("#fff").fontSize(13).font("Helvetica-Bold")
      .text("REPUBLIQUE DE GUINEE — AGEROUTE", 420, 12, { align: "center" });
    doc.fontSize(10).font("Helvetica")
      .text(`RAPPORT DE DÉCAISSEMENT — ${r.bailleur.toUpperCase()}`, 420, 30, { align: "center" });
    doc.fontSize(7)
      .text(r.periode.libelle, 420, 45, { align: "center" });
    doc.fillColor("#000").moveDown(2);

    // Synthèse (4 KPI)
    const ySyn = 75;
    const kpis: [string, string][] = [
      ["Contrats", `${r.synthese.nombreMarches} marchés`],
      ["Montant total", `${fmtGnf(r.synthese.montantContratTotalGnf)} GNF`],
      ["Décaissé", `${fmtGnf(r.synthese.montantPayeTotalGnf)} GNF`],
      ["% décaissé", `${r.synthese.pourcentageDecaisseGlobal}%`],
    ];
    kpis.forEach(([label, val], i) => {
      const x = 50 + i * 195;
      doc.rect(x, ySyn, 180, 40).fill("#eef4fa");
      doc.fillColor("#1e3a5f").fontSize(7).font("Helvetica").text(label, x + 10, ySyn + 8);
      doc.fontSize(9).font("Helvetica-Bold").text(val, x + 10, ySyn + 20);
    });
    doc.fillColor("#000");

    // Tableau par projet
    let y = ySyn + 55;
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#1e3a5f").text("SITUATION PAR PROJET");
    doc.font("Helvetica").fillColor("#000").fontSize(7);
    const colsP = [50, 120, 250, 340, 450, 560, 650];
    const headsP = ["Code", "Intitulé", "Nb marchés", "Contrat (GNF)", "Décaissé (GNF)", "% décaissé"];
    headsP.forEach((h, i) => doc.font("Helvetica-Bold").text(h, colsP[i], y, { width: i < 2 ? 120 : 100, align: i < 2 ? "left" : "right" }));
    doc.rect(45, y - 3, 750, 12).stroke("#ddd");
    y += 15;
    doc.font("Helvetica");
    for (const p of r.projets) {
      const vals = [p.code, p.intitule.slice(0, 25), String(p.nombreMarches), fmtGnf(p.montantContratGnf), fmtGnf(p.montantPayeGnf), `${p.pourcentageDecaisse}%`];
      vals.forEach((v, i) => doc.text(v, colsP[i], y, { width: i < 2 ? 120 : 100, align: i < 2 ? "left" : "right" }));
      y += 11;
    }

    // Tableau par marché
    y += 15;
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#1e3a5f").text("DÉTAIL PAR MARCHÉ");
    doc.font("Helvetica").fillColor("#000").fontSize(6);
    const colsM = [50, 130, 290, 400, 490, 580, 670, 730];
    const headsM = ["Référence", "Intitulé", "Entreprise", "Contrat", "Décaissé", "Reste", "%"];
    headsM.forEach((h, i) => doc.font("Helvetica-Bold").text(h, colsM[i], y, { width: i === 1 ? 150 : 80, align: i < 2 ? "left" : "right" }));
    doc.rect(45, y - 3, 750, 12).stroke("#ddd");
    y += 15;
    doc.font("Helvetica");
    for (const m of r.marches.slice(0, 25)) { // max 25 par page
      const vals = [m.reference, m.intitule.slice(0, 30), m.entreprise.slice(0, 20), fmtGnf(m.montantContratGnf), fmtGnf(m.montantPayeGnf), fmtGnf(m.resteAPayerGnf), `${m.pourcentageDecaisse}%`];
      vals.forEach((v, i) => doc.text(v, colsM[i], y, { width: i === 1 ? 150 : 80, align: i < 2 ? "left" : "right" }));
      y += 10;
    }

    // Pied
    doc.fontSize(6).fillColor("#888");
    doc.text(`Généré le ${new Date().toLocaleString("fr-FR")} — ERP AGEROUTE`, 50, doc.page.height - 30, { align: "center", width: 745 });
    doc.end();

    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "RapportBailleur", after: { format: "pdf", bailleur: r.bailleur } });
  } catch (err) { next(err); }
});
