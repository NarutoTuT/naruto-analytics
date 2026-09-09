// Review-only decisions: no API writes, mail, or automatic suspension.
export function evaluateOperations({now, lastJobSuccess, monitorCadenceMs=60*60000, cronSchedule, criticalFirstSeen, acknowledged=false, requestDeadline}) {
 const match=/^\*\/([1-9]\d*) \* \* \* \*$/.exec(cronSchedule||'');
 if(!match || Number(match[1])>59 || !Number.isFinite(monitorCadenceMs) || monitorCadenceMs<=0) return {status:'CONFIGURATION_REVIEW',automaticPause:false,pauseSuggested:false};
 const jobIntervalMs=Number(match[1])*60000;
 const jobStaleAfterMs=3*jobIntervalMs+2*60000;
 const unacknowledgedAfterMs=Math.max(30*60000,2*monitorCadenceMs);
 const invalidClock=lastJobSuccess!=null && (!Number.isFinite(lastJobSuccess)||lastJobSuccess>now+2*60000);
 const status=invalidClock?'CLOCK_REVIEW':lastJobSuccess==null?'NOT_INSTRUMENTED':now-lastJobSuccess>jobStaleAfterMs?'JOB_OVERDUE':'HEALTHY';
 const criticalDue=Number.isFinite(criticalFirstSeen)&&criticalFirstSeen<=now&&now-criticalFirstSeen>=unacknowledgedAfterMs;
 const requestDue=Number.isFinite(requestDeadline)&&requestDeadline-now<=72*3600000;
 return {status,jobIntervalMs,jobStaleAfterMs,monitorCadenceMs,unacknowledgedAfterMs,
  pauseSuggested:!acknowledged&&(criticalDue||requestDue),automaticPause:false,
  warning:'Recommendation only; job failure or missing heartbeat alone never pauses installation'};
}
