const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({serviceWorkers:'block'});let mode='offline',requests=0;
 await page.route('**/*',async route=>{
  const url=decodeURIComponent(route.request().url());if(url.startsWith('http://127.0.0.1:8002/'))return route.continue();
  if(mode!=='mock')return route.abort();requests++;
  await new Promise(r=>setTimeout(r,100));
  if(/open.er-api|cbr-xml-daily/.test(url))return route.fulfill({json:{rates:{RUB:86,THB:34},time_last_update_utc:'test response'}});
  let body='';
  if(url.includes('ligovka.ru'))body='USD образца 2009г. и позднее\nот 1 | 83.00 | 86.22 | 92.00 | 95.50 | 1.00 | 1.10\nот 1000 | 83.10 | 86.12 | 92.10 | 95.40 | 1.00 | 1.10\nКитайский юань CNY | 12.50 | 12.86 | 6.50 | 6.70';
  else if(url.includes('kamkombank.ru'))body='Ваш город: Санкт-Петербург Покупка Продажа USD 82.00 83.62 EUR 98.00 98.89 CNY 12.60 12.88';
  else if(url.includes('finambank.ru'))body='Ваш город: Санкт-Петербург Покупка Продажа USD 82.80 84.60 EUR 91.50 94.20 CNY 12.30 13.20';
  else if(url.includes('valueplusexchange'))body='Buy Rate Sell Rate\nUSD | 100 - 50 | 33.80 | 34.00\nEUR | 500 - 100 | 37.30 | 37.50\nCNY | 100 - 50 | 5.01 | 5.05';
  else if(url.includes('exfm.app'))body='1 THB = 2.723 RUB';
  else if(url.includes('/kata/'))body='EXFM 33,29 ฿/$';
  else if(url.includes('/eur-thb/'))body='Money Shop Phuket 37,402 ฿/€';
  else if(url.includes('/bang-tao/'))body='Money Shop Phuket 33,513 ฿/$';
  else if(url.includes('phuketkit'))body='Money Shop Phuket 0,3681 ฿/₽';
  return route.fulfill({status:200,contentType:'text/plain',body});
 });
 await page.goto('http://127.0.0.1:8002/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelectorAll('#output .card').length===4);
 await page.evaluate(()=>{document.getElementById('authGateOverlay').style.display='none';document.getElementById('mainAppContainer').classList.add('authenticated');document.querySelectorAll('.tab-content').forEach(e=>e.classList.toggle('active',e.id==='tab-exchange'));});
 const fields=page.locator('#spbRatesBox input,#phuketRatesBox input');assert.equal(await fields.count(),26);assert(await fields.evaluateAll(es=>es.every(e=>e.value!==''&&Number.isFinite(+e.value))));
 await page.locator('#budget').fill('350000');assert.equal(await page.locator('#output .card').count(),4);
 await page.locator('#currency').selectOption('USD');await page.locator('#budget').fill('4000');assert.equal(await page.locator('#output .card').count(),5);assert.equal(await page.locator('#usd_spb_1').inputValue(),'85.30');
 const out=(await page.locator('#output').innerText()).replaceAll('\u00a0',' ');assert.match(out,/340 680,00 ₽/);assert.match(out,/135 120,00 ฿/);assert.match(out,/Банк Финам/);assert.match(out,/Онлайн перевод/);
 for(const cur of ['EUR','CNY']){await page.locator('#currency').selectOption(cur);assert.equal(await page.locator('#output .card').count(),5);}
 await page.locator('#currency').selectOption('RUB');await page.locator('#budget').fill('0');
 mode='mock';await page.locator('#syncBtn').click();assert(await page.locator('#syncBtn').isDisabled());await page.waitForFunction(()=>!document.getElementById('syncBtn').disabled);
 assert(requests>=8);assert.match(await page.locator('#status').innerText(),/Обновлено онлайн:.*\d{2}:\d{2}:\d{2}.*8 из 8/);
 assert.equal(await page.locator('#usd_spb_1').inputValue(),'86.22');assert.equal(await page.locator('#forex_usd_rub').inputValue(),'86.00');
 mode='offline';await page.locator('#syncBtn').click();await page.waitForFunction(()=>!document.getElementById('syncBtn').disabled);assert.match(await page.locator('#status').innerText(),/сеть недоступна.*0 из 8/);assert.equal(await page.locator('#usd_spb_1').inputValue(),'86.22');
 console.log('PASS: 26 numeric inputs; 350000 RUB/4000 USD/EUR/CNY; Kamkom 4000 USD costs 340680 RUB including blue premium; wholesale 85.30; mocked proxy responses 8/8, progress/disable/timestamp/new rates; offline 0/8 retains values.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
