/**
 * Service d'authentification — login, refresh, logout, 2FA.
 *
 * F-GO1 (27/08/2026) : 2FA TOTP pour les rôles financiers. Le login d'un
 * compte 2FA actif se fait en DEUX TEMPS :
 *   1. POST /api/auth/login → { deuxFacteurRequis: true, jetonProvisoire }
 *      (mot de passe vérifié, mais PAS de jeton de session — juste un JWT
 *      court à audience dédiée qui n'autorise QUE le défi 2FA) ;
 *   2. POST /api/auth/2fa/challenge { jetonProvisoire, code } → jetons complets.
 *
 * Rôles EXIGÉS (RG_2FA_ROLES, défaut DAF,DG) sans 2FA actif : le login renvoie
 * { enrôlementRequis: true, jetonProvisoire } — l'utilisateur ne peut QUE
 * s'enrôler (setup + verify) avant d'obtenir une session.
 */
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma";
import { signAccess, signRefresh, verifyRefresh, empreinteRefreshToken } from "../../lib/jwt";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import { env } from "../../config/env";
import { verifierCode, genererSecret, uriOtpauth, genererCodesSecours, empreinteCodeSecours } from "../../lib/totp";
import { chargerRegles } from "../../lib/regles";

// ── Jeton provisoire 2FA (audience dédiée, 5 minutes) ───────────────────────
function signJetonProvisoire(payload: { userId: string; but: "challenge" | "enrolement" }) {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: "HS256", issuer: "erp-ageroute", audience: "erp-ageroute-2fa",
    subject: payload.userId, expiresIn: "5m",
  });
}

export function verifierJetonProvisoire(token: string): { userId: string; but: string } {
  return jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"], issuer: "erp-ageroute", audience: "erp-ageroute-2fa",
  }) as { userId: string; but: string };
}

/** Rôles pour lesquels le 2FA est OBLIGATOIRE (règle RG_2FA_ROLES). */
export async function roles2FARequis(): Promise<string[]> {
  const regles = await chargerRegles();
  return (regles.RG_2FA_ROLES ?? "").split(",").map((r) => r.trim()).filter(Boolean);
}

// ── Login (étape 1 : mot de passe → session OU défi 2FA) ────────────────────
export async function login(email: string, password: string, ip?: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.actif) {
    await logAudit({ action: "LOGIN_FAILED", entityType: "User", ipAddress: ip });
    throw new ApiError(401, "Identifiants incorrects");
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await logAudit({ userId: user.id, action: "LOGIN_FAILED", entityType: "User", ipAddress: ip });
    throw new ApiError(401, "Identifiants incorrects");
  }

  // ── F-GO1 : 2FA ──
  if (user.twoFactorActif) {
    // Le mot de passe est bon : jeton provisoire pour le défi uniquement.
    await logAudit({ userId: user.id, action: "LOGIN_2FA_EN_ATTENTE" as never, entityType: "User", ipAddress: ip });
    return { deuxFacteurRequis: true as const, jetonProvisoire: signJetonProvisoire({ userId: user.id, but: "challenge" }) };
  }
  const rolesRequis = await roles2FARequis();
  if (rolesRequis.includes(user.role)) {
    // Rôle financier sans 2FA : enrôlement OBLIGATOIRE avant toute session.
    await logAudit({ userId: user.id, action: "LOGIN_2FA_ENROLEMENT_REQUIS" as never, entityType: "User", ipAddress: ip });
    return { enrôlementRequis: true as const, jetonProvisoire: signJetonProvisoire({ userId: user.id, but: "enrolement" }) };
  }

  // Pas de 2FA requis : session immédiate.
  const accessToken = signAccess({ userId: user.id, email: user.email, role: user.role });
  const refreshToken = signRefresh({ userId: user.id, email: user.email, role: user.role });
  await prisma.refreshToken.create({
    data: { token: empreinteRefreshToken(refreshToken), userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
  });
  await prisma.user.update({ where: { id: user.id }, data: { derniereConnexion: new Date() } });
  await logAudit({ userId: user.id, action: "LOGIN", entityType: "User", ipAddress: ip });
  return { accessToken, refreshToken, user: { id: user.id, email: user.email, nomComplet: user.nomComplet, role: user.role } };
}

// ── Login (étape 2 : défi TOTP ou code de secours) ──────────────────────────
export async function challenge2FA(jetonProvisoire: string, code: string, ip?: string) {
  let payload: { userId: string; but: string };
  try {
    payload = verifierJetonProvisoire(jetonProvisoire);
  } catch {
    throw new ApiError(401, "Jeton provisoire expiré ou invalide — reconnectez-vous");
  }
  if (payload.but !== "challenge") throw new ApiError(403, "Ce jeton ne sert pas au défi 2FA");

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || !user.actif || !user.twoFactorActif || !user.twoFactorSecret) {
    throw new ApiError(401, "Compte sans 2FA actif");
  }

  // 1. Code TOTP ?
  if (verifierCode(user.twoFactorSecret, code.trim())) {
    // Succès → session complète (même logique que login sans 2FA)
    return sessionComplete(user, ip, "LOGIN_2FA");
  }

  // 2. Code de secours ? (haché, à usage unique)
  const codesSecours = (user.twoFactorCodesSecours as Array<{ hash: string; utilise: boolean }> | null) ?? [];
  const empreinte = empreinteCodeSecours(code);
  const indexCode = codesSecours.findIndex((c) => c.hash === empreinte && !c.utilise);
  if (indexCode >= 0) {
    codesSecours[indexCode].utilise = true;
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorCodesSecours: codesSecours as never } });
    await logAudit({ userId: user.id, action: "LOGIN_2FA_SECOURS" as never, entityType: "User", ipAddress: ip });
    return sessionComplete(user, ip, "LOGIN_2FA");
  }

  await logAudit({ userId: user.id, action: "LOGIN_2FA_ECHEC" as never, entityType: "User", ipAddress: ip });
  throw new ApiError(401, "Code 2FA incorrect");
}

