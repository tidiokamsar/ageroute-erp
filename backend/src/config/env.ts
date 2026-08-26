import { z } from "zod";

const FORBIDDEN_SECRET_VALUES = new Set(["__A_GENERER__", "CHANGE_ME", "CHANGEME", "SECRET"]);
const jwtSecretSchema = z.string().min(48, "Le secret JWT doit contenir au moins 48 caract\u00e8res").superRefine((value, ctx) => {
  const normalized = value.trim().toUpperCase();
  if (FORBIDDEN_SECRET_VALUES.has(normalized) || normalized.includes("A_GENERER")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Le secret JWT doit \u00eatre g\u00e9n\u00e9r\u00e9 al\u00e9atoirement" });
  }
  if (/^(.)\1+$/.test(value) || /ERP[_-]?AGEROUTE|JWT[_-]?SECRET|PASSWORD|MOTDEPASSE/i.test(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Le secret JWT est trop pr\u00e9visible" });
  }
});


export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4001),
  DATABASE_URL: z.string(),
  JWT_SECRET: jwtSecretSchema,
  JWT_REFRESH_SECRET: jwtSecretSchema,
  CORS_ORIGIN: z.string().default("*").transform((v) => v.split(",").map((s) => s.trim())),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("noreply@ageroute.gov.gn"),
  GEOPORTAIL_URL: z.string().default("https://carte.ageroute.gov.gn"),
  UPLOAD_DIR: z.string().default("/app/uploads"),
  // Proxys de confiance devant Express (voir app.ts). 2 en production —
  // Traefik puis nginx — 0 en développement direct. Décrit par le déploiement.
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(2),
}).superRefine((value, ctx) => {
  if (value.JWT_SECRET === value.JWT_REFRESH_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["JWT_REFRESH_SECRET"],
      message: "Les secrets JWT d'acc\u00e8s et de renouvellement doivent \u00eatre distincts",
    });
  }
});

export const env = envSchema.parse(process.env);
