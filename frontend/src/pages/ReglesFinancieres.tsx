/**
 * Lot L0.4 — Onglet « Règles financières » du paramétrage.
 *
 * Consomme l'API L0.2 : une valeur proposée part en BROUILLON et n'entre en
 * vigueur qu'après validation par une AUTRE personne. L'écran matérialise ce
 * principe : le bouton Valider n'apparaît jamais à celui qui a saisi.
 *
 * Aucune logique de calcul ici — la simulation est demandée au serveur, qui
 * partage la fonction de calcul du moteur (pas de duplication de formule).
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/Button";
import { Input, Select, Textarea, FormField } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Badge } from "../components/ui/Badge";
import { toast } from "../components/ui/Toast";
import { ChevronDown, ChevronRight, Check, FlaskConical, History, Send } from "lucide-react";

interface OptionsRegle { choix?: string[]; min?: number; max?: number; valeurs?: string[] }
interface DemandeEnAttente {
  id: string; valeur: string; portee: string; porteeId: string;
  dateEffet: string; saisiPar: string | null; motif: string; version: number;
}
interface Regle {
  cle: string; categorie: string; libelle: string;
  type: "ENUM" | "NUMBER" | "BOOLEAN" | "MULTI" | "JSON";
  options: OptionsRegle | null;
  valeurDefaut: string; valeurEffective: string; surchargee: boolean;
  derniereModification: { valeur: string; dateEffet: string; validePar: string | null; valideAt: string | null; motif: string; version: number } | null;
  enAttenteValidation: DemandeEnAttente[];
}
interface LigneSimulation { cle: string; libelle: string; formuleApres: string; avantGnf: string; apresGnf: string; ecartGnf: string }

const CATEGORIES: Record<string, string> = {
  FINANCE: "Finance — calcul du décompte",
  WORKFLOW: "Workflow — habilitations du circuit",
  ETATS: "États officiels",
  CONFORMITE: "Conformité des entreprises",
};

const PORTEES = [
  { valeur: "GLOBAL", libelle: "Global (toute l'agence)" },
  { valeur: "BAILLEUR", libelle: "Par bailleur" },
  { valeur: "TYPE_MARCHE", libelle: "Par type de marché" },
  { valeur: "MARCHE", libelle: "Par marché" },
];

const gnf = (v: string | number) => new Intl.NumberFormat("fr-FR").format(Number(v)) + " GNF";
const jour = (d?: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

export function ReglesFinancieres() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const peutParametrer = user?.role === "ADMIN" || user?.role === "DAF";

  const [categorie, setCategorie] = useState<string>("FINANCE");
  const [deplie, setDeplie] = useState<Record<string, boolean>>({});
  const [saisie, setSaisie] = useState<Record<string, { valeur: string; portee: string; porteeId: string; dateEffet: string; motif: string }>>({});
  const [simulation, setSimulation] = useState<{ cle: string; lignes: LigneSimulation[]; netAvantGnf: string; netApresGnf: string } | null>(null);

  const { data, isLoading } = useQuery<{ regles: Regle[] }>({
    queryKey: ["regles-gestion", categorie],
    queryFn: () => api.get(`/parametrage/regles?categorie=${categorie}`).then((r) => r.data),
  });

  const brouillon = (cle: string, defaut: string) =>
    saisie[cle] ?? { valeur: defaut, portee: "GLOBAL", porteeId: "", dateEffet: "", motif: "" };

  const majBrouillon = (cle: string, defaut: string, champ: string, valeur: string) =>
    setSaisie((s) => ({ ...s, [cle]: { ...brouillon(cle, defaut), [champ]: valeur } }));

  const proposer = useMutation({
    mutationFn: (corps: object) => api.post("/parametrage/regles", corps),
    onSuccess: (_r, corps) => {
      qc.invalidateQueries({ queryKey: ["regles-gestion"] });
      setSaisie((s) => { const c = { ...s }; delete c[(corps as { cle: string }).cle]; return c; });
      toast.success("Proposition enregistrée en brouillon — elle doit être validée par une autre personne");
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const valider = useMutation({
    mutationFn: (id: string) => api.post(`/parametrage/regles/${id}/valider`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["regles-gestion"] });
      toast.success("Règle validée et entrée en vigueur");
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const simuler = useMutation({
    mutationFn: ({ cle, valeur }: { cle: string; valeur: string }) =>
      api.post("/parametrage/regles/simuler", { regles: { [cle]: valeur }, montantHtGnf: 1_000_000_000 }).then((r) => ({ cle, ...r.data })),
    onSuccess: (d) => setSimulation(d as never),
    onError: (e) => toast.error(parseApiError(e)),
  });

  if (!peutParametrer) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Les règles de gestion ne sont consultables que par les profils ADMIN et DAF.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        Une valeur modifiée ici n'entre <strong>pas</strong> en vigueur immédiatement : elle part en
        brouillon et doit être validée par une autre personne. Tant qu'aucune règle n'est validée,
        le moteur applique les valeurs par défaut, c'est-à-dire le comportement actuel.
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(CATEGORIES).map(([cle, libelle]) => (
          <button
            key={cle}
            onClick={() => setCategorie(cle)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${categorie === cle ? "bg-navy text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"}`}
          >
            {libelle}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-gray-500">Chargement des règles…</p>}

      <div className="space-y-3">
        {(data?.regles ?? []).map((regle) => {
          const b = brouillon(regle.cle, regle.valeurEffective);
          const modifiee = b.valeur !== regle.valeurEffective;
          return (
            <div key={regle.cle} className="rounded-lg border border-gray-200 bg-white">
              <div className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">{regle.libelle}</span>
                    {regle.surchargee
                      ? <Badge label="Paramétrée" color="blue" />
                      : <Badge label="Valeur par défaut" color="gray" />}
                    {regle.enAttenteValidation.length > 0 && <Badge label={`${regle.enAttenteValidation.length} en attente`} color="amber" />}
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-gray-400">{regle.cle}</p>
                  <p className="mt-1 text-sm text-gray-600">
                    En vigueur : <strong>{regle.valeurEffective || "(vide)"}</strong>
                    {regle.surchargee && <span className="text-gray-400"> · défaut : {regle.valeurDefaut || "(vide)"}</span>}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setDeplie((d) => ({ ...d, [regle.cle]: !d[regle.cle] }))}>
                  {deplie[regle.cle] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Modifier
                </Button>
              </div>

              {deplie[regle.cle] && (
                <div className="space-y-4 border-t border-gray-100 bg-gray-50 p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <FormField label="Nouvelle valeur" required>
                      <SaisieValeur regle={regle} valeur={b.valeur} onChange={(v) => majBrouillon(regle.cle, regle.valeurEffective, "valeur", v)} />
                    </FormField>

                    <FormField label="Portée">
                      <Select value={b.portee} onChange={(e) => majBrouillon(regle.cle, regle.valeurEffective, "portee", e.target.value)}>
                        {PORTEES.map((p) => <option key={p.valeur} value={p.valeur}>{p.libelle}</option>)}
                      </Select>
                    </FormField>

                    {b.portee !== "GLOBAL" && (
                      <FormField label="Identifiant de portée" required>
                        <Input
                          value={b.porteeId}
                          placeholder={b.portee === "BAILLEUR" ? "BAD, BM, FER…" : b.portee === "MARCHE" ? "identifiant du marché" : "TRAVAUX, SERVICES…"}
                          onChange={(e) => majBrouillon(regle.cle, regle.valeurEffective, "porteeId", e.target.value)}
                        />
                      </FormField>
                    )}

                    <FormField label="Date d'effet">
                      <Input
                        type="date"
                        value={b.dateEffet}
                        onChange={(e) => majBrouillon(regle.cle, regle.valeurEffective, "dateEffet", e.target.value)}
                      />
                    </FormField>
                  </div>

                  <FormField label="Motif de la décision (10 caractères minimum)" required>
                    <Textarea
                      value={b.motif}
                      placeholder="Référence de la décision, note DAF, courrier bailleur…"
                      onChange={(e) => majBrouillon(regle.cle, regle.valeurEffective, "motif", e.target.value)}
                    />
                  </FormField>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={!modifiee || b.motif.trim().length < 10 || proposer.isPending}
                      onClick={() => proposer.mutate({
                        cle: regle.cle,
                        valeur: b.valeur,
                        portee: b.portee,
                        porteeId: b.porteeId,
                        motif: b.motif,
                        ...(b.dateEffet ? { dateEffet: b.dateEffet } : {}),
                      })}
                    >
                      <Send className="h-4 w-4" /> Proposer
                    </Button>

                    <Button variant="secondary" size="sm" disabled={simuler.isPending} onClick={() => simuler.mutate({ cle: regle.cle, valeur: b.valeur })}>
                      <FlaskConical className="h-4 w-4" /> Simuler l'effet
                    </Button>
                  </div>

                  {!modifiee && <p className="text-xs text-gray-500">Modifiez la valeur pour pouvoir proposer un changement.</p>}
                  {modifiee && b.motif.trim().length < 10 && <p className="text-xs text-amber-700">Le motif est obligatoire : il est conservé dans la piste d'audit.</p>}

                  {regle.enAttenteValidation.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="mb-2 text-sm font-medium text-amber-900">En attente de validation</p>
                      <div className="space-y-2">
                        {regle.enAttenteValidation.map((d) => {
                          const propreSaisie = d.saisiPar === user?.id;
                          return (
                            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-white p-2 text-sm">
                              <div>
                                <strong>{d.valeur || "(vide)"}</strong>
                                <span className="text-gray-500"> · {d.portee}{d.porteeId && ` (${d.porteeId})`} · effet {jour(d.dateEffet)} · v{d.version}</span>
                                <p className="text-xs text-gray-500">Motif : {d.motif}</p>
                              </div>
                              {propreSaisie ? (
                                <span className="text-xs text-gray-500">Votre saisie — la validation revient à une autre personne</span>
                              ) : (
                                <Button size="sm" disabled={valider.isPending} onClick={() => valider.mutate(d.id)}>
                                  <Check className="h-4 w-4" /> Valider
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <Historique cle={regle.cle} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Modal open={Boolean(simulation)} onClose={() => setSimulation(null)} title="Simulation — effet sur un décompte de 1 000 000 000 GNF HT" size="lg">
        {simulation && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Aucune règle n'a été appliquée ni enregistrée : il s'agit d'une projection.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                  <tr><th className="py-2">Poste</th><th>Formule</th><th className="text-right">Avant</th><th className="text-right">Après</th><th className="text-right">Écart</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {simulation.lignes.map((l) => (
                    <tr key={l.cle}>
                      <td className="py-2">{l.libelle}</td>
                      <td className="font-mono text-xs text-gray-500">{l.formuleApres}</td>
                      <td className="text-right">{gnf(l.avantGnf)}</td>
                      <td className="text-right">{gnf(l.apresGnf)}</td>
                      <td className={`text-right font-medium ${Number(l.ecartGnf) === 0 ? "text-gray-400" : Number(l.ecartGnf) > 0 ? "text-green-700" : "text-red-700"}`}>
                        {Number(l.ecartGnf) > 0 ? "+" : ""}{gnf(l.ecartGnf)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-300 font-semibold">
                  <tr>
                    <td className="py-2" colSpan={2}>Net à payer</td>
                    <td className="text-right">{gnf(simulation.netAvantGnf)}</td>
                    <td className="text-right">{gnf(simulation.netApresGnf)}</td>
                    <td className="text-right">{gnf(String(BigInt(simulation.netApresGnf) - BigInt(simulation.netAvantGnf)))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Saisie adaptée au type déclaré par le catalogue (L0.2). */
