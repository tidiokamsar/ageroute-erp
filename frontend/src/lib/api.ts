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

export function fmtGnf(val: string | number | bigint | null | undefined): string {
  if (val == null) return "—";
  return new Intl.NumberFormat("fr-GN", { style: "currency", currency: "GNF", maximumFractionDigits: 0 }).format(Number(val));
}
