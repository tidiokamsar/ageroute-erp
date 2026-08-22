import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError, fmtGnf } from "../lib/api";
import { useAuth, canWrite } from "../lib/auth";
import { Button } from "../components/ui/Button";
import { Input, Select, FormField, Textarea } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { toast } from "../components/ui/Toast";
import { ExportButton } from "../components/ui/ExportButton";
import { Plus, Search, Banknote, CheckCircle2, Clock, XCircle, ChevronRight } from "lucide-react";

type Paiement = {
  id: string; decompteId: string; montantGnf: string; statut: string;
  reference?: string; banque?: string; typeCircuit?: string;
  dateOrdre?: string; dateExecution?: string; observations?: string;
  createdAt: string;
  decompte?: { reference: string; statut: string; marche?: { reference: string } };
};

const STATUTS = [
  ["EN_ATTENTE", "En attente"], ["ORDONNE", "Ordonné"], ["EXECUTE", "Exécuté"], ["REJETE", "Rejeté"],
];

const CIRCUITS = [["FER", "FER/AGT"], ["BAILLEUR", "Bailleur/UGP"], ["BUDGET", "Budget National"]];

function statutBadge(s: string) {
  switch (s) {
    case "EXECUTE": return "bg-green-100 text-green-700";
    case "ORDONNE": return "bg-blue-100 text-blue-700";
    case "REJETE": return "bg-red-100 text-red-600";
    default: return "bg-amber-100 text-amber-700";
  }
}

function StatutIcon({ s }: { s: string }) {
  if (s === "EXECUTE") return <CheckCircle2 size={14} className="text-green-500" />;
  if (s === "REJETE") return <XCircle size={14} className="text-red-500" />;
  return <Clock size={14} className="text-amber-500" />;
}

