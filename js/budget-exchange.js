const exchangeFilters={"bank_ligovka":["1. СКВ Лиговский",["usd_spb_1","eur_spb_1","cny_spb_1","fee_spb_1","blue_spb_1","blue_min_spb_1"]],"bank_kamkom":["2. Камкомбанк",["usd_spb_2","eur_spb_2","cny_spb_2","fee_spb_2","blue_spb_2","blue_min_spb_2"]],"bank_finam":["3. Банк Финам",["usd_spb_3","eur_spb_3","cny_spb_3","fee_spb_3","blue_spb_3","blue_min_spb_3"]],"exch_vp":["Value Plus (Нал)",["usd_vp","eur_vp","cny_vp"]],"exch_ms":["Money Shop (Нал)",["usd_ms","eur_ms"]],"exch_beach":["Обменники у пляжа Ката (Нал)",["usd_beach"]],"exch_sbp_ms":["Money Shop (СБП)",["sbp_ms"]],"exch_sbp_fm":["EXFM.app (СБП)",["sbp_fm"]]};
function optionEnabled(key){return document.getElementById('toggle_'+key)?.checked!==false;}
function bankEnabled(i){return optionEnabled(['bank_ligovka','bank_kamkom','bank_finam'][i-1]);}
function exchangeEnabled(id){return Object.entries(exchangeFilters).filter(([k])=>k.startsWith('exch_')).some(([k,v])=>v[1].includes(id)&&optionEnabled(k));}
function updateExchangeFilters(){
 const state={};for(const [key,[,ids]] of Object.entries(exchangeFilters)){state[key]=optionEnabled(key);for(const id of ids)document.getElementById(id)?.closest('.field')?.classList.toggle('provider-disabled',!state[key]);}
 try{localStorage.setItem('exchange-provider-selection-v1',JSON.stringify(state));}catch{}
 render(false);
}
function restoreExchangeFilters(){
 try{const saved=JSON.parse(localStorage.getItem('exchange-provider-selection-v1'))||{};for(const key of Object.keys(exchangeFilters)){const el=document.getElementById('toggle_'+key);if(el)el.checked=saved[key]!==false;}}catch{}
 updateExchangeFilters();
}
        /* ==================== БЮДЖЕТ: СОВОКУПНЫЙ ОБЩИЙ БЮДЖЕТ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ + ЛИЧНЫЕ ВКЛАДКИ ==================== */
        function convertAnyBudgetToThb(amount, curr) {
            const b = parseFloat(amount) || 0;
            if (b <= 0) return 0;
            const spb1 = parseFloat(document.getElementById('usd_spb_1')?.value) || NaN;
            const fee1 = parseFloat(document.getElementById('fee_spb_1')?.value) || 20;
            const usdVp = parseFloat(document.getElementById('usd_vp')?.value) || NaN;
            const eurVp = parseFloat(document.getElementById('eur_vp')?.value) || NaN;
            const cnyVp = parseFloat(document.getElementById('cny_vp')?.value) || NaN;

            if (curr === 'THB') return b;
            if (curr === 'USD') return b * usdVp;
            if (curr === 'EUR') return b * eurVp;
            if (curr === 'CNY') return b * cnyVp;
            if (curr === 'RUB') {
                const exactUsd = Math.round((Math.max(0, b - fee1) / spb1) * 100) / 100;
                return exactUsd * usdVp;
            }
            return b;
        }

        // Автоматический расчет совокупного бюджета всех зарегистрированных пользователей для вкладки «Основная»
        function computeAggregateAllUsersBudget() {
            const db = getUsersDb();
            let totalThbAll = 0;
            let totalPeople = 0;
            let maxDays = 1;
            const sumCats = {};
            categoriesData.forEach(c => { sumCats[c.id] = 0; });

            Object.keys(db).forEach(uKey => {
                const inp = db[uKey]?.data?.inputs || {};
                const uBudget = parseFloat(inp.plan_budget) || 0;
                const uCurr = inp.plan_currency || 'RUB';
                const uThb = convertAnyBudgetToThb(uBudget, uCurr);
                totalThbAll += uThb;

                let userSpent = 0;
                categoriesData.forEach(c => {
                    const v = parseFloat(inp['num_' + c.id]) || 0;
                    sumCats[c.id] += v;
                    userSpent += v;
                });

                if (uThb > 0 || userSpent > 0) {
                    totalPeople += Math.max(1, parseInt(inp.plan_people) || 1);
                    maxDays = Math.max(maxDays, parseInt(inp.plan_days) || 1);
                }
            });

            return {
                plan_budget: String(Math.round(totalThbAll)),
                plan_currency: 'THB',
                plan_people: String(Math.max(1, totalPeople)),
                plan_days: String(Math.max(1, maxDays)),
                cats: sumCats
            };
        }

        function extractBudgetSnapshotFromDOM() {
            const db = getUsersDb();
            const actor = db[currentUser]?.displayName || currentUser || 'Участник';
            const snap = {
                plan_budget: document.getElementById('plan_budget')?.value || '0',
                plan_currency: document.getElementById('plan_currency')?.value || 'RUB',
                plan_people: document.getElementById('plan_people')?.value || '1',
                plan_days: document.getElementById('plan_days')?.value || '1',
                cats: {},
                updatedByKey: currentUser,
                updatedBy: actor,
                updatedAtStr: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                updatedAt: Date.now()
            };
            categoriesData.forEach(cat => {
                snap.cats[cat.id] = document.getElementById('num_' + cat.id)?.value || 0;
            });
            return snap;
        }

        function canEditBudgetSubtab(subtabKey) {
            if (!currentUser || !subtabKey) return false;
            // Вкладка «Основная (__main__)» автоматически суммирует бюджеты всех пользователей
            if (subtabKey === '__main__') return false;
            if (isCurrentUserAdmin()) return true;
            return subtabKey === currentUser;
        }

        function renderBudgetSubtabs() {
            const bar = document.getElementById('budgetUserSubtabs');
            if (!bar) return;
            const db = getUsersDb();
            const keys = Object.keys(db);

            let html = `<button class="subtab-pill ${activeBudgetSubtab === '__main__' ? 'active' : ''}" onclick="switchBudgetSubtab('__main__')">🌐 Основная (Совокупный бюджет всех)</button>`;
            keys.forEach(uKey => {
                const u = db[uKey];
                const isMe = currentUser && uKey.toLowerCase() === currentUser.toLowerCase();
                const avHtml = getUserInlineAvatarHtml(uKey, 18);
                html += `<button class="subtab-pill ${activeBudgetSubtab === uKey ? 'active' : ''}" onclick="switchBudgetSubtab('${uKey}')">${avHtml} <span>${u.displayName || uKey}${isMe ? ' (Вы)' : ''}</span></button>`;
            });
            bar.innerHTML = html;
        }

        function switchBudgetSubtab(subtabKey) {
            saveUserDataState(true);
            activeBudgetSubtab = subtabKey;
            renderBudgetSubtabs();
            loadBudgetSubtabData(subtabKey);
        }

        function loadBudgetSubtabData(subtabKey) {
            const db = getUsersDb();
            let snap = null;

            if (subtabKey === '__main__') {
                snap = computeAggregateAllUsersBudget();
            } else {
                const inp = db[subtabKey]?.data?.inputs || {};
                snap = {
                    plan_budget: inp.plan_budget !== undefined ? inp.plan_budget : '0',
                    plan_currency: inp.plan_currency || 'RUB',
                    plan_people: inp.plan_people || '1',
                    plan_days: inp.plan_days || '1',
                    updatedByKey: subtabKey,
                    updatedBy: db[subtabKey]?.displayName || subtabKey,
                    updatedAtStr: db[subtabKey]?.updatedAt ? new Date(db[subtabKey].updatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '',
                    cats: {}
                };
                categoriesData.forEach(cat => {
                    snap.cats[cat.id] = inp['num_' + cat.id] !== undefined ? inp['num_' + cat.id] : 0;
                });
            }

            if (snap) {
                if (document.getElementById('plan_budget')) document.getElementById('plan_budget').value = snap.plan_budget;
                if (document.getElementById('plan_currency')) document.getElementById('plan_currency').value = snap.plan_currency;
                if (document.getElementById('plan_people')) document.getElementById('plan_people').value = snap.plan_people;
                if (document.getElementById('plan_days')) document.getElementById('plan_days').value = snap.plan_days;
                categoriesData.forEach(cat => {
                    const v = snap.cats?.[cat.id] ?? 0;
                    const numEl = document.getElementById('num_' + cat.id);
                    const rngEl = document.getElementById('rng_' + cat.id);
                    if (numEl) numEl.value = v;
                    if (rngEl) {
                        if (parseFloat(v) > parseFloat(rngEl.max)) rngEl.max = parseFloat(v) * 1.25;
                        rngEl.value = v;
                    }
                });
            }

            const authorLine = document.getElementById('budgetLastAuthorLine');
            const sumLbl = document.getElementById('sumTotalLabelTitle');
            if (subtabKey === '__main__') {
                if (sumLbl) sumLbl.innerText = 'Совокупный бюджет всех';
                if (authorLine) {
                    authorLine.innerHTML = `<span style="color:var(--success); font-weight:700;">📊 Автоматическая сумма бюджетов и категорий всех зарегистрированных участников (${Object.keys(db).length} чел.)</span>`;
                }
            } else {
                if (sumLbl) sumLbl.innerText = 'Личный бюджет';
                if (authorLine) {
                    const avHtml = getUserInlineAvatarHtml(subtabKey, 18);
                    authorLine.innerHTML = `${avHtml} <span>Вкладка участника: <b style="color:var(--accent);">${db[subtabKey]?.displayName || subtabKey}</b> ${snap?.updatedAtStr ? '(обновлено в ' + snap.updatedAtStr + ')' : ''}</span>`;
                }
            }

            const editable = canEditBudgetSubtab(subtabKey);
            const roNotice = document.getElementById('budgetReadonlyNotice');
            if (roNotice) {
                roNotice.style.display = editable ? 'none' : 'inline-block';
                roNotice.innerText = subtabKey === '__main__'
                    ? '📊 Авто-сумма всех участников (редактируйте в своей личной вкладке)'
                    : '👁️ Только чтение (чужой бюджет)';
            }
            document.getElementById('budgetPresetsRow').style.display = editable ? 'flex' : 'none';
            document.getElementById('btnCopyFromExchange').style.display = editable ? 'inline-block' : 'none';

            const titleEl = document.getElementById('budgetParamsTitle');
            if (titleEl) {
                titleEl.innerText = subtabKey === '__main__'
                    ? 'Совокупные параметры бюджета всех пользователей (в батах ฿)'
                    : `Личный бюджет участника: ${db[subtabKey]?.displayName || subtabKey}`;
            }

            ['plan_budget', 'plan_currency', 'plan_people', 'plan_days'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = !editable;
            });
            categoriesData.forEach(cat => {
                const numEl = document.getElementById('num_' + cat.id);
                const rngEl = document.getElementById('rng_' + cat.id);
                if (numEl) numEl.disabled = !editable;
                if (rngEl) rngEl.disabled = !editable;
            });

            updatePlanner();
        }

        function persistActiveBudgetSubtab() {
            if (!canEditBudgetSubtab(activeBudgetSubtab)) return;
            const snap = extractBudgetSnapshotFromDOM();
            const db = getUsersDb();
            if (db[activeBudgetSubtab]) {
                if (!db[activeBudgetSubtab].data) db[activeBudgetSubtab].data = { inputs: {} };
                if (!db[activeBudgetSubtab].data.inputs) db[activeBudgetSubtab].data.inputs = {};
                db[activeBudgetSubtab].data.inputs.plan_budget = snap.plan_budget;
                db[activeBudgetSubtab].data.inputs.plan_currency = snap.plan_currency;
                db[activeBudgetSubtab].data.inputs.plan_people = snap.plan_people;
                db[activeBudgetSubtab].data.inputs.plan_days = snap.plan_days;
                Object.keys(snap.cats).forEach(cId => {
                    db[activeBudgetSubtab].data.inputs['num_' + cId] = snap.cats[cId];
                    db[activeBudgetSubtab].data.inputs['rng_' + cId] = snap.cats[cId];
                });
                db[activeBudgetSubtab].updatedAt = Date.now();
                localStorage.setItem(USERS_DB_KEY, JSON.stringify(db));
                clearTimeout(userDataSaveTimer);
                userDataSaveTimer = setTimeout(flushUserDataSave, 300);
            }
        }

        function onBudgetControlEdited() {
            if (!canEditBudgetSubtab(activeBudgetSubtab)) return;
            updatePlanner();
            persistActiveBudgetSubtab();
        }


