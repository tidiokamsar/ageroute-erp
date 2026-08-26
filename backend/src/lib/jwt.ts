import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { env } from "../config/env";

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
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
