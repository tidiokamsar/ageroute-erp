/**
 * Portail Entreprise — AGEROUTE Guinée
 * Refonte complète : données réelles, statuts cohérents, UI moderne
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError } from "../lib/api";
import { toast } from "../components/ui/Toast";
import { useAuth, authStore } from "../lib/auth";
import { FileUploadModal } from "../components/ui/FileUploadModal";
import { SecureFileLink } from "../components/ui/SecureFile";

// ─── ICÔNES (HeroIcons inline SVG léger) ─────────────────────────────────────
const IC = {
  building:    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>,
  chartBar:    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>,
  document:    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>,
  banknote:    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>,
  shield:      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>,
  clock:       <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>,
  check:       <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>,
  plus:        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>,
  eye:         <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>,
  logout:      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" /></svg>,
  spin:        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>,
  warn:        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>,
  tag:         <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /></svg>,
  arrow:       <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>,
  workflow:    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" /></svg>,
  paperclip:   <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01a5 5 0 0 1-7.072-7.073" /></svg>,
};

// ─── TYPES ───────────────────────────────────────────────────────────────────
const STATUTS_ACTIFS_MARCHE = ["SIGNE","NOTIFIE","EN_EXECUTION","EN_AVENANT","EN_RECEPTION_PROVISOIRE","ACTIF"];
const STATUTS_EN_COURS_DECOMPTE = ["SOUMIS","EN_CONTROLE","EN_CORRECTION","EN_VALIDATION","VISA_DAF","VISA_DG","VALIDE_DG","EN_CIRCUIT_FINANCIER","ORDONNANCE"];

const MARCHE_STATUT_CFG: Record<string, {label:string;color:string;bg:string}> = {
  SIGNE:                    { label:"Signé",               color:"#16A34A", bg:"#DCFCE7" },
  NOTIFIE:                  { label:"Notifié",             color:"#2563EB", bg:"#DBEAFE" },
  EN_EXECUTION:             { label:"En exécution",        color:"#0891B2", bg:"#CFFAFE" },
  EN_AVENANT:               { label:"En avenant",          color:"#7C3AED", bg:"#EDE9FE" },
  EN_RECEPTION_PROVISOIRE:  { label:"Réception provisoire",color:"#D97706", bg:"#FEF3C7" },
  EN_RECEPTION_DEFINITIVE:  { label:"Réception définitive",color:"#15803D", bg:"#DCFCE7" },
  SOLDE:                    { label:"Soldé",               color:"#6B7280", bg:"#F3F4F6" },
  RESILIE:                  { label:"Résilié",             color:"#DC2626", bg:"#FEE2E2" },
  SUSPENDU:                 { label:"Suspendu",            color:"#F59E0B", bg:"#FEF3C7" },
  CLOTURE:                  { label:"Clôturé",             color:"#6B7280", bg:"#F3F4F6" },
};

const DECOMPTE_STATUT_CFG: Record<string, {label:string;color:string;bg:string}> = {
  BROUILLON:           { label:"Brouillon",        color:"#9CA3AF", bg:"#F9FAFB" },
  SOUMIS:              { label:"Soumis",           color:"#2563EB", bg:"#DBEAFE" },
  EN_CONTROLE:         { label:"En contrôle",      color:"#7C3AED", bg:"#EDE9FE" },
  EN_CORRECTION:       { label:"En correction",    color:"#F59E0B", bg:"#FEF3C7" },
  EN_VALIDATION:       { label:"En validation",    color:"#0891B2", bg:"#CFFAFE" },
  VISA_DAF:            { label:"Visa DAF",         color:"#D97706", bg:"#FEF3C7" },
  VISA_DG:             { label:"Visa DG",          color:"#B45309", bg:"#FEF9C3" },
  VALIDE_DG:           { label:"Validé DG",        color:"#16A34A", bg:"#DCFCE7" },
  EN_CIRCUIT_FINANCIER:{ label:"Validation financière",color:"#0369A1", bg:"#BAE6FD" },
  ORDONNANCE:          { label:"Ordonnancé",       color:"#0369A1", bg:"#BAE6FD" },
  PAYE:                { label:"Payé",             color:"#15803D", bg:"#DCFCE7" },
  REJETE:              { label:"Rejeté",           color:"#DC2626", bg:"#FEE2E2" },
  VALIDE:              { label:"Validé",           color:"#16A34A", bg:"#DCFCE7" },
};

function fmtGnf(v: unknown): string {
  const n = Number(v ?? 0);
  if (!n) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Mrd GNF`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} M GNF`;
  return `${n.toLocaleString("fr-FR")} GNF`;
}
function fmtDate(d: unknown): string {
  if (!d) return "—";
  return new Date(String(d)).toLocaleDateString("fr-FR", { day:"2-digit", month:"short", year:"numeric" });
}
function pct(v: number, total: number) { return total > 0 ? Math.min(100, Math.round(v * 100 / total)) : 0; }

function StatutBadge({ statut, cfg }: { statut: string; cfg: Record<string, {label:string;color:string;bg:string}> }) {
  const c = cfg[statut] ?? { label: statut, color: "#6B7280", bg: "#F3F4F6" };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ color: c.color, background: c.bg }}>
      {c.label}
    </span>
  );
}

// ─── KPI CARD ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = "#1B2A4A", bg = "#EFF6FF", icon }:
  { label: string; value: string | number; sub?: string; color?: string; bg?: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-2 border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: bg, color }}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-black" style={{ color }}>{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────
function ProgressBar({ value, max, color = "#2563eb" }: { value: number; max: number; color?: string }) {
  const p = pct(value, max);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${p}%`, background: color }} />
      </div>
      <span className="text-xs font-bold text-gray-600 w-8 text-right">{p}%</span>
    </div>
  );
}

// ─── TYPES DONNÉES ────────────────────────────────────────────────────────────
interface Marche {
  id: string; reference: string; intitule: string; statut: string;
  montantInitialGnf: string; montantActualiseGnf: string;
  dateOs: string | null; dateFinPrevue: string | null; delaiMois: number | null;
  financement: string; type: string;
  _count: { decomptes: number };
  projet: { code: string; intitule: string; region: string | null } | null;
}
interface Decompte {
  id: string; reference: string; type: string; statut: string;
  montantPeriodeHtGnf: string; cumulActuelHtGnf: string;
  tva: string; retenueGarantie: string; netAPayer: string;
  createdAt: string; observations: string | null;
  marche: { id: string; reference: string; intitule: string; montantInitialGnf: string } | null;
  // L'étape venait des tables BPMN, vides depuis toujours : la colonne « Étape »
  // affichait « — » pour tous les décomptes, y compris ceux en cours de contrôle.
  // Elle vient désormais du circuit réel.
  etapeCourante: { circuit: string; etape: string; role: string; position: string } | null;
  nbPieces?: number;
  peutEtreEnvoye?: boolean;
}
interface Garantie {
  id: string; marcheId: string; type: string; montantGnf: string;
  dateExpiration: string | null; banque: string | null; reference: string | null;
  active: boolean; appelGarantie: boolean;
}
interface Paiement {
  id: string; montantGnf: string; dateOrdre: string | null; dateExecution: string | null;
  statut: string; reference: string | null; decompte: { reference: string } | null;
}
interface Profil {
  id: string; raisonSociale: string; sigle: string | null; nif: string;
  statut: string; scoreConformite: number; telephone: string | null; email: string | null;
  agrement: string | null; dirigeant: string | null; adresse: string | null;
  alertes: Array<{ id: string; message: string; niveau: string }>;
}

type TypePieceDecompte = "DECOMPTE" | "ATTACHEMENT" | "FACTURE" | "RAPPORT_AVANCEMENT" | "PHOTO" | "PV";

interface LigneDecompteForm {
  designation: string;
  unite: string;
  quantite: number;
  prixUnitaire: number;
  montantBrut: number;
}

interface PieceDecompteForm {
  type: TypePieceDecompte;
  nom: string;
  cheminFichier: string;
  mimeType: string;
  tailleOctets: number;
  legende: string;
}

interface UploadResponse {
  url: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
}

// Repli local si l'API du référentiel est indisponible — la SOURCE est
// /api/pieces-obligatoires (lib/pieces-obligatoires.ts côté serveur).
const TYPES_PIECE_REPLI: Array<{ value: TypePieceDecompte; label: string; required: boolean }> = [
  { value: "DECOMPTE", label: "Décompte signé", required: true },
  { value: "ATTACHEMENT", label: "Attachements validés", required: true },
  { value: "FACTURE", label: "Facture", required: true },
  { value: "RAPPORT_AVANCEMENT", label: "Rapport d’avancement", required: true },
  { value: "PHOTO", label: "Photos de chantier", required: false },
  { value: "PV", label: "PV contradictoire", required: false },
];

const ALLOWED_PIECE_TYPES = new Set([
  "application/pdf", "image/jpeg", "image/png",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

type Tab = "dashboard" | "marches" | "decomptes" | "attachements" | "paiements" | "garanties" | "receptions" | "deposer";
const TABS_VALIDES: Tab[] = ["dashboard", "marches", "decomptes", "attachements", "paiements", "garanties", "receptions", "deposer"];

// ─── FORMULAIRE DÉPÔT ─────────────────────────────────────────────────────────
function DeposerForm({ marches, onSuccess }: { marches: Marche[]; onSuccess: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    marcheId: "",
    type: "PARTIEL",
    observations: "",
    lignes: [] as LigneDecompteForm[],
    pieces: [] as PieceDecompteForm[],
  });
  const [uploadingPiece, setUploadingPiece] = useState<TypePieceDecompte | null>(null);

  async function uploadPiece(type: TypePieceDecompte, file: File | null) {
    if (!file) return;
    if (!ALLOWED_PIECE_TYPES.has(file.type)) {
      toast.error("Format non autorisé — utilisez PDF, JPG, PNG, Word ou Excel");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Fichier trop volumineux — maximum 20 Mo");
      return;
    }
    setUploadingPiece(type);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await api.post<UploadResponse>("/uploads", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      }).then((response) => response.data);
      setForm((current) => ({
        ...current,
        pieces: [
          ...current.pieces.filter((piece) => piece.type !== type),
          {
            type,
            nom: up.originalName,
            cheminFichier: up.url,
            mimeType: up.mimeType,
            tailleOctets: up.size,
            legende: "",
          },
        ],
      }));
      toast.success("Pièce ajoutée au dossier");
    } catch (error) {
      toast.error(parseApiError(error));
    } finally {
      setUploadingPiece(null);
    }
  }
  const [nl, setNl] = useState({ designation: "", unite: "ml", quantite: 0, prixUnitaire: 0 });

  const marchesDisponibles = marches.filter(m => STATUTS_ACTIFS_MARCHE.includes(m.statut));

  const mut = useMutation({
    mutationFn: () => api.post("/portail/deposer-decompte", form),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["portail-decomptes"] }); toast.success("Brouillon enregistré avec son dossier obligatoire"); onSuccess(); },
    onError: (error) => toast.error(parseApiError(error)),
  });

  const addLigne = () => {
    if (!nl.designation || !nl.quantite || !nl.prixUnitaire) return;
    const montantBrut = nl.quantite * nl.prixUnitaire;
    setForm(f => ({ ...f, lignes: [...f.lignes, { ...nl, montantBrut }] }));
    setNl({ designation: "", unite: "ml", quantite: 0, prixUnitaire: 0 });
  };

  const totalHT = form.lignes.reduce((s, l) => s + l.montantBrut, 0);
  const tva = totalHT * 0.18;
  const armp = totalHT * 0.006;
  const ttc = totalHT + tva + armp;
  const precompte = ttc * 9 / 118;
  const rg = ttc * 0.05;
  const net = ttc - precompte - rg - armp;
  const marcheChoisi = marches.find(m => m.id === form.marcheId);
  // Référentiel servi par l'API (source unique), repli local sinon.
  const piecesRefQ = useQuery({
    queryKey: ["pieces-obligatoires"],
    queryFn: () => api.get("/pieces-obligatoires").then((r) => r.data as Array<{ type: string; libelle: string; requis: boolean }>),
    staleTime: Infinity,
  });
  const TYPES_PIECE_DECOMPTE = piecesRefQ.data
    ? piecesRefQ.data.map((n) => ({ value: n.type as TypePieceDecompte, label: n.libelle, required: n.requis }))
    : TYPES_PIECE_REPLI;
  const REQUIRED_PIECE_TYPES = TYPES_PIECE_DECOMPTE.filter((d) => d.required).map((d) => d.value);

  const missingRequiredPieces = TYPES_PIECE_DECOMPTE.filter((definition) =>
    definition.required && !form.pieces.some((piece) => piece.type === definition.value),
  );

  // Éligibilité au dépôt, interrogée dès qu'un marché est choisi.
  // Sans cela l'entreprise remplissait tout le formulaire pour découvrir le refus
  // à l'envoi — parfois pour une caution expirée qu'elle aurait pu faire proroger.
  const eligibiliteQ = useQuery<{
    autorise: boolean; blocages: string[]; avertissements: string[];
  }>({
    queryKey: ["portail-eligibilite", form.marcheId],
    queryFn: () => api.get(`/portail/eligibilite/${form.marcheId}`).then(r => r.data),
    enabled: !!form.marcheId,
  });
  const eligibilite = eligibiliteQ.data;

  return (
    <div className="space-y-6">
      {eligibilite && !eligibilite.autorise && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
          <p className="text-sm font-bold text-red-800">Dépôt impossible sur ce marché</p>
          <ul className="mt-2 space-y-1">
            {eligibilite.blocages.map((b, i) => (
              <li key={i} className="text-xs text-red-700">• {b}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-red-600">
            Régularisez ces points, puis revenez déposer. Inutile de saisir le décompte : il serait refusé.
          </p>
        </div>
      )}
      {eligibilite?.avertissements?.length ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          {eligibilite.avertissements.map((a, i) => (
            <p key={i} className="text-xs text-amber-800">⚠ {a}</p>
          ))}
        </div>
      ) : null}
      {/* Marché + type */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-bold text-gray-600 mb-1.5 block">Marché *</label>
          <select value={form.marcheId} onChange={e => setForm(f => ({ ...f, marcheId: e.target.value }))}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            <option value="">— Choisir un marché —</option>
            {marchesDisponibles.map(m => (
              <option key={m.id} value={m.id}>{m.reference} — {m.intitule.slice(0, 50)}</option>
            ))}
          </select>
          {marchesDisponibles.length === 0 && (
            <p className="text-xs text-red-600 mt-1">Aucun marché actif disponible</p>
          )}
        </div>
        <div>
          <label className="text-xs font-bold text-gray-600 mb-1.5 block">Type de décompte *</label>
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            {/* Types de l'énumération TypeDecompte du serveur. Ce sélecteur
                proposait DEFINITIF et REGULARISATION, qui n'existent pas :
                les choisir faisait échouer le dépôt en 400. */}
            {[["AVANCE","Avance de démarrage"],["PROVISOIRE","Décompte provisoire"],["PARTIEL","Décompte partiel (avancement travaux)"],["INTERMEDIAIRE","Décompte intermédiaire"],["FINAL","Décompte définitif"],["CLOTURE","Décompte de clôture"],["APRES_AVENANT","Décompte après avenant"]].map(([v,l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Info marché choisi */}
      {marcheChoisi && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 grid grid-cols-3 gap-3 text-xs">
          <div><span className="text-blue-500 font-semibold">Montant initial</span><br/><span className="font-bold text-blue-800">{fmtGnf(marcheChoisi.montantInitialGnf)}</span></div>
          <div><span className="text-blue-500 font-semibold">Montant actualisé</span><br/><span className="font-bold text-blue-800">{fmtGnf(marcheChoisi.montantActualiseGnf)}</span></div>
          <div><span className="text-blue-500 font-semibold">Financement</span><br/><span className="font-bold text-blue-800">{marcheChoisi.financement}</span></div>
        </div>
      )}

      {/* Lignes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-gray-700">Lignes du décompte</p>
          {form.lignes.length > 0 && (
            <span className="text-xs text-gray-500">{form.lignes.length} ligne(s) · HT : {fmtGnf(totalHT)}</span>
          )}
        </div>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          {form.lignes.length > 0 && (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{["Désignation","Unité","Quantité","Prix unitaire","Montant HT",""].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {form.lignes.map((l, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{l.designation}</td>
                    <td className="px-3 py-2 text-gray-500">{l.unite}</td>
                    <td className="px-3 py-2 text-right">{l.quantite.toLocaleString("fr-FR")}</td>
                    <td className="px-3 py-2 text-right">{fmtGnf(l.prixUnitaire)}</td>
                    <td className="px-3 py-2 text-right font-bold">{fmtGnf(l.montantBrut)}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => setForm(f => ({ ...f, lignes: f.lignes.filter((_,j) => j !== i) }))}
                        className="text-red-400 hover:text-red-600">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="p-3 bg-blue-50/40 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-500 mb-2">Ajouter une ligne</p>
            <div className="grid grid-cols-5 gap-2 mb-2">
              <input className="col-span-2 text-xs border border-gray-200 rounded-lg px-2 py-1.5"
                placeholder="Désignation des travaux" value={nl.designation}
                onChange={e => setNl(n => ({ ...n, designation: e.target.value }))} />
              <select className="text-xs border border-gray-200 rounded-lg px-2 py-1.5"
                value={nl.unite} onChange={e => setNl(n => ({ ...n, unite: e.target.value }))}>
                {["ml","m²","m³","u","forfait","T","kg","ens"].map(u => <option key={u}>{u}</option>)}
              </select>
              <input type="number" placeholder="Quantité" className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-right"
                value={nl.quantite || ""} onChange={e => setNl(n => ({ ...n, quantite: Number(e.target.value) }))} />
              <input type="number" placeholder="Prix unitaire" className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-right"
                value={nl.prixUnitaire || ""} onChange={e => setNl(n => ({ ...n, prixUnitaire: Number(e.target.value) }))} />
            </div>
            <button onClick={addLigne} disabled={!nl.designation}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 disabled:opacity-40">
              {IC.plus} Ajouter cette ligne
            </button>
          </div>
        </div>
      </div>

      {/* Récap financier */}
      {form.lignes.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="font-bold text-gray-700 mb-3 text-sm">Récapitulatif financier</p>
          <div className="space-y-1.5 text-sm">
            {[
              { k: "Montant HT", v: fmtGnf(totalHT), cls: "font-semibold" },
              { k: "TVA 18%", v: `+ ${fmtGnf(tva)}`, cls: "text-gray-500 text-xs" },
              { k: "Contribution ARMP 0.6%", v: `+ ${fmtGnf(armp)}`, cls: "text-gray-500 text-xs" },
              { k: "Montant TTC", v: fmtGnf(ttc), cls: "font-bold border-t border-gray-200 pt-1" },
              { k: "Précompte TVA (9/118)", v: `− ${fmtGnf(precompte)}`, cls: "text-red-600 text-xs" },
              { k: "Retenue de garantie 5%", v: `− ${fmtGnf(rg)}`, cls: "text-red-600 text-xs" },
              { k: "ARMP (déduction)", v: `− ${fmtGnf(armp)}`, cls: "text-red-600 text-xs" },
            ].map(r => (
              <div key={r.k} className={`flex justify-between ${r.cls}`}>
                <span className="text-gray-600">{r.k}</span>
                <span className="font-mono">{r.v}</span>
              </div>
            ))}
            <div className="flex justify-between font-black text-blue-700 text-base border-t-2 border-blue-200 pt-2 mt-2">
              <span>Net à payer</span>
              <span className="font-mono">{fmtGnf(net)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Dossier du décompte : une pièce par ligne */}
      <section className="border-2 border-blue-200 bg-blue-50/40 rounded-xl p-4" aria-labelledby="dossier-decompte-title">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
          <div>
            <h3 id="dossier-decompte-title" className="text-sm font-bold text-gray-800">
              Dossier du décompte — pièces obligatoires
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Chargez un seul fichier par ligne. Les quatre premières pièces sont obligatoires avant enregistrement du brouillon.
            </p>
          </div>
          <span className={`text-xs font-bold rounded-full px-2.5 py-1 ${missingRequiredPieces.length === 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
            {REQUIRED_PIECE_TYPES.length - missingRequiredPieces.length} / {REQUIRED_PIECE_TYPES.length} obligatoires
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {TYPES_PIECE_DECOMPTE.map((definition, index) => {
            const piece = form.pieces.find((item) => item.type === definition.value);
            const inputId = `piece-decompte-${definition.value.toLowerCase()}`;
            const isUploading = uploadingPiece === definition.value;
            return (
              <div key={definition.value} className={`grid grid-cols-1 md:grid-cols-[36px_190px_minmax(0,1fr)_auto] gap-3 items-center rounded-lg border px-3 py-3 ${piece ? "border-green-200 bg-white" : definition.required ? "border-amber-200 bg-amber-50/40" : "border-blue-100 bg-white/70"}`}>
                <span className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <label htmlFor={inputId} className="text-xs font-bold text-gray-700">{definition.label}</label>
                  <p className={`text-[10px] font-semibold mt-0.5 ${definition.required ? "text-red-600" : "text-gray-400"}`}>
                    {definition.required ? "Obligatoire *" : "Optionnel"}
                  </p>
                </div>
                <div className="min-w-0">
                  {piece ? (
                    <div className="mb-2 flex items-center gap-2 text-xs text-green-700" role="status">
                      <span aria-hidden="true">✓</span>
                      <span className="truncate font-semibold">{piece.nom}</span>
                      <span className="shrink-0 text-gray-400">{formatFileSize(piece.tailleOctets)}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 mb-2">{isUploading ? "Téléversement en cours…" : "Aucun fichier chargé"}</p>
                  )}
                  <input
                    id={inputId}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                    aria-required={definition.required && !piece}
                    aria-describedby="dossier-decompte-help"
                    disabled={uploadingPiece !== null}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      void uploadPiece(definition.value, file);
                      event.target.value = "";
                    }}
                    className="block w-full text-xs text-gray-500 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-navy file:text-white file:text-xs file:font-bold disabled:opacity-50"
                  />
                </div>
                <button
                  type="button"
                  disabled={!piece || uploadingPiece !== null}
                  onClick={() => setForm((current) => ({ ...current, pieces: current.pieces.filter((item) => item.type !== definition.value) }))}
                  className="text-xs font-bold text-red-500 hover:text-red-700 disabled:opacity-30 md:justify-self-end"
                  aria-label={`Retirer ${definition.label}`}
                >
                  Retirer
                </button>
              </div>
            );
          })}
        </div>
        <p id="dossier-decompte-help" className="text-[10px] text-gray-500 mt-3">
          Formats autorisés : PDF, JPG, PNG, Word ou Excel — 20 Mo maximum par fichier.
        </p>
      </section>

      <textarea rows={2} placeholder="Observations / commentaires (optionnel)"
        value={form.observations} onChange={e => setForm(f => ({ ...f, observations: e.target.value }))}
        className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500 resize-none" />

      {form.marcheId && form.lignes.length > 0 && missingRequiredPieces.length > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠ Pièces obligatoires manquantes : {missingRequiredPieces.map((piece) => piece.label).join(", ")}.
        </p>
      )}
      <button onClick={() => mut.mutate()}
        disabled={!form.marcheId || form.lignes.length === 0 || missingRequiredPieces.length > 0
          || mut.isPending || uploadingPiece !== null || (eligibilite ? !eligibilite.autorise : false)}
        className="w-full py-3 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition"
        style={{ background: "#1B2A4A" }}>
        {mut.isPending ? IC.spin : IC.plus}
        Enregistrer le brouillon du décompte
      </button>

      {mut.isSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800 flex items-center gap-2">
          {IC.check} Brouillon enregistré — la soumission au circuit sera disponible après la validation technique obligatoire.
        </div>
      )}
      {mut.isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          {(mut.error as any)?.response?.data?.error ?? "Erreur lors du dépôt"}
        </div>
      )}
    </div>
  );
}

// ─── PAGE PRINCIPALE ──────────────────────────────────────────────────────────
export default function PortailEntreprisePage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  // Onglet piloté par l'URL (?tab=...) — liens profonds depuis la barre latérale
  const tabParam = searchParams.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS_VALIDES.includes(tabParam) ? tabParam : "dashboard";
  const setTab = (t: Tab) => setSearchParams(t === "dashboard" ? {} : { tab: t });
  const [marcheDetail, setMarcheDetail] = useState<string | null>(null);
  // Dépôt des pièces justificatives : c'est l'entreprise qui les fournit, la
  // Mission et la Direction Technique les valident ou les retournent.
  const [piecesDe, setPiecesDe] = useState<{ id: string; reference: string } | null>(null);

  const profilQ = useQuery<Profil>({ queryKey: ["portail-profil"], queryFn: () => api.get("/portail/profil").then(r => r.data) });
  const marchesQ = useQuery<Marche[]>({ queryKey: ["portail-marches"], queryFn: () => api.get("/portail/mes-marches").then(r => r.data) });
  const decomptesQ = useQuery<Decompte[]>({ queryKey: ["portail-decomptes"], queryFn: () => api.get("/portail/mes-decomptes").then(r => r.data) });
  const garantiesQ = useQuery<Garantie[]>({ queryKey: ["portail-garanties"], queryFn: () => api.get("/portail/mes-garanties").then(r => r.data).catch(() => []) });
  const paiementsQ = useQuery<Paiement[]>({ queryKey: ["portail-paiements"], queryFn: () => api.get("/portail/mes-paiements").then(r => r.data).catch(() => []) });
  const receptionsQ = useQuery({ queryKey: ["portail-receptions"], queryFn: () => api.get("/portail/mes-receptions").then(r => r.data).catch(() => []) });
  const attachementsQ = useQuery<Array<Record<string, any>>>({ queryKey: ["portail-attachements"], queryFn: () => api.get("/portail/mes-attachements").then(r => r.data).catch(() => []) });

  // Décompte dont l'entreprise consulte le suivi. Elle ne pouvait ouvrir aucun
  // de ses décomptes : ni voir où en était son dossier, ni savoir qu'un
  // complément lui était demandé.
  const [suiviId, setSuiviId] = useState<string | null>(null);

  const profil = profilQ.data;
  const marches = marchesQ.data ?? [];
  const decomptes = decomptesQ.data ?? [];
  const garanties = garantiesQ.data ?? [];
  const paiements = paiementsQ.data ?? [];
  const receptions = receptionsQ.data ?? [];
  const attachements = attachementsQ.data ?? [];

  // KPIs
  const marchesActifs = marches.filter(m => STATUTS_ACTIFS_MARCHE.includes(m.statut));
  const decompteEnCours = decomptes.filter(d => STATUTS_EN_COURS_DECOMPTE.includes(d.statut));
  const decomptePaies = decomptes.filter(d => d.statut === "PAYE");
  const montantPaie = decomptePaies.reduce((s, d) => s + Number(d.netAPayer), 0);
  const montantTotal = marchesActifs.reduce((s, m) => s + Number(m.montantActualiseGnf || m.montantInitialGnf), 0);

  const TABS: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: "dashboard",  label: "Tableau de bord",  icon: IC.chartBar },
    { key: "marches",    label: "Mes marchés",       icon: IC.building, badge: marchesActifs.length },
    { key: "decomptes",  label: "Mes décomptes",     icon: IC.document, badge: decomptes.length },
    { key: "attachements", label: "Mes attachements", icon: IC.paperclip, badge: attachements.length },
    { key: "paiements",  label: "Paiements",         icon: IC.banknote },
    { key: "receptions", label: "Réceptions / PV",   icon: IC.check },
    { key: "garanties",  label: "Garanties",         icon: IC.shield },
    { key: "deposer",    label: "Déposer décompte",  icon: IC.plus },
  ];

  const isLoading = profilQ.isLoading || marchesQ.isLoading;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F0F4F8" }}>

      {/* ── HEADER ── */}
      <header style={{ background: "#1B2A4A" }} className="text-white px-6 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center">{IC.building}</div>
          <div>
            <p className="font-black text-sm leading-none">ERP AGEROUTE</p>
            <p className="text-[10px] text-white/50 mt-0.5">Portail Entreprise</p>
          </div>
        </div>
        {profil && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-bold text-sm">{profil.raisonSociale}</p>
              <div className="flex items-center gap-2 justify-end mt-0.5">
                <span className="text-[10px] text-white/50">NIF {profil.nif}</span>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${profil.scoreConformite >= 70 ? "bg-green-400/20 text-green-300" : "bg-red-400/20 text-red-300"}`}>
                  {profil.scoreConformite}/100
                </span>
              </div>
            </div>
            <button onClick={() => authStore.logout()} className="p-2 rounded-lg hover:bg-white/10 transition">
              <div className="text-white/60">{IC.logout}</div>
            </button>
          </div>
        )}
      </header>

      {/* ── ALERTES CONFORMITÉ ── */}
      {(profil?.alertes ?? []).length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-2 text-sm text-amber-800">
          <div className="text-amber-500">{IC.warn}</div>
          <span className="font-bold">{profil!.alertes.length} alerte(s) :</span>
          <span className="truncate">{profil!.alertes[0].message}</span>
        </div>
      )}

      <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-5">

        {/* ── TABS ── */}
        <div className="flex gap-1 bg-white rounded-2xl p-1 shadow-sm border border-gray-100 mb-5">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-bold transition-all relative ${
                tab === t.key ? "text-white shadow-md" : "text-gray-500 hover:bg-gray-50"
              }`}
              style={tab === t.key ? { background: "#1B2A4A" } : {}}>
              {t.icon}{t.label}
              {(t.badge ?? 0) > 0 && (
                <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center ${tab === t.key ? "bg-blue-400 text-white" : "bg-blue-600 text-white"}`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20 text-gray-400">
            {IC.spin} <span className="ml-2 text-sm">Chargement...</span>
          </div>
        )}

        {/* ══ TABLEAU DE BORD ══════════════════════════════════════════════════ */}
        {!isLoading && tab === "dashboard" && (
          <div className="space-y-5">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Marchés actifs" value={marchesActifs.length}
                sub={`${marches.length} total`} icon={IC.building}
                color="#1B2A4A" bg="#EFF6FF" />
              <KpiCard label="Décomptes en cours" value={decompteEnCours.length}
                sub={`${decomptes.length} total`} icon={IC.document}
                color="#7C3AED" bg="#EDE9FE" />
              <KpiCard label="Montant payé" value={fmtGnf(montantPaie)}
                sub={`${decomptePaies.length} décompte(s) payé(s)`} icon={IC.banknote}
                color="#15803D" bg="#DCFCE7" />
              <KpiCard label="Score conformité" value={`${profil?.scoreConformite ?? "—"}/100`}
                sub={profil?.statut} icon={IC.shield}
                color={profil && profil.scoreConformite >= 70 ? "#15803D" : "#DC2626"}
                bg={profil && profil.scoreConformite >= 70 ? "#DCFCE7" : "#FEE2E2"} />
            </div>

            {/* Avancement financier global */}
            {marchesActifs.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="font-bold text-gray-800 mb-4">Avancement financier — marchés actifs</h3>
                <div className="space-y-4">
                  {marchesActifs.map(m => {
                    const cumulDec = decomptes.filter(d => d.marche?.id === m.id).reduce((s,d) => s + Number(d.cumulActuelHtGnf), 0);
                    const montant = Number(m.montantActualiseGnf || m.montantInitialGnf);
                    return (
                      <div key={m.id} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <div>
                            <span className="font-bold text-gray-800">{m.reference}</span>
                            <span className="text-gray-400 ml-2 text-xs">{m.intitule.slice(0, 50)}</span>
                          </div>
                          <div className="text-right">
                            <StatutBadge statut={m.statut} cfg={MARCHE_STATUT_CFG} />
                          </div>
                        </div>
                        <ProgressBar value={cumulDec} max={montant} color="#2563eb" />
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>Cumulé HT : {fmtGnf(cumulDec)}</span>
                          <span>Montant marché : {fmtGnf(montant)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Derniers décomptes */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-800">Derniers décomptes</h3>
                <button onClick={() => setTab("decomptes")} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  Voir tout {IC.arrow}
                </button>
              </div>
              {decomptes.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  <div className="opacity-30 mb-2">{IC.document}</div>
                  Aucun décompte soumis — <button onClick={() => setTab("deposer")} className="text-blue-600 underline">Déposer le premier</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {decomptes.slice(0, 5).map(d => {
                    const sc = DECOMPTE_STATUT_CFG[d.statut];
                    return (
                      <div key={d.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-8 rounded-full" style={{ background: sc?.color ?? "#9CA3AF" }} />
                          <div>
                            <p className="text-sm font-bold text-gray-800">{d.reference}</p>
                            <p className="text-xs text-gray-400">{d.marche?.reference} · {fmtDate(d.createdAt)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-right">
                          <div>
                            <div className="text-sm font-bold text-gray-700">{fmtGnf(d.netAPayer)}</div>
                            <StatutBadge statut={d.statut} cfg={DECOMPTE_STATUT_CFG} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Garanties + Réceptions rapides */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <h3 className="font-bold text-gray-800 mb-3 text-sm">Garanties bancaires</h3>
                {garanties.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">Aucune garantie</p> : (
                  <div className="space-y-2">
                    {garanties.slice(0, 3).map(g => (
                      <div key={g.id} className="flex justify-between items-center text-xs py-1.5 border-b border-gray-50">
                        <div>
                          <span className="font-semibold text-gray-700">{g.type}</span>
                          {g.banque && <span className="text-gray-400 ml-1">· {g.banque}</span>}
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-gray-700">{fmtGnf(g.montantGnf)}</div>
                          <div className="text-gray-400">{fmtDate(g.dateExpiration)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <h3 className="font-bold text-gray-800 mb-3 text-sm">Réceptions de travaux</h3>
                {receptions.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">Aucune réception</p> : (
                  <div className="space-y-2">
                    {(receptions as any[]).slice(0, 3).map((r: any) => (
                      <div key={r.id} className="flex justify-between items-center text-xs py-1.5 border-b border-gray-50">
                        <div>
                          <span className="font-semibold text-gray-700">{r.type}</span>
                          <span className="text-gray-400 ml-1">· {r.marche?.reference}</span>
                        </div>
                        <span className={`font-bold px-2 py-0.5 rounded-full ${r.statut === "SIGNE" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{r.statut}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══ MES MARCHÉS ══════════════════════════════════════════════════════ */}
        {tab === "marches" && (
          <div className="space-y-3">
            {marches.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
                <div className="opacity-30 mb-3 flex justify-center">{IC.building}</div>
                Aucun marché associé à votre entreprise
              </div>
            ) : marches.map(m => {
              const cumulDec = decomptes.filter(d => d.marche?.id === m.id).reduce((s,d) => s + Number(d.cumulActuelHtGnf), 0);
              const montant = Number(m.montantActualiseGnf || m.montantInitialGnf);
              const nbDec = decomptes.filter(d => d.marche?.id === m.id).length;
              const garsMarche = garanties.filter(g => g.marcheId === m.id);
              const isActif = STATUTS_ACTIFS_MARCHE.includes(m.statut);
              return (
                <div key={m.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Ligne titre */}
                  <div className="flex items-start justify-between p-4 gap-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-1 self-stretch rounded-full mt-1 ${isActif ? "bg-blue-500" : "bg-gray-300"}`} />
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-bold text-sm text-blue-700">{m.reference}</span>
                          <StatutBadge statut={m.statut} cfg={MARCHE_STATUT_CFG} />
                          <span className="text-xs text-gray-400">{m.type} · {m.financement}</span>
                        </div>
                        <p className="text-sm font-semibold text-gray-800">{m.intitule}</p>
                        {m.projet && (
                          <p className="text-xs text-gray-400 mt-0.5">Projet {m.projet.code} — {m.projet.region}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-none">
                      <div className="text-lg font-black text-gray-800">{fmtGnf(m.montantInitialGnf)}</div>
                      {m.montantActualiseGnf !== m.montantInitialGnf && (
                        <div className="text-xs text-blue-600">Actualisé : {fmtGnf(m.montantActualiseGnf)}</div>
                      )}
                    </div>
                  </div>

                  {/* Avancement */}
                  <div className="px-4 pb-3">
                    <ProgressBar value={cumulDec} max={montant} />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>Cumulé HT : {fmtGnf(cumulDec)}</span>
                      <span>Reste : {fmtGnf(Math.max(0, montant - cumulDec))}</span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-4 border-t border-gray-50 divide-x divide-gray-50">
                    {[
                      { l: "OS", v: fmtDate(m.dateOs) },
                      { l: "Fin prévue", v: fmtDate(m.dateFinPrevue) },
                      { l: "Délai", v: m.delaiMois ? `${m.delaiMois} mois` : "—" },
                      { l: "Décomptes", v: nbDec },
                    ].map(kpi => (
                      <div key={kpi.l} className="p-3 text-center">
                        <div className="text-xs text-gray-400">{kpi.l}</div>
                        <div className="text-sm font-bold text-gray-700 mt-0.5">{kpi.v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Garanties */}
                  {garsMarche.length > 0 && (
                    <div className="px-4 pb-3 pt-1 border-t border-gray-50">
                      <p className="text-xs font-bold text-gray-500 mb-1.5">Garanties bancaires</p>
                      <div className="flex flex-wrap gap-2">
                        {garsMarche.map(g => (
                          <div key={g.id} className="flex items-center gap-1.5 bg-purple-50 border border-purple-100 rounded-lg px-2.5 py-1 text-xs">
                            <span className="font-bold text-purple-700">{g.type}</span>
                            <span className="text-purple-500">·</span>
                            <span className="text-gray-600">{fmtGnf(g.montantGnf)}</span>
                            {g.dateExpiration && <span className="text-gray-400">· exp. {fmtDate(g.dateExpiration)}</span>}
                            {g.appelGarantie && <span className="text-red-600 font-bold">⚠ APPELÉE</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {isActif && (
                    <div className="px-4 pb-3 flex gap-2">
                      <button onClick={() => { setTab("deposer"); }}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50">
                        {IC.plus} Soumettre un décompte
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ══ MES DÉCOMPTES ════════════════════════════════════════════════════ */}
        {tab === "decomptes" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {Object.entries({
                  "Tous": decomptes.length,
                  "En cours": decompteEnCours.length,
                  "Payés": decomptePaies.length,
                }).map(([l, n]) => (
                  <span key={l} className="text-xs bg-white border border-gray-200 rounded-lg px-3 py-1.5 font-semibold text-gray-600">
                    {l} ({n})
                  </span>
                ))}
              </div>
              <button onClick={() => setTab("deposer")}
                className="text-xs font-bold text-white px-4 py-2 rounded-xl flex items-center gap-1.5"
                style={{ background: "#1B2A4A" }}>
                {IC.plus} Nouveau décompte
              </button>
            </div>

            {decomptes.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
                Aucun décompte soumis
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {["Référence","Marché","Type","Montant HT","Net à payer","Statut","Étape","Pièces","Date"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-gray-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {decomptes.map(d => (
                      <tr key={d.id} onClick={() => setSuiviId(d.id)}
                        className="hover:bg-blue-50/50 transition cursor-pointer"
                        title="Ouvrir le suivi de ce décompte">
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold text-blue-700 text-xs underline decoration-dotted">{d.reference}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px]">
                          <div className="truncate">{d.marche?.reference ?? "—"}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{d.type}</td>
                        <td className="px-4 py-3 text-sm font-semibold">{fmtGnf(d.montantPeriodeHtGnf)}</td>
                        <td className="px-4 py-3 text-sm font-bold text-blue-700">{fmtGnf(d.netAPayer)}</td>
                        <td className="px-4 py-3"><StatutBadge statut={d.statut} cfg={DECOMPTE_STATUT_CFG} /></td>
                        <td className="px-4 py-3 text-xs">
                          {d.etapeCourante ? (
                            <div>
                              <div className="font-semibold text-gray-700">{d.etapeCourante.etape}</div>
                              <div className="text-[10px] text-gray-400">étape {d.etapeCourante.position}</div>
                            </div>
                          ) : d.peutEtreEnvoye ? (
                            <span className="text-[11px] font-semibold text-amber-700">Non envoyé</span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          <button
                            type="button"
                            className="font-bold text-blue-700 underline decoration-dotted hover:text-blue-900"
                            onClick={(event) => {
                              event.stopPropagation();
                              setPiecesDe({ id: d.id, reference: d.reference });
                            }}
                            title="Consulter ou remplacer les pièces du dossier"
                          >
                            {d.nbPieces ?? 0}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(d.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-50 border-t border-blue-100">
                      <td colSpan={3} className="px-4 py-2 text-xs font-bold text-gray-600">Total ({decomptes.length})</td>
                      <td className="px-4 py-2 text-sm font-black text-gray-800">{fmtGnf(decomptes.reduce((s,d) => s + Number(d.montantPeriodeHtGnf), 0))}</td>
                      <td className="px-4 py-2 text-sm font-black text-blue-700">{fmtGnf(decomptes.reduce((s,d) => s + Number(d.netAPayer), 0))}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ PAIEMENTS ════════════════════════════════════════════════════════ */}
        {tab === "paiements" && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <KpiCard label="Total reçu" value={fmtGnf(paiements.filter((p:any) => p.statut === "EXECUTE").reduce((s:number,p:any) => s + Number(p.montantGnf), 0))}
                icon={IC.banknote} color="#15803D" bg="#DCFCE7" />
              <KpiCard label="En attente" value={paiements.filter((p:any) => ["EN_ATTENTE","ORDONNE"].includes(p.statut)).length}
                icon={IC.clock} color="#D97706" bg="#FEF3C7" />
              <KpiCard label="Décomptes payés" value={decomptePaies.length}
                icon={IC.check} color="#1B2A4A" bg="#EFF6FF" />
            </div>

            {paiements.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
                <div className="opacity-30 mb-3 flex justify-center">{IC.banknote}</div>
                Aucun paiement enregistré
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {["Décompte","Montant","Ordre","Exécution","Référence","Statut"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-gray-400 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(paiements as any[]).map((p:any) => (
                      <tr key={p.id} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 text-xs font-mono text-blue-700">{p.decompte?.reference ?? "—"}</td>
                        <td className="px-4 py-3 font-bold">{fmtGnf(p.montantGnf)}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(p.dateOrdre)}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(p.dateExecution)}</td>
                        <td className="px-4 py-3 text-xs text-gray-400">{p.reference ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            p.statut === "EXECUTE" ? "bg-green-100 text-green-700" :
                            p.statut === "ORDONNE" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                          }`}>{p.statut}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ GARANTIES ════════════════════════════════════════════════════════ */}
        {tab === "garanties" && (
          <div className="space-y-3">
            {garanties.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
                <div className="opacity-30 mb-3 flex justify-center">{IC.shield}</div>
                Aucune garantie bancaire enregistrée
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {garanties.map(g => {
                  const exp = g.dateExpiration ? new Date(g.dateExpiration) : null;
                  const expired = exp ? exp < new Date() : false;
                  const nearExp = exp && !expired ? (exp.getTime() - Date.now()) / 86400000 < 60 : false;
                  return (
                    <div key={g.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${
                      g.appelGarantie ? "border-red-200" : expired ? "border-orange-200" : nearExp ? "border-amber-200" : "border-gray-100"
                    }`}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <span className="font-bold text-lg" style={{ color: "#1B2A4A" }}>{g.type}</span>
                          {g.reference && <span className="text-xs text-gray-400 ml-2">{g.reference}</span>}
                        </div>
                        {g.appelGarantie ? (
                          <span className="text-xs font-bold px-2 py-1 bg-red-100 text-red-700 rounded-lg">APPELÉE</span>
                        ) : expired ? (
                          <span className="text-xs font-bold px-2 py-1 bg-orange-100 text-orange-700 rounded-lg">EXPIRÉE</span>
                        ) : nearExp ? (
                          <span className="text-xs font-bold px-2 py-1 bg-amber-100 text-amber-700 rounded-lg">Expiration proche</span>
                        ) : (
                          <span className="text-xs font-bold px-2 py-1 bg-green-100 text-green-700 rounded-lg">Active</span>
                        )}
                      </div>
                      <div className="text-2xl font-black text-gray-800 mb-3">{fmtGnf(g.montantGnf)}</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-gray-50 rounded-lg p-2">
                          <div className="text-gray-400">Banque</div>
                          <div className="font-semibold text-gray-700">{g.banque ?? "—"}</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2">
                          <div className="text-gray-400">Expiration</div>
                          <div className={`font-semibold ${expired ? "text-red-600" : nearExp ? "text-amber-600" : "text-gray-700"}`}>
                            {fmtDate(g.dateExpiration)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ DÉPOSER DÉCOMPTE ═════════════════════════════════════════════════ */}
        {tab === "attachements" && (
          <div className="space-y-3">
            {attachements.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
                <div className="opacity-30 mb-3 flex justify-center">{IC.paperclip}</div>
                Aucun attachement enregistré
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>{["Code", "Décompte", "Marché", "Période", "Montant HT", "Statut"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {attachements.map((a) => (
                      <tr key={a.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 font-semibold text-navy">{a.code ?? "—"}</td>
                        <td className="px-4 py-2.5 text-gray-600">{a.decompte?.reference ?? "—"}</td>
                        <td className="px-4 py-2.5 text-gray-600">{a.decompte?.marche?.reference ?? "—"}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">
                          {a.periodeDebut ? new Date(a.periodeDebut).toLocaleDateString("fr-FR") : "—"}
                          {a.periodeFin ? ` → ${new Date(a.periodeFin).toLocaleDateString("fr-FR")}` : ""}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">{a.montantHtGnf ? Number(a.montantHtGnf).toLocaleString("fr-GN") + " FG" : "—"}</td>
                        <td className="px-4 py-2.5"><span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{a.statut}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "receptions" && (
          <div className="space-y-3">
            {(receptions as Array<Record<string, any>>).length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
                <div className="opacity-30 mb-3 flex justify-center">{IC.check}</div>
                Aucun PV de réception enregistré
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>{["Type", "Marché", "N° PV", "Date prévue", "Date réelle", "Statut"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(receptions as Array<Record<string, any>>).map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 font-semibold text-navy">{r.type === "OPR" ? "OPR" : r.type === "PROVISOIRE" ? "Provisoire" : r.type === "DEFINITIVE" ? "Définitive" : r.type}</td>
                        <td className="px-4 py-2.5 text-gray-600">{r.marche?.reference ?? "—"}</td>
                        <td className="px-4 py-2.5 text-gray-600">{r.pvNumero ?? "—"}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{r.datePrevu ? new Date(r.datePrevu).toLocaleDateString("fr-FR") : "—"}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{r.dateReelle ? new Date(r.dateReelle).toLocaleDateString("fr-FR") : "—"}</td>
                        <td className="px-4 py-2.5"><span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{r.statut}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "deposer" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#EFF6FF", color: "#1B2A4A" }}>
                {IC.document}
              </div>
              <div>
                <h2 className="font-bold text-gray-800">Déposer un décompte</h2>
                <p className="text-xs text-gray-400">Circuit de validation AGEROUTE lancé automatiquement après dépôt</p>
              </div>
            </div>
            {marchesQ.isLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-400">{IC.spin}</div>
            ) : (
              <DeposerForm marches={marches} onSuccess={() => setTab("decomptes")} />
            )}
          </div>
        )}

      </div>

      {piecesDe && (
        <PiecesDossier
          decompteId={piecesDe.id}
          reference={piecesDe.reference}
          onClose={() => setPiecesDe(null)}
        />
      )}

      {suiviId && <SuiviDecompte decompteId={suiviId} onClose={() => setSuiviId(null)} />}

    </div>
  );
}

// ─── Pièces justificatives du dossier (côté entreprise) ──────────────────────
interface PieceDoc {
  id: string; nom: string; url: string; version: number; createdAt: string;
  statutValidation: "DEPOSE" | "VALIDE" | "RETOURNE";
  motifRetour?: string | null;
}
interface PieceNat {
  cle: string; libelle: string; requis: boolean; fourni: boolean; documents: PieceDoc[];
}

const ETAT_PIECE: Record<string, { label: string; couleur: string; fond: string }> = {
  DEPOSE:   { label: "En attente de contrôle", couleur: "#1D4ED8", fond: "#DBEAFE" },
  VALIDE:   { label: "Validée",                couleur: "#15803D", fond: "#DCFCE7" },
  RETOURNE: { label: "À corriger",             couleur: "#B45309", fond: "#FEF3C7" },
};

/**
 * L'entreprise dépose ici les justificatifs de son décompte.
 *
 * Le circuit est le même que côté agence : déposer crée une version, la Mission
 * ou la Direction Technique valide ou retourne avec un motif. Une pièce
 * retournée réapparaît ici avec la raison, ce qui évite l'aller-retour par
 * téléphone pour savoir ce qui ne va pas.
 */
function PiecesDossier({ decompteId, reference, onClose }: { decompteId: string; reference: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [depotPour, setDepotPour] = useState<PieceNat | null>(null);

  const { data, isLoading } = useQuery<{ pieces: PieceNat[]; requisFournis: number; requisTotal: number }>({
    queryKey: ["portail-pieces", decompteId],
    queryFn: () => api.get(`/decomptes/${decompteId}/documents`).then((r) => r.data),
  });

  const rattacher = useMutation({
    mutationFn: (corps: object) => api.post(`/decomptes/${decompteId}/documents`, corps),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portail-pieces", decompteId] });
      qc.invalidateQueries({ queryKey: ["portail-decomptes"] });
      setDepotPour(null);
    },
  });

  const pieces = data?.pieces ?? [];
  const complet = (data?.requisFournis ?? 0) === (data?.requisTotal ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-bold text-gray-800">Pièces justificatives</h3>
            <p className="font-mono text-xs text-gray-400">{reference}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="space-y-3 p-5">
          <div className={`rounded-xl px-4 py-3 text-sm ${complet ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>
            {data?.requisFournis ?? 0}/{data?.requisTotal ?? 0} pièces obligatoires fournies.
            {!complet && " Le décompte ne pourra pas avancer tant que le dossier est incomplet."}
          </div>

          {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}

          {pieces.map((p) => (
            <div key={p.cle} className="rounded-xl border border-gray-100 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="text-sm font-semibold text-gray-700">{p.libelle}</span>
                  {p.requis
                    ? <span className="ml-2 text-[11px] font-bold text-red-500">OBLIGATOIRE</span>
                    : <span className="ml-2 text-[11px] text-gray-400">(si applicable)</span>}
                </div>
                <button
                  onClick={() => setDepotPour(p)}
                  className="rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                  style={{ background: "#1B2A4A" }}
                >
                  {p.fourni ? "Nouvelle version" : "Déposer"}
                </button>
              </div>

              {p.documents.map((d) => {
                const etat = ETAT_PIECE[d.statutValidation] ?? ETAT_PIECE.DEPOSE;
                return (
                  <div key={d.id} className="mt-2 border-t border-gray-50 pt-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <SecureFileLink href={d.url} className="truncate font-medium text-blue-700 hover:underline">
                        {d.nom} <span className="text-gray-400">v{d.version}</span>
                      </SecureFileLink>
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold"
                        style={{ color: etat.couleur, background: etat.fond }}>
                        {etat.label}
                      </span>
                    </div>
                    {d.statutValidation === "RETOURNE" && d.motifRetour && (
                      <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        Motif du retour : {d.motifRetour}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <FileUploadModal
        open={Boolean(depotPour)}
        onClose={() => setDepotPour(null)}
        title={depotPour ? `Déposer — ${depotPour.libelle}` : "Déposer une pièce"}
        onFileUploaded={(url, nom) => { if (depotPour) rattacher.mutate({ type: depotPour.cle, nom, url }); }}
      />
    </div>
  );
}

/**
 * Suivi d'un décompte, vu par l'entreprise.
 *
 * Jusqu'ici l'entreprise ne pouvait ouvrir aucun de ses décomptes : ni voir où
 * en était son dossier, ni savoir qu'un complément lui était demandé, ni envoyer
 * un brouillon. Ce panneau répond aux quatre questions qu'elle se pose :
 * où en est-il, qui le détient, que dois-je faire, et qu'ai-je déjà fourni.
 */
function SuiviDecompte({ decompteId, onClose }: { decompteId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["portail-suivi", decompteId],
    queryFn: () => api.get(`/portail/suivi/${decompteId}`).then(r => r.data),
  });

  const envoi = useMutation({
    mutationFn: () => api.post(`/portail/soumettre/${decompteId}`).then(r => r.data),
    onSuccess: (r: { message?: string; premiereEtape?: string }) => {
      qc.invalidateQueries({ queryKey: ["portail-decomptes"] });
      qc.invalidateQueries({ queryKey: ["portail-suivi", decompteId] });
      toast.success(r?.message ?? "Décompte envoyé au circuit");
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const d = data?.decompte;
  const etapes: Array<{ ordre: number; nom: string; roleRequis: string; etat: string }> = data?.etapes ?? [];
  const actions: Array<{ etape: string; decision: string; commentaire: string | null; date: string }> = data?.actions ?? [];
  const pieces: Array<Record<string, any>> = d?.documents ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
          <div>
            <p className="font-mono text-sm font-black text-navy">{d?.reference ?? "…"}</p>
            <p className="text-xs text-gray-500">{d?.marche?.reference} — {d?.marche?.intitule}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="space-y-5 p-5">
          {isLoading && <p className="text-sm text-gray-400">Chargement…</p>}

          {/* Ce que l'entreprise doit faire — en premier, car c'est le motif de sa visite */}
          {data?.actionAttendue && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Action attendue de vous</p>
              <p className="mt-1 text-sm text-amber-900">{data.actionAttendue}</p>
              {["BROUILLON", "EN_CORRECTION"].includes(d?.statut) && (
                <button onClick={() => envoi.mutate()} disabled={envoi.isPending}
                  className="mt-3 rounded-lg bg-navy px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                  {envoi.isPending ? "Envoi…" : d?.statut === "EN_CORRECTION" ? "Resoumettre après correction" : "Envoyer au circuit de validation"}
                </button>
              )}
            </div>
          )}

          {data?.anterieurAuDispositif && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
              Dossier antérieur à l'unification des circuits : les validations enregistrées à
              l'époque restent consultables, mais aucun parcours n'a été reconstitué.
            </div>
          )}

          {/* Où en est le dossier */}
          <section>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Parcours du dossier</h4>
            {etapes.length === 0 ? (
              <p className="text-sm text-gray-400">Ce décompte n'est pas encore entré dans un circuit.</p>
            ) : (
              <ol className="space-y-1">
                {etapes.map((e) => (
                  <li key={e.ordre} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                    e.etat === "EN_COURS" ? "bg-blue-50 border border-blue-200"
                    : e.etat === "FRANCHIE" ? "bg-green-50/60" : "bg-gray-50"}`}>
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      e.etat === "FRANCHIE" ? "bg-green-600 text-white"
                      : e.etat === "EN_COURS" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"}`}>
                      {e.etat === "FRANCHIE" ? "✓" : e.ordre}
                    </span>
                    <span className="flex-1 font-medium text-gray-700">{e.nom}</span>
                    <span className="text-[11px] text-gray-400">{e.roleRequis}</span>
                    {e.etat === "EN_COURS" && <span className="text-[10px] font-bold text-blue-700">EN COURS</span>}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Historique des décisions */}
          <section>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Historique des décisions</h4>
            {actions.length === 0 ? (
              <p className="text-sm text-gray-400">Aucune décision enregistrée à ce jour.</p>
            ) : (
              <ul className="space-y-1">
                {actions.map((a, i) => (
                  <li key={i} className="rounded-lg border border-gray-100 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">{a.etape}</span>
                      <span className="text-[11px] text-gray-400">{fmtDate(a.date)}</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      <span className="font-semibold">{a.decision}</span>
                      {a.commentaire ? ` — ${a.commentaire}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Pièces — avec le motif de retour, qui dit à l'entreprise quoi corriger */}
          <section>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Pièces déposées</h4>
            {pieces.length === 0 ? (
              <p className="text-sm text-gray-400">Aucune pièce déposée.</p>
            ) : (
              <ul className="space-y-1">
                {pieces.map((p) => (
                  <li key={p.id} className={`rounded-lg border px-3 py-2 ${
                    p.statutValidation === "RETOURNE" ? "border-red-200 bg-red-50" : "border-gray-100"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-gray-700">{p.nom}</span>
                      <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${
                        p.statutValidation === "VALIDE" ? "bg-green-100 text-green-700"
                        : p.statutValidation === "RETOURNE" ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-600"}`}>{p.statutValidation}</span>
                    </div>
                    <p className="text-[11px] text-gray-400">{p.type} · version {p.version}</p>
                    {p.motifRetour && (
                      <p className="mt-1 text-xs font-medium text-red-700">Motif du retour : {p.motifRetour}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
