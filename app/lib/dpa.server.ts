import db from "../db.server";
import { DPA_VERSION, DPA_SHA256, DPA_STATUS } from "./dpa";
import {
  hasStoreAdmission,
  testAgreementVersion,
} from "./test-store-policy.server";

export function dpaEnabled() {
  return (
    String(DPA_STATUS) === "published" &&
    process.env.DPA_ACCEPTANCE_VERSION === DPA_VERSION
  );
}
// Rehearsal requires explicit configuration; a broken formal configuration never
// falls back to test mode, even for the development store.
export async function dpaTestEnabled(shopDomain: string) {
  return (
    String(DPA_STATUS) === "draft" &&
    (await hasStoreAdmission(shopDomain)) &&
    process.env.DPA_ACCEPTANCE_VERSION === testAgreementVersion(DPA_VERSION)
  );
}
export async function hasDpaAcceptance(shopDomain: string) {
  const version = dpaEnabled()
    ? DPA_VERSION
    : (await dpaTestEnabled(shopDomain))
      ? testAgreementVersion(DPA_VERSION)
      : null;
  if (!version) return false;
  const record = await db.legalAcceptance.findUnique({
    where: { shopDomain_version: { shopDomain, version } },
  });
  return (
    !!record &&
    record.shopDomain === shopDomain &&
    record.version === version &&
    record.documentHash === DPA_SHA256 &&
    !record.revokedAt &&
    !!record.actorUserId &&
    record.acceptedAt instanceof Date &&
    Number.isFinite(record.acceptedAt.getTime())
  );
}
export async function requireDpa(shopDomain: string, api = false) {
  if (await hasDpaAcceptance(shopDomain)) return;
  if (api)
    throw Response.json(
      {
        error: "Review and accept the data processing agreement.",
        code: "DPA_REQUIRED",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  throw new Response(null, {
    status: 302,
    headers: { Location: "/app/agreement", "Cache-Control": "no-store" },
  });
}
