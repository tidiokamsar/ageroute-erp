import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { env } from "../config/env";

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

export function signAccess(payload: JwtPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "15m" });
}

export function signRefresh(payload: JwtPayload) {
  // `jwtid` aléatoire : sans lui, deux jetons signés pour le même compte dans
  // la même seconde (iat identique) sont BYTE POUR BYTE identiques, et le
  // second viole la contrainte d'unicité de refresh_tokens.token — 500 au
  // lieu d'une session. Défaut latent depuis l'origine, exposé le 22/08/2026
  // par un test qui enchaînait login et refresh dans la même seconde.
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: "7d", jwtid: randomUUID() });
}

export function verifyAccess(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

export function verifyRefresh(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
}
