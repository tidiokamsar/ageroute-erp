import jwt from "jsonwebtoken";
import { randomUUID, createHash } from "node:crypto";
import { env } from "../config/env";

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

/**
 * Empreinte SHA-256 d'un refresh token — la base ne stocke JAMAIS le jeton
 * en clair (constat « refresh tokens en clair » de la revue du 26/08/2026) :
 * un dump de base (sauvegarde égarée, injection SQL future, accès admin
 * plateforme) ne livre que des empreintes, sans valeur présentable à
 * /api/auth/refresh. La rotation compare par empreinte, même transaction.
 */
export function empreinteRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function signAccess(payload: JwtPayload) {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: "HS256", issuer: "erp-ageroute", audience: "erp-ageroute-api",
    subject: payload.userId, jwtid: randomUUID(), expiresIn: "15m",
  });
}

export function signRefresh(payload: JwtPayload) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    algorithm: "HS256", issuer: "erp-ageroute", audience: "erp-ageroute-refresh",
    subject: payload.userId, jwtid: randomUUID(), expiresIn: "7d",
  });
}

export function verifyAccess(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"], issuer: "erp-ageroute", audience: "erp-ageroute-api",
  }) as JwtPayload;
}

export function verifyRefresh(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, {
    algorithms: ["HS256"], issuer: "erp-ageroute", audience: "erp-ageroute-refresh",
  }) as JwtPayload;
}
