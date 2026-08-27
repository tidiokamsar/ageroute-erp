/**
 * F12 — Définitions unifiées des étapes de circuit selon le financement.
 * Source UNIQUE pour le workflow interne ET le moteur BPMN : quel que soit
 * le canal de dépôt (interne ou portail entreprise), le circuit est le même.
 *
 * §7 CDC : MISSION → TECHNIQUE → (UGP si bailleur) → DMC → DAF → DG
 * §16 CDC : après DG, circuit financier selon le type de financement.
 */

export interface EtapeCircuit {
  ordre: number;
  nom: string;
  roleOuService: string;
  slaJours?: number;
}

/**
 * Étapes du circuit de VALIDATION, par type de financement.
 *
 * ⚠️ RÉFÉRENCE, PAS SOURCE D'EXÉCUTION. Le moteur lit les définitions en base
 * (workflow_definitions / workflow_etapes) ; cette fonction sert de modèle
 * documenté et de socle aux tests.
 *
 * Elle DIVERGEAIT de la production : elle s'arrêtait à la Direction Générale,
 * alors que les onze circuits réellement définis poursuivent au-delà — vers le
 * bailleur pour les financements extérieurs, vers le FER ou la Direction du
 * Budget puis le Trésor pour les circuits nationaux. Un test s'appuyant sur
 * elle pouvait donc passer au vert en décrivant un circuit qui n'existe pas.
 * Alignée le 27/08/2026 sur les définitions relevées en base.
 *
 * L'UGP n'intervient que sur les financements Banque Mondiale et Union
 * européenne, où le bailleur l'exige comme unité de gestion du projet.
 */
export function etapesWorkflow(financement: string): EtapeCircuit[] {
  const etapes: EtapeCircuit[] = [
    { ordre: 1, nom: "Mission de contrôle",    roleOuService: "MISSION",   slaJours: 7 },
    { ordre: 2, nom: "Direction Technique",    roleOuService: "TECHNIQUE", slaJours: 5 },
  ];
  if (["BANQUE_MONDIALE", "UE"].includes(financement)) {
    etapes.push({ ordre: 3, nom: "UGP",        roleOuService: "UGP",       slaJours: 3 });
  }
  const suite = (nom: string, role: string, sla: number) =>
    etapes.push({ ordre: etapes.length + 1, nom, roleOuService: role, slaJours: sla });

  suite("DMC", "DMC", 5);
  suite("DAF", "DAF", 3);
  suite("Direction Générale", "DG", 2);

  // Visa d'approbation du service payeur — l'ORDRE DE PAIEMENT, lui, est un
  // acte distinct qui relève du circuit financier (voir plus bas).
  if (financement === "FER") {
    suite("FER", "FER_AGT", 5);
    suite("Trésor Public", "TRESOR", 5);
  } else if (financement === "BUDGET_NATIONAL") {
    suite("Direction du Budget", "BUDGET", 5);
    suite("Trésor Public", "TRESOR", 5);
  } else if (financement !== "AUTRE") {
    // Bailleurs identifiés : non-objection avant décaissement.
    suite("Bailleur", "BAILLEUR", 10);
  }
  return etapes;
}

/**
 * Étapes du circuit FINANCIER, qui suit l'achèvement du circuit de validation.
 *
 * ⚠️ CE N'EST PAS UNE REDONDANCE — NE PAS « CORRIGER »
 * Trois audits successifs ont signalé comme un défaut le fait que le Trésor,
 * le Budget ou le FER apparaissent ICI alors qu'ils figurent DÉJÀ dans les
 * étapes du circuit de validation. Ce n'en est pas un : ce sont DEUX ACTES
 * DISTINCTS du même service, confirmé par l'AGEROUTE le 27/08/2026.
 *
 *   • Circuit de VALIDATION  → le service donne son VISA D'APPROBATION :
 *     il reconnaît la dette, il atteste que le décompte est régulier.
 *   • Circuit FINANCIER      → le même service émet l'ORDRE DE PAIEMENT :
 *     il engage le décaissement effectif des fonds.
 *
 * Un visa n'est pas un paiement. Les fusionner ferait payer un décompte du
 * seul fait qu'il a été jugé régulier — ce que la séparation de l'ordonnateur
 * et du comptable interdit précisément.
 *
 * Les libellés portent donc l'acte attendu, et non le seul nom du service :
 * sans cela l'agent voyait « Trésor Public » à deux endroits sans savoir
 * lequel appelait sa signature.
 */
export function etapesCircuitFinancier(financement: string): EtapeCircuit[] {
  if (financement === "FER") {
    return [
      { ordre: 1, nom: "FER — ordonnancement",        roleOuService: "FER_AGT" },
      { ordre: 2, nom: "Budget / MEF — engagement",   roleOuService: "BUDGET" },
      { ordre: 3, nom: "DNTCP — ordre de paiement",   roleOuService: "TRESOR" },
      { ordre: 4, nom: "BCRG — visa bancaire",        roleOuService: "BCRG" },
      { ordre: 5, nom: "BCRG — exécution du virement", roleOuService: "BCRG" },
    ];
  }
  if (financement === "BUDGET_NATIONAL") {
    return [
      { ordre: 1, nom: "Budget / MEF — engagement",   roleOuService: "BUDGET" },
      { ordre: 2, nom: "DNTCP — ordre de paiement",   roleOuService: "TRESOR" },
      { ordre: 3, nom: "BCRG — visa bancaire",        roleOuService: "BCRG" },
      { ordre: 4, nom: "BCRG — exécution du virement", roleOuService: "BCRG" },
    ];
  }
  // Bailleurs (BM, BAD, UE, BOAD, BID, BADEA, AFD, KFW, AUTRE)
  return [
    { ordre: 1, nom: "UGP — instruction",             roleOuService: "UGP" },
    { ordre: 2, nom: "Demande de décaissement",       roleOuService: "UGP" },
    { ordre: 3, nom: "Non-objection bailleur",        roleOuService: "BAILLEUR" },
    { ordre: 4, nom: "Décaissement",                  roleOuService: "BAILLEUR" },
    { ordre: 5, nom: "BCRG — exécution du virement",  roleOuService: "BCRG" },
  ];
}

export function typeCircuitPourFinancement(financement: string): "FER" | "BUDGET" | "BAILLEUR" {
  if (financement === "FER") return "FER";
  if (financement === "BUDGET_NATIONAL") return "BUDGET";
  return "BAILLEUR";
}
