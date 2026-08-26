/**
 * Jeu de données de démonstration — chaîne complète AGEROUTE.
 *
 * Vide les attachements et décomptes existants, puis reconstruit des dossiers
 * cohérents de bout en bout : BPU du marché → attachement contradictoire
 * validé → décompte calculé sur ces quantités → validations par étape →
 * instance de workflow positionnée sur l'étape en cours → paiement pour les
 * dossiers soldés.
 *
 * Les montants ne sont pas inventés : ils sont calculés avec la formule du
 * moteur (TVA 18 %, ARMP 0,6 %, précompte 9/118 du TTC, retenue 5 % du TTC,
 * avance 20 % du HT), de sorte que les écrans de calcul soient vérifiables.
 *
 * Exécution : node seed-chaine-demo.cjs   (dans le conteneur erp-backend)
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ─── Arithmétique monétaire (entiers, arrondi au franc le plus proche) ───────
const pourcent = (base, taux) => (base * BigInt(Math.round(taux * 100)) + 5000n) / 10000n;
const fraction = (base, num, den) => (base * BigInt(num) + BigInt(den) / 2n) / BigInt(den);

function calculer({ ht, cumulPrecedent = 0n, penalites = 0n, revision = 0n, tauxAvance = 20 }) {
  const tva = pourcent(ht, 18);
  const armp = pourcent(ht, 0.6);
  const ttc = ht + tva + armp;
  const precompte = fraction(ttc, 9, 118);
  const retenue = pourcent(ttc, 5);
  const avance = pourcent(ht, tauxAvance);
  const net = ttc - precompte - retenue - armp - avance - penalites + revision;
  return {
    montantPeriodeHtGnf: ht,
    cumulPrecedentHtGnf: cumulPrecedent,
    cumulActuelHtGnf: cumulPrecedent + ht,
    tva, montantArmpGnf: armp, montantTtcGnf: ttc,
    precompteTvaGnf: precompte, retenueGarantie: retenue,
    avanceRecuperee: avance, penalites, revisionPrix: revision, netAPayer: net,
  };
}

const jour = (iso) => new Date(iso + "T09:00:00.000Z");

// ─── Bordereaux par nature de marché ────────────────────────────────────────
const BPU = {
  "MCHE-2024-001": [
    { code: "101", designation: "Installation de chantier et amenée du matériel", unite: "forfait", q: 1, pu: 2_400_000_000n },
    { code: "201", designation: "Déblais en terrain de toute nature", unite: "m3", q: 180_000, pu: 42_000n },
    { code: "301", designation: "Couche de fondation en grave latéritique 0/31,5", unite: "m3", q: 96_000, pu: 168_000n },
    { code: "401", designation: "Béton bitumineux 0/14 — couche de roulement 6 cm", unite: "t", q: 52_000, pu: 890_000n },
    { code: "501", designation: "Buses et ouvrages d'assainissement Ø 1000", unite: "ml", q: 3_400, pu: 1_250_000n },
    { code: "601", designation: "Signalisation horizontale et verticale", unite: "km", q: 34, pu: 118_000_000n },
  ],
  "MCHE-2024-008": [
    { code: "101", designation: "Installation de chantier", unite: "forfait", q: 1, pu: 780_000_000n },
    { code: "210", designation: "Reprofilage léger avec apport de matériaux", unite: "km", q: 58, pu: 145_000_000n },
    { code: "320", designation: "Point à temps — réparation de nids-de-poule", unite: "m2", q: 42_000, pu: 96_000n },
    { code: "430", designation: "Enduit superficiel bicouche", unite: "m2", q: 348_000, pu: 38_000n },
    { code: "540", designation: "Curage de fossés et exutoires", unite: "ml", q: 116_000, pu: 12_500n },
  ],
  "MCHE-2025-002": [
    { code: "101", designation: "Installation de chantier et signalisation temporaire", unite: "forfait", q: 1, pu: 1_100_000_000n },
    { code: "205", designation: "Démolition de chaussée existante", unite: "m2", q: 68_000, pu: 34_000n },
    { code: "310", designation: "Couche de base en grave-ciment", unite: "m3", q: 24_000, pu: 195_000n },
    { code: "415", designation: "Pavage en pavés autobloquants 8 cm", unite: "m2", q: 126_000, pu: 95_000n },
    { code: "520", designation: "Caniveaux couverts 60 × 60", unite: "ml", q: 9_800, pu: 420_000n },
    { code: "630", designation: "Bordures de trottoir T2", unite: "ml", q: 19_600, pu: 68_000n },
  ],
};

/**
 * Dossiers à créer. Chaque entrée décrit une situation réelle du circuit, de
 * la préparation au paiement, pour que chaque profil ait de quoi travailler.
 */
