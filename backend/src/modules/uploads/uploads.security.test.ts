import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStoredFilename, isSafeStoredFilename } from "./uploads.security";

test("les noms stockes sont aleatoires, opaques et sur liste blanche", () => {
  const first = buildStoredFilename("application/pdf");
  const second = buildStoredFilename("application/pdf");
  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first, second);
  assert.match(first, /^[a-f0-9]{48}\.pdf$/);
  assert.equal(buildStoredFilename("text/html"), null);
});

test("les traversees et anciens noms previsibles sont refuses", () => {
  assert.equal(isSafeStoredFilename("../contrat.pdf"), false);
  assert.equal(isSafeStoredFilename("..%2fcontrat.pdf"), false);
  assert.equal(isSafeStoredFilename("contrat_1700000000000_abcde.pdf"), false);
  assert.equal(isSafeStoredFilename("a".repeat(48) + ".pdf"), true);
});
