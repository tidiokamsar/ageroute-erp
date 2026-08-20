/**
 * Référentiel Projets — AGEROUTE ERP
 * 11 onglets : Résumé | Gouvernance | Financement | Calendrier | Marchés | Attachements | Décomptes | KPIs | Historique | Documents | Workflow
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
  Plus, Search, FolderOpen, Pencil, Trash2, ChevronRight, BarChart3,
  MapPin, Wallet, Calendar, FileText, Paperclip, ClipboardList,
  TrendingUp, AlertTriangle, CheckCircle, Clock, XCircle,
  Building2, RefreshCw, ArrowRight, Gauge, Activity, Flag, GitBranch,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type StatutProjet =
  | "PREPARATION" | "EN_VALIDATION" | "APPROUVE" | "EN_EXECUTION"
  | "SUSPENDU" | "EN_RETARD" | "EN_AVENANT" | "RECEPTION_PARTIELLE"
  | "RECEPTION_DEFINITIVE" | "CLOS" | "ANNULE";

interface ProjetStatusHistory {
  id: string; ancienStatut?: string; nouveauStatut: string;
  motif?: string; changedByEmail?: string; changedAt: string;
}
interface ProjetMarche {
  id: string; reference: string; intitule: string; statut: string;
  montantInitialGnf: string; entreprise?: { raisonSociale: string };
}
interface ProjetDecompte {
  id: string; reference: string; statut: string;
  montantPeriodeHtGnf: string; montantTtcGnf: string; netAPayer: string; createdAt: string;
}
interface ProjetAttachement {
  id: string; code?: string; statut: string;
  montantHtGnf: string; montantTtcGnf: string; natureTravaux: string; createdAt: string;
}
interface Projet {
  id: string; code: string; intitule: string; description?: string;
  type: string; categorie?: string; programme?: string; axeStrategique?: string;
  region?: string; prefecture?: string; commune?: string; troncon?: string;
  pkDebut?: number; pkFin?: number; latGps?: number; lonGps?: number;
  directionPorteuse?: string; responsableNom?: string; chefProjetNom?: string;
  missionControle?: string; ugp?: string;
  dateOs?: string; dateDemarrage?: string; datePrevFinTravaux?: string;
  dateReceptionProv?: string; dateReceptionDef?: string; dateCloture?: string; delaiMois?: number;
  sourceFinancement?: string; bailleurPrincipal?: string; bailleurSecondaire?: string;
  budgetInitialGnf: string; budgetReviseGnf: string;
  montantEngageGnf: string; montantOrdonnanceGnf: string; montantPayeGnf: string;
  montantRestantGnf: string; tauxDecaissement: number;
  avancementPhysique: number; avancementFinancier: number;
  scoreDelai?: number; scoreCout?: number; scoreRisque?: number; niveauConfiance: string;
  statut: StatutProjet; observations?: string; motifStatut?: string;
  historique: ProjetStatusHistory[];
  marches: ProjetMarche[];
  decomptes: ProjetDecompte[];
  attachements: ProjetAttachement[];
  _count: { marches: number; decomptes: number; attachements: number; historique: number };
}
interface KPIs {
  avancementPhysique: number; avancementFinancier: number; tauxDecaissement: number;
  budgetInitialGnf: string; budgetReviseGnf: string; montantEngageGnf: string;
  montantDecaisseGnf: string; montantRestantGnf: string;
  ecartJours: number | null; scoreDelai?: number; scoreCout?: number; scoreRisque?: number;
  niveauConfiance: string; nombreMarches: number; nombreDecomptes: number; nombreAttachements: number;
  decompteParStatut: Record<string, number>;
  totalMarcheHtGnf: string; totalDecompteHtGnf: string; generatedAt: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUT_CFG: Record<StatutProjet, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  PREPARATION:          { label: "Préparation",          color: "#6B7280", bg: "#F3F4F6", Icon: Clock },
  EN_VALIDATION:        { label: "En validation",        color: "#1D4ED8", bg: "#DBEAFE", Icon: FileText },
  APPROUVE:             { label: "Approuvé",             color: "#0891B2", bg: "#CFFAFE", Icon: CheckCircle },
  EN_EXECUTION:         { label: "En exécution",         color: "#16A34A", bg: "#DCFCE7", Icon: Activity },
  SUSPENDU:             { label: "Suspendu",             color: "#D97706", bg: "#FEF3C7", Icon: AlertTriangle },
  EN_RETARD:            { label: "En retard",            color: "#DC2626", bg: "#FEE2E2", Icon: AlertTriangle },
  EN_AVENANT:           { label: "En avenant",           color: "#7C3AED", bg: "#EDE9FE", Icon: FileText },
  RECEPTION_PARTIELLE:  { label: "Réception partielle",  color: "#0D9488", bg: "#CCFBF1", Icon: CheckCircle },
  RECEPTION_DEFINITIVE: { label: "Réception définitive", color: "#065F46", bg: "#A7F3D0", Icon: CheckCircle },
  CLOS:                 { label: "Clôturé",              color: "#374151", bg: "#E5E7EB", Icon: XCircle },
  ANNULE:               { label: "Annulé",               color: "#991B1B", bg: "#FEE2E2", Icon: XCircle },
};
const TYPE_LABELS: Record<string, string> = {
  TRAVAUX_ROUTIERS: "Travaux routiers", PONT_OUVRAGE_ART: "Pont / Ouvrage d'art",
  PISTE_RURALE: "Piste rurale", BITUMAGE: "Bitumage", REHABILITATION: "Réhabilitation",
  ENTRETIEN_COURANT: "Entretien courant", ENTRETIEN_PERIODIQUE: "Entretien périodique",
  ETUDE_TECHNIQUE: "Étude technique", SUPERVISION: "Supervision", AUTRE: "Autre",
};
const ALL_STATUTS: StatutProjet[] = [
  "PREPARATION","EN_VALIDATION","APPROUVE","EN_EXECUTION","SUSPENDU",
  "EN_RETARD","EN_AVENANT","RECEPTION_PARTIELLE","RECEPTION_DEFINITIVE","CLOS","ANNULE",
];
const TABS = ["Résumé","Gouvernance","Financement","Calendrier","Marchés","Attachements","Décomptes","KPIs","Historique","Documents","Workflow"] as const;

// ─── Helpers UI ────────────────────────────────────────────────────────────────

function StatutBadge({ statut }: { statut: StatutProjet }) {
  const cfg = STATUT_CFG[statut] ?? { label: statut, color: "#6B7280", bg: "#F3F4F6", Icon: Clock };
  const { Icon } = cfg;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ color: cfg.color, backgroundColor: cfg.bg }}>
      <Icon className="h-3 w-3" />{cfg.label}
    </span>
  );
}

function ProgressBar({ value, color = "#1B2A4A" }: { value: number; color?: string }) {
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }} />
    </div>
  );
}

function ScoreCircle({ value, label }: { value?: number | null; label: string }) {
  const pct = value != null ? Math.round(value * 100) : null;
  const color = pct == null ? "#6B7280" : pct >= 90 ? "#16A34A" : pct >= 70 ? "#D97706" : "#DC2626";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="h-14 w-14 rounded-full flex items-center justify-center border-4 font-black text-lg"
        style={{ borderColor: color, color }}>
        {pct != null ? pct : "—"}
      </div>
      <p className="text-[10px] text-gray-400 font-semibold text-center">{label}</p>
    </div>
  );
}

// ─── Composant ────────────────────────────────────────────────────────────────

export function ProjetsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const role = user?.role ?? null;

  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState("");
  const [filterType, setFilterType] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [modal, setModal] = useState<"new" | Projet | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [statutModal, setStatutModal] = useState<{ id: string; current: StatutProjet } | null>(null);
  const [statutForm, setStatutForm] = useState<{ statut: StatutProjet; motif: string }>({ statut: "PREPARATION", motif: "" });
  const [avancModal, setAvancModal] = useState<string | null>(null);
  const [avancForm, setAvancForm] = useState<Record<string, unknown>>({});
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  // Queries
  const listQ = useQuery({
    queryKey: ["projets", search, filterStatut, filterType],
    queryFn: () => api.get("/projets", { params: { pageSize: 100, search: search || undefined, statut: filterStatut || undefined, type: filterType || undefined } }).then((r) => r.data),
  });
  const detailQ = useQuery({
    queryKey: ["projets", detailId],
    queryFn: () => api.get(`/projets/${detailId}`).then((r) => r.data),
    enabled: !!detailId,
  });
  const kpiQ = useQuery({
    queryKey: ["projets", detailId, "kpis"],
    queryFn: () => api.get(`/projets/${detailId}/kpis`).then((r) => r.data),
    enabled: !!detailId && activeTab === 7,
  });

  // Mutations
  const createMut = useMutation({
    mutationFn: (b: object) => api.post("/projets", b).then((r) => r.data),
    onSuccess: (p) => { qc.invalidateQueries({ queryKey: ["projets"] }); toast.success(`Projet ${(p as Projet).code} créé`); setModal(null); setDetailId((p as Projet).id); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.put(`/projets/${id}`, body).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projets"] }); toast.success("Projet mis à jour"); setModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const statutMut = useMutation({
    mutationFn: ({ id, statut, motif }: { id: string; statut: string; motif?: string }) =>
      api.patch(`/projets/${id}/statut`, { statut, motif }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projets"] }); toast.success("Statut mis à jour"); setStatutModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const avancMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/projets/${id}/avancement`, body).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projets"] }); toast.success("Avancement mis à jour"); setAvancModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/projets/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projets"] }); toast.success("Projet supprimé"); setConfirmDel(null); setDetailId(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const projets: Projet[] = listQ.data?.data ?? [];
  const det = detailQ.data as Projet | undefined;
  const kpis = kpiQ.data as KPIs | undefined;

  function openNew() { setForm({ type: "TRAVAUX_ROUTIERS", niveauConfiance: "MOYEN" }); setModal("new"); }
  function openEdit(p: Projet) {
    setForm({ ...p,
      budgetInitialGnf: p.budgetInitialGnf ? Number(p.budgetInitialGnf) : "",
      budgetReviseGnf:  p.budgetReviseGnf  ? Number(p.budgetReviseGnf)  : "",
      dateOs:            p.dateOs?.slice(0, 10) ?? "",
      dateDemarrage:     p.dateDemarrage?.slice(0, 10) ?? "",
      datePrevFinTravaux: p.datePrevFinTravaux?.slice(0, 10) ?? "",
    });
    setModal(p);
  }

  // ── Formulaire commun (liste + détail) ───────────────────────────────────────
  const FormProjet = () => (
    <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Code projet *">
          <Input value={String(form.code ?? "")} onChange={(e) => setForm({...form, code: e.target.value.toUpperCase()})} placeholder="PRJ-2026-001" />
        </FormField>
        <FormField label="Type">
          <Select value={String(form.type ?? "TRAVAUX_ROUTIERS")} onChange={(e) => setForm({...form, type: e.target.value})}>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </FormField>
      </div>
      <FormField label="Intitulé du projet *">
        <Input value={String(form.intitule ?? "")} onChange={(e) => setForm({...form, intitule: e.target.value})} placeholder="Ex : Réhabilitation RN1 Conakry–Coyah" />
      </FormField>
      <FormField label="Description">
        <Textarea value={String(form.description ?? "")} onChange={(e) => setForm({...form, description: e.target.value})} rows={2} />
      </FormField>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="Région"><Input value={String(form.region ?? "")} onChange={(e) => setForm({...form, region: e.target.value})} /></FormField>
        <FormField label="Préfecture"><Input value={String(form.prefecture ?? "")} onChange={(e) => setForm({...form, prefecture: e.target.value})} /></FormField>
        <FormField label="Commune"><Input value={String(form.commune ?? "")} onChange={(e) => setForm({...form, commune: e.target.value})} /></FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Tronçon"><Input value={String(form.troncon ?? "")} onChange={(e) => setForm({...form, troncon: e.target.value})} placeholder="RN1 km 0+000 → km 45+000" /></FormField>
        <FormField label="Direction porteuse"><Input value={String(form.directionPorteuse ?? "")} onChange={(e) => setForm({...form, directionPorteuse: e.target.value})} /></FormField>
        <FormField label="Responsable projet"><Input value={String(form.responsableNom ?? "")} onChange={(e) => setForm({...form, responsableNom: e.target.value})} /></FormField>
        <FormField label="Chef de projet"><Input value={String(form.chefProjetNom ?? "")} onChange={(e) => setForm({...form, chefProjetNom: e.target.value})} /></FormField>
        <FormField label="Mission de contrôle"><Input value={String(form.missionControle ?? "")} onChange={(e) => setForm({...form, missionControle: e.target.value})} /></FormField>
        <FormField label="UGP / Cellule bailleur"><Input value={String(form.ugp ?? "")} onChange={(e) => setForm({...form, ugp: e.target.value})} /></FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Bailleur principal"><Input value={String(form.bailleurPrincipal ?? "")} onChange={(e) => setForm({...form, bailleurPrincipal: e.target.value})} placeholder="BID, BM, AFD…" /></FormField>
        <FormField label="Source de financement"><Input value={String(form.sourceFinancement ?? "")} onChange={(e) => setForm({...form, sourceFinancement: e.target.value})} /></FormField>
        <FormField label="Budget initial (GNF)">
          <Input type="number" value={String(form.budgetInitialGnf ?? "")} onChange={(e) => setForm({...form, budgetInitialGnf: Number(e.target.value)})} />
        </FormField>
        <FormField label="Budget révisé (GNF)">
          <Input type="number" value={String(form.budgetReviseGnf ?? "")} onChange={(e) => setForm({...form, budgetReviseGnf: Number(e.target.value)})} />
        </FormField>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="Ordre de service"><Input type="date" value={String(form.dateOs ?? "")} onChange={(e) => setForm({...form, dateOs: e.target.value})} /></FormField>
        <FormField label="Date démarrage"><Input type="date" value={String(form.dateDemarrage ?? "")} onChange={(e) => setForm({...form, dateDemarrage: e.target.value})} /></FormField>
        <FormField label="Date fin prévue"><Input type="date" value={String(form.datePrevFinTravaux ?? "")} onChange={(e) => setForm({...form, datePrevFinTravaux: e.target.value})} /></FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Délai contractuel (mois)">
          <Input type="number" value={String(form.delaiMois ?? "")} onChange={(e) => setForm({...form, delaiMois: Number(e.target.value)})} />
        </FormField>
        <FormField label="Niveau de confiance">
          <Select value={String(form.niveauConfiance ?? "MOYEN")} onChange={(e) => setForm({...form, niveauConfiance: e.target.value})}>
            <option value="FAIBLE">Faible</option><option value="MOYEN">Moyen</option><option value="ELEVE">Élevé</option>
          </Select>
        </FormField>
      </div>
      <FormField label="Observations">
        <Textarea value={String(form.observations ?? "")} onChange={(e) => setForm({...form, observations: e.target.value})} rows={2} />
      </FormField>
    </div>
  );

  // ── Modaux partagés ──────────────────────────────────────────────────────────
  const SharedModals = () => (
    <>
      <Modal open={modal !== null} onClose={() => setModal(null)}
        title={modal === "new" ? "Nouveau projet" : `Modifier — ${(modal as Projet)?.code ?? ""}`} size="lg">
        <FormProjet />
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
          <Button variant="secondary" onClick={() => setModal(null)}>Annuler</Button>
          <Button disabled={createMut.isPending || updateMut.isPending || !form.code || !form.intitule}
            onClick={() => modal === "new"
              ? createMut.mutate(form)
              : modal && typeof modal === "object" && updateMut.mutate({ id: (modal as Projet).id, body: form })}>
            {createMut.isPending || updateMut.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </Modal>

      <Modal open={!!statutModal} onClose={() => setStatutModal(null)} title="Changer le statut" size="sm">
        <div className="space-y-3">
          <FormField label="Nouveau statut">
            <Select value={statutForm.statut} onChange={(e) => setStatutForm({...statutForm, statut: e.target.value as StatutProjet})}>
              {ALL_STATUTS.map((s) => <option key={s} value={s}>{STATUT_CFG[s].label}</option>)}
            </Select>
          </FormField>
          <FormField label="Motif">
            <Textarea value={statutForm.motif} onChange={(e) => setStatutForm({...statutForm, motif: e.target.value})} rows={3} placeholder="Justification du changement de statut…" />
          </FormField>
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
          <Button variant="secondary" onClick={() => setStatutModal(null)}>Annuler</Button>
          <Button disabled={statutMut.isPending} onClick={() => statutModal && statutMut.mutate({ id: statutModal.id, statut: statutForm.statut, motif: statutForm.motif })}>
            {statutMut.isPending ? "Enregistrement…" : "Confirmer"}
          </Button>
        </div>
      </Modal>

      <Modal open={!!avancModal} onClose={() => setAvancModal(null)} title="Mettre à jour l'avancement" size="sm">
        <div className="space-y-3">
          <FormField label={`Avancement physique : ${avancForm.avancementPhysique ?? 0}%`}>
            <input type="range" min={0} max={100} className="w-full accent-navy"
              value={Number(avancForm.avancementPhysique ?? 0)}
              onChange={(e) => setAvancForm({...avancForm, avancementPhysique: Number(e.target.value)})} />
          </FormField>
          <div className="grid grid-cols-3 gap-2">
            {([["scoreDelai","SPI Délai"],["scoreCout","CPI Coût"],["scoreRisque","Risque"]] as [string,string][]).map(([k,l]) => (
              <FormField key={k} label={l}>
                <Input type="number" min={0} max={1} step={0.01} value={String(avancForm[k] ?? "")}
                  onChange={(e) => setAvancForm({...avancForm, [k]: Number(e.target.value)})} placeholder="0–1" />
              </FormField>
            ))}
          </div>
          <FormField label="Niveau de confiance">
            <Select value={String(avancForm.niveauConfiance ?? "MOYEN")} onChange={(e) => setAvancForm({...avancForm, niveauConfiance: e.target.value})}>
              <option value="FAIBLE">Faible</option><option value="MOYEN">Moyen</option><option value="ELEVE">Élevé</option>
            </Select>
          </FormField>
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
          <Button variant="secondary" onClick={() => setAvancModal(null)}>Annuler</Button>
          <Button disabled={avancMut.isPending} onClick={() => avancModal && avancMut.mutate({ id: avancModal, body: avancForm })}>
            {avancMut.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </Modal>

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Supprimer le projet" size="sm">
        <p className="text-sm text-gray-600 mb-4">Cette action est irréversible. Les marchés liés conservent leur référence.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDel(null)}>Annuler</Button>
          <Button variant="danger" onClick={() => confirmDel && deleteMut.mutate(confirmDel)} disabled={deleteMut.isPending}>Supprimer</Button>
        </div>
      </Modal>
    </>
  );

  // ── Vue LISTE ────────────────────────────────────────────────────────────────
  if (!detailId) {
    const stats = {
      total:       projets.length,
      enExecution: projets.filter((p) => p.statut === "EN_EXECUTION").length,
      enRetard:    projets.filter((p) => p.statut === "EN_RETARD").length,
      clos:        projets.filter((p) => p.statut === "CLOS").length,
    };
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total projets",  value: stats.total,       Icon: FolderOpen,    color: "#1B2A4A" },
            { label: "En exécution",   value: stats.enExecution, Icon: Activity,      color: "#16A34A" },
            { label: "En retard",      value: stats.enRetard,    Icon: AlertTriangle, color: "#DC2626" },
            { label: "Clôturés",       value: stats.clos,        Icon: CheckCircle,   color: "#6B7280" },
          ].map(({ label, value, Icon, color }) => (
            <div key={label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color + "15" }}>
                <Icon className="h-5 w-5" style={{ color }} />
              </div>
              <div><p className="text-2xl font-black" style={{ color }}>{value}</p><p className="text-xs text-gray-400">{label}</p></div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input className="pl-9 h-8 text-sm w-56" placeholder="Recherche…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select className="h-8 text-sm" value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)}>
            <option value="">Tous les statuts</option>
            {ALL_STATUTS.map((s) => <option key={s} value={s}>{STATUT_CFG[s].label}</option>)}
          </Select>
          <Select className="h-8 text-sm" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">Tous les types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <div className="ml-auto">
            {canWrite(role) && <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5" /> Nouveau projet</Button>}
          </div>
        </div>

        {listQ.isLoading && <div className="grid grid-cols-3 gap-4">{Array.from({length: 6}).map((_, i) => <div key={i} className="h-52 bg-gray-100 rounded-xl animate-pulse" />)}</div>}
        {!listQ.isLoading && projets.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">Aucun projet trouvé</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projets.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-all cursor-pointer group"
              onClick={() => { setDetailId(p.id); setActiveTab(0); }}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[10px] text-gray-400">{p.code}</p>
                  <p className="font-bold text-gray-800 text-sm mt-0.5 leading-snug line-clamp-2">{p.intitule}</p>
                </div>
                <StatutBadge statut={p.statut} />
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-2 flex-wrap">
                <span className="bg-gray-50 px-2 py-0.5 rounded text-[10px]">{TYPE_LABELS[p.type] ?? p.type}</span>
                {p.region && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{p.region}</span>}
              </div>
              {p.bailleurPrincipal && <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><Wallet className="h-3 w-3 text-gray-300" />{p.bailleurPrincipal}</p>}
              <div className="space-y-1.5 mb-3">
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Physique</span><span className="font-bold">{p.avancementPhysique}%</span>
                </div>
                <ProgressBar value={p.avancementPhysique} color="#1B2A4A" />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Financier</span><span className="font-bold">{p.avancementFinancier}%</span>
                </div>
                <ProgressBar value={p.avancementFinancier} color="#16A34A" />
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-50 text-xs text-gray-400">
                <div className="flex gap-3">
                  <span className="flex items-center gap-0.5"><Building2 className="h-3 w-3" />{p._count.marches}</span>
                  <span className="flex items-center gap-0.5"><ClipboardList className="h-3 w-3" />{p._count.decomptes}</span>
                  <span className="flex items-center gap-0.5"><Paperclip className="h-3 w-3" />{p._count.attachements}</span>
                </div>
                <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-navy" />
              </div>
            </div>
          ))}
        </div>
        <SharedModals />
      </div>
    );
  }

  // ── Vue DÉTAIL ────────────────────────────────────────────────────────────────
  if (detailQ.isLoading || !det) {
    return (
      <div className="space-y-4">
        <button onClick={() => setDetailId(null)} className="text-sm text-navy flex items-center gap-1 hover:underline">
          <ChevronRight className="h-4 w-4 rotate-180" /> Retour aux projets
        </button>
        <div className="h-96 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  const cfg = STATUT_CFG[det.statut] ?? STATUT_CFG.PREPARATION;

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <button onClick={() => setDetailId(null)} className="hover:text-navy flex items-center gap-1 transition-colors">
          <ChevronRight className="h-4 w-4 rotate-180" /> Projets
        </button>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-mono font-semibold text-gray-600">{det.code}</span>
      </div>

      {/* Header projet */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <StatutBadge statut={det.statut} />
              <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded">{TYPE_LABELS[det.type] ?? det.type}</span>
            </div>
            <h1 className="text-xl font-black text-navy leading-tight mt-1">{det.intitule}</h1>
            <p className="font-mono text-xs text-gray-400 mt-0.5">{det.code}</p>
            {det.troncon && <p className="text-xs text-gray-500 mt-1 flex items-center gap-1"><MapPin className="h-3 w-3" />{det.troncon}{det.region && ` — ${det.region}`}</p>}
            {det.description && <p className="text-xs text-gray-400 mt-1 italic line-clamp-1">{det.description}</p>}
          </div>
          <div className="flex gap-1.5 shrink-0 flex-wrap">
            {canWrite(role) && <>
              <Button size="sm" variant="ghost" onClick={() => openEdit(det)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="ghost" onClick={() => { setStatutForm({ statut: det.statut, motif: "" }); setStatutModal({ id: det.id, current: det.statut }); }}>
                <Flag className="h-3.5 w-3.5" /> Statut
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setAvancForm({ avancementPhysique: det.avancementPhysique, niveauConfiance: det.niveauConfiance }); setAvancModal(det.id); }}>
                <Gauge className="h-3.5 w-3.5" /> Avancement
              </Button>
            </>}
            {role === "ADMIN" && <Button size="sm" variant="ghost" onClick={() => setConfirmDel(det.id)}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Avancement physique</span><span className="font-bold text-navy">{det.avancementPhysique}%</span></div>
            <ProgressBar value={det.avancementPhysique} color="#1B2A4A" />
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Avancement financier</span><span className="font-bold text-green-700">{det.avancementFinancier}%</span></div>
            <ProgressBar value={det.avancementFinancier} color="#16A34A" />
          </div>
        </div>
        <div className="mt-4 flex gap-4 text-xs text-gray-400 border-t border-gray-50 pt-3 flex-wrap">
          <span><strong className="text-navy">{det._count.marches}</strong> marché(s)</span>
          <span><strong className="text-navy">{det._count.decomptes}</strong> décompte(s)</span>
          <span><strong className="text-navy">{det._count.attachements}</strong> attachement(s)</span>
          {det.bailleurPrincipal && <span className="ml-auto flex items-center gap-1"><Wallet className="h-3 w-3" />{det.bailleurPrincipal}</span>}
          {det.budgetInitialGnf && Number(det.budgetInitialGnf) > 0 && (
            <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />Budget : {fmtGnf(det.budgetInitialGnf)}</span>
          )}
        </div>
      </div>

      {/* Onglets */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex overflow-x-auto border-b border-gray-100 scrollbar-hide">
          {TABS.map((tab, i) => (
            <button key={tab} onClick={() => setActiveTab(i)}
              className={`px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${activeTab === i ? "bg-navy text-white" : "text-gray-500 hover:text-navy hover:bg-gray-50"}`}>
              {tab}
            </button>
          ))}
        </div>

        <div className="p-5">

          {/* TAB 0 — RÉSUMÉ */}
          {activeTab === 0 && (
            <div className="grid grid-cols-2 gap-5">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Identification</p>
                {([
                  ["Code",              det.code],
                  ["Type",              TYPE_LABELS[det.type] ?? det.type],
                  ["Catégorie",         det.categorie          ?? "—"],
                  ["Programme",         det.programme          ?? "—"],
                  ["Axe stratégique",   det.axeStrategique     ?? "—"],
                  ["Confiance livraison",det.niveauConfiance],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs py-1.5 border-b border-gray-50">
                    <span className="text-gray-400">{k}</span>
                    <span className="font-semibold text-navy text-right max-w-[55%]">{v}</span>
                  </div>
                ))}
                {det.observations && (
                  <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-800">
                    <p className="font-bold mb-1">Observations</p><p>{det.observations}</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Localisation</p>
                {([
                  ["Région",     det.region     ?? "—"],
                  ["Préfecture", det.prefecture ?? "—"],
                  ["Commune",    det.commune    ?? "—"],
                  ["Tronçon",    det.troncon    ?? "—"],
                  ["PR Début",   det.pkDebut != null ? `${det.pkDebut} km` : "—"],
                  ["PR Fin",     det.pkFin   != null ? `${det.pkFin} km`   : "—"],
                  ["GPS",        det.latGps  != null ? `${det.latGps.toFixed(4)}°, ${det.lonGps?.toFixed(4)}°` : "—"],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs py-1.5 border-b border-gray-50">
                    <span className="text-gray-400">{k}</span>
                    <span className="font-semibold text-navy">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 1 — GOUVERNANCE */}
          {activeTab === 1 && (
            <div className="grid grid-cols-2 gap-5">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Acteurs & responsabilités</p>
                {([
                  ["Direction porteuse",    det.directionPorteuse ?? "—"],
                  ["Responsable projet",    det.responsableNom    ?? "—"],
                  ["Chef de projet",        det.chefProjetNom     ?? "—"],
                  ["Mission de contrôle",   det.missionControle   ?? "—"],
                  ["UGP / Cellule bailleur",det.ugp               ?? "—"],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs py-2 border-b border-gray-50">
                    <span className="text-gray-400">{k}</span>
                    <span className="font-semibold text-navy">{v}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Statut courant</p>
                <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: cfg.bg }}>
                  <cfg.Icon className="h-6 w-6" style={{ color: cfg.color }} />
                  <div>
                    <p className="font-bold text-sm" style={{ color: cfg.color }}>{cfg.label}</p>
                    {det.motifStatut && <p className="text-xs text-gray-500 mt-0.5">{det.motifStatut}</p>}
                  </div>
                </div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mt-4 mb-2">Derniers changements</p>
                {det.historique.slice(0, 4).map((h) => {
                  const hcfg = STATUT_CFG[h.nouveauStatut as StatutProjet];
                  return (
                    <div key={h.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 text-xs">
                      <ArrowRight className="h-3 w-3 text-gray-300 shrink-0" />
                      <span className="font-semibold flex-1" style={{ color: hcfg?.color ?? "#1B2A4A" }}>{h.nouveauStatut.replace(/_/g, " ")}</span>
                      <span className="text-gray-300 shrink-0">{new Date(h.changedAt).toLocaleDateString("fr-FR")}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2 — FINANCEMENT */}
          {activeTab === 2 && (
            <div className="grid grid-cols-2 gap-5">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Sources</p>
                {([
                  ["Source de financement", det.sourceFinancement   ?? "—"],
                  ["Bailleur principal",    det.bailleurPrincipal   ?? "—"],
                  ["Bailleur secondaire",   det.bailleurSecondaire  ?? "—"],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs py-2 border-b border-gray-50">
                    <span className="text-gray-400">{k}</span><span className="font-semibold text-navy">{v}</span>
                  </div>
                ))}
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mt-4 mb-3">Enveloppes financières</p>
                {([
                  ["Budget initial",     fmtGnf(det.budgetInitialGnf),     "#1B2A4A"],
                  ["Budget révisé",      fmtGnf(det.budgetReviseGnf),      "#0891B2"],
                  ["Montant engagé",     fmtGnf(det.montantEngageGnf),     "#D97706"],
                  ["Montant ordonnancé", fmtGnf(det.montantOrdonnanceGnf), "#7C3AED"],
                  ["Montant payé",       fmtGnf(det.montantPayeGnf),       "#16A34A"],
                  ["Montant restant",    fmtGnf(det.montantRestantGnf),    "#DC2626"],
                ] as [string, string, string][]).map(([k, v, c]) => (
                  <div key={k} className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-xs text-gray-500">{k}</span>
                    <span className="text-sm font-bold" style={{ color: c }}>{v}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Exécution budgétaire</p>
                <div className="bg-navy/5 rounded-xl p-4 space-y-4">
                  {([
                    ["Taux de décaissement",  det.tauxDecaissement,    "#1B2A4A"],
                    ["Avancement financier",  det.avancementFinancier, "#16A34A"],
                    ["Avancement physique",   det.avancementPhysique,  "#0891B2"],
                  ] as [string, number, string][]).map(([k, v, c]) => (
                    <div key={k}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-500">{k}</span>
                        <span className="font-black" style={{ color: c }}>{v}%</span>
                      </div>
                      <ProgressBar value={v} color={c} />
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <ScoreCircle value={det.scoreDelai}  label="SPI Délai" />
                  <ScoreCircle value={det.scoreCout}   label="CPI Coût" />
                  <ScoreCircle value={det.scoreRisque} label="Risque" />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3 — CALENDRIER */}
          {activeTab === 3 && (
            <div className="grid grid-cols-2 gap-5">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Jalons contractuels</p>
                {([
                  ["Ordre de service",       det.dateOs],
                  ["Démarrage effectif",     det.dateDemarrage],
                  ["Fin prévue travaux",     det.datePrevFinTravaux],
                  ["Réception provisoire",   det.dateReceptionProv],
                  ["Réception définitive",   det.dateReceptionDef],
                  ["Clôture projet",         det.dateCloture],
                ] as [string, string | undefined][]).map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center py-2 border-b border-gray-50 text-xs">
                    <span className="text-gray-400 flex items-center gap-1"><Calendar className="h-3 w-3" />{k}</span>
                    {v ? <span className="font-semibold text-navy">{new Date(v).toLocaleDateString("fr-FR")}</span>
                       : <span className="text-gray-300 italic">Non renseigné</span>}
                  </div>
                ))}
                {det.delaiMois && <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700"><span className="font-bold">Délai contractuel :</span> {det.delaiMois} mois</div>}
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Situation calendaire</p>
                {det.datePrevFinTravaux ? (() => {
                  const r = Math.floor((new Date(det.datePrevFinTravaux).getTime() - Date.now()) / 86400000);
                  return (
                    <div className={`p-5 rounded-xl text-center ${r < 0 ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"}`}>
                      <p className={`font-black text-3xl ${r < 0 ? "text-red-600" : "text-green-600"}`}>{Math.abs(r)}</p>
                      <p className={`text-xs mt-1 ${r < 0 ? "text-red-500" : "text-green-500"}`}>{r < 0 ? "jours de retard" : "jours avant fin prévue"}</p>
                    </div>
                  );
                })() : <p className="text-xs text-gray-400 italic">Date de fin non renseignée.</p>}
              </div>
            </div>
          )}

          {/* TAB 4 — MARCHÉS */}
          {activeTab === 4 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Marchés ({det.marches.length})</h3>
              {det.marches.length === 0 && <p className="text-xs text-gray-400 py-8 text-center">Aucun marché rattaché.</p>}
              <div className="space-y-2">
                {det.marches.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3 text-xs hover:bg-gray-100 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono font-bold text-navy">{m.reference}</p>
                      <p className="text-gray-600 truncate">{m.intitule}</p>
                      {m.entreprise && <p className="text-gray-400 text-[10px]">{m.entreprise.raisonSociale}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-navy">{fmtGnf(m.montantInitialGnf)}</p>
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-semibold text-[10px]">{m.statut}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5 — ATTACHEMENTS */}
          {activeTab === 5 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Attachements ({det.attachements.length})</h3>
              {det.attachements.length === 0 && <p className="text-xs text-gray-400 py-8 text-center">Aucun attachement.</p>}
              <div className="space-y-2">
                {det.attachements.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3 text-xs">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono font-bold text-navy">{a.code ?? a.id.slice(0, 8)}</p>
                      <p className="text-gray-600 truncate">{a.natureTravaux}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-navy">{fmtGnf(a.montantHtGnf)} HT</p>
                      {Boolean(a.montantTtcGnf) && <p className="text-gray-400 text-[10px]">TTC : {fmtGnf(a.montantTtcGnf)}</p>}
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-semibold text-[10px]">{a.statut}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6 — DÉCOMPTES */}
          {activeTab === 6 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Décomptes ({det.decomptes.length})</h3>
              {det.decomptes.length === 0 && <p className="text-xs text-gray-400 py-8 text-center">Aucun décompte.</p>}
              {det.decomptes.length > 0 && (
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>{["Référence","Statut","HT Période","TTC","Net à payer","Date"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-gray-400 uppercase text-[10px]">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {det.decomptes.map((d) => (
                      <tr key={d.id} className="hover:bg-gray-50/50">
                        <td className="px-3 py-2 font-mono font-bold text-navy">{d.reference}</td>
                        <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-semibold text-[10px]">{d.statut}</span></td>
                        <td className="px-3 py-2 text-right">{fmtGnf(d.montantPeriodeHtGnf)}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{fmtGnf(d.montantTtcGnf)}</td>
                        <td className="px-3 py-2 text-right font-black text-navy">{fmtGnf(d.netAPayer)}</td>
                        <td className="px-3 py-2 text-gray-400">{new Date(d.createdAt).toLocaleDateString("fr-FR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB 7 — KPIs */}
          {activeTab === 7 && (
            <div>
              {kpiQ.isLoading && (
                <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                  <RefreshCw className="h-5 w-5 animate-spin mr-2" />Calcul des indicateurs…
                </div>
              )}
              {kpis && (
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Scores de performance</p>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <ScoreCircle value={kpis.scoreDelai}  label="SPI Délai" />
                      <ScoreCircle value={kpis.scoreCout}   label="CPI Coût" />
                      <ScoreCircle value={kpis.scoreRisque} label="Score Risque" />
                    </div>
                    <div className="space-y-3">
                      {([
                        ["Avancement physique",  kpis.avancementPhysique,  "#1B2A4A"],
                        ["Avancement financier", kpis.avancementFinancier, "#16A34A"],
                        ["Taux de décaissement", kpis.tauxDecaissement,    "#0891B2"],
                      ] as [string, number, string][]).map(([k, v, c]) => (
                        <div key={k}>
                          <div className="flex justify-between text-xs mb-1"><span className="text-gray-500">{k}</span><span className="font-black" style={{ color: c }}>{v}%</span></div>
                          <ProgressBar value={v} color={c} />
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mt-4 mb-2">Activité</p>
                    {([
                      ["Marchés",      kpis.nombreMarches],
                      ["Décomptes",    kpis.nombreDecomptes],
                      ["Attachements", kpis.nombreAttachements],
                    ] as [string, number][]).map(([k, v]) => (
                      <div key={k} className="flex justify-between py-1.5 border-b border-gray-50 text-xs">
                        <span className="text-gray-400">{k}</span>
                        <span className="font-black text-navy">{v}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Financier consolidé</p>
                    {([
                      ["Budget initial",   fmtGnf(kpis.budgetInitialGnf),  "#1B2A4A"],
                      ["Budget révisé",    fmtGnf(kpis.budgetReviseGnf),   "#0891B2"],
                      ["Marchés engagés",  fmtGnf(kpis.montantEngageGnf),  "#D97706"],
                      ["Montant décaissé", fmtGnf(kpis.montantDecaisseGnf),"#16A34A"],
                      ["Montant restant",  fmtGnf(kpis.montantRestantGnf), "#DC2626"],
                    ] as [string, string, string][]).map(([k, v, c]) => (
                      <div key={k} className="flex justify-between items-center py-1.5 border-b border-gray-50">
                        <span className="text-xs text-gray-500">{k}</span>
                        <span className="text-sm font-bold" style={{ color: c }}>{v}</span>
                      </div>
                    ))}
                    {kpis.ecartJours != null && (
                      <div className={`mt-3 p-3 rounded-lg text-xs font-semibold ${kpis.ecartJours < 0 ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                        {Math.abs(kpis.ecartJours)} jours {kpis.ecartJours < 0 ? "de retard" : "d'avance sur calendrier"}
                      </div>
                    )}
                    <p className="text-[10px] text-gray-300 mt-3">Calculé le {new Date(kpis.generatedAt).toLocaleString("fr-FR")}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 8 — HISTORIQUE */}
          {activeTab === 8 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Historique des statuts</h3>
              {det.historique.length === 0 && <p className="text-xs text-gray-400">Aucun historique enregistré.</p>}
              <div className="relative pl-6">
                <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-100" />
                {det.historique.map((h) => {
                  const hcfg = STATUT_CFG[h.nouveauStatut as StatutProjet];
                  const HIcon = hcfg?.Icon ?? Clock;
                  return (
                    <div key={h.id} className="relative flex gap-3 pb-5">
                      <div className="absolute -left-6 h-6 w-6 rounded-full flex items-center justify-center shrink-0 border-2 border-white"
                        style={{ backgroundColor: hcfg?.bg ?? "#F3F4F6" }}>
                        <HIcon className="h-3 w-3" style={{ color: hcfg?.color ?? "#6B7280" }} />
                      </div>
                      <div className="flex-1 pt-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          {h.ancienStatut && <><span className="text-xs text-gray-400">{h.ancienStatut.replace(/_/g," ")}</span><ArrowRight className="h-3 w-3 text-gray-300" /></>}
                          <span className="text-xs font-bold" style={{ color: hcfg?.color ?? "#1B2A4A" }}>{h.nouveauStatut.replace(/_/g," ")}</span>
                        </div>
                        {h.motif && <p className="text-xs text-gray-500 mt-0.5 italic">{h.motif}</p>}
                        <p className="text-[10px] text-gray-300 mt-1">{h.changedByEmail && `${h.changedByEmail} — `}{new Date(h.changedAt).toLocaleString("fr-FR")}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 9 — DOCUMENTS */}
          {activeTab === 9 && (
            <div className="text-center py-16 text-gray-400">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium text-sm">Gestion documentaire</p>
              <p className="text-xs mt-1 max-w-sm mx-auto">Upload de rapports, études techniques, ordres de service, contrats bailleur, PV de réception…</p>
              <p className="text-xs text-gray-300 mt-3">Fonctionnalité à venir</p>
            </div>
          )}

          {/* TAB 10 — WORKFLOW BPMN */}
          {activeTab === 10 && (
            <div className="space-y-2">

            </div>
          )}

        </div>
      </div>

      <SharedModals />
    </div>
  );
}
