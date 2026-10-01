import {validBar} from './indicators.mjs';
import {pivots} from './chart-math.mjs';
import {extraStructures,patternCatalogue,patternStateLabel} from './patterns.mjs';
export {pivots} from './chart-math.mjs';
export const strategyDefaults={version:'sma150-structures-v2',name:'SMA150 · опора и технические структуры',nearAtr:0.5,stopAtr:0.25,minRR:2,minTurnover:20000000,maxAgeDays:7,maxHoldSessions:10};
export function sma(bars,n){return bars.length<n?null:bars.slice(-n).reduce((s,b)=>s+b.close,0)/n;}
export function atr14(bars){if(bars.length<15)return null;const tr=bars.slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)));let a=tr.slice(0,14).reduce((s,x)=>s+x,0)/14;for(const x of tr.slice(14))a=(a*13+x)/14;return a;}

function legacyStructures(bars,atr){
 if(!atr||bars.length<25)return [];const n=bars.length,last=bars.at(-1),previous=bars.at(-2),lows=pivots(bars).filter(p=>p.index>=n-65),highs=pivots(bars,'high').filter(p=>p.index>=n-90),out=[];
 for(let j=lows.length-1;j>0;j--){const b=lows[j];if(b.index<n-20)continue;for(let i=j-1;i>=0;i--){const a=lows[i],distance=b.index-a.index;if(distance<5||distance>40||Math.abs(a.value-b.value)>0.5*atr)continue;const neck=Math.max(...bars.slice(a.index+1,b.index).map(x=>x.high));if(neck-Math.max(a.value,b.value)<atr)continue;out.push({type:'Double Bottom',state:last.close>neck&&previous.close<=neck?'breakout':'forming',support:Math.min(a.value,b.value),trigger:neck,target:neck+(neck-(a.value+b.value)/2),points:[a,b],rule:'Два подтверждённых минимума, разница ≤0.5 ATR, между ними подъём ≥1 ATR'});break;}if(out.length)break;}
 for(let j=highs.length-1;j>0;j--){const r=highs[j],handleLength=n-1-r.index;if(handleLength<3||handleLength>15)continue;for(let i=j-1;i>=0;i--){const l=highs[i],length=r.index-l.index;if(length<15||length>65||Math.abs(l.value-r.value)>atr)continue;const cup=bars.slice(l.index+1,r.index),bottom=Math.min(...cup.map(b=>b.low)),depth=Math.min(l.value,r.value)-bottom;const bottomIndex=cup.findIndex(b=>b.low===bottom);if(depth<2*atr||depth>10*atr||bottomIndex<cup.length*0.2||bottomIndex>cup.length*0.8||cup.filter(b=>b.low<=bottom+depth*0.2).length<3)continue;const handleLow=Math.min(...bars.slice(r.index+1).map(b=>b.low));if(handleLow<r.value-depth*0.5)continue;const trigger=Math.max(l.value,r.value);out.push({type:'Cup and Handle',state:last.close>trigger&&previous.close<=trigger?'breakout':'forming',support:handleLow,trigger,target:trigger+depth,points:[l,r],rule:'Две вершины, округлая впадина, ручка 3–15 сессий с откатом ≤половины глубины'});break;}if(out.some(p=>p.type==='Cup and Handle'))break;}
 return out;
}
export function structures(bars,atr){
 if(!atr||bars.length<5)return [];
 const bullish=legacyStructures(bars,atr).map(p=>({...p,direction:'bullish',category:'chart',experimental:true}));
 const ceiling=Math.max(...bars.map(b=>b.high))*2,mirror=bars.map(b=>({...b,open:ceiling-b.open,high:ceiling-b.low,low:ceiling-b.high,close:ceiling-b.close}));
 const bearish=legacyStructures(mirror,atr).map(p=>({...p,type:p.type==='Double Bottom'?'Double Top':'Inverted Cup and Handle',direction:'bearish',category:'chart',state:p.state==='breakout'?'breakdown':'forming',support:null,resistance:ceiling-p.support,trigger:ceiling-p.trigger,target:ceiling-p.target,points:p.points.map(x=>({...x,value:ceiling-x.value})),rule:'Зеркальная медвежья структура: '+p.rule,experimental:true}));
 return [...bullish,...bearish,...extraStructures(bars,atr)];
}

