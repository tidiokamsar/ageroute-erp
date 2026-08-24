/**
 * Module e-Décomptes — AGEROUTE Guinée
 * Workflow BPMN : BROUILLON → SOUMIS → EN_CONTROLE → EN_VALIDATION → VALIDE → PAYE
 * 9 onglets : Résumé | Lignes BPU | Calculs | Pièces | Validations | Workflow | Paiement | Audit | Historique
 */
import { useState, useEffect } from "react";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError, fmtGnf } from "../lib/api";
import { useAuth, canWrite } from "../lib/auth";
import { Button } from "../components/ui/Button";
import { Input, Select, FormField, Textarea } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { toast } from "../components/ui/Toast";
import { SignatureDocumentModal } from "../components/signature/SignatureDocumentModal";
import {
  Plus, Receipt, ChevronRight, Check, X, Send, FileDown, CreditCard,
  CheckCircle, XCircle, Trash2, Calculator, AlertTriangle, Shield,
  FileText, RefreshCw, MessageSquare, Eye, Stamp, Paperclip,
  DollarSign, ClipboardCheck, Layers, GitBranch, Upload, RotateCcw,
} from "lucide-react";
import { FileUploadModal } from "../components/ui/FileUploadModal";
import { Badge } from "../components/ui/Badge";

// ===== TYPES =====

interface MarcheRef {
  id: string; reference: string; intitule: string; objet?: string;
  financement: string; type: string;
  montantInitialGnf: string; montantActualiseGnf?: string;
  tauxTva: number; tauxRetenueGarantie: number; tauxAvance: number;
  dateOs?: string; delaiMois?: number; regionNom?: string;
  missionControle?: string; directionTechnique?: string;
  pkDebut?: number; pkFin?: number; numContrat?: string; bailleur?: string;
  entreprise: { id: string; raisonSociale: string };
}

interface DecompteLigne {
  id: string; codeArticle: string; designation: string; unite: string;
  quantiteContrat: number; quantitePrecedent: number; quantiteCourante: number; quantiteCumulee: number;
  prixUnitaire: string; montantBrut: string; montantTva: string; montantRetenue: string;
  montantAvanceRecup: string; montantPenalite: string; montantNet: string;
  tauxTva: number; tauxRetenue: number; tauxAvance: number;
  statut: string; depassement: boolean; observations?: string;
}

interface Signataire { nom?: string | null; fonction?: string | null; signatureUrl?: string | null }
interface DecompteValidation {
  signataire?: Signataire;
  id: string; etape: string; decision: string; commentaire: string;
  validePar: string; valideNom?: string; valideRole?: string; signatureRef?: string; valideAt: string;
}

interface DecompteCommentaire {
  id: string; contenu: string; auteurNom?: string; auteurRole?: string; type: string; createdAt: string;
}

interface PaymentTrace {
  id: string; etape: string; statut: string; reference?: string; montantGnf?: string;
  dateTransmission?: string; dateValidation?: string; operateurNom?: string; banqueReference?: string;
  observations?: string; createdAt: string;
}

interface ControleResultats {
  ok: boolean; alertes: { niveau: string; code: string; message: string }[];
  montantContrat: string; dejaPaye: string; cumulAvecCourant: string;
  resteContrat: string; tauxConsomme: number;
}

interface Pieces {
  decompteSigné: boolean; attachements: boolean; facture: boolean;
  rapportAvancement: boolean; photosChantier: boolean; pvContradictoire: boolean;
}

interface Decompte {
  id: string; reference: string; numeroDossier?: string; type: string; statut: string;
  netAPayer: string; montantPeriodeHtGnf: string; cumulPrecedentHtGnf: string;
  cumulActuelHtGnf: string; tva: string; montantArmpGnf?: string; montantTtcGnf?: string;
  precompteTvaGnf?: string; retenueGarantie: string;
  avanceRecuperee: string; penalites: string; revisionPrix: string;
  periodeDebut?: string; periodeFin?: string; dateDepot?: string; datePaiement?: string;
  observations?: string; analyseDmc?: string; visaFinancier?: string; commentaireFinancier?: string;
  traitementSuspendu: boolean; auditRequis: boolean;
  piecesObligatoires?: Pieces;
  controleAutoResultats?: ControleResultats;
  marche: MarcheRef;
  entreprise: { id: string; raisonSociale: string };
  createdById?: string;
  _count?: { lignesDecompte: number };
}

// ===== CONSTANTES =====

const STATUT_CFG: Record<string, { label: string; color: string; bg: string }> = {
  BROUILLON:      { label: "Brouillon",       color: "#6B7280", bg: "#F3F4F6" },
  SOUMIS:         { label: "Soumis",          color: "#1D4ED8", bg: "#DBEAFE" },
  EN_CONTROLE:    { label: "En contrôle",     color: "#D97706", bg: "#FEF3C7" },
  EN_VALIDATION:  { label: "En validation",   color: "#0891B2", bg: "#E0F2FE" },
  VISA_DAF:       { label: "Visa DAF",        color: "#7C3AED", bg: "#EDE9FE" },
  VISA_DG:        { label: "Visa DG",         color: "#4F46E5", bg: "#E0E7FF" },
  VALIDE:         { label: "Validé",          color: "#16A34A", bg: "#DCFCE7" },
  PAYE:           { label: "Payé",            color: "#0F766E", bg: "#CCFBF1" },
  REJETE:         { label: "Rejeté",          color: "#DC2626", bg: "#FEE2E2" },
};

const BPMN_STEPS = [
  { key: "BROUILLON",    label: "Création",    role: "Préparateur" },
  { key: "SOUMIS",       label: "Soumis",      role: "Mission" },
  { key: "EN_CONTROLE",  label: "Mission",     role: "Technique" },
  { key: "EN_VALIDATION",label: "Technique",   role: "DMC" },
  { key: "VISA_DAF",     label: "DAF",         role: "DG" },
  { key: "VALIDE",       label: "Validé DG",   role: "Paiement" },
  { key: "PAYE",         label: "Payé",        role: "Archivage" },
];

const PAYMENT_STEPS = [
  { key: "ORDONNANCEMENT", label: "Ordonnancement", Icon: FileText },
  { key: "VISA_TRESOR",    label: "Visa Trésor",     Icon: Stamp },
  { key: "EMISSION",       label: "Émission",         Icon: Send },
  { key: "VIREMENT",       label: "Virement",         Icon: CreditCard },
  { key: "PAIEMENT_FINAL", label: "Paiement",         Icon: CheckCircle },
];

const PIECES_CFG = [
  { key: "decompteSigné",     label: "Décompte signé",           requis: true },
  { key: "attachements",      label: "Attachements validés",  requis: true },
  { key: "facture",           label: "Facture de l'entreprise",  requis: true },
  { key: "rapportAvancement", label: "Rapport d'avancement",     requis: true },
  { key: "photosChantier",    label: "Photos de chantier",       requis: false },
  { key: "pvContradictoire",  label: "PV contradictoire",        requis: false },
];

const TABS = ["Résumé","Lignes BPU","Calculs","Pièces","Validations","Workflow","Paiement","Audit","Historique","Attachements"] as const;

const TYPE_OPT = [
  { value:"AVANCE",        label:"Avance de démarrage" },
  { value:"PROVISOIRE",    label:"Provisoire mensuel" },
  { value:"PARTIEL",       label:"Partiel" },
  { value:"INTERMEDIAIRE", label:"Intermédiaire" },
  { value:"FINAL",         label:"Final" },
  { value:"CLOTURE",       label:"Clôture" },
  { value:"APRES_AVENANT", label:"Après avenant" },
];

function StatutBadge({ statut }: { statut: string }) {
  const cfg = STATUT_CFG[statut] ?? { label: statut, color: "#6B7280", bg: "#F3F4F6" };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
  );
}

// ===== PAGE =====

