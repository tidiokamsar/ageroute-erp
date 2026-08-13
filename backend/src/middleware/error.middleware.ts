import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

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
  console.error(err);
  res.status(500).json({ error: "Erreur interne du serveur" });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "Route introuvable" });
}
