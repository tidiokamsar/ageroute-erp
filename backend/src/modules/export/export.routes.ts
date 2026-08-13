import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/error.middleware";

export const exportRouter = Router();
exportRouter.use(requireAuth);

function fmtGnf(v: bigint | number | string | null | undefined): string {
  if (v == null) return "";
  return Number(v).toLocaleString("fr-FR");
}

function csvRow(arr: (string | number | null | undefined)[]): string {
  return arr.map(v => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
  }).join(",");
}

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [headers.join(","), ...rows.map(csvRow)].join("\r\n");
}

function sendCsv(res: Response, filename: string, csv: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send("﻿" + csv); // BOM pour Excel
}

// ─── Export marchés ───────────────────────────────────────────────────────────
exportRouter.get("/marches", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { statut, entrepriseId } = req.query;
    const where: Record<string, unknown> = { deletedAt: null };
    if (statut) where.statut = statut;
    if (entrepriseId) where.entrepriseId = entrepriseId;

    const marchés = await prisma.marche.findMany({
      where,
      include: { entreprise: { select: { raisonSociale: true } } },
      orderBy: { createdAt: "desc" },
    });

    const headers = ["Référence", "Intitulé", "Entreprise", "Statut", "Montant initial (GNF)", "Montant actualisé (GNF)", "Date signature", "Date notification", "Créé le"];
    const rows = marchés.map(m => [
      m.reference, m.intitule, m.entreprise?.raisonSociale ?? "",
      m.statut, fmtGnf(m.montantInitialGnf), fmtGnf(m.montantActualiseGnf),
      m.dateSignature ? new Date(m.dateSignature).toLocaleDateString("fr-FR") : "",
      m.dateNotification ? new Date(m.dateNotification).toLocaleDateString("fr-FR") : "",
      new Date(m.createdAt).toLocaleDateString("fr-FR"),
    ]);
    sendCsv(res, `marches_${new Date().toISOString().split("T")[0]}.csv`, toCsv(headers, rows));
  } catch (err) { next(err); }
});

// ─── Export décomptes ─────────────────────────────────────────────────────────
exportRouter.get("/decomptes", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { statut, marcheId } = req.query;
    const where: Record<string, unknown> = { deletedAt: null };
    if (statut) where.statut = statut;
    if (marcheId) where.marcheId = marcheId;

    const decomptes = await prisma.decompte.findMany({
      where,
      include: { marche: { select: { reference: true, entreprise: { select: { raisonSociale: true } } } } },
      orderBy: { createdAt: "desc" },
    });

    const headers = ["Référence", "Marché", "Entreprise", "Type", "Statut", "Montant HT (GNF)", "Net à payer (GNF)", "Date dépôt", "Date paiement"];
    const rows = decomptes.map(d => [
      d.reference, d.marche?.reference ?? "", d.marche?.entreprise?.raisonSociale ?? "",
      d.type, d.statut, fmtGnf(d.montantTtcGnf), fmtGnf(d.netAPayer),
      new Date(d.createdAt).toLocaleDateString("fr-FR"),
      d.datePaiement ? new Date(d.datePaiement).toLocaleDateString("fr-FR") : "",
    ]);
    sendCsv(res, `decomptes_${new Date().toISOString().split("T")[0]}.csv`, toCsv(headers, rows));
  } catch (err) { next(err); }
});

// ─── Export entreprises ───────────────────────────────────────────────────────
exportRouter.get("/entreprises", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entreprises = await prisma.entreprise.findMany({
      where: { deletedAt: null },
      orderBy: { raisonSociale: "asc" },
    });

    const headers = ["Raison sociale", "NIF", "RCCM", "Email", "Téléphone", "Statut", "Score conformité", "Créé le"];
    const rows = entreprises.map(e => [
      e.raisonSociale, e.nif ?? "", e.rccm ?? "", e.email ?? "", e.telephone ?? "",
      e.statut, e.scoreConformite ?? "",
      new Date(e.createdAt).toLocaleDateString("fr-FR"),
    ]);
    sendCsv(res, `entreprises_${new Date().toISOString().split("T")[0]}.csv`, toCsv(headers, rows));
  } catch (err) { next(err); }
});

// ─── Export paiements ─────────────────────────────────────────────────────────
exportRouter.get("/paiements", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { statut } = req.query;
    const where: Record<string, unknown> = {};
    if (statut) where.statut = statut;

    const paiements = await prisma.paiement.findMany({
      where,
      include: { decompte: { select: { reference: true, marche: { select: { reference: true } } } } },
      orderBy: { createdAt: "desc" },
    });

    const headers = ["Référence virement", "Décompte", "Marché", "Circuit", "Banque", "Montant (GNF)", "Statut", "Date ordre", "Date exécution", "Réf DNTCP"];
    const rows = paiements.map(p => [
      p.reference ?? "", p.decompte?.reference ?? "", p.decompte?.marche?.reference ?? "",
      (p as any).typeCircuit ?? "", (p as any).banque ?? "", fmtGnf(p.montantGnf),
      (p as any).statut ?? "",
      (p as any).dateOrdre ? new Date((p as any).dateOrdre).toLocaleDateString("fr-FR") : "",
      (p as any).dateExecution ? new Date((p as any).dateExecution).toLocaleDateString("fr-FR") : "",
      (p as any).refDntcp ?? "",
    ]);
    sendCsv(res, `paiements_${new Date().toISOString().split("T")[0]}.csv`, toCsv(headers, rows));
  } catch (err) { next(err); }
});

// ─── Export garanties ─────────────────────────────────────────────────────────
exportRouter.get("/garanties", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const garanties = await prisma.garantie.findMany({
      include: { marche: { select: { reference: true, entreprise: { select: { raisonSociale: true } } } } },
      orderBy: { createdAt: "desc" },
    });

    const headers = ["Marché", "Entreprise", "Type", "Émetteur", "Numéro", "Montant (GNF)", "Date émission", "Date expiration", "Active"];
    const rows = garanties.map(g => [
      g.marche?.reference ?? "", g.marche?.entreprise?.raisonSociale ?? "",
      g.type, g.banque ?? "", g.reference ?? "", fmtGnf(g.montantGnf),
      g.dateEmission ? new Date(g.dateEmission).toLocaleDateString("fr-FR") : "",
      g.dateExpiration ? new Date(g.dateExpiration).toLocaleDateString("fr-FR") : "",
      g.active ? "Oui" : "Non",
    ]);
    sendCsv(res, `garanties_${new Date().toISOString().split("T")[0]}.csv`, toCsv(headers, rows));
  } catch (err) { next(err); }
});
