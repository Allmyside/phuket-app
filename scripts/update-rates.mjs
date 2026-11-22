import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
const parserContext=vm.createContext({Date});
vm.runInContext(await readFile(new URL('../js/rate-parsers.js',import.meta.url),'utf8'),parserContext);
export const targets=vm.runInContext('targets',parserContext);
export const parseSource=parserContext.parseSource;
export const validRateQuote=parserContext.validRateQuote;
const root=new URL('../',import.meta.url);
const file=path=>new URL(path,root);

export async function pdfText(buffer) {
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs').catch(()=>{throw Error('PDF extraction needs npm install --ignore-scripts (pdfjs-dist)');});
 const doc=await getDocument({data:new Uint8Array(buffer),useSystemFonts:true,isEvalSupported:false,enableScripting:false}).promise;
 try {
  const pages=[];
  for(let i=1;i<=doc.numPages;i++){
   const content=await (await doc.getPage(i)).getTextContent();
   pages.push(content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join(''));
  }
  return pages.join('\n');
 }finally{await doc.destroy();}
}
async function browserHTML(browser,url,name) {
 const page=await browser.newPage();
 try {
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
  if(name==='kamkom'||name==='finam'){
   // Only select a real, visible city control. Never guess a numeric city ID.
   let citySelected=false;
   for(const frame of page.frames()){
    for(const select of await frame.locator('select').all()){
     const option=select.locator('option').filter({hasText:/^\s*Санкт-Петербург\s*$/}).first();
     if(await option.count()){
      await select.selectOption(await option.getAttribute('value'));
      await select.evaluate(el=>{for(const o of el.options)o.toggleAttribute('selected',o.selected);});
      citySelected=true;break;
     }
    }
    if(citySelected)break;
   }
   if(!citySelected)throw Error('Dynamic city control not recognized; SPb must be verified before parsing');
  }
  await page.waitForTimeout(1500);
  const frames=[];
  for(const frame of page.frames()){
   const host=new URL(frame.url()).hostname;
   const expected=new URL(url).hostname.replace(/^www\./,'');
   if(host===expected||host.endsWith('.'+expected))frames.push(await frame.content());
  }
  return frames.join('\n');
 }finally{await page.close();}
}
export async function collect({checkOnly=false,useBrowser=false,fetcher=fetch,writeReport=true}={}) {
 await mkdir(file('data/source-samples/'),{recursive:true});
 const old=JSON.parse(await readFile(file('data/live-rates.json'),'utf8'));
 const payload={...old,schema:1,revision:2,quotes:{...old.quotes},errors:{},attemptedAt:Date.now()};
 for(const [id,q] of Object.entries(payload.quotes))if(!validRateQuote(id,q))delete payload.quotes[id];
 // Remove legacy aggregator bank values even if every new source fails.
 for(const [id,q]of Object.entries(payload.quotes))if(/_spb_/.test(id)&&!/https:\/\/(?:www\.)?(?:ligovka\.ru|kamkombank\.ru|finambank\.ru|cdn-lpbr01\.finam\.ru)\//.test(q.source||'')&&!(['eur_spb_2','cny_spb_2'].includes(id)&&/^https:\/\/(?:www\.)?(?:kovalut\.ru|banki\.ru|www-1\.banki\.ru)\//.test(q.source||'')))delete payload.quotes[id];
 let browser;
 if(useBrowser){
  const {chromium}=await import('playwright');
  browser=await chromium.launch({headless:true,...(process.env.RATES_BROWSER_PATH?{executablePath:process.env.RATES_BROWSER_PATH}:process.platform==='win32'?{channel:'msedge'}:{})});
 }
 let results;
 try {
  results=await Promise.all(Object.entries(targets).map(async([name,configuredUrl])=>{
   try{
    let url=configuredUrl;
    if(name.endsWith('Terms')){
     const indexUrl=name==='kamkomTerms'?'https://www.kamkombank.ru/rus/individuals/tarifi-fiz-lic/':'https://www.finambank.ru/person_rates/';
     const index=await fetcher(indexUrl,{signal:AbortSignal.timeout(15000)});
     if(!index.ok)throw Error('Tariff index HTTP '+index.status);
     url=discoverTariff(name,await index.text(),indexUrl);
    }
    const response=await fetcher(url+(url.includes('?')?'&':'?')+'t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('HTTP '+response.status);
    const bytes=await response.arrayBuffer();
    const html=url.endsWith('.pdf')?await pdfText(bytes):new TextDecoder(/windows-1251/i.test(response.headers.get('content-type')||'')?'windows-1251':'utf-8').decode(bytes);
    let content=html,quotes;
    try{quotes=parseSource(name,content);}catch(e){
     if(!browser||url.endsWith('.pdf'))throw e;
     content=await browserHTML(browser,url,name);quotes=parseSource(name,content);
    }
    await writeFile(file(`data/source-samples/${name}.${url.endsWith('.pdf')?'txt':'html'}`),content);
    for(const q of Object.values(quotes))q.source=url;
    return {name,quotes};
   }catch(error){return {name,error:error.message+(error.cause?.code?' ('+error.cause.code+')':'')};}
  }));
 }finally{await browser?.close();}
 // Fallbacks first, official tables next, tariff documents last: deterministic priority.
 const priority=name=>['moneyshopFallback','moneyshopEur','moneyshopSbp','kata','kamkomEur','kamkomCny','bankiEur','bankiCny'].includes(name)?0:name.endsWith('Terms')?2:1;
 results.sort((a,b)=>priority(a.name)-priority(b.name));
 let fresh=0;
 for(const result of results){
  if(result.error){payload.errors[result.name]=result.error;console.error(`${result.name}: ${result.error}`);continue;}
  for(const [id,q]of Object.entries(result.quotes)){
   // Preserve reviewed conditions if the quote page publishes prices only.
   const prior=payload.quotes[id];
   payload.quotes[id]={...q,...(!q.note&&prior?.note?{note:prior.note,conditionsSource:prior.conditionsSource||prior.source,conditionsObservedAt:prior.conditionsObservedAt||prior.observedAt}:{})};
  }
  fresh+=Object.keys(result.quotes).length;
  console.log(`${result.name}: ${Object.keys(result.quotes).length} verified values`);
 }
 payload.fees=Object.fromEntries(Object.entries(payload.quotes).filter(([id])=>id.startsWith('fee_')));
 const report={attemptedAt:payload.attemptedAt,fresh,errors:payload.errors};
 if(writeReport)await writeFile(file('data/rates-check.json'),JSON.stringify(report,null,2)+'\n');
 if(!checkOnly){
  await writeFile(file('data/live-rates.json.tmp'),JSON.stringify(payload,null,2)+'\n');
  await rename(file('data/live-rates.json.tmp'),file('data/live-rates.json'));
  await writeFile(file('js/rate-seed.js.tmp'),'const RATE_SEED = '+JSON.stringify(payload,null,2)+';\n');
  await rename(file('js/rate-seed.js.tmp'),file('js/rate-seed.js'));
 }
 return report;
}
export function discoverTariff(name,html,indexUrl) {
 const anchors=[...html.matchAll(/<a\b[^>]*href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({url:new URL(m[1].replaceAll('&amp;','&'),indexUrl).href,label:m[2].replace(/<[^>]+>/g,' '),offset:m.index}));
 let chosen;
 if(name==='kamkomTerms'){
  const dated=anchors.map(a=>{const d=a.label.match(/(\d{2})\.(\d{2})\.(\d{4})/);return {...a,date:d?Date.UTC(+d[3],+d[2]-1,+d[1]):NaN};}).filter(a=>Number.isFinite(a.date)&&a.date<=Date.now());
  chosen=dated.sort((a,b)=>b.date-a.date)[0];
 }else{
  const heading=html.search(/Расчетно-кассовое обслуживание|Расчётно-кассовое обслуживание/);
  chosen=anchors.find(a=>/Tarify_RKO_FL/i.test(a.url))||(heading>=0?anchors.find(a=>a.offset>heading):undefined);
 }
 if(!chosen)throw Error('Current tariff PDF link not recognized; saved conditions retained');
 const host=new URL(chosen.url).hostname;
 if(!['www.kamkombank.ru','kamkombank.ru','www.finambank.ru','finambank.ru','cdn-lpbr01.finam.ru'].includes(host))throw Error('Unexpected tariff PDF host');
 return chosen.url;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const report=await collect({checkOnly:process.argv.includes('--check'),useBrowser:process.argv.includes('--browser')});
  if(!report.fresh||Object.keys(report.errors).length)process.exitCode=1;
 }catch(e){console.error(e.message);process.exitCode=1;}
}