export function PaiementsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const write = canWrite(user?.role) || user?.role === "DAF";

  const [search, setSearch] = useState("");
  const [statutFilter, setStatutFilter] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ typeCircuit: "FER" });
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["paiements", search, statutFilter],
    queryFn: () => api.get("/paiements", { params: { statut: statutFilter || undefined, page: 1 } }).then(r => r.data),
  });

  const { data: disponibles } = useQuery({
    queryKey: ["paiements-disponibles"],
    queryFn: () => api.get("/paiements/disponibles").then(r => r.data),
    enabled: modal,
  });

  const updateStatutMut = useMutation({
    mutationFn: ({ id, ...body }: { id: string; statut: string; refDntcp?: string; refBcrg?: string; dateExecution?: string; observations?: string }) =>
      api.put(`/paiements/${id}/statut`, body).then(r => r.data),
    onSuccess: () => { toast.success("Statut mis à jour"); qc.invalidateQueries({ queryKey: ["paiements"] }); setDetailId(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const [actionModal, setActionModal] = useState<{ paiement: Paiement; action: string } | null>(null);

  const paiements: Paiement[] = Array.isArray(data) ? data : (data?.data ?? []);
  const total: number = data?.total ?? paiements.length;

  const { data: detail } = useQuery({
    queryKey: ["paiement-detail", detailId],
    queryFn: () => api.get(`/paiements/decompte/${detailId}`).then(r => r.data),
    enabled: !!detailId,
  });

  const createMut = useMutation({
    mutationFn: (b: Record<string, unknown>) => api.post("/paiements", b).then(r => r.data),
    onSuccess: () => {
      toast.success("Paiement enregistré");
      qc.invalidateQueries({ queryKey: ["paiements"] });
      setModal(false);
      setForm({ typeCircuit: "FER" });
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const filtered = search
    ? paiements.filter(p =>
        p.reference?.toLowerCase().includes(search.toLowerCase()) ||
        p.decompte?.reference?.toLowerCase().includes(search.toLowerCase()) ||
        p.banque?.toLowerCase().includes(search.toLowerCase())
      )
    : paiements;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Gestion des Paiements</h1>
          <p className="text-sm text-gray-400">Ordres de virement, circuits FER / Bailleur / Budget National</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton endpoint="/export/paiements" filename="paiements" />
          {write && (
            <Button onClick={() => setModal(true)} className="bg-navy text-white flex items-center gap-1.5">
              <Plus size={16} /> Nouveau paiement
            </Button>
          )}
        </div>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-4 gap-3">
        {[
          ["EN_ATTENTE", "En attente", "bg-amber-50 text-amber-700"],
          ["ORDONNE", "Ordonnés", "bg-blue-50 text-blue-700"],
          ["EXECUTE", "Exécutés", "bg-green-50 text-green-700"],
          ["REJETE", "Rejetés", "bg-red-50 text-red-600"],
        ].map(([s, l, cls]) => (
          <button key={s} onClick={() => setStatutFilter(statutFilter === s ? "" : s)}
            className={`rounded-xl p-3 text-left border transition ${statutFilter === s ? "ring-2 ring-navy/30" : "border-gray-100 bg-white hover:bg-gray-50"}`}>
            <p className="text-xs text-gray-400">{l}</p>
            <p className={`text-xl font-bold mt-0.5 ${cls.split(" ")[1]}`}>
              {paiements.filter(p => p.statut === s).length}
            </p>
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Référence, décompte, banque..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy/30" />
        </div>
        <select value={statutFilter} onChange={e => setStatutFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5">
          <option value="">Tous statuts</option>
          {STATUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <p className="text-sm text-gray-400 self-center ml-2">{total} paiement(s)</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2.5">Référence</th>
              <th className="text-left px-4 py-2.5">Décompte</th>
              <th className="text-left px-4 py-2.5">Circuit</th>
              <th className="text-left px-4 py-2.5">Banque</th>
              <th className="text-right px-4 py-2.5">Montant GNF</th>
              <th className="text-left px-4 py-2.5">Date ordre</th>
              <th className="text-left px-4 py-2.5">Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="text-center py-10 text-gray-400">Chargement...</td></tr>}
            {!isLoading && !filtered.length && (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">
                <Banknote size={32} className="mx-auto mb-2 opacity-30" />
                Aucun paiement enregistré
              </td></tr>
            )}
            {filtered.map(p => (
              <tr key={p.id} onClick={() => setDetailId(p.decompteId)}
                className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer">
                <td className="px-4 py-2.5 font-semibold text-navy">{p.reference ?? "—"}</td>
                <td className="px-4 py-2.5 text-gray-600">{p.decompte?.reference ?? p.decompteId.slice(0, 8) + "..."}</td>
                <td className="px-4 py-2.5">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{p.typeCircuit ?? "—"}</span>
                </td>
                <td className="px-4 py-2.5 text-gray-500">{p.banque ?? "—"}</td>
                <td className="px-4 py-2.5 text-right font-semibold">{fmtGnf(p.montantGnf)}</td>
                <td className="px-4 py-2.5 text-gray-400 text-xs">
                  {p.dateOrdre ? new Date(p.dateOrdre).toLocaleDateString("fr-FR") : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${statutBadge(p.statut)}`}>
                    <StatutIcon s={p.statut} />
                    {STATUTS.find(x => x[0] === p.statut)?.[1] ?? p.statut}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {write && p.statut === "EN_ATTENTE" && (
                    <div className="flex gap-1 justify-end">
                      <button onClick={(e) => { e.stopPropagation(); setActionModal({ paiement: p, action: "ORDONNE" }); }}
                        className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100">Ordonner</button>
                      <button onClick={(e) => { e.stopPropagation(); setActionModal({ paiement: p, action: "REJETE" }); }}
                        className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100">Rejeter</button>
                    </div>
                  )}
                  {write && p.statut === "ORDONNE" && (
                    <button onClick={(e) => { e.stopPropagation(); setActionModal({ paiement: p, action: "EXECUTE" }); }}
                      className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded hover:bg-green-100">Marquer exécuté</button>
                  )}
                  {!write && <ChevronRight size={16} className="text-gray-300" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal nouveau paiement */}
      <Modal open={modal} onClose={() => setModal(false)} title="Enregistrer un paiement" size="md">
        <div className="space-y-3">
          <FormField label="Décompte (VALIDE DG) *">
            <Select value={form.decompteId ?? ""} onChange={e => {
              const dec = (disponibles ?? []).find((d: {id:string;netAPayer?:string;financement?:string}) => d.id === e.target.value);
              setForm(f => ({ ...f, decompteId: e.target.value,
                montantGnf: dec?.netAPayer ?? f.montantGnf,
                typeCircuit: dec?.financement === "FER" ? "FER" : dec?.financement === "BAILLEUR" ? "BAILLEUR" : "BUDGET",
              }));
            }}>
              <option value="">— Sélectionner —</option>
              {(disponibles ?? []).map((d: {id:string;reference:string;entreprise?:string;netAPayer?:string}) => (
                <option key={d.id} value={d.id}>{d.reference} — {d.entreprise} ({d.netAPayer ? fmtGnf(d.netAPayer) : "?"})</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Montant (GNF) *">
            <Input type="number" value={form.montantGnf ?? ""} onChange={e => setForm(f => ({ ...f, montantGnf: e.target.value }))} />
          </FormField>
          <FormField label="Circuit *">
            <Select value={form.typeCircuit} onChange={e => setForm(f => ({ ...f, typeCircuit: e.target.value }))}>
              {CIRCUITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Référence virement">
              <Input value={form.reference ?? ""} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
                placeholder="VIR/SGG/2026/..." />
            </FormField>
            <FormField label="Banque">
              <Input value={form.banque ?? ""} onChange={e => setForm(f => ({ ...f, banque: e.target.value }))}
                placeholder="BCRG, UBA..." />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date d'ordre">
              <Input type="date" value={form.dateOrdre ?? ""} onChange={e => setForm(f => ({ ...f, dateOrdre: e.target.value }))} />
            </FormField>
            <FormField label="Date d'exécution">
              <Input type="date" value={form.dateExecution ?? ""} onChange={e => setForm(f => ({ ...f, dateExecution: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Réf. DNTCP">
            <Input value={form.refDntcp ?? ""} onChange={e => setForm(f => ({ ...f, refDntcp: e.target.value }))} />
          </FormField>
          <FormField label="Observations">
            <Textarea value={form.observations ?? ""} onChange={e => setForm(f => ({ ...f, observations: e.target.value }))} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModal(false)}>Annuler</Button>
            <Button className="bg-navy text-white" disabled={!form.decompteId || !form.montantGnf || createMut.isPending}
              onClick={() => createMut.mutate({ ...form, montantGnf: form.montantGnf })}>
              Enregistrer
            </Button>
          </div>
        </div>
      </Modal>
      {/* Modal action paiement */}
      {actionModal && (
        <Modal open={!!actionModal} onClose={() => setActionModal(null)} title={
          actionModal.action === "EXECUTE" ? "Confirmer l'exécution du paiement" :
          actionModal.action === "ORDONNE" ? "Ordonner le paiement" : "Rejeter le paiement"
        } size="sm">
          <div className="space-y-3">
            <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
              <p><strong>Décompte:</strong> {actionModal.paiement.decompte?.reference}</p>
              <p><strong>Montant:</strong> {fmtGnf(actionModal.paiement.montantGnf)}</p>
            </div>
            {actionModal.action === "ORDONNE" && (
              <FormField label="N° Référence ordonnancement">
                <Input value={form.reference ?? ""} onChange={e => setForm(f => ({...f, reference: e.target.value}))} placeholder="ORD/DAF/2026/..." />
              </FormField>
            )}
            {actionModal.action === "EXECUTE" && (
              <>
                <FormField label="Date d'exécution">
                  <Input type="date" value={form.dateExecution ?? new Date().toISOString().slice(0,10)} onChange={e => setForm(f => ({...f, dateExecution: e.target.value}))} />
                </FormField>
                <FormField label="Réf. BCRG/virement"><Input value={form.refBcrg ?? ""} onChange={e => setForm(f => ({...f, refBcrg: e.target.value}))} /></FormField>
                <FormField label="Réf. DNTCP"><Input value={form.refDntcp ?? ""} onChange={e => setForm(f => ({...f, refDntcp: e.target.value}))} /></FormField>
              </>
            )}
            <FormField label="Observations">
              <Textarea value={form.observations ?? ""} onChange={e => setForm(f => ({...f, observations: e.target.value}))} rows={2} />
            </FormField>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setActionModal(null)}>Annuler</Button>
              <Button
                onClick={() => updateStatutMut.mutate({ id: actionModal.paiement.id, statut: actionModal.action, ...form })}
                disabled={updateStatutMut.isPending}
                className={actionModal.action === "REJETE" ? "bg-red-600 text-white" : "bg-navy text-white"}>
                {updateStatutMut.isPending ? "En cours..." : "Confirmer"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}