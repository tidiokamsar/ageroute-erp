/**
 * Dossier complet d'un décompte — TOUS les onglets de l'écran, en un seul PDF.
 *
 * Le PDF existant (`/documents/decompte/:id/pdf`) ne portait que le récapitulatif
 * financier et les lignes BPU. Le dossier transmis à la DAF, au bailleur ou à
 * l'auditeur doit contenir ce que l'écran affiche : référentiel, lignes, calculs,
 * pièces déposées, validations, workflow, paiements, audit, historique et
 * attachements — avec les cartouches de signature du circuit réel.
 *
 * Le circuit des signataires n'est pas figé dans le code : il est lu depuis la
 * définition de workflow du financement du marché, pour que le dossier reflète
 * le parcours qui s'applique vraiment à CE décompte.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { ApiError } from "../../middleware/error.middleware";
import { logAudit } from "../../lib/audit";
import { entrepriseIdOf } from "../../lib/scope";
import { assertDecompteAutorise } from "../../lib/perimetre";
import { creerDocumentOfficiel } from "../../lib/pdf-gabarit";
import { Dossier, paginer, tronquer, fmtDate } from "../../lib/pdf-dossier";
import { formaterMontant } from "../../lib/montants";

export const dossierDecompteRouter = Router();
dossierDecompteRouter.use(requireAuth);

const gnf = (v: bigint | number | null | undefined): string => formaterMontant(v);

/** Libellés lisibles des rôles du circuit, pour les cartouches de signature. */
const LIBELLE_ROLE: Record<string, string> = {
  ENTREPRISE: "Entreprise titulaire",
  MISSION: "Mission de contrôle",
  TECHNIQUE: "Direction Technique",
  DMC: "Direction des Marchés",
  UGP: "Unité de Gestion de Projet",
  DAF: "Direction Admin. & Financière",
  DGA: "Directeur Général Adjoint",
  DG: "Directeur Général",
  BAILLEUR: "Bailleur de fonds",
  BUDGET: "Direction du Budget",
  TRESOR: "Trésor Public",
  FER_AGT: "Fonds d'Entretien Routier",
  BCRG: "Banque Centrale",
};

