/**
 * Gestion des Garanties marchés
 * AVANCE | BONNE_EXECUTION | RETENUE | SOUMISSION | DEFAUT
 * Alertes automatiques expiration 30 jours
 */
import { useState } from "react";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError, fmtGnf } from "../lib/api";
import { useAuth, canWrite } from "../lib/auth";
import { Button } from "../components/ui/Button";
import { Input, Select, FormField } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { toast } from "../components/ui/Toast";
import { Plus, AlertTriangle, CheckCircle, XCircle, Clock, Shield, Bell } from "lucide-react";

interface Garantie {
  id: string; marcheId: string; type: string; montantGnf: string;
  dateEmission?: string; dateExpiration?: string; banque?: string; reference?: string;
  active: boolean; appelGarantie: boolean; dateAppel?: string; observations?: string;
  expireeDans?: number | null; statutExpiration?: string;
  marche?: { reference: string; intitule: string; entreprise: { raisonSociale: string } };
}

const TYPE_LABELS: Record<string,string> = {
  AVANCE:"Garantie d'avance", BONNE_EXECUTION:"Bonne exécution",
  RETENUE:"Retenue de garantie", SOUMISSION:"Garantie de soumission", DEFAUT:"Garantie de défaut",
};
const TYPE_COLORS: Record<string,string> = {
  AVANCE:"bg-blue-50 text-blue-700 border-blue-200",
  BONNE_EXECUTION:"bg-green-50 text-green-700 border-green-200",
  RETENUE:"bg-purple-50 text-purple-700 border-purple-200",
  SOUMISSION:"bg-amber-50 text-amber-700 border-amber-200",
  DEFAUT:"bg-red-50 text-red-700 border-red-200",
};

function ExpirationBadge({ g }: { g: Garantie }) {
  if (!g.active) return <span className="text-xs text-gray-400">Inactive</span>;
  if (g.appelGarantie) return <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">APPELÉE</span>;
  if (g.statutExpiration === "EXPIREE") return <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full flex items-center gap-1"><XCircle className="h-3 w-3"/>Expirée</span>;
  if (g.statutExpiration === "BIENTOT") return <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-1"><Bell className="h-3 w-3"/>Expire dans {g.expireeDans}j</span>;
  if (g.statutExpiration === "VALIDE") return <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle className="h-3 w-3"/>Valide ({g.expireeDans}j)</span>;
  return <span className="text-xs text-gray-400 flex items-center gap-1"><Clock className="h-3 w-3"/>Sans date</span>;
}

