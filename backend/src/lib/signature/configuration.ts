/**
 * Configuration de la signature — lue dans l'ADMINISTRATION, verrouillée par
 * des garde-fous indépendants.
 *
 * Décision du 23/08/2026 : prestataire, TSA, validation et ancres de confiance
 * se règlent dans Paramétrage → Signature électronique. Les secrets restent
 * dans l'environnement du conteneur.
 *
 * Les garde-fous ci-dessous sont INDÉPENDANTS : en contourner un seul ne suffit
 * jamais à produire un document qui pourrait passer pour une signature valable.
 *   G1 — SIG_MODE vaut `disabled` par défaut.
 *   G2 — `laboratory` exige SIGNATURE_LAB_AUTORISE=oui dans l'environnement.
 *   G3 — `provider` exige SIGNATURE_PRODUCTION_AUTORISEE=oui — qui ne doit PAS
 *        être posé tant que la porte NO_GO_SIGNATURE_PRODUCTION est maintenue.
 *   G4 — `provider` refuse un prestataire simulé et exige des ancres de confiance.
 *   G5 — hors mode `provider`, le filigrane est apposé quoi qu'il arrive : le
 *        texte est configurable, sa présence ne l'est pas.
 */
import { prisma } from "../prisma";
import type { ModeSignature, NiveauPades } from "./interfaces";

export interface ConfigurationSignature {
  mode: ModeSignature;
  prestataireType: "simule" | "signserver";
  prestataireUrl: string;
  prestataireWorker: string;
  prestataireAuth: "aucune" | "basic" | "mtls";
  tsaUrl: string;
  dssUrl: string;
  niveau: NiveauPades;
  ancresConfiance: string;
  filigraneTexte: string;
  /** true si le filigrane DOIT être apposé (tout mode sauf provider). */
  filigraneImpose: boolean;
  /** Résultat des garde-fous : actif, ou inactif avec le motif exact. */
  actif: boolean;
  motifBlocage: string | null;
}

export const CLES_SIGNATURE = [
  "SIG_MODE", "SIG_PRESTATAIRE_TYPE", "SIG_PRESTATAIRE_URL", "SIG_PRESTATAIRE_WORKER",
  "SIG_PRESTATAIRE_AUTH", "SIG_TSA_URL", "SIG_DSS_URL", "SIG_NIVEAU_PADES",
  "SIG_ANCRES_CONFIANCE", "SIG_FILIGRANE_TEXTE",
] as const;

const DEFAUTS: Record<(typeof CLES_SIGNATURE)[number], string> = {
  SIG_MODE: "disabled",
  SIG_PRESTATAIRE_TYPE: "simule",
  SIG_PRESTATAIRE_URL: "",
  SIG_PRESTATAIRE_WORKER: "PDFSignerLab",
  SIG_PRESTATAIRE_AUTH: "aucune",
  SIG_TSA_URL: "",
  SIG_DSS_URL: "",
  SIG_NIVEAU_PADES: "B",
  SIG_ANCRES_CONFIANCE: "",
  SIG_FILIGRANE_TEXTE: "SIMULATION — SANS VALEUR JURIDIQUE",
};

/**
 * Applique les garde-fous à des valeurs déjà lues. Fonction PURE — testée sans
 * base : c'est la décision qui protège contre une activation accidentelle.
 */
export function evaluerGardeFous(
  valeurs: Record<string, string>,
  environnement: { NODE_ENV?: string; SIGNATURE_LAB_AUTORISE?: string; SIGNATURE_PRODUCTION_AUTORISEE?: string },
): ConfigurationSignature {
  const v = (k: (typeof CLES_SIGNATURE)[number]) => (valeurs[k] ?? DEFAUTS[k]).trim();
  const mode = (["disabled", "laboratory", "provider"].includes(v("SIG_MODE")) ? v("SIG_MODE") : "disabled") as ModeSignature;
  const prestataireType = (v("SIG_PRESTATAIRE_TYPE") === "signserver" ? "signserver" : "simule");
  const prestataireAuth = (["basic", "mtls"].includes(v("SIG_PRESTATAIRE_AUTH")) ? v("SIG_PRESTATAIRE_AUTH") : "aucune") as "aucune" | "basic" | "mtls";
  const niveau = (["B", "T", "LT", "LTA"].includes(v("SIG_NIVEAU_PADES")) ? v("SIG_NIVEAU_PADES") : "B") as NiveauPades;

  const base: ConfigurationSignature = {
    mode, prestataireType, prestataireAuth, niveau,
    prestataireUrl: v("SIG_PRESTATAIRE_URL"),
    prestataireWorker: v("SIG_PRESTATAIRE_WORKER") || DEFAUTS.SIG_PRESTATAIRE_WORKER,
    tsaUrl: v("SIG_TSA_URL"),
    dssUrl: v("SIG_DSS_URL"),
    ancresConfiance: v("SIG_ANCRES_CONFIANCE"),
    filigraneTexte: v("SIG_FILIGRANE_TEXTE") || DEFAUTS.SIG_FILIGRANE_TEXTE,
    filigraneImpose: mode !== "provider",
    actif: false,
    motifBlocage: null,
  };

  // G1
  if (mode === "disabled") return { ...base, motifBlocage: "Signature désactivée (SIG_MODE = disabled)." };

  // G2
  if (mode === "laboratory" && environnement.SIGNATURE_LAB_AUTORISE !== "oui") {
    return { ...base, motifBlocage: "Mode laboratoire non autorisé sur cet environnement : SIGNATURE_LAB_AUTORISE=oui absent. Un document signé ici n'aurait aucune valeur ; l'activation doit être explicite." };
  }

  // G3 + G4
  if (mode === "provider") {
    if (environnement.SIGNATURE_PRODUCTION_AUTORISEE !== "oui") {
      return { ...base, motifBlocage: "Porte NO_GO_SIGNATURE_PRODUCTION maintenue : SIGNATURE_PRODUCTION_AUTORISEE=oui absent. Prérequis : décret publié, prestataire agréé ANDE, TSA reconnue, certificats nominatifs, recette." };
    }
    if (prestataireType === "simule") {
      return { ...base, motifBlocage: "Mode provider refusé avec un prestataire simulé." };
    }
    if (!base.ancresConfiance) {
      return { ...base, motifBlocage: "Mode provider refusé sans ancres de confiance (SIG_ANCRES_CONFIANCE vide)." };
    }
    if (!/^https:\/\//.test(base.prestataireUrl)) {
      return { ...base, motifBlocage: "Mode provider refusé : l'URL du prestataire doit être en HTTPS." };
    }
  }

  if (prestataireType === "signserver" && !base.prestataireUrl) {
    return { ...base, motifBlocage: "Prestataire SignServer sélectionné sans URL (SIG_PRESTATAIRE_URL)." };
  }

  return { ...base, actif: true };
}

/** Lecture en base + garde-fous. Jamais de cache : un changement dans l'admin prend effet immédiatement. */
export async function chargerConfigurationSignature(): Promise<ConfigurationSignature> {
  const lignes = await prisma.parametreMetier.findMany({ where: { categorie: "SIGNATURE" }, select: { cle: true, valeur: true } });
  const valeurs = Object.fromEntries(lignes.map((l) => [l.cle, l.valeur]));
  return evaluerGardeFous(valeurs, {
    NODE_ENV: process.env.NODE_ENV,
    SIGNATURE_LAB_AUTORISE: process.env.SIGNATURE_LAB_AUTORISE,
    SIGNATURE_PRODUCTION_AUTORISEE: process.env.SIGNATURE_PRODUCTION_AUTORISEE,
  });
}
