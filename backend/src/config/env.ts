import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4001),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default("*").transform((v) => v.split(",").map((s) => s.trim())),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("noreply@ageroute.gov.gn"),
  GEOPORTAIL_URL: z.string().default("https://carte.ageroute.gov.gn"),
  UPLOAD_DIR: z.string().default("/app/uploads"),
});

export const env = schema.parse(process.env);
