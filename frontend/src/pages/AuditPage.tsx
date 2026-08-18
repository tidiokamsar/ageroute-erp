import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ClipboardList, Filter } from "lucide-react";

interface AuditLog {
  id: string; action: string; entityType: string; entityId?: string;
  ipAddress?: string; createdAt: string;
  user?: { nomComplet: string; email: string };
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
  APPROVE: "bg-teal-100 text-teal-700",
  SIGN: "bg-indigo-100 text-indigo-700",
  REJECT: "bg-amber-100 text-amber-700",
  LOGIN: "bg-gray-100 text-gray-600",
  LOGIN_FAILED: "bg-red-100 text-red-700",
};

const ACTIONS = ["", "CREATE", "UPDATE", "DELETE", "APPROVE", "SIGN", "REJECT", "LOGIN", "LOGIN_FAILED"];
const ENTITES = ["", "Decompte", "Paiement", "Attachement", "Marche", "Projet", "Entreprise", "User", "Avenant", "Garantie", "Reception", "WorkflowInstance", "Upload", "Delegation"];

export function AuditPage() {
  const [fAction, setFAction] = useState("");
  const [fEntite, setFEntite] = useState("");
  const [fDu, setFDu] = useState("");
  const [fAu, setFAu] = useState("");

  const { data, isLoading, isFetching } = useQuery<AuditLog[]>({
    queryKey: ["audit", fAction, fEntite, fDu, fAu],
    queryFn: () => api.get("/audit", {
      params: {
        limit: 300,
        ...(fAction ? { action: fAction } : {}),
        ...(fEntite ? { entityType: fEntite } : {}),
        ...(fDu ? { du: fDu } : {}),
        ...(fAu ? { au: fAu } : {}),
      },
    }).then((r) => r.data),
  });

  const inputCls = "text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-navy/40";

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mr-1">
          <Filter size={13} /> Filtres
        </span>
        <select value={fAction} onChange={(e) => setFAction(e.target.value)} className={inputCls}>
          {ACTIONS.map((a) => <option key={a} value={a}>{a || "Toutes les actions"}</option>)}
        </select>
        <select value={fEntite} onChange={(e) => setFEntite(e.target.value)} className={inputCls}>
          {ENTITES.map((t) => <option key={t} value={t}>{t || "Toutes les entités"}</option>)}
        </select>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span>du</span>
          <input type="date" value={fDu} onChange={(e) => setFDu(e.target.value)} className={inputCls} />
          <span>au</span>
          <input type="date" value={fAu} onChange={(e) => setFAu(e.target.value)} className={inputCls} />
        </div>
        {(fAction || fEntite || fDu || fAu) && (
          <button
            onClick={() => { setFAction(""); setFEntite(""); setFDu(""); setFAu(""); }}
            className="text-xs text-gray-400 hover:text-red-500 underline"
          >
            Réinitialiser
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {isFetching ? "Chargement…" : `${data?.length ?? 0} entrée${(data?.length ?? 0) > 1 ? "s" : ""}`}
        </span>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {["Date", "Utilisateur", "Action", "Entité", "IP"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && Array.from({ length: 10 }).map((_, i) => (
              <tr key={i}><td colSpan={5} className="px-4 py-2"><div className="h-3 bg-gray-100 rounded animate-pulse" /></td></tr>
            ))}
            {!isLoading && (!data || data.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>Aucune entrée d'audit pour ces critères</p>
              </td></tr>
            )}
            {(data ?? []).map((log) => (
              <tr key={log.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">{new Date(log.createdAt).toLocaleString("fr-FR")}</td>
                <td className="px-4 py-2">
                  <p className="font-medium text-gray-800">{log.user?.nomComplet ?? "Système"}</p>
                  <p className="text-xs text-gray-400">{log.user?.email ?? ""}</p>
                </td>
                <td className="px-4 py-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ACTION_COLORS[log.action] ?? "bg-gray-100 text-gray-600"}`}>{log.action}</span>
                </td>
                <td className="px-4 py-2 text-gray-600">{log.entityType}{log.entityId ? <span className="text-xs text-gray-400 ml-1">#{log.entityId.slice(0, 8)}</span> : ""}</td>
                <td className="px-4 py-2 text-xs text-gray-400">{log.ipAddress ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
