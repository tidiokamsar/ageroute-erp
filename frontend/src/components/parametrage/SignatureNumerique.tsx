/**
 * Administration de la signature électronique — Paramétrage → Signature.
 *
 * Tout ce qui désigne un prestataire, une TSA, un validateur ou des ancres de
 * confiance se règle ICI, jamais dans le code. Les secrets (mot de passe,
 * certificat client) restent dans l'environnement du serveur : l'écran le dit
 * et ne les demande pas.
 *
 * L'état affiché vient du serveur (GET /signature-numerique/etat) : mode
 * effectif après garde-fous, santé réelle du prestataire et du validateur,
 * état des trois portes.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError } from "../../lib/api";
import { toast } from "../ui/Toast";
import { Button } from "../ui/Button";

interface Param { cle: string; valeur: string; libelle: string; categorie: string }

const CHAMPS: Array<{ cle: string; label: string; aide: string; type: "select" | "text" | "textarea"; options?: string[] }> = [
  { cle: "SIG_MODE", label: "Mode", type: "select", options: ["disabled", "laboratory", "provider"],
    aide: "disabled : rien ne signe. laboratory : pile open source de test, filigrane imposé, aucune valeur juridique. provider : prestataire agréé — porte NO-GO tant que les prérequis réglementaires ne sont pas réunis." },
  { cle: "SIG_PRESTATAIRE_TYPE", label: "Prestataire", type: "select", options: ["simule", "signserver"],
    aide: "simule : renvoie le PDF marqué, sans cryptographie. signserver : SignServer Community (laboratoire) ou prestataire compatible (production)." },
  { cle: "SIG_PRESTATAIRE_URL", label: "URL du prestataire", type: "text", aide: "Ex. http://labo-signserver:8080 en laboratoire ; HTTPS obligatoire en mode provider." },
  { cle: "SIG_PRESTATAIRE_WORKER", label: "Worker de signature", type: "text", aide: "Nom du worker PDF chez le prestataire (ex. PDFSignerLab)." },
  { cle: "SIG_PRESTATAIRE_AUTH", label: "Authentification", type: "select", options: ["aucune", "basic", "mtls"],
    aide: "basic : SIG_PRESTATAIRE_UTILISATEUR / _MOT_DE_PASSE dans l'environnement. mtls : SIG_PRESTATAIRE_CERT_CLIENT / _CLE_CLIENT (chemins PEM)." },
  { cle: "SIG_TSA_URL", label: "Autorité d'horodatage (RFC 3161)", type: "text", aide: "Transmise au prestataire pour les niveaux T et supérieurs. Vide = pas d'horodatage." },
  { cle: "SIG_DSS_URL", label: "Service de validation DSS", type: "text", aide: "Ex. http://labo-dss:8080/dss-webapp. Vide = validation non effectuée (dit en clair sur chaque document)." },
  { cle: "SIG_NIVEAU_PADES", label: "Niveau PAdES demandé", type: "select", options: ["B", "T", "LT", "LTA"],
    aide: "B pour les premiers tests ; T avec TSA ; LT/LTA exigent la validation longue durée et une politique de renouvellement." },
  { cle: "SIG_ANCRES_CONFIANCE", label: "Ancres de confiance (PEM)", type: "textarea", aide: "Certificats racine, concaténés. En laboratoire : la racine EJBCA de TEST. Jamais installée en production." },
  { cle: "SIG_FILIGRANE_TEXTE", label: "Texte du filigrane", type: "text", aide: "Apposé sur chaque page hors mode provider. Le texte est modifiable, la présence ne l'est pas." },
];

export function SignatureNumerique() {
  const qc = useQueryClient();
  const { data: params } = useQuery<Param[]>({ queryKey: ["parametrage"], queryFn: () => api.get("/parametrage").then((r) => r.data) });
  const { data: etat, refetch, isFetching } = useQuery({ queryKey: ["signature-etat"], queryFn: () => api.get("/signature-numerique/etat").then((r) => r.data), refetchInterval: 30_000 });
  const [brouillon, setBrouillon] = useState<Record<string, string>>({});

  const valeur = (cle: string) => brouillon[cle] ?? params?.find((p) => p.cle === cle)?.valeur ?? "";
  const modifie = (cle: string) => cle in brouillon && brouillon[cle] !== (params?.find((p) => p.cle === cle)?.valeur ?? "");

  const enregistrer = useMutation({
    mutationFn: async () => {
      const cles = Object.keys(brouillon).filter(modifie);
      for (const cle of cles) await api.put(`/parametrage/${cle}`, { valeur: brouillon[cle] });
      return cles.length;
    },
    onSuccess: (n) => { qc.invalidateQueries({ queryKey: ["parametrage"] }); refetch(); setBrouillon({}); toast.success(`${n} paramètre(s) enregistré(s) — effet immédiat`); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const cfg = etat?.configuration;
  const portes = etat?.portes ?? {};

  return (
    <div className="space-y-6">
      {/* État effectif */}
      <div className={`rounded-xl border p-4 ${cfg?.actif ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-navy">
              {cfg?.actif ? `Signature ACTIVE — mode ${cfg.mode}` : "Signature inactive"}
            </p>
            {!cfg?.actif && cfg?.motifBlocage && <p className="text-xs text-gray-600 mt-1">{cfg.motifBlocage}</p>}
            {cfg?.actif && cfg.mode !== "provider" && (
              <p className="text-xs text-amber-800 mt-1 font-semibold">Tout document signé dans ce mode porte le filigrane « {cfg.filigraneTexte} » et n'a AUCUNE valeur juridique.</p>
            )}
          </div>
          <Button size="sm" variant="secondary" onClick={() => refetch()} disabled={isFetching}>{isFetching ? "…" : "Rafraîchir"}</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-xs">
          <Sante titre={`Prestataire — ${etat?.prestataire?.nom ?? "—"}${etat?.prestataire?.simule ? " (simulé)" : ""}`} s={etat?.prestataire?.sante} />
          <Sante titre={`Validation — ${etat?.validation?.nom ?? "—"}`} s={etat?.validation?.sante} />
          <div className="rounded-lg bg-white border border-gray-200 p-3">
            <p className="font-semibold text-gray-700 mb-1">Environnement</p>
            <p>NODE_ENV : <b>{etat?.environnement?.nodeEnv}</b></p>
            <p>Laboratoire autorisé : <b>{etat?.environnement?.laboratoireAutorise ? "oui" : "non"}</b></p>
            <p>Production autorisée : <b className={etat?.environnement?.productionAutorisee ? "text-red-700" : ""}>{etat?.environnement?.productionAutorisee ? "OUI (!)" : "non"}</b></p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
          {Object.entries(portes).map(([k, v]) => (
            <span key={k} className={`px-2 py-1 rounded font-mono ${String(v).startsWith("NO") || String(v).includes("MAINTENU") ? "bg-red-100 text-red-800" : String(v).includes("ACTIF") || String(v) === "OUVERT" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
              {k} = {String(v)}
            </span>
          ))}
        </div>
      </div>

      {/* Formulaire */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-bold text-navy mb-1">Configuration</h3>
        <p className="text-xs text-gray-500 mb-4">Les secrets ne se saisissent pas ici : ils vivent dans l'environnement du serveur, jamais en base ni dans Git.</p>
        <div className="space-y-4">
          {CHAMPS.map((c) => (
            <div key={c.cle} className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-2 items-start">
              <label className="text-xs font-semibold text-gray-700 pt-2">
                {c.label}
                {modifie(c.cle) && <span className="ml-2 text-[10px] text-amber-700">modifié</span>}
                <span className="block font-mono text-[10px] text-gray-400 font-normal">{c.cle}</span>
              </label>
              <div>
                {c.type === "select" ? (
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={valeur(c.cle)} onChange={(e) => setBrouillon({ ...brouillon, [c.cle]: e.target.value })}>
                    {c.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : c.type === "textarea" ? (
                  <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono" rows={6} value={valeur(c.cle)} onChange={(e) => setBrouillon({ ...brouillon, [c.cle]: e.target.value })} placeholder="-----BEGIN CERTIFICATE-----" />
                ) : (
                  <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={valeur(c.cle)} onChange={(e) => setBrouillon({ ...brouillon, [c.cle]: e.target.value })} />
                )}
                <p className="text-[11px] text-gray-500 mt-1">{c.aide}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={() => setBrouillon({})} disabled={Object.keys(brouillon).length === 0}>Annuler</Button>
          <Button onClick={() => enregistrer.mutate()} disabled={enregistrer.isPending || !Object.keys(brouillon).some(modifie)}>
            {enregistrer.isPending ? "…" : "Enregistrer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Sante({ titre, s }: { titre: string; s?: { ok: boolean; detail: string } }) {
  return (
    <div className="rounded-lg bg-white border border-gray-200 p-3">
      <p className="font-semibold text-gray-700 mb-1">{titre}</p>
      <p className={s?.ok ? "text-green-700" : "text-red-700"}>{s ? (s.ok ? "● joignable" : "● indisponible") : "…"}</p>
      <p className="text-gray-500 break-words">{s?.detail}</p>
    </div>
  );
}
