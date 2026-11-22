const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const near=(a,b,label)=>assert(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
(async()=>{
 const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(error,body)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(body);});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({serviceWorkers:'block'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let mode='offline';
  await page.route('**/*',route=>{
   const url=decodeURIComponent(route.request().url());
   if(url.startsWith('http://127.0.0.1:'))return route.continue();
   if(mode==='live'&&/r.jina.ai|allorigins|corsproxy|codetabs|open.er-api|cbr-xml-daily/.test(url))return route.continue();
   if(mode!=='mock')return route.abort();
   let body='';
   if(/open.er-api|cbr-xml-daily/.test(url))return route.fulfill({json:{rates:{RUB:86,THB:34},time_last_update_utc:'test fixture'}});
   if(url.includes('kovalut.ru'))body=`Курсы ${url.includes('/eur/')?'EUR евро':'CNY юаня'} в Санкт-Петербурге КАМКОМБАНК Покупка ${url.includes('/eur/')?'93.00':'12.50'} Продажа ${url.includes('/eur/')?'94.70':'12.91'} Подробнее`;
   // Reproduce the dollar-in-yuan bug in the official bank response.
   else if(url.includes('kamkombank.ru'))body='<table data-city="Санкт-Петербург"><tr><th>Валюта</th><th>Покупка</th><th>Продажа</th></tr><tr><td>USD</td><td>82.00</td><td>83.62</td></tr><tr><td>EUR</td><td>93.00</td><td>94.80</td></tr><tr><td>CNY</td><td>12.50</td><td>84.80</td></tr></table>';
   else if(url.includes('valueplusexchange'))body='Buy Rate Sell Rate\nUSD | 100 - 50 | 33.73 | 34.00\nEUR | 500 - 100 | 37.30 | 37.50\nCNY | 100 - 50 | 5.01 | 5.05';
   else return route.abort();
   return route.fulfill({contentType:'text/html',body});
  });
  const expose=()=>page.evaluate(()=>{document.getElementById('authGateOverlay').style.display='none';const app=document.getElementById('mainAppContainer');app.style.display='block';app.classList.add('authenticated');document.querySelectorAll('.tab-content').forEach(e=>e.classList.toggle('active',e.id==='tab-exchange'));});
  const ready=async()=>{await page.waitForFunction(()=>document.querySelectorAll('#output .card').length>=4);await expose();};
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await ready();
  // Old quote AND manual-input caches must not restore broken values.
  await page.evaluate(()=>{
   for(const version of [2,9]){
    localStorage.setItem(`confirmed-live-rates-v${version}`,JSON.stringify({schema:1,revision:2,quotes:{cny_spb_2:{value:84.8,source:'https://www.kamkombank.ru/',observedAt:Date.now()},fee_spb_3:{value:.03,source:'https://www.finambank.ru/',observedAt:Date.now()}}}));
    localStorage.setItem(`rate-manual-overrides-v${version}`,JSON.stringify({cny_spb_2:'84.8',fee_spb_3:'.03'}));
   }
  });
  await page.reload();await ready();
  assert.equal(await page.locator('#cny_spb_2').inputValue(),'12.88');
  assert.equal(await page.locator('#eur_spb_2').inputValue(),'94.90');
  assert.equal(await page.locator('#fee_spb_3').inputValue(),'0.00');
  assert(await page.locator('#blueUsdOnly').isChecked());
  const reports=[];
  for(const [currency,amount] of [['USD',400],['USD',4000],['RUB',350000],['RUB',400],['EUR',400],['CNY',400]]){
   await page.locator('#currency').selectOption(currency);await page.locator('#budget').fill(String(amount));
   const report=await page.evaluate(({currency,amount})=>({currency,amount,cny:document.getElementById('cny_spb_2').value,banks:[1,2,3].map(i=>bankPurchase('usd',i,amount,currency==='USD'?'USD':'RUB')),cards:[...document.querySelectorAll('#output .card:not(.owned-cash)')].map(c=>({rows:[...c.querySelectorAll('.h-item')].map(r=>({name:r.querySelector('.h-name').textContent,thb:Number(r.dataset.thb),spend:Number(r.dataset.spend),comparison:r.querySelector('.route-loss,.profit')?.textContent}))}))}),{currency,amount});
   for(const card of report.cards){
    const leader=card.rows[0];
    for(const row of card.rows){assert(row.comparison);assert(row.thb<=leader.thb+1e-7);if(row.thb<leader.thb-.005)assert.match(row.comparison,/฿.*₽.*1-го места/);}
   }
   if(currency==='USD'){
    const lig=amount*(amount>=1000?85.3:85.4)+20,kam=amount*83.62+Math.max(200,amount*1.5)+200;
    near(report.banks[0].spend,lig,'Ligovka cost');near(report.banks[1].spend,kam,'Kamkom full cost');
    const rows=report.cards.flatMap(c=>c.rows).filter(r=>/➔ Value Plus/.test(r.name));
    const usd=rows.filter(r=>r.thb>0).slice(0,3);
    assert(new Set(usd.map(r=>r.thb.toFixed(6))).size>1,'Bank totals must differ');
    assert.equal(await page.locator('.owned-cash .hierarchy-list .h-item').count(),3);
    assert.equal(await page.locator('.owned-cash .route-loss').count(),2);
   }
   reports.push(report);
  }
  // Exact requested example, with explicit test-only Finam premium to make Ligovka leader.
  await page.locator('#blue_spb_3').fill('1');await page.locator('#usd_vp').fill('33.73');
  await page.locator('#currency').selectOption('USD');await page.locator('#budget').fill('400');
  const exact=await page.evaluate(()=>[...document.querySelectorAll('#output .card:not(.owned-cash)')].find(c=>c.textContent.includes('Через наличные Доллары')).querySelector('.h-item').dataset);
  near(Number(exact.spend),34180,'common RUB budget');near(Number(exact.thb),13492,'leader THB');
  const costs=await page.evaluate(()=>[bankPurchase('usd',1,400,'USD'),bankPurchase('usd',2,400,'USD')]);
  near(costs[1].spend-costs[0].spend,68,'target cost difference');
  await page.locator('#blueUsdOnly').uncheck();
  near(await page.evaluate(()=>bankPurchase('usd',2,400,'USD').spend),33648,'blue toggle off');
  await page.locator('#blueUsdOnly').check();
  near(await page.evaluate(()=>bankPurchase('usd',2,100,'USD').spend),8762,'minimum fee');
  for(const rub of [0,199,399,400,8762,11549.3333333333,350000]){
   const p=await page.evaluate(rub=>bankPurchase('usd',2,rub),rub);
   const expected=Math.max(0,Math.min((rub-400)/83.62,(rub-200)/85.12));near(p.bought,expected,'inverse minimum fee');assert(p.spend<=rub+1e-7);
  }
  await page.locator('#cny_spb_2').fill('84.80');assert.equal(await page.locator('#cny_spb_2').evaluate(e=>e.checkValidity()),false);
  assert.equal(await page.evaluate(()=>Number.isNaN(bankPurchase('cny',2,350000).bought)),true);
  // Clean reload removes invalid v10 manual entries and keeps valid ones.
  await page.reload();await ready();assert.equal(await page.locator('#cny_spb_2').inputValue(),'12.88');assert.equal(await page.locator('#blue_spb_3').inputValue(),'1');
  mode='mock';await page.locator('#syncBtn').click();await page.waitForFunction(()=>!document.getElementById('syncBtn').disabled);
  assert.equal(await page.locator('#cny_spb_2').inputValue(),'12.91');assert.equal(await page.locator('#eur_spb_2').inputValue(),'94.70');
  assert.equal(await page.locator('#blue_spb_2').inputValue(),'1.50');assert.equal(await page.locator('#fee_spb_2').inputValue(),'200.00');assert.equal(await page.locator('#blue_spb_3').inputValue(),'1');
  mode='offline';await page.locator('#syncBtn').click();await page.waitForFunction(()=>!document.getElementById('syncBtn').disabled);
  assert.equal(await page.locator('#cny_spb_2').inputValue(),'12.91');
  await page.evaluate(()=>{
   const cached=JSON.parse(localStorage.getItem('confirmed-live-rates-v10'));
   cached.quotes.cny_spb_2={...cached.quotes.cny_spb_2,value:84.8,observedAt:Date.now()};
   cached.quotes.eur_spb_2={...cached.quotes.eur_spb_2,tiers:[{min:1000,rate:13}]};
   localStorage.setItem('confirmed-live-rates-v10',JSON.stringify(cached));
  });
  await page.reload();await ready();assert.equal(await page.locator('#cny_spb_2').inputValue(),'12.88');assert.equal(await page.locator('#eur_spb_2').inputValue(),'94.90');
  await page.evaluate(()=>localStorage.clear());await page.reload();await ready();
  assert.equal(await page.locator('#blue_spb_3').inputValue(),'0.00');assert.equal(await page.locator('#cny_spb_2').inputValue(),'12.88');
  await page.locator('#currency').selectOption('USD');await page.locator('#budget').fill('400');
  fs.mkdirSync('artifacts',{recursive:true});
  for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:1100});
   assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#tab-exchange .box input:not([type="hidden"])')].filter(e=>{const r=e.getBoundingClientRect(),b=e.closest('.box').getBoundingClientRect();return r.left<b.left-.5||r.right>b.right+.5;}).map(e=>e.id)),[],`overflow at ${width}`);
   await page.screenshot({path:`artifacts/blue-usd-${width}.png`,fullPage:true});
  }
  if(process.argv.includes('--live')){
   mode='live';await page.locator('#syncBtn').click();await page.waitForFunction(()=>!document.getElementById('syncBtn').disabled,{},{timeout:45000});
   reports.push({liveStatus:await page.locator('#status').innerText()});
   const cny=Number(await page.locator('#cny_spb_2').inputValue());assert(cny>=9&&cny<=20);assert.equal(await page.locator('#blue_spb_2').inputValue(),'1.50');
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync('artifacts/blue-usd-checks.json',JSON.stringify(reports,null,2));
  console.log('PASS: Edge 400/4000 USD, 350000/400 RUB, EUR/CNY; full costs, common budget, losses, minimum fee, toggle, v10 migration, corrupt cache, mocked refresh, offline, localStorage clear, 320/390/768/1440px.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
