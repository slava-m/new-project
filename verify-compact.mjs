
import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire('C:/Users/Slava/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_probe.cjs');const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage({viewport:{width:1034,height:1122}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const state=await(await page.request.get('http://127.0.0.1:8787/api/state?symbol=AAPL')).json();
 await page.route('**/events*',route=>route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify(state)+'\n\n'}));
 await page.goto('http://127.0.0.1:8787');await page.locator('.watch').waitFor();
 assert.equal(await page.locator('#scan-table').isVisible(),false);assert.equal(await page.locator('.watch').count(),1);assert.equal(await page.locator('#history-browser').getAttribute('open'),null);
 await page.fill('#scan-search','AAPL');assert.equal(await page.locator('#scan-table').isVisible(),true);assert.equal(await page.locator('#scan-table tr').count(),2);
 await page.fill('#scan-search','');assert.equal(await page.locator('#scan-table').isVisible(),false);
 await page.click('#show-all-stocks');assert.equal(await page.locator('#scan-table tr').count(),504);await page.click('#show-all-stocks');assert.equal(await page.locator('#scan-table').isVisible(),false);
 await page.locator('#history-browser>summary').click();
 for(const filter of ['signals','trades','all']){await page.selectOption('#history-filter',filter);const expected=Object.values(state.symbols).filter(x=>x.history&&(filter==='all'||(filter==='signals'?x.history.signals>0:x.history.metrics.closedTrades>0))).length;assert.equal(await page.locator('#universe-history tr').count(),expected+1);}
 await page.fill('#history-search','AAPL');assert.equal(await page.locator('#universe-history tr').count(),state.symbols.AAPL.history?2:1);
 await page.selectOption('#ui-language','en');assert.equal(await page.locator('#history-filter option[value=signals]').innerText(),'With historical signals');
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(errors.length,0);
 console.log('PASS compact defaults, search/show/hide, independent historical filters, language and mobile');
}finally{await browser.close();}
