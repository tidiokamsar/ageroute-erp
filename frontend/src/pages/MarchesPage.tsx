/**
 * Référentiel Marchés — Module complet CDC §3-17
 * Onglets : Identification · Lots · OS · Avenants · Garanties · Réceptions · Décomptes · Situation · Historique
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError, fmtGnf } from "../lib/api";
import { ExportButton } from "../components/ui/ExportButton";
import { FileUploadModal, DocumentViewer } from "../components/ui/FileUploadModal";
import { useAuth, canWrite } from "../lib/auth";
import { Button } from "../components/ui/Button";
import { Input, Select, FormField, Textarea } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import {
  StatutMarcheBadge, FinancementBadge, StatutDecompteBadge, TypeDecompteBadge,
} from "../components/ui/Badge";
import { toast } from "../components/ui/Toast";
import {
  Plus, Search, FileText, Pencil, Trash2, BookOpen, ClipboardList, GitBranch,
  Shield, Receipt, Package, AlertTriangle, CheckCircle2, Clock, TrendingUp,
  TrendingDown, ArrowRight, Activity, CreditCard, RotateCcw, Map, Building2,
  ChevronRight, Info, XCircle, Layers,
} from "lucide-react";
import { BpmnPanel } from "../components/BpmnPanel";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer } from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Marche {
  id: string; reference: string; intitule: string; objet?: string;
  type: string; procedure: string; statut: string; financement: string;
  montantInitialGnf: string; montantActualiseGnf?: string;
  tauxTva: number; tauxRetenueGarantie: number; tauxAvance: number;
  montantAvanceGnf?: string; avanceComplementaireGnf?: string;
  penalitesJourGnf?: string; plafondPenalitesPct?: number;
  tronconCode?: string; regionNom?: string; prefecture?: string; commune?: string;
  pkDebut?: number; pkFin?: number;
  missionControle?: string; directionTechnique?: string;
  numContrat?: string; numApprobation?: string; bailleur?: string; composante?: string;
  coTraitants?: string; sousTraitants?: string;
  delaiMois?: number; delaiJours?: number; observations?: string;
  dateSignature?: string; dateNotification?: string;
  dateOs?: string; dateDebutPrevue?: string; dateFinPrevue?: string;
  dateFinReelle?: string; dateReceptionProvisoire?: string; dateReceptionDefinitive?: string;
  pretAExecuter?: boolean;
  entreprise: { id: string; raisonSociale: string; statut: string; scoreConformite?: number };
  projet?: { id: string; code: string; nom: string };
  lots?: Lot[];
  _count?: { decomptes: number; bpuArticles: number };
  createdAt: string;
}

interface Lot {
  id: string; numero: string; designation: string; montantGnf: string;
}
interface OrdreService {
  id: string; numero: number; type: string; objet: string;
  dateEmission: string; dateEffet?: string;
  impactDelaiJours: number; impactMontantGnf: string; observations?: string;
}
interface Avenant {
  id: string; numero: number; objet: string; motif?: string;
  montantSupplementaireGnf: string; prolongationJours: number;
  dateSignature?: string; statut: string; observations?: string;
  valideTechniqueAt?: string; valideFinancierAt?: string; visaDgAt?: string;
}
interface Garantie {
  id: string; type: string; montantGnf: string; banque?: string;
  reference?: string; dateEmission?: string; dateExpiration?: string;
  active: boolean; appelGarantie: boolean; observations?: string;
}
interface Reception {
  id: string; type: string; statut: string; datePrevu?: string;
  dateReelle?: string; pvNumero?: string; reserves?: unknown;
  dateLeveeReserves?: string; observations?: string; signedAt?: string;
}
interface Decompte {
  id: string; reference: string; type: string; statut: string;
  netAPayer: string; createdAt: string;
  entreprise: { raisonSociale: string };
}
interface HistoriqueStatut {
  id: string; statutAvant?: string; statutApres: string;
  motif?: string; userEmail?: string; createdAt: string;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const TYPE_OPT   = ["TRAVAUX","SERVICES","FOURNITURES","ETUDES"];
const PROC_OPT   = [
  { value:"APPEL_OFFRES_OUVERT",   label:"Appel d'offres ouvert" },
  { value:"APPEL_OFFRES_RESTREINT",label:"Appel d'offres restreint" },
  { value:"GRES_A_GRES",           label:"Gré à gré" },
  { value:"CONSULTATION",          label:"Consultation" },
];
const FIN_OPT    = [
  {value:"BANQUE_MONDIALE",label:"Banque Mondiale"},{value:"BAD",label:"BAD"},
  {value:"BUDGET_NATIONAL",label:"Budget National"},{value:"FER",label:"FER"},
  {value:"BOAD",label:"BOAD"},{value:"BID",label:"BID"},{value:"UE",label:"UE"},
  {value:"BADEA",label:"BADEA"},{value:"AFD",label:"AFD"},{value:"KFW",label:"KFW"},
  {value:"AUTRE",label:"Autre"},
];
const STATUT_OPT = [
  {value:"BROUILLON",               label:"Brouillon"},
  {value:"EN_PREPARATION",          label:"En préparation"},
  {value:"SIGNE",                   label:"Signé"},
  {value:"NOTIFIE",                 label:"Notifié"},
  {value:"EN_EXECUTION",            label:"En exécution"},
  {value:"ACTIF",                   label:"Actif"},
  {value:"SUSPENDU",                label:"Suspendu"},
  {value:"EN_AVENANT",              label:"En avenant"},
  {value:"EN_RECEPTION_PROVISOIRE", label:"Réception provisoire"},
  {value:"EN_RECEPTION_DEFINITIVE", label:"Réception définitive"},
  {value:"RESILIE",                 label:"Résilié"},
  {value:"SOLDE",                   label:"Soldé"},
  {value:"CLOTURE",                 label:"Clôturé"},
];
const TRANSITIONS: Record<string, string[]> = {
  BROUILLON:               ["EN_PREPARATION"],
  EN_PREPARATION:          ["SIGNE","RESILIE"],
  SIGNE:                   ["NOTIFIE","RESILIE"],
  NOTIFIE:                 ["EN_EXECUTION","RESILIE"],
  EN_EXECUTION:            ["SUSPENDU","EN_AVENANT","EN_RECEPTION_PROVISOIRE","RESILIE"],
  ACTIF:                   ["SUSPENDU","EN_AVENANT","EN_RECEPTION_PROVISOIRE","RESILIE"],
  SUSPENDU:                ["EN_EXECUTION","ACTIF","RESILIE"],
  EN_AVENANT:              ["EN_EXECUTION","ACTIF","RESILIE"],
  EN_RECEPTION_PROVISOIRE: ["EN_RECEPTION_DEFINITIVE","EN_EXECUTION","RESILIE"],
  EN_RECEPTION_DEFINITIVE: ["CLOTURE","SOLDE"],
};
const STATUT_COLORS: Record<string,string> = {
  BROUILLON:"bg-gray-100 text-gray-600 border-gray-200",
  EN_PREPARATION:"bg-blue-50 text-blue-700 border-blue-100",
  SIGNE:"bg-indigo-50 text-indigo-700 border-indigo-100",
  NOTIFIE:"bg-cyan-50 text-cyan-700 border-cyan-100",
  EN_EXECUTION:"bg-green-50 text-green-800 border-green-200",
  ACTIF:"bg-emerald-50 text-emerald-700 border-emerald-200",
  SUSPENDU:"bg-amber-50 text-amber-700 border-amber-200",
  EN_AVENANT:"bg-orange-50 text-orange-700 border-orange-200",
  EN_RECEPTION_PROVISOIRE:"bg-purple-50 text-purple-700 border-purple-200",
  EN_RECEPTION_DEFINITIVE:"bg-violet-50 text-violet-700 border-violet-200",
  RESILIE:"bg-red-50 text-red-700 border-red-200",
  SOLDE:"bg-teal-50 text-teal-700 border-teal-200",
  CLOTURE:"bg-gray-50 text-gray-500 border-gray-200",
};

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-GN", { day:"2-digit", month:"2-digit", year:"numeric" });
}
function KpiCard({ label, value, sub, color="text-navy", bg="bg-white" }: { label:string; value:string|number; sub?:string; color?:string; bg?:string }) {
  return (
    <div className={`${bg} border border-gray-100 rounded-xl px-4 py-3 shadow-sm`}>
      <p className="text-[11px] text-gray-500 font-medium">{label}</p>
      <p className={`text-base font-black ${color} mt-0.5 truncate`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function ProgressBar({ value, max, color="bg-navy" }: { value:number; max:number; color?:string }) {
  const pct = max > 0 ? Math.min(100, Math.round(value / max * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-2 rounded-full ${color} transition-all`} style={{ width:`${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-600 w-10 text-right">{pct}%</span>
    </div>
  );
}

function AvenantStatutBadge({ statut }: { statut: string }) {
  const map: Record<string,string> = {
    EN_COURS:"bg-gray-100 text-gray-600", VALIDE_TECHNIQUE:"bg-blue-50 text-blue-700",
    VALIDE_FINANCIER:"bg-indigo-50 text-indigo-700", VISE_DG:"bg-purple-50 text-purple-700",
    APPROUVE:"bg-green-100 text-green-700", ANNULE:"bg-red-50 text-red-600",
  };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${map[statut]??"bg-gray-100 text-gray-500"}`}>{statut.replace(/_/g," ")}</span>;
}

function GarantieBadge({ g }: { g: Garantie }) {
  const exp = g.dateExpiration ? new Date(g.dateExpiration) : null;
  const now = new Date();
  const j30 = exp && exp < new Date(Date.now() + 30*86400000);
  if (!g.active) return <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Expirée</span>;
  if (g.appelGarantie) return <span className="text-[10px] text-red-700 bg-red-50 px-2 py-0.5 rounded">Appelée</span>;
  if (exp && exp < now) return <span className="text-[10px] text-red-700 bg-red-50 px-2 py-0.5 rounded">⛔ Expirée</span>;
  if (j30) return <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded">⚠ Bientôt</span>;
  return <span className="text-[10px] text-green-700 bg-green-50 px-2 py-0.5 rounded">Active</span>;
}

// ─── Composant principal ─────────────────────────────────────────────────────

type DetailTab = "identification"|"lots"|"os"|"avenants"|"garanties"|"receptions"|"decomptes"|"situation"|"courbes"|"historique"|"workflow";

export function MarchesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Liste
  const [search, setSearch]         = useState("");
  const [statut, setStatut]         = useState("");
  const [financement, setFinancement] = useState("");
  const [retard, setRetard]         = useState(false);
  const [page, setPage]             = useState(1);

  // Modals
  const [modal, setModal]           = useState<Marche | null | "new">(null);
  const [form, setForm]             = useState<Record<string,unknown>>({});
  const [detail, setDetail]         = useState<Marche | null>(null);
  const [detailTab, setDetailTab]   = useState<DetailTab>("identification");
  const [confirmDel, setConfirmDel] = useState<string|null>(null);

  // Sous-modals
  const [lotModal, setLotModal]           = useState(false);
  const [lotForm, setLotForm]             = useState<Record<string,unknown>>({});
  const [osModal, setOsModal]             = useState(false);
  const [osForm, setOsForm]               = useState<Record<string,unknown>>({ type:"DEMARRAGE" });
  const [avenantModal, setAvenantModal]   = useState(false);
  const [avenantForm, setAvenantForm]     = useState<Record<string,unknown>>({});
  const [garantieModal, setGarantieModal] = useState(false);
  const [garantieForm, setGarantieForm]   = useState<Record<string,unknown>>({});
  const [transitionModal, setTransitionModal] = useState(false);
  const [transitionForm, setTransitionForm]   = useState<{ statut:string; motif:string; pieceRef:string }>({ statut:"", motif:"", pieceRef:"" });
  const [avenantValidModal, setAvenantValidModal] = useState<Avenant|null>(null);

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: ["marches", page, search, statut, financement, retard],
    queryFn: () => api.get("/marches", { params:{ page, search:search||undefined, statut:statut||undefined, financement:financement||undefined, retard:retard||undefined } }).then(r => r.data),
  });

  const { data: stats } = useQuery({
    queryKey: ["marches-stats"],
    queryFn: () => api.get("/marches/stats").then(r => r.data),
  });

  const { data: entreprises } = useQuery({
    queryKey: ["entreprises-list"],
    queryFn: () => api.get("/entreprises", { params:{ pageSize:200 } }).then(r => r.data.data),
  });

  const { data: osData } = useQuery({
    queryKey: ["os", detail?.id],
    queryFn: () => api.get(`/marches/${detail!.id}/os`).then(r => r.data),
    enabled: !!detail && detailTab === "os",
  });
  const { data: avenantData } = useQuery({
    queryKey: ["avenants", detail?.id],
    queryFn: () => api.get(`/marches/${detail!.id}/avenants`).then(r => r.data),
    enabled: !!detail && (detailTab === "avenants" || detailTab === "situation"),
  });
  const { data: garantieData } = useQuery({
    queryKey: ["garanties-marche", detail?.id],
    queryFn: () => api.get(`/marches/${detail!.id}/garanties`).then(r => r.data),
    enabled: !!detail && (detailTab === "garanties" || detailTab === "situation"),
  });
  const { data: receptionData } = useQuery({
    queryKey: ["receptions-marche", detail?.id],
    queryFn: () => api.get(`/marches/${detail!.id}/receptions`).then(r => r.data),
    enabled: !!detail && (detailTab === "receptions" || detailTab === "situation"),
  });
  const { data: decompteData } = useQuery({
    queryKey: ["decomptes-marche", detail?.id],
    queryFn: () => api.get(`/marches/${detail!.id}/decomptes`).then(r => r.data),
    enabled: !!detail && (detailTab === "decomptes" || detailTab === "situation"),
  });
  const { data: situation } = useQuery({
    queryKey: ["situation", detail?.id],
    queryFn: () => api.get(`/marches/${detail!.id}/situation`).then(r => r.data),
    enabled: !!detail && detailTab === "situation",
  });
  const { data: courbeS } = useQuery({
    queryKey: ["courbe-s", detail?.id],
    queryFn: () => api.get(`/marches/${detail!.id}/courbe-s`).then(r => r.data),
    enabled: !!detail && detailTab === "courbes",
  });
  const { data: checklistData } = useQuery({
    queryKey: ["checklist", detail?.id],
    queryFn: () => api.get(`/marches/${detail!.id}/checklist`).then(r => r.data),
    enabled: !!detail && detailTab === "identification",
  });
  const { data: historiqueData } = useQuery({
    queryKey: ["historique-statuts", detail?.id],
    queryFn: () => api.get(`/marches/${detail!.id}/historique-statuts`).then(r => r.data),
    enabled: !!detail && detailTab === "historique",
  });
  const { data: lotData } = useQuery({
    queryKey: ["lots", detail?.id],
    queryFn: () => api.get(`/marches/${detail!.id}/lots`).then(r => r.data),
    enabled: !!detail && detailTab === "lots",
  });

  // ─── Mutations ────────────────────────────────────────────────────────────

  function invalidate() { qc.invalidateQueries({ queryKey: ["marches"] }); qc.invalidateQueries({ queryKey: ["marches-stats"] }); }

  const createMut = useMutation({
    mutationFn: (b: object) => api.post("/marches", b).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success("Marché créé"); setModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id:string; body:object }) => api.put(`/marches/${id}`, body),
    onSuccess: () => { invalidate(); toast.success("Marché mis à jour"); setModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/marches/${id}`),
    onSuccess: () => { invalidate(); toast.success("Marché supprimé"); setConfirmDel(null); setDetail(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const transitionMut = useMutation({
    mutationFn: ({ id, ...body }: { id:string; statut:string; motif?:string; pieceRef?:string }) =>
      api.post(`/marches/${id}/transition`, body).then(r => r.data),
    onSuccess: (res) => {
      invalidate(); qc.invalidateQueries({ queryKey: ["historique-statuts"] });
      toast.success((res as {message:string}).message);
      setTransitionModal(false);
      // Rafraîchir le détail
      if (detail) setDetail(res.marche);
    },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const osMut = useMutation({
    mutationFn: (b: object) => api.post(`/marches/${detail!.id}/os`, b).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["os"] }); toast.success("OS créé"); setOsModal(false); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const avenantMut = useMutation({
    mutationFn: (b: object) => api.post(`/marches/${detail!.id}/avenants`, b).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["avenants"] }); toast.success("Avenant enregistré"); setAvenantModal(false); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const avenantValiderMut = useMutation({
    mutationFn: ({ aid, action }: { aid:string; action:string }) =>
      api.post(`/marches/${detail!.id}/avenants/${aid}/valider`, { action }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["avenants"] }); toast.success("Avenant mis à jour"); setAvenantValidModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const garantieMut = useMutation({
    mutationFn: (b: object) => api.post(`/marches/${detail!.id}/garanties`, b).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["garanties-marche"] }); toast.success("Garantie enregistrée"); setGarantieModal(false); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const lotMut = useMutation({
    mutationFn: (b: object) => api.post(`/marches/${detail!.id}/lots`, b).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lots"] }); toast.success("Lot créé"); setLotModal(false); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function openNew()       { setForm({ tauxTva:18, tauxRetenueGarantie:5, tauxAvance:20, montantAvanceGnf:0, penalitesJourGnf:0, plafondPenalitesPct:10 }); setModal("new"); }
  function openEdit(m: Marche) {
    setForm({
      ...m, entrepriseId: m.entreprise.id, projetId: m.projet?.id,
      montantInitialGnf: Number(m.montantInitialGnf),
      montantAvanceGnf: Number(m.montantAvanceGnf ?? 0),
      penalitesJourGnf: Number(m.penalitesJourGnf ?? 0),
    });
    setModal(m);
  }
  function handleSubmit() {
    if (modal === "new")           createMut.mutate(form);
    else if (modal && typeof modal === "object") updateMut.mutate({ id: modal.id, body: form });
  }
  function openDetail(m: Marche)  { setDetail(m); setDetailTab("identification"); }
  function f(k: string, v: unknown) { setForm(p => ({ ...p, [k]: v })); }

  function imprimerSituation(sit: any, m: Marche) {
    const tc  = sit.financier.tauxConsommation;
    const tp  = sit.financier.tauxPaiement;
    const fmt = (v: number) => new Intl.NumberFormat("fr-GN", { style:"currency", currency:"GNF", maximumFractionDigits:0 }).format(v);
    const fdate = (d?: string | null) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";
    const risqueCls = tc >= 85 ? "color:red;font-weight:bold" : tc >= 70 ? "color:#d97706;font-weight:bold" : "color:green;font-weight:bold";
    const lignes = (sit.decomptesList ?? []).map((d: any) => `
      <tr>
        <td style="padding:4px 8px;font-family:monospace">${d.reference}</td>
        <td style="padding:4px 8px">${d.type}</td>
        <td style="padding:4px 8px">${d.statut}</td>
        <td style="padding:4px 8px;text-align:right">${fmt(d.montantPeriodeHtGnf)}</td>
        <td style="padding:4px 8px;text-align:right">${fmt(d.netAPayer)}</td>
        <td style="padding:4px 8px;text-align:right">${fdate(d.dateDepot)}</td>
      </tr>`).join("");
    const avance = sit.avanceDemarrage?.montantVerse > 0 ? `
      <h3 style="margin:16px 0 8px;font-size:13px;color:#1e3a8a">AVANCE DE DÉMARRAGE</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px">
        <tr>
          <td style="padding:4px 8px;border:1px solid #e5e7eb">Montant versé</td>
          <td style="padding:4px 8px;border:1px solid #e5e7eb;text-align:right;font-weight:bold">${fmt(sit.avanceDemarrage.montantVerse)}</td>
          <td style="padding:4px 8px;border:1px solid #e5e7eb">Récupéré</td>
          <td style="padding:4px 8px;border:1px solid #e5e7eb;text-align:right;font-weight:bold;color:green">${fmt(sit.avanceDemarrage.montantRecupere)}</td>
          <td style="padding:4px 8px;border:1px solid #e5e7eb">Solde à récupérer</td>
          <td style="padding:4px 8px;border:1px solid #e5e7eb;text-align:right;font-weight:bold;color:#d97706">${fmt(sit.avanceDemarrage.soldeRestant)}</td>
        </tr>
      </table>` : "";
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Situation Financière — ${m.reference}</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px}
        table{width:100%;border-collapse:collapse}
        th{background:#1e3a8a;color:white;padding:6px 8px;text-align:left;font-size:11px}
        td{border:1px solid #e5e7eb;padding:5px 8px}
        tfoot td{background:#f3f4f6;font-weight:bold}
        @media print{button{display:none}}</style>
    </head><body>
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px">
        <div>
          <h1 style="margin:0;font-size:18px;color:#1e3a8a">AGEROUTE GUINÉE</h1>
          <p style="margin:2px 0;font-size:11px;color:#6b7280">Direction des Marchés et Contrats</p>
        </div>
        <div style="text-align:right;font-size:11px;color:#6b7280">
          <p>Date : ${new Date().toLocaleDateString("fr-FR")}</p>
          <p>Imprimé par : ${(window as any).__erpUser ?? "Utilisateur"}</p>
        </div>
      </div>
      <h2 style="background:#1e3a8a;color:white;padding:8px 12px;font-size:14px;margin:0 0 12px">
        SITUATION FINANCIÈRE CUMULATIVE — ${m.reference}
      </h2>
      <table style="margin-bottom:12px">
        <tr><th colspan="4">IDENTIFICATION DU MARCHÉ</th></tr>
        <tr>
          <td><b>Intitulé</b></td><td colspan="3">${m.intitule}</td>
        </tr>
        <tr>
          <td><b>Entreprise</b></td><td>${m.entreprise?.raisonSociale ?? "—"}</td>
          <td><b>Financement</b></td><td>${m.financement}</td>
        </tr>
        <tr>
          <td><b>N° Contrat</b></td><td>${m.numContrat ?? "—"}</td>
          <td><b>Statut</b></td><td>${m.statut}</td>
        </tr>
        <tr>
          <td><b>Date signature</b></td><td>${fdate(m.dateSignature)}</td>
          <td><b>Date fin prévue</b></td><td>${fdate(m.dateFinPrevue)}</td>
        </tr>
      </table>
      <h3 style="margin:16px 0 8px;font-size:13px;color:#1e3a8a">SYNTHÈSE FINANCIÈRE</h3>
      <table style="margin-bottom:12px">
        <tr>
          <td><b>Montant contrat HT</b></td>
          <td style="text-align:right;font-weight:bold">${fmt(sit.financier.montantContratHt)}</td>
          <td><b>Montant certifié</b></td>
          <td style="text-align:right;font-weight:bold;color:#1e3a8a">${fmt(sit.financier.montantCertifie)}</td>
        </tr>
        <tr>
          <td><b>Taux certification</b></td>
          <td style="text-align:right;${risqueCls}">${tc}%</td>
          <td><b>Taux paiement</b></td>
          <td style="text-align:right;font-weight:bold;color:green">${tp}%</td>
        </tr>
        <tr>
          <td><b>Montant payé</b></td>
          <td style="text-align:right;font-weight:bold;color:green">${fmt(sit.financier.montantPaye)}</td>
          <td><b>Solde restant</b></td>
          <td style="text-align:right;font-weight:bold">${fmt(sit.financier.soldeRestant)}</td>
        </tr>
        <tr>
          <td><b>Retenues constituées</b></td>
          <td style="text-align:right">${fmt(sit.financier.retenues)}</td>
          <td><b>Pénalités appliquées</b></td>
          <td style="text-align:right;color:red">${fmt(sit.financier.penalites)}</td>
        </tr>
      </table>
      ${avance}
      <h3 style="margin:16px 0 8px;font-size:13px;color:#1e3a8a">RÉCAPITULATIF DES DÉCOMPTES</h3>
      <table>
        <thead><tr>
          <th>Référence</th><th>Type</th><th>Statut</th>
          <th style="text-align:right">Montant HT</th>
          <th style="text-align:right">Net à payer</th>
          <th style="text-align:right">Date dépôt</th>
        </tr></thead>
        <tbody>${lignes}</tbody>
        <tfoot><tr>
          <td colspan="3">TOTAL</td>
          <td style="text-align:right">${fmt(sit.financier.montantCertifie)}</td>
          <td style="text-align:right">${fmt(sit.financier.montantPaye)}</td>
          <td></td>
        </tr></tfoot>
      </table>
      <div style="margin-top:40px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;text-align:center">
        <div><div style="border-top:1px solid black;padding-top:4px">DMC — Direction des Marchés et Contrats</div></div>
        <div><div style="border-top:1px solid black;padding-top:4px">DAF — Direction Administrative et Financière</div></div>
        <div><div style="border-top:1px solid black;padding-top:4px">DG — Directeur Général</div></div>
      </div>
      <button onclick="window.print()" style="position:fixed;bottom:20px;right:20px;background:#1e3a8a;color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px">
        Imprimer
      </button>
    </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
  }

  const items: Marche[] = data?.data ?? [];
  const transitions = detail ? (TRANSITIONS[detail.statut] ?? []) : [];

  const TABS: { key: DetailTab; label: string; icon: React.ElementType }[] = [
    { key:"identification", label:"Identification",  icon:FileText },
    { key:"lots",           label:"Lots",            icon:Layers },
    { key:"os",             label:"Ordres de Service",icon:ClipboardList },
    { key:"avenants",       label:"Avenants",        icon:GitBranch },
    { key:"garanties",      label:"Garanties",       icon:Shield },
    { key:"receptions",     label:"Réceptions",      icon:CheckCircle2 },
    { key:"decomptes",      label:"Décomptes",       icon:Receipt },
    { key:"situation",      label:"Situation §13",   icon:TrendingUp },
    { key:"courbes",        label:"Courbe S",        icon:Activity },
    { key:"historique",     label:"Historique",      icon:Activity },
    { key:"workflow",       label:"Workflow BPMN",   icon:GitBranch },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── KPIs globaux ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="Total marchés"   value={stats.total}          bg="bg-white" />
          <KpiCard label="En exécution"    value={stats.actifs}         color="text-green-700" bg="bg-green-50" />
          <KpiCard label="En retard"       value={stats.enRetard}       color="text-red-700"   bg="bg-red-50" />
          <KpiCard label="Suspendus"       value={stats.suspendus}      color="text-amber-700" bg="bg-amber-50" />
          <KpiCard label="Montant total"   value={fmtGnf(stats.montantTotalGnf)} color="text-navy" bg="bg-navy/5" />
        </div>
      )}

      {/* ── Filtres ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input className="pl-9" placeholder="Réf., intitulé, tronçon…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select className="w-44" value={statut} onChange={e => { setStatut(e.target.value); setPage(1); }}>
          <option value="">Tous statuts</option>
          {STATUT_OPT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select className="w-40" value={financement} onChange={e => { setFinancement(e.target.value); setPage(1); }}>
          <option value="">Tout financement</option>
          {FIN_OPT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="accent-red-600" checked={retard} onChange={e => setRetard(e.target.checked)} />
          <span className="text-red-700 font-medium">En retard seulement</span>
        </label>
        {canWrite(user?.role) && (
          <Button className="ml-auto" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Nouveau marché</Button>
        )}
      </div>

      {/* ── Tableau liste ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-navy/5 border-b border-navy/10">
            <tr>
              {["Référence","Intitulé / Tronçon","Entreprise","Financement","Montant HT","Consommé","Fin prévue","Statut",""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-navy/60 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && Array.from({length:5}).map((_,i) => (
              <tr key={i}><td colSpan={9}><div className="h-12 animate-pulse bg-gray-50 m-2 rounded" /></td></tr>
            ))}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={9} className="py-14 text-center text-gray-400">
                <FileText className="h-10 w-10 mx-auto mb-2 opacity-20"/><p>Aucun marché trouvé</p>
              </td></tr>
            )}
            {items.map(m => {
              const montant = Number(m.montantActualiseGnf ?? m.montantInitialGnf);
              const isRetard = m.dateFinPrevue && ["EN_EXECUTION","ACTIF"].includes(m.statut) && new Date() > new Date(m.dateFinPrevue);
              return (
                <tr key={m.id}
                  className={`hover:bg-gray-50/70 cursor-pointer transition-colors ${isRetard ? "bg-red-50/30" : ""}`}
                  onClick={() => openDetail(m)}>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-navy">{m.reference}</td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <p className="font-medium text-gray-800 truncate">{m.intitule}</p>
                    <p className="text-[10px] text-gray-400">{m.tronconCode ?? m.regionNom ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm truncate max-w-[130px]">{m.entreprise.raisonSociale}</p>
                    {m.entreprise.statut === "BLOQUE" && <span className="text-[10px] text-red-600 font-bold">⛔ Bloquée</span>}
                  </td>
                  <td className="px-4 py-3"><FinancementBadge financement={m.financement}/></td>
                  <td className="px-4 py-3 font-mono text-sm font-semibold text-gray-800">{fmtGnf(m.montantInitialGnf)}</td>
                  <td className="px-4 py-3 w-32">
                    <ProgressBar value={0} max={montant} />
                  </td>
                  <td className={`px-4 py-3 text-xs ${isRetard?"text-red-600 font-bold":""}`}>
                    {fmtDate(m.dateFinPrevue)}
                    {isRetard && <p className="text-[10px]">En retard</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded border ${STATUT_COLORS[m.statut]??"bg-gray-100 text-gray-500 border-gray-200"}`}>
                      {STATUT_OPT.find(o => o.value === m.statut)?.label ?? m.statut}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      {canWrite(user?.role) && <Button size="sm" variant="ghost" onClick={() => openEdit(m)}><Pencil className="h-3.5 w-3.5"/></Button>}
                      {user?.role === "ADMIN" && <Button size="sm" variant="ghost" onClick={() => setConfirmDel(m.id)}><Trash2 className="h-3.5 w-3.5 text-red-400"/></Button>}
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

      {/* ════════════════════════════════════════════════════════
          MODAL FICHE MARCHÉ — ONGLETS
          ════════════════════════════════════════════════════════ */}
      <Modal open={detail !== null} onClose={() => setDetail(null)}
        title={`${detail?.reference} — ${detail?.intitule}`} size="xl">
        {detail && (
          <div className="space-y-4">

            {/* En-tête fiche : statut + KPIs rapides */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${STATUT_COLORS[detail.statut]??"bg-gray-100"}`}>
                  {STATUT_OPT.find(o => o.value === detail.statut)?.label ?? detail.statut}
                </span>
                <FinancementBadge financement={detail.financement}/>
                {detail.entreprise.statut === "BLOQUE" && (
                  <span className="text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">⛔ Entreprise bloquée</span>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {canWrite(user?.role) && transitions.length > 0 && (
                  <Button size="sm" variant="secondary" onClick={() => { setTransitionForm({statut:transitions[0], motif:"", pieceRef:""}); setTransitionModal(true); }}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1"/>Changer le statut
                  </Button>
                )}
                {canWrite(user?.role) && (
                  <Button size="sm" onClick={() => { openEdit(detail); setDetail(null); }}>
                    <Pencil className="h-3.5 w-3.5 mr-1"/>Modifier
                  </Button>
                )}
              </div>
            </div>

            {/* Montants rapides */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <KpiCard label="Montant initial HT"  value={fmtGnf(detail.montantInitialGnf)} />
              <KpiCard label="Montant actualisé HT" value={fmtGnf(detail.montantActualiseGnf ?? detail.montantInitialGnf)} color="text-navy" />
              <KpiCard label="Décomptes"            value={detail._count?.decomptes ?? 0} />
              <KpiCard label="BPU / Articles"       value={detail._count?.bpuArticles ?? 0} />
            </div>

            {/* Onglets */}
            <div className="flex gap-0.5 border-b border-gray-200 overflow-x-auto scrollbar-hide">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => setDetailTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                    detailTab===key ? "border-navy text-navy" : "border-transparent text-gray-400 hover:text-gray-600"
                  }`}>
                  <Icon className="h-3.5 w-3.5"/>{label}
                </button>
              ))}
            </div>

            {/* ── Tab Identification §3 ── */}
            {detailTab === "identification" && (
              <div className="space-y-4">
                {/* Checklist conformité */}
                {checklistData && !checklistData.allOk && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5"/>Checklist conformité — Points à régler
                    </p>
                    <div className="grid grid-cols-2 gap-1">
                      {Object.entries(checklistData.checks).map(([k, v]) => (
                        <div key={k} className={`flex items-center gap-1.5 text-[11px] ${v ? "text-green-700" : "text-red-600 font-medium"}`}>
                          {v ? <CheckCircle2 className="h-3 w-3"/> : <XCircle className="h-3 w-3"/>}
                          {k.replace(/_/g," ")}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-x-6 gap-y-3 text-sm">
                  {/* §3.1 Identification */}
                  <div className="col-span-3 text-[10px] font-black tracking-widest text-gray-400 uppercase border-b pb-1">§3.1 Identification</div>
                  {[
                    ["Référence", detail.reference],["N° Contrat", detail.numContrat],["N° Approbation", detail.numApprobation],
                    ["Type", detail.type],["Procédure", detail.procedure],["Financement", detail.financement],
                    ["Bailleur", detail.bailleur],["Composante", detail.composante],["Région", detail.regionNom],
                    ["Préfecture", detail.prefecture],["Commune", detail.commune],["Tronçon BDRI", detail.tronconCode],
                    ["PR Début", detail.pkDebut?.toString()],["PR Fin", detail.pkFin?.toString()],
                    ["Projet rattaché", detail.projet ? `${detail.projet.code} — ${detail.projet.nom}` : null],
                  ].map(([k,v]) => (
                    <div key={String(k)}><p className="text-[10px] text-gray-400">{k}</p><p className="font-medium text-gray-800 mt-0.5">{v ?? "—"}</p></div>
                  ))}
                  {/* §3.2 Contractuel */}
                  <div className="col-span-3 text-[10px] font-black tracking-widest text-gray-400 uppercase border-b pb-1 mt-2">§3.2 Données contractuelles</div>
                  {[
                    ["Entreprise titulaire", detail.entreprise.raisonSociale],
                    ["Co-traitants", detail.coTraitants],["Sous-traitants", detail.sousTraitants],
                    ["Mission de contrôle", detail.missionControle],["Direction technique", detail.directionTechnique],
                    ["Date signature", fmtDate(detail.dateSignature)],["Date notification", fmtDate(detail.dateNotification)],
                    ["Date OS démarrage", fmtDate(detail.dateOs)],
                    ["Délai exécution", detail.delaiJours ? `${detail.delaiJours} jours` : detail.delaiMois ? `${detail.delaiMois} mois` : "—"],
                    ["Début effectif", fmtDate(detail.dateDebutPrevue)],["Fin contractuelle", fmtDate(detail.dateFinPrevue)],
                    ["Fin réelle", fmtDate(detail.dateFinReelle)],
                    ["Réception provisoire", fmtDate(detail.dateReceptionProvisoire)],
                    ["Réception définitive", fmtDate(detail.dateReceptionDefinitive)],
                  ].map(([k,v]) => (
                    <div key={String(k)}><p className="text-[10px] text-gray-400">{k}</p><p className="font-medium text-gray-800 mt-0.5">{v ?? "—"}</p></div>
                  ))}
                  {/* §3.3 Financier */}
                  <div className="col-span-3 text-[10px] font-black tracking-widest text-gray-400 uppercase border-b pb-1 mt-2">§3.3 Données financières</div>
                  {[
                    ["Montant initial HT", fmtGnf(detail.montantInitialGnf)],
                    ["Montant actualisé HT", fmtGnf(detail.montantActualiseGnf ?? detail.montantInitialGnf)],
                    ["Taux TVA", `${detail.tauxTva}%`],
                    ["Taux retenue garantie", `${detail.tauxRetenueGarantie}%`],
                    ["Taux avance mobilisation", `${detail.tauxAvance}%`],
                    ["Montant avance", fmtGnf(detail.montantAvanceGnf ?? "0")],
                    ["Pénalités / jour", fmtGnf(detail.penalitesJourGnf ?? "0")],
                    ["Plafond pénalités", `${detail.plafondPenalitesPct ?? 10}%`],
                  ].map(([k,v]) => (
                    <div key={String(k)}><p className="text-[10px] text-gray-400">{k}</p><p className="font-medium text-gray-800 mt-0.5">{v}</p></div>
                  ))}
                </div>
                {detail.observations && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                    <p className="font-medium text-amber-800 mb-1">Observations</p>
                    <p className="text-amber-700">{detail.observations}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab Lots §5 ── */}
            {detailTab === "lots" && (
              <div className="space-y-3">
                {canWrite(user?.role) && <Button size="sm" onClick={() => { setLotForm({}); setLotModal(true); }}><Plus className="h-4 w-4 mr-1"/>Ajouter un lot</Button>}
                {!(lotData ?? []).length && <p className="text-sm text-gray-400 py-8 text-center">Aucun lot défini</p>}
                {(lotData ?? []).map((l: Lot) => (
                  <div key={l.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3">
                    <div>
                      <span className="font-bold text-navy text-sm">Lot {l.numero}</span>
                      <span className="text-gray-600 text-sm ml-2">— {l.designation}</span>
                    </div>
                    <span className="font-bold text-navy">{fmtGnf(l.montantGnf)}</span>
                  </div>
                ))}
                {(lotData ?? []).length > 1 && (
                  <div className="flex justify-between border-t pt-2 text-sm">
                    <span className="text-gray-500 font-medium">Total lots</span>
                    <span className="font-bold text-navy">{fmtGnf((lotData as Lot[]).reduce((s, l) => s + Number(l.montantGnf), 0).toString())}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab Ordres de Service §6 ── */}
            {detailTab === "os" && (
              <div className="space-y-3">
                {canWrite(user?.role) && (
                  <Button size="sm" onClick={() => { setOsForm({ type:"DEMARRAGE", impactDelaiJours:0, impactMontantGnf:0 }); setOsModal(true); }}>
                    <Plus className="h-4 w-4 mr-1"/>Nouvel OS
                  </Button>
                )}
                {!(osData ?? []).length && <p className="text-sm text-gray-400 py-8 text-center">Aucun ordre de service</p>}
                {(osData ?? []).map((os: OrdreService) => (
                  <div key={os.id} className="border border-gray-200 rounded-lg p-3 text-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-navy text-xs bg-navy/10 px-2 py-0.5 rounded">OS N°{os.numero}</span>
                        <span className="text-xs font-semibold text-gray-600">{os.type}</span>
                      </div>
                      <span className="text-[11px] text-gray-400">{fmtDate(os.dateEmission)}</span>
                    </div>
                    <p className="text-gray-700">{os.objet}</p>
                    <div className="flex gap-4 text-[11px]">
                      {os.impactDelaiJours > 0 && <span className="text-amber-700 font-medium">+{os.impactDelaiJours}j délai</span>}
                      {Number(os.impactMontantGnf) > 0 && <span className="text-blue-700 font-medium">+{fmtGnf(os.impactMontantGnf)}</span>}
                    </div>
                    {os.observations && <p className="text-[11px] text-gray-500 italic">{os.observations}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* ── Tab Avenants §7 ── */}
            {detailTab === "avenants" && (
              <div className="space-y-3">
                {canWrite(user?.role) && (
                  <Button size="sm" onClick={() => { setAvenantForm({ montantSupplementaireGnf:0, prolongationJours:0 }); setAvenantModal(true); }}>
                    <Plus className="h-4 w-4 mr-1"/>Nouvel avenant
                  </Button>
                )}
                {!(avenantData ?? []).length && <p className="text-sm text-gray-400 py-8 text-center">Aucun avenant</p>}
                {(avenantData ?? []).map((av: Avenant) => (
                  <div key={av.id} className="border border-gray-200 rounded-lg p-3 text-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-navy">Avenant N°{av.numero}</span>
                        <AvenantStatutBadge statut={av.statut}/>
                      </div>
                      <span className="text-[11px] text-gray-400">{fmtDate(av.dateSignature)}</span>
                    </div>
                    <p className="text-gray-700">{av.objet}</p>
                    {av.motif && <p className="text-[11px] text-gray-500">Motif : {av.motif}</p>}
                    <div className="flex gap-4 text-[11px]">
                      <span className={Number(av.montantSupplementaireGnf) >= 0 ? "text-green-700 font-bold" : "text-red-600 font-bold"}>
                        {Number(av.montantSupplementaireGnf) >= 0 ? "+" : ""}{fmtGnf(av.montantSupplementaireGnf)}
                      </span>
                      {av.prolongationJours > 0 && <span className="text-amber-700">+{av.prolongationJours}j</span>}
                    </div>
                    {/* Workflow validation */}
                    {av.statut !== "APPROUVE" && av.statut !== "ANNULE" && canWrite(user?.role) && (
                      <Button size="sm" variant="secondary" onClick={() => setAvenantValidModal(av)}>
                        Avancer workflow →
                      </Button>
                    )}
                    <div className="flex gap-3 text-[10px] text-gray-400">
                      {av.valideTechniqueAt && <span>✓ Technique {fmtDate(av.valideTechniqueAt)}</span>}
                      {av.valideFinancierAt && <span>✓ Financier {fmtDate(av.valideFinancierAt)}</span>}
                      {av.visaDgAt         && <span>✓ Visa DG {fmtDate(av.visaDgAt)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Tab Garanties §9 ── */}
            {detailTab === "garanties" && (
              <div className="space-y-3">
                {canWrite(user?.role) && (
                  <Button size="sm" onClick={() => { setGarantieForm({}); setGarantieModal(true); }}>
                    <Plus className="h-4 w-4 mr-1"/>Ajouter garantie
                  </Button>
                )}
                {!(garantieData ?? []).length && <p className="text-sm text-gray-400 py-8 text-center">Aucune garantie</p>}
                {(garantieData ?? []).map((g: Garantie) => (
                  <div key={g.id} className={`border rounded-lg p-3 text-sm ${g.active ? "border-green-200 bg-green-50/30" : "border-gray-200 opacity-60"}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-bold text-gray-800">{g.type}</span>
                        <div className="mt-1"><GarantieBadge g={g}/></div>
                      </div>
                      <span className="font-black text-navy">{fmtGnf(g.montantGnf)}</span>
                    </div>
                    <div className="mt-2 text-[11px] text-gray-500 space-y-0.5">
                      {g.banque && <p>Banque : {g.banque}{g.reference ? ` — Réf: ${g.reference}` : ""}</p>}
                      {g.dateExpiration && <p className={new Date(g.dateExpiration) < new Date() ? "text-red-600 font-medium" : ""}>
                        Expire : {fmtDate(g.dateExpiration)}
                      </p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Tab Réceptions §10 ── */}
            {detailTab === "receptions" && (
              <div className="space-y-3">
                {!(receptionData ?? []).length && <p className="text-sm text-gray-400 py-8 text-center">Aucune réception enregistrée</p>}
                {(receptionData ?? []).map((r: Reception) => (
                  <div key={r.id} className="border border-gray-200 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-navy">{r.type}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        r.statut==="REALISE"?"bg-green-100 text-green-700":
                        r.statut==="AVEC_RESERVES"?"bg-amber-100 text-amber-700":
                        r.statut==="REFUSE"?"bg-red-100 text-red-700":"bg-gray-100 text-gray-500"
                      }`}>{r.statut}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[11px] text-gray-500">
                      <span>Date prévue : {fmtDate(r.datePrevu)}</span>
                      <span>Date réelle : {fmtDate(r.dateReelle)}</span>
                      {r.pvNumero && <span>PV : {r.pvNumero}</span>}
                      {r.dateLeveeReserves && <span className="text-green-700">Réserves levées : {fmtDate(r.dateLeveeReserves)}</span>}
                    </div>
                    {r.observations && <p className="text-[11px] text-gray-500 mt-1 italic">{r.observations}</p>}
                  </div>
                ))}
                <p className="text-[11px] text-gray-400 text-center">
                  Gérer les réceptions dans <strong>Réceptions / PV</strong> →
                </p>
              </div>
            )}

            {/* ── Tab Décomptes ── */}
            {detailTab === "decomptes" && (
              <div className="overflow-x-auto">
                {!(decompteData ?? []).length && <p className="text-sm text-gray-400 py-8 text-center">Aucun décompte</p>}
                {(decompteData ?? []).length > 0 && (
                  <table className="w-full text-sm border border-gray-100 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50"><tr>
                      {["Référence","Type","Statut","Net à payer","Date"].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {(decompteData as Decompte[]).map(d => (
                        <tr key={d.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-xs font-bold text-navy">{d.reference}</td>
                          <td className="px-3 py-2"><TypeDecompteBadge type={d.type}/></td>
                          <td className="px-3 py-2"><StatutDecompteBadge statut={d.statut}/></td>
                          <td className="px-3 py-2 font-semibold">{fmtGnf(d.netAPayer)}</td>
                          <td className="px-3 py-2 text-[11px] text-gray-400">{fmtDate(d.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-navy/5 border-t">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-xs font-bold text-gray-600">Total certifié</td>
                        <td className="px-3 py-2 font-black text-navy">
                          {fmtGnf((decompteData as Decompte[])
                            .filter(d => ["VALIDE","VALIDE_DG","PAYE","ORDONNANCE","EN_CIRCUIT_FINANCIER"].includes(d.statut))
                            .reduce((s, d) => s + Number(d.netAPayer), 0).toString())}
                        </td>
                        <td/>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}

            {/* ── Tab Situation Financière §13 ── */}
            {detailTab === "situation" && (
              <div className="space-y-4">
                {!situation ? (
                  <div className="h-24 bg-gray-50 animate-pulse rounded-xl"/>
                ) : (
                  <>
                    {/* Retard */}
                    {situation.retard?.estEnRetard && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5"/>
                        <div>
                          <p className="font-bold text-red-800 text-sm">Marché en retard</p>
                          <p className="text-red-700 text-xs mt-0.5">
                            {situation.retard.joursRetard} jours de retard —
                            Pénalités calculées : <strong>{fmtGnf(situation.retard.penalitesCalculees.toString())}</strong>
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Alerte risque dépassement MC */}
                    {situation.risque?.niveau === "ROUGE" && (
                      <div className="bg-red-50 border-2 border-red-400 rounded-xl p-3 flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5"/>
                        <div className="flex-1">
                          <p className="font-bold text-red-800 text-sm">Risque de dépassement du montant contractuel</p>
                          <p className="text-red-700 text-xs mt-0.5">{situation.risque.message}</p>
                        </div>
                        <button
                          onClick={() => imprimerSituation(situation, detail!)}
                          className="text-xs bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700 shrink-0"
                        >
                          Imprimer fiche
                        </button>
                      </div>
                    )}
                    {situation.risque?.niveau === "ORANGE" && (
                      <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5"/>
                        <div>
                          <p className="font-bold text-amber-800 text-sm">Attention — Avancement financier élevé</p>
                          <p className="text-amber-700 text-xs mt-0.5">{situation.risque.message}</p>
                        </div>
                      </div>
                    )}

                    {/* KPIs financiers */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <KpiCard label="Montant contrat HT"     value={fmtGnf(situation.financier.montantContratHt.toString())} />
                      <KpiCard label="Montant certifié"        value={fmtGnf(situation.financier.montantCertifie.toString())} color="text-navy"     bg="bg-navy/5" />
                      <KpiCard label="Montant payé"            value={fmtGnf(situation.financier.montantPaye.toString())}     color="text-green-700" bg="bg-green-50" />
                      <KpiCard label="Solde restant"           value={fmtGnf(situation.financier.soldeRestant.toString())}    color="text-amber-700" bg="bg-amber-50" />
                      <KpiCard label="En cours de traitement"  value={fmtGnf(situation.financier.montantEnCours.toString())}  color="text-blue-700"  bg="bg-blue-50" />
                      <KpiCard label="Retenues constituées"    value={fmtGnf(situation.financier.retenues.toString())} />
                      <KpiCard label="Avances récupérées"      value={fmtGnf(situation.financier.avances.toString())} />
                      <KpiCard label="Pénalités appliquées"    value={fmtGnf(situation.financier.penalites.toString())} color="text-red-600" />
                    </div>

                    {/* Barres de progression avec code couleur risque */}
                    <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-bold text-gray-600">Avancement financier</p>
                        <button
                          onClick={() => imprimerSituation(situation, detail!)}
                          className="text-xs text-navy underline hover:text-navy/70"
                        >
                          Imprimer situation officielle
                        </button>
                      </div>
                      {(() => {
                        const tc = situation.financier.tauxConsommation;
                        const barColor = tc >= 85 ? "bg-red-500" : tc >= 70 ? "bg-amber-400" : "bg-green-500";
                        const txtColor = tc >= 85 ? "text-red-600" : tc >= 70 ? "text-amber-600" : "text-green-600";
                        return (
                          <div>
                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                              <span>Taux de certification</span>
                              <span className={`font-bold ${txtColor}`}>{tc}%</span>
                            </div>
                            <ProgressBar value={situation.financier.montantCertifie} max={situation.financier.montantContratHt} color={barColor} />
                          </div>
                        );
                      })()}
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Taux de paiement</span>
                          <span className="font-bold text-green-600">{situation.financier.tauxPaiement}%</span>
                        </div>
                        <ProgressBar value={situation.financier.montantPaye} max={situation.financier.montantContratHt} color="bg-green-500" />
                      </div>
                    </div>

                    {/* Suivi avance de démarrage */}
                    {(situation.avanceDemarrage?.montantVerse ?? 0) > 0 && (
                      <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4">
                        <p className="text-xs font-bold text-blue-800 mb-3">Avance de démarrage</p>
                        <div className="grid grid-cols-3 gap-3 text-center text-sm">
                          <div>
                            <p className="text-[10px] text-gray-400 mb-0.5">Montant versé</p>
                            <p className="font-bold text-blue-700">{fmtGnf(situation.avanceDemarrage.montantVerse.toString())}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 mb-0.5">Récupéré</p>
                            <p className="font-bold text-green-700">{fmtGnf(situation.avanceDemarrage.montantRecupere.toString())}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 mb-0.5">Solde à récupérer</p>
                            <p className={`font-bold ${situation.avanceDemarrage.soldeRestant > 0 ? "text-amber-700" : "text-green-700"}`}>
                              {fmtGnf(situation.avanceDemarrage.soldeRestant.toString())}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3">
                          <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
                            <span>Taux de récupération avance</span>
                            <span className="font-bold">{situation.avanceDemarrage.tauxRecuperation}%</span>
                          </div>
                          <ProgressBar value={situation.avanceDemarrage.montantRecupere} max={situation.avanceDemarrage.montantVerse} color="bg-green-500" />
                        </div>
                      </div>
                    )}

                    {/* Tableau récapitulatif des décomptes */}
                    {(situation.decomptesList ?? []).length > 0 && (
                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                          <p className="text-xs font-bold text-gray-700">
                            Récapitulatif décomptes ({situation.decomptesList.length})
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {situation.financier.nbDecomptesEnCours} en cours · {situation.financier.nbDecomptes - situation.financier.nbDecomptesEnCours} clôturés
                          </p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50/50 border-b border-gray-100">
                              <tr>
                                <th className="text-left px-3 py-2 text-gray-500 font-medium">Référence</th>
                                <th className="text-left px-3 py-2 text-gray-500 font-medium">Type</th>
                                <th className="text-left px-3 py-2 text-gray-500 font-medium">Statut</th>
                                <th className="text-right px-3 py-2 text-gray-500 font-medium">Montant HT</th>
                                <th className="text-right px-3 py-2 text-gray-500 font-medium">Net à payer</th>
                                <th className="text-right px-3 py-2 text-gray-500 font-medium">Date dépôt</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {(situation.decomptesList as any[]).map((d) => (
                                <tr key={d.id} className="hover:bg-gray-50/60 transition-colors">
                                  <td className="px-3 py-2 font-mono font-medium text-navy">{d.reference}</td>
                                  <td className="px-3 py-2"><TypeDecompteBadge type={d.type}/></td>
                                  <td className="px-3 py-2"><StatutDecompteBadge statut={d.statut}/></td>
                                  <td className="px-3 py-2 text-right">{fmtGnf(d.montantPeriodeHtGnf.toString())}</td>
                                  <td className="px-3 py-2 text-right font-medium">{fmtGnf(d.netAPayer.toString())}</td>
                                  <td className="px-3 py-2 text-right text-gray-400">
                                    {d.dateDepot
                                      ? new Date(d.dateDepot).toLocaleDateString("fr-FR")
                                      : d.createdAt
                                        ? new Date(d.createdAt).toLocaleDateString("fr-FR")
                                        : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                              <tr>
                                <td colSpan={3} className="px-3 py-2 font-bold text-gray-700 text-xs">TOTAL CERTIFIÉ / PAYÉ</td>
                                <td className="px-3 py-2 text-right font-bold text-xs">{fmtGnf(situation.financier.montantCertifie.toString())}</td>
                                <td className="px-3 py-2 text-right font-bold text-xs text-green-700">{fmtGnf(situation.financier.montantPaye.toString())}</td>
                                <td/>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Synthèse avenants */}
                    {(avenantData ?? []).length > 0 && (
                      <div className="border border-gray-200 rounded-xl p-3">
                        <p className="text-xs font-bold text-gray-600 mb-2">Avenants ({avenantData.length})</p>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <p className="text-[10px] text-gray-400">Impact montant</p>
                            <p className={`font-bold ${(avenantData as Avenant[]).reduce((s,a)=>s+Number(a.montantSupplementaireGnf),0)>=0?"text-green-700":"text-red-600"}`}>
                              {fmtGnf((avenantData as Avenant[]).reduce((s,a)=>s+Number(a.montantSupplementaireGnf),0).toString())}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400">Prolongation totale</p>
                            <p className="font-bold text-amber-700">{(avenantData as Avenant[]).reduce((s,a)=>s+a.prolongationJours,0)}j</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400">Approuvés</p>
                            <p className="font-bold text-green-700">{(avenantData as Avenant[]).filter(a=>a.statut==="APPROUVE").length}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Synthèse garanties */}
                    {(garantieData ?? []).length > 0 && (
                      <div className="border border-gray-200 rounded-xl p-3">
                        <p className="text-xs font-bold text-gray-600 mb-2">Garanties actives</p>
                        <div className="space-y-1">
                          {(garantieData as Garantie[]).filter(g => g.active).map(g => (
                            <div key={g.id} className="flex justify-between text-sm">
                              <span className="text-gray-600">{g.type}</span>
                              <div className="flex items-center gap-2">
                                <GarantieBadge g={g}/>
                                <span className="font-medium">{fmtGnf(g.montantGnf)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Tab Courbe en S — physique vs financier ── */}
            {detailTab === "courbes" && (
              <div className="space-y-4">
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-gray-700">Courbe en S — avancement physique vs financier (%)</h3>
                    <p className="text-[10px] text-gray-400">Physique = attachements validés · Financier = décomptes certifiés · Prévisionnel = linéaire contractuel</p>
                  </div>
                  {((courbeS?.points ?? []) as unknown[]).length > 1 ? (
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={courbeS.points} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                        <XAxis dataKey="mois" tick={{ fontSize: 10 }}/>
                        <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} unit="%"/>
                        <RTooltip formatter={(v: number) => [`${v}%`]}/>
                        <Legend wrapperStyle={{ fontSize: 11 }}/>
                        <Line type="monotone" dataKey="previsionnel" name="Prévisionnel contractuel" stroke="#9ca3af" strokeDasharray="6 4" strokeWidth={1.5} dot={false}/>
                        <Line type="monotone" dataKey="physique" name="Avancement physique" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 2 }}/>
                        <Line type="monotone" dataKey="financier" name="Avancement financier" stroke="#1B2A4A" strokeWidth={2.5} dot={{ r: 2 }}/>
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-gray-400 py-14 text-sm">Pas encore assez d'activité sur ce marché pour tracer la courbe.</p>
                  )}
                </div>
              </div>
            )}

            {/* ── Tab Historique statuts §4 ── */}
            {detailTab === "historique" && (
              <div className="space-y-2">
                {!(historiqueData ?? []).length && <p className="text-sm text-gray-400 py-8 text-center">Aucun historique</p>}
                {(historiqueData ?? []).map((h: HistoriqueStatut) => (
                  <div key={h.id} className="flex items-start gap-3 border-l-2 border-navy/20 pl-3 pb-3">
                    <div className="h-6 w-6 rounded-full bg-navy/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Activity className="h-3 w-3 text-navy"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {h.statutAvant && (
                          <>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUT_COLORS[h.statutAvant]??"bg-gray-100 text-gray-500"}`}>
                              {STATUT_OPT.find(o=>o.value===h.statutAvant)?.label ?? h.statutAvant}
                            </span>
                            <ArrowRight className="h-3 w-3 text-gray-400"/>
                          </>
                        )}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUT_COLORS[h.statutApres]??"bg-gray-100 text-gray-500"}`}>
                          {STATUT_OPT.find(o=>o.value===h.statutApres)?.label ?? h.statutApres}
                        </span>
                      </div>
                      {h.motif && <p className="text-[11px] text-gray-600 mt-0.5">{h.motif}</p>}
                      <p className="text-[10px] text-gray-400 mt-0.5">{h.userEmail} · {fmtDate(h.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Tab Workflow BPMN ── */}
            {detailTab === "workflow" && (
              <div className="py-2">
                <BpmnPanel
                  moduleType="MARCHE"
                  entityId={detail.id}
                  currentUserRole={user!.role}
                  canSubmit={canWrite(user?.role)}
                />
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
        title={modal === "new" ? "Nouveau marché" : "Modifier le marché"} size="xl">
        <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-4">
          {/* §3.1 Identification */}
          <div>
            <p className="text-[10px] font-black tracking-widest text-gray-400 uppercase mb-2">§3.1 Identification</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Référence marché" required><Input value={String(form.reference??"")} onChange={e=>f("reference",e.target.value)}/></FormField>
              <FormField label="N° Contrat"><Input value={String(form.numContrat??"")} onChange={e=>f("numContrat",e.target.value)}/></FormField>
              <FormField label="Intitulé" required className="col-span-2"><Input value={String(form.intitule??"")} onChange={e=>f("intitule",e.target.value)}/></FormField>
              <FormField label="Objet" className="col-span-2"><Textarea rows={2} value={String(form.objet??"")} onChange={e=>f("objet",e.target.value)}/></FormField>
              <FormField label="Type de marché" required>
                <Select value={String(form.type??"")} onChange={e=>f("type",e.target.value)}>
                  <option value="">Choisir…</option>{TYPE_OPT.map(v=><option key={v} value={v}>{v}</option>)}
                </Select>
              </FormField>
              <FormField label="Procédure de passation" required>
                <Select value={String(form.procedure??"")} onChange={e=>f("procedure",e.target.value)}>
                  <option value="">Choisir…</option>{PROC_OPT.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </FormField>
              <FormField label="Source de financement" required>
                <Select value={String(form.financement??"")} onChange={e=>f("financement",e.target.value)}>
                  <option value="">Choisir…</option>{FIN_OPT.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </FormField>
              <FormField label="Bailleur / Composante"><Input value={String(form.bailleur??"")} onChange={e=>f("bailleur",e.target.value)}/></FormField>
              <FormField label="Région"><Input value={String(form.regionNom??"")} onChange={e=>f("regionNom",e.target.value)}/></FormField>
              <FormField label="Préfecture"><Input value={String(form.prefecture??"")} onChange={e=>f("prefecture",e.target.value)}/></FormField>
              <FormField label="Code tronçon BDRI"><Input value={String(form.tronconCode??"")} onChange={e=>f("tronconCode",e.target.value)}/></FormField>
              <FormField label="PR Début"><Input type="number" step="0.001" value={String(form.pkDebut??"")} onChange={e=>f("pkDebut",Number(e.target.value))}/></FormField>
              <FormField label="PR Fin"><Input type="number" step="0.001" value={String(form.pkFin??"")} onChange={e=>f("pkFin",Number(e.target.value))}/></FormField>
            </div>
          </div>

          {/* §3.2 Contractuel */}
          <div>
            <p className="text-[10px] font-black tracking-widest text-gray-400 uppercase mb-2">§3.2 Contractuel</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Entreprise titulaire" required className="col-span-2">
                <Select value={String(form.entrepriseId??"")} onChange={e=>f("entrepriseId",e.target.value)}>
                  <option value="">Choisir…</option>
                  {(entreprises??[]).map((e:{id:string;raisonSociale:string;statut:string})=>(
                    <option key={e.id} value={e.id} disabled={e.statut==="BLOQUE"}>
                      {e.raisonSociale}{e.statut==="BLOQUE"?" ⛔":""}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Co-traitants"><Input value={String(form.coTraitants??"")} onChange={e=>f("coTraitants",e.target.value)} placeholder="Noms séparés par virgule"/></FormField>
              <FormField label="Sous-traitants"><Input value={String(form.sousTraitants??"")} onChange={e=>f("sousTraitants",e.target.value)}/></FormField>
              <FormField label="Mission de contrôle"><Input value={String(form.missionControle??"")} onChange={e=>f("missionControle",e.target.value)}/></FormField>
              <FormField label="Direction technique"><Input value={String(form.directionTechnique??"")} onChange={e=>f("directionTechnique",e.target.value)}/></FormField>
              <FormField label="Date signature"><Input type="date" value={String(form.dateSignature??"")} onChange={e=>f("dateSignature",e.target.value)}/></FormField>
              <FormField label="Date notification"><Input type="date" value={String(form.dateNotification??"")} onChange={e=>f("dateNotification",e.target.value)}/></FormField>
              <FormField label="Date OS démarrage"><Input type="date" value={String(form.dateOs??"")} onChange={e=>f("dateOs",e.target.value)}/></FormField>
              <FormField label="Délai exécution (jours)"><Input type="number" value={String(form.delaiJours??"")} onChange={e=>f("delaiJours",Number(e.target.value))}/></FormField>
              <FormField label="Date début prévue"><Input type="date" value={String(form.dateDebutPrevue??"")} onChange={e=>f("dateDebutPrevue",e.target.value)}/></FormField>
              <FormField label="Date fin prévue"><Input type="date" value={String(form.dateFinPrevue??"")} onChange={e=>f("dateFinPrevue",e.target.value)}/></FormField>
            </div>
          </div>

          {/* §3.3 Financier */}
          <div>
            <p className="text-[10px] font-black tracking-widest text-gray-400 uppercase mb-2">§3.3 Financier</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Montant initial HT (GNF)" required><Input type="number" value={String(form.montantInitialGnf??"")} onChange={e=>f("montantInitialGnf",Number(e.target.value))}/></FormField>
              <FormField label="Taux TVA (%)"><Input type="number" value={String(form.tauxTva??18)} onChange={e=>f("tauxTva",Number(e.target.value))}/></FormField>
              <FormField label="Taux retenue garantie (%)"><Input type="number" value={String(form.tauxRetenueGarantie??5)} onChange={e=>f("tauxRetenueGarantie",Number(e.target.value))}/></FormField>
              <FormField label="Taux avance mobilisation (%)"><Input type="number" value={String(form.tauxAvance??20)} onChange={e=>f("tauxAvance",Number(e.target.value))}/></FormField>
              <FormField label="Pénalités / jour (GNF)"><Input type="number" value={String(form.penalitesJourGnf??0)} onChange={e=>f("penalitesJourGnf",Number(e.target.value))}/></FormField>
              <FormField label="Plafond pénalités (%)"><Input type="number" value={String(form.plafondPenalitesPct??10)} onChange={e=>f("plafondPenalitesPct",Number(e.target.value))}/></FormField>
            </div>
          </div>

          <FormField label="Observations"><Textarea rows={2} value={String(form.observations??"")} onChange={e=>f("observations",e.target.value)}/></FormField>
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
          <Button variant="secondary" onClick={() => setModal(null)}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>
            {createMut.isPending || updateMut.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </Modal>

      {/* ════ MODAL TRANSITION STATUT ════ */}
      <Modal open={transitionModal} onClose={() => setTransitionModal(false)} title="Changer le statut du marché" size="sm">
        <div className="space-y-3">
          <div className="p-3 bg-navy/5 rounded-lg text-sm">
            <p className="text-[11px] text-gray-500">Statut actuel</p>
            <p className="font-bold text-navy">{STATUT_OPT.find(o=>o.value===detail?.statut)?.label ?? detail?.statut}</p>
          </div>
          <FormField label="Nouveau statut">
            <Select value={transitionForm.statut} onChange={e => setTransitionForm(p=>({...p, statut:e.target.value}))}>
              <option value="">Choisir la transition…</option>
              {transitions.map(t => (
                <option key={t} value={t}>{STATUT_OPT.find(o=>o.value===t)?.label ?? t}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Motif / Justification">
            <Input value={transitionForm.motif} onChange={e => setTransitionForm(p=>({...p, motif:e.target.value}))} placeholder="Raison du changement de statut"/>
          </FormField>
          <FormField label="Référence document (optionnel)">
            <Input value={transitionForm.pieceRef} onChange={e => setTransitionForm(p=>({...p, pieceRef:e.target.value}))} placeholder="N° courrier, décision DG…"/>
          </FormField>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="secondary" onClick={() => setTransitionModal(false)}>Annuler</Button>
            <Button disabled={!transitionForm.statut || transitionMut.isPending}
              onClick={() => detail && transitionMut.mutate({ id:detail.id, ...transitionForm })}>
              {transitionMut.isPending ? "En cours…" : "Confirmer"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ════ MODAL VALIDATION AVENANT ════ */}
      <Modal open={avenantValidModal !== null} onClose={() => setAvenantValidModal(null)} title="Workflow avenant" size="sm">
        {avenantValidModal && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Avenant N°{avenantValidModal.numero} — {avenantValidModal.objet}</p>
            <p className="text-sm font-medium">Statut actuel : <AvenantStatutBadge statut={avenantValidModal.statut}/></p>
            <p className="text-xs text-gray-500 mb-2">Choisir la prochaine étape de validation :</p>
            <div className="grid grid-cols-1 gap-2">
              {[
                { action:"VALIDE_TECHNIQUE", label:"Valider techniquement", roles:["ADMIN","DMC","TECHNIQUE"] },
                { action:"VALIDE_FINANCIER", label:"Valider financièrement (DAF)", roles:["ADMIN","DAF"] },
                { action:"VISE_DG",          label:"Visa DG", roles:["ADMIN","DG"] },
                { action:"APPROUVE",         label:"✅ Approuver définitivement", roles:["ADMIN","DG"] },
                { action:"ANNULE",           label:"❌ Annuler l'avenant", roles:["ADMIN","DG"] },
              ].filter(a => a.roles.includes(user?.role ?? "")).map(a => (
                <Button key={a.action} variant="secondary" size="sm"
                  onClick={() => avenantValiderMut.mutate({ aid:avenantValidModal.id, action:a.action })}>
                  {a.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* ════ MODAL OS ════ */}
      <Modal open={osModal} onClose={() => setOsModal(false)} title="Nouvel Ordre de Service" size="md">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Type" required>
            <Select value={String(osForm.type??"")} onChange={e=>setOsForm(p=>({...p,type:e.target.value}))}>
              {["DEMARRAGE","ARRET","REPRISE","REPRISE_APRES_SUSPENSION","MODIFICATION","PROLONGATION","PRISE_EN_CHARGE"].map(v=><option key={v} value={v}>{v}</option>)}
            </Select>
          </FormField>
          <FormField label="Date d'émission" required><Input type="date" value={String(osForm.dateEmission??"")} onChange={e=>setOsForm(p=>({...p,dateEmission:e.target.value}))}/></FormField>
          <FormField label="Objet" required className="col-span-2"><Input value={String(osForm.objet??"")} onChange={e=>setOsForm(p=>({...p,objet:e.target.value}))}/></FormField>
          <FormField label="Date d'effet"><Input type="date" value={String(osForm.dateEffet??"")} onChange={e=>setOsForm(p=>({...p,dateEffet:e.target.value}))}/></FormField>
          <FormField label="Impact délai (jours)"><Input type="number" value={String(osForm.impactDelaiJours??0)} onChange={e=>setOsForm(p=>({...p,impactDelaiJours:Number(e.target.value)}))}/></FormField>
          <FormField label="Impact montant (GNF)"><Input type="number" value={String(osForm.impactMontantGnf??0)} onChange={e=>setOsForm(p=>({...p,impactMontantGnf:Number(e.target.value)}))}/></FormField>
          <FormField label="Observations" className="col-span-2"><Textarea rows={2} value={String(osForm.observations??"")} onChange={e=>setOsForm(p=>({...p,observations:e.target.value}))}/></FormField>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setOsModal(false)}>Annuler</Button>
          <Button onClick={() => osMut.mutate(osForm)} disabled={osMut.isPending}>Créer l'OS</Button>
        </div>
      </Modal>

      {/* ════ MODAL AVENANT ════ */}
      <Modal open={avenantModal} onClose={() => setAvenantModal(false)} title="Nouvel avenant" size="md">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Objet" required className="col-span-2"><Input value={String(avenantForm.objet??"")} onChange={e=>setAvenantForm(p=>({...p,objet:e.target.value}))}/></FormField>
          <FormField label="Motif"><Input value={String(avenantForm.motif??"")} onChange={e=>setAvenantForm(p=>({...p,motif:e.target.value}))}/></FormField>
          <FormField label="Impact périmètre"><Input value={String(avenantForm.impactPerimetre??"")} onChange={e=>setAvenantForm(p=>({...p,impactPerimetre:e.target.value}))}/></FormField>
          <FormField label="Montant supplémentaire (GNF)"><Input type="number" value={String(avenantForm.montantSupplementaireGnf??0)} onChange={e=>setAvenantForm(p=>({...p,montantSupplementaireGnf:Number(e.target.value)}))}/></FormField>
          <FormField label="Prolongation (jours)"><Input type="number" value={String(avenantForm.prolongationJours??0)} onChange={e=>setAvenantForm(p=>({...p,prolongationJours:Number(e.target.value)}))}/></FormField>
          <FormField label="Date de signature"><Input type="date" value={String(avenantForm.dateSignature??"")} onChange={e=>setAvenantForm(p=>({...p,dateSignature:e.target.value}))}/></FormField>
          <FormField label="Observations" className="col-span-2"><Textarea rows={2} value={String(avenantForm.observations??"")} onChange={e=>setAvenantForm(p=>({...p,observations:e.target.value}))}/></FormField>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setAvenantModal(false)}>Annuler</Button>
          <Button onClick={() => avenantMut.mutate(avenantForm)} disabled={avenantMut.isPending}>Enregistrer</Button>
        </div>
      </Modal>

      {/* ════ MODAL GARANTIE ════ */}
      <Modal open={garantieModal} onClose={() => setGarantieModal(false)} title="Ajouter une garantie" size="md">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Type de garantie" required>
            <Select value={String(garantieForm.type??"")} onChange={e=>setGarantieForm(p=>({...p,type:e.target.value}))}>
              <option value="">Choisir…</option>
              {["SOUMISSION","BONNE_EXECUTION","AVANCE","RETENUE","DEFAUT","ASSURANCE"].map(v=><option key={v} value={v}>{v}</option>)}
            </Select>
          </FormField>
          <FormField label="Montant (GNF)" required><Input type="number" value={String(garantieForm.montantGnf??"")} onChange={e=>setGarantieForm(p=>({...p,montantGnf:Number(e.target.value)}))}/></FormField>
          <FormField label="Banque émettrice"><Input value={String(garantieForm.banque??"")} onChange={e=>setGarantieForm(p=>({...p,banque:e.target.value}))}/></FormField>
          <FormField label="N° Référence / Caution"><Input value={String(garantieForm.reference??"")} onChange={e=>setGarantieForm(p=>({...p,reference:e.target.value}))}/></FormField>
          <FormField label="Date d'émission"><Input type="date" value={String(garantieForm.dateEmission??"")} onChange={e=>setGarantieForm(p=>({...p,dateEmission:e.target.value}))}/></FormField>
          <FormField label="Date d'expiration"><Input type="date" value={String(garantieForm.dateExpiration??"")} onChange={e=>setGarantieForm(p=>({...p,dateExpiration:e.target.value}))}/></FormField>
          <FormField label="Observations" className="col-span-2"><Textarea rows={2} value={String(garantieForm.observations??"")} onChange={e=>setGarantieForm(p=>({...p,observations:e.target.value}))}/></FormField>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setGarantieModal(false)}>Annuler</Button>
          <Button onClick={() => garantieMut.mutate(garantieForm)} disabled={garantieMut.isPending}>Enregistrer</Button>
        </div>
      </Modal>

      {/* ════ MODAL LOT ════ */}
      <Modal open={lotModal} onClose={() => setLotModal(false)} title="Créer un lot" size="sm">
        <div className="space-y-3">
          <FormField label="Numéro du lot" required><Input value={String(lotForm.numero??"")} onChange={e=>setLotForm(p=>({...p,numero:e.target.value}))} placeholder="1, 2A…"/></FormField>
          <FormField label="Désignation" required><Input value={String(lotForm.designation??"")} onChange={e=>setLotForm(p=>({...p,designation:e.target.value}))}/></FormField>
          <FormField label="Montant HT (GNF)" required><Input type="number" value={String(lotForm.montantGnf??"")} onChange={e=>setLotForm(p=>({...p,montantGnf:Number(e.target.value)}))}/></FormField>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setLotModal(false)}>Annuler</Button>
          <Button onClick={() => lotMut.mutate(lotForm)} disabled={lotMut.isPending}>Créer</Button>
        </div>
      </Modal>

      {/* ════ MODAL SUPPRESSION ════ */}
      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Confirmer la suppression" size="sm">
        <p className="text-sm text-gray-600 mb-4">Cette action est irréversible. Le marché sera archivé.</p>
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
