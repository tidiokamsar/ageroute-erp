import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { erreurJournalisable } from "../lib/masquage";

export class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Données invalides", details: err.flatten().fieldErrors });
  }
  // Jamais `console.error(err)` : le message d'une erreur Prisma contient le
  // payload refusé, mot de passe compris.
  console.error(erreurJournalisable(err));
  res.status(500).json({ error: "Erreur interne du serveur" });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "Route introuvable" });
}
