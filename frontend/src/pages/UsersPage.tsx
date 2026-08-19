import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Input, Select, FormField } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { toast } from "../components/ui/Toast";
import { Plus, Users, CheckCircle, XCircle, KeyRound, Pencil, Trash2, Search, ShieldCheck, Briefcase } from "lucide-react";
import { FileUploadModal } from "../components/ui/FileUploadModal";

interface User {
  id: string; email: string; nomComplet: string; role: string;
  nom?: string | null; prenom?: string | null; fonction?: string | null; signatureUrl?: string | null;
  actif: boolean; derniereConnexion?: string; createdAt: string;
}

const ROLES = [
  "ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE",
  "ENTREPRISE","AUDITEUR","BAILLEUR","BUDGET","TRESOR","FER_AGT",
];
const ROLE_LABELS: Record<string,string> = {
  ADMIN:"Administrateur", DG:"Direction Générale", DAF:"DAF", DMC:"Dir. Marchés",
  UGP:"UGP", MISSION:"Mission Contrôle", TECHNIQUE:"Dir. Technique",
  ENTREPRISE:"Entreprise", AUDITEUR:"Auditeur",
  BAILLEUR:"Bailleur Externe", BUDGET:"Dir. Budget (MEF)", TRESOR:"Trésor Public", FER_AGT:"FER",
};
const ROLE_COLORS: Record<string,string> = {
  ADMIN:"bg-red-100 text-red-800", DG:"bg-purple-100 text-purple-800",
  DAF:"bg-blue-100 text-blue-800", DMC:"bg-indigo-100 text-indigo-800",
  UGP:"bg-teal-100 text-teal-800", MISSION:"bg-green-100 text-green-800",
  TECHNIQUE:"bg-amber-100 text-amber-800", ENTREPRISE:"bg-orange-100 text-orange-800",
  AUDITEUR:"bg-gray-100 text-gray-700", BAILLEUR:"bg-sky-100 text-sky-800",
  BUDGET:"bg-violet-100 text-violet-800", TRESOR:"bg-emerald-100 text-emerald-800",
  FER_AGT:"bg-yellow-100 text-yellow-800",
};

