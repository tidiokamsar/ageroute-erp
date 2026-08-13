/**
 * Gestion des Avenants marchés
 * Numérotés, avec impact montant + délai
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError, fmtGnf } from "../lib/api";
import { useAuth, canWrite } from "../lib/auth";
import { Button } from "../components/ui/Button";
import { Input, Select, FormField } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { toast } from "../components/ui/Toast";
import { Plus, FileText, TrendingUp, TrendingDown, Calendar } from "lucide-react";

interface Avenant {
  id: string; marcheId: string; numero: number; objet: string;
  montantSupplementaireGnf: string; prolongationJours: number;
  dateSignature?: string; statut: string; observations?: string;
  marche?: { reference: string; intitule: string; montantActualiseGnf: string; entreprise: { raisonSociale: string } };
}

const STATUT_COLORS: Record<string,string> = {
  ACTIF:"bg-green-50 text-green-700", ANNULE:"bg-red-50 text-red-700", EN_ATTENTE:"bg-amber-50 text-amber-700",
};

export function AvenantsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<Avenant | null | "new">(null);
  const [form, setForm] = useState<Partial<Avenant & { montantNum: number }>>({});
  const [filterMarche, setFilterMarche] = useState("");

  const { data: marches } = useQuery({
    queryKey: ["marches-simple"],
    queryFn: () => api.get("/marches", { params: { pageSize: 200 } }).then(r => r.data?.data ?? []),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["avenants", page, filterMarche],
    queryFn: () => filterMarche
      ? api.get(`/avenants/marche/${filterMarche}`).then(r => ({ data: r.data, total: r.data.length, totalPages: 1 }))
      : api.get("/avenants", { params: { page } }).then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: (body: object) => api.post("/avenants", body).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["avenants"] }); toast.success("Avenant créé — montant marché mis à jour"); setModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.put(`/avenants/${id}`, body).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["avenants"] }); toast.success("Avenant mis à jour"); setModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  function handleSubmit() {
    const body = { ...form, montantSupplementaireGnf: form.montantNum ?? 0 };
    delete (body as Record<string,unknown>).montantNum;
    if (modal === "new") createMut.mutate(body);
    else if (modal && typeof modal === "object") updateMut.mutate({ id: modal.id, body });
  }

  const items: Avenant[] = Array.isArray(data) ? data : (data?.data ?? []);

  // Stats rapides
  const totalSupp = items.filter(a => a.statut === "ACTIF").reduce((s, a) => s + Number(a.montantSupplementaireGnf), 0);
  const totalJours = items.filter(a => a.statut === "ACTIF").reduce((s, a) => s + (a.prolongationJours ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Filtre marché */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2 flex-1">
          <Select className="max-w-xs" value={filterMarche} onChange={e => { setFilterMarche(e.target.value); setPage(1); }}>
            <option value="">Tous les marchés</option>
            {(marches ?? []).map((m: { id: string; reference: string; intitule: string }) => (
              <option key={m.id} value={m.id}>{m.reference} — {m.intitule}</option>
            ))}
          </Select>
        </div>
        {canWrite(user?.role) && (
          <Button onClick={() => { setForm({ statut: "ACTIF", montantNum: 0, prolongationJours: 0 }); setModal("new"); }}>
            <Plus className="h-4 w-4" /> Nouvel avenant
          </Button>
        )}
      </div>

      {/* Stats agrégées */}
      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-navy/5 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500">Avenants actifs</p>
            <p className="text-2xl font-black text-navy">{items.filter(a => a.statut === "ACTIF").length}</p>
          </div>
          <div className={`rounded-xl px-4 py-3 ${totalSupp >= 0 ? "bg-green-50" : "bg-red-50"}`}>
            <p className="text-xs text-gray-500">Impact montant cumulé</p>
            <div className="flex items-center gap-1">
              {totalSupp >= 0 ? <TrendingUp className="h-4 w-4 text-green-600"/> : <TrendingDown className="h-4 w-4 text-red-600"/>}
              <p className={`text-lg font-black ${totalSupp >= 0 ? "text-green-700" : "text-red-700"}`}>{fmtGnf(totalSupp)}</p>
            </div>
          </div>
          <div className="bg-amber-50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500">Prolongation cumulée</p>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4 text-amber-600"/>
              <p className="text-2xl font-black text-amber-700">{totalJours}j</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-navy/5 border-b border-navy/10">
            <tr>
              {["Marché","N°","Objet","Impact montant","Prolongation","Signature","Statut","Actions"].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-bold text-navy uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && Array.from({length:5}).map((_,i) => (
              <tr key={i}><td colSpan={8}><div className="h-5 bg-gray-100 rounded animate-pulse m-3"/></td></tr>
            ))}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={8} className="py-10 text-center text-gray-400">
                <FileText className="h-10 w-10 mx-auto mb-2 opacity-20"/>
                <p>Aucun avenant enregistré</p>
              </td></tr>
            )}
            {items.map(a => (
              <tr key={a.id} className="hover:bg-gray-50/50">
                <td className="px-3 py-2">
                  <p className="font-medium text-navy text-xs">{a.marche?.reference}</p>
                  <p className="text-xs text-gray-400 truncate max-w-[120px]">{a.marche?.entreprise?.raisonSociale}</p>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className="text-sm font-black text-navy">#{a.numero}</span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-700 max-w-[200px] truncate">{a.objet}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    {Number(a.montantSupplementaireGnf) >= 0
                      ? <TrendingUp className="h-3.5 w-3.5 text-green-600"/>
                      : <TrendingDown className="h-3.5 w-3.5 text-red-600"/>}
                    <span className={`text-xs font-bold ${Number(a.montantSupplementaireGnf) >= 0 ? "text-green-700" : "text-red-600"}`}>
                      {fmtGnf(a.montantSupplementaireGnf)}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-amber-700 font-medium">
                  {a.prolongationJours > 0 ? `+${a.prolongationJours}j` : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {a.dateSignature ? new Date(a.dateSignature).toLocaleDateString("fr-FR") : "—"}
                </td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded font-bold ${STATUT_COLORS[a.statut] ?? "bg-gray-50 text-gray-600"}`}>
                    {a.statut}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {canWrite(user?.role) && (
                    <Button size="sm" variant="ghost" onClick={() => {
                      setForm({ ...a, montantNum: Number(a.montantSupplementaireGnf) });
                      setModal(a);
                    }}>Modifier</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === "new" ? "Nouvel avenant" : `Modifier l'avenant #${(modal as Avenant)?.numero}`}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Marché" required>
              <Select value={form.marcheId ?? ""} onChange={e => setForm({ ...form, marcheId: e.target.value })}>
                <option value="">— Choisir —</option>
                {(marches ?? []).map((m: { id: string; reference: string }) => (
                  <option key={m.id} value={m.id}>{m.reference}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="N° avenant" required>
              <Input type="number" min={1} value={form.numero ?? ""} onChange={e => setForm({ ...form, numero: Number(e.target.value) })} />
            </FormField>
            <FormField label="Montant supplémentaire (GNF)" required>
              <Input type="number" value={form.montantNum ?? 0} onChange={e => setForm({ ...form, montantNum: Number(e.target.value) })}
                placeholder="Négatif si diminutif" />
            </FormField>
            <FormField label="Prolongation (jours)">
              <Input type="number" min={0} value={form.prolongationJours ?? 0} onChange={e => setForm({ ...form, prolongationJours: Number(e.target.value) })} />
            </FormField>
            <FormField label="Réf. approbation ARMP">
              <Input value={(form as Record<string, unknown>).approbationArmpRef as string ?? ""} onChange={e => setForm({ ...form, approbationArmpRef: e.target.value } as typeof form)}
                placeholder="Obligatoire si l'avenant dépasse le seuil réglementaire" />
              <p className="text-[10px] text-gray-400 mt-1">Exigée quand le cumul dépasse le seuil paramétré (défaut 20 % du marché initial).</p>
            </FormField>
            <FormField label="Date de signature">
              <Input type="date" value={form.dateSignature?.slice(0,10) ?? ""} onChange={e => setForm({ ...form, dateSignature: e.target.value })} />
            </FormField>
            <FormField label="Statut">
              <Select value={form.statut ?? "ACTIF"} onChange={e => setForm({ ...form, statut: e.target.value })}>
                <option value="EN_ATTENTE">En attente</option>
                <option value="ACTIF">Actif</option>
                <option value="ANNULE">Annulé</option>
              </Select>
            </FormField>
          </div>
          <FormField label="Objet de l'avenant" required>
            <Input value={form.objet ?? ""} onChange={e => setForm({ ...form, objet: e.target.value })} placeholder="Ex: Extension tronçon Km 14-18" />
          </FormField>
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
    </div>
  );
}