export function DecomptesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const role = user?.role ?? undefined;

  // Vue par défaut : chaque profil ne voit que les dossiers en attente de SON action
  // (ADMIN/DG gardent la vue globale). Le toggle "Tous" reste disponible pour consulter.
  const isSupervRole = ["ADMIN", "DG"].includes(role ?? "");
  const [vue, setVue] = useState<"a_traiter" | "tous">(isSupervRole ? "tous" : "a_traiter");
  const [fStatut, setFStatut] = useState("");
  const [fMarcheId, setFMarcheId] = useState("");

  const [createModal, setCreateModal] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  const [form, setForm] = useState<Record<string, unknown>>({});
  const [ligneForm, setLigneForm] = useState<Record<string, unknown>>({});
  const [addLigneModal, setAddLigneModal] = useState(false);
  const [valModal, setValModal] = useState(false);
  const [valForm, setValForm] = useState<Record<string, unknown>>({ etape: "SOUMISSION", decision: "APPROUVE", commentaire: "" });
  const [commentText, setCommentText] = useState("");
  const [commentType, setCommentType] = useState("COMMENTAIRE");
  const [payModal, setPayModal] = useState(false);
  const [payForm, setPayForm] = useState<Record<string, unknown>>({ etape: "ORDONNANCEMENT", statut: "EN_ATTENTE" });
  const [confirmSuppr, setConfirmSuppr] = useState<string | null>(null);
  const [confirmSupprLigne, setConfirmSupprLigne] = useState<string | null>(null);
  const [calcPreview, setCalcPreview] = useState({ tva: 0, retenue: 0, avance: 0, net: 0 });

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: statsRaw } = useQuery({
    queryKey: ["dec-stats-enrichis"],
    queryFn: () => api.get("/decomptes/stats/enrichis").then((r) => r.data).catch(() => api.get("/decomptes/stats").then((r) => r.data)),
  });

  const { data: listData, isLoading } = useQuery({
    queryKey: ["decomptes", fStatut, fMarcheId, vue],
    queryFn: () => api.get("/decomptes", { params: { statut: fStatut || undefined, marcheId: fMarcheId || undefined, pageSize: 50, aTraiter: vue === "a_traiter" ? 1 : undefined } }).then((r) => r.data),
  });

  const { data: marches } = useQuery({
    queryKey: ["marches-sel"],
    queryFn: () => api.get("/marches", { params: { pageSize: 200, statut: "ACTIF" } }).then((r) => r.data.data),
  });

  const { data: detail, refetch: refetchDetail } = useQuery({
    queryKey: ["dec-detail", detailId],
    queryFn: () => api.get(`/decomptes/${detailId}`).then((r) => r.data),
    enabled: !!detailId,
  });

  const { data: lignes, refetch: refetchLignes } = useQuery({
    queryKey: ["dec-lignes", detailId],
    queryFn: () => api.get(`/decomptes/${detailId}/lignes`).then((r) => r.data),
    enabled: !!detailId && activeTab === 1,
  });

  const { data: validations } = useQuery({
    queryKey: ["dec-validations", detailId],
    queryFn: () => api.get(`/decomptes/${detailId}/validations-avancees`).then((r) => r.data),
    enabled: !!detailId && activeTab === 4,
  });

  const { data: commentaires, refetch: refetchComm } = useQuery({
    queryKey: ["dec-comments", detailId],
    queryFn: () => api.get(`/decomptes/${detailId}/commentaires`).then((r) => r.data),
    enabled: !!detailId && activeTab === 8,
  });

  // Onglet Attachements (index 9) — ceux du décompte consulté, et ceux des
  // autres décomptes du même marché : le constat contradictoire se lit en
  // cumul, un décompte isolé ne dit pas ce qui a déjà été attaché.
  const { data: attCourants } = useQuery({
    queryKey: ["decompte-attachements", detailId],
    queryFn: () => api.get(`/attachements?decompteId=${detailId}&pageSize=100`).then((r) => r.data),
    enabled: !!detailId && activeTab === 9,
  });
  const { data: attAnterieurs } = useQuery({
    queryKey: ["marche-attachements", detail?.marcheId, detailId],
    queryFn: () => api.get(`/attachements?marcheId=${detail?.marcheId}&saufDecompteId=${detailId}&pageSize=100`).then((r) => r.data),
    enabled: !!detailId && !!detail?.marcheId && activeTab === 9,
  });

  const { data: paymentTraces, refetch: refetchPay } = useQuery({
    queryKey: ["dec-payment", detailId],
    queryFn: () => api.get(`/decomptes/${detailId}/payment-traces`).then((r) => r.data),
    enabled: !!detailId && activeTab === 6,
  });

  const { data: auditLogs } = useQuery({
    queryKey: ["dec-audit", detailId],
    queryFn: () => api.get(`/decomptes/${detailId}/audit`).then((r) => r.data).catch(() => []),
    enabled: !!detailId && activeTab === 7,
  });

  // Instance chargée dès l'ouverture du détail (pas seulement l'onglet Workflow) : le
  // bouton "Valider" du header en dépend pour savoir si l'étape courante appartient au
  // rôle connecté. NB : la recherche se fait par ID de décompte (route dédiée), pas par
  // ID d'instance — c'était la cause du "Aucune instance workflow active" permanent.
  const { data: wfInstance } = useQuery({
    queryKey: ["wf-dec", detailId],
    queryFn: () => api.get(`/workflow/decompte/${detailId}`).then((r) => r.data).catch(() => null),
    enabled: !!detailId,
  });

  const wfInst = wfInstance as { id: string; statut: string; etapeActuelle: number; definition?: { etapes?: { nom: string; roleRequis: string }[] } } | null;
  const etapeCourante = wfInst?.definition?.etapes?.[wfInst.etapeActuelle];
  // L'utilisateur peut agir si l'étape courante requiert son rôle (ADMIN passe toujours,
  // DG uniquement à son étape — la supervision se fait depuis la page Workflow).
  const peutValider = !!wfInst && wfInst.statut === "EN_COURS" &&
    (role === "ADMIN" || etapeCourante?.roleRequis === role);

  // ── Live calc ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const m = (marches ?? []).find((x: MarcheRef) => x.id === form.marcheId) as MarcheRef | undefined;
    const montant = Number(form.montantPeriodeHtGnf ?? 0);
    const tva     = Math.round(montant * (m?.tauxTva ?? 18) / 100);
    const retenue = Math.round(montant * (m?.tauxRetenueGarantie ?? 5) / 100);
    const avance  = Math.round(montant * (m?.tauxAvance ?? 20) / 100);
    const pen     = Number(form.penalites ?? 0);
    setCalcPreview({ tva, retenue, avance, net: montant + tva - retenue - avance - pen });
  }, [form.montantPeriodeHtGnf, form.marcheId, form.penalites, marches]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: (b: object) => api.post("/decomptes", b).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["decomptes"] }); qc.invalidateQueries({ queryKey: ["dec-stats-enrichis"] }); toast.success("Décompte créé"); setCreateModal(false); setForm({}); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const addLigneMut = useMutation({
    mutationFn: (b: object) => api.post(`/decomptes/${detailId}/lignes`, b).then((r) => r.data),
    onSuccess: () => { refetchLignes(); refetchDetail(); toast.success("Ligne ajoutée"); setAddLigneModal(false); setLigneForm({}); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const delLigneMut = useMutation({
    mutationFn: (lid: string) => api.delete(`/decomptes/${detailId}/lignes/${lid}`),
    onSuccess: () => { refetchLignes(); refetchDetail(); toast.success("Ligne supprimée"); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const calcMut = useMutation({
    mutationFn: (b: object) => api.post(`/decomptes/${detailId}/calculate`, b).then((r) => r.data),
    onSuccess: (d: { netAPayer: string | number }) => { refetchDetail(); toast.success(`Recalculé — Net : ${fmtGnf(d.netAPayer)}`); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  // Validation : UN SEUL appel, au circuit. Le serveur écrit dans la même
  // transaction l'action de workflow, la ligne de l'onglet Validations et le
  // statut du décompte — et applique RG9 (séparation des tâches).
  //
  // L'écran postait auparavant AUSSI sur /validations-avancees, « non bloquant ».
  // Cette seconde écriture ferait désormais doublon : la projection est
  // produite par le moteur. La route répond 410 et explique le changement.
  const valMut = useMutation({
    mutationFn: async (b: { etape?: unknown; decision?: unknown; commentaire?: unknown; signatureRef?: unknown }) => {
      if (!wfInst || wfInst.statut !== "EN_COURS") {
        throw new Error("Aucun circuit de validation actif — soumettez d'abord le décompte.");
      }
      const decisionWf = b.decision === "CORRECTION" ? "DEMANDE_CORRECTION" : String(b.decision ?? "APPROUVE");
      const commentaire = b.signatureRef
        ? `${String(b.commentaire ?? "")} [réf. saisie : ${String(b.signatureRef)}]`
        : String(b.commentaire ?? "");
      return api.post(`/workflow/${wfInst.id}/action`, { decision: decisionWf, commentaire }).then((r) => r.data);
    },
    onSuccess: (data: { message?: string; statut?: string }) => {
      qc.invalidateQueries();
      toast.success(data?.message ?? "Validation enregistrée — dossier transmis à l'étape suivante");
      setValModal(false);
      setValForm({ etape: "SOUMISSION", decision: "APPROUVE", commentaire: "" });
      // Le dossier n'attend plus l'action de ce profil : on ferme le détail,
      // il disparaît de la vue "À traiter" au refetch.
      setDetailId(null);
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const commMut = useMutation({
    mutationFn: (b: object) => api.post(`/decomptes/${detailId}/commentaires`, b).then((r) => r.data),
    onSuccess: () => { refetchComm(); setCommentText(""); toast.success("Commentaire ajouté"); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const payMut = useMutation({
    mutationFn: (b: object) => api.post(`/decomptes/${detailId}/payment-traces`, b).then((r) => r.data),
    onSuccess: () => { refetchPay(); refetchDetail(); toast.success("Étape enregistrée"); setPayModal(false); setPayForm({ etape: "ORDONNANCEMENT", statut: "EN_ATTENTE" }); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const piecesMut = useMutation({
    mutationFn: ({ id, pieces }: { id: string; pieces: object }) => api.patch(`/decomptes/${id}/pieces`, pieces).then((r) => r.data),
    onSuccess: () => { refetchDetail(); toast.success("Pièces mises à jour"); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const controlesMut = useMutation({
    mutationFn: (id: string) => api.post(`/decomptes/${id}/controles`).then((r) => r.data),
    onSuccess: () => { refetchDetail(); toast.success("Contrôles actualisés"); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const soumettreWf = useMutation({
    mutationFn: (id: string) => api.post(`/workflow/soumettre/${id}`).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries(); toast.success("Soumis au circuit"); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/decomptes/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["decomptes"] }); toast.success("Supprimé"); setDetailId(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  // Éligibilité de signature du dossier ouvert : le bouton « Signer ce
  // document » n'existe que si TOUTES les conditions sont réunies côté serveur
  // (module actif, compte nominatif, étape active pour CE rôle, RG9…)..
  const { data: sigElig } = useQuery<{ autorise: boolean; etape: string | null; mode: string; motifs: string[] }>({
    queryKey: ["signature-eligibilite", detailId],
    queryFn: () => api.get(`/signature-numerique/decomptes/${detailId}/eligibilite`).then((r) => r.data).catch(() => null),
    enabled: !!detailId,
    staleTime: 15_000,
  });
  const [signatureModal, setSignatureModal] = useState(false);

  /**
   * Téléchargement d'un PDF.
   *
   * `dossier` = les onze sections (référentiel, calculs, lignes BPU, pièces,
   * validations, circuit, paiements, attachements, historique, audit,
   * cartouches de signature). C'est le document à joindre au dossier physique.
   * `resume` = la fiche courte, pour une vérification rapide.
   */
  const downloadPdf = async (id: string, ref: string, variante: "dossier" | "resume" = "dossier") => {
    const chemin = variante === "dossier" ? `/documents/decompte/${id}/dossier/pdf` : `/documents/decompte/${id}/pdf`;
    const prefixe = variante === "dossier" ? "dossier" : "decompte";
    try {
      const res = await api.get(chemin, { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a"); a.href = url; a.download = `${prefixe}-${ref}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { toast.error("PDF indisponible"); }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const items: Decompte[] = Array.isArray(listData?.data) ? listData.data : [];
  const stats = (statsRaw ?? {}) as Record<string, unknown>;
  const det = detail as Decompte | null;
  const r = role ?? "";
  const canAdmin = ["ADMIN","DMC"].includes(r);
  const canDaf   = ["ADMIN","DAF"].includes(r);
  const canDg    = ["ADMIN","DG"].includes(r);

  function piecesStats(p?: Pieces) {
    const ok = PIECES_CFG.filter((c) => p?.[c.key as keyof Pieces]).length;
    const reqOk = PIECES_CFG.filter((c) => c.requis && p?.[c.key as keyof Pieces]).length;
    return { ok, total: PIECES_CFG.length, reqOk, reqTotal: PIECES_CFG.filter((c) => c.requis).length };
  }

  // ── JSX ───────────────────────────────────────────────────────────────────

  /**
   * Total d'une colonne du bordereau. Centralisé parce que le pied du tableau
   * ne comptait que 14 cellules pour 16 colonnes : la retenue s'affichait sous
   * « ARMP » et le net sous « TTC ». Un total mal placé sur une pièce
   * comptable se lit comme une erreur de calcul.
   */
  const totalLignes = (champ: string): number =>
    ((lignes as DecompteLigne[] | undefined) ?? []).reduce(
      (somme, l) => somme + Number((l as unknown as Record<string, unknown>)[champ] ?? 0),
      0,
    );

  return (
    <div className="space-y-5">

      {/* ── KPI CARDS ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {([
          { label: "Total",       value: stats.total ?? 0,               color: "#1B2A4A", Icon: Receipt },
          { label: "Brouillons",  value: stats.brouillons ?? 0,          color: "#6B7280", Icon: FileText },
          { label: "Soumis",      value: stats.soumis ?? 0,              color: "#1D4ED8", Icon: Send },
          { label: "En contrôle", value: stats.enControle ?? 0,          color: "#D97706", Icon: Eye },
          { label: "Validés",     value: stats.valides ?? 0,             color: "#16A34A", Icon: CheckCircle },
          { label: "Payés",       value: stats.payes ?? 0,               color: "#0F766E", Icon: CreditCard },
          { label: "Rejetés",     value: stats.rejetes ?? 0,             color: "#DC2626", Icon: XCircle },
          { label: "Montant payé",value: fmtGnf(String(stats.montantPayeGnf ?? "0")), color: "#0F766E", Icon: DollarSign, small: true },
        ] as { label: string; value: unknown; color: string; Icon: React.ElementType; small?: boolean }[]).map(({ label, value, color, Icon, small }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
              <p className="text-[10px] text-gray-400 truncate">{label}</p>
            </div>
            <p className={`font-black ${small ? "text-sm" : "text-2xl"}`} style={{ color }}>{String(value)}</p>
          </div>
        ))}
      </div>

      {/* ── FILTRES ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Vue "À traiter" : uniquement les dossiers en attente de l'action de CE profil */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${vue === "a_traiter" ? "bg-navy text-white" : "bg-white text-gray-500 hover:text-navy"}`}
              onClick={() => setVue("a_traiter")}>
              À traiter
            </button>
            <button
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${vue === "tous" ? "bg-navy text-white" : "bg-white text-gray-500 hover:text-navy"}`}
              onClick={() => setVue("tous")}>
              Tous
            </button>
          </div>
          <Select className="w-44" value={fStatut} onChange={(e) => setFStatut(e.target.value)}>
            <option value="">Tous statuts</option>
            {Object.entries(STATUT_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Select className="w-64" value={fMarcheId} onChange={(e) => setFMarcheId(e.target.value)}>
            <option value="">Tous marchés</option>
            {(marches ?? []).map((m: MarcheRef) => <option key={m.id} value={m.id}>{m.reference} — {m.intitule}</option>)}
          </Select>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setFStatut(""); setFMarcheId(""); }}>
              <RefreshCw className="h-4 w-4" /> Reset
            </Button>
            {canWrite(role) && (
              <Button onClick={() => { setForm({}); setCreateModal(true); }}>
                <Plus className="h-4 w-4" /> Nouveau décompte
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── TABLEAU ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {["Numéro","Marché / Entreprise","Type","Période","Montant HT","Net à payer","Payé / Reste","Lignes","Pièces","Statut",""].map((h) => (
                <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && <tr><td colSpan={10} className="py-10 text-center text-gray-400">Chargement...</td></tr>}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={10} className="py-14 text-center">
                <Receipt className="h-10 w-10 mx-auto mb-3 text-gray-200" />
                <p className="text-gray-400">
                  {vue === "a_traiter" ? "Aucun dossier en attente de votre action" : "Aucun décompte trouvé"}
                </p>
                {vue === "a_traiter" && (
                  <button className="text-xs text-navy underline mt-1" onClick={() => setVue("tous")}>
                    Voir tous les décomptes
                  </button>
                )}
              </td></tr>
            )}
            {items.map((d) => {
              const ps = piecesStats(d.piecesObligatoires);
              return (
                <tr key={d.id} className="hover:bg-gray-50/50 cursor-pointer" onClick={() => { setDetailId(d.id); setActiveTab(0); }}>
                  <td className="px-3 py-2.5">
                    <p className="font-mono text-xs font-bold text-navy">{d.reference}</p>
                    {d.numeroDossier && <p className="text-[10px] text-gray-400">{d.numeroDossier}</p>}
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="text-xs font-medium text-gray-800">{d.marche?.reference}</p>
                    <p className="text-[10px] text-gray-400 truncate max-w-[150px]">{d.entreprise?.raisonSociale}</p>
                  </td>
                  <td className="px-3 py-2.5"><span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{d.type}</span></td>
                  <td className="px-3 py-2.5 text-xs text-gray-400">{d.periodeDebut ? d.periodeDebut.slice(0, 7) : "—"}</td>
                  <td className="px-3 py-2.5 text-right text-xs text-gray-600">{fmtGnf(d.montantPeriodeHtGnf)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-xs text-navy">{fmtGnf(d.netAPayer)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-green-600 text-[10px]">{fmtGnf((d as any).dejaPayeGnf ?? "0")}</span>
                    <span className="text-gray-300 text-[8px]"> / </span>
                    <span className="text-orange-500 text-[10px]">{fmtGnf((d as any).resteAPayerGnf ?? d.netAPayer)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="text-xs text-gray-500 flex items-center justify-center gap-1">
                      <Layers className="h-3 w-3" />{d._count?.lignesDecompte ?? 0}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] font-bold ${ps.reqOk === ps.reqTotal ? "text-green-600" : "text-red-500"}`}>{ps.reqOk}/{ps.reqTotal}</span>
                    {d.controleAutoResultats && d.controleAutoResultats.alertes.length > 0 && (
                      <AlertTriangle className="inline h-3 w-3 text-amber-500 ml-1" />
                    )}
                  </td>
                  <td className="px-3 py-2.5"><StatutBadge statut={d.statut} /></td>
                  <td className="px-3 py-2.5"><ChevronRight className="h-4 w-4 text-gray-300" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ===== MODAL DETAIL ===== */}
      <Modal open={!!detailId} onClose={() => setDetailId(null)} title="" size="xl">
        {!det && <div className="py-12 text-center text-gray-400">Chargement...</div>}
        {det && (
          <div style={{ minHeight: 580 }}>
            {/* Header */}
            <div className="flex items-start justify-between mb-3 pb-3 border-b border-gray-100">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-lg font-black text-navy">{det.reference}</span>
                  <StatutBadge statut={det.statut} />
                  {det.traitementSuspendu && <span className="text-xs bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded">SUSPENDU</span>}
                  {det.auditRequis && <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded">AUDIT REQUIS</span>}
                </div>
                <p className="text-xs text-gray-500">{det.entreprise.raisonSociale} — {det.marche.reference}</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button className="px-2.5 py-1.5 text-xs border border-navy/30 bg-navy/5 rounded-lg text-navy font-medium hover:bg-navy/10 flex items-center gap-1.5"
                  title="Dossier complet — tous les onglets, avec cartouches de signature"
                  onClick={() => downloadPdf(det.id, det.reference, "dossier")}>
                  <FileDown className="h-3.5 w-3.5" /> Dossier complet
                </button>
                <button className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 flex items-center gap-1.5"
                  title="Fiche courte — récapitulatif financier et lignes BPU"
                  onClick={() => downloadPdf(det.id, det.reference, "resume")}>
                  <FileDown className="h-3.5 w-3.5" /> Résumé
                </button>
                {/* SIGNER CE DOCUMENT — visible seulement quand le serveur
                    confirme que tout est réuni : module actif, compte nominatif,
                    étape active pour ce rôle, séparation des tâches. La fenêtre
                    montre le PDF exact, exige le consentement et la
                    réauthentification — jamais un clic. */}
                {sigElig?.autorise && (
                  <button className="px-2.5 py-1.5 text-xs bg-amber-600 text-white rounded-lg flex items-center gap-1.5 hover:bg-amber-700"
                    title={`Signer l'étape « ${sigElig.etape} » — mode ${sigElig.mode}`}
                    onClick={() => setSignatureModal(true)}>
                    <Check className="h-3.5 w-3.5" /> Signer ce document
                  </button>
                )}
                {canWrite(role) && det.statut === "BROUILLON" && (
                  <button className="px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-lg flex items-center gap-1.5"
                    onClick={() => soumettreWf.mutate(det.id)}>
                    <Send className="h-3.5 w-3.5" /> Soumettre
                  </button>
                )}
                {peutValider && (
                  <button className="px-2.5 py-1.5 text-xs bg-navy text-white rounded-lg flex items-center gap-1.5"
                    onClick={() => { setValForm({ decision: "APPROUVE", commentaire: "" }); setValModal(true); }}>
                    <ClipboardCheck className="h-3.5 w-3.5" /> Traiter — étape {etapeCourante?.nom ?? ""}
                  </button>
                )}
                {canAdmin && det.statut !== "PAYE" && (
                  <button className="px-2.5 py-1.5 text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg"
                    onClick={() => setConfirmSuppr(det.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <ConfirmDialog
              open={confirmSuppr !== null} danger title="Supprimer ce décompte ?"
              message={<>Le décompte <b>{det.reference}</b> sera retiré de toutes les listes (suppression logicielle, tracée en audit). Un décompte payé ne peut pas être supprimé.</>}
              confirmLabel="Supprimer le décompte" loading={deleteMut.isPending}
              onClose={() => setConfirmSuppr(null)}
              onConfirm={() => { if (confirmSuppr) deleteMut.mutate(confirmSuppr); setConfirmSuppr(null); }}
            />
            <ConfirmDialog
              open={confirmSupprLigne !== null} danger title="Supprimer cette ligne ?"
              message="La ligne BPU sera définitivement supprimée du décompte. Vérifiez le recalcul des totaux après suppression."
              confirmLabel="Supprimer la ligne" loading={delLigneMut.isPending}
              onClose={() => setConfirmSupprLigne(null)}
              onConfirm={() => { if (confirmSupprLigne) delLigneMut.mutate(confirmSupprLigne); setConfirmSupprLigne(null); }}
            />

            {/* Tabs */}
            <div className="flex gap-0.5 overflow-x-auto border-b border-gray-100 mb-4">
              {TABS.map((tab, i) => (
                <button key={tab} onClick={() => setActiveTab(i)}
                  className={`px-3 py-2 text-xs font-semibold rounded-t-lg whitespace-nowrap transition-colors ${activeTab === i ? "bg-navy text-white" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}>
                  {tab}
                </button>
              ))}
            </div>

            {/* ── TAB 0 RÉSUMÉ ───────────────────────────────────────────── */}
            {activeTab === 0 && (
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Référentiel</p>
                  {([
                    ["Marché", det.marche.reference],
                    ["Objet", det.marche.objet ?? det.marche.intitule],
                    ["Entreprise", det.entreprise.raisonSociale],
                    ["Mission contrôle", det.marche.missionControle ?? "—"],
                    ["Direction technique", det.marche.directionTechnique ?? "—"],
                    ["Région", det.marche.regionNom ?? "—"],
                    ["Financement", det.marche.financement],
                    ["Bailleur", det.marche.bailleur ?? "—"],
                    ["N° contrat", det.marche.numContrat ?? "—"],
                    ["PK tronçon", det.marche.pkDebut ? `${det.marche.pkDebut} → ${det.marche.pkFin}` : "—"],
                  ] as [string, string][]).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs py-1.5 border-b border-gray-50">
                      <span className="text-gray-400">{k}</span>
                      <span className="font-medium text-gray-700 text-right max-w-[55%]">{v}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Montants</p>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {([
                      ["Initial", fmtGnf(det.marche.montantInitialGnf)],
                      ["Actualisé", fmtGnf(det.marche.montantActualiseGnf ?? det.marche.montantInitialGnf)],
                      ["Délai", det.marche.delaiMois ? `${det.marche.delaiMois} mois` : "—"],
                      ["Date OS", det.marche.dateOs ? new Date(det.marche.dateOs).toLocaleDateString("fr-FR") : "—"],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} className="bg-gray-50 rounded-lg p-2.5">
                        <p className="text-[10px] text-gray-400 mb-0.5">{k}</p>
                        <p className="text-sm font-bold text-navy">{v}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Ce décompte</p>
                  {([
                    ["Type", TYPE_OPT.find((t) => t.value === det.type)?.label ?? det.type],
                    ["Dossier", det.numeroDossier ?? "—"],
                    ["Période", det.periodeDebut ? `${det.periodeDebut.slice(0, 10)} → ${det.periodeFin?.slice(0, 10) ?? "—"}` : "—"],
                    ["Dépôt", det.dateDepot ? new Date(det.dateDepot).toLocaleDateString("fr-FR") : "—"],
                    ["Paiement", det.datePaiement ? new Date(det.datePaiement).toLocaleDateString("fr-FR") : "—"],
                    ["Visa DAF", det.visaFinancier ?? "—"],
                  ] as [string, string][]).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs py-1.5 border-b border-gray-50">
                      <span className="text-gray-400">{k}</span>
                      <span className="font-semibold text-navy">{v}</span>
                    </div>
                  ))}
                  {det.analyseDmc && (
                    <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-blue-600 mb-1">Analyse DMC</p>
                      <p className="text-xs text-blue-800">{det.analyseDmc}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── TAB 1 LIGNES BPU ────────────────────────────────────────── */}
            {activeTab === 1 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Lignes BPU ({(lignes as DecompteLigne[] | undefined)?.length ?? 0})</h3>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => calcMut.mutate({ applyVat: true, vatRate: det.marche.tauxTva, retentionRate: det.marche.tauxRetenueGarantie, advanceRecoveryRate: det.marche.tauxAvance })} disabled={calcMut.isPending}>
                      <Calculator className="h-3.5 w-3.5" /> Recalculer
                    </Button>
                    {canWrite(role) && (
                      <Button size="sm" onClick={() => { setLigneForm({}); setAddLigneModal(true); }}>
                        <Plus className="h-3.5 w-3.5" /> Ajouter
                      </Button>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {["Code","Désignation","U","Contrat","Préc.","Cour.","Cumulé","P.U.","HT","TVA","ARMP","TTC","−RG","Net","Statut",""].map((h) => (
                          <th key={h} className="px-2 py-1.5 text-left font-semibold text-gray-400 uppercase text-[10px] whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(lignes as DecompteLigne[] | undefined)?.map((l) => (
                        <tr key={l.id} className={l.depassement ? "bg-red-50" : "hover:bg-gray-50/50"}>
                          <td className="px-2 py-2 font-mono font-bold text-gray-700">{l.codeArticle}</td>
                          <td className="px-2 py-2 max-w-[160px] truncate text-gray-700" title={l.designation}>{l.designation}</td>
                          <td className="px-2 py-2 text-gray-400">{l.unite}</td>
                          <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{l.quantiteContrat}</td>
                          <td className="px-2 py-2 text-right text-gray-400 whitespace-nowrap tabular-nums">{l.quantitePrecedent}</td>
                          <td className="px-2 py-2 text-right font-semibold whitespace-nowrap tabular-nums">{l.quantiteCourante}</td>
                          <td className={`px-2 py-2 text-right font-bold ${l.depassement ? "text-red-600" : "text-navy"}`}>{l.quantiteCumulee}</td>
                          <td className="px-2 py-2 text-right text-gray-400 whitespace-nowrap tabular-nums">{fmtGnf(l.prixUnitaire)}</td>
                          <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{fmtGnf(l.montantBrut)}</td>
                          <td className="px-2 py-2 text-right text-cyan-600 whitespace-nowrap tabular-nums">{fmtGnf(l.montantTva)}</td>
                          <td className="px-2 py-2 text-right text-orange-500 whitespace-nowrap tabular-nums">{fmtGnf((l as unknown as Record<string, unknown>).montantArmp as string ?? "0")}</td>
                          <td className="px-2 py-2 text-right font-semibold text-slate-700 whitespace-nowrap tabular-nums">{fmtGnf((l as unknown as Record<string, unknown>).montantTtc as string ?? "0")}</td>
                          <td className="px-2 py-2 text-right text-amber-600 whitespace-nowrap tabular-nums">{fmtGnf(l.montantRetenue)}</td>
                          <td className="px-2 py-2 text-right font-black text-navy whitespace-nowrap tabular-nums">{fmtGnf(l.montantNet)}</td>
                          <td className="px-2 py-2">
                            {l.depassement ? <span className="text-red-600 flex items-center gap-0.5 font-bold"><AlertTriangle className="h-3 w-3"/>!!</span> : <span className="text-green-500"><Check className="h-3 w-3"/></span>}
                          </td>
                          <td className="px-2 py-2">
                            <button className="text-red-300 hover:text-red-500" onClick={() => setConfirmSupprLigne(l.id)}>
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(!lignes || (lignes as DecompteLigne[]).length === 0) && (
                        <tr><td colSpan={16} className="py-8 text-center text-gray-400">Aucune ligne BPU — ajoutez des articles</td></tr>
                      )}
                    </tbody>
                    {lignes && (lignes as DecompteLigne[]).length > 0 && (
                      <tfoot className="bg-gray-50 border-t border-gray-200">
                        <tr>
                          <td colSpan={8} className="px-2 py-2 font-black text-gray-500 uppercase text-[10px]">Total</td>
                          <td className="px-2 py-2 text-right font-bold whitespace-nowrap tabular-nums">{fmtGnf(totalLignes("montantBrut"))}</td>
                          <td className="px-2 py-2 text-right text-cyan-600 whitespace-nowrap tabular-nums">{fmtGnf(totalLignes("montantTva"))}</td>
                          <td className="px-2 py-2 text-right text-orange-500 whitespace-nowrap tabular-nums">{fmtGnf(totalLignes("montantArmp"))}</td>
                          <td className="px-2 py-2 text-right font-semibold text-slate-700 whitespace-nowrap tabular-nums">{fmtGnf(totalLignes("montantTtc"))}</td>
                          <td className="px-2 py-2 text-right text-amber-600 whitespace-nowrap tabular-nums">{fmtGnf(totalLignes("montantRetenue"))}</td>
                          <td className="px-2 py-2 text-right font-black text-navy whitespace-nowrap tabular-nums">{fmtGnf(totalLignes("montantNet"))}</td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB 2 CALCULS — FICHE D'ANALYSE AGEROUTE ──────────────── */}
            {activeTab === 2 && (
              <div className="grid grid-cols-2 gap-5">
                {/* Colonne gauche : Fiche d'analyse (modèle officiel AGEROUTE) */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Fiche d'Analyse — Formule AGEROUTE</p>
                    <span className="text-[9px] bg-blue-50 text-blue-600 font-bold px-2 py-0.5 rounded-full">ARMP · TVA · TTC</span>
                  </div>

                  {/* Bloc HT */}
                  <div className="space-y-0">
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-xs text-gray-600 font-semibold">Montant HT période</span>
                      <span className="text-sm font-bold text-navy">{fmtGnf(det.montantPeriodeHtGnf)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-xs text-gray-400">+ TVA 18% (sur HT)</span>
                      <span className="text-sm font-semibold text-cyan-600">+ {fmtGnf(det.tva)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-xs text-gray-400">+ ARMP 0,6% (redevance régulation marchés)</span>
                      <span className="text-sm font-semibold text-orange-500">+ {fmtGnf(det.montantArmpGnf ?? "0")}</span>
                    </div>
                    {/* Sous-total TTC */}
                    <div className="flex justify-between items-center py-2.5 bg-slate-50 rounded-lg px-3 my-1">
                      <span className="text-xs font-black text-slate-600">= MONTANT TTC</span>
                      <span className="text-base font-black text-slate-700">{fmtGnf(det.montantTtcGnf ?? String(Number(det.montantPeriodeHtGnf) + Number(det.tva)))}</span>
                    </div>
                  </div>

                  {/* Déductions */}
                  <p className="text-[9px] font-bold text-gray-400 uppercase mt-3 mb-1">Déductions</p>
                  <div className="space-y-0">
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-xs text-gray-400">− Précompte TVA (TTC × 9/118)</span>
                      <span className="text-sm font-semibold text-red-500">− {fmtGnf(det.precompteTvaGnf ?? "0")}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-xs text-gray-400">− Retenue de garantie 5% (sur TTC)</span>
                      <span className="text-sm font-semibold text-amber-600">− {fmtGnf(det.retenueGarantie)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-xs text-gray-400">− ARMP reversé (0,6%)</span>
                      <span className="text-sm font-semibold text-orange-500">− {fmtGnf(det.montantArmpGnf ?? "0")}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-xs text-gray-400">− Remboursement avance démarrage</span>
                      <span className="text-sm font-semibold text-purple-600">− {fmtGnf(det.avanceRecuperee)}</span>
                    </div>
                    {Number(det.penalites) > 0 && (
                      <div className="flex justify-between items-center py-2 border-b border-gray-100">
                        <span className="text-xs text-gray-400">− Pénalités de retard</span>
                        <span className="text-sm font-semibold text-red-600">− {fmtGnf(det.penalites)}</span>
                      </div>
                    )}
                    {Number(det.revisionPrix) > 0 && (
                      <div className="flex justify-between items-center py-2 border-b border-gray-100">
                        <span className="text-xs text-gray-400">+ Révision des prix</span>
                        <span className="text-sm font-semibold text-green-600">+ {fmtGnf(det.revisionPrix)}</span>
                      </div>
                    )}
                  </div>

                  {/* NET */}
                  <div className="flex justify-between items-center py-3 mt-2 bg-navy/5 rounded-lg px-3">
                    <span className="text-sm font-black text-navy">= NET À PAYER</span>
                    <span className="text-xl font-black text-navy">{fmtGnf(det.netAPayer)}</span>
                    <div className="flex items-center gap-2 text-xs mt-1">
                      <span className="text-green-600">✓ Payé : {fmtGnf((det as any).dejaPayeGnf ?? "0")}</span>
                      <span className="text-gray-300">|</span>
                      <span className="text-orange-500">Reste : {fmtGnf((det as any).resteAPayerGnf ?? det.netAPayer)}</span>
                      {(det as any).confirmeParBanque && <span className="text-blue-500 ml-1">🔒 Confirmé BCRG</span>}
                    </div>
                  </div>

                  {/* Cumulés */}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                      <p className="text-[10px] text-gray-400">Cumul précédent HT</p>
                      <p className="text-xs font-bold text-gray-600">{fmtGnf(det.cumulPrecedentHtGnf)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                      <p className="text-[10px] text-gray-400">Cumul actuel HT</p>
                      <p className="text-xs font-bold text-navy">{fmtGnf(det.cumulActuelHtGnf)}</p>
                    </div>
                  </div>
                </div>

                {/* Colonne droite : Paramètres + Consommation contrat */}
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Paramètres marché</p>
                  {([
                    ["TVA",                         `${det.marche.tauxTva}%`],
                    ["ARMP (fixe réglementaire)",   "0,6%"],
                    ["Précompte TVA (fixe BCRG)",   "9/118 ≈ 7,63%"],
                    ["Retenue de garantie",         `${det.marche.tauxRetenueGarantie}%`],
                    ["Taux avance de démarrage",    `${det.marche.tauxAvance}%`],
                  ] as [string, string][]).map(([k, v]) => (
                    <div key={k} className="flex justify-between py-2 border-b border-gray-50 text-sm">
                      <span className="text-gray-500 text-xs">{k}</span>
                      <span className="font-bold text-navy text-xs">{v}</span>
                    </div>
                  ))}

                  {det.controleAutoResultats && (
                    <div className="mt-4">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Consommation contrat</p>
                      {([
                        ["Montant contrat TTC", fmtGnf(det.controleAutoResultats.montantContrat)],
                        ["Déjà payé", fmtGnf(det.controleAutoResultats.dejaPaye)],
                        ["Reste à payer", fmtGnf(det.controleAutoResultats.resteContrat)],
                      ] as [string, string][]).map(([k, v]) => (
                        <div key={k} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                          <span className="text-gray-500 text-xs">{k}</span>
                          <span className="font-bold text-navy text-xs">{v}</span>
                        </div>
                      ))}
                      <div className="mt-2 h-4 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, det.controleAutoResultats.tauxConsomme)}%`, background: det.controleAutoResultats.tauxConsomme >= 95 ? "#DC2626" : det.controleAutoResultats.tauxConsomme >= 80 ? "#D97706" : "#16A34A" }} />
                      </div>
                      <p className="text-right text-[10px] text-gray-400 mt-1">{det.controleAutoResultats.tauxConsomme}% consommé</p>
                      {det.controleAutoResultats.alertes.map((a, i) => (
                        <div key={i} className={`mt-2 flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${a.niveau === "CRITIQUE" || a.niveau === "ERREUR" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{a.message}
                        </div>
                      ))}
                    </div>
                  )}
                  <Button size="sm" variant="ghost" className="mt-3 w-full" onClick={() => controlesMut.mutate(det.id)} disabled={controlesMut.isPending}>
                    <RefreshCw className="h-3.5 w-3.5" /> Actualiser les contrôles
                  </Button>
                </div>
              </div>
            )}

            {/* ── TAB 3 PIÈCES ─────────────────────────────────────────────── */}
            {activeTab === 3 && (
              <PiecesJustificatives decompteId={det.id} role={role} />
            )}

            {/* ── TAB 4 VALIDATIONS ─────────────────────────────────────────── */}
            {activeTab === 4 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Validations BPMN</h3>
                  {peutValider && (
                    <Button size="sm" onClick={() => { setValForm({ decision: "APPROUVE", commentaire: "" }); setValModal(true); }}>
                      <ClipboardCheck className="h-3.5 w-3.5" /> Traiter l'étape
                    </Button>
                  )}
                </div>
                {(!validations || (validations as DecompteValidation[]).length === 0) && (
                  <p className="text-sm text-gray-400 text-center py-8">Aucune validation</p>
                )}
                <div className="space-y-3">
                  {(validations as DecompteValidation[] | undefined)?.map((v) => (
                    <div key={v.id} className={`border rounded-lg p-3 ${v.decision === "APPROUVE" ? "border-green-200 bg-green-50" : v.decision === "REJETE" ? "border-red-200 bg-red-50" : "border-orange-200 bg-orange-50"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black px-2 py-0.5 rounded bg-white">{v.etape}</span>
                          <span className={`text-xs font-bold ${v.decision === "APPROUVE" ? "text-green-700" : v.decision === "REJETE" ? "text-red-700" : "text-orange-700"}`}>{v.decision}</span>
                          {v.signatureRef && <span className="text-[10px] text-gray-400 font-mono">#{v.signatureRef.slice(0, 8)}</span>}
                        </div>
                        <span className="text-[10px] text-gray-400">{new Date(v.valideAt).toLocaleString("fr-FR")}</span>
                      </div>
                      <p className="text-sm text-gray-700">{v.commentaire}</p>

                      {/* Cartouche de signature — une pièce comptable doit dire
                          qui a validé, à quel titre, et porter sa signature. */}
                      <div className="mt-2 flex items-end justify-between gap-3 border-t border-white/70 pt-2">
                        <div className="text-xs">
                          <p className="font-semibold text-gray-800">{v.signataire?.nom ?? v.valideNom ?? v.validePar}</p>
                          <p className="text-gray-500">{v.signataire?.fonction ?? v.valideRole}</p>
                        </div>
                        {v.signataire?.signatureUrl
                          ? <img src={v.signataire.signatureUrl} alt="Signature" className="h-12 object-contain" />
                          : <span className="text-[10px] italic text-gray-400">Aucun spécimen de signature déposé</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TAB 5 WORKFLOW ─────────────────────────────────────────────── */}
            {activeTab === 5 && (
              <div>
                <div className="flex items-center gap-0 mb-6 overflow-x-auto pb-2">
                  {BPMN_STEPS.map((step, i, arr) => {
                    const idx = BPMN_STEPS.findIndex((s) => s.key === det.statut);
                    const done = i < idx || det.statut === "PAYE";
                    const active = step.key === det.statut;
                    return (
                      <div key={step.key} className="flex items-center">
                        <div className="flex flex-col items-center min-w-[72px]">
                          <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold border-2 ${active ? "text-white" : done ? "border-green-400 text-green-500" : "border-gray-200 text-gray-300"}`}
                            style={active ? { background: "#1B2A4A", borderColor: "#1B2A4A" } : {}}>
                            {done && !active ? <Check className="h-4 w-4" /> : i + 1}
                          </div>
                          <p className="text-[9px] mt-1 text-gray-500 text-center font-semibold whitespace-nowrap">{step.label}</p>
                          <p className="text-[8px] text-gray-300 text-center whitespace-nowrap">{step.role}</p>
                        </div>
                        {i < arr.length - 1 && <div className={`h-0.5 w-5 mx-0.5 mb-4 ${done ? "bg-green-400" : "bg-gray-200"}`} />}
                      </div>
                    );
                  })}
                </div>
                {wfInst ? (
                  <div className="space-y-3">
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm">
                      <p className="font-bold text-blue-700 text-xs mb-1">Instance active — {(wfInstance as { definition: { nom: string } }).definition?.nom}</p>
                      <p className="text-xs text-blue-500">
                        Étape courante : <strong>{etapeCourante?.nom ?? "—"}</strong> (rôle {etapeCourante?.roleRequis ?? "—"}) — Statut : {wfInst.statut}
                      </p>
                    </div>
                    {peutValider ? (
                      <div className="flex gap-2">
                        <Button onClick={() => { setValForm({ decision: "APPROUVE", commentaire: "" }); setValModal(true); }}>
                          <Check className="h-3.5 w-3.5" /> Approuver
                        </Button>
                        <Button variant="danger" onClick={() => { setValForm({ decision: "REJETE", commentaire: "" }); setValModal(true); }}>
                          <X className="h-3.5 w-3.5" /> Rejeter
                        </Button>
                      </div>
                    ) : wfInst.statut === "EN_COURS" ? (
                      <p className="text-xs text-gray-400 italic">
                        En attente de l'action du rôle {etapeCourante?.roleRequis ?? "—"} — vous n'avez pas la main sur cette étape.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-400">
                    <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Aucune instance workflow active</p>
                    {canWrite(role) && det.statut === "BROUILLON" && (
                      <Button className="mt-3" onClick={() => soumettreWf.mutate(det.id)}>
                        <Send className="h-4 w-4" /> Soumettre au circuit
                      </Button>
                    )}
                  </div>
                )}

              </div>
            )}

            {/* ── TAB 6 PAIEMENT ─────────────────────────────────────────────── */}
            {activeTab === 6 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-700">Circuit de paiement</h3>
                  {(canDaf || canDg) && (
                    <Button size="sm" onClick={() => { setPayForm({ etape: "ORDONNANCEMENT", statut: "EN_ATTENTE" }); setPayModal(true); }}>
                      <Plus className="h-3.5 w-3.5" /> Étape paiement
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-0 mb-5 overflow-x-auto pb-2">
                  {PAYMENT_STEPS.map((step, i, arr) => {
                    const traces = (paymentTraces as PaymentTrace[] ?? []);
                    const trace = traces.find((t) => t.etape === step.key);
                    const done  = trace?.statut === "VALIDE";
                    const active= trace && trace.statut !== "VALIDE";
                    const StepIcon = step.Icon;
                    return (
                      <div key={step.key} className="flex items-center">
                        <div className="flex flex-col items-center min-w-[76px]">
                          <div className={`h-9 w-9 rounded-full flex items-center justify-center border-2 ${done ? "bg-green-500 border-green-500 text-white" : active ? "bg-amber-100 border-amber-400 text-amber-600" : "border-gray-200 text-gray-300"}`}>
                            {done ? <Check className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
                          </div>
                          <p className="text-[9px] mt-1 font-semibold text-gray-500 text-center">{step.label}</p>
                          {trace?.reference && <p className="text-[8px] text-gray-400 font-mono">{trace.reference}</p>}
                        </div>
                        {i < arr.length - 1 && <div className={`h-0.5 w-5 mx-0.5 mb-5 ${done ? "bg-green-400" : "bg-gray-200"}`} />}
                      </div>
                    );
                  })}
                </div>
                {(paymentTraces as PaymentTrace[] ?? []).length === 0 ? (
                  <div className="text-center py-6 text-gray-400">
                    <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Aucun mouvement de paiement enregistré</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(paymentTraces as PaymentTrace[]).map((t) => (
                      <div key={t.id} className={`flex items-start gap-3 rounded-lg px-4 py-3 border text-sm ${t.statut === "VALIDE" ? "bg-green-50 border-green-200" : t.statut === "REJETE" ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold">{t.etape}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${t.statut === "VALIDE" ? "bg-green-100 text-green-700" : t.statut === "REJETE" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{t.statut}</span>
                            {t.reference && <span className="text-xs font-mono text-gray-500">N°{t.reference}</span>}
                          </div>
                          {t.montantGnf && <p className="text-xs"><strong>{fmtGnf(t.montantGnf)}</strong></p>}
                          {t.operateurNom && <p className="text-xs text-gray-500">Par : {t.operateurNom}</p>}
                          {t.banqueReference && <p className="text-xs text-gray-500">Banque : {t.banqueReference}</p>}
                          {t.observations && <p className="text-xs text-gray-400 mt-1">{t.observations}</p>}
                        </div>
                        <div className="text-right text-xs text-gray-400">
                          {t.dateTransmission && <p>Transmis : {new Date(t.dateTransmission).toLocaleDateString("fr-FR")}</p>}
                          {t.dateValidation && <p className="text-green-600">Validé : {new Date(t.dateValidation).toLocaleDateString("fr-FR")}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 p-4 bg-navy/5 rounded-xl flex items-center justify-between">
                  <span className="font-semibold text-gray-700 text-sm">Net à payer certifié</span>
                  <span className="text-xl font-black text-navy">{fmtGnf(det.netAPayer)}</span>
                    <div className="flex items-center gap-2 text-xs mt-1">
                      <span className="text-green-600">✓ Payé : {fmtGnf((det as any).dejaPayeGnf ?? "0")}</span>
                      <span className="text-gray-300">|</span>
                      <span className="text-orange-500">Reste : {fmtGnf((det as any).resteAPayerGnf ?? det.netAPayer)}</span>
                      {(det as any).confirmeParBanque && <span className="text-blue-500 ml-1">🔒 Confirmé BCRG</span>}
                    </div>
                </div>
              </div>
            )}

            {/* ── TAB 7 AUDIT ───────────────────────────────────────────────── */}
            {activeTab === 7 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Journal d'audit complet</h3>
                {(!auditLogs || (auditLogs as unknown[]).length === 0) && (
                  <p className="text-sm text-gray-400 text-center py-8">Aucun événement d'audit</p>
                )}
                <div className="space-y-1.5">
                  {(auditLogs as Array<{ id: string; action: string; createdAt: string; user?: { nomComplet: string; role: string }; ipAddress?: string }> ?? []).map((log) => (
                    <div key={log.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg text-xs">
                      <span className={`px-2 py-0.5 rounded font-bold whitespace-nowrap ${log.action === "CREATE" ? "bg-green-100 text-green-700" : log.action === "APPROVE" ? "bg-blue-100 text-blue-700" : log.action === "DELETE" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>{log.action}</span>
                      <span className="text-gray-600 flex-1">{log.user?.nomComplet ?? "Système"}{log.user?.role ? ` (${log.user.role})` : ""}</span>
                      <span className="text-gray-400">{new Date(log.createdAt).toLocaleString("fr-FR")}</span>
                      {log.ipAddress && <span className="text-gray-300 font-mono text-[10px]">{log.ipAddress}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TAB 8 HISTORIQUE / COMMENTAIRES ───────────────────────────── */}
            {activeTab === 8 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Échanges & commentaires</h3>
                <div className="space-y-2 mb-4">
                  {(commentaires as DecompteCommentaire[] | undefined)?.map((c) => (
                    <div key={c.id} className="flex gap-3">
                      <div className="h-8 w-8 rounded-full bg-navy/10 text-navy flex items-center justify-center text-xs font-bold shrink-0">{(c.auteurNom ?? "?")[0]}</div>
                      <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-semibold text-gray-700">{c.auteurNom ?? "—"}</span>
                          <span className="text-[10px] text-gray-400">{c.auteurRole}</span>
                          <span className={`text-[10px] px-1.5 rounded ml-1 ${c.type === "CORRECTION" ? "bg-red-100 text-red-600" : c.type === "ALERTE" ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-500"}`}>{c.type}</span>
                          <span className="text-[10px] text-gray-300 ml-auto">{new Date(c.createdAt).toLocaleString("fr-FR")}</span>
                        </div>
                        <p className="text-sm text-gray-700">{c.contenu}</p>
                      </div>
                    </div>
                  ))}
                  {(!commentaires || (commentaires as DecompteCommentaire[]).length === 0) && (
                    <p className="text-sm text-gray-400 text-center py-6">Aucun commentaire</p>
                  )}
                </div>
                <div className="border-t pt-3">
                  <div className="flex gap-2 mb-2">
                    <Select className="w-40" value={commentType} onChange={(e) => setCommentType(e.target.value)}>
                      {["COMMENTAIRE","CORRECTION","INFORMATION","ALERTE"].map((t) => <option key={t}>{t}</option>)}
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Textarea className="flex-1" rows={2} value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Commentaire..." />
                    <Button onClick={() => commMut.mutate({ contenu: commentText, type: commentType })} disabled={commMut.isPending || commentText.trim().length < 2}>
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 9 && (
              <div className="space-y-5">
                <p className="text-xs text-gray-500">
                  Les attachements constatent les quantités réellement exécutées. Ceux du décompte
                  consulté en constituent la base de calcul ; les antérieurs donnent le cumul déjà
                  attaché sur le marché.
                </p>

                <ListeAttachements
                  titre="Attachements de ce décompte"
                  vide="Aucun attachement rattaché à ce décompte."
                  lignes={(attCourants?.data ?? []) as AttachementLigne[]}
                />

                <ListeAttachements
                  titre="Attachements antérieurs du marché"
                  vide="Aucun attachement sur les autres décomptes de ce marché."
                  lignes={(attAnterieurs?.data ?? []) as AttachementLigne[]}
                  montrerDecompte
                />
              </div>
            )}

          </div>
        )}
      </Modal>

      {/* ===== MODAL CRÉER DÉCOMPTE ===== */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Nouveau e-Décompte" size="lg">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Marché actif *">
            <Select value={String(form.marcheId ?? "")} onChange={(e) => {
              const m = (marches ?? []).find((x: MarcheRef) => x.id === e.target.value) as MarcheRef | undefined;
              setForm({ ...form, marcheId: e.target.value, entrepriseId: m?.entreprise.id ?? "" });
            }}>
              <option value="">Sélectionner...</option>
              {(marches ?? []).map((m: MarcheRef) => <option key={m.id} value={m.id}>{m.reference} — {m.intitule}</option>)}
            </Select>
          </FormField>
          <FormField label="Type *">
            <Select value={String(form.type ?? "")} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="">Sélectionner...</option>
              {TYPE_OPT.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </FormField>
          <FormField label="Période début"><Input type="date" value={String(form.periodeDebut ?? "")} onChange={(e) => setForm({ ...form, periodeDebut: e.target.value })} /></FormField>
          <FormField label="Période fin"><Input type="date" value={String(form.periodeFin ?? "")} onChange={(e) => setForm({ ...form, periodeFin: e.target.value })} /></FormField>
          <FormField label="Montant brut HT période (GNF) *">
            <Input type="number" value={String(form.montantPeriodeHtGnf ?? "")} onChange={(e) => setForm({ ...form, montantPeriodeHtGnf: parseInt(e.target.value) })} />
          </FormField>
          <FormField label="Cumul précédent HT (GNF)">
            <Input type="number" value={String(form.cumulPrecedentHtGnf ?? "0")} onChange={(e) => setForm({ ...form, cumulPrecedentHtGnf: parseInt(e.target.value) })} />
          </FormField>
          <FormField label="Pénalités (GNF)">
            <Input type="number" value={String(form.penalites ?? "0")} onChange={(e) => setForm({ ...form, penalites: parseInt(e.target.value) })} />
          </FormField>
          <FormField label="Révision des prix (GNF)">
            <Input type="number" value={String(form.revisionPrix ?? "0")} onChange={(e) => setForm({ ...form, revisionPrix: parseInt(e.target.value) })} />
          </FormField>
        </div>
        {Number(form.montantPeriodeHtGnf ?? 0) > 0 && (
          <div className="mt-3 bg-navy/5 rounded-xl p-4">
            <p className="text-xs font-black text-navy mb-2">Aperçu calcul automatique</p>
            <div className="grid grid-cols-4 gap-2 text-xs">
              {([["+ TVA", calcPreview.tva], ["− Retenue", calcPreview.retenue], ["− Avance", calcPreview.avance], ["= NET", calcPreview.net]] as [string, number][]).map(([k, v]) => (
                <div key={k} className="bg-white rounded-lg p-2 text-center">
                  <p className="text-gray-400 text-[10px]">{k}</p>
                  <p className="font-black text-navy text-sm">{fmtGnf(v)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        <FormField label="Observations" className="mt-3">
          <Textarea rows={2} value={String(form.observations ?? "")} onChange={(e) => setForm({ ...form, observations: e.target.value })} />
        </FormField>
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
          <Button variant="secondary" onClick={() => setCreateModal(false)}>Annuler</Button>
          <Button onClick={() => createMut.mutate(form)} disabled={createMut.isPending || !form.marcheId || !form.type}>
            {createMut.isPending ? "Création..." : "Créer le décompte"}
          </Button>
        </div>
      </Modal>

      {/* ===== MODAL AJOUTER LIGNE BPU ===== */}
      <Modal open={addLigneModal} onClose={() => setAddLigneModal(false)} title="Ajouter une ligne BPU" size="md">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Code article *"><Input value={String(ligneForm.codeArticle ?? "")} onChange={(e) => setLigneForm({ ...ligneForm, codeArticle: e.target.value })} placeholder="A.1.2" /></FormField>
          <FormField label="Unité *"><Input value={String(ligneForm.unite ?? "")} onChange={(e) => setLigneForm({ ...ligneForm, unite: e.target.value })} /></FormField>
        </div>
        <FormField label="Désignation *"><Input value={String(ligneForm.designation ?? "")} onChange={(e) => setLigneForm({ ...ligneForm, designation: e.target.value })} /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Qté contrat *"><Input type="number" value={String(ligneForm.quantiteContrat ?? "")} onChange={(e) => setLigneForm({ ...ligneForm, quantiteContrat: parseFloat(e.target.value) })} /></FormField>
          <FormField label="Qté précédent"><Input type="number" value={String(ligneForm.quantitePrecedent ?? "0")} onChange={(e) => setLigneForm({ ...ligneForm, quantitePrecedent: parseFloat(e.target.value) })} /></FormField>
          <FormField label="Qté courante *"><Input type="number" value={String(ligneForm.quantiteCourante ?? "")} onChange={(e) => setLigneForm({ ...ligneForm, quantiteCourante: parseFloat(e.target.value) })} /></FormField>
          <FormField label="Prix unitaire (GNF) *"><Input type="number" value={String(ligneForm.prixUnitaire ?? "")} onChange={(e) => setLigneForm({ ...ligneForm, prixUnitaire: parseFloat(e.target.value) })} /></FormField>
          <FormField label={`Taux TVA (défaut : ${det?.marche.tauxTva ?? 18}%)`}><Input type="number" step="0.1" value={String(ligneForm.tauxTva ?? det?.marche.tauxTva ?? 18)} onChange={(e) => setLigneForm({ ...ligneForm, tauxTva: parseFloat(e.target.value) })} /></FormField>
          <FormField label={`Taux RG (défaut : ${det?.marche.tauxRetenueGarantie ?? 5}%)`}><Input type="number" step="0.1" value={String(ligneForm.tauxRetenue ?? det?.marche.tauxRetenueGarantie ?? 5)} onChange={(e) => setLigneForm({ ...ligneForm, tauxRetenue: parseFloat(e.target.value) })} /></FormField>
        </div>
        {Boolean(ligneForm.quantiteCourante) && Boolean(ligneForm.prixUnitaire) && (
          <div className="mt-2 bg-navy/5 rounded-lg p-3 text-xs">
            {(() => {
              const brut = Number(ligneForm.quantiteCourante) * Number(ligneForm.prixUnitaire);
              const tva  = Math.round(brut * Number(ligneForm.tauxTva ?? det?.marche.tauxTva ?? 18) / 100);
              const rg   = Math.round(brut * Number(ligneForm.tauxRetenue ?? det?.marche.tauxRetenueGarantie ?? 5) / 100);
              return (
                <div className="flex gap-6">
                  {([["Brut", brut], ["TVA", tva], ["−RG", rg], ["Net", brut + tva - rg]] as [string, number][]).map(([k, v]) => (
                    <div key={k}><p className="text-gray-400">{k}</p><p className="font-bold text-navy">{fmtGnf(v)}</p></div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setAddLigneModal(false)}>Annuler</Button>
          <Button onClick={() => addLigneMut.mutate({ ...ligneForm, tauxTva: ligneForm.tauxTva ?? det?.marche.tauxTva, tauxRetenue: ligneForm.tauxRetenue ?? det?.marche.tauxRetenueGarantie })}
            disabled={addLigneMut.isPending || !ligneForm.codeArticle || !ligneForm.quantiteCourante || !ligneForm.prixUnitaire}>
            {addLigneMut.isPending ? "Ajout..." : "Ajouter la ligne"}
          </Button>
        </div>
      </Modal>

      {/* ===== MODAL VALIDATION BPMN ===== */}
      {signatureModal && detailId && (
        <SignatureDocumentModal decompteId={detailId} onClose={() => setSignatureModal(false)} onSigne={() => qc.invalidateQueries()} />
      )}

      <Modal open={valModal} onClose={() => setValModal(false)} title={`Traiter — étape ${etapeCourante?.nom ?? ""}`} size="sm">
        <div className="space-y-3">
          <div className="bg-navy/5 rounded-lg px-3 py-2 text-xs">
            <span className="text-gray-500">Étape courante : </span>
            <span className="font-bold text-navy">{etapeCourante?.nom ?? "—"}</span>
            <span className="text-gray-400 ml-1">(rôle {etapeCourante?.roleRequis ?? "—"})</span>
          </div>
          <FormField label="Décision">
            <Select value={String(valForm.decision ?? "APPROUVE")} onChange={(e) => setValForm({ ...valForm, decision: e.target.value })}>
              <option value="APPROUVE">Approuver — transmettre à l'étape suivante</option>
              <option value="REJETE">Rejeter</option>
              <option value="DEMANDE_CORRECTION">Demander correction</option>
              <option value="DEMANDE_COMPLEMENT">Demander complément</option>
            </Select>
          </FormField>
          <FormField label={String(valForm.decision) === "APPROUVE" ? "Commentaire (min 5 caractères)" : "Motif obligatoire *"}>
            <Textarea rows={3} value={String(valForm.commentaire ?? "")} onChange={(e) => setValForm({ ...valForm, commentaire: e.target.value })} placeholder="Commentaire obligatoire (min 5 caractères)..." />
          </FormField>
          <FormField label="Réf. signature (optionnel)">
            <Input value={String(valForm.signatureRef ?? "")} onChange={(e) => setValForm({ ...valForm, signatureRef: e.target.value })} placeholder="SIG-AGEROUTE-XXXX" />
          </FormField>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setValModal(false)}>Annuler</Button>
          <Button variant={String(valForm.decision) === "REJETE" ? "danger" : "primary"}
            onClick={() => valMut.mutate(valForm)} disabled={valMut.isPending || String(valForm.commentaire ?? "").trim().length < 5}>
            {valMut.isPending ? "Enregistrement..." : "Confirmer"}
          </Button>
        </div>
      </Modal>

      {/* ===== MODAL PAYMENT TRACE ===== */}
      <Modal open={payModal} onClose={() => setPayModal(false)} title="Étape du circuit de paiement" size="sm">
        <div className="space-y-3">
          <FormField label="Étape">
            <Select value={String(payForm.etape ?? "ORDONNANCEMENT")} onChange={(e) => setPayForm({ ...payForm, etape: e.target.value })}>
              {PAYMENT_STEPS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </FormField>
          <FormField label="Statut">
            <Select value={String(payForm.statut ?? "EN_ATTENTE")} onChange={(e) => setPayForm({ ...payForm, statut: e.target.value })}>
              {["EN_ATTENTE","EN_COURS","VALIDE","REJETE"].map((s) => <option key={s}>{s}</option>)}
            </Select>
          </FormField>
          <FormField label="N° référence"><Input value={String(payForm.reference ?? "")} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} placeholder="ORD-2026-XXXX" /></FormField>
          <FormField label="Montant (GNF)"><Input type="number" value={String(payForm.montantGnf ?? "")} onChange={(e) => setPayForm({ ...payForm, montantGnf: parseInt(e.target.value) })} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date transmission"><Input type="date" value={String(payForm.dateTransmission ?? "")} onChange={(e) => setPayForm({ ...payForm, dateTransmission: e.target.value })} /></FormField>
            <FormField label="Date validation"><Input type="date" value={String(payForm.dateValidation ?? "")} onChange={(e) => setPayForm({ ...payForm, dateValidation: e.target.value })} /></FormField>
          </div>
          <FormField label="Opérateur"><Input value={String(payForm.operateurNom ?? "")} onChange={(e) => setPayForm({ ...payForm, operateurNom: e.target.value })} /></FormField>
          <FormField label="Référence bancaire"><Input value={String(payForm.banqueReference ?? "")} onChange={(e) => setPayForm({ ...payForm, banqueReference: e.target.value })} /></FormField>
          <FormField label="Observations"><Textarea rows={2} value={String(payForm.observations ?? "")} onChange={(e) => setPayForm({ ...payForm, observations: e.target.value })} /></FormField>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setPayModal(false)}>Annuler</Button>
          <Button onClick={() => payMut.mutate(payForm)} disabled={payMut.isPending}>
            {payMut.isPending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </Modal>

    </div>
  );
}

// ─── Attachements rattachés à un décompte ────────────────────────────────────
export interface AttachementLigne {
  id: string;
  code?: string | null;
  reference?: string | null;
  typeAttachement?: string | null;
  statut: string;
  periodeDebut?: string | null;
  periodeFin?: string | null;
  montantTotalGnf?: string | number | null;
  createdAt?: string | null;
  decompte?: { reference?: string | null } | null;
}

/**
 * Liste compacte d'attachements. Utilisée deux fois dans le détail d'un
 * décompte : les siens, puis ceux des décomptes antérieurs du même marché.
 */
function ListeAttachements({
  titre, vide, lignes, montrerDecompte = false,
}: {
  titre: string; vide: string; lignes: AttachementLigne[]; montrerDecompte?: boolean;
}) {
  const periode = (a: AttachementLigne) =>
    a.periodeDebut || a.periodeFin
      ? `${a.periodeDebut ? new Date(a.periodeDebut).toLocaleDateString("fr-FR") : "—"} → ${a.periodeFin ? new Date(a.periodeFin).toLocaleDateString("fr-FR") : "—"}`
      : "—";

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-700">
        {titre} <span className="font-normal text-gray-400">({lignes.length})</span>
      </h3>
      {lignes.length === 0 ? (
        <p className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-500">{vide}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Référence</th>
                {montrerDecompte && <th className="px-3 py-2 font-medium">Décompte</th>}
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Période</th>
                <th className="px-3 py-2 text-right font-medium">Montant</th>
                <th className="px-3 py-2 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lignes.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-navy">{a.code ?? a.reference ?? a.id.slice(0, 8)}</td>
                  {montrerDecompte && <td className="px-3 py-2 font-mono text-gray-500">{a.decompte?.reference ?? "—"}</td>}
                  <td className="px-3 py-2">{a.typeAttachement ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-500">{periode(a)}</td>
                  <td className="px-3 py-2 text-right font-medium">{a.montantTotalGnf != null ? fmtGnf(a.montantTotalGnf) : "—"}</td>
                  <td className="px-3 py-2"><StatutBadge statut={a.statut} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Pièces justificatives : de vrais fichiers ───────────────────────────────
interface PieceDocument {
  id: string; nom: string; url: string; mimeType?: string | null;
  tailleOctets?: number | null; version: number; createdAt: string;
  statutValidation: "DEPOSE" | "VALIDE" | "RETOURNE";
  motifRetour?: string | null; valideAt?: string | null;
  deposePar?: string | null; roleDeposant?: string | null;
}
interface PieceNature {
  cle: string; libelle: string; requis: boolean;
  fourni: boolean; documents: PieceDocument[];
}

/**
 * Bordereau des pièces du dossier.
 *
 * Auparavant l'onglet n'affichait que des cases à cocher : on déclarait qu'une
 * facture existait sans jamais la fournir. Chaque nature accepte désormais un
 * fichier, qui reste attaché au décompte et suit le dossier jusqu'au paiement.
 * Déposer une pièce déjà pourvue crée une nouvelle version — l'ancienne reste
 * consultable, une pièce justificative ne s'écrase pas.
 */
function PiecesJustificatives({ decompteId, role }: { decompteId: string; role?: string | null }) {
  const qc = useQueryClient();
  const [depotPour, setDepotPour] = useState<PieceNature | null>(null);
  const [retourPour, setRetourPour] = useState<PieceDocument | null>(null);
  const [motif, setMotif] = useState("");

  // L'entreprise titulaire dépose ses justificatifs ; la Mission de contrôle et
  // la Direction Technique les valident ou les retournent à corriger.
  const peutDeposer = role === "ENTREPRISE" || role === "ADMIN";
  const peutControler = ["MISSION", "TECHNIQUE", "DMC", "ADMIN"].includes(role ?? "");

  const { data, isLoading } = useQuery<{ pieces: PieceNature[]; requisFournis: number; requisTotal: number; fournis: number }>({
    queryKey: ["decompte-pieces", decompteId],
    queryFn: () => api.get(`/decomptes/${decompteId}/documents`).then((r) => r.data),
  });

  const rattacher = useMutation({
    mutationFn: (corps: object) => api.post(`/decomptes/${decompteId}/documents`, corps),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decompte-pieces", decompteId] });
      qc.invalidateQueries({ queryKey: ["decomptes"] });
      toast.success("Pièce déposée");
      setDepotPour(null);
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const valider = useMutation({
    mutationFn: (documentId: string) => api.post(`/decomptes/${decompteId}/documents/${documentId}/valider`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["decompte-pieces", decompteId] }); toast.success("Pièce validée"); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const retourner = useMutation({
    mutationFn: ({ documentId, motif }: { documentId: string; motif: string }) =>
      api.post(`/decomptes/${decompteId}/documents/${documentId}/retourner`, { motif }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decompte-pieces", decompteId] });
      toast.success("Pièce retournée à l'entreprise");
      setRetourPour(null); setMotif("");
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const retirer = useMutation({
    mutationFn: (documentId: string) => api.delete(`/decomptes/${decompteId}/documents/${documentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decompte-pieces", decompteId] });
      toast.success("Pièce retirée du dossier — elle reste archivée");
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  if (isLoading) return <p className="text-sm text-gray-500">Chargement des pièces…</p>;

  const pieces = data?.pieces ?? [];
  const complet = (data?.requisFournis ?? 0) === (data?.requisTotal ?? 0);

  return (
    <div>
      <div className={`mb-4 flex items-center gap-3 rounded-lg border px-4 py-3 ${complet ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
        {complet ? <CheckCircle className="h-5 w-5 text-green-500" /> : <AlertTriangle className="h-5 w-5 text-red-500" />}
        <div>
          <p className={`text-sm font-semibold ${complet ? "text-green-700" : "text-red-700"}`}>
            {data?.requisFournis ?? 0}/{data?.requisTotal ?? 0} pièces obligatoires fournies
          </p>
          <p className="text-xs text-gray-500">{data?.fournis ?? 0}/{pieces.length} au total — les pièces accompagnent le dossier jusqu'au paiement</p>
        </div>
      </div>

      <div className="space-y-2">
        {pieces.map((p) => (
          <div key={p.cle} className={`rounded-lg border px-4 py-3 ${p.fourni ? "border-green-200 bg-green-50" : p.requis ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {p.fourni ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-400" />}
                <span className="text-sm font-medium text-gray-700">{p.libelle}</span>
                {!p.requis && <span className="text-xs text-gray-400">(si applicable)</span>}
                {p.requis && !p.fourni && <span className="text-xs font-bold text-red-600">REQUIS</span>}
              </div>
              {peutDeposer ? (
                <Button size="sm" variant={p.fourni ? "secondary" : "primary"} onClick={() => setDepotPour(p)}>
                  <Upload className="h-3.5 w-3.5" /> {p.fourni ? "Nouvelle version" : "Déposer"}
                </Button>
              ) : peutControler && !p.fourni ? (
                <span className="text-xs text-gray-400">En attente de l'entreprise</span>
              ) : null}
            </div>

            {p.documents.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-white/60 pt-2">
                {p.documents.map((d) => (
                  <li key={d.id} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <a href={d.url} target="_blank" rel="noreferrer" className="truncate font-medium text-navy hover:underline" title={d.nom}>
                        {d.nom} <span className="font-normal text-gray-400">v{d.version}</span>
                      </a>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge
                          label={d.statutValidation === "VALIDE" ? "Validée" : d.statutValidation === "RETOURNE" ? "Retournée" : "Déposée"}
                          color={d.statutValidation === "VALIDE" ? "green" : d.statutValidation === "RETOURNE" ? "red" : "blue"}
                        />
                        <span className="text-gray-500">
                          {d.deposePar ?? "—"}{d.roleDeposant && ` (${d.roleDeposant})`} · {new Date(d.createdAt).toLocaleDateString("fr-FR")}
                        </span>
                        {peutControler && d.statutValidation !== "VALIDE" && (
                          <Button size="sm" variant="ghost" title="Valider cette pièce" onClick={() => valider.mutate(d.id)}>
                            <Check className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                        )}
                        {peutControler && d.statutValidation !== "RETOURNE" && (
                          <Button size="sm" variant="ghost" title="Retourner à l'entreprise" onClick={() => setRetourPour(d)}>
                            <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                          </Button>
                        )}
                        {peutDeposer && (
                          <button className="text-red-300 hover:text-red-500" title="Retirer du dossier" onClick={() => retirer.mutate(d.id)}>
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    {d.statutValidation === "RETOURNE" && d.motifRetour && (
                      <p className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
                        À corriger : {d.motifRetour}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <Modal open={Boolean(retourPour)} onClose={() => { setRetourPour(null); setMotif(""); }} title="Retourner la pièce à l'entreprise">
        <div className="space-y-3 p-4">
          <p className="text-sm text-gray-600">
            L'entreprise devra déposer une nouvelle version. Indiquez précisément ce qui doit être corrigé :
            le motif lui est communiqué et reste dans la piste d'audit.
          </p>
          <Textarea rows={3} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Facture non signée, montant différent du décompte…" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setRetourPour(null); setMotif(""); }}>Annuler</Button>
            <Button
              disabled={motif.trim().length < 10 || retourner.isPending}
              onClick={() => retourPour && retourner.mutate({ documentId: retourPour.id, motif })}
            >
              <RotateCcw className="h-4 w-4" /> Retourner
            </Button>
          </div>
          {motif.trim().length > 0 && motif.trim().length < 10 && (
            <p className="text-xs text-amber-700">Le motif doit compter au moins 10 caractères.</p>
          )}
        </div>
      </Modal>

      <FileUploadModal
        open={Boolean(depotPour)}
        onClose={() => setDepotPour(null)}
        title={depotPour ? `Déposer — ${depotPour.libelle}` : "Déposer une pièce"}
        onFileUploaded={(url, nom) => {
          if (depotPour) rattacher.mutate({ type: depotPour.cle, nom, url });
        }}
      />
    </div>
  );
}
