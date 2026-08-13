/**
 * Patch global de sérialisation BigInt.
 *
 * Prisma renvoie les colonnes `BigInt` (montants, netAPayer, etc.) comme des
 * valeurs `bigint` JavaScript. Or `JSON.stringify` — utilisé par Express
 * `res.json()` — lève « Do not know how to serialize a BigInt ».
 * Sans ce patch, la quasi-totalité des endpoints GET planteraient en 500.
 *
 * On sérialise les BigInt en chaîne (et non en number) pour préserver la
 * précision des grands montants ; le frontend les retraite via `Number()`.
 */
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

/**
 * Convertit en profondeur les BigInt en chaînes pour pouvoir stocker un objet
 * dans une colonne Json de Prisma (avant/après d'audit notamment), qui n'accepte
 * pas les BigInt bruts.
 */
export function serializeForJson<T>(value: T): unknown {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v)));
}
