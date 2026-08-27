/**
 * F-UX1 — Documents officiels AGEROUTE avec logo réel.
 * Trois PDF normalisés au même gabarit : décompte, attachement, PV réception.
 * Chaque document suit le format officiel exigé par les bailleurs.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { ApiError } from "../../middleware/error.middleware";
import { logAudit } from "../../lib/audit";
import { entrepriseIdOf } from "../../lib/scope";
import { assertMarcheAutorise } from "../../lib/perimetre";
import { creerDocumentOfficiel, ajouterPiedDePage, ajouterEncadreSynthese, ajouterTableau } from "../../lib/pdf-gabarit";
import { formaterMontant } from "../../lib/montants";
import { assainirTexte, tronquer } from "../../lib/pdf-dossier";

export const documentsOfficielsRouter = Router();
documentsOfficielsRouter.use(requireAuth);

function fmtGnf(v: bigint | number | null | undefined): string {
  return formaterMontant(v);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/documents/decompte/:id/pdf — Décompte officiel avec lignes BPU
// ═══════════════════════════════════════════════════════════════════════════════
documentsOfficielsRouter.get("/decompte/:id/pdf", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const d = await prisma.decompte.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        marche: { include: { entreprise: true, projet: true } },
        lignesDecompte: { orderBy: { createdAt: "asc" as const } },
        paiements: { where: { deletedAt: null } },
      },
    });
    if (!d) throw new ApiError(404, "Décompte introuvable");

    // Isolation entreprise
    if (req.user.role === "ENTREPRISE" && d.entrepriseId !== (await entrepriseIdOf(req.user.id))) {
      throw new ApiError(404, "Décompte introuvable");
    }
    // Périmètre d'affectation (revue 20/08/2026) : un agent scopé non affecté
    // ne génère pas le PDF officiel d'un marché hors de son périmètre.
    await assertMarcheAutorise(req, d.marcheId);

    const doc = creerDocumentOfficiel({
      titre: "Décompte Officiel",
      sousTitre: `${d.type.replace(/_/g, " ")} — ${d.marche.reference}`,
      reference: d.reference,
    });

    // ── Identification ──
    let y = ajouterEncadreSynthese(doc, [
      ["N° Dossier", d.numeroDossier ?? "—"],
      ["Marché", d.marche.reference],
      ["Entreprise", d.marche.entreprise.raisonSociale],
      ["Projet", d.marche.projet?.intitule ?? "—"],
      ["Financement", d.marche.financement.replace(/_/g, " ")],
      ["Statut", d.statut],
      ["Date dépôt", d.dateDepot ? new Date(d.dateDepot).toLocaleDateString("fr-FR") : "—"],
    ], 100);

    // ── Récapitulatif financier ──
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#1e3a5f").text("RÉCAPITULATIF FINANCIER");
    y = ajouterEncadreSynthese(doc, [
      ["Montant HT de la période", `${fmtGnf(d.montantPeriodeHtGnf)} GNF`],
      ["TVA", `${fmtGnf(d.tva)} GNF`],
      ["ARMP (0,6 %)", `${fmtGnf(d.montantArmpGnf)} GNF`],
      ["Total TTC", `${fmtGnf(d.montantTtcGnf)} GNF`],
      ["Précompte TVA", `${assainirTexte("−")} ${fmtGnf(d.precompteTvaGnf)} GNF`],
      ["Retenue de garantie", `${assainirTexte("−")} ${fmtGnf(d.retenueGarantie)} GNF`],
      ["Avance récupérée", `${assainirTexte("−")} ${fmtGnf(d.avanceRecuperee)} GNF`],
      ["Pénalités", `${assainirTexte("−")} ${fmtGnf(d.penalites)} GNF`],
      ["Révision des prix", `+ ${fmtGnf(d.revisionPrix)} GNF`],
    ], y + 5);

    // Net à payer en encadré doré
    doc.rect(40, y, 515, 25).fill("#F0A500");
    doc.fillColor("#1e3a5f").fontSize(11).font("Helvetica-Bold")
      .text(`NET À PAYER : ${fmtGnf(d.netAPayer)} GNF`, 55, y + 7);

    // Solde
    const dejaPaye = d.paiements.reduce((s: bigint, p: { montantGnf: bigint }) => s + p.montantGnf, 0n);
    y += 35;
    doc.fontSize(8).font("Helvetica").fillColor("#555");
    doc.text(`Déjà payé : ${fmtGnf(dejaPaye)} GNF`, 55, y);
    doc.text(`Reste à payer : ${fmtGnf(d.netAPayer - dejaPaye)} GNF`, 250, y);

    // ── Lignes BPU ──
    if (d.lignesDecompte.length > 0) {
      y += 20;
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#1e3a5f").text("DÉTAIL DES LIGNES (BPU)");
      y = ajouterTableau(doc, [
        { label: "Code", largeur: 60, align: "left" },
        { label: "Désignation", largeur: 130, align: "left" },
        { label: "Utile", largeur: 30, align: "center" },
        { label: "Qté", largeur: 40, align: "right" },
        { label: "P.U. GNF", largeur: 55, align: "right" },
        { label: "HT GNF", largeur: 60, align: "right" },
        { label: "TTC GNF", largeur: 60, align: "right" },
        { label: "Net GNF", largeur: 60, align: "right" },
      ], d.lignesDecompte.map((l) => [
        l.codeArticle ?? "—",
        tronquer(l.designation ?? "", 22),
        l.unite ?? "—",
        String(l.quantiteCourante ?? 0),
        fmtGnf(l.prixUnitaire),
        fmtGnf(l.montantBrut),
        fmtGnf(l.montantTtc),
        fmtGnf(l.montantNet),
      ]), y);
    }

    // ── Signatures ──
    ajouterPiedDePage(doc, [
      { role: "Mission de contrôle" },
      { role: "Direction Technique" },
      { role: "DMC" },
      { role: "DAF" },
      { role: "DG" },
    ]);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="decompte-${d.reference}.pdf"`);
    doc.pipe(res);
    doc.end();
    await logAudit({ userId: req.user.id, action: "EXPORT", entityType: "Decompte", entityId: d.id, after: { document: "pdf-officiel" } });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/documents/attachement/:id/pdf — Attachement officiel avec GPS/photos
// ═══════════════════════════════════════════════════════════════════════════════
documentsOfficielsRouter.get("/attachement/:id/pdf", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const a = await prisma.attachement.findFirst({
      where: { id: req.params.id },
      include: {
        decompte: { include: { marche: { include: { entreprise: true } } } },
        lignes: true,
        pointsGPS: true,
        medias: true,
      },
    });
    if (!a) throw new ApiError(404, "Attachement introuvable");

    if (req.user.role === "ENTREPRISE") {
      const dec = a.decompte;
      if (!dec || dec.entrepriseId !== (await entrepriseIdOf(req.user.id))) {
        throw new ApiError(404, "Attachement introuvable");
      }
    }
    // Périmètre d'affectation (revue 20/08/2026) — voir route décompte.
    if (a.decompte) await assertMarcheAutorise(req, a.decompte.marcheId);

    const doc = creerDocumentOfficiel({
      titre: "Attachement contradictoire",
      sousTitre: `${a.typeAttachement} — ${a.decompte?.marche.reference ?? ""}`,
      reference: a.code ?? a.id.slice(0, 8),
    });

    let y = ajouterEncadreSynthese(doc, [
      ["Code", a.code ?? "—"],
      ["Marché", a.decompte?.marche.reference ?? "—"],
      ["Entreprise", a.decompte?.marche.entreprise.raisonSociale ?? "—"],
      ["Nature des travaux", a.natureTravaux],
      ["Période", a.periodeDebut ? `${new Date(a.periodeDebut).toLocaleDateString("fr-FR")} → ${a.periodeFin ? new Date(a.periodeFin).toLocaleDateString("fr-FR") : "—"}` : "—"],
      ["Statut", a.statut],
      ["Validé Mission", a.valideParMission ? "Oui" : "Non"],
      ["Validé Technique", a.valideParTechnique ? "Oui" : "Non"],
    ], 100);

    // ── Localisation ──
    if (a.latGps && a.lonGps) {
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#1e3a5f").text("LOCALISATION GPS");
      y = ajouterEncadreSynthese(doc, [
        ["Latitude", String(a.latGps)],
        ["Longitude", String(a.lonGps)],
        ["Ouvage / Section", `${a.ouvrage ?? "—"} / ${a.section ?? "—"}`],
        ["PK", a.pkDebut ? `${a.pkDebut} → ${a.pkFin ?? "—"}` : "—"],
      ], y + 5);
    }

    // ── Lignes de mesures ──
    if (a.lignes.length > 0) {
      y += 10;
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#1e3a5f").text("LIGNES DE MESURES");
      y = ajouterTableau(doc, [
        { label: "Article BPU", largeur: 70 },
        { label: "Désignation", largeur: 150 },
        { label: "Utile", largeur: 30, align: "center" },
        { label: "Prévu", largeur: 40, align: "right" },
        { label: "Précédent", largeur: 50, align: "right" },
        { label: "Courant", largeur: 40, align: "right" },
        { label: "Cumulé", largeur: 40, align: "right" },
      ], a.lignes.map((l) => [
        l.codeArticle ?? "—",
        tronquer(l.designation ?? "", 25),
        l.unite ?? "—",
        String(l.quantiteContrat ?? 0),
        String(l.quantitePrecedent ?? 0),
        String(l.quantiteCourante ?? 0),
        String(l.quantiteCumulee ?? 0),
      ]), y);
    }

    // ── Points GPS relevés ──
    if (a.pointsGPS.length > 0) {
      y += 10;
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#1e3a5f").text("POINTS GPS RELEVÉS SUR LE TERRAIN");
      y = ajouterTableau(doc, [
        { label: "#", largeur: 20, align: "center" },
        { label: "Latitude", largeur: 80, align: "right" },
        { label: "Longitude", largeur: 80, align: "right" },
        { label: "Précision (m)", largeur: 60, align: "right" },
        { label: "Horodatage", largeur: 100 },
      ], a.pointsGPS.map((p, i) => [
        String(i + 1),
        String(p.latitude ?? "—"),
        String(p.longitude ?? "—"),
        String(p.precision ?? "—"),
        p.createdAt ? new Date(p.createdAt).toLocaleString("fr-FR") : "—",
      ]), y);
    }

    // ── Synthèse financière ──
    y += 10;
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#1e3a5f").text("SYNTHÈSE FINANCIÈRE");
    y = ajouterEncadreSynthese(doc, [
      ["Montant HT", `${fmtGnf(a.montantHtGnf)} GNF`],
      ["TVA estimée (18 %)", `${fmtGnf(a.montantTvaGnf)} GNF`],
      ["Total TTC estimé", `${fmtGnf(a.montantTtcGnf)} GNF`],
      ["Statut validation", a.valide ? "✓ VALIDÉ" : "EN ATTENTE"],
    ], y + 5);

    // ── Photos (liste) ──
    if (a.medias.length > 0) {
      y += 10;
      doc.fontSize(8).font("Helvetica").fillColor("#555");
      doc.text(`Photos jointes : ${a.medias.length} média(s) — consultables dans l'application`);
    }

    // ── Signatures ──
    ajouterPiedDePage(doc, [
      { role: "Représentant Entreprise" },
      { role: "Mission de contrôle" },
      { role: "Direction Technique" },
    ]);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="attachement-${a.code ?? a.id.slice(0, 8)}.pdf"`);
    doc.pipe(res);
    doc.end();
    await logAudit({ userId: req.user.id, action: "EXPORT", entityType: "Attachement", entityId: a.id, after: { document: "pdf-officiel" } });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/documents/reception/:id/pdf — PV de réception officiel
// ═══════════════════════════════════════════════════════════════════════════════
documentsOfficielsRouter.get("/reception/:id/pdf", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const r = await prisma.reception.findFirst({
      where: { id: req.params.id },
      include: { marche: { include: { entreprise: true } } },
    });
    if (!r) throw new ApiError(404, "Réception introuvable");

    if (req.user.role === "ENTREPRISE" && r.marche.entrepriseId !== (await entrepriseIdOf(req.user.id))) {
      throw new ApiError(404, "Réception introuvable");
    }
    // Périmètre d'affectation (revue 20/08/2026) — voir route décompte.
    await assertMarcheAutorise(req, r.marcheId);

    const TYPE_LABEL: Record<string, string> = {
      OPR: "Ordre de Pré-Réception (OPR)",
      PROVISOIRE: "Réception Provisoire",
      DEFINITIVE: "Réception Définitive",
    };

    const doc = creerDocumentOfficiel({
      titre: "Procès-Verbal de Réception",
      sousTitre: TYPE_LABEL[r.type] ?? r.type,
      reference: r.pvNumero ?? r.id.slice(0, 8),
    });

    let y = ajouterEncadreSynthese(doc, [
      ["Type", TYPE_LABEL[r.type] ?? r.type],
      ["Marché", r.marche.reference],
      ["Entreprise", r.marche.entreprise.raisonSociale],
      ["N° PV", r.pvNumero ?? "—"],
      ["Date prévue", r.datePrevu ? new Date(r.datePrevu).toLocaleDateString("fr-FR") : "—"],
      ["Date réelle", r.dateReelle ? new Date(r.dateReelle).toLocaleDateString("fr-FR") : "—"],
      ["Statut", r.statut],
    ], 100);

    // ── Participants ──
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#1e3a5f").text("PARTICIPANTS");
    y = ajouterEncadreSynthese(doc, [
      ["Entreprise", r.presentsEntreprise ?? "—"],
      ["AGEROUTE", r.presentsAgeroute ?? "—"],
      ["Autres (bailleur, bureau)", r.presentsAutres ?? "—"],
    ], y + 5);

    // ── Réserves ──
    if (r.reserves && Array.isArray(r.reserves)) {
      y += 10;
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#1e3a5f").text("RÉSERVES ÉMISES");
      const reserves = r.reserves as string[];
      if (reserves.length === 0) {
        doc.fontSize(8).font("Helvetica").fillColor("#555").text("Aucune réserve — travaux conformes au marché");
      } else {
        doc.fontSize(8).font("Helvetica").fillColor("#555");
        // Assainies (glyphes WinAnsi) et PAGINÉES : à coordonnées fixes, une
        // longue liste de réserves sortait sous le bord et se perdait.
        const LIMITE_BASSE = doc.page.height - doc.page.margins.bottom - 30;
        let yr = y + 5;
        reserves.forEach((res, i) => {
          if (yr > LIMITE_BASSE) { doc.addPage(); doc.fontSize(8).font("Helvetica").fillColor("#555"); yr = doc.page.margins.top; }
          doc.text(`${i + 1}. ${assainirTexte(String(res))}`, 55, yr);
          yr += 12;
        });
        y = Math.min(yr, LIMITE_BASSE) + 10;
      }
    }

    // ── Signatures ──
    ajouterPiedDePage(doc, [
      { role: "Entreprise" },
      { role: "Direction Technique" },
      { role: "Mission de contrôle" },
      { role: "DG (si définitive)" },
    ]);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="pv-reception-${r.pvNumero ?? r.id.slice(0, 8)}.pdf"`);
    doc.pipe(res);
    doc.end();
    await logAudit({ userId: req.user.id, action: "EXPORT", entityType: "Reception", entityId: r.id, after: { document: "pdf-officiel" } });
  } catch (err) { next(err); }
});
