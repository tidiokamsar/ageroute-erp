/**
 * F-DE2 — Bordereau récapitulatif cumulatif (Situation du Marché).
 * Le document officiel exigé par les bailleurs : tous les décomptes d'un
 * marché récapitulés (HT/TVA/ARMP/TTC/déductions/net), cumuls, retenues,
 * solde restant, avances récupérées et paiements effectifs.
 *
 * GET /api/marches/:id/situation-bordereau  → JSON détaillé
 * GET /api/marches/:id/situation-bordereau/pdf → PDF officiel A4
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import PDFDocument from "pdfkit";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { ApiError } from "../../middleware/error.middleware";
import { logAudit } from "../../lib/audit";
import { entrepriseIdOf } from "../../lib/scope";
import { formaterMontant } from "../../lib/montants";

export const situationBordereauRouter = Router();
situationBordereauRouter.use(requireAuth);

interface LigneDecompte {
  reference: string;
  numeroDossier?: string;
  type: string;
  statut: string;
  dateDepot: Date | null;
  montantHtGnf: bigint;
  tva: bigint;
  montantArmpGnf: bigint;
  montantTtcGnf: bigint;
  precompteTvaGnf: bigint;
  retenueGarantie: bigint;
  avanceRecuperee: bigint;
  penalites: bigint;
  netAPayer: bigint;
  dejaPaye: bigint;
}

interface SituationMarche {
  marche: {
    id: string; reference: string; intitule: string; numContrat?: string;
    financement: string; type: string; statut: string;
    montantInitialGnf: bigint; montantActualiseGnf?: bigint | null;
    dateOs?: Date; dateFinPrevue?: Date;
    entreprise: { raisonSociale: string; nif?: string | null; rccm?: string | null };
  };
  projet?: { code: string; intitule: string } | null;
  decomptes: LigneDecompte[];
  totaux: {
    nombreDecomptes: number;
    montantHtGnf: bigint;
    tva: bigint;
    montantArmpGnf: bigint;
    montantTtcGnf: bigint;
    precompteTvaGnf: bigint;
    retenueGarantie: bigint;
    avanceRecuperee: bigint;
    penalites: bigint;
    netAPayer: bigint;
    dejaPaye: bigint;
    resteAPayer: bigint;
    pourcentageConsomme: number;
    montantContratGnf: bigint;
  };
  retenues: {
    garantieCumulee: bigint;
    garantieLiberable: bigint;
    avancesRecuperees: bigint;
    penalitesCumulees: bigint;
  };
  paiements: Array<{
    reference: string | null;
    montantGnf: bigint;
    dateOrdre?: Date | null;
    dateExecution?: Date | null;
    statut: string;
    confirmePar?: string | null;
    confirmeAt?: Date | null;
    montantReelGnf?: bigint | null;
  }>;
}

async function calculerSituation(marcheId: string): Promise<SituationMarche> {
  const marche = await prisma.marche.findFirst({
    where: { id: marcheId, deletedAt: null },
    include: {
      entreprise: { select: { raisonSociale: true, nif: true, rccm: true } },
      projet: { select: { code: true, intitule: true } },
    },
  });
  if (!marche) throw new ApiError(404, "Marché introuvable");

  const decomptes = await prisma.decompte.findMany({
    where: { marcheId, deletedAt: null, statut: { not: "REJETE" } },
    orderBy: { createdAt: "asc" },
    select: {
      reference: true, numeroDossier: true, type: true, statut: true,
      dateDepot: true, montantPeriodeHtGnf: true, tva: true,
      montantArmpGnf: true, montantTtcGnf: true, precompteTvaGnf: true,
      retenueGarantie: true, avanceRecuperee: true, penalites: true,
      netAPayer: true,
      paiements: { where: { deletedAt: null }, select: { montantGnf: true } },
    },
  });

  const paiementsMarche = await prisma.paiement.findMany({
    where: { decompte: { marcheId }, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      reference: true, montantGnf: true, dateOrdre: true,
      dateExecution: true, statut: true,
      confirmePar: true, confirmeAt: true, montantReelGnf: true,
    },
  });

  const lignes: LigneDecompte[] = decomptes.map((d) => ({
    reference: d.reference,
    numeroDossier: d.numeroDossier ?? undefined,
    type: d.type,
    statut: d.statut,
    dateDepot: d.dateDepot,
    montantHtGnf: d.montantPeriodeHtGnf,
    tva: d.tva,
    montantArmpGnf: d.montantArmpGnf,
    montantTtcGnf: d.montantTtcGnf,
    precompteTvaGnf: d.precompteTvaGnf,
    retenueGarantie: d.retenueGarantie,
    avanceRecuperee: d.avanceRecuperee,
    penalites: d.penalites,
    netAPayer: d.netAPayer,
    dejaPaye: d.paiements.reduce((s: bigint, p: { montantGnf: bigint }) => s + p.montantGnf, 0n),
  }));

  const somme = (f: keyof LigneDecompte): bigint =>
    lignes.reduce((s, l) => s + (l[f] as bigint), 0n);

  const montantContrat = marche.montantActualiseGnf ?? marche.montantInitialGnf;
  const totalNet = somme("netAPayer");
  const totalPaye = somme("dejaPaye");
  const pctConsomme = montantContrat > 0n
    ? Math.round(Number((totalNet * 10000n) / montantContrat)) / 100
    : 0;

  return {
    marche: {
      id: marche.id, reference: marche.reference, intitule: marche.intitule,
      numContrat: marche.numContrat ?? undefined,
      financement: marche.financement, type: String(marche.type), statut: marche.statut,
      montantInitialGnf: marche.montantInitialGnf,
      montantActualiseGnf: marche.montantActualiseGnf,
      dateOs: marche.dateOs ?? undefined,
      dateFinPrevue: marche.dateFinPrevue ?? undefined,
      entreprise: marche.entreprise,
    },
    projet: marche.projet,
    decomptes: lignes,
    totaux: {
      nombreDecomptes: lignes.length,
      montantHtGnf: somme("montantHtGnf"),
      tva: somme("tva"),
      montantArmpGnf: somme("montantArmpGnf"),
      montantTtcGnf: somme("montantTtcGnf"),
      precompteTvaGnf: somme("precompteTvaGnf"),
      retenueGarantie: somme("retenueGarantie"),
      avanceRecuperee: somme("avanceRecuperee"),
      penalites: somme("penalites"),
      netAPayer: totalNet,
      dejaPaye: totalPaye,
      resteAPayer: totalNet - totalPaye,
      pourcentageConsomme: pctConsomme,
      montantContratGnf: montantContrat,
    },
    retenues: {
      garantieCumulee: somme("retenueGarantie"),
      garantieLiberable: somme("retenueGarantie") / 2n, // 50% à la réception provisoire (usage)
      avancesRecuperees: somme("avanceRecuperee"),
      penalitesCumulees: somme("penalites"),
    },
    paiements: paiementsMarche,
  };
}

function fmtGnf(v: bigint | number): string {
  return formaterMontant(v);
}

// ─── GET /:marcheId/situation-bordereau — JSON ────────────────────────────────
situationBordereauRouter.get("/:marcheId/situation-bordereau", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Isolation entreprise
    if (req.user?.role === "ENTREPRISE") {
      const m = await prisma.marche.findUnique({ where: { id: req.params.marcheId }, select: { entrepriseId: true } });
      if (!m || m.entrepriseId !== (await entrepriseIdOf(req.user.id))) {
        throw new ApiError(404, "Marché introuvable");
      }
    }
    const situation = await calculerSituation(req.params.marcheId);
    // Sérialiser les BigInt
    const serialise = JSON.parse(JSON.stringify(situation, (_, v) => typeof v === "bigint" ? v.toString() : v));
    res.json(serialise);
  } catch (err) { next(err); }
});

// ─── GET /:marcheId/situation-bordereau/pdf — PDF officiel ────────────────────
situationBordereauRouter.get("/:marcheId/situation-bordereau/pdf", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const s = await calculerSituation(req.params.marcheId);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="situation-${s.marche.reference}-${new Date().toISOString().slice(0, 10)}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.pipe(res);

    // ── En-tête officiel ──
    doc.rect(0, 0, 595, 70).fill("#1e3a5f");
    doc.fillColor("#ffffff").fontSize(14).font("Helvetica-Bold")
      .text("REPUBLIQUE DE GUINEE — AGEROUTE", 50, 15, { align: "center" });
    doc.fontSize(11).font("Helvetica").text("BORDEREAU RÉCAPITULATIF CUMULATIF", 50, 35, { align: "center" });
    doc.fontSize(8).text("Situation du Marché — Document Officiel", 50, 50, { align: "center" });
    doc.fillColor("#000000").moveDown(2);

    // ── Identification du marché ──
    const y0 = doc.y;
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#1e3a5f").text("IDENTIFICATION DU MARCHÉ");
    doc.font("Helvetica").fillColor("#000").fontSize(8);
    const identite = [
      ["Référence", s.marche.reference],
      ["Intitulé", s.marche.intitule],
      ["N° Contrat", s.marche.numContrat ?? "—"],
      ["Entreprise", s.marche.entreprise.raisonSociale],
      ["NIF", s.marche.entreprise.nif ?? "—"],
      ["Financement", s.marche.financement.replace(/_/g, " ")],
      ["Montant contrat", `${fmtGnf(s.totaux.montantContratGnf)} GNF`],
      ["Statut", s.marche.statut],
    ] as [string, string][];
    identite.forEach(([k, v], i) => {
      const y = y0 + 20 + i * 12;
      doc.font("Helvetica-Bold").text(`${k} :`, 50, y, { width: 120, continued: true })
        .font("Helvetica").text(v, { width: 420 });
    });
    doc.moveDown(1);

    // ── Tableau des décomptes ──
    const yTab = doc.y + 10;
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#1e3a5f").text("DÉCOMPTES (ordre chronologique)");
    doc.font("Helvetica").fillColor("#000");

    const cols = [
      { label: "N° Dossier", w: 70 },
      { label: "Référence", w: 70 },
      { label: "Type", w: 50 },
      { label: "Date", w: 50 },
      { label: "HT (GNF)", w: 70 },
      { label: "TTC (GNF)", w: 70 },
      { label: "Retenue", w: 60 },
      { label: "Net à payer", w: 70 },
      { label: "Payé", w: 60 },
    ];
    let x = 45;
    doc.fontSize(6).font("Helvetica-Bold");
    doc.rect(40, yTab, 515, 14).fill("#f0f0f0");
    cols.forEach((c) => {
      doc.fillColor("#333").text(c.label, x, yTab + 4, { width: c.w, align: "right" });
      x += c.w;
    });

    let y = yTab + 18;
    doc.font("Helvetica").fontSize(6);
    s.decomptes.forEach((d, idx) => {
      if (idx % 2 === 0) doc.rect(40, y - 2, 515, 12).fill("#fafafa");
      x = 45;
      const vals = [
        d.numeroDossier ?? "—", d.reference, d.type.slice(0, 6),
        new Date(d.dateDepot ?? new Date()).toLocaleDateString("fr-FR"),
        fmtGnf(d.montantHtGnf), fmtGnf(d.montantTtcGnf),
        fmtGnf(d.retenueGarantie), fmtGnf(d.netAPayer), fmtGnf(d.dejaPaye),
      ];
      vals.forEach((v, ci) => {
        doc.fillColor("#333").text(v, x, y, { width: cols[ci].w, align: "right" });
        x += cols[ci].w;
      });
      y += 12;
    });

    // ── Totaux ──
    y += 10;
    doc.moveTo(40, y).lineTo(555, y).stroke("#1e3a5f");
    y += 5;
    const totaux = [
      ["TOTAL HT", s.totaux.montantHtGnf],
      ["TOTAL TVA", s.totaux.tva],
      ["TOTAL ARMP", s.totaux.montantArmpGnf],
      ["TOTAL TTC", s.totaux.montantTtcGnf],
      ["Précomptes TVA", s.totaux.precompteTvaGnf],
      ["Retenues de garantie", s.totaux.retenueGarantie],
      ["Avances récupérées", s.totaux.avanceRecuperee],
      ["Pénalités", s.totaux.penalites],
    ] as [string, bigint][];
    totaux.forEach(([label, val], i) => {
      const col = i % 2;
      const xPos = 50 + col * 260;
      const yPos = y + Math.floor(i / 2) * 14;
      doc.font("Helvetica").fontSize(7).fillColor("#555").text(`${label} :`, xPos, yPos, { width: 100, continued: true })
        .font("Helvetica-Bold").fillColor("#000").text(fmtGnf(val), { width: 140, align: "right" });
    });
    y += Math.ceil(totaux.length / 2) * 14 + 10;

    // ── Net à payer et solde ──
    doc.rect(40, y, 515, 50).fill("#eef4fa");
    doc.fillColor("#1e3a5f").fontSize(9).font("Helvetica-Bold");
    doc.text(`NET À PAYER CUMULÉ : ${fmtGnf(s.totaux.netAPayer)} GNF`, 55, y + 8);
    doc.text(`DÉJÀ PAYÉ : ${fmtGnf(s.totaux.dejaPaye)} GNF`, 55, y + 22);
    doc.text(`RESTE À PAYER : ${fmtGnf(s.totaux.resteAPayer)} GNF`, 55, y + 36);
    doc.fontSize(8).text(`Consommé : ${s.totaux.pourcentageConsomme}% du contrat`, 350, y + 8);
    doc.text(`Décomptes : ${s.totaux.nombreDecomptes}`, 350, y + 22);
    doc.text(`Paiements : ${s.paiements.length}`, 350, y + 36);
    y += 60;

    // ── Retenues ──
    doc.fillColor("#000").fontSize(8).font("Helvetica-Bold").text("SITUATION DES RETENUES ET RETENUES");
    doc.font("Helvetica").fontSize(7);
    const ret = [
      ["Retenue de garantie cumulée", s.retenues.garantieCumulee],
      ["  dont libérable (50% réception prov.)", s.retenues.garantieLiberable],
      ["Avances récupérées cumulées", s.retenues.avancesRecuperees],
      ["Pénalités cumulées", s.retenues.penalitesCumulees],
    ] as [string, bigint][];
    ret.forEach(([label, val], i) => {
      doc.text(`${label} :`, 55, y + 5 + i * 11, { width: 200, continued: true })
        .font("Helvetica-Bold").text(`${fmtGnf(val)} GNF`, { width: 120, align: "right" });
      doc.font("Helvetica");
    });
    y += ret.length * 11 + 15;

    // ── Paiements ──
    if (s.paiements.length > 0) {
      doc.fontSize(8).font("Helvetica-Bold").text("PAIEMENTS EFFECTUÉS");
      doc.font("Helvetica").fontSize(7);
      s.paiements.forEach((p, i) => {
        const conf = p.confirmeAt ? ` ✓ Confirmé BCRG (${p.confirmePar})` : " ⏳ En attente BCRG";
        doc.text(
          `${p.reference} — ${fmtGnf(p.montantGnf)} GNF — ${new Date(p.dateOrdre ?? p.dateExecution ?? new Date()).toLocaleDateString("fr-FR")}${conf}`,
          55, y + 5 + i * 10
        );
      });
      y += s.paiements.length * 10 + 15;
    }

    // ── Pied de page ──
    doc.fontSize(6).fillColor("#888");
    doc.text(`Généré le ${new Date().toLocaleString("fr-FR")} par ERP AGEROUTE — Document officiel`, 50, doc.page.height - 40, { align: "center", width: 495 });
    doc.text(`Chef Mission de contrôle          Direction Technique          DAF          DG`, 50, doc.page.height - 55, { align: "center", width: 495 });

    doc.end();
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "Marche", entityId: req.params.marcheId, after: { document: "situation-bordereau-pdf" } });
  } catch (err) { next(err); }
});
