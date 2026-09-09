// Isolated PostgreSQL schema, synthetic fixtures only. Never restores the live schema.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
const env = JSON.parse(fs.readFileSync(process.env.NARUTO_DRILL_ENV_FILE, 'utf8'));
assert.equal(env.SHOPIFY_APP_URL, 'https://naruto-analytics-staging.vercel.app');
const schema = 'naruto_drill_' + randomUUID().replaceAll('-', '');
const url = new URL(env.DATABASE_URL); url.searchParams.set('schema', schema);
const db = new PrismaClient({ datasourceUrl: url.toString() });
const root = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
const dir = await mkdtemp(join(tmpdir(), 'naruto-drill-'));
const passed=[]; let created=false;
try {
 await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created=true;
 const setup=spawnSync(process.execPath,['node_modules/prisma/build/index.js','db','push','--skip-generate'],{env:{...process.env,DATABASE_URL:url.toString()},encoding:'utf8'});
 assert.equal(setup.status,0,'isolated schema initialization');
 await build({entryPoints:['app/lib/privacy-deletion.server.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'erase.mjs')});
 const {eraseShopData}=await import(join(dir,'erase.mjs'));
 const fixtures=[];
 for(const id of ['fixture-a','fixture-b']) {
 const domain=id+'.myshopify.com', now=new Date('2026-09-09T00:00:00Z');
 fixtures.push(['shop',{id,myshopifyDomain:domain,createdAt:now}],
 ['session',{id:'offline_'+domain,shop:domain,state:'synthetic',accessToken:'synthetic-not-a-token'}],
 ['legalAcceptance',{shopDomain:domain,version:'fixture',documentHash:'fixture',actorUserId:'fixture'}],
 ['privacyRequest',{id:domain+':fixture',shopDomain:domain,customerId:'fixture',fulfilledAt:now}],
 ['privacyRequest',{id:domain+':pending',shopDomain:domain,createdAt:now}],
 ['briefDelivery',{id:id+':fixture',shopId:id,date:'2026-09-09',payloadJson:'{"synthetic":true}'}],
 ['analyticsEvent',{shopId:id,event:'fixture'}],
 ['notificationPreference',{shopId:id,email:'fixture@example.invalid',dailyBrief:false}],
 ['analyticsReport',{shopId:id,reportType:'fixture',periodStart:now,periodEnd:now,title:'fixture',summary:'fixture'}],
 ['analyticsSnapshot',{shopId:id,rawData:'{"synthetic":true}'}],
 ['orderSnapshot',{shopId:id,shopifyOrderId:id,orderName:'fixture',createdAt:now,totalPrice:1,subtotalPrice:1,totalTax:0,totalShipping:0}],
 ['productSnapshot',{shopId:id,shopifyProductId:id,title:'fixture',handle:'fixture'}]);
 }
 const backup=JSON.stringify(fixtures); // Only synthetic fixtures; no live reads.
 const seed=async rows=>{for(const [model,data] of rows) {
  if(model==='privacyRequest') await db.privacyRequest.upsert({where:{id:data.id},create:data,update:{}});
  else await db[model].create({data});
 }};
 await seed(fixtures);
 const check=async(id,expected)=>{
  for(const model of ['briefDelivery','analyticsEvent','notificationPreference','analyticsReport','analyticsSnapshot','orderSnapshot','productSnapshot']) assert.equal(await db[model].count({where:{shopId:id}}),expected,model);
  assert.equal(await db.shop.count({where:{id}}),expected);
  assert.equal(await db.session.count({where:{shop:id+'.myshopify.com'}}),expected);
  assert.equal(await db.legalAcceptance.count({where:{shopDomain:id+'.myshopify.com'}}),expected);
  assert.equal(await db.privacyRequest.count({where:{shopDomain:id+'.myshopify.com',fulfilledAt:{not:null}}}),expected);
  const pending=await db.privacyRequest.findUnique({where:{id:id+'.myshopify.com:pending'}});
  assert.equal(pending.fulfilledAt,null);assert.equal(pending.createdAt.toISOString(),'2026-09-09T00:00:00.000Z');
 };
 await eraseShopData(db,'fixture-a.myshopify.com'); await check('fixture-a',0); await check('fixture-b',1); passed.push('business data and completed requests erased; unresolved requests retained with tenant isolation');
 await eraseShopData(db,'fixture-a.myshopify.com'); await check('fixture-b',1); passed.push('duplicate deletion idempotent');
 await eraseShopData(db,'fixture-b.myshopify.com');
 const restored=JSON.parse(backup,(k,v)=>['createdAt','periodStart','periodEnd','fulfilledAt'].includes(k)?new Date(v):v);
 await seed(restored); await check('fixture-a',1); await check('fixture-b',1); passed.push('logical backup restored into isolated schema');
 // Deletion journal is outside the backup, so restoring cannot reset prior instructions.
 const deletionJournal=['fixture-a.myshopify.com'];
 for(const domain of deletionJournal) await eraseShopData(db,domain);
 await check('fixture-a',0); await check('fixture-b',1); passed.push('prior deletion reapplied before reopening; other tenant preserved');
} catch(e) { console.log(JSON.stringify({passed,failureType:e.name,details:'suppressed; no credentials or records printed'})); process.exitCode=1; }
finally {
 await db.$disconnect();
 if(created) await root.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
 await root.$disconnect(); await rm(dir,{recursive:true,force:true});
}
if(!process.exitCode) console.log(JSON.stringify({passed,isolatedSchemaRemoved:true,liveRecordsReadOrChanged:false,providerPitrTested:false}));
