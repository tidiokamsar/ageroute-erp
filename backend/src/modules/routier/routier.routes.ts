/**
 * Module 7 — Référentiel Routier
 * Proxy vers Console BDRI pour consulter tronçons, ouvrages et régions.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { env } from "../../config/env";

export const routierRouter = Router();
routierRouter.use(requireAuth);

async function bdriGet(path: string, params?: Record<string, unknown>) {
  const url = new URL(`${env.GEOPORTAIL_URL}/api${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => v !== undefined && url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`BDRI ${res.status}`);
  return res.json();
}

routierRouter.get("/troncons", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await bdriGet("/troncons", { pageSize: 500, search: req.query.search });
    res.json(data);
  } catch {
    res.json({ data: [], total: 0, message: "Console BDRI temporairement inaccessible" });
  }
});

routierRouter.get("/troncons/:code", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await bdriGet("/troncons", { search: req.params.code, pageSize: 1 }) as { data?: unknown[] };
    const troncon = data?.data?.[0];
    if (!troncon) return res.status(404).json({ error: "Tronçon introuvable" });
    res.json(troncon);
  } catch (err) { next(err); }
});

routierRouter.get("/ouvrages", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await bdriGet("/ouvrages", { pageSize: 200, search: req.query.search });
    res.json(data);
  } catch {
    res.json({ data: [], total: 0 });
  }
});

routierRouter.get("/regions", async (_req: Request, res: Response) => {
  try {
    const data = await bdriGet("/regions");
    res.json(data);
  } catch {
    res.json([]);
  }
});
