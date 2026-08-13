/**
 * BpmnPanel — panneau BPMN générique réutilisable
 * À intégrer dans la page de détail de chaque module (Projets, Marchés, Attachements, Décomptes, Conformité)
 *
 * Usage:
 *   <BpmnPanel moduleType="PROJET" entityId={projetId} currentUserRole={user.role} />
 *   <BpmnPanel moduleType="MARCHE" entityId={marcheId} currentUserRole={user.role} />
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, XCircle, RotateCcw, MessageSquare, Pause, Search,
  Play, ChevronRight, Clock, AlertTriangle, User, Zap,
  CircleDot, Loader2,
} from "lucide-react";
import { api } from "../lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

type ModuleType = "PROJET" | "MARCHE" | "ATTACHEMENT" | "DECOMPTE" | "CONFORMITE";

interface BpmnStep {
  id: string;
  definition_id: string;
  ordre: number;
  nom: string;
  type_tache: string;
  role_requis: string | null;
  description: string;
  sla_jours: number;
  is_optional: boolean;
  is_system: boolean;
}

interface BpmnInstance {
  id: string;
  module_type: string;
  entity_id: string;
  etape_actuelle: number;
  statut: string;
  suspended: boolean;
  audit_requis: boolean;
  created_at: string;
  updated_at: string;
}

interface BpmnAction {
  id: string;
  step_id: string;
  user_id: string;
  decision: string;
  commentaire: string | null;
  created_at: string;
  user_nom?: string;
  user_role?: string;
  step_nom?: string;
  step_ordre?: number;
}

interface BpmnData {
  instance: BpmnInstance | null;
  definition: { id: string; nom: string; description: string; module_type: string };
  etapes: BpmnStep[];
  actions: BpmnAction[];
  etapeCourante: BpmnStep | null;
  joursEnCours: number;
  enRetardSla: boolean;
}

interface Props {
  moduleType: ModuleType;
  entityId: string;
  currentUserRole: string;
  canSubmit?: boolean;
  onSubmitSuccess?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

type DecisionKey = "APPROUVE" | "REJETE" | "DEMANDE_CORRECTION" | "DEMANDE_COMPLEMENT" | "SUSPENDRE" | "AUDIT";

const DECISIONS_CFG: Record<DecisionKey, { label: string; color: string; bg: string; Icon: React.FC<{className?:string}>; needComment: boolean; supervisorOnly: boolean }> = {
  APPROUVE:             { label: "Approuver",          color: "text-green-700",  bg: "bg-green-50 border-green-300",   Icon: CheckCircle2,   needComment: false, supervisorOnly: false },
  REJETE:               { label: "Rejeter",             color: "text-red-700",    bg: "bg-red-50 border-red-300",       Icon: XCircle,        needComment: true,  supervisorOnly: false },
  DEMANDE_CORRECTION:   { label: "Demander correction", color: "text-orange-700", bg: "bg-orange-50 border-orange-300", Icon: RotateCcw,      needComment: true,  supervisorOnly: false },
  DEMANDE_COMPLEMENT:   { label: "Complément requis",   color: "text-blue-700",   bg: "bg-blue-50 border-blue-300",     Icon: MessageSquare,  needComment: true,  supervisorOnly: false },
  SUSPENDRE:            { label: "Suspendre",           color: "text-purple-700", bg: "bg-purple-50 border-purple-300", Icon: Pause,          needComment: true,  supervisorOnly: true  },
  AUDIT:                { label: "Demander audit",      color: "text-gray-700",   bg: "bg-gray-50 border-gray-300",     Icon: Search,         needComment: true,  supervisorOnly: true  },
};

const SUPERV_ROLES = ["DG", "ADMIN"];

const STATUT_COLORS: Record<string, string> = {
  EN_COURS:  "bg-blue-100 text-blue-800",
  APPROUVE:  "bg-green-100 text-green-800",
  REJETE:    "bg-red-100 text-red-800",
  SUSPENDU:  "bg-purple-100 text-purple-800",
};

const MODULE_LABELS: Record<ModuleType, string> = {
  PROJET: "Projet", MARCHE: "Marché", ATTACHEMENT: "Attachement",
  DECOMPTE: "Décompte", CONFORMITE: "Conformité entreprise",
};

// ─── Composant ────────────────────────────────────────────────────────────────

export function BpmnPanel({ moduleType, entityId, currentUserRole, canSubmit = true, onSubmitSuccess }: Props) {
  const qc = useQueryClient();
  const isSuperv = SUPERV_ROLES.includes(currentUserRole);

  const [selectedDecision, setSelectedDecision] = useState<DecisionKey | null>(null);
  const [commentaire, setCommentaire] = useState("");
  const [showAudit, setShowAudit] = useState(false);

  // ── Données instance ────────────────────────────────────────────────────────
  const { data, isLoading, error } = useQuery<BpmnData | null>({
    queryKey: ["bpmn-instance", moduleType, entityId],
    queryFn: async () => {
      const res = await api.get(`/bpmn/instance/${moduleType}/${entityId}`);
      return res.data;
    },
    refetchInterval: 30000,
  });

  // ── Démarrer le circuit ─────────────────────────────────────────────────────
  const soumettreMut = useMutation({
    mutationFn: () => api.post(`/bpmn/soumettre/${moduleType}/${entityId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bpmn-instance", moduleType, entityId] });
      onSubmitSuccess?.();
    },
  });

  // ── Action BPMN ─────────────────────────────────────────────────────────────
  const actionMut = useMutation({
    mutationFn: ({ decision, commentaire }: { decision: string; commentaire: string }) =>
      api.post(`/bpmn/${data?.instance?.id}/action`, { decision, commentaire: commentaire || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bpmn-instance", moduleType, entityId] });
      setSelectedDecision(null);
      setCommentaire("");
    },
  });

  const leverMut = useMutation({
    mutationFn: () => api.patch(`/bpmn/${data?.instance?.id}/lever-suspension`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bpmn-instance", moduleType, entityId] }),
  });

  // ── États de chargement / erreur ────────────────────────────────────────────
  if (isLoading) return (
    <div className="flex items-center gap-2 text-gray-500 p-4">
      <Loader2 className="w-4 h-4 animate-spin" />
      Chargement circuit BPMN…
    </div>
  );

  if (error) return (
    <div className="text-red-500 text-sm p-4">Erreur chargement circuit BPMN</div>
  );

  // ── Pas encore soumis ───────────────────────────────────────────────────────
  if (!data || !data.instance) {
    return (
      <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center space-y-4">
        <CircleDot className="w-10 h-10 text-gray-300 mx-auto" />
        <div>
          <p className="font-semibold text-gray-700">Circuit BPMN non démarré</p>
          <p className="text-sm text-gray-500 mt-1">
            Ce {MODULE_LABELS[moduleType].toLowerCase()} n'a pas encore été soumis au circuit de validation.
          </p>
        </div>
        {canSubmit && (
          <button
            onClick={() => soumettreMut.mutate()}
            disabled={soumettreMut.isPending}
            className="px-6 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm font-medium hover:bg-[#2d4270] disabled:opacity-60 inline-flex items-center gap-2"
          >
            {soumettreMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Soumettre au circuit de validation
          </button>
        )}
        {soumettreMut.error && (
          <p className="text-red-500 text-sm">{String((soumettreMut.error as any)?.response?.data?.error ?? "Erreur")}</p>
        )}
      </div>
    );
  }

  const { instance, etapes, actions, etapeCourante, joursEnCours, enRetardSla } = data;
  const statutColor = STATUT_COLORS[instance.statut] ?? "bg-gray-100 text-gray-800";

  // Peut agir sur l'étape courante ?
  const peutAgir = instance.statut === "EN_COURS"
    && !instance.suspended
    && etapeCourante
    && !etapeCourante.is_system
    && (isSuperv || etapeCourante.role_requis === currentUserRole);

  const cfg = selectedDecision ? DECISIONS_CFG[selectedDecision] : null;
  const commentaireOk = !cfg?.needComment || commentaire.trim().length >= 5;

  return (
    <div className="space-y-6">

      {/* ── En-tête ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">{data.definition.nom}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{data.definition.description}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${statutColor}`}>
            {instance.statut.replace(/_/g, " ")}
          </span>
          {instance.suspended && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
              SUSPENDU
            </span>
          )}
          {enRetardSla && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> SLA dépassé ({joursEnCours}j)
            </span>
          )}
          {instance.suspended && isSuperv && (
            <button
              onClick={() => leverMut.mutate()}
              disabled={leverMut.isPending}
              className="px-3 py-1 bg-purple-600 text-white rounded text-xs font-medium hover:bg-purple-700 disabled:opacity-60 flex items-center gap-1"
            >
              <Play className="w-3 h-3" /> Lever la suspension
            </button>
          )}
        </div>
      </div>

      {/* ── Progression visuelle ───────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <div className="flex items-start gap-1 min-w-max pb-2">
          {etapes.map((step, i) => {
            const isCurrent = i === instance.etape_actuelle && instance.statut === "EN_COURS";
            const isDone    = i < instance.etape_actuelle || instance.statut === "APPROUVE";
            const isRejeted = instance.statut === "REJETE" && i === instance.etape_actuelle;

            return (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center w-20">
                  {/* Cercle */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 text-xs font-bold flex-shrink-0
                    ${isDone    ? "bg-green-500 border-green-500 text-white" :
                      isRejeted ? "bg-red-500 border-red-500 text-white" :
                      isCurrent ? "bg-[#1B2A4A] border-[#1B2A4A] text-white" :
                                  "bg-white border-gray-300 text-gray-400"}`}
                  >
                    {isDone    ? <CheckCircle2 className="w-4 h-4" /> :
                     isRejeted ? <XCircle      className="w-4 h-4" /> :
                     step.is_system ? <Zap  className="w-3 h-3" /> :
                                  i + 1}
                  </div>
                  {/* Nom */}
                  <p className={`text-center text-[10px] mt-1 leading-tight
                    ${isCurrent ? "text-[#1B2A4A] font-semibold" : isDone ? "text-green-600" : "text-gray-400"}`}>
                    {step.nom}
                  </p>
                  {/* Rôle */}
                  {step.role_requis && (
                    <span className="text-[9px] text-gray-400 mt-0.5">{step.role_requis}</span>
                  )}
                  {/* SLA */}
                  {isCurrent && (
                    <span className={`text-[9px] mt-0.5 flex items-center gap-0.5 ${enRetardSla ? "text-red-500" : "text-gray-400"}`}>
                      <Clock className="w-2 h-2" />{step.sla_jours}j
                    </span>
                  )}
                </div>
                {/* Connecteur */}
                {i < etapes.length - 1 && (
                  <ChevronRight className={`w-4 h-4 flex-shrink-0 -mt-4
                    ${i < instance.etape_actuelle ? "text-green-400" : "text-gray-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Étape courante ────────────────────────────────────────────────── */}
      {etapeCourante && instance.statut === "EN_COURS" && (
        <div className={`rounded-lg border p-4 ${enRetardSla ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50"}`}>
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
              ${etapeCourante.is_system ? "bg-yellow-100" : "bg-blue-100"}`}>
              {etapeCourante.is_system ? <Zap className="w-4 h-4 text-yellow-600" /> : <User className="w-4 h-4 text-blue-600" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-gray-900">{etapeCourante.nom}</p>
              <p className="text-xs text-gray-500 mt-0.5">{etapeCourante.description}</p>
              <div className="flex gap-3 mt-1 flex-wrap">
                {etapeCourante.role_requis && (
                  <span className="text-xs text-blue-700 font-medium">Rôle requis : {etapeCourante.role_requis}</span>
                )}
                <span className="text-xs text-gray-500">SLA : {etapeCourante.sla_jours} jour{etapeCourante.sla_jours > 1 ? "s" : ""}</span>
                {joursEnCours > 0 && (
                  <span className={`text-xs font-medium ${enRetardSla ? "text-red-600" : "text-gray-500"}`}>
                    En cours depuis {joursEnCours}j
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Zone de décision (si l'utilisateur peut agir) ─────────────────── */}
      {peutAgir && (
        <div className="border border-gray-200 rounded-xl p-4 space-y-4 bg-white">
          <p className="text-sm font-semibold text-gray-700">Votre décision</p>

          {/* Grille de décisions */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(Object.entries(DECISIONS_CFG) as [DecisionKey, typeof DECISIONS_CFG[DecisionKey]][]).map(([key, cfg]) => {
              if (cfg.supervisorOnly && !isSuperv) return null;
              const active = selectedDecision === key;
              return (
                <button
                  key={key}
                  onClick={() => { setSelectedDecision(key); setCommentaire(""); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all
                    ${active ? `${cfg.bg} ${cfg.color} ring-1 ring-offset-1 ring-current` :
                               "border-gray-200 text-gray-600 hover:border-gray-400 bg-white"}`}
                >
                  <cfg.Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {/* Commentaire */}
          {selectedDecision && (
            <div>
              <textarea
                value={commentaire}
                onChange={e => setCommentaire(e.target.value)}
                placeholder={cfg?.needComment ? "Commentaire motivé obligatoire (min 5 caractères)…" : "Commentaire optionnel…"}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]"
              />
              {cfg?.needComment && commentaire.trim().length > 0 && commentaire.trim().length < 5 && (
                <p className="text-red-500 text-xs mt-1">Minimum 5 caractères requis</p>
              )}
            </div>
          )}

          {/* Bouton confirmer */}
          {selectedDecision && (
            <button
              onClick={() => actionMut.mutate({ decision: selectedDecision, commentaire })}
              disabled={!commentaireOk || actionMut.isPending}
              className={`w-full py-2 px-4 rounded-lg text-sm font-semibold transition-all disabled:opacity-50
                ${cfg?.bg} ${cfg?.color} border ${cfg?.supervisorOnly ? "border-2" : "border"}`}
            >
              {actionMut.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  {cfg?.Icon && <cfg.Icon className="w-4 h-4" />}
                  Confirmer — {cfg?.label}
                </span>
              )}
            </button>
          )}

          {actionMut.error && (
            <p className="text-red-500 text-xs">{String((actionMut.error as any)?.response?.data?.error ?? "Erreur")}</p>
          )}
        </div>
      )}

      {/* ── Pas autorisé à agir ────────────────────────────────────────────── */}
      {instance.statut === "EN_COURS" && !peutAgir && etapeCourante && !etapeCourante.is_system && (
        <div className="text-xs text-gray-500 border border-gray-100 rounded-lg p-3 bg-gray-50 flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
          En attente de validation par <strong>{etapeCourante.role_requis}</strong> — étape « {etapeCourante.nom} »
        </div>
      )}

      {/* ── Historique des actions ────────────────────────────────────────── */}
      {actions.length > 0 && (
        <div>
          <button
            onClick={() => setShowAudit(v => !v)}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <Clock className="w-3 h-3" />
            {showAudit ? "Masquer" : "Voir"} l'historique ({actions.length} action{actions.length > 1 ? "s" : ""})
          </button>

          {showAudit && (
            <div className="mt-3 space-y-2 border-l-2 border-gray-100 pl-4">
              {actions.map((a) => {
                const dcfg = DECISIONS_CFG[a.decision as DecisionKey];
                return (
                  <div key={a.id} className="relative">
                    <div className="absolute -left-5 top-1 w-3 h-3 rounded-full border-2 border-white"
                         style={{ background: dcfg ? (dcfg.color.includes("green") ? "#22c55e" : dcfg.color.includes("red") ? "#ef4444" : dcfg.color.includes("orange") ? "#f97316" : "#6b7280") : "#9ca3af" }} />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-700">{a.user_nom ?? "Système"}</span>
                        {a.user_role && <span className="text-[10px] text-gray-400">({a.user_role})</span>}
                        {dcfg && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${dcfg.bg} ${dcfg.color}`}>
                            {dcfg.label}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400">
                          {new Date(a.created_at).toLocaleDateString("fr-GN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      {a.step_nom && (
                        <p className="text-[10px] text-gray-400">Étape : {a.step_nom}</p>
                      )}
                      {a.commentaire && (
                        <p className="text-xs text-gray-600 mt-0.5 italic">"{a.commentaire}"</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default BpmnPanel;
