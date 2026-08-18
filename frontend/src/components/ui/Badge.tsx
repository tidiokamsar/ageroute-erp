import { clsx } from "clsx";
import { libelleStatut } from "../../lib/etiquettes";
import { useEtiquettes } from "../../lib/useEtiquettes";

type BadgeColor = "green" | "amber" | "red" | "blue" | "navy" | "gray" | "teal";

export function Badge({ label, color = "gray" }: { label: string; color?: BadgeColor }) {
  return (
    <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", {
      "bg-green-100 text-green-800": color === "green",
      "bg-amber-100 text-amber-800": color === "amber",
      "bg-red-100 text-red-800": color === "red",
      "bg-blue-100 text-blue-800": color === "blue",
      "bg-navy/10 text-navy": color === "navy",
      "bg-gray-100 text-gray-700": color === "gray",
      "bg-teal-100 text-teal-800": color === "teal",
    })}>
      {label}
    </span>
  );
}

// L2.2 — les LIBELLÉS vivent dans lib/etiquettes.ts (source unique, surchargeable
// par la règle ETQ_MAPPINGS). Ici ne restent que les couleurs, qui relèvent de
// la charte graphique et non du paramétrage métier.
const COULEUR_ENTREPRISE: Record<string, BadgeColor> = {
  EN_ATTENTE: "gray", A_REGULARISER: "amber", CONFORME: "green", AUTORISE: "green",
  ALERTE: "amber", BLOQUE: "red", SUSPENDU: "amber", ARCHIVE: "gray",
};

const COULEUR_MARCHE: Record<string, BadgeColor> = {
  BROUILLON: "gray", EN_PREPARATION: "gray", SIGNE: "blue", NOTIFIE: "blue",
  EN_EXECUTION: "green", ACTIF: "green", SUSPENDU: "amber", EN_AVENANT: "amber",
  EN_RECEPTION_PROVISOIRE: "teal", EN_RECEPTION_DEFINITIVE: "teal",
  RESILIE: "red", SOLDE: "teal", CLOTURE: "navy",
};

const COULEUR_DECOMPTE: Record<string, BadgeColor> = {
  BROUILLON: "gray", SOUMIS: "blue", DEPOSE: "blue", EN_CONTROLE: "amber",
  EN_CORRECTION: "amber", EN_VALIDATION: "amber", VISA_DAF: "teal", VISA_DG: "teal",
  VALIDE_DG: "teal", EN_CIRCUIT_FINANCIER: "blue", ORDONNANCE: "navy",
  VALIDE: "teal", REJETE: "red", PAYE: "green",
};

const COULEUR_FINANCEMENT: Record<string, BadgeColor> = {
  BANQUE_MONDIALE: "blue", BAD: "teal", BUDGET_NATIONAL: "navy", FER: "amber",
  BOAD: "green", BID: "blue", UE: "teal", BADEA: "navy", AFD: "blue",
  KFW: "gray", AUTRE: "gray",
};

export function StatutEntrepriseBadge({ statut }: { statut: string }) {
  const etiquettes = useEtiquettes();
  return <Badge label={libelleStatut("ENTREPRISE", statut, etiquettes)} color={COULEUR_ENTREPRISE[statut] ?? "gray"} />;
}

export function StatutMarcheBadge({ statut }: { statut: string }) {
  const etiquettes = useEtiquettes();
  return <Badge label={libelleStatut("MARCHE", statut, etiquettes)} color={COULEUR_MARCHE[statut] ?? "gray"} />;
}

export function StatutDecompteBadge({ statut }: { statut: string }) {
  const etiquettes = useEtiquettes();
  return <Badge label={libelleStatut("DECOMPTE", statut, etiquettes)} color={COULEUR_DECOMPTE[statut] ?? "gray"} />;
}

export function TypeDecompteBadge({ type }: { type: string }) {
  const etiquettes = useEtiquettes();
  return <Badge label={libelleStatut("TYPE_DECOMPTE", type, etiquettes)} color="navy" />;
}

export function FinancementBadge({ financement }: { financement: string }) {
  const etiquettes = useEtiquettes();
  return <Badge label={libelleStatut("FINANCEMENT", financement, etiquettes)} color={COULEUR_FINANCEMENT[financement] ?? "gray"} />;
}
