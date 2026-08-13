/**
 * Remise à zéro + jeu de données complet et cohérent (tous modules).
 * Conserve : utilisateurs, paramètres, définitions de workflow, droits/accès.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const j = (n: number) => new Date(Date.now() - n * 86400000);
const del = async (m: string) => { try { const r = await (prisma as any)[m].deleteMany({}); console.log("purge", m, r.count); } catch (e) { console.log("skip", m); } };

async function main() {
  // ── PURGE (enfants → parents) ──
  await prisma.user.updateMany({ data: { entrepriseId: null } });
  for (const m of ["decompteValidation","decompteCommentaire","decomptePaymentTrace","paiement","decompteLigne",
    "circuitFinancierEtape","circuitFinancier","workflowAction","workflowInstance","document",
    "attachementMesure","attachementGPS","attachementMedia","attachementLigne","attachementValidation","attachementCommentaire","attachement",
    "decompte","reception","garantie","avenant","ordreService","bpuArticle","lot","marcheAffectation",
    "revisionComposante","formuleRevision","indexMensuel",
    "fundingAllocation","fundingEnvelope","fundingDocument","funding",
    "historiqueStatutMarche","conformiteVerification","alerteEntreprise","documentEntreprise","contactEntreprise",
    "companyMarket","companyUser","delegation","marche","projet","entreprise"]) await del(m);
  try { await prisma.$executeRawUnsafe(`DELETE FROM bpmn_actions`); await prisma.$executeRawUnsafe(`DELETE FROM bpmn_instances`); console.log("purge bpmn raw"); } catch { console.log("skip bpmn raw"); }

  // ── ENTREPRISES ──
  const entD = (n: string, sigle: string, nif: string, score: number, statut: string, exp: number) => ({
    raisonSociale: n, sigle, nif, rccm: `RCCM/GN/CKY/2019/${nif.slice(-4)}`, statut: statut as any,
    scoreConformite: score, regulariteFiscale: true, attestationFiscaleExpire: j(-exp),
    regulariteSociale: true, attestationSocialeExpire: j(-exp - 20), assujettTVA: true, numerotva: `TVA-${nif.slice(-5)}`,
    attestationValide: score >= 70, cautionBancaire: score >= 70, iban: `GN82 BICI ${nif.slice(-8)} 001`,
    agrement: `AGR-BTP-${nif.slice(-4)}`, autoriseContracterEtat: true, telephone: "+224 620 00 00 00",
    email: `contact@${sigle.toLowerCase()}.gn`, adresse: "Conakry, Kaloum",
  });
  const e1 = await prisma.entreprise.create({ data: entD("COLAS Afrique — Agence Guinée", "COLAS", "NIF-GN-2020-00612", 94, "CONFORME", 210) as any });
  const e2 = await prisma.entreprise.create({ data: entD("SOGEA-SATOM Guinée", "SOGEA", "NIF-GN-2018-00451", 87, "CONFORME", 150) as any });
  const e3 = await prisma.entreprise.create({ data: entD("EGBTP — Entreprise Générale de BTP", "EGBTP", "NIF-GN-2015-00287", 82, "CONFORME", 95) as any });
  const e4 = await prisma.entreprise.create({ data: { ...entD("SORED Bâtiment & Routes", "SORED", "NIF-GN-2012-00134", 58, "A_REGULARISER", -10), attestationValide: false, cautionBancaire: false } as any });

  // relier les comptes portail existants (rôle ENTREPRISE) : 1er→COLAS, 2e→SORED
  const portail = await prisma.user.findMany({ where: { role: "ENTREPRISE" as any }, orderBy: { createdAt: "asc" } });
  if (portail[0]) await prisma.user.update({ where: { id: portail[0].id }, data: { entrepriseId: e1.id } });
  if (portail[1]) await prisma.user.update({ where: { id: portail[1].id }, data: { entrepriseId: e4.id } });

  // ── PROJETS ──
  const p1 = await prisma.projet.create({ data: { code: "PCBR-BAD-2024", intitule: "Projet de Construction Basse Côte — Financement BAD", type: "TRAVAUX_ROUTIERS", statut: "EN_EXECUTION" as any, bailleurPrincipal: "BAD", region: "Basse Côte" } as any });
  const p2 = await prisma.projet.create({ data: { code: "ENTRET-FER-2025", intitule: "Entretien Réseau National 2025 — FER", type: "TRAVAUX_ROUTIERS", statut: "EN_EXECUTION" as any, bailleurPrincipal: "FER", region: "National" } as any });
  const p3 = await prisma.projet.create({ data: { code: "PRRUE-2025", intitule: "Réhabilitation Routes Urbaines — Budget National", type: "TRAVAUX_ROUTIERS", statut: "APPROUVE" as any, region: "Conakry" } as any });

  // ── MARCHÉS ──
  const mD = (ref: string, intit: string, eId: string, pId: string, fin: string, montant: bigint, sign: number, dureeM: number, mc: string) => ({
    reference: ref, intitule: intit, objet: intit, type: "TRAVAUX", procedure: "APPEL_OFFRES_OUVERT", statut: "EN_EXECUTION" as any,
    financement: fin as any, montantInitialGnf: montant, tauxTva: 18, tauxRetenueGarantie: 5, tauxAvance: 20,
    montantAvanceGnf: montant / 5n, penalitesJourGnf: montant / 1000n, plafondPenalitesPct: 10,
    entrepriseId: eId, projetId: pId, numContrat: `CNT/${ref}`, delaiMois: dureeM,
    dateSignature: j(sign), dateNotification: j(sign - 10), dateOs: j(sign - 20), dateDebutPrevue: j(sign - 20),
    dateFinPrevue: new Date(j(sign - 20).getTime() + dureeM * 30 * 86400000),
    missionControle: mc, directionTechnique: "DT AGEROUTE", regionNom: "Basse Côte",
  });
  const m1 = await prisma.marche.create({ data: mD("MCHE-2024-001", "Réhabilitation RN1 Tronçon Conakry–Coyah (34 km)", e2.id, p1.id, "BAD", 126_000_000_000n, 420, 24, "Équipe Mission A") as any });
  const m2 = await prisma.marche.create({ data: mD("MCHE-2024-008", "Entretien Périodique RN3 Kindia–Mamou (58 km)", e3.id, p2.id, "FER", 38_400_000_000n, 300, 18, "Équipe Mission A") as any });
  const m3 = await prisma.marche.create({ data: mD("MCHE-2025-002", "Voiries Urbaines de Ratoma — Lot 1", e1.id, p3.id, "BUDGET_NATIONAL", 52_000_000_000n, 160, 15, "Équipe Mission B") as any });
  const m4 = await prisma.marche.create({ data: { ...mD("MCHE-2025-011", "Pont de Dubréka et accès (420 ml)", e4.id, p3.id, "BUDGET_NATIONAL", 21_500_000_000n, 90, 12, "Équipe Mission B"), statut: "SIGNE" as any } as any });

  // BPU (m1)
  const bpu = [["T-001","Terrassement généraux","m3",180000,45000],["C-002","Couche de base GNT 0/31.5","m2",240000,12000],["R-003","Revêtement béton bitumineux","m2",238000,85000],["O-004","Ouvrages d'assainissement","ml",6800,350000],["S-005","Signalisation horizontale","ml",68000,8000]];
  for (const [code, des, u, q, pu] of bpu) await prisma.bpuArticle.create({ data: { marcheId: m1.id, code: code as string, designation: des as string, unite: u as string, quantite: q as number, prixUnitaireGnf: BigInt(pu as number) } as any }).catch(() => {});

  // ── GARANTIES ──
  for (const [mId, type, mt, exp] of [[m1.id,"AVANCE",25_200_000_000n,120],[m1.id,"BONNE_EXECUTION",6_300_000_000n,400],[m2.id,"AVANCE",7_680_000_000n,60],[m2.id,"BONNE_EXECUTION",1_920_000_000n,300],[m3.id,"BONNE_EXECUTION",2_600_000_000n,25],[m4.id,"BONNE_EXECUTION",1_075_000_000n,380]] as [string,string,bigint,number][])
    await prisma.garantie.create({ data: { marcheId: mId, type, montantGnf: mt, dateEmission: j(200), dateExpiration: j(-exp), active: true, banque: "BICIGUI", reference: `CAU-${type.slice(0,3)}-${mId.slice(0,4)}` } as any });

  // ── ORDRES DE SERVICE ── (m2 : arrêt 21 j pendant l'hivernage, repris)
  await prisma.ordreService.create({ data: { marcheId: m1.id, numero: 1, type: "DEMARRAGE", objet: "OS de démarrage des travaux", dateEmission: j(400), dateEffet: j(400) } });
  await prisma.ordreService.create({ data: { marcheId: m2.id, numero: 1, type: "DEMARRAGE", objet: "OS de démarrage des travaux", dateEmission: j(280), dateEffet: j(280) } });
  await prisma.ordreService.create({ data: { marcheId: m2.id, numero: 2, type: "ARRET", objet: "Arrêt hivernage — fortes pluies", dateEmission: j(150), dateEffet: j(150) } });
  await prisma.ordreService.create({ data: { marcheId: m2.id, numero: 3, type: "REPRISE", objet: "Reprise après hivernage", dateEmission: j(129), dateEffet: j(129) } });
  await prisma.ordreService.create({ data: { marcheId: m3.id, numero: 1, type: "DEMARRAGE", objet: "OS de démarrage des travaux", dateEmission: j(140), dateEffet: j(140) } });

  // ── AVENANT (m1, 8 %, actif) ──
  await prisma.avenant.create({ data: { marcheId: m1.id, numero: 1, objet: "Renforcement assainissement PK12–PK18", motif: "Zone inondable constatée", montantSupplementaireGnf: 10_080_000_000n, prolongationJours: 60, statut: "ACTIF", dateSignature: j(120), approbationArmpRef: null } as any });
  await prisma.marche.update({ where: { id: m1.id }, data: { montantActualiseGnf: 136_080_000_000n } });

  // ── RÉVISION DE PRIX (m1) + INDEX ──
  await prisma.formuleRevision.create({ data: { marcheId: m1.id, coeffFixe: 0.15, actif: true, composantes: { create: [
    { nom: "Bitume", coefficient: 0.35, indexCode: "BITUME", valeurBase: 100 },
    { nom: "Ciment", coefficient: 0.20, indexCode: "CIMENT", valeurBase: 100 },
    { nom: "Gasoil", coefficient: 0.20, indexCode: "GASOIL", valeurBase: 100 },
    { nom: "Main d'œuvre", coefficient: 0.10, indexCode: "SMIG", valeurBase: 100 },
  ] } } });
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    for (const [code, lib, base] of [["BITUME","Indice bitume",112],["CIMENT","Indice ciment",106],["GASOIL","Indice gasoil",109],["SMIG","Indice main d'œuvre",103]] as [string,string,number][])
      await prisma.indexMensuel.create({ data: { code, libelle: lib, annee: d.getFullYear(), mois: d.getMonth() + 1, valeur: base - i } }).catch(() => {});
  }

  // ── DÉCOMPTES + cycle complet ──
  const mkDec = async (m: any, eId: string, num: number, ht: bigint, statut: string, cumulPrec: bigint, depot: number, extra: object = {}) => {
    const tva = ht * 18n / 100n, armp = ht * 6n / 1000n, ttc = ht + tva + armp;
    const prec = ttc * 9n / 118n, rg = ttc * 5n / 100n, av = ht * 20n / 100n;
    return prisma.decompte.create({ data: {
      reference: `${m.reference}-DP-${String(num).padStart(2, "0")}`, numeroDossier: `ED-2026-${m.reference.slice(-3)}${num}`,
      type: "PARTIEL" as any, statut: statut as any, marcheId: m.id, entrepriseId: eId,
      montantPeriodeHtGnf: ht, cumulPrecedentHtGnf: cumulPrec, cumulActuelHtGnf: cumulPrec + ht,
      tva, montantArmpGnf: armp, montantTtcGnf: ttc, precompteTvaGnf: prec, retenueGarantie: rg,
      avanceRecuperee: av, penalites: 0n, netAPayer: ttc - prec - rg - armp - av,
      dateDepot: j(depot), periodeDebut: j(depot + 30), periodeFin: j(depot), ...extra,
    } as any });
  };
  const valid = async (dId: string, etape: string, at: number, com: string) =>
    prisma.decompteValidation.create({ data: { decompteId: dId, etape, decision: "APPROUVE", commentaire: com, validePar: "seed", valideNom: `${etape.toLowerCase()}@ageroute.gov.gn`, valideRole: etape, valideAt: j(at) } });

  // m1 : DP-01 PAYE (circuit complet), DP-02 EN_CIRCUIT_FINANCIER, DP-03 SOUMIS (attend Mission+Technique)
  const d11 = await mkDec(m1, e2.id, 1, 8_400_000_000n, "PAYE", 0n, 210, { datePaiement: j(160) });
  for (const [et, at] of [["MISSION",205],["TECHNIQUE",202],["DMC",198],["DAF",193],["DG",188]] as [string,number][]) await valid(d11.id, et, at, `Visa ${et} — conforme`);
  const d12 = await mkDec(m1, e2.id, 2, 11_200_000_000n, "EN_CIRCUIT_FINANCIER", 8_400_000_000n, 90);
  for (const [et, at] of [["MISSION",85],["TECHNIQUE",82],["DMC",78],["DAF",74],["DG",70]] as [string,number][]) await valid(d12.id, et, at, `Visa ${et} — conforme`);
  await prisma.circuitFinancier.create({ data: { decompteId: d12.id, type: "BAILLEUR", statut: "EN_COURS", etapeActuelle: 2, etapes: { createMany: { data: [
    { ordre: 1, nom: "Visa DG", roleOuService: "DG", statut: "VALIDE" }, { ordre: 2, nom: "Bailleur/PTF", roleOuService: "BAILLEUR", statut: "EN_ATTENTE" },
    { ordre: 3, nom: "Budget/MEF", roleOuService: "BUDGET", statut: "EN_ATTENTE" }, { ordre: 4, nom: "DNTCP", roleOuService: "TRESOR", statut: "EN_ATTENTE" },
    { ordre: 5, nom: "BCRG", roleOuService: "BCRG", statut: "EN_ATTENTE" }, { ordre: 6, nom: "Paiement", roleOuService: "DAF", statut: "EN_ATTENTE" },
  ] } } } as any });
  const d13 = await mkDec(m1, e2.id, 3, 9_600_000_000n, "SOUMIS", 19_600_000_000n, 6);

  // m2 : DP-01 PAYE, DP-02 VISA_DAF
  const d21 = await mkDec(m2, e3.id, 1, 5_760_000_000n, "PAYE", 0n, 170, { datePaiement: j(120) });
  for (const [et, at] of [["MISSION",165],["TECHNIQUE",161],["DMC",156],["DAF",151],["DG",147]] as [string,number][]) await valid(d21.id, et, at, `Visa ${et} — conforme`);
  const d22 = await mkDec(m2, e3.id, 2, 4_800_000_000n, "VISA_DAF", 5_760_000_000n, 25);
  for (const [et, at] of [["MISSION",20],["TECHNIQUE",17],["DMC",12]] as [string,number][]) await valid(d22.id, et, at, `Visa ${et} — conforme`);

  // m3 : DP-01 SOUMIS avec visa Mission déjà posé (parallèle : attend Technique)
  const d31 = await mkDec(m3, e1.id, 1, 6_500_000_000n, "SOUMIS", 0n, 4);
  await valid(d31.id, "MISSION", 2, "Quantités vérifiées sur site — conforme");

  // ── ATTACHEMENTS ──
  const mkAtt = async (dec: any, num: number, statut: string, ht: bigint, lignes: [string,string,string,number,number][], withMedia: boolean) => {
    const att = await prisma.attachement.create({ data: {
      decompteId: dec.id, code: `ATT-2026-${String(num).padStart(4, "0")}`, statut: statut as any, typeAttachement: "MENSUEL" as any,
      soumisAt: j(8), valideAt: statut === "VALIDE" ? j(5) : null, natureTravaux: "Travaux de la période", unite: "FF",
      quantitePrevue: 1, quantiteExecutee: 1, prixUnitaireGnf: ht, montantHtGnf: ht,
      montantTvaGnf: ht * 18n / 100n, montantArmpGnf: ht * 6n / 1000n, montantTtcGnf: ht * 1186n / 1000n,
      valideParMission: statut === "VALIDE", valideParTechnique: statut === "VALIDE",
      lignes: { create: lignes.map(([c, des, u, q, pu], i) => ({ codeArticle: c, designation: des, unite: u, quantiteContrat: q * 3, quantitePrecedent: 0, quantiteCourante: q, quantiteCumulee: q, prixUnitaire: BigInt(pu), montant: BigInt(q * pu) })) },
      pointsGPS: { create: [{ latitude: 9.641 + num / 100, longitude: -13.578, description: "Début de section", capturePar: "mission@ageroute.gov.gn", captureAt: j(9) }] },
      ...(withMedia ? { medias: { create: [
        { type: "DOCUMENT" as any, cheminFichier: "attachement-signe.pdf", urlPublique: "/api/uploads/files/seed-attachement-signe.pdf", legende: "Attachement contradictoire signé", prisPar: "entreprise", prisAt: j(9) },
        { type: "PHOTO" as any, cheminFichier: "chantier-pk12.jpg", urlPublique: null, legende: "Chantier PK12", prisPar: "entreprise", prisAt: j(9) },
      ] } } : {}),
    } as any });
    if (statut === "VALIDE") {
      await prisma.attachementValidation.create({ data: { attachementId: att.id, etape: "MISSION", statut: "APPROUVE", commentaire: "Quantités conformes", validePar: "seed", valideNom: "mission@ageroute.gov.gn" } as any }).catch(() => {});
      await prisma.attachementValidation.create({ data: { attachementId: att.id, etape: "TECHNIQUE", statut: "APPROUVE", commentaire: "Visa technique", validePar: "seed", valideNom: "technique@ageroute.gov.gn" } as any }).catch(() => {});
    }
    return att;
  };
  await mkAtt(d11, 1, "VALIDE", 8_400_000_000n, [["T-001","Terrassement PK0-PK8","m3",60000,45000],["C-002","Couche de base","m2",80000,12000]], false);
  await mkAtt(d12, 2, "VALIDE", 11_200_000_000n, [["R-003","Revêtement PK0-PK6","m2",78000,85000]], false);
  await mkAtt(d13, 3, "SOUMIS", 9_600_000_000n, [["R-003","Revêtement PK6-PK11","m2",65000,85000],["O-004","Assainissement PK8","ml",1200,350000]], true);
  await mkAtt(d31, 4, "SOUMIS", 6_500_000_000n, [["V-001","Pavage voirie Ratoma","m2",42000,95000]], true);

  // ── RÉCEPTION (OPR réalisée sur m2) ──
  await prisma.reception.create({ data: { marcheId: m2.id, type: "OPR", statut: "AVEC_RESERVES", datePrevu: j(40), dateReelle: j(35), pvNumero: "PV-OPR-2026-014",
    presentsEntreprise: "Dir. travaux EGBTP", presentsAgeroute: "Ing. Camara (Mission), Ing. Diallo (DT)", presentsAutres: "Représentant FER",
    reserves: ["Reprise signalisation PK22-PK24", "Nettoyage fossés PK30"] as any, delaiLeveeReserves: 30, signedAt: j(33),
    pieces: [{ nom: "pv-opr-signe.pdf", url: "/api/uploads/files/seed-pv-opr.pdf", type: "DOCUMENT" }] as any } as any });

  // ── AFFECTATIONS : agents terrain → leurs marchés ──
  const missions = await prisma.user.findMany({ where: { role: { in: ["MISSION", "TECHNIQUE"] as any[] }, actif: true } });
  for (const u of missions) {
    for (const mid of [m1.id, m2.id]) await prisma.marcheAffectation.create({ data: { userId: u.id, marcheId: mid } }).catch(() => {});
  }
  console.log(`affectations: ${missions.length} agent(s) → m1+m2`);
  console.log("SEED TERMINÉ");
}
main().finally(() => prisma.$disconnect());
