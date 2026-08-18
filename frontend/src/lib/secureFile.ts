/**
 * Accès aux fichiers protégés (/api/uploads/files/...).
 * Le téléchargement exige une URL signée éphémère délivrée par
 * GET /api/uploads/sign/:filename (authentifié). Les URL externes
 * ou d'un autre chemin sont ouvertes telles quelles.
 */
import { api } from "./api";

export function isProtectedFile(url?: string | null): boolean {
  return !!url && url.startsWith("/api/uploads/files/");
}

export async function signFileUrl(url: string): Promise<string> {
  if (!isProtectedFile(url)) return url;
  const filename = url.split("/").pop()?.split("?")[0] ?? "";
  const res = await api.get(`/uploads/sign/${encodeURIComponent(filename)}`);
  return res.data.url as string;
}

export async function openSecureFile(url: string): Promise<void> {
  window.open(await signFileUrl(url), "_blank");
}
