import {parentPort} from 'node:worker_threads';
import {simulateHistory} from './backtest.mjs';
parentPort.on('message',({symbol,bars,options,revision})=>{try{parentPort.postMessage({symbol,revision,history:simulateHistory(bars,options)});}catch{parentPort.postMessage({symbol,revision,error:'Не удалось рассчитать историческую симуляцию'});}});
