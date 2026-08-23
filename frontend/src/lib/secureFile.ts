/**
 * Accès aux fichiers protégés (/api/uploads/files/...).
 *
 * Depuis le 23/08/2026 le téléchargement exige la SESSION en plus du lien
 * signé : le serveur revérifie le périmètre au moment de servir le fichier.
 * Un `window.open(url)` ne porte pas d'en-tête Authorization — on récupère
 * donc le fichier par `fetch` authentifié, puis on ouvre le blob. Le lien
 * signé (GET /api/uploads/sign/:filename) reste demandé comme second facteur
 * à durée courte.
 *
 * Les URL externes ou d'un autre chemin sont ouvertes telles quelles.
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

/**
 * Télécharge un fichier protégé avec la session et renvoie une URL de blob
 * locale (à révoquer par l'appelant quand elle n'est plus affichée).
 */
export async function fetchSecureBlobUrl(url: string): Promise<string> {
  if (!isProtectedFile(url)) return url;
  const signed = await signFileUrl(url);
  // `api` a pour base "/api" : on lui passe le chemin sans ce préfixe.
  const chemin = signed.replace(/^\/api/, "");
  const res = await api.get(chemin, { responseType: "blob" });
  return URL.createObjectURL(res.data as Blob);
}

export async function openSecureFile(url: string): Promise<void> {
  if (!isProtectedFile(url)) { window.open(url, "_blank"); return; }
  const blobUrl = await fetchSecureBlobUrl(url);
  const win = window.open(blobUrl, "_blank");
  if (win) win.opener = null;
  // Laisser le temps à l'onglet de charger avant de libérer l'URL.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}
