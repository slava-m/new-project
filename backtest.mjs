import {evaluateStrategy} from './strategy.mjs';
import {validBar} from './indicators.mjs';
export const simulationDefaults={initialCapital:10000,riskFraction:0.01,commissionPerSide:2.5,slippageBps:5,minRR:2};
export function simulateHistory(bars,options={},evaluate=evaluateStrategy){
 const o={...simulationDefaults,...options};
 if(!Number.isFinite(o.initialCapital)||o.initialCapital<=0||o.riskFraction<=0||o.riskFraction>1||!Number.isFinite(o.commissionPerSide)||o.commissionPerSide<0||o.slippageBps<0)throw Error('Invalid simulation settings');
 if(bars.some((b,i)=>!validBar(b)||i&&b.time<=bars[i-1].time))throw Error('Invalid historical bars');
 const fee=o.commissionPerSide,slip=o.slippageBps/10000,trades=[],equity=[];
 let capital=o.initialCapital,pending=null,position=null,signals=0,expired=0,skipped=0,ambiguous=0,peak=capital,maxDrawdownPct=0;
 function close(price,reason,index,uncertain=false){
 const exit=price*(1-slip),exitFee=fee,net=(exit-position.entry)*position.qty-position.entryFee-exitFee;
 capital+=net;trades.push({...position,exit,exitTime:bars[index].time,exitReason:reason,exitFee,net,rMultiple:net/(position.risk*position.qty),ambiguous:uncertain,holdSessions:index-position.entryIndex+1});
 position=null;
 }
 for(let i=0;i<bars.length;i++){
 const b=bars[i];
 if(pending){
 if(i>pending.expiry){expired++;pending=null;}
 else if(b.open<=pending.plan.support.value){skipped++;pending=null;}
 else if(b.high>=pending.plan.entry){
 const p=pending.plan,entry=Math.max(b.open,p.entry)*(1+slip),risk=entry-p.stop,priceRisk=entry-p.stop*(1-slip);
 const qty=priceRisk>0?Math.min(Math.floor((capital*o.riskFraction-2*fee)/priceRisk),Math.floor((capital-fee)/entry)):0;
 const netReward=(p.target*(1-slip)-entry)*qty-2*fee,netRisk=priceRisk*qty+2*fee;
 if(risk<=0||netRisk<=0||netReward/netRisk<o.minRR||qty<1){skipped++;pending=null;}
 else{position={decisionTime:pending.decisionTime,entryTime:b.time,entryIndex:i,entry,entryFee:fee,qty,risk,stop:p.stop,target:p.target,support:p.support.value,maxHoldSessions:p.maxHoldSessions,closeInvalidated:false};pending=null;}
 }else if(b.low<=pending.plan.support.value){skipped++;pending=null;}
 }
 if(position){
 const p=position;
 if(p.closeInvalidated)close(b.open,'SMA150: выход на следующем открытии',i);
 else if(b.open<=p.stop)close(b.open,'Гэп ниже стопа',i);
 else if(b.open>=p.target)close(b.open,'Гэп выше цели',i);
 else{
 const stopHit=b.low<=p.stop,targetHit=b.high>=p.target;
 if(stopHit){if(targetHit)ambiguous++;close(p.stop,targetHit?'Стоп первым: порядок внутри дня неизвестен':'Стоп',i,targetHit);}
 else if(targetHit)close(p.target,'Цель',i);
 else if(i-p.entryIndex+1>=p.maxHoldSessions)close(b.close,'Предельный срок удержания',i);
 else if(i>=149){const s=evaluate(bars.slice(0,i+1),o);if(s.facts?.sma150!==undefined&&b.close<s.facts.sma150)position.closeInvalidated=true;}
 }
 }
 const marked=capital+(position?(b.close-position.entry)*position.qty-position.entryFee-fee:0);
 peak=Math.max(peak,marked);maxDrawdownPct=Math.max(maxDrawdownPct,(peak-marked)/peak*100);equity.push({time:b.time,value:marked});
 if(!pending&&!position&&i>=149){
 const s=evaluate(bars.slice(0,i+1),o);
 if(s.status==='candidate'&&s.plan){signals++;pending={plan:s.plan,decisionTime:b.time,expiry:i+s.plan.validForSessions};}
 }else if(pending&&i>=149){const s=evaluate(bars.slice(0,i+1),o);if(b.close<s.facts?.sma150){skipped++;pending=null;}}
 }
 const wins=trades.filter(t=>t.net>0),losses=trades.filter(t=>t.net<0),grossWin=wins.reduce((a,t)=>a+t.net,0),grossLoss=-losses.reduce((a,t)=>a+t.net,0);
 return {mode:'daily execution simulation',settings:{...o,now:undefined,connected:undefined},coverage:{bars:bars.length,first:bars[0]?.time,last:bars.at(-1)?.time,decisionSessions:Math.max(0,bars.length-149)},signals,expired,skipped,ambiguous,trades,openPosition:position,pendingPlan:pending,equity,metrics:{closedTrades:trades.length,winRate:trades.length?wins.length/trades.length*100:null,realizedNet:capital-o.initialCapital,realizedReturnPct:(capital/o.initialCapital-1)*100,maxDrawdownPct,profitFactor:grossLoss?grossWin/grossLoss:null,meanR:trades.length?trades.reduce((a,t)=>a+t.rMultiple,0)/trades.length:null},limitations:['Каждая акция моделируется отдельно: это не портфельный результат','Текущий набор акций создаёт смещение отбора; исключённые/делистингованные компании не представлены','250 запрошенных свечей дают короткое окно после прогрева SMA150','Дневной OHLC не раскрывает порядок цен: при касании стопа и цели выбран стоп первым','Вход и выход на одной дневной свече условны; нет минутного подтверждения','Комиссия 2.50 USD за каждую сторону; проскальзывание и риск 1% — экспериментальные допущения','Новости, дивиденды и корпоративные события не моделируются','Открытые позиции не включены в результаты завершённых сделок; просадка по дневной оценке включает их','Прибыльность и устойчивость стратегии не подтверждены']};
}
