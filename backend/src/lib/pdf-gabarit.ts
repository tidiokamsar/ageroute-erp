/**
 * F-UX1 — Gabarit PDF officiel AGEROUTE.
 * Module partagé pour TOUS les documents PDF de l'ERP : décomptes,
 * attachements, PV de réception, bordereaux, rapports bailleurs.
 *
 * Utilise le logo officiel AGEROUTE (assets/ageroute-logo-pdf.jpg).
 * En-tête : logo + République de Guinée + titre du document.
 * Pied de page : espaces de signature + horodatage.
 */
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

const CHEMIN_LOGO = path.join(__dirname, "..", "assets", "ageroute-logo-pdf.jpg");

export interface OptionsGabarit {
  titre: string;
  sousTitre?: string;
  reference?: string;
  landscape?: boolean;
}

export interface Signataire {
  role: string;
  nom?: string;
}

/**
 * Crée un PDFDocument avec l'en-tête officiel AGEROUTE (logo réel).
 * Retourne le document prêt à recevoir du contenu.
 */
export function creerDocumentOfficiel(opts: OptionsGabarit): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    margin: 40,
    size: "A4",
    layout: opts.landscape ? "landscape" : "portrait",
    info: {
      Title: opts.titre,
      Author: "AGEROUTE Guinée",
      Subject: opts.sousTitre ?? "",
      Creator: "ERP AGEROUTE",
    },
  });

  // ── Bande supérieure bleue ──
  const largeur = opts.landscape ? 842 : 595;
  doc.rect(0, 0, largeur, 85).fill("#1e3a5f");

  // ── Logo AGEROUTE (à gauche) ──
  if (fs.existsSync(CHEMIN_LOGO)) {
    doc.image(CHEMIN_LOGO, 35, 12, { fit: [60, 60] });
  }

  // ── Texte en-tête (centré, décalé pour laisser place au logo) ──
  const centreX = opts.landscape ? 421 : 297;
  doc.fillColor("#F0A500").fontSize(11).font("Helvetica-Bold")
    .text("REPUBLIQUE DE GUINEE", centreX, 15, { align: "center" });
  doc.fillColor("#ffffff").fontSize(13)
    .text("AGEROUTE", centreX, 30, { align: "center" });
  doc.fontSize(7).font("Helvetica")
    .text("Agence de Gestion des Routes", centreX, 46, { align: "center" });

  // ── Titre du document ──
  doc.fontSize(10).font("Helvetica-Bold").fillColor("#F0A500")
    .text(opts.titre.toUpperCase(), centreX, 60, { align: "center" });
  if (opts.sousTitre) {
    doc.fontSize(7).font("Helvetica").fillColor("#cccccc")
      .text(opts.sousTitre, centreX, 72, { align: "center" });
  }

  // ── Référence (coin droit) ──
  if (opts.reference) {
    doc.fontSize(7).font("Helvetica").fillColor("#aaaaaa")
      .text(`Réf : ${opts.reference}`, largeur - 150, 15, { width: 130, align: "right" });
  }

  // ── Ligne de séparation dorée ──
  doc.moveTo(0, 85).lineTo(largeur, 85).strokeColor("#F0A500").lineWidth(2).stroke();

  // ── Retour au noir pour le contenu ──
  doc.fillColor("#000000").moveDown(3);

  return doc;
}

/**
 * Ajoute le pied de page officiel avec espaces de signature.
 */
export function ajouterPiedDePage(doc: PDFKit.PDFDocument, signataires: Signataire[]): void {
  const largeur = doc.page.width;
  const hauteur = doc.page.height;
  const nb = signataires.length;
  const espacement = (largeur - 80) / nb;

  // Ligne de séparation
  doc.moveTo(40, hauteur - 80).lineTo(largeur - 40, hauteur - 80).strokeColor("#ddd").lineWidth(1).stroke();

  // Espaces de signature
  doc.fontSize(6).font("Helvetica").fillColor("#555");
  signataires.forEach((sig, i) => {
    const x = 40 + i * espacement + espacement / 2;
    doc.text(sig.role, x - espacement / 2 + 10, hauteur - 75, { width: espacement - 20, align: "center" });
    doc.moveTo(x - espacement / 2 + 15, hauteur - 40).lineTo(x + espacement / 2 - 15, hauteur - 40)
      .strokeColor("#999").lineWidth(0.5).stroke();
    doc.fontSize(5).text("Nom et signature", x - espacement / 2 + 10, hauteur - 35, { width: espacement - 20, align: "center" });
  });

  // Horodatage
  doc.fontSize(5).fillColor("#999").font("Helvetica")
    .text(`Généré le ${new Date().toLocaleString("fr-FR")} par ERP AGEROUTE — Document officiel`, 40, hauteur - 15, { width: largeur - 80, align: "center" });
}

/**
 * Ajoute un encadré de synthèse (fond bleu clair) avec des paires clé/valeur.
 */
export function ajouterEncadreSynthese(
  doc: PDFKit.PDFDocument,
  donnees: Array<[string, string]>,
  y: number,
): number {
  const largeur = doc.page.width - 80;
  const hauteur = donnees.length * 14 + 10;
  doc.rect(40, y, largeur, hauteur).fill("#eef4fa");
  doc.fillColor("#1e3a5f");

  donnees.forEach(([cle, valeur], i) => {
    const yPos = y + 8 + i * 14;
    doc.font("Helvetica").fontSize(8).fillColor("#555")
      .text(`${cle} :`, 55, yPos, { width: 180, continued: true });
    doc.font("Helvetica-Bold").fillColor("#1e3a5f")
      .text(valeur, { width: largeur - 200, align: "right" });
  });

  return y + hauteur + 10;
}

/**
 * Ajoute un tableau simple avec en-têtes et lignes.
 */
export function ajouterTableau(
  doc: PDFKit.PDFDocument,
  colonnes: Array<{ label: string; largeur: number; align?: "left" | "right" | "center" }>,
  lignes: Array<string[]>,
  y: number,
): number {
  const x0 = 40;
  const hauteurLigne = 12;

  // En-tête
  doc.rect(x0, y, colonnes.reduce((s, c) => s + c.largeur, 0), hauteurLigne + 4).fill("#f0f0f0");
  let x = x0;
  doc.fontSize(6).font("Helvetica-Bold").fillColor("#333");
  colonnes.forEach((c) => {
    doc.text(c.label, x + 2, y + 3, { width: c.largeur - 4, align: c.align ?? "left" });
    x += c.largeur;
  });

  // Lignes
  let yPos = y + hauteurLigne + 6;
  doc.font("Helvetica").fontSize(6);
  lignes.forEach((ligne, li) => {
    if (li % 2 === 0) doc.rect(x0, yPos - 2, colonnes.reduce((s, c) => s + c.largeur, 0), hauteurLigne).fill("#fafafa");
    x = x0;
    doc.fillColor("#333");
    ligne.forEach((val, ci) => {
      doc.text(val, x + 2, yPos, { width: colonnes[ci].largeur - 4, align: colonnes[ci].align ?? "left" });
      x += colonnes[ci].largeur;
    });
    yPos += hauteurLigne;
  });

  return yPos + 5;
}
