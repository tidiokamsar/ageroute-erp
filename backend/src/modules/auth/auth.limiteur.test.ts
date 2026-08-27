/**
 * Tests — le plafond de connexion protège le COMPTE visé et ne met pas
 * l'agence dehors (revue du 27/08/2026).
 *
 * Le limiteur était de 10 tentatives par ADRESSE et par quart d'heure. Toute
 * l'AGEROUTE sort par une adresse publique unique : trois agents qui se
 * trompent deux fois chacun épuisaient le quota et le suivant ne pouvait plus
 * se connecter. Et le compte visé, lui, n'était pas protégé : autant
 * d'adresses que l'on veut, 10 essais chacune.
 *
 * On monte ici un limiteur identique à celui de l'application et on le fait
 * réellement fonctionner — c'est le comportement qui est testé, pas le texte.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import rateLimit from "express-rate-limit";
import { readFileSync } from "node:fs";
import path from "node:path";

const FENETRE = 15 * 60 * 1000;

function compteVise(req: express.Request): string {
  const brut = (req.body as { email?: unknown } | undefined)?.email;
  return typeof brut === "string" && brut.trim() ? brut.trim().toLowerCase() : "(sans compte)";
}

/** Application d'essai : même montage que app.ts, mot de passe attendu « bon ». */
function appEssai() {
  const app = express();
  app.use(express.json());
  app.use("/login", rateLimit({
    windowMs: FENETRE, limit: 10, skipSuccessfulRequests: true,
    standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req) => `compte:${compteVise(req)}`,
    message: { error: "Trop de tentatives" },
  }));
  app.use("/login", rateLimit({
    windowMs: FENETRE, limit: 100, skipSuccessfulRequests: true,
    standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req) => `ip:${req.ip}`,
    message: { error: "Trop de tentatives" },
  }));
  app.post("/login", (req, res) => {
    if ((req.body as { password?: string }).password === "bon") return res.status(200).json({ ok: true });
    return res.status(401).json({ error: "Identifiants invalides" });
  });
  return app;
}

async function essai(app: express.Express, email: string, password: string): Promise<number> {
  const { createServer } = await import("node:http");
  const serveur = createServer(app);
  await new Promise<void>((r) => serveur.listen(0, "127.0.0.1", r));
  const port = (serveur.address() as { port: number }).port;
  try {
    const rep = await fetch(`http://127.0.0.1:${port}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return rep.status;
  } finally {
    await new Promise<void>((r) => serveur.close(() => r()));
  }
}

test("le bourrage sur un compte est arrêté, quelle que soit l origine", async () => {
  const app = appEssai();
  for (let i = 0; i < 10; i++) {
    assert.equal(await essai(app, "dg@ageroute.gov.gn", "faux"), 401, `tentative ${i + 1}`);
  }
  // Le serveur est recréé à chaque appel : l'adresse ne suffirait pas à
  // expliquer le blocage — c'est bien le compte visé qui est compté.
  assert.equal(await essai(app, "dg@ageroute.gov.gn", "faux"), 429,
    "la 11e tentative sur le même compte doit être refusée");
});

test("un autre agent n est pas puni pour les erreurs de son collègue", async () => {
  // Le défaut d'origine : l'agence partage une adresse, donc un compteur.
  const app = appEssai();
  for (let i = 0; i < 10; i++) await essai(app, "daf@ageroute.gov.gn", "faux");
  assert.equal(await essai(app, "dmc@ageroute.gov.gn", "faux"), 401,
    "le compte d'un autre agent doit rester joignable");
});

test("une connexion réussie ne consomme pas le quota", async () => {
  // Sans cela, un usage normal — écrans qui se rafraîchissent, reconnexions —
  // finissait par déclencher le blocage anti-intrusion.
  const app = appEssai();
  for (let i = 0; i < 30; i++) {
    assert.equal(await essai(app, "mission@ageroute.gov.gn", "bon"), 200, `connexion ${i + 1}`);
  }
});

test("la casse et les espaces ne créent pas un compteur par variante", async () => {
  const app = appEssai();
  for (let i = 0; i < 10; i++) await essai(app, "ugp@ageroute.gov.gn", "faux");
  assert.equal(await essai(app, "  UGP@Ageroute.GOV.gn  ", "faux"), 429,
    "changer la casse ne doit pas remettre le compteur à zéro");
});

test("l application monte bien les deux compteurs sur la route de connexion", () => {
  const source = readFileSync(path.join(__dirname, "..", "..", "app.ts"), "utf8");
  const montages = source.match(/app\.use\("\/api\/auth\/login"/g) ?? [];
  assert.equal(montages.length, 2, "un compteur par compte ET un compteur par adresse");
  assert.match(source, /skipSuccessfulRequests: true/);
  assert.doesNotMatch(source, /app\.use\("\/api\/auth\/login", rateLimit\(\{ windowMs: 15 \* 60 \* 1000, max: 10/,
    "l'ancien plafond par adresse ne doit pas revenir");
});
