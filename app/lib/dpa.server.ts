import db from "../db.server";
import { DPA_VERSION, DPA_SHA256, DPA_STATUS } from "./dpa";
export function dpaEnabled() { return String(DPA_STATUS) === "published" && process.env.DPA_ACCEPTANCE_VERSION === DPA_VERSION; }
export async function hasDpaAcceptance(shopDomain: string) {
  if (!dpaEnabled()) return true;
  const record = await db.legalAcceptance.findUnique({where:{shopDomain_version:{shopDomain,version:DPA_VERSION}}});
  return !!record && record.documentHash === DPA_SHA256 && !record.revokedAt;
}
export async function requireDpa(shopDomain: string, api = false) {
  if (await hasDpaAcceptance(shopDomain)) return;
  if (api) throw Response.json({error:"Review and accept the data processing agreement.",code:"DPA_REQUIRED"},{status:403});
  throw new Response(null,{status:302,headers:{Location:"/app/agreement"}});
}
