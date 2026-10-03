import {applyCalendar} from './earnings-calendar.mjs';
import {evaluateStrategy} from './strategy.mjs';
import {simulateInterval} from './interval-backtest.mjs';
import {parentPort} from 'node:worker_threads';
import {simulateHistory} from './backtest.mjs';
parentPort.on('message',({symbol,bars,options,revision,timeframe,dailyBars})=>{try{parentPort.postMessage({symbol,revision,timeframe,history:timeframe?simulateInterval(bars,dailyBars,timeframe,options):simulateHistory(bars,options,(prefix,o)=>applyCalendar(evaluateStrategy(prefix,o),symbol,o.earningsCache||{},prefix.at(-1).time*1000+86400000,o.earningsWindowDays||3))});}catch{parentPort.postMessage({symbol,revision,timeframe,error:'Не удалось рассчитать историческую симуляцию'});}});
