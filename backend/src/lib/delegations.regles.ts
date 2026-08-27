/**
 * Bornes de l'acte de délégation d'intérim — revue du 27/08/2026.
 *
 * CONSTAT : la création d'une délégation ne vérifiait que trois choses — le
 * suppléant différent du titulaire, l'auteur (titulaire ou ADMIN), et la date
 * de fin postérieure au début. Tout le reste était libre :
 *
 *  - aucune durée maximale : une « délégation temporaire » pouvait courir
 *    jusqu'en 2099 ;
 *  - aucune borne sur la date de début : on pouvait ANTIDATER l'acte pour
 *    couvrir après coup des validations déjà posées ;
 *  - aucun contrôle sur le suppléant : un DAF pouvait déléguer son pouvoir de
 *    visa à un compte ENTREPRISE — l'attributaire du marché aurait alors porté
 *    le rôle DAF dans le workflow — ou à un compte désactivé ;
 *  - aucun contrôle sur le rôle délégué : déléguer ADMIN était accepté, alors
 *    que `porteeRoles()` le filtre en aval : l'acte était un leurre ;
 *  - aucun contrôle de cumul : le même titulaire pouvait avoir plusieurs
 *    suppléants simultanés, et A pouvait déléguer à B pendant que B déléguait
 *    à A — deux personnes portant chacune le rôle de l'autre ;
 *  - motif facultatif, sur un acte qui transfère un pouvoir de validation.
 *
 * Ce que la délégation ne met PAS en cause : RG9 (séparation des tâches)
 * raisonne sur l'IDENTITÉ de l'intervenant, pas sur son rôle. Un suppléant
 * portant deux rôles ne peut donc pas valider deux étapes du même dossier.
 *
 * Fonctions PURES : aucune dépendance à Prisma, tout est passé en paramètre.
 */
import type { ReglesEffectives } from "./regles";

export interface CompteDelegation {
  id: string;
  role: string;
  actif: boolean;
}

/** Une délégation déjà en base, réduite à ce qui sert au contrôle de cumul. */
export interface DelegationExistante {
  id: string;
  titulaireId: string;
  suppleantId: string;
  dateDebut: Date;
  dateFin: Date;
  actif: boolean;
}

export interface DemandeDelegation {
  titulaire: CompteDelegation;
  suppleant: CompteDelegation;
  dateDebut: Date;
  dateFin: Date;
  motif?: string | null;
  /** Délégations actives touchant l'un ou l'autre des deux comptes. */
  existantes: DelegationExistante[];
  regles: ReglesEffectives;
  /** Référence temporelle — injectée pour que la fonction reste pure. */
  maintenant: Date;
}

export interface Verdict {
  autorise: boolean;
  /** Code stable, pour les tests et les messages d'interface. */
  code?: string;
  motif?: string;
}

const MOTIF_MIN = 10;
const JOUR_MS = 24 * 60 * 60 * 1000;

export function rolesNonDelegables(regles: ReglesEffectives): string[] {
  return (regles.WF_DELEGATION_ROLES_NON_DELEGABLES ?? "")
    .split(",").map((r) => r.trim()).filter(Boolean);
}

