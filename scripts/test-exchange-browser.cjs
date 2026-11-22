const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.RATES_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({serviceWorkers:'block'});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:8001/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#output .card').length===4);
  await page.evaluate(()=>{
   document.getElementById('authGateOverlay').style.display='none';
   document.querySelectorAll('.tab-content').forEach(el=>el.classList.toggle('active',el.id==='tab-exchange'));
   document.getElementById('mainAppContainer').style.display='block';
   document.getElementById('mainAppContainer').classList.add('authenticated');
  });
  fs.mkdirSync('artifacts',{recursive:true});
  for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:1100});
   const bad=await page.evaluate(()=>[...document.querySelectorAll('#tab-exchange .box input:not([type=hidden]),#tab-exchange .box select')].filter(el=>{const r=el.getBoundingClientRect(),b=el.closest('.box').getBoundingClientRect();return r.left<b.left||r.right>b.right+.5||r.width<=0;}).map(el=>el.id));
   assert.deepEqual(bad,[],`overflow at ${width}px`);
   assert.equal(await page.locator('#spbRatesBox .grid-3 > .field').count(),18);
   assert.equal(await page.locator('#phuketRatesBox .grid-3 > .field').count(),8);
   assert.equal(await page.locator('#forex_usd_rub').getAttribute('type'),'hidden');
   assert.equal(await page.locator('#sourceDetails').evaluate(el=>el.getBoundingClientRect().height),0);
   await page.screenshot({path:`artifacts/exchange-${width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1100});
  await page.locator('#sourcesToggle').click();await page.waitForTimeout(350);
  assert.equal(await page.locator('#sourcesToggle').getAttribute('aria-expanded'),'true');
  assert(await page.locator('#sourceDetails').evaluate(el=>el.getBoundingClientRect().height)>100);
  await page.locator('#sourcesToggle').click();await page.waitForTimeout(350);
  const results=[];
  for(const amount of ['0','85000','150000','']){
   await page.locator('#budget').fill(amount);
   const result=await page.evaluate(()=>({heads:[...document.querySelectorAll('.result-amount')].map(e=>e.textContent),rates:[...document.querySelectorAll('#output .card')].map(e=>Number(e.dataset.effective)),lig:['usd','eur','cny'].map(c=>document.getElementById(c+'_spb_1').value),rows:document.querySelectorAll('#output .h-item').length}));
   assert.equal(result.heads.length,4);assert.equal(result.rows,14);assert.deepEqual(result.rates,[...result.rates].sort((a,b)=>a-b));
   if(!Number(amount)){assert(result.heads.every(t=>t==='0,00 ฿ (0,00 $)'));assert.deepEqual(result.lig,['85.40','94.90','12.86']);}
   results.push({amount,...result});
  }
  // Actual input events must preserve manual edits, including a zero commission.
  await page.locator('#fee_spb_2').fill('0');await page.locator('#budget').fill('85000');
  assert.match(await page.locator('#output').innerText(),/сбор кассы: 0,00 ₽/);
  const status=await page.locator('#status').innerText();assert(!/https?:|usd_spb|forex_usd/.test(status));
  fs.writeFileSync('artifacts/exchange-checks.json',JSON.stringify(results,null,2));
  console.log('PASS: Chromium/Edge; 320/390/768/1440px, no overflowing inputs; details toggle; budgets 0/85000/150000/empty, 4 cards / 14 rows.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
