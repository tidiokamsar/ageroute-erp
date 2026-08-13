import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  MapPinIcon, DocumentTextIcon, PhotoIcon, WrenchScrewdriverIcon,
  ClipboardDocumentListIcon, ChartBarIcon, InformationCircleIcon,
  ArrowDownTrayIcon, PencilSquareIcon, MagnifyingGlassIcon,
  FunnelIcon, XMarkIcon, CheckBadgeIcon, ExclamationTriangleIcon,
  ClockIcon, TruckIcon, BuildingOfficeIcon, GlobeAltIcon,
  ChevronRightIcon, ArrowPathIcon, PlusIcon,
} from "@heroicons/react/24/outline";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell,
} from "recharts";

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface Troncon {
  id: string; code: string; nom: string; route: string; classe?: string;
  longueur: number; pk_debut?: number; pk_fin?: number;
  lat_debut?: number; lng_debut?: number; lat_fin?: number; lng_fin?: number;
  revetement?: string; etat: string; indice_qualite?: number;
  largeur_chaussee?: number; largeur_plateforme?: number; nb_voies?: number;
  classe_trafic?: string; vitesse_ref?: number; drainage?: string;
  region?: string; prefecture?: string; sous_prefecture?: string;
  date_mise_en_service?: string; date_derniere_rehab?: string;
  date_inspection?: string; inspecteur?: string; niveau_service?: string;
  degradations?: string; entreprise_executante?: string; bureau_controle?: string;
  geometrie?: number[][]; observations?: string; commentaires?: string;
  ouvrages?: Ouvrage[]; inspections?: Inspection[];
  maintenance?: Maintenance[]; photos?: Photo[]; documents?: Document[];
  historique?: Historique[]; marches?: any[];
  nb_ouvrages?: number; nb_ponts?: number; nb_dalots?: number;
  nb_buses?: number; nb_interventions?: number; cout_total_gnf?: number;
  derniere_inspection?: string;
}

interface Ouvrage {
  id: string; troncon_code: string; type: string; nom: string; code?: string;
  pk_localisation?: number; lat?: number; lng?: number;
  longueur?: number; largeur?: number; hauteur_libre?: number;
  annee_construction?: number; etat: string; matiere?: string;
  portee?: number; nb_travees?: number; capacite_charge?: number;
  observations?: string;
}

interface Inspection {
  id: string; date_inspection: string; type_inspection: string;
  inspecteur?: string; etat: string; indice_qualite?: number;
  recommandations?: string; rapport_url?: string;
}

interface Maintenance {
  id: string; type_travaux: string; entreprise?: string;
  date_debut?: string; date_fin?: string; montant_gnf?: number;
  etat_avant?: string; etat_apres?: string; observations?: string;
  duree_jours?: number; garantie_mois?: number;
}

interface Photo {
  id: string; url: string; legende?: string; caption?: string; type_photo?: string;
  auteur?: string; createdat?: string;
}

interface Document {
  id: string; titre: string; type_doc: string; url?: string;
  date_doc?: string; auteur?: string; taille_kb?: number;
}

interface Historique {
  id: string; action: string; champ?: string; ancienne_valeur?: string;
  nouvelle_valeur?: string; user_nom?: string; createdat?: string;
}

// ─── HELPERS ÉTAT ─────────────────────────────────────────────────────────────
const ETAT_CFG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  BON:      { label: "Bon état",   color: "#16A34A", bg: "#DCFCE7", icon: CheckBadgeIcon },
  MOYEN:    { label: "Moyen",      color: "#D97706", bg: "#FEF3C7", icon: ExclamationTriangleIcon },
  DEGRADE:  { label: "Dégradé",   color: "#EA580C", bg: "#FFEDD5", icon: ExclamationTriangleIcon },
  CRITIQUE: { label: "Critique",   color: "#DC2626", bg: "#FEE2E2", icon: ExclamationTriangleIcon },
};
const OUVRAGE_CFG: Record<string, { label: string; color: string }> = {
  PONT:    { label: "Pont",    color: "#2563EB" },
  DALOT:   { label: "Dalot",  color: "#7C3AED" },
  BUSE:    { label: "Buse",   color: "#0891B2" },
  RADIER:  { label: "Radier", color: "#059669" },
  MUR:     { label: "Mur",    color: "#9CA3AF" },
  AUTRE:   { label: "Autre",  color: "#6B7280" },
};

