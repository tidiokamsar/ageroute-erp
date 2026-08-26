import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";
import { signAccess, signRefresh, verifyRefresh } from "../../lib/jwt";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";

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
  const accessToken = signAccess({ userId: user.id, email: user.email, role: user.role });
  const refreshToken = signRefresh({ userId: user.id, email: user.email, role: user.role });
  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
  });
  await prisma.user.update({ where: { id: user.id }, data: { derniereConnexion: new Date() } });
  await logAudit({ userId: user.id, action: "LOGIN", entityType: "User", ipAddress: ip });
  return { accessToken, refreshToken, user: { id: user.id, email: user.email, nomComplet: user.nomComplet, role: user.role } };
}

export async function refresh(token: string) {
  let payload;
  try {
    payload = verifyRefresh(token);
  } catch {
    throw new ApiError(401, "Refresh token invalide");
  }
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || !user.actif) throw new ApiError(401, "Utilisateur inactif");

  // Rotation ATOMIQUE — constat « rejeu du refresh token » de la revue du
  // 22/08/2026. L'ancienne version lisait le jeton (findUnique), vérifiait
  // `revoked`, puis le révoquait dans une requête séparée : deux appels
  // simultanés avec le même jeton passaient tous deux la lecture et recevaient
  // chacun une session neuve — un jeton volé restait exploitable en parallèle
  // de son propriétaire. Ici, la révocation conditionnelle est la vérification :
  // `updateMany` ne touche une ligne que si elle est encore valide, et seul
  // l'appel qui a réellement révoqué (count = 1) obtient la nouvelle session.
  // PostgreSQL sérialise les deux UPDATE sur la même ligne ; le second voit
  // revoked = true et n'affecte rien.
  return prisma.$transaction(async (tx) => {
    const revoque = await tx.refreshToken.updateMany({
      where: { token, revoked: false, expiresAt: { gt: new Date() } },
      data: { revoked: true },
    });
    if (revoque.count !== 1) throw new ApiError(401, "Refresh token invalide");

    const newAccess = signAccess({ userId: user.id, email: user.email, role: user.role });
    const newRefresh = signRefresh({ userId: user.id, email: user.email, role: user.role });
    await tx.refreshToken.create({
      data: { token: newRefresh, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
    });
    return { accessToken: newAccess, refreshToken: newRefresh };
  });
}

export async function logout(token: string) {
  await prisma.refreshToken.updateMany({ where: { token }, data: { revoked: true } });
}
