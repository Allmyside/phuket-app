const targets = {
 kamkomEur:'https://kovalut.ru/kurs/sankt-peterburg/eur/', kamkomCny:'https://kovalut.ru/kurs/sankt-peterburg/cny/',
 bankiEur:'https://www-1.banki.ru/products/currency/bank/kamkombank/eur/sankt-peterburg/?buttonId=1&currencyId=978',
 bankiCny:'https://www-1.banki.ru/products/currency/cash/cny/sankt-peterburg/',
 ligovka:'https://ligovka.ru/', exfm:'https://exfm.app/',
 moneyshopFallback:'https://phuketkit.com/exchange/bang-tao/', moneyshop:'https://moneyshopphuket.com/', valueplus:'https://www.valueplusexchange.com/',
 kamkom:'https://www.kamkombank.ru/individuals/currency-exchange/', finam:'https://www.finambank.ru/person_currency/',
 kamkomTerms:'https://www.kamkombank.ru/file/filemanag/10ecae5f4913f3bf8187979975de4ed7.pdf',
 finamTerms:'https://cdn-lpbr01.finam.ru/lpbr-static/Tarify_RKO_FL_a2507d2b94.pdf',
 moneyshopEur:'https://phuketkit.com/exchange/eur-thb/', moneyshopSbp:'https://phuketkit.com/exchange/', kata:'https://phuketkit.com/exchange/kata/',
 cbr:'https://www.cbr.ru/scripts/XML_daily.asp'
};
const text = html => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
const decimals = s => (s.match(/\d+[.,]\d+/g)||[]).map(x=>Number(x.replace(',','.')));
// Shared by parsers, cache ingestion and calculator/manual input validation.
const eurValidation={usd:82.1516,eur:90.3445};
function validRateValue(id,value) {
 if(/^eur_spb_/.test(id)&&value<Math.max(eurValidation.usd*1.05,eurValidation.eur*.98))return false;
 const range={usd:[65,130],eur:[75,150],cny:[9,20]}[id.match(/^(usd|eur|cny)_spb_/)?.[1]];
 if(!Number.isFinite(value))return false;
 if(range)return value>=range[0]&&value<=range[1];
 if(/^(fee|blue|blue_min)_spb_/.test(id))return value>=0;
 return value>0;
}
function validRateQuote(id,q) {
 return validRateValue(id,q?.value)&&(!Array.isArray(q.tiers)?q.tiers==null:q.tiers.every(t=>t&&validRateValue(id,t.rate)&&Number.isFinite(t.min)&&t.min>=0&&(t.buy==null||(Number.isFinite(t.buy)&&t.buy>0&&t.buy<=t.rate))));
}
function parseSourceStrict(name, html) {
 const quotes = {};
 const put = (id,value,extra={}) => {
  if (!validRateQuote(id,{value,...extra})) throw Error('Invalid quote range '+id);
  quotes[id]={value,source:targets[name],observedAt:Date.now(),sourceUpdated:'Время котировки не опубликовано',verification:'official',...extra};
 };
 if (name==='ligovka') {
  const plain=text(html);
  const updated=plain.match(/Последнее изменение курса\s+(\d+\s+[а-я]+\s+\d{1,2}:\d{2})/i)?.[1];
  if (!updated || !/образца 2009/i.test(plain) || !/покупка\s+продажа/i.test(plain)) throw Error('Ligovka headings changed');
  const rows = /<tr/i.test(html) ? [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>text(m[1])) : html.split('\n').map(line => line.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\|/g,' ').trim());
  const retail=rows.find(r=>/^от\s+1\s/.test(r));
  const bulk=rows.find(r=>/^от\s+1000\s/.test(r));
  const r=decimals(retail||''), w=decimals(bulk||'');
  if(r.length!==6 || w.length!==6) throw Error('Ligovka USD/EUR table changed');
  checkSpread(r[0],r[1]);checkSpread(r[2],r[3]);checkSpread(w[0],w[1]);checkSpread(w[2],w[3]);
  put('usd_spb_1',r[1],{buy:r[0],wholesale:w[1],threshold:1000,sourceUpdated:updated});
  put('eur_spb_1',r[3],{buy:r[2],wholesale:w[3],threshold:1000,sourceUpdated:updated});
  const c=rows.filter(r=>/Китайский юань/.test(r)&&/CNY/.test(r));
  const cr=decimals(c.find(r=>!/от\s+10000/.test(r))||'');
  const cw=decimals(c.find(r=>/от\s+10000/.test(r))||'');
  if(cr.length!==4||cw.length!==4) throw Error('Ligovka CNY table changed');
  checkSpread(cr[0],cr[1]);checkSpread(cw[0],cw[1]);
  put('cny_spb_1',cr[1],{buy:cr[0],wholesale:cw[1],threshold:10000,sourceUpdated:updated});
  const high=decimals(rows.find(r=>/^от\s+10000\s/.test(r))||'');
  if(high.length!==6)throw Error('Ligovka 10000 tier absent');
  checkSpread(high[0],high[1]);checkSpread(high[2],high[3]);
  quotes.usd_spb_1.highTier={min:10000,unit:'receive',currency:'USD',rate:high[1],buy:high[0]};
  quotes.eur_spb_1.highTier={min:10000,unit:'receive',currency:'EUR',rate:high[3],buy:high[2]};
  const fee=plain.match(/(?:комиссия за операцию|сбор за валютно-обменную операцию)\s*[—–-]?\s*(\d+)\s*(?:руб|₽)/i);
  if(!fee)throw Error('Ligovka fee missing');
  const oldFee=plain.match(/За при[её]м купюры[^]*?2006[^]*?комиссия\s+(\d+)\s+руб/i)?.[1];
  put('fee_spb_1',Number(fee[1]),{oldSeriesAcceptanceFee:oldFee?Number(oldFee):null,note:'Сбор за операцию. Приём старых $100 до 2006 г. — отдельная операция.'});
 } else if(name==='exfm') {
  const matches=[...text(html).matchAll(/1\s+THB\s*=\s*(\d+[.,]\d+)\s+RUB/g)];
  const values=[...new Set(matches.map(m=>Number(m[1].replace(',','.'))))];
  if(values.length!==1) throw Error('EXFM: unambiguous displayed RUB/THB rate missing; dynamic API not verified');
  put('sbp_fm',values[0],{precision:'Displayed RUB/THB rate; amount-specific API not verified'});
 } else if(name==='kamkom'||name==='finam') {
  // A city in the footer does not prove that the displayed rate applies to SPb.
  const scoped=html.match(/<table\b[^>]*data-city=["']Санкт-Петербург["'][^>]*>[\s\S]*?<\/table>/i)?.[0];
  const selected=html.match(/<option\b[^>]*selected[^>]*>\s*Санкт-Петербург\s*<\/option>/i);
  if(!scoped&&!selected)throw Error('Saint Petersburg selected city not verified');
  const tables=scoped?[scoped]:[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map(m=>m[0]);
  const candidates=[];
  for(const table of tables){
   const rows=[...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(c=>text(c[1])));
   const header=rows.find(c=>c.some(v=>/^(Покупка|Покупаем|Я продаю)$/i.test(v))&&c.some(v=>/^(Продажа|Продаем|Я покупаю)$/i.test(v)));
   if(!header)continue;
   const bi=header.findIndex(v=>/^(Покупка|Покупаем|Я продаю)$/i.test(v)),si=header.findIndex(v=>/^(Продажа|Продаем|Я покупаю)$/i.test(v));
   const values={};
   for(const code of ['USD','EUR','CNY']){
    const row=rows.find(c=>new RegExp('\\b'+code+'\\b').test(c.join(' '))&&c!==header);if(!row)continue;
    const buy=Number(row[bi]?.replace(',','.')),sell=Number(row[si]?.replace(',','.'));checkSpread(buy,sell);values[code]={buy,sell};
   }
   if(Object.keys(values).length)candidates.push(values);
  }
  if(candidates.length!==1||Object.keys(candidates[0]).length!==3)throw Error('Complete labeled USD/EUR/CNY table missing or ambiguous');
  for(const [code,p]of Object.entries(candidates[0]))put(`${code.toLowerCase()}_spb_${name==='kamkom'?2:3}`,p.sell,{buy:p.buy,city:'Санкт-Петербург',tiers:[{min:0,rate:p.sell,buy:p.buy,unit:'receive',currency:code}],note:'Продажа банком клиенту; серию купюр подтвердите в кассе.'});
  if(name==='kamkom'){const fee=text(html).match(/Комиссия за обмен валюты\s*[—–-]?\s*(\d+)\s*₽/i);if(fee)put('fee_spb_2',Number(fee[1]));}
 } else if(name==='kamkomTerms') {
  const plain=text(html);
  const section=plain.match(/4\.1\.?\s+Покупка, продажа,[^]*?(?=4\.2)/)?.[0];
  const fee=section?.match(/(\d+)\s*руб\.? за одну операцию/i);
  const conversion=plain.match(/4\.6\.?\s+Размен наличной[^]*?(?=4\.7)/)?.[0];
  const rate=conversion?.match(/(\d+[.,]\d+)\s*руб\.? за 1/i)?.[1],minimum=conversion?.match(/не менее\s*(\d+)\s*руб/i)?.[1];
  if(!fee||!rate||!minimum)throw Error('Kamkom tariff 4.1/4.6 changed; requires review');
  put('fee_spb_2',Number(fee[1]),{oldToNewExchange:{rubPerUnit:Number(rate.replace(',','.')),minimumRub:Number(minimum)},note:`Сбор ${fee[1]} ₽. Размен старых купюр на новые отдельно: ${rate} ₽ за единицу, минимум ${minimum} ₽. Условия выбора серии при покупке за рубли подтвердите в кассе.`});
 } else if(name==='finamTerms') {
  const section=text(html).match(/7\.5\s+Комиссия за прием наличной иностранной валюты[^]*?(?=РАЗДЕЛ 8|$)/)?.[0];
  if(!section)throw Error('Finam tariff 7.5 changed; requires review');
  const acceptanceFees=[];
  for(let i=1;i<=4;i++){
   const row=section.match(new RegExp('7\\.5\\.'+i+'\\s+([^]*?)(\\d+)\\s*руб\\. за банкноту'));if(!row)throw Error('Finam old-note tariff row missing');
   acceptanceFees.push({condition:row[1].trim(),rubPerBanknote:Number(row[2])});
  }
  put('fee_spb_3',0,{verification:'reviewed',acceptanceFees,note:'П. 7.5: приём банком старых USD и €500. К продаже новых купюр клиенту за рубли эти сборы не относятся; в расчёте 0 ₽. Порог суммы покупки этим пунктом не установлен.'});
 } else if(name==='valueplus') {
  // User-approved network reference; preserve actual displayed branch.
  const heading=html.match(/<h[1-6][^>]*>\s*([^<]*Phuket[^<]*)<\/h[1-6]>/i)?.[1] || html.match(/^##\s+([^\n]*Phuket[^\n]*)$/m)?.[1];
  const buyHeader=text(html).search(/Buy(?:ing)? Rate/i),sellHeader=text(html).search(/Sell(?:ing)? Rate/i);
  if(buyHeader<0||sellHeader<buyHeader)throw Error('Value Plus buying/selling column order changed');
  const rows=/<tr/i.test(html)?[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>text(m[1])):html.split('\n');
  for(const [code,id,denom] of [['USD','usd_vp','100 - 50'],['EUR','eur_vp','500 - 100'],['CNY','cny_vp','100 - 50']]) {
   const matches=rows.filter(r=>r.includes(code)&&r.includes(denom));if(matches.length!==1)throw Error('Ambiguous branch/denomination');const values=decimals(matches[0]);
   if(values.length!==2)throw Error('Value Plus denomination row missing');
   checkSpread(values[0],values[1]);put(id,values[0],{branch:heading||'Филиал не определён (ориентир сети)',denomination:denom,note:`Купюры ${code} ${denom}; ориентир сети, уточните курс филиала`,sourceUpdated:'Дата источника не извлечена'});
  }
  quotes.usd_vp.smallNotes=rows.filter(r=>/USD/.test(r)&&/(?:20\s*[-–]\s*5|5\s*[-–]\s*20|2\s*[-–]\s*1|1\s*[-–]\s*2)/.test(r)).map(r=>({rate:decimals(r)[0],denomination:r.replace(/\d+[.,]\d+/g,'').trim()})).filter(q=>q.rate>0);
  quotes.usd_vp.note+=quotes.usd_vp.smallNotes.length?`; мелкие купюры: ${quotes.usd_vp.smallNotes.map(q=>q.rate.toFixed(2)).join('–')} ฿`:'; курс мелких купюр не извлечён';
 } else if(['moneyshopFallback','moneyshopEur','moneyshopSbp','kata'].includes(name)) {
  const provider=name==='kata'?'EXFM':'Money Shop Phuket';
  const section=text(html).replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').split(provider)[1]?.split(/Уточнить|Открыть|Спросить/)[0];
  const symbol=name==='moneyshopEur'?'€':name==='moneyshopSbp'?'₽':'\\$';
  const match=section?.match(new RegExp('(\\d+[.,]\\d+)\\s*฿\\s*\\/\\s*'+symbol));
  if(!match)throw Error('Phuket Kit provider/currency row absent');
  const value=Number(match[1].replace(',','.'));
  put(({moneyshopFallback:'usd_ms',moneyshopEur:'eur_ms',moneyshopSbp:'sbp_ms',kata:'usd_beach'})[name],name==='moneyshopSbp'?1/value:value,{verification:'web-listing',note:name==='kata'?'EXFM Карон рядом с Катой; не средний курс пляжа.':'Котировка сети Money Shop из Phuket Kit; офис Ката и способ выдачи уточняются.'});
 } else if(name==='moneyshop') {
  // Only accept explicit rows with denomination and buy/sell columns.
  if(!/Покупка|Buying/i.test(html))throw Error('Money Shop buy column missing');
  const rows=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>text(m[1]));
  const row=rows.find(r=>/USD\s*\(100\)/i.test(r));
  const values=decimals(row||'');
  if(values.length===2){checkSpread(values[0],values[1]);put('usd_ms',values[0]);}
  const eur=decimals(rows.find(r=>/\bEUR\b/.test(r))||'');if(eur.length===2){checkSpread(eur[0],eur[1]);put('eur_ms',eur[0]);}
  const sbp=text(html).match(/СБП[^]*?(\d+[.,]\d+)\s*₽\s*(?:за|\/)\s*1?\s*฿/i);
  if(sbp)put('sbp_ms',Number(sbp[1].replace(',','.')));
  if(!Object.keys(quotes).length)throw Error('Money Shop dynamic prices absent; saved rates retained');
 } else if(name==='cbr') {
  const rates={};
  for(const m of html.matchAll(/<Valute\b[^>]*>([\s\S]*?)<\/Valute>/g)) {
   const code=m[1].match(/<CharCode>(.*?)<\/CharCode>/)?.[1];
   rates[code]=Number(m[1].match(/<Value>(.*?)<\/Value>/)?.[1].replace(',','.'))/Number(m[1].match(/<Nominal>(.*?)<\/Nominal>/)?.[1]);
  }
  const sourceUpdated=html.match(/Date="([^"]+)"/)?.[1]||'';
  put('forex_usd_rub',rates.USD,{sourceUpdated});
  put('forex_usd_thb',rates.USD/rates.THB,{sourceUpdated});
 } else throw Error('Source adapter unavailable: live HTML/API and branch must be verified before parsing');
 if(name==='ligovka') {
  for(const [id,currency] of [['usd_spb_1','USD'],['eur_spb_1','EUR'],['cny_spb_1','CNY']]) {const q=quotes[id];q.tiers=[{min:0,unit:'receive',currency,rate:q.value},{min:q.threshold,unit:'receive',currency,rate:q.wholesale}];if(q.highTier){q.tiers.push(q.highTier);delete q.highTier;}} 
  const old=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>text(m[1])).find(r=>/2006/.test(r)&&/USD/.test(r));
  const numbers=decimals(old||'');if(numbers.length!==2)throw Error('Old USD series row missing');checkSpread(numbers[0],numbers[1]);quotes.usd_spb_1.oldSeriesSell=numbers[1];
 }
 if(name==='exfm') {quotes.sbp_fm.tiers=[{min:0,unit:'send',currency:'RUB',rate:quotes.sbp_fm.value}];if(/50\s*000\s*(?:THB|฿)/i.test(text(html))){quotes.sbp_fm.unquotedTier={min:50000,unit:'receive',currency:'THB'};quotes.sbp_fm.note='Банкомат по QR / курьер. От 50 000 THB индивидуальный курс; числовая котировка не опубликована.';}else throw Error('EXFM volume condition missing; requires review');}
 for(const [id,q] of Object.entries(quotes))if(!validRateQuote(id,q)||(/^eur_spb_/.test(id)&&q.value<(quotes[id.replace('eur_','usd_')]?.value||eurValidation.usd)*1.05))throw Error('Invalid quote range '+id);
 return quotes;
}

