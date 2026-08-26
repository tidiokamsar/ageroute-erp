import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4";
process.env.JWT_REFRESH_SECRET = "Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2H1g0F9e8D7c6";

test("la configuration refuse les secrets faibles, placeholders ou identiques", async () => {
  const { envSchema } = await import("./env");
  const base = {
    NODE_ENV: "test",
    DATABASE_URL: process.env.DATABASE_URL!,
    JWT_SECRET: process.env.JWT_SECRET!,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
  };
  assert.equal(envSchema.safeParse(base).success, true);
  assert.equal(envSchema.safeParse({ ...base, JWT_SECRET: "__A_GENERER__" }).success, false);
  assert.equal(envSchema.safeParse({ ...base, JWT_SECRET: "ERP_AGEROUTE_JWT_SECRET_2024_XXXXXXXXXXXXXXXX" }).success, false);
  assert.equal(envSchema.safeParse({ ...base, JWT_REFRESH_SECRET: base.JWT_SECRET }).success, false);
});
