
import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire('C:/Users/Slava/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_probe.cjs');const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const state=await(await page.request.get('http://127.0.0.1:8787/api/state?symbol=AAPL')).json(),dailyGenerated=state.symbols.AAPL.analysis.generated;
 await page.goto('http://127.0.0.1:8787');await page.locator('#symbol').filter({hasText:'AAPL'}).waitFor();
 for(const timeframe of ['1hour','1min']){
 await page.selectOption('#analysis-timeframe',timeframe);await page.selectOption('#analysis-scope','selected');await page.click('#run-analysis');
 await page.waitForFunction(()=>document.querySelector('#manual-analysis-status').textContent.includes('поставлен'));
 let result;for(let i=0;i<90;i++){const s=await(await page.request.get('http://127.0.0.1:8787/api/state?symbol=AAPL')).json();result=s.intervalAnalyses?.[timeframe];if(result&&s.analysisSchedule.pending===0){assert.equal(s.symbols.AAPL.analysis.generated,dailyGenerated);break;}await new Promise(r=>setTimeout(r,1000));}
 assert.equal(result.timeframe,timeframe);assert.ok(result.modelConfirmed);assert.ok(result.barCount>150);
 }
 await page.reload();await page.locator('#symbol').filter({hasText:'AAPL'}).waitFor();await page.selectOption('#analysis-timeframe','1min');assert.match(await page.locator('#interval-result').innerText(),/Минутный технический анализ/);
 await page.selectOption('#analysis-timeframe','1day');assert.equal(await page.locator('#interval-results').isVisible(),false);
 await page.selectOption('#ui-language','en');assert.equal(await page.locator('#analysis-timeframe option[value="1hour"]').innerText(),'Hourly analysis');
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(errors.length,0,errors.join(';'));
 console.log('PASS real hourly/minute model checks, separate stored reports, unchanged daily report, persistence, language and mobile');
}finally{await browser.close();}
