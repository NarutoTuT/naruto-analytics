import test from "node:test";
import assert from "node:assert/strict";
import {action} from "../app/routes/app.agreement";
import {DPA_VERSION,DPA_SHA256,AGREEMENT_TEXT,MERCHANT_TEXT,DPA_TEXT} from "../app/lib/dpa";
const state={enabled:true,actor:"123",writes:[] as any[]};
(globalThis as any).legal=state;
process.env.SHOPIFY_APP_URL="https://app.example.test";
function reset(){state.enabled=true;state.actor="123";state.writes=[];}
async function submit(values:Record<string,string>={},origin="https://app.example.test") {
 const body=new URLSearchParams({version:DPA_VERSION,hash:DPA_SHA256,accept:"yes",...values});
 return action({request:new Request("https://app.example.test/app/agreement",{method:"POST",headers:{Origin:origin},body})} as any);
}
test("unpublished agreement cannot record acceptance",async()=>{reset();state.enabled=false;assert.equal((await submit()).status,409);assert.equal(state.writes.length,0)});
test("cross-origin form cannot record acceptance",async()=>{reset();assert.equal((await submit({},"https://attacker.test")).status,403);assert.equal(state.writes.length,0)});
test("unchecked consent does not create a record",async()=>{reset();assert.equal((await submit({accept:""})).status,400);assert.equal(state.writes.length,0)});
test("stale document hash requires a fresh review",async()=>{reset();assert.equal((await submit({hash:"stale"})).status,409);assert.equal(state.writes.length,0)});
test("missing verified actor fails closed",async()=>{reset();state.actor="";assert.equal((await submit()).status,403);assert.equal(state.writes.length,0)});
test("acceptance binds verified tenant and actor, not submitted identities",async()=>{reset();const r=await submit({shop:"attacker.myshopify.com",actor:"999"});assert.equal(r.status,302);assert.equal(state.writes[0].create.shopDomain,"verified.myshopify.com");assert.equal(state.writes[0].create.actorUserId,"123");assert.equal(state.writes[0].create.documentHash,DPA_SHA256)});

import {createHash} from "node:crypto";
test("acceptance fingerprint binds the full merchant agreement and DPA",()=>{
 assert.equal(AGREEMENT_TEXT,MERCHANT_TEXT+"\n---\n"+DPA_TEXT);
 assert.equal(createHash("sha256").update(AGREEMENT_TEXT).digest("hex"),DPA_SHA256);
 assert.notEqual(createHash("sha256").update(MERCHANT_TEXT+"changed\n---\n"+DPA_TEXT).digest("hex"),DPA_SHA256);
});
