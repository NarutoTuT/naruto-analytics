import {evaluateOperations} from './policy.mjs';
// Read-only checks. Never print provider errors, raw records or credential values.
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
const alerts=[]; const metrics={};
let db;
try {
 const envPath=process.env.NARUTO_MONITOR_ENV_FILE;
 if (!envPath) throw new Error('configuration');
 const env=JSON.parse(fs.readFileSync(envPath,'utf8'));
 if (!env.DATABASE_URL || !env.SHOPIFY_APP_URL) throw new Error('configuration');
 db=new PrismaClient({datasources:{db:{url:env.DATABASE_URL}}});
 const day=86400000, now=Date.now();
 const config=JSON.parse(fs.readFileSync(new URL('../../vercel.json',import.meta.url),'utf8'));
 const schedule=config.crons?.find(x=>x.path==='/api/cron/daily-brief')?.schedule;
 const health=await db.analyticsEvent.findUnique({where:{dedupeKey:'ops:daily-brief'}});
 metrics.schedulePolicy=evaluateOperations({now,cronSchedule:schedule,lastJobSuccess:health?.createdAt.getTime()});
 if(metrics.schedulePolicy.status==='JOB_OVERDUE') alerts.push('CRON_HEARTBEAT_OVERDUE');

 const pending=await db.privacyRequest.aggregate({where:{fulfilledAt:null},_count:true,_min:{createdAt:true}});
 metrics.pendingRequests=pending._count;
 metrics.oldestPendingDays=pending._min.createdAt ? Math.floor((now-pending._min.createdAt.getTime())/day):0;
 if(metrics.pendingRequests) alerts.push(metrics.oldestPendingDays>=27?'PRIVACY_REQUEST_URGENT':'PRIVACY_REQUEST_REQUIRES_REVIEW');
 for(const [name,model,field,days] of [['expiredEvents','analyticsEvent','createdAt',90],['expiredSnapshots','analyticsSnapshot','snapshotDate',90],['expiredDeliveries','briefDelivery','createdAt',30],['expiredFulfilledRequests','privacyRequest','fulfilledAt',30]]) {
  metrics[name]=await db[model].count({where:{[field]:{lt:new Date(now-(days*day+20*60000))}}});
  if(metrics[name]) alerts.push('RETENTION_BACKLOG_'+name);
 }
 metrics.stuckDeliveries=await db.briefDelivery.count({where:{status:{in:['sending','pending']},createdAt:{lt:new Date(now-day)}}});
 if(metrics.stuckDeliveries) alerts.push('DELIVERY_REQUIRES_REVIEW');
 const r=await fetch(new URL('/legal/dpa',env.SHOPIFY_APP_URL),{signal:AbortSignal.timeout(15000),redirect:'error'});
 metrics.publicDpaHttp=r.status;
 if(!r.ok) alerts.push('PUBLIC_ENDPOINT_UNAVAILABLE');
 // Draft must remain visibly labelled until the operator adopts a final version.
 const body=await r.text(); metrics.draftLabelVisible=/draft/i.test(body);
} catch {alerts.push('MONITOR_CHECK_FAILED');} finally {await db?.$disconnect();}
console.log(JSON.stringify({checkedAt:new Date().toISOString(),alerts,metrics,limits:['No proof cron ran when no expired rows exist','Inbox requests are not included','No automatic shutdown or notifications sent by this script']},null,2));
process.exitCode=alerts.length?2:0;