const DOSSIERS = [
  // ── MCHE-2024-001 — BAD — SOGEA-SATOM : marché avancé, 3 décomptes ──
  { marche: "MCHE-2024-001", num: 1, type: "PARTIEL", periode: ["2025-09-01", "2025-09-30"],
    partArticles: 0.18, statut: "PAYE", etapeWf: null, paye: true,
    validations: ["MISSION", "TECHNIQUE", "DMC", "DAF", "DG"] },
  { marche: "MCHE-2024-001", num: 2, type: "PARTIEL", periode: ["2025-12-01", "2025-12-31"],
    partArticles: 0.22, statut: "EN_CIRCUIT_FINANCIER", etapeWf: 4, paye: false,
    validations: ["MISSION", "TECHNIQUE", "DMC", "DAF"] },
  { marche: "MCHE-2024-001", num: 3, type: "PARTIEL", periode: ["2026-03-01", "2026-03-31"],
    partArticles: 0.15, statut: "EN_CONTROLE", etapeWf: 0, paye: false,
    validations: [] },

  // ── MCHE-2024-008 — FER — EGBTP ──
  { marche: "MCHE-2024-008", num: 1, type: "PARTIEL", periode: ["2025-10-01", "2025-10-31"],
    partArticles: 0.30, statut: "PAYE", etapeWf: null, paye: true,
    validations: ["MISSION", "TECHNIQUE", "DMC", "DAF", "DG"] },
  { marche: "MCHE-2024-008", num: 2, type: "PARTIEL", periode: ["2026-02-01", "2026-02-28"],
    partArticles: 0.25, statut: "EN_VALIDATION", etapeWf: 2, paye: false,
    validations: ["MISSION", "TECHNIQUE"] },

  // ── MCHE-2025-002 — Budget National — COLAS ──
  { marche: "MCHE-2025-002", num: 1, type: "AVANCE", periode: ["2026-01-01", "2026-01-31"],
    partArticles: 0.10, statut: "PAYE", etapeWf: null, paye: true,
    validations: ["MISSION", "TECHNIQUE", "DMC", "DAF", "DG"] },
  { marche: "MCHE-2025-002", num: 2, type: "PARTIEL", periode: ["2026-04-01", "2026-04-30"],
    partArticles: 0.20, statut: "EN_CONTROLE", etapeWf: 0, paye: false,
    validations: [] },
  { marche: "MCHE-2025-002", num: 3, type: "PARTIEL", periode: ["2026-07-01", "2026-07-31"],
    partArticles: 0.12, statut: "BROUILLON", etapeWf: null, paye: false,
    validations: [] },
];

const COMMENTAIRE = {
  MISSION: "Quantités constatées contradictoirement sur site — conformes aux attachements.",
  TECHNIQUE: "Contrôle technique effectué : conformité aux spécifications du CCTP.",
  DMC: "Vérification administrative et contractuelle : pièces complètes.",
  DAF: "Contrôle budgétaire : imputation disponible, montants vérifiés.",
  DG: "Décompte approuvé — ordonnancement autorisé.",
};

