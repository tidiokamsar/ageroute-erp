import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { loginSchema, refreshSchema } from "./auth.schema";
import { login, refresh, logout, challenge2FA, setup2FA, verify2FA, disable2FA } from "./auth.service";
import { requireAuth } from "../../middleware/auth.middleware";

export const authRouter = Router();

authRouter.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    res.json(await login(email, password, req.ip));
  } catch (err) { next(err); }
});

// ── F-GO1 — 2FA (TOTP) : les trois routes du cycle d'enrôlement et de défi.
// Aucune ne porte requireAuth : elles s'authentifient par le JETON PROVISOIRE
// (audience 2fa, 5 minutes) remis à l'étape 1 du login. ─────────────────────

// Défi : code TOTP ou code de secours → session complète
authRouter.post("/2fa/challenge", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jetonProvisoire, code } = z.object({ jetonProvisoire: z.string().min(1), code: z.string().min(6).max(11) }).parse(req.body);
    res.json(await challenge2FA(jetonProvisoire, code, req.ip));
  } catch (err) { next(err); }
});

// Enrôlement étape 1 : génère le secret + l'URI otpauth://
authRouter.post("/2fa/setup", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jetonProvisoire } = z.object({ jetonProvisoire: z.string().min(1) }).parse(req.body);
    res.json(await setup2FA(jetonProvisoire));
  } catch (err) { next(err); }
});

// Enrôlement étape 2 : vérifie le code et ACTIVE (codes de secours montrés UNE fois)
authRouter.post("/2fa/verify", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jetonProvisoire, code } = z.object({ jetonProvisoire: z.string().min(1), code: z.string().min(6).max(6) }).parse(req.body);
    res.json(await verify2FA(jetonProvisoire, code, req.ip));
  } catch (err) { next(err); }
});

// Désactivation : session authentifiée + mot de passe + code actuel
authRouter.post("/2fa/disable", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Non authentifié" });
    const { password, code } = z.object({ password: z.string().min(1), code: z.string().min(6).max(6) }).parse(req.body);
    res.json(await disable2FA(req.user.id, password, code));
  } catch (err) { next(err); }
});

// ── Fin 2FA ──────────────────────────────────────────────────────────────────

authRouter.post("/refresh", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    res.json(await refresh(refreshToken));
  } catch (err) { next(err); }
});

authRouter.post("/logout", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    await logout(refreshToken);
    res.status(204).send();
  } catch (err) { next(err); }
});

authRouter.get("/me", requireAuth, (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Non authentifié" });
  res.json(req.user);
});
