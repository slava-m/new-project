export const hourlyInterval=3600000;
export function analysisSlot(now,interval=hourlyInterval){return Math.floor(now/interval);}
export function completedSessionKey(now){const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));const date=new Date(day+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-1);while([0,6].includes(date.getUTCDay()))date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10);}
