/**
 * Module Attachements §9 CDC — BPMN Avancé AGEROUTE Guinée
 * Workflow : BROUILLON → SOUMIS → EN_CONTROLE_MISSION → EN_CONTROLE_TECHNIQUE → VALIDE
 * AMÉLIORATIONS :
 *   - Bandeau "Mes tâches en attente" filtré par rôle
 *   - Fiche complète de contrôle obligatoire avant validation
 *   - Impression officielle de la fiche (window.print)
 *   - Traçabilité complète des validations précédentes
 */
import { h, ouvrirImpression } from "../lib/html-sur";
import { useState, useEffect } from "react";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError, fmtGnf } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/Button";
import { Input, Select, FormField, Textarea } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { toast } from "../components/ui/Toast";
import { SecureFileLink, SecureImg } from "../components/ui/SecureFile";
import {
  Plus, Paperclip, Check, X, MapPin, Trash2, Image as ImageIcon,
  Send, Eye, AlertTriangle, CheckCircle, XCircle, Clock, FileText,
  Camera, Navigation, MessageSquare, History, Shield, TrendingUp,
  ChevronRight, Activity, RefreshCw, Download, Printer, Bell,
  Package, LayoutList, Info,
} from "lucide-react";

// ===== TYPES =====

type StatutAtt =
  | "BROUILLON"
  | "SOUMIS"
  | "EN_CONTROLE_MISSION"
  | "EN_CONTROLE_TECHNIQUE"
  | "DEMANDE_CORRECTION"
  | "VALIDE"
  | "REJETE";

interface AttLigne {
  id: string;
  codeArticle: string;
  designation: string;
  unite: string;
  quantiteContrat: number;
  quantitePrecedent: number;
  quantiteCourante: number;
  quantiteCumulee: number;
  prixUnitaire: string;
  montant: string;
  statut: string;
  depassement: boolean;
  observations?: string;
  mesures: AttMesure[];
}
interface AttMesure {
  id: string;
  methode: string;
  valeur: number;
  unite: string;
  sourcePreuve: string;
  niveauConfiance: number;
  mesurePar: string;
  observations?: string;
}
interface AttGPS {
  id: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  precision?: number;
  description?: string;
  capturePar?: string;
}
interface AttMedia {
  id: string;
  type: string;
  cheminFichier: string;
  urlPublique?: string;
  legende?: string;
}
interface AttValidation {
  id: string;
  etape: string;
  statut: string;
  commentaire: string;
  validePar: string;
  valideNom?: string;
  valideAt: string;
}
interface AttComment {
  id: string;
  contenu: string;
  auteurNom?: string;
  auteurRole?: string;
  type: string;
  createdAt: string;
}
interface Attachement {
  id: string;
  code?: string;
  decompteId: string;
  statut: StatutAtt;
  typeAttachement: string;
  periodeDebut?: string;
  periodeFin?: string;
  version: number;
  natureTravaux: string;
  unite: string;
  quantitePrevue: number;
  quantiteExecutee: number;
  prixUnitaireGnf: string;
  montantHtGnf: string;
  montantTvaGnf?: string;
  montantArmpGnf?: string;
  montantTtcGnf?: string;
  latGps?: number;
  lonGps?: number;
  ouvrage?: string;
  section?: string;
  pkDebut?: number;
  pkFin?: number;
  photos: string[];
  observations?: string;
  valide: boolean;
  motifRejet?: string;
  valideParMission: boolean;
  valideParTechnique: boolean;
  soumisAt?: string;
  valideAt?: string;
  lignes: AttLigne[];
  pointsGPS: AttGPS[];
  medias: AttMedia[];
  validations: AttValidation[];
  commentaires: AttComment[];
  decompte?: {
    reference: string;
    marche?: {
      reference: string;
      intitule?: string;
      financement?: string;
      entreprise?: { raisonSociale: string };
    };
  };
  _count?: { lignes: number; medias: number; pointsGPS: number; validations: number };
}

// ===== STATUT CONFIG =====

const STATUT_CFG: Record<StatutAtt, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  BROUILLON:             { label: "Brouillon",          color: "#6B7280", bg: "#F3F4F6", Icon: FileText },
  SOUMIS:                { label: "Soumis",             color: "#1D4ED8", bg: "#DBEAFE", Icon: Send },
  EN_CONTROLE_MISSION:   { label: "Contrôle Mission",   color: "#D97706", bg: "#FEF3C7", Icon: Eye },
  EN_CONTROLE_TECHNIQUE: { label: "Contrôle Technique", color: "#7C3AED", bg: "#EDE9FE", Icon: Shield },
  DEMANDE_CORRECTION:    { label: "Correction requise", color: "#DC2626", bg: "#FEE2E2", Icon: AlertTriangle },
  VALIDE:                { label: "Validé",             color: "#16A34A", bg: "#DCFCE7", Icon: CheckCircle },
  REJETE:                { label: "Rejeté",             color: "#991B1B", bg: "#FEE2E2", Icon: XCircle },
};

function StatutBadge({ statut }: { statut: StatutAtt }) {
  const cfg = STATUT_CFG[statut] ?? { label: statut, color: "#6B7280", bg: "#F3F4F6", Icon: Clock };
  const { Icon } = cfg;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ color: cfg.color, background: cfg.bg }}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

// ===== IMPRESSION OFFICIELLE =====

