/**
 * §21 CDC — Tableaux de bord adaptés par profil :
 * DG | DAF | DMC | UGP | ENTREPRISE | ADMIN/MISSION/TECHNIQUE
 * §17 CDC — Suivi statut décomptes en temps réel
 */
import { useQuery } from "@tanstack/react-query";
import { api, fmtGnf } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  TrendingUp, FileText, Receipt, Building2, AlertTriangle, CheckCircle,
  Clock, GitBranch, CreditCard, Eye, BarChart2, Search, Shield,
  PauseCircle, Stamp, Banknote, CircleDollarSign, Briefcase,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { StatutDecompteBadge } from "../components/ui/Badge";

const FIN_LABELS: Record<string,string> = {
  BANQUE_MONDIALE:"BM", BAD:"BAD", BUDGET_NATIONAL:"Budget", FER:"FER",
  BOAD:"BOAD", BID:"BID", UE:"UE", BADEA:"BADEA", AFD:"AFD", KFW:"KFW", AUTRE:"Autre",
};
const COLORS = ["#1B2A4A","#C8960C","#166534","#1e40af","#047857","#9333ea","#0891b2","#6b7280","#ea580c","#0d9488","#7c3aed"];

function Kpi({
  label, value, sub, icon: Icon, accent, onClick,
}: { label: string; value: string|number; sub?: string; icon: React.ElementType; accent: string; onClick?: ()=>void }) {
  return (
    <div
      className={`bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex gap-4 items-start ${onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
      onClick={onClick}
    >
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${accent}`}>
        <Icon className="h-5 w-5 text-white"/>
      </div>
      <div>
        <p className="text-2xl font-bold text-navy">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Types pipeline ────────────────────────────────────────────────────────────
type PipelineStep = {
  role: string;
  label: string;
  nb: number;
  montantTotal: number;
  dossiers: {
    id: string;
    reference: string;
    statut: string;
    netAPayer: string;
    createdAt: string;
    marche: { reference: string; financement: string };
    entreprise: { raisonSociale: string };
  }[];
};

// ─── Vue DG §21 ────────────────────────────────────────────────────────────────
function DashboardDg({
  data,
  pipeline,
}: {
  data: {
    suspendus: number;
    avecAudit: number;
    enAttenteDg: number;
    montantEncoursGnf: string;
    retards: {
      id: string;
      reference: string;
      statut: string;
      dateDepot?: string;
      marche: { reference: string; financement: string };
      entreprise: { raisonSociale: string };
    }[];
    garantiesAExpirer: number;
  };
  pipeline?: PipelineStep[];
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi label="À ordonnancer"     value={data.enAttenteDg}       sub="visa DG requis"  icon={Clock}       accent="bg-navy"/>
        <Kpi label="Dossiers suspendus" value={data.suspendus}         sub="par la DG"       icon={PauseCircle} accent="bg-purple-600"/>
        <Kpi label="Audits requis"      value={data.avecAudit}         sub="DG"              icon={Eye}         accent="bg-orange-500"/>
        <Kpi label="Garanties expirant" value={data.garantiesAExpirer} sub="dans 30j"        icon={Shield}      accent="bg-red-500"/>
      </div>

      <div className="bg-navy/5 rounded-xl p-4 border border-navy/10">
        <p className="text-sm font-semibold text-navy mb-1">Montant global en cours de traitement</p>
        <p className="text-3xl font-bold text-navy">{fmtGnf(data.montantEncoursGnf)}</p>
      </div>

      {/* Pipeline par rôle */}
      {pipeline && pipeline.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-navy"/>
            File d&apos;attente par étape — circuit de validation
          </p>
          <div className="grid grid-cols-5 gap-2">
            {pipeline.map((e, i) => (
              <div
                key={e.role}
                className={`rounded-xl border p-3 text-center ${e.nb > 0 ? "border-blue-200 bg-blue-50" : "border-gray-100 bg-gray-50"}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">{e.role}</span>
                  {i < pipeline.length - 1 && <span className="text-gray-300 text-xs">→</span>}
                </div>
                <div className={`text-2xl font-bold ${e.nb > 0 ? "text-blue-700" : "text-gray-300"}`}>{e.nb}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{e.label}</div>
                {e.nb > 0 && (
                  <div className="text-[9px] text-blue-500 mt-1 font-semibold truncate">
                    {e.dossiers.slice(0, 2).map((d) => d.reference).join(", ")}
                    {e.nb > 2 && ` +${e.nb - 2}`}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Détail par étape si dossiers en attente */}
          {pipeline.filter((e) => e.nb > 0).map((e) => (
            <div key={e.role} className="mt-3 border border-blue-100 rounded-xl overflow-hidden">
              <div className="bg-blue-50 px-4 py-2 flex items-center justify-between">
                <span className="text-xs font-bold text-blue-800">
                  {e.label} — {e.nb} dossier{e.nb > 1 ? "s" : ""} en attente
                  {e.role === "DG" && " ← VOUS DEVEZ AGIR ICI"}
                </span>
                <span className="text-xs text-blue-600 font-semibold">
                  Total : {Number(e.montantTotal / 1e9).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Mrd GNF
                </span>
              </div>
              {e.dossiers.map((d) => (
                <div key={d.id} className="flex items-center justify-between px-4 py-2 border-t border-blue-50 bg-white hover:bg-blue-50/30">
                  <div>
                    <span className="font-mono text-xs font-bold text-navy">{d.reference}</span>
                    <span className="text-gray-400 mx-2 text-xs">·</span>
                    <span className="text-sm text-gray-600">{d.entreprise.raisonSociale}</span>
                    <span className="text-gray-400 mx-2 text-xs">·</span>
                    <span className="text-xs text-gray-400">{FIN_LABELS[d.marche.financement] ?? d.marche.financement}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-700">
                      {Number(Number(d.netAPayer) / 1e9).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Mrd GNF
                    </span>
                    <StatutDecompteBadge statut={d.statut}/>
                    <span className="text-xs text-gray-400">{new Date(d.createdAt).toLocaleDateString("fr-FR")}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {data.retards.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500"/> Dossiers les plus anciens en attente
          </p>
          <div className="space-y-2">
            {data.retards.map((d) => (
              <div key={d.id} className="bg-white rounded-lg border border-amber-200 px-4 py-3 flex items-center justify-between text-sm">
                <div>
                  <span className="font-mono font-medium">{d.reference}</span>
                  <span className="text-gray-400 mx-2">·</span>
                  <span className="text-gray-600">{d.entreprise.raisonSociale}</span>
                  <span className="text-gray-400 mx-2">·</span>
                  <span className="text-xs text-gray-500">{FIN_LABELS[d.marche.financement]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatutDecompteBadge statut={d.statut}/>
                  {d.dateDepot && <span className="text-xs text-gray-400">{new Date(d.dateDepot).toLocaleDateString("fr-GN")}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Vue DAF §21 ───────────────────────────────────────────────────────────────
function DashboardDaf({ data }: {
  data: {
    enAttenteVisa: number;
    visaAccorde: number;
    visaRefuse: number;
    ordonnances: number;
    montantOrdonnanceGnf: string;
    circuitsEnCours: {
      id: string;
      type: string;
      etapeActuelle: number;
      etapes: { nom: string; statut: string }[];
      decompte: { reference: string; marche: { reference: string; financement: string }; entreprise: { raisonSociale: string } };
    }[];
  };
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi label="En attente visa" value={data.enAttenteVisa} icon={Stamp}        accent="bg-blue-600"/>
        <Kpi label="Visas accordés"  value={data.visaAccorde}  icon={CheckCircle}   accent="bg-green-600"/>
        <Kpi label="Visas refusés"   value={data.visaRefuse}   icon={AlertTriangle} accent="bg-red-500"/>
        <Kpi label="Ordonnancés"     value={data.ordonnances}  sub={fmtGnf(data.montantOrdonnanceGnf)} icon={Banknote} accent="bg-navy"/>
      </div>
      {data.circuitsEnCours.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-navy"/> Circuits financiers en cours §16
          </p>
          <div className="space-y-2">
            {data.circuitsEnCours.slice(0, 10).map((c) => {
              const etapeCourante = c.etapes[c.etapeActuelle];
              return (
                <div key={c.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-mono font-medium">{c.decompte.reference}</span>
                    <span className="text-gray-400 mx-2">·</span>
                    <span className="text-gray-600">{c.decompte.entreprise.raisonSociale}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${c.type === "FER" ? "bg-green-100 text-green-700" : c.type === "BUDGET" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                      {c.type}
                    </span>
                    {etapeCourante && <span className="text-xs text-gray-500">{etapeCourante.nom}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Vue DMC §21 ───────────────────────────────────────────────────────────────
function DashboardDmc({ data }: {
  data: {
    enAnalyse: number;
    avecAnalyse: number;
    corrections: number;
    rejets: number;
    dossiers: {
      id: string;
      reference: string;
      statut: string;
      analyseDmc?: string;
      marche: { reference: string; intitule: string; financement: string };
      entreprise: { raisonSociale: string };
    }[];
  };
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi label="En attente analyse" value={data.enAnalyse}   icon={FileText}      accent="bg-indigo-600"/>
        <Kpi label="Analyses réalisées" value={data.avecAnalyse} icon={CheckCircle}   accent="bg-green-600"/>
        <Kpi label="En correction"      value={data.corrections} icon={AlertTriangle} accent="bg-amber-500"/>
        <Kpi label="Rejetés"            value={data.rejets}      icon={AlertTriangle} accent="bg-red-500"/>
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-3">Dossiers à traiter — Contrôle contractuel DMC §13</p>
        <div className="space-y-2">
          {data.dossiers.map((d) => (
            <div key={d.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center justify-between text-sm">
              <div>
                <span className="font-mono font-medium text-navy">{d.reference}</span>
                <span className="text-gray-400 mx-2">·</span>
                <span className="text-gray-600 truncate max-w-[200px]">{d.marche.intitule}</span>
              </div>
              <div className="flex items-center gap-2">
                {d.analyseDmc
                  ? <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Analysé</span>
                  : <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">En attente</span>
                }
                <StatutDecompteBadge statut={d.statut}/>
              </div>
            </div>
          ))}
          {data.dossiers.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Aucun dossier en attente</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Vue UGP §21 ───────────────────────────────────────────────────────────────
function DashboardUgp({ data }: {
  data: {
    circuitsBailleur: {
      id: string;
      type: string;
      etapeActuelle: number;
      bailleurNom?: string;
      etapes: { nom: string; statut: string }[];
      decompte: {
        reference: string;
        marche: { reference: string; intitule: string; bailleur?: string; financement: string };
        entreprise: { raisonSociale: string };
      };
    }[];
  };
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4">
        <Kpi label="Demandes décaissement en cours" value={data.circuitsBailleur.length} icon={CircleDollarSign} accent="bg-blue-600"/>
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-3">Circuits bailleurs en cours §16.2</p>
        <div className="space-y-2">
          {data.circuitsBailleur.map((c) => {
            const etapeCourante = c.etapes[c.etapeActuelle];
            return (
              <div key={c.id} className="bg-white rounded-lg border border-blue-200 px-4 py-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-medium text-navy">{c.decompte.reference}</span>
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                    BAILLEUR — {FIN_LABELS[c.decompte.marche.financement]}
                  </span>
                </div>
                <p className="text-gray-600 text-xs truncate">{c.decompte.marche.intitule}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-400">Étape courante :</span>
                  <span className="text-xs font-medium text-blue-700">{etapeCourante?.nom ?? "—"}</span>
                </div>
                <div className="flex gap-1 mt-2 overflow-x-auto">
                  {c.etapes.map((e, i) => (
                    <div
                      key={i}
                      className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                        i === c.etapeActuelle ? "bg-blue-600 text-white" :
                        e.statut === "VALIDE" ? "bg-green-100 text-green-700" :
                        "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {e.nom}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {data.circuitsBailleur.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Aucune demande de décaissement en cours</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Vue Générale §21 (ADMIN / MISSION / TECHNIQUE) ────────────────────────────
function DashboardGeneral({ data }: {
  data: {
    role: string;
    decomptes: {
      total: number;
      enAttente: number;
      enCorrection: number;
      validesDg: number;
      enCircuitFinancier: number;
      payes: number;
      montantEngageGnf: string;
      montantPayeGnf: string;
      byStatut: Record<string, number>;
    };
    marches: { total: number; actifs: number };
    entreprises: { total: number; bloquees: number };
    workflow: { tauxRejet: number; tauxCorrection: number; circuitsFinanciersEnCours: number };
    alertes: { nonEnvoyees: number };
  };
}) {
  const d = data.decomptes;
  const statuts = Object.entries(d.byStatut ?? {}).map(([statut, count]) => ({ statut, count }));
  const STATUT_LABELS: Record<string, string> = {
    BROUILLON: "Brouillon", DEPOSE: "Déposé", EN_CONTROLE: "En contrôle", EN_CORRECTION: "Correction",
    EN_VALIDATION: "Validation", VALIDE_DG: "Validé DG", EN_CIRCUIT_FINANCIER: "Circuit paiement",
    ORDONNANCE: "Ordonnancé", VALIDE: "Validé", REJETE: "Rejeté", PAYE: "Payé",
  };
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi label="Total décomptes"  value={d.total}              icon={Receipt}     accent="bg-navy"/>
        <Kpi label="En attente"       value={d.enAttente}          icon={Clock}       accent="bg-amber-500"/>
        <Kpi label="Circuit paiement" value={d.enCircuitFinancier} icon={GitBranch}   accent="bg-blue-600"/>
        <Kpi label="Payés"            value={d.payes}              icon={CheckCircle} accent="bg-green-600"/>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Kpi label="Marchés actifs"       value={data.marches.actifs}    sub={`/ ${data.marches.total} total`}           icon={Briefcase}     accent="bg-indigo-600"/>
        <Kpi label="Entreprises"          value={data.entreprises.total} sub={`${data.entreprises.bloquees} bloquée(s)`} icon={Building2}     accent="bg-navy"/>
        <Kpi label="Alertes non envoyées" value={data.alertes.nonEnvoyees}                                               icon={AlertTriangle} accent="bg-red-500"/>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <BarChart2 className="h-4 w-4"/> Répartition par statut
          </p>
          {statuts.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={statuts} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="statut" tick={{ fontSize: 9 }} tickFormatter={(v) => STATUT_LABELS[v]?.split(" ")[0] ?? v}/>
                <YAxis tick={{ fontSize: 10 }}/>
                <Tooltip formatter={(value: number) => [value, "Décomptes"]}/>
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {statuts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-400 text-center py-8">Aucune donnée</p>}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-700 mb-4">Indicateurs workflow (30j)</p>
          <div className="space-y-4">
            {([
              ["Taux de rejet",      `${data.workflow.tauxRejet}%`,      data.workflow.tauxRejet > 20 ? "text-red-600" : "text-green-700"],
              ["Taux de correction", `${data.workflow.tauxCorrection}%`, data.workflow.tauxCorrection > 30 ? "text-amber-600" : "text-green-700"],
              ["Circuits financiers en cours", data.workflow.circuitsFinanciersEnCours, "text-blue-700"],
            ] as [string, string | number, string][]).map(([k, v, c]) => (
              <div key={k} className="flex justify-between items-center">
                <span className="text-sm text-gray-600">{k}</span>
                <span className={`font-bold text-lg ${c}`}>{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-gray-100 pt-4 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Montant engagé total</span>
              <span className="font-semibold text-navy">{fmtGnf(d.montantEngageGnf)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Montant payé total</span>
              <span className="font-semibold text-green-700">{fmtGnf(d.montantPayeGnf)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role ?? "ADMIN";

  const { data: generalData, isLoading: loadingGeneral } = useQuery({
    queryKey: ["dashboard-general"],
    queryFn: () => api.get("/dashboard").then((r) => r.data).catch(() => api.get("/dashboard/stats").then((r) => r.data)),
  });
  const { data: dgData, isLoading: loadingDg } = useQuery({
    queryKey: ["dashboard-dg"],
    queryFn: () => api.get("/dashboard/dg").then((r) => r.data),
    enabled: role === "DG" || role === "ADMIN",
  });
  const { data: dafData, isLoading: loadingDaf } = useQuery({
    queryKey: ["dashboard-daf"],
    queryFn: () => api.get("/dashboard/daf").then((r) => r.data),
    enabled: role === "DAF" || role === "ADMIN",
  });
  const { data: dmcData, isLoading: loadingDmc } = useQuery({
    queryKey: ["dashboard-dmc"],
    queryFn: () => api.get("/dashboard/dmc").then((r) => r.data),
    enabled: role === "DMC" || role === "ADMIN",
  });
  const { data: pipelineData } = useQuery({
    queryKey: ["dashboard-pipeline"],
    queryFn: () => api.get("/dashboard/pipeline").then((r) => r.data),
    enabled: role === "DG" || role === "ADMIN",
    staleTime: 15000,
  });
  const { data: ugpData, isLoading: loadingUgp } = useQuery({
    queryKey: ["dashboard-ugp"],
    queryFn: () => api.get("/dashboard/ugp").then((r) => r.data),
    enabled: role === "UGP" || role === "ADMIN",
  });

  const { data: mesTaches } = useQuery({
    queryKey: ["dash-mes-taches"],
    queryFn: () => api.get("/workflow/mes-taches").then((r) => r.data),
    refetchInterval: 60000,
  });

  const loading = loadingGeneral || loadingDg || loadingDaf || loadingDmc || loadingUgp;

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse"/>
        ))}
      </div>
    );
  }

  const nbTaches = Array.isArray(mesTaches) ? mesTaches.length : 0;
  return (
    <div className="space-y-8">
      {/* Centre d'action — ce que JE dois traiter maintenant */}
      {nbTaches > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-bold text-amber-900">Vous avez {nbTaches} dossier(s) à traiter</p>
            <p className="text-xs text-amber-700 mt-0.5 truncate">
              {(mesTaches as Array<{ decompte?: { reference?: string }; etapeCourante?: { nom?: string } }>).slice(0, 3)
                .map((t) => `${t.decompte?.reference ?? "—"} (${t.etapeCourante?.nom ?? ""})`).join(" · ")}
              {nbTaches > 3 ? ` · +${nbTaches - 3} autres` : ""}
            </p>
          </div>
          <a href="/workflow" className="shrink-0 bg-navy text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-navy/90 transition-colors">
            Ouvrir Mes tâches →
          </a>
        </div>
      )}
      {/* Vue DG §21 */}
      {(role === "DG" || role === "ADMIN") && dgData && (
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Eye className="h-5 w-5 text-navy"/> Vue Direction Générale §15/§21
          </h2>
          <DashboardDg data={dgData} pipeline={pipelineData?.pipeline}/>
        </section>
      )}

      {/* Vue DAF §21 */}
      {(role === "DAF" || role === "ADMIN") && dafData && (
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Stamp className="h-5 w-5 text-blue-600"/> Vue DAF — Engagements & Circuits financiers §14/§16/§21
          </h2>
          <DashboardDaf data={dafData}/>
        </section>
      )}

      {/* Vue DMC §21 */}
      {(role === "DMC" || role === "ADMIN") && dmcData && (
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-600"/> Vue DMC — Contrôle contractuel §13/§21
          </h2>
          <DashboardDmc data={dmcData}/>
        </section>
      )}

      {/* Vue UGP §21 */}
      {(role === "UGP" || role === "ADMIN") && ugpData && (
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <CircleDollarSign className="h-5 w-5 text-blue-600"/> Vue UGP — Demandes de décaissement §16.2/§21
          </h2>
          <DashboardUgp data={ugpData}/>
        </section>
      )}

      {/* Vue générale */}
      {generalData && (
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-gray-600"/> Vue d&apos;ensemble
          </h2>
          <DashboardGeneral data={generalData}/>
        </section>
      )}
    </div>
  );
}