/* ==================== КУРСЫ ВАЛЮТ И ОФИЦИАЛЬНЫЙ БЕНЧМАРК ==================== */
        function copyFromExchangeTab() {
            if (!canEditBudgetSubtab(activeBudgetSubtab)) return;
            document.getElementById('plan_budget').value = document.getElementById('budget').value || '0';
            document.getElementById('plan_currency').value = document.getElementById('currency').value || 'RUB';
            updatePlanner();
            persistActiveBudgetSubtab();
        }

        function flashInputs(ids) {
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.classList.add('updated');
                    setTimeout(() => el.classList.remove('updated'), 1000);
                }
            });
        }

        function manualCalc() {
            const btn = document.getElementById('calcBtn');
            const st = document.getElementById('status');
            const now = new Date().toLocaleString('ru-RU', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit'});
            btn.innerText = "✅ Точный расчет выполнен";
            st.className = "status-bar active";
            ratesStatus();
            render(true);
            saveUserDataState();
            setTimeout(() => { btn.innerText = "🧮 Рассчитать"; }, 900);
        }

        async function fetchRatesResource(url, json = false) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 4000);
            try {
                const response = await fetch(url, { signal: controller.signal });
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return await (json ? response.json() : response.text());
            } finally {
                clearTimeout(timer);
            }
        }