function imprimerFiche(att: Attachement) {
  const fmt = (v: string | number) => Number(v).toLocaleString("fr-GN") + " GNF";
  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("fr-GN", { day: "2-digit", month: "long", year: "numeric" }) : "—";
  const decompte = att.decompte;
  const marche = decompte?.marche;

  const lignesHTML = (att.lignes ?? []).map(l => h`
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:6px 8px;font-family:monospace;font-size:11px">${l.codeArticle}</td>
      <td style="padding:6px 8px;font-size:11px">${l.designation}</td>
      <td style="padding:6px 8px;text-align:center;font-size:11px">${l.unite}</td>
      <td style="padding:6px 8px;text-align:right;font-size:11px">${Number(l.quantiteContrat).toLocaleString("fr-GN")}</td>
      <td style="padding:6px 8px;text-align:right;font-size:11px">${Number(l.quantitePrecedent).toLocaleString("fr-GN")}</td>
      <td style="padding:6px 8px;text-align:right;font-size:11px">${Number(l.quantiteCourante).toLocaleString("fr-GN")}</td>
      <td style="padding:6px 8px;text-align:right;font-size:11px">${Number(l.quantiteCumulee).toLocaleString("fr-GN")}</td>
      <td style="padding:6px 8px;text-align:right;font-size:11px">${Number(l.prixUnitaire).toLocaleString("fr-GN")}</td>
      <td style="padding:6px 8px;text-align:right;font-size:11px;font-weight:600${l.depassement ? ";color:#dc2626" : ""}">${fmt(l.montant)}</td>
    </tr>
  `);

  const valHTML = (att.validations ?? []).map(v => h`
    <tr>
      <td style="padding:6px 8px;font-size:11px;font-weight:600">${v.etape}</td>
      <td style="padding:6px 8px;font-size:11px">${v.valideNom ?? v.validePar}</td>
      <td style="padding:6px 8px;font-size:11px">${fmtDate(v.valideAt)}</td>
      <td style="padding:6px 8px;font-size:11px;color:${v.statut === "APPROUVE" ? "#16a34a" : "#dc2626"}">${v.statut}</td>
      <td style="padding:6px 8px;font-size:11px">${v.commentaire ?? "—"}</td>
    </tr>
  `);

  const gpsHTML = (att.pointsGPS ?? []).slice(0, 6).map(g =>
    h`<li style="font-size:11px;margin-bottom:3px">Lat ${g.latitude.toFixed(6)}, Lon ${g.longitude.toFixed(6)}${g.description ? ` — ${g.description}` : ""}</li>`
  );

  const html = h`<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"/>
    <title>Fiche Attachement ${att.code ?? att.id}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 24px; color: #111; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1B2A4A; padding-bottom: 12px; margin-bottom: 16px; }
      .org { font-size: 11px; color: #555; }
      .title { font-size: 18px; font-weight: 800; color: #1B2A4A; }
      .ref { font-size: 13px; color: #1B2A4A; font-weight: 600; }
      .section { margin-bottom: 18px; }
      .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #1B2A4A; border-bottom: 1px solid #1B2A4A; padding-bottom: 4px; margin-bottom: 8px; letter-spacing: 0.05em; }
      .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
      .field { font-size: 11px; margin-bottom: 3px; }
      .field strong { color: #374151; display: inline-block; min-width: 160px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th { background: #1B2A4A; color: white; padding: 6px 8px; text-align: left; font-size: 10px; }
      td { border-bottom: 1px solid #f3f4f6; }
      .sig-box { border: 1px solid #d1d5db; border-radius: 6px; padding: 14px; min-height: 80px; }
      .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; }
      .montant-row { background: #f0fdf4; }
      @media print { body { padding: 10px; } }
    </style>
  </head><body>
    <div class="header">
      <div style="display:flex;align-items:center">
        <img src="/ageroute-logo.png" alt="AGEROUTE" style="height:52px;width:auto;margin-right:12px" />
        <div>
        <div class="org">AGEROUTE GUINÉE — Direction des Marchés et Contrats</div>
        <div class="title">FICHE D'ATTACHEMENT TECHNIQUE</div>
        <div class="ref">${att.code ?? "ATT-" + att.id.substring(0, 8).toUpperCase()}</div>
        </div>
      </div>
      <div style="text-align:right;font-size:11px;color:#555">
        <div>Date d'impression : ${fmtDate(new Date().toISOString())}</div>
        <div>Statut : <strong style="color:${att.statut === "VALIDE" ? "#16a34a" : "#1B2A4A"}">${STATUT_CFG[att.statut]?.label ?? att.statut}</strong></div>
        <div>Version : v${att.version}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Identification</div>
      <div class="grid2">
        <div class="field"><strong>Décompte :</strong> ${decompte?.reference ?? "—"}</div>
        <div class="field"><strong>Marché :</strong> ${marche?.reference ?? "—"}</div>
        <div class="field"><strong>Entreprise :</strong> ${marche?.entreprise?.raisonSociale ?? "—"}</div>
        <div class="field"><strong>Financement :</strong> ${marche?.financement ?? "—"}</div>
        <div class="field"><strong>Type d'attachement :</strong> ${att.typeAttachement}</div>
        <div class="field"><strong>Période :</strong> ${fmtDate(att.periodeDebut)} → ${fmtDate(att.periodeFin)}</div>
        <div class="field"><strong>Ouvrage / Section :</strong> ${att.ouvrage ?? "—"} / ${att.section ?? "—"}</div>
        <div class="field"><strong>PK :</strong> ${att.pkDebut ?? "—"} → ${att.pkFin ?? "—"}</div>
        <div class="field"><strong>Nature des travaux :</strong> ${att.natureTravaux}</div>
        <div class="field"><strong>Date de soumission :</strong> ${fmtDate(att.soumisAt)}</div>
      </div>
    </div>

    ${att.lignes?.length ? h`
    <div class="section">
      <div class="section-title">Détail des quantités exécutées (BPU)</div>
      <table>
        <tr>
          <th>Code</th><th>Désignation</th><th>Unité</th>
          <th style="text-align:right">Contrat</th>
          <th style="text-align:right">Précédent</th>
          <th style="text-align:right">Courant</th>
          <th style="text-align:right">Cumulé</th>
          <th style="text-align:right">P.U. (GNF)</th>
          <th style="text-align:right">Montant (GNF)</th>
        </tr>
        ${lignesHTML}
        <tr class="montant-row">
          <td colspan="8" style="padding:8px;text-align:right;font-weight:700;font-size:12px">TOTAL HT</td>
          <td style="padding:8px;text-align:right;font-weight:700;font-size:12px">${fmt(att.montantHtGnf)}</td>
        </tr>
        ${att.montantTvaGnf ? h`<tr><td colspan="8" style="padding:4px 8px;text-align:right;font-size:11px">TVA 18%</td><td style="padding:4px 8px;text-align:right;font-size:11px">${fmt(att.montantTvaGnf)}</td></tr>` : ""}
        ${att.montantArmpGnf ? h`<tr><td colspan="8" style="padding:4px 8px;text-align:right;font-size:11px">ARMP 0,6%</td><td style="padding:4px 8px;text-align:right;font-size:11px">${fmt(att.montantArmpGnf)}</td></tr>` : ""}
        ${att.montantTtcGnf ? h`<tr class="montant-row"><td colspan="8" style="padding:8px;text-align:right;font-weight:800;font-size:13px">TOTAL TTC</td><td style="padding:8px;text-align:right;font-weight:800;font-size:13px">${fmt(att.montantTtcGnf)}</td></tr>` : ""}
      </table>
    </div>
    ` : ""}

    ${att.pointsGPS?.length ? h`
    <div class="section">
      <div class="section-title">Points GPS de contrôle (${att.pointsGPS.length} point(s))</div>
      <ul style="margin:0;padding-left:16px">${gpsHTML}</ul>
    </div>
    ` : ""}

    ${att.observations ? h`
    <div class="section">
      <div class="section-title">Observations</div>
      <p style="font-size:11px;margin:0;padding:8px;background:#f9fafb;border-radius:4px">${att.observations}</p>
    </div>
    ` : ""}

    ${att.validations?.length ? h`
    <div class="section">
      <div class="section-title">Historique des validations</div>
      <table>
        <tr><th>Étape</th><th>Valideur</th><th>Date</th><th>Décision</th><th>Commentaire</th></tr>
        ${valHTML}
      </table>
    </div>
    ` : ""}

    <div class="sig-grid">
      <div>
        <div class="section-title">Visa Mission</div>
        <div class="sig-box">
          <div style="font-size:11px;margin-bottom:4px">Nom &amp; Prénom : .......................................................</div>
          <div style="font-size:11px;margin-bottom:4px">Date : .....................</div>
          <div style="font-size:11px;color:#6b7280">${att.valideParMission ? "✓ VALIDÉ" : "En attente"}</div>
        </div>
      </div>
      <div>
        <div class="section-title">Visa Direction Technique</div>
        <div class="sig-box">
          <div style="font-size:11px;margin-bottom:4px">Nom &amp; Prénom : .......................................................</div>
          <div style="font-size:11px;margin-bottom:4px">Date : .....................</div>
          <div style="font-size:11px;color:#6b7280">${att.valideParTechnique ? "✓ VALIDÉ le " + fmtDate(att.valideAt) : "En attente"}</div>
        </div>
      </div>
    </div>

    <div style="margin-top:24px;padding-top:8px;border-top:1px solid #e5e7eb;font-size:9px;color:#9ca3af;text-align:center">
      AGEROUTE GUINÉE — Système ERP — Document généré le ${new Date().toLocaleString("fr-GN")} — NE PAS MODIFIER
    </div>

  </body></html>`;
  ouvrirImpression(html);
}

