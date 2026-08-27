/**
 * Moteur de règles de gestion paramétrables (A1-A10).
 * PLAN-DEV-PARAMETRAGE-A1-A10.md §1.2 — Lot L0.1.
 *
 * PRINCIPE : les valeurs par défaut ci-dessous reproduisent EXACTEMENT le
 * comportement historique du code (constants de decomptes.service). Tant que
 * la table regle_gestion est vide ou non validée, rien ne change. Les
 * arbitrages DAF deviennent des lignes VALIDE dans cette table.
 *
 * Résolution : MARCHE > TYPE_MARCHE > BAILLEUR > GLOBAL ; à portée égale, la
 * date d'effet la plus récente (≤ date de référence) puis la version la plus
 * haute l'emportent. Seules les règles VALIDE à date sont prises en compte.
 */
import { prisma } from "./prisma";

// ─── Registre des clés et de leurs valeurs par défaut ──────────────────────
// Historiquement, ces défauts reproduisaient EXACTEMENT le comportement du
// code d'origine. Deux arbitrages DAF les font désormais évoluer en tant que
// décisions officielles (chaque date ci-dessous fait foi) ; un réglage
// explicite dans regle_gestion peut toujours sursurcharger.
export const REGLES_DEFAUT = {
  // A1 — Assiette et taux de la retenue de garantie
  // Validé DAF le 26/08/2026 : la retenue se calcule sur le TTC (TVA et ARMP
  // incluses), conformément à la pratique actuelle.
  RG_ASSIETTE_RETENUE_GARANTIE: "TTC",
  // A2 — Formule du précompte TVA
  // Validé DAF le 26/08/2026 : précompte = TTC × 9/118 (= 9 % du HT).
  RG_FORMULE_PRECOMPTE_TVA: "PRORATA_9_118",
  RG_TAUX_PRECOMPTE_HT: "9",
  // A3 — Redevance ARMP
  RG_TAUX_ARMP: "0.6",
  RG_ARMP_ASSIETTE: "HT",
  RG_ARMP_INCLUSE_TTC: "true", // ajoutée au TTC puis déduite du net
  // A4 — Bornage du net à payer
  // Décision DAF du 26/08/2026 : le net à payer est BORNÉ À ZÉRO — des
  // pénalités supérieures au montant ne produisent plus de net négatif.
  RG_NET_PLANCHER_ZERO: "true",
  // Décision DAF du 26/08/2026 : l'excédent de pénalités est REPORTÉ sur le
  // décompte suivant du même marché (borné au montant des pénalités saisies ;
  // consommé au calcul du décompte suivant).
  RG_REPORT_PENALITES: "true",
  // A5 — Pénalités de retard
  RG_PENALITE_MODE: "SAISIE", // actuel : montant saisi par ligne, pas de formule
  RG_PENALITE_ASSIETTE: "HT", // assiette du calcul au mode FORMULE (HT ou TTC)
  RG_PENALITE_TAUX_JOURNALIER: "3000", // 1/3000e par jour (usuel, inactif en mode SAISIE)
  RG_PENALITE_PLAFOND_PCT: "100", // 100 = illimité (= comportement actuel)
  // F-GO1 — 2FA obligatoire pour les rôles listés (défaut : DAF et DG, les
  // signataires financiers). Le premier login d'un rôle concerné sans 2FA
  // actif est dirigé vers l'enrôlement ; il ne peut RIEN faire d'autre.
  RG_2FA_ROLES: "DAF,DG",
  // A6b — Plafond d'avenants (F-MA2, Code des marchés usuel : 25 % cumulé —
  // à confirmer DMP). 100 = illimité. Une dérogation motivée reste possible
  // et tracée ; le contrôle est BLOQUANT par défaut.
  RG_PLAFOND_AVENANTS_PCT: "25",
  // A6 — Avances
  RG_AVANCE_MODE: "UNIQUE",
  RG_TAUX_AVANCE: "20",
  RG_TAUX_AVANCE_DEMARRAGE: "", // vide = inactif (mode DEMARRAGE_APPRO seulement)
  RG_TAUX_AVANCE_APPROVISIONNEMENT: "",
  // A7 — Arithmétique et arrondi
  RG_ARRONDI_MODE: "FRANC_PROCHE",
  // A8 — Séparation ordonnateur / comptable (consommé au lot L2.1)
  WF_ROLES_LIQUIDATION: "ADMIN,DG,DAF,DMC,UGP,MISSION,TECHNIQUE,ENTREPRISE",
  WF_ROLES_ORDONNANCEMENT: "ADMIN,DAF",
  // A8 — décision du 23/08/2026 : la DAF ORDONNANCE, la BCRG CONFIRME le
  // virement. La matrice portait « ADMIN,DAF » alors que la route de
  // confirmation exige BCRG : l'intersection était ADMIN seul, et la
  // séparation ordonnateur/comptable restait théorique. Le compte BCRG est un
  // compte de fonction (« Directeur Général BCRG »), par décision explicite.
  WF_ROLES_PAIEMENT: "ADMIN,BCRG",
  WF_SEPARATION_ORD_COMPTABLE: "false",
  // RG9 — séparation des tâches : une personne n'engage qu'une étape du circuit.
  // Active par défaut. Elle était présente dans le code sous forme d'un bloc
  // vide commenté « RG9 temporairement désactivé » : la même personne pouvait
  // soumettre ET valider. Désactivable par paramétrage, mais ce doit être une
  // décision explicite et tracée.
  WF_SEPARATION_TACHES: "true",
  // Délégation d'intérim — bornes de l'acte (revue du 27/08/2026).
  // La création n'imposait AUCUNE limite : une « délégation temporaire » pouvait
  // courir jusqu'en 2099, être antidatée pour couvrir des actes déjà posés, et
  // désigner n'importe quel compte — y compris une entreprise attributaire, qui
  // aurait alors porté le rôle DAF ou DG dans le workflow.
  WF_DELEGATION_DUREE_MAX_JOURS: "90",
  // Rôles dont le pouvoir ne se délègue PAS dans cet ERP : l'administrateur
  // technique (l'hériter serait une élévation de privilèges — porteeRoles le
  // filtrait déjà en aval, la délégation était donc un leurre), l'entreprise
  // attributaire, et les organismes tiers du circuit financier, dont l'intérim
  // se règle chez eux et non dans l'outil de l'Agence.
  WF_DELEGATION_ROLES_NON_DELEGABLES: "ADMIN,ENTREPRISE,BAILLEUR,BUDGET,TRESOR,FER_AGT,BCRG",
  // A9 — Libellés d'états officiels (consommé au lot L2.2)
  ETQ_MAPPINGS: "{}",
  // A10 — Conformité entreprise (consommé au lot L3.1)
  CF_CRITERES: "{}",
  CF_SCORE_PONDERATIONS: '{"NIF":15,"TVA":15,"FISC":20,"SOC":15,"DOCS":20,"CAUTION":15}',
  CF_SEUIL_CONFORME: "70",
  CF_SEUIL_REGULARISER: "40",
  CF_CURE_JOURS: "0",
} as const;