function SaisieValeur({ regle, valeur, onChange }: { regle: Regle; valeur: string; onChange: (v: string) => void }) {
  if (regle.type === "ENUM") {
    return (
      <Select value={valeur} onChange={(e) => onChange(e.target.value)}>
        {(regle.options?.choix ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
      </Select>
    );
  }
  if (regle.type === "BOOLEAN") {
    return (
      <Select value={valeur} onChange={(e) => onChange(e.target.value)}>
        <option value="true">Oui</option>
        <option value="false">Non</option>
      </Select>
    );
  }
  if (regle.type === "NUMBER") {
    return (
      <Input
        type="number"
        value={valeur}
        min={regle.options?.min}
        max={regle.options?.max}
        step="any"
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (regle.type === "MULTI") {
    const choisis = valeur.split(",").map((s) => s.trim()).filter(Boolean);
    return (
      <div className="flex flex-wrap gap-1.5">
        {(regle.options?.valeurs ?? []).map((role) => {
          const actif = choisis.includes(role);
          return (
            <button
              key={role}
              type="button"
              onClick={() => onChange((actif ? choisis.filter((c) => c !== role) : [...choisis, role]).join(","))}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${actif ? "bg-navy text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
            >
              {role}
            </button>
          );
        })}
      </div>
    );
  }
  return <Textarea value={valeur} className="font-mono text-xs" onChange={(e) => onChange(e.target.value)} />;
}

/** Piste d'audit d'une règle, chargée à la demande. */
function Historique({ cle }: { cle: string }) {
  const [ouvert, setOuvert] = useState(false);
  const { data } = useQuery<{ historique: { id: string; ancienne: string | null; nouvelle: string; dateEffet: string; motif: string; saisiPar: string; validePar: string | null; createdAt: string }[] }>({
    queryKey: ["regle-historique", cle],
    queryFn: () => api.get(`/parametrage/regles/${cle}/historique`).then((r) => r.data),
    enabled: ouvert,
  });

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => setOuvert((o) => !o)}>
        <History className="h-4 w-4" /> Historique des changements
      </Button>
      {ouvert && (
        <div className="mt-2 rounded-lg border border-gray-200 bg-white p-3">
          {(data?.historique ?? []).length === 0
            ? <p className="text-sm text-gray-500">Aucun changement enregistré — la valeur par défaut n'a jamais été modifiée.</p>
            : (
              <ul className="space-y-2 text-sm">
                {data!.historique.map((h) => (
                  <li key={h.id} className="border-l-2 border-gray-200 pl-3">
                    <span className="text-gray-500">{h.ancienne ?? "(défaut)"}</span> → <strong>{h.nouvelle}</strong>
                    <span className="text-gray-400"> · effet {jour(h.dateEffet)}</span>
                    <p className="text-xs text-gray-500">
                      Saisi par {h.saisiPar}{h.validePar && `, validé par ${h.validePar}`} le {jour(h.createdAt)} — {h.motif}
                    </p>
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </div>
  );
}
