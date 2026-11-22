import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseSource,collect,discoverTariff} from './update-rates.mjs';
const elements=new Map();
const element=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',innerText:'',textContent:'',insertAdjacentHTML(position,html){this.innerHTML=html+this.innerHTML;}});return elements.get(id);};
const html=fs.readFileSync('index.html','utf8');
for(const m of html.matchAll(/<input\b[^>]*>/g)){const id=m[0].match(/id="([^"]+)"/)?.[1];if(id)element(id).value=m[0].match(/value="([^"]*)"/)?.[1]||'';}
const ctx=vm.createContext({document:{getElementById:element},Date,URL,fmt:n=>n.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}),escapeHtml:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;')});
vm.runInContext(fs.readFileSync('js/rate-parsers.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('js/budget-exchange.js','utf8'),ctx);
const data=JSON.parse(fs.readFileSync('data/live-rates.json','utf8'));ctx.mergeConfirmedRates(data);ctx.applyConfirmedRates();element('currency').value='RUB';
const run=amount=>{element('budget').value=String(amount);ctx.render();return element('output').innerHTML;};
const rates=output=>[...output.matchAll(/class="card [^"]*" data-effective="([^"]*)"/g)].map(m=>Number(m[1]));
for(const amount of [0,85000,150000,'',-10,1,20,200]){
 const output=run(amount);
 assert.equal((output.match(/class="card /g)||[]).length,4);
 assert.equal((output.match(/class="h-item /g)||[]).length,14);
 assert(!/NaN|undefined|Infinity/.test(output));
 assert.equal(element('fee_spb_3').value,'0.00');
 const r=rates(output);assert.deepEqual(r,[...r].sort((a,b)=>a-b));
 if(Number(amount)<=0){
  assert.equal((output.match(/0,00 ฿ <span class="usd-eq">\(0,00 \$\)/g)||[]).length,4);
  assert.equal(element('usd_spb_1').value,'85.40');assert.equal(element('eur_spb_1').value,'94.90');assert.equal(element('cny_spb_1').value,'12.86');
 }
 if(amount===85000)assert.equal(element('usd_spb_1').value,'85.40');
 if(amount===150000){assert.equal(element('usd_spb_1').value,'85.30');assert.equal(element('eur_spb_1').value,'94.80');assert.equal(element('cny_spb_1').value,'12.84');}
 console.log(`budget=${JSON.stringify(amount)}: 4 cards, 14 routes; best RUB/THB=${r[0]}`);
}
for(const [id,threshold,retail,bulk]of [['usd_spb_1',85320,85.4,85.3],['eur_spb_1',94820,94.9,94.8],['cny_spb_1',128420,12.86,12.84]]){
 run(threshold-.01);assert.equal(Number(element(id).value),retail);run(threshold);assert.equal(Number(element(id).value),bulk);
}
// Every bank is eligible for Money Shop/Kata; selection includes that bank's fee.
let output=run(85000);assert.match(output,/Банк Финам ➔ Money Shop Kata/);assert.match(output,/Банк Финам ➔ Обменники у пляжа Ката/);
const expected=(85000-200)/(83.62+1.5)*33.78;
assert([...output.matchAll(/data-thb="([^"]+)"/g)].some(m=>Math.abs(Number(m[1])-expected)<1e-8));
const before=element('usd_spb_2').value;
ctx.mergeConfirmedRates({schema:1,revision:2,quotes:{usd_spb_2:{value:81.94,buy:83.61,source:'https://www.kamkombank.ru/individuals/currency-exchange/',observedAt:Date.now()}}});ctx.applyConfirmedRates();assert.equal(element('usd_spb_2').value,before);
ctx.mergeConfirmedRates({schema:1,revision:2,quotes:{usd_spb_2:{value:81.94,source:'https://kovalut.ru/',observedAt:Date.now()}}});ctx.applyConfirmedRates();assert.equal(element('usd_spb_2').value,before);
ctx.rememberRateEdits({target:{id:'fee_spb_2',value:'0'}});element('fee_spb_2').value='0';run(85000);assert.match(element('output').innerHTML,/сбор кассы: 0,00 ₽/);
ctx.rememberRateEdits({target:{id:'usd_spb_1',value:'90'}});element('usd_spb_1').value='90';run(150000);ctx.applyConfirmedRates();assert.equal(element('usd_spb_1').value,'90');
ctx.ratesStatus();assert(!/https?:|usd_spb|forex_usd/.test(element('status').textContent));assert(element('status').textContent.length<300);
for(const currency of ['USD','EUR','CNY']){element('currency').value=currency;assert.match(run(0),/0,00 ฿ <span class="usd-eq">\(0,00 \$\)/);assert(!/NaN|undefined/.test(run(1000)));}
const table=(buy=82.8,sell=84.6,city='Санкт-Петербург')=>`<table data-city="${city}"><tr><th>Валюта</th><th>Покупка</th><th>Продажа</th></tr><tr><td>USD</td><td>${buy}</td><td>${sell}</td></tr><tr><td>EUR</td><td>91.50</td><td>94.20</td></tr><tr><td>CNY</td><td>12.30</td><td>13.20</td></tr></table>`;
for(const [code,min,max] of [['usd',65,130],['eur',90.3445*.98,150],['cny',9,20]]){
 const id=code+'_spb_2';
 for(const value of [min,max])assert(ctx.validRateValue(id,value));
 for(const value of [min-.01,max+.01,NaN,Infinity])assert(!ctx.validRateValue(id,value));
 const original=element(id).value;
 ctx.mergeConfirmedRates({schema:1,revision:2,quotes:{[id]:{value:max+1,source:'https://www.kamkombank.ru/',observedAt:Date.now()}}});
 ctx.applyConfirmedRates();assert.equal(element(id).value,original);
 assert(!ctx.trustedRate(id,{value:min,source:'https://www.kamkombank.ru/',observedAt:Date.now(),tiers:[{min:1000,rate:max+1}]}));
 assert(!ctx.trustedRate(id,{value:min,source:'https://www.kamkombank.ru/',observedAt:Date.now(),tiers:[null]}));
}
assert.throws(()=>parseSource('kamkom',table().replace('13.20','84.80')),/range/);
assert.throws(()=>parseSource('kamkomCny','Курс CNY юаня в Санкт-Петербурге КАМКОМБАНК Покупка 83.00 Продажа 84.80 Подробнее'));
assert.throws(()=>parseSource('kamkomEur','Курс USD в Санкт-Петербурге КАМКОМБАНК Покупка 93.00 Продажа 94.80 Подробнее'),/heading/);
assert.equal(parseSource('kamkomCny','Курс CNY юаня в Санкт-Петербурге КАМКОМБАНК Покупка 12.50 Продажа 12.90 Подробнее').cny_spb_2.value,12.9);
assert.equal(parseSource('kamkomEur','Курс EUR евро в Санкт-Петербурге КАМКОМБАНК Покупка 93.00 Продажа 94.80 Подробнее').eur_spb_2.value,94.8);
assert.equal(parseSource('finam',table()).usd_spb_3.value,84.6);
assert.equal(parseSource('kamkom',table()).eur_spb_2.value,94.2);
assert.throws(()=>parseSource('kamkom',table(83.61,81.94)),/spread/);
assert.throws(()=>parseSource('kamkom',table(82.8,84.6,'Москва')+'Санкт-Петербург'),/city/);
assert.throws(()=>parseSource('kovalut','USD 83.61 81.94'));
const reversed=table().replace('<th>Покупка</th><th>Продажа</th>','<th>Я покупаю</th><th>Я продаю</th>').replace('<td>82.8</td><td>84.6</td>','<td>84.6</td><td>82.8</td>').replace('<td>91.50</td><td>94.20</td>','<td>94.20</td><td>91.50</td>').replace('<td>12.30</td><td>13.20</td>','<td>13.20</td><td>12.30</td>');assert.equal(parseSource('kamkom',reversed).usd_spb_2.value,84.6);
const lig=`Последнее изменение курса 15 ноября 08:05 USD образца 2009 покупка продажа
<table><tr><td>от 1</td><td>83.00 85.20 92.00 94.50 1.00 1.10</td></tr><tr><td>от 1000</td><td>83.10 85.10 92.10 94.40 1.00 1.10</td></tr><tr><td>от 10000</td><td>83.10 85.10 92.10 94.40 1.00 1.10</td></tr><tr><td>Китайский юань CNY</td><td>12.50 12.86 6.50 6.70</td></tr><tr><td>Китайский юань от 10000 CNY</td><td>12.50 12.84 6.50 6.70</td></tr><tr><td>USD 2006</td><td>83.00 84.60</td></tr></table>Комиссия за операцию - 20 рублей`;
const l=parseSource('ligovka',lig);assert.equal(l.usd_spb_1.tiers.length,3);assert.equal(l.fee_spb_1.value,20);assert.equal(l.usd_spb_1.oldSeriesSell,84.6);
const vp=parseSource('valueplus','Buy Rate Sell Rate\nUSD | 100 - 50 | 33.78 | 33.92\nEUR | 500 - 100 | 37.30 | 37.50\nCNY | 100 - 50 | 5.01 | 5.05');assert.equal(vp.usd_vp.value,33.78);
assert.equal(parseSource('moneyshopFallback','Money Shop Phuket 33 513 ฿33,513 ฿/$21 ч назад').usd_ms.value,33.513);
assert.equal(parseSource('moneyshopEur','Money Shop Phuket 37 402 ฿37,402 ฿/€6 мин назад').eur_ms.value,37.402);
assert(Math.abs(parseSource('moneyshopSbp','Money Shop Phuket 36 810 ฿0,3681 ฿/₽').sbp_ms.value-1/.3681)<1e-10);
assert.equal(parseSource('kamkomTerms','4.1. Покупка, продажа, обмен 200 руб. за одну операцию 4.2. Иное 4.6. Размен наличной иностранной валюты 1,90 руб. за 1 единицу, не менее 200 руб. 4.7. Иное').fee_spb_2.oldToNewExchange.rubPerUnit,1.9);
const finTerms='7.5 Комиссия за прием наличной иностранной валюты при покупке '+[5000,1500,1500,5000].map((v,i)=>`7.5.${i+1} Прием банкнот ${v} руб. за банкноту`).join(' ');
assert.equal(parseSource('finamTerms',finTerms).fee_spb_3.value,0);
// Failed sources must not fabricate refresh timestamps or modify the snapshot.
const saved=fs.readFileSync('data/live-rates.json','utf8');
assert.equal(discoverTariff('kamkomTerms','<a href="/old.pdf">с 01.05.2026</a><a href="/new.pdf">с 09.09.2026</a>','https://www.kamkombank.ru/'), 'https://www.kamkombank.ru/new.pdf');
const report=await collect({checkOnly:true,writeReport:false,fetcher:async()=>{throw Error('intentional offline test');}});
assert.equal(report.fresh,0);assert.equal(fs.readFileSync('data/live-rates.json','utf8'),saved);
console.log('PASS: zero/empty budgets, 85k/150k, all routes, sorting, commissions, tiers, manual overrides, legacy rejection, parser direction/city guards, offline preservation.');
