import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4";
process.env.JWT_REFRESH_SECRET = "Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2H1g0F9e8D7c6";

test("les jetons d'acces et de renouvellement ont des usages distincts", async () => {
  const { signAccess, signRefresh, verifyAccess, verifyRefresh } = await import("./jwt");
  const payload = { userId: "00000000-0000-0000-0000-000000000001", email: "test@ageroute.gov.gn", role: "ADMIN" };
  const access = signAccess(payload);
  const refresh = signRefresh(payload);

  assert.equal(verifyAccess(access).userId, payload.userId);
  assert.equal(verifyRefresh(refresh).userId, payload.userId);
  assert.throws(() => verifyAccess(refresh));
  assert.throws(() => verifyRefresh(access));

  const decoded = jwt.decode(access, { complete: true });
  assert.equal(decoded?.header.alg, "HS256");
  assert.equal((decoded?.payload as jwt.JwtPayload).iss, "erp-ageroute");
  assert.equal((decoded?.payload as jwt.JwtPayload).aud, "erp-ageroute-api");
  assert.ok((decoded?.payload as jwt.JwtPayload).jti);
});

test("empreinte refresh token — la base ne voit jamais le jeton en clair", async () => {
  const { signRefresh, empreinteRefreshToken } = await import("./jwt");
  const payload = { userId: "00000000-0000-0000-0000-000000000002", email: "test@ageroute.gov.gn", role: "DAF" };
  const jeton = signRefresh(payload);
  const empreinte = empreinteRefreshToken(jeton);

  // SHA-256 hexa, jamais le jeton lui-même
  assert.match(empreinte, /^[0-9a-f]{64}$/);
  assert.ok(!empreinte.includes(jeton.slice(0, 20)));
  // Déterministe (la comparaison en base doit matcher) et différenciante
  assert.equal(empreinteRefreshToken(jeton), empreinte);
  assert.notEqual(empreinteRefreshToken(signRefresh(payload)), empreinte);
});
