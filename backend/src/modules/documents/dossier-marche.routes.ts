/**
 * Dossier complet d'un MARCHÉ — tous les onglets de l'écran, en un seul PDF.
 *
 * Pendant du dossier de décompte, pour le niveau au-dessus : identification,
 * lots, bordereau des prix, ordres de service, avenants, garanties, réceptions,
 * décomptes, situation, avancement, historique des statuts et circuit BPMN.
 *
 * Le dossier signale les incohérences plutôt que de les taire : un marché qui
 * porte des décomptes sans bordereau des prix chargé, ou dont le circuit de
 * validation n'a jamais été ouvert, doit se voir sur le papier.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { ApiError } from "../../middleware/error.middleware";
import { logAudit } from "../../lib/audit";
import { assertMarcheAutorise, entrepriseDuCompte } from "../../lib/perimetre";
import { creerDocumentOfficiel } from "../../lib/pdf-gabarit";
import { Dossier, paginer, tronquer, fmtDate } from "../../lib/pdf-dossier";
import { formaterMontant } from "../../lib/montants";

export const dossierMarcheRouter = Router();
dossierMarcheRouter.use(requireAuth);

const gnf = (v: bigint | number | null | undefined): string => formaterMontant(v);

/** Pourcentage lisible, protégé de la division par zéro. */
function pourcent(part: bigint, total: bigint): string {
  if (total === 0n) return "—";
  return `${(Number((part * 10000n) / total) / 100).toFixed(2)} %`;
}

interface BpmnInstanceBrute {
  id: string;
  etape_actuelle: number;
  statut: string;
  created_at: Date | null;
}