export type CleRegles = keyof typeof REGLES_DEFAUT;
export type ReglesEffectives = Record<CleRegles, string>;

// ─── Types et résolution (fonctions PURES, testées) ───────────────────────────
export interface RegleRecord {
  cle: string;
  portee: string;
  porteeId: string;
  valeur: string;
  dateEffet: Date;
  version: number;
  statut: string;
}

export interface ContexteRegles {
  dateRef?: Date;
  bailleur?: string;
  typeMarche?: string;
  marcheId?: string;
}

const SPECIFICITE: Record<string, number> = { MARCHE: 0, TYPE_MARCHE: 1, BAILLEUR: 2, GLOBAL: 3 };

/**
 * Statuts actifs acceptés par le moteur — pendant la transition du cycle
 * de vie L0.2, "VALIDE" (ancien) et "APPROUVEE"/"GELEE" (nouveau) sont
 * TOUS actifs. Sans cela, après la migration qui bascule VALIDE→APPROUVEE,
 * le moteur ne trouverait plus aucune règle et ignorerait silencieusement
 * tous les arbitrages DAF.
 */
const STATUTS_ACTIFS = new Set(["VALIDE", "APPROUVEE", "GELEE"]);

/**
 * Résout les valeurs effectives : défauts surchargés par les règles actives
 * (VALIDE ou APPROUVEE/GELEE selon le cycle de vie) applicables au contexte,
 * de la portée la plus spécifique à la plus générale.
 * Pure — aucune base de données ni horloge implicite (dateRef par défaut
 * fournie par l'appelant).
 */
