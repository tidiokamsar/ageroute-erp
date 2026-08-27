/**
 * TOTP — Time-based One-Time Password (RFC 6238), implémentation PURE.
 *
 * F-GO1 du CDC : 2FA obligatoire pour les rôles financiers. Aucune
 * dépendance externe — node:crypto suffit (HMAC-SHA1). Le secret est un
 * octet aléatoire encodé en base32 (RFC 4648, sans padding), compatible
 * Google/Microsoft Authenticator, FreeOTP, Aegis.
 *
 * Fenêtre de tolérance : ±1 intervalle (30 s chacun) — couvre la dérive
 * d'horloge entre le téléphone et le serveur sans ouvrir une fenêtre d'attaque.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// ── Base32 (RFC 4648, sans padding) ──────────────────────────────────────────
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function encoderBase32(buffer: Buffer): string {
  let bits = 0, valeur = 0, sortie = "";
  for (const octet of buffer) {
    valeur = (valeur << 8) | octet;
    bits += 8;
    while (bits >= 5) {
      sortie += ALPHABET[(valeur >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) sortie += ALPHABET[(valeur << (5 - bits)) & 31];
  return sortie;
}

export function decoderBase32(texte: string): Buffer {
  const propre = texte.toUpperCase().replace(/[=\s]/g, "");
  let bits = 0, valeur = 0;
  const octets: number[] = [];
  for (const c of propre) {
    const idx = ALPHABET.indexOf(c);
    if (idx === -1) throw new Error(`Caractère base32 invalide : ${c}`);
    valeur = (valeur << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      octets.push((valeur >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(octets);
}

// ── Génération du secret ─────────────────────────────────────────────────────
/** Secret TOTP de 160 bits (recommandation RFC 4226 §4, R6) en base32. */
export function genererSecret(): string {
  return encoderBase32(randomBytes(20));
}

/** URI otpauth:// pour l'enrôlement dans une application d'authentification. */
export function uriOtpauth(secret: string, compte: string, emetteur = "ERP AGEROUTE"): string {
  return `otpauth://totp/${encodeURIComponent(emetteur)}:${encodeURIComponent(compte)}?secret=${secret}&issuer=${encodeURIComponent(emetteur)}&algorithm=SHA1&digits=6&period=30`;
}

// ── Génération et vérification du code ──────────────────────────────────────
const PERIODE = 30; // secondes (RFC 6238 §5.2)
const DIGITS = 6;
const FENETRE = 1; // ±1 intervalle

function codeHOTP(secret: Buffer, compteur: number): string {
  const hmac = createHmac("sha1", secret).update(Buffer.from(compteur.toString(16).padStart(16, "0"), "hex")).digest();
  const decalage = hmac[hmac.length - 1] & 0x0f;
  const binaire = ((hmac[decalage] & 0x7f) << 24) | (hmac[decalage + 1] << 16) | (hmac[decalage + 2] << 8) | hmac[decalage + 3];
  return (binaire % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

/** Compteur TOTP pour un instant donné (epoch ÷ 30). */
export function compteurPour(instant: number = Date.now()): number {
  return Math.floor(instant / 1000 / PERIODE);
}

/** Génère le code TOTP attendu à un instant donné. */
export function genererCode(secretBase32: string, instant: number = Date.now()): string {
  return codeHOTP(decoderBase32(secretBase32), compteurPour(instant));
}

/**
 * Vérifie un code fourni contre le secret, avec fenêtre ±1 intervalle.
 * Comparaison à temps constant (timingSafeEqual) — un attaquant ne peut pas
 * mesurer le temps de comparaison pour deviner le code caractère par caractère.
 */
export function verifierCode(secretBase32: string, codeFourni: string, instant: number = Date.now()): boolean {
  if (!/^\d{6}$/.test(codeFourni)) return false;
  const secret = decoderBase32(secretBase32);
  const compteur = compteurPour(instant);
  for (const decalage of [-FENETRE, 0, FENETRE]) {
    const attendu = codeHOTP(secret, compteur + decalage);
    if (timingSafeEqual(Buffer.from(attendu), Buffer.from(codeFourni))) return true;
  }
  return false;
}

// ── Codes de secours ─────────────────────────────────────────────────────────
/**
 * Codes de secours à usage unique : si le téléphone est perdu, l'utilisateur
 * se connecte avec un de ces codes (format xxxx-xxxx, lisible à la main).
 * Ils sont stockés HACHÉS (SHA-256) — la base ne contient jamais les codes
 * en clair, contrairement au secret TOTP qui doit être lisible pour vérifier.
 */
export function genererCodesSecours(nombre = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < nombre; i++) {
    const brut = randomBytes(5).toString("hex").toUpperCase();
    codes.push(`${brut.slice(0, 5)}-${brut.slice(5, 10)}`);
  }
  return codes;
}

/** Empreinte SHA-256 d'un code de secours (pour le stockage en base). */
export function empreinteCodeSecours(code: string): string {
  return createHmac("sha256", "erp-ageroute-2fa-backup").update(code.trim().toUpperCase()).digest("hex");
}
