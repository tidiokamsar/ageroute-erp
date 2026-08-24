/**
 * Mise en page d'un DOSSIER complet — plusieurs sections, plusieurs pages.
 *
 * `pdf-gabarit.ts` produit une page unique : il écrit à des positions fixes et
 * ne gère aucun débordement. Un dossier réunissant les dix onglets d'un
 * décompte tient rarement sur une page ; sans saut de page, le contenu se
 * superposait au pied de page ou disparaissait purement et simplement.
 *
 * Ce module ajoute ce qui manquait : suivi de la position verticale, saut de
 * page automatique, en-tête de continuation, et un pied de page paginé posé
 * sur CHAQUE page à la fin de la génération.
 */
import type PDFKit from "pdfkit";

export const MARGE = 40;
/** Hauteur réservée au pied de page. Rien ne doit descendre plus bas. */
export const RESERVE_PIED = 60;

export interface Colonne {
  label: string;
  largeur: number;
  align?: "left" | "center" | "right";
}

/**
 * Faut-il changer de page pour loger un bloc de `besoin` points ?
 * Extrait pour être testable : c'est la décision qui, mal prise, faisait
 * écrire par-dessus le pied de page.
 */
export function doitChangerDePage(y: number, besoin: number, limiteBasse: number): boolean {
  return y + besoin > limiteBasse;
}

/** Limite basse utilisable d'une page. */
export function limiteBasse(hauteurPage: number): number {
  return hauteurPage - RESERVE_PIED;
}

/**
 * Caractères que les polices standard de PDFKit (Helvetica, encodage WinAnsi)
 * ne savent pas rendre. Laissés tels quels, ils sortent en symboles parasites :
 * la flèche « → » s'imprimait « !' » et le signe moins « − » devenait un
 * guillemet. Même famille de défaut que l'espace fine insécable corrigée dans
 * `montants.ts`, qui s'affichait en « / » au milieu des montants.
 *
 * On substitue plutôt que d'embarquer une police : un document officiel doit
 * rester lisible, et l'équivalent ASCII l'est.
 */
const SUBSTITUTIONS: Array<[RegExp, string]> = [
  [/→/g, "->"],   // → flèche droite
  [/←/g, "<-"],   // ← flèche gauche
  [/−/g, "-"],    // − signe moins typographique
  [/≤/g, "<="],   // ≤
  [/≥/g, ">="],   // ≥
  [/≠/g, "!="],   // ≠
  [/[    ]/g, " "], // espaces fines et insécables
  [/[‘’]/g, "'"],             // apostrophes courbes
  [/[“”]/g, '"'],             // guillemets courbes
];

/** Rend un texte imprimable par les polices standard, sans caractère parasite. */
export function assainirTexte(texte: string): string {
  return SUBSTITUTIONS.reduce((acc, [motif, remplacement]) => acc.replace(motif, remplacement), texte);
}

/**
 * Tronque proprement un texte à `max` caractères, avec une ellipse.
 * Sans cela les libellés longs débordaient sur la colonne voisine.
 */
export function tronquer(texte: string | null | undefined, max: number): string {
  const t = assainirTexte((texte ?? "").toString()).replace(/\s+/g, " ").trim();
  if (t.length === 0) return "—";
  if (t.length <= max) return t;
  // L'ellipse compte dans la longueur : le résultat ne doit JAMAIS dépasser
  // `max`, sinon la troncature ne protège plus la colonne voisine. En dessous
  // de deux caractères, il n'y a pas la place pour l'ellipse.
  if (max <= 1) return t.slice(0, Math.max(0, max));
  return t.slice(0, max - 1) + "…";
}

/** Date lisible, ou tiret. Jamais « Invalid Date ». */
export function fmtDate(d: Date | string | null | undefined, avecHeure = false): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return avecHeure ? date.toLocaleString("fr-FR") : date.toLocaleDateString("fr-FR");
}