export function GarantiesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [modal, setModal] = useState<Garantie | null | "new">(null);
  const [form, setForm] = useState<Partial<Garantie & { montantGnfNum?: number }>>({});
  const [filterExpirantes, setFilterExpirantes] = useState(false);
  const [appelModal, setAppelModal] = useState<Garantie | null>(null);
  const [appelObs, setAppelObs] = useState("");
  const [mainleveeCible, setMainleveeCible] = useState<Garantie | null>(null);

  const { data: synthese } = useQuery({
    queryKey: ["garanties-synthese"],
    queryFn: () => api.get("/garanties/dashboard/synthese").then(r => r.data),
  });

  const { data: garanties, isLoading } = useQuery<Garantie[]>({
    queryKey: ["garanties", filterExpirantes],
    queryFn: () => api.get("/garanties", { params: filterExpirantes ? { expirantes: "true" } : { active: "true" } }).then(r => r.data),
  });

  const { data: marches } = useQuery({
    queryKey: ["marches-simple"],
    queryFn: () => api.get("/marches", { params: { pageSize: 200 } }).then(r => r.data?.data ?? []),
  });

  const createMut = useMutation({
    mutationFn: (body: object) => api.post("/garanties", body).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["garanties"] }); qc.invalidateQueries({ queryKey: ["garanties-synthese"] }); toast.success("Garantie créée"); setModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.put(`/garanties/${id}`, body).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["garanties"] }); toast.success("Garantie mise à jour"); setModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const mainleveeMut = useMutation({
    mutationFn: (id: string) => api.post(`/garanties/${id}/mainlevee`, {}).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["garanties"] }); toast.success("Mainlevée enregistrée — garantie restituée"); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const appelMut = useMutation({
    mutationFn: ({ id, observations }: { id: string; observations: string }) => api.post(`/garanties/${id}/appel`, { observations }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["garanties"] }); toast.success("Garantie appelée"); setAppelModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  function handleSubmit() {
    const body = { ...form, montantGnf: form.montantGnfNum ?? 0 };
    if (modal === "new") createMut.mutate(body);
    else if (modal && typeof modal === "object") updateMut.mutate({ id: modal.id, body });
  }

  const items = garanties ?? [];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      {synthese && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Garanties actives", value: synthese.actives, color: "text-navy", bg: "bg-navy/5" },
            { label: "Expirées", value: synthese.expirees, color: "text-red-600", bg: "bg-red-50" },
            { label: "Expirent dans 30j", value: synthese.bientot, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Montant total", value: fmtGnf(synthese.montantTotalGnf), color: "text-navy", bg: "bg-gold/10" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`${bg} rounded-xl px-4 py-3`}>
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-xl font-black ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Alerte garanties expirantes */}
      {synthese?.bientot > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            <strong>{synthese.bientot} garantie(s)</strong> expirent dans les 30 prochains jours — renouvellement requis.
          </p>
          <Button size="sm" variant="secondary" className="ml-auto shrink-0" onClick={() => setFilterExpirantes(true)}>
            Voir
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button size="sm" variant={!filterExpirantes ? "primary" : "secondary"} onClick={() => setFilterExpirantes(false)}>
            Toutes actives
          </Button>
          <Button size="sm" variant={filterExpirantes ? "primary" : "secondary"} onClick={() => setFilterExpirantes(true)}>
            <Bell className="h-3.5 w-3.5" /> Expirantes seulement
          </Button>
        </div>
        {canWrite(user?.role) && (
          <Button onClick={() => { setForm({}); setModal("new"); }}>
            <Plus className="h-4 w-4" /> Nouvelle garantie
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-navy/5 border-b border-navy/10">
            <tr>
              {["Marché / Entreprise","Type","Montant","Banque / Réf.","Émission","Expiration","Statut","Actions"].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-bold text-navy uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && Array.from({length:5}).map((_,i) => (
              <tr key={i}><td colSpan={8}><div className="h-5 bg-gray-100 rounded animate-pulse m-3" /></td></tr>
            ))}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={8} className="py-10 text-center text-gray-400">
                <Shield className="h-10 w-10 mx-auto mb-2 opacity-20" />
                <p>Aucune garantie enregistrée</p>
              </td></tr>
            )}
            {items.map(g => (
              <tr key={g.id} className={`hover:bg-gray-50/50 ${g.statutExpiration === "EXPIREE" ? "bg-red-50/30" : g.statutExpiration === "BIENTOT" ? "bg-amber-50/30" : ""}`}>
                <td className="px-3 py-2">
                  <p className="font-medium text-navy text-xs">{g.marche?.reference}</p>
                  <p className="text-xs text-gray-400 truncate max-w-[140px]">{g.marche?.entreprise?.raisonSociale}</p>
                </td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded border font-medium ${TYPE_COLORS[g.type] ?? "bg-gray-50 text-gray-600"}`}>
                    {TYPE_LABELS[g.type] ?? g.type}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs font-bold text-navy">{fmtGnf(g.montantGnf)}</td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  <p>{g.banque ?? "—"}</p>
                  <p className="text-gray-400">{g.reference ?? ""}</p>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">{g.dateEmission ? new Date(g.dateEmission).toLocaleDateString("fr-FR") : "—"}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{g.dateExpiration ? new Date(g.dateExpiration).toLocaleDateString("fr-FR") : "—"}</td>
                <td className="px-3 py-2"><ExpirationBadge g={g} /></td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    {canWrite(user?.role) && <>
                      <Button size="sm" variant="ghost" onClick={() => { setForm({ ...g, montantGnfNum: Number(g.montantGnf) }); setModal(g); }}>Modifier</Button>
                      {!g.appelGarantie && (user?.role === "ADMIN" || user?.role === "DG" || user?.role === "DAF") && (<>
                        <Button size="sm" variant="ghost" onClick={() => { setAppelObs(""); setAppelModal(g); }} className="text-red-600">Appeler</Button>
                        {g.active && <Button size="sm" variant="ghost" className="text-green-700"
                          onClick={() => setMainleveeCible(g)}>
                          Mainlevée
                        </Button>}
                      </>)}
                    </>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal création/édition */}
      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === "new" ? "Nouvelle garantie" : "Modifier la garantie"}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Marché" required>
              <Select value={form.marcheId ?? ""} onChange={e => setForm({ ...form, marcheId: e.target.value })}>
                <option value="">— Choisir —</option>
                {(marches ?? []).map((m: { id: string; reference: string; intitule: string }) => (
                  <option key={m.id} value={m.id}>{m.reference} — {m.intitule}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Type" required>
              <Select value={form.type ?? ""} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option value="">— Choisir —</option>
                {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </FormField>
            <FormField label="Montant (GNF)" required>
              <Input type="number" value={form.montantGnfNum ?? ""} onChange={e => setForm({ ...form, montantGnfNum: Number(e.target.value) })} />
            </FormField>
            <FormField label="Banque émettrice">
              <Input value={form.banque ?? ""} onChange={e => setForm({ ...form, banque: e.target.value })} placeholder="Nom de la banque" />
            </FormField>
            <FormField label="N° Caution / Référence">
              <Input value={form.reference ?? ""} onChange={e => setForm({ ...form, reference: e.target.value })} />
            </FormField>
            <FormField label="Date d'émission">
              <Input type="date" value={form.dateEmission?.slice(0,10) ?? ""} onChange={e => setForm({ ...form, dateEmission: e.target.value })} />
            </FormField>
            <FormField label="Date d'expiration">
              <Input type="date" value={form.dateExpiration?.slice(0,10) ?? ""} onChange={e => setForm({ ...form, dateExpiration: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Observations">
            <Input value={form.observations ?? ""} onChange={e => setForm({ ...form, observations: e.target.value })} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="secondary" onClick={() => setModal(null)}>Annuler</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>
              {createMut.isPending || updateMut.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal appel garantie */}
      <Modal open={appelModal !== null} onClose={() => setAppelModal(null)} title="Appel de garantie">
        {appelModal && (
          <div className="space-y-3">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm font-bold text-red-700">⚠️ Appel de garantie irréversible</p>
              <p className="text-xs text-red-600 mt-1">
                {TYPE_LABELS[appelModal.type]} — {fmtGnf(appelModal.montantGnf)} — {appelModal.banque}
              </p>
            </div>
            <FormField label="Motif / Observations">
              <Input value={appelObs} onChange={e => setAppelObs(e.target.value)} placeholder="Raison de l'appel de garantie" />
            </FormField>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setAppelModal(null)}>Annuler</Button>
              <Button onClick={() => appelMut.mutate({ id: appelModal.id, observations: appelObs })} disabled={appelMut.isPending}>
                {appelMut.isPending ? "En cours…" : "Confirmer l'appel"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={mainleveeCible !== null} danger title="Mainlevée de garantie"
        message={<>Restituer la caution <b>{mainleveeCible?.type}</b> de <b>{mainleveeCible?.montantGnf ? Number(mainleveeCible.montantGnf).toLocaleString("fr-GN") + " FG" : ""}</b> à l'entreprise ? La garantie sera marquée inactive et ne protègera plus le marché.</>}
        confirmLabel="Accorder la mainlevée" loading={mainleveeMut.isPending}
        onClose={() => setMainleveeCible(null)}
        onConfirm={() => { if (mainleveeCible) mainleveeMut.mutate(mainleveeCible.id); setMainleveeCible(null); }}
      />
    </div>
  );
}