function EtatBadge({ etat, size = "md" }: { etat: string; size?: "sm" | "md" | "lg" }) {
  const cfg = ETAT_CFG[etat] ?? { label: etat, color: "#6B7280", bg: "#F3F4F6", icon: InformationCircleIcon };
  const Icon = cfg.icon;
  const sz = size === "sm" ? "text-xs px-2 py-0.5" : size === "lg" ? "text-base px-4 py-1.5" : "text-sm px-3 py-1";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${sz}`}
      style={{ color: cfg.color, background: cfg.bg }}>
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
}

function IndiceBar({ value }: { value?: number }) {
  if (value == null) return <span className="text-gray-400 text-sm">—</span>;
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 70 ? "#16A34A" : pct >= 40 ? "#D97706" : "#DC2626";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-sm font-bold w-8 text-right" style={{ color }}>{pct}</span>
    </div>
  );
}

function fmt(v?: number | null, unit = "") { return v != null ? `${v.toLocaleString("fr-FR")} ${unit}`.trim() : "—"; }
function fmtDate(d?: string | null) { return d ? new Date(d).toLocaleDateString("fr-FR") : "—"; }
function fmtGnf(v?: number | null) { return v != null ? `${Number(v).toLocaleString("fr-FR")} GNF` : "—"; }

// ─── MINI CARTE LEAFLET ───────────────────────────────────────────────────────
function MiniMap({ troncon, ouvrages }: { troncon: Troncon; ouvrages?: Ouvrage[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    import("leaflet").then((L) => {
      import("leaflet/dist/leaflet.css");
      const lat = troncon.lat_debut ?? 11.4;
      const lng = troncon.lng_debut ?? -12.1;
      const map = L.map(mapRef.current!, { zoomControl: true, attributionControl: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
      const bounds: [number, number][] = [];

      if (troncon.lat_debut && troncon.lng_debut) bounds.push([troncon.lat_debut, troncon.lng_debut]);
      if (troncon.lat_fin && troncon.lng_fin) bounds.push([troncon.lat_fin, troncon.lng_fin]);

      const lineCoords = troncon.geometrie?.map((c) => [c[1], c[0]] as [number, number])
        ?? (bounds.length === 2 ? bounds : undefined);

      if (lineCoords && lineCoords.length >= 2) {
        const color = ETAT_CFG[troncon.etat]?.color ?? "#6B7280";
        L.polyline(lineCoords, { color, weight: 5, opacity: 0.85 }).addTo(map).bindPopup(`${troncon.code} — ${troncon.nom}`);
        map.fitBounds(lineCoords, { padding: [20, 20] });
      } else {
        map.setView([lat, lng], 10);
      }

      (ouvrages ?? []).forEach((o) => {
        if (!o.lat || !o.lng) return;
        const cfg = OUVRAGE_CFG[o.type] ?? OUVRAGE_CFG.AUTRE;
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:12px;height:12px;border-radius:50%;background:${cfg.color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
        });
        L.marker([o.lat, o.lng], { icon }).addTo(map).bindPopup(`<b>${o.nom}</b><br>${cfg.label}`);
        bounds.push([o.lat, o.lng]);
      });

      mapInstance.current = map;
    }).catch(() => {});
    return () => { mapInstance.current?.remove(); mapInstance.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [troncon.code]);

  return <div ref={mapRef} className="w-full rounded-xl border border-gray-200" style={{ height: 360 }} />;
}

// ─── MODAL DÉTAIL ─────────────────────────────────────────────────────────────
const TABS = [
  { id: "info",    label: "Informations",  icon: InformationCircleIcon },
  { id: "loc",     label: "Localisation",  icon: MapPinIcon },
  { id: "geo",     label: "Géométrie",     icon: GlobeAltIcon },
  { id: "tech",    label: "Techniques",    icon: WrenchScrewdriverIcon },
  { id: "etat",    label: "État",          icon: CheckBadgeIcon },
  { id: "patrim",  label: "Patrimoine",    icon: BuildingOfficeIcon },
  { id: "photos",  label: "Photos",        icon: PhotoIcon },
  { id: "docs",    label: "Documents",     icon: DocumentTextIcon },
  { id: "histo",   label: "Historique",    icon: ClockIcon },
  { id: "maint",   label: "Maintenance",   icon: TruckIcon },
  { id: "stats",   label: "Statistiques",  icon: ChartBarIcon },
];

function TronconModal({ troncon: init, onClose }: { troncon: Troncon; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState("info");
  const [photoIdx, setPhotoIdx] = useState(0);
  const qc = useQueryClient();

  const { data: troncon = init, isLoading } = useQuery({
    queryKey: ["troncon-detail", init.code],
    queryFn: () => api.get(`/routier/troncons/${init.code}`).then((r) => r.data),
    staleTime: 30000,
  });

  const exportGeoJSON = () => {
    const geojson = {
      type: "Feature",
      properties: { code: troncon.code, nom: troncon.nom, route: troncon.route, etat: troncon.etat },
      geometry: {
        type: "LineString",
        coordinates: troncon.geometrie ?? [
          [troncon.lng_debut, troncon.lat_debut],
          [troncon.lng_fin, troncon.lat_fin],
        ],
      },
    };
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `${troncon.code}.geojson`; a.click();
  };

  const exportWKT = () => {
    const coords = troncon.geometrie
      ? troncon.geometrie.map((c: number[]) => `${c[0]} ${c[1]}`).join(", ")
      : `${troncon.lng_debut} ${troncon.lat_debut}, ${troncon.lng_fin} ${troncon.lat_fin}`;
    const wkt = `LINESTRING(${coords})`;
    const blob = new Blob([wkt], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `${troncon.code}.wkt`; a.click();
  };

  const inspChartData = (troncon.inspections ?? []).slice(0, 10).reverse().map((i: Inspection) => ({
    date: fmtDate(i.date_inspection),
    indice: i.indice_qualite ?? 0,
    etat: i.etat,
  }));

  const maintChartData = (troncon.maintenance ?? []).slice(0, 12).reverse().map((m: Maintenance) => ({
    date: m.date_debut ? new Date(m.date_debut).getFullYear().toString() : "?",
    cout: m.montant_gnf ? Math.round(Number(m.montant_gnf) / 1_000_000) : 0,
    type: m.type_travaux,
  }));

  const ouvrageTypes = Object.entries(
    (troncon.ouvrages ?? []).reduce((acc: Record<string, number>, o: Ouvrage) => {
      acc[o.type] = (acc[o.type] ?? 0) + 1; return acc;
    }, {})
  ).map(([type, nb]) => ({ type, nb, color: OUVRAGE_CFG[type]?.color ?? "#6B7280" }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.55)" }}>
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-5xl" style={{ maxHeight: "95vh" }}>

        {/* ── HEADER ── */}
        <div className="flex-none p-5 border-b border-gray-100"
          style={{ background: "linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)", borderRadius: "1rem 1rem 0 0" }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center flex-none">
                <MapPinIcon className="w-8 h-8 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm bg-white/20 text-white px-2 py-0.5 rounded">{troncon.code}</span>
                  <span className="text-white/60 text-sm">{troncon.route}</span>
                  {troncon.classe && <span className="text-white/60 text-sm">· {troncon.classe}</span>}
                </div>
                <h2 className="text-xl font-bold text-white leading-tight">{troncon.nom}</h2>
                <div className="flex items-center gap-3 mt-1 text-white/70 text-sm">
                  {troncon.pk_debut != null && <span>PK {troncon.pk_debut} → {troncon.pk_fin}</span>}
                  {troncon.longueur && <span>· {fmt(troncon.longueur, "km")}</span>}
                  {troncon.region && <span>· {troncon.region}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-none">
              <EtatBadge etat={troncon.etat} size="md" />
              <div className="flex gap-1 ml-2">
                <button onClick={exportGeoJSON} title="Export GeoJSON"
                  className="p-2 bg-white/15 hover:bg-white/30 rounded-lg text-white transition">
                  <ArrowDownTrayIcon className="w-4 h-4" />
                </button>
                <button onClick={exportWKT} title="Export WKT"
                  className="p-2 bg-white/15 hover:bg-white/30 rounded-lg text-white transition">
                  <DocumentTextIcon className="w-4 h-4" />
                </button>
                <button onClick={() => qc.invalidateQueries({ queryKey: ["troncon-detail", troncon.code] })}
                  title="Rafraîchir" className="p-2 bg-white/15 hover:bg-white/30 rounded-lg text-white transition">
                  <ArrowPathIcon className="w-4 h-4" />
                </button>
                <button onClick={onClose}
                  className="p-2 bg-white/15 hover:bg-red-500 rounded-lg text-white transition ml-1">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Indicateurs rapides */}
          <div className="grid grid-cols-4 gap-3 mt-4">
            {[
              { label: "Longueur",   value: fmt(troncon.longueur, "km") },
              { label: "Ouvrages",   value: fmt(troncon.nb_ouvrages) },
              { label: "IQ",         value: troncon.indice_qualite != null ? String(troncon.indice_qualite) + "/100" : "—" },
              { label: "Revêtement", value: troncon.revetement ?? "—" },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white/10 rounded-xl p-2.5 text-center">
                <div className="text-white font-bold text-sm">{kpi.value}</div>
                <div className="text-white/60 text-xs mt-0.5">{kpi.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── ONGLETS ── */}
        <div className="flex-none border-b border-gray-100 bg-gray-50 px-4 overflow-x-auto">
          <div className="flex gap-0.5 min-w-max">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 transition whitespace-nowrap ${
                    activeTab === tab.id
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}>
                  <Icon className="w-3.5 h-3.5" />{tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── CONTENU ── */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <ArrowPathIcon className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          )}

          {/* ── INFORMATIONS GÉNÉRALES ── */}
          {activeTab === "info" && (
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Code tronçon", value: troncon.code },
                { label: "Nom", value: troncon.nom },
                { label: "Route nationale", value: troncon.route },
                { label: "Classe", value: troncon.classe },
                { label: "PK début", value: fmt(troncon.pk_debut, "km") },
                { label: "PK fin", value: fmt(troncon.pk_fin, "km") },
                { label: "Longueur", value: fmt(troncon.longueur, "km") },
                { label: "Revêtement", value: troncon.revetement },
                { label: "Mise en service", value: fmtDate(troncon.date_mise_en_service) },
                { label: "Dernière réhab.", value: fmtDate(troncon.date_derniere_rehab) },
                { label: "Entreprise exec.", value: troncon.entreprise_executante },
                { label: "Bureau contrôle", value: troncon.bureau_controle },
              ].map((f) => (
                <div key={f.label} className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs text-gray-500 mb-0.5">{f.label}</div>
                  <div className="font-semibold text-gray-800 text-sm">{f.value ?? "—"}</div>
                </div>
              ))}
              {troncon.observations && (
                <div className="col-span-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <div className="text-xs text-amber-700 mb-1 font-semibold">Observations</div>
                  <p className="text-sm text-amber-900">{troncon.observations}</p>
                </div>
              )}
              {/* Marchés liés */}
              {(troncon.marches ?? []).length > 0 && (
                <div className="col-span-2">
                  <h3 className="font-semibold text-gray-700 mb-2 text-sm">Marchés associés</h3>
                  <div className="space-y-2">
                    {troncon.marches!.map((m: any) => (
                      <div key={m.id} className="flex items-center justify-between bg-blue-50 rounded-xl p-3">
                        <div>
                          <span className="font-mono text-xs text-blue-700 mr-2">{m.reference}</span>
                          <span className="text-sm text-gray-700">{m.intitule}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500">{m.financement}</div>
                          <div className="text-sm font-semibold text-blue-700">{fmtGnf(m.montantActualiseGnf)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── LOCALISATION ── */}
          {activeTab === "loc" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Région", value: troncon.region },
                  { label: "Préfecture", value: troncon.prefecture },
                  { label: "Sous-préfecture", value: troncon.sous_prefecture },
                  { label: "Coordonnées début", value: troncon.lat_debut != null ? `${troncon.lat_debut.toFixed(5)}, ${troncon.lng_debut?.toFixed(5)}` : undefined },
                  { label: "Coordonnées fin", value: troncon.lat_fin != null ? `${troncon.lat_fin.toFixed(5)}, ${troncon.lng_fin?.toFixed(5)}` : undefined },
                  { label: "Longueur totale", value: fmt(troncon.longueur, "km") },
                ].map((f) => (
                  <div key={f.label} className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs text-gray-500 mb-0.5">{f.label}</div>
                    <div className="font-semibold text-gray-800 text-sm">{f.value ?? "—"}</div>
                  </div>
                ))}
              </div>
              <MiniMap troncon={troncon} ouvrages={troncon.ouvrages} />
            </div>
          )}

          {/* ── GÉOMÉTRIE ── */}
          {activeTab === "geo" && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <button onClick={exportGeoJSON}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
                  <ArrowDownTrayIcon className="w-4 h-4" /> Export GeoJSON
                </button>
                <button onClick={exportWKT}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-xl text-sm font-semibold hover:bg-gray-800">
                  <DocumentTextIcon className="w-4 h-4" /> Export WKT
                </button>
              </div>
              {troncon.geometrie ? (
                <div className="bg-gray-900 rounded-xl p-4 overflow-auto max-h-64">
                  <pre className="text-green-400 text-xs font-mono whitespace-pre-wrap">
                    {JSON.stringify({ type: "LineString", coordinates: troncon.geometrie }, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                  Géométrie vectorielle non disponible. Points extrémités : début ({troncon.lat_debut}, {troncon.lng_debut}) — fin ({troncon.lat_fin}, {troncon.lng_fin}).
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Nb points", value: troncon.geometrie ? `${troncon.geometrie.length} pts` : "2 pts (extrémités)" },
                  { label: "Longueur arc", value: fmt(troncon.longueur, "km") },
                  { label: "PK début", value: fmt(troncon.pk_debut, "km") },
                  { label: "PK fin", value: fmt(troncon.pk_fin, "km") },
                ].map((f) => (
                  <div key={f.label} className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs text-gray-500 mb-0.5">{f.label}</div>
                    <div className="font-semibold text-gray-800 text-sm">{f.value ?? "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── CARACTÉRISTIQUES TECHNIQUES ── */}
          {activeTab === "tech" && (
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Largeur chaussée", value: fmt(troncon.largeur_chaussee, "m") },
                { label: "Largeur plateforme", value: fmt(troncon.largeur_plateforme, "m") },
                { label: "Nombre de voies", value: fmt(troncon.nb_voies) },
                { label: "Classe trafic", value: troncon.classe_trafic },
                { label: "Vitesse de référence", value: fmt(troncon.vitesse_ref, "km/h") },
                { label: "Drainage", value: troncon.drainage },
                { label: "Revêtement", value: troncon.revetement },
                { label: "Niveau de service", value: troncon.niveau_service },
              ].map((f) => (
                <div key={f.label} className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs text-gray-500 mb-0.5">{f.label}</div>
                  <div className="font-semibold text-gray-800 text-sm">{f.value ?? "—"}</div>
                </div>
              ))}
              {troncon.degradations && (
                <div className="col-span-2 bg-red-50 border border-red-200 rounded-xl p-3">
                  <div className="text-xs text-red-700 mb-1 font-semibold">Dégradations signalées</div>
                  <p className="text-sm text-red-900">{troncon.degradations}</p>
                </div>
              )}
            </div>
          )}

          {/* ── ÉTAT ── */}
          {activeTab === "etat" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <EtatBadge etat={troncon.etat} size="lg" />
                  <div className="text-xs text-gray-500 mt-2">État actuel</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-gray-800">{troncon.indice_qualite ?? "—"}</div>
                  <div className="text-xs text-gray-500 mt-1">Indice qualité / 100</div>
                  <IndiceBar value={troncon.indice_qualite} />
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <div className="text-sm font-semibold text-gray-700">{fmtDate(troncon.date_inspection)}</div>
                  <div className="text-xs text-gray-500 mt-1">Dernière inspection</div>
                  {troncon.inspecteur && <div className="text-xs text-blue-600 mt-1">{troncon.inspecteur}</div>}
                </div>
              </div>
              {inspChartData.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-700 mb-3 text-sm">Évolution de l'indice qualité</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={inspChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="indice" name="Indice IQ" stroke="#2563eb" fill="#dbeafe" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              {/* Liste inspections */}
              {(troncon.inspections ?? []).length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2 text-sm">Historique des inspections</h3>
                  <div className="space-y-2">
                    {(troncon.inspections ?? []).map((insp: Inspection) => (
                      <div key={insp.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl p-3">
                        <div>
                          <span className="text-sm font-semibold text-gray-800">{fmtDate(insp.date_inspection)}</span>
                          <span className="text-xs text-gray-500 ml-2">{insp.type_inspection}</span>
                          {insp.inspecteur && <span className="text-xs text-blue-600 ml-2">{insp.inspecteur}</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          {insp.indice_qualite != null && (
                            <div className="text-right">
                              <div className="text-sm font-bold text-gray-700">{insp.indice_qualite}/100</div>
                            </div>
                          )}
                          <EtatBadge etat={insp.etat} size="sm" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PATRIMOINE ── */}
          {activeTab === "patrim" && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Ponts", value: troncon.nb_ponts ?? 0, color: "#2563EB" },
                  { label: "Dalots", value: troncon.nb_dalots ?? 0, color: "#7C3AED" },
                  { label: "Buses", value: troncon.nb_buses ?? 0, color: "#0891B2" },
                  { label: "Total", value: troncon.nb_ouvrages ?? 0, color: "#374151" },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
                    <div className="text-xs text-gray-500 mt-1">{kpi.label}</div>
                  </div>
                ))}
              </div>

              {ouvrageTypes.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-700 mb-3 text-sm">Répartition des ouvrages</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={ouvrageTypes} dataKey="nb" nameKey="type" cx="50%" cy="50%" outerRadius={70} label={({ type, nb }) => `${type} (${nb})`}>
                        {ouvrageTypes.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {(troncon.ouvrages ?? []).length > 0 && (
                <div className="space-y-2">
                  {(troncon.ouvrages ?? []).map((o: Ouvrage) => {
                    const cfg = OUVRAGE_CFG[o.type] ?? OUVRAGE_CFG.AUTRE;
                    return (
                      <div key={o.id} className="flex items-center justify-between border border-gray-100 rounded-xl p-3 bg-white">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-8 rounded-full" style={{ background: cfg.color }} />
                          <div>
                            <div className="font-semibold text-sm text-gray-800">{o.nom}</div>
                            <div className="text-xs text-gray-500">{cfg.label}{o.pk_localisation != null ? ` · PK ${o.pk_localisation}` : ""}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-right">
                          {o.longueur && <span className="text-xs text-gray-500">{o.longueur} m</span>}
                          <EtatBadge etat={o.etat} size="sm" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!(troncon.ouvrages ?? []).length && (
                <div className="text-center text-gray-400 py-8">Aucun ouvrage enregistré sur ce tronçon</div>
              )}
            </div>
          )}

          {/* ── PHOTOS ── */}
          {activeTab === "photos" && (
            <div>
              {(troncon.photos ?? []).length === 0 ? (
                <div className="text-center text-gray-400 py-12">
                  <PhotoIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p>Aucune photo disponible pour ce tronçon</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {(troncon.photos ?? []).map((p: Photo, idx: number) => (
                      <button key={p.id} onClick={() => setPhotoIdx(idx)}
                        className={`rounded-xl overflow-hidden border-2 transition ${idx === photoIdx ? "border-blue-500" : "border-gray-200 hover:border-blue-300"}`}>
                        <img src={p.url} alt={p.caption ?? p.legende ?? ""} className="w-full h-32 object-cover" />
                        {(p.caption || p.legende) && <div className="text-xs text-gray-600 p-1.5 truncate bg-gray-50">{p.caption ?? p.legende}</div>}
                      </button>
                    ))}
                  </div>
                  {(troncon.photos ?? [])[photoIdx] && (
                    <div className="rounded-xl overflow-hidden border border-gray-200">
                      <img src={(troncon.photos ?? [])[photoIdx].url} alt="" className="w-full max-h-96 object-contain bg-black" />
                      <div className="p-3 bg-gray-50 text-sm text-gray-700">
                        {(troncon.photos ?? [])[photoIdx].caption ?? (troncon.photos ?? [])[photoIdx].legende}
                        <span className="text-gray-400 ml-2">{fmtDate((troncon.photos ?? [])[photoIdx].createdat)}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── DOCUMENTS ── */}
          {activeTab === "docs" && (
            <div>
              {(troncon.documents ?? []).length === 0 ? (
                <div className="text-center text-gray-400 py-12">
                  <DocumentTextIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p>Aucun document disponible</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(troncon.documents ?? []).map((d: Document) => (
                    <div key={d.id} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                      <div className="flex items-center gap-3">
                        <DocumentTextIcon className="w-8 h-8 text-blue-500 flex-none" />
                        <div>
                          <div className="font-semibold text-sm text-gray-800">{d.titre}</div>
                          <div className="text-xs text-gray-500">{d.type_doc}{d.date_doc ? ` · ${fmtDate(d.date_doc)}` : ""}{d.auteur ? ` · ${d.auteur}` : ""}</div>
                        </div>
                      </div>
                      {d.url && (
                        <a href={d.url} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-semibold">
                          <ArrowDownTrayIcon className="w-4 h-4" /> Télécharger
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── HISTORIQUE ── */}
          {activeTab === "histo" && (
            <div>
              {(troncon.historique ?? []).length === 0 ? (
                <div className="text-center text-gray-400 py-12">Aucune modification enregistrée</div>
              ) : (
                <div className="relative">
                  <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200" />
                  <div className="space-y-3">
                    {(troncon.historique ?? []).map((h: Historique) => (
                      <div key={h.id} className="flex items-start gap-4 pl-11 relative">
                        <div className="absolute left-3.5 top-2 w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
                        <div className="flex-1 bg-gray-50 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">{h.action}</span>
                            <span className="text-xs text-gray-400">{fmtDate(h.createdat)}</span>
                          </div>
                          {h.champ && (
                            <div className="text-sm text-gray-700">
                              <span className="font-mono text-blue-600">{h.champ}</span>
                              {h.ancienne_valeur && <span className="text-gray-400"> : {h.ancienne_valeur} →</span>}
                              {h.nouvelle_valeur && <span className="text-gray-800"> {h.nouvelle_valeur}</span>}
                            </div>
                          )}
                          {h.user_nom && <div className="text-xs text-gray-500 mt-1">par {h.user_nom}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── MAINTENANCE ── */}
          {activeTab === "maint" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-gray-800">{troncon.nb_interventions ?? 0}</div>
                  <div className="text-xs text-gray-500 mt-1">Interventions</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-blue-700">{fmtGnf(troncon.cout_total_gnf)}</div>
                  <div className="text-xs text-gray-500 mt-1">Coût total investi</div>
                </div>
              </div>

              {maintChartData.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-700 mb-3 text-sm">Coûts par intervention (M GNF)</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={maintChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => [`${v} M GNF`, "Coût"]} />
                      <Bar dataKey="cout" name="Coût (M GNF)" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {(troncon.maintenance ?? []).length > 0 && (
                <div className="space-y-2">
                  {(troncon.maintenance ?? []).map((m: Maintenance) => (
                    <div key={m.id} className="border border-gray-100 rounded-xl p-3 bg-white">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-semibold text-sm text-gray-800">{m.type_travaux}</div>
                          {m.entreprise && <div className="text-xs text-gray-500 mt-0.5">{m.entreprise}</div>}
                          <div className="text-xs text-gray-400 mt-0.5">
                            {fmtDate(m.date_debut)}{m.date_fin ? ` → ${fmtDate(m.date_fin)}` : ""}
                            {m.duree_jours ? ` (${m.duree_jours}j)` : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          {m.montant_gnf && <div className="text-sm font-bold text-blue-700">{fmtGnf(m.montant_gnf)}</div>}
                          {m.etat_apres && <div className="mt-1"><EtatBadge etat={m.etat_apres} size="sm" /></div>}
                        </div>
                      </div>
                      {m.observations && <p className="text-xs text-gray-600 mt-2 italic">{m.observations}</p>}
                    </div>
                  ))}
                </div>
              )}

              {!(troncon.maintenance ?? []).length && (
                <div className="text-center text-gray-400 py-8">Aucune intervention enregistrée</div>
              )}
            </div>
          )}

          {/* ── STATISTIQUES ── */}
          {activeTab === "stats" && (
            <div className="space-y-4">
              {/* KPIs */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Longueur", value: fmt(troncon.longueur, "km"), color: "#2563EB" },
                  { label: "Indice qualité", value: troncon.indice_qualite != null ? `${troncon.indice_qualite}/100` : "—", color: ETAT_CFG[troncon.etat]?.color ?? "#6B7280" },
                  { label: "Ouvrages", value: fmt(troncon.nb_ouvrages), color: "#7C3AED" },
                  { label: "Inspections", value: (troncon.inspections ?? []).length.toString(), color: "#0891B2" },
                  { label: "Interventions", value: (troncon.maintenance ?? []).length.toString(), color: "#D97706" },
                  { label: "Coût total", value: troncon.cout_total_gnf ? `${(Number(troncon.cout_total_gnf) / 1e9).toFixed(2)} Mrd GNF` : "—", color: "#059669" },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <div className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
                    <div className="text-xs text-gray-500 mt-1">{kpi.label}</div>
                  </div>
                ))}
              </div>

              {/* Graphe évolution inspections */}
              {inspChartData.length > 1 && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-700 mb-3 text-sm">Tendance indice qualité</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={inspChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="indice" name="IQ" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Comparaison ouvrages */}
              {ouvrageTypes.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-700 mb-3 text-sm">Types d'ouvrages</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={ouvrageTypes} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis dataKey="type" type="category" tick={{ fontSize: 10 }} width={60} />
                      <Tooltip />
                      <Bar dataKey="nb" name="Nb ouvrages" radius={[0, 4, 4, 0]}>
                        {ouvrageTypes.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PAGE PRINCIPALE ──────────────────────────────────────────────────────────
export default function RoutierPage() {
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("");
  const [etat, setEtat] = useState("");
  const [selected, setSelected] = useState<Troncon | null>(null);
  const [page, setPage] = useState(1);

  const { data: statsData } = useQuery({
    queryKey: ["routier-stats"],
    queryFn: () => api.get("/routier/stats").then((r) => r.data),
    staleTime: 60000,
  });

  const { data: regionsData } = useQuery({
    queryKey: ["routier-regions"],
    queryFn: () => api.get("/routier/regions").then((r) => r.data),
    staleTime: 300000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["routier-troncons", search, region, etat, page],
    queryFn: () => api.get("/routier/troncons", { params: { search, region, etat, page } }).then((r) => r.data),
    staleTime: 15000,
  });

  const troncons: Troncon[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages: number = data?.totalPages ?? 1;
  const stats = statsData?.troncons;

  return (
    <div className="flex flex-col h-full">
      {/* ── HEADER PAGE ── */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Référentiel Routier</h1>
            <p className="text-sm text-gray-500">Base de données des tronçons et ouvrages — AGEROUTE Guinée</p>
          </div>
        </div>

        {/* KPIs globaux */}
        {stats && (
          <div className="grid grid-cols-5 gap-3 mb-4">
            {[
              { label: "Tronçons", value: stats.total_troncons, color: "#2563EB" },
              { label: "Km réseau", value: `${(stats.longueur_totale ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} km`, color: "#374151" },
              { label: "Bon état", value: stats.etat_bon, color: "#16A34A" },
              { label: "Moyen", value: stats.etat_moyen, color: "#D97706" },
              { label: "Critique", value: (stats.etat_critique ?? 0) + (stats.etat_degrade ?? 0), color: "#DC2626" },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{kpi.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filtres */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Rechercher code, nom, route..."
              value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
          <select value={region} onChange={(e) => { setRegion(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
            <option value="">Toutes régions</option>
            {(regionsData ?? []).map((r: any) => (
              <option key={r.region} value={r.region}>{r.region} ({r.nb_troncons})</option>
            ))}
          </select>
          <select value={etat} onChange={(e) => { setEtat(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
            <option value="">Tous états</option>
            {Object.entries(ETAT_CFG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          {(search || region || etat) && (
            <button onClick={() => { setSearch(""); setRegion(""); setEtat(""); setPage(1); }}
              className="p-2 text-gray-400 hover:text-gray-700 border border-gray-200 rounded-xl">
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── LISTE TRONÇONS ── */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <ArrowPathIcon className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        )}

        {!isLoading && troncons.length === 0 && (
          <div className="text-center text-gray-400 py-16">
            <MapPinIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Aucun tronçon trouvé</p>
          </div>
        )}

        <div className="space-y-2">
          {troncons.map((t) => {
            const etatCfg = ETAT_CFG[t.etat] ?? { label: t.etat, color: "#6B7280", bg: "#F3F4F6" };
            return (
              <button key={t.code} onClick={() => setSelected(t)}
                className="w-full text-left bg-white border border-gray-100 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-1 h-12 rounded-full flex-none" style={{ background: etatCfg.color }} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{t.code}</span>
                        <span className="text-xs text-blue-600 font-semibold">{t.route}</span>
                      </div>
                      <div className="font-semibold text-gray-800 text-sm truncate">{t.nom}</div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                        {t.longueur && <span>{fmt(t.longueur, "km")}</span>}
                        {t.region && <span>· {t.region}</span>}
                        {t.revetement && <span>· {t.revetement}</span>}
                        {(t.nb_ouvrages ?? 0) > 0 && <span>· {t.nb_ouvrages} ouvrages</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-none ml-4">
                    {t.indice_qualite != null && (
                      <div className="text-right">
                        <div className="text-xs text-gray-400">IQ</div>
                        <div className="text-sm font-bold" style={{ color: etatCfg.color }}>{t.indice_qualite}</div>
                      </div>
                    )}
                    <EtatBadge etat={t.etat} size="sm" />
                    <ChevronRightIcon className="w-4 h-4 text-gray-300 group-hover:text-blue-500" />
                  </div>
                </div>
                {t.indice_qualite != null && (
                  <div className="mt-2 ml-4">
                    <IndiceBar value={t.indice_qualite} />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <div className="text-sm text-gray-500">{total} tronçons · page {page}/{totalPages}</div>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50">
                Précédent
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50">
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL ── */}
      {selected && <TronconModal troncon={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