export function evaluateStrategy(bars,options={}){
 const o={...strategyDefaults,...options};o.minRR=Math.max(2,o.minRR);const last=bars.at(-1);let result={method:o.name,version:o.version,status:'insufficient',side:'long',barEnd:last?last.time+86400:null,reasons:[],patterns:[],supportedPatterns:patternCatalogue,warnings:[],plan:null,cancel:['Дневное закрытие ниже SMA150','Пробой выбранной структурной опоры до входа','План не активировался за 3 торговые сессии','Данные устарели'],limitations:['Дневные свечи, не подтверждение цены прямо сейчас','Новости и отчётность ещё не подключены','Параметры структур — экспериментальные; прибыльность не подтверждена']};
 if(bars.length<150||bars.some(b=>!validBar(b))){result.reasons=['Нужно минимум 150 корректных завершённых дневных свечей'];return result;}
 if(bars.slice(-150).some((b,i,a)=>i&&(b.time<=a[i-1].time||b.time-a[i-1].time>7*86400))){result.reasons=['В истории есть существенные пропуски или неверный порядок'];return result;}
 const ma={sma20:sma(bars,20),sma50:sma(bars,50),sma150:sma(bars,150)},atr=atr14(bars);
 result.facts={...ma,atr14:atr,close:last.close};
 // Hard exclusion applies before pattern detection or model explanation.
 if(last.close<ma.sma150)return {...result,status:'excluded',reasons:['Закрытие ниже SMA150: акция исключена'],patterns:[]};
 if(o.now!==undefined&&(!o.connected||o.now-(last.time+86400)>o.maxAgeDays*86400||last.time+86400>o.now))return {...result,reasons:['Нет свежих завершённых дневных данных']};
 if(!atr||atr<=0)return {...result,reasons:['Недостаточно данных волатильности']};
 const turnover=bars.slice(-20).every(b=>b.volume!==null&&Number.isFinite(b.volume))?bars.slice(-20).reduce((s,b)=>s+b.volume*b.close,0)/20:null;
 const prev=bars.at(-2),prior=bars.slice(0,-1);
 const near=[20,50,150].filter(period=>{const current=ma['sma'+period],previous=sma(prior,period);return previous!==null&&prev.close>=previous&&(Math.abs(last.close-current)<=o.nearAtr*atr||last.low<=current&&last.high>=current);});
 const patterns=structures(bars,atr);
 const bullish=ma.sma20>ma.sma50&&last.close>ma.sma50;
 const candidates=pivots(bars).filter(p=>p.index>=bars.length-60&&p.value<last.close&&Math.max(...bars.slice(p.index+1).map(b=>b.high))-p.value>=atr&&bars.slice(p.index+1).every(b=>b.low>=p.value));
 const support=candidates.at(-1);
 result={...result,status:'waiting',patterns,facts:{...result.facts,turnover20:turnover,near,context:bullish?'bullish':'bearish / смешанный'}};
 if(turnover===null)return {...result,status:'insufficient',reasons:['Нет подтверждённого объёма для фильтра ликвидности']};
 if(turnover<o.minTurnover)return {...result,status:'excluded',reasons:['Средний дневной оборот ниже экспериментального порога']};
 const pattern=patterns.find(p=>p.direction==='bullish'&&p.category==='chart'&&p.state==='breakout');
 const bullishCandle=patterns.some(p=>p.category==='candle'&&p.direction==='bullish'&&p.state==='confirmed');
 result.warnings=patterns.filter(p=>p.direction==='bearish'&&p.state!=='invalidated').map(p=>p.type+': '+patternStateLabel(p)+'; предупреждение, не сигнал на шорт');
 const reaction=near.some(n=>last.close>ma['sma'+n])&&(last.close>prev.high||bullishCandle);
 result.reasons=[near.length?'Подход к SMA '+near.join(', '):'Подход к средней не обнаружен',patterns.length?patterns.map(p=>p.type+': '+patternStateLabel(p)).join('; '):'Технические структуры по текущим правилам не обнаружены',reaction?'Есть подтверждение отскока':'Подтверждённого отскока пока нет'];
 if(!support)return {...result,reasons:[...result.reasons,'Подтверждённая действующая структурная опора не найдена']};
 const entry=last.high+0.1*atr,stop=support.value-o.stopAtr*atr,risk=entry-stop;
 const resistance=pivots(bars,'high').filter(p=>p.value>entry).sort((a,b)=>a.value-b.value)[0]?.value??null;
 const target=resistance??pattern?.target??null;
 if(target===null||target<=entry||risk<=0)return {...result,reasons:[...result.reasons,'Нет обоснованной цели выше предполагаемого входа'],support};
 const rr=(target-entry)/risk;
 const plan={entry,stop,target,rr,minimumRR:o.minRR,minimumTarget:entry+o.minRR*risk,riskPerShare:risk,entryState:'Условный вход, не исполненная сделка',support,supportReason:'Последний действующий подтверждённый swing-low; последующий подъём ≥1 ATR',targetReason:resistance?'Ближайшая подтверждённая вершина выше входа':'Измеренная цель технической структуры, не прогноз',maxHoldSessions:o.maxHoldSessions,validForSessions:3,volumeRatio:last.volume/(bars.slice(-21,-1).reduce((s,b)=>s+b.volume,0)/20),costsIncluded:false};
 const trigger=!!pattern||reaction;
 return {...result,status:trigger&&rr>=o.minRR&&target-entry>=o.minRR*risk?'candidate':'waiting',plan,reasons:[...result.reasons,'Опора и расчётные уровни найдены',rr>=o.minRR?'RR проходит экспериментальный порог':'RR ниже экспериментального порога',!trigger?'Нет подтверждённого технического триггера':'Технический триггер сформирован']};
}
export function scanHistory(bars,options={}){
 const decisions=[];
 for(let i=149;i<bars.length-1;i++){const signal=evaluateStrategy(bars.slice(0,i+1),options);if(signal.status==='candidate')decisions.push({decisionTime:bars[i].time+86400,signal,nextOpen:bars[i+1].open});}
 return {mode:'historical research',decisions,performance:null,note:'Это проверка сигналов; симуляция исполнений и историческая прибыльность не рассчитаны'};
}
