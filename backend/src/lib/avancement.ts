/**
 * Avancement financier d'un projet.
 *
 * DÉFAUT CORRIGÉ le 20/08/2026. Le calcul était :
 *   const budget = Number(revise) || Number(initial) || 1;
 *   avancement   = totalPaye / budget * 100;
 *
 * Le repli `|| 1` transformait un budget absent en un dénominateur d'UN FRANC.
 * Tant que les décomptes n'étaient pas rattachés au projet, `totalPaye` valait 0
 * et 0/1 donnait 0 % — le défaut restait invisible. Dès que le rattachement a été
 * corrigé, l'écran a affiché « 202 668 805 200 % ».
 *
 * Règle retenue : on ne fabrique jamais un dénominateur. À défaut de budget, on
 * se rabat sur le montant engagé — la somme des marchés du projet, qui est une
 * référence financière réelle — et l'on DIT laquelle a servi. Si aucune des deux
 * n'existe, l'avancement n'est pas calculable et vaut `null` : l'écran affiche un
 * tiret, ce qui est exact, plutôt qu'un zéro, qui serait faux.
 */

/** Référence financière effectivement utilisée pour le calcul. */
export type BaseAvancement = "BUDGET" | "MARCHES" | "AUCUNE";

export interface Avancement {
  /** Dénominateur retenu, en GNF. 0 si aucun. */
  reference: number;
  base: BaseAvancement;
  /** Pourcentage à deux décimales, ou null si non calculable. */
  taux: number | null;
}

export function calculerAvancement(params: {
  budgetGnf: number;
  totalMarcheHtGnf: number;
  montantGnf: number;
}): Avancement {
  const budget = Number.isFinite(params.budgetGnf) && params.budgetGnf > 0 ? params.budgetGnf : 0;
  const marches = Number.isFinite(params.totalMarcheHtGnf) && params.totalMarcheHtGnf > 0 ? params.totalMarcheHtGnf : 0;

  const reference = budget > 0 ? budget : marches;
  const base: BaseAvancement = budget > 0 ? "BUDGET" : marches > 0 ? "MARCHES" : "AUCUNE";

  if (reference <= 0) return { reference: 0, base: "AUCUNE", taux: null };

  const montant = Number.isFinite(params.montantGnf) && params.montantGnf > 0 ? params.montantGnf : 0;
  return { reference, base, taux: Math.round((montant / reference) * 10000) / 100 };
}

/** Libellé de la référence, à afficher à côté du pourcentage. */
export function libelleBaseAvancement(base: BaseAvancement): string {
  switch (base) {
    case "BUDGET": return "budget du projet";
    case "MARCHES": return "montant engagé (somme des marchés) — budget du projet non saisi";
    default: return "aucune référence financière disponible";
  }
}
