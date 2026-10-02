
import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire('C:/Users/Slava/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_probe.cjs');const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage({viewport:{width:1034,height:1122}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const initial=await(await page.request.get('http://127.0.0.1:8787/api/state?symbol=AAPL')).json();
 assert.ok(initial.higherFrames.hourly.bars.length>1500);assert.ok(initial.symbols.AAPL.bars.length>700);assert.equal(initial.analysisSchedule.intervalMinutes,1440);assert.equal(initial.analysisSchedule.pending,0);
 await page.goto('http://127.0.0.1:8787');await page.locator('#symbol').filter({hasText:'AAPL'}).waitFor();
 assert.equal(await page.locator('#chart-interval option[value="4hour"]').count(),0);
 await page.selectOption('#chart-interval','1hour');assert.ok(await page.locator('#chart').isVisible());assert.match(await page.locator('#freshness').innerText(),/1 h/);assert.match(await page.locator('#frame-status').innerText(),/Часовой архив/);
 const before=initial.symbols.AAPL.analysis?.generated||0;await page.selectOption('#analysis-scope','selected');await page.click('#run-analysis');await page.waitForFunction(()=>document.querySelector('#manual-analysis-status').textContent.includes('поставлен'),{timeout:10000});
 let fresh;for(let i=0;i<60;i++){fresh=await(await page.request.get('http://127.0.0.1:8787/api/state?symbol=AAPL')).json();if(fresh.symbols.AAPL.analysis?.generated>before&&fresh.analysisSchedule.pending===0)break;await new Promise(r=>setTimeout(r,1000));}
 assert.ok(fresh.symbols.AAPL.analysis.generated>before);assert.equal(fresh.analysisSchedule.intervalMinutes,1440);
 const denied=await page.request.post('http://127.0.0.1:8787/api/analyze',{headers:{Origin:'https://example.com'},data:{scope:'selected',symbol:'AAPL'}});assert.equal(denied.status(),403);
 await page.selectOption('#analysis-scope','all');assert.equal(await page.locator('#analysis-scope').inputValue(),'all');
 await page.selectOption('#ui-language','en');assert.equal(await page.locator('#chart-interval option[value="1hour"]').innerText(),'Hourly candles');assert.equal(await page.locator('#run-analysis').innerText(),'Run analysis');
 assert.match(await page.locator('#history-targets').innerText(),/minute data is unavailable/);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(errors.length,0,errors.join(';'));
 console.log('PASS real three-year daily/yearly hourly coverage, hourly chart, actual manual model review, daily scheduler, origin guard, bilingual UI and mobile');
}finally{await browser.close();}
