import {simulateInterval} from './interval-backtest.mjs';
import {parentPort} from 'node:worker_threads';
import {simulateHistory} from './backtest.mjs';
parentPort.on('message',({symbol,bars,options,revision,timeframe,dailyBars})=>{try{parentPort.postMessage({symbol,revision,timeframe,history:timeframe?simulateInterval(bars,dailyBars,timeframe,options):simulateHistory(bars,options)});}catch{parentPort.postMessage({symbol,revision,timeframe,error:'Не удалось рассчитать историческую симуляцию'});}});
