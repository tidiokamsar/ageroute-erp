/**
 * Délégations d'intérim — un titulaire absent confie sa validation à un suppléant.
 * Le suppléant hérite temporairement du rôle du titulaire dans le workflow (tracé P.O.).
 */
import { useState } from "react";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/Button";
import { Input, Select, FormField, Textarea } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { toast } from "../components/ui/Toast";
import { UserCheck, Plus, Trash2, Power, ArrowRight, CalendarClock } from "lucide-react";

interface UserRef { id: string; nomComplet: string; email: string; role: string; }
interface Delegation {
  id: string; titulaireId: string; suppleantId: string;
  dateDebut: string; dateFin: string; motif?: string; actif: boolean;
  titulaire: UserRef; suppleant: UserRef;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur", DG: "Directeur Général", DAF: "Dir. Admin & Fin.",
  DSF: "Dir. Structuration Fin.",
  DMC: "Dir. Marchés & Contrats", UGP: "Unité Gestion Projet", MISSION: "Mission",
  TECHNIQUE: "Dir. Technique", AUDITEUR: "Auditeur",
  BAILLEUR: "Bailleur Externe", BUDGET: "Dir. Budget (MEF)", TRESOR: "Trésor Public",
  FER_AGT: "FER", BCRG: "Banque Centrale",
};

function fmtDate(d?: string) { return d ? new Date(d).toLocaleDateString("fr-FR") : "—"; }

function statut(d: Delegation): { label: string; cls: string } {
  const now = new Date();
  const debut = new Date(d.dateDebut), fin = new Date(d.dateFin);
  if (!d.actif) return { label: "Désactivée", cls: "bg-gray-100 text-gray-500" };
  if (now < debut) return { label: "À venir", cls: "bg-blue-50 text-blue-700" };
  if (now > fin) return { label: "Expirée", cls: "bg-gray-100 text-gray-500" };
  return { label: "Active", cls: "bg-green-50 text-green-700" };
}

export function DelegationsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [modal, setModal] = useState(false);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});

  const { data: delegations, isLoading } = useQuery({
    queryKey: ["delegations"],
    queryFn: () => api.get("/delegations").then((r) => r.data as Delegation[]),
  });
  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/users").then((r) => r.data as UserRef[]),
  });

  const createMut = useMutation({
    mutationFn: (b: object) => api.post("/delegations", b).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["delegations"] }); toast.success("Délégation créée"); setModal(false); setForm({}); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const toggleMut = useMutation({
    mutationFn: (v: { id: string; actif: boolean }) => api.patch(`/delegations/${v.id}`, { actif: v.actif }).then((r) => r.data),
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ["delegations"] }); toast.success(v.actif ? "Réactivée" : "Désactivée"); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/delegations/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["delegations"] }); toast.success("Supprimée"); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  // Titulaires = utilisateurs internes valideurs (hors ENTREPRISE)
  const valideurs = (users ?? []).filter((u) => !["ENTREPRISE"].includes(u.role));

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-navy flex items-center gap-2">
            <UserCheck className="h-5 w-5" /> Délégations d'intérim
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Confier temporairement la validation d'un titulaire à un suppléant.
          </p>
        </div>
        <Button onClick={() => { setForm({ titulaireId: isAdmin ? "" : user?.id }); setModal(true); }}>
          <Plus className="h-4 w-4" /> Nouvelle délégation
        </Button>
      </div>

      {isLoading ? (
        <div className="h-24 bg-gray-50 animate-pulse rounded-xl" />
      ) : !(delegations ?? []).length ? (
        <div className="text-center py-16 text-gray-400">
          <CalendarClock className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>Aucune délégation enregistrée.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(delegations ?? []).map((d) => {
            const s = statut(d);
            const peutGerer = isAdmin || d.titulaireId === user?.id;
            return (
              <div key={d.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-navy">{d.titulaire.nomComplet}</span>
                    <span className="text-[10px] bg-navy/5 text-navy px-1.5 py-0.5 rounded">{ROLE_LABELS[d.titulaire.role] ?? d.titulaire.role}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                    <span className="font-semibold text-sm text-navy">{d.suppleant.nomComplet}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${s.cls}`}>{s.label}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Du {fmtDate(d.dateDebut)} au {fmtDate(d.dateFin)}
                    {d.motif ? ` · ${d.motif}` : ""}
                  </p>
                </div>
                {peutGerer && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleMut.mutate({ id: d.id, actif: !d.actif })}
                      title={d.actif ? "Désactiver" : "Réactiver"}
                      className={`p-2 rounded-lg hover:bg-gray-100 ${d.actif ? "text-green-600" : "text-gray-400"}`}>
                      <Power className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setASupprimer(d.id)}
                      title="Supprimer"
                      className="p-2 rounded-lg hover:bg-red-50 text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={aSupprimer !== null} danger title="Supprimer cette délégation ?"
        message="Le suppléant ne portera plus le rôle du titulaire. Un historique d'audit de la suppression est conservé."
        confirmLabel="Supprimer la délégation" loading={delMut.isPending}
        onClose={() => setASupprimer(null)}
        onConfirm={() => { if (aSupprimer) delMut.mutate(aSupprimer); setASupprimer(null); }}
      />

      <Modal open={modal} onClose={() => setModal(false)} title="Nouvelle délégation d'intérim" size="md">
        <div className="p-4 space-y-4">
          <FormField label="Titulaire (personne absente) *">
            <Select
              value={String(form.titulaireId ?? "")}
              disabled={!isAdmin}
              onChange={(e) => setForm({ ...form, titulaireId: e.target.value })}>
              <option value="">Sélectionner...</option>
              {valideurs.map((u) => <option key={u.id} value={u.id}>{u.nomComplet} — {ROLE_LABELS[u.role] ?? u.role}</option>)}
            </Select>
          </FormField>
          <FormField label="Suppléant (personne qui remplace) *">
            <Select value={String(form.suppleantId ?? "")} onChange={(e) => setForm({ ...form, suppleantId: e.target.value })}>
              <option value="">Sélectionner...</option>
              {valideurs.filter((u) => u.id !== form.titulaireId).map((u) => <option key={u.id} value={u.id}>{u.nomComplet} — {ROLE_LABELS[u.role] ?? u.role}</option>)}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date de début *">
              <Input type="date" value={String(form.dateDebut ?? "")} onChange={(e) => setForm({ ...form, dateDebut: e.target.value })} />
            </FormField>
            <FormField label="Date de fin *">
              <Input type="date" value={String(form.dateFin ?? "")} onChange={(e) => setForm({ ...form, dateFin: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Motif">
            <Textarea rows={2} value={String(form.motif ?? "")} onChange={(e) => setForm({ ...form, motif: e.target.value })}
              placeholder="Ex : Mission à l'intérieur, congé annuel..." />
          </FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="secondary" onClick={() => setModal(false)}>Annuler</Button>
            <Button
              onClick={() => createMut.mutate(form)}
              disabled={createMut.isPending || !form.titulaireId || !form.suppleantId || !form.dateDebut || !form.dateFin}>
              {createMut.isPending ? "Création..." : "Créer la délégation"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
