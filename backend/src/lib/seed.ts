import { prisma } from "./prisma";
import bcrypt from "bcryptjs";

async function main() {
  // Mot de passe initial des comptes de démarrage : jamais en dur dans le code.
  // Fournir SEED_PASSWORD au lancement du seed, puis le changer à la première connexion.
  const seedPassword = process.env.SEED_PASSWORD;
  if (!seedPassword) {
    throw new Error("SEED_PASSWORD est requis pour exécuter le seed (aucune valeur par défaut).");
  }
  const passwordHash = await bcrypt.hash(seedPassword, 12);

  // ─── 14 comptes utilisateurs ──────────────────────────────────────────────
  const users = [
    { email: "admin@ageroute.gov.gn",        nomComplet: "Administrateur ERP",              role: "ADMIN" },
    { email: "tidiane.diallo@ageroute.gov.gn",nomComplet: "Tidiane Diallo",                 role: "ADMIN" },
    { email: "dg@ageroute.gov.gn",            nomComplet: "Directeur Général",               role: "DG" },
    { email: "daf@ageroute.gov.gn",           nomComplet: "Directeur Administratif Financier",role:"DAF" },
    { email: "dmc@ageroute.gov.gn",           nomComplet: "Direction Marchés et Contrats",   role: "DMC" },
    { email: "ugp@ageroute.gov.gn",           nomComplet: "Unité de Gestion de Projet",      role: "UGP" },
    { email: "mission@ageroute.gov.gn",       nomComplet: "Mission de Contrôle",             role: "MISSION" },
    { email: "technique@ageroute.gov.gn",     nomComplet: "Direction Technique",             role: "TECHNIQUE" },
    { email: "entreprise@ageroute.gov.gn",    nomComplet: "Entreprise Titulaire",            role: "ENTREPRISE" },
    { email: "auditeur@ageroute.gov.gn",      nomComplet: "Auditeur Interne",                role: "AUDITEUR" },
    { email: "bailleur@ageroute.gov.gn",      nomComplet: "Représentant Bailleur",           role: "BAILLEUR" },
    { email: "budget@ageroute.gov.gn",        nomComplet: "Direction du Budget (MEF)",       role: "BUDGET" },
    { email: "tresor@ageroute.gov.gn",        nomComplet: "Direction Générale du Trésor",    role: "TRESOR" },
    { email: "fer@ageroute.gov.gn",           nomComplet: "Fonds d'Entretien Routier",       role: "FER_AGT" },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { nomComplet: u.nomComplet, role: u.role as never, actif: true },
      create: { email: u.email, nomComplet: u.nomComplet, passwordHash, role: u.role as never, actif: true },
    });
  }
  console.log(`✓ ${users.length} comptes utilisateurs`);

  // ─── Circuits workflow complets selon §8 CDC ──────────────────────────────
  // Circuit standard §8 : Mission → Technique → DMC → DAF → DG (+ étapes bailleur/budget/trésor)
  // UGP ajouté pour les bailleurs multilatéraux (BM, UE)

  type Etape = { nom: string; role: string; jours: number };
  const circuits: { financement: string; nom: string; etapes: Etape[] }[] = [
    {
      financement: "BANQUE_MONDIALE",
      nom: "Circuit Banque Mondiale",
      etapes: [
        { nom: "Mission de contrôle",    role: "MISSION",    jours: 7 },
        { nom: "Direction Technique",    role: "TECHNIQUE",  jours: 5 },
        { nom: "UGP",                    role: "UGP",        jours: 3 },
        { nom: "DMC",                    role: "DMC",        jours: 5 },
        { nom: "DAF",                    role: "DAF",        jours: 3 },
        { nom: "Direction Générale",     role: "DG",         jours: 2 },
        { nom: "Bailleur (BM)",          role: "BAILLEUR",   jours: 10 },
      ],
    },
    {
      financement: "BAD",
      nom: "Circuit BAD",
      etapes: [
        { nom: "Mission de contrôle",    role: "MISSION",    jours: 7 },
        { nom: "Direction Technique",    role: "TECHNIQUE",  jours: 5 },
        { nom: "DMC",                    role: "DMC",        jours: 5 },
        { nom: "DAF",                    role: "DAF",        jours: 3 },
        { nom: "Direction Générale",     role: "DG",         jours: 2 },
        { nom: "Bailleur (BAD)",         role: "BAILLEUR",   jours: 10 },
      ],
    },
    {
      financement: "UE",
      nom: "Circuit Union Européenne",
      etapes: [
        { nom: "Mission de contrôle",    role: "MISSION",    jours: 7 },
        { nom: "Direction Technique",    role: "TECHNIQUE",  jours: 5 },
        { nom: "UGP",                    role: "UGP",        jours: 3 },
        { nom: "DMC",                    role: "DMC",        jours: 5 },
        { nom: "DAF",                    role: "DAF",        jours: 3 },
        { nom: "Direction Générale",     role: "DG",         jours: 2 },
        { nom: "Bailleur (UE)",          role: "BAILLEUR",   jours: 10 },
      ],
    },
    {
      financement: "BOAD",
      nom: "Circuit BOAD",
      etapes: [
        { nom: "Mission de contrôle",    role: "MISSION",    jours: 7 },
        { nom: "Direction Technique",    role: "TECHNIQUE",  jours: 5 },
        { nom: "DMC",                    role: "DMC",        jours: 5 },
        { nom: "DAF",                    role: "DAF",        jours: 3 },
        { nom: "Direction Générale",     role: "DG",         jours: 2 },
        { nom: "Bailleur (BOAD)",        role: "BAILLEUR",   jours: 10 },
      ],
    },
    {
      financement: "BID",
      nom: "Circuit BID",
      etapes: [
        { nom: "Mission de contrôle",    role: "MISSION",    jours: 7 },
        { nom: "Direction Technique",    role: "TECHNIQUE",  jours: 5 },
        { nom: "DMC",                    role: "DMC",        jours: 5 },
        { nom: "DAF",                    role: "DAF",        jours: 3 },
        { nom: "Direction Générale",     role: "DG",         jours: 2 },
        { nom: "Bailleur (BID)",         role: "BAILLEUR",   jours: 10 },
      ],
    },
    {
      financement: "BADEA",
      nom: "Circuit BADEA",
      etapes: [
        { nom: "Mission de contrôle",    role: "MISSION",    jours: 7 },
        { nom: "Direction Technique",    role: "TECHNIQUE",  jours: 5 },
        { nom: "DMC",                    role: "DMC",        jours: 5 },
        { nom: "DAF",                    role: "DAF",        jours: 3 },
        { nom: "Direction Générale",     role: "DG",         jours: 2 },
        { nom: "Bailleur (BADEA)",       role: "BAILLEUR",   jours: 10 },
      ],
    },
    {
      financement: "AFD",
      nom: "Circuit AFD",
      etapes: [
        { nom: "Mission de contrôle",    role: "MISSION",    jours: 7 },
        { nom: "Direction Technique",    role: "TECHNIQUE",  jours: 5 },
        { nom: "DMC",                    role: "DMC",        jours: 5 },
        { nom: "DAF",                    role: "DAF",        jours: 3 },
        { nom: "Direction Générale",     role: "DG",         jours: 2 },
        { nom: "Bailleur (AFD)",         role: "BAILLEUR",   jours: 10 },
      ],
    },
    {
      financement: "KFW",
      nom: "Circuit KFW",
      etapes: [
        { nom: "Mission de contrôle",    role: "MISSION",    jours: 7 },
        { nom: "Direction Technique",    role: "TECHNIQUE",  jours: 5 },
        { nom: "DMC",                    role: "DMC",        jours: 5 },
        { nom: "DAF",                    role: "DAF",        jours: 3 },
        { nom: "Direction Générale",     role: "DG",         jours: 2 },
        { nom: "Bailleur (KFW)",         role: "BAILLEUR",   jours: 10 },
      ],
    },
    {
      financement: "BUDGET_NATIONAL",
      nom: "Circuit Budget National",
      etapes: [
        { nom: "Mission de contrôle",    role: "MISSION",    jours: 7 },
        { nom: "Direction Technique",    role: "TECHNIQUE",  jours: 5 },
        { nom: "DMC",                    role: "DMC",        jours: 5 },
        { nom: "DAF",                    role: "DAF",        jours: 3 },
        { nom: "Direction Générale",     role: "DG",         jours: 2 },
        { nom: "Direction du Budget",    role: "BUDGET",     jours: 5 },
        { nom: "Trésor Public",          role: "TRESOR",     jours: 5 },
      ],
    },
    {
      financement: "FER",
      nom: "Circuit FER",
      etapes: [
        { nom: "Mission de contrôle",    role: "MISSION",    jours: 7 },
        { nom: "Direction Technique",    role: "TECHNIQUE",  jours: 5 },
        { nom: "DMC",                    role: "DMC",        jours: 5 },
        { nom: "DAF",                    role: "DAF",        jours: 3 },
        { nom: "Direction Générale",     role: "DG",         jours: 2 },
        { nom: "FER",                    role: "FER_AGT",    jours: 5 },
        { nom: "Trésor Public",          role: "TRESOR",     jours: 5 },
      ],
    },
    {
      financement: "AUTRE",
      nom: "Circuit Autre Bailleur",
      etapes: [
        { nom: "Mission de contrôle",    role: "MISSION",    jours: 7 },
        { nom: "Direction Technique",    role: "TECHNIQUE",  jours: 5 },
        { nom: "DMC",                    role: "DMC",        jours: 5 },
        { nom: "DAF",                    role: "DAF",        jours: 3 },
        { nom: "Direction Générale",     role: "DG",         jours: 2 },
      ],
    },
  ];

  // Recréer proprement (supprimer instances/actions avant)
  await prisma.workflowAction.deleteMany({});
  await prisma.workflowInstance.deleteMany({});
  await prisma.workflowEtape.deleteMany({});
  await prisma.workflowDefinition.deleteMany({});

  for (const circuit of circuits) {
    const def = await prisma.workflowDefinition.create({
      data: { nom: circuit.nom, financement: circuit.financement as never, actif: true },
    });
    for (let i = 0; i < circuit.etapes.length; i++) {
      const e = circuit.etapes[i];
      await prisma.workflowEtape.create({
        data: { definitionId: def.id, ordre: i + 1, nom: e.nom, roleRequis: e.role as never, slaDays: e.jours },
      });
    }
    console.log(`✓ Workflow "${circuit.nom}" (${circuit.etapes.length} étapes)`);
  }

  // ─── §6 Projet exemple ────────────────────────────────────────────────────
  await prisma.projet.upsert({
    where: { code: "PROJ-001" },
    update: {},
    create: { code:"PROJ-001", nom:"Réhabilitation RN1 Conakry-Coyah", bailleur:"Banque Mondiale", statut:"EN_COURS", budgetGnf:BigInt("50000000000") },
  });
  console.log("✓ Projet exemple créé");

  // ─── §22 Paramétrage métier initial ──────────────────────────────────────
  const params = [
    { cle:"SLA_MISSION",      valeur:"7",   type:"NUMBER", categorie:"SLA",    libelle:"SLA Mission de contrôle (jours)" },
    { cle:"SLA_TECHNIQUE",    valeur:"5",   type:"NUMBER", categorie:"SLA",    libelle:"SLA Direction Technique (jours)" },
    { cle:"SLA_DMC",          valeur:"5",   type:"NUMBER", categorie:"SLA",    libelle:"SLA DMC (jours)" },
    { cle:"SLA_DAF",          valeur:"3",   type:"NUMBER", categorie:"SLA",    libelle:"SLA DAF (jours)" },
    { cle:"SLA_DG",           valeur:"2",   type:"NUMBER", categorie:"SLA",    libelle:"SLA DG (jours)" },
    { cle:"SLA_BAILLEUR",     valeur:"10",  type:"NUMBER", categorie:"SLA",    libelle:"SLA Bailleur (jours)" },
    { cle:"SEUIL_ALERTE_CONSOMMATION", valeur:"95", type:"NUMBER", categorie:"CALCUL", libelle:"Seuil alerte consommation (%)" },
    { cle:"TAUX_TVA_DEFAUT",  valeur:"18",  type:"NUMBER", categorie:"CALCUL", libelle:"Taux TVA par défaut (%)" },
    { cle:"TAUX_RG_DEFAUT",   valeur:"5",   type:"NUMBER", categorie:"CALCUL", libelle:"Taux retenue de garantie (%)" },
    { cle:"TAUX_AVANCE_DEFAUT",valeur:"20", type:"NUMBER", categorie:"CALCUL", libelle:"Taux avance de démarrage (%)" },
    { cle:"ALERTE_EMAIL_ACTIF",valeur:"true",type:"BOOLEAN",categorie:"ALERTES",libelle:"Activer les alertes email" },
    { cle:"ALERTE_RETARD_JOURS",valeur:"3", type:"NUMBER", categorie:"ALERTES",libelle:"Délai avant alerte retard (jours)" },
    { cle:"ALERTE_EXPIRATION_GARANTIE_JOURS",valeur:"30",type:"NUMBER",categorie:"ALERTES",libelle:"Préavis expiration garantie (jours)" },
  ];
  for (const p of params) {
    await prisma.parametreMetier.upsert({ where:{cle:p.cle}, update:{valeur:p.valeur}, create:p });
  }
  console.log(`✓ ${params.length} paramètres métier`);

  console.log("\nSeed terminé ✓");
}

main().catch(console.error).finally(() => prisma.$disconnect());
