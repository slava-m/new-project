import test from 'node:test';import assert from 'node:assert/strict';import {indicators,validBar,splitClosed} from '../indicators.mjs';
const bars=Array.from({length:21},(_,i)=>({time:1700000000+60*i,open:100+i,high:102+i,low:99+i,close:101+i,volume:i===20?200:100}));
test('SMA, RSI and prior-only volume baseline',()=>{const r=indicators(bars);assert.equal(r.sma20,111.5);assert.equal(r.rsi14,100);assert.equal(r.volumeRatio,2);assert.equal(r.gaps,false);});
test('flat RSI and zero-volume baseline',()=>{const r=indicators(bars.map(b=>({...b,close:100,volume:0})));assert.equal(r.rsi14,50);assert.equal(r.volumeRatio,null);});
test('incomplete candle excluded',()=>assert.equal(splitClosed(bars,bars.at(-1).time+30).length,20));
test('invalid timestamps and OHLC rejected',()=>{assert.equal(validBar(bars[0]),true);assert.equal(validBar({...bars[0],time:NaN}),false);assert.equal(validBar({...bars[0],high:50}),false);});
test('insufficient data and session gaps',()=>{assert.equal(indicators(bars.slice(0,3)).sma20,null);assert.equal(indicators(bars.map((b,i)=>({...b,time:b.time+(i>10?3600:0)}))).gaps,true);});
