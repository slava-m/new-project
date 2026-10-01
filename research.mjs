import {indicators,validBar} from './indicators.mjs';
export const defaults={name:'Эксперимент: SMA20 + объём',minVolumeRatio:1.5,maxRsi:70,maxAgeSeconds:180,timeframe:'1min'};
export function evaluateSetup(bars,options={}){
 const o={...defaults,...options},last=bars.at(-1); const duration=o.timeframe==='1day'?86400:60; const maxAge=o.timeframe==='1day'?7*86400:o.maxAgeSeconds;
 const result={method:o.name,status:'insufficient',barEnd:last?last.time+duration:null,reasons:[],cancel:['Закрытие обратно ниже SMA20','Следующая свеча не подтверждает повышенный объём','Данные устарели или соединение потеряно'],experimental:true};
 if(bars.length<21||bars.some(b=>!validBar(b))){result.reasons=['Нужно 21 корректная завершённая '+(o.timeframe==='1day'?'дневная':'минутная')+' свеча'];return result;}
 if(o.now!==undefined&&(!o.connected||o.now-(last.time+duration)>maxAge||last.time+duration>o.now)){result.reasons=['Нет подтверждённых свежих числовых данных'];return result;}
 if(bars.slice(-21).some((b,i,a)=>i&&(o.timeframe==='1day'?(b.time<=a[i-1].time||b.time-a[i-1].time>7*86400):b.time-a[i-1].time!==60))){result.reasons=['Разрыв в последних 21 свече; условия не оцениваются'];return result;}
 const f=indicators(bars,o),previous=indicators(bars.slice(0,-1),o);
 if(f.volumeRatio===null||f.rsi14===null){result.reasons=['Нет данных объёма или RSI'];return result;}
 const conditions=[
 {label:'Close пересёк SMA20 снизу вверх',passed:bars.at(-2).close<=previous.sma20&&last.close>f.sma20},
 {label:'Объём ≥ '+o.minVolumeRatio+' × среднего предыдущих 20 свечей',passed:f.volumeRatio>=o.minVolumeRatio},
 {label:'RSI14 (простое среднее) < '+o.maxRsi,passed:f.rsi14<o.maxRsi}];
 return {...result,status:conditions.every(c=>c.passed)?'candidate':'waiting',conditions,reasons:conditions.map(c=>(c.passed?'Выполнено: ':'Не выполнено: ')+c.label),facts:f};
}
export function walkForward(bars,options={}){
 // Decision uses only the closed prefix. Next open is recorded afterwards for research.
 const events=[];
 for(let i=20;i<bars.length-1;i++){const signal=evaluateSetup(bars.slice(0,i+1),options);if(signal.status==='candidate')events.push({decisionTime:bars[i].time+(options.timeframe==='1day'?86400:60),signal,nextBarOpen:bars[i+1].open,nextBarTime:bars[i+1].time});}
 return {method:{...defaults,...options}.name,mode:'historical research',events,performance:null,note:'Доходность не рассчитывается: правила выхода, издержек и риска не выбраны'};
}
