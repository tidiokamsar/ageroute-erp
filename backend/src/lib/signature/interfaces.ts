/**
 * Contrats du module signature-numerique.
 *
 * Principe directeur (PLAN-SIGNATURE-NUMERIQUE, ADR-02) : ces interfaces sont la
 * SEULE frontière entre l'ERP et le monde de la confiance. Changer de
 * prestataire, de TSA ou de moteur de validation ne touche qu'un adaptateur —
 * jamais les workflows, la génération PDF, l'audit ni le moteur de validation
 * métier. L'ERP n'accède jamais à une clé privée : il envoie un PDF, il reçoit
 * un PDF signé.
 */

export type ModeSignature = "disabled" | "laboratory" | "provider";
export type NiveauPades = "B" | "T" | "LT" | "LTA";

/** Résultat de validation, dans le vocabulaire ETSI repris par DSS. */
export type IndicationValidation = "TOTAL_PASSED" | "PASSED" | "FAILED" | "INDETERMINATE" | "NON_VERIFIE";

export interface ContexteSignature {
  /** Référence métier du document (ex. MCHE-2025-002-DP-03). */
  reference: string;
  /** Identité du signataire telle qu'elle doit figurer dans la signature. */
  signataire: { id: string; email: string; nom: string; role: string; qualite?: string };
  niveau: NiveauPades;
  /** Motif de signature (champ Reason du PDF). */
  motif: string;
  /** URL de la TSA à utiliser par le prestataire, si le niveau l'exige. */
  tsaUrl?: string;
}

export interface ResultatSignature {
  pdfSigne: Buffer;
  /** Nom du prestataire tel qu'il s'est identifié. */
  prestataire: string;
  /** Niveau effectivement obtenu (un prestataire peut ne pas savoir faire LTA). */
  niveauObtenu: NiveauPades;
  /** Détail libre, journalisé — jamais de secret dedans. */
  detail: Record<string, unknown>;
}

export interface EtatSante {
  ok: boolean;
  detail: string;
}

export interface AdaptateurPrestataire {
  readonly nom: string;
  /** Un adaptateur simulé ne produit jamais une signature opposable. */
  readonly simule: boolean;
  signerPdf(pdf: Buffer, ctx: ContexteSignature): Promise<ResultatSignature>;
  sante(): Promise<EtatSante>;
}

export interface ServiceValidation {
  readonly nom: string;
  validerPdf(pdf: Buffer, nomFichier: string): Promise<{ indication: IndicationValidation; rapport: Record<string, unknown> }>;
  sante(): Promise<EtatSante>;
}
