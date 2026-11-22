        // Six constituent fit to 720 hourly predictions, Ko Thaphao Noi, November 2026.
        // Source: https://www.faraway-yachting.com/phuket-tide-table (checked 2026-11-22).
        // Cross-check extrema: https://www.thailandtidetables.com/tide-tables-koh-tapao-noi-phuket-461.php
        // Continuous UTC phase avoids midnight / lunar-month jumps. Datum is the source table's
        // station level, NOT bathing depth. Outside November 2026 this is unvalidated extrapolation.
        const PHUKET_TIDE_FIT = {
            epochUtcMs: Date.UTC(2026, 9, 31, 17),
            periods: [12.4206012,12,12.65834751,23.93447213,25.81933871,6.2103006],
            coefficients: [2.0980061486,0.0109183755,0.7550342313,0.3034958546,-0.2180026646,-0.0559131781,0.1495573023,0.1615797971,-0.0011112807,0.0440849679,0.0292809875,0.0085430658,-0.000595872]
        };

        function calcPhuketTideMeters(dateUtcMs) {
            const synodicDays = 29.530588853;
            const age = (dateUtcMs - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
            const lunarAgeDays = ((age % synodicDays) + synodicDays) % synodicDays;
            const hours = (dateUtcMs - PHUKET_TIDE_FIT.epochUtcMs) / 3600000;
            let height = PHUKET_TIDE_FIT.coefficients[0];
            PHUKET_TIDE_FIT.periods.forEach((period, i) => {
                const phase = 2 * Math.PI * hours / period;
                height += PHUKET_TIDE_FIT.coefficients[1 + 2 * i] * Math.cos(phase)
                    + PHUKET_TIDE_FIT.coefficients[2 + 2 * i] * Math.sin(phase);
            });
            return { height, lunarAgeDays };
        }

        function getPhuketTimeParts(dateUtcMs) {
            const phuketDate = new Date(dateUtcMs + 7 * 3600000);
            const hh = String(phuketDate.getUTCHours()).padStart(2, '0');
            const mm = String(phuketDate.getUTCMinutes()).padStart(2, '0');
            return { hh, mm, hoursFloat: phuketDate.getUTCHours() + phuketDate.getUTCMinutes() / 60, phuketDate };
        }

        // The station level is a comfort guide, not the water depth at the beach.
        function calcBestBeachVisitWindow(beach, nowUtcMs) {
            const local = getPhuketTimeParts(nowUtcMs);
            const date = local.phuketDate;
            const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - 7 * 3600000;
            const scanDay = dayStart => {
                const samples = [];
                for (let minute = 390; minute <= 1110; minute += 10) {
                    samples.push({ minute, height: calcPhuketTideMeters(dayStart + minute * 60000).height });
                }
                const peak = samples.reduce((a, b) => b.height > a.height ? b : a);
                const range = (start, end) => {
                    const heights = samples.filter(s => s.minute >= start && s.minute <= end).map(s => s.height);
                    return { start, end, min: Math.min(...heights), max: Math.max(...heights) };
                };
                const peakWindow = range(Math.max(390, peak.minute - 120), Math.min(1110, peak.minute + 120));
                const any = beach.bestTidePhase === 'any';
                const intervals = [];
                let start = null;
                if (any) {
                    intervals.push(range(420, 1080));
                } else {
                    samples.forEach((sample, i) => {
                        if (sample.height >= beach.minComfortMeters && start === null) start = sample.minute;
                        if (start !== null && (sample.height < beach.minComfortMeters || i === samples.length - 1)) {
                            const end = sample.height < beach.minComfortMeters ? samples[i - 1].minute : sample.minute;
                            if (end > start) intervals.push(range(start, end));
                            start = null;
                        }
                    });
                }
                const fallback = intervals.length === 0;
                if (fallback) intervals.push(peakWindow);
                return { dayStartUtcMs: dayStart, intervals, peak, peakWindow, fallback, any };
            };
            const today = scanDay(midnight);
            const tomorrow = scanDay(midnight + 86400000);
            const minuteNow = (nowUtcMs - midnight) / 60000;
            const hasTimeToday = today.intervals.some(w => w.end > minuteNow);
            const selectedDay = minuteNow >= 1020 || !hasTimeToday ? 'tomorrow' : 'today';
            const inWindow = today.intervals.some(w => minuteNow >= w.start && minuteNow < w.end);
            const levelComfortable = beach.bestTidePhase === 'any' || calcPhuketTideMeters(nowUtcMs).height >= beach.minComfortMeters;
            const isGoodNow = selectedDay === 'today' && inWindow && levelComfortable;
            return { today, tomorrow, selectedDay, selected: selectedDay === 'today' ? today : tomorrow, isGoodNow };
        }

        function formatTideMinute(minute) {
            return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
        }

        function formatBeachVisitDay(day, beach) {
            const time = w => `<span class="beach-visit-range">${formatTideMinute(w.start)}–${formatTideMinute(w.end)}</span>`;
            const levels = w => `${w.min.toFixed(1)}–${w.max.toFixed(1)} м`;
            if (day.any) {
                return `Весь световой день (<span class="beach-visit-range">07:00–18:00</span>); у пика прилива ~${time(day.peakWindow)} (уровень ${levels(day.peakWindow)})`;
            }
            const times = day.intervals.map(w => `~${time(w)} (уровень ${levels(w)})`).join(' и ');
            return day.fallback
                ? `${times} — лучшее доступное окно вокруг дневного пика ${day.peak.height.toFixed(1)} м; комфортный порог ${beach.minComfortMeters.toFixed(1)} м не достигается устойчиво`
                : times;
        }

        function renderBeachTideAdvice(beach, nowUtcMs, visit = calcBestBeachVisitWindow(beach, nowUtcMs)) {
            const dayLabel = visit.selectedDay === 'today' ? 'сегодня' : 'завтра';
            return `<div class="beach-visit-box beach-visit-${beach.bestTidePhase}">
                <div class="beach-visit-header">
                    <strong class="beach-visit-phase">${beach.bestTideTitle}</strong>
                    <span class="beach-visit-status ${visit.isGoodNow ? 'is-good' : 'is-later'}">${visit.isGoodNow ? '🟢 Сейчас ок' : '⏳ Лучше позже'}</span>
                </div>
                <div class="beach-visit-time">⏰ Лучше подойти ${dayLabel} днём: ${formatBeachVisitDay(visit.selected, beach)} <span class="beach-visit-zone">(Пхукет, UTC+7)</span></div>
                ${visit.isGoodNow ? '<div class="beach-visit-now">🟢 Сейчас хорошее время по уровню воды</div>' : ''}
                <div class="beach-visit-reason">${beach.bestTideReason}</div>
                ${beach.accessNote ? `<div class="beach-access-note">🚶 ${beach.accessNote}</div>` : ''}
                <small>Уровень станции, не глубина у берега. Учитывайте волны, флаги и доступ.</small>
            </div>`;
        }

        function renderBeachVisitDetails(beach, visit) {
            return `<div class="beach-visit-details"><b>⏰ Оптимальное время посещения (сегодня и завтра)</b>
                <div>Сегодня днём: ${formatBeachVisitDay(visit.today, beach)}</div>
                <div>Завтра днём: ${formatBeachVisitDay(visit.tomorrow, beach)}</div>
                <small>Время Пхукета, UTC+7. Оба дня приведены полностью; текущее рекомендуемое окно — над кнопкой.</small>
            </div>`;
        }

        function evaluateBeachSwimSafety(beach, waveH, tideHeight) {
            const knownWave = Number.isFinite(waveH);
            const tideSuitable = beach.bestTidePhase === 'any' || tideHeight >= beach.minComfortMeters;
            let swimClass = 'swim-yes', swimDecision = '✅ УСЛОВИЯ БЛАГОПРИЯТНЫ — проверьте флаги';
            let statusClass = 'pill-good', statusText = '🟢 Подходит по воде и волнам', borderCol = 'var(--success)';
            let score = knownWave ? 100 - waveH * 38 : -1000;
            const waveLabel = knownWave ? `Расчётная волна: ${waveH.toFixed(2)} м` : 'Нет данных о волнах';
            if (!tideSuitable) score -= 45 + Math.max(0, beach.minComfortMeters - tideHeight) * 20;
            if (beach.accessNeedsCheck) score -= 60;
            if (geoState.enabled && Number.isFinite(geoState.lat) && Number.isFinite(geoState.lon)) {
                if (calcDistanceKm(geoState.lat, geoState.lon, beach.lat, beach.lon) < 8) score += 6;
            }
            if (knownWave && waveH >= 1.35) {
                swimClass = 'swim-no'; swimDecision = '⛔ СИЛЬНОЕ ВОЛНЕНИЕ — не рекомендуем купание';
                statusClass = 'pill-bad'; statusText = '🔴 Высокая волна'; borderCol = 'var(--danger)';
            } else if (!knownWave || waveH >= 0.85 || !tideSuitable || beach.accessNeedsCheck) {
                swimClass = 'swim-caution'; statusClass = 'pill-warn'; borderCol = 'var(--warning)';
                if (!knownWave) { swimDecision = '⚠️ НЕТ ДАННЫХ О ВОЛНАХ — оценка неполная'; statusText = '🟡 Нужна проверка на месте'; }
                else if (waveH >= 0.85) { swimDecision = '⚠️ ОЩУТИМЫЙ ПРИБОЙ — нужна осторожность'; statusText = '🟡 Умеренная волна'; }
                else if (!tideSuitable) { swimDecision = beach.reefAtLowTide ? '⛔ МАЛО ВОДЫ НАД РИФОМ — не рекомендуем купание' : '⚠️ ВОДА НИЖЕ РЕКОМЕНДУЕМОЙ — лучше дождаться подъёма'; statusText = '🟡 Низкий уровень воды'; }
                else { swimDecision = '⚠️ ПЕРЕД ПОЕЗДКОЙ УТОЧНИТЕ ДОСТУП'; statusText = '🟡 Доступ ограничен / не подтверждён'; }
            }
            return { swimClass, swimDecision, waveLabel, statusClass, statusText, borderCol, score,
                eligible: knownWave && waveH < 0.85 && tideSuitable && !beach.accessNeedsCheck };
        }

        function renderTideChartAndExtremes(nowUtcMs) {
            const { hh, mm, hoursFloat, phuketDate } = getPhuketTimeParts(nowUtcMs);
            document.getElementById('phuketClock').innerText = `Время на Пхукете: ${hh}:${mm} (UTC+7)`;

            const startOfPhuketDayUtcMs = Date.UTC(
                phuketDate.getUTCFullYear(),
                phuketDate.getUTCMonth(),
                phuketDate.getUTCDate(),
                0, 0, 0
            ) - 7 * 3600000;

            const samples = [];
            for (let m = 0; m <= 1440; m += 5) {
                const tMs = startOfPhuketDayUtcMs + m * 60000;
                const { height } = calcPhuketTideMeters(tMs);
                samples.push({ min: m, hour: m / 60, height, tMs });
            }

            const extremes = [];
            for (let i = 1; i < samples.length - 1; i++) {
                const prev = samples[i - 1].height;
                const cur = samples[i].height;
                const next = samples[i + 1].height;
                if (cur >= prev && cur > next) {
                    extremes.push({ type: 'HIGH', label: '🔺 Прилив (Пик)', ...samples[i] });
                } else if (cur <= prev && cur < next) {
                    extremes.push({ type: 'LOW', label: '🔻 Отлив (Мин)', ...samples[i] });
                }
            }

            const nowTide = calcPhuketTideMeters(nowUtcMs);
            const futureTide = calcPhuketTideMeters(nowUtcMs + 20 * 60000);
            const isRising = futureTide.height >= nowTide.height;

            document.getElementById('tideCurrentHeight').innerText = `${nowTide.height.toFixed(2)} м`;
            document.getElementById('tideCurrentTrend').innerHTML = isRising
                ? `<span style="color:var(--success)">⬆️ Идет прилив</span>`
                : `<span style="color:var(--warning)">⬇️ Идет отлив</span>`;
            document.getElementById('lunarAgeLabel').innerText = `Лунные сутки: ${nowTide.lunarAgeDays.toFixed(1)} дн. (${nowTide.lunarAgeDays < 3 || (nowTide.lunarAgeDays > 13 && nowTide.lunarAgeDays < 17) ? 'Сизигия — большие приливы' : 'Умеренная амплитуда'})`;

            document.getElementById('homeTideHeight').innerText = `${nowTide.height.toFixed(2)} м`;
            document.getElementById('homeTidePhase').innerHTML = isRising
                ? `<span style="color:var(--success)">⬆️ Прилив</span>`
                : `<span style="color:var(--warning)">⬇️ Отлив</span>`;

            const extBox = document.getElementById('tideExtremesContainer');
            extBox.innerHTML = '';
            let nextExtText = '';
            extremes.slice(0, 4).forEach(ex => {
                const eh = String(Math.floor(ex.min / 60)).padStart(2, '0');
                const em = String(ex.min % 60).padStart(2, '0');
                const color = ex.type === 'HIGH' ? 'var(--success)' : 'var(--warning)';
                if (!nextExtText && (ex.min / 60) >= hoursFloat) {
                    nextExtText = `${ex.type === 'HIGH' ? 'Пик прилива' : 'Минимум отлива'} в ${eh}:${em} (${ex.height.toFixed(2)} м)`;
                }
                extBox.innerHTML += `
                    <div class="ext-badge">
                        <span style="color:${color}; font-weight:700;">${ex.label}</span>
                        <b>${eh}:${em} — ${ex.height.toFixed(2)} м</b>
                    </div>
                `;
            });
            if (!nextExtText) {
                for (let m = 5; m <= 1440; m += 5) {
                    const t = startOfPhuketDayUtcMs + 86400000 + m * 60000;
                    const prev = calcPhuketTideMeters(t - 300000).height, cur = calcPhuketTideMeters(t).height, next = calcPhuketTideMeters(t + 300000).height;
                    if ((cur > prev && cur >= next) || (cur < prev && cur <= next)) {
                        const p = getPhuketTimeParts(t);
                        nextExtText = `Завтра: ${cur > prev ? 'пик прилива' : 'минимум отлива'} ~${p.hh}:${p.mm} (${cur.toFixed(2)} м)`;
                        break;
                    }
                }
            }
            document.getElementById('homeNextExtreme').innerText = nextExtText;

            const w = 640, h = 110, padL = 28, padR = 12, padT = 14, padB = 22;
            const plotW = w - padL - padR;
            const plotH = h - padT - padB;
            const minH = Math.min(0, ...samples.map(s => s.height)), maxH = Math.max(3.5, ...samples.map(s => s.height + 0.1));

            const toX = (hr) => padL + (hr / 24) * plotW;
            const toY = (val) => padT + (1 - (val - minH) / (maxH - minH)) * plotH;

            let pathD = '';
            samples.forEach((s, idx) => {
                const x = toX(s.hour).toFixed(1);
                const y = toY(s.height).toFixed(1);
                pathD += (idx === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
            });
            const areaD = `${pathD} L ${toX(24).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${padL} ${(padT + plotH).toFixed(1)} Z`;

            const curX = toX(hoursFloat).toFixed(1);
            const curY = toY(nowTide.height).toFixed(1);

            const svgHtml = `
                <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="tideGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#007aff" stop-opacity="0.45"/>
                            <stop offset="100%" stop-color="#007aff" stop-opacity="0.02"/>
                        </linearGradient>
                    </defs>
                    <line x1="${padL}" y1="${toY(1.78).toFixed(1)}" x2="${w - padR}" y2="${toY(1.78).toFixed(1)}" stroke="#8b949e" stroke-opacity="0.3" stroke-dasharray="3,3" stroke-width="1"/>
                    <path d="${areaD}" fill="url(#tideGrad)"/>
                    <path d="${pathD}" fill="none" stroke="#007aff" stroke-width="2.4"/>
                    <line x1="${curX}" y1="${padT}" x2="${curX}" y2="${padT + plotH}" stroke="#34c759" stroke-width="1.5" stroke-dasharray="2,2"/>
                    <circle cx="${curX}" cy="${curY}" r="4.5" fill="#34c759" stroke="#fff" stroke-width="1.5"/>
                    <text x="${Math.min(w - 75, Math.max(padL, parseFloat(curX) - 28))}" y="${Math.max(12, parseFloat(curY) - 8)}" fill="#34c759" font-size="10" font-weight="bold">Сейчас ${nowTide.height.toFixed(2)}м</text>
                    <text x="${padL}" y="${h - 5}" fill="#8b949e" font-size="9.5">00:00</text>
                    <text x="${toX(6) - 12}" y="${h - 5}" fill="#8b949e" font-size="9.5">06:00</text>
                    <text x="${toX(12) - 12}" y="${h - 5}" fill="#8b949e" font-size="9.5">12:00</text>
                    <text x="${toX(18) - 12}" y="${h - 5}" fill="#8b949e" font-size="9.5">18:00</text>
                    <text x="${w - padR - 28}" y="${h - 5}" fill="#8b949e" font-size="9.5">24:00</text>
                </svg>
            `;
            document.getElementById('tideSvgContainer').innerHTML = svgHtml;

            return { nowHeight: nowTide.height, isRising, extremes };
        }

        function toggleBeachCard(id) {
            const details = document.getElementById('beach_details_' + id);
            const btn = document.getElementById('beach_btn_' + id);
            const iframeHolder = document.getElementById('beach_map_' + id);
            if (!details || !btn || !iframeHolder) return;
            const isOpen = details.classList.toggle('open');
            btn.setAttribute('aria-expanded', String(isOpen));

            if (isOpen) {
                btn.innerHTML = '🔼 Скрыть карту и подробное досье пляжа';
                if (!iframeHolder.dataset.loaded) {
                    const b = westBeaches.find(x => x.id === id);
                    if (b) {
                        const bbox = `${(b.lon - 0.006).toFixed(4)}%2C${(b.lat - 0.004).toFixed(4)}%2C${(b.lon + 0.006).toFixed(4)}%2C${(b.lat + 0.004).toFixed(4)}`;
                        iframeHolder.innerHTML = `<iframe title="Карта пляжа ${b.name}" loading="lazy" width="100%" height="100%" frameborder="0" scrolling="no" src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${b.lat}%2C${b.lon}"></iframe>`;
                        iframeHolder.dataset.loaded = '1';
                    }
                }
            } else {
                btn.innerHTML = '🗺️ Открыть карту пляжа и подробное досье';
            }
        }

        async function fetchJsonResilient(url, timeoutMs = 4500) {
            const endpoints = [
                url,
                `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
                `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
            ];
            for (const ep of endpoints) {
                try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), timeoutMs);
                    const res = await fetch(ep, { signal: controller.signal });
                    clearTimeout(timer);
                    if (res.ok) {
                        const json = await res.json();
                        if (json && !json.error) return json;
                    }
                } catch (e) {}
            }
            return null;
        }

        let tidesSnapshot = null;
        let tidesScanInFlight = false;

        function formatMarineValue(value, digits) {
            return Number.isFinite(value) ? value.toFixed(digits) : '—';
        }

        function renderTidesDashboard(nowUtcMs, marineResults, sourceName, wavesFresh) {
            const tideInfo = renderTideChartAndExtremes(nowUtcMs);
            const container = document.getElementById('westBeachesContainer');
            const focusedId = document.activeElement?.id;
            const preserved = new Map();
            if (container) {
                container.querySelectorAll('.beach-details.open').forEach(el => {
                    const id = el.id.replace('beach_details_', '');
                    preserved.set(id, document.getElementById('beach_map_' + id));
                });
            }
            let cardsHtml = '';

            const scoredBeaches = [];

            westBeaches.forEach((b, idx) => {
                const m = marineResults[idx]?.current || {};
                const rawWave = Number.isFinite(m.wave_height) && m.wave_height >= 0 ? m.wave_height : null;
                const waveH = rawWave === null ? null : +(rawWave * (b.waveExposure || 1.0)).toFixed(2);
                const waveP = Number.isFinite(m.wave_period) ? m.wave_period : null;
                const seaT = Number.isFinite(m.sea_surface_temperature) ? m.sea_surface_temperature : null;

                const visit = calcBestBeachVisitWindow(b, nowUtcMs);
                const evalRes = evaluateBeachSwimSafety(b, waveH, tideInfo.nowHeight);
                if (!wavesFresh) {
                    evalRes.eligible = false;
                    evalRes.swimClass = 'swim-caution';
                    evalRes.statusClass = 'pill-warn';
                    evalRes.statusText = '🟡 Нет свежих данных о волнах';
                    evalRes.borderCol = 'var(--warning)';
                }
                scoredBeaches.push({ beach: b, waveH, waveP, seaT, evalRes });

                if (idx === 0) {
                    const kataSwimShort = !Number.isFinite(waveH) ? 'Нет данных' : !wavesFresh ? 'Кэш' : waveH >= 1.35 ? '⛔ Волны' : waveH >= 0.85 ? '⚠️ Прибой' : tideInfo.nowHeight < b.minComfortMeters ? '⚠️ Мелко' : '🟢 Слабая волна';
                    document.getElementById('tideSeaTemp').innerText = `${formatMarineValue(waveH, 2)}м • ${kataSwimShort}`;
                    document.getElementById('homeSeaTemp').innerText = `+${formatMarineValue(seaT, 1)} °C`;
                    document.getElementById('homeWaveSummary').innerText = `Волна: ${formatMarineValue(waveH, 2)} м (${waveH === null ? 'нет данных' : !wavesFresh ? 'кэш' : waveH < 0.5 ? 'слабая' : (waveH < 0.9 ? 'умеренная' : 'сильная')})`;
                    const homeBanner = document.getElementById('homeSwimBanner');
                    homeBanner.className = `swim-verdict-banner ${evalRes.swimClass}`;
                    document.getElementById('homeSwimVerdict').innerText = wavesFresh ? evalRes.swimDecision : '⚠️ Нет свежих данных о волнах — проверьте море на месте';
                }

                const curWaterNote = tideInfo.nowHeight < (b.minComfortMeters || 1.4)
                    ? `Сейчас <b>малая вода (${tideInfo.nowHeight.toFixed(2)} м)</b>: ${b.lowTideImpact}`
                    : `Сейчас <b>высокая/средняя вода (${tideInfo.nowHeight.toFixed(2)} м)</b>: ${b.highTideImpact}`;

                if (container) {
                    cardsHtml += `
                        <div class="beach-card" style="border-left-color: ${evalRes.borderCol};">
                            <div class="beach-header">
                                <div>
                                    <div class="beach-title">${idx + 1}. ${b.name}</div>
                                    <div class="beach-sub">${b.sub}</div>
                                </div>
                                <span class="status-pill ${evalRes.statusClass}">${evalRes.statusText}</span>
                            </div>

                            <div class="swim-verdict-banner ${evalRes.swimClass}">
                                <span>${wavesFresh ? evalRes.swimDecision : '⚠️ Нет свежих данных о волнах; ниже — оценка по кэшу, если он доступен'}</span>
                                <span>${evalRes.waveLabel}</span>
                            </div>

                            <div class="beach-metrics">
                                <div class="bm-item">
                                    <span class="bm-lbl">Высота волны</span>
                                    <span class="bm-val">${formatMarineValue(waveH, 2)} м (период ${formatMarineValue(waveP, 0)} с)</span>
                                </div>
                                <div class="bm-item">
                                    <span class="bm-lbl">Вода в море</span>
                                    <span class="bm-val">+${formatMarineValue(seaT, 1)} °C</span>
                                </div>
                                <div class="bm-item">
                                    <span class="bm-lbl">Прилив сейчас</span>
                                    <span class="bm-val">${tideInfo.nowHeight.toFixed(2)} м (${tideInfo.isRising ? '⬆️ прилив' : '⬇️ отлив'})</span>
                                </div>
                            </div>

                            <div class="beach-desc">
                                🌊 ${curWaterNote}
                            </div>

                            ${renderBeachTideAdvice(b, nowUtcMs, visit)}
                            <button type="button" aria-expanded="false" aria-controls="beach_details_${b.id}" class="beach-expand-btn" id="beach_btn_${b.id}" onclick="toggleBeachCard('${b.id}')">
                                🗺️ Открыть карту пляжа и подробное досье
                            </button>

                            <div class="beach-details" id="beach_details_${b.id}">
                                ${renderBeachVisitDetails(b, visit)}
                                <div style="font-size:0.8rem; line-height:1.45; color:var(--desc-text);">
                                    <p style="margin:4px 0;"><b>🏖️ Рельеф дна и вход:</b> ${b.bottomType}</p>
                                    <p style="margin:4px 0;"><b>🔻 Поведение в отлив:</b> ${b.lowTideImpact}</p>
                                    <p style="margin:4px 0;"><b>🔺 Поведение в прилив:</b> ${b.highTideImpact}</p>
                                    <p style="margin:4px 0;"><b>🤿 Где смотреть рыбок (снорклинг):</b> ${b.snorkeling}</p>
                                    <p style="margin:4px 0;"><b>🍹 Инфраструктура:</b> ${b.infra}</p>
                                </div>
                                <div class="map-frame" id="beach_map_${b.id}"></div>
                                <div class="map-links">
                                    <a class="map-link-a" href="https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lon}" target="_blank" rel="noopener">📍 Открыть точку в Google Maps</a>
                                    <a class="map-link-a" href="https://www.windy.com/${b.lat}/${b.lon}?waves,${b.lat},${b.lon},14" target="_blank" rel="noopener">🌊 Волны на Windy</a>
                                </div>
                            </div>
                        </div>
                    `;
                }
            });

            if (container) {
                container.innerHTML = cardsHtml;
                preserved.forEach((map, id) => {
                    document.getElementById('beach_map_' + id).replaceWith(map);
                    toggleBeachCard(id);
                });
                if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
            }
            scoredBeaches.sort((a, b) => b.evalRes.score - a.evalRes.score);
            const top3Html = scoredBeaches.filter(item => item.evalRes.eligible).slice(0, 3).map((item, i) => `
                <div class="top3-item">
                    <div style="font-weight:700; color:var(--heading); margin-bottom:3px;">🥇 #${i + 1}. ${item.beach.name.replace('Пляж ', '')}</div>
                    <div style="color:var(--success); font-weight:600; font-size:0.75rem;">${item.evalRes.swimDecision.replace('✅ ', '')}</div>
                    <div style="color:var(--muted); font-size:0.74rem; margin-top:3px;">Волна: <b>${formatMarineValue(item.waveH, 2)} м</b> • Вода: +${formatMarineValue(item.seaT, 1)}°C</div>
                    <div style="color:var(--desc-text); font-size:0.73rem; margin-top:3px;">${item.beach.bottomType}</div>
                </div>
            `).join('') || '<div class="top3-empty">Нет подтверждённых кандидатов для купания: проверьте свежие волны, уровень воды и доступ. Пригодных пляжей может быть меньше трёх.</div>';

            const homeTop3 = document.getElementById('homeTop3Beaches');
            const tidesTop3 = document.getElementById('tidesTop3Beaches');
            if (homeTop3) homeTop3.innerHTML = top3Html;
            if (tidesTop3) tidesTop3.innerHTML = top3Html;


            const st = document.getElementById('tidesStatus');
            const p = getPhuketTimeParts(nowUtcMs);
            const calibrated = p.phuketDate.getUTCFullYear() === 2026 && p.phuketDate.getUTCMonth() === 10;
            if (st) {
                st.className = 'status-bar active';
                st.innerHTML = `● Расчёт на ${p.hh}:${p.mm} (UTC+7). Волны: ${sourceName}. Приливы: приближённая модель Ko Taphao Noi; ${calibrated ? 'калибровка — ноябрь 2026' : 'вне проверенного периода, сверяйте таблицу станции'}.`;
            }
        }

        async function scanRealTimeTides() {
            if (tidesScanInFlight) return;
            tidesScanInFlight = true;
            const btn = document.getElementById('scanTidesBtn');
            if (btn) { btn.disabled = true; btn.innerText = '⏳ Обновляем волны и рекомендации...'; }
            try {
                if (!tidesSnapshot) renderTidesDashboard(Date.now(), [], 'загрузка прогноза волн', false);
                const lats = westBeaches.map(b => b.lat).join(',');
                const lons = westBeaches.map(b => b.lon).join(',');
                const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&current=wave_height,wave_direction,wave_period,sea_surface_temperature&timezone=Asia%2FBangkok`;
                const data = await fetchJsonResilient(url, 4500);
                let results = [], sourceName = 'нет свежих данных', wavesFresh = false;
                if (data) {
                    results = Array.isArray(data) ? data : [data];
                    sourceName = 'Open-Meteo Marine (прогноз)'; wavesFresh = true;
                    saveOfflineCache('marine', results);
                } else {
                    const cached = loadOfflineCache('marine');
                    if (Array.isArray(cached?.data)) {
                        results = cached.data;
                        sourceName = 'оффлайн-кэш, свежесть не подтверждена';
                    }
                }
                tidesSnapshot = { results, sourceName, wavesFresh, fetchedAt: Date.now() };
                renderTidesDashboard(Date.now(), results, sourceName, wavesFresh);
            } catch (error) {
                renderTidesDashboard(Date.now(), tidesSnapshot?.results || [], 'ошибка обновления, свежесть не подтверждена', false);
            } finally {
                tidesScanInFlight = false;
                if (btn) { btn.disabled = false; btn.innerText = '📡 Обновить приливы, волны и рекомендации (20 пляжей)'; }
            }
        }

        // Recalculate times and both Top-3 lists without repeating marine requests.
        setInterval(() => {
            if (!tidesSnapshot || document.hidden) return;
            const s = tidesSnapshot;
            renderTidesDashboard(Date.now(), s.results, s.sourceName,
                s.wavesFresh && Date.now() - s.fetchedAt < 3600000);
        }, 60000);

        let currentWindyLayer = 'wind';

        function updateWindyEmbed() {
            const sel = document.getElementById('weatherDistrictSelect');
            if (!sel || !phuketDistricts[sel.value]) {
                if (sel) sel.value = 'kata';
            }
            const key = sel ? sel.value : 'kata';
            const d = phuketDistricts[key] || phuketDistricts.kata;
            document.getElementById('windyCoordsLabel').innerText = `${d.name} (${d.lat.toFixed(4)}° N, ${d.lon.toFixed(4)}° E)`;
            const src = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=m/s&zoom=11&overlay=${currentWindyLayer}&product=ecmwf&level=surface&lat=${d.lat}&lon=${d.lon}&detailLat=${d.lat}&detailLon=${d.lon}&detail=true&marker=true&message=true`;
            const iframe = document.getElementById('windyIframe');
            if (iframe && iframe.src !== src) iframe.src = src;
        }

        function setWindyLayer(layer) {
            currentWindyLayer = layer;
            ['wind', 'rain', 'waves', 'temp'].forEach(l => {
                const btn = document.getElementById('layer_' + l);
                if (btn) btn.classList.toggle('active', l === layer);
            });
            updateWindyEmbed();
        }

        function onDistrictChange() {
            const sel = document.getElementById('weatherDistrictSelect');
            if (sel && !phuketDistricts[sel.value]) sel.value = 'kata';
            const key = sel ? sel.value : 'kata';
            const d = phuketDistricts[key] || phuketDistricts.kata;
            document.getElementById('districtDescBox').innerHTML = `ℹ️ <b>О районе:</b> ${d.desc}`;
            updateWindyEmbed();
            syncDistrictWeather();
            saveUserDataState();
        }

        function decodeWmoWeather(code) {
            if (code === 0) return ['☀️', 'Ясно и солнечно'];
            if (code === 1 || code === 2) return ['🌤️', 'Переменная облачность'];
            if (code === 3) return ['☁️', 'Облачно с прояснениями'];
            if (code >= 45 && code <= 48) return ['🌫️', 'Морская дымка'];
            if (code >= 51 && code <= 67) return ['🌦️', 'Теплый тропический дождь'];
            if (code >= 80 && code <= 82) return ['🌧️', 'Кратковременный ливень'];
            if (code >= 95) return ['⛈️', 'Тропическая гроза'];
            return ['🌤️', 'Комфортная погода'];
        }

        function decodeMetNoSymbol(sym = '') {
            if (sym.includes('thunder')) return [95, '⛈️', 'Тропическая гроза'];
            if (sym.includes('heavyrain')) return [81, '🌧️', 'Тропический ливень'];
            if (sym.includes('rain') || sym.includes('sleet')) return [61, '🌦️', 'Теплый тропический дождь'];
            if (sym.includes('clear') || sym.includes('fair')) return [1, '☀️', 'Ясно и солнечно'];
            if (sym.includes('partlycloudy')) return [2, '🌤️', 'Переменная облачность'];
            if (sym.includes('cloudy') || sym.includes('fog')) return [3, '☁️', 'Облачно'];
            return [1, '🌤️', 'Переменная облачность'];
        }

        function calcFeelsLike(t, rh) {
            if (t < 26) return t + 1.5;
            const hi = -8.784695 + 1.61139411 * t + 2.338549 * rh - 0.14611605 * t * rh
                - 0.012308094 * t * t - 0.016424828 * rh * rh + 0.002211732 * t * t * rh
                + 0.00072546 * t * rh * rh - 0.000003582 * t * t * rh * rh;
            return Math.max(t, Math.min(43, hi));
        }

        function applyUvAlerts(uvVal) {
            const homeAlert = document.getElementById('homeUvAlertBox');
            const weatherAlert = document.getElementById('weatherUvAlertBox');
            const wUvCard = document.getElementById('wUvCard');
            const homeUvBadge = document.getElementById('homeUvBadge');

            wUvCard.classList.remove('uv-danger', 'uv-warn');

            if (uvVal >= 8) {
                homeAlert.style.display = 'flex';
                weatherAlert.style.display = 'flex';
                wUvCard.classList.add('uv-danger');
                document.getElementById('homeUvAlertTitle').innerText = `🚨 ЭКСТРЕМАЛЬНЫЙ УФ-ИНДЕКС: ${uvVal.toFixed(1)}!`;
                document.getElementById('weatherUvAlertTitle').innerText = `🚨 ЭКСТРЕМАЛЬНЫЙ УФ-ИНДЕКС: ${uvVal.toFixed(1)}!`;
                homeUvBadge.innerHTML = `<span class="status-pill pill-bad">🚨 ${uvVal.toFixed(1)} (Экстремальный! SPF 50+)</span>`;
            } else if (uvVal >= 6) {
                homeAlert.style.display = 'flex';
                weatherAlert.style.display = 'flex';
                wUvCard.classList.add('uv-warn');
                document.getElementById('homeUvAlertTitle').innerText = `⚠️ ВЫСОКИЙ УФ-ИНДЕКС: ${uvVal.toFixed(1)}`;
                document.getElementById('weatherUvAlertTitle').innerText = `⚠️ ВЫСОКИЙ УФ-ИНДЕКС: ${uvVal.toFixed(1)}`;
                homeUvBadge.innerHTML = `<span class="status-pill pill-warn">⚠️ ${uvVal.toFixed(1)} (Высокий • SPF 50)</span>`;
            } else {
                homeAlert.style.display = 'none';
                weatherAlert.style.display = 'none';
                homeUvBadge.innerHTML = `<span class="status-pill pill-good">🟢 ${uvVal.toFixed(1)} (Безопасный)</span>`;
            }
        }

        async function syncDistrictWeather() {
            const sel = document.getElementById('weatherDistrictSelect');
            if (sel && !phuketDistricts[sel.value]) sel.value = 'kata';
            const key = sel ? sel.value : 'kata';
            const d = phuketDistricts[key] || phuketDistricts.kata;
            const btn = document.getElementById('syncWeatherBtn');
            const st = document.getElementById('weatherStatus');

            if (btn) btn.innerText = '⏳ Синхронизация метеорадара...';

            const sunCalc = calcPhuketSunTimes(new Date());
            let sunriseStr = sunCalc.sunrise;
            let sunsetStr = sunCalc.sunset;

            const omWeatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${d.lat}&longitude=${d.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,precipitation_probability,weather_code,uv_index&daily=sunrise,sunset,uv_index_max&wind_speed_unit=ms&timezone=Asia%2FBangkok&forecast_days=2`;
            const metNoUrl = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${d.lat.toFixed(4)}&lon=${d.lon.toFixed(4)}`;
            const omMarineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${d.lat}&longitude=${d.lon}&current=wave_height,wave_period,sea_surface_temperature&timezone=Asia%2FBangkok`;

            const [omRes, metNoRes, mRes] = await Promise.all([
                fetchJsonResilient(omWeatherUrl, 4500),
                fetchJsonResilient(metNoUrl, 4500),
                fetchJsonResilient(omMarineUrl, 4500)
            ]);

            let temp = 29.0, feels = 33.5, hum = 76, rainMm = 0.0, cloud = 40, wind = 3.8, gusts = 5.8;
            let wIcon = '🌤️', wDesc = 'Переменная облачность', curUv = 7.5, curPop = 20;
            let hourlyPillsHtml = '';
            let providerLabel = 'ECMWF / MET Norway & Windy';

            const nowPhuket = getPhuketTimeParts(Date.now()).phuketDate;
            const phuketHour = nowPhuket.getUTCHours();

            if (omRes && omRes.current) {
                providerLabel = 'ECMWF / Open-Meteo & Windy Live';
                const c = omRes.current;
                temp = c.temperature_2m ?? 29.0;
                hum = c.relative_humidity_2m ?? 75;
                feels = c.apparent_temperature ?? calcFeelsLike(temp, hum);
                rainMm = c.precipitation ?? 0.0;
                cloud = c.cloud_cover ?? 35;
                wind = c.wind_speed_10m ?? 3.5;
                gusts = c.wind_gusts_10m ?? (wind * 1.45);
                const decoded = decodeWmoWeather(c.weather_code ?? 1);
                wIcon = decoded[0];
                wDesc = decoded[1];

                if (omRes.daily && omRes.daily.sunrise?.[0] && omRes.daily.sunset?.[0]) {
                    sunriseStr = omRes.daily.sunrise[0].slice(11, 16);
                    sunsetStr = omRes.daily.sunset[0].slice(11, 16);
                }

                if (omRes.hourly && Array.isArray(omRes.hourly.time)) {
                    const curIsoPrefix = `${nowPhuket.getUTCFullYear()}-${String(nowPhuket.getUTCMonth()+1).padStart(2,'0')}-${String(nowPhuket.getUTCDate()).padStart(2,'0')}T${String(phuketHour).padStart(2,'0')}`;
                    let hIdx = omRes.hourly.time.findIndex(t => t.startsWith(curIsoPrefix));
                    if (hIdx < 0) hIdx = 0;
                    curUv = omRes.hourly.uv_index?.[hIdx] ?? (phuketHour >= 9 && phuketHour <= 16 ? 8.5 : 1.0);
                    curPop = omRes.hourly.precipitation_probability?.[hIdx] ?? (rainMm > 0 ? 65 : 15);

                    for (let i = hIdx; i < Math.min(omRes.hourly.time.length, hIdx + 24); i += 2) {
                        const tStr = omRes.hourly.time[i].slice(11, 16);
                        const hT = Math.round(omRes.hourly.temperature_2m[i] ?? temp);
                        const hPop = omRes.hourly.precipitation_probability?.[i] ?? 15;
                        const [hIco] = decodeWmoWeather(omRes.hourly.weather_code?.[i] ?? 1);
                        hourlyPillsHtml += `
                            <div class="h-pill">
                                <div style="color:var(--muted); margin-bottom:3px;">${i === hIdx ? 'Сейчас' : tStr}</div>
                                <div style="font-size:1.15rem; margin:2px 0;">${hIco}</div>
                                <div style="font-weight:700; color:var(--heading);">${hT}°C</div>
                                <div style="color:${hPop > 45 ? 'var(--warning)' : 'var(--accent)'}; font-size:0.7rem; margin-top:2px;">💧 ${hPop}%</div>
                            </div>
                        `;
                    }
                }
                saveOfflineCache('weather', { temp, feels, hum, rainMm, cloud, wind, gusts, wIcon, wDesc, curUv, curPop, sunriseStr, sunsetStr, hourlyPillsHtml });
            } else if (metNoRes && metNoRes.properties && Array.isArray(metNoRes.properties.timeseries)) {
                providerLabel = 'MET Norway (YR.no) & Windy Live';
                const ts = metNoRes.properties.timeseries;
                const nowMs = Date.now();
                let startIdx = ts.findIndex(item => new Date(item.time).getTime() >= nowMs - 1800000);
                if (startIdx < 0) startIdx = 0;

                const curEntry = ts[startIdx];
                const inst = curEntry.data?.instant?.details || {};
                const next1 = curEntry.data?.next_1_hours || curEntry.data?.next_6_hours || {};
                const sym = next1.summary?.symbol_code || 'partlycloudy_day';

                temp = inst.air_temperature ?? 29.0;
                hum = Math.round(inst.relative_humidity ?? 76);
                feels = calcFeelsLike(temp, hum);
                wind = inst.wind_speed ?? 3.8;
                gusts = inst.wind_speed_of_gust ?? (wind * 1.45);
                cloud = Math.round(inst.cloud_area_fraction ?? 45);
                rainMm = next1.details?.precipitation_amount ?? 0.0;
                curUv = inst.ultraviolet_index_clear_sky ?? (phuketHour >= 8 && phuketHour <= 17 ? Math.max(1, Math.sin(((phuketHour - 7) / 10) * Math.PI) * 9.5) : 0.5);
                curPop = rainMm > 0.2 ? Math.min(90, Math.round(40 + rainMm * 15)) : Math.round(cloud * 0.35);

                const decoded = decodeMetNoSymbol(sym);
                wIcon = decoded[1];
                wDesc = decoded[2];

                for (let i = startIdx; i < Math.min(ts.length, startIdx + 24); i += 2) {
                    const item = ts[i];
                    const itemPhuket = getPhuketTimeParts(new Date(item.time).getTime());
                    const tStr = `${itemPhuket.hh}:00`;
                    const hT = Math.round(item.data?.instant?.details?.air_temperature ?? temp);
                    const n1 = item.data?.next_1_hours || item.data?.next_6_hours || {};
                    const hRain = n1.details?.precipitation_amount ?? 0;
                    const hPop = hRain > 0.1 ? Math.min(95, Math.round(35 + hRain * 18)) : Math.round((item.data?.instant?.details?.cloud_area_fraction ?? 30) * 0.3);
                    const [, hIco] = decodeMetNoSymbol(n1.summary?.symbol_code || '');
                    hourlyPillsHtml += `
                        <div class="h-pill">
                            <div style="color:var(--muted); margin-bottom:3px;">${i === startIdx ? 'Сейчас' : tStr}</div>
                            <div style="font-size:1.15rem; margin:2px 0;">${hIco}</div>
                            <div style="font-weight:700; color:var(--heading);">${hT}°C</div>
                            <div style="color:${hPop > 45 ? 'var(--warning)' : 'var(--accent)'}; font-size:0.7rem; margin-top:2px;">💧 ${hPop}%</div>
                        </div>
                    `;
                }
                saveOfflineCache('weather', { temp, feels, hum, rainMm, cloud, wind, gusts, wIcon, wDesc, curUv, curPop, sunriseStr, sunsetStr, hourlyPillsHtml });
            } else {
                const cachedW = loadOfflineCache('weather');
                if (cachedW && cachedW.data) {
                    providerLabel = 'Оффлайн-кэш (' + new Date(cachedW.timestamp).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}) + ')';
                    ({ temp, feels, hum, rainMm, cloud, wind, gusts, wIcon, wDesc, curUv, curPop, sunriseStr, sunsetStr, hourlyPillsHtml } = cachedW.data);
                } else {
                    providerLabel = 'Автономная климатическая модель Пхукета';
                    const isDay = phuketHour >= 7 && phuketHour <= 18;
                    temp = isDay ? 29.4 : 26.8;
                    hum = isDay ? 74 : 82;
                    feels = calcFeelsLike(temp, hum);
                    curUv = isDay ? 8.2 : 0.4;
                }
            }

            const mc = mRes?.current || {};
            const waveH = mc.wave_height ?? Math.max(0.35, Math.min(1.6, +(wind * 0.14).toFixed(2)));
            const waveP = mc.wave_period ?? 8;
            const seaT = mc.sea_surface_temperature ?? 29.2;

            document.getElementById('weatherHourlyStrip').innerHTML = hourlyPillsHtml;
            document.getElementById('wTemp').innerText = `${temp.toFixed(1)} °C`;
            document.getElementById('wFeels').innerText = `По ощущению: ${feels.toFixed(1)} °C`;
            document.getElementById('wRain').innerText = `${rainMm.toFixed(1)} мм`;
            document.getElementById('wCloud').innerText = `Дождь: ${curPop}% • Обл.: ${cloud}%`;
            document.getElementById('wWind').innerText = `${wind.toFixed(1)} м/с`;
            document.getElementById('wGusts').innerText = `Порывы до: ${gusts.toFixed(1)} м/с`;
            document.getElementById('wWave').innerText = d.isCoastal ? `${waveH.toFixed(2)} м` : 'Внутри острова';
            document.getElementById('wWavePeriod').innerText = d.isCoastal ? `Период: ${waveP.toFixed(0)} с • Вода +${seaT.toFixed(1)}°` : 'Нет прибоя';
            document.getElementById('wUv').innerText = curUv.toFixed(1);
            document.getElementById('wUvHint').innerText = curUv >= 8 ? '🚨 ОПАСНО! SPF 50+' : (curUv >= 6 ? '⚠️ Высокий! SPF 50' : '🟢 Безопасный УФ');
            document.getElementById('wSunTimes').innerText = `${sunriseStr} / ${sunsetStr}`;
            document.getElementById('wSunViewpoint').innerText = `На смотровую: к ${sunCalc.viewpointTime}`;

            document.getElementById('homeTempVal').innerText = `+${temp.toFixed(1)} °C`;
            document.getElementById('homeWeatherDesc').innerText = `${wIcon} ${wDesc} (ощущ. +${feels.toFixed(0)}°)`;
            document.getElementById('homeSunrise').innerText = sunriseStr;
            document.getElementById('homeSunset').innerText = sunsetStr;

            updateSunCountdownLabels(sunriseStr, sunsetStr, sunCalc.viewpointTime);
            applyUvAlerts(curUv);

            let beachAdvice = '';
            if (!d.isCoastal) {
                beachAdvice = 'Локация находится в глубине острова — отличное время для прогулок по старому городу, поездок в ТЦ Central или смотровых площадок.';
            } else if (waveH < 0.75) {
                beachAdvice = `Море в районе <b>${d.name}</b> спокойное (волна всего ${waveH.toFixed(2)} м, вода +${seaT.toFixed(1)}°C) — <b>купаться можно и безопасно</b>.`;
            } else if (waveH < 1.3) {
                beachAdvice = `На пляже умеренный накат волн (${waveH.toFixed(2)} м, вода +${seaT.toFixed(1)}°C) — купаться с осторожностью, учитывая прибой.`;
            } else {
                beachAdvice = `⛔ <b>Высокая волна (${waveH.toFixed(2)} м) — купаться опасно!</b> Для плавания выберите защищенные бухты.`;
            }

            let rainAdvice = rainMm > 0.4 || curPop >= 55
                ? `Вероятен теплый тропический дождь (вероятность ${curPop}%, осадков ${rainMm.toFixed(1)} мм).`
                : `Существенных осадков сейчас нет (${wDesc.toLowerCase()}, вероятность дождя ${curPop}%).`;

            document.getElementById('weatherVerdictText').innerHTML = `
                <div style="margin-bottom:5px;"><b>${wIcon} Погода сейчас в ${d.name}:</b> ${wDesc}, воздух <b>+${temp.toFixed(1)}°C</b> (ощущается как +${feels.toFixed(1)}°C), ветер ${wind.toFixed(1)} м/с.</div>
                <div style="margin-bottom:5px;">🏖️ <b>Море и волны:</b> ${beachAdvice}</div>
                <div style="margin-bottom:5px;">🌅 <b>Рассвет и закат:</b> восход в <b>${sunriseStr}</b>, закат в <b>${sunsetStr}</b> (лучшее время прибытия на смотровую Промтхеп / Ветряк — к ${sunCalc.viewpointTime}).</div>
                <div>☂️ <b>Осадки:</b> ${rainAdvice}</div>
            `;

            const nowStr = new Date().toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
            if (st) {
                st.className = 'status-bar active';
                st.innerHTML = `● Синхронизировано в <b>${nowStr}</b> | Район: <b>${d.name}</b> | Источник: ${providerLabel}`;
            }
            if (btn) {
                btn.innerText = '✅ Погода синхронизирована!';
                setTimeout(() => { btn.innerText = '🔄 Синхронизировать точную погоду, УФ и море'; }, 1400);
            }
        }
