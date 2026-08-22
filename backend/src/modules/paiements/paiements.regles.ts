/**
 * Règles pures du paiement — aucune dépendance HTTP ou base de données.
 *
 * Les montants GNF restent des entiers BigInt de bout en bout. Les nombres JSON
 * ne sont acceptés que lorsqu'ils sont des entiers sûrs, pour préserver la
 * compatibilité des clients existants sans accepter une valeur déjà arrondie
 * par IEEE-754.
 */

export interface LignePaiementActive {
  montantGnf: bigint;
  montantReelGnf: bigint | null;
  confirmeAt: Date | null;
}

export interface PositionPaiement {
  confirmeGnf: bigint;
  reserveGnf: bigint;
  engagementGnf: bigint;
}

export function convertirMontantGnf(valeur: string | number): bigint {
  if (typeof valeur === "number") {
    if (!Number.isSafeInteger(valeur) || valeur <= 0) {
      throw new Error("Le montant GNF doit être un entier positif sûr");
    }
    return BigInt(valeur);
  }

  if (!/^[1-9]\d*$/.test(valeur)) {
    throw new Error("Le montant GNF doit être une chaîne d'entier positif");
  }
  return BigInt(valeur);
}

/**
 * Montants déjà transférés et montants encore réservés par des ordres ouverts.
 * Une confirmation remplace sa réservation nominale par le montant réel.
 */
export function calculerPositionPaiement(lignes: LignePaiementActive[]): PositionPaiement {
  let confirmeGnf = 0n;
  let reserveGnf = 0n;

  for (const ligne of lignes) {
    if (ligne.confirmeAt && ligne.montantReelGnf !== null) {
      confirmeGnf += ligne.montantReelGnf;
    } else {
      reserveGnf += ligne.montantGnf;
    }
  }

  return { confirmeGnf, reserveGnf, engagementGnf: confirmeGnf + reserveGnf };
}

export function verifierNouvelOrdre(params: {
  netAPayerGnf: bigint;
  position: PositionPaiement;
  montantGnf: bigint;
}): { autorise: boolean; engagementApresGnf: bigint; motif?: string } {
  const engagementApresGnf = params.position.engagementGnf + params.montantGnf;
  if (engagementApresGnf > params.netAPayerGnf) {
    return {
      autorise: false,
      engagementApresGnf,
      motif: `Dépassement du net à payer : engagement ${engagementApresGnf} GNF > ${params.netAPayerGnf} GNF`,
    };
  }
  return { autorise: true, engagementApresGnf };
}

/** Évalue une confirmation en remplaçant l'ordre courant par son montant réel. */
export function evaluerConfirmation(params: {
  netAPayerGnf: bigint;
  positionAutresPaiements: PositionPaiement;
  montantReelGnf: bigint;
}): {
  autorise: boolean;
  confirmeApresGnf: bigint;
  engagementApresGnf: bigint;
  decomptePaye: boolean;
  motif?: string;
} {
  const confirmeApresGnf = params.positionAutresPaiements.confirmeGnf + params.montantReelGnf;
  const engagementApresGnf = confirmeApresGnf + params.positionAutresPaiements.reserveGnf;

  if (engagementApresGnf > params.netAPayerGnf) {
    return {
      autorise: false,
      confirmeApresGnf,
      engagementApresGnf,
      decomptePaye: false,
      motif: `Dépassement du net à payer : engagement réel et réservé ${engagementApresGnf} GNF > ${params.netAPayerGnf} GNF`,
    };
  }

  return {
    autorise: true,
    confirmeApresGnf,
    engagementApresGnf,
    decomptePaye:
      confirmeApresGnf === params.netAPayerGnf && params.positionAutresPaiements.reserveGnf === 0n,
  };
}
