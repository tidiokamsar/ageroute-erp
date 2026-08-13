import { clsx } from "clsx";

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

const STATUT_ENTREPRISE: Record<string, { label: string; color: BadgeColor }> = {
  CONFORME: { label: "Conforme", color: "green" },
  A_REGULARISER: { label: "À régulariser", color: "amber" },
  BLOQUE: { label: "Bloqué", color: "red" },
};

const STATUT_MARCHE: Record<string, { label: string; color: BadgeColor }> = {
  EN_PREPARATION: { label: "En préparation", color: "gray" },
  ACTIF: { label: "Actif", color: "green" },
  SUSPENDU: { label: "Suspendu", color: "amber" },
  RESILIE: { label: "Résilié", color: "red" },
  SOLDE: { label: "Soldé", color: "teal" },
  CLOTURE: { label: "Clôturé", color: "navy" },
};

const STATUT_DECOMPTE: Record<string, { label: string; color: BadgeColor }> = {
  BROUILLON: { label: "Brouillon", color: "gray" },
  SOUMIS: { label: "Soumis", color: "blue" },
  EN_VALIDATION: { label: "En validation", color: "amber" },
  VALIDE: { label: "Validé", color: "teal" },
  REJETE: { label: "Rejeté", color: "red" },
  PAYE: { label: "Payé", color: "green" },
};

const TYPE_DECOMPTE: Record<string, string> = {
  AVANCE: "Avance", PROVISOIRE: "Provisoire", PARTIEL: "Partiel",
  INTERMEDIAIRE: "Intermédiaire", FINAL: "Final", CLOTURE: "Clôture", APRES_AVENANT: "Après avenant",
};

const FINANCEMENT: Record<string, { label: string; color: BadgeColor }> = {
  BANQUE_MONDIALE: { label: "Banque Mondiale", color: "blue" },
  BAD: { label: "BAD", color: "teal" },
  BUDGET_NATIONAL: { label: "Budget National", color: "navy" },
  FER: { label: "FER", color: "amber" },
  BOAD: { label: "BOAD", color: "green" },
  BID: { label: "BID", color: "blue" },
  UE: { label: "UE", color: "teal" },
  AUTRE: { label: "Autre", color: "gray" },
};

export function StatutEntrepriseBadge({ statut }: { statut: string }) {
  const s = STATUT_ENTREPRISE[statut] ?? { label: statut, color: "gray" as BadgeColor };
  return <Badge label={s.label} color={s.color} />;
}

export function StatutMarcheBadge({ statut }: { statut: string }) {
  const s = STATUT_MARCHE[statut] ?? { label: statut, color: "gray" as BadgeColor };
  return <Badge label={s.label} color={s.color} />;
}

export function StatutDecompteBadge({ statut }: { statut: string }) {
  const s = STATUT_DECOMPTE[statut] ?? { label: statut, color: "gray" as BadgeColor };
  return <Badge label={s.label} color={s.color} />;
}

export function TypeDecompteBadge({ type }: { type: string }) {
  return <Badge label={TYPE_DECOMPTE[type] ?? type} color="navy" />;
}

export function FinancementBadge({ financement }: { financement: string }) {
  const s = FINANCEMENT[financement] ?? { label: financement, color: "gray" as BadgeColor };
  return <Badge label={s.label} color={s.color} />;
}
