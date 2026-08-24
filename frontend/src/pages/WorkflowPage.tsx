/**
 * Workflow BPMN — AGEROUTE ERP
 * : MISSION → TECHNIQUE → DMC → DAF → DG → circuit financier
 * 6 décisions : APPROUVE | REJETE | DEMANDE_CORRECTION | DEMANDE_COMPLEMENT | SUSPENDRE | AUDIT
 * DG/ADMIN : vue superviseur avec toutes les instances en cours
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError, fmtGnf } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { FormField, Textarea } from "../components/ui/Input";
import { toast } from "../components/ui/Toast";
import {
  CheckCircle, XCircle, Clock, AlertTriangle, RotateCcw, Search,
  PauseCircle, Eye, ChevronRight, Activity, Shield, FileWarning,
  MessageSquare, Users, BarChart3, RefreshCw, PlayCircle, Gavel,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Decision = "APPROUVE" | "REJETE" | "DEMANDE_CORRECTION" | "DEMANDE_COMPLEMENT" | "SUSPENDRE" | "AUDIT";

interface WorkflowEtape {
  id: string; ordre: number; nom: string; roleRequis: string; slaJours?: number;
}
interface WorkflowAction {
  id: string; decision: Decision; commentaire?: string; createdAt: string;
  user: { nomComplet: string; role: string; email: string };
  etape: { nom: string; ordre: number; roleRequis: string };
}
interface WorkflowInstance {
  id: string; etapeActuelle: number; statut: string; createdAt: string; updatedAt: string;
  definition: { nom: string; financement: string; etapes: WorkflowEtape[] };
  actions: WorkflowAction[];
  etapeCourante?: WorkflowEtape;
  joursEnCours?: number; enRetardSla?: boolean; peutAgir?: boolean;
  decompte?: {
    id: string; reference: string; netAPayer?: string; montantTtcGnf?: string;
    marche: { reference: string; intitule: string; financement: string };
    entreprise: { raisonSociale: string };
  };
}
interface SupervisionStats {
  enCours: number; approuves: number; rejetes: number; total: number;
  parEtape: { nom: string; roleRequis: string; nb: number }[];
}

// ─── Config BPMN ─────────────────────────────────────────────────────────────

const DECISIONS_CFG: Record<Decision, { label: string; color: string; bg: string; border: string; Icon: React.ElementType; need_comment: boolean }> = {
  APPROUVE:           { label: "Approuver",            color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0", Icon: CheckCircle,   need_comment: false },
  REJETE:             { label: "Rejeter",               color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", Icon: XCircle,       need_comment: true },
  DEMANDE_CORRECTION: { label: "Demander correction",   color: "#D97706", bg: "#FFFBEB", border: "#FDE68A", Icon: RotateCcw,     need_comment: true },
  DEMANDE_COMPLEMENT: { label: "Demander complément",   color: "#0891B2", bg: "#F0F9FF", border: "#BAE6FD", Icon: MessageSquare, need_comment: true },
  SUSPENDRE:          { label: "Suspendre (DG)",        color: "#7C3AED", bg: "#FAF5FF", border: "#E9D5FF", Icon: PauseCircle,   need_comment: true },
  AUDIT:              { label: "Demander audit (DG)",   color: "#9333EA", bg: "#FDF4FF", border: "#F5D0FE", Icon: Shield,        need_comment: true },
};

const STATUT_WF_CFG: Record<string, { label: string; color: string; bg: string }> = {
  EN_COURS: { label: "En cours",  color: "#1D4ED8", bg: "#DBEAFE" },
  APPROUVE: { label: "Approuvé", color: "#16A34A", bg: "#DCFCE7" },
  REJETE:   { label: "Rejeté",   color: "#DC2626", bg: "#FEE2E2" },
};

const FINANCEMENT_COLOR: Record<string, string> = {
  FER: "#1B2A4A", BUDGET_NATIONAL: "#065F46", BANQUE_MONDIALE: "#0891B2",
  BAD: "#7C3AED", BID: "#D97706", AFD: "#DC2626",
};

const ROLES_SUPERV = ["DG", "ADMIN"];
const DG_ONLY = ["SUSPENDRE", "AUDIT"];

// ─── Composants ───────────────────────────────────────────────────────────────

function StatutBadge({ statut }: { statut: string }) {
  const cfg = STATUT_WF_CFG[statut] ?? { label: statut, color: "#6B7280", bg: "#F3F4F6" };
  return (
    <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ color: cfg.color, backgroundColor: cfg.bg }}>
      {cfg.label}
    </span>
  );
}

function CircuitProgress({ etapes, etapeActuelle, actions }: { etapes: WorkflowEtape[]; etapeActuelle: number; actions: WorkflowAction[] }) {
  return (
    <div className="flex items-start gap-1 overflow-x-auto pb-2">
      {etapes.map((e, i) => {
        const action = actions.find((a) => a.etape?.ordre === e.ordre);
        const isCurrent = i === etapeActuelle;
        const isDone    = i < etapeActuelle;
        const isPending = i > etapeActuelle;

        const bg    = action?.decision === "APPROUVE" ? "#16A34A" : action?.decision === "REJETE" ? "#DC2626" : isCurrent ? "#1B2A4A" : isPending ? "#E5E7EB" : "#6B7280";
        const text  = isPending ? "#9CA3AF" : "#FFFFFF";

        return (
          <div key={e.id} className="flex items-center gap-1 shrink-0">
            <div className="flex flex-col items-center gap-0.5">
              <div className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ring-2 ring-white"
                style={{ backgroundColor: bg, color: text, boxShadow: isCurrent ? `0 0 0 2px ${bg}` : "none" }}>
                {action?.decision === "APPROUVE" ? <CheckCircle className="h-3.5 w-3.5" />
                  : action?.decision === "REJETE"   ? <XCircle className="h-3.5 w-3.5" />
                  : isCurrent ? <Clock className="h-3.5 w-3.5" />
                  : i + 1}
              </div>
              <p className="text-[9px] text-center max-w-[52px] leading-tight font-medium" style={{ color: isPending ? "#9CA3AF" : "#374151" }}>{e.nom}</p>
              <p className="text-[8px] text-center" style={{ color: "#9CA3AF" }}>{e.roleRequis}</p>
            </div>
            {i < etapes.length - 1 && (
              <div className="w-5 h-px mt-[-18px]" style={{ backgroundColor: isDone ? "#16A34A" : "#E5E7EB" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function AuditTimeline({ actions }: { actions: WorkflowAction[] }) {
  if (actions.length === 0) return <p className="text-xs text-gray-400 italic">Aucune action enregistrée.</p>;
  const dcfg = DECISIONS_CFG;
  return (
    <div className="relative pl-5">
      <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-100" />
      {actions.map((a) => {
        const cfg = dcfg[a.decision as Decision] ?? dcfg.APPROUVE;
        const Icon = cfg.Icon;
        return (
          <div key={a.id} className="relative flex gap-3 pb-4">
            <div className="absolute -left-2 h-5 w-5 rounded-full flex items-center justify-center border-2 border-white" style={{ backgroundColor: cfg.bg }}>
              <Icon className="h-2.5 w-2.5" style={{ color: cfg.color }} />
            </div>
            <div className="flex-1 pt-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-navy">{a.user?.nomComplet ?? "—"}</span>
                <span className="text-[10px] text-gray-400">({a.user?.role})</span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: cfg.color, backgroundColor: cfg.bg }}>{a.decision.replace(/_/g, " ")}</span>
                <span className="text-[10px] text-gray-300 ml-auto">{new Date(a.createdAt).toLocaleDateString("fr-FR")}</span>
              </div>
              {a.commentaire && <p className="text-xs text-gray-500 mt-0.5 italic">"{a.commentaire}"</p>}
              <p className="text-[9px] text-gray-300 mt-0.5">Étape : {a.etape?.nom}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function WorkflowPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const role = user?.role ?? "";
  // ROLES_SUPERV est défini au niveau module — l'ancienne référence à une constante
  // déclarée plus bas dans la fonction levait "Cannot access before initialization"
  // et faisait planter toute la page Mes tâches au rendu.
  const isSuperv = ROLES_SUPERV.includes(role);

  const [selected, setSelected] = useState<WorkflowInstance | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [commentaire, setCommentaire] = useState("");
  const [activeTab, setActiveTab] = useState<"taches" | "supervision" | "definitions" | "bpmn">("taches");

  const tachesQ = useQuery({
    queryKey: ["workflow", "mes-taches"],
    queryFn: () => api.get("/workflow/mes-taches").then((r) => r.data),
    refetchInterval: 30000,
  });

  const supervQ = useQuery({
    queryKey: ["workflow", "supervision"],
    queryFn: () => api.get("/workflow/supervision").then((r) => r.data),
    enabled: isSuperv && activeTab === "supervision",
  });

  const defsQ = useQuery({
    queryKey: ["workflow", "definitions"],
    queryFn: () => api.get("/workflow/definitions").then((r) => r.data),
    enabled: activeTab === "definitions",
  });

  const slaQ = useQuery({
    queryKey: ["workflow", "sla"],
    queryFn: () => api.get("/notifications/sla/retards").then((r) => r.data).catch(() => []),
    refetchInterval: 60000,
  });

  const actionMut = useMutation({
    mutationFn: ({ instanceId, decision, commentaire }: { instanceId: string; decision: Decision; commentaire?: string }) =>
      api.post(`/workflow/${instanceId}/action`, { decision, commentaire }).then((r) => r.data),
    onSuccess: (data) => {
      toast.success(data.message ?? "Action enregistrée");
      qc.invalidateQueries({ queryKey: ["workflow"] });
      qc.invalidateQueries({ queryKey: ["decomptes"] });
      setSelected(null); setDecision(null); setCommentaire("");
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const leverMut = useMutation({
    mutationFn: (instanceId: string) => api.post(`/workflow/${instanceId}/lever-suspension`).then((r) => r.data),
    onSuccess: () => { toast.success("Suspension levée"); qc.invalidateQueries({ queryKey: ["workflow"] }); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const taches: WorkflowInstance[] = tachesQ.data ?? [];
  const stats: SupervisionStats | undefined = supervQ.data;
  const defs: Array<{ id: string; nom: string; financement: string; actif: boolean; etapes: WorkflowEtape[] }> = defsQ.data ?? [];
  const retards: Array<{ instanceId: string; decompteRef: string; etape: string; roleRequis: string; joursRetard: number }> = slaQ.data ?? [];

  const ROLES_SUPERVISEURS = ["DG", "ADMIN"];

  function openTraiter(inst: WorkflowInstance) {
    setSelected(inst);
    setDecision(null);
    setCommentaire("");
  }

  function handleAction() {
    if (!selected || !decision) return;
    const needsComment = DECISIONS_CFG[decision].need_comment;
    if (needsComment && commentaire.trim().length < 5) {
      toast.error("Un commentaire motivé est obligatoire (min 5 caractères)");
      return;
    }
    actionMut.mutate({ instanceId: selected.id, decision, commentaire: commentaire || undefined });
  }

  // ── Stats rapides depuis les tâches ──────────────────────────────────────────
  const nbEnCours   = taches.filter((t) => t.statut === "EN_COURS").length;
  const nbSlaRetard = taches.filter((t) => t.enRetardSla).length;
  const nbDgStep    = taches.filter((t) => t.etapeCourante?.roleRequis === "DG").length;

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-navy/10 flex items-center justify-center shrink-0">
            <Activity className="h-5 w-5 text-navy" />
          </div>
          <div><p className="text-2xl font-black text-navy">{nbEnCours}</p><p className="text-xs text-gray-400">{isSuperv ? "En cours (global)" : "Mes tâches"}</p></div>
        </div>
        <div className={`bg-white border rounded-xl p-4 shadow-sm flex items-center gap-3 ${nbSlaRetard > 0 ? "border-red-200" : "border-gray-100"}`}>
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${nbSlaRetard > 0 ? "bg-red-50" : "bg-gray-50"}`}>
            <AlertTriangle className={`h-5 w-5 ${nbSlaRetard > 0 ? "text-red-500" : "text-gray-300"}`} />
          </div>
          <div><p className={`text-2xl font-black ${nbSlaRetard > 0 ? "text-red-600" : "text-gray-300"}`}>{nbSlaRetard}</p><p className="text-xs text-gray-400">Retards SLA</p></div>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
            <Gavel className="h-5 w-5 text-amber-600" />
          </div>
          <div><p className="text-2xl font-black text-amber-600">{nbDgStep}</p><p className="text-xs text-gray-400">En attente DG</p></div>
        </div>
      </div>

      {/* Alertes SLA */}
      {retards.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-800 font-bold text-sm mb-2">
            <AlertTriangle className="h-4 w-4" /> {retards.length} décompte{retards.length > 1 ? "s" : ""} dépassent le délai SLA
          </div>
          {retards.map((r) => (
            <div key={r.instanceId} className="text-xs text-red-700 flex items-center gap-2 mt-1.5">
              <span className="font-mono font-bold">{r.decompteRef}</span>
              <ChevronRight className="h-3 w-3 text-red-300" />
              <span className="italic">{r.etape}</span>
              <span className="ml-auto font-bold text-red-900 bg-red-100 px-2 py-0.5 rounded">{r.joursRetard}j de retard</span>
            </div>
          ))}
        </div>
      )}

      {/* Onglets */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          <button onClick={() => setActiveTab("taches")} className={`px-4 py-2.5 text-xs font-semibold transition-colors ${activeTab === "taches" ? "bg-navy text-white" : "text-gray-500 hover:text-navy"}`}>
            Mes tâches ({taches.length})
          </button>
          {isSuperv && (
            <button onClick={() => setActiveTab("supervision")} className={`px-4 py-2.5 text-xs font-semibold transition-colors ${activeTab === "supervision" ? "bg-navy text-white" : "text-gray-500 hover:text-navy"}`}>
              Supervision DG
            </button>
          )}
          <button onClick={() => setActiveTab("definitions")} className={`px-4 py-2.5 text-xs font-semibold transition-colors ${activeTab === "definitions" ? "bg-navy text-white" : "text-gray-500 hover:text-navy"}`}>
            Circuits ({defs.length || "?"})
          </button>
          <button onClick={() => setActiveTab("bpmn")} className={`px-4 py-2.5 text-xs font-semibold transition-colors ${activeTab === "bpmn" ? "bg-navy text-white" : "text-gray-500 hover:text-navy"}`}>
            BPMN 5 modules
          </button>
          <button onClick={() => { tachesQ.refetch(); supervQ.refetch(); }} className="ml-auto px-3 py-2 text-gray-400 hover:text-navy transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${tachesQ.isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* ── TAB MES TÂCHES ──────────────────────────────────────────────────── */}
        {activeTab === "taches" && (
          <div>
            {tachesQ.isLoading && (
              <div className="h-40 flex items-center justify-center text-gray-400 text-sm">
                <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Chargement…
              </div>
            )}
            {!tachesQ.isLoading && taches.length === 0 && (
              <div className="py-16 text-center text-gray-400">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium text-sm">Aucune tâche en attente</p>
                <p className="text-xs mt-1">Toutes les validations sont à jour.</p>
              </div>
            )}
            {taches.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Décompte","Marché","Entreprise","Circuit","Étape courante","Délai","Statut",""].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left font-semibold text-gray-400 uppercase text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {taches.map((inst) => {
                      const etape = inst.etapeCourante ?? inst.definition.etapes[inst.etapeActuelle];
                      const jours = inst.joursEnCours ?? 0;
                      const retard = inst.enRetardSla;
                      const suspended = (inst.decompte as unknown as { traitementSuspendu?: boolean })?.traitementSuspendu;
                      const finColor = FINANCEMENT_COLOR[inst.definition.financement] ?? "#1B2A4A";
                      return (
                        <tr key={inst.id} className={`hover:bg-gray-50/50 transition-colors ${retard ? "bg-red-50/30" : suspended ? "bg-purple-50/30" : ""}`}>
                          <td className="px-4 py-3">
                            <span className="font-mono font-bold text-navy">{inst.decompte?.reference ?? "—"}</span>
                            {(inst as unknown as { source?: string }).source === "BPMN" && <span className="ml-1 text-[9px] text-blue-600 bg-blue-50 px-1 py-0.5 rounded" title="Déposé via le portail entreprise — à traiter depuis la fiche décompte">Portail</span>}
                            {suspended && <span className="ml-1 text-[9px] text-purple-600 bg-purple-50 px-1 py-0.5 rounded">Suspendu</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-600 max-w-[120px] truncate">{inst.decompte?.marche.reference}</td>
                          <td className="px-4 py-3 text-gray-600 max-w-[120px] truncate">{inst.decompte?.entreprise.raisonSociale}</td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: finColor }}>
                              {inst.definition.financement.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-navy">{etape?.nom ?? "—"}</span>
                            <span className="text-gray-400 ml-1.5 text-[10px]">({etape?.roleRequis})</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-bold flex items-center gap-0.5 ${retard ? "text-red-600" : "text-gray-600"}`}>
                              {jours}j {retard && <AlertTriangle className="h-3 w-3" />}
                            </span>
                          </td>
                          <td className="px-4 py-3"><StatutBadge statut={inst.statut} /></td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => {
                                if ((inst as unknown as { source?: string }).source === "BPMN") {
                                  navigate(`/decomptes?id=${(inst as unknown as { decompte?: { id?: string } }).decompte?.id ?? ""}`);
                                } else {
                                  setSelected({ ...inst, peutAgir: false });
                                }
                              }}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              {inst.peutAgir && (
                                <Button size="sm" onClick={() => openTraiter(inst)}>
                                  Traiter
                                </Button>
                              )}
                              {isSuperv && suspended && (
                                <Button size="sm" variant="ghost" onClick={() => leverMut.mutate(inst.id)}>
                                  <PlayCircle className="h-3.5 w-3.5 text-purple-600" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB SUPERVISION DG ──────────────────────────────────────────────── */}
        {activeTab === "supervision" && isSuperv && (
          <div className="p-5">
            {supervQ.isLoading && <div className="h-32 flex items-center justify-center text-gray-400 text-sm"><RefreshCw className="h-4 w-4 animate-spin mr-2" />Chargement…</div>}
            {stats && (
              <div className="space-y-5">
                <div className="grid grid-cols-4 gap-3">
                  {([
                    ["En cours",  stats.enCours,  "#1D4ED8"],
                    ["Approuvés", stats.approuves, "#16A34A"],
                    ["Rejetés",   stats.rejetes,   "#DC2626"],
                    ["Total",     stats.total,      "#6B7280"],
                  ] as [string, number, string][]).map(([k, v, c]) => (
                    <div key={k} className="text-center bg-gray-50 rounded-xl p-4">
                      <p className="text-2xl font-black" style={{ color: c }}>{v}</p>
                      <p className="text-xs text-gray-400 mt-1">{k}</p>
                    </div>
                  ))}
                </div>

                {stats.parEtape.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Répartition par étape</p>
                    <div className="space-y-2">
                      {stats.parEtape.map((e) => (
                        <div key={e.nom} className="flex items-center gap-3">
                          <span className="text-xs text-gray-600 w-36 shrink-0">{e.nom}</span>
                          <span className="text-[10px] text-gray-400 w-16 shrink-0">{e.roleRequis}</span>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-navy rounded-full" style={{ width: `${Math.min(100, (e.nb / Math.max(...stats.parEtape.map((x) => x.nb), 1)) * 100)}%` }} />
                          </div>
                          <span className="text-xs font-black text-navy w-4 shrink-0">{e.nb}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAB CIRCUITS ────────────────────────────────────────────────────── */}
        {activeTab === "definitions" && (
          <div className="p-5">
            {defsQ.isLoading && <div className="h-32 flex items-center justify-center text-gray-400 text-sm"><RefreshCw className="h-4 w-4 animate-spin mr-2" />Chargement…</div>}
            <div className="space-y-4">
              {defs.map((def) => {
                const finColor = FINANCEMENT_COLOR[def.financement] ?? "#1B2A4A";
                return (
                  <div key={def.id} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold text-white px-2 py-0.5 rounded-full" style={{ backgroundColor: finColor }}>
                        {def.financement.replace(/_/g, " ")}
                      </span>
                      <span className="text-sm font-bold text-navy">{def.nom}</span>
                      {def.actif && <span className="ml-auto text-[9px] text-green-600 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full font-bold">Actif</span>}
                    </div>
                    <div className="flex items-start gap-1 overflow-x-auto">
                      {def.etapes.map((e, i) => (
                        <div key={e.id} className="flex items-center gap-1 shrink-0">
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-black text-white" style={{ backgroundColor: finColor }}>
                              {e.ordre}
                            </div>
                            <p className="text-[9px] text-center max-w-[48px] font-semibold text-gray-600 leading-tight">{e.nom}</p>
                            <p className="text-[8px] text-center text-gray-400">{e.roleRequis}</p>
                          </div>
                          {i < def.etapes.length - 1 && <div className="w-4 h-px bg-gray-200 mt-[-14px]" />}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TAB BPMN 5 MODULES ──────────────────────────────────────────────── */}
        {activeTab === "bpmn" && (
          <div className="p-5">
            <BpmnAllDefinitions />
          </div>
        )}
      </div>

      {/* ── Modal détail / action ──────────────────────────────────────────────── */}
      <Modal open={!!selected} onClose={() => { setSelected(null); setDecision(null); setCommentaire(""); }}
        title={`Dossier — ${selected?.decompte?.reference ?? "—"}`} size="lg">
        {selected && (() => {
          const etape = selected.etapeCourante ?? selected.definition.etapes[selected.etapeActuelle];
          const peutAgir = selected.peutAgir ?? (ROLES_SUPERVISEURS.includes(role) || role === etape?.roleRequis);
          return (
            <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
              {/* Résumé décompte */}
              <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-2 gap-2.5 text-xs">
                <div><span className="text-gray-400">Marché</span><p className="font-bold text-navy mt-0.5">{selected.decompte?.marche.intitule ?? "—"}</p></div>
                <div><span className="text-gray-400">Entreprise</span><p className="font-semibold mt-0.5">{selected.decompte?.entreprise.raisonSociale ?? "—"}</p></div>
                <div><span className="text-gray-400">Circuit</span><p className="font-semibold mt-0.5">{selected.definition.nom}</p></div>
                <div><span className="text-gray-400">Net à payer</span><p className="font-bold text-green-700 mt-0.5">{selected.decompte?.netAPayer ? fmtGnf(selected.decompte.netAPayer) : "—"}</p></div>
                <div><span className="text-gray-400">Statut instance</span><p className="mt-0.5"><StatutBadge statut={selected.statut} /></p></div>
                <div><span className="text-gray-400">En cours depuis</span><p className="font-semibold mt-0.5">{selected.joursEnCours ?? "—"} jours</p></div>
              </div>

              {/* Progression BPMN */}
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Circuit de validation</p>
                <CircuitProgress etapes={selected.definition.etapes} etapeActuelle={selected.etapeActuelle} actions={selected.actions} />
              </div>

              {/* Audit trail */}
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Historique BPMN</p>
                <AuditTimeline actions={selected.actions} />
              </div>

              {/* Zone de décision */}
              {peutAgir && selected.statut === "EN_COURS" && (
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <p className="text-xs font-bold text-navy">
                    Votre décision — étape <em className="font-normal">{etape?.nom}</em>
                    {role === "DG" && <span className="text-xs text-amber-600 ml-2 font-normal">(Superviseur : accès aux décisions DG)</span>}
                  </p>

                  {/* 6 boutons de décision */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {(Object.entries(DECISIONS_CFG) as [Decision, typeof DECISIONS_CFG[Decision]][])
                      .filter(([d]) => {
                        if (DG_ONLY.includes(d)) return ROLES_SUPERVISEURS.includes(role);
                        return true;
                      })
                      .map(([d, cfg]) => {
                        const Icon = cfg.Icon;
                        const isSelected = decision === d;
                        return (
                          <button key={d} onClick={() => setDecision(isSelected ? null : d)}
                            className={`flex items-center gap-2 p-2.5 rounded-lg border-2 text-xs font-semibold transition-all ${isSelected ? "ring-2" : "hover:opacity-80"}`}
                            style={{
                              borderColor:    isSelected ? cfg.color : cfg.border,
                              backgroundColor: isSelected ? cfg.bg  : "#FAFAFA",
                              color:           cfg.color,
                              boxShadow:       isSelected ? `0 0 0 2px ${cfg.color}40` : "none",
                            }}>
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            {cfg.label}
                          </button>
                        );
                      })}
                  </div>

                  {/* Commentaire */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      Commentaire {decision && DECISIONS_CFG[decision].need_comment ? <span className="text-red-500">*</span> : "(optionnel)"}
                    </label>
                    <textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)} rows={3}
                      placeholder={decision && decision !== "APPROUVE" ? "Motif obligatoire — soyez précis…" : "Observations éventuelles…"}
                      className="w-full border border-gray-200 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-navy/20 focus:border-navy resize-none" />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="secondary" onClick={() => { setSelected(null); setDecision(null); setCommentaire(""); }}>Annuler</Button>
                    <Button
                      disabled={!decision || actionMut.isPending || (!!decision && DECISIONS_CFG[decision].need_comment && commentaire.trim().length < 5)}
                      onClick={handleAction}
                      style={decision ? { backgroundColor: DECISIONS_CFG[decision].color, borderColor: DECISIONS_CFG[decision].color } : {}}>
                      {actionMut.isPending ? "Enregistrement…" : decision ? `Confirmer : ${DECISIONS_CFG[decision].label}` : "Sélectionner une décision"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Lecture seule si l'instance est terminée */}
              {selected.statut !== "EN_COURS" && (
                <div className="border-t border-gray-100 pt-4">
                  <div className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${selected.statut === "APPROUVE" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    {selected.statut === "APPROUVE" ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    Instance {selected.statut === "APPROUVE" ? "approuvée et transmise au circuit financier" : "rejetée"}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

// ─── Composant : visualisation de toutes les définitions BPMN génériques ──────

function BpmnAllDefinitions() {
  const { data, isLoading } = useQuery({
    queryKey: ["bpmn-all-defs"],
    queryFn: () => api.get("/bpmn/definitions").then(r => r.data),
  });

  const MODULE_COLORS: Record<string, string> = {
    PROJET: "#1B2A4A", MARCHE: "#0e7490", ATTACHEMENT: "#7c3aed",
    DECOMPTE: "#15803d", CONFORMITE: "#b45309",
  };

  if (isLoading) return (
    <div className="h-32 flex items-center justify-center text-gray-400 text-sm">
      <RefreshCw className="h-4 w-4 animate-spin mr-2" />Chargement circuits BPMN…
    </div>
  );

  const defs: Array<{ id: string; nom: string; description: string; module_type: string; etapes: Array<{ id: string; ordre: number; nom: string; type_tache: string; role_requis?: string; sla_jours: number; is_system: boolean }> }> = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Gavel className="w-5 h-5 text-navy" />
        <div>
          <h2 className="text-sm font-bold text-navy">Référentiel BPMN — 5 modules AGEROUTE</h2>
          <p className="text-xs text-gray-400">Circuits de validation définis pour chaque type d'entité</p>
        </div>
      </div>

      <div className="grid gap-4">
        {defs.map((def) => {
          const color = MODULE_COLORS[def.module_type] ?? "#1B2A4A";
          return (
            <div key={def.id} className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: color + "12", borderLeft: `4px solid ${color}` }}>
                <span className="text-xs font-bold text-white px-2 py-0.5 rounded-full" style={{ backgroundColor: color }}>
                  {def.module_type}
                </span>
                <div>
                  <p className="text-sm font-bold text-gray-800">{def.nom}</p>
                  <p className="text-xs text-gray-500">{def.description}</p>
                </div>
                <span className="ml-auto text-xs text-gray-400">{def.etapes.length} étapes</span>
              </div>
              <div className="p-4 overflow-x-auto">
                <div className="flex items-start gap-1 min-w-max">
                  {def.etapes.map((e, i) => (
                    <div key={e.id} className="flex items-center">
                      <div className="flex flex-col items-center w-[70px]">
                        <div
                          className="h-7 w-7 rounded-full flex items-center justify-center text-[9px] font-black text-white flex-shrink-0"
                          style={{ backgroundColor: e.is_system ? "#94a3b8" : color }}
                          title={e.type_tache}
                        >
                          {e.is_system ? "⚙" : e.ordre}
                        </div>
                        <p className="text-[9px] text-center mt-1 font-semibold text-gray-600 leading-tight">{e.nom}</p>
                        {e.role_requis && <p className="text-[8px] text-center text-gray-400">{e.role_requis}</p>}
                        <p className="text-[8px] text-center text-gray-300">{e.sla_jours}j</p>
                      </div>
                      {i < def.etapes.length - 1 && (
                        <div className="h-px w-4 mb-4 flex-shrink-0" style={{ backgroundColor: color + "40" }} />
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-2 pt-2 border-t border-gray-50">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-[9px] text-gray-500">Tâche humaine (USER_TASK)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-slate-400 flex-shrink-0" />
                    <span className="text-[9px] text-gray-500">Tâche système (SERVICE_TASK)</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
