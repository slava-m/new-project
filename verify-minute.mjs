
import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire('C:/Users/Slava/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_probe.cjs');const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage({viewport:{width:1034,height:1122}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const state=await(await page.request.get('http://127.0.0.1:8787/api/state?symbol=AAPL')).json();
 assert.ok(state.minute.bars.length>100);assert.ok(state.minute.bars.every(b=>b.time%60===0&&b.time+60<=state.now/1000));assert.equal(state.symbols.AAPL.bars.length,501);
 await page.route('**/events*',route=>route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify(state)+'\n\n'}));
 await page.goto('http://127.0.0.1:8787');await page.locator('#symbol').filter({hasText:'AAPL'}).waitFor();const dailyMethod=await page.locator('#signal-method').innerText();
 await page.selectOption('#chart-interval','1min');assert.ok(await page.locator('#chart').isVisible());assert.ok(await page.locator('#minute-status').isVisible());assert.match(await page.locator('#freshness').innerText(),/1 min/);assert.equal(await page.locator('#signal-method').innerText(),dailyMethod);
 await page.selectOption('#chart-source','tv');const src=await page.locator('#tv-chart iframe').getAttribute('src');assert.equal(JSON.parse(decodeURIComponent(src.split('#')[1])).interval,'1');
 await page.selectOption('#ui-language','en');assert.equal(await page.locator('#chart-interval option[value="1min"]').innerText(),'Minute candles');assert.match(await page.locator('#minute-note').innerText(),/remain daily/);
 const untranslated=(await page.locator('body').innerText()).split('\n').filter(t=>/[А-Яа-яЁё]/.test(t)&&!t.includes('Русский'));assert.equal(untranslated.length,0,untranslated.join(';'));
 await page.selectOption('#chart-interval','1day');assert.equal(await page.locator('#minute-status').isVisible(),false);assert.equal(await page.locator('#minute-note').isVisible(),false);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(errors.length,0,errors.join(';'));
 console.log('PASS real completed minute bars, chart intervals, isolated daily strategy, freshness, English and mobile');
}finally{await browser.close();}