export function dureeMaxJours(regles: ReglesEffectives): number {
  const n = Number.parseInt(regles.WF_DELEGATION_DUREE_MAX_JOURS ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 90;
}

/** Deux périodes se chevauchent-elles ? (bornes incluses) */
export function periodesSeChevauchent(
  a: { dateDebut: Date; dateFin: Date },
  b: { dateDebut: Date; dateFin: Date },
): boolean {
  return a.dateDebut <= b.dateFin && b.dateDebut <= a.dateFin;
}

/** Début de journée — les dates d'effet se comparent au jour, pas à l'heure. */
function jour(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * La délégation proposée fermerait-elle une boucle ?
 *
 * A délègue à B, B délègue à C, C délègue à A : chacun fait suivre à l'autre un
 * pouvoir que plus personne ne détient à la source. La réciprocité directe
 * (A ⇄ B) n'en est que le cas le plus court — le graphe doit être parcouru.
 *
 * Parcours en profondeur depuis le suppléant proposé, sur les seules
 * délégations actives : si l'on retombe sur le titulaire, la chaîne se mord
 * la queue.
 */
export function fermeUneBoucle(
  existantes: DelegationExistante[],
  titulaireId: string,
  suppleantId: string,
): boolean {
  const parTitulaire = new Map<string, string[]>();
  for (const e of existantes) {
    if (!e.actif) continue;
    parTitulaire.set(e.titulaireId, [...(parTitulaire.get(e.titulaireId) ?? []), e.suppleantId]);
  }
  const visites = new Set<string>([suppleantId]);
  const pile = [suppleantId];
  while (pile.length > 0) {
    const courant = pile.pop()!;
    for (const suivant of parTitulaire.get(courant) ?? []) {
      if (suivant === titulaireId) return true;
      if (!visites.has(suivant)) { visites.add(suivant); pile.push(suivant); }
    }
  }
  return false;
}

export function verifierDelegation(d: DemandeDelegation): Verdict {
  const nonDelegables = rolesNonDelegables(d.regles);

  if (d.titulaire.id === d.suppleant.id) {
    return { autorise: false, code: "MEME_PERSONNE", motif: "Le suppléant doit être différent du titulaire" };
  }

  // ── Les deux comptes doivent être en état d'exercer ──
  if (!d.titulaire.actif) {
    return { autorise: false, code: "TITULAIRE_INACTIF",
      motif: "Le titulaire est désactivé : un compte sans droits ne peut pas en déléguer" };
  }
  if (!d.suppleant.actif) {
    return { autorise: false, code: "SUPPLEANT_INACTIF",
      motif: "Le suppléant est désactivé : il ne pourrait pas exercer l'intérim" };
  }

  // ── Rôle délégué ──
  // ADMIN est refusé ICI et non seulement filtré en aval : accepter l'acte pour
  // le neutraliser ensuite laissait croire à une délégation qui n'existait pas.
  if (nonDelegables.includes(d.titulaire.role)) {
    return { autorise: false, code: "ROLE_NON_DELEGABLE",
      motif: `Le rôle ${d.titulaire.role} ne se délègue pas dans cet ERP (règle WF_DELEGATION_ROLES_NON_DELEGABLES)` };
  }
  // Le suppléant, lui, est contrôlé sur son APPARTENANCE : un compte externe ne
  // porte aucun pouvoir de l'Agence, quel que soit le rôle qu'on lui prête.
  if (nonDelegables.includes(d.suppleant.role)) {
    return { autorise: false, code: "SUPPLEANT_INELIGIBLE",
      motif: `Un compte ${d.suppleant.role} ne peut pas recevoir de délégation : il exercerait un pouvoir de l'Agence sans en relever` };
  }

  // ── Période ──
  if (d.dateFin <= d.dateDebut) {
    return { autorise: false, code: "PERIODE_INVALIDE", motif: "La date de fin doit être postérieure au début" };
  }
  if (jour(d.dateDebut) < jour(d.maintenant)) {
    // Antidater légitimerait après coup des validations déjà posées.
    return { autorise: false, code: "ANTIDATEE",
      motif: "Une délégation ne peut pas prendre effet dans le passé : elle couvrirait des actes déjà posés" };
  }
  const max = dureeMaxJours(d.regles);
  const jours = Math.ceil((jour(d.dateFin) - jour(d.dateDebut)) / JOUR_MS);
  if (jours > max) {
    return { autorise: false, code: "DUREE_EXCESSIVE",
      motif: `Durée de ${jours} jours — le maximum est de ${max} jours (règle WF_DELEGATION_DUREE_MAX_JOURS). Une absence plus longue relève d'un changement d'affectation, pas d'un intérim` };
  }

  // ── Motif ──
  const motif = (d.motif ?? "").trim();
  if (motif.length < MOTIF_MIN) {
    return { autorise: false, code: "MOTIF_MANQUANT",
      motif: `Le motif est obligatoire (${MOTIF_MIN} caractères minimum) : une délégation de pouvoir se justifie` };
  }

  // ── Cumul ──
  const periode = { dateDebut: d.dateDebut, dateFin: d.dateFin };
  for (const e of d.existantes) {
    if (!e.actif || !periodesSeChevauchent(e, periode)) continue;
    if (e.titulaireId === d.titulaire.id) {
      return { autorise: false, code: "CHEVAUCHEMENT",
        motif: "Ce titulaire a déjà une délégation active sur cette période — deux suppléants porteraient le même pouvoir en même temps" };
    }
    if (e.titulaireId === d.suppleant.id && e.suppleantId === d.titulaire.id) {
      return { autorise: false, code: "RECIPROQUE",
        motif: "Une délégation en sens inverse est déjà active sur cette période : chacun porterait le rôle de l'autre" };
    }
  }

  // Boucle indirecte : A → B → C → A. La réciprocité ci-dessus n'en couvre que
  // le cas le plus court ; ici on parcourt tout le graphe des délégations
  // actives, y compris celles qui ne concernent ni le titulaire ni le suppléant.
  if (fermeUneBoucle(d.existantes, d.titulaire.id, d.suppleant.id)) {
    return { autorise: false, code: "CYCLE",
      motif: "Cette délégation fermerait une boucle : en remontant la chaîne des délégations actives, le titulaire est déjà suppléant en aval" };
  }

  return { autorise: true };
}