dossierMarcheRouter.get("/marche/:id/dossier/pdf", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    await assertMarcheAutorise(req, req.params.id);

    const m = await prisma.marche.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        entreprise: true,
        projet: true,
        lots: { where: { deletedAt: null }, orderBy: { numero: "asc" as const } },
        bpuArticles: { orderBy: { ordre: "asc" as const } },
        ordresService: { orderBy: { numero: "asc" as const } },
        avenants: { orderBy: { numero: "asc" as const } },
        garanties: { orderBy: { createdAt: "asc" as const } },
        receptions: { orderBy: { createdAt: "asc" as const } },
        decomptes: { where: { deletedAt: null }, orderBy: { createdAt: "asc" as const }, include: { paiements: { where: { deletedAt: null } } } },
        historiqueStatuts: { orderBy: { createdAt: "desc" as const }, take: 40 },
        workflowInstances: {
          include: { definition: { include: { etapes: { orderBy: { ordre: "asc" as const } } } } },
          orderBy: { createdAt: "desc" as const },
          take: 1,
        },
      },
    });
    if (!m) throw new ApiError(404, "Marché introuvable");

    // Isolation ENTREPRISE (revue du 20/08/2026) : ENTREPRISE n'est pas un
    // rôle scopé, assertMarcheAutorise ne le rejette donc pas. Sans ce
    // contrôle, un compte entreprise obtenait les quatorze sections du
    // dossier — BPU contractuel, garanties bancaires, emails d'agents — de
    // n'importe quel marché, y compris ceux de ses concurrents. Le dossier de
    // décompte applique déjà ce contrôle sur Decompte.entrepriseId.
    const mienne = await entrepriseDuCompte(req);
    if (mienne && m.entrepriseId !== mienne) throw new ApiError(404, "Marché introuvable");

    // Les tables BPMN vivent hors du schéma Prisma (AGENTS.md).
    const bpmn = await prisma.$queryRaw<BpmnInstanceBrute[]>`
      SELECT id, etape_actuelle, statut, created_at FROM bpmn_instances
      WHERE module_type = 'MARCHE' AND entity_id = ${m.id} LIMIT 1`;

    const doc = creerDocumentOfficiel({
      titre: "Dossier complet de marché",
      sousTitre: `${m.reference} — ${m.entreprise.raisonSociale}`,
      reference: m.reference,
      bufferPages: true,
    });
    const dossier = new Dossier(doc, `Dossier marché ${m.reference} (suite)`, 100);

    const montantRef = m.montantActualiseGnf ?? m.montantInitialGnf;
    const cumulDecomptes = m.decomptes.reduce((s: bigint, d) => s + d.netAPayer, 0n);
    const cumulPaye = m.decomptes.reduce(
      (s: bigint, d) => s + d.paiements.reduce((t: bigint, p: { montantGnf: bigint }) => t + p.montantGnf, 0n),
      0n,
    );

    // ───────────────────── 1. IDENTIFICATION ─────────────────────
    dossier.section(1, "Identification du marché");
    dossier.paires([
      ["Référence", m.reference],
      ["Intitulé", tronquer(m.intitule, 70)],
      ["Objet", tronquer(m.objet, 70)],
      ["N° de contrat", m.numContrat ?? "—"],
      ["N° d'approbation", m.numApprobation ?? "—"],
      ["Entreprise titulaire", m.entreprise.raisonSociale],
      ["Co-traitants", tronquer(m.coTraitants, 60)],
      ["Sous-traitants", tronquer(m.sousTraitants, 60)],
      ["Projet", tronquer(m.projet?.intitule, 60)],
      ["Financement", m.financement.replace(/_/g, " ")],
      ["Bailleur", m.bailleur ?? "—"],
      ["Composante", tronquer(m.composante, 50)],
      ["Mission de contrôle", tronquer(m.missionControle, 50)],
      ["Direction technique", tronquer(m.directionTechnique, 50)],
      ["Région / Préfecture / Commune", `${m.regionNom ?? "—"} / ${m.prefecture ?? "—"} / ${m.commune ?? "—"}`],
      ["Tronçon", m.tronconCode ?? "—"],
      ["Statut", m.statut.replace(/_/g, " ")],
      ["Statut de paiement", m.statutPaiement.replace(/_/g, " ")],
      ["Statut de réception", m.statutReception.replace(/_/g, " ")],
      ["Statut de clôture", m.statutCloture.replace(/_/g, " ")],
    ]);

    dossier.section(2, "Montants et calendrier");
    dossier.paires([
      ["Montant initial HT", `${gnf(m.montantInitialGnf)} GNF`],
      ["Montant actualisé HT", `${gnf(m.montantActualiseGnf ?? m.montantInitialGnf)} GNF`],
      ["Avance forfaitaire", `${gnf(m.montantAvanceGnf)} GNF`],
      ["Avance complémentaire", `${gnf(m.avanceComplementaireGnf)} GNF`],
      ["Pénalité journalière", `${gnf(m.penalitesJourGnf)} GNF`],
      ["Formule de révision", tronquer(m.formulaRevisionPrix, 50)],
      ["Date de signature", fmtDate(m.dateSignature)],
      ["Date de notification", fmtDate(m.dateNotification)],
      ["Date du premier OS", fmtDate(m.dateOs)],
      ["Début prévu / Fin prévue", `${fmtDate(m.dateDebutPrevue)} / ${fmtDate(m.dateFinPrevue)}`],
      ["Fin réelle", fmtDate(m.dateFinReelle)],
      ["Réception provisoire", fmtDate(m.dateReceptionProvisoire)],
      ["Réception définitive", fmtDate(m.dateReceptionDefinitive)],
    ]);

    // ───────────────────── 3. LOTS ─────────────────────
    dossier.section(3, "Lots");
    dossier.tableau(
      [
        { label: "N°", largeur: 45 },
        { label: "Désignation", largeur: 330 },
        { label: "Montant GNF", largeur: 140, align: "right" },
      ],
      m.lots.map((l) => [tronquer(l.numero, 12), tronquer(l.designation, 88), gnf(l.montantGnf)]),
      "Marché non alloti.",
    );

    // ───────────────────── 4. BPU ─────────────────────
    dossier.section(4, "Bordereau des prix unitaires");
    dossier.tableau(
      [
        { label: "Code", largeur: 60 },
        { label: "Désignation", largeur: 180 },
        { label: "Unité", largeur: 40, align: "center" },
        { label: "Qté prévue", largeur: 55, align: "right" },
        { label: "P.U. GNF", largeur: 75, align: "right" },
        { label: "Montant GNF", largeur: 95, align: "right" },
      ],
      m.bpuArticles.map((a) => [
        tronquer(a.code, 14),
        tronquer(a.designation, 48),
        a.unite,
        String(a.quantitePrevue),
        gnf(a.prixUnitaireGnf),
        gnf(a.montantGnf),
      ]),
      "Aucun article de bordereau chargé sur ce marché.",
    );
    if (m.bpuArticles.length === 0 && m.decomptes.length > 0) {
      dossier.encadre(
        `INCOHÉRENCE — ${m.decomptes.length} décompte(s) ont été établis sur ce marché alors qu'AUCUN article de bordereau n'y est chargé. Les prix unitaires appliqués ne sont donc rattachables à aucun bordereau contractuel enregistré dans l'ERP.`,
        "#fdecea", "#d93025", "#8b1a10",
      );
    }

    // ───────────────────── 5. ORDRES DE SERVICE ─────────────────────
    dossier.section(5, "Ordres de service");
    dossier.tableau(
      [
        { label: "N°", largeur: 35, align: "center" },
        { label: "Type", largeur: 80 },
        { label: "Objet", largeur: 175 },
        { label: "Émis le", largeur: 60, align: "center" },
        { label: "Effet", largeur: 60, align: "center" },
        { label: "Délai (j)", largeur: 45, align: "right" },
        { label: "Impact GNF", largeur: 60, align: "right" },
      ],
      m.ordresService.map((o) => [
        String(o.numero),
        tronquer(o.type, 20),
        tronquer(o.objet, 46),
        fmtDate(o.dateEmission),
        fmtDate(o.dateEffet),
        String(o.impactDelaiJours),
        gnf(o.impactMontantGnf),
      ]),
      "Aucun ordre de service émis.",
    );

    // ───────────────────── 6. AVENANTS ─────────────────────
    dossier.section(6, "Avenants");
    dossier.tableau(
      [
        { label: "N°", largeur: 30, align: "center" },
        { label: "Objet", largeur: 150 },
        { label: "Motif", largeur: 110 },
        { label: "Montant suppl. GNF", largeur: 85, align: "right" },
        { label: "Prolong. (j)", largeur: 50, align: "right" },
        { label: "Statut", largeur: 65, align: "center" },
        { label: "Signé le", largeur: 55, align: "center" },
      ],
      m.avenants.map((a) => [
        String(a.numero),
        tronquer(a.objet, 40),
        tronquer(a.motif, 28),
        gnf(a.montantSupplementaireGnf),
        String(a.prolongationJours),
        tronquer(a.statut, 16),
        fmtDate(a.dateSignature),
      ]),
      "Aucun avenant.",
    );
    const cumulAvenants = m.avenants.reduce((s: bigint, a) => s + a.montantSupplementaireGnf, 0n);
    if (m.avenants.length > 0) {
      dossier.paires([
        ["Cumul des avenants", `${gnf(cumulAvenants)} GNF`],
        ["Part du montant initial", pourcent(cumulAvenants, m.montantInitialGnf)],
      ]);
    }

    // ───────────────────── 7. GARANTIES ─────────────────────
    dossier.section(7, "Garanties");
    dossier.tableau(
      [
        { label: "Type", largeur: 95 },
        { label: "Référence", largeur: 90 },
        { label: "Banque", largeur: 95 },
        { label: "Montant GNF", largeur: 80, align: "right" },
        { label: "Émission", largeur: 55, align: "center" },
        { label: "Expiration", largeur: 55, align: "center" },
        { label: "État", largeur: 45, align: "center" },
      ],
      m.garanties.map((g) => [
        tronquer(g.type, 24),
        tronquer(g.reference, 24),
        tronquer(g.banque, 24),
        gnf(g.montantGnf),
        fmtDate(g.dateEmission),
        fmtDate(g.dateExpiration),
        g.appelGarantie ? "Appelée" : g.active ? "Active" : "Levée",
      ]),
      "Aucune garantie enregistrée.",
    );
    const expirees = m.garanties.filter((g) => g.active && g.dateExpiration && new Date(g.dateExpiration) < new Date());
    if (expirees.length > 0) {
      dossier.encadre(`${expirees.length} garantie(s) encore marquée(s) active(s) alors que leur date d'expiration est dépassée.`);
    }

    // ───────────────────── 8. RÉCEPTIONS ─────────────────────
    dossier.section(8, "Réceptions");
    dossier.tableau(
      [
        { label: "Type", largeur: 90 },
        { label: "Statut", largeur: 75, align: "center" },
        { label: "N° PV", largeur: 75 },
        { label: "Prévue", largeur: 55, align: "center" },
        { label: "Réelle", largeur: 55, align: "center" },
        { label: "Réserves levées le", largeur: 70, align: "center" },
        { label: "Signée le", largeur: 55, align: "center" },
      ],
      m.receptions.map((r) => [
        tronquer(r.type, 22),
        tronquer(r.statut, 18),
        tronquer(r.pvNumero, 18),
        fmtDate(r.datePrevu),
        fmtDate(r.dateReelle),
        fmtDate(r.dateLeveeReserves),
        fmtDate(r.signedAt),
      ]),
      "Aucune réception enregistrée.",
    );

    // ───────────────────── 9. DÉCOMPTES ─────────────────────
    dossier.section(9, "Décomptes");
    dossier.tableau(
      [
        { label: "Référence", largeur: 105 },
        { label: "Type", largeur: 60, align: "center" },
        { label: "Période", largeur: 100, align: "center" },
        { label: "Statut", largeur: 75, align: "center" },
        { label: "Net à payer GNF", largeur: 85, align: "right" },
        { label: "Payé GNF", largeur: 85, align: "right" },
      ],
      m.decomptes.map((d) => [
        tronquer(d.reference, 26),
        tronquer(d.type, 14),
        `${fmtDate(d.periodeDebut)} -> ${fmtDate(d.periodeFin)}`,
        tronquer(d.statut, 18),
        gnf(d.netAPayer),
        gnf(d.paiements.reduce((t: bigint, p: { montantGnf: bigint }) => t + p.montantGnf, 0n)),
      ]),
      "Aucun décompte établi sur ce marché.",
    );

    // ───────────────────── 10. SITUATION ─────────────────────
    dossier.section(10, "Situation du marché");
    dossier.paires([
      ["Montant de référence", `${gnf(montantRef)} GNF`],
      ["Cumul des décomptes (net à payer)", `${gnf(cumulDecomptes)} GNF`],
      ["Avancement financier", pourcent(cumulDecomptes, montantRef)],
      ["Cumul réglé", `${gnf(cumulPaye)} GNF`],
      ["Taux de règlement", pourcent(cumulPaye, montantRef)],
      ["Reste à décompter", `${gnf(montantRef - cumulDecomptes)} GNF`],
      ["Reste à régler", `${gnf(cumulDecomptes - cumulPaye)} GNF`],
      ["Avance à récupérer", `${gnf(m.montantAvanceGnf + m.avanceComplementaireGnf)} GNF`],
    ]);
    if (cumulDecomptes > montantRef) {
      dossier.encadre(
        `DÉPASSEMENT — le cumul des décomptes excède le montant de référence de ${gnf(cumulDecomptes - montantRef)} GNF. Un avenant est nécessaire pour régulariser.`,
        "#fdecea", "#d93025", "#8b1a10",
      );
    }

    // ───────────────────── 11. AVANCEMENT (COURBE S) ─────────────────────
    dossier.section(11, "Avancement — points de la courbe en S");
    let cumul = 0n;
    dossier.tableau(
      [
        { label: "Décompte", largeur: 110 },
        { label: "Fin de période", largeur: 80, align: "center" },
        { label: "Net période GNF", largeur: 95, align: "right" },
        { label: "Cumul GNF", largeur: 105, align: "right" },
        { label: "Avancement", largeur: 70, align: "right" },
      ],
      m.decomptes.map((d) => {
        cumul += d.netAPayer;
        return [
          tronquer(d.reference, 28),
          fmtDate(d.periodeFin),
          gnf(d.netAPayer),
          gnf(cumul),
          pourcent(cumul, montantRef),
        ];
      }),
      "Pas encore assez d'activité pour tracer une courbe : il faut des décomptes certifiés répartis dans le temps.",
    );
    dossier.texte(
      "L'écran trace la courbe en croisant l'avancement physique (attachements validés) et financier (décomptes certifiés) avec le prévisionnel linéaire contractuel. Le tableau ci-dessus en donne les points financiers.",
      "#666", 6.5,
    );

    // ───────────────────── 12. HISTORIQUE ─────────────────────
    dossier.section(12, "Historique des statuts");
    dossier.tableau(
      [
        { label: "Date", largeur: 80, align: "center" },
        { label: "De", largeur: 95, align: "center" },
        { label: "Vers", largeur: 95, align: "center" },
        { label: "Motif", largeur: 130 },
        { label: "Par", largeur: 115 },
      ],
      m.historiqueStatuts.map((h) => [
        fmtDate(h.createdAt, true),
        tronquer(h.statutAvant, 22),
        tronquer(h.statutApres, 22),
        tronquer(h.motif, 34),
        tronquer(h.userEmail, 30),
      ]),
      "Aucun changement de statut enregistré.",
    );

    // ───────────────────── 13. CIRCUIT DE VALIDATION ─────────────────────
    dossier.section(13, "Circuit de validation");
    const instance = m.workflowInstances[0];
    if (instance) {
      const etapes = instance.definition.etapes;
      dossier.paires([
        ["Circuit", instance.definition.nom ?? m.financement],
        ["Statut", instance.statut],
        ["Étape courante", etapes[instance.etapeActuelle]?.nom ?? "—"],
        ["Ouvert le", fmtDate(instance.createdAt, true)],
      ]);
    } else {
      dossier.texte("Aucune instance de circuit de validation (workflow) ouverte sur ce marché.", "#888");
    }
    if (bpmn.length > 0) {
      dossier.paires([
        ["Circuit BPMN", bpmn[0].statut],
        ["Étape BPMN courante", String(bpmn[0].etape_actuelle)],
        ["Ouvert le", fmtDate(bpmn[0].created_at, true)],
      ]);
    } else {
      dossier.texte("Circuit BPMN non démarré : ce marché n'a pas été soumis au circuit de validation BPMN.", "#888");
    }

    // ───────────────────── 14. SIGNATURES ─────────────────────
    dossier.section(14, "Signatures");
    dossier.cartouchesSignature([
      { role: "Direction des Marchés" },
      { role: "Direction Admin. & Financière" },
      { role: "Directeur Général" },
    ]);
    dossier.encadre(
      "Ce dossier est un état imprimé de l'ERP. Les signatures manuscrites apposées ci-dessus en font foi. L'application ne produit à ce jour AUCUNE signature électronique opposable.",
      "#eef2f7", "#1e3a5f", "#1e3a5f",
    );

    paginer(doc, `Dossier marché ${m.reference} — édité le ${new Date().toLocaleString("fr-FR")} par ${req.user.email}`);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="dossier-marche-${m.reference}.pdf"`);
    doc.pipe(res);
    doc.end();

    await logAudit({
      userId: req.user.id, action: "UPDATE", entityType: "Marche", entityId: m.id,
      after: { document: "dossier-marche-pdf", sections: 14 },
    });
  } catch (err) { next(err); }
});
