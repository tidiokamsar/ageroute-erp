/**
 * Gestion des Réceptions marchés
 * OPR → Réception Provisoire → Réception Définitive
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError } from "../lib/api";
import { useAuth, canWrite } from "../lib/auth";
import { imprimerPV } from "../lib/bordereau";
import { Button } from "../components/ui/Button";
import { Input, Select, FormField } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { toast } from "../components/ui/Toast";
import { SecureFileLink, SecureImg } from "../components/ui/SecureFile";
import { Plus, ClipboardCheck, Clock, CheckCircle2, AlertTriangle, PenLine } from "lucide-react";

interface Reception {
  id: string; marcheId: string; type: string; statut: string;
  datePrevu?: string; dateReelle?: string; pvNumero?: string;
  presentsEntreprise?: string; presentsAgeroute?: string; presentsAutres?: string;
  reserves?: string[]; delaiLeveeReserves?: number; dateLeveeReserves?: string;
  observations?: string; signedAt?: string;
  marche?: { reference: string; intitule: string; entreprise: { raisonSociale: string } };
  pieces?: { nom: string; url?: string; type?: string }[];
}

const TYPE_LABELS: Record<string,string> = { OPR:"OPR", PROVISOIRE:"Réception Provisoire", DEFINITIVE:"Réception Définitive" };
const TYPE_COLORS: Record<string,string> = { OPR:"bg-blue-50 text-blue-700", PROVISOIRE:"bg-green-50 text-green-700", DEFINITIVE:"bg-purple-50 text-purple-700" };
const STATUT_COLORS: Record<string,string> = {
  EN_ATTENTE:"bg-gray-100 text-gray-600", PROGRAMME:"bg-blue-50 text-blue-700",
  REALISE:"bg-green-50 text-green-700", AVEC_RESERVES:"bg-amber-50 text-amber-700", REFUSE:"bg-red-50 text-red-600",
};
const STATUT_LABELS: Record<string,string> = {
  EN_ATTENTE:"En attente", PROGRAMME:"Programmé", REALISE:"Réalisé", AVEC_RESERVES:"Avec réserves", REFUSE:"Refusé",
};

function StatutBadge({ statut }: { statut: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${STATUT_COLORS[statut] ?? "bg-gray-100 text-gray-600"}`}>
      {statut === "REALISE" && <CheckCircle2 className="h-3 w-3" />}
      {statut === "AVEC_RESERVES" && <AlertTriangle className="h-3 w-3" />}
      {statut === "PROGRAMME" && <Clock className="h-3 w-3" />}
      {STATUT_LABELS[statut] ?? statut}
    </span>
  );
}

export function ReceptionsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [filterMarche, setFilterMarche] = useState("");
  const [filterStatut, setFilterStatut] = useState("");
  const [filterType, setFilterType] = useState("");
  const [modal, setModal] = useState<Reception | null | "new">(null);
  const [form, setForm] = useState<Partial<Reception & { reservesText: string }>>({});
  const [signerModal, setSignerModal] = useState<Reception | null>(null);
  const [viewRec, setViewRec] = useState<Reception | null>(null);
  const [pvNumero, setPvNumero] = useState("");
  const [reservesModal, setReservesModal] = useState<Reception | null>(null);

  const { data: synthese } = useQuery({
    queryKey: ["receptions-synthese"],
    queryFn: () => api.get("/receptions/dashboard/synthese").then(r => r.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["receptions", page, filterType, filterStatut],
    queryFn: () => api.get("/receptions", { params: { page, type: filterType || undefined, statut: filterStatut || undefined } }).then(r => r.data),
  });

  const { data: marches } = useQuery({
    queryKey: ["marches-simple"],
    queryFn: () => api.get("/marches", { params: { pageSize: 200 } }).then(r => r.data?.data ?? []),
  });

  const createMut = useMutation({
    mutationFn: (body: object) => api.post("/receptions", body).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["receptions"] }); toast.success("Réception créée"); setModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.put(`/receptions/${id}`, body).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["receptions"] }); toast.success("Réception mise à jour"); setModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const signerMut = useMutation({
    mutationFn: ({ id, pvNumero, statut }: { id: string; pvNumero: string; statut: string }) =>
      api.post(`/receptions/${id}/signer`, { pvNumero, statut }).then(r => r.data),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["receptions"] }); toast.success((res as { message: string }).message); setSignerModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const leverMut = useMutation({
    mutationFn: ({ id, observations }: { id: string; observations: string }) =>
      api.post(`/receptions/${id}/lever-reserves`, { observations }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["receptions"] }); toast.success("Réserves levées"); setReservesModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const [uploadingPiece, setUploadingPiece] = useState(false);
  async function uploadPieces(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingPiece(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const up = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } }).then(res => res.data);
        setForm((f) => ({
          ...f,
          pieces: [...(f.pieces ?? []), { nom: up.originalName ?? up.filename, url: up.url, type: file.type.startsWith("image/") ? "PHOTO" : "DOCUMENT" }],
        }));
      }
    } finally { setUploadingPiece(false); }
  }

  function handleSubmit() {
    const body = { ...form, reserves: form.reservesText ? form.reservesText.split("\n").filter(Boolean) : [] };
    delete (body as Record<string,unknown>).reservesText;
    if (modal === "new") createMut.mutate(body);
    else if (modal && typeof modal === "object") updateMut.mutate({ id: modal.id, body });
  }

  const items: Reception[] = data?.data ?? [];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      {synthese && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "OPR réalisées", value: synthese.opr, color: "text-blue-700", bg: "bg-blue-50" },
            { label: "Réc. provisoires", value: synthese.provisoires, color: "text-green-700", bg: "bg-green-50" },
            { label: "Réc. définitives", value: synthese.definitives, color: "text-purple-700", bg: "bg-purple-50" },
            { label: "Réserves en cours", value: synthese.avecReserves, color: "text-amber-700", bg: "bg-amber-50" },
            { label: "En attente", value: synthese.enAttente, color: "text-gray-600", bg: "bg-gray-50" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`${bg} rounded-xl px-4 py-3`}>
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-2xl font-black ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Réserves non levées */}
      {synthese?.avecReserves > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800"><strong>{synthese.avecReserves} réception(s)</strong> avec des réserves non encore levées.</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <Select className="w-44" value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}>
            <option value="">Tous types</option>
            {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select className="w-44" value={filterStatut} onChange={e => { setFilterStatut(e.target.value); setPage(1); }}>
            <option value="">Tous statuts</option>
            {Object.entries(STATUT_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        {canWrite(user?.role) && (
          <Button onClick={() => { setForm({}); setModal("new"); }}>
            <Plus className="h-4 w-4" /> Programmer une réception
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-navy/5 border-b border-navy/10">
            <tr>
              {["Marché","Type","Statut","Prévu","Réalisé","PV N°","Réserves","Actions"].map(h => (
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
                <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-20"/>
                <p>Aucune réception enregistrée</p>
              </td></tr>
            )}
            {items.map(r => (
              <tr key={r.id} className="hover:bg-gray-50/50">
                <td className="px-3 py-2">
                  <p className="font-medium text-navy text-xs">{r.marche?.reference}</p>
                  <p className="text-xs text-gray-400 truncate max-w-[130px]">{r.marche?.entreprise?.raisonSociale}</p>
                </td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded font-bold ${TYPE_COLORS[r.type] ?? "bg-gray-50 text-gray-600"}`}>
                    {TYPE_LABELS[r.type] ?? r.type}
                  </span>
                </td>
                <td className="px-3 py-2"><StatutBadge statut={r.statut} /></td>
                <td className="px-3 py-2 text-xs text-gray-500">{r.datePrevu ? new Date(r.datePrevu).toLocaleDateString("fr-FR") : "—"}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{r.dateReelle ? new Date(r.dateReelle).toLocaleDateString("fr-FR") : "—"}</td>
                <td className="px-3 py-2 text-xs font-mono text-gray-600">
                  {r.pvNumero ?? "—"}
                  {Array.isArray(r.pieces) && r.pieces.length > 0 && (
                    <button onClick={() => setViewRec(r)} className="text-[10px] text-blue-600 font-sans underline hover:text-blue-800">
                      📎 {r.pieces.length} pièce(s)
                    </button>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.reserves && r.reserves.length > 0
                    ? <span className="text-xs text-amber-700 font-medium">{r.reserves.length} réserve(s){r.dateLeveeReserves ? " ✓" : ""}</span>
                    : <span className="text-xs text-gray-400">—</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 flex-wrap">
                    <Button size="sm" variant="ghost" onClick={() => setViewRec(r)} title="Consulter le PV et ses pièces">
                      👁 Consulter
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => imprimerPV(r as unknown as Record<string, unknown>)} title="Imprimer le procès-verbal officiel">
                      🖨 PV
                    </Button>
                    {canWrite(user?.role) && (
                      <Button size="sm" variant="ghost" onClick={() => {
                        setForm({ ...r, reservesText: r.reserves?.join("\n") ?? "" });
                        setModal(r);
                      }}>Modifier</Button>
                    )}
                    {["ADMIN","DG","DMC"].includes(user?.role ?? "") && !r.signedAt && (
                      <Button size="sm" variant="ghost" onClick={() => { setPvNumero(""); setSignerModal(r); }} className="text-green-700">
                        <PenLine className="h-3.5 w-3.5" /> Signer PV
                      </Button>
                    )}
                    {r.statut === "AVEC_RESERVES" && !r.dateLeveeReserves && (
                      <Button size="sm" variant="ghost" onClick={() => setReservesModal(r)} className="text-amber-700">
                        Lever réserves
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.totalPages > 1 && (
          <div className="flex justify-center gap-2 py-3 border-t">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p-1)}>Précédent</Button>
            <span className="text-sm text-gray-500 self-center">Page {page} / {data.totalPages}</span>
            <Button size="sm" variant="secondary" disabled={page >= data.totalPages} onClick={() => setPage(p => p+1)}>Suivant</Button>
          </div>
        )}
      </div>

      {/* Modal création/édition */}
      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === "new" ? "Programmer une réception" : "Modifier la réception"}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Marché" required>
              <Select value={form.marcheId ?? ""} onChange={e => setForm({ ...form, marcheId: e.target.value })}>
                <option value="">— Choisir —</option>
                {(marches ?? []).map((m: { id: string; reference: string; intitule: string }) => (
                  <option key={m.id} value={m.id}>{m.reference}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Type" required>
              <Select value={form.type ?? ""} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option value="">— Choisir —</option>
                {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </FormField>
            <FormField label="Statut">
              <Select value={form.statut ?? "EN_ATTENTE"} onChange={e => setForm({ ...form, statut: e.target.value })}>
                {Object.entries(STATUT_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </FormField>
            <FormField label="Date prévue">
              <Input type="date" value={form.datePrevu?.slice(0,10) ?? ""} onChange={e => setForm({ ...form, datePrevu: e.target.value })} />
            </FormField>
            <FormField label="Présents (Entreprise)">
              <Input value={form.presentsEntreprise ?? ""} onChange={e => setForm({ ...form, presentsEntreprise: e.target.value })} placeholder="Noms des représentants" />
            </FormField>
            <FormField label="Présents (AGEROUTE)">
              <Input value={form.presentsAgeroute ?? ""} onChange={e => setForm({ ...form, presentsAgeroute: e.target.value })} placeholder="Ingénieurs présents" />
            </FormField>
            <FormField label="Autres présents">
              <Input value={form.presentsAutres ?? ""} onChange={e => setForm({ ...form, presentsAutres: e.target.value })} placeholder="Bailleur, bureau de contrôle…" />
            </FormField>
            <FormField label="Délai levée réserves (jours)">
              <Input type="number" value={form.delaiLeveeReserves ?? ""} onChange={e => setForm({ ...form, delaiLeveeReserves: Number(e.target.value) })} />
            </FormField>
          </div>
          <FormField label="Réserves (une par ligne)">
            <textarea
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 h-24 resize-none focus:outline-none focus:ring-2 focus:ring-navy/30"
              value={form.reservesText ?? ""}
              onChange={e => setForm({ ...form, reservesText: e.target.value })}
              placeholder="Défaut de revêtement au PK 12&#10;Signalisation manquante&#10;…"
            />
          </FormField>
          <FormField label="Observations">
            <Input value={form.observations ?? ""} onChange={e => setForm({ ...form, observations: e.target.value })} />
          </FormField>
          {/* Dossier de la réception : PV signé scanné, photos des ouvrages */}
          <FormField label="Pièces jointes (PV signé scanné, photos état des ouvrages...)">
            <input type="file" multiple accept="image/*,.pdf,.doc,.docx"
              onChange={(e) => { void uploadPieces(e.target.files); e.target.value = ""; }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 file:mr-3 file:px-3 file:py-1 file:rounded-lg file:border-0 file:bg-navy file:text-white file:text-xs"/>
            {uploadingPiece && <p className="text-[10px] text-blue-600 mt-1">Envoi en cours...</p>}
            {(form.pieces ?? []).length > 0 && (
              <div className="mt-2 space-y-1">
                {(form.pieces ?? []).map((pc, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded px-2 py-1 text-xs">
                    <span className="truncate">{pc.type === "PHOTO" ? "🖼" : "📄"} {pc.nom}</span>
                    <button onClick={() => setForm((f) => ({ ...f, pieces: (f.pieces ?? []).filter((_, j) => j !== i) }))}
                      className="text-red-400 hover:text-red-600 ml-2">✕</button>
                  </div>
                ))}
              </div>
            )}
          </FormField>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="secondary" onClick={() => setModal(null)}>Annuler</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending || uploadingPiece}>
              {createMut.isPending || updateMut.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal signer PV */}
      <Modal open={signerModal !== null} onClose={() => setSignerModal(null)} title={`Signer le PV — ${TYPE_LABELS[signerModal?.type ?? ""] ?? ""}`}>
        {signerModal && (
          <div className="space-y-3">
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
              La signature du PV {signerModal.type === "PROVISOIRE" ? "marque la fin des travaux et lance la période de garantie" : signerModal.type === "DEFINITIVE" ? "clôture définitivement le marché" : "valide l'OPR"}.
            </div>
            <FormField label="N° du PV">
              <Input value={pvNumero} onChange={e => setPvNumero(e.target.value)} placeholder="Ex: PV-2026-042" />
            </FormField>
            <FormField label="Résultat">
              <Select value={form.statut ?? "REALISE"} onChange={e => setForm({ ...form, statut: e.target.value })}>
                <option value="REALISE">Réalisé sans réserve</option>
                <option value="AVEC_RESERVES">Réalisé avec réserves</option>
                <option value="REFUSE">Refusé</option>
              </Select>
            </FormField>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setSignerModal(null)}>Annuler</Button>
              <Button onClick={() => signerMut.mutate({ id: signerModal.id, pvNumero, statut: form.statut ?? "REALISE" })} disabled={signerMut.isPending}>
                {signerMut.isPending ? "Signature…" : "Signer le PV"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal lever réserves */}
      <Modal open={reservesModal !== null} onClose={() => setReservesModal(null)} title="Lever les réserves">
        {reservesModal && (
          <div className="space-y-3">
            <div className="space-y-1 mb-2">
              {(reservesModal.reserves ?? []).map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 px-3 py-1.5 rounded">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{r}
                </div>
              ))}
            </div>
            <FormField label="Observations de levée">
              <Input value={form.observations ?? ""} onChange={e => setForm({ ...form, observations: e.target.value })} placeholder="Travaux de reprise effectués le…" />
            </FormField>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setReservesModal(null)}>Annuler</Button>
              <Button onClick={() => leverMut.mutate({ id: reservesModal.id, observations: form.observations ?? "" })} disabled={leverMut.isPending}>
                {leverMut.isPending ? "En cours…" : "Confirmer la levée"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Consultation du PV (lecture seule, tous profils) ── */}
      <Modal open={viewRec !== null} onClose={() => setViewRec(null)} title={`PV — ${TYPE_LABELS[viewRec?.type ?? ""] ?? ""} · ${viewRec?.marche?.reference ?? ""}`}>
        {viewRec && (
          <div className="space-y-4 p-1 max-h-[70vh] overflow-auto">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-gray-50 rounded-lg p-2"><p className="text-gray-400">Marché</p><p className="font-bold text-navy">{viewRec.marche?.reference}</p><p className="text-gray-500 truncate">{viewRec.marche?.entreprise?.raisonSociale}</p></div>
              <div className="bg-gray-50 rounded-lg p-2"><p className="text-gray-400">Statut</p><StatutBadge statut={viewRec.statut}/></div>
              <div className="bg-gray-50 rounded-lg p-2"><p className="text-gray-400">Date prévue</p><p className="font-medium">{viewRec.datePrevu ? new Date(viewRec.datePrevu).toLocaleDateString("fr-FR") : "—"}</p></div>
              <div className="bg-gray-50 rounded-lg p-2"><p className="text-gray-400">Date réelle</p><p className="font-medium">{viewRec.dateReelle ? new Date(viewRec.dateReelle).toLocaleDateString("fr-FR") : "—"}</p></div>
              <div className="bg-gray-50 rounded-lg p-2"><p className="text-gray-400">PV n°</p><p className="font-mono font-bold">{viewRec.pvNumero ?? "non signé"}</p></div>
              <div className="bg-gray-50 rounded-lg p-2"><p className="text-gray-400">Signé le</p><p className="font-medium">{viewRec.signedAt ? new Date(viewRec.signedAt).toLocaleDateString("fr-FR") : "—"}</p></div>
            </div>

            <div className="text-xs space-y-1.5">
              <p className="font-bold text-gray-600">Commission — présents</p>
              <p><span className="text-gray-400">Entreprise :</span> {viewRec.presentsEntreprise ?? "—"}</p>
              <p><span className="text-gray-400">AGEROUTE :</span> {viewRec.presentsAgeroute ?? "—"}</p>
              <p><span className="text-gray-400">Autres :</span> {viewRec.presentsAutres ?? "—"}</p>
            </div>

            {(viewRec.reserves ?? []).length > 0 && (
              <div className="text-xs">
                <p className="font-bold text-amber-700 mb-1">Réserves ({(viewRec.reserves ?? []).length}){viewRec.dateLeveeReserves ? " — levées ✓" : ""}</p>
                <ul className="list-disc pl-4 space-y-0.5 text-gray-600">
                  {(viewRec.reserves ?? []).map((rs, i) => <li key={i}>{rs}</li>)}
                </ul>
              </div>
            )}

            {viewRec.observations && (
              <div className="text-xs"><p className="font-bold text-gray-600 mb-1">Observations</p><p className="text-gray-600 bg-gray-50 rounded-lg p-2">{viewRec.observations}</p></div>
            )}

            <div className="text-xs">
              <p className="font-bold text-gray-600 mb-2">Pièces jointes ({(viewRec.pieces ?? []).length})</p>
              {(viewRec.pieces ?? []).length === 0 && <p className="text-gray-400">Aucune pièce jointe.</p>}
              <div className="grid grid-cols-2 gap-2">
                {(viewRec.pieces ?? []).map((pc, i) => (
                  pc.url ? (
                    <SecureFileLink key={i} href={pc.url}
                       className="border border-gray-200 rounded-lg p-2 hover:border-navy/40 transition-colors block">
                      {pc.type === "PHOTO" ? (
                        <SecureImg src={pc.url} alt={pc.nom} className="w-full h-24 object-cover rounded mb-1"/>
                      ) : (
                      <div className="w-full h-24 bg-gray-50 rounded mb-1 flex items-center justify-center text-3xl">📄</div>
                      )}
                      <p className="truncate text-[10px] font-medium text-navy">{pc.nom}</p>
                      <p className="text-[9px] text-gray-400">Cliquer pour ouvrir</p>
                    </SecureFileLink>
                  ) : (
                    <div key={i} className="border border-gray-100 rounded-lg p-2 opacity-60">
                      <div className="w-full h-24 bg-gray-50 rounded mb-1 flex items-center justify-center text-3xl">{pc.type === "PHOTO" ? "🖼" : "📄"}</div>
                      <p className="truncate text-[10px]">{pc.nom}</p>
                      <p className="text-[9px] text-gray-400">Fichier non disponible</p>
                    </div>
                  )
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button variant="secondary" onClick={() => setViewRec(null)}>Fermer</Button>
              <Button onClick={() => imprimerPV(viewRec as unknown as Record<string, unknown>)}>🖨 Imprimer le PV</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