function checkSpread(buy,sell) { if(!Number.isFinite(buy)||!Number.isFinite(sell)||buy<=0||sell<buy)throw Error(`Invalid bank buy/sell spread: ${buy}/${sell}`); }

// Text readers lose HTML attributes. Preserve independent valid rows, never
// manufacture a city or invert a buy/sell spread to make a row pass.
function parseSource(name,html) {
 try { return parseSourceStrict(name,html); } catch(error) {
  const clean=html.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1');
  const plain=text(clean).replace(/\|/g,' '), quotes={};
  const put=(id,value,extra={})=>{if(validRateQuote(id,{value,...extra}))quotes[id]={value,source:targets[name],observedAt:Date.now(),sourceUpdated:'Время источника не извлечено',verification:'official',...extra};};
  const pair=(id,buy,sell,extra={})=>{if(buy>0&&sell>=buy)put(id,sell,{buy,...extra});};
  if(name==='ligovka'&&/образца 2009/.test(plain)){
   const rows=/<tr/i.test(clean)?[...clean.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>text(m[1])):clean.split('\n').map(r=>text(r).replace(/\|/g,' ').trim());
   for(const [code,offset]of [['usd',0],['eur',2]]){
    const tiers=[];
    for(const min of [1,1000,10000]){const row=rows.find(r=>new RegExp('^от\\s+'+min+'\\s').test(r));const v=decimals(row||'');if(v.length>=4&&v[offset]>0&&v[offset+1]>=v[offset])tiers.push({min:min===1?0:min,rate:v[offset+1],buy:v[offset],unit:'receive',currency:code.toUpperCase()});}
    if(tiers[0]?.min===0)pair(code+'_spb_1',tiers[0].buy,tiers[0].rate,{tiers});
   }
   const tiers=rows.filter(r=>/CNY/.test(r)&&/Китайский юань/.test(r)).map(r=>{const v=decimals(r);return {min:/от\s+10000/.test(r)?10000:0,buy:v[0],rate:v[1],unit:'receive',currency:'CNY'};}).filter(t=>t.buy>0&&t.rate>=t.buy).sort((a,b)=>a.min-b.min);
   if(tiers[0]?.min===0)pair('cny_spb_1',tiers[0].buy,tiers[0].rate,{tiers});
  } else if(['kamkomEur','kamkomCny','bankiEur','bankiCny'].includes(name)&&/Санкт-Петербурге|Санкт-Петербург/.test(plain)){
   const code=/Eur$/.test(name)?'eur':'cny';
   if(!(code==='eur'?/\bEUR\b|евро/i:/\bCNY\b|юан/i).test(plain))throw Error('Currency heading missing');
   if(name.startsWith('kamkom')){
    const section=plain.split(/КАМКОМБАНК/i)[1]?.split(/Подробнее|Следующий банк/)[0];
    const m=section?.match(/Покупка\s+(\d+[.,]\d+)\s+Продажа\s+(\d+[.,]\d+)/i);
    if(m)pair(code+'_spb_2',Number(m[1].replace(',','.')),Number(m[2].replace(',','.')),{verification:'web-listing'});
   } else {
    const section=code==='cny'?plain.split(/КАМКОМБАНК/i)[1]?.split('Подробнее')[0]:plain;
    if(/Я покупаю\s+Я продаю/.test(section||'')){
     const matches=[...(section||'').matchAll(/(\d+[.,]\d+)\s*₽\s+(\d+[.,]\d+)\s*₽/g)].map(m=>({sell:Number(m[1].replace(',','.')),buy:Number(m[2].replace(',','.'))})).filter(p=>p.sell>=p.buy).sort((a,b)=>a.sell-b.sell);
     if(matches.length)pair(code+'_spb_2',matches[0].buy,matches[0].sell,{verification:'web-listing',note:'Банки.ру: лучшее предложение среди показанных офисов; наличие и время котировки уточняются.'});
    }
   }
  } else if(['kamkom','finam'].includes(name)){
   // Require a selected-city caption or a city-specific heading, not a footer.
   if(/(?:Ваш город|Город|Курсы валют в)\s*:?\s*Санкт-Петербург/i.test(plain)){
    const reversed=/Я покупаю\s+Я продаю/.test(plain);
    if(reversed||/Покупка\s+Продажа|Покупаем\s+Продаем/i.test(plain))for(const code of ['USD','EUR','CNY']){
     const m=plain.match(new RegExp('\\b'+code+'\\b\\s+(\\d+[.,]\\d+)\\s+(\\d+[.,]\\d+)'));
     if(m){const a=Number(m[1].replace(',','.')),b=Number(m[2].replace(',','.'));pair(code.toLowerCase()+'_spb_'+(name==='kamkom'?2:3),reversed?b:a,reversed?a:b);}
    }
   }
  } else if(name==='valueplus'&&/Buy(?:ing)? Rate[^]*?Sell(?:ing)? Rate/i.test(plain)){
   const rows=/<tr/i.test(clean)?[...clean.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>text(m[1])):clean.split('\n');
   for(const [code,id,denom]of [['USD','usd_vp',/(?:100\s*[-–]\s*50|50\s*[-–]\s*100)/],['EUR','eur_vp',/(?:500\s*[-–]\s*100|100\s*[-–]\s*500)/],['CNY','cny_vp',/100/]]){
    const matches=rows.filter(r=>r.includes(code)&&denom.test(r));if(matches.length!==1)continue;
    const v=decimals(matches[0]);if(v.length===2&&v[0]>0&&v[1]>=v[0])put(id,v[0],{note:'Крупные купюры; уточните филиал.'});
   }
  } else if(name==='exfm'){
   const m=plain.match(/1\s+THB\s*=\s*(\d+[.,]\d+)\s+RUB/);if(m)put('sbp_fm',Number(m[1].replace(',','.')));
  }
  if(Object.keys(quotes).length)return quotes;
  throw error;
 }
}
