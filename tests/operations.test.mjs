import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateOperations} from '../scripts/operations/policy.mjs';
const minute=60000,now=100000000;
const check=(x={})=>evaluateOperations({now,cronSchedule:'*/5 * * * *',lastJobSuccess:now-5*minute,...x});
test('normal five-minute jobs and scheduler jitter do not alert or pause',()=>{assert.equal(check().status,'HEALTHY');assert.equal(check({lastJobSuccess:now-17*minute}).status,'HEALTHY');assert.equal(check().pauseSuggested,false)});
test('missed job threshold matches cron; unknown schedule fails visibly',()=>{assert.equal(check({lastJobSuccess:now-18*minute}).status,'JOB_OVERDUE');assert.equal(check({cronSchedule:'*/10 * * * *'}).jobStaleAfterMs,32*minute);assert.equal(check({cronSchedule:'0 * * * *'}).status,'CONFIGURATION_REVIEW')});
test('hourly local monitoring cannot claim thirty-minute escalation',()=>{assert.equal(check().unacknowledgedAfterMs,120*minute);assert.equal(check({criticalFirstSeen:now-60*minute}).pauseSuggested,false);assert.equal(check({criticalFirstSeen:now-120*minute}).pauseSuggested,true)});
test('no heartbeat, overdue job or clock error never automatically pauses',()=>{for(const args of [{lastJobSuccess:null},{lastJobSuccess:now-999*minute},{lastJobSuccess:now+3*minute}]){assert.equal(check(args).automaticPause,false);assert.equal(check(args).pauseSuggested,false)}});
test('acknowledgement suppresses recommendation and deadlines retain original time',()=>{assert.equal(check({requestDeadline:now+72*60*minute}).pauseSuggested,true);assert.equal(check({requestDeadline:now+73*60*minute}).pauseSuggested,false);assert.equal(check({requestDeadline:now-minute,acknowledged:true}).pauseSuggested,false)});
