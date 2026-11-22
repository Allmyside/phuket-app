const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({serviceWorkers:'block'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8001')?r.continue():r.abort());
 await page.goto('http://127.0.0.1:8001');await page.waitForFunction(()=>document.querySelectorAll('#output .h-item').length===14);
 const change=(id,value)=>page.evaluate(({id,value})=>{document.getElementById(id).checked=value;updateExchangeFilters();},{id,value});
 assert.equal(await page.locator('#eur_spb_2').inputValue(),'92.39');
 assert(!/84,60 ₽\/€|-5.33%/.test(await page.locator('#output').textContent()));
 await change('toggle_bank_kamkom',false);await change('toggle_exch_vp',false);
 assert(!/Камкомбанк|Value Plus/.test(await page.locator('#output').textContent()));
 assert.equal(await page.locator('#usd_spb_2').evaluate(e=>getComputedStyle(e.closest('.field')).opacity),'0.4');
 assert(await page.locator('#output .h-item').count()>0);
 for(const card of await page.locator('#output .card').all()){const rows=await card.locator('.h-item').evaluateAll(es=>es.map(e=>({n:Number(e.dataset.thb),text:e.textContent})));for(const row of rows){assert(row.n<=rows[0].n+1e-6);if(row.n<rows[0].n-.005)assert.match(row.text,/потеря.*₽/);}}
 await page.reload();await page.waitForFunction(()=>document.querySelector('#toggle_bank_kamkom').checked===false);assert(!await page.locator('#toggle_exch_vp').isChecked());
 await page.evaluate(()=>{for(const key of Object.keys(exchangeFilters))document.getElementById('toggle_'+key).checked=false;updateExchangeFilters();});
 assert.match(await page.locator('#output').textContent(),/Выберите хотя бы один/);
 await change('toggle_exch_sbp_ms',true);assert.equal(await page.locator('#output .card').count(),1);assert.equal(await page.locator('#output .h-item').count(),1);
 await page.evaluate(()=>{mergeConfirmedRates({schema:1,revision:2,quotes:{eur_spb_2:{value:84.6,source:'https://www.kamkombank.ru/',observedAt:Date.now()}}});applyConfirmedRates();});assert.equal(await page.locator('#eur_spb_2').inputValue(),'92.39');
 assert.equal(await page.evaluate(()=>validRateValue('eur_spb_2',84.6)),false);
 assert.deepEqual(errors,[]);console.log('PASS: all enabled, EUR validation, Kamkom/VP disabled, ranking, persistence, all off, SBP only, no browser errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