// ── Enrôlement : générer le secret, puis vérifier ────────────────────────────
export async function setup2FA(jetonProvisoire: string) {
  let payload: { userId: string; but: string };
  try { payload = verifierJetonProvisoire(jetonProvisoire); } catch { throw new ApiError(401, "Jeton provisoire expiré"); }
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) throw new ApiError(404, "Utilisateur introuvable");

  // Si le 2FA est déjà actif, refaire un setup exige une désactivation préalable
  if (user.twoFactorActif) throw new ApiError(409, "2FA déjà actif — désactivez-le d'abord (mot de passe + code requis)");

  const secret = genererSecret();
  const uri = uriOtpauth(secret, user.email);
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: secret, twoFactorActif: false } });
  return { secret, uri, message: "Ajoutez ce secret dans votre application d'authentification, puis appelez /2fa/verify avec un code." };
}

export async function verify2FA(jetonProvisoire: string, code: string, ip?: string) {
  let payload: { userId: string; but: string };
  try { payload = verifierJetonProvisoire(jetonProvisoire); } catch { throw new ApiError(401, "Jeton provisoire expiré"); }
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || !user.twoFactorSecret) throw new ApiError(400, "Aucun enrôlement en cours");
  if (user.twoFactorActif) throw new ApiError(409, "2FA déjà actif");

  if (!verifierCode(user.twoFactorSecret, code.trim())) {
    throw new ApiError(401, "Code incorrect — vérifiez l'horloge de votre application d'authentification");
  }

  // Activation + génération des codes de secours (montrés UNE fois)
  const codesSecours = genererCodesSecours(8);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorActif: true,
      twoFactorCodesSecours: codesSecours.map((c) => ({ hash: empreinteCodeSecours(c), utilise: false })) as never,
    },
  });
  await logAudit({ userId: user.id, action: "UPDATE", entityType: "User", entityId: user.id, after: { deuxFacteurActive: true }, ipAddress: ip });
  return { deuxFacteurActif: true, codesSecours, message: "Conservez ces codes de secours en lieu sûr — ils ne seront plus jamais affichés." };
}

// ── Désactivation (mot de passe + code actuel) ───────────────────────────────
export async function disable2FA(userId: string, password: string, code: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.twoFactorActif) throw new ApiError(400, "2FA non actif");
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new ApiError(401, "Mot de passe incorrect");
  if (!user.twoFactorSecret || !verifierCode(user.twoFactorSecret, code.trim())) {
    throw new ApiError(401, "Code 2FA incorrect");
  }
  // Un rôle EXIGÉ ne peut pas se désactiver sans changer de rôle (sinon il
  // se prive lui-même du login).
  const rolesRequis = await roles2FARequis();
  if (rolesRequis.includes(user.role)) {
    throw new ApiError(403, `Le 2FA est OBLIGATOIRE pour le rôle ${user.role} — il ne peut pas être désactivé`);
  }
  await prisma.user.update({ where: { id: userId }, data: { twoFactorActif: false, twoFactorSecret: null, twoFactorCodesSecours: Prisma.JsonNull } });
  await logAudit({ userId, action: "UPDATE", entityType: "User", entityId: userId, after: { deuxFacteurDesactive: true } });
  return { deuxFacteurActif: false };
}

// ── Session complète (factored, utilisé par login et challenge) ─────────────
async function sessionComplete(user: { id: string; email: string; nomComplet: string; role: string }, ip: string | undefined, actionAudit: string) {
  const accessToken = signAccess({ userId: user.id, email: user.email, role: user.role });
  const refreshToken = signRefresh({ userId: user.id, email: user.email, role: user.role });
  await prisma.refreshToken.create({
    data: { token: empreinteRefreshToken(refreshToken), userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
  });
  await prisma.user.update({ where: { id: user.id }, data: { derniereConnexion: new Date() } });
  await logAudit({ userId: user.id, action: actionAudit as never, entityType: "User", ipAddress: ip });
  return { accessToken, refreshToken, user: { id: user.id, email: user.email, nomComplet: user.nomComplet, role: user.role } };
}

// ── Refresh et logout (inchangés) ────────────────────────────────────────────
export async function refresh(token: string) {
  let payload;
  try { payload = verifyRefresh(token); } catch { throw new ApiError(401, "Refresh token invalide"); }
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || !user.actif) throw new ApiError(401, "Utilisateur inactif");
  return prisma.$transaction(async (tx) => {
    const revoque = await tx.refreshToken.updateMany({
      where: { token: empreinteRefreshToken(token), revoked: false, expiresAt: { gt: new Date() } },
      data: { revoked: true },
    });
    if (revoque.count !== 1) throw new ApiError(401, "Refresh token invalide");
    const newAccess = signAccess({ userId: user.id, email: user.email, role: user.role });
    const newRefresh = signRefresh({ userId: user.id, email: user.email, role: user.role });
    await tx.refreshToken.create({
      data: { token: empreinteRefreshToken(newRefresh), userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
    });
    return { accessToken: newAccess, refreshToken: newRefresh };
  });
}

export async function logout(token: string) {
  await prisma.refreshToken.updateMany({ where: { token: empreinteRefreshToken(token) }, data: { revoked: true } });
}
