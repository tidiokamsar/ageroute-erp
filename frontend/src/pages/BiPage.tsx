/**
 * BI / Data Warehouse — Tableaux de bord analytiques, KPIs, exports
 * Indicateurs : engagement, décaissement, délais de traitement, top entreprises
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, fmtGnf } from "../lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from "recharts";
import { Download, TrendingUp, BarChart2, PieChart as PieIcon, Activity } from "lucide-react";
import { Button } from "../components/ui/Button";

const STATUT_LABELS: Record<string,string> = {
  BROUILLON:"Brouillon", DEPOSE:"Déposé", EN_CONTROLE:"En contrôle", EN_CORRECTION:"En correction",
  EN_VALIDATION:"En validation", VALIDE_DG:"Validé DG", EN_CIRCUIT_FINANCIER:"Validation financière",
  ORDONNANCE:"Ordonnancé", VALIDE:"Validé", REJETE:"Rejeté", PAYE:"Payé",
};

const FINANCEMENT_COLORS: Record<string,string> = {
  BANQUE_MONDIALE:"#1565C0", BAD:"#E65100", BUDGET_NATIONAL:"#1B5E20", FER:"#4A148C",
  BOAD:"#00695C", BID:"#F57F17", UE:"#0D47A1", BADEA:"#BF360C", AFD:"#1A237E", KFW:"#33691E", AUTRE:"#546E7A",
};
const PIE_COLORS = ["#1A3C2E","#C8960C","#1565C0","#E65100","#4A148C","#00695C","#F57F17","#1A237E"];

function exportCSV(data: object[], filename: string) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const lines = [keys.join(","), ...data.map(r => keys.map(k => JSON.stringify((r as Record<string,unknown>)[k] ?? "")).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
}

export function BiPage() {
  const [tab, setTab] = useState<"general"|"financier"|"delais"|"entreprises" | "analytique" | "tresorerie">("general");

  const { data: general } = useQuery({
    queryKey: ["dashboard-general"],
    queryFn: () => api.get("/dashboard").then(r => r.data),
  });
  const { data: daf } = useQuery({
    queryKey: ["dashboard-daf"],
    queryFn: () => api.get("/dashboard/daf").then(r => r.data),
  });
  const { data: garantiesSynth } = useQuery({
    queryKey: ["garanties-synthese"],
    queryFn: () => api.get("/garanties/dashboard/synthese").then(r => r.data),
  });
  const { data: treso } = useQuery({
    queryKey: ["bi-tresorerie"],
    queryFn: () => api.get("/dashboard/tresorerie").then(r => r.data),
  });
  const { data: analytics } = useQuery({
    queryKey: ["bi-analytics"],
    queryFn: () => api.get("/dashboard/analytics").then(r => r.data),
  });
  const { data: recepSynth } = useQuery({
    queryKey: ["receptions-synthese"],
    queryFn: () => api.get("/receptions/dashboard/synthese").then(r => r.data),
  });

  // Graphique statuts
  const byStatutData = Object.entries((general?.decomptes?.byStatut ?? {})).map(([statut, count]) => ({
    statut: STATUT_LABELS[statut] ?? statut,
    count: count as number,
    statut_raw: statut,
  }));

  const kpis = [
    { label: "Total décomptes",         value: general?.decomptes?.total ?? "—",                   sub: "depuis le démarrage" },
    { label: "En attente traitement",   value: general?.decomptes?.enAttente ?? "—",               sub: "déposés / contrôle" },
    { label: "Circuits de paiement",    value: general?.workflow?.circuitsFinanciersEnCours ?? "—", sub: "validation achevée" },
    { label: "Montant engagé",          value: fmtGnf(general?.decomptes?.montantEngageGnf),        sub: "net total" },
    { label: "Montant décaissé",        value: fmtGnf(general?.decomptes?.montantPayeGnf),          sub: "payés" },
    { label: "Taux de rejet",           value: `${general?.workflow?.tauxRejet ?? 0}%`,             sub: "30 derniers jours" },
    { label: "Garanties actives",       value: garantiesSynth?.actives ?? "—",                      sub: `${garantiesSynth?.bientot ?? 0} expirent bientôt` },
    { label: "Réceptions définitives",  value: recepSynth?.definitives ?? "—",                      sub: "marchés clôturés" },
  ];

  const exportGeneral = () => {
    exportCSV([
      { indicateur:"Total décomptes", valeur: general?.decomptes?.total },
      { indicateur:"En attente", valeur: general?.decomptes?.enAttente },
      { indicateur:"Payés", valeur: general?.decomptes?.payes },
      { indicateur:"Montant engagé GNF", valeur: general?.decomptes?.montantEngageGnf },
      { indicateur:"Montant décaissé GNF", valeur: general?.decomptes?.montantPayeGnf },
      { indicateur:"Taux rejet %", valeur: general?.workflow?.tauxRejet },
      { indicateur:"Taux correction %", valeur: general?.workflow?.tauxCorrection },
      { indicateur:"Garanties actives", valeur: garantiesSynth?.actives },
      { indicateur:"Garanties expirées", valeur: garantiesSynth?.expirees },
      { indicateur:"OPR réalisées", valeur: recepSynth?.opr },
      { indicateur:"Réceptions provisoires", valeur: recepSynth?.provisoires },
      { indicateur:"Réceptions définitives", valeur: recepSynth?.definitives },
    ], `bi-ageroute-${new Date().toISOString().slice(0,10)}.csv`);
  };

  const exportStatuts = () => exportCSV(byStatutData.map(d => ({ statut: d.statut, nombre: d.count })), `statuts-decomptes-${new Date().toISOString().slice(0,10)}.csv`);

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2"><BarChart2 className="h-4 w-4"/>BI & Reporting AGEROUTE</h2>
          <p className="text-xs text-gray-400 mt-0.5">Indicateurs consolidés — données en temps réel</p>
        </div>
        <Button variant="secondary" onClick={exportGeneral}>
          <Download className="h-4 w-4"/> Exporter CSV complet
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map(({ label, value, sub }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-card px-4 py-3">
            <p className="text-xs text-gray-400">{label}</p>
            <p className="text-xl font-black text-navy mt-0.5 truncate">{value}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Onglets */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {([
          { id:"general",     label:"Statuts",      icon:BarChart2 },
          { id:"financier",   label:"Financier",    icon:TrendingUp },
          { id:"delais",      label:"Délais SLA",   icon:Activity },
          { id:"entreprises", label:"Entreprises",  icon:PieIcon },
          { id:"analytique",  label:"Analytique",   icon:TrendingUp },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${tab === id ? "bg-white text-navy shadow-sm" : "text-gray-500 hover:text-navy"}`}>
            <Icon className="h-3.5 w-3.5"/> {label}
          </button>
        ))}
      </div>

      {/* Onglet Statuts */}
      {tab === "general" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-700">Distribution des décomptes par statut</h3>
              <Button size="sm" variant="secondary" onClick={exportStatuts}><Download className="h-3.5 w-3.5"/> CSV</Button>
            </div>
            {byStatutData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byStatutData} margin={{ top:4, right:16, left:0, bottom:48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis dataKey="statut" tick={{ fontSize:10 }} angle={-30} textAnchor="end" interval={0}/>
                  <YAxis tick={{ fontSize:10 }} allowDecimals={false}/>
                  <Tooltip formatter={(v: number) => [v, "Décomptes"]}/>
                  <Bar dataKey="count" fill="#1A3C2E" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-gray-400 py-10">Aucune donnée</p>}
          </div>

          {/* Taux workflow */}
          {general?.workflow && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label:"Taux de rejet", value:`${general.workflow.tauxRejet}%`, color: general.workflow.tauxRejet > 20 ? "text-red-600" : "text-green-600" },
                { label:"Taux de correction", value:`${general.workflow.tauxCorrection}%`, color: general.workflow.tauxCorrection > 30 ? "text-amber-600" : "text-green-600" },
                { label:"Taux de validation", value:`${Math.max(0, 100 - general.workflow.tauxRejet - general.workflow.tauxCorrection)}%`, color:"text-navy" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
                  <p className="text-xs text-gray-500">{label} (30j)</p>
                  <p className={`text-3xl font-black ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Onglet Financier */}
      {tab === "financier" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {daf && ([
              { label:"Visas accordés",        value: daf.visaAccorde,     color:"text-green-700", bg:"bg-green-50" },
              { label:"Visas refusés",          value: daf.visaRefuse,      color:"text-red-700",   bg:"bg-red-50" },
              { label:"Ordonnancés",            value: daf.ordonnances,     color:"text-purple-700",bg:"bg-purple-50" },
              { label:"Montant ordonnancé",     value: fmtGnf(daf.montantOrdonnanceGnf), color:"text-navy", bg:"bg-navy/5" },
              { label:"Garanties actives",      value: garantiesSynth?.actives ?? "—",  color:"text-navy", bg:"bg-gold/10" },
              { label:"Montant garanti",        value: fmtGnf(garantiesSynth?.montantTotalGnf ?? "0"), color:"text-navy", bg:"bg-gold/10" },
            ]).map(({ label, value, color, bg }) => (
              <div key={label} className={`${bg} rounded-xl px-4 py-3`}>
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-xl font-black ${color} truncate`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Circuits en cours */}
          {daf?.circuitsEnCours?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-700">Circuits financiers en cours ({daf.circuitsEnCours.length})</h3>
                <Button size="sm" variant="secondary" onClick={() => exportCSV(
                  daf.circuitsEnCours.map((c: { type: string; decompte: { reference: string; netAPayer: string; marche: { reference: string }; entreprise: { raisonSociale: string } }; etapeActuelle: number }) => ({
                    type: c.type, decompte: c.decompte?.reference,
                    marche: c.decompte?.marche?.reference, entreprise: c.decompte?.entreprise?.raisonSociale,
                    montant: c.decompte?.netAPayer, etape: c.etapeActuelle
                  })), "circuits-en-cours.csv"
                )}><Download className="h-3.5 w-3.5"/> CSV</Button>
              </div>
              <div className="space-y-2">
                {daf.circuitsEnCours.slice(0, 8).map((c: { id: string; type: string; decompte: { reference: string; netAPayer: string; marche: { reference: string; financement: string }; entreprise: { raisonSociale: string } } }) => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                    <div>
                      <span className="text-xs font-bold text-gray-600">{c.decompte?.reference}</span>
                      <span className="text-xs text-gray-400 ml-2">{c.decompte?.marche?.reference}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{c.decompte?.entreprise?.raisonSociale}</span>
                      <span className="text-xs font-bold text-navy">{fmtGnf(c.decompte?.netAPayer)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-bold ${FINANCEMENT_COLORS[c.decompte?.marche?.financement] ? "text-white" : ""}`}
                        style={{ backgroundColor: FINANCEMENT_COLORS[c.decompte?.marche?.financement] ?? "#546E7A" }}>
                        {c.type}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Onglet Délais SLA */}
      {tab === "delais" && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-card p-6">
          <h3 className="text-sm font-bold text-gray-700 mb-4">Respect des délais SLA</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label:"Contrôle technique", sla:"5 jours", color:"bg-blue-50 text-blue-700" },
              { label:"Analyse DMC", sla:"3 jours", color:"bg-purple-50 text-purple-700" },
              { label:"Visa DAF", sla:"2 jours", color:"bg-green-50 text-green-700" },
              { label:"Décision DG", sla:"3 jours", color:"bg-amber-50 text-amber-700" },
              { label:"Circuit FER", sla:"15 jours", color:"bg-blue-50 text-blue-700" },
              { label:"Circuit Bailleur", sla:"30 jours", color:"bg-orange-50 text-orange-700" },
              { label:"Période de garantie", sla:"12 mois", color:"bg-gray-50 text-gray-700" },
              { label:"Levée des réserves", sla:"30 jours", color:"bg-amber-50 text-amber-700" },
            ].map(({ label, sla, color }) => (
              <div key={label} className={`${color} rounded-xl p-3 text-center`}>
                <p className="text-xs font-bold">{label}</p>
                <p className="text-lg font-black mt-1">{sla}</p>
                <p className="text-[9px] mt-1 opacity-70">SLA paramétré</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Les délais SLA sont modifiables sans redéveloppement via la page <strong>Paramétrage</strong>.
            Un moteur d'alertes automatiques notifie les responsables avant expiration.
          </p>
        </div>
      )}

      {/* Onglet Entreprises */}
      {tab === "entreprises" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label:"Total entreprises", value: general?.entreprises?.total ?? "—" },
              { label:"Bloquées", value: general?.entreprises?.bloquees ?? "—" },
              { label:"Alertes conformité", value: general?.alertes?.nonEnvoyees ?? "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-card px-4 py-3">
                <p className="text-xs text-gray-400">{label}</p>
                <p className="text-2xl font-black text-navy">{value}</p>
              </div>
            ))}
          </div>

          {/* Pie marchés par financement */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-card p-4">
            <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2"><PieIcon className="h-4 w-4"/>Répartition marchés par financement</h3>
            <p className="text-xs text-gray-400 text-center py-8">
              Données disponibles via l'API <code className="bg-gray-100 px-1 py-0.5 rounded">/api/marches?groupBy=financement</code><br/>
              À connecter via un endpoint dédié BI pour groupBy dynamique.
            </p>
          </div>

          {/* Résumé réceptions */}
          {recepSynth && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-card p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">Avancement des réceptions</h3>
              <div className="space-y-2">
                {[
                  { label:"OPR réalisées", value: recepSynth.opr, max: recepSynth.opr + recepSynth.enAttente, color:"bg-blue-400" },
                  { label:"Réceptions provisoires", value: recepSynth.provisoires, max: recepSynth.opr + recepSynth.enAttente, color:"bg-green-400" },
                  { label:"Réceptions définitives", value: recepSynth.definitives, max: recepSynth.opr + recepSynth.enAttente, color:"bg-purple-400" },
                ].map(({ label, value, max, color }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-40 shrink-0">{label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-3">
                      <div className={`h-3 rounded-full ${color} transition-all`} style={{ width: max > 0 ? `${Math.min(100, value/max*100)}%` : "0%" }}/>
                    </div>
                    <span className="text-xs font-bold text-gray-700 w-6 text-right">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Onglet Analytique — performance du circuit */}
      {tab === "analytique" && (
        <div className="space-y-4">
          {analytics?.cycleMoyen != null && (
            <div className="bg-navy text-white rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs opacity-70">Délai moyen complet dépôt → paiement</p>
                <p className="text-2xl font-black">{analytics.cycleMoyen} jours</p>
              </div>
              <Activity className="h-8 w-8 opacity-40"/>
            </div>
          )}
          <div className="bg-white rounded-xl border border-gray-100 shadow-card p-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Évolution mensuelle — certifié vs payé (millions FG)</h3>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={analytics?.evolutionMensuelle ?? []} margin={{ top:4, right:16, left:0, bottom:4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="mois" tick={{ fontSize:10 }}/>
                <YAxis tick={{ fontSize:10 }}/>
                <Tooltip formatter={(v: number) => [`${v.toLocaleString("fr-GN")} M FG`]}/>
                <Legend wrapperStyle={{ fontSize: 11 }}/>
                <Line type="monotone" dataKey="certifie" name="Certifié" stroke="#1B2A4A" strokeWidth={2} dot={{ r: 2 }}/>
                <Line type="monotone" dataKey="paye" name="Payé" stroke="#16a34a" strokeWidth={2} dot={{ r: 2 }}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-card p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">Délai moyen de validation par étape (jours)</h3>
              {(analytics?.delaisEtapes ?? []).length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={analytics.delaisEtapes} margin={{ top:4, right:16, left:0, bottom:4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                    <XAxis dataKey="etape" tick={{ fontSize:10 }}/>
                    <YAxis tick={{ fontSize:10 }}/>
                    <Tooltip formatter={(v: number, _n, p) => [`${v} j (sur ${(p?.payload as {n?:number})?.n ?? "?"} validations)`, "Délai moyen"]}/>
                    <Bar dataKey="jours" fill="#d97706" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-gray-400 py-10 text-sm">Pas encore assez de validations</p>}
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-card p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">Montants par source de financement (M FG)</h3>
              {(analytics?.financement ?? []).length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={analytics.financement} dataKey="value" nameKey="name" outerRadius={80} label={(e) => e.name}>
                      {(analytics.financement as {name:string}[]).map((_, i) => (
                        <Cell key={i} fill={["#1B2A4A","#16a34a","#d97706","#7c3aed","#0891b2","#dc2626"][i % 6]}/>
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${v.toLocaleString("fr-GN")} M FG`]}/>
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-gray-400 py-10 text-sm">Aucune donnée</p>}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-card p-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Top marchés — taux de consommation (%)</h3>
            <div className="space-y-2">
              {(analytics?.topMarches ?? []).map((m: { reference:string; intitule:string; taux:number; certifieMFg:number }) => (
                <div key={m.reference} className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-navy w-32 shrink-0">{m.reference}</span>
                  <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, m.taux)}%`, background: m.taux >= 85 ? "#dc2626" : m.taux >= 70 ? "#d97706" : "#16a34a" }}/>
                  </div>
                  <span className="text-xs font-bold w-14 text-right">{m.taux}%</span>
                  <span className="text-[10px] text-gray-400 w-24 text-right">{m.certifieMFg.toLocaleString("fr-GN")} M FG</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Onglet Trésorerie prévisionnelle */}
      {tab === "tresorerie" && (
        <div className="space-y-4">
          <div className="bg-navy text-white rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs opacity-70">Total en circuit (à décaisser)</p>
              <p className="text-2xl font-black">{((treso?.totalEnCircuit ?? 0) / 1e9).toFixed(2)} Mrd FG</p>
            </div>
            <p className="text-xs opacity-70 max-w-[280px] text-right">Projection fondée sur les délais moyens réels observés à chaque étape du circuit</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-card p-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Décaissements prévisionnels — 6 prochains mois (M FG)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={treso?.parMois ?? []} margin={{ top:4, right:16, left:0, bottom:4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="mois" tick={{ fontSize:10 }}/>
                <YAxis tick={{ fontSize:10 }}/>
                <Tooltip formatter={(v: number, _n, pl) => [`${v.toLocaleString("fr-GN")} M FG (${(pl?.payload as {nb?:number})?.nb ?? 0} dossier(s))`, "À décaisser"]}/>
                <Bar dataKey="montant" fill="#1B2A4A" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-card p-4 overflow-x-auto">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Dossiers en circuit — paiement estimé</h3>
            <table className="w-full text-xs">
              <thead className="bg-gray-50"><tr>
                {["Décompte","Marché","Entreprise","Statut","Net à payer","Délai estimé","Mois prévu"].map(h => <th key={h} className="text-left px-3 py-2 text-gray-500 font-medium">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {((treso?.dossiers ?? []) as Array<{ id:string; reference:string; marche?:string; entreprise?:string; statut:string; netAPayer:number; joursEstimes:number; moisPrevu:string }>).map(dd => (
                  <tr key={dd.id} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 font-mono font-bold text-navy">{dd.reference}</td>
                    <td className="px-3 py-2 text-gray-600">{dd.marche}</td>
                    <td className="px-3 py-2 text-gray-600 max-w-[140px] truncate">{dd.entreprise}</td>
                    <td className="px-3 py-2"><span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{dd.statut}</span></td>
                    <td className="px-3 py-2 font-medium">{(dd.netAPayer / 1e6).toLocaleString("fr-GN")} M</td>
                    <td className="px-3 py-2 text-gray-500">{dd.joursEstimes} j</td>
                    <td className="px-3 py-2 font-bold text-navy">{dd.moisPrevu}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