const liveQuoteFields = ['usd_spb_1','usd_spb_2','usd_spb_3','eur_spb_1','eur_spb_2','eur_spb_3','cny_spb_1','cny_spb_2','cny_spb_3','fee_spb_1','fee_spb_2','fee_spb_3','blue_spb_1','blue_spb_2','blue_spb_3','blue_min_spb_1','blue_min_spb_2','blue_min_spb_3','usd_vp','eur_vp','cny_vp','usd_ms','eur_ms','usd_beach','sbp_ms','sbp_fm','forex_usd_rub','forex_usd_thb'];
liveQuoteFields.push('forex_eur_rub');
let confirmedRates = {schema:1, revision:2, quotes:{}, errors:{}};
const rateManualOverrides = {};
const rateCacheKey = 'confirmed-live-rates-v11';
const manualRateKey = 'rate-manual-overrides-v11';
function quoteDigits(id) { return id.startsWith('sbp_') || id.endsWith('_ms') ? 3 : 2; }
function toggleSourceDetails() {
    const button=document.getElementById('sourcesToggle'), panel=document.getElementById('sourceDetails');
    const open=button.getAttribute('aria-expanded')!=='true';
    button.setAttribute('aria-expanded',String(open));
    panel.inert=!open;
    panel.classList.toggle('is-open',open);
}
function ratesStatus() {
    const st=document.getElementById('status');
    const groups=[['СКВ Лиговский',['usd_spb_1','eur_spb_1','cny_spb_1','fee_spb_1']],['Камкомбанк',['usd_spb_2','eur_spb_2','cny_spb_2','fee_spb_2']],['Банк Финам',['usd_spb_3','eur_spb_3','cny_spb_3','fee_spb_3']],['Value Plus',['usd_vp','eur_vp','cny_vp']],['Money Shop',['usd_ms','eur_ms','sbp_ms']],['Ката',['usd_beach']],['EXFM (СБП)',['sbp_fm']],['Официальный кросс-курс',['forex_usd_rub','forex_usd_thb']]];
    const quotes=Object.values(confirmedRates.quotes);
    const times=quotes.map(q=>q.observedAt).filter(Number.isFinite);
    const date=times.length?new Date(Math.max(...times)).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'short',timeStyle:'short'}):'неизвестна';
    const complete=liveQuoteFields.every(id=>confirmedRates.quotes[id]);
    const fresh=complete&&quotes.every(q=>q.verification==='official'&&Date.now()-q.observedAt<86400000)&&!Object.keys(confirmedRates.errors||{}).length;
    if(st)st.textContent=`● ${fresh?'Котировки проверены':'Сохранённые котировки; часть требует проверки'} · ${date} МСК | СПб: СКВ Лиговский, Камкомбанк, Финам • Пхукет: Value Plus, Money Shop, Ката, EXFM (СБП)${Object.keys(rateManualOverrides).length?' • Есть ручные значения':''}`;
    if(st&&lastRateSync){const when=new Date(lastRateSync.at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'short',timeStyle:'medium'});st.textContent=`● ${lastRateSync.success?'Обновлено онлайн':'Опрос завершён, сеть недоступна'}: ${when} МСК | Обновлено источников: ${lastRateSync.success} из 8 | СПб: Лиговский, Камкомбанк, Финам • Пхукет: Value Plus, Money Shop, Ката, EXFM`;}
    const list=document.getElementById('sourceDetailsList');
    if(list)list.innerHTML=groups.map(([name,ids])=>{
        const rows=ids.map(id=>confirmedRates.quotes[id]).filter(Boolean);
        const stamps=[...new Set(rows.map(q=>q.sourceUpdated||'время источника не опубликовано'))];
        const notes=[...new Set(rows.map(q=>q.note).filter(Boolean))];
        const received=rows.length?new Date(Math.max(...rows.map(q=>q.observedAt))).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'short',timeStyle:'short'}):'нет данных';
        const missing=ids.filter(id=>!confirmedRates.quotes[id]).map(id=>id.split('_')[0].toUpperCase());
        const manual=ids.filter(id=>id in rateManualOverrides).map(id=>id.startsWith('fee_')?'сбор':id.split('_')[0].toUpperCase());
        return `<li><b>${escapeHtml(name)}</b> — ${escapeHtml(stamps.join('; '))}; сохранено ${received} МСК${missing.length?`; нет подтверждённого курса ${missing.join(', ')}`:''}${manual.length?`; вручную: ${manual.join(', ')}`:''}. ${escapeHtml(notes.join(' '))}</li>`;
    }).join('')+`<li>Время в сводке — время получения/сохранения, не единое время всех котировок. Значения из сверки пользователя не считаются новой онлайн-проверкой. Кросс-курс ЦБ — справочный ориентир, не исполнимая биржевая заявка.</li>`;
}
function rememberRateEdits(event) {
    if(!liveQuoteFields.includes(event.target?.id))return;
    const valid=event.target.value!==''&&validRateValue(event.target.id,Number(event.target.value));
    event.target.setCustomValidity?.(valid?'':'Значение вне допустимого диапазона валюты или комиссии');
    rateManualOverrides[event.target.id]=event.target.value;
    try {localStorage.setItem(manualRateKey,JSON.stringify(rateManualOverrides));}catch{}
    ratesStatus();
}
function trustedRate(id,q) {
    if(/^eur_spb_/.test(id)&&q?.value<(confirmedRates.quotes[id.replace('eur_','usd_')]?.value||eurValidation.usd)*1.05)return false;
    if(!validRateQuote(id,q)||!Number.isFinite(q.observedAt)||q.observedAt>Date.now()+60000)return false;
    let host;try{host=new URL(q.source).hostname.replace(/^www\./,'');}catch{return false;}
    const bank=id.match(/_spb_(\d)$/)?.[1];
    if(bank==='2'&&['kovalut.ru','banki.ru','www-1.banki.ru','bankiros.ru'].includes(host)&&!['eur_spb_2','cny_spb_2'].includes(id))return false;
    if(bank && !({1:['ligovka.ru'],2:['kamkombank.ru','kovalut.ru','banki.ru','www-1.banki.ru','bankiros.ru'],3:['finambank.ru','cdn-lpbr01.finam.ru']})[bank].includes(host))return false;
    if(!bank&&!['valueplusexchange.com','moneyshopphuket.com','phuketkit.com','exfm.app','cbr.ru','open.er-api.com','cbr-xml-daily.ru','bankiros.ru'].includes(host))return false;
    if(bank&&q.buy!=null&&(!Number.isFinite(q.buy)||q.buy<=0||q.buy>q.value))return false;
    if(q.tiers?.some(t=>!Number.isFinite(t.rate)||t.rate<=0||!Number.isFinite(t.min)||t.min<0||(t.buy!=null&&t.buy>t.rate)))return false;
    return true;
}
function mergeConfirmedRates(payload) {
    if(payload?.schema!==1||payload.revision!==2)return;
    for(const [id,key] of [['forex_usd_rub','usd'],['forex_eur_rub','eur']]){const q=payload.quotes?.[id];if(q&&Number.isFinite(q.value)&&q.value>=65&&q.value<=150&&Number.isFinite(q.observedAt)&&q.observedAt<=Date.now()+60000&&/^https:\/\/(?:www\.)?(?:cbr.ru|cbr-xml-daily.ru|open.er-api.com|bankiros.ru)\//.test(q.source||''))eurValidation[key]=q.value;}
    for(const [id,q]of Object.entries({...payload.fees,...payload.quotes})){
        if(!liveQuoteFields.includes(id)||!trustedRate(id,q))continue;
        if(!confirmedRates.quotes[id]||q.observedAt>=confirmedRates.quotes[id].observedAt)confirmedRates.quotes[id]=q;
    }
    if(payload.errors)confirmedRates.errors=payload.errors;
}
function applyConfirmedRates() {
    for(const id of liveQuoteFields){
        const el=document.getElementById(id),q=confirmedRates.quotes[id];
        if(!el)continue;
        el.value=id in rateManualOverrides?rateManualOverrides[id]:q?q.value.toFixed(quoteDigits(id)):'';
        el.placeholder='Курс не подтверждён';
        el.title=q?`${q.sourceUpdated||'Дата не указана'} • ${q.note||''}`:'Нет проверенной котировки; можно ввести вручную';
    }
}
async function initializeRateInputs() {
    mergeConfirmedRates(RATE_SEED);
    restoreExchangeFilters();
    try{mergeConfirmedRates(JSON.parse(localStorage.getItem(rateCacheKey)));for(const [id,value] of Object.entries(JSON.parse(localStorage.getItem(manualRateKey))||{}))if(liveQuoteFields.includes(id)&&value!==''&&validRateValue(id,Number(value)))rateManualOverrides[id]=value;}catch{}
    applyConfirmedRates();
    document.addEventListener('input',rememberRateEdits,true);
    render();ratesStatus();
    try{mergeConfirmedRates(await fetchRatesResource('./data/live-rates.json',true));applyConfirmedRates();render();ratesStatus();}catch{}
}
let lastRateSync=null;
async function pollRateSource(name) {
 const target=targets[name],stamp=Date.now(),url=target+(target.includes('?')?'&':'?')+'t='+stamp;
 const proxies=[`https://r.jina.ai/${url}`,`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,`https://corsproxy.io/?url=${encodeURIComponent(url)}`,`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`];
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),18000);
 try{return await Promise.any(proxies.map(async proxy=>{
  const response=await fetch(proxy,{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);
  return parseSource(name,await response.text());
 }));}finally{clearTimeout(timer);controller.abort();}
}
async function pollBenchmark() {
 return Promise.any(['https://open.er-api.com/v6/latest/USD','https://www.cbr-xml-daily.ru/daily_json.js'].map(async source=>{
  const r=await fetch(source+'?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);
  const d=await r.json(),rub=d.Valute?d.Valute.USD.Value/d.Valute.USD.Nominal:d.rates?.RUB,thb=d.Valute?rub/(d.Valute.THB.Value/d.Valute.THB.Nominal):d.rates?.THB;
  if(!(rub>0&&thb>0))throw Error('Invalid benchmark');
  const eur=d.Valute?d.Valute.EUR?.Value/d.Valute.EUR?.Nominal:rub/d.rates?.EUR;
  return Object.fromEntries([['forex_usd_rub',rub],['forex_usd_thb',thb],...(Number.isFinite(eur)&&eur>0?[['forex_eur_rub',eur]]:[])].map(([id,value])=>[id,{value,source,sourceUpdated:d.Date||d.time_last_update_utc||'Дата API не указана',observedAt:Date.now(),verification:'official'}]));
 }));
}
async function syncLiveRates() {
 if(syncLiveRates.running)return;
 syncLiveRates.running=true;
 const button=document.getElementById('syncBtn'),status=document.getElementById('status');
 button.disabled=true;button.textContent='⏳ Обновление…';
 let done=0,success=0;const changed=new Set(),errors={};
 const progress=()=>status.textContent=`⏳ Живое обновление котировок из сети (${done}/8 источников)…`;
 progress();
 const combine=async names=>{const results=await Promise.allSettled(names.map(pollRateSource));const quotes=Object.assign({},...results.filter(r=>r.status==='fulfilled').map(r=>r.value));if(!Object.keys(quotes).length)throw Error('Источники недоступны');return quotes;};
 const tasks=[['ligovka',()=>pollRateSource('ligovka')],['kamkom',()=>combine(['kamkomEur','kamkomCny','bankiEur','bankiCny','kamkom'])],['finam',()=>pollRateSource('finam')],['valueplus',()=>pollRateSource('valueplus')],['moneyshop',()=>combine(['moneyshopFallback','moneyshopEur','moneyshopSbp','moneyshop'])],['kata',()=>pollRateSource('kata')],['exfm',()=>pollRateSource('exfm')],['benchmark',pollBenchmark]];
 try{
  await Promise.all(tasks.map(async([name,task])=>{
   try{const quotes=await task();const valid=Object.fromEntries(Object.entries(quotes).filter(([id,q])=>trustedRate(id,q)));if(!Object.keys(valid).length)throw Error('Нет подходящих котировок');
    mergeConfirmedRates({schema:1,revision:2,quotes:valid});success++;Object.keys(valid).forEach(id=>{if(!(id in rateManualOverrides))changed.add(id);});
    applyConfirmedRates();render();
   }catch(e){errors[name]=e.message;}finally{done++;progress();}
  }));
  confirmedRates.errors=errors;lastRateSync={at:Date.now(),success};
  try{localStorage.setItem(rateCacheKey,JSON.stringify(confirmedRates));}catch{}
  ratesStatus();flashInputs([...changed]);
 }finally{button.disabled=false;button.textContent='🔄 Обновить котировки';syncLiveRates.running=false;}
}

function selectedRate(id,amount,currency,fee=0,premium=0,minimum=0) {
    const input=document.getElementById(id),quote=confirmedRates.quotes[id];
    if(/^eur_spb_/.test(id)){
        const usd=Number(document.getElementById(id.replace('eur_','usd_'))?.value)||eurValidation.usd;
        const valid=v=>validRateValue(id,v)&&v>=usd*1.05;
        if(id in rateManualOverrides&&!valid(Number(rateManualOverrides[id])))delete rateManualOverrides[id];
        if(quote&&(!valid(quote.value)||quote.tiers?.some(t=>!valid(t.rate)))){
            const fallback=typeof RATE_SEED!=='undefined'?RATE_SEED.quotes[id]:null;
            if(fallback&&valid(fallback.value)){confirmedRates.quotes[id]=fallback;return selectedRate(id,amount,currency,fee,premium,minimum);}
            return {rate:NaN,label:'EUR не прошёл проверку кросс-курса'};
        }
    }
    if(id in rateManualOverrides||!quote){const v=Number(input?.value);return {rate:input?.value!==''&&validRateValue(id,v)?v:NaN,label:id in rateManualOverrides?'ручной курс':'курс не подтверждён'};}
    let chosen={rate:quote.value,min:0};
    for(const t of [...(quote.tiers||[])].sort((a,b)=>a.min-b.min)){
        // Foreign cash already owned by the user must not activate RUB bank tiers.
        const available=Math.max(0,amount-fee);
        const qualifies=amount>0&&(currency==='RUB'?(t.unit==='receive'?available>=t.min*t.rate+Math.max(minimum,t.min*premium)-1e-9:available>=t.min):(t.unit==='receive'&&t.currency===currency&&amount>=t.min));
        if(qualifies)chosen=t;
    }
    if(input)input.value=chosen.rate.toFixed(quoteDigits(id));
    return {rate:chosen.rate,label:chosen.min?`тариф от ${chosen.min} ${chosen.currency||''}`:'базовый розничный курс'};
}
function bankPurchase(code,index,amount,currency='RUB') {
    const number=id=>{const el=document.getElementById(id),v=Number(el?.value);return el?.value!==''&&validRateValue(id,v)?v:NaN;};
    const blue=code==='usd'&&document.getElementById('blueUsdOnly')?.checked!==false;
    const charge=number('fee_spb_'+index),premium=blue?number('blue_spb_'+index):0,minimum=blue?number('blue_min_spb_'+index):0;
    const chosen=selectedRate(`${code}_spb_${index}`,amount,currency,charge,premium,minimum);
    const valid=chosen.rate>0&&[charge,premium,minimum].every(Number.isFinite);
    // Inverse of N*rate + max(minimum,N*premium) + fixed fee.
    const available=amount-charge;
    const bought=!valid?NaN:amount<=0?0:currency==='RUB'?Math.max(0,Math.min((available-minimum)/chosen.rate,available/(chosen.rate+premium))):amount;
    const surcharge=bought>0?Math.max(minimum,bought*premium):0;
    const spend=bought>0?bought*chosen.rate+surcharge+charge:0;
    return {...chosen,valid,bought,surcharge,spend,charge,premium,minimum,blue};
}
function render(animate=false) {
    const currency=document.getElementById('currency').value;
    const entered=Number(document.getElementById('budget').value);
    const inputAmount=Number.isFinite(entered)?Math.max(0,entered):0;
    let amount=inputAmount;
    const q=id=>{const el=document.getElementById(id),quote=confirmedRates.quotes[id];if(!(id in rateManualOverrides)&&quote)return quote.value;const v=Number(el?.value);return el?.value!==''&&validRateValue(id,v)?v:NaN;};
    if(currency!=='RUB'){
        const costs=[1,2,3].filter(bankEnabled).map(i=>{const p=bankPurchase(currency.toLowerCase(),i,inputAmount,currency);return p.valid?p.spend:NaN;}).filter(Number.isFinite);
        amount=costs.length?Math.min(...costs):0;
    }
    const fxRub=q('forex_usd_rub'),fxThb=q('forex_usd_thb'),cross=fxRub/fxThb;
    const safe=v=>escapeHtml(String(v??''));
    const display=n=>Number.isFinite(n)?fmt(n):'—';
    const pct=eff=>cross>0?(eff/cross-1)*100:NaN;
    const badge=eff=>{const p=pct(eff);return Number.isFinite(p)?`<span class="spread-tag ${p<2.2?'good':''}">${p>=0?'наценка +':'отклонение '}${p.toFixed(2)}% к бирже</span>`:'';};
    const effective=eff=>Number.isFinite(eff)?`${eff.toFixed(3)} ₽ за 1 ฿`:'недоступен';
    const set=(id,v)=>{const el=document.getElementById(id);if(el)el.innerText=v;};
    set('benchThbRub',`1 ฿ = ${cross>0?cross.toFixed(3):'—'} ₽`);
    set('homeForexRate',document.getElementById('benchThbRub').innerText);
    set('benchCrossDetails',`(USD/RUB: ${display(fxRub)} • USD/THB: ${display(fxThb)})`);
    set('exchangeAmountHint',amount===0?'Введите сумму: к получению 0 ฿. Рейтинг по базовому курсу без фиксированного сбора; его влияние и оптовые тарифы рассчитываются при сумме больше нуля.':'Расчёт без округления до целых купюр; фактическую выдачу по номиналам и курс подтвердите в кассе.');
    const banks=['СКВ Лиговский','Камкомбанк','Банк Финам'];
    const order=(a,b)=>{
        const av=Number.isFinite(a.eff),bv=Number.isFinite(b.eff);
        if(av!==bv)return av?-1:1;
        return amount>0?(b.thb-a.thb||a.eff-b.eff||0):(a.eff-b.eff||0);
    };
    const cash=(code,index,sellId,destination)=>{
        const buyId=`${code}_spb_${index}`,feeId=`fee_spb_${index}`;
        const target=currency===code.toUpperCase()?bankPurchase(code,index,inputAmount,currency):null;
        const chosen=bankPurchase(code,index,amount),sell=q(sellId);
        const {spend,charge,bought,surcharge,premium,minimum}=chosen;
        const valid=chosen.valid&&sell>0;
        const thb=amount===0?0:valid?bought*sell:NaN;
        const eff=valid?(amount===0?(chosen.rate+premium)/sell:thb>0?spend/thb:Infinity):NaN;
        const unit=({usd:'$',eur:'€',cny:'¥'})[code];
        const notes=[confirmedRates.quotes[buyId]?.note,confirmedRates.quotes[feeId]?.note,confirmedRates.quotes[sellId]?.note].filter(Boolean);
        const detail=valid?`Базовый курс: ${display(chosen.rate)} ₽/${unit}${code==='usd'?` + наценка за новые $100: +${display(premium)} ₽/$ (мин. ${display(minimum)} ₽; итого ${display(surcharge)} ₽)`:''} + сбор кассы: ${display(charge)} ₽ ➔ Реальный курс: ${bought>0?display(spend/bought):display(chosen.rate+premium)} ₽/${unit}. Покупка ${display(bought)} ${unit}: ${display(bought*chosen.rate)} + ${display(surcharge)} + ${display(bought>0?charge:0)} = ${display(spend)} ₽; ${chosen.label}. Приём: ${sell.toFixed(quoteDigits(sellId))} ฿/${unit}. ${target?`Для ${display(inputAmount)} ${unit} нужно ${display(target.spend)} ₽. `:''}${amount>0&&bought===0?'Бюджета недостаточно для комиссии. ':''}`:'Недопустимый или отсутствующий курс/сбор: проверьте поля банка и обменника.';
        return {name:`${banks[index-1]} ➔ ${destination}`,thb,eff,spend,detail,notes:[...new Set(notes)].join(' ')};
    };
    const groups=[];
    const addGroup=(title,rows,note='')=>{rows=rows.filter(Boolean);if(!rows.length)return;rows.sort(order);groups.push({title,rows,note,thb:rows[0]?.thb??0,eff:rows[0]?.eff});};
    const bankRows=(code,sell,dest)=>exchangeEnabled(sell)?[1,2,3].filter(bankEnabled).map(i=>cash(code,i,sell,dest)):[];
    const bestBank=(code,sell,dest)=>bankRows(code,sell,dest).sort(order)[0];
    {
        addGroup('💵 Через наличные Доллары ($100)',[...bankRows('usd','usd_vp','Value Plus'),bestBank('usd','usd_ms','Money Shop Kata'),bestBank('usd','usd_beach','Обменники у пляжа Ката')],'USD нового образца. Старые $100 до 2006 г. в Лиговке дешевле, но приём в Таиланде может отличаться. Ката: отдельная котировка EXFM Карон рядом с Катой, не средний курс пляжа.');
        addGroup('💶 Через наличные Евро (€100–500)',[...bankRows('eur','eur_vp','Value Plus'),bestBank('eur','eur_ms','Money Shop Kata')]);
        addGroup('🇨🇳 Через наличные Юани (¥100)',bankRows('cny','cny_vp','Value Plus'));
        addGroup('📲 Онлайн перевод по СБП (без наличных)',[['Money Shop Phuket (СБП)','sbp_ms'],['EXFM.app (СБП)','sbp_fm']].filter(([,id])=>exchangeEnabled(id)).map(([name,id])=>{
            const t=selectedRate(id,amount,'RUB'),quote=confirmedRates.quotes[id];
            const thb=amount===0?0:amount/t.rate;
            let notes=quote?.note||'';
            if(quote?.unquotedTier&&thb>=quote.unquotedTier.min)notes+=' Порог достигнут: расчёт по базовому тарифу, индивидуальную котировку запросите у обменника.';
            if(quote?.unquotedBelow&&amount>0&&thb<quote.unquotedBelow)notes+=' Сумма ниже порога: показан ориентир, точный результат требует котировки.';
            return {name,thb,eff:t.rate,spend:amount,detail:`${display(amount)} ₽ / ${Number.isFinite(t.rate)?t.rate.toFixed(3):'—'} ₽/฿ = ${display(thb)} ฿`,notes};
        }));
    }
    groups.sort(order);
    const best=groups[0]?.thb||0;
    const comparison=(value,leader)=>{
        if(!Number.isFinite(value)||!Number.isFinite(leader))return '<span class="route-loss">Сравнение недоступно</span>';
        const loss=Math.max(0,leader-value);
        return loss<0.005?'<span class="profit">✓ Выгоднее всего</span>':`<span class="route-loss">−${display(loss)} ฿ / потеря ≈${display(loss*cross)} ₽ от 1-го места</span>`;
    };
    document.getElementById('output').innerHTML=groups.map((g,i)=>{
        const hierarchy=g.rows.map((r,j)=>`<div class="h-item ${j===0?'h-best':''}" data-effective="${Number.isFinite(r.eff)?r.eff:''}" data-thb="${Number.isFinite(r.thb)?r.thb:''}" data-spend="${Number.isFinite(r.spend)?r.spend:''}"><div><span class="h-name">${j+1}. ${safe(r.name)}</span><br><span class="sub-rate">${safe(r.detail)}</span><div class="route-effective">Итоговый курс: ${effective(r.eff)} ${badge(r.eff)}</div>${r.notes?`<details class="route-notes"><summary>Условия котировки</summary><small>${safe(r.notes)}</small></details>`:''}</div><div class="route-result"><strong>${display(r.thb)} ฿</strong><span>Отдать: ${display(r.spend)} ₽</span>${comparison(r.thb,g.thb)}</div></div>`).join('');
        return `<div class="card ${i===0?'best':''} ${animate?'flash':''}" data-effective="${Number.isFinite(g.eff)?g.eff:''}"><div class="head"><span>${g.title}</span><span class="result-amount">${display(g.thb)} ฿ <span class="usd-eq">(${display(g.thb===0?0:g.thb/fxThb)} $)</span></span></div><div class="rate-info">Общий бюджет: ${display(amount)} ₽ · Итоговый курс: <b>${effective(g.eff)}</b> ${badge(g.eff)} ${comparison(g.thb,best)}</div><div class="hierarchy-list">${hierarchy}</div>${g.note?`<p class="sub-rate">${safe(g.note)}</p>`:''}</div>`;
    }).join('');
    if(currency!=='RUB'){
        const ids={USD:[['Value Plus','usd_vp'],['Money Shop','usd_ms'],['Обменники у пляжа Ката','usd_beach']],EUR:[['Value Plus','eur_vp'],['Money Shop','eur_ms']],CNY:[['Value Plus','cny_vp']]}[currency]||[];
        const rows=ids.filter(([,id])=>exchangeEnabled(id)).map(([name,id])=>({name,id,rate:q(id),value:inputAmount*q(id)})).sort((a,b)=>(Number.isFinite(b.value)?b.value:-Infinity)-(Number.isFinite(a.value)?a.value:-Infinity));
        const unit={USD:'$',EUR:'€',CNY:'¥'}[currency];
        if(rows.length)document.getElementById('output').insertAdjacentHTML('afterbegin',`<div class="card best owned-cash"><div class="head">💵 Если наличные (${display(inputAmount)} ${unit}) уже на руках — сдача на Пхукете</div><div class="hierarchy-list">${rows.map((r,j)=>`<div class="h-item ${j===0?'h-best':''}" data-thb="${Number.isFinite(r.value)?r.value:''}"><div><span class="h-name">${j+1}. ${safe(r.name)}${currency==='USD'?(r.id==='usd_vp'?' ($50–100)':' ($100)'):''}</span><div class="sub-rate">Курс ${Number.isFinite(r.rate)?r.rate.toLocaleString('ru-RU',{maximumFractionDigits:quoteDigits(r.id)}):'—'} ฿/${unit}</div>${currency==='USD'?badge(fxRub/r.rate):'<small>Биржевой кросс-курс этой валюты не загружен.</small>'}</div><div class="route-result"><strong>${display(r.value)} ฿</strong>${comparison(r.value,rows[0].value)}</div></div>`).join('')}</div><p>Для покупки ${display(inputAmount)} ${unit} в лучшем банке по введённым условиям нужно ${display(amount)} ₽. Все маршруты ниже сравниваются на этот единый бюджет; потери в рублях — эквивалент по справочному кросс-курсу.</p></div>`);
    }
    if(!document.getElementById('output').innerHTML)document.getElementById('output').innerHTML='<div class="card">Выберите хотя бы один банк и обменник (или сервис СБП) для расчёта</div>';
    {
        const cashGroup=groups.find(g=>g.title.startsWith('💵')),sbpGroup=groups.find(g=>g.title.startsWith('📲'));
        set('homeBestCashRate',effective(cashGroup?.eff));set('homeCashSpread',`${display(pct(cashGroup?.eff))}% к бирже`);
        set('homeSbpRate',effective(sbpGroup?.eff));set('homeSbpSpread',`${display(pct(sbpGroup?.eff))}% к бирже`);
        set('homeBestSumPreview',`${display(amount)} ₽ → ${display(best)} ฿`);
    }
}


        function initPlannerUI() {
            const container = document.getElementById('categoriesContainer');
            container.innerHTML = '';
            categoriesData.forEach(cat => {
                container.innerHTML += `
                    <div class="cat-card">
                        <div class="cat-top">
                            <span class="cat-title">${cat.icon} ${cat.name}</span>
                            <span class="cat-amounts">
                                <span id="lbl_thb_${cat.id}">0 ฿</span>
                                <span class="usd-eq" id="lbl_usd_${cat.id}">~ 0 $</span>
                            </span>
                        </div>
                        <div class="cat-daily">
                            <span>В день на всех: <b id="lbl_day_${cat.id}">0 ฿</b> (<span id="lbl_day_usd_${cat.id}" style="color:var(--success);font-weight:700;">0 $</span>)</span>
                            <span>На 1 чел/день: <b id="lbl_pp_${cat.id}">0 ฿</b></span>
                        </div>
                        <div class="slider-row">
                            <input type="range" id="rng_${cat.id}" min="0" max="${cat.maxThb}" step="${cat.step}" value="${cat.val}" oninput="syncCatInput('${cat.id}', this.value)">
                            <input type="number" class="cat-num-input" id="num_${cat.id}" min="0" step="${cat.step}" value="${cat.val}" oninput="syncCatSlider('${cat.id}', this.value)">
                        </div>
                        <div class="cat-hint" id="hint_${cat.id}"></div>
                    </div>
                `;
            });
            updatePlanner();
        }

        function syncCatInput(id, val) {
            if (!canEditBudgetSubtab(activeBudgetSubtab)) return;
            document.getElementById('num_' + id).value = val;
            updatePlanner();
            persistActiveBudgetSubtab();
        }

        function syncCatSlider(id, val) {
            if (!canEditBudgetSubtab(activeBudgetSubtab)) return;
            const rng = document.getElementById('rng_' + id);
            if (parseFloat(val) > parseFloat(rng.max)) rng.max = parseFloat(val) * 1.2;
            rng.value = val || 0;
            updatePlanner();
            persistActiveBudgetSubtab();
        }

        function getBestRubToThbRate() {
            const spb1 = parseFloat(document.getElementById('usd_spb_1').value) || NaN;
            const usdVp = parseFloat(document.getElementById('usd_vp').value) || NaN;
            return spb1 / usdVp;
        }

        function getTotalBudgetInThb() {
            const b = parseFloat(document.getElementById('plan_budget').value) || 0;
            const curr = document.getElementById('plan_currency').value;
            return convertAnyBudgetToThb(b, curr);
        }

        function updatePlanner() {
            const usdVp = parseFloat(document.getElementById('usd_vp').value) || NaN;
            const rubPerThb = getBestRubToThbRate();
            const people = Math.max(1, parseInt(document.getElementById('plan_people').value) || 1);
            const days = Math.max(1, parseInt(document.getElementById('plan_days').value) || 1);

            const totalBudgetThb = getTotalBudgetInThb();
            const totalBudgetUsd = totalBudgetThb / usdVp;

            let totalSpentThb = 0;

            categoriesData.forEach(cat => {
                const numEl = document.getElementById('num_' + cat.id);
                if (!numEl) return;
                const valThb = parseFloat(numEl.value) || 0;
                totalSpentThb += valThb;

                const valUsd = valThb / usdVp;
                const dayThb = valThb / days;
                const dayUsd = dayThb / usdVp;
                const ppDayThb = dayThb / people;

                document.getElementById('lbl_thb_' + cat.id).innerText = fmtInt(valThb) + ' ฿';
                document.getElementById('lbl_usd_' + cat.id).innerText = `~ ${fmt(valUsd)} $`;
                document.getElementById('lbl_day_' + cat.id).innerText = fmtInt(dayThb) + ' ฿';
                document.getElementById('lbl_day_usd_' + cat.id).innerText = `${fmt(dayUsd)} $`;
                document.getElementById('lbl_pp_' + cat.id).innerText = fmtInt(ppDayThb) + ' ฿';

                const [tierTitle, hintText] = cat.getHint(ppDayThb, dayThb, valThb, people);
                document.getElementById('hint_' + cat.id).innerHTML = `<span class="tier-tag" style="color:var(--accent)">${tierTitle}</span> ${hintText}`;
            });

            const totalSpentUsd = totalSpentThb / usdVp;
            const reserveThb = totalBudgetThb - totalSpentThb;
            const reserveUsd = reserveThb / usdVp;
            const reserveRub = reserveThb * rubPerThb;

            document.getElementById('planTotalThb').innerText = fmtInt(totalBudgetThb) + ' ฿';
            document.getElementById('planTotalUsd').innerText = `${fmt(totalBudgetUsd)} $`;

            document.getElementById('planSpentThb').innerText = fmtInt(totalSpentThb) + ' ฿';
            document.getElementById('planSpentUsd').innerText = `${fmt(totalSpentUsd)} $`;
            document.getElementById('planDailyAvg').innerText = `${fmtInt(totalSpentThb / days)} ฿ / день (${fmt((totalSpentThb / days) / usdVp)} $)`;

            document.getElementById('homePlanTotal').innerText = `${fmtInt(totalBudgetThb)} ฿`;
            document.getElementById('homePlanTotalUsd').innerText = `${fmt(totalBudgetUsd)} $`;
            document.getElementById('homePlanDaily').innerText = `${fmtInt(totalSpentThb / days)} ฿/день (${fmtInt((totalSpentThb / days) / people)} ฿/чел)`;
            const homeResEl = document.getElementById('homePlanReserve');
            homeResEl.innerText = `${reserveThb >= 0 ? '+' : ''}${fmtInt(reserveThb)} ฿ (${fmt(reserveUsd)} $)`;
            homeResEl.style.color = reserveThb >= 0 ? 'var(--success)' : 'var(--danger)';

            const resBox = document.getElementById('reserveBox');
            const resLabel = document.getElementById('reserveLabel');
            const resThbEl = document.getElementById('planReserveThb');
            const resUsdEl = document.getElementById('planReserveUsd');

            if (reserveThb >= 0) {
                resLabel.innerText = "Свободный резерв";
                resThbEl.style.color = "var(--success)";
                resThbEl.innerText = `+${fmtInt(reserveThb)} ฿`;
                resUsdEl.style.color = "var(--success)";
                resUsdEl.innerText = `+${fmt(reserveUsd)} $`;
                document.getElementById('planReserveRub').innerText = `~ +${fmtInt(reserveRub)} ₽ в запасе`;
                resBox.style.borderColor = "rgba(52, 199, 89, 0.4)";
            } else {
                resLabel.innerText = "⚠️ Перерасход бюджета";
                resThbEl.style.color = "var(--danger)";
                resThbEl.innerText = `${fmtInt(reserveThb)} ฿`;
                resUsdEl.style.color = "var(--danger)";
                resUsdEl.innerText = `${fmt(reserveUsd)} $`;
                document.getElementById('planReserveRub').innerText = `Не хватает ~ ${fmtInt(Math.abs(reserveRub))} ₽`;
                resBox.style.borderColor = "rgba(255, 59, 48, 0.5)";
            }

            const pct = totalBudgetThb > 0 ? (totalSpentThb / totalBudgetThb) * 100 : 0;
            const bar = document.getElementById('planProgressBar');
            bar.style.width = Math.min(100, pct) + '%';
            if (pct <= 85) bar.style.backgroundColor = 'var(--success)';
            else if (pct <= 100) bar.style.backgroundColor = 'var(--warning)';
            else bar.style.backgroundColor = 'var(--danger)';

            document.getElementById('planProgressText').innerText = `Распределено: ${pct.toFixed(1)}% бюджета (Резерв: ${Math.max(0, 100 - pct).toFixed(1)}%)`;
            document.getElementById('planPerPersonText').innerText = `Средний расход на 1 чел/день: ${fmtInt((totalSpentThb / days) / people)} ฿ (${fmt(((totalSpentThb / days) / people) / usdVp)} $)`;

            updateScheduleBudgetSnapshot();
        }

        function applyPreset(mode) {
            if (!canEditBudgetSubtab(activeBudgetSubtab)) return;
            const people = Math.max(1, parseInt(document.getElementById('plan_people').value) || 1);
            const days = Math.max(1, parseInt(document.getElementById('plan_days').value) || 1);

            categoriesData.forEach(cat => {
                const dailyPerPerson = cat.presets[mode] || cat.presets.comfort;
                const calcTotal = Math.round((dailyPerPerson * people * days) / 500) * 500;
                const rng = document.getElementById('rng_' + cat.id);
                if (calcTotal > parseFloat(rng.max)) rng.max = calcTotal * 1.25;
                rng.value = calcTotal;
                document.getElementById('num_' + cat.id).value = calcTotal;
            });
            updatePlanner();
            persistActiveBudgetSubtab();
            const modeNames = { eco: 'Эконом-режим', comfort: 'Комфорт', lux: 'На широкую ногу' };
            logUserActivity(`Применил(а) пресет бюджета «${modeNames[mode] || mode}»`, 'planner');
        }

        function fitToBudget() {
            if (!canEditBudgetSubtab(activeBudgetSubtab)) return;
            const totalBudgetThb = getTotalBudgetInThb();
            if (totalBudgetThb <= 0) {
                alert('Сначала укажите сумму вашего бюджета выше!');
                return;
            }
            const targetSpend = totalBudgetThb * 0.85;

            let currentTotal = 0;
            categoriesData.forEach(cat => {
                currentTotal += parseFloat(document.getElementById('num_' + cat.id).value) || 1000;
            });

            categoriesData.forEach(cat => {
                const cur = parseFloat(document.getElementById('num_' + cat.id).value) || 1000;
                const share = cur / currentTotal;
                const newVal = Math.round((targetSpend * share) / 100) * 100;
                const rng = document.getElementById('rng_' + cat.id);
                if (newVal > parseFloat(rng.max)) rng.max = newVal * 1.25;
                rng.value = newVal;
                document.getElementById('num_' + cat.id).value = newVal;
            });
            updatePlanner();
            persistActiveBudgetSubtab();
            logUserActivity(`Сбалансировал(а) категории бюджета с 15% резервом`, 'planner');
        }


if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("DOMContentLoaded", initializeRateInputs);