async function main() {
  console.log("── Purge des attachements et décomptes ──");

  // Ordre imposé par les contraintes : les enfants RESTRICT d'abord.
  const supprimes = {
    attachements: (await prisma.attachement.deleteMany({})).count,
    etapesCircuit: await prisma.$executeRawUnsafe('DELETE FROM circuit_financier_etapes'),
    circuits: await prisma.$executeRawUnsafe('DELETE FROM circuits_financiers'),
    documents: await prisma.$executeRawUnsafe('DELETE FROM documents WHERE "decompteId" IS NOT NULL'),
    paiements: (await prisma.paiement.deleteMany({})).count,
    wfActions: await prisma.$executeRawUnsafe('DELETE FROM workflow_actions'),
    wfInstances: await prisma.$executeRawUnsafe('DELETE FROM workflow_instances'),
    bpmnActions: await prisma.$executeRawUnsafe('DELETE FROM bpmn_actions'),
    bpmnInstances: await prisma.$executeRawUnsafe('DELETE FROM bpmn_instances'),
    decomptes: (await prisma.decompte.deleteMany({})).count,
    bpu: (await prisma.bpuArticle.deleteMany({})).count,
  };
  console.log("  supprimé :", JSON.stringify(supprimes));

  const marches = await prisma.marche.findMany({ where: { deletedAt: null } });
  const parRef = Object.fromEntries(marches.map((m) => [m.reference, m]));

  // ── Garanties de bonne exécution ──────────────────────────────────────────
  // Décision DAF du 26/08/2026 : l'exigence est INCONDITIONNELLE — le portail
  // refuse tout dépôt sur un marché sans caution de bonne exécution valide
  // (lib/eligibilite-depot.ts). Le jeu de démonstration doit montrer la règle
  // en vigueur, pas la contourner : chaque marché reçoit une caution valide
  // (sauf MCHE-2025-002, qui illustre le blocage sur caution expirée).
  console.log("── Garanties de bonne exécution ──");
  for (const m of marches) {
    const existante = await prisma.garantie.findFirst({ where: { marcheId: m.id, type: "BONNE_EXECUTION" } });
    if (existante) continue;
    const expiree = m.reference === "MCHE-2025-002";
    const dansUnAn = new Date(); dansUnAn.setFullYear(dansUnAn.getFullYear() + 1);
    const expiration = expiree ? new Date("2026-07-30") : dansUnAn;
    await prisma.garantie.create({
      data: {
        marcheId: m.id,
        type: "BONNE_EXECUTION",
        montantGnf: (m.montantActualiseGnf ?? m.montantInitialGnf ?? 0n) / 10n,
        dateEmission: new Date("2025-06-15"),
        dateExpiration: expiration,
        banque: expiree ? "BCI" : "BICIGUI",
        reference: `CAUTION-BE-${m.reference}`,
        active: true,
        observations: expiree ? "Expirée le 30/07/2026 — dépôt bloqué (décision DAF 26/08/2026)" : null,
      },
    });
    console.log(`  ${m.reference} : caution ${expiree ? "EXPIRÉE (blocage illustré)" : "valide"}`);
  }

  const users = await prisma.user.findMany({ select: { id: true, email: true, role: true, nomComplet: true } });
  const parRole = (r) => users.find((u) => u.role === r);
  const definitions = await prisma.workflowDefinition.findMany({
    where: { actif: true }, include: { etapes: { orderBy: { ordre: "asc" } } },
  });

  console.log("── Bordereaux de prix ──");
  const bpuParMarche = {};
  for (const [ref, articles] of Object.entries(BPU)) {
    const m = parRef[ref];
    if (!m) { console.log(`  marché ${ref} absent — ignoré`); continue; }
    bpuParMarche[ref] = [];
    for (const [i, a] of articles.entries()) {
      const cree = await prisma.bpuArticle.create({
        data: {
          marcheId: m.id, code: a.code, designation: a.designation, unite: a.unite,
          quantitePrevue: a.q, prixUnitaireGnf: a.pu,
          montantGnf: BigInt(Math.round(a.q)) * a.pu, ordre: i + 1,
        },
      });
      bpuParMarche[ref].push({ ...cree, q: a.q, pu: a.pu });
    }
    console.log(`  ${ref} : ${articles.length} articles`);
  }

  console.log("── Dossiers (attachement → décompte → validations → paiement) ──");
  const cumulParMarche = {};
  const consommeParArticle = {};
  let nbAtt = 0, nbDec = 0, nbPai = 0, nbWf = 0;

  for (const d of DOSSIERS) {
    const m = parRef[d.marche];
    const articles = bpuParMarche[d.marche];
    if (!m || !articles) continue;

    // Quantités exécutées sur la période : une part du bordereau, cumulée
    // proprement d'un décompte à l'autre (jamais plus que le contrat).
    const lignes = articles.map((a) => {
      const dejaFait = consommeParArticle[a.id] ?? 0;
      const courante = Math.min(Math.round(a.q * d.partArticles), a.q - dejaFait);
      consommeParArticle[a.id] = dejaFait + courante;
      return {
        article: a, quantitePrecedent: dejaFait, quantiteCourante: courante,
        quantiteCumulee: dejaFait + courante,
        montant: BigInt(Math.round(courante)) * a.pu,
      };
    }).filter((l) => l.quantiteCourante > 0);

    const ht = lignes.reduce((s, l) => s + l.montant, 0n);
    if (ht === 0n) continue;

    const cumulPrecedent = cumulParMarche[d.marche] ?? 0n;
    const montants = calculer({ ht, cumulPrecedent });
    cumulParMarche[d.marche] = cumulPrecedent + ht;

    const reference = `${d.marche}-DP-${String(d.num).padStart(2, "0")}`;
    const [debut, fin] = d.periode;

    const decompte = await prisma.decompte.create({
      data: {
        reference, type: d.type, statut: d.statut,
        marcheId: m.id, entrepriseId: m.entrepriseId,
        periodeDebut: jour(debut), periodeFin: jour(fin),
        ...montants,
        createdAt: jour(fin),
      },
    });
    nbDec++;

    // Chaque ligne porte son propre détail de calcul : c'est ce que l'onglet
    // Calculs affiche, et il doit se recomposer exactement en total.
    for (const l of lignes) {
      const c = calculer({ ht: l.montant });
      await prisma.decompteLigne.create({
        data: {
          decompteId: decompte.id, codeArticle: l.article.code,
          designation: l.article.designation, unite: l.article.unite,
          quantiteContrat: l.article.q, quantitePrecedent: l.quantitePrecedent,
          quantiteCourante: l.quantiteCourante, quantiteCumulee: l.quantiteCumulee,
          prixUnitaire: l.article.pu,
          montantBrut: l.montant,
          tauxTva: 18, montantTva: c.tva,
          tauxArmp: 0.6, montantArmp: c.montantArmpGnf,
          montantTtc: c.montantTtcGnf,
          precompteTva: c.precompteTvaGnf,
          tauxRetenue: 5, montantRetenue: c.retenueGarantie,
          tauxAvance: 20, montantAvanceRecup: c.avanceRecuperee,
          montantNet: c.netAPayer,
          statut: "OK",
        },
      });
    }

    // Attachement contradictoire — validé dès lors que le décompte a dépassé
    // le stade brouillon : un décompte ne se soumet pas sans constat.
    const attValide = d.statut !== "BROUILLON";
    const principal = lignes[0];
    const att = await prisma.attachement.create({
      data: {
        decompteId: decompte.id,
        bpuArticleId: principal.article.id,
        code: `ATT-${reference.slice(-13)}`,
        statut: attValide ? "VALIDE" : "BROUILLON",
        typeAttachement: "MENSUEL",
        periodeDebut: jour(debut), periodeFin: jour(fin),
        soumisAt: jour(fin), valideAt: attValide ? jour(fin) : null,
        createdById: parRole("ENTREPRISE")?.id ?? null,
        natureTravaux: `Travaux exécutés du ${debut} au ${fin}`,
        unite: principal.article.unite,
        quantitePrevue: principal.article.q,
        quantiteExecutee: principal.quantiteCourante,
        cumulExecuteAvant: principal.quantitePrecedent,
        prixUnitaireGnf: principal.article.pu,
        montantHtGnf: ht,
        montantTvaGnf: montants.tva,
        valideParMission: attValide,
        valideParTechnique: attValide,
        createdAt: jour(fin),
      },
    });
    nbAtt++;

    for (const l of lignes) {
      await prisma.attachementLigne.create({
        data: {
          attachementId: att.id, codeArticle: l.article.code,
          designation: l.article.designation, unite: l.article.unite,
          quantiteContrat: l.article.q, quantitePrecedent: l.quantitePrecedent,
          quantiteCourante: l.quantiteCourante, quantiteCumulee: l.quantiteCumulee,
          prixUnitaire: l.article.pu, montant: l.montant, statut: "OK",
        },
      });
    }

    // Validations franchies, dans l'ordre du circuit.
    for (const [i, etape] of d.validations.entries()) {
      const u = parRole(etape);
      if (!u) continue;
      await prisma.decompteValidation.create({
        data: {
          decompteId: decompte.id, etape, decision: "APPROUVE",
          commentaire: COMMENTAIRE[etape],
          validePar: u.id, valideNom: u.nomComplet, valideRole: u.role,
          valideAt: new Date(jour(fin).getTime() + (i + 1) * 86400000),
        },
      });
    }

    // Instance de workflow positionnée sur l'étape en cours — sans quoi
    // « Mes tâches » reste vide et personne ne peut agir.
    if (d.etapeWf !== null) {
      const def = definitions.find((x) => x.financement === m.financement);
      if (def) {
        const inst = await prisma.workflowInstance.create({
          data: {
            definitionId: def.id, decompteId: decompte.id,
            etapeActuelle: d.etapeWf, statut: "EN_COURS", createdAt: jour(fin),
          },
        });
        nbWf++;
        for (const [i, etape] of d.validations.entries()) {
          const u = parRole(etape);
          const etapeDef = def.etapes[i];
          if (!u || !etapeDef) continue;
          await prisma.workflowAction.create({
            data: {
              instanceId: inst.id, etapeId: etapeDef.id, userId: u.id,
              decision: "APPROUVE", commentaire: COMMENTAIRE[etape],
              createdAt: new Date(jour(fin).getTime() + (i + 1) * 86400000),
            },
          });
        }
      }
    }

    if (d.paye) {
      await prisma.paiement.create({
        data: {
          decompteId: decompte.id, montantGnf: montants.netAPayer,
          statut: "EXECUTE", banque: "BCRG",
          reference: `VIR-${reference}`,
          typeCircuit: m.financement === "BUDGET_NATIONAL" ? "TRESOR" : "BAILLEUR",
          refBcrg: `BCRG-${reference.slice(-13)}`,
          dateOrdre: new Date(jour(fin).getTime() + 22 * 86400000),
          dateExecution: new Date(jour(fin).getTime() + 30 * 86400000),
          // F10 — confirmation bancaire : le montant réellement transféré.
          montantReelGnf: montants.netAPayer,
          dateReelleTransfert: new Date(jour(fin).getTime() + 30 * 86400000),
          confirmePar: "bcrg@ageroute.gov.gn",
          confirmeAt: new Date(jour(fin).getTime() + 31 * 86400000),
          createdAt: new Date(jour(fin).getTime() + 30 * 86400000),
        },
      });
      nbPai++;
    }

    console.log(`  ${reference.padEnd(22)} ${String(d.statut).padEnd(22)} HT ${ht.toString().padStart(15)}  net ${montants.netAPayer.toString().padStart(15)}`);
  }

  // ── Périmètres : chaque contrôleur sur ses marchés ──
  console.log("── Périmètres d'affectation ──");
  await prisma.marcheAffectation.deleteMany({});
  const affectations = {
    "mission@ageroute.gov.gn": ["MCHE-2024-001", "MCHE-2025-002"],
    "technique@ageroute.gov.gn": ["MCHE-2024-001", "MCHE-2024-008", "MCHE-2025-002"],
    "bailleur@ageroute.gov.gn": ["MCHE-2024-001"],
  };
  for (const [email, refs] of Object.entries(affectations)) {
    const u = users.find((x) => x.email === email);
    if (!u) continue;
    for (const ref of refs) {
      if (parRef[ref]) await prisma.marcheAffectation.create({ data: { userId: u.id, marcheId: parRef[ref].id } });
    }
    console.log(`  ${email.padEnd(30)} ${refs.join(", ")}`);
  }

  console.log(`\n── Résumé : ${nbDec} décomptes, ${nbAtt} attachements, ${nbWf} instances de workflow, ${nbPai} paiements ──`);
}

main()
  .catch((e) => { console.error("ÉCHEC :", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
