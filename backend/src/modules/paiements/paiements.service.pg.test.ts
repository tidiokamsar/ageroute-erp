/**
 * Preuves PostgreSQL du service de paiement — concurrence et atomicité.
 *
 * Les tests unitaires valident les règles pures ; ils ne prouvent ni que le
 * verrou `FOR UPDATE` sérialise vraiment deux ordonnancements simultanés, ni
 * que la transaction se défait quand l'audit échoue. L'ADR-002 l'exige, la
 * revue du 22/08/2026 l'a noté absent. Ce fichier le démontre sur une VRAIE
 * base PostgreSQL.
 *
 * GARDE-FOU : ne s'exécute que si `PG_TEST=1`. La cible est une COPIE
 * RESTAURÉE dans un conteneur jetable (voir DEPLOIEMENT.md §4b) — jamais la
 * production : les tests modifient le statut d'un décompte et y créent des
 * paiements. Sans la variable, chaque test est marqué « skipped » et la suite
 * unitaire ordinaire n'est pas affectée.
 *
 * Les fixtures ne sont pas fabriquées : on prend un décompte EXISTANT de la
 * copie et on le met dans l'état requis (ORDONNANCE, circuit TERMINE, sans
 * paiement). C'est délibéré — inventer un marché et un décompte complets
 * imposerait de connaître toutes les colonnes obligatoires, et un oubli
 * prouverait moins que ce que prouve la donnée réelle.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const PG = process.env.PG_TEST === "1";
const opts = { skip: !PG && "PG_TEST=1 requis — preuve PostgreSQL sur copie restaurée uniquement" };

// Imports différés : sans PG_TEST, on ne charge même pas Prisma.
type Service = typeof import("./paiements.service");
type PrismaModule = typeof import("../../lib/prisma");
let service: Service;
let prisma: PrismaModule["prisma"];

let decompteId = "";
let net = 0n;
let acteur = { id: "", email: "" };
const PREFIXE = `PGTEST-${Date.now()}`;

before(async () => {
  if (!PG) return;
  service = await import("./paiements.service");
  prisma = (await import("../../lib/prisma")).prisma;

  const url = process.env.DATABASE_URL ?? "";
  // Refus catégorique si l'URL ressemble à la production.
  assert.ok(!/erp-db|gestion\.ageroute/.test(url), "DATABASE_URL pointe vers la production — refus");

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN", actif: true }, select: { id: true, email: true } });
  assert.ok(admin, "un compte ADMIN est nécessaire pour l'audit");
  acteur = admin;

  const d = await prisma.decompte.findFirst({
    where: { deletedAt: null, netAPayer: { gt: 1000n } },
    orderBy: { createdAt: "asc" },
    select: { id: true, netAPayer: true },
  });
  assert.ok(d, "aucun décompte exploitable dans la copie");
  decompteId = d.id;
  net = d.netAPayer;

  // Mise dans l'état requis — sur la COPIE.
  await prisma.paiement.deleteMany({ where: { decompteId } });
  await prisma.decompte.update({ where: { id: decompteId }, data: { statut: "ORDONNANCE" } });
  await prisma.circuitFinancier.upsert({
    where: { decompteId },
    update: { statut: "TERMINE" },
    create: { decompteId, type: "BUDGET", statut: "TERMINE" },
  });
});

after(async () => {
  if (!PG) return;
  await prisma.$disconnect();
});

function estErreur(r: PromiseSettledResult<unknown>, statusCode: number): boolean {
  return r.status === "rejected" && (r.reason as { statusCode?: number })?.statusCode === statusCode;
}

// ───────────────────────── 1. Ordonnancements concurrents ─────────────────────
test("deux ordonnancements simultanes de 60 % du net : un seul passe, le plafond tient", opts, async () => {
  const part = (net * 60n) / 100n;
  const [a, b] = await Promise.allSettled([
    service.creerOrdrePaiement({ decompteId, montantGnf: part, reference: `${PREFIXE}-A` }, acteur),
    service.creerOrdrePaiement({ decompteId, montantGnf: part, reference: `${PREFIXE}-B` }, acteur),
  ]);

  const reussites = [a, b].filter((r) => r.status === "fulfilled").length;
  const refus = [a, b].filter((r) => estErreur(r, 400)).length;
  assert.equal(reussites, 1, `exactement un ordonnancement doit réussir (obtenu : ${reussites})`);
  assert.equal(refus, 1, "l'autre doit être refusé pour dépassement (400)");

  const actifs = await prisma.paiement.findMany({ where: { decompteId, deletedAt: null } });
  const engage = actifs.reduce((s, p) => s + p.montantGnf, 0n);
  assert.ok(engage <= net, `l'engagement ${engage} ne doit jamais dépasser le net ${net}`);
  assert.equal(actifs.length, 1, "une seule ligne de paiement doit exister");
});

// ───────────────────────── 2. Rollback quand l'audit échoue ─────────────────────
test("si l'audit echoue, le paiement n'existe pas : la transaction est defaite", opts, async () => {
  // Un acteur inexistant viole la clé étrangère audit_logs.userId -> users.id.
  // L'échec survient APRÈS tx.paiement.create : si la transaction n'était pas
  // atomique, le paiement resterait en base sans trace de qui l'a ordonnancé.
  const fantome = { id: "00000000-0000-4000-8000-000000000000", email: "fantome@test" };
  const ref = `${PREFIXE}-ROLLBACK`;
  const petit = net / 100n;

  await assert.rejects(
    service.creerOrdrePaiement({ decompteId, montantGnf: petit, reference: ref }, fantome),
    "l'insertion d'audit doit échouer",
  );

  const orphelin = await prisma.paiement.findFirst({ where: { decompteId, reference: ref } });
  assert.equal(orphelin, null, "aucun paiement ne doit survivre à l'échec de son audit");
});

// ───────────────────────── 3. Confirmations concurrentes ─────────────────────
test("deux confirmations BCRG simultanees du meme paiement : une seule, PAYE une seule fois", opts, async () => {
  // Solder : ordonnancer exactement le reste, pour que la confirmation rende le décompte PAYE.
  const actifs = await prisma.paiement.findMany({ where: { decompteId, deletedAt: null } });
  const engage = actifs.reduce((s, p) => s + p.montantGnf, 0n);
  const reste = net - engage;
  assert.ok(reste > 0n, "il doit rester un reliquat à ordonnancer");
  const solde = await service.creerOrdrePaiement({ decompteId, montantGnf: reste, reference: `${PREFIXE}-SOLDE` }, acteur);

  // Confirmer d'abord le premier (60 %), puis tenter DEUX fois en parallèle le solde.
  const premier = actifs[0];
  await service.confirmerPaiementBcrg(premier.id, { montantReelGnf: premier.montantGnf, dateReelleTransfert: new Date() }, acteur);

  const [a, b] = await Promise.allSettled([
    service.confirmerPaiementBcrg(solde.id, { montantReelGnf: reste, dateReelleTransfert: new Date() }, acteur),
    service.confirmerPaiementBcrg(solde.id, { montantReelGnf: reste, dateReelleTransfert: new Date() }, acteur),
  ]);

  const reussites = [a, b].filter((r) => r.status === "fulfilled").length;
  const dejaConfirme = [a, b].filter((r) => estErreur(r, 409)).length;
  assert.equal(reussites, 1, "exactement une confirmation doit réussir");
  assert.equal(dejaConfirme, 1, "l'autre doit répondre 409 « déjà confirmé »");

  const d = await prisma.decompte.findUnique({ where: { id: decompteId }, select: { statut: true } });
  assert.equal(d?.statut, "PAYE", "le décompte doit être PAYE après confirmation du solde");

  const confirmations = await prisma.auditLog.count({ where: { entityId: solde.id, action: "CONFIRM_BCRG" } });
  assert.equal(confirmations, 1, "une seule confirmation doit être auditée");
});