export function resoudreRegles(records: RegleRecord[], ctx: ContexteRegles = {}, dateRef: Date = new Date()): ReglesEffectives {
  const resultat: Record<string, string> = { ...REGLES_DEFAUT };

  const candidates: RegleRecord[] = records.filter((r) => {
    if (!STATUTS_ACTIFS.has(r.statut)) return false;
    if (!(r.cle in REGLES_DEFAUT)) return false; // clé inconnue : ignorée
    if (r.dateEffet.getTime() > dateRef.getTime()) return false; // pas encore en vigueur
    if (r.portee === "GLOBAL") return true;
    if (r.portee === "BAILLEUR") return ctx.bailleur !== undefined && r.porteeId === ctx.bailleur;
    if (r.portee === "TYPE_MARCHE") return ctx.typeMarche !== undefined && r.porteeId === ctx.typeMarche;
    if (r.portee === "MARCHE") return ctx.marcheId !== undefined && r.porteeId === ctx.marcheId;
    return false; // portée inconnue : ignorée
  });

  const parCle = new Map<string, RegleRecord[]>();
  for (const r of candidates) {
    const liste = parCle.get(r.cle) ?? [];
    liste.push(r);
    parCle.set(r.cle, liste);
  }

  for (const [cle, liste] of parCle) {
    liste.sort((a, b) =>
      (SPECIFICITE[a.portee] ?? 99) - (SPECIFICITE[b.portee] ?? 99) ||
      b.dateEffet.getTime() - a.dateEffet.getTime() ||
      b.version - a.version
    );
    resultat[cle] = liste[0].valeur;
  }

  return resultat as ReglesEffectives;
}

// ─── Accès typé sûr (repli sur le défaut si valeur illisible) ─────────────────
export function nombreRegles(regles: ReglesEffectives, cle: CleRegles): number {
  const v = Number(regles[cle]);
  return Number.isFinite(v) ? v : Number(REGLES_DEFAUT[cle]);
}

export function booleenRegles(regles: ReglesEffectives, cle: CleRegles): boolean {
  return regles[cle] === "true";
}

// ─── Chargement avec cache (60 s, invalidé à l'écriture par L0.2) ─────────────
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { expire: number; valeur: ReglesEffectives }>();

function cleCache(ctx: ContexteRegles): string {
  const dateRef = ctx.dateRef ?? new Date();
  return JSON.stringify({
    b: ctx.bailleur ?? null,
    t: ctx.typeMarche ?? null,
    m: ctx.marcheId ?? null,
    d: Math.floor(dateRef.getTime() / CACHE_TTL_MS),
  });
}

/** Règles effectives pour un contexte donné (défauts + surcharges actives). */
export async function chargerRegles(ctx: ContexteRegles = {}): Promise<ReglesEffectives> {
  const k = cleCache(ctx);
  const entree = cache.get(k);
  if (entree && entree.expire > Date.now()) return entree.valeur;

  const dateRef = ctx.dateRef ?? new Date();
  const rows = await prisma.regleGestion.findMany({
    where: { statut: { in: [...STATUTS_ACTIFS] }, dateEffet: { lte: dateRef } },
    select: { cle: true, portee: true, porteeId: true, valeur: true, dateEffet: true, version: true, statut: true },
  });
  const valeur = resoudreRegles(rows, ctx, dateRef);
  cache.set(k, { expire: Date.now() + CACHE_TTL_MS, valeur });
  return valeur;
}

/** À appeler après toute écriture sur regle_gestion (lot L0.2). */
export function invaliderCacheRegles(): void {
  cache.clear();
}
