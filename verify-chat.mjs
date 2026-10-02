
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import fs from 'node:fs';
const require=createRequire('C:/Users/Slava/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_probe.cjs');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,channel:'msedge',args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+process.cwd()+'/data/voice-test.wav']});
try{
 const page=await browser.newPage({permissions:['microphone']}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8787');await page.locator('#chat-title').waitFor();
 await page.selectOption('#ui-language','en');assert.equal(await page.locator('#chat-title').innerText(),'Chat with local agent');
 await page.fill('#chat-message','Why is AAPL not a confirmed buy? Keep it brief.');await page.click('#chat-send');
 await page.locator('#chat-log .assistant').last().waitFor({timeout:150000});
 assert.ok((await page.locator('#chat-log .assistant').last().innerText()).length>20);
 await page.reload();await page.locator('#chat-log .assistant').last().waitFor();
 const before=await page.locator('#chat-log').innerText();await page.selectOption('#ui-language','ru');assert.equal(await page.locator('#chat-log').innerText(),before);
 
 await page.selectOption('#ui-language','en');await page.click('#chat-mic');await page.waitForFunction(()=>document.querySelector('#chat-mic').textContent==='Finish recording');await new Promise(r=>setTimeout(r,5000));await page.click('#chat-mic');await page.waitForFunction(()=>/Check the text|No speech|Voice unavailable/.test(document.querySelector('#chat-status').textContent),{timeout:100000});console.log('Mic result:',await page.locator('#chat-status').innerText());assert.match(await page.locator('#chat-message').inputValue(),/Apple/i);
 const denied=await page.request.post('http://127.0.0.1:8787/api/chat',{headers:{Origin:'https://example.com'},data:{message:'x'}});assert.equal(denied.status(),403);
 const voice=await page.request.post('http://127.0.0.1:8787/api/voice?language=en',{headers:{Origin:'http://127.0.0.1:8787','Content-Type':'audio/wav'},data:fs.readFileSync('data/voice-test.wav'),timeout:100000});
 assert.equal(voice.status(),200);assert.match((await voice.json()).text,/Apple/i);
 
 const speech=await page.request.post('http://127.0.0.1:8787/api/speech',{headers:{Origin:'http://127.0.0.1:8787','Content-Type':'application/json'},data:{text:'Проверка локального голоса.',language:'ru'}});
 assert.equal(speech.status(),200);assert.equal((await speech.body()).subarray(0,4).toString(),'RIFF');
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.equal(errors.length,0,errors.join(';'));
 console.log('PASS live chat, bilingual controls, preserved history, origin rejection, offline audio transcription, mobile and JS checks');
 console.log('Local browser voices:',await page.evaluate(()=>speechSynthesis.getVoices().filter(v=>v.localService).map(v=>v.lang)));
}finally{await browser.close();}

