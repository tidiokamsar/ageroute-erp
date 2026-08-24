/**
 * — Paramétrage métier (sans développement lourd)
 * SLA, seuils, règles calcul, types pièces, délais, droits
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Input, FormField } from "../components/ui/Input";
import { toast } from "../components/ui/Toast";
import { Settings, Save, RefreshCw, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { ReglesFinancieres } from "../components/parametrage/ReglesFinancieres";
import { SignatureNumerique } from "../components/parametrage/SignatureNumerique";
import { Settings2 } from "lucide-react";

interface Param { cle: string; valeur: string; type: string; categorie: string; libelle: string; }

const CATEGORIE_LABELS: Record<string,string> = {
  GENERAL:"Général", SLA:"Délais SLA (jours)", CALCUL:"Règles de calcul", MARCHES:"Marchés",
  GARANTIES:"Garanties", REVISION:"Révision de prix", CONFORMITE:"Conformité entreprise",
  WORKFLOW:"Workflow & Pièces", ALERTES:"Alertes automatiques", NOTIFICATIONS:"Notifications",
  PILOTAGE:"Pilotage (dashboard, BI, risques)", ATTACHEMENTS:"Attachements",
  PORTAIL:"Portail entreprise", RECEPTIONS:"Réceptions / PV", PAIEMENTS:"Paiements",
  DELEGATIONS:"Délégations d'intérim",
};
const CATEGORIE_ICONS: Record<string,string> = {
  GENERAL:"📋", SLA:"⏱", CALCUL:"🧮", MARCHES:"📑", GARANTIES:"🛡", REVISION:"📈",
  CONFORMITE:"✅", WORKFLOW:"⚙️", ALERTES:"🔔", NOTIFICATIONS:"✉️",
  PILOTAGE:"📊", ATTACHEMENTS:"📎", PORTAIL:"🏢", RECEPTIONS:"📝", PAIEMENTS:"💳", DELEGATIONS:"👥",
};
const CAT_ORDER = ["GENERAL","WORKFLOW","SLA","CALCUL","MARCHES","ATTACHEMENTS","PORTAIL","RECEPTIONS","PAIEMENTS","GARANTIES","REVISION","CONFORMITE","PILOTAGE","DELEGATIONS","ALERTES","NOTIFICATIONS"];
function orderedCats(grouped: Record<string, unknown>): string[] {
  return Object.keys(grouped).sort((a, b) => {
    const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}
const CATEGORIES_SAISIE = ["GENERAL","WORKFLOW","SLA","CALCUL","MARCHES","ATTACHEMENTS","PORTAIL","RECEPTIONS","PAIEMENTS","GARANTIES","REVISION","CONFORMITE","PILOTAGE","DELEGATIONS","ALERTES","NOTIFICATIONS"];

export function ParametragePage() {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string,string>>({});
  const [collapsed, setCollapsed] = useState<Record<string,boolean>>({});

  const { data: params, isLoading } = useQuery<Param[]>({
    queryKey: ["parametrage"],
    queryFn: () => api.get("/parametrage").then((r) => r.data),
  });

  const initMut = useMutation({
    mutationFn: () => api.post("/parametrage/init"),
    onSuccess: (res) => { qc.invalidateQueries({queryKey:["parametrage"]}); toast.success((res.data as {message:string}).message); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [onglet, setOnglet] = useState<"parametres" | "regles" | "signature">("parametres");
  const [np, setNp] = useState<Record<string,string>>({ type:"STRING", categorie:"GENERAL" });
  const upsertMut = useMutation({
    mutationFn: (b: object) => api.post("/parametrage/upsert", b),
    onSuccess: () => { qc.invalidateQueries({queryKey:["parametrage"]}); toast.success("Paramètre ajouté"); setShowAdd(false); setNp({ type:"STRING", categorie:"GENERAL" }); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const saveMut = useMutation({
    mutationFn: ({ cle, valeur }: { cle:string; valeur:string }) => api.put(`/parametrage/${cle}`, { valeur }),
    onSuccess: () => { qc.invalidateQueries({queryKey:["parametrage"]}); toast.success("Paramètre mis à jour"); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const saveAll = async () => {
    for (const [cle, valeur] of Object.entries(edits)) {
      await saveMut.mutateAsync({ cle, valeur });
    }
    setEdits({});
    toast.success("Tous les paramètres enregistrés");
  };

  const grouped: Record<string, Param[]> = {};
  for (const p of params ?? []) {
    if (!grouped[p.categorie]) grouped[p.categorie] = [];
    grouped[p.categorie].push(p);
  }

  const toggleSection = (cat: string) => setCollapsed((c) => ({ ...c, [cat]: !c[cat] }));

  return (
    <div className="space-y-4">
      {/* Onglets */}
      <div className="flex gap-0.5 border-b border-gray-200">
        <button
          onClick={() => setOnglet("parametres")}
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${onglet === "parametres" ? "bg-navy text-white" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}>
          <Settings size={14} className="inline mr-1.5" /> Paramètres métier
        </button>
        <button
          onClick={() => setOnglet("regles")}
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${onglet === "regles" ? "bg-navy text-white" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}>
          <Settings2 size={14} className="inline mr-1.5" /> Règles financières (A1-A10)
        </button>
        <button
          onClick={() => setOnglet("signature")}
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${onglet === "signature" ? "bg-navy text-white" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}>
          <Settings2 size={14} className="inline mr-1.5" /> Signature électronique
        </button>
      </div>

      {onglet === "regles" && <ReglesFinancieres />}
      {onglet === "signature" && <SignatureNumerique />}

      {onglet === "parametres" && (
      <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Settings className="h-4 w-4"/> Paramétrage métier</h2>
          <p className="text-xs text-gray-400 mt-0.5">Configurable sans développement : SLA, calculs, alertes, workflow</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => initMut.mutate()} disabled={initMut.isPending} title="Créer les paramètres du catalogue encore absents">
            <RefreshCw className={`h-4 w-4 ${initMut.isPending?"animate-spin":""}`}/>
            Initialiser les manquants
          </Button>
          <Button variant="secondary" onClick={() => setShowAdd((s)=>!s)}>
            <Plus className="h-4 w-4"/> Ajouter un paramètre
          </Button>
          {Object.keys(edits).length > 0 && (
            <Button onClick={saveAll} disabled={saveMut.isPending}>
              <Save className="h-4 w-4"/> Enregistrer les modifications ({Object.keys(edits).length})
            </Button>
          )}
        </div>
      </div>

      {showAdd && (
        <div className="bg-white rounded-xl border border-navy/20 p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <FormField label="Clé *"><Input value={np.cle ?? ""} onChange={(e)=>setNp({...np, cle:e.target.value.toUpperCase().replace(/\s/g,"_")})} placeholder="EX_MON_PARAM"/></FormField>
          <FormField label="Libellé *"><Input value={np.libelle ?? ""} onChange={(e)=>setNp({...np, libelle:e.target.value})} placeholder="Description lisible"/></FormField>
          <FormField label="Catégorie">
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={np.categorie} onChange={(e)=>setNp({...np, categorie:e.target.value})}>
              {CATEGORIES_SAISIE.map((k)=><option key={k} value={k}>{CATEGORIE_LABELS[k] ?? k}</option>)}
            </select>
          </FormField>
          <FormField label="Type">
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={np.type} onChange={(e)=>setNp({...np, type:e.target.value})}>
              {["STRING","NUMBER","BOOLEAN","JSON"].map((t)=><option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>
          <FormField label="Valeur *"><Input value={np.valeur ?? ""} onChange={(e)=>setNp({...np, valeur:e.target.value})}/></FormField>
          <div className="flex items-end">
            <Button className="w-full" onClick={()=>upsertMut.mutate(np)} disabled={upsertMut.isPending || !np.cle || !np.libelle || np.valeur===undefined}>
              <Plus className="h-4 w-4"/> Créer
            </Button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({length:4}).map((_,i)=><div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse"/>)}
        </div>
      )}

      {orderedCats(grouped).map((cat) => {
        const label = CATEGORIE_LABELS[cat] ?? cat;
        const items = grouped[cat] ?? [];
        if (items.length === 0) return null;
        const isOpen = !collapsed[cat];
        return (
          <div key={cat} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => toggleSection(cat)}>
              <span>{CATEGORIE_ICONS[cat]} {label}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-normal">{items.length} paramètre(s)</span>
                {isOpen ? <ChevronDown className="h-4 w-4"/> : <ChevronRight className="h-4 w-4"/>}
              </div>
            </button>
            {isOpen && (
              <div className="divide-y divide-gray-50">
                {items.map((p) => {
                  const currentValue = edits[p.cle] ?? p.valeur;
                  const isModified = edits[p.cle] !== undefined && edits[p.cle] !== p.valeur;
                  return (
                    <div key={p.cle} className={`px-5 py-3 flex items-center justify-between gap-4 ${isModified ? "bg-yellow-50" : ""}`}>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-700">{p.libelle}</p>
                        <p className="text-xs text-gray-400 font-mono">{p.cle}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {p.type === "BOOLEAN" ? (
                          <select
                            className="text-sm border border-gray-200 rounded px-2 py-1"
                            value={currentValue}
                            onChange={(e) => setEdits({ ...edits, [p.cle]: e.target.value })}>
                            <option value="true">Activé</option>
                            <option value="false">Désactivé</option>
                          </select>
                        ) : p.type === "JSON" ? (
                          <textarea
                            className="text-xs font-mono border border-gray-200 rounded px-2 py-1 w-64 h-16 resize-none"
                            value={currentValue}
                            onChange={(e) => setEdits({ ...edits, [p.cle]: e.target.value })}/>
                        ) : (
                          <Input
                            type={p.type === "NUMBER" ? "number" : "text"}
                            className="w-24 text-center"
                            value={currentValue}
                            onChange={(e) => setEdits({ ...edits, [p.cle]: e.target.value })}/>
                        )}
                        {isModified && (
                          <Button size="sm" onClick={() => saveMut.mutate({ cle:p.cle, valeur:currentValue })} disabled={saveMut.isPending}>
                            <Save className="h-3.5 w-3.5"/>
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {params && params.length === 0 && !isLoading && (
        <div className="text-center py-12 text-gray-400">
          <Settings className="h-10 w-10 mx-auto mb-2 opacity-30"/>
          <p className="text-sm">Aucun paramètre configuré</p>
          <p className="text-xs mt-1">Cliquez sur "Initialiser" pour créer les paramètres par défaut</p>
        </div>
      )}
      </div>
      )}
    </div>
  );
}