/**
 * État de composition d'un dossier : le document, la position courante, et le
 * rappel d'identification répété en haut des pages de continuation.
 */
export class Dossier {
  y: number;
  private pages = 1;

  constructor(
    private doc: PDFKit.PDFDocument,
    private rappel: string,
    yInitial: number,
  ) {
    this.y = yInitial;
  }

  get document(): PDFKit.PDFDocument {
    return this.doc;
  }

  get nbPages(): number {
    return this.pages;
  }

  private get limite(): number {
    return limiteBasse(this.doc.page.height);
  }

  /** Garantit `besoin` points disponibles ; ouvre une page si nécessaire. */
  espace(besoin: number): void {
    if (!doitChangerDePage(this.y, besoin, this.limite)) return;
    this.nouvellePage();
  }

  nouvellePage(): void {
    this.doc.addPage();
    this.pages += 1;
    // Bandeau de continuation : sur un dossier de dix sections, une page
    // détachée doit rester rattachable à son décompte.
    this.doc.rect(0, 0, this.doc.page.width, 26).fill("#1e3a5f");
    this.doc.fillColor("#ffffff").fontSize(7).font("Helvetica-Bold")
      .text(assainirTexte(this.rappel), MARGE, 9, { width: this.doc.page.width - 2 * MARGE });
    this.doc.fillColor("#000000");
    this.y = 40;
  }

  /** Titre de section, numéroté, avec filet doré. Ne se retrouve jamais seul en bas de page. */
  section(numero: number, titre: string): void {
    this.espace(60);
    const l = this.doc.page.width - 2 * MARGE;
    this.doc.rect(MARGE, this.y, l, 16).fill("#1e3a5f");
    this.doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold")
      .text(assainirTexte(`${numero}. ${titre.toUpperCase()}`), MARGE + 6, this.y + 4.5, { width: l - 12 });
    this.doc.moveTo(MARGE, this.y + 16).lineTo(MARGE + l, this.y + 16)
      .strokeColor("#F0A500").lineWidth(1.5).stroke();
    this.doc.fillColor("#000000");
    this.y += 24;
  }

  /** Bloc clé/valeur sur deux colonnes. */
  paires(donnees: Array<[string, string]>): void {
    const l = this.doc.page.width - 2 * MARGE;
    for (const [cle, valeur] of donnees) {
      this.espace(14);
      this.doc.fontSize(7.5).font("Helvetica").fillColor("#666")
        .text(assainirTexte(cle), MARGE + 4, this.y, { width: l * 0.42 });
      this.doc.font("Helvetica-Bold").fillColor("#111")
        .text(assainirTexte(valeur), MARGE + 4 + l * 0.44, this.y, { width: l * 0.54, align: "right" });
      this.y += 13;
    }
    this.doc.fillColor("#000000");
    this.y += 4;
  }

  /** Tableau avec en-tête répété à chaque saut de page. */
  tableau(colonnes: Colonne[], lignes: string[][], messageSiVide = "Aucun élément."): void {
    if (lignes.length === 0) {
      this.texte(messageSiVide, "#888");
      return;
    }
    this.espace(30);
    this.enteteTableau(colonnes);
    lignes.forEach((ligne, i) => {
      if (doitChangerDePage(this.y, 13, this.limite)) {
        this.nouvellePage();
        this.enteteTableau(colonnes);
      }
      if (i % 2 === 1) {
        this.doc.rect(MARGE, this.y - 2, this.doc.page.width - 2 * MARGE, 12).fill("#f7f8fa");
      }
      let x = MARGE + 2;
      this.doc.fontSize(6.5).font("Helvetica").fillColor("#222");
      colonnes.forEach((col, j) => {
        this.doc.text(assainirTexte(ligne[j] ?? "—"), x, this.y, { width: col.largeur - 4, align: col.align ?? "left" });
        x += col.largeur;
      });
      this.y += 12;
    });
    this.doc.fillColor("#000000");
    this.y += 6;
  }

