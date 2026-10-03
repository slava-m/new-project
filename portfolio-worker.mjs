import {parentPort} from 'node:worker_threads';
import {simulatePortfolio} from './portfolio-backtest.mjs';
parentPort.on('message',job=>{try{const result=simulatePortfolio(job.series,job.options,undefined,progress=>parentPort.postMessage({progress}));parentPort.postMessage({result});}catch(e){parentPort.postMessage({error:e.message});}});
