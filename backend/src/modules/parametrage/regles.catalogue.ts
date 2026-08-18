/**
 * Lot L0.2 — Catalogue des règles de gestion et validation des demandes.
 *
 * L0.1 (lib/regles.ts) définit les CLÉS et leurs VALEURS par défaut. Il manquait
 * la description de ce qu'est une valeur acceptable : c'est l'objet de ce
 * fichier. Tout est PURE (aucune base, aucune horloge implicite) afin que la
 * matrice de validation soit couverte par des tests — même parti pris que
 * decomptes.calc.ts et uploads.security.ts.
 */
import { REGLES_DEFAUT, type CleRegles } from "../../lib/regles";

export const ROLES_VALIDES = [
  "ADMIN", "DG", "DAF", "DMC", "UGP", "MISSION", "TECHNIQUE",
  "ENTREPRISE", "AUDITEUR", "BAILLEUR", "BUDGET", "TRESOR", "FER_AGT", "BCRG",
] as const;

export const PORTEES_VALIDES = ["GLOBAL", "BAILLEUR", "TYPE_MARCHE", "MARCHE"] as const;

export type TypeRegle = "ENUM" | "NUMBER" | "BOOLEAN" | "MULTI" | "JSON";

export interface MetaRegle {
  categorie: "FINANCE" | "WORKFLOW" | "ETATS" | "CONFORMITE";
  libelle: string;
  type: TypeRegle;
  /** ENUM : valeurs admises. NUMBER : bornes. MULTI : vocabulaire autorisé. */
  options?: { choix?: readonly string[]; min?: number; max?: number; valeurs?: readonly string[] };
}

/** Une entrée par clé de REGLES_DEFAUT — l'exhaustivité est vérifiée par test. */
export const METADONNEES: Record<CleRegles, MetaRegle> = {
  // A1 — Retenue de garantie
  RG_ASSIETTE_RETENUE_GARANTIE: { categorie: "FINANCE", libelle: "Assiette de la retenue de garantie", type: "ENUM", options: { choix: ["HT", "TTC"] } },
  // A2 — Précompte TVA
  RG_FORMULE_PRECOMPTE_TVA: { categorie: "FINANCE", libelle: "Formule du précompte TVA", type: "ENUM", options: { choix: ["PRORATA_9_118", "TAUX_HT", "AUCUN"] } },
  RG_TAUX_PRECOMPTE_HT: { categorie: "FINANCE", libelle: "Taux du précompte sur HT (%)", type: "NUMBER", options: { min: 0, max: 100 } },
  // A3 — ARMP
  RG_TAUX_ARMP: { categorie: "FINANCE", libelle: "Taux de la redevance ARMP (%)", type: "NUMBER", options: { min: 0, max: 100 } },
  RG_ARMP_ASSIETTE: { categorie: "FINANCE", libelle: "Assiette de la redevance ARMP", type: "ENUM", options: { choix: ["HT", "TTC"] } },
  RG_ARMP_INCLUSE_TTC: { categorie: "FINANCE", libelle: "ARMP incluse dans le TTC puis déduite du net", type: "BOOLEAN" },
  // A4 — Bornage du net
  RG_NET_PLANCHER_ZERO: { categorie: "FINANCE", libelle: "Plancher du net à payer à zéro", type: "BOOLEAN" },
  RG_REPORT_PENALITES: { categorie: "FINANCE", libelle: "Report du reliquat de pénalités sur le décompte suivant", type: "BOOLEAN" },
  // A5 — Pénalités
  RG_PENALITE_MODE: { categorie: "FINANCE", libelle: "Mode de calcul des pénalités de retard", type: "ENUM", options: { choix: ["SAISIE", "FORMULE"] } },
  RG_PENALITE_ASSIETTE: { categorie: "FINANCE", libelle: "Assiette des pénalités (mode FORMULE)", type: "ENUM", options: { choix: ["HT", "TTC"] } },
  RG_PENALITE_TAUX_JOURNALIER: { categorie: "FINANCE", libelle: "Diviseur du taux journalier (ex. 3000 = 1/3000e)", type: "NUMBER", options: { min: 1, max: 1_000_000 } },
  RG_PENALITE_PLAFOND_PCT: { categorie: "FINANCE", libelle: "Plafond des pénalités (% du marché)", type: "NUMBER", options: { min: 0, max: 100 } },
  // A6 — Avances
  RG_AVANCE_MODE: { categorie: "FINANCE", libelle: "Mode de gestion des avances", type: "ENUM", options: { choix: ["UNIQUE", "DEMARRAGE_APPRO"] } },
  RG_TAUX_AVANCE: { categorie: "FINANCE", libelle: "Taux de l'avance (%)", type: "NUMBER", options: { min: 0, max: 100 } },
  RG_TAUX_AVANCE_DEMARRAGE: { categorie: "FINANCE", libelle: "Taux de l'avance de démarrage (%) — vide si inactif", type: "NUMBER", options: { min: 0, max: 100 } },
  RG_TAUX_AVANCE_APPROVISIONNEMENT: { categorie: "FINANCE", libelle: "Taux de l'avance d'approvisionnement (%) — vide si inactif", type: "NUMBER", options: { min: 0, max: 100 } },
  // A7 — Arrondi
  RG_ARRONDI_MODE: { categorie: "FINANCE", libelle: "Règle d'arrondi monétaire", type: "ENUM", options: { choix: ["FRANC_PROCHE", "FRANC_INFERIEUR", "FRANC_SUPERIEUR"] } },
  // A8 — Séparation ordonnateur / comptable
  WF_ROLES_LIQUIDATION: { categorie: "WORKFLOW", libelle: "Rôles habilités à la liquidation", type: "MULTI", options: { valeurs: ROLES_VALIDES } },
  WF_ROLES_ORDONNANCEMENT: { categorie: "WORKFLOW", libelle: "Rôles habilités à l'ordonnancement", type: "MULTI", options: { valeurs: ROLES_VALIDES } },
  WF_ROLES_PAIEMENT: { categorie: "WORKFLOW", libelle: "Rôles habilités au paiement", type: "MULTI", options: { valeurs: ROLES_VALIDES } },
  WF_SEPARATION_ORD_COMPTABLE: { categorie: "WORKFLOW", libelle: "Interdire qu'un même agent ordonnance et paie", type: "BOOLEAN" },
  // A9 — Libellés d'états
  ETQ_MAPPINGS: { categorie: "ETATS", libelle: "Correspondance des libellés d'états officiels", type: "JSON" },
  // A10 — Conformité
  CF_CRITERES: { categorie: "CONFORMITE", libelle: "Critères de conformité entreprise", type: "JSON" },
  CF_SCORE_PONDERATIONS: { categorie: "CONFORMITE", libelle: "Pondérations du score de conformité", type: "JSON" },
  CF_SEUIL_CONFORME: { categorie: "CONFORMITE", libelle: "Score minimal pour être conforme", type: "NUMBER", options: { min: 0, max: 100 } },
  CF_SEUIL_REGULARISER: { categorie: "CONFORMITE", libelle: "Score minimal pour « à régulariser »", type: "NUMBER", options: { min: 0, max: 100 } },
  CF_CURE_JOURS: { categorie: "CONFORMITE", libelle: "Délai de régularisation accordé (jours)", type: "NUMBER", options: { min: 0, max: 3650 } },
};