  private enteteTableau(colonnes: Colonne[]): void {
    const l = colonnes.reduce((s, c) => s + c.largeur, 0);
    this.doc.rect(MARGE, this.y, l, 13).fill("#e8ecf3");
    let x = MARGE + 2;
    this.doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#1e3a5f");
    colonnes.forEach((col) => {
      this.doc.text(assainirTexte(col.label), x, this.y + 3.5, { width: col.largeur - 4, align: col.align ?? "left" });
      x += col.largeur;
    });
    this.doc.fillColor("#000000");
    this.y += 15;
  }

  /** Paragraphe libre. */
  texte(contenuBrut: string, couleur = "#333", taille = 7.5): void {
    const contenu = assainirTexte(contenuBrut);
    const l = this.doc.page.width - 2 * MARGE;
    const hauteur = this.doc.fontSize(taille).font("Helvetica").heightOfString(contenu, { width: l - 8 });
    this.espace(hauteur + 6);
    this.doc.fillColor(couleur).text(contenu, MARGE + 4, this.y, { width: l - 8 });
    this.y += hauteur + 6;
    this.doc.fillColor("#000000");
  }

  /** Encadré d'alerte — sert notamment à porter la mention de valeur juridique. */
  encadre(contenuBrut: string, fond = "#fff8e1", bordure = "#F0A500", texte = "#7a5a00"): void {
    const contenu = assainirTexte(contenuBrut);
    const l = this.doc.page.width - 2 * MARGE;
    const hauteur = this.doc.fontSize(7).font("Helvetica-Bold").heightOfString(contenu, { width: l - 16 }) + 12;
    this.espace(hauteur + 6);
    this.doc.rect(MARGE, this.y, l, hauteur).fillAndStroke(fond, bordure);
    this.doc.fillColor(texte).fontSize(7).font("Helvetica-Bold")
      .text(contenu, MARGE + 8, this.y + 6, { width: l - 16 });
    this.y += hauteur + 8;
    this.doc.fillColor("#000000");
  }

  /**
   * Cartouches de signature — remplis pour les étapes déjà signées
   * ÉLECTRONIQUEMENT, lignes manuscrites pour les autres.
   *
   * Avant le 24/08/2026, tous les cartouches sortaient vides (« Date et
   * signature ») même quand la chaîne PAdES portait déjà cinq rangs : le
   * dossier imprimé contredisait l'état réel du circuit. Le cartouche imprimé
   * reste une REPRÉSENTATION — la preuve est la signature dans le PDF signé.
   */
  cartouchesSignature(signataires: Array<{ role: string; nom?: string; qualite?: string; signeElectroniquement?: { par: string; qualite?: string | null; date: Date; id: string; validation: string; rang: number } }>): void {
    this.espace(30 + Math.ceil(signataires.length / 3) * 78);
    const l = this.doc.page.width - 2 * MARGE;
    const parLigne = 3;
    const largeurCase = l / parLigne;

    signataires.forEach((s, i) => {
      const colonne = i % parLigne;
      const x = MARGE + colonne * largeurCase;
      if (colonne === 0 && i > 0) this.y += 78;
      this.doc.fontSize(7).font("Helvetica-Bold").fillColor("#1e3a5f")
        .text(assainirTexte(s.role), x + 4, this.y, { width: largeurCase - 8, align: "center" });

      const e = s.signeElectroniquement;
      if (e) {
        this.doc.rect(x + 8, this.y + 10, largeurCase - 16, 52).fillAndStroke("#f0f7f1", "#2e7d32");
        this.doc.fillColor("#1b5e20").fontSize(6.5).font("Helvetica-Bold")
          .text(assainirTexte(e.par), x + 12, this.y + 14, { width: largeurCase - 24, align: "center" });
        if (e.qualite) {
          this.doc.fontSize(5.5).font("Helvetica").fillColor("#33691e")
            .text(assainirTexte(e.qualite), x + 12, this.y + 23, { width: largeurCase - 24, align: "center" });
        }
        this.doc.fontSize(5.5).font("Helvetica-Bold").fillColor("#1b5e20")
          .text(`SIGNÉ ÉLECTRONIQUEMENT — rang ${e.rang}`, x + 12, this.y + 32, { width: largeurCase - 24, align: "center" });
        this.doc.fontSize(5).font("Helvetica").fillColor("#33691e")
          .text(`${e.date.toLocaleString("fr-FR")} · validation ${assainirTexte(e.validation)}`, x + 12, this.y + 40, { width: largeurCase - 24, align: "center" });
        this.doc.fontSize(4.5).fillColor("#558b2f")
          .text(`id ${e.id}`, x + 12, this.y + 48, { width: largeurCase - 24, align: "center", lineBreak: false });
      } else {
        this.doc.fontSize(6).font("Helvetica").fillColor("#555")
          .text(assainirTexte(s.nom ?? "…………………………"), x + 4, this.y + 11, { width: largeurCase - 8, align: "center" });
        if (s.qualite) {
          this.doc.fontSize(5.5).fillColor("#888")
            .text(assainirTexte(s.qualite), x + 4, this.y + 20, { width: largeurCase - 8, align: "center" });
        }
        this.doc.moveTo(x + 12, this.y + 55).lineTo(x + largeurCase - 12, this.y + 55)
          .strokeColor("#999").lineWidth(0.5).stroke();
        this.doc.fontSize(5).fillColor("#999")
          .text("Date et signature", x + 4, this.y + 58, { width: largeurCase - 8, align: "center" });
      }
    });
    this.y += 82;
    this.doc.fillColor("#000000");
  }
}

