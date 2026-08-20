import { useState, useEffect } from "react";
import { api } from "./api";

// Doit refléter l'énumération `Role` de backend/prisma/schema.prisma. Le type
// n'en listait que 9 sur 14 : les rôles externes existaient en base et étaient
// renvoyés par l'API, mais n'étaient pas typés ici. DSF s'y ajoute — Direction
// de la Structuration Financière, consultation et suivi financier, hors circuit.
export type Role =
  | "ADMIN" | "DG" | "DAF" | "DSF" | "DMC" | "UGP" | "MISSION" | "TECHNIQUE"
  | "ENTREPRISE" | "AUDITEUR" | "BAILLEUR" | "BUDGET" | "TRESOR" | "FER_AGT" | "BCRG";
export interface AuthUser { id: string; email: string; nomComplet: string; role: Role; modules?: string[]; }

let _user: AuthUser | null = null;
let _loading = true;
const _listeners = new Set<() => void>();
function notify() { _listeners.forEach((l) => l()); }

export const authStore = {
  getUser: () => _user,
  isLoading: () => _loading,
  subscribe: (fn: () => void) => { _listeners.add(fn); return () => _listeners.delete(fn); },
  async login(email: string, password: string) {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("erp_access", data.accessToken);
    localStorage.setItem("erp_refresh", data.refreshToken);
    _user = data.user; notify();
  },
  logout() {
    const refresh = localStorage.getItem("erp_refresh");
    if (refresh) api.post("/auth/logout", { refreshToken: refresh }).catch(() => {});
    localStorage.removeItem("erp_access");
    localStorage.removeItem("erp_refresh");
    _user = null; notify();
  },
  async loadMe() {
    try {
      if (!localStorage.getItem("erp_access")) { _loading = false; notify(); return; }
      const { data } = await api.get("/auth/me");
      _user = data; _loading = false; notify();
    } catch { _user = null; _loading = false; notify(); }
  },
};

export function useAuth() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const unsub = authStore.subscribe(() => rerender((n) => n + 1));
    return () => { unsub(); };
  }, []);
  return { user: authStore.getUser(), loading: authStore.isLoading() };
}

export function canWrite(role?: Role | null) {
  return role ? ["ADMIN", "DAF", "DMC"].includes(role) : false;
}

export function canValidate(role?: Role | null) {
  return role ? ["ADMIN", "DAF", "DG", "DMC", "TECHNIQUE", "UGP"].includes(role) : false;
}
