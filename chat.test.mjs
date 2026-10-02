
import test from 'node:test';
import assert from 'node:assert/strict';
import {createModelQueue} from './model-queue.mjs';
import {chatContext} from './chat.mjs';
test('chat takes priority after running generation, without concurrent model requests',async()=>{
 const run=createModelQueue();let release;const barrier=new Promise(r=>release=r),events=[];
 const first=run(async()=>{events.push('active');await barrier;});
 const scanner=run(async()=>events.push('scanner'));
 const chat=run(async()=>events.push('chat'),10);
 release();await Promise.all([first,scanner,chat]);assert.deepEqual(events,['active','chat','scanner']);
});
test('chat context allows only research fields, never provider keys or account information',()=>{
 const context=chatContext({providerKey:'secret',config:{key:'hidden'},positions:[{account:'hidden'}],symbols:{AAPL:{bars:[{time:123,close:42}],signal:{status:'waiting',facts:{sma150:40}},analysis:{text:'report'},providerKey:'secret',history:{metrics:{trades:1},trades:[{secret:'hidden'}]}}}},'AAPL');
 const encoded=JSON.stringify(context);assert.ok(!encoded.includes('secret'));assert.ok(!encoded.includes('hidden'));assert.equal(context.selected.lastBar.close,42);assert.equal(context.counts.waiting,1);
});
