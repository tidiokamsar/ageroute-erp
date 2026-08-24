/**
 * Référentiel Entreprises — Module complet CDC
 * Onglets : Identité · Documents · Conformité · Contacts · Marchés · Décomptes · Performance · Historique
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError, fmtGnf } from "../lib/api";
import { ExportButton } from "../components/ui/ExportButton";
import { FileUploadModal, DocumentViewer } from "../components/ui/FileUploadModal";
import { useAuth, canWrite } from "../lib/auth";
import { Button } from "../components/ui/Button";
import { Input, Select, FormField, Textarea } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { toast } from "../components/ui/Toast";
import { SecureFileLink } from "../components/ui/SecureFile";
import {
  Plus, Search, Building2, Pencil, Trash2, CheckCircle2, XCircle, AlertTriangle,
  ShieldCheck, ShieldAlert, ShieldX, Lock, Unlock, RefreshCw, FileText,
  Users, BarChart2, Activity, ChevronRight, Bell, BellOff, Upload,
  ClipboardList, CreditCard, ArrowRight, Star, TrendingDown,
  UserCheck,
  History} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Entreprise {
  id: string;
  raisonSociale: string; sigle?: string; formeJuridique?: string;
  nif: string; numerotva?: string; rccm?: string; dateCreation?: string;
  adresse?: string; ville?: string; commune?: string;
  telephone?: string; email?: string; siteWeb?: string;
  dirigeant?: string; representantLegal?: string; qualiteRepresentant?: string;
  agrement?: string; categorieAgrement?: string; classement?: string;
  domainesCompetence?: string[];
  iban?: string; nomBanque?: string; codeBanque?: string;
  statut: "CONFORME" | "A_REGULARISER" | "BLOQUE";
  scoreConformite: number; motifBlocage?: string;
  regimeFiscal?: string; assujettTVA: boolean;
  regulariteFiscale: boolean; attestationFiscaleNum?: string; attestationFiscaleExpire?: string;
  regulariteSociale: boolean; attestationSocialeNum?: string; attestationSocialeExpire?: string;
  attestationValide: boolean; cautionBancaire: boolean;
  estRadie: boolean; estSuspendu: boolean; estInterditSoumission: boolean;
  autoriseContracterEtat: boolean;
  dateVerification?: string;
  alertes?: Alerte[];
  _count?: { marches: number; decomptes: number; documents: number; alertes: number };
  createdAt: string;
}

interface DocumentEnt {
  id: string; type: string; libelle?: string; numero?: string;
  url?: string; dateEmission?: string; dateExpiration?: string;
  valide: boolean; verifieAt?: string; observations?: string; actif: boolean;
}

interface Contact {
  id: string; nom: string; prenom?: string; fonction?: string;
  telephone?: string; email?: string; principal: boolean;
}

interface Alerte {
  id: string; type: string; niveau: string; message: string;
  echeance?: string; acquittee: boolean; createdAt: string;
}

interface HistoriqueConf {
  id: string; scoreAvant: number; scoreApres: number;
  statutAvant: string; statutApres: string;
  detail?: Record<string, { ok: boolean; pts: number; max: number; expire?: string }>;
  auteur?: string; commentaire?: string; declencheurType?: string; createdAt: string;
}

interface MarckeLie {
  id: string; reference: string; intitule: string; statut: string;
  montantInitialGnf: string; dateFinPrevue?: string;
  _count?: { decomptes: number };
}

interface DecompteLie {
  id: string; reference: string; type: string; statut: string;
  netAPayer: string; createdAt: string;
  marche?: { reference: string; intitule: string };
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const TYPES_DOC = [
  { value:"REGISTRE_COMMERCE",   label:"Registre de commerce (RCCM)" },
  { value:"STATUTS_SOCIETE",     label:"Statuts de la société" },
  { value:"NIF_DOCUMENT",        label:"Document NIF" },
  { value:"TVA_DOCUMENT",        label:"Document TVA" },
  { value:"ATTESTATION_FISCALE", label:"Attestation de régularité fiscale" },
  { value:"ATTESTATION_SOCIALE", label:"Attestation sociale (CNSS)" },
  { value:"PIECE_REPRESENTANT",  label:"Pièce d'identité représentant légal" },
  { value:"AGREMENT_TECHNIQUE",  label:"Agrément technique" },
  { value:"AUTORISATION_SPECIFIQUE", label:"Autorisation spécifique" },
  { value:"RELEVE_BANCAIRE",     label:"Relevé d'identité bancaire (RIB)" },
  { value:"BILAN_COMPTABLE",     label:"Bilan comptable" },
  { value:"AUTRE",               label:"Autre document" },
];

const STATUT_MARCHE_COLORS: Record<string,string> = {
  EN_EXECUTION:"bg-green-50 text-green-700", ACTIF:"bg-emerald-50 text-emerald-700",
  SIGNE:"bg-indigo-50 text-indigo-700",      NOTIFIE:"bg-cyan-50 text-cyan-700",
  SUSPENDU:"bg-amber-50 text-amber-700",     RESILIE:"bg-red-50 text-red-700",
  SOLDE:"bg-teal-50 text-teal-700",          CLOTURE:"bg-gray-50 text-gray-500",
};

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-GN", { day:"2-digit", month:"2-digit", year:"numeric" });
}

function ScoreBadge({ statut, score }: { statut: string; score: number }) {
  if (statut === "CONFORME") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">
      <ShieldCheck className="h-3.5 w-3.5"/>{score}/100 CONFORME
    </span>
  );
  if (statut === "A_REGULARISER") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
      <ShieldAlert className="h-3.5 w-3.5"/>{score}/100 À RÉGULARISER
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
      <ShieldX className="h-3.5 w-3.5"/>{score}/100 BLOQUÉE
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-green-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div className={`h-2 rounded-full ${color} transition-all`} style={{ width:`${score}%` }}/>
    </div>
  );
}

function NiveauBadge({ niveau }: { niveau: string }) {
  const map: Record<string,string> = {
    AVERTISSEMENT:"bg-amber-50 text-amber-700", URGENT:"bg-orange-50 text-orange-700",
    CRITIQUE:"bg-red-50 text-red-700",
  };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${map[niveau]??"bg-gray-100 text-gray-500"}`}>{niveau}</span>;
}

function ExpireBadge({ date }: { date?: string | null }) {
  if (!date) return <span className="text-gray-300 text-xs">—</span>;
  const exp = new Date(date);
  const now = new Date();
  const diff = (exp.getTime() - now.getTime()) / 86400000;
  if (diff < 0)   return <span className="text-[11px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded">⛔ Expirée</span>;
  if (diff <= 7)  return <span className="text-[11px] font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded">⚠ J-{Math.ceil(diff)}</span>;
  if (diff <= 30) return <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">⏰ J-{Math.ceil(diff)}</span>;
  return <span className="text-[11px] text-green-700 bg-green-50 px-2 py-0.5 rounded">{fmtDate(date)}</span>;
}

function CritereRow({ label, ok, pts, max, expire }: { label:string; ok:boolean; pts:number; max:number; expire?:string }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${ok ? "bg-green-50" : "bg-red-50"}`}>
      <div className="flex items-center gap-2">
        {ok ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0"/> : <XCircle className="h-4 w-4 text-red-500 shrink-0"/>}
        <span className={ok ? "text-green-800" : "text-red-700 font-medium"}>{label}</span>
        {expire && <ExpireBadge date={expire}/>}
      </div>
      <span className={`text-xs font-bold ${ok ? "text-green-700" : "text-red-400"}`}>{pts}/{max} pts</span>
    </div>
  );
}

function KpiCard({ label, value, color="text-navy", bg="bg-white", sub }: { label:string; value:string|number; color?:string; bg?:string; sub?:string }) {
  return (
    <div className={`${bg} border border-gray-100 rounded-xl px-4 py-3 shadow-sm`}>
      <p className="text-[11px] text-gray-500 font-medium">{label}</p>
      <p className={`text-base font-black ${color} mt-0.5 truncate`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Composant principal ─────────────────────────────────────────────────────

type DetailTab = "identite"|"documents"|"conformite"|"contacts"|"marches"|"decomptes"|"performance"|"historique"|"workflow"|"utilisateurs"|"suivi";

export function EntreprisesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Liste
  const [search, setSearch]   = useState("");
  const [statut, setStatut]   = useState("");
  const [page, setPage]       = useState(1);

  // Modals
  const [modal, setModal]     = useState<Entreprise | null | "new">(null);
  const [form, setForm]       = useState<Record<string,unknown>>({});
  const [detail, setDetail]   = useState<Entreprise | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("identite");
  const [statutForm2, setStatutForm2] = useState({ statut: "", commentaire: "" });
  const [statutModal2, setStatutModal2] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string|null>(null);

  // Sous-modals
  const [blocModal, setBlocModal]     = useState(false);
  const [deblocModal, setDeblocModal] = useState(false);
  const [blocForm, setBlocForm]       = useState({ motif: "" });
  const [deblocForm, setDeblocForm]   = useState({ commentaire: "" });
  const [docModal, setDocModal]       = useState(false);
  const [docForm, setDocForm]         = useState<Record<string,unknown>>({});
  const [contactModal, setContactModal] = useState(false);
  const [contactForm, setContactForm]   = useState<Record<string,unknown>>({});

  // ─── Queries ────────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: ["entreprises", page, search, statut],
    queryFn: () => api.get("/entreprises", { params:{ page, search:search||undefined, statut:statut||undefined } }).then(r => r.data),
  });
  const { data: stats } = useQuery({
    queryKey: ["entreprises-stats"],
    queryFn: () => api.get("/entreprises/stats").then(r => r.data),
  });
  const { data: documents } = useQuery({
    queryKey: ["ent-documents", detail?.id],
    queryFn: () => api.get(`/entreprises/${detail!.id}/documents`).then(r => r.data),
    enabled: !!detail && detailTab === "documents",
  });
  const { data: contacts } = useQuery({
    queryKey: ["ent-contacts", detail?.id],
    queryFn: () => api.get(`/entreprises/${detail!.id}/contacts`).then(r => r.data),
    enabled: !!detail && detailTab === "contacts",
  });
  const { data: alertes } = useQuery({
    queryKey: ["ent-alertes", detail?.id],
    queryFn: () => api.get(`/entreprises/${detail!.id}/alertes`).then(r => r.data),
    enabled: !!detail && (detailTab === "conformite" || detailTab === "identite"),
  });
  const { data: conformiteHisto } = useQuery({
    queryKey: ["ent-histo-conf", detail?.id],
    queryFn: () => api.get(`/entreprises/${detail!.id}/historique-conformite`).then(r => r.data),
    enabled: !!detail && detailTab === "historique",
  });
  const { data: marchesLies } = useQuery({
    queryKey: ["ent-marches", detail?.id],
    queryFn: () => api.get(`/entreprises/${detail!.id}/marches`).then(r => r.data),
    enabled: !!detail && detailTab === "marches",
  });
  const { data: decomptesLies } = useQuery({
    queryKey: ["ent-decomptes", detail?.id],
    queryFn: () => api.get(`/entreprises/${detail!.id}/decomptes`).then(r => r.data),
    enabled: !!detail && detailTab === "decomptes",
  });
  const { data: performance } = useQuery({
    queryKey: ["ent-perf", detail?.id],
    queryFn: () => api.get(`/entreprises/${detail!.id}/performance`).then(r => r.data),
    enabled: !!detail && detailTab === "performance",
  });

  const { data: usersLies, isLoading: usersLoading } = useQuery({
    queryKey: ["ent-users", detail?.id],
    queryFn: () => api.get(`/entreprises/${detail!.id}/users`).then(r => r.data),
    enabled: !!detail && detailTab === "utilisateurs",
  });
  const { data: statusHistory } = useQuery({
    queryKey: ["ent-status-hist", detail?.id],
    queryFn: () => api.get(`/entreprises/${detail!.id}/status-history`).then(r => r.data),
    enabled: !!detail && detailTab === "suivi",
  });
  const { data: auditTrail } = useQuery({
    queryKey: ["ent-audit", detail?.id],
    queryFn: () => api.get(`/entreprises/${detail!.id}/audit-trail`).then(r => r.data),
    enabled: !!detail && detailTab === "suivi",
  });
  const changeStatutMut = useMutation({
    mutationFn: (body: { statut: string; commentaire: string }) =>
      api.patch(`/entreprises/${detail!.id}/statut`, body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entreprises"] });
      qc.invalidateQueries({ queryKey: ["ent-status-hist", detail?.id] });
      setStatutModal2(false);
    },
  });

  // ─── Mutations ──────────────────────────────────────────────────────────

  function inv() {
    qc.invalidateQueries({ queryKey: ["entreprises"] });
    qc.invalidateQueries({ queryKey: ["entreprises-stats"] });
  }

  const createMut = useMutation({
    mutationFn: (b: object) => api.post("/entreprises", b).then(r => r.data),
    onSuccess: () => { inv(); toast.success("Entreprise créée"); setModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id:string; body:object }) => api.put(`/entreprises/${id}`, body),
    onSuccess: () => { inv(); toast.success("Entreprise mise à jour"); setModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/entreprises/${id}`),
    onSuccess: () => { inv(); toast.success("Entreprise supprimée"); setConfirmDel(null); setDetail(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const verifierMut = useMutation({
    mutationFn: (id: string) => api.post(`/entreprises/${id}/conformite/verifier`, { commentaire: "Recalcul manuel" }).then(r => r.data),
    onSuccess: (res, id) => {
      qc.invalidateQueries({ queryKey: ["ent-histo-conf", id] });
      qc.invalidateQueries({ queryKey: ["entreprises"] });
      const r = res as { score: number; statut: string };
      toast.success(`Score recalculé : ${r.score}/100 — ${r.statut}`);
      if (detail) setDetail(d => d ? { ...d, scoreConformite: r.score, statut: r.statut as never } : d);
    },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const bloquerMut = useMutation({
    mutationFn: ({ id, motif }: { id:string; motif:string }) => api.post(`/entreprises/${id}/bloquer`, { motif }).then(r => r.data),
    onSuccess: () => { inv(); toast.success("Entreprise bloquée"); setBlocModal(false); if (detail) setDetail(d => d ? { ...d, statut:"BLOQUE" } : d); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const debloquerMut = useMutation({
    mutationFn: ({ id, commentaire }: { id:string; commentaire:string }) => api.post(`/entreprises/${id}/debloquer`, { commentaire }).then(r => r.data),
    onSuccess: (res) => { inv(); toast.success("Entreprise débloquée"); setDeblocModal(false); const r = res as { statut: string; scoreConformite: number }; if (detail) setDetail(d => d ? { ...d, statut: r.statut as never, scoreConformite: r.scoreConformite } : d); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const addDocMut = useMutation({
    mutationFn: (b: object) => api.post(`/entreprises/${detail!.id}/documents`, b).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ent-documents"] }); inv(); toast.success("Document ajouté"); setDocModal(false); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const validerDocMut = useMutation({
    mutationFn: ({ docId, valide }: { docId:string; valide:boolean }) =>
      api.post(`/entreprises/${detail!.id}/documents/${docId}/valider`, { valide }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ent-documents"] }); inv(); toast.success("Document mis à jour"); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const addContactMut = useMutation({
    mutationFn: (b: object) => api.post(`/entreprises/${detail!.id}/contacts`, b).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ent-contacts"] }); toast.success("Contact ajouté"); setContactModal(false); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const acquitterMut = useMutation({
    mutationFn: ({ id, aid }: { id:string; aid:string }) => api.post(`/entreprises/${id}/alertes/${aid}/acquitter`, {}).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ent-alertes"] }); toast.success("Alerte acquittée"); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  // ─── Handlers ───────────────────────────────────────────────────────────

  function openNew() { setForm({ assujettTVA:false, regulariteFiscale:false, regulariteSociale:false, attestationValide:false, cautionBancaire:false, estRadie:false, estSuspendu:false, autoriseContracterEtat:true }); setModal("new"); }
  function openEdit(e: Entreprise) { setForm({ ...e }); setModal(e); }
  function handleSubmit() {
    if (modal === "new") createMut.mutate(form);
    else if (modal && typeof modal === "object") updateMut.mutate({ id: modal.id, body: form });
  }
  function f(k: string, v: unknown) { setForm(p => ({ ...p, [k]: v })); }

  const items: Entreprise[] = data?.data ?? [];

  const TABS: { key: DetailTab; label: string; icon: React.ElementType }[] = [
    { key:"identite",     label:"Identité",       icon:Building2 },
    { key:"documents",    label:"Documents",       icon:FileText },
    { key:"conformite",   label:"Conformité",      icon:ShieldCheck },
    { key:"contacts",     label:"Contacts",        icon:Users },
    { key:"marches",      label:"Marchés",         icon:ClipboardList },
    { key:"decomptes",    label:"Décomptes",       icon:CreditCard },
    { key:"performance",  label:"Performance",     icon:BarChart2 },
    { key:"historique",   label:"Historique",      icon:Activity },
    { key:"utilisateurs", label:"Utilisateurs",    icon:UserCheck },
    { key:"suivi",        label:"Suivi & Audit",   icon:History },
  ];

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* KPIs globaux */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <KpiCard label="Total"           value={stats.total}            bg="bg-white" />
          <KpiCard label="Conformes"       value={stats.conformes}        color="text-green-700" bg="bg-green-50" />
          <KpiCard label="À régulariser"   value={stats.aRegulariser}     color="text-amber-700" bg="bg-amber-50" />
          <KpiCard label="Bloquées"        value={stats.bloques}          color="text-red-700"   bg="bg-red-50" />
          <KpiCard label="Radiées"         value={stats.radies}           color="text-gray-500"  bg="bg-gray-50" />
          <KpiCard label="Alertes urgentes" value={stats.alertesUrgentes} color="text-orange-700" bg="bg-orange-50" />
        </div>
      )}

      {/* Filtres */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"/>
          <Input className="pl-9" placeholder="NIF, Raison sociale, RCCM…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}/>
        </div>
        <div className="flex gap-1.5">
          {[{v:"",l:"Toutes"},{v:"CONFORME",l:"✅ Conformes"},{v:"A_REGULARISER",l:"⚠ À régulariser"},{v:"BLOQUE",l:"🔴 Bloquées"}].map(({ v, l }) => (
            <Button key={v} size="sm" variant={statut === v ? "primary" : "secondary"} onClick={() => { setStatut(v); setPage(1); }}>{l}</Button>
          ))}
        </div>
        {canWrite(user?.role) && (
          <Button className="ml-auto" onClick={openNew}><Plus className="h-4 w-4 mr-1"/>Nouvelle entreprise</Button>
        )}
      </div>

      {/* Tableau liste */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-navy/5 border-b border-navy/10">
            <tr>{["NIF","Entreprise","Statut conformité","Score","Alertes","Marchés","Actions"].map(h => (
              <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-navy/60 uppercase tracking-wide">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && Array.from({length:5}).map((_,i) => (
              <tr key={i}><td colSpan={7}><div className="h-12 animate-pulse bg-gray-50 m-2 rounded"/></td></tr>
            ))}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={7} className="py-14 text-center text-gray-400">
                <Building2 className="h-10 w-10 mx-auto mb-2 opacity-20"/>Aucune entreprise trouvée
              </td></tr>
            )}
            {items.map(e => {
              const alertesCrit = (e.alertes ?? []).filter(a => a.niveau === "CRITIQUE").length;
              const alertesUrg  = (e.alertes ?? []).filter(a => a.niveau === "URGENT").length;
              return (
                <tr key={e.id} className="hover:bg-gray-50/70 cursor-pointer transition-colors"
                  onClick={() => { setDetail(e); setDetailTab("identite"); }}>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-navy">{e.nif}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-800">{e.raisonSociale}</p>
                    <p className="text-[10px] text-gray-400">{e.formeJuridique ?? ""} {e.sigle ? `· ${e.sigle}` : ""}</p>
                  </td>
                  <td className="px-4 py-3"><ScoreBadge statut={e.statut} score={e.scoreConformite}/></td>
                  <td className="px-4 py-3 w-36">
                    <ScoreBar score={e.scoreConformite}/>
                    <p className="text-[10px] text-gray-400 mt-0.5">{e.scoreConformite}/100</p>
                  </td>
                  <td className="px-4 py-3">
                    {alertesCrit > 0 && <span className="text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded mr-1">🔴 {alertesCrit}</span>}
                    {alertesUrg  > 0 && <span className="text-[10px] font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded">⚠ {alertesUrg}</span>}
                    {alertesCrit === 0 && alertesUrg === 0 && <span className="text-[10px] text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium">{e._count?.marches ?? 0}</td>
                  <td className="px-4 py-3" onClick={ev => ev.stopPropagation()}>
                    <div className="flex gap-1">
                      {canWrite(user?.role) && <Button size="sm" variant="ghost" onClick={() => openEdit(e)}><Pencil className="h-3.5 w-3.5"/></Button>}
                      {user?.role === "ADMIN" && <Button size="sm" variant="ghost" onClick={() => setConfirmDel(e.id)}><Trash2 className="h-3.5 w-3.5 text-red-400"/></Button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data && data.totalPages > 1 && (
          <div className="flex justify-center gap-2 py-3 border-t border-gray-50">
            <Button size="sm" variant="secondary" disabled={page<=1} onClick={() => setPage(p=>p-1)}>Précédent</Button>
            <span className="text-sm text-gray-500 self-center">Page {page} / {data.totalPages}</span>
            <Button size="sm" variant="secondary" disabled={page>=data.totalPages} onClick={() => setPage(p=>p+1)}>Suivant</Button>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════
          MODAL FICHE ENTREPRISE — ONGLETS
          ════════════════════════════════════════ */}
      <Modal open={detail !== null} onClose={() => setDetail(null)}
        title={`${detail?.raisonSociale} — ${detail?.nif}`} size="xl">
        {detail && (
          <div className="space-y-4">

            {/* En-tête score + actions rapides */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <ScoreBadge statut={detail.statut} score={detail.scoreConformite}/>
                <div className="w-32"><ScoreBar score={detail.scoreConformite}/></div>
                {detail.estRadie && <span className="text-[10px] font-bold bg-gray-200 text-gray-700 px-2 py-0.5 rounded">RADIÉE</span>}
                {detail.estSuspendu && <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">SUSPENDUE</span>}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="secondary" onClick={() => verifierMut.mutate(detail.id)} disabled={verifierMut.isPending}>
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${verifierMut.isPending?"animate-spin":""}`}/>Recalculer
                </Button>
                {canWrite(user?.role) && detail.statut !== "BLOQUE" && (
                  <Button size="sm" variant="secondary" onClick={() => setBlocModal(true)}>
                    <Lock className="h-3.5 w-3.5 mr-1"/>Bloquer
                  </Button>
                )}
                {canWrite(user?.role) && detail.statut === "BLOQUE" && (
                  <Button size="sm" onClick={() => setDeblocModal(true)}>
                    <Unlock className="h-3.5 w-3.5 mr-1"/>Débloquer
                  </Button>
                )}
                {canWrite(user?.role) && (
                  <Button size="sm" onClick={() => { openEdit(detail); setDetail(null); }}>
                    <Pencil className="h-3.5 w-3.5 mr-1"/>Modifier
                  </Button>
                )}
              </div>
            </div>

            {/* Alertes actives en bandeau */}
            {(alertes ?? []).length > 0 && (
              <div className="space-y-1.5">
                {(alertes as Alerte[]).slice(0,3).map(a => (
                  <div key={a.id} className="flex items-start justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5"/>
                      <div>
                        <NiveauBadge niveau={a.niveau}/>
                        <p className="text-xs text-amber-800 mt-0.5">{a.message}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => acquitterMut.mutate({ id:detail.id, aid:a.id })}>
                      <BellOff className="h-3.5 w-3.5"/>
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Onglets */}
            <div className="flex gap-0.5 border-b border-gray-200 overflow-x-auto scrollbar-hide">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => setDetailTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                    detailTab === key ? "border-navy text-navy" : "border-transparent text-gray-400 hover:text-gray-600"
                  }`}>
                  <Icon className="h-3.5 w-3.5"/>{label}
                </button>
              ))}
            </div>

            {/* ── Identité ── */}
            {detailTab === "identite" && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-x-6 gap-y-3 text-sm">
                  <div className="col-span-3 text-[10px] font-black tracking-widest text-gray-400 uppercase border-b pb-1"> Identité légale</div>
                  {[
                    ["Raison sociale", detail.raisonSociale], ["Sigle", detail.sigle], ["Forme juridique", detail.formeJuridique],
                    ["NIF", detail.nif], ["N° TVA", detail.numerotva], ["RCCM", detail.rccm],
                    ["Date création", fmtDate(detail.dateCreation)],
                    ["Représentant légal", detail.representantLegal ?? detail.dirigeant],
                    ["Qualité", detail.qualiteRepresentant],
                  ].map(([k,v]) => (
                    <div key={String(k)}><p className="text-[10px] text-gray-400">{k}</p><p className="font-medium text-gray-800 mt-0.5">{v ?? "—"}</p></div>
                  ))}

                  <div className="col-span-3 text-[10px] font-black tracking-widest text-gray-400 uppercase border-b pb-1 mt-2"> Administratif</div>
                  {[
                    ["Adresse", detail.adresse], ["Ville", detail.ville], ["Commune", detail.commune],
                    ["Téléphone", detail.telephone], ["Email", detail.email], ["Site web", detail.siteWeb],
                    ["Agrément", detail.agrement], ["Catégorie", detail.categorieAgrement], ["Classement", detail.classement],
                    ["IBAN", detail.iban], ["Banque", detail.nomBanque], ["Code banque", detail.codeBanque],
                  ].map(([k,v]) => (
                    <div key={String(k)}><p className="text-[10px] text-gray-400">{k}</p><p className="font-medium text-gray-800 mt-0.5 break-all">{v ?? "—"}</p></div>
                  ))}

                  <div className="col-span-3 text-[10px] font-black tracking-widest text-gray-400 uppercase border-b pb-1 mt-2"> Fiscal & social</div>
                  {[
                    ["Régime fiscal", detail.regimeFiscal], ["Assujetti TVA", detail.assujettTVA ? "Oui" : "Non"],
                    ["Régularité fiscale", detail.regulariteFiscale ? "✅ Oui" : "❌ Non"],
                    ["N° attestation fiscale", detail.attestationFiscaleNum],
                    ["Expiration attestation fiscale", ""],
                    ["Régularité sociale", detail.regulariteSociale ? "✅ Oui" : "❌ Non"],
                    ["N° attestation sociale", detail.attestationSocialeNum],
                  ].map(([k,v]) => {
                    if (k === "Expiration attestation fiscale") return (
                      <div key={String(k)}><p className="text-[10px] text-gray-400">{k}</p><div className="mt-0.5"><ExpireBadge date={detail.attestationFiscaleExpire}/></div></div>
                    );
                    return <div key={String(k)}><p className="text-[10px] text-gray-400">{k}</p><p className="font-medium text-gray-800 mt-0.5">{v ?? "—"}</p></div>;
                  })}

                  <div className="col-span-3 text-[10px] font-black tracking-widest text-gray-400 uppercase border-b pb-1 mt-2"> Statut juridique</div>
                  {[
                    ["Radiée", detail.estRadie ? "🔴 Oui" : "Non"],
                    ["Suspendue", detail.estSuspendu ? "🟠 Oui" : "Non"],
                    ["Interdite de soumission", detail.estInterditSoumission ? "🔴 Oui" : "Non"],
                    ["Autorisée à contracter", detail.autoriseContracterEtat ? "✅ Oui" : "❌ Non"],
                  ].map(([k,v]) => (
                    <div key={String(k)}><p className="text-[10px] text-gray-400">{k}</p><p className="font-medium text-gray-800 mt-0.5">{v ?? "—"}</p></div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Documents ── */}
            {detailTab === "documents" && (
              <div className="space-y-3">
                {canWrite(user?.role) && (
                  <Button size="sm" onClick={() => { setDocForm({}); setDocModal(true); }}>
                    <Upload className="h-4 w-4 mr-1"/>Ajouter un document
                  </Button>
                )}
                {!(documents ?? []).length && <p className="text-sm text-gray-400 py-8 text-center">Aucun document enregistré</p>}
                {(documents as DocumentEnt[] ?? []).map(doc => {
                  const typeLabel = TYPES_DOC.find(t => t.value === doc.type)?.label ?? doc.type;
                  return (
                    <div key={doc.id} className={`border rounded-lg p-3 text-sm ${doc.valide ? "border-green-200 bg-green-50/30" : "border-gray-200"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {doc.valide
                              ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0"/>
                              : <XCircle className="h-4 w-4 text-gray-300 shrink-0"/>}
                            <span className="font-semibold text-gray-800">{typeLabel}</span>
                            {doc.numero && <span className="text-[10px] text-gray-400">N°{doc.numero}</span>}
                            {doc.url && (
                              <SecureFileLink href={doc.url}
                                 className="text-[10px] font-bold text-navy underline hover:text-navy/70">
                                📄 Ouvrir le document
                              </SecureFileLink>
                            )}
                          </div>
                          <div className="flex gap-4 mt-1 text-[11px] text-gray-500">
                            <span>Émis : {fmtDate(doc.dateEmission)}</span>
                            <span>Expire : <ExpireBadge date={doc.dateExpiration}/></span>
                          </div>
                          {doc.observations && <p className="text-[11px] text-gray-500 mt-1 italic">{doc.observations}</p>}
                        </div>
                        {canWrite(user?.role) && (
                          <div className="flex gap-1 shrink-0">
                            <Button size="sm" variant="secondary"
                              onClick={() => validerDocMut.mutate({ docId: doc.id, valide: !doc.valide })}>
                              {doc.valide ? "Invalider" : "Valider"}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Conformité ── */}
            {detailTab === "conformite" && (
              <div className="space-y-4">
                {/* Panneau score */}
                <div className="bg-navy/5 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-bold text-navy">Score de conformité : {detail.scoreConformite}/100</p>
                    <ScoreBadge statut={detail.statut} score={detail.scoreConformite}/>
                  </div>
                  <ScoreBar score={detail.scoreConformite}/>
                  <p className="text-[11px] text-gray-500 mt-2">Dernière vérification : {fmtDate(detail.dateVerification)}</p>
                </div>

                {/* Motif blocage */}
                {detail.statut === "BLOQUE" && detail.motifBlocage && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5"/>
                    <div>
                      <p className="text-xs font-bold text-red-800">Motif de blocage</p>
                      <p className="text-xs text-red-700 mt-0.5">{detail.motifBlocage}</p>
                    </div>
                  </div>
                )}

                {/* Critères détail — recalculé côté client pour affichage immédiat */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Détail des 10 critères</p>
                  <CritereRow label="NIF valide"                  ok={!!detail.nif}                          pts={detail.nif ? 10 : 0} max={10} />
                  <CritereRow label="RCCM valide"                 ok={!!detail.rccm}                         pts={detail.rccm ? 10 : 0} max={10} />
                  <CritereRow label="Raison sociale"              ok={!!detail.raisonSociale}                pts={detail.raisonSociale ? 5 : 0} max={5} />
                  <CritereRow label="Régularité fiscale déclarée" ok={detail.regulariteFiscale}              pts={detail.regulariteFiscale ? 20 : 0} max={20} />
                  <CritereRow label="Attestation fiscale valide"  ok={!!detail.attestationFiscaleExpire && new Date(detail.attestationFiscaleExpire) > new Date()} pts={!!detail.attestationFiscaleExpire && new Date(detail.attestationFiscaleExpire) > new Date() ? 15 : 0} max={15} expire={detail.attestationFiscaleExpire} />
                  <CritereRow label="Régularité sociale déclarée" ok={detail.regulariteSociale}              pts={detail.regulariteSociale ? 15 : 0} max={15} />
                  <CritereRow label="Attestation sociale valide"  ok={!detail.assujettTVA || (!!detail.attestationSocialeExpire && new Date(detail.attestationSocialeExpire) > new Date())} pts={(!detail.assujettTVA || (!!detail.attestationSocialeExpire && new Date(detail.attestationSocialeExpire) > new Date())) ? 10 : 0} max={10} expire={detail.attestationSocialeExpire} />
                  <CritereRow label="IBAN / RIB bancaire"         ok={!!detail.iban}                         pts={detail.iban ? 10 : 0} max={10} />
                  <CritereRow label="Agrément technique"          ok={!!detail.agrement}                     pts={detail.agrement ? 5 : 0} max={5} />
                  <CritereRow label="Absence radiation/suspension" ok={!detail.estRadie && !detail.estSuspendu} pts={0} max={0} />
                </div>

                {/* Toutes les alertes */}
                {(alertes ?? []).length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Alertes actives ({alertes?.length})</p>
                    {(alertes as Alerte[]).map(a => (
                      <div key={a.id} className="flex items-center justify-between border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 text-xs">
                        <div className="flex items-center gap-2">
                          <NiveauBadge niveau={a.niveau}/>
                          <span className="text-amber-800">{a.message}</span>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => acquitterMut.mutate({ id:detail.id, aid:a.id })}>
                          <BellOff className="h-3 w-3"/>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Contacts ── */}
            {detailTab === "contacts" && (
              <div className="space-y-3">
                {canWrite(user?.role) && (
                  <Button size="sm" onClick={() => { setContactForm({ principal:false }); setContactModal(true); }}>
                    <Plus className="h-4 w-4 mr-1"/>Ajouter un contact
                  </Button>
                )}
                {!(contacts ?? []).length && <p className="text-sm text-gray-400 py-8 text-center">Aucun contact enregistré</p>}
                {(contacts as Contact[] ?? []).map(c => (
                  <div key={c.id} className={`border rounded-lg p-3 text-sm flex items-start justify-between ${c.principal ? "border-navy/20 bg-navy/5" : "border-gray-200"}`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">{c.nom} {c.prenom}</span>
                        {c.principal && <span className="text-[10px] font-bold bg-navy/10 text-navy px-2 py-0.5 rounded">Principal</span>}
                      </div>
                      {c.fonction && <p className="text-[11px] text-gray-500 mt-0.5">{c.fonction}</p>}
                      <div className="flex gap-4 text-[11px] text-gray-400 mt-1">
                        {c.telephone && <span>📞 {c.telephone}</span>}
                        {c.email && <span>✉ {c.email}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Marchés ── */}
            {detailTab === "marches" && (
              <div className="overflow-x-auto">
                {!(marchesLies ?? []).length && <p className="text-sm text-gray-400 py-8 text-center">Aucun marché</p>}
                {(marchesLies ?? []).length > 0 && (
                  <table className="w-full text-sm border border-gray-100 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50"><tr>
                      {["Référence","Intitulé","Statut","Montant HT","Fin prévue","Décomptes"].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {(marchesLies as MarckeLie[]).map(m => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-xs font-bold text-navy">{m.reference}</td>
                          <td className="px-3 py-2 max-w-[200px] truncate">{m.intitule}</td>
                          <td className="px-3 py-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUT_MARCHE_COLORS[m.statut]??"bg-gray-100 text-gray-500"}`}>{m.statut}</span></td>
                          <td className="px-3 py-2 font-semibold">{fmtGnf(m.montantInitialGnf)}</td>
                          <td className="px-3 py-2 text-xs"><ExpireBadge date={m.dateFinPrevue}/></td>
                          <td className="px-3 py-2 text-center">{m._count?.decomptes ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-navy/5 border-t">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-xs font-bold">Total</td>
                        <td className="px-3 py-2 font-black text-navy">
                          {fmtGnf((marchesLies as MarckeLie[]).reduce((s,m)=>s+Number(m.montantInitialGnf),0).toString())}
                        </td>
                        <td colSpan={2}/>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}

            {/* ── Décomptes ── */}
            {detailTab === "decomptes" && (
              <div className="overflow-x-auto">
                {!(decomptesLies ?? []).length && <p className="text-sm text-gray-400 py-8 text-center">Aucun décompte</p>}
                {(decomptesLies ?? []).length > 0 && (
                  <table className="w-full text-sm border border-gray-100 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50"><tr>
                      {["Référence","Marché","Type","Statut","Net à payer","Date"].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {(decomptesLies as DecompteLie[]).map(d => (
                        <tr key={d.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-xs font-bold text-navy">{d.reference}</td>
                          <td className="px-3 py-2 max-w-[150px] truncate text-xs text-gray-500">{d.marche?.reference}</td>
                          <td className="px-3 py-2 text-xs">{d.type}</td>
                          <td className="px-3 py-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              d.statut==="PAYE"?"bg-green-100 text-green-700":d.statut==="REJETE"?"bg-red-100 text-red-700":"bg-amber-100 text-amber-700"
                            }`}>{d.statut}</span>
                          </td>
                          <td className="px-3 py-2 font-semibold">{fmtGnf(d.netAPayer)}</td>
                          <td className="px-3 py-2 text-[11px] text-gray-400">{fmtDate(d.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ── Performance ── */}
            {detailTab === "performance" && (
              <div className="space-y-4">
                {!performance ? (
                  <div className="h-24 bg-gray-50 animate-pulse rounded-xl"/>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <KpiCard label="Marchés total"    value={performance.marches.total}    />
                      <KpiCard label="En cours"         value={performance.marches.enCours}   color="text-green-700" bg="bg-green-50" />
                      <KpiCard label="Résiliés"         value={performance.marches.resilies}  color="text-red-600"   bg="bg-red-50" />
                      <KpiCard label="Volume total"     value={fmtGnf(performance.marches.montantTotalGnf)} color="text-navy" bg="bg-navy/5" />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <KpiCard label="Décomptes déposés" value={performance.decomptes.total}   />
                      <KpiCard label="Rejetés"           value={performance.decomptes.rejetes} color="text-red-600" bg="bg-red-50" />
                      <KpiCard label="Payés"             value={performance.decomptes.payes}   color="text-green-700" bg="bg-green-50" />
                      <KpiCard label="Montant payé"      value={fmtGnf(performance.decomptes.montantPayeGnf)} color="text-navy" bg="bg-navy/5" />
                    </div>

                    {/* Score performance */}
                    <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-navy">Score de performance</p>
                        <div className="flex items-center gap-1">
                          {Array.from({length:5}).map((_,i) => (
                            <Star key={i} className={`h-4 w-4 ${i < Math.round(performance.qualite.scorePerformance / 20) ? "text-amber-400 fill-amber-400" : "text-gray-200"}`}/>
                          ))}
                          <span className="ml-1 text-sm font-bold text-navy">{performance.qualite.scorePerformance}/100</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-[10px] text-gray-400">Taux rejet décomptes</p>
                          <p className={`font-bold ${performance.qualite.tauxRejet > 20 ? "text-red-600" : performance.qualite.tauxRejet > 10 ? "text-amber-600" : "text-green-700"}`}>
                            {performance.qualite.tauxRejet}%
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400">Taux de paiement</p>
                          <p className="font-bold text-navy">{performance.qualite.tauxPaiement}%</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400">Pénalités totales</p>
                          <p className="font-bold text-red-600">{fmtGnf(performance.qualite.montantPenalitesGnf)}</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Historique conformité ── */}
            {detailTab === "historique" && (
              <div className="space-y-2">
                {!(conformiteHisto ?? []).length && <p className="text-sm text-gray-400 py-8 text-center">Aucun historique</p>}
                {(conformiteHisto as HistoriqueConf[] ?? []).map(h => (
                  <div key={h.id} className="border-l-2 border-navy/20 pl-3 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        h.statutApres==="CONFORME"?"bg-green-100 text-green-700":
                        h.statutApres==="A_REGULARISER"?"bg-amber-100 text-amber-700":"bg-red-100 text-red-700"
                      }`}>{h.statutAvant} → {h.statutApres}</span>
                      <span className="text-xs font-bold text-navy">{h.scoreAvant} → {h.scoreApres} pts</span>
                      {h.declencheurType && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{h.declencheurType}</span>}
                    </div>
                    {h.commentaire && <p className="text-[11px] text-gray-600 mt-1">{h.commentaire}</p>}
                    <p className="text-[10px] text-gray-400 mt-0.5">{h.auteur} · {fmtDate(h.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}


            {/* ── Utilisateurs liés ── */}
            {detailTab === "utilisateurs" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">{(usersLies ?? []).length} utilisateur(s) lié(s)</p>
                </div>
                {usersLoading && <div className="h-16 bg-gray-50 animate-pulse rounded-lg" />}
                {!(usersLies ?? []).length && !usersLoading && (
                  <p className="text-sm text-gray-400 py-8 text-center">Aucun utilisateur lié à cette entreprise</p>
                )}
                {(usersLies ?? []).map((cu: any) => (
                  <div key={cu.id} className="border border-gray-100 rounded-lg p-3 flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-800 text-sm">{cu.user.nomComplet}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          cu.roleType === "ADMIN" ? "bg-red-100 text-red-700" :
                          cu.roleType === "VALIDEUR" ? "bg-blue-100 text-blue-700" :
                          cu.roleType === "SAISISSEUR" ? "bg-amber-100 text-amber-700" :
                          "bg-gray-100 text-gray-500"}`}>{cu.roleType}</span>
                        {cu.isPrimary && <span className="text-[10px] font-bold bg-navy/10 text-navy px-2 py-0.5 rounded-full">Principal</span>}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">{cu.user.email} · Rôle ERP : {cu.user.role}</p>
                      <div className="flex gap-3 mt-1 text-[10px] text-gray-400">
                        {cu.canSubmitDocuments && <span className="text-green-600">✓ Documents</span>}
                        {cu.canDeposerDecompte && <span className="text-green-600">✓ Décomptes</span>}
                        {cu.canViewContracts && <span className="text-blue-500">✓ Marchés</span>}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cu.statut === "ACTIF" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>{cu.statut}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Suivi & Audit ── */}
            {detailTab === "suivi" && (
              <div className="space-y-4">
                {/* Changement de statut */}
                {canWrite(user?.role) && (
                  <div className="bg-navy/5 rounded-xl p-4">
                    <p className="text-xs font-bold text-navy mb-3">Modifier le statut de l'entreprise</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-gray-500 mb-1 block">Nouveau statut</label>
                        <select value={statutForm2.statut} onChange={e => setStatutForm2(f => ({ ...f, statut: e.target.value }))}
                          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-navy/30">
                          <option value="">— Choisir —</option>
                          {[["EN_ATTENTE","En attente"],["A_REGULARISER","À régulariser"],["CONFORME","Conforme"],
                            ["AUTORISE","Autorisée"],["ALERTE","Alerte"],["BLOQUE","Bloquée"],
                            ["SUSPENDU","Suspendue"],["ARCHIVE","Archivée"]].map(([v,l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] text-gray-500 mb-1 block">Motif (obligatoire)</label>
                        <input value={statutForm2.commentaire} onChange={e => setStatutForm2(f => ({ ...f, commentaire: e.target.value }))}
                          placeholder="Raison du changement de statut..."
                          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-navy/30" />
                      </div>
                    </div>
                    <Button size="sm" className="mt-2 bg-navy text-white" disabled={!statutForm2.statut || statutForm2.commentaire.length < 3 || changeStatutMut.isPending}
                      onClick={() => changeStatutMut.mutate(statutForm2)}>
                      Appliquer le changement
                    </Button>
                  </div>
                )}

                {/* Historique des statuts */}
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Historique des statuts</p>
                  {(statusHistory ?? []).length === 0 && <p className="text-sm text-gray-400 py-4 text-center">Aucun changement de statut enregistré</p>}
                  <div className="space-y-2">
                    {(statusHistory ?? []).map((h: any) => (
                      <div key={h.id} className="flex items-start gap-3 p-2 border-l-2 border-navy/20 pl-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-bold text-navy">{h.ancienStatut}</span>
                            <span className="text-gray-400">→</span>
                            <span className="font-bold text-navy">{h.nouveauStatut}</span>
                          </div>
                          {h.commentaire && <p className="text-[11px] text-gray-500 mt-0.5 italic">{h.commentaire}</p>}
                        </div>
                        <p className="text-[10px] text-gray-400 shrink-0">{new Date(h.changedAt).toLocaleDateString("fr-FR")}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Journal d'audit */}
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Journal d'audit</p>
                  {(auditTrail ?? []).length === 0 && <p className="text-sm text-gray-400 py-4 text-center">Aucun événement</p>}
                  <div className="space-y-1.5">
                    {(auditTrail ?? []).map((ev: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-xs py-1.5 border-b border-gray-50">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                          ev.type === "STATUT" ? "bg-blue-100 text-blue-700" :
                          ev.type === "CONFORMITE" ? "bg-green-100 text-green-700" :
                          "bg-amber-100 text-amber-700"}`}>{ev.type}</span>
                        <span className="text-gray-700">{ev.desc}</span>
                        {ev.commentaire && <span className="text-gray-400 italic truncate">— {ev.commentaire}</span>}
                        <span className="text-gray-300 shrink-0 ml-auto">{new Date(ev.date).toLocaleDateString("fr-FR")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-gray-100">
              <Button variant="secondary" onClick={() => setDetail(null)}>Fermer</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ════ MODAL CRÉATION / ÉDITION ════ */}
      <Modal open={modal !== null} onClose={() => setModal(null)}
        title={modal === "new" ? "Nouvelle entreprise" : "Modifier l'entreprise"} size="xl">
        <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-4">
          {/* Identité */}
          <div>
            <p className="text-[10px] font-black tracking-widest text-gray-400 uppercase mb-2"> Identité légale</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Raison sociale" required className="col-span-2"><Input value={String(form.raisonSociale??"")} onChange={e=>f("raisonSociale",e.target.value)}/></FormField>
              <FormField label="Sigle"><Input value={String(form.sigle??"")} onChange={e=>f("sigle",e.target.value)}/></FormField>
              <FormField label="Forme juridique">
                <Select value={String(form.formeJuridique??"")} onChange={e=>f("formeJuridique",e.target.value)}>
                  <option value="">Choisir…</option>
                  {["SARL","SA","GIE","ETS","ASSOCIATION","AUTRE"].map(v=><option key={v} value={v}>{v}</option>)}
                </Select>
              </FormField>
              <FormField label="NIF" required><Input value={String(form.nif??"")} onChange={e=>f("nif",e.target.value)}/></FormField>
              <FormField label="N° TVA"><Input value={String(form.numerotva??"")} onChange={e=>f("numerotva",e.target.value)}/></FormField>
              <FormField label="RCCM"><Input value={String(form.rccm??"")} onChange={e=>f("rccm",e.target.value)}/></FormField>
              <FormField label="Date de création"><Input type="date" value={String(form.dateCreation??"")} onChange={e=>f("dateCreation",e.target.value)}/></FormField>
              <FormField label="Représentant légal"><Input value={String(form.representantLegal??form.dirigeant??"")} onChange={e=>f("representantLegal",e.target.value)}/></FormField>
              <FormField label="Qualité">
                <Select value={String(form.qualiteRepresentant??"")} onChange={e=>f("qualiteRepresentant",e.target.value)}>
                  <option value="">—</option>
                  {["DG","PDG","GERANT","MANDATAIRE"].map(v=><option key={v} value={v}>{v}</option>)}
                </Select>
              </FormField>
            </div>
          </div>

          {/* Administratif */}
          <div>
            <p className="text-[10px] font-black tracking-widest text-gray-400 uppercase mb-2"> Administratif & Bancaire</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Adresse" className="col-span-2"><Input value={String(form.adresse??"")} onChange={e=>f("adresse",e.target.value)}/></FormField>
              <FormField label="Ville"><Input value={String(form.ville??"")} onChange={e=>f("ville",e.target.value)}/></FormField>
              <FormField label="Commune"><Input value={String(form.commune??"")} onChange={e=>f("commune",e.target.value)}/></FormField>
              <FormField label="Téléphone"><Input value={String(form.telephone??"")} onChange={e=>f("telephone",e.target.value)}/></FormField>
              <FormField label="Email"><Input type="email" value={String(form.email??"")} onChange={e=>f("email",e.target.value)}/></FormField>
              <FormField label="Agrément"><Input value={String(form.agrement??"")} onChange={e=>f("agrement",e.target.value)}/></FormField>
              <FormField label="Catégorie agrément">
                <Select value={String(form.categorieAgrement??"")} onChange={e=>f("categorieAgrement",e.target.value)}>
                  <option value="">—</option>
                  {["1ERE","2EME","3EME","4EME","5EME"].map(v=><option key={v} value={v}>{v}</option>)}
                </Select>
              </FormField>
              <FormField label="IBAN"><Input value={String(form.iban??"")} onChange={e=>f("iban",e.target.value)}/></FormField>
              <FormField label="Banque"><Input value={String(form.nomBanque??"")} onChange={e=>f("nomBanque",e.target.value)}/></FormField>
            </div>
          </div>

          {/* Conformité */}
          <div>
            <p className="text-[10px] font-black tracking-widest text-gray-400 uppercase mb-2"> Conformité fiscale & sociale</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Régime fiscal">
                <Select value={String(form.regimeFiscal??"")} onChange={e=>f("regimeFiscal",e.target.value)}>
                  <option value="">—</option>
                  {["REEL","SIMPLIFIE","FORFAIT","MICROENTREPRISE"].map(v=><option key={v} value={v}>{v}</option>)}
                </Select>
              </FormField>
              <FormField label="N° attestation fiscale"><Input value={String(form.attestationFiscaleNum??"")} onChange={e=>f("attestationFiscaleNum",e.target.value)}/></FormField>
              <FormField label="Expiration attestation fiscale"><Input type="date" value={String(form.attestationFiscaleExpire??"")} onChange={e=>f("attestationFiscaleExpire",e.target.value)}/></FormField>
              <FormField label="N° attestation sociale"><Input value={String(form.attestationSocialeNum??"")} onChange={e=>f("attestationSocialeNum",e.target.value)}/></FormField>
              <FormField label="Expiration attestation sociale"><Input type="date" value={String(form.attestationSocialeExpire??"")} onChange={e=>f("attestationSocialeExpire",e.target.value)}/></FormField>
              <div className="col-span-2 grid grid-cols-3 gap-3">
                {[
                  { k:"regulariteFiscale",      l:"Régularité fiscale" },
                  { k:"regulariteSociale",       l:"Régularité sociale" },
                  { k:"assujettTVA",             l:"Assujetti TVA" },
                  { k:"attestationValide",       l:"Attestation valide" },
                  { k:"cautionBancaire",         l:"Caution bancaire OK" },
                  { k:"autoriseContracterEtat",  l:"Autorisé à contracter" },
                ].map(({ k, l }) => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input type="checkbox" className="accent-navy h-4 w-4" checked={Boolean(form[k])}
                      onChange={e=>f(k, e.target.checked)}/>
                    {l}
                  </label>
                ))}
              </div>
              <div className="col-span-2 grid grid-cols-3 gap-3 mt-2">
                {[
                  { k:"estRadie",              l:"Radiée", danger:true },
                  { k:"estSuspendu",           l:"Suspendue", danger:true },
                  { k:"estInterditSoumission", l:"Interdite soumission", danger:true },
                ].map(({ k, l, danger }) => (
                  <label key={k} className={`flex items-center gap-2 cursor-pointer text-sm ${danger?"text-red-700 font-medium":""}`}>
                    <input type="checkbox" className="accent-red-600 h-4 w-4" checked={Boolean(form[k])}
                      onChange={e=>f(k, e.target.checked)}/>
                    {l}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
          <Button variant="secondary" onClick={() => setModal(null)}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>
            {createMut.isPending || updateMut.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </Modal>

      {/* ════ MODAL BLOCAGE ════ */}
      <Modal open={blocModal} onClose={() => setBlocModal(false)} title="Bloquer l'entreprise" size="sm">
        <div className="space-y-3">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
            <p className="font-bold text-red-800">⚠ Cette action bloquera tous les dépôts et paiements</p>
            <p className="text-red-700 text-xs mt-1">L'entreprise ne pourra plus déposer de décomptes ni être payée.</p>
          </div>
          <FormField label="Motif du blocage" required>
            <Textarea rows={3} value={blocForm.motif} onChange={e=>setBlocForm({motif:e.target.value})} placeholder="Décrire la raison du blocage…"/>
          </FormField>
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="secondary" onClick={() => setBlocModal(false)}>Annuler</Button>
            <Button variant="danger" disabled={!blocForm.motif || blocForm.motif.length < 3 || bloquerMut.isPending}
              onClick={() => detail && bloquerMut.mutate({ id:detail.id, motif:blocForm.motif })}>
              {bloquerMut.isPending ? "En cours…" : "Confirmer le blocage"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ════ MODAL DÉBLOCAGE ════ */}
      <Modal open={deblocModal} onClose={() => setDeblocModal(false)} title="Débloquer l'entreprise" size="sm">
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
            <p className="font-bold text-green-800">Vérification de conformité</p>
            <p className="text-green-700 text-xs mt-1">Le système recalculera le score. Si la conformité est insuffisante, le déblocage sera refusé.</p>
          </div>
          <FormField label="Commentaire de régularisation" required>
            <Textarea rows={3} value={deblocForm.commentaire} onChange={e=>setDeblocForm({commentaire:e.target.value})} placeholder="Actions correctives effectuées…"/>
          </FormField>
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="secondary" onClick={() => setDeblocModal(false)}>Annuler</Button>
            <Button disabled={!deblocForm.commentaire || deblocForm.commentaire.length < 3 || debloquerMut.isPending}
              onClick={() => detail && debloquerMut.mutate({ id:detail.id, commentaire:deblocForm.commentaire })}>
              {debloquerMut.isPending ? "Vérification…" : "Débloquer"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ════ MODAL DOCUMENT ════ */}
      <Modal open={docModal} onClose={() => setDocModal(false)} title="Ajouter un document" size="md">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Type de document" required className="col-span-2">
            <Select value={String(docForm.type??"")} onChange={e=>setDocForm(p=>({...p,type:e.target.value}))}>
              <option value="">Choisir…</option>
              {TYPES_DOC.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </FormField>
          <FormField label="Numéro / Référence"><Input value={String(docForm.numero??"")} onChange={e=>setDocForm(p=>({...p,numero:e.target.value}))}/></FormField>
          <FormField label="Libellé"><Input value={String(docForm.libelle??"")} onChange={e=>setDocForm(p=>({...p,libelle:e.target.value}))}/></FormField>
          <FormField label="Date d'émission"><Input type="date" value={String(docForm.dateEmission??"")} onChange={e=>setDocForm(p=>({...p,dateEmission:e.target.value}))}/></FormField>
          <FormField label="Date d'expiration"><Input type="date" value={String(docForm.dateExpiration??"")} onChange={e=>setDocForm(p=>({...p,dateExpiration:e.target.value}))}/></FormField>
          <FormField label="Observations" className="col-span-2"><Textarea rows={2} value={String(docForm.observations??"")} onChange={e=>setDocForm(p=>({...p,observations:e.target.value}))}/></FormField>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setDocModal(false)}>Annuler</Button>
          <Button onClick={() => addDocMut.mutate(docForm)} disabled={addDocMut.isPending}>Enregistrer</Button>
        </div>
      </Modal>

      {/* ════ MODAL CONTACT ════ */}
      <Modal open={contactModal} onClose={() => setContactModal(false)} title="Ajouter un contact" size="sm">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Nom" required><Input value={String(contactForm.nom??"")} onChange={e=>setContactForm(p=>({...p,nom:e.target.value}))}/></FormField>
            <FormField label="Prénom"><Input value={String(contactForm.prenom??"")} onChange={e=>setContactForm(p=>({...p,prenom:e.target.value}))}/></FormField>
            <FormField label="Fonction"><Input value={String(contactForm.fonction??"")} onChange={e=>setContactForm(p=>({...p,fonction:e.target.value}))}/></FormField>
            <FormField label="Téléphone"><Input value={String(contactForm.telephone??"")} onChange={e=>setContactForm(p=>({...p,telephone:e.target.value}))}/></FormField>
            <FormField label="Email" className="col-span-2"><Input type="email" value={String(contactForm.email??"")} onChange={e=>setContactForm(p=>({...p,email:e.target.value}))}/></FormField>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="accent-navy h-4 w-4" checked={Boolean(contactForm.principal)} onChange={e=>setContactForm(p=>({...p,principal:e.target.checked}))}/>
            Contact principal
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setContactModal(false)}>Annuler</Button>
          <Button onClick={() => addContactMut.mutate(contactForm)} disabled={addContactMut.isPending}>Ajouter</Button>
        </div>
      </Modal>

      {/* ════ MODAL SUPPRESSION ════ */}
      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Confirmer la suppression" size="sm">
        <p className="text-sm text-gray-600 mb-4">Cette action est irréversible. L'entreprise sera archivée.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDel(null)}>Annuler</Button>
          <Button variant="danger" disabled={deleteMut.isPending}
            onClick={() => confirmDel && deleteMut.mutate(confirmDel)}>
            Supprimer
          </Button>
        </div>
      </Modal>

    </div>
  );
}
