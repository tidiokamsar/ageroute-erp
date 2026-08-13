import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Modal } from "../components/ui/Modal";
import { toast } from "../components/ui/Toast";
import {
  Shield, FileCheck, Clock, AlertTriangle, CheckCircle2,
  XCircle, Download, Package, Printer, ChevronRight,
  Eye, Hash, Calendar, User, Lock, Unlock, Archive,
  RefreshCw, Search, Filter, AlertOctagon
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────
type SigStatus = "pending" | "in_progress" | "signed" | "rejected" | "cancelled" | "expired" | "revoked" | "archived";
type ObjType = "MARCHE" | "DECOMPTE" | "PAIEMENT" | "RECEPTION" | "AVENANT" | "CONVENTION" | "DOCUMENT";

interface SigObject {
  id: string;
  object_type: ObjType;
  object_id: string;
  object_ref: string | null;
  title: string;
  current_version: number;
  status: SigStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  signer_nom?: string | null;
  signature_status?: string | null;
  signed_at?: string | null;
}

interface SigDetail {
  sigObject: SigObject;
  signatures: SignatureRow[];
  events: EventRow[];
  attempts: AttemptRow[];
  package: SigPackage | null;
}

interface SignatureRow {
  id: string;
  signer_user_id: string;
  signer_role: string;
  signer_nom: string | null;
  nomComplet?: string | null;
  email?: string | null;
  signature_method: string;
  signature_status: string;
  signed_at: string | null;
  ip_address: string | null;
  signature_hash: string | null;
  certificate_id: string | null;
  reason: string | null;
  attempt_count: number;
}

interface EventRow {
  id: string;
  event_type: string;
  event_status: string;
  message: string | null;
  ip_address: string | null;
  created_at: string;
  user_nom?: string | null;
}

interface AttemptRow {
  id: string;
  attempt_no: number;
  result: string;
  failure_reason: string | null;
  ip_address: string | null;
  created_at: string;
  user_nom?: string | null;
}

interface SigPackage {
  id: string;
  version: number;
  status: string;
  package_hash: string | null;
  qr_code: string | null;
  print_count: number;
  generated_at: string | null;
  archived_at: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  pending:     { label: "En attente",   icon: <Clock size={12} />,        cls: "bg-gray-50 text-gray-500 border-gray-200" },
  in_progress: { label: "En cours",     icon: <RefreshCw size={12} />,    cls: "bg-blue-50 text-blue-600 border-blue-200" },
  signed:      { label: "Signé",        icon: <CheckCircle2 size={12} />, cls: "bg-green-50 text-green-600 border-green-200" },
  rejected:    { label: "Refusé",       icon: <XCircle size={12} />,      cls: "bg-red-50 text-red-600 border-red-200" },
  cancelled:   { label: "Annulé",       icon: <XCircle size={12} />,      cls: "bg-orange-50 text-orange-500 border-orange-200" },
  expired:     { label: "Expiré",       icon: <AlertTriangle size={12} />, cls: "bg-yellow-50 text-yellow-600 border-yellow-200" },
  revoked:     { label: "Révoqué",      icon: <AlertOctagon size={12} />, cls: "bg-red-50 text-red-700 border-red-200" },
  archived:    { label: "Archivé",      icon: <Archive size={12} />,      cls: "bg-slate-50 text-slate-500 border-slate-200" },
};

const OBJ_TYPE_LABELS: Record<string, string> = {
  MARCHE: "Marché", DECOMPTE: "Décompte", PAIEMENT: "Paiement",
  RECEPTION: "Réception", AVENANT: "Avenant", CONVENTION: "Convention", DOCUMENT: "Document",
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG["pending"];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border rounded-full ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-GN", { dateStyle: "short", timeStyle: "short" });
}

// ─── Nouveau modal ──────────────────────────────────────────────────────────
function NouveauSigModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    objectType: "MARCHE" as ObjType,
    objectId: "",
    title: "",
    method: "PASSWORD",
  });

  const mutation = useMutation({
    mutationFn: (data: typeof form) => api.post("/signature-audit", data).then(r => r.data),
    onSuccess: () => {
      toast.success("Demande de signature créée");
      qc.invalidateQueries({ queryKey: ["sig-objects"] });
      onClose();
      setForm({ objectType: "MARCHE", objectId: "", title: "", method: "PASSWORD" });
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  return (
    <Modal open={open} onClose={onClose} title="Nouvelle demande de signature" size="sm">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type de document</label>
            <select value={form.objectType} onChange={e => setForm(f => ({ ...f, objectType: e.target.value as ObjType }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              {Object.entries(OBJ_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Méthode de signature</label>
            <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="PASSWORD">Mot de passe</option>
              <option value="OTP">Code OTP</option>
              <option value="CERTIFICAT">Certificat</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ID du document <span className="text-gray-400">(UUID dans le système)</span></label>
          <input value={form.objectId} onChange={e => setForm(f => ({ ...f, objectId: e.target.value }))}
            placeholder="ex: 550e8400-e29b-41d4-a716-..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Titre du document</label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="ex: Marché de travaux route RN1 lot 3"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">Annuler</button>
          <button onClick={() => mutation.mutate(form)} disabled={!form.objectId || !form.title || mutation.isPending}
            className="text-sm px-4 py-1.5 bg-navy text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5">
            <Shield size={14} />
            {mutation.isPending ? "Création..." : "Créer la demande"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal confirmation signature ───────────────────────────────────────────
function ConfirmSigModal({ sig, onClose }: { sig: SigObject; onClose: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<"start" | "confirm" | "done">("start");
  const [password, setPassword] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [luEtApprouve, setLuEtApprouve] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [result, setResult] = useState<{ certificate_id: string; hash: string } | null>(null);

  const startMut = useMutation({
    mutationFn: () => api.post(`/signature-audit/${sig.id}/start`).then(r => r.data),
    onSuccess: () => { setStep("confirm"); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const confirmMut = useMutation({
    mutationFn: () => api.post(`/signature-audit/${sig.id}/confirm`, { password, commentaire, luEtApprouve }).then(r => r.data),
    onSuccess: (data) => {
      setResult(data.signature);
      setStep("done");
      qc.invalidateQueries({ queryKey: ["sig-objects"] });
      qc.invalidateQueries({ queryKey: ["sig-detail", sig.id] });
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  return (
    <Modal open onClose={onClose} title="Fenêtre de signature sécurisée" size="sm">
      {step === "start" && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-blue-800">Objet à signer</p>
            <p className="text-xs text-blue-700 font-medium">{sig.title}</p>
            <p className="text-xs text-blue-600">{OBJ_TYPE_LABELS[sig.object_type]} — réf. {sig.object_ref ?? sig.object_id.slice(0, 8)}</p>
          </div>
          <p className="text-sm text-gray-600">En cliquant sur <strong>Ouvrir la session</strong>, vous initiez une session de signature sécurisée. Votre IP sera enregistrée.</p>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500">Annuler</button>
            <button onClick={() => startMut.mutate()} disabled={startMut.isPending}
              className="text-sm px-4 py-1.5 bg-navy text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5">
              <Unlock size={14} />{startMut.isPending ? "Ouverture..." : "Ouvrir la session"}
            </button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex gap-2">
            <AlertTriangle size={16} className="text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-700">Signature électronique ayant valeur probante — vérifiez attentivement le document avant de signer.</p>
          </div>

          <label className="flex items-start gap-2 cursor-pointer group">
            <input type="checkbox" checked={luEtApprouve} onChange={e => setLuEtApprouve(e.target.checked)}
              className="mt-0.5 accent-navy" />
            <span className="text-xs text-gray-600 group-hover:text-gray-800">
              Je certifie avoir <strong>lu et approuvé</strong> le document <em>{sig.title}</em> et j'en accepte le contenu sans réserve.
            </span>
          </label>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mot de passe <span className="text-red-500">*</span></label>
            <div className="relative">
              <input type={showPw ? "text" : "password"} value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Votre mot de passe ERP"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-10" />
              <button onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Eye size={14} />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Commentaire <span className="text-gray-400">(optionnel)</span></label>
            <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)}
              rows={2} placeholder="Motif, observations..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500">Annuler</button>
            <button onClick={() => confirmMut.mutate()} disabled={!password || !luEtApprouve || confirmMut.isPending}
              className="text-sm px-4 py-1.5 bg-green-600 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5">
              <Lock size={14} />{confirmMut.isPending ? "Signature..." : "Signer définitivement"}
            </button>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="space-y-4 text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle2 size={28} className="text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-800">Document signé avec succès</p>
            <p className="text-xs text-gray-400 mt-1">{fmt(new Date().toISOString())}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-left space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Certificat ID</span>
              <span className="font-mono font-medium text-navy">{result.certificate_id}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Empreinte SHA-256</span>
              <span className="font-mono text-gray-600 truncate max-w-[180px]">{result.hash}</span>
            </div>
          </div>
          <button onClick={onClose} className="w-full text-sm px-4 py-2 bg-navy text-white rounded-lg">Fermer</button>
        </div>
      )}
    </Modal>
  );
}

// ─── Modal refus ────────────────────────────────────────────────────────────
function RejectSigModal({ sig, onClose }: { sig: SigObject; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: () => api.post(`/signature-audit/${sig.id}/reject`, { reason, password }).then(r => r.data),
    onSuccess: () => {
      toast.success("Refus enregistré");
      qc.invalidateQueries({ queryKey: ["sig-objects"] });
      qc.invalidateQueries({ queryKey: ["sig-detail", sig.id] });
      onClose();
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  return (
    <Modal open onClose={onClose} title="Refus de signature" size="sm">
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex gap-2">
          <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-600">Le refus sera tracé de manière permanente dans le journal d'audit. Un motif détaillé est obligatoire.</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Motif de refus <span className="text-red-500">*</span></label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
            placeholder="Décrivez précisément le motif du refus (min. 10 caractères)..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Mot de passe de confirmation <span className="text-red-500">*</span></label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Confirmer votre identité"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500">Annuler</button>
          <button onClick={() => mutation.mutate()} disabled={reason.length < 10 || !password || mutation.isPending}
            className="text-sm px-4 py-1.5 bg-red-600 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5">
            <XCircle size={14} />{mutation.isPending ? "Enregistrement..." : "Confirmer le refus"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal détail + audit trail ─────────────────────────────────────────────
function DetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"info" | "events" | "attempts" | "package">("info");
  const [printModal, setPrintModal] = useState(false);
  const [printCopies, setPrintCopies] = useState(1);
  const [printMotif, setPrintMotif] = useState("");

  const { data, isLoading } = useQuery<SigDetail>({
    queryKey: ["sig-detail", id],
    queryFn: () => api.get(`/signature-audit/${id}`).then(r => r.data),
  });

  const packageMut = useMutation({
    mutationFn: () => api.post(`/signature-audit/${id}/package`).then(r => r.data),
    onSuccess: () => {
      toast.success("Paquet documentaire généré");
      qc.invalidateQueries({ queryKey: ["sig-detail", id] });
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const printMut = useMutation({
    mutationFn: () => api.post(`/signature-audit/${id}/package/print`, {
      copies: printCopies, motif: printMotif || undefined,
    }).then(r => r.data),
    onSuccess: (d) => {
      toast.success(`Impression n°${d.printNo} enregistrée`);
      qc.invalidateQueries({ queryKey: ["sig-detail", id] });
      setPrintModal(false);
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const archiveMut = useMutation({
    mutationFn: () => api.post(`/signature-audit/${id}/package/archive`).then(r => r.data),
    onSuccess: () => {
      toast.success("Paquet archivé — dossier clos");
      qc.invalidateQueries({ queryKey: ["sig-detail", id] });
      qc.invalidateQueries({ queryKey: ["sig-objects"] });
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  async function downloadCert() {
    try {
      const r = await api.get(`/signature-audit/${id}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([r.data], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url;
      a.download = `certificat_${id.slice(0,8)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) { toast.error("Impossible de télécharger le certificat"); }
  }

  if (isLoading) return (
    <Modal open onClose={onClose} title="Détail signature" size="lg">
      <div className="flex items-center justify-center h-40"><RefreshCw size={20} className="animate-spin text-gray-300" /></div>
    </Modal>
  );

  const obj = data?.sigObject;
  const sig = data?.signatures?.[0];

  return (
    <Modal open onClose={onClose} title={obj?.title ?? "Détail signature"} size="lg">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{obj ? OBJ_TYPE_LABELS[obj.object_type] : ""}</span>
            <span className="text-xs text-gray-400">réf. {obj?.object_ref ?? obj?.object_id?.slice(0, 8)}</span>
            <span className="text-xs text-gray-400">v{obj?.current_version}</span>
          </div>
          {obj && <StatusBadge status={obj.status} />}
        </div>
        <div className="flex gap-1.5">
          {obj?.status === "signed" && (
            <button onClick={downloadCert} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
              <Download size={12} />Certificat
            </button>
          )}
          {obj?.status === "signed" && !data?.package && (
            <button onClick={() => packageMut.mutate()} disabled={packageMut.isPending}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-navy text-white rounded-lg disabled:opacity-50">
              <Package size={12} />{packageMut.isPending ? "Génération..." : "Générer paquet"}
            </button>
          )}
          {data?.package && ["ready_to_print","printed","reprinted"].includes(data.package.status) && (
            <button onClick={() => setPrintModal(true)}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-green-200 text-green-600 rounded-lg hover:bg-green-50">
              <Printer size={12} />Imprimer
            </button>
          )}
          {data?.package && !["archived","invalidated"].includes(data.package.status) && obj?.status === "signed" && (
            <button onClick={() => archiveMut.mutate()} disabled={archiveMut.isPending}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50">
              <Archive size={12} />Archiver
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-100 mb-4">
        {(["info","events","attempts","package"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition ${
              tab === t ? "border-navy text-navy" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}>
            {t === "info" ? "Information" : t === "events" ? "Journal" : t === "attempts" ? "Tentatives" : "Paquet"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "info" && (
        <div className="space-y-4">
          {sig && (
            <div className="grid grid-cols-2 gap-3">
              <InfoRow label="Signataire" value={sig.nomComplet ?? sig.signer_nom ?? sig.signer_user_id} icon={<User size={12} />} />
              <InfoRow label="Rôle" value={sig.signer_role} />
              <InfoRow label="Méthode" value={sig.signature_method} icon={<Shield size={12} />} />
              <InfoRow label="Statut sig." value={<StatusBadge status={sig.signature_status} />} />
              {sig.signed_at && <InfoRow label="Signé le" value={fmt(sig.signed_at)} icon={<Calendar size={12} />} />}
              {sig.ip_address && <InfoRow label="IP" value={sig.ip_address} icon={<Hash size={12} />} />}
              {sig.certificate_id && <InfoRow label="Certificat ID" value={sig.certificate_id} mono />}
              {sig.signature_hash && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-400 mb-0.5">Empreinte SHA-256</p>
                  <p className="text-xs font-mono bg-gray-50 rounded px-2 py-1 truncate">{sig.signature_hash}</p>
                </div>
              )}
              {sig.reason && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-400 mb-0.5">Motif / Commentaire</p>
                  <p className="text-xs text-gray-700">{sig.reason}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "events" && (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {(data?.events ?? []).length === 0 && <p className="text-xs text-gray-400 text-center py-6">Aucun événement</p>}
          {(data?.events ?? []).map(e => (
            <div key={e.id} className="flex gap-2 text-xs py-2 border-b border-gray-50 last:border-0">
              <span className="text-gray-300 w-28 shrink-0 font-mono">{fmt(e.created_at)}</span>
              <span className={`w-28 shrink-0 font-medium ${
                e.event_status === "signed" ? "text-green-600" :
                e.event_status === "failed" ? "text-red-500" : "text-blue-600"
              }`}>{e.event_type}</span>
              <span className="text-gray-600 flex-1 truncate">{e.message ?? "—"}</span>
              {e.user_nom && <span className="text-gray-400 shrink-0">{e.user_nom}</span>}
            </div>
          ))}
        </div>
      )}

      {tab === "attempts" && (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {(data?.attempts ?? []).length === 0 && <p className="text-xs text-gray-400 text-center py-6">Aucune tentative enregistrée</p>}
          {(data?.attempts ?? []).map(a => (
            <div key={a.id} className="flex gap-2 items-center text-xs py-1.5 border-b border-gray-50 last:border-0">
              <span className={`w-16 font-bold shrink-0 ${
                a.result === "SUCCESS" ? "text-green-600" : a.result === "BLOCKED" ? "text-red-700" : "text-red-500"
              }`}>#{a.attempt_no} {a.result}</span>
              <span className="text-gray-400 w-28 shrink-0">{fmt(a.created_at)}</span>
              <span className="text-gray-500 flex-1">{a.failure_reason ?? "—"}</span>
              <span className="text-gray-300 font-mono">{a.ip_address ?? ""}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "package" && (
        <div className="space-y-3">
          {!data?.package ? (
            <div className="text-center py-8 text-gray-400">
              <Package size={32} className="mx-auto mb-2 text-gray-200" />
              <p className="text-sm">Aucun paquet documentaire généré</p>
              {obj?.status === "signed" && (
                <button onClick={() => packageMut.mutate()} disabled={packageMut.isPending}
                  className="mt-3 text-sm px-4 py-1.5 bg-navy text-white rounded-lg disabled:opacity-50">
                  {packageMut.isPending ? "Génération..." : "Générer le paquet"}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Paquet v{data.package.version}</span>
                  <StatusBadge status={data.package.status} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <InfoRow label="Généré le" value={fmt(data.package.generated_at)} />
                  <InfoRow label="Impressions" value={`${data.package.print_count} fois`} />
                  {data.package.qr_code && <InfoRow label="URL vérif." value={data.package.qr_code} mono />}
                  {data.package.package_hash && (
                    <div className="col-span-2">
                      <p className="text-gray-400 mb-0.5">Hash paquet</p>
                      <p className="font-mono bg-white border border-gray-100 rounded px-2 py-1 truncate">{data.package.package_hash}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Impression modal */}
      {printModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-800">Enregistrer l'impression</h3>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de copies</label>
              <input type="number" min={1} max={10} value={printCopies} onChange={e => setPrintCopies(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            {data?.package && data.package.print_count > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Motif réimpression <span className="text-red-500">*</span></label>
                <input value={printMotif} onChange={e => setPrintMotif(e.target.value)}
                  placeholder="Motif obligatoire pour réimpression"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setPrintModal(false)} className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500">Annuler</button>
              <button onClick={() => printMut.mutate()} disabled={printMut.isPending}
                className="text-sm px-4 py-1.5 bg-navy text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5">
                <Printer size={14} />{printMut.isPending ? "Enregistrement..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function InfoRow({ label, value, icon, mono }: { label: string; value: React.ReactNode; icon?: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400 flex items-center gap-1 mb-0.5">{icon}{label}</p>
      <p className={`text-xs font-medium text-gray-700 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

// ─── Page principale ─────────────────────────────────────────────────────────
export default function SignaturePage() {
  const { user } = useAuth();
  const [createModal, setCreateModal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmSig, setConfirmSig] = useState<SigObject | null>(null);
  const [rejectSig, setRejectSig] = useState<SigObject | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [tab, setTab] = useState<"list" | "journal">("list");

  const { data: listData, isLoading } = useQuery<{ data: SigObject[]; total: number }>({
    queryKey: ["sig-objects", filterStatus, filterType],
    queryFn: () => api.get("/signature-audit", { params: {
      status: filterStatus || undefined,
      objectType: filterType || undefined,
    }}).then(r => r.data),
    refetchInterval: 30_000,
  });

  const { data: journalData, isLoading: journalLoading } = useQuery<{ attempts: any[]; stats: any[] }>({
    queryKey: ["sig-journal"],
    queryFn: () => api.get("/signature-audit/journal/securite").then(r => r.data),
    enabled: tab === "journal",
  });

  const { data: statsData } = useQuery({
    queryKey: ["sig-stats"],
    queryFn: () => api.get("/signature-audit/stats/global").then(r => r.data),
  });

  const canCreate = ["ADMIN","DG","DAF","DMC"].includes(user?.role ?? "");

  const items = (listData?.data ?? []).filter(o =>
    !search || o.title.toLowerCase().includes(search.toLowerCase()) ||
    (o.object_ref ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // Stats cards
  const statsByStatus = statsData?.byStatus ?? [];
  const getCount = (s: string) => statsByStatus.find((x: any) => x.status === s)?.total ?? 0;

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Shield size={22} className="text-navy" />
            Signature électronique & Audit
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Référentiel de signatures sécurisées avec traçabilité complète</p>
        </div>
        {canCreate && (
          <button onClick={() => setCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-xl text-sm font-medium hover:bg-navy/90 transition">
            <Shield size={15} />Nouvelle demande
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "En attente", status: "pending", icon: <Clock size={18} />, color: "text-gray-400" },
          { label: "En cours", status: "in_progress", icon: <RefreshCw size={18} />, color: "text-blue-500" },
          { label: "Signés", status: "signed", icon: <CheckCircle2 size={18} />, color: "text-green-500" },
          { label: "Refusés", status: "rejected", icon: <XCircle size={18} />, color: "text-red-500" },
        ].map(s => (
          <div key={s.status} onClick={() => setFilterStatus(filterStatus === s.status ? "" : s.status)}
            className={`bg-white rounded-xl border p-4 cursor-pointer transition hover:shadow-sm ${
              filterStatus === s.status ? "border-navy/30 bg-blue-50/30" : "border-gray-100"
            }`}>
            <div className={`mb-2 ${s.color}`}>{s.icon}</div>
            <p className="text-2xl font-bold text-gray-800">{getCount(s.status)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-100">
        {(["list","journal"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t ? "border-navy text-navy" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}>
            {t === "list" ? "Documents" : "Journal sécurité"}
          </button>
        ))}
      </div>

      {tab === "list" && (
        <>
          {/* Filters */}
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-500">
              <option value="">Tous types</option>
              {Object.entries(OBJ_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-500">
              <option value="">Tous statuts</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50">
                  {["Type", "Référence", "Titre", "Signataire", "Statut", "Mise à jour", "Actions"].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-gray-400 px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-300">
                    <RefreshCw size={20} className="animate-spin mx-auto" />
                  </td></tr>
                )}
                {!isLoading && items.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-300 text-sm">
                    <FileCheck size={28} className="mx-auto mb-2" />Aucun document trouvé
                  </td></tr>
                )}
                {items.map(obj => (
                  <tr key={obj.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition">
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{OBJ_TYPE_LABELS[obj.object_type]}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{obj.object_ref ?? obj.object_id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-[220px] truncate">{obj.title}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{obj.signer_nom ?? "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={obj.status} /></td>
                    <td className="px-4 py-3 text-xs text-gray-400">{fmt(obj.updated_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setSelectedId(obj.id)} title="Voir le détail"
                          className="p-1.5 text-gray-400 hover:text-navy hover:bg-blue-50 rounded-lg transition">
                          <Eye size={13} />
                        </button>
                        {["pending","in_progress"].includes(obj.status) && (
                          <>
                            <button onClick={() => setConfirmSig(obj)} title="Signer"
                              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition">
                              <Lock size={13} />
                            </button>
                            <button onClick={() => setRejectSig(obj)} title="Refuser"
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                              <XCircle size={13} />
                            </button>
                          </>
                        )}
                        {obj.status === "signed" && (
                          <button onClick={async () => {
                            try {
                              const r = await api.get(`/signature-audit/${obj.id}/download`, { responseType: "blob" });
                              const url = URL.createObjectURL(new Blob([r.data]));
                              const a = document.createElement("a"); a.href = url;
                              a.download = `cert_${obj.object_ref ?? obj.id.slice(0,8)}.json`;
                              document.body.appendChild(a); a.click(); document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                            } catch {}
                          }} title="Télécharger le certificat"
                            className="p-1.5 text-gray-400 hover:text-navy hover:bg-blue-50 rounded-lg transition">
                            <Download size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "journal" && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
              <AlertOctagon size={14} className="text-red-400" />
              <span className="text-sm font-medium text-gray-700">Tentatives d'authentification échouées</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50">
                  {["Date/Heure","Utilisateur","Rôle","Document","Tentative n°","Résultat","Motif","IP"].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-gray-400 px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {journalLoading && <tr><td colSpan={8} className="text-center py-10 text-gray-300"><RefreshCw size={20} className="animate-spin mx-auto" /></td></tr>}
                {!journalLoading && (journalData?.attempts ?? []).length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-300 text-xs">Aucune tentative échouée enregistrée</td></tr>
                )}
                {(journalData?.attempts ?? []).map((a: any) => (
                  <tr key={a.id} className="border-b border-gray-50 last:border-0 hover:bg-red-50/30">
                    <td className="px-4 py-2 text-xs font-mono text-gray-400">{fmt(a.created_at)}</td>
                    <td className="px-4 py-2 text-xs text-gray-600">{a.user_nom ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{a.signer_role ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{a.object_ref ?? a.object_type}</td>
                    <td className="px-4 py-2 text-xs text-center font-bold text-gray-600">#{a.attempt_no}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-bold ${a.result === "BLOCKED" ? "text-red-700" : "text-red-500"}`}>{a.result}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-400">{a.failure_reason ?? "—"}</td>
                    <td className="px-4 py-2 text-xs font-mono text-gray-300">{a.ip_address ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {createModal && <NouveauSigModal open onClose={() => setCreateModal(false)} />}
      {selectedId && <DetailModal id={selectedId} onClose={() => setSelectedId(null)} />}
      {confirmSig && <ConfirmSigModal sig={confirmSig} onClose={() => setConfirmSig(null)} />}
      {rejectSig && <RejectSigModal sig={rejectSig} onClose={() => setRejectSig(null)} />}
    </div>
  );
}
