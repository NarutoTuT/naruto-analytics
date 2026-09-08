import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import https from 'node:https';
import { PrismaClient } from '@prisma/client';
const dbUrl=new URL(process.env.DATABASE_URL);
assert(['localhost','127.0.0.1'].includes(dbUrl.hostname),'Local test database required');
assert(process.env.SHOPIFY_API_SECRET,'Application signing key required');
const ca=readFileSync(`${execFileSync('./.shopify/mkcert',['-CAROOT'],{encoding:'utf8'}).trim()}/rootCA.pem`);
const db=new PrismaClient();
const tag=randomUUID();
const domain=`webhook-test-${tag}.myshopify.com`, shopId=`local-test-${tag}`;
const sessionId=`offline_${domain}`;
async function send(topic,payload,valid=true) {
 const body=JSON.stringify(payload);
 const signature=createHmac('sha256',process.env.SHOPIFY_API_SECRET).update(body).digest('base64');
 return new Promise((resolve,reject)=>{
  const req=https.request({hostname:'localhost',port:3458,path:topic==='app/uninstalled'?'/webhooks/app/uninstalled':'/webhooks/privacy',method:'POST',ca,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'X-Shopify-Topic':topic,'X-Shopify-Shop-Domain':domain,'X-Shopify-API-Version':'2026-07','X-Shopify-Webhook-Id':randomUUID(),'X-Shopify-Hmac-Sha256':valid?signature:'invalid'}},r=>{r.resume();r.on('end',()=>resolve(r.statusCode));});
  req.setTimeout(15000,()=>req.destroy(new Error('Webhook timeout')));req.on('error',reject);req.end(body);
 });
}
try {
 await db.shop.create({data:{id:shopId,myshopifyDomain:domain,createdAt:new Date()}});
 await db.notificationPreference.create({data:{shopId,email:'fixture@example.invalid',dailyBrief:true}});
 await db.session.create({data:{id:sessionId,shop:domain,state:'fixture',isOnline:false,accessToken:'local-fixture-not-a-real-token'}});
 assert.equal(await send('shop/redact',{},false),401);
 assert(await db.shop.findUnique({where:{id:shopId}}));
 const request={shop_domain:domain,data_request:{id:123},customer:{id:42},orders_requested:[100]};
 assert.equal(await send('customers/data_request',request),200);
 assert.equal(await send('customers/data_request',request),200);
 assert.equal(await db.privacyRequest.count({where:{shopDomain:domain}}),1);
 assert.equal(await send('customers/redact',{customer:{id:42},orders_to_redact:[100]}),200);
 assert.equal(await db.privacyRequest.count({where:{shopDomain:domain}}),0);
 assert.equal(await send('app/uninstalled',{}),200);
 assert.equal(await db.session.count({where:{shop:domain}}),0);
 assert.equal((await db.notificationPreference.findUnique({where:{shopId}})).dailyBrief,false);
 assert.equal(await send('shop/redact',{}),200);
 assert.equal(await db.shop.count({where:{id:shopId}}),0);
 assert.equal(await db.notificationPreference.count({where:{shopId}}),0);
 assert.equal(await send('shop/redact',{}),200);
 console.log('PASS: invalid signature rejected; data request idempotent; customer request redaction; uninstall clears sessions and email opt-in; shop deletion idempotent. Local synthetic fixtures only.');
} finally {
 await db.session.deleteMany({where:{shop:domain}});
 await db.privacyRequest.deleteMany({where:{shopDomain:domain}});
 await db.notificationPreference.deleteMany({where:{shopId}});
 await db.shop.deleteMany({where:{id:shopId}});
 await db.$disconnect();
}
