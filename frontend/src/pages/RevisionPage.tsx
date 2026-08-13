/**
 * Révision de prix (FIDIC) — formules d'indexation par marché + indices mensuels.
 * P = P0 × ( a + Σ bi · Ii,t / Ii,0 )
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError, fmtGnf } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Input, Select, FormField } from "../components/ui/Input";
import { toast } from "../components/ui/Toast";
import { TrendingUp, Plus, Trash2, Calculator, LineChart, Save } from "lucide-react";

interface IndexVal { id: string; code: string; libelle: string; annee: number; mois: number; valeur: number; }
interface Composante { nom: string; coefficient: number; indexCode: string; valeurBase: number; }
interface MarcheRef { id: string; reference: string; intitule: string; }

const MOIS = ["", "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

export function RevisionPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"indices" | "formules">("indices");

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-black text-navy flex items-center gap-2">
          <TrendingUp className="h-5 w-5" /> Révision de prix (FIDIC)
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Indexation contractuelle : indices mensuels et formules par marché.</p>
      </div>

      <div className="flex gap-1 mb-5 border-b border-gray-100">
        {([["indices", "Indices mensuels", LineChart], ["formules", "Formules par marché", Calculator]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === k ? "border-navy text-navy" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "indices" ? <IndicesTab qc={qc} /> : <FormulesTab qc={qc} />}
    </div>
  );
}

// ─── Onglet Indices mensuels ─────────────────────────────────────────────────
function IndicesTab({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const [form, setForm] = useState<Record<string, unknown>>({ annee: new Date().getFullYear(), mois: new Date().getMonth() + 1 });

  const { data: indices } = useQuery({
    queryKey: ["revision-index"],
    queryFn: () => api.get("/revision/index").then((r) => r.data as IndexVal[]),
  });

  const saveMut = useMutation({
    mutationFn: (b: object) => api.post("/revision/index", b).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["revision-index"] }); qc.invalidateQueries({ queryKey: ["revision-index-codes"] }); toast.success("Indice enregistré"); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  return (
    <div className="grid md:grid-cols-3 gap-5">
      <div className="md:col-span-1">
        <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
          <p className="text-sm font-bold text-navy">Saisir un indice</p>
          <FormField label="Code *">
            <Input value={String(form.code ?? "")} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="BITUME, CIMENT, GASOIL..." />
          </FormField>
          <FormField label="Libellé *">
            <Input value={String(form.libelle ?? "")} onChange={(e) => setForm({ ...form, libelle: e.target.value })} placeholder="Prix du bitume" />
          </FormField>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Année *">
              <Input type="number" value={String(form.annee ?? "")} onChange={(e) => setForm({ ...form, annee: parseInt(e.target.value) })} />
            </FormField>
            <FormField label="Mois *">
              <Select value={String(form.mois ?? "")} onChange={(e) => setForm({ ...form, mois: parseInt(e.target.value) })}>
                {MOIS.slice(1).map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </Select>
            </FormField>
          </div>
          <FormField label="Valeur *">
            <Input type="number" step="0.01" value={String(form.valeur ?? "")} onChange={(e) => setForm({ ...form, valeur: parseFloat(e.target.value) })} />
          </FormField>
          <Button className="w-full"
            onClick={() => saveMut.mutate(form)}
            disabled={saveMut.isPending || !form.code || !form.libelle || !form.valeur}>
            <Save className="h-4 w-4" /> Enregistrer
          </Button>
        </div>
      </div>

      <div className="md:col-span-2">
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Code</th>
                <th className="text-left px-3 py-2 font-medium">Libellé</th>
                <th className="text-center px-3 py-2 font-medium">Période</th>
                <th className="text-right px-3 py-2 font-medium">Valeur</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {!(indices ?? []).length && <tr><td colSpan={4} className="text-center py-10 text-gray-400">Aucun indice saisi</td></tr>}
              {(indices ?? []).map((i) => (
                <tr key={i.id} className="hover:bg-gray-50/50">
                  <td className="px-3 py-2 font-mono font-semibold text-navy">{i.code}</td>
                  <td className="px-3 py-2 text-gray-600">{i.libelle}</td>
                  <td className="px-3 py-2 text-center text-gray-500">{MOIS[i.mois]} {i.annee}</td>
                  <td className="px-3 py-2 text-right font-medium">{i.valeur.toLocaleString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Onglet Formules par marché ──────────────────────────────────────────────
function FormulesTab({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const [marcheId, setMarcheId] = useState("");
  const [coeffFixe, setCoeffFixe] = useState(0.15);
  const [comps, setComps] = useState<Composante[]>([]);
  const [calc, setCalc] = useState<{ annee: number; mois: number; montantHt: number }>({ annee: new Date().getFullYear(), mois: new Date().getMonth() + 1, montantHt: 0 });
  const [calcRes, setCalcRes] = useState<any>(null);

  const { data: marchesRaw } = useQuery({
    queryKey: ["marches-ref"],
    queryFn: () => api.get("/marches?pageSize=200").then((r) => r.data),
  });
  const marches: MarcheRef[] = marchesRaw?.data ?? marchesRaw ?? [];

  const { data: codes } = useQuery({
    queryKey: ["revision-index-codes"],
    queryFn: () => api.get("/revision/index/codes").then((r) => r.data as { code: string; libelle: string }[]),
  });

  useQuery({
    queryKey: ["revision-formule", marcheId],
    queryFn: () => api.get(`/revision/marches/${marcheId}/formule`).then((r) => {
      const f = r.data;
      if (f) { setCoeffFixe(f.coeffFixe); setComps(f.composantes ?? []); }
      else { setCoeffFixe(0.15); setComps([]); }
      return f;
    }),
    enabled: !!marcheId,
  });

  const somme = coeffFixe + comps.reduce((s, c) => s + (c.coefficient || 0), 0);
  const coherent = Math.abs(somme - 1) < 0.001;

  const saveMut = useMutation({
    mutationFn: () => api.put(`/revision/marches/${marcheId}/formule`, { coeffFixe, composantes: comps }).then((r) => r.data),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["revision-formule", marcheId] }); toast.success(d.coherent ? "Formule enregistrée" : `Formule enregistrée (somme = ${d.somme}, devrait être 1)`); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const calcMut = useMutation({
    mutationFn: () => api.get(`/revision/marches/${marcheId}/calcul`, { params: calc }).then((r) => r.data),
    onSuccess: (d) => setCalcRes(d),
    onError: (e) => toast.error(parseApiError(e)),
  });

  function addComp() { setComps([...comps, { nom: "", coefficient: 0, indexCode: "", valeurBase: 100 }]); }
  function updateComp(i: number, patch: Partial<Composante>) { setComps(comps.map((c, j) => j === i ? { ...c, ...patch } : c)); }
  function removeComp(i: number) { setComps(comps.filter((_, j) => j !== i)); }

  return (
    <div className="space-y-5">
      <FormField label="Marché">
        <Select value={marcheId} onChange={(e) => { setMarcheId(e.target.value); setCalcRes(null); }}>
          <option value="">Sélectionner un marché...</option>
          {marches.map((m) => <option key={m.id} value={m.id}>{m.reference} — {m.intitule}</option>)}
        </Select>
      </FormField>

      {marcheId && (
        <>
          <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-navy">Formule d'indexation</p>
              <span className={`text-xs px-2 py-0.5 rounded font-bold ${coherent ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                a + Σ bi = {Math.round(somme * 1000) / 1000} {coherent ? "✓" : "(devrait valoir 1)"}
              </span>
            </div>

            <div className="w-40">
              <FormField label="Part fixe (a)">
                <Input type="number" step="0.01" value={String(coeffFixe)} onChange={(e) => setCoeffFixe(parseFloat(e.target.value) || 0)} />
              </FormField>
            </div>

            <div className="space-y-2">
              {comps.map((c, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3"><FormField label={i === 0 ? "Composante" : ""}><Input value={c.nom} onChange={(e) => updateComp(i, { nom: e.target.value })} placeholder="Bitume" /></FormField></div>
                  <div className="col-span-2"><FormField label={i === 0 ? "Poids (bi)" : ""}><Input type="number" step="0.01" value={String(c.coefficient)} onChange={(e) => updateComp(i, { coefficient: parseFloat(e.target.value) || 0 })} /></FormField></div>
                  <div className="col-span-4"><FormField label={i === 0 ? "Indice" : ""}>
                    <Select value={c.indexCode} onChange={(e) => updateComp(i, { indexCode: e.target.value })}>
                      <option value="">Choisir...</option>
                      {(codes ?? []).map((cd) => <option key={cd.code} value={cd.code}>{cd.code} — {cd.libelle}</option>)}
                    </Select>
                  </FormField></div>
                  <div className="col-span-2"><FormField label={i === 0 ? "Valeur base (I0)" : ""}><Input type="number" step="0.01" value={String(c.valeurBase)} onChange={(e) => updateComp(i, { valeurBase: parseFloat(e.target.value) || 0 })} /></FormField></div>
                  <div className="col-span-1"><button onClick={() => removeComp(i)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="h-4 w-4" /></button></div>
                </div>
              ))}
              <Button variant="secondary" onClick={addComp}><Plus className="h-4 w-4" /> Ajouter une composante</Button>
            </div>

            <div className="flex justify-end pt-2 border-t border-gray-100">
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !comps.length}>
                <Save className="h-4 w-4" /> Enregistrer la formule
              </Button>
            </div>
          </div>

          {/* Simulateur */}
          <div className="bg-navy/5 border border-navy/10 rounded-xl p-4 space-y-3">
            <p className="text-sm font-bold text-navy flex items-center gap-2"><Calculator className="h-4 w-4" /> Simuler une révision</p>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Année période"><Input type="number" value={String(calc.annee)} onChange={(e) => setCalc({ ...calc, annee: parseInt(e.target.value) })} /></FormField>
              <FormField label="Mois période">
                <Select value={String(calc.mois)} onChange={(e) => setCalc({ ...calc, mois: parseInt(e.target.value) })}>
                  {MOIS.slice(1).map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </Select>
              </FormField>
              <FormField label="Montant HT période"><Input type="number" value={String(calc.montantHt)} onChange={(e) => setCalc({ ...calc, montantHt: parseFloat(e.target.value) || 0 })} /></FormField>
            </div>
            <Button variant="secondary" onClick={() => calcMut.mutate()} disabled={calcMut.isPending || !calc.montantHt}>Calculer</Button>

            {calcRes && (
              <div className={`rounded-lg p-3 text-sm ${calcRes.applicable ? "bg-white" : "bg-amber-50 text-amber-800"}`}>
                {calcRes.applicable ? (
                  <>
                    <div className="flex justify-between font-bold text-navy">
                      <span>Coefficient de révision</span><span>{calcRes.coefficient}</span>
                    </div>
                    <div className="flex justify-between font-bold text-navy mt-1">
                      <span>Montant de révision</span>
                      <span className={calcRes.revisionMontant >= 0 ? "text-green-700" : "text-red-600"}>{fmtGnf(calcRes.revisionMontant)}</span>
                    </div>
                    <table className="w-full text-xs mt-2 text-gray-500">
                      <tbody>
                        {(calcRes.details ?? []).map((d: any, i: number) => (
                          <tr key={i}><td>{d.nom} ({d.indexCode})</td><td className="text-right">{d.valeurActuelle} / {d.valeurBase} = {d.ratio}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : calcRes.message}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