export default function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<User | null | "new">(null);
  const [form, setForm] = useState<Record<string,unknown>>({});
  const [confirmDel, setConfirmDel] = useState<User|null>(null);
  const [accessUser, setAccessUser] = useState<User|null>(null);
  const [affectUser, setAffectUser] = useState<User|null>(null);
  const [pwdModal, setPwdModal] = useState<User|null>(null);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [depotSignature, setDepotSignature] = useState(false);

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => api.get("/users").then((r) => r.data),
  });

  const createMut = useMutation({
    mutationFn: (b:object) => api.post("/users", b).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({queryKey:["users"]}); toast.success("Utilisateur créé"); setModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const updateMut = useMutation({
    mutationFn: ({id,body}:{id:string;body:object}) => api.put(`/users/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({queryKey:["users"]}); toast.success("Utilisateur mis à jour"); setModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const toggleActifMut = useMutation({
    mutationFn: ({id,actif}:{id:string;actif:boolean}) => api.put(`/users/${id}/actif`, {actif}),
    onSuccess: (_,v) => { qc.invalidateQueries({queryKey:["users"]}); toast.success(v.actif?"Compte activé":"Compte désactivé"); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const deleteMut = useMutation({
    mutationFn: (id:string) => api.delete(`/users/${id}`),
    onSuccess: () => { qc.invalidateQueries({queryKey:["users"]}); toast.success("Utilisateur supprimé"); setConfirmDel(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const resetPwdMut = useMutation({
    mutationFn: ({id,password}:{id:string;password:string}) => api.post(`/users/${id}/reset-password`, {password}),
    onSuccess: () => { toast.success("Mot de passe réinitialisé"); setPwdModal(null); setNewPwd(""); setConfirmPwd(""); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const filtered = (users??[]).filter((u) =>
    !search || u.nomComplet.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  function openNew() { setForm({ role: "MISSION", actif: true }); setModal("new"); }
  function openEdit(u:User) {
    setForm({
      email:u.email, nomComplet:u.nomComplet, role:u.role, actif:u.actif,
      nom:u.nom ?? "", prenom:u.prenom ?? "", fonction:u.fonction ?? "", signatureUrl:u.signatureUrl ?? "",
    });
    setModal(u);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"/>
          <Input className="pl-9" placeholder="Rechercher..." value={search} onChange={(e)=>setSearch(e.target.value)}/>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4"/> Nouvel utilisateur</Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>{["Nom","Email","Rôle","Actif","Dernière connexion","Actions"].map((h)=>(
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && Array.from({length:5}).map((_,i)=><tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse"/></td></tr>)}
            {!isLoading && filtered.length===0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-30"/><p>Aucun utilisateur</p>
              </td></tr>
            )}
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-navy/10 flex items-center justify-center text-xs font-bold text-navy">{u.nomComplet[0]}</div>
                    <span className="font-medium text-gray-800">{u.nomComplet}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role]??""}`}>{ROLE_LABELS[u.role]??u.role}</span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={()=>toggleActifMut.mutate({id:u.id,actif:!u.actif})} title={u.actif?"Désactiver":"Activer"}>
                    {u.actif?<CheckCircle className="h-5 w-5 text-green-500"/>:<XCircle className="h-5 w-5 text-red-400"/>}
                  </button>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {u.derniereConnexion?new Date(u.derniereConnexion).toLocaleString("fr-GN"):"-"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={()=>openEdit(u)}><Pencil className="h-3.5 w-3.5"/></Button>
                    <Button size="sm" variant="ghost" onClick={()=>{setPwdModal(u);setNewPwd("");setConfirmPwd("");}} title="Réinitialiser mot de passe">
                      <KeyRound className="h-3.5 w-3.5 text-amber-500"/>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={()=>setAccessUser(u)} title="Gérer les accès aux modules"><ShieldCheck className="h-3.5 w-3.5 text-blue-500"/></Button>
                    <Button size="sm" variant="ghost" onClick={()=>setAffectUser(u)} title="Affecter des marchés (périmètre de travail)"><Briefcase className="h-3.5 w-3.5 text-teal-600"/></Button>
                    <Button size="sm" variant="ghost" onClick={()=>setConfirmDel(u)}><Trash2 className="h-3.5 w-3.5 text-red-400"/></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2 border-t border-gray-50 text-xs text-gray-400">
          {filtered.length} utilisateur{filtered.length>1?"s":""} — {(users??[]).filter((u)=>u.actif).length} actif{(users??[]).filter((u)=>u.actif).length>1?"s":""}
        </div>
      </div>

      {/* Modal création/édition */}
      <Modal open={modal!==null} onClose={()=>setModal(null)} title={modal==="new"?"Nouvel utilisateur":"Modifier l'utilisateur"} size="md">
        <div className="space-y-3">
          <FormField label="Nom complet" required><Input value={String(form.nomComplet??"")} onChange={(e)=>setForm({...form,nomComplet:e.target.value})}/></FormField>

          {/* Identité officielle — portée sur les documents signés. Le nom
              complet reste l'affichage courant de l'application ; ces champs
              alimentent les cartouches de visa, où l'usage sépare les deux. */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Prénom"><Input value={String(form.prenom??"")} onChange={(e)=>setForm({...form,prenom:e.target.value})} placeholder="Abdoulaye"/></FormField>
            <FormField label="Nom"><Input value={String(form.nom??"")} onChange={(e)=>setForm({...form,nom:e.target.value})} placeholder="DABO"/></FormField>
          </div>
          <FormField label="Fonction (telle qu'elle figure sur les documents)">
            <Input value={String(form.fonction??"")} onChange={(e)=>setForm({...form,fonction:e.target.value})} placeholder="Chef de Mission de Contrôle"/>
          </FormField>

          <FormField label="Signature numérique">
            <div className="flex items-center gap-3">
              {form.signatureUrl ? (
                <img src={String(form.signatureUrl)} alt="Spécimen de signature" className="h-14 rounded border border-gray-200 bg-white object-contain px-2" />
              ) : (
                <span className="text-xs text-gray-400">Aucun spécimen déposé</span>
              )}
              <Button size="sm" variant="secondary" onClick={()=>setDepotSignature(true)}>
                {form.signatureUrl ? "Remplacer" : "Déposer"}
              </Button>
              {Boolean(form.signatureUrl) && (
                <Button size="sm" variant="ghost" onClick={()=>setForm({...form,signatureUrl:""})}>Retirer</Button>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Apposée sur les décomptes, attachements et PV validés par cet agent. Elle complète le
              cachet électronique, elle ne le remplace pas.
            </p>
          </FormField>
          <FormField label="Email" required><Input type="email" value={String(form.email??"")} onChange={(e)=>setForm({...form,email:e.target.value})}/></FormField>
          <FormField label="Rôle" required>
            <Select value={String(form.role??"")} onChange={(e)=>setForm({...form,role:e.target.value})}>
              {ROLES.map((r)=><option key={r} value={r}>{ROLE_LABELS[r]??r}</option>)}
            </Select>
          </FormField>
          {modal==="new" && (
            <FormField label="Mot de passe" required>
              <Input type="password" value={String(form.password??"")} onChange={(e)=>setForm({...form,password:e.target.value})} placeholder="Min 8 caractères"/>
            </FormField>
          )}
          <FormField label="Statut">
            <Select value={String(form.actif)} onChange={(e)=>setForm({...form,actif:e.target.value==="true"})}>
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </Select>
          </FormField>
          {String(form.role)==="ENTREPRISE" && (
            <FormField label="ID Entreprise liée">
              <Input value={String(form.entrepriseId??"")} onChange={(e)=>setForm({...form,entrepriseId:e.target.value})} placeholder="ID de l'entreprise dans le référentiel"/>
            </FormField>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
          <Button variant="secondary" onClick={()=>setModal(null)}>Annuler</Button>
          <Button onClick={()=>modal==="new"?createMut.mutate(form):modal&&typeof modal==="object"&&updateMut.mutate({id:modal.id,body:form})} disabled={createMut.isPending||updateMut.isPending}>
            {createMut.isPending||updateMut.isPending?"Enregistrement...":"Enregistrer"}
          </Button>
        </div>
      </Modal>

      {/* Modal reset mot de passe */}
      <Modal open={!!pwdModal} onClose={()=>setPwdModal(null)} title={`Réinitialiser le mot de passe — ${pwdModal?.nomComplet}`} size="sm">
        <div className="space-y-3">
          <FormField label="Nouveau mot de passe">
            <Input type="password" value={newPwd} onChange={(e)=>setNewPwd(e.target.value)} placeholder="Min 8 caractères"/>
          </FormField>
          <FormField label="Confirmer">
            <Input type="password" value={confirmPwd} onChange={(e)=>setConfirmPwd(e.target.value)}/>
          </FormField>
          {newPwd && confirmPwd && newPwd!==confirmPwd && <p className="text-xs text-red-500">Les mots de passe ne correspondent pas</p>}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={()=>setPwdModal(null)}>Annuler</Button>
          <Button onClick={()=>pwdModal&&resetPwdMut.mutate({id:pwdModal.id,password:newPwd})} disabled={!newPwd||newPwd!==confirmPwd||resetPwdMut.isPending}>
            {resetPwdMut.isPending?"Enregistrement...":"Réinitialiser"}
          </Button>
        </div>
      </Modal>

      {/* Confirmation suppression */}
      <Modal open={!!confirmDel} onClose={()=>setConfirmDel(null)} title="Supprimer l'utilisateur" size="sm">
        <p className="text-sm text-gray-600 mb-4">Supprimer définitivement <strong>{confirmDel?.nomComplet}</strong> ({confirmDel?.email}) ?</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={()=>setConfirmDel(null)}>Annuler</Button>
          <Button variant="danger" onClick={()=>confirmDel&&deleteMut.mutate(confirmDel.id)} disabled={deleteMut.isPending}>Supprimer</Button>
        </div>
      </Modal>
      {accessUser && <AccessModal user={accessUser} onClose={()=>setAccessUser(null)} />}
      {affectUser && <AffectModal user={affectUser} onClose={()=>setAffectUser(null)} />}

      <FileUploadModal
        open={depotSignature}
        onClose={() => setDepotSignature(false)}
        title="Déposer le spécimen de signature"
        onFileUploaded={(url) => { setForm({ ...form, signatureUrl: url }); setDepotSignature(false); }}
      />

    </div>
  );
}

interface AccessMod { key: string; label: string; defaultAllowed: boolean; override: boolean | null; effective: boolean; }

function AccessModal({ user, onClose }: { user: User; onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["user-access", user.id],
    queryFn: () => api.get(`/users/${user.id}/access`).then((r) => r.data),
  });
  const mut = useMutation({
    mutationFn: (v: { moduleKey: string; allowed: boolean | null }) => api.put(`/users/${user.id}/access`, v).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["user-access", user.id] }); toast.success("Accès mis à jour"); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const modules: AccessMod[] = data?.modules ?? [];
  const opts: [string, boolean | null][] = [["Défaut", null], ["Accordé", true], ["Retiré", false]];
  return (
    <Modal open onClose={onClose} title={`Accès aux modules — ${user.nomComplet}`} size="lg">
      <div className="p-4">
        <p className="text-xs text-gray-500 mb-3">
          « Défaut » = accès normal du rôle <strong>{user.role}</strong>. « Accordé » force l'accès, « Retiré » le bloque (prioritaire sur le rôle).
        </p>
        <div className="space-y-0.5 max-h-[58vh] overflow-auto pr-1">
          {modules.map((m) => (
            <div key={m.key} className="flex items-center justify-between py-2 border-b border-gray-50">
              <div className="min-w-0">
                <p className="text-sm font-medium text-navy">{m.label}</p>
                <p className="text-[10px] text-gray-400">
                  défaut : {m.defaultAllowed ? "autorisé" : "refusé"} · effectif : {m.effective ? "✓ accès" : "✗ bloqué"}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                {opts.map(([label, val]) => {
                  const active = m.override === val;
                  const cls = active
                    ? (val === false ? "bg-red-600 text-white border-red-600" : val === true ? "bg-green-600 text-white border-green-600" : "bg-navy text-white border-navy")
                    : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50";
                  return (
                    <button key={label} onClick={() => mut.mutate({ moduleKey: m.key, allowed: val })}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${cls}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-4">
          <Button onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </Modal>
  );
}

interface AffectMarche { id: string; reference: string; intitule: string; statut: string; entreprise?: { raisonSociale: string }; affecte: boolean; }

function AffectModal({ user, onClose }: { user: User; onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["user-affectations", user.id],
    queryFn: () => api.get(`/users/${user.id}/affectations`).then((r) => r.data),
  });
  const marches: AffectMarche[] = data?.marches ?? [];
  const [sel, setSel] = useState<Set<string> | null>(null);
  const selected = sel ?? new Set(marches.filter((m) => m.affecte).map((m) => m.id));
  const mut = useMutation({
    mutationFn: () => api.put(`/users/${user.id}/affectations`, { marcheIds: [...selected] }).then((r) => r.data),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["user-affectations", user.id] }); toast.success(`Périmètre enregistré (${r.nbAffectes} marché(s))`); onClose(); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSel(next);
  }
  return (
    <Modal open onClose={onClose} title={`Périmètre de travail — ${user.nomComplet}`} size="lg">
      <div className="p-4">
        <p className="text-xs text-gray-500 mb-3">
          Cochez les marchés confiés à cet agent ({user.role}). Il ne verra que ces marchés,
          leurs projets, entreprises, décomptes et attachements.{" "}
          <strong className="text-amber-700">Aucune case cochée = aucun accès</strong> — un agent
          sans périmètre ne voit rien.
        </p>
        {marches.length === 0 && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            Aucun marché à afficher. Créez d'abord un marché pour pouvoir définir un périmètre.
          </p>
        )}
        <div className="space-y-1 max-h-[55vh] overflow-auto pr-1">
          {marches.map((m) => (
            <label key={m.id} className="flex items-center gap-3 py-2 px-2 border-b border-gray-50 cursor-pointer hover:bg-gray-50 rounded">
              <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} className="h-4 w-4"/>
              <div className="min-w-0">
                <p className="text-sm font-medium text-navy font-mono">{m.reference} <span className="text-[10px] text-gray-400 font-sans">({m.statut})</span></p>
                <p className="text-xs text-gray-500 truncate">{m.intitule} — {m.entreprise?.raisonSociale ?? ""}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "..." : "Enregistrer le périmètre"}</Button>
        </div>
      </div>
    </Modal>
  );
}
