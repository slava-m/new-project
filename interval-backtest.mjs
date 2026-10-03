import {simulateHistory} from './backtest.mjs';
import {evaluateStrategy} from './strategy.mjs';
export function simulateInterval(bars,dailyBars,timeframe,options={}){
 if(!['1hour','1min'].includes(timeframe))throw Error('Unsupported interval');
 const seconds=timeframe==='1hour'?3600:60;
 const result=simulateHistory(bars,{...options,calendarSessions:true,timeframe},(prefix,o)=>{
 const last=prefix.at(-1);
 // Only daily sessions strictly before the decision date are available: no daily-close lookahead.
 const completed=dailyBars.filter(b=>b.time<Math.floor(last.time/86400)*86400).slice(-20);
 if(completed.length<20||completed.some(b=>!Number.isFinite(b.volume)))return {status:'insufficient',facts:{}};
 const dailyTurnover=completed.reduce((sum,b)=>sum+b.close*b.volume,0)/20;
 return evaluateStrategy(prefix,{...o,barSeconds:seconds,dailyTurnover,now:undefined});
 });
 result.generated=Date.now();result.timeframe=timeframe;result.equity=[];
 result.limitations=['Каждая акция моделируется отдельно; это не портфельный результат','SMA и ATR рассчитываются по выбранному интервалу; ликвидность — по предшествующим дневным свечам','Активация до 3 торговых сессий; после 10 торговых сессий выход по времени только при результате после издержек не ниже нуля','Если стоп и цель затронуты одной свечой, выбран стоп первым','Внутридневная симуляция экспериментальная; новости, отчётность и корпоративные события не моделируются','История минут ограничена фактически накопленным архивом; полного года нет'];
 return result;
}