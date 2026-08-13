/**
 * Référentiel Gestion des Financements
 * Sources → Enveloppes → Affectations (projet/marché/décompte) → Consommations → Documents → Audit
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError, fmtGnf } from "../lib/api";
import { useAuth, canWrite } from "../lib/auth";
import { Button } from "../components/ui/Button";
import { Input, Select, FormField, Textarea } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { toast } from "../components/ui/Toast";
import {
  Plus, Search, Landmark, FileText, Banknote, ClipboardList,
  Activity, ChevronRight, AlertTriangle, CheckCircle2, History,
} from "lucide-react";

type FundingSource = {
  id: string; sourceCode: string; sourceType: string; nom: string;
  donorName?: string | null; currencyCode: string; statut: string;
  totalAmount?: string; allocatedAmount?: string; consumedAmount?: string; availableAmount?: string;
  _count?: { envelopes: number; documents: number };
};

const SOURCE_TYPES = [
  ["ETAT", "État"], ["BAILLEUR", "Bailleur"], ["BANQUE", "Banque"],
  ["FONDS_INTERNE", "Fonds interne"], ["CONTREPARTIE", "Contrepartie"], ["DON", "Don"],
];

const STATUTS = [
  ["draft", "Brouillon"], ["pending_approval", "En attente d'approbation"], ["approved", "Approuvée"],
  ["active", "Active"], ["partially_consumed", "Partiellement consommée"], ["exhausted", "Épuisée"],
  ["suspended", "Suspendue"], ["closed", "Clôturée"], ["archived", "Archivée"],
];

function statutColor(s: string) {
  switch (s) {
    case "active": return "bg-green-100 text-green-700";
    case "partially_consumed": return "bg-blue-100 text-blue-700";
    case "exhausted": return "bg-red-100 text-red-600";
    case "suspended": return "bg-amber-100 text-amber-700";
    case "closed": case "archived": return "bg-gray-100 text-gray-500";
    case "approved": return "bg-teal-100 text-teal-700";
    case "pending_approval": return "bg-orange-100 text-orange-700";
    default: return "bg-gray-100 text-gray-500";
  }
}

type DetailTab = "resume" | "enveloppes" | "documents" | "historique";

export function FinancementsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statutFilter, setStatutFilter] = useState("");
  const [modal, setModal] = useState<"new" | null>(null);
  const [form, setForm] = useState<Record<string, string>>({ currencyCode: "GNF" });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("resume");

  const [envModal, setEnvModal] = useState(false);
  const [envForm, setEnvForm] = useState<Record<string, string>>({});

  const [envelopeDetailId, setEnvelopeDetailId] = useState<string | null>(null);
  const [allocModal, setAllocModal] = useState(false);
  const [allocForm, setAllocForm] = useState<Record<string, string>>({});

  const [consumeAllocId, setConsumeAllocId] = useState<string | null>(null);
  const [consumeForm, setConsumeForm] = useState<Record<string, string>>({ consumptionType: "PAIEMENT", entityType: "DECOMPTE" });

  const [docModal, setDocModal] = useState(false);
  const [docForm, setDocForm] = useState<Record<string, string>>({ documentType: "CONVENTION" });

  const writeAllowed = canWrite(user?.role) || user?.role === "DG" || user?.role === "DAF";

  // ─── Liste ──────────────────────────────────────────────────────────────
  const { data: sources, isLoading } = useQuery({
    queryKey: ["fundings", search, statutFilter],
    queryFn: () => api.get("/fundings", { params: { search: search || undefined, statut: statutFilter || undefined } }).then(r => r.data as FundingSource[]),
  });

  const { data: alerts } = useQuery({
    queryKey: ["funding-alerts"],
    queryFn: () => api.get("/fundings/alerts/expiring-documents").then(r => r.data),
  });

  // ─── Détail source ──────────────────────────────────────────────────────
  const { data: detail } = useQuery({
    queryKey: ["funding-detail", detailId],
    queryFn: () => api.get(`/fundings/${detailId}`).then(r => r.data),
    enabled: !!detailId,
  });

  const { data: auditTrail } = useQuery({
    queryKey: ["funding-audit", detailId],
    queryFn: () => api.get(`/fundings/${detailId}/audit-trail`).then(r => r.data),
    enabled: !!detailId && detailTab === "historique",
  });

  // ─── Détail enveloppe ───────────────────────────────────────────────────
  const { data: envelopeDetail } = useQuery({
    queryKey: ["envelope-detail", envelopeDetailId],
    queryFn: () => api.get(`/funding-envelopes/${envelopeDetailId}`).then(r => r.data),
    enabled: !!envelopeDetailId,
  });

  // ─── Mutations ──────────────────────────────────────────────────────────
  const createSource = useMutation({
    mutationFn: (body: Record<string, string>) => api.post("/fundings", body).then(r => r.data),
    onSuccess: () => {
      toast.success("Source de financement créée");
      qc.invalidateQueries({ queryKey: ["fundings"] });
      setModal(null);
      setForm({ currencyCode: "GNF" });
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const createEnvelope = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`/fundings/${detailId}/envelopes`, body).then(r => r.data),
    onSuccess: () => {
      toast.success("Enveloppe créée");
      qc.invalidateQueries({ queryKey: ["funding-detail", detailId] });
      qc.invalidateQueries({ queryKey: ["fundings"] });
      setEnvModal(false);
      setEnvForm({});
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const createAllocation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`/funding-envelopes/${envelopeDetailId}/allocations`, body).then(r => r.data),
    onSuccess: () => {
      toast.success("Affectation créée");
      qc.invalidateQueries({ queryKey: ["envelope-detail", envelopeDetailId] });
      qc.invalidateQueries({ queryKey: ["funding-detail", detailId] });
      setAllocModal(false);
      setAllocForm({});
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const recordConsumption = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`/funding-allocations/${consumeAllocId}/consume`, body).then(r => r.data),
    onSuccess: () => {
      toast.success("Consommation enregistrée");
      qc.invalidateQueries({ queryKey: ["envelope-detail", envelopeDetailId] });
      qc.invalidateQueries({ queryKey: ["funding-detail", detailId] });
      setConsumeAllocId(null);
      setConsumeForm({ consumptionType: "PAIEMENT", entityType: "DECOMPTE" });
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const addDocument = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`/fundings/${detailId}/documents`, body).then(r => r.data),
    onSuccess: () => {
      toast.success("Document ajouté");
      qc.invalidateQueries({ queryKey: ["funding-detail", detailId] });
      setDocModal(false);
      setDocForm({ documentType: "CONVENTION" });
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const changeStatut = useMutation({
    mutationFn: (body: { statut: string; commentaire?: string }) => api.patch(`/fundings/${detailId}`, body).then(r => r.data),
    onSuccess: () => {
      toast.success("Statut mis à jour");
      qc.invalidateQueries({ queryKey: ["funding-detail", detailId] });
      qc.invalidateQueries({ queryKey: ["fundings"] });
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Gestion des Financements</h1>
          <p className="text-sm text-gray-400">Sources, enveloppes, affectations et consommation budgétaire multi-bailleurs</p>
        </div>
        {writeAllowed && (
          <Button onClick={() => setModal("new")} className="bg-navy text-white flex items-center gap-1.5">
            <Plus size={16} /> Nouvelle source
          </Button>
        )}
      </div>

      {!!(alerts ?? []).length && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">{alerts.length} document(s) de financement arrivant à échéance ou expiré(s)</p>
            <p className="text-xs text-amber-600 mt-0.5">
              {alerts.slice(0, 3).map((d: any) => `${d.fundingSource?.sourceCode} (${d.documentType})`).join(" · ")}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une source..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy/30" />
        </div>
        <select value={statutFilter} onChange={e => setStatutFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-navy/30">
          <option value="">Tous statuts</option>
          {STATUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2.5">Code</th>
              <th className="text-left px-4 py-2.5">Source</th>
              <th className="text-left px-4 py-2.5">Type</th>
              <th className="text-right px-4 py-2.5">Total</th>
              <th className="text-right px-4 py-2.5">Affecté</th>
              <th className="text-right px-4 py-2.5">Consommé</th>
              <th className="text-right px-4 py-2.5">Disponible</th>
              <th className="text-left px-4 py-2.5">Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={9} className="text-center py-8 text-gray-400">Chargement...</td></tr>}
            {!isLoading && !(sources ?? []).length && <tr><td colSpan={9} className="text-center py-8 text-gray-400">Aucune source de financement</td></tr>}
            {(sources ?? []).map(s => (
              <tr key={s.id} onClick={() => { setDetailId(s.id); setDetailTab("resume"); }}
                className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer">
                <td className="px-4 py-2.5 font-semibold text-navy">{s.sourceCode}</td>
                <td className="px-4 py-2.5">
                  <div>{s.nom}</div>
                  {s.donorName && <div className="text-xs text-gray-400">{s.donorName}</div>}
                </td>
                <td className="px-4 py-2.5 text-gray-500">{SOURCE_TYPES.find(t => t[0] === s.sourceType)?.[1] ?? s.sourceType}</td>
                <td className="px-4 py-2.5 text-right">{fmtGnf(s.totalAmount)}</td>
                <td className="px-4 py-2.5 text-right">{fmtGnf(s.allocatedAmount)}</td>
                <td className="px-4 py-2.5 text-right">{fmtGnf(s.consumedAmount)}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-green-600">{fmtGnf(s.availableAmount)}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statutColor(s.statut)}`}>
                    {STATUTS.find(x => x[0] === s.statut)?.[1] ?? s.statut}
                  </span>
                </td>
                <td className="px-4 py-2.5"><ChevronRight size={16} className="text-gray-300" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ════ MODAL NOUVELLE SOURCE ════ */}
      <Modal open={modal === "new"} onClose={() => setModal(null)} title="Nouvelle source de financement" size="md">
        <div className="space-y-3">
          <FormField label="Code source *">
            <Input value={form.sourceCode ?? ""} onChange={e => setForm(f => ({ ...f, sourceCode: e.target.value }))} placeholder="FIN-2026-001" />
          </FormField>
          <FormField label="Type *">
            <Select value={form.sourceType ?? ""} onChange={e => setForm(f => ({ ...f, sourceType: e.target.value }))}>
              <option value="">— Choisir —</option>
              {SOURCE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </FormField>
          <FormField label="Nom *">
            <Input value={form.nom ?? ""} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Banque Mondiale — Projet PACV3" />
          </FormField>
          <FormField label="Bailleur / Donateur">
            <Input value={form.donorName ?? ""} onChange={e => setForm(f => ({ ...f, donorName: e.target.value }))} />
          </FormField>
          <FormField label="Devise">
            <Input value={form.currencyCode ?? "GNF"} onChange={e => setForm(f => ({ ...f, currencyCode: e.target.value }))} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Annuler</Button>
            <Button className="bg-navy text-white" disabled={!form.sourceCode || !form.sourceType || !form.nom || createSource.isPending}
              onClick={() => createSource.mutate(form)}>Créer</Button>
          </div>
        </div>
      </Modal>

      {/* ════ MODAL DÉTAIL SOURCE ════ */}
      <Modal open={!!detailId} onClose={() => setDetailId(null)} title={detail ? `${detail.sourceCode} — ${detail.nom}` : "Chargement..."} size="xl">
        {detail && (
          <div className="space-y-4">
            <div className="flex gap-1 border-b border-gray-100">
              {[
                ["resume", "Résumé", Landmark],
                ["enveloppes", "Enveloppes", Banknote],
                ["documents", "Documents", FileText],
                ["historique", "Historique & Audit", History],
              ].map(([key, label, Icon]: any) => (
                <button key={key} onClick={() => setDetailTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition ${
                    detailTab === key ? "border-navy text-navy font-semibold" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            {detailTab === "resume" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-400">Type</p><p className="font-semibold">{SOURCE_TYPES.find(t => t[0] === detail.sourceType)?.[1]}</p></div>
                  <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-400">Bailleur</p><p className="font-semibold">{detail.donorName ?? "—"}</p></div>
                  <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-400">Devise</p><p className="font-semibold">{detail.currencyCode}</p></div>
                  <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-400">Enveloppes</p><p className="font-semibold">{detail.envelopes?.length ?? 0}</p></div>
                </div>
                {writeAllowed && (
                  <div className="bg-navy/5 rounded-xl p-4">
                    <p className="text-xs font-bold text-navy mb-2">Changer le statut</p>
                    <div className="flex gap-2">
                      <select id="newstatut" defaultValue={detail.statut} className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5">
                        {STATUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <Button size="sm" className="bg-navy text-white" onClick={() => {
                        const sel = document.getElementById("newstatut") as HTMLSelectElement;
                        changeStatut.mutate({ statut: sel.value, commentaire: "Changement manuel" });
                      }}>Appliquer</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {detailTab === "enveloppes" && (
              <div className="space-y-3">
                {writeAllowed && (
                  <Button size="sm" className="bg-navy text-white flex items-center gap-1.5" onClick={() => setEnvModal(true)}>
                    <Plus size={14} /> Nouvelle enveloppe
                  </Button>
                )}
                {!(detail.envelopes ?? []).length && <p className="text-sm text-gray-400 py-6 text-center">Aucune enveloppe</p>}
                {(detail.envelopes ?? []).map((e: any) => (
                  <div key={e.id} onClick={() => setEnvelopeDetailId(e.id)}
                    className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{e.envelopeCode} — {e.label}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statutColor(e.statut)}`}>
                        {STATUTS.find(x => x[0] === e.statut)?.[1] ?? e.statut}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-2 text-xs text-gray-500">
                      <span>Total: <b>{fmtGnf(e.totalAmount)}</b></span>
                      <span>Affecté: <b>{fmtGnf(e.allocatedAmount)}</b></span>
                      <span>Consommé: <b>{fmtGnf(e.consumedAmount)}</b></span>
                      <span className="text-green-600">Disponible: <b>{fmtGnf(e.availableAmount)}</b></span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {detailTab === "documents" && (
              <div className="space-y-3">
                {writeAllowed && (
                  <Button size="sm" className="bg-navy text-white flex items-center gap-1.5" onClick={() => setDocModal(true)}>
                    <Plus size={14} /> Ajouter document
                  </Button>
                )}
                {!(detail.documents ?? []).length && <p className="text-sm text-gray-400 py-6 text-center">Aucun document</p>}
                {(detail.documents ?? []).map((d: any) => (
                  <div key={d.id} className="border border-gray-100 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-sm">{d.documentType}</span>
                      {d.documentNumber && <span className="text-xs text-gray-400 ml-2">N° {d.documentNumber}</span>}
                      {d.expiryDate && <p className="text-xs text-gray-400 mt-0.5">Expire le {new Date(d.expiryDate).toLocaleDateString("fr-FR")}</p>}
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      d.validationStatus === "valid" ? "bg-green-100 text-green-700" :
                      d.validationStatus === "expired" || d.validationStatus === "rejected" ? "bg-red-100 text-red-600" :
                      "bg-gray-100 text-gray-500"}`}>{d.validationStatus}</span>
                  </div>
                ))}
              </div>
            )}

            {detailTab === "historique" && (
              <div className="space-y-1.5">
                {!(auditTrail ?? []).length && <p className="text-sm text-gray-400 py-6 text-center">Aucun événement</p>}
                {(auditTrail ?? []).map((ev: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs py-1.5 border-b border-gray-50">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                      ev.type === "STATUT" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>{ev.type}</span>
                    <span className="text-gray-700">{ev.desc}</span>
                    <span className="text-gray-300 shrink-0 ml-auto">{new Date(ev.date).toLocaleDateString("fr-FR")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ════ MODAL NOUVELLE ENVELOPPE ════ */}
      <Modal open={envModal} onClose={() => setEnvModal(false)} title="Nouvelle enveloppe budgétaire" size="md">
        <div className="space-y-3">
          <FormField label="Code enveloppe *">
            <Input value={envForm.envelopeCode ?? ""} onChange={e => setEnvForm(f => ({ ...f, envelopeCode: e.target.value }))} placeholder="ENV-2026-001" />
          </FormField>
          <FormField label="Libellé *">
            <Input value={envForm.label ?? ""} onChange={e => setEnvForm(f => ({ ...f, label: e.target.value }))} />
          </FormField>
          <FormField label="Montant total (GNF) *">
            <Input type="number" value={envForm.totalAmount ?? ""} onChange={e => setEnvForm(f => ({ ...f, totalAmount: e.target.value }))} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date début">
              <Input type="date" value={envForm.startDate ?? ""} onChange={e => setEnvForm(f => ({ ...f, startDate: e.target.value }))} />
            </FormField>
            <FormField label="Date fin">
              <Input type="date" value={envForm.endDate ?? ""} onChange={e => setEnvForm(f => ({ ...f, endDate: e.target.value }))} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEnvModal(false)}>Annuler</Button>
            <Button className="bg-navy text-white" disabled={!envForm.envelopeCode || !envForm.label || !envForm.totalAmount || createEnvelope.isPending}
              onClick={() => createEnvelope.mutate({ ...envForm, totalAmount: Number(envForm.totalAmount) })}>Créer</Button>
          </div>
        </div>
      </Modal>

      {/* ════ MODAL DÉTAIL ENVELOPPE ════ */}
      <Modal open={!!envelopeDetailId} onClose={() => setEnvelopeDetailId(null)}
        title={envelopeDetail ? `${envelopeDetail.envelopeCode} — ${envelopeDetail.label}` : "Chargement..."} size="lg">
        {envelopeDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="bg-gray-50 rounded-lg p-2.5"><p className="text-gray-400">Total</p><p className="font-bold">{fmtGnf(envelopeDetail.totalAmount)}</p></div>
              <div className="bg-gray-50 rounded-lg p-2.5"><p className="text-gray-400">Affecté</p><p className="font-bold">{fmtGnf(envelopeDetail.allocatedAmount)}</p></div>
              <div className="bg-gray-50 rounded-lg p-2.5"><p className="text-gray-400">Consommé</p><p className="font-bold">{fmtGnf(envelopeDetail.consumedAmount)}</p></div>
              <div className="bg-green-50 rounded-lg p-2.5"><p className="text-green-600">Disponible</p><p className="font-bold text-green-700">{fmtGnf(envelopeDetail.availableAmount)}</p></div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-500 uppercase">Affectations</p>
              {writeAllowed && (
                <Button size="sm" className="bg-navy text-white flex items-center gap-1.5" onClick={() => setAllocModal(true)}>
                  <Plus size={14} /> Nouvelle affectation
                </Button>
              )}
            </div>

            {!(envelopeDetail.allocations ?? []).length && <p className="text-sm text-gray-400 py-6 text-center">Aucune affectation</p>}
            {(envelopeDetail.allocations ?? []).map((a: any) => (
              <div key={a.id} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {a.projet?.code ?? a.marche?.reference ?? a.decompte?.reference ?? "—"}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statutColor(a.statut)}`}>{a.statut}</span>
                </div>
                {a.allocationReason && <p className="text-xs text-gray-400 mt-0.5">{a.allocationReason}</p>}
                <div className="flex gap-3 mt-1.5 text-xs text-gray-500">
                  <span>Affecté: <b>{fmtGnf(a.allocationAmount)}</b></span>
                  <span>Consommé: <b>{fmtGnf(a.consumedAmount)}</b></span>
                  <span className="text-green-600">Reste: <b>{fmtGnf((BigInt(a.allocationAmount) - BigInt(a.consumedAmount)).toString())}</b></span>
                </div>
                {writeAllowed && (
                  <Button size="sm" variant="secondary" className="mt-2" onClick={() => setConsumeAllocId(a.id)}>
                    Enregistrer une consommation
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ════ MODAL NOUVELLE AFFECTATION ════ */}
      <Modal open={allocModal} onClose={() => setAllocModal(false)} title="Nouvelle affectation" size="md">
        <div className="space-y-3">
          <FormField label="Code Projet (UUID)">
            <Input value={allocForm.projetId ?? ""} onChange={e => setAllocForm(f => ({ ...f, projetId: e.target.value }))} placeholder="ID du projet" />
          </FormField>
          <FormField label="Code Marché (UUID)">
            <Input value={allocForm.marcheId ?? ""} onChange={e => setAllocForm(f => ({ ...f, marcheId: e.target.value }))} placeholder="ID du marché" />
          </FormField>
          <FormField label="Montant affecté (GNF) *">
            <Input type="number" value={allocForm.allocationAmount ?? ""} onChange={e => setAllocForm(f => ({ ...f, allocationAmount: e.target.value }))} />
          </FormField>
          <FormField label="Motif">
            <Textarea value={allocForm.allocationReason ?? ""} onChange={e => setAllocForm(f => ({ ...f, allocationReason: e.target.value }))} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAllocModal(false)}>Annuler</Button>
            <Button className="bg-navy text-white" disabled={!allocForm.allocationAmount || createAllocation.isPending}
              onClick={() => createAllocation.mutate({
                ...allocForm,
                allocationAmount: Number(allocForm.allocationAmount),
                projetId: allocForm.projetId || undefined,
                marcheId: allocForm.marcheId || undefined,
              })}>Créer</Button>
          </div>
        </div>
      </Modal>

      {/* ════ MODAL CONSOMMATION ════ */}
      <Modal open={!!consumeAllocId} onClose={() => setConsumeAllocId(null)} title="Enregistrer une consommation" size="md">
        <div className="space-y-3">
          <FormField label="Type d'entité">
            <Select value={consumeForm.entityType} onChange={e => setConsumeForm(f => ({ ...f, entityType: e.target.value }))}>
              <option value="DECOMPTE">Décompte</option>
              <option value="MARCHE">Marché</option>
              <option value="AUTRE">Autre</option>
            </Select>
          </FormField>
          <FormField label="ID entité *">
            <Input value={consumeForm.entityId ?? ""} onChange={e => setConsumeForm(f => ({ ...f, entityId: e.target.value }))} />
          </FormField>
          <FormField label="Type de consommation">
            <Select value={consumeForm.consumptionType} onChange={e => setConsumeForm(f => ({ ...f, consumptionType: e.target.value }))}>
              <option value="ENGAGEMENT">Engagement</option>
              <option value="LIQUIDATION">Liquidation</option>
              <option value="PAIEMENT">Paiement</option>
            </Select>
          </FormField>
          <FormField label="Montant (GNF) *">
            <Input type="number" value={consumeForm.montant ?? ""} onChange={e => setConsumeForm(f => ({ ...f, montant: e.target.value }))} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setConsumeAllocId(null)}>Annuler</Button>
            <Button className="bg-navy text-white" disabled={!consumeForm.entityId || !consumeForm.montant || recordConsumption.isPending}
              onClick={() => recordConsumption.mutate({ ...consumeForm, montant: Number(consumeForm.montant) })}>Enregistrer</Button>
          </div>
        </div>
      </Modal>

      {/* ════ MODAL DOCUMENT ════ */}
      <Modal open={docModal} onClose={() => setDocModal(false)} title="Ajouter un document de financement" size="md">
        <div className="space-y-3">
          <FormField label="Type">
            <Select value={docForm.documentType} onChange={e => setDocForm(f => ({ ...f, documentType: e.target.value }))}>
              <option value="CONVENTION">Convention</option>
              <option value="AVENANT">Avenant</option>
              <option value="RAPPORT">Rapport</option>
              <option value="JUSTIFICATIF">Justificatif</option>
            </Select>
          </FormField>
          <FormField label="Numéro de document">
            <Input value={docForm.documentNumber ?? ""} onChange={e => setDocForm(f => ({ ...f, documentNumber: e.target.value }))} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date d'émission">
              <Input type="date" value={docForm.issueDate ?? ""} onChange={e => setDocForm(f => ({ ...f, issueDate: e.target.value }))} />
            </FormField>
            <FormField label="Date d'expiration">
              <Input type="date" value={docForm.expiryDate ?? ""} onChange={e => setDocForm(f => ({ ...f, expiryDate: e.target.value }))} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setDocModal(false)}>Annuler</Button>
            <Button className="bg-navy text-white" disabled={addDocument.isPending} onClick={() => addDocument.mutate(docForm)}>Ajouter</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
