import {holdingDuration} from './holding-duration.mjs';
import {applyCalendar,calendarRisk} from './earnings-calendar.mjs';
import {evaluateStrategy} from './strategy.mjs';
import {executionDefaults,executionPlan,timeExitAllowed} from './execution-costs.mjs';
import {validBar} from './indicators.mjs';
export function simulatePortfolio(series,options={},evaluate=evaluateStrategy,onProgress=()=>{}){
 const o={...executionDefaults,maxPositions:6,...options};
 if(!Number.isFinite(o.initialCapital)||o.initialCapital<=0||!Number.isInteger(o.maxPositions)||o.maxPositions<1||o.riskFraction<=0||o.riskFraction>1)throw Error('Invalid portfolio settings');
 const symbols=Object.keys(series).sort(),times=new Set(),byTime=new Map();
 for(const symbol of symbols){const bars=series[symbol];if(bars.some((b,i)=>!validBar(b)||i&&b.time<=bars[i-1].time))throw Error('Invalid portfolio bars');for(let i=0;i<bars.length;i++){const b=bars[i];times.add(b.time);if(!byTime.has(b.time))byTime.set(b.time,[]);byTime.get(b.time).push({symbol,b,i});}}
 const timeline=[...times].sort((a,b)=>a-b),pending=new Map(),positions=new Map(),marks=new Map(),trades=[],equity=[];
 let cash=o.initialCapital,peak=cash,drawdown=0,signals=0,expired=0,cancelled=0,capacitySkipped=0,ambiguous=0,maxConcurrent=0;
 const slip=o.slippageBps/10000,fee=o.commissionPerSide;
 const value=()=>cash+[...positions].reduce((sum,[s,p])=>sum+(marks.get(s)??p.entry)*p.qty-fee,0);
 const close=(symbol,price,time,reason,uncertain=false)=>{const p=positions.get(symbol),exit=price*(1-slip),net=(exit-p.entry)*p.qty-2*fee;cash+=exit*p.qty-fee;trades.push({...p,...holdingDuration(series[symbol],p.entryTime,time),symbol,exit,exitTime:time,reason,net,rMultiple:net/p.netRisk,ambiguous:uncertain});positions.delete(symbol);};
 for(let tick=0;tick<timeline.length;tick++){
 const time=timeline[tick],rows=byTime.get(time);for(const {symbol,b,i} of rows){marks.set(symbol,b.open);}
 // Resolve opening exits before new entries. Intraday exits are processed afterwards.
 for(const {symbol,b,i} of rows){const p=positions.get(symbol);if(!p)continue;if(o.exitMode!=='stop-target-only'&&p.invalidate)close(symbol,b.open,time,'SMA150');else if(b.open<=p.stop)close(symbol,b.open,time,'stop gap');else if(b.open>=p.target)close(symbol,b.open,time,'target gap');}
 const candidates=[];
 for(const {symbol,b,i} of rows){const p=pending.get(symbol);if(!p)continue;if(o.earningsCache&&calendarRisk(symbol,o.earningsCache,time*1000+86400000,o.earningsWindowDays||3).blocked){cancelled++;pending.delete(symbol);continue;}if(i>p.expiry){expired++;pending.delete(symbol);}else if(b.open<=p.plan.support.value){cancelled++;pending.delete(symbol);}else if(b.high>=p.plan.entry){candidates.push({symbol,b,i,p});}else if(b.low<=p.plan.support.value){cancelled++;pending.delete(symbol);}}
 // Rank only information available on the previous close, never today's eventual return.
 candidates.sort((a,b)=>(b.p.plan.netRR??b.p.plan.rr)-(a.p.plan.netRR??a.p.plan.rr)||a.symbol.localeCompare(b.symbol));
 const entryExits=[];
 for(const {symbol,b,i,p} of candidates){pending.delete(symbol);if(positions.size>=o.maxPositions){capacitySkipped++;continue;}
 const ex=executionPlan(p.plan,{...o,capital:value(),availableCash:cash},b.open);
 if(ex.qty<1||!Number.isFinite(ex.rr)||ex.rr<ex.minimumRR){cancelled++;continue;}
 cash-=ex.entry*ex.qty+fee;const pos={decisionTime:p.decisionTime,entryTime:time,entryIndex:i,entry:ex.entry,qty:ex.qty,stop:p.plan.stop,target:p.plan.target,netRisk:ex.netRisk,entryRR:ex.rr,maxHoldSessions:p.plan.maxHoldSessions??10};positions.set(symbol,pos);maxConcurrent=Math.max(maxConcurrent,positions.size);
 if(b.low<=pos.stop){const uncertain=b.high>=pos.target;if(uncertain)ambiguous++;entryExits.push([symbol,Math.min(b.open,pos.stop),time,'entry-bar stop',true]);}
 else if(b.high>=pos.target){ambiguous++;entryExits.push([symbol,pos.target,time,'entry-bar target',true]);}
 }
 for(const args of entryExits)close(...args);
 // Intraday exits cannot release cash or position slots for earlier entries on the same daily bar.
 for(const {symbol,b,i} of rows){const p=positions.get(symbol);if(!p||p.entryTime===time)continue;if(b.low<=p.stop){const uncertain=b.high>=p.target;if(uncertain)ambiguous++;close(symbol,p.stop,time,'stop',uncertain);}else if(b.high>=p.target)close(symbol,p.target,time,'target');else if(i-p.entryIndex+1>=p.maxHoldSessions&&timeExitAllowed(p,b.close,o))close(symbol,b.close,time,'time limit');}
 for(const {symbol,b,i} of rows){marks.set(symbol,b.close);if(i<149)continue;const raw=evaluate(series[symbol].slice(0,i+1),o),s=o.earningsCache?applyCalendar(raw,symbol,o.earningsCache,time*1000+86400000,o.earningsWindowDays||3):raw;const position=positions.get(symbol);if(position){if(o.exitMode!=='stop-target-only'&&Number.isFinite(s.facts?.sma150)&&b.close<s.facts.sma150)position.invalidate=true;continue;}if(pending.has(symbol)){if(Number.isFinite(s.facts?.sma150)&&b.close<s.facts.sma150){pending.delete(symbol);cancelled++;}continue;}
 if((!o.startTime||time>=o.startTime)&&(!o.endTime||time<=o.endTime)&&s.status==='candidate'&&s.plan){signals++;pending.set(symbol,{plan:s.plan,decisionTime:time,expiry:i+(s.plan.validForSessions??3)});}}
 const marked=value();peak=Math.max(peak,marked);drawdown=Math.max(drawdown,(peak-marked)/peak*100);equity.push({time,value:marked,cash,positions:positions.size});if(tick%10===0)onProgress({completed:tick+1,total:timeline.length});
 }
 const wins=trades.filter(t=>t.net>0),losses=trades.filter(t=>t.net<0),profit=wins.reduce((s,t)=>s+t.net,0),loss=-losses.reduce((s,t)=>s+t.net,0),finalEquity=value();
 return {generated:Date.now(),settings:o,coverage:{symbols:symbols.length,first:timeline[0],last:timeline.at(-1),bars:symbols.reduce((s,k)=>s+series[k].length,0)},signals,expired,cancelled,capacitySkipped,ambiguous,maxConcurrent,trades,equity,openPositions:[...positions].map(([symbol,p])=>({symbol,...p,...holdingDuration(series[symbol],p.entryTime,series[symbol].at(-1).time)})),pendingPlans:pending.size,metrics:{closedTrades:trades.length,realizedNet:trades.reduce((s,t)=>s+t.net,0),finalEquity,totalReturnPct:(finalEquity/o.initialCapital-1)*100,maxDrawdownPct:drawdown,winRate:trades.length?wins.length/trades.length*100:null,profitFactor:loss?profit/loss:null,meanR:trades.length?trades.reduce((s,t)=>s+t.rMultiple,0)/trades.length:null},limitations:['Only stop/target exits; time and SMA150 do not close positions.','Calendar applies only when recorded information was available at decision time; current calendar cannot retrospectively validate old trades.','Current constituents: survivorship bias; previously examined history is not independent validation.','Daily OHLC cannot establish intrabar order; stop first and entry-bar ambiguity are flagged.','No leverage, fractional shares, news, dividends or confirmed corporate-action adjustment.','Missing stock bars use last available mark; open positions included in final equity, not realized profit.','Risk to stop is planned, not guaranteed: gaps can exceed it.']};
}