export function estCleConnue(cle: string): cle is CleRegles {
  return Object.prototype.hasOwnProperty.call(REGLES_DEFAUT, cle);
}

/**
 * Domaines d'étiquettes admis (A9 — lot L2.2). Un domaine inconnu serait
 * silencieusement ignoré par l'affichage : autant le refuser à la saisie.
 */
export const DOMAINES_ETIQUETTES = ["DECOMPTE", "MARCHE", "ENTREPRISE", "TYPE_DECOMPTE", "FINANCEMENT", "ATTACHEMENT"] as const;

/**
 * Forme attendue : { DOMAINE: { CODE_TECHNIQUE: "Libellé officiel" } }.
 * Renvoie null si conforme, sinon le motif de rejet.
 */
export function validerEtiquettes(valeur: unknown): string | null {
  if (valeur === null || typeof valeur !== "object" || Array.isArray(valeur)) {
    return "Les étiquettes doivent être un objet { DOMAINE: { CODE: \"libellé\" } }";
  }
  for (const [domaine, codes] of Object.entries(valeur as Record<string, unknown>)) {
    if (!DOMAINES_ETIQUETTES.includes(domaine as (typeof DOMAINES_ETIQUETTES)[number])) {
      return `Domaine d'étiquette inconnu : ${domaine} (admis : ${DOMAINES_ETIQUETTES.join(", ")})`;
    }
    if (codes === null || typeof codes !== "object" || Array.isArray(codes)) {
      return `Le domaine ${domaine} doit contenir un objet { CODE: "libellé" }`;
    }
    for (const [code, libelle] of Object.entries(codes as Record<string, unknown>)) {
      if (typeof libelle !== "string" || libelle.trim() === "") {
        return `Libellé vide ou non textuel pour ${domaine}.${code}`;
      }
    }
  }
  return null;
}