// ===== BANDEAU MES TÂCHES =====

function MesTachesBanner({
  onOpen,
}: {
  onOpen: (id: string) => void;
}) {
  const { user } = useAuth();
  const role = user?.role ?? "";
  const rolesAvecTaches = ["MISSION", "TECHNIQUE", "DAF", "DMC", "ADMIN"];

  const { data, isLoading } = useQuery({
    queryKey: ["att-mes-taches"],
    queryFn: () => api.get("/attachements/mes-taches").then((r) => r.data),
    enabled: rolesAvecTaches.includes(role),
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const taches: Attachement[] = data?.taches ?? [];
  if (!rolesAvecTaches.includes(role) || isLoading || taches.length === 0) return null;

  const labelRole = role === "MISSION" ? "soumis pour contrôle Mission" :
                    role === "TECHNIQUE" || role === "DAF" ? "en attente de votre visa Technique" :
                    "en attente de traitement";

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-2">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="h-4 w-4 text-amber-600 shrink-0"/>
        <span className="text-sm font-bold text-amber-800">
          {taches.length} attachement{taches.length > 1 ? "s" : ""} {labelRole}
        </span>
        <span className="text-xs text-amber-600 ml-auto">Cliquez pour ouvrir la fiche de contrôle</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {taches.slice(0, 6).map((t) => (
          <button
            key={t.id}
            onClick={() => onOpen(t.id)}
            className="text-left bg-white rounded-lg border border-amber-200 px-3 py-2.5 hover:border-amber-400 hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-xs font-bold text-amber-900 truncate">{t.code ?? t.id.substring(0, 8)}</p>
                <p className="text-xs text-gray-600 truncate">{t.decompte?.marche?.entreprise?.raisonSociale}</p>
                <p className="text-xs text-gray-400 truncate">{t.decompte?.reference}</p>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <StatutBadge statut={t.statut}/>
                <span className="text-[10px] text-gray-400">
                  {t._count?.lignes ?? 0} ligne{(t._count?.lignes ?? 0) > 1 ? "s" : ""}
                  {" · "}{t._count?.medias ?? 0} photo{(t._count?.medias ?? 0) > 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </button>
        ))}
        {taches.length > 6 && (
          <div className="text-xs text-amber-600 text-center py-2">
            +{taches.length - 6} autre{taches.length - 6 > 1 ? "s" : ""}...
          </div>
        )}
      </div>
    </div>
  );
}

// ===== FICHE DE CONTRÔLE (vue complète avant validation) =====

function FicheControle({
  att,
  onAction,
  canMission,
  canTechnique,
}: {
  att: Attachement;
  onAction: (action: string, id: string, label: string) => void;
  canMission: boolean;
  canTechnique: boolean;
}) {
  const decompte = att.decompte;
  const marche = decompte?.marche;

  const fmtDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString("fr-GN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  const totalHT = Number(att.montantHtGnf ?? 0);
  const totalTTC = Number(att.montantTtcGnf ?? 0) || totalHT;

  return (
    <div className="space-y-5">
      {/* En-tête dossier */}
      <div className="bg-navy/5 rounded-xl p-4 border border-navy/10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-500">Attachement</p>
            <p className="font-mono font-bold text-navy">{att.code ?? att.id.substring(0, 8)}</p>
            <StatutBadge statut={att.statut}/>
          </div>
          <div>
            <p className="text-xs text-gray-500">Décompte</p>
            <p className="font-semibold text-gray-800">{decompte?.reference ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Marché</p>
            <p className="font-semibold text-gray-800">{marche?.reference ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Entreprise</p>
            <p className="font-semibold text-gray-800">{marche?.entreprise?.raisonSociale ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Période</p>
            <p className="text-sm">{fmtDate(att.periodeDebut)} → {fmtDate(att.periodeFin)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Financement</p>
            <p className="text-sm">{marche?.financement ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Ouvrage / Section</p>
            <p className="text-sm">{att.ouvrage ?? "—"} / {att.section ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">PK</p>
            <p className="text-sm">{att.pkDebut ?? "—"} → {att.pkFin ?? "—"}</p>
          </div>
        </div>
        {att.natureTravaux && (
          <div className="mt-3 pt-3 border-t border-navy/10">
            <p className="text-xs text-gray-500">Nature des travaux</p>
            <p className="text-sm font-medium text-gray-800">{att.natureTravaux}</p>
          </div>
        )}
      </div>

      {/* Tableau BPU */}
      {att.lignes?.length > 0 ? (
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
            <LayoutList className="h-4 w-4 text-navy"/> Détail des quantités exécutées — BPU ({att.lignes.length} article{att.lignes.length > 1 ? "s" : ""})
          </h3>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-navy text-white">
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Désignation</th>
                  <th className="px-3 py-2 text-center">Unité</th>
                  <th className="px-3 py-2 text-right">Contrat</th>
                  <th className="px-3 py-2 text-right">Précéd.</th>
                  <th className="px-3 py-2 text-right bg-amber-700">Courant</th>
                  <th className="px-3 py-2 text-right">Cumulé</th>
                  <th className="px-3 py-2 text-right">P.U. (GNF)</th>
                  <th className="px-3 py-2 text-right">Montant</th>
                  <th className="px-3 py-2 text-center">État</th>
                </tr>
              </thead>
              <tbody>
                {att.lignes.map((l, i) => (
                  <tr key={l.id} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"} ${l.depassement ? "bg-red-50" : ""}`}>
                    <td className="px-3 py-2 font-mono font-bold text-navy">{l.codeArticle}</td>
                    <td className="px-3 py-2 max-w-[180px]">
                      <p className="truncate">{l.designation}</p>
                      {l.observations && <p className="text-gray-400 text-[10px] truncate">{l.observations}</p>}
                    </td>
                    <td className="px-3 py-2 text-center text-gray-500">{l.unite}</td>
                    <td className="px-3 py-2 text-right">{Number(l.quantiteContrat).toLocaleString("fr-GN")}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{Number(l.quantitePrecedent).toLocaleString("fr-GN")}</td>
                    <td className="px-3 py-2 text-right font-bold text-amber-700 bg-amber-50">{Number(l.quantiteCourante).toLocaleString("fr-GN")}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${l.depassement ? "text-red-600" : "text-gray-700"}`}>
                      {Number(l.quantiteCumulee).toLocaleString("fr-GN")}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">{Number(l.prixUnitaire).toLocaleString("fr-GN")}</td>
                    <td className="px-3 py-2 text-right font-bold">{Number(l.montant).toLocaleString("fr-GN")}</td>
                    <td className="px-3 py-2 text-center">
                      {l.depassement
                        ? <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">DÉPASSE</span>
                        : <span className="text-[10px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded">OK</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-navy/5 border-t-2 border-navy">
                  <td colSpan={8} className="px-3 py-2 text-right font-bold text-sm">TOTAL HT</td>
                  <td className="px-3 py-2 text-right font-bold text-sm text-navy">{totalHT.toLocaleString("fr-GN")} GNF</td>
                  <td/>
                </tr>
                {att.montantTvaGnf && (
                  <tr className="bg-gray-50">
                    <td colSpan={8} className="px-3 py-1.5 text-right text-xs text-gray-500">TVA 18%</td>
                    <td className="px-3 py-1.5 text-right text-xs">{Number(att.montantTvaGnf).toLocaleString("fr-GN")} GNF</td>
                    <td/>
                  </tr>
                )}
                {att.montantArmpGnf && (
                  <tr className="bg-gray-50">
                    <td colSpan={8} className="px-3 py-1.5 text-right text-xs text-gray-500">ARMP 0,6%</td>
                    <td className="px-3 py-1.5 text-right text-xs">{Number(att.montantArmpGnf).toLocaleString("fr-GN")} GNF</td>
                    <td/>
                  </tr>
                )}
                {att.montantTtcGnf && (
                  <tr className="bg-green-50 border-t border-green-200">
                    <td colSpan={8} className="px-3 py-2 text-right font-bold text-sm text-green-800">TOTAL TTC</td>
                    <td className="px-3 py-2 text-right font-bold text-sm text-green-800">{totalTTC.toLocaleString("fr-GN")} GNF</td>
                    <td/>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
          {att.lignes.some(l => l.depassement) && (
            <div className="mt-2 flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0"/>
              Attention : {att.lignes.filter(l => l.depassement).length} ligne(s) dépassent le quantity prévue au contrat
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-6 text-center">
          <Package className="h-8 w-8 text-amber-400 mx-auto mb-2"/>
          <p className="text-sm text-amber-700 font-medium">Aucune ligne BPU renseignée</p>
          <p className="text-xs text-amber-500 mt-1">L'attachement doit avoir des lignes BPU pour être validé</p>
        </div>
      )}

      {/* Preuves terrain */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Photos */}
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
            <Camera className="h-4 w-4 text-blue-600"/> Photos ({att.medias?.length ?? 0})
          </h3>
          {att.medias?.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {att.medias.slice(0, 9).map((m) => (
                <SecureFileLink key={m.id} href={m.urlPublique ?? undefined}
                   title={m.urlPublique ? "Cliquer pour ouvrir le document" : "Fichier non disponible"}
                   className={`aspect-square rounded-lg bg-gray-100 border border-gray-200 overflow-hidden relative group block ${m.urlPublique ? "cursor-pointer hover:border-navy/50 hover:shadow" : "cursor-default"}`}>
                  {m.urlPublique ? (
                    <SecureImg
                      src={m.urlPublique}
                      alt={m.legende ?? "Photo"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                      <ImageIcon className="h-6 w-6"/>
                      <p className="text-[9px] mt-1 px-1 text-center truncate w-full">{m.cheminFichier.split("/").pop()}</p>
                    </div>
                  )}
                  {m.legende && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate">{m.legende}</div>
                  )}
                </SecureFileLink>
              ))}
              {att.medias.length > 9 && (
                <div className="aspect-square rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-xs text-gray-500">
                  +{att.medias.length - 9}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center">
              <Camera className="h-6 w-6 text-gray-300 mx-auto mb-1"/>
              <p className="text-xs text-gray-400">Aucune photo</p>
            </div>
          )}
        </div>

        {/* GPS */}
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
            <Navigation className="h-4 w-4 text-green-600"/> Points GPS ({att.pointsGPS?.length ?? 0})
          </h3>
          {att.pointsGPS?.length > 0 ? (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {att.pointsGPS.map((g, i) => (
                <div key={g.id} className="flex items-start gap-2 bg-green-50 rounded-lg px-3 py-2 text-xs">
                  <MapPin className="h-3.5 w-3.5 text-green-600 shrink-0 mt-0.5"/>
                  <div>
                    <p className="font-mono font-bold text-green-800">#{i + 1} — {g.latitude.toFixed(6)}, {g.longitude.toFixed(6)}</p>
                    {g.altitude && <p className="text-green-600">Alt: {g.altitude}m · Préc: ±{g.precision ?? "?"}m</p>}
                    {g.description && <p className="text-gray-600 mt-0.5">{g.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center">
              <Navigation className="h-6 w-6 text-gray-300 mx-auto mb-1"/>
              <p className="text-xs text-gray-400">Aucun point GPS</p>
            </div>
          )}
        </div>
      </div>

      {/* Validations précédentes */}
      {att.validations?.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
            <History className="h-4 w-4 text-purple-600"/> Historique des validations ({att.validations.length})
          </h3>
          <div className="space-y-2">
            {att.validations.map((v) => (
              <div key={v.id} className={`rounded-lg border px-4 py-3 flex items-start justify-between gap-3 ${
                v.statut === "APPROUVE" ? "border-green-200 bg-green-50" :
                v.statut === "CORRECTION" ? "border-amber-200 bg-amber-50" :
                "border-red-200 bg-red-50"
              }`}>
                <div className="flex items-center gap-2 shrink-0">
                  {v.statut === "APPROUVE"
                    ? <CheckCircle className="h-4 w-4 text-green-600"/>
                    : v.statut === "CORRECTION"
                    ? <AlertTriangle className="h-4 w-4 text-amber-500"/>
                    : <XCircle className="h-4 w-4 text-red-600"/>
                  }
                  <div>
                    <p className="text-xs font-bold text-gray-700">{v.etape}</p>
                    <p className="text-[10px] text-gray-500">{v.valideNom ?? v.validePar}</p>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600">{v.commentaire}</p>
                </div>
                <div className="shrink-0 text-[10px] text-gray-400 text-right">
                  {new Date(v.valideAt).toLocaleDateString("fr-GN")}
                  <br/>
                  {new Date(v.valideAt).toLocaleTimeString("fr-GN", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Motif de rejet */}
      {att.motifRejet && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-bold text-red-800 flex items-center gap-2">
            <XCircle className="h-4 w-4"/> Motif de rejet / correction requise
          </p>
          <p className="text-sm text-red-700 mt-1">{att.motifRejet}</p>
        </div>
      )}

      {/* Commentaires */}
      {att.commentaires?.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-gray-500"/> Commentaires ({att.commentaires.length})
          </h3>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {att.commentaires.map((c) => (
              <div key={c.id} className={`rounded-lg px-3 py-2 text-xs border ${
                c.type === "CORRECTION" ? "border-amber-200 bg-amber-50" : "border-gray-100 bg-gray-50"
              }`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-bold text-gray-700">{c.auteurNom ?? "—"}</span>
                  <span className="text-gray-400">({c.auteurRole})</span>
                  <span className="ml-auto text-gray-400">{new Date(c.createdAt).toLocaleDateString("fr-GN")}</span>
                </div>
                <p className="text-gray-600">{c.contenu}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Zone de validation — uniquement si l'attachement attend une action de ce rôle */}
      {(att.statut === "SOUMIS" && canMission) && (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-5">
          <p className="text-sm font-bold text-amber-900 mb-1 flex items-center gap-2">
            <Eye className="h-4 w-4"/> Votre action est requise — Étape MISSION
          </p>
          <p className="text-xs text-amber-700 mb-3">
            Après avoir lu le dossier complet ci-dessus, veuillez donner votre avis et valider ou demander une correction.
          </p>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => onAction("valider-mission", att.id, "Valider Mission")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors"
            >
              <CheckCircle className="h-4 w-4"/> Valider — Transmettre à la Direction Technique
            </button>
            <button
              onClick={() => onAction("corriger", att.id, "Demander correction")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-colors"
            >
              <AlertTriangle className="h-4 w-4"/> Demander une correction
            </button>
          </div>
        </div>
      )}
      {(att.statut === "EN_CONTROLE_TECHNIQUE" && canTechnique) && (
        <div className="rounded-xl border-2 border-purple-400 bg-purple-50 p-5">
          <p className="text-sm font-bold text-purple-900 mb-1 flex items-center gap-2">
            <Shield className="h-4 w-4"/> Votre action est requise — Étape DIRECTION TECHNIQUE
          </p>
          <p className="text-xs text-purple-700 mb-3">
            La Mission a validé cet attachement. Après votre contrôle du dossier complet, validez définitivement ou demandez une correction.
          </p>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => onAction("valider-technique", att.id, "Valider définitivement")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors"
            >
              <CheckCircle className="h-4 w-4"/> Valider définitivement
            </button>
            <button
              onClick={() => onAction("corriger", att.id, "Demander correction")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-colors"
            >
              <AlertTriangle className="h-4 w-4"/> Demander une correction
            </button>
            <button
              onClick={() => onAction("rejeter", att.id, "Rejeter définitivement")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
            >
              <XCircle className="h-4 w-4"/> Rejeter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== COMPOSANT PRINCIPAL =====

export function AttachementsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const role = user?.role ?? "";

  // Filtres liste
  const [filterStatut, setFilterStatut] = useState("");
  const [filterType, setFilterType] = useState("");

  // Modaux
  const [createModal, setCreateModal] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Ouverture directe depuis le détail d'un décompte : /attachements?id=<attachementId>
  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get("id");
    if (pid) setDetailId(pid);
  }, []);
  const [activeTab, setActiveTab] = useState<"fiche" | "lignes" | "gps" | "medias" | "audit">("fiche");
  const [workflowModal, setWorkflowModal] = useState<{ action: string; id: string; label: string } | null>(null);
  const [confirmSuppr, setConfirmSuppr] = useState<string | null>(null);
  const [workflowComment, setWorkflowComment] = useState("");
  const [addLigneModal, setAddLigneModal] = useState(false);
  const [addGpsModal, setAddGpsModal] = useState(false);
  const [addMediaModal, setAddMediaModal] = useState(false);

  // Formulaires
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [ligneForm, setLigneForm] = useState<Record<string, unknown>>({});
  const [gpsForm, setGpsForm] = useState<Record<string, unknown>>({});
  const [mediaForm, setMediaForm] = useState<Record<string, unknown>>({});

  // Droits
  const canAdmin = ["ADMIN", "DMC"].includes(role);
  const canMission = ["ADMIN", "DMC", "MISSION"].includes(role);
  const canTechnique = ["ADMIN", "DMC", "TECHNIQUE", "DAF"].includes(role);
  const canWrite = ["ADMIN", "DMC", "ENTREPRISE"].includes(role);

  // ===== QUERIES =====

  const { data: stats } = useQuery({
    queryKey: ["att-stats"],
    queryFn: () => api.get("/attachements/stats").then((r) => r.data),
  });

  const { data: listData, isLoading } = useQuery({
    queryKey: ["attachements", filterStatut, filterType],
    queryFn: () =>
      api.get("/attachements", {
        params: {
          statut: filterStatut || undefined,
          typeAttachement: filterType || undefined,
          pageSize: 50,
        },
      }).then((r) => r.data),
  });

  const { data: decomptes } = useQuery({
    queryKey: ["decomptes-sel"],
    queryFn: () => api.get("/decomptes", { params: { pageSize: 200 } }).then((r) => r.data.data),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["att-detail", detailId],
    queryFn: () => api.get(`/attachements/${detailId}`).then((r) => r.data),
    enabled: !!detailId,
  });

  const { data: auditLogs } = useQuery({
    queryKey: ["att-audit", detailId],
    queryFn: () => api.get(`/attachements/${detailId}/audit`).then((r) => r.data),
    enabled: !!detailId && activeTab === "audit",
  });

  // ===== MUTATIONS =====

  const createMut = useMutation({
    mutationFn: (body: object) => api.post("/attachements", body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attachements"] });
      qc.invalidateQueries({ queryKey: ["att-stats"] });
      qc.invalidateQueries({ queryKey: ["att-mes-taches"] });
      toast.success("Attachement créé");
      setCreateModal(false);
      setForm({});
    },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const workflowMut = useMutation({
    mutationFn: ({ action, id, commentaire }: { action: string; id: string; commentaire: string }) =>
      api.post(`/attachements/${id}/${action}`, { commentaire, motif: commentaire }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attachements"] });
      qc.invalidateQueries({ queryKey: ["att-stats"] });
      qc.invalidateQueries({ queryKey: ["att-detail", detailId] });
      qc.invalidateQueries({ queryKey: ["att-mes-taches"] });
      toast.success("Action enregistrée");
      setWorkflowModal(null);
      setWorkflowComment("");
    },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const addLigneMut = useMutation({
    mutationFn: (body: object) => api.post(`/attachements/${detailId}/lignes`, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["att-detail", detailId] });
      toast.success("Ligne ajoutée");
      setAddLigneModal(false);
      setLigneForm({});
    },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const addGpsMut = useMutation({
    mutationFn: (body: object) => api.post(`/attachements/${detailId}/gps`, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["att-detail", detailId] });
      toast.success("Point GPS ajouté");
      setAddGpsModal(false);
      setGpsForm({});
    },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const addMediaMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      // Si un fichier a été choisi, on l'uploade d'abord puis on lie le média
      const file = body._file as File | undefined;
      const payload: Record<string, unknown> = { type: body.type ?? "DOCUMENT", legende: body.legende };
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const up = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data);
        payload.cheminFichier = up.originalName ?? up.filename;
        payload.urlPublique = up.url;
      } else {
        payload.cheminFichier = body.cheminFichier;
        payload.urlPublique = body.urlPublique;
      }
      if (!payload.cheminFichier) throw new Error("Choisissez un fichier à joindre");
      return api.post(`/attachements/${detailId}/medias`, payload).then((r) => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["att-detail", detailId] });
      toast.success("Photo ajoutée");
      setAddMediaModal(false);
      setMediaForm({});
    },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/attachements/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attachements"] });
      qc.invalidateQueries({ queryKey: ["att-stats"] });
      qc.invalidateQueries({ queryKey: ["att-mes-taches"] });
      toast.success("Attachement supprimé");
      setDetailId(null);
    },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const items: Attachement[] = Array.isArray(listData?.data) ? listData.data : [];

  function openDetail(id: string) {
    setDetailId(id);
    // Si c'est un attachement en attente de notre action → ouvrir sur la fiche de contrôle
    setActiveTab("fiche");
  }

  function handleWorkflowAction(action: string, id: string, label: string) {
    setWorkflowModal({ action, id, label });
    setWorkflowComment("");
  }

  function submitAction() {
    if (!workflowModal) return;
    const isValidation = workflowModal.action.includes("valider");
    if (isValidation && workflowComment.trim().length < 5) {
      toast.error("Un commentaire d'au moins 5 caractères est requis pour valider");
      return;
    }
    if (!isValidation && workflowComment.trim().length < 3) {
      toast.error("Précisez le motif (3 caractères minimum)");
      return;
    }
    workflowMut.mutate({ action: workflowModal.action, id: workflowModal.id, commentaire: workflowComment });
  }

  // ===== RENDER =====

  return (
    <div className="space-y-4">

      {/* ── BANDEAU MES TÂCHES ── */}
      <MesTachesBanner onOpen={openDetail}/>

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "Total", value: stats?.total ?? 0, color: "#1B2A4A", Icon: Paperclip },
          { label: "En cours", value: (stats?.soumis ?? 0) + (stats?.enControle ?? 0), color: "#D97706", Icon: Clock },
          { label: "Validés", value: stats?.valides ?? 0, color: "#16A34A", Icon: CheckCircle },
          { label: "Rejetés", value: stats?.rejetes ?? 0, color: "#DC2626", Icon: XCircle },
          { label: "Dépassements", value: stats?.depassements ?? 0, color: "#7C3AED", Icon: TrendingUp },
          { label: "Médias", value: stats?.totalMedias ?? 0, color: "#0891B2", Icon: Camera },
          { label: "Points GPS", value: stats?.totalGPS ?? 0, color: "#0F766E", Icon: Navigation },
        ].map(({ label, value, color, Icon }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + "22" }}>
              <Icon className="h-4 w-4" style={{ color }}/>
            </div>
            <div>
              <p className="text-xl font-bold text-navy">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── FILTRES + BOUTON CRÉER ── */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} className="w-48">
          <option value="">Tous les statuts</option>
          <option value="BROUILLON">Brouillon</option>
          <option value="SOUMIS">Soumis</option>
          <option value="EN_CONTROLE_MISSION">Contrôle Mission</option>
          <option value="EN_CONTROLE_TECHNIQUE">Contrôle Technique</option>
          <option value="DEMANDE_CORRECTION">Correction requise</option>
          <option value="VALIDE">Validé</option>
          <option value="REJETE">Rejeté</option>
        </Select>
        <Select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-40">
          <option value="">Tous types</option>
          <option value="MENSUEL">Mensuel</option>
          <option value="PARTIEL">Partiel</option>
          <option value="FINAL">Final</option>
        </Select>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["attachements"] })}
          className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:text-navy transition-colors"
        >
          <RefreshCw className="h-4 w-4"/>
        </button>
        <div className="ml-auto">
          {canWrite && (
            <Button onClick={() => setCreateModal(true)}>
              <Plus className="h-4 w-4 mr-1"/> Nouvel attachement
            </Button>
          )}
        </div>
      </div>

      {/* ── LISTE ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse"/>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <Paperclip className="h-10 w-10 text-gray-200 mx-auto mb-3"/>
            <p className="text-sm text-gray-400">Aucun attachement trouvé</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Décompte / Entreprise</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Montant HT</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Statut</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Preuves</th>
                <th className="px-4 py-3"/>
              </tr>
            </thead>
            <tbody>
              {items.map((att) => (
                <tr
                  key={att.id}
                  className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors"
                  onClick={() => openDetail(att.id)}
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-bold text-navy">{att.code ?? att.id.substring(0, 8)}</span>
                    <p className="text-[10px] text-gray-400">v{att.version}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{att.decompte?.reference ?? "—"}</p>
                    <p className="text-xs text-gray-400">{att.decompte?.marche?.entreprise?.raisonSociale ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{att.typeAttachement}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-sm">{fmtGnf(att.montantHtGnf)}</p>
                    <p className="text-[10px] text-gray-400">{att._count?.lignes ?? 0} ligne(s)</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatutBadge statut={att.statut}/>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Camera className="h-3 w-3"/>{att._count?.medias ?? 0}
                      <Navigation className="h-3 w-3"/>{att._count?.pointsGPS ?? 0}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight className="h-4 w-4 text-gray-300"/>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── MODAL DÉTAIL / FICHE DE CONTRÔLE ── */}
      {detailId && (
        <Modal
          open={!!detailId}
          onClose={() => setDetailId(null)}
          title={detail ? `${detail.code ?? "Attachement"} — ${STATUT_CFG[detail.statut as StatutAtt]?.label ?? detail.statut}` : "Chargement..."}
          size="xl"
        >
          {detailLoading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse"/>
              ))}
            </div>
          ) : detail ? (
            <div>
              {/* Barre d'onglets */}
              <div className="flex items-center gap-1 px-4 pt-2 pb-0 border-b border-gray-100 overflow-x-auto">
                {(["fiche", "lignes", "gps", "medias", "audit"] as const).map((tab) => {
                  const TABS = {
                    fiche:  { label: "Fiche de contrôle", Icon: FileText },
                    lignes: { label: `Lignes BPU (${detail.lignes?.length ?? 0})`, Icon: LayoutList },
                    gps:    { label: `GPS (${detail.pointsGPS?.length ?? 0})`, Icon: Navigation },
                    medias: { label: `Photos (${detail.medias?.length ?? 0})`, Icon: Camera },
                    audit:  { label: "Audit", Icon: History },
                  };
                  const t = TABS[tab];
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
                        activeTab === tab
                          ? "border-navy text-navy"
                          : "border-transparent text-gray-400 hover:text-navy"
                      }`}
                    >
                      <t.Icon className="h-3.5 w-3.5"/>
                      {t.label}
                    </button>
                  );
                })}
                {/* Boutons action rapide */}
                <div className="ml-auto flex items-center gap-2 px-2">
                  <button
                    onClick={() => imprimerFiche(detail)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:border-navy hover:text-navy transition-colors"
                    title="Imprimer la fiche officielle"
                  >
                    <Printer className="h-3.5 w-3.5"/> Imprimer
                  </button>
                  {canAdmin && (detail.statut === "BROUILLON" || detail.statut === "DEMANDE_CORRECTION") && (
                    <button
                      onClick={() => setConfirmSuppr(detail.id)}
                      className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5"/>
                    </button>
                  )}
                </div>
              </div>

              <ConfirmDialog
                open={confirmSuppr !== null} danger title="Supprimer cet attachement ?"
                message={<>L'attachement <b>{detail.code ?? ""}</b> et ses lignes/mesures seront définitivement supprimés. Cette action est tracée en audit.</>}
                confirmLabel="Supprimer l'attachement" loading={deleteMut.isPending}
                onClose={() => setConfirmSuppr(null)}
                onConfirm={() => { if (confirmSuppr) deleteMut.mutate(confirmSuppr); setConfirmSuppr(null); }}
              />

              {/* Contenu onglet */}
              <div className="p-4 max-h-[70vh] overflow-y-auto">
                {activeTab === "fiche" && (
                  <FicheControle
                    att={detail}
                    onAction={handleWorkflowAction}
                    canMission={canMission}
                    canTechnique={canTechnique}
                  />
                )}

                {activeTab === "lignes" && (
                  <div className="space-y-3">
                    {canWrite && (detail.statut === "BROUILLON" || detail.statut === "DEMANDE_CORRECTION") && (
                      <Button size="sm" onClick={() => setAddLigneModal(true)}>
                        <Plus className="h-3.5 w-3.5 mr-1"/> Ajouter une ligne BPU
                      </Button>
                    )}
                    {detail.lignes?.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">Aucune ligne BPU</p>
                    ) : (
                      detail.lignes.map((l: any) => (
                        <div key={l.id} className={`rounded-xl border p-3 ${l.depassement ? "border-red-200 bg-red-50" : "border-gray-100"}`}>
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-mono text-xs font-bold text-navy">{l.codeArticle}</p>
                              <p className="text-sm font-medium">{l.designation}</p>
                            </div>
                            {l.depassement && <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded">DÉPASSEMENT</span>}
                          </div>
                          <div className="grid grid-cols-4 gap-2 mt-2 text-xs text-gray-600">
                            <div><span className="text-gray-400">Contrat :</span> {Number(l.quantiteContrat).toLocaleString("fr-GN")} {l.unite}</div>
                            <div><span className="text-gray-400">Précéd. :</span> {Number(l.quantitePrecedent).toLocaleString("fr-GN")}</div>
                            <div className="font-bold text-amber-700"><span className="text-gray-400">Courant :</span> {Number(l.quantiteCourante).toLocaleString("fr-GN")}</div>
                            <div><span className="text-gray-400">Montant :</span> {fmtGnf(l.montant)}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === "gps" && (
                  <div className="space-y-3">
                    {canWrite && (detail.statut === "BROUILLON" || detail.statut === "DEMANDE_CORRECTION" || detail.statut === "SOUMIS") && (
                      <Button size="sm" onClick={() => setAddGpsModal(true)}>
                        <Plus className="h-3.5 w-3.5 mr-1"/> Ajouter point GPS
                      </Button>
                    )}
                    {detail.pointsGPS?.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">Aucun point GPS</p>
                    ) : (
                      detail.pointsGPS.map((g: any, i: number) => (
                        <div key={g.id} className="flex items-start gap-3 bg-green-50 rounded-xl border border-green-100 p-3">
                          <MapPin className="h-4 w-4 text-green-600 shrink-0 mt-0.5"/>
                          <div className="text-xs">
                            <p className="font-bold text-green-800">Point #{i + 1}</p>
                            <p className="font-mono">Lat {g.latitude.toFixed(6)}, Lon {g.longitude.toFixed(6)}</p>
                            {g.altitude && <p className="text-green-600">Altitude {g.altitude}m · Précision ±{g.precision ?? "?"}m</p>}
                            {g.description && <p className="text-gray-600 mt-0.5">{g.description}</p>}
                            {g.capturePar && <p className="text-gray-400">Par {g.capturePar}</p>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === "medias" && (
                  <div className="space-y-3">
                    {canWrite && (
                      <Button size="sm" onClick={() => setAddMediaModal(true)}>
                        <Plus className="h-3.5 w-3.5 mr-1"/> Ajouter une photo
                      </Button>
                    )}
                    {detail.medias?.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">Aucune photo</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-3">
                        {detail.medias.map((m: any) => (
                          <SecureFileLink key={m.id} href={m.urlPublique ?? undefined}
                             title={m.urlPublique ? "Cliquer pour ouvrir" : "Fichier non disponible"}
                             className={`rounded-xl border border-gray-200 overflow-hidden block ${m.urlPublique ? "hover:border-navy/50 hover:shadow transition-all" : "opacity-70"}`}>
                            <div className="aspect-square bg-gray-100 relative">
                              {m.urlPublique && m.type !== "DOCUMENT" ? (
                                <SecureImg src={m.urlPublique} alt={m.legende ?? "Photo"} className="w-full h-full object-cover"/>
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                                  <ImageIcon className="h-8 w-8"/>
                                  {m.urlPublique && <p className="text-[9px] text-navy font-bold mt-1">Ouvrir le document</p>}
                                </div>
                              )}
                            </div>
                            {m.legende && <p className="text-xs text-gray-600 px-2 py-1.5 truncate">{m.legende}</p>}
                            <p className="text-[10px] text-gray-400 px-2 pb-1.5 truncate">{m.cheminFichier.split("/").pop()}</p>
                          </SecureFileLink>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "audit" && (
                  <div className="space-y-2">
                    {!auditLogs ? (
                      <p className="text-sm text-gray-400 text-center py-8">Chargement de l'audit...</p>
                    ) : (auditLogs as Array<{ id: string; action: string; user?: { email: string; role: string }; createdAt: string; after?: object; before?: object }>).length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">Aucune entrée d'audit</p>
                    ) : (
                      (auditLogs as Array<{ id: string; action: string; user?: { email: string; role: string }; createdAt: string }>).map((log) => (
                        <div key={log.id} className="flex items-center gap-3 text-xs bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                          <Activity className="h-3.5 w-3.5 text-gray-400 shrink-0"/>
                          <span className="font-bold text-navy">{log.action}</span>
                          <span className="text-gray-500">{log.user?.email}</span>
                          <span className="text-gray-400">({log.user?.role})</span>
                          <span className="ml-auto text-gray-400">{new Date(log.createdAt).toLocaleString("fr-GN")}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </Modal>
      )}

      {/* ── MODAL CONFIRMATION ACTION ── */}
      {workflowModal && (
        <Modal
          open={!!workflowModal}
          onClose={() => setWorkflowModal(null)}
          title={workflowModal.label}
          size="md"
        >
          <div className="p-4 space-y-4">
            <p className="text-sm text-gray-600">
              {workflowModal.action.includes("valider")
                ? "Un commentaire de validation est obligatoire (min. 5 caractères)."
                : "Précisez le motif de correction ou de rejet (min. 3 caractères)."}
            </p>
            <FormField label="Commentaire / Avis">
              <Textarea
                value={workflowComment}
                onChange={(e) => setWorkflowComment(e.target.value)}
                rows={4}
                placeholder={workflowModal.action.includes("valider")
                  ? "Ex : Quantités vérifiées sur terrain, conforme au BPU signé, GPS cohérent..."
                  : "Ex : Quantité cumulée dépasse le contrat, corriger la ligne 3..."}
              />
            </FormField>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setWorkflowModal(null)}>Annuler</Button>
              <Button
                onClick={submitAction}
                disabled={workflowMut.isPending}
                className={workflowModal.action === "rejeter" ? "bg-red-600 hover:bg-red-700" : ""}
              >
                {workflowMut.isPending ? "En cours..." : "Confirmer"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── MODAL CRÉER ── */}
      {createModal && (
        <Modal open={createModal} onClose={() => { setCreateModal(false); setForm({}); }} title="Nouvel attachement" size="lg">
          <div className="p-4 space-y-4">
            <FormField label="Décompte associé *">
              <Select value={form.decompteId as string ?? ""} onChange={(e) => setForm({ ...form, decompteId: e.target.value })}>
                <option value="">— Sélectionner un décompte —</option>
                {(decomptes ?? []).map((d: { id: string; reference: string; marche?: { reference: string } }) => (
                  <option key={d.id} value={d.id}>{d.reference} — {d.marche?.reference}</option>
                ))}
              </Select>
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Type">
                <Select value={form.typeAttachement as string ?? "MENSUEL"} onChange={(e) => setForm({ ...form, typeAttachement: e.target.value })}>
                  <option value="MENSUEL">Mensuel</option>
                  <option value="PARTIEL">Partiel</option>
                  <option value="FINAL">Final</option>
                </Select>
              </FormField>
              <FormField label="Période début">
                <Input type="date" value={form.periodeDebut as string ?? ""} onChange={(e) => setForm({ ...form, periodeDebut: e.target.value })}/>
              </FormField>
              <FormField label="Période fin">
                <Input type="date" value={form.periodeFin as string ?? ""} onChange={(e) => setForm({ ...form, periodeFin: e.target.value })}/>
              </FormField>
              <FormField label="Ouvrage">
                <Input value={form.ouvrage as string ?? ""} onChange={(e) => setForm({ ...form, ouvrage: e.target.value })} placeholder="Ex: Pont RN1-K14"/>
              </FormField>
              <FormField label="Section">
                <Input value={form.section as string ?? ""} onChange={(e) => setForm({ ...form, section: e.target.value })}/>
              </FormField>
              <FormField label="PK début">
                <Input type="number" value={form.pkDebut as string ?? ""} onChange={(e) => setForm({ ...form, pkDebut: Number(e.target.value) })}/>
              </FormField>
            </div>
            <FormField label="Nature des travaux *">
              <Input value={form.natureTravaux as string ?? ""} onChange={(e) => setForm({ ...form, natureTravaux: e.target.value })} placeholder="Ex: Terrassement, couche de fondation..."/>
            </FormField>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Unité *">
                <Input value={form.unite as string ?? ""} onChange={(e) => setForm({ ...form, unite: e.target.value })} placeholder="m³, ml, m²..."/>
              </FormField>
              <FormField label="Quantité prévue *">
                <Input type="number" value={form.quantitePrevue as string ?? ""} onChange={(e) => setForm({ ...form, quantitePrevue: Number(e.target.value) })}/>
              </FormField>
              <FormField label="Quantité exécutée *">
                <Input type="number" value={form.quantiteExecutee as string ?? ""} onChange={(e) => setForm({ ...form, quantiteExecutee: Number(e.target.value) })}/>
              </FormField>
            </div>
            <FormField label="Prix unitaire (GNF) *">
              <Input type="number" value={form.prixUnitaireGnf as string ?? ""} onChange={(e) => setForm({ ...form, prixUnitaireGnf: Number(e.target.value) })}/>
            </FormField>
            <FormField label="Observations">
              <Textarea value={form.observations as string ?? ""} onChange={(e) => setForm({ ...form, observations: e.target.value })} rows={2}/>
            </FormField>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => { setCreateModal(false); setForm({}); }}>Annuler</Button>
              <Button onClick={() => createMut.mutate(form)} disabled={createMut.isPending}>
                {createMut.isPending ? "Création..." : "Créer l'attachement"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── MODAL AJOUTER LIGNE BPU ── */}
      {addLigneModal && (
        <Modal open={addLigneModal} onClose={() => { setAddLigneModal(false); setLigneForm({}); }} title="Ajouter une ligne BPU" size="md">
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Code article *">
                <Input value={ligneForm.codeArticle as string ?? ""} onChange={(e) => setLigneForm({ ...ligneForm, codeArticle: e.target.value })}/>
              </FormField>
              <FormField label="Unité *">
                <Input value={ligneForm.unite as string ?? ""} onChange={(e) => setLigneForm({ ...ligneForm, unite: e.target.value })} placeholder="m³, ml, m²..."/>
              </FormField>
            </div>
            <FormField label="Désignation *">
              <Input value={ligneForm.designation as string ?? ""} onChange={(e) => setLigneForm({ ...ligneForm, designation: e.target.value })}/>
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Qté contrat *">
                <Input type="number" value={ligneForm.quantiteContrat as string ?? ""} onChange={(e) => setLigneForm({ ...ligneForm, quantiteContrat: Number(e.target.value) })}/>
              </FormField>
              <FormField label="Qté précédente">
                <Input type="number" value={ligneForm.quantitePrecedent as string ?? "0"} onChange={(e) => setLigneForm({ ...ligneForm, quantitePrecedent: Number(e.target.value) })}/>
              </FormField>
              <FormField label="Qté courante *">
                <Input type="number" value={ligneForm.quantiteCourante as string ?? ""} onChange={(e) => setLigneForm({ ...ligneForm, quantiteCourante: Number(e.target.value) })}/>
              </FormField>
              <FormField label="Prix unitaire (GNF) *">
                <Input type="number" value={ligneForm.prixUnitaire as string ?? ""} onChange={(e) => setLigneForm({ ...ligneForm, prixUnitaire: Number(e.target.value) })}/>
              </FormField>
            </div>
            <FormField label="Observations">
              <Input value={ligneForm.observations as string ?? ""} onChange={(e) => setLigneForm({ ...ligneForm, observations: e.target.value })}/>
            </FormField>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => { setAddLigneModal(false); setLigneForm({}); }}>Annuler</Button>
              <Button onClick={() => addLigneMut.mutate(ligneForm)} disabled={addLigneMut.isPending}>
                {addLigneMut.isPending ? "Ajout..." : "Ajouter la ligne"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── MODAL AJOUTER GPS ── */}
      {addGpsModal && (
        <Modal open={addGpsModal} onClose={() => { setAddGpsModal(false); setGpsForm({}); }} title="Ajouter un point GPS" size="sm">
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Latitude *">
                <Input type="number" step="0.000001" value={gpsForm.latitude as string ?? ""} onChange={(e) => setGpsForm({ ...gpsForm, latitude: Number(e.target.value) })}/>
              </FormField>
              <FormField label="Longitude *">
                <Input type="number" step="0.000001" value={gpsForm.longitude as string ?? ""} onChange={(e) => setGpsForm({ ...gpsForm, longitude: Number(e.target.value) })}/>
              </FormField>
              <FormField label="Altitude (m)">
                <Input type="number" value={gpsForm.altitude as string ?? ""} onChange={(e) => setGpsForm({ ...gpsForm, altitude: Number(e.target.value) })}/>
              </FormField>
              <FormField label="Précision (m)">
                <Input type="number" value={gpsForm.precision as string ?? ""} onChange={(e) => setGpsForm({ ...gpsForm, precision: Number(e.target.value) })}/>
              </FormField>
            </div>
            <FormField label="Description du point">
              <Input value={gpsForm.description as string ?? ""} onChange={(e) => setGpsForm({ ...gpsForm, description: e.target.value })} placeholder="Ex: Début de section, tête de pont..."/>
            </FormField>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => { setAddGpsModal(false); setGpsForm({}); }}>Annuler</Button>
              <Button onClick={() => addGpsMut.mutate(gpsForm)} disabled={addGpsMut.isPending}>
                {addGpsMut.isPending ? "Ajout..." : "Enregistrer le point"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── MODAL AJOUTER MÉDIA ── */}
      {addMediaModal && (
        <Modal open={addMediaModal} onClose={() => { setAddMediaModal(false); setMediaForm({}); }} title="Ajouter une photo / document" size="sm">
          <div className="p-4 space-y-4">
            <FormField label="Type">
              <Select value={mediaForm.type as string ?? "PHOTO"} onChange={(e) => setMediaForm({ ...mediaForm, type: e.target.value })}>
                <option value="PHOTO">Photo terrain</option>
                <option value="PLAN">Plan / Schéma</option>
                <option value="DOCUMENT">Document</option>
                <option value="VIDEO">Vidéo</option>
              </Select>
            </FormField>
            <FormField label="Fichier à joindre *">
              <input
                type="file"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 file:mr-3 file:px-3 file:py-1 file:rounded-lg file:border-0 file:bg-navy file:text-white file:text-xs"
                onChange={(e) => setMediaForm({ ...mediaForm, _file: e.target.files?.[0] })}
              />
              {mediaForm._file ? (
                <p className="text-[10px] text-green-600 mt-1">✓ {(mediaForm._file as File).name} ({Math.round(((mediaForm._file as File).size)/1024)} Ko)</p>
              ) : (
                <p className="text-[10px] text-gray-400 mt-1">Attachement papier scanné, PV signé, photos, plans... Le dossier accompagne l'attachement dans tout le circuit.</p>
              )}
            </FormField>
            <FormField label="Légende">
              <Input value={mediaForm.legende as string ?? ""} onChange={(e) => setMediaForm({ ...mediaForm, legende: e.target.value })} placeholder="Description de la photo"/>
            </FormField>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => { setAddMediaModal(false); setMediaForm({}); }}>Annuler</Button>
              <Button onClick={() => addMediaMut.mutate(mediaForm)} disabled={addMediaMut.isPending || !mediaForm._file}>
                {addMediaMut.isPending ? "Envoi..." : "Uploader et joindre"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
