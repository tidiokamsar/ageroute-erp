/**
 * Calcul financier d'un décompte — formule officielle AGEROUTE (fiche d'analyse).
 * Fonction PURE (aucune dépendance externe) → testable unitairement.
 *
 *   TVA               = montantPériode × tauxTva %          (défaut 18 %)
 *   ARMP              = montantPériode × 0,6 %              (redevance de régulation)
 *   TTC               = montantPériode + TVA + ARMP
 *   Précompte TVA     = TTC × 9/118
 *   Retenue de garantie = TTC × tauxRG %                    (défaut 5 %)
 *   Avance récupérée  = montantPériode × tauxAvance %       (défaut 20 %)
 *   Net à payer       = TTC − Précompte TVA − Retenue − ARMP − Avance − Pénalités + Révision
 */
export interface CalcDecompteInput {
  montantPeriodeHtGnf?: bigint;
  cumulPrecedentHtGnf?: bigint;
  penalites?: bigint;
  revisionPrix?: bigint;
  tauxTva?: number;
  tauxRetenueGarantie?: number;
  tauxAvance?: number;
  /** Solde d'avance restant à récupérer. Si fourni, la récupération est
   *  plafonnée : on ne déduit jamais plus que ce que l'entreprise doit. */
  avanceRestanteGnf?: bigint;
}

export interface CalcDecompteResult {
  cumulActuelHtGnf: bigint;
  tva: bigint;
  armp: bigint;
  ttc: bigint;
  precompteTva: bigint;
  retenueGarantie: bigint;
  avanceRecuperee: bigint;
  netAPayer: bigint;
}

export function calcDecompte(data: CalcDecompteInput): CalcDecompteResult {
  const montantPeriode = data.montantPeriodeHtGnf ?? 0n;
  const cumulPrecedent = data.cumulPrecedentHtGnf ?? 0n;
  const cumulActuel    = cumulPrecedent + montantPeriode;
  const tauxTva        = data.tauxTva ?? 18;
  const tauxRG         = data.tauxRetenueGarantie ?? 5;
  const tauxAvance     = data.tauxAvance ?? 20;
  // Formule AGEROUTE officielle (fiche d'analyse)
  const tva             = BigInt(Math.round(Number(montantPeriode) * tauxTva / 100));
  const armp            = BigInt(Math.round(Number(montantPeriode) * 0.6 / 100));
  const ttc             = montantPeriode + tva + armp;
  const precompteTva    = BigInt(Math.round(Number(ttc) * 9 / 118));
  const retenueGarantie = BigInt(Math.round(Number(ttc) * tauxRG / 100));
  let avanceRecuperee = BigInt(Math.round(Number(montantPeriode) * tauxAvance / 100));
  if (data.avanceRestanteGnf !== undefined && avanceRecuperee > data.avanceRestanteGnf) {
    avanceRecuperee = data.avanceRestanteGnf < 0n ? 0n : data.avanceRestanteGnf;
  }
  const penalites       = data.penalites ?? 0n;
  const revisionPrix    = data.revisionPrix ?? 0n;
  const netAPayer       = ttc - precompteTva - retenueGarantie - armp - avanceRecuperee - penalites + revisionPrix;
  return { cumulActuelHtGnf: cumulActuel, tva, armp, ttc, precompteTva, retenueGarantie, avanceRecuperee, netAPayer };
}
