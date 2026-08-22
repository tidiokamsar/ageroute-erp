import axios from "axios";

export const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("erp_access");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      try {
        const refresh = localStorage.getItem("erp_refresh");
        if (!refresh) throw new Error("no refresh");
        const { data } = await axios.post("/api/auth/refresh", { refreshToken: refresh });
        localStorage.setItem("erp_access", data.accessToken);
        localStorage.setItem("erp_refresh", data.refreshToken);
        error.config.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(error.config);
      } catch {
        localStorage.removeItem("erp_access");
        localStorage.removeItem("erp_refresh");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export function parseApiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.error ?? err.message;
  }
  return err instanceof Error ? err.message : "Erreur inconnue";
}

/**
 * Montant en francs guinéens : « 52 000 000 000 GNF ».
 *
 * Le style « currency » en locale fr-GN affichait le symbole local « FG », qui
 * ne correspond ni aux documents officiels ni au reste de l'application, et
 * séparait les milliers par une espace fine insécable — invisible à l'écran
 * mais illisible dès qu'un montant part à l'impression. On formate donc en
 * fr-FR, on normalise les espaces et on écrit la devise explicitement.
 */
export function fmtGnf(val: string | number | bigint | null | undefined): string {
  if (val == null) return "—";
  const valeur = typeof val === "string" && /^-?\d+$/.test(val)
    ? BigInt(val)
    : typeof val === "bigint"
      ? val
      : Number(val);
  const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(valeur);
  return nombre.replace(/[    ]/g, " ") + " GNF";
}
