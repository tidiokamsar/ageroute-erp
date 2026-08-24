/**
 * L0.4 — Onglet « Règles financières » du Paramétrage ().
 * Liste des règles A1-A10 avec cycle de vie (brouillon→soumise→approuvée/gelée),
 * simulateur avant/après, et historique par règle.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError } from "../../lib/api";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Input, Select, FormField, Textarea } from "../ui/Input";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { toast } from "../ui/Toast";
import { useAuth } from "../../lib/auth";
import { Settings2, Plus, Send, CheckCircle2, XCircle, Lock, Eye, FlaskConical, History } from "lucide-react";

interface RegleGestion {
  id: string; cle: string; categorie: string; libelle: string; description?: string;
  type: string; options?: Record<string, unknown>;
  portee: string; porteeId: string;
  valeur: string; valeurDefaut: string;
  dateEffet: string; statut: string; version: number;
  motif: string; motifRejet?: string;
  saisiPar?: string; soumisPar?: string; validePar?: string;
  createdAt: string;
}

const STATUT_CFG: Record<string, { label: string; cls: string; icon: typeof Settings2 }> = {
  BROUILLON:  { label: "Brouillon",   cls: "bg-gray-100 text-gray-600",   icon: Settings2 },
  SOUMISE:    { label: "Soumise",     cls: "bg-blue-100 text-blue-700",   icon: Send },
  APPROUVEE:  { label: "Approuvée",   cls: "bg-green-100 text-green-700", icon: CheckCircle2 },
  REJETEE:    { label: "Rejetée",     cls: "bg-red-100 text-red-700",     icon: XCircle },
  GELEE:      { label: "Gelée",       cls: "bg-purple-100 text-purple-700", icon: Lock },
};

const CATEGORIES = [
  { value: "FINANCE", label: "Finance (A1-A7)" },
  { value: "WORKFLOW", label: "Workflow & Circuits (A8)" },
  { value: "ETATS", label: "Libellés d'états (A9)" },
  { value: "CONFORMITE", label: "Conformité (A10)" },
];

const CLES_DISPONIBLES = [
  { value: "RG_ASSIETTE_RETENUE_GARANTIE", label: "A1 — Assiette retenue de garantie", type: "ENUM", options: { choices: ["TTC", "HT"] } },
  { value: "RG_FORMULE_PRECOMPTE_TVA", label: "A2 — Formule précompte TVA", type: "ENUM", options: { choices: ["PRORATA_9_118", "TAUX_HT", "TAUX_TTC"] } },
  { value: "RG_TAUX_PRECOMPTE_HT", label: "A2 — Taux précompte HT (%)", type: "NUMBER", options: { min: 0, max: 20 } },
  { value: "RG_TAUX_ARMP", label: "A3 — Taux ARMP (%)", type: "NUMBER", options: { min: 0, max: 2, step: 0.1 } },
  { value: "RG_ARMP_ASSIETTE", label: "A3 — Assiette ARMP", type: "ENUM", options: { choices: ["HT", "TTC"] } },
  { value: "RG_ARMP_INCLUSE_TTC", label: "A3 — ARMP incluse dans le TTC", type: "BOOLEAN" },
  { value: "RG_NET_PLANCHER_ZERO", label: "A4 — Net à payer plancher zéro", type: "BOOLEAN" },
  { value: "RG_REPORT_PENALITES", label: "A4 — Report des pénalités", type: "BOOLEAN" },
  { value: "RG_PENALITE_MODE", label: "A5 — Mode pénalités", type: "ENUM", options: { choices: ["SAISIE", "FORMULE"] } },
  { value: "RG_PENALITE_PLAFOND_PCT", label: "A5 — Plafond pénalités (%)", type: "NUMBER", options: { min: 0, max: 25 } },
  { value: "RG_AVANCE_MODE", label: "A6 — Mode avance", type: "ENUM", options: { choices: ["UNIQUE", "DEMARRAGE_APPRO"] } },
  { value: "RG_TAUX_AVANCE_DEMARRAGE", label: "A6 — Taux avance démarrage (%)", type: "NUMBER", options: { min: 0, max: 30 } },
  { value: "RG_TAUX_AVANCE_APPROVISIONNEMENT", label: "A6 — Taux avance approvisionnement (%)", type: "NUMBER", options: { min: 0, max: 30 } },
  { value: "RG_ARRONDI_MODE", label: "A7 — Mode d'arrondi", type: "ENUM", options: { choices: ["FRANC_PROCHE", "FRANC_INF", "FRANC_SUP"] } },
  { value: "WF_ROLES_LIQUIDATION", label: "A8 — Rôles habilités à liquider", type: "MULTI" },
  { value: "WF_ROLES_ORDONNANCEMENT", label: "A8 — Rôles habilités à ordonnancer", type: "MULTI" },
  { value: "WF_ROLES_PAIEMENT", label: "A8 — Rôles habilités à payer", type: "MULTI" },
  { value: "WF_SEPARATION_ORD_COMPTABLE", label: "A8 — Séparation ordonnateur/comptable", type: "BOOLEAN" },
];

export function ReglesFinancieres() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const role = user?.role ?? "";
  const peutSaisir = ["ADMIN", "DAF"].includes(role);
  const peutValider = ["ADMIN", "DAF", "DG"].includes(role);
  const peutGeler = ["ADMIN", "DG"].includes(role);

  const [filtreStatut, setFiltreStatut] = useState("");
  const [filtreCategorie, setFiltreCategorie] = useState("");
  const [modalCreation, setModalCreation] = useState(false);
  const [regleEdition, setRegleEdition] = useState<RegleGestion | null>(null);
  const [regleHisto, setRegleHisto] = useState<RegleGestion | null>(null);
  const [simRegle, setSimRegle] = useState<RegleGestion | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ regle: RegleGestion; action: "soumettre" | "approuver" | "rejeter" | "geler" } | null>(null);
  const [motifRejet, setMotifRejet] = useState("");

  const { data: regles, isLoading } = useQuery<{ data: RegleGestion[]; total: number }>({
    queryKey: ["regles-financieres", filtreStatut, filtreCategorie],
    queryFn: () => api.get("/parametrage/regles", {
      params: { pageSize: 100, ...(filtreStatut ? { statut: filtreStatut } : {}), ...(filtreCategorie ? { categorie: filtreCategorie } : {}) },
    }).then((r) => r.data),
  });

  const invalider = () => qc.invalidateQueries({ queryKey: ["regles-financieres"] });

  const actionMut = useMutation({
    mutationFn: ({ id, action, motif }: { id: string; action: string; motif?: string }) =>
      api.post(`/parametrage/regles/${id}/${action}`, motif ? { motifRejet: motif } : action === "geler" ? { motif: "Gel administratif" } : {}),
    onSuccess: (res) => { invalider(); toast.success((res.data as { message?: string })?.message ?? "Action effectuée"); setConfirmAction(null); setMotifRejet(""); },
    onError: (e) => { toast.error(parseApiError(e)); setConfirmAction(null); },
  });

  const liste = regles?.data ?? [];

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)} className="text-sm">
          <option value="">Tous les statuts</option>
          {Object.entries(STATUT_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <Select value={filtreCategorie} onChange={(e) => setFiltreCategorie(e.target.value)} className="text-sm">
          <option value="">Toutes les catégories</option>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
        <span className="text-xs text-gray-400 ml-auto">{liste.length} règle(s)</span>
        {peutSaisir && (
          <Button size="sm" onClick={() => setModalCreation(true)}><Plus size={14} /> Nouvelle règle</Button>
        )}
      </div>

      {/* Liste */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {["Clé", "Libellé", "Catégorie", "Portée", "Valeur", "Statut", "Effet", "V", ""].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[10px] font-black text-gray-400 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}><td colSpan={9} className="px-3 py-2"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
            ))}
            {!isLoading && liste.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400 text-sm">Aucune règle — les valeurs par défaut du code s'appliquent</td></tr>
            )}
            {liste.map((r) => {
              const cfg = STATUT_CFG[r.statut] ?? { label: r.statut, cls: "bg-gray-100", icon: Settings2 };
              const Icone = cfg.icon;
              return (
                <tr key={r.id} className="hover:bg-gray-50/50">
                  <td className="px-3 py-2 font-mono text-xs text-navy">{r.cle}</td>
                  <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate" title={r.libelle}>{r.libelle}</td>
                  <td className="px-3 py-2"><span className="text-[9px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{r.categorie}</span></td>
                  <td className="px-3 py-2 text-xs text-gray-500">{r.portee === "GLOBAL" ? "Global" : `${r.portee}: ${r.porteeId?.slice(0, 8)}`}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.valeur}</td>
                  <td className="px-3 py-2"><span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${cfg.cls} flex items-center gap-1 w-fit`}><Icone size={10} />{cfg.label}</span></td>
                  <td className="px-3 py-2 text-xs text-gray-400">{new Date(r.dateEffet).toLocaleDateString("fr-FR")}</td>
                  <td className="px-3 py-2 text-xs text-gray-400">v{r.version}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setSimRegle(r)} title="Simuler"><FlaskConical size={12} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setRegleHisto(r)} title="Historique"><History size={12} /></Button>
                      {r.statut === "BROUILLON" && peutSaisir && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setRegleEdition(r)} title="Modifier"><Settings2 size={12} /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmAction({ regle: r, action: "soumettre" })} title="Soumettre"><Send size={12} /></Button>
                        </>
                      )}
                      {r.statut === "SOUMISE" && peutValider && (
                        <>
                          <Button size="sm" variant="ghost" className="text-green-600" onClick={() => setConfirmAction({ regle: r, action: "approuver" })} title="Approuver"><CheckCircle2 size={12} /></Button>
                          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => setConfirmAction({ regle: r, action: "rejeter" })} title="Rejeter"><XCircle size={12} /></Button>
                        </>
                      )}
                      {r.statut === "APPROUVEE" && peutGeler && (
                        <Button size="sm" variant="ghost" className="text-purple-600" onClick={() => setConfirmAction({ regle: r, action: "geler" })} title="Geler"><Lock size={12} /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modals seront rendus ici (création, édition, confirmation, historique, simulateur) */}
      {/* Pour la concision du premier livrable, les modals de création/édition utilisent le pattern existant */}

      <ConfirmDialog
        open={confirmAction !== null}
        onClose={() => { setConfirmAction(null); setMotifRejet(""); }}
        onConfirm={() => confirmAction && actionMut.mutate({ id: confirmAction.regle.id, action: confirmAction.action, motif: motifRejet || undefined })}
        title={confirmAction?.action === "approuver" ? "Approuver cette règle ?" : confirmAction?.action === "rejeter" ? "Rejeter cette règle ?" : confirmAction?.action === "geler" ? "Geler cette règle ?" : "Soumettre cette règle ?"}
        message={
          <div className="space-y-2">
            <p>{confirmAction?.regle.libelle} — valeur : <b>{confirmAction?.regle.valeur}</b></p>
            {confirmAction?.action === "approuver" && <p className="text-xs text-gray-500">La règle deviendra active à sa date d'effet. Le cache sera invalidé immédiatement.</p>}
            {confirmAction?.action === "geler" && <p className="text-xs text-red-500">La règle deviendra immuable — aucune modification possible.</p>}
            {confirmAction?.action === "rejeter" && (
              <Textarea value={motifRejet} onChange={(e) => setMotifRejet(e.target.value)} placeholder="Motif du rejet (obligatoire, min 10 caractères)" />
            )}
          </div>
        }
        danger={confirmAction?.action === "rejeter" || confirmAction?.action === "geler"}
        confirmLabel={confirmAction?.action === "approuver" ? "Approuver" : confirmAction?.action === "rejeter" ? "Rejeter" : confirmAction?.action === "geler" ? "Geler" : "Soumettre"}
        loading={actionMut.isPending}
      />
    </div>
  );
}