dossierDecompteRouter.get("/decompte/:id/dossier/pdf", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");

    const d = await prisma.decompte.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        marche: { include: { entreprise: true, projet: true } },
        lignesDecompte: { orderBy: { createdAt: "asc" as const } },
        paiements: { where: { deletedAt: null }, orderBy: { createdAt: "asc" as const } },
        validationsAvancees: { orderBy: { valideAt: "asc" as const } },
        commentairesDecompte: { orderBy: { createdAt: "asc" as const } },
        documents: { orderBy: { createdAt: "asc" as const } },
      },
    });
    if (!d) throw new ApiError(404, "Décompte introuvable");

    // Cloisonnement : entreprise sur son propre dossier, rôles scopés sur leur
    // périmètre. Un 404 et non un 403 — un 403 confirmerait l'existence.
    if (req.user.role === "ENTREPRISE" && d.entrepriseId !== (await entrepriseIdOf(req.user.id))) {
      throw new ApiError(404, "Décompte introuvable");
    }
    await assertDecompteAutorise(req, d.id, async () => d.marcheId);

    const [instance, auditLogs, attachementsDecompte, attachementsMarche] = await Promise.all([
      prisma.workflowInstance.findFirst({
        where: { decompteId: d.id },
        include: {
          definition: { include: { etapes: { orderBy: { ordre: "asc" as const } } } },
          actions: { include: { etape: true, user: { select: { nomComplet: true, nom: true, prenom: true, fonction: true, role: true } } }, orderBy: { createdAt: "asc" as const } },
        },
        orderBy: { createdAt: "desc" as const },
      }),
      prisma.auditLog.findMany({
        where: { entityType: "Decompte", entityId: d.id },
        orderBy: { createdAt: "desc" as const },
        take: 60,
        include: { user: { select: { nomComplet: true, role: true } } },
      }),
      prisma.attachement.findMany({
        where: { decompteId: d.id },
        include: { lignes: true, pointsGPS: true, medias: true },
        orderBy: { createdAt: "asc" as const },
      }),
      prisma.attachement.findMany({
        where: { decompte: { marcheId: d.marcheId }, NOT: { decompteId: d.id } },
        orderBy: { createdAt: "asc" as const },
      }),
    ]);

    const doc = creerDocumentOfficiel({
      titre: "Dossier complet de décompte",
      sousTitre: `${d.type.replace(/_/g, " ")} — ${d.marche.reference} — ${d.marche.entreprise.raisonSociale}`,
      reference: d.reference,
      bufferPages: true,
    });

    const dossier = new Dossier(doc, `Dossier ${d.reference} — ${d.marche.reference} (suite)`, 100);

    // ───────────────────────────── 1. RÉSUMÉ ─────────────────────────────
    dossier.section(1, "Résumé — référentiel et montants");
    dossier.paires([
      ["Marché", d.marche.reference],
      ["Objet", tronquer(d.marche.intitule, 70)],
      ["Entreprise", d.marche.entreprise.raisonSociale],
      ["Projet", tronquer(d.marche.projet?.intitule, 60)],
      ["Région", d.marche.projet?.region ?? "—"],
      ["Financement", d.marche.financement.replace(/_/g, " ")],
      ["N° décompte", d.reference],
      ["N° dossier", d.numeroDossier ?? "—"],
      ["Type", d.type.replace(/_/g, " ")],
      ["Statut", d.statut.replace(/_/g, " ")],
      ["Période", `${fmtDate(d.periodeDebut)} → ${fmtDate(d.periodeFin)}`],
      ["Date de dépôt", fmtDate(d.dateDepot)],
    ]);

    // ──────────────────────── 2. CALCULS ────────────────────────
    dossier.section(2, "Calculs — décomposition du net à payer");
    dossier.paires([
      ["Montant HT de la période", `${gnf(d.montantPeriodeHtGnf)} GNF`],
      ["TVA", `+ ${gnf(d.tva)} GNF`],
      ["Redevance ARMP (0,6 %)", `+ ${gnf(d.montantArmpGnf)} GNF`],
      ["Total TTC", `${gnf(d.montantTtcGnf)} GNF`],
      ["Précompte TVA", `− ${gnf(d.precompteTvaGnf)} GNF`],
      ["Retenue de garantie", `− ${gnf(d.retenueGarantie)} GNF`],
      ["Avance récupérée", `− ${gnf(d.avanceRecuperee)} GNF`],
      ["Pénalités de retard", `− ${gnf(d.penalites)} GNF`],
      ["Révision des prix", `+ ${gnf(d.revisionPrix)} GNF`],
      ["NET À PAYER", `${gnf(d.netAPayer)} GNF`],
    ]);
    const dejaPaye = d.paiements.reduce((s: bigint, p: { montantGnf: bigint }) => s + p.montantGnf, 0n);
    dossier.paires([
      ["Déjà réglé", `${gnf(dejaPaye)} GNF`],
      ["Reste à régler", `${gnf(d.netAPayer - dejaPaye)} GNF`],
    ]);
    if (d.reglesSnapshot) {
      dossier.texte("Un instantané des règles de gestion appliquées au moment du calcul est conservé avec ce décompte : les taux utilisés ici ne dépendent pas des règles en vigueur au moment de l'impression.", "#555", 6.5);
    }

    // ──────────────────────── 3. LIGNES BPU ────────────────────────
    dossier.section(3, "Lignes du bordereau des prix unitaires");
    dossier.tableau(
      [
        { label: "Code", largeur: 55 },
        { label: "Désignation", largeur: 150 },
        { label: "Unité", largeur: 35, align: "center" },
        { label: "Quantité", largeur: 50, align: "right" },
        { label: "P.U. GNF", largeur: 65, align: "right" },
        { label: "HT GNF", largeur: 70, align: "right" },
        { label: "Net GNF", largeur: 70, align: "right" },
      ],
      d.lignesDecompte.map((l) => [
        tronquer(l.codeArticle, 12),
        tronquer(l.designation, 40),
        l.unite ?? "—",
        String(l.quantiteCourante ?? 0),
        gnf(l.prixUnitaire),
        gnf(l.montantBrut),
        gnf(l.montantNet),
      ]),
      "Aucune ligne BPU rattachée à ce décompte.",
    );

    // ──────────────────────── 4. PIÈCES JUSTIFICATIVES ────────────────────────
    dossier.section(4, "Pièces justificatives déposées");
    dossier.tableau(
      [
        { label: "Nature", largeur: 90 },
        { label: "Nom du fichier", largeur: 160 },
        { label: "Version", largeur: 40, align: "center" },
        { label: "Statut", largeur: 60, align: "center" },
        { label: "Déposée le", largeur: 60, align: "center" },
        { label: "Validée le", largeur: 60, align: "center" },
        { label: "Motif de retour", largeur: 85 },
      ],
      d.documents.filter((p) => !p.estArchive).map((p) => [
        tronquer(p.type, 22),
        tronquer(p.nom, 42),
        `v${p.version}`,
        p.statutValidation,
        fmtDate(p.createdAt),
        fmtDate(p.valideAt),
        tronquer(p.motifRetour, 22),
      ]),
      "Aucune pièce déposée. Le bordereau des pièces est donc vide.",
    );
    const retournees = d.documents.filter((p) => p.statutValidation === "RETOURNE" && !p.estArchive).length;
    if (retournees > 0) {
      dossier.encadre(`${retournees} pièce(s) retournée(s) à l'entreprise : elles ne comptent pas comme fournies tant qu'elles n'ont pas été redéposées et validées.`);
    }
    const archivees = d.documents.filter((p) => p.estArchive).length;
    if (archivees > 0) {
      dossier.texte(`${archivees} version(s) antérieure(s) archivée(s), conservées mais non listées ci-dessus.`, "#888", 6.5);
    }

    // ──────────────────────── 5. VALIDATIONS ────────────────────────
    dossier.section(5, "Validations — visas des services");
    dossier.tableau(
      [
        { label: "Étape", largeur: 70 },
        { label: "Décision", largeur: 60, align: "center" },
        { label: "Par", largeur: 105 },
        { label: "Rôle", largeur: 60, align: "center" },
        { label: "Date", largeur: 70, align: "center" },
        { label: "Commentaire", largeur: 150 },
      ],
      d.validationsAvancees.map((v) => [
        tronquer(v.etape, 18),
        v.decision,
        tronquer(v.valideNom ?? v.validePar, 26),
        tronquer(v.valideRole, 14),
        fmtDate(v.valideAt, true),
        tronquer(v.commentaire, 38),
      ]),
      "Aucune validation enregistrée à ce jour.",
    );
    const avecRef = d.validationsAvancees.filter((v) => v.signatureRef).length;
    if (avecRef > 0) {
      dossier.encadre(
        `${avecRef} validation(s) portent une « référence de signature » saisie à la main. Cette référence est un texte libre : elle ne constitue pas une signature électronique et ne prouve ni l'identité du signataire, ni l'intégrité du document.`,
        "#fdecea", "#d93025", "#8b1a10",
      );
    }

    // ──────────────────────── 6. WORKFLOW ────────────────────────
    dossier.section(6, "Circuit de validation");
    if (!instance) {
      dossier.texte("Aucune instance de circuit n'est ouverte pour ce décompte.", "#888");
    } else {
      const etapes = instance.definition.etapes;
      const courante = etapes[instance.etapeActuelle];
      dossier.paires([
        ["Circuit appliqué", instance.definition.nom ?? d.marche.financement],
        ["Statut du circuit", instance.statut],
        ["Étape courante", courante ? `${instance.etapeActuelle + 1}/${etapes.length} — ${courante.nom ?? courante.roleRequis}` : "—"],
        ["Ouvert le", fmtDate(instance.createdAt, true)],
      ]);
      dossier.tableau(
        [
          { label: "#", largeur: 25, align: "center" },
          { label: "Étape", largeur: 130 },
          { label: "Rôle attendu", largeur: 90 },
          { label: "État", largeur: 70, align: "center" },
        ],
        etapes.map((e, i) => [
          String(i + 1),
          tronquer(e.nom ?? e.roleRequis, 34),
          tronquer(LIBELLE_ROLE[e.roleRequis] ?? e.roleRequis, 24),
          i < instance.etapeActuelle ? "Franchie" : i === instance.etapeActuelle ? "En cours" : "À venir",
        ]),
      );
      dossier.texte("Actions enregistrées :", "#1e3a5f", 7);
      dossier.tableau(
        [
          { label: "Étape", largeur: 110 },
          { label: "Décision", largeur: 60, align: "center" },
          { label: "Par", largeur: 120 },
          { label: "Date", largeur: 70, align: "center" },
          { label: "Commentaire", largeur: 155 },
        ],
        instance.actions.map((a) => [
          tronquer(a.etape?.nom ?? a.etape?.roleRequis, 28),
          a.decision,
          tronquer(a.user?.nomComplet, 30),
          fmtDate(a.createdAt, true),
          tronquer(a.commentaire, 40),
        ]),
        "Aucune action enregistrée sur ce circuit.",
      );
    }

    // ──────────────────────── 7. PAIEMENTS ────────────────────────
    dossier.section(7, "Paiements");
    dossier.tableau(
      [
        { label: "Référence", largeur: 90 },
        { label: "Montant GNF", largeur: 85, align: "right" },
        { label: "Circuit", largeur: 65, align: "center" },
        { label: "Statut", largeur: 65, align: "center" },
        { label: "Date", largeur: 65, align: "center" },
        { label: "Réf. BCRG / DNTCP / banque", largeur: 145 },
      ],
      d.paiements.map((p) => [
        tronquer(p.reference, 22),
        gnf(p.montantGnf),
        tronquer(p.typeCircuit, 16),
        tronquer(p.statut, 16),
        fmtDate(p.dateExecution ?? p.dateOrdre ?? p.createdAt),
        tronquer(p.refBcrg ?? p.refDntcp ?? p.banque, 38),
      ]),
      "Aucun paiement enregistré pour ce décompte.",
    );

    // ──────────────────────── 8. ATTACHEMENTS ────────────────────────
    dossier.section(8, "Attachements — constat contradictoire");
    dossier.texte("Attachements rattachés à ce décompte :", "#1e3a5f", 7);
    dossier.tableau(
      [
        { label: "Référence", largeur: 90 },
        { label: "Type", largeur: 60, align: "center" },
        { label: "Période", largeur: 100, align: "center" },
        { label: "Statut", largeur: 90, align: "center" },
        { label: "Lignes", largeur: 40, align: "right" },
        { label: "Points GPS", largeur: 50, align: "right" },
        { label: "Médias", largeur: 45, align: "right" },
      ],
      attachementsDecompte.map((a) => [
        tronquer(a.code, 22),
        tronquer(a.typeAttachement, 14),
        `${fmtDate(a.periodeDebut)} → ${fmtDate(a.periodeFin)}`,
        tronquer(a.statut, 22),
        String(a.lignes.length),
        String(a.pointsGPS.length),
        String(a.medias.length),
      ]),
      "Aucun attachement rattaché à ce décompte.",
    );
    dossier.texte("Attachements antérieurs du même marché (lecture en cumul) :", "#1e3a5f", 7);
    dossier.tableau(
      [
        { label: "Référence", largeur: 100 },
        { label: "Type", largeur: 70, align: "center" },
        { label: "Période", largeur: 120, align: "center" },
        { label: "Statut", largeur: 100, align: "center" },
        { label: "Créé le", largeur: 85, align: "center" },
      ],
      attachementsMarche.map((a) => [
        tronquer(a.code, 24),
        tronquer(a.typeAttachement, 16),
        `${fmtDate(a.periodeDebut)} → ${fmtDate(a.periodeFin)}`,
        tronquer(a.statut, 24),
        fmtDate(a.createdAt),
      ]),
      "Aucun attachement antérieur sur ce marché.",
    );

    // ──────────────────────── 9. HISTORIQUE ────────────────────────
    dossier.section(9, "Historique — échanges inter-services");
    dossier.tableau(
      [
        { label: "Date", largeur: 75, align: "center" },
        { label: "Auteur", largeur: 110 },
        { label: "Observation", largeur: 330 },
      ],
      d.commentairesDecompte.map((c) => [
        fmtDate(c.createdAt, true),
        tronquer(c.auteurNom ?? c.auteurId, 28),
        tronquer(c.contenu, 90),
      ]),
      "Aucun échange enregistré.",
    );

    // ──────────────────────── 10. AUDIT ────────────────────────
    dossier.section(10, "Journal d'audit");
    dossier.tableau(
      [
        { label: "Date", largeur: 80, align: "center" },
        { label: "Action", largeur: 75, align: "center" },
        { label: "Utilisateur", largeur: 130 },
        { label: "Rôle", largeur: 65, align: "center" },
        { label: "Entité", largeur: 165 },
      ],
      auditLogs.map((a) => [
        fmtDate(a.createdAt, true),
        a.action,
        tronquer(a.user?.nomComplet, 34),
        tronquer(a.user?.role, 14),
        tronquer(`${a.entityType} ${a.entityId ?? ""}`, 44),
      ]),
      "Aucune entrée d'audit pour ce décompte.",
    );
    if (auditLogs.length === 60) {
      dossier.texte("Journal tronqué aux 60 entrées les plus récentes.", "#888", 6.5);
    }

    // ──────────────────────── SIGNATURES ────────────────────────
    dossier.section(11, "Signatures du circuit");
    const signataires = instance
      ? instance.definition.etapes.map((e) => ({
          role: LIBELLE_ROLE[e.roleRequis] ?? e.roleRequis,
          qualite: e.nom ?? undefined,
        }))
      : [
          { role: "Mission de contrôle" },
          { role: "Direction Technique" },
          { role: "Direction des Marchés" },
          { role: "Direction Admin. & Financière" },
          { role: "Directeur Général" },
        ];
    dossier.texte(
      instance
        ? `Circuit « ${instance.definition.nom ?? d.marche.financement} » — les cartouches ci-dessous suivent l'ordre réel des étapes.`
        : "Aucun circuit ouvert : cartouches génériques.",
      "#555", 6.5,
    );
    dossier.cartouchesSignature(signataires);

    dossier.encadre(
      "Ce dossier est un état imprimé de l'ERP. Les signatures manuscrites apposées ci-dessus en font foi. L'application ne produit à ce jour AUCUNE signature électronique opposable : les mentions de validation qu'elle contient tracent une action informatique, elles ne valent pas signature au sens de la loi L/2016/035/AN.",
      "#eef2f7", "#1e3a5f", "#1e3a5f",
    );

    paginer(doc, `Dossier ${d.reference} — ${d.marche.reference} — édité le ${new Date().toLocaleString("fr-FR")} par ${req.user.email}`);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="dossier-${d.reference}.pdf"`);
    doc.pipe(res);
    doc.end();

    await logAudit({
      userId: req.user.id, action: "UPDATE", entityType: "Decompte", entityId: d.id,
      after: { document: "dossier-complet-pdf", sections: 11 },
    });
  } catch (err) { next(err); }
});
