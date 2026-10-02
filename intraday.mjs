
import {validBar} from './indicators.mjs';
import {yahooSymbol} from './yahoo.mjs';
import {archiveDefaults,utcDay} from './archive.mjs';
export function normalizeMinutes(payload,symbol,now=Date.now()){
 const r=payload.chart?.result?.[0],q=r?.indicators?.quote?.[0],times=r?.timestamp;
 if(payload.chart?.error||r?.meta?.symbol!==yahooSymbol(symbol)||r?.meta?.currency!=='USD'||r?.meta?.instrumentType!=='EQUITY'||r?.meta?.dataGranularity!=='1m')throw Error('Invalid minute instrument or interval');
 if(!Array.isArray(times)||!q||['open','high','low','close','volume'].some(k=>!Array.isArray(q[k])||q[k].length!==times.length))throw Error('Incomplete minute arrays');
 const periods=r.meta.tradingPeriods?.flat(Infinity).filter(p=>Number.isFinite(p?.start)&&Number.isFinite(p?.end))||[];
 if(!periods.length)throw Error('Missing regular sessions');
 const unique=new Map();
 for(let i=0;i<times.length;i++){
 const time=times[i];if(!Number.isInteger(time)||time<0)throw Error('Invalid minute timestamp');
 if(time%60!==0||time+60>Math.floor(now/1000)||!periods.some(p=>time>=p.start&&time+60<=p.end))continue;
 if(['open','high','low','close','volume'].some(k=>q[k][i]===null))continue;
 const b={time,open:q.open[i],high:q.high[i],low:q.low[i],close:q.close[i],volume:q.volume[i]};
 if(!validBar(b)||!Number.isFinite(b.volume)||b.volume<0)throw Error('Invalid minute OHLCV');
 unique.set(time,b);
 }
 const bars=[...unique.values()].sort((a,b)=>a.time-b.time);if(!bars.length)throw Error('No completed minute bars');
 return {bars,session:r.meta.currentTradingPeriod?.regular||null};
}
export async function fetchMinutes(symbol,range='5d',fetcher=fetch,now=Date.now()){
 const url=new URL('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(yahooSymbol(symbol)));
 url.searchParams.set('interval','1m');url.searchParams.set('range',range);url.searchParams.set('includePrePost','false');
 const response=await fetcher(url,{signal:AbortSignal.timeout(20000),redirect:'error'});
 if(!response.ok){const e=Error('Yahoo minute HTTP '+response.status);e.status=response.status;throw e;}
 return normalizeMinutes(await response.json(),symbol,now);
}

function marketClock(now){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));return {day:p.year+'-'+p.month+'-'+p.day,minute:Number(p.hour)*60+Number(p.minute),weekday:!['Sat','Sun'].includes(p.weekday)};}
export function minuteRefreshDue(meta,now,interval){
 if(!meta?.fetchedAt)return true;const clock=marketClock(now),fetched=marketClock(meta.fetchedAt);
 if(clock.weekday&&clock.minute>=570&&clock.minute<960)return now-meta.fetchedAt>=interval;
 return clock.weekday&&clock.minute>=960&&(fetched.day!==clock.day||fetched.minute<960);
}
export function nextMinuteJob(symbols,meta,quota,now,priority=null,refreshMs=60*60000){
 const used=quota.day===utcDay(now)?quota.used||0:0;
 if(quota.pauseUntil>now)return {reason:'provider-limit',nextAt:quota.pauseUntil};
 if(used>=archiveDefaults.dailyBudget)return {reason:'daily-budget',nextAt:Date.parse(utcDay(now)+'T00:00:00Z')+86400000};
 if(quota.nextAt>now)return {reason:'rate-limit',nextAt:quota.nextAt};
 const eligible=s=>!(meta[s]?.retryAt>now);
 if(priority&&symbols.includes(priority)&&eligible(priority)&&minuteRefreshDue(meta[priority],now,5*60000))return {symbol:priority,reason:'selected'};
 const missing=symbols.find(s=>eligible(s)&&!meta[s]?.fetchedAt);if(missing)return {symbol:missing,reason:'backfill'};
 const oldest=symbols.filter(s=>eligible(s)&&minuteRefreshDue(meta[s],now,refreshMs)).sort((a,b)=>(meta[a]?.fetchedAt||0)-(meta[b]?.fetchedAt||0))[0];
 if(oldest&&now-(meta[oldest]?.fetchedAt||0)>=refreshMs)return {symbol:oldest,reason:'refresh'};
 return {reason:'up-to-date',nextAt:now+60000};
}
export function createIntraday({db,symbols,getQuota,consume,pause,broadcast,refreshMs=3600000,fetcher=fetch,canFetch=()=>true}){
 db.exec('CREATE TABLE IF NOT EXISTS minute_bars(symbol TEXT,time INTEGER,open REAL,high REAL,low REAL,close REAL,volume REAL,PRIMARY KEY(symbol,time)); CREATE TABLE IF NOT EXISTS minute_meta(symbol TEXT PRIMARY KEY,payload TEXT)');
 const meta=Object.fromEntries(db.prepare('SELECT * FROM minute_meta').all().map(r=>[r.symbol,JSON.parse(r.payload)]));
 const counts=Object.fromEntries(db.prepare('SELECT symbol,COUNT(*) AS count FROM minute_bars GROUP BY symbol').all().map(r=>[r.symbol,r.count]));
 const put=db.prepare('INSERT INTO minute_bars VALUES(?,?,?,?,?,?,?) ON CONFLICT(symbol,time) DO UPDATE SET open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close,volume=excluded.volume');
 let running=false,stopped=false,priority=null,nextAt=Date.now(),status='checking',lastError=null;
 const save=(s,m)=>{meta[s]=m;db.prepare('INSERT INTO minute_meta VALUES(?,?) ON CONFLICT(symbol) DO UPDATE SET payload=excluded.payload').run(s,JSON.stringify(m));};
 function detail(symbol){const m=meta[symbol]||{},bars=db.prepare('SELECT time,open,high,low,close,volume FROM minute_bars WHERE symbol=? ORDER BY time DESC LIMIT 2000').all(symbol).reverse();const last=bars.at(-1);
 return {bars,totalBars:counts[symbol]||0,source:'Yahoo Finance',timeframe:'1min',fetchedAt:m.fetchedAt||null,lastBarAt:last?last.time*1000:null,ageMinutes:last?Math.max(0,(Date.now()/1000-(last.time+60))/60):null,status:m.status||'pending',error:m.error||null};}
 function summary(){const quota=getQuota();return {enabled:true,status,running,total:symbols.length,loaded:symbols.filter(s=>counts[s]>0).length,pending:symbols.filter(s=>!counts[s]).length,bars:Object.values(counts).reduce((a,b)=>a+b,0),nextCheckAt:running?null:nextAt,selected:priority,refreshMinutes:refreshMs/60000,selectedRefreshMinutes:5,requestsToday:quota.day===utcDay(Date.now())?quota.used||0:0,dailyBudget:archiveDefaults.dailyBudget,lastError,source:'Yahoo Finance',sharedBudget:true};}
 async function tick(){
 if(running||stopped||Date.now()<nextAt)return;if(!canFetch()){status='daily-priority';nextAt=Date.now()+1000;return;}const job=nextMinuteJob(symbols,meta,getQuota(),Date.now(),priority,refreshMs);status=job.reason;
 if(!job.symbol){nextAt=job.nextAt;return;}
 running=true;nextAt=Date.now()+1000;
 try{
 consume();const result=await fetchMinutes(job.symbol,meta[job.symbol]?.fetchedAt?'1d':'5d',fetcher);
 if(stopped)return;db.exec('BEGIN');try{for(const b of result.bars)put.run(job.symbol,b.time,b.open,b.high,b.low,b.close,b.volume);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 counts[job.symbol]=db.prepare('SELECT COUNT(*) AS count FROM minute_bars WHERE symbol=?').get(job.symbol).count;
 save(job.symbol,{fetchedAt:Date.now(),retryAt:0,status:'ready',lastBar:result.bars.at(-1).time});lastError=null;status='ready';
 }catch(e){
 const wait=e.status===403?24*3600000:e.status===429?15*60000:3600000;
 if([403,429].includes(e.status))pause(Date.now()+wait);
 save(job.symbol,{...meta[job.symbol],retryAt:Date.now()+wait,status:'error',error:[403,429].includes(e.status)?'Provider limited requests':'Minute data unavailable'});lastError='Minute data unavailable for '+job.symbol;status='error';
 }finally{running=false;if(!stopped)broadcast();}
 }
 return {tick,detail,summary,prioritize:s=>{priority=symbols.includes(s)?s:null;nextAt=Math.min(nextAt,Date.now());},stop:()=>{stopped=true;}};
}
