import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire('C:/Users/Slava/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_probe.cjs');
const {chromium}=require('playwright');const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE:',m.text().slice(0,250));});
 await page.goto('http://127.0.0.1:8787');
 await page.waitForFunction(()=>document.querySelector('#diagnostics').textContent.includes('clientId'));
 await page.locator('#tv-chart iframe').waitFor({timeout:40000});
 console.log('NNE iframe:',await page.locator('#tv-chart iframe').getAttribute('src'));
 const nneFrame=await page.locator('#tv-chart iframe').elementHandle().then(h=>h.contentFrame());
 if(nneFrame){await nneFrame.locator('canvas').first().waitFor({timeout:40000});console.log('NNE chart canvas loaded'); assert.equal(Math.round((await page.locator('#tv-chart').boundingBox()).height),500);}
 await page.waitForTimeout(10000); await page.screenshot({path:'preview.png',fullPage:true});
 await page.locator('button.watch').nth(1).click();
 await page.locator('#tv-chart iframe').waitFor({timeout:40000});
 const spyFrame=await page.locator('#tv-chart iframe').elementHandle().then(h=>h.contentFrame());
 if(spyFrame){await spyFrame.locator('canvas').first().waitFor({timeout:40000});console.log('SPY chart canvas loaded');}
 await page.waitForTimeout(10000); await page.screenshot({path:'preview-spy.png',fullPage:true});
 await page.selectOption('#chart-source','ibkr');
 assert.equal(await page.locator('#chart-empty').isVisible(),true);
 assert.match(await page.locator('#empty-reason').innerText(),/брокера/);
 assert.equal(await page.locator('details').getAttribute('open'),null);
 await page.selectOption('#chart-source','tv');
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'preview-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.equal(errors.length,0,errors.join(';'));
 assert.equal((await page.request.post('http://127.0.0.1:8787/api/state')).status(),405);
 console.log('PASS: TradingView NNE/SPY, IBKR empty state, mobile, no JS errors');
}finally{await browser.close();}
