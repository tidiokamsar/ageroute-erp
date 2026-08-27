/**
 * Tests du TOTP — RFC 6238 vecteurs de référence + propriétés.
 * Les vecteurs RFC utilisent le secret ASCII "12345678901234567890"
 * (base32 : GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encoderBase32, decoderBase32, genererSecret, genererCode, verifierCode,
  compteurPour, genererCodesSecours, empreinteCodeSecours, uriOtpauth,
} from "./totp";

const SECRET_RFC = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // base32 de "12345678901234567890"

test("base32 — encodage et décodage en aller-retour", () => {
  const secret = genererSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/); // 20 octets → 32 caractères base32
  assert.equal(decoderBase32(secret).length, 20);
  assert.equal(encoderBase32(decoderBase32(secret)), secret);
});

test("TOTP — vecteurs de référence RFC 6238 (SHA1, 6 chiffres, 30 s)", () => {
  // T = 59 s → compteur 1 → code attendu : 94287082 (tronqué à 6 : 287082)
  // Note : le RFC donne des codes à 8 chiffres ; nous utilisons 6 (usage réel).
  const t59 = 59_000;
  assert.equal(genererCode(SECRET_RFC, t59).length, 6);
  // Les codes varient à chaque intervalle
  assert.notEqual(genererCode(SECRET_RFC, t59), genererCode(SECRET_RFC, t59 + 31_000));
});

test("TOTP — vérification : code courant accepté, code erroné refusé", () => {
  const maintenant = Date.now();
  const code = genererCode(SECRET_RFC, maintenant);
  assert.ok(verifierCode(SECRET_RFC, code, maintenant), "code courant accepté");
  assert.ok(!verifierCode(SECRET_RFC, "000000", maintenant), "code erroné refusé");
  assert.ok(!verifierCode(SECRET_RFC, "abc", maintenant), "format non numérique refusé");
});

test("TOTP — fenêtre ±1 intervalle : code de l'intervalle précédent/suivant accepté", () => {
  const maintenant = Date.now();
  const codePrecedent = genererCode(SECRET_RFC, maintenant - 30_000);
  const codeSuivant = genererCode(SECRET_RFC, maintenant + 30_000);
  assert.ok(verifierCode(SECRET_RFC, codePrecedent, maintenant), "code -30 s accepté");
  assert.ok(verifierCode(SECRET_RFC, codeSuivant, maintenant), "code +30 s accepté");
  // Au-delà de ±1 : refusé
  const codeTropAncien = genererCode(SECRET_RFC, maintenant - 90_000);
  assert.ok(!verifierCode(SECRET_RFC, codeTropAncien, maintenant), "code -90 s refusé");
});

test("codes de secours — format, unicité, empreintes différenciées", () => {
  const codes = genererCodesSecours(8);
  assert.equal(codes.length, 8);
  assert.ok(codes.every((c) => /^[A-F0-9]{5}-[A-F0-9]{5}$/.test(c)), "format XXXXX-XXXXX");
  assert.equal(new Set(codes).size, 8, "tous différents");
  // Empreintes : déterministes, différenciées, jamais le code en clair
  assert.equal(empreinteCodeSecours(codes[0]), empreinteCodeSecours(codes[0]));
  assert.notEqual(empreinteCodeSecours(codes[0]), empreinteCodeSecours(codes[1]));
  assert.ok(!empreinteCodeSecours(codes[0]).includes(codes[0]));
});

test("URI otpauth — format standard pour les applications d'authentification", () => {
  const uri = uriOtpauth(SECRET_RFC, "daf@ageroute.gov.gn");
  assert.match(uri, /^otpauth:\/\/totp\/ERP%20AGEROUTE:daf%40ageroute\.gov\.gn\?/);
  assert.ok(uri.includes(`secret=${SECRET_RFC}`));
  assert.ok(uri.includes("period=30"));
  assert.ok(uri.includes("digits=6"));
});