/**
 * Pied de page paginé, posé sur toutes les pages à la fin de la génération.
 * Doit être appelé APRÈS tout le contenu : la pagination n'est connue qu'alors.
 */
/**
 * Pied de page paginé, posé sur toutes les pages à la fin de la génération.
 * `filigrane` : texte apposé EN DIAGONALE, en grand et en transparence, sur
 * chaque page — garde-fou G5 du module signature : hors mode provider, tout
 * document signé le porte. Indélébile par construction : il est dans le flux
 * de la page, sous la signature, pas dans une annotation supprimable.
 */
export function paginer(doc: PDFKit.PDFDocument, mention: string, filigrane?: string): void {
  const total = doc.bufferedPageRange().count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(i);
    const h = doc.page.height;
    const l = doc.page.width;
    if (filigrane) {
      doc.save();
      doc.rotate(-35, { origin: [l / 2, h / 2] });
      doc.fontSize(42).font("Helvetica-Bold").fillColor("#c0392b").opacity(0.18)
        .text(assainirTexte(filigrane), 0, h / 2 - 24, { width: l, align: "center", lineBreak: false });
      doc.restore();
      doc.opacity(1);
    }

    // ⚠️ Le pied de page s'écrit SOUS la marge basse. Sans neutraliser cette
    // marge, PDFKit juge que le texte ne tient pas sur la page et en ajoute une
    // — à chaque appel. La boucle fabriquait alors les pages qu'elle prétendait
    // numéroter : un dossier de 2 pages en produisait 6, tous les pieds
    // annonçant « Page 1 / 2 ».
    const margeBasse = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.moveTo(MARGE, h - 34).lineTo(l - MARGE, h - 34).strokeColor("#ddd").lineWidth(0.5).stroke();
    doc.fontSize(5.5).font("Helvetica").fillColor("#999")
      .text(assainirTexte(mention), MARGE, h - 28, { width: l - 2 * MARGE - 60, lineBreak: false });
    doc.fontSize(6).font("Helvetica-Bold").fillColor("#666")
      .text(`Page ${i + 1} / ${total}`, l - MARGE - 60, h - 28, { width: 60, align: "right", lineBreak: false });

    doc.page.margins.bottom = margeBasse;
  }
}
