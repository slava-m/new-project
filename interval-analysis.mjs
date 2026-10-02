
import {evaluateStrategy,sma} from './strategy.mjs';import {buildReport} from './report.mjs';import {sessionWindow} from './hour-archive.mjs';
export function evaluateInterval(bars,timeframe,dailyBars,research,now=Date.now()){
 if(!['1hour','1min'].includes(timeframe))throw Error('Unsupported interval');
 const seconds=timeframe==='1hour'?3600:60,last=bars.at(-1),session=last?sessionWindow(last.time):null;
 const end=last?Math.min(last.time+seconds,session?.end||Infinity):null;
 const dailyTurnover=dailyBars.length>=20&&dailyBars.slice(-20).every(b=>Number.isFinite(b.volume))?dailyBars.slice(-20).reduce((s,b)=>s+b.close*b.volume,0)/20:null;
 const signal=evaluateStrategy(bars,{...research,barSeconds:seconds,now:undefined,dailyTurnover:dailyTurnover??undefined});
 signal.barEnd=end;signal.timeframe=timeframe;signal.facts={...signal.facts,dailySma150:sma(dailyBars,150),liquidityTimeframe:dailyTurnover!==null?'1day':'unavailable'};
 signal.reasons=signal.reasons.map(t=>t.replaceAll('дневных свечей','свечей выбранного интервала').replaceAll('Дневное закрытие','Закрытие свечи'));
 signal.cancel=signal.cancel.map(t=>t.replaceAll('Дневное закрытие','Закрытие свечи').replaceAll('торговых сессии','свечи'));
 signal.limitations=['Технический срез выбранного интервала, не подтверждение входа прямо сейчас','SMA и ATR рассчитаны по свечам выбранного интервала; ликвидность — по дневным данным','Внутридневные параметры экспериментальные; историческая проверка этого интервала не выполнена','Новости и отчётность ещё не подключены'];
 if(dailyTurnover===null){signal.status='insufficient';signal.reasons.push('Нет дневных данных для проверки ликвидности');}
 const ageMinutes=end?Math.max(0,(now/1000-end)/60):null;
 return {signal,ageMinutes,barEnd:end};
}
export function intervalReport({symbol,timeframe,bars,signal,ageMinutes,modelConfirmed}){
 const label=timeframe==='1hour'?'Часовой':'Минутный';
 let text=buildReport({symbol,bars,signal,modelConfirmed});
 text=text.replaceAll('дневным свечам','свечам выбранного интервала').replaceAll('торговых сессий','свечей').replaceAll('торговых сессии','свечи');
 text=text.replace(/Срок активации:[^\n]*/g,'Срок удержания по этому интервалу отдельно не определён.');
 return label+' технический анализ · '+symbol+'\nПоследняя свеча: '+(bars.at(-1)?new Date(bars.at(-1).time*1000).toISOString():'нет данных')+'\nВозраст данных, минут: '+(ageMinutes===null?'нет данных':ageMinutes.toFixed(1))+'\nЭто отдельный технический срез; дневной отчёт и симуляция не заменяются.\n\n'+text;
}
