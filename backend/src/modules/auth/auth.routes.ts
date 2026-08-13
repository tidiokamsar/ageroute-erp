import { Router, type Request, type Response, type NextFunction } from "express";
import { loginSchema, refreshSchema } from "./auth.schema";
import { login, refresh, logout } from "./auth.service";

export const authRouter = Router();

authRouter.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    res.json(await login(email, password, req.ip));
  } catch (err) { next(err); }
});

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

authRouter.get("/me", (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Non authentifié" });
  res.json(req.user);
});