/** Valide une valeur au regard du type et des options de la clé. */
export function validerValeur(cle: CleRegles, valeur: string): string | null {
  const meta = METADONNEES[cle];
  const brut = String(valeur ?? "").trim();

  // Une valeur vide n'est admise que si le défaut l'est aussi (interrupteurs
  // « inactif » comme les taux d'avance optionnels).
  if (brut === "") {
    return REGLES_DEFAUT[cle] === "" ? null : "La valeur ne peut pas être vide";
  }

  switch (meta.type) {
    case "ENUM": {
      const choix = meta.options?.choix ?? [];
      return choix.includes(brut) ? null : `Valeur hors des choix admis : ${choix.join(", ")}`;
    }
    case "BOOLEAN":
      return brut === "true" || brut === "false" ? null : "La valeur doit être « true » ou « false »";
    case "NUMBER": {
      const n = Number(brut);
      if (!Number.isFinite(n)) return "La valeur doit être un nombre";
      const { min, max } = meta.options ?? {};
      if (min !== undefined && n < min) return `La valeur doit être supérieure ou égale à ${min}`;
      if (max !== undefined && n > max) return `La valeur doit être inférieure ou égale à ${max}`;
      return null;
    }
    case "MULTI": {
      const admis = meta.options?.valeurs ?? [];
      const items = brut.split(",").map((s) => s.trim()).filter(Boolean);
      if (items.length === 0) return "La liste ne peut pas être vide";
      const inconnus = items.filter((i) => !admis.includes(i));
      return inconnus.length === 0 ? null : `Valeurs inconnues : ${inconnus.join(", ")}`;
    }
    case "JSON": {
      let parse: unknown;
      try {
        parse = JSON.parse(brut);
      } catch {
        return "La valeur doit être un JSON valide";
      }
      // A9 — la forme d'ETQ_MAPPINGS est contrainte : un mauvais JSON ici
      // afficherait des libellés vides ou « [object Object] » dans toute
      // l'application, sans erreur visible côté serveur.
      if (cle === "ETQ_MAPPINGS") return validerEtiquettes(parse);
      return null;
    }
  }
}

export interface DemandeRegle {
  cle?: unknown;
  valeur?: unknown;
  portee?: unknown;
  porteeId?: unknown;
  dateEffet?: unknown;
  motif?: unknown;
}

export const MOTIF_LONGUEUR_MIN = 10;

/**
 * Contrôle complet d'une demande de règle. Renvoie la liste des motifs de
 * rejet (vide = demande recevable). `aujourdHui` est injecté pour que le test
 * ne dépende pas de l'horloge.
 */
export function validerDemande(demande: DemandeRegle, aujourdHui: Date): string[] {
  const erreurs: string[] = [];

  const cle = String(demande.cle ?? "");
  if (!estCleConnue(cle)) {
    erreurs.push(`Clé de règle inconnue : ${cle || "(absente)"}`);
  }

  const motif = String(demande.motif ?? "").trim();
  if (motif.length < MOTIF_LONGUEUR_MIN) {
    erreurs.push(`Le motif est obligatoire et doit contenir au moins ${MOTIF_LONGUEUR_MIN} caractères`);
  }

  const portee = String(demande.portee ?? "GLOBAL");
  if (!PORTEES_VALIDES.includes(portee as (typeof PORTEES_VALIDES)[number])) {
    erreurs.push(`Portée inconnue : ${portee}`);
  } else if (portee !== "GLOBAL" && String(demande.porteeId ?? "").trim() === "") {
    erreurs.push("Une portée autre que GLOBAL exige un identifiant de portée");
  }

  if (demande.dateEffet !== undefined && demande.dateEffet !== null && String(demande.dateEffet) !== "") {
    const d = new Date(String(demande.dateEffet));
    if (Number.isNaN(d.getTime())) {
      erreurs.push("Date d'effet illisible");
    } else {
      // Comparaison au jour : une date d'effet aujourd'hui est acceptée.
      const jourDemande = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      const jourRef = Date.UTC(aujourdHui.getUTCFullYear(), aujourdHui.getUTCMonth(), aujourdHui.getUTCDate());
      if (jourDemande < jourRef) erreurs.push("La date d'effet ne peut pas être dans le passé");
    }
  }

  if (estCleConnue(cle)) {
    const messageValeur = validerValeur(cle, String(demande.valeur ?? ""));
    if (messageValeur) erreurs.push(messageValeur);
  }

  return erreurs;
}

/**
 * Quatre yeux : qui peut valider une règle saisie par quelqu'un d'autre ?
 * Un DAF valide (contrôle métier). Un ADMIN valide aussi, mais jamais sa
 * propre saisie — sinon le principe est vide de sens.
 */
export function peutValiderRegle(role: string, userId: string, saisiPar: string | null): { ok: boolean; motif?: string } {
  if (saisiPar && saisiPar === userId) {
    return { ok: false, motif: "Quatre yeux : la règle doit être validée par une autre personne que celle qui l'a saisie" };
  }
  if (role === "DAF" || role === "ADMIN") return { ok: true };
  return { ok: false, motif: "Seuls les rôles DAF ou ADMIN peuvent valider une règle de gestion" };
}
