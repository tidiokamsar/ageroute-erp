/**
 * Gestion Financière — Circuits de paiement, ordonnancements, engagements budgétaires
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError, fmtGnf } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/Button";
import { Select, FormField, Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { toast } from "../components/ui/Toast";
import { CreditCard, CheckCircle2, Clock, AlertTriangle, ArrowRight, Banknote, TrendingUp, Play, AlertCircle, RefreshCw } from "lucide-react";

interface Circuit {
  id: string; decompteId: string; type: string; statut: string;
  etapeActuelle: number; dateCreation: string; bailleurNom?: string;
  etapes: { id: string; ordre: number; nom: string; roleOuService: string; statut: string; dateVisa?: string; validePar?: string }[];
  decompte: {
    reference: string; numeroDossier?: string; netAPayer: string; statut: string;
    marche: { reference: string; intitule: string; financement: string };
    entreprise: { raisonSociale: string };
  };
}

const TYPE_COLORS: Record<string,string> = {
  FER:"bg-blue-50 text-blue-700", BUDGET:"bg-purple-50 text-purple-700", BAILLEUR:"bg-green-50 text-green-700",
};
const STATUT_COLORS: Record<string,string> = {
  EN_COURS:"bg-amber-50 text-amber-700", PAYE:"bg-green-50 text-green-700", REJETE:"bg-red-50 text-red-700",
};

function EtapeStepper({ circuit }: { circuit: Circuit }) {
  return (
    <div className="flex items-center gap-1 flex-wrap mt-2">
      {circuit.etapes.map((e, i) => (
        <div key={e.id} className="flex items-center gap-1">
          <div className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
            e.statut === "VALIDE" ? "bg-green-100 text-green-700 border-green-200" :
            e.statut === "EN_COURS" ? "bg-amber-100 text-amber-700 border-amber-200 ring-1 ring-amber-400" :
            "bg-gray-100 text-gray-400 border-gray-200"
          }`}>{e.nom}</div>
          {i < circuit.etapes.length - 1 && <ArrowRight className="h-3 w-3 text-gray-300 shrink-0"/>}
        </div>
      ))}
    </div>
  );
}

export function FinancierPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filterStatut, setFilterStatut] = useState("EN_COURS");
  const [filterType, setFilterType] = useState("");
  const [validerModal, setValiderModal] = useState<{ circuit: Circuit; etape: Circuit["etapes"][0] } | null>(null);
  const [form, setForm] = useState<{ statut: "VALIDE"|"REJETE"; commentaire?: string; dateVisa?: string }>({ statut: "VALIDE" });

  const { data: circuits, isLoading } = useQuery<Circuit[]>({
    queryKey: ["circuits", filterStatut, filterType],
    queryFn: () => api.get("/circuit-financier", { params: { statut: filterStatut || undefined } }).then(r => r.data),
  });

  const { data: dafStats } = useQuery({
    queryKey: ["circuit-stats"],
    queryFn: () => api.get("/circuit-financier/stats/daf").then(r => r.data),
    refetchInterval: 30_000,
  });

  const { data: pendingDecomptes, isLoading: pendingLoading } = useQuery<any[]>({
    queryKey: ["circuit-pending"],
    queryFn: () => api.get("/circuit-financier/pending").then(r => r.data),
    refetchInterval: 30_000,
  });

  const declencherMut = useMutation({
    mutationFn: (decompteId: string) =>
      api.post(`/circuit-financier/declencher/${decompteId}`, {}).then(r => r.data),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["circuit-pending"] });
      qc.invalidateQueries({ queryKey: ["circuits"] });
      qc.invalidateQueries({ queryKey: ["circuit-stats"] });
      toast.success(res.message ?? "Circuit financier déclenché");
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const validerMut = useMutation({
    mutationFn: ({ circuitId, ...body }: { circuitId: string; statut: string; commentaire?: string; dateVisa?: string }) =>
      api.post(`/circuit-financier/${circuitId}/etape`, body).then(r => r.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["circuits"] });
      qc.invalidateQueries({ queryKey: ["dashboard-daf"] });
      toast.success((res as { message: string }).message);
      setValiderModal(null);
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const canValidate = ["ADMIN","DG","DAF","BUDGET","TRESOR","FER_AGT","BCRG","UGP","BAILLEUR"].includes(user?.role ?? "");

  const items = (circuits ?? []).filter(c => !filterType || c.type === filterType);

  return (
    <div className="space-y-5">
      {/* KPIs DAF */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "En cours",          value: dafStats?.enCoursCircuit ?? 0,         color: "text-amber-700",  bg: "bg-amber-50" },
          { label: "Payés (circuit)",   value: dafStats?.payesCircuit ?? 0,           color: "text-green-700",  bg: "bg-green-50" },
          { label: "Paiements validés", value: dafStats?.paiementsValides ?? 0,       color: "text-blue-700",   bg: "bg-blue-50" },
          { label: "En attente pmt",    value: dafStats?.paiementsEnAttente ?? 0,     color: "text-purple-700", bg: "bg-purple-50" },
          { label: "Montant payé",      value: fmtGnf(dafStats?.montantPayeGnf ?? 0), color: "text-navy",      bg: "bg-navy/5" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl px-4 py-3`}>
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-lg font-black ${color} truncate`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex gap-3 flex-wrap">
        {[
          { v:"EN_COURS", l:"En cours" },
          { v:"PAYE",     l:"Payés" },
          { v:"REJETE",   l:"Rejetés" },
          { v:"",         l:"Tous" },
        ].map(({ v, l }) => (
          <Button key={v} size="sm" variant={filterStatut === v ? "primary" : "secondary"} onClick={() => setFilterStatut(v)}>
            {l}
          </Button>
        ))}
        <Select className="w-36" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Tous circuits</option>
          <option value="FER">FER</option>
          <option value="BUDGET">Budget national</option>
          <option value="BAILLEUR">Bailleur</option>
        </Select>
      </div>

      {/* Décomptes en attente de circuit financier */}
      {(pendingDecomptes ?? []).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-600" />
            <p className="text-sm font-bold text-amber-800">
              {pendingDecomptes!.length} décompte(s) validé(s) DG en attente de circuit financier
            </p>
          </div>
          <div className="space-y-2">
            {pendingDecomptes!.map((d: any) => (
              <div key={d.id} className="bg-white rounded-xl border border-amber-100 p-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{d.reference}</p>
                  <p className="text-xs text-gray-500 truncate">{d.marche_intitule} · {d.entreprise}</p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{d.financement}</span>
                    <span className="text-[10px] font-bold text-navy">{fmtGnf(d.netAPayer)}</span>
                  </div>
                </div>
                {["ADMIN","DG"].includes(user?.role ?? "") && (
                  <button
                    onClick={() => declencherMut.mutate(d.id)}
                    disabled={declencherMut.isPending}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-navy text-white rounded-lg hover:bg-navy/90 disabled:opacity-50 shrink-0"
                  >
                    <Play size={12} />
                    Déclencher circuit
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Liste circuits */}
      <div className="space-y-3">
        {isLoading && Array.from({length:3}).map((_,i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse"/>
        ))}
        {!isLoading && items.length === 0 && (
          <div className="py-12 text-center text-gray-400">
            <CreditCard className="h-10 w-10 mx-auto mb-2 opacity-20"/>
            <p>Aucun circuit financier {filterStatut ? `"${filterStatut}"` : ""}</p>
          </div>
        )}
        {items.map(c => {
          const etapeCourante = c.etapes[c.etapeActuelle];
          const canValidateStep = canValidate && c.statut === "EN_COURS";
          return (
            <div key={c.id} className="bg-white rounded-xl border border-gray-100 shadow-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${TYPE_COLORS[c.type] ?? "bg-gray-50 text-gray-600"}`}>
                      Circuit {c.type}
                    </span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${STATUT_COLORS[c.statut] ?? ""}`}>
                      {c.statut === "EN_COURS" && <Clock className="h-3 w-3 inline mr-1"/>}
                      {c.statut === "PAYE" && <CheckCircle2 className="h-3 w-3 inline mr-1"/>}
                      {c.statut}
                    </span>
                    <span className="text-xs text-gray-500">{c.decompte?.numeroDossier ?? c.decompte?.reference}</span>
                  </div>
                  <p className="font-semibold text-navy text-sm mt-1">{c.decompte?.marche?.intitule}</p>
                  <p className="text-xs text-gray-500">{c.decompte?.entreprise?.raisonSociale} — {c.decompte?.marche?.reference}</p>
                  <EtapeStepper circuit={c} />
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-navy">{fmtGnf(c.decompte?.netAPayer)}</p>
                  <p className="text-xs text-gray-400">Net à payer</p>
                  {c.bailleurNom && <p className="text-xs text-blue-600 mt-1">{c.bailleurNom}</p>}
                </div>
              </div>

              {/* Étape courante + action */}
              {c.statut === "EN_COURS" && etapeCourante && (
                <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-xs font-bold text-amber-800">Étape courante : {etapeCourante.nom}</p>
                    <p className="text-xs text-amber-600">Service requis : <strong>{etapeCourante.roleOuService}</strong></p>
                  </div>
                  {canValidateStep && (
                    <Button size="sm" onClick={() => {
                      setForm({ statut: "VALIDE", commentaire: "", dateVisa: new Date().toISOString().slice(0,10) });
                      setValiderModal({ circuit: c, etape: etapeCourante });
                    }}>
                      Valider l'étape
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal validation étape */}
      <Modal open={validerModal !== null} onClose={() => setValiderModal(null)}
        title={`Valider : ${validerModal?.etape.nom}`}>
        {validerModal && (
          <div className="space-y-3">
            <div className="p-3 bg-navy/5 rounded-lg text-sm">
              <p><strong>Circuit :</strong> {validerModal.circuit.type}</p>
              <p><strong>Décompte :</strong> {validerModal.circuit.decompte.numeroDossier ?? validerModal.circuit.decompte.reference}</p>
              <p><strong>Montant :</strong> {fmtGnf(validerModal.circuit.decompte.netAPayer)}</p>
            </div>
            <FormField label="Décision">
              <Select value={form.statut} onChange={e => setForm({ ...form, statut: e.target.value as "VALIDE"|"REJETE" })}>
                <option value="VALIDE">Valider / Viser</option>
                <option value="REJETE">Rejeter</option>
              </Select>
            </FormField>
            <FormField label="Date du visa">
              <Input type="date" value={form.dateVisa ?? ""} onChange={e => setForm({ ...form, dateVisa: e.target.value })} />
            </FormField>
            <FormField label="Commentaire">
              <Input value={form.commentaire ?? ""} onChange={e => setForm({ ...form, commentaire: e.target.value })}
                placeholder={form.statut === "REJETE" ? "Motif de rejet obligatoire" : "Observations (optionnel)"} />
            </FormField>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="secondary" onClick={() => setValiderModal(null)}>Annuler</Button>
              <Button
                onClick={() => validerMut.mutate({ circuitId: validerModal.circuit.id, ...form })}
                disabled={validerMut.isPending || (form.statut === "REJETE" && !form.commentaire)}>
                {validerMut.isPending ? "En cours…" : form.statut === "VALIDE" ? "Confirmer le visa" : "Confirmer le rejet"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
