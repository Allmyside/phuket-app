        /* ==================== РОУТЕР ВКЛАДОК И КЭШ ==================== */
        const OFFLINE_CACHE_KEY = 'phuket_pwa_offline_cache_v9';
        function saveOfflineCache(section, payload) {
            try {
                const cur = JSON.parse(localStorage.getItem(OFFLINE_CACHE_KEY) || '{}');
                cur[section] = { timestamp: Date.now(), data: payload };
                localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(cur));
            } catch (e) {}
        }
        function loadOfflineCache(section) {
            try {
                const cur = JSON.parse(localStorage.getItem(OFFLINE_CACHE_KEY) || '{}');
                return cur[section] || null;
            } catch (e) { return null; }
        }

        function switchTab(tab) {
            if (!currentUser) {
                document.getElementById('mainAppContainer').classList.remove('authenticated');
                document.getElementById('authGateOverlay').classList.remove('hidden');
                return;
            }

            currentActiveTab = tab;
            pingOnlineStatus(true);

            ['home', 'schedule', 'checklist', 'users', 'exchange', 'planner', 'tides', 'weather'].forEach(t => {
                const el = document.getElementById('tab-' + t);
                if (el) el.classList.toggle('active', t === tab);
            });
            document.getElementById('tabBtnHome')?.classList.toggle('active', tab === 'home');
            document.getElementById('tabBtnSchedule')?.classList.toggle('active', tab === 'schedule');
            document.getElementById('tabBtnChecklist')?.classList.toggle('active', tab === 'checklist');
            document.getElementById('tabBtnUsers')?.classList.toggle('active', tab === 'users');
            document.getElementById('tabBtnExchange')?.classList.toggle('active', tab === 'exchange');
            document.getElementById('tabBtnPlanner')?.classList.toggle('active', tab === 'planner');
            document.getElementById('tabBtnTides')?.classList.toggle('active', tab === 'tides');
            document.getElementById('tabBtnWeather')?.classList.toggle('active', tab === 'weather');

            if (tab === 'planner') {
                renderBudgetSubtabs();
                loadBudgetSubtabData(activeBudgetSubtab);
            }
            if (tab === 'schedule') {
                loadSharedEvents();
                renderCalendarGrid();
                renderSelectedDayPreview();
                renderAllEventsSummary();
                updateScheduleBudgetSnapshot();
            }
            if (tab === 'checklist') {
                renderChecklistSection();
            }
            if (tab === 'users') {
                renderUsersDirectoryAndChat();
            }
            if (tab === 'tides' && !window._tidesLoaded) {
                window._tidesLoaded = true;
                scanRealTimeTides();
            }
            if (tab === 'weather' && !window._weatherLoaded) {
                window._weatherLoaded = true;
                onDistrictChange();
            }
            if (tab === 'home') {
                updateTripCountdown();
                renderSeasonalWarnings();
                renderOnlineUsersUI();
                renderActivityFeedUI();
                renderNextEventOnHome();
                renderChecklistDeadlineAlertsOnHome();
                updateGlobalUnreadBadges();
            }
        }

        /* ==================== КАЛЕНДАРЬ И СОБЫТИЯ (С РЕДАКТИРОВАНИЕМ СВОИХ СОБЫТИЙ) ==================== */
        let calViewYear = new Date().getFullYear();
        let calViewMonth = new Date().getMonth();
        let selectedDateIso = new Date().toISOString().slice(0, 10);
        let selectedEventColor = '#007aff';

        function getDeletedCalendarEvents() {
            try { return JSON.parse(localStorage.getItem(SHARED_EVENTS_KEY + '_deleted') || '{}'); }
            catch (e) { return {}; }
        }
        function getSharedEventsDb() {
            let shared = {};
            try {
                shared = JSON.parse(localStorage.getItem(SHARED_EVENTS_KEY) || '{}');
            } catch (e) { shared = {}; }

            ['phuket_shared_calendar_events_v8', 'phuket_shared_calendar_events_v7'].forEach(oldK => {
                try {
                    const oldEv = JSON.parse(localStorage.getItem(oldK) || '{}');
                    Object.keys(oldEv).forEach(dIso => {
                        if (!shared[dIso]) shared[dIso] = [];
                        (oldEv[dIso] || []).forEach(ev => {
                            if (!shared[dIso].some(x => x.id === ev.id)) shared[dIso].push(ev);
                        });
                    });
                } catch (e) {}
            });
            const deleted = getDeletedCalendarEvents();
            Object.keys(shared).forEach(date => {
                shared[date] = shared[date].filter(ev => !deleted[ev.id]);
                if (!shared[date].length) delete shared[date];
            });
            return shared;
        }

        function saveSharedEventsDb(sharedObj) {
            calendarEvents = sharedObj;
            try {
                localStorage.setItem(SHARED_EVENTS_KEY, JSON.stringify(sharedObj));
                localStorage.setItem(SHARED_EVENTS_KEY + '_ts', String(Date.now()));
                notifyRealtimePeers();
                pushStateToCloudSilent(true);
            } catch (e) {}
        }

        function loadSharedEvents() {
            calendarEvents = getSharedEventsDb();
        }

        function canUserEditOrDeleteEvent(ev) {
            if (!currentUser || !ev) return false;
            if (isCurrentUserAdmin()) return true;
            return Boolean(ev.authorKey && ev.authorKey === currentUser);
        }

        function renderNextEventOnHome() {
            const box = document.getElementById('homeNextEventContent');
            const totalLbl = document.getElementById('homeTotalEventsCountLbl');
            const heroWrap = document.getElementById('homeNextEventBox');
            if (!box) return;

            loadSharedEvents();
            const allList = [];
            Object.keys(calendarEvents).forEach(dIso => {
                (calendarEvents[dIso] || []).forEach(ev => {
                    const timeStr = ev.start && /^\d{2}:\d{2}$/.test(ev.start) ? ev.start : '09:00';
                    const dtMs = new Date(`${dIso}T${timeStr}:00`).getTime();
                    allList.push({ dateIso: dIso, dtMs, ev });
                });
            });

            allList.sort((a, b) => a.dtMs - b.dtMs);
            if (totalLbl) totalLbl.innerText = `Всего событий в плане: ${allList.length}`;

            if (allList.length === 0) {
                if (heroWrap) heroWrap.style.borderLeftColor = 'var(--accent)';
                box.innerHTML = `
                    <div style="color:var(--muted); padding:6px 0;">
                        В календаре пока нет запланированных мероприятий или экскурсий.<br>
                        Нажмите <b>«➕ Добавить ивент»</b> ниже, чтобы создать первое событие.
                    </div>
                `;
                return;
            }

            const nowMs = Date.now() - 3600000;
            let nextItem = allList.find(x => x.dtMs >= nowMs) || allList[0];
            const { dateIso, ev } = nextItem;

            if (heroWrap) heroWrap.style.borderLeftColor = ev.color || 'var(--accent)';

            const mapLinkHtml = ev.mapPin ? `
                <div style="margin-top:4px;">
                    <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.mapCoords || ev.mapPin)}" target="_blank" rel="noopener" class="vp-link">
                        📍 Карта: ${ev.mapPin} ↗
                    </a>
                </div>
            ` : '';

            const avHtml = getUserInlineAvatarHtml(ev.authorKey || ev.author, 18);

            box.innerHTML = `
                <div style="cursor:pointer;" onclick="switchTab('schedule'); selectCalendarDate('${dateIso}');">
                    <div style="font-size:0.75rem; font-weight:700; color:var(--warning);">
                        🗓️ ${formatIsoHuman(dateIso)} • ⏰ ${ev.start || '--:--'}${ev.end ? '–' + ev.end : ''}
                    </div>
                    <div style="font-size:0.98rem; font-weight:800; color:var(--heading); margin-top:3px; display:flex; align-items:center; flex-wrap:wrap; gap:5px;">
                        <span>${ev.title}</span>
                        <span class="ev-author-badge">${avHtml} <span>${ev.author || 'Участник'}${ev.createdAtStr ? ' • ' + ev.createdAtStr : ''}</span></span>
                    </div>
                    ${ev.desc ? `<div style="font-size:0.78rem; color:var(--muted); margin-top:3px;">${ev.desc}</div>` : ''}
                    ${mapLinkHtml}
                </div>
            `;
        }

        function onEventMapPresetChange(val) {
            const customInp = document.getElementById('evMapCustomInput');
            if (!customInp) return;
            if (!val) {
                customInp.value = '';
            } else if (val === 'custom') {
                customInp.value = '';
                customInp.focus();
            } else {
                const [coords, label] = val.split('|');
                customInp.value = `${label} (${coords})`;
            }
        }

        function updateScheduleBudgetSnapshot() {
            const dateLbl = document.getElementById('schedBudgetDateLbl');
            if (!dateLbl) return;
            dateLbl.innerText = formatIsoHuman(selectedDateIso);

            const totalBudgetThb = getTotalBudgetInThb();
            let totalPlannedThb = 0;
            categoriesData.forEach(cat => {
                const el = document.getElementById('num_' + cat.id);
                if (el) totalPlannedThb += parseFloat(el.value) || 0;
            });

            const startStr = document.getElementById('trip_start').value;
            const endStr = document.getElementById('trip_end').value;
            if (!startStr || !endStr) {
                document.getElementById('schedNeededByDateThb').innerText = `0 ฿`;
                document.getElementById('schedNeededByDateSub').innerText = `Даты отпуска не выбраны`;
                document.getElementById('schedRemainingByDateThb').innerText = `${fmtInt(totalBudgetThb)} ฿`;
                document.getElementById('schedRemainingByDateSub').innerText = `Укажите даты отпуска выше`;
                document.getElementById('schedDailyAllowanceThb').innerText = `${fmtInt(totalPlannedThb)} ฿`;
                document.getElementById('schedDailyAllowanceSub').innerText = `Общий план расходов`;
                return;
            }

            const startDate = new Date(startStr + 'T00:00:00');
            const endDate = new Date(endStr + 'T23:59:59');
            const selDate = new Date(selectedDateIso + 'T12:00:00');

            const totalDays = Math.max(1, Math.round((endDate - startDate) / 86400000));
            const dailySpend = totalPlannedThb / totalDays;

            let dayIndex = 0;
            let statusNote = '';
            if (selDate < startDate) {
                dayIndex = 0;
                statusNote = 'До начала поездки (0 дн. из ' + totalDays + ')';
            } else if (selDate > endDate) {
                dayIndex = totalDays;
                statusNote = `После окончания поездки (все ${totalDays} дн.)`;
            } else {
                dayIndex = Math.floor((selDate - startDate) / 86400000) + 1;
                statusNote = `День ${dayIndex} из ${totalDays} отпуска`;
            }

            const neededByDate = dailySpend * dayIndex;
            const remainingByDate = totalBudgetThb - neededByDate;

            document.getElementById('schedNeededByDateThb').innerText = `${fmtInt(neededByDate)} ฿`;
            document.getElementById('schedNeededByDateSub').innerText = statusNote;

            const remEl = document.getElementById('schedRemainingByDateThb');
            remEl.innerText = `${remainingByDate >= 0 ? '' : '-'}${fmtInt(Math.abs(remainingByDate))} ฿`;
            remEl.style.color = remainingByDate >= 0 ? 'var(--success)' : 'var(--danger)';
            document.getElementById('schedRemainingByDateSub').innerText = `Остается на ${Math.max(0, totalDays - dayIndex)} дн. вперед`;

            document.getElementById('schedDailyAllowanceThb').innerText = `${fmtInt(dailySpend)} ฿/день`;
            document.getElementById('schedDailyAllowanceSub').innerText = `Общий план: ${fmtInt(totalPlannedThb)} ฿ из ${fmtInt(totalBudgetThb)} ฿`;
        }

        function onTripDatesChanged(source) {
            const hStart = document.getElementById('trip_start');
            const hEnd = document.getElementById('trip_end');
            const cStart = document.getElementById('cal_trip_start');
            const cEnd = document.getElementById('cal_trip_end');

            if (source === 'home') {
                cStart.value = hStart.value;
                cEnd.value = hEnd.value;
            } else {
                hStart.value = cStart.value;
                hEnd.value = cEnd.value;
            }
            updateTripCountdown();
            renderCalendarGrid();
            renderSelectedDayPreview();
            updateScheduleBudgetSnapshot();
            saveUserDataState();
        }

        function jumpCalendarToTripStart() {
            const startStr = document.getElementById('trip_start').value;
            if (startStr) {
                const d = new Date(startStr + 'T00:00:00');
                calViewYear = d.getFullYear();
                calViewMonth = d.getMonth();
                selectedDateIso = startStr;
                renderCalendarGrid();
                renderSelectedDayPreview();
                updateScheduleBudgetSnapshot();
            } else {
                alert('Сначала выберите дату начала вашего отпуска в поле выше!');
            }
        }

        function changeCalendarMonth(delta) {
            calViewMonth += delta;
            if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
            if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
            renderCalendarGrid();
        }

        function renderCalendarGrid() {
            const grid = document.getElementById('calendarGrid');
            if (!grid) return;

            const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
            document.getElementById('calMonthLabel').innerText = `${monthNames[calViewMonth]} ${calViewYear}`;

            const startStr = document.getElementById('trip_start').value;
            const endStr = document.getElementById('trip_end').value;

            const firstDayOfMonth = new Date(calViewYear, calViewMonth, 1);
            const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
            let startWeekDay = firstDayOfMonth.getDay();
            startWeekDay = startWeekDay === 0 ? 6 : startWeekDay - 1;

            const todayIso = new Date().toISOString().slice(0, 10);
            let html = '';

            for (let i = 0; i < startWeekDay; i++) {
                html += `<div class="cal-cell empty"></div>`;
            }

            for (let day = 1; day <= daysInMonth; day++) {
                const iso = `${calViewYear}-${String(calViewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isVacation = Boolean(startStr && endStr && iso >= startStr && iso <= endStr);
                const isToday = iso === todayIso;
                const isSelected = iso === selectedDateIso;

                const dayEvents = (calendarEvents[iso] || []).slice().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
                let pillsHtml = '';
                dayEvents.slice(0, 2).forEach(ev => {
                    const timePart = ev.start ? `${ev.start}` : '';
                    const authorShort = ev.author ? `${ev.author}: ` : '';
                    pillsHtml += `<div class="cal-ev-pill" style="background:${ev.color || '#007aff'};" title="Добавил(а): ${ev.author || 'Участник'} | ${timePart} ${ev.title}">${timePart} ${authorShort}${ev.title}</div>`;
                });
                if (dayEvents.length > 2) {
                    pillsHtml += `<div class="cal-ev-more">+ ещё ${dayEvents.length - 2}</div>`;
                }

                html += `
                    <div class="cal-cell ${isVacation ? 'in-vacation' : ''} ${isToday ? 'is-today' : ''} ${isSelected ? 'selected' : ''}" onclick="selectCalendarDate('${iso}')">
                        <div class="cal-day-num">
                            <span>${day}</span>
                            ${isVacation ? '<span class="cal-vac-tag">🌴</span>' : ''}
                        </div>
                        ${pillsHtml}
                    </div>
                `;
            }

            grid.innerHTML = html;
        }

        function selectCalendarDate(iso) {
            selectedDateIso = iso;
            closeDayEditorModal();
            renderCalendarGrid();
            renderSelectedDayPreview();
            updateScheduleBudgetSnapshot();
        }

        function formatIsoHuman(iso) {
            if (!iso || !iso.includes('-')) return iso || '';
            const [y, m, d] = iso.split('-').map(Number);
            const dt = new Date(y, m - 1, d);
            return dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'short' });
        }

        function buildEventMapHtml(ev) {
            if (!ev.mapPin) return '';
            const q = encodeURIComponent(ev.mapCoords || ev.mapPin);
            return `
                <div style="margin-top:5px;">
                    <a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener" class="vp-link" style="display:inline-flex; align-items:center; gap:4px; background:rgba(0,122,255,0.12); padding:3px 8px; border-radius:6px; border:1px solid rgba(0,122,255,0.3);">
                        📍 Место на карте: ${ev.mapPin} ↗
                    </a>
                </div>
            `;
        }

        function renderSelectedDayPreview() {
            const titleEl = document.getElementById('previewDateTitle');
            const vacBadge = document.getElementById('previewVacationBadge');
            const listEl = document.getElementById('previewEventsList');
            if (!titleEl || !listEl) return;

            titleEl.innerText = `📅 ${formatIsoHuman(selectedDateIso)}`;

            const startStr = document.getElementById('trip_start').value;
            const endStr = document.getElementById('trip_end').value;
            if (startStr && endStr && selectedDateIso >= startStr && selectedDateIso <= endStr) {
                const dayNum = Math.round((new Date(selectedDateIso) - new Date(startStr)) / 86400000) + 1;
                vacBadge.innerText = `🌴 День ${dayNum} вашего отпуска на Пхукете`;
            } else {
                vacBadge.innerText = startStr && endStr ? 'День вне ваших дат отпуска' : 'Ваши даты отпуска еще не указаны';
            }

            const evs = (calendarEvents[selectedDateIso] || []).slice().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
            if (evs.length === 0) {
                listEl.innerHTML = `<div style="color:var(--muted); padding:6px 0;">На этот день пока нет записанных событий. Нажмите <b>«➕ Добавить событие в этот день»</b>, чтобы запланировать мероприятие.</div>`;
            } else {
                listEl.innerHTML = evs.map(ev => {
                    const canManage = canUserEditOrDeleteEvent(ev);
                    const avHtml = getUserInlineAvatarHtml(ev.authorKey || ev.author, 18);
                    return `
                        <div class="ev-list-item" style="border-left-color:${ev.color || '#007aff'};">
                            <div>
                                <div style="font-weight:700; color:var(--heading); display:flex; align-items:center; flex-wrap:wrap; gap:5px;">
                                    <span style="color:${ev.color || '#007aff'};">⏰ ${ev.start || '--:--'}${ev.end ? ' — ' + ev.end : ''}</span> • <span>${ev.title}</span>
                                    <span class="ev-author-badge">${avHtml} <span>Добавил(а): ${ev.author || 'Участник'}${ev.createdAtStr ? ' (' + ev.createdAtStr + ')' : ''}</span></span>
                                </div>
                                ${ev.desc ? `<div style="font-size:0.78rem; color:var(--muted); margin-top:3px;">${ev.desc}</div>` : ''}
                                ${buildEventMapHtml(ev)}
                            </div>
                            ${canManage ? `
                                <div style="display:flex; gap:5px; flex-shrink:0;">
                                    <button class="ev-edit-btn" onclick="openEditCalendarEventModal('${selectedDateIso}', '${ev.id}')">✏️ Изменить</button>
                                    <button class="ev-del-btn" onclick="deleteCalendarEvent('${selectedDateIso}', '${ev.id}')">✕</button>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('');
            }
        }

        function openDayEditorModal() {
            document.getElementById('evEditingIdInput').value = '';
            document.getElementById('evEditingDateIsoInput').value = '';
            document.getElementById('evTitleInput').value = '';
            document.getElementById('evStartInput').value = '09:00';
            document.getElementById('evEndInput').value = '16:00';
            document.getElementById('evDescInput').value = '';
            document.getElementById('evMapPresetSelect').value = '';
            document.getElementById('evMapCustomInput').value = '';
            selectEventColor('#007aff');

            const modal = document.getElementById('dayEditorModal');
            document.getElementById('editorModalTitle').innerText = `➕ Новое событие на ${formatIsoHuman(selectedDateIso)}`;
            document.getElementById('evSaveSubmitBtn').innerText = '➕ Сохранить событие в расписание дня';
            modal.classList.add('open');
            document.getElementById('evTitleInput').focus();
        }

        // Открытие режима редактирования существующего события
        function openEditCalendarEventModal(dateIso, evId) {
            loadSharedEvents();
            const ev = (calendarEvents[dateIso] || []).find(e => e.id === evId);
            if (!ev || !canUserEditOrDeleteEvent(ev)) return;

            selectedDateIso = dateIso;
            renderCalendarGrid();
            renderSelectedDayPreview();

            document.getElementById('evEditingIdInput').value = ev.id;
            document.getElementById('evEditingDateIsoInput').value = dateIso;
            document.getElementById('evTitleInput').value = ev.title || '';
            document.getElementById('evStartInput').value = ev.start || '09:00';
            document.getElementById('evEndInput').value = ev.end || '16:00';
            document.getElementById('evDescInput').value = ev.desc || '';
            document.getElementById('evMapPresetSelect').value = ev.mapPin ? 'custom' : '';
            document.getElementById('evMapCustomInput').value = ev.mapPin || '';
            selectEventColor(ev.color || '#007aff');

            const modal = document.getElementById('dayEditorModal');
            document.getElementById('editorModalTitle').innerText = `✏️ Редактирование события: ${ev.title}`;
            document.getElementById('evSaveSubmitBtn').innerText = '💾 Сохранить изменения события';
            modal.classList.add('open');
            document.getElementById('evTitleInput').focus();
            modal.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        function closeDayEditorModal() {
            const modal = document.getElementById('dayEditorModal');
            if (modal) modal.classList.remove('open');
            document.getElementById('evEditingIdInput').value = '';
            document.getElementById('evEditingDateIsoInput').value = '';
        }

        function selectEventColor(col) {
            selectedEventColor = col;
            document.querySelectorAll('#evColorPicker .color-dot').forEach(dot => {
                dot.classList.toggle('active', dot.dataset.color === col);
            });
        }

        function addCalendarEvent() {
            if (!currentUser) return;
            const editingId = document.getElementById('evEditingIdInput').value.trim();
            const editingDateIso = document.getElementById('evEditingDateIsoInput').value.trim() || selectedDateIso;
            const title = document.getElementById('evTitleInput').value.trim();
            const start = document.getElementById('evStartInput').value;
            const end = document.getElementById('evEndInput').value;
            const desc = document.getElementById('evDescInput').value.trim();
            const presetVal = document.getElementById('evMapPresetSelect').value;
            const customMap = document.getElementById('evMapCustomInput').value.trim();

            if (!title) {
                alert('Укажите название события (например: Экскурсия на Симиланы).');
                return;
            }

            let mapPin = customMap;
            let mapCoords = customMap;
            if (presetVal && presetVal !== 'custom' && presetVal.includes('|')) {
                const [coords, label] = presetVal.split('|');
                mapCoords = coords;
                if (!mapPin) mapPin = label;
            }

            const db = getUsersDb();
            const authorName = db[currentUser]?.displayName || currentUser || 'Участник';
            const createdAtStr = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

            loadSharedEvents();

            if (editingId) {
                const targetEv = (calendarEvents[editingDateIso] || []).find(e => e.id === editingId);
                if (targetEv && canUserEditOrDeleteEvent(targetEv)) {
                    targetEv.updatedAt = Date.now();
                    targetEv.title = title;
                    targetEv.start = start;
                    targetEv.end = end;
                    targetEv.color = selectedEventColor;
                    targetEv.desc = desc;
                    targetEv.mapPin = mapPin;
                    targetEv.mapCoords = mapCoords;
                    saveSharedEventsDb(calendarEvents);
                    logUserActivity(`Изменил(а) событие «${title}» (${formatIsoHuman(editingDateIso)})`, 'schedule');
                }
            } else {
                if (!calendarEvents[selectedDateIso]) calendarEvents[selectedDateIso] = [];
                calendarEvents[selectedDateIso].push({
                    id: 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                    title,
                    start,
                    end,
                    color: selectedEventColor,
                    desc,
                    mapPin,
                    mapCoords,
                    updatedAt: Date.now(),
                    authorKey: currentUser,
                    author: authorName,
                    createdAtStr
                });
                saveSharedEventsDb(calendarEvents);
                logUserActivity(`Добавил(а) событие «${title}» на ${formatIsoHuman(selectedDateIso)}`, 'schedule');
            }

            closeDayEditorModal();
            renderCalendarGrid();
            renderSelectedDayPreview();
            renderAllEventsSummary();
            renderNextEventOnHome();
        }

        function deleteCalendarEvent(dateIso, evId) {
            loadSharedEvents();
            if (!calendarEvents[dateIso]) return;
            const removed = calendarEvents[dateIso].find(e => e.id === evId);
            if (!removed || !canUserEditOrDeleteEvent(removed)) return;

            const deleted = getDeletedCalendarEvents();
            deleted[evId] = Date.now();
            localStorage.setItem(SHARED_EVENTS_KEY + '_deleted', JSON.stringify(deleted));
            calendarEvents[dateIso] = calendarEvents[dateIso].filter(e => e.id !== evId);
            if (calendarEvents[dateIso].length === 0) delete calendarEvents[dateIso];
            saveSharedEventsDb(calendarEvents);
            logUserActivity(`Удалил(а) событие «${removed.title}» (${formatIsoHuman(dateIso)})`, 'schedule');
            renderCalendarGrid();
            renderSelectedDayPreview();
            renderAllEventsSummary();
            renderNextEventOnHome();
        }

        function renderAllEventsSummary() {
            const box = document.getElementById('allEventsSummaryList');
            if (!box) return;
            const allDates = Object.keys(calendarEvents).filter(d => calendarEvents[d] && calendarEvents[d].length > 0).sort();
            if (allDates.length === 0) {
                box.innerHTML = `<div style="color:var(--muted);">Пока не добавлено ни одного события. Выберите любую дату в календаре выше.</div>`;
                return;
            }
            let html = '';
            allDates.forEach(dIso => {
                const evs = calendarEvents[dIso].slice().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
                evs.forEach(ev => {
                    const canManage = canUserEditOrDeleteEvent(ev);
                    const avHtml = getUserInlineAvatarHtml(ev.authorKey || ev.author, 18);
                    html += `
                        <div class="ev-list-item" style="border-left-color:${ev.color || '#007aff'}; cursor:pointer;" onclick="selectCalendarDate('${dIso}')">
                            <div>
                                <div style="font-size:0.74rem; color:var(--muted); font-weight:600; display:flex; align-items:center; flex-wrap:wrap; gap:5px;">
                                    <span>📅 ${formatIsoHuman(dIso)}</span>
                                    <span class="ev-author-badge">${avHtml} <span>Добавил(а): ${ev.author || 'Участник'}${ev.createdAtStr ? ' • ' + ev.createdAtStr : ''}</span></span>
                                </div>
                                <div style="font-weight:700; color:var(--heading); margin-top:3px;">
                                    <span style="color:${ev.color || '#007aff'};">${ev.start || '--:--'}${ev.end ? '–' + ev.end : ''}</span> • ${ev.title}
                                </div>
                                ${ev.desc ? `<div style="font-size:0.77rem; color:var(--muted); margin-top:2px;">${ev.desc}</div>` : ''}
                                ${buildEventMapHtml(ev)}
                            </div>
                            ${canManage ? `
                                <div style="display:flex; gap:5px; flex-shrink:0;" onclick="event.stopPropagation();">
                                    <button class="ev-edit-btn" onclick="openEditCalendarEventModal('${dIso}', '${ev.id}')">✏️ Изменить</button>
                                    <button class="ev-del-btn" onclick="deleteCalendarEvent('${dIso}', '${ev.id}')">✕</button>
                                </div>
                            ` : ''}
                        </div>
                    `;
                });
            });
            box.innerHTML = html;
        }


        /* ==================== ИНДИВИДУАЛЬНЫЙ КАЛЕНДАРЬ ОТПУСКА ПОЛЬЗОВАТЕЛЯ ==================== */
        function updateTripCountdown() {
            const startStr = document.getElementById('trip_start').value;
            const endStr = document.getElementById('trip_end').value;

            document.getElementById('cal_trip_start').value = startStr;
            document.getElementById('cal_trip_end').value = endStr;

            if (!startStr || !endStr) {
                const emptyMain = '📅 Даты вашего отпуска еще не выбраны';
                const emptySub = 'Укажите дату прилета и вылета выше, чтобы включить обратный отсчет';
                document.getElementById('tripStatusMain').innerHTML = emptyMain;
                document.getElementById('tripStatusSub').innerText = emptySub;
                document.getElementById('tripDaysBadge').innerText = '0 дн.';
                document.getElementById('tripCountdownBanner').style.borderColor = 'var(--border)';

                document.getElementById('calTripStatusMain').innerHTML = emptyMain;
                document.getElementById('calTripStatusSub').innerText = emptySub;
                document.getElementById('calTripDaysBadge').innerText = '0 дн.';
                document.getElementById('calCountdownBanner').style.borderColor = 'var(--border)';
                renderSeasonalWarnings();
                return;
            }

            const startDate = new Date(startStr + 'T00:00:00');
            const endDate = new Date(endStr + 'T23:59:59');
            const now = new Date();

            const totalTripDays = Math.max(1, Math.round((endDate - startDate) / 86400000));
            document.getElementById('tripDaysBadge').innerText = `${totalTripDays} дн. отдыха`;
            document.getElementById('calTripDaysBadge').innerText = `${totalTripDays} дн. отдыха`;

            let mainHtml = '', subText = '', borderCol = 'rgba(0, 122, 255, 0.45)';

            if (now < startDate) {
                const diffMs = startDate - now;
                const daysLeft = Math.floor(diffMs / 86400000);
                const hoursLeft = Math.floor((diffMs % 86400000) / 3600000);
                mainHtml = `✈️ До вылета на Пхукет: <span style="color:var(--success)">${daysLeft} дн. ${hoursLeft} ч.</span>`;
                subText = `Ваш отпуск: ${startDate.toLocaleDateString('ru-RU')} — ${endDate.toLocaleDateString('ru-RU')} (${totalTripDays} дн.)`;
            } else if (now >= startDate && now <= endDate) {
                const dayNumber = Math.floor((now - startDate) / 86400000) + 1;
                const diffEndMs = endDate - now;
                const daysRemaining = Math.floor(diffEndMs / 86400000);
                const hoursRemaining = Math.floor((diffEndMs % 86400000) / 3600000);
                mainHtml = `🌴 Вы на Пхукете! День ${dayNumber} из ${totalTripDays}`;
                subText = `До конца отпуска: ${daysRemaining} дн. ${hoursRemaining} ч.`;
                borderCol = 'rgba(52, 199, 89, 0.5)';
            } else {
                const daysPassed = Math.floor((now - endDate) / 86400000);
                mainHtml = `🏁 Поездка завершена (${daysPassed} дн. назад)`;
                subText = `Выберите новые даты поездки для запуска таймера`;
                borderCol = 'var(--border)';
            }

            document.getElementById('tripStatusMain').innerHTML = mainHtml;
            document.getElementById('tripStatusSub').innerText = subText;
            document.getElementById('tripCountdownBanner').style.borderColor = borderCol;

            document.getElementById('calTripStatusMain').innerHTML = mainHtml;
            document.getElementById('calTripStatusSub').innerText = subText;
            document.getElementById('calCountdownBanner').style.borderColor = borderCol;

            renderSeasonalWarnings();
        }

        function syncTripDaysToPlanner() {
            const startStr = document.getElementById('trip_start').value;
            const endStr = document.getElementById('trip_end').value;
            if (!startStr || !endStr) {
                alert('Сначала укажите даты прилета и вылета!');
                return;
            }
            const days = Math.max(1, Math.round((new Date(endStr) - new Date(startStr)) / 86400000));
            activeBudgetSubtab = inspectedUserByAdmin || currentUser;
            switchTab('planner');
            document.getElementById('plan_days').value = days;
            updatePlanner();
            persistActiveBudgetSubtab();
        }

       function calcPhuketSunTimes(dateObj = new Date()) {
            const start = new Date(dateObj.getFullYear(), 0, 0);
            const dayOfYear = Math.floor((dateObj - start) / 86400000);
            const latRad = 7.8206 * Math.PI / 180;
            const declRad = 0.409 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81));
            const cosOmega = -Math.tan(latRad) * Math.tan(declRad);
            const halfDayHours = (Math.acos(Math.max(-1, Math.min(1, cosOmega))) * 180 / Math.PI) / 15;

            const B = (2 * Math.PI / 365) * (dayOfYear - 81);
            const eqTimeMin = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
            const solarNoonLocal = 12 + (105 - 98.2981) / 15 - (eqTimeMin / 60);

            const sunriseH = solarNoonLocal - halfDayHours;
            const sunsetH = solarNoonLocal + halfDayHours;
            const viewpointH = sunsetH - 0.75;

            const fmtTime = (hFloat) => {
                const totalMin = Math.round(hFloat * 60);
                const hh = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
                const mm = String(totalMin % 60).padStart(2, '0');
                return `${hh}:${mm}`;
            };
            return {
                sunriseH,
                sunsetH,
                sunrise: fmtTime(sunriseH),
                sunset: fmtTime(sunsetH),
                viewpointTime: fmtTime(viewpointH)
            };
        }

        function updateSunCountdownLabels(sunriseStr, sunsetStr, viewpointStr) {
            const { hoursFloat } = getPhuketTimeParts(Date.now());
            const parseHm = (str) => {
                const [h, m] = str.split(':').map(Number);
                return h + m / 60;
            };
            const srH = parseHm(sunriseStr);
            const ssH = parseHm(sunsetStr);

            let hoursToSunset = ssH - hoursFloat;
            if (hoursToSunset < 0) hoursToSunset += 24;
            let hoursToSunrise = srH - hoursFloat;
            if (hoursToSunrise < 0) hoursToSunrise += 24;

            const fmtDur = (hFloat) => {
                const totalM = Math.round(hFloat * 60);
                const h = Math.floor(totalM / 60);
                const m = totalM % 60;
                return `${h} ч ${m} мин`;
            };

            const countdownEl = document.getElementById('homeSunCountdowns');
            if (countdownEl) {
                countdownEl.innerHTML = `⏳ До заката: <b>${fmtDur(hoursToSunset)}</b> • До рассвета: <b>${fmtDur(hoursToSunrise)}</b>`;
            }
            const tipEl = document.getElementById('homeSunsetTip');
            if (tipEl) {
                tipEl.innerText = `📸 Подходить на смотровую площадку лучше к ${viewpointStr} (за 45 мин до заката)`;
            }
        }

        function renderSeasonalWarnings() {
            const nowMonth = new Date().getMonth() + 1;
            const tripStartVal = document.getElementById('trip_start')?.value;
            const tripMonth = tripStartVal ? (new Date(tripStartVal).getMonth() + 1) : nowMonth;

            const getSeasonInfo = (m) => {
                if (m === 12 || m === 1 || m === 2) {
                    return {
                        title: '☀️ Высокий сухой сезон (Декабрь — Февраль)',
                        notes: 'Море на западном побережье (Ката, Карон, Най Харн, Януи) максимально спокойное и прозрачное. ⚠️ <b>Главные риски сезона:</b> 1) Экстремальный УФ-индекс (10–12) даже при легкой облачности; 2) В дни новолуния и полнолуния — сильные отливы на пологих пляжах (Банг Тао, Камала, Раваи); 3) В теплой воде иногда встречается покалывающий микропланктон (сальпы) — абсолютно безопасен, проходит после ополаскивания пресной водой.'
                    };
                }
                if (m === 3 || m === 4) {
                    return {
                        title: '🔥 Жаркий сезон (Март — Апрель)',
                        notes: 'Самая теплая вода в море (+30°C) и пик солнечной радиации. ⚠️ <b>Риски:</b> высокий риск теплового удара и солнечных ожогов с 11:00 до 15:30, у восточных и южных бухт при слабом ветре возможна активность медуз.'
                    };
                }
                if (m >= 5 && m <= 10) {
                    return {
                        title: '🌊 Сезон юго-западного муссона (Май — Октябрь)',
                        notes: '⚠️ <b>Повышенная опасность на воде:</b> сильный накат и коварные <b>обратные течения (Rip Currents)</b> на пляжах Карон, Сурин и Ката Ной. Строго запрещено заходить в воду при красных флагах! Для безопасного купания выбирайте закрытые бухты (Три Транг, Парадайз, Най Янг за рифом, Ао Йон).'
                    };
                }
                return {
                    title: '🌤️ Переходный бархатный сезон (Ноябрь)',
                    notes: 'Муссон стихает, устанавливается солнечная погода. На открытых пляжах (Карон, Сурин) в отдельные дни еще возможна остаточная волна до 0.8–1.1 м — ориентируйтесь на флаги спасателей.'
                };
            };

            const curInfo = getSeasonInfo(nowMonth);
            const tripInfo = getSeasonInfo(tripMonth);
            const html = `
                <div style="font-weight:700; color:var(--warning); margin-bottom:4px;">⚠️ Сезонная памятка безопасности: ${curInfo.title}</div>
                <div>${curInfo.notes}</div>
                ${tripMonth !== nowMonth ? `<div style="margin-top:6px; padding-top:6px; border-top:1px dashed rgba(255,159,10,0.3);">📅 <b>На даты вашей поездки (${tripInfo.title}):</b> ${tripInfo.notes}</div>` : ''}
            `;
            const elHome = document.getElementById('homeSeasonalBox');
            const elWeather = document.getElementById('weatherSeasonalBox');
            if (elHome) elHome.innerHTML = html;
            if (elWeather) elWeather.innerHTML = html;
        }

