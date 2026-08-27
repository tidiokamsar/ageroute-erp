/**
 * Plafond réglementaire des avenants — revue du 27/08/2026.
 *
 * CONSTAT : la règle `RG_PLAFOND_AVENANTS_PCT` existait (défaut 25 %), elle
 * était documentée comme « contrôle bloquant, dérogation tracée », et un test
 * la couvrait — mais ce test vérifiait la valeur de la règle et refaisait
 * l'arithmétique DANS LE TEST. Rien, dans `marchesService.addAvenant`, ne la
 * consultait : un avenant portant le marché à +30 %, +100 % ou davantage était
 * créé sans un mot. Le contrôle de recette prévu au runbook — « créer un
 * avenant qui dépasse 25 % → 400 Plafond dépassé » — renvoyait 201.
 *
 * Même famille de défaut que le test de garde des paiements (F3) : un test qui
 * réimplémente la règle passe au vert pendant que le code productif l'ignore.
 * Ici, la fonction est PURE et c'est ELLE que la route appelle.
 *
 * Dérogation : le modèle Avenant porte déjà `approbationArmpRef`, avec le
 * commentaire « obligatoire au-delà du seuil réglementaire ». Le dépassement
 * n'est donc pas ouvert par un simple drapeau technique, mais par la référence
 * de l'approbation de l'Autorité de Régulation — ce qui est la condition
 * réelle, et ce qui la rend opposable.
 */
import type { ReglesEffectives } from "./regles";

export interface DemandeAvenant {
  montantInitialGnf: bigint;
  /** Avenants déjà portés au marché — les annulés ne comptent pas. */
  avenantsExistants: Array<{ montantSupplementaireGnf: bigint; statut: string }>;
  montantSupplementaireGnf: bigint;
  /** Référence de l'approbation ARMP, seule voie de dépassement. */
  approbationArmpRef?: string | null;
  regles: ReglesEffectives;
}

export interface VerdictAvenant {
  autorise: boolean;
  code?: string;
  motif?: string;
  /** Cumul des avenants après celui-ci — utile au message et aux écrans. */
  cumulApresGnf: bigint;
  plafondGnf: bigint;
}

/** Statuts qui ne pèsent plus sur le marché. */
const STATUTS_SANS_EFFET = ["ANNULE"];

export function pourcentagePlafond(regles: ReglesEffectives): number {
  const n = Number.parseFloat(regles.RG_PLAFOND_AVENANTS_PCT ?? "");
  return Number.isFinite(n) && n >= 0 ? n : 25;
}

/**
 * Plafond en GNF, calculé en arithmétique ENTIÈRE : les montants du marché
 * dépassent le domaine exact des flottants, et un plafond arrondi par excès
 * laisserait passer le franc de trop.
 */
export function plafondGnf(montantInitialGnf: bigint, pct: number): bigint {
  return (montantInitialGnf * BigInt(Math.round(pct * 100))) / 10_000n;
}

export function verifierPlafondAvenant(d: DemandeAvenant): VerdictAvenant {
  const pct = pourcentagePlafond(d.regles);
  const plafond = plafondGnf(d.montantInitialGnf, pct);
  const cumulExistant = d.avenantsExistants
    .filter((a) => !STATUTS_SANS_EFFET.includes(a.statut))
    .reduce((s, a) => s + a.montantSupplementaireGnf, 0n);
  const cumulApres = cumulExistant + d.montantSupplementaireGnf;

  const base = { cumulApresGnf: cumulApres, plafondGnf: plafond };

  if (d.montantSupplementaireGnf < 0n) {
    return { ...base, autorise: false, code: "MONTANT_NEGATIF",
      motif: "Le montant d'un avenant ne peut pas être négatif" };
  }
  if (cumulApres <= plafond) return { ...base, autorise: true };

  const ref = (d.approbationArmpRef ?? "").trim();
  if (ref.length === 0) {
    return { ...base, autorise: false, code: "PLAFOND_DEPASSE",
      motif: `Plafond d'avenants dépassé : le cumul atteindrait ${cumulApres} GNF pour un plafond de ${plafond} GNF `
        + `(${pct} % de ${d.montantInitialGnf} GNF, règle RG_PLAFOND_AVENANTS_PCT). `
        + "Au-delà du seuil réglementaire, la référence d'approbation ARMP est obligatoire." };
  }
  // Dépassement couvert par l'ARMP : autorisé ET tracé par la référence, qui
  // reste portée par l'avenant — la dérogation n'est pas un drapeau volatil.
  return { ...base, autorise: true, code: "DEROGATION_ARMP" };
}
