/**
 * Module 13 — Signature électronique & génération PDF
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import PDFDocument from "pdfkit";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { formaterMontantGnf } from "../../lib/montants";

export const signatureRouter = Router();
signatureRouter.use(requireAuth);

function fmtGnf(v: bigint | number): string {
  return formaterMontantGnf(v);
}

// Signer un décompte validé
signatureRouter.post("/signer/:decompteId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const decompte = await prisma.decompte.findFirst({
      where: { id: req.params.decompteId, deletedAt: null },
      include: { marche: { include: { entreprise: true } }, entreprise: true },
    });
    if (!decompte) throw new ApiError(404, "Décompte introuvable");
    if (decompte.statut !== "VALIDE") throw new ApiError(400, "Seul un décompte validé peut être signé");

    const tokenSig = uuidv4();
    const empreinte = crypto.createHash("sha256")
      .update(`${decompte.id}|${decompte.reference}|${decompte.netAPayer}|${new Date().toISOString()}`)
      .digest("hex");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.decompte.update as any)({
      where: { id: decompte.id },
      data: { tokenSignature: tokenSig, empreinteNumerique: empreinte, dateSignature: new Date(), signataire: req.user.email },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await logAudit({ userId: req.user.id, action: "SIGN" as any, entityType: "Decompte", entityId: decompte.id });

    res.json({ tokenSignature: tokenSig, empreinteNumerique: empreinte, message: "Décompte signé électroniquement" });
  } catch (err) { next(err); }
});

// Générer le PDF officiel
signatureRouter.get("/pdf/:decompteId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const raw = await prisma.decompte.findFirst({
      where: { id: req.params.decompteId, deletedAt: null },
      include: {
        marche: { include: { entreprise: true, bpuArticles: { orderBy: { ordre: "asc" }, take: 50 } } },
        entreprise: true,
        attachements: { take: 10 },
      },
    });
    if (!raw) throw new ApiError(404, "Décompte introuvable");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decompte = raw as any;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="decompte-${decompte.reference}.pdf"`);

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    doc.pipe(res);

    // En-tête marine
    doc.rect(0, 0, 595, 80).fill("#1e3a5f");
    doc.fillColor("#ffffff").fontSize(16).font("Helvetica-Bold")
      .text("REPUBLIQUE DE GUINEE — AGEROUTE", 50, 18, { align: "center" });
    doc.fontSize(12).font("Helvetica").text("DÉCOMPTE OFFICIEL", 50, 45, { align: "center" });

    doc.fillColor("#000000").moveDown(3);

    doc.fontSize(16).font("Helvetica-Bold").fillColor("#1e3a5f")
      .text(`Décompte N° ${decompte.reference}`, { align: "center" });
    doc.fontSize(11).fillColor("#666").font("Helvetica")
      .text(`Type : ${decompte.type} — Statut : ${decompte.statut}`, { align: "center" });
    doc.moveDown(1);

    doc.fontSize(12).font("Helvetica-Bold").fillColor("#1e3a5f").text("MARCHÉ");
    doc.fontSize(10).font("Helvetica").fillColor("#000")
      .text(`Référence : ${decompte.marche.reference}`)
      .text(`Intitulé : ${decompte.marche.intitule}`)
      .text(`Financement : ${decompte.marche.financement.replace(/_/g, " ")}`)
      .text(`Montant initial : ${fmtGnf(decompte.marche.montantInitialGnf)}`);
    doc.moveDown(0.5);

    doc.fontSize(12).font("Helvetica-Bold").fillColor("#1e3a5f").text("ENTREPRISE");
    doc.fontSize(10).font("Helvetica").fillColor("#000")
      .text(`Raison sociale : ${decompte.entreprise.raisonSociale}`)
      .text(`RCCM : ${decompte.entreprise.rccm ?? "—"}`)
      .text(`NIF : ${decompte.entreprise.nif ?? "—"}`);
    doc.moveDown(1);

    doc.fontSize(12).font("Helvetica-Bold").fillColor("#1e3a5f").text("RÉCAPITULATIF FINANCIER");
    doc.moveDown(0.3);

    const montantPeriode = decompte.montantPeriodeHtGnf ?? BigInt(0);
    const lignes = [
      ["Montant période HT", fmtGnf(montantPeriode)],
      ["TVA (18%)", fmtGnf(decompte.tva)],
      ["Retenue de garantie (5%)", `- ${fmtGnf(decompte.retenueGarantie)}`],
      ["Récupération avance (20%)", `- ${fmtGnf(decompte.avanceRecuperee)}`],
      ["Pénalités", `- ${fmtGnf(decompte.penalites)}`],
      ["Révision des prix", fmtGnf(decompte.revisionPrix)],
    ];
    lignes.forEach(([label, val]) => {
      const y = doc.y;
      doc.fontSize(10).font("Helvetica").fillColor("#000")
        .text(label, 50, y, { width: 280, continued: true })
        .font("Helvetica-Bold").text(val, { align: "right" });
    });

    doc.moveTo(50, doc.y + 5).lineTo(545, doc.y + 5).stroke("#1e3a5f");
    doc.fontSize(12).font("Helvetica-Bold").fillColor("#1e3a5f")
      .text("NET À PAYER", 50, doc.y + 10, { width: 280, continued: true })
      .text(fmtGnf(decompte.netAPayer), { align: "right" });

    doc.moveDown(2);

    // Tampon signature
    if (decompte.tokenSignature) {
      const sigY = doc.y;
      doc.rect(50, sigY, 495, 75).stroke("#1e3a5f");
      doc.fontSize(9).font("Helvetica").fillColor("#333")
        .text(`Signé électroniquement par : ${decompte.signataire ?? "—"}`, 60, sigY + 8)
        .text(`Date : ${decompte.dateSignature ? new Date(decompte.dateSignature).toLocaleString("fr-GN") : "—"}`, 60)
        .text(`Empreinte : ${(decompte.empreinteNumerique ?? "").substring(0, 40)}…`, 60, undefined, { width: 480 })
        .text(`Code vérification : ${decompte.tokenSignature}`, 60);
    }

    doc.end();
  } catch (err) { next(err); }
});

// Vérifier par token (publique après auth)
signatureRouter.get("/verifier/:token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decompte = await (prisma.decompte.findFirst as any)({
      where: { tokenSignature: req.params.token },
      select: { reference: true, statut: true, netAPayer: true, dateSignature: true, signataire: true, empreinteNumerique: true, marche: { select: { reference: true, intitule: true } } },
    });
    if (!decompte) return res.status(404).json({ valide: false });
    res.json({ valide: true, decompte });
  } catch (err) { next(err); }
});
