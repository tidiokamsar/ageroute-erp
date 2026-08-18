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

export function etapesWorkflow(financement: string): EtapeCircuit[] {
  const base: EtapeCircuit[] = [
    { ordre: 1, nom: "Mission de contrôle",    roleOuService: "MISSION",   slaJours: 7 },
    { ordre: 2, nom: "Direction Technique",    roleOuService: "TECHNIQUE", slaJours: 5 },
  ];
  const estBailleur = !["FER", "BUDGET_NATIONAL"].includes(financement);
  if (estBailleur) {
    base.push({ ordre: 3, nom: "UGP",          roleOuService: "UGP",       slaJours: 3 });
  }
  base.push(
    { ordre: base.length + 1, nom: "DMC",       roleOuService: "DMC",       slaJours: 5 },
    { ordre: base.length + 2, nom: "DAF",       roleOuService: "DAF",       slaJours: 3 },
    { ordre: base.length + 3, nom: "DG",        roleOuService: "DG",        slaJours: 2 },
  );
  return base;
}

export function etapesCircuitFinancier(financement: string): EtapeCircuit[] {
  if (financement === "FER") {
    return [
      { ordre: 1, nom: "FER",              roleOuService: "FER_AGT" },
      { ordre: 2, nom: "Budget / MEF",     roleOuService: "BUDGET" },
      { ordre: 3, nom: "DNTCP",            roleOuService: "TRESOR" },
      { ordre: 4, nom: "BCRG",             roleOuService: "BCRG" },
      { ordre: 5, nom: "Paiement",         roleOuService: "BCRG" },
    ];
  }
  if (financement === "BUDGET_NATIONAL") {
    return [
      { ordre: 1, nom: "Budget / MEF",     roleOuService: "BUDGET" },
      { ordre: 2, nom: "DNTCP",            roleOuService: "TRESOR" },
      { ordre: 3, nom: "BCRG",             roleOuService: "BCRG" },
      { ordre: 4, nom: "Paiement",         roleOuService: "BCRG" },
    ];
  }
  // Bailleurs (BM, BAD, UE, BOAD, BID, BADEA, AFD, KFW, AUTRE)
  return [
    { ordre: 1, nom: "UGP",                      roleOuService: "UGP" },
    { ordre: 2, nom: "Demande de décaissement",  roleOuService: "UGP" },
    { ordre: 3, nom: "Non-objection bailleur",   roleOuService: "BAILLEUR" },
    { ordre: 4, nom: "Décaissement",             roleOuService: "BAILLEUR" },
    { ordre: 5, nom: "Paiement",                 roleOuService: "BCRG" },
  ];
}

export function typeCircuitPourFinancement(financement: string): "FER" | "BUDGET" | "BAILLEUR" {
  if (financement === "FER") return "FER";
  if (financement === "BUDGET_NATIONAL") return "BUDGET";
  return "BAILLEUR";
}
