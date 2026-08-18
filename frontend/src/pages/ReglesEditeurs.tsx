/**
 * Lot L3.2 — Éditeurs dédiés pour les règles composites.
 *
 * Trois règles portent une structure, pas une valeur simple : les libellés
 * d'états (A9), les matrices de rôles du circuit (A8) et les pondérations du
 * score de conformité (A10). Les éditer en JSON brut revenait à demander à la
 * DAF d'écrire des accolades — et une virgule oubliée passait pour une erreur
 * technique alors qu'il s'agit d'un arbitrage métier.
 *
 * Chaque éditeur produit exactement la même chaîne que la saisie manuelle et
 * la renvoie au parcours normal (BROUILLON puis validation à quatre yeux) :
 * un seul chemin d'écriture, donc un seul endroit à auditer.
 */
import { useMemo } from "react";
import { Input, Select } from "../components/ui/Input";
import { ETIQUETTES_DEFAUT, type DomaineEtiquette } from "../lib/etiquettes";

const ROLES = [
  "ADMIN", "DG", "DAF", "DMC", "UGP", "MISSION", "TECHNIQUE",
  "ENTREPRISE", "AUDITEUR", "BAILLEUR", "BUDGET", "TRESOR", "FER_AGT", "BCRG",
];

const CRITERES: { cle: string; libelle: string }[] = [
  { cle: "NIF", libelle: "Numéro d'identification fiscale" },
  { cle: "TVA", libelle: "Assujettissement TVA" },
  { cle: "FISC", libelle: "Régularité fiscale" },
  { cle: "SOC", libelle: "Régularité sociale" },
  { cle: "DOCS", libelle: "Pièces administratives" },
  { cle: "CAUTION", libelle: "Capacité de cautionnement" },
];

const lireJson = (brut: string): Record<string, unknown> => {
  try {
    const p = JSON.parse(brut || "{}");
    return p && typeof p === "object" && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
};

/** A9 — surcharge des libellés, domaine par domaine et code par code. */
export function EditeurEtiquettes({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  const courant = useMemo(() => lireJson(valeur) as Partial<Record<DomaineEtiquette, Record<string, string>>>, [valeur]);

  const definir = (domaine: DomaineEtiquette, code: string, libelle: string) => {
    const suivant: Record<string, Record<string, string>> = JSON.parse(JSON.stringify(courant));
    if (libelle.trim() === "") {
      delete suivant[domaine]?.[code];
      if (suivant[domaine] && Object.keys(suivant[domaine]).length === 0) delete suivant[domaine];
    } else {
      suivant[domaine] = { ...(suivant[domaine] ?? {}), [code]: libelle };
    }
    onChange(JSON.stringify(suivant));
  };

  const domaines = Object.keys(ETIQUETTES_DEFAUT) as DomaineEtiquette[];
  const nbSurcharges = domaines.reduce((n, d) => n + Object.keys(courant[d] ?? {}).length, 0);

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Laissez un champ vide pour conserver le libellé livré.
        {nbSurcharges > 0 && <strong> {nbSurcharges} libellé(s) personnalisé(s).</strong>}
      </p>
      {domaines.map((domaine) => (
        <details key={domaine} className="rounded-lg border border-gray-200 bg-white">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700">
            {domaine}
            {Object.keys(courant[domaine] ?? {}).length > 0 && (
              <span className="ml-2 text-xs text-blue-700">({Object.keys(courant[domaine] ?? {}).length} personnalisé(s))</span>
            )}
          </summary>
          <div className="space-y-1.5 border-t border-gray-100 p-3">
            {Object.entries(ETIQUETTES_DEFAUT[domaine]).map(([code, defaut]) => (
              <div key={code} className="grid grid-cols-[1fr,1.2fr] items-center gap-2">
                <span className="truncate font-mono text-xs text-gray-500" title={code}>
                  {code}
                  <span className="ml-1 font-sans text-gray-400">— {defaut}</span>
                </span>
                <Input
                  value={courant[domaine]?.[code] ?? ""}
                  placeholder={defaut}
                  onChange={(e) => definir(domaine, code, e.target.value)}
                />
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

/** A10 — pondérations du score de conformité, avec contrôle du total. */
export function EditeurPonderations({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  const courant = useMemo(() => lireJson(valeur) as Record<string, number>, [valeur]);
  const total = CRITERES.reduce((s, c) => s + (Number(courant[c.cle]) || 0), 0);

  const definir = (cle: string, poids: string) => {
    const n = Number(poids);
    onChange(JSON.stringify({ ...courant, [cle]: Number.isFinite(n) ? n : 0 }));
  };

  return (
    <div className="space-y-2">
      {CRITERES.map((c) => (
        <div key={c.cle} className="grid grid-cols-[1fr,90px] items-center gap-2">
          <span className="text-sm text-gray-700">
            {c.libelle} <span className="font-mono text-xs text-gray-400">{c.cle}</span>
          </span>
          <Input type="number" min={0} max={100} value={courant[c.cle] ?? 0} onChange={(e) => definir(c.cle, e.target.value)} />
        </div>
      ))}
      <div className={`rounded-lg border p-2 text-sm ${total === 100 ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
        Total : <strong>{total}</strong> / 100
        {total !== 100 && " — un total différent de 100 rendrait les scores incomparables d'une entreprise à l'autre et fausserait les seuils."}
      </div>
    </div>
  );
}

/**
 * A8 — matrice des rôles habilités à une fonction du circuit.
 * Chaque règle WF_ROLES_* est éditée seule ; l'écran affiche en regard les
 * deux autres fonctions pour rendre visible un cumul ordonnateur/comptable.
 */
export function EditeurRoles({
  valeur,
  onChange,
  autresFonctions,
}: {
  valeur: string;
  onChange: (v: string) => void;
  autresFonctions?: { libelle: string; roles: string[] }[];
}) {
  const choisis = valeur.split(",").map((s) => s.trim()).filter(Boolean);

  const basculer = (role: string) =>
    onChange((choisis.includes(role) ? choisis.filter((r) => r !== role) : [...choisis, role]).join(","));

  const cumuls = (autresFonctions ?? [])
    .map((f) => ({ ...f, communs: f.roles.filter((r) => choisis.includes(r) && r !== "ADMIN") }))
    .filter((f) => f.communs.length > 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {ROLES.map((role) => {
          const actif = choisis.includes(role);
          return (
            <button
              key={role}
              type="button"
              onClick={() => basculer(role)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${actif ? "bg-navy text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              {role}
            </button>
          );
        })}
      </div>
      {choisis.length === 0 && (
        <p className="text-xs text-red-700">Aucun rôle : plus personne ne pourra exercer cette fonction, hors ADMIN.</p>
      )}
      {cumuls.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          Cumul de fonctions :
          {cumuls.map((f) => (
            <span key={f.libelle}> {f.communs.join(", ")} exerce aussi « {f.libelle} ».</span>
          ))}
          {" "}Vérifiez la séparation ordonnateur / comptable avant de valider.
        </div>
      )}
    </div>
  );
}

/** A7 et assimilés — sélection simple, utilisée par les règles ENUM. */
export function EditeurChoix({ choix, valeur, onChange }: { choix: string[]; valeur: string; onChange: (v: string) => void }) {
  return (
    <Select value={valeur} onChange={(e) => onChange(e.target.value)}>
      {choix.map((c) => <option key={c} value={c}>{c}</option>)}
    </Select>
  );
}
