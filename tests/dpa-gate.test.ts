import test from "node:test";
import assert from "node:assert/strict";
import {
  hasDpaAcceptance,
  requireDpa,
  dpaTestEnabled,
} from "../app/lib/dpa.server";
// Bundler substitutes only document publication metadata and database I/O.
// @ts-expect-error test-only fixture setter
import { setStatus } from "../app/lib/dpa";
const shop = "naruto-dev-ts8dqzla.myshopify.com";
let record: any;
let reads = 0;
(globalThis as any).gate = {
  find: async (args: any) => {
    reads++;
    assert.equal(args.where.shopDomain_version.shopDomain, shop);
    return record;
  },
};
function reset() {
  setStatus("published");
  process.env.DPA_ACCEPTANCE_VERSION = "fixture-v1";
  reads = 0;
  record = {
    shopDomain: shop,
    version: "fixture-v1",
    documentHash: "fixture-hash",
    actorUserId: "verified",
    acceptedAt: new Date(),
    revokedAt: null,
  };
}
test("missing and wrong configuration deny before querying records", async () => {
  for (const v of [undefined, "wrong", "TEST_ONLY:fixture-v1"]) {
    reset();
    if (v === undefined) delete process.env.DPA_ACCEPTANCE_VERSION;
    else process.env.DPA_ACCEPTANCE_VERSION = v;
    assert.equal(await hasDpaAcceptance(shop), false);
    assert.equal(reads, 0);
  }
});
test("draft cannot enable formal processing", async () => {
  reset();
  setStatus("draft");
  assert.equal(await hasDpaAcceptance(shop), false);
  assert.equal(reads, 0);
});
test("matching formal acceptance allows processing", async () => {
  reset();
  assert.equal(await hasDpaAcceptance(shop), true);
});
test("absent, wrong tenant, version, hash, revoked or incomplete records deny", async () => {
  for (const patch of [
    null,
    { shopDomain: "other.myshopify.com" },
    { version: "old" },
    { version: "TEST_ONLY:fixture-v1" },
    { documentHash: "old" },
    { revokedAt: new Date() },
    { actorUserId: "" },
    { acceptedAt: new Date(NaN) },
  ]) {
    reset();
    record = patch === null ? null : { ...record, ...patch };
    assert.equal(await hasDpaAcceptance(shop), false);
  }
});
test("test rehearsal requires explicit matching config, allowed shop and TEST_ONLY record", async () => {
  reset();
  setStatus("draft");
  process.env.DPA_ACCEPTANCE_VERSION = "TEST_ONLY:fixture-v1";
  assert.equal(await dpaTestEnabled("other.myshopify.com"), false);
  assert.equal(await hasDpaAcceptance(shop), false);
  record.version = "TEST_ONLY:fixture-v1";
  assert.equal(await hasDpaAcceptance(shop), true);
});
test("API denies and UI redirects without processing", async () => {
  reset();
  record = null;
  await assert.rejects(requireDpa(shop, true), (e: any) => e.status === 403);
  await assert.rejects(
    requireDpa(shop),
    (e: any) =>
      e.status === 302 && e.headers.get("Location") === "/app/agreement",
  );
});
test("database failure cannot grant access", async () => {
  reset();
  const fn = (globalThis as any).gate.find;
  (globalThis as any).gate.find = async () => {
    throw new Error("unavailable");
  };
  try {
    await assert.rejects(hasDpaAcceptance(shop), /unavailable/);
  } finally {
    (globalThis as any).gate.find = fn;
  }
});
