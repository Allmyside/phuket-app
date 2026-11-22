
        const syncChannel = ('BroadcastChannel' in window) ? new BroadcastChannel('phuket_realtime_sync_v9') : null;
        if (syncChannel) {
            syncChannel.onmessage = (ev) => {
                if (!ev.data) return;
                if (ev.data.type === 'FULL_SNAPSHOT' && ev.data.payload) {
                    applyIncomingCloudSnapshot(ev.data.payload);
                } else if (ev.data.type === 'SYNC_UPDATE') {
                    refreshAllSharedViews();
                }
            };
        }

        window.addEventListener('storage', () => {
            refreshAllSharedViews();
        });

        function notifyRealtimePeers(snapshotPayload = null) {
            if (syncChannel) {
                try {
                    if (snapshotPayload) {
                        syncChannel.postMessage({ type: 'FULL_SNAPSHOT', payload: snapshotPayload });
                    } else {
                        syncChannel.postMessage({ type: 'SYNC_UPDATE', ts: Date.now() });
                    }
                } catch (e) {}
            }
        }

        let sharedViewsRefreshPending = false;
        document.addEventListener('focusout', () => {
            if (sharedViewsRefreshPending) setTimeout(refreshAllSharedViews, 0);
        });
        function refreshAllSharedViews() {
            const active = document.activeElement;
            if (active && (active.matches('input, textarea, select') || active.isContentEditable)) {
                sharedViewsRefreshPending = true;
                return;
            }
            sharedViewsRefreshPending = false;
            const deletedMap = getDeletedUsersMap();
            if (currentUser && deletedMap[currentUser]) {
                logoutCurrentUser();
                return;
            }
            loadSharedEvents();
            renderOnlineUsersUI();
            renderActivityFeedUI();
            renderHeaderProfileUI();
            if (document.getElementById('adminPanelModal')?.classList.contains('open')) {
                renderAdminUsersList();
            }
            renderBudgetSubtabs();
            if (currentActiveTab === 'planner') {
                loadBudgetSubtabData(activeBudgetSubtab);
            }
            renderChecklistSection();
            renderChecklistDeadlineAlertsOnHome();
            renderUsersDirectoryAndChat();
            renderCalendarGrid();
            renderSelectedDayPreview();
            renderAllEventsSummary();
            renderNextEventOnHome();
        }

        function getDeletedUsersMap() {
            try {
                return JSON.parse(localStorage.getItem(DELETED_USERS_KEY) || '{}');
            } catch (e) { return {}; }
        }

        function saveDeletedUsersMap(mapObj) {
            try {
                localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(mapObj));
            } catch (e) {}
        }

        /* ==================== ЖИВАЯ ЛЕНТА ДЕЙСТВИЙ (С АВАТАРКАМИ УЧАСТНИКОВ) ==================== */
        function getActivityLog() {
            try {
                return JSON.parse(localStorage.getItem(SHARED_ACTIVITY_KEY) || '[]');
            } catch (e) { return []; }
        }

        function saveActivityLog(list) {
            try {
                localStorage.setItem(SHARED_ACTIVITY_KEY, JSON.stringify(list.slice(0, 25)));
            } catch (e) {}
        }

        function showLiveToast(htmlContent) {
            const toast = document.getElementById('liveActivityToast');
            const txtEl = document.getElementById('liveActivityToastText');
            if (!toast || !txtEl) return;
            txtEl.innerHTML = htmlContent;
            toast.classList.add('show');
            clearTimeout(window._toastTimer);
            window._toastTimer = setTimeout(() => {
                toast.classList.remove('show');
            }, 4200);
        }

        function logUserActivity(actionText, sectionTab = 'home') {
            if (!currentUser) return;
            const db = getUsersDb();
            const authorName = db[currentUser]?.displayName || currentUser;
            const entry = {
                id: 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                userKey: currentUser,
                author: authorName,
                action: actionText,
                tab: sectionTab,
                ts: Date.now()
            };
            lastSeenActivityId = entry.id;
            const list = getActivityLog();
            list.unshift(entry);
            saveActivityLog(list.slice(0, 25));
            renderActivityFeedUI();
            pushStateToCloudSilent(true);
        }

        function renderActivityFeedUI() {
            const box = document.getElementById('homeActivityFeedList');
            if (!box) return;
            const list = getActivityLog();
            if (!list || list.length === 0) {
                box.innerHTML = `<div style="font-size:0.76rem; color:var(--muted);">Пока нет записей в ленте. Любое добавление события, вещи в чек-лист или изменение бюджета сразу отобразится здесь с аватаркой и именем автора.</div>`;
                return;
            }
            box.innerHTML = list.slice(0, 8).map(item => {
                const tStr = new Date(item.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                const tabName = TAB_TITLES_RU[item.tab] || 'Раздел';
                const avHtml = getUserInlineAvatarHtml(item.userKey || item.author, 20);
                return `
                    <div class="activity-row" onclick="switchTab('${item.tab || 'home'}')">
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            ${avHtml}
                            <b style="color:var(--accent);">${item.author}</b>:
                            <span style="color:var(--heading);">${item.action}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                            <span class="ev-author-badge" style="margin:0; padding:2px 7px;">${tabName}</span>
                            <span style="font-size:0.7rem; color:var(--muted);">${tStr}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function getUsersDb() {
            let mainDb = {};
            try {
                mainDb = JSON.parse(localStorage.getItem(USERS_DB_KEY) || '{}');
            } catch (e) { mainDb = {}; }

            const deletedMap = getDeletedUsersMap();
            let changed = false;

            LEGACY_DB_KEYS.forEach(k => {
                try {
                    const oldRaw = localStorage.getItem(k);
                    if (oldRaw) {
                        const oldObj = JSON.parse(oldRaw);
                        Object.keys(oldObj || {}).forEach(uKey => {
                            if (deletedMap[uKey]) return;
                            if (!mainDb[uKey] || (oldObj[uKey]?.updatedAt || 0) > (mainDb[uKey]?.updatedAt || 0)) {
                                mainDb[uKey] = oldObj[uKey];
                                changed = true;
                            }
                        });
                    }
                } catch (e) {}
            });

            Object.keys(deletedMap).forEach(delKey => {
                if (mainDb[delKey] && deletedMap[delKey] >= (mainDb[delKey].updatedAt || 0)) {
                    delete mainDb[delKey];
                    changed = true;
                }
            });

            if (changed) {
                try { localStorage.setItem(USERS_DB_KEY, JSON.stringify(mainDb)); } catch (e) {}
            }
            return mainDb;
        }

        function setUsersDb(db, pushCloud = true) {
            try {
                localStorage.setItem(USERS_DB_KEY, JSON.stringify(db));
                notifyRealtimePeers();
                if (pushCloud) pushStateToCloudSilent();
            } catch (e) {}
        }

        function isCurrentUserAdmin() {
            if (!currentUser) return false;
            const db = getUsersDb();
            const u = db[currentUser];
            return Boolean(u && u.role === 'admin');
        }

        // Нулевое начальное состояние для каждого нового пользователя (все суммы 0, даты пустые)
        function createZeroInitialUserData() {
            const inputs = {
                budget: '0',
                currency: 'RUB',
                plan_budget: '0',
                plan_currency: 'RUB',
                plan_people: '1',
                plan_days: '1',
                trip_start: '',
                trip_end: '',
                cal_trip_start: '',
                cal_trip_end: ''
            };
            ['food_daily', 'restaurants', 'taxi', 'excursions', 'spa', 'drinks', 'shopping', 'souvenirs', 'misc'].forEach(cId => {
                inputs['num_' + cId] = '0';
                inputs['rng_' + cId] = '0';
            });
            return {
                inputs,
                geoEnabled: false,
                theme: document.documentElement.getAttribute('data-theme') || 'dark'
            };
        }

        function ensureAdminAccountExists() {
            const db = getUsersDb();
            if (!db['admin']) {
                db['admin'] = {
                    displayName: 'admin',
                    password: 'Admin!2026',
                    role: 'admin',
                    bio: 'Администратор сервиса Пхукет Помощник',
                    avatar: '👑',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    lastSeen: Date.now(),
                    data: createZeroInitialUserData()
                };
                setUsersDb(db, false);
            } else if (db['admin'].role !== 'admin') {
                db['admin'].role = 'admin';
                setUsersDb(db, false);
            }
        }

        /* ==================== БАЗА ДАННЫХ ПРЯМЫХ СООБЩЕНИЙ (ЧАТ МЕЖДУ ПОЛЬЗОВАТЕЛЯМИ) ==================== */
        function getDirectChatsDb() {
            try {
                return JSON.parse(localStorage.getItem(DIRECT_CHATS_KEY) || '{}');
            } catch (e) { return {}; }
        }

        function saveDirectChatsDb(chatsObj, pushCloud = true) {
            try {
                localStorage.setItem(DIRECT_CHATS_KEY, JSON.stringify(chatsObj));
                notifyRealtimePeers();
                if (pushCloud) pushStateToCloudSilent(true);
            } catch (e) {}
        }

        function getChatRoomId(u1, u2) {
            return [String(u1 || '').toLowerCase(), String(u2 || '').toLowerCase()].sort().join('__');
        }

        function getChatTypingDb() {
            try {
                return JSON.parse(localStorage.getItem(CHAT_TYPING_KEY) || '{}');
            } catch (e) { return {}; }
        }

        function saveChatTypingDb(tObj) {
            try {
                localStorage.setItem(CHAT_TYPING_KEY, JSON.stringify(tObj));
            } catch (e) {}
        }

        /* ==================== ДВИЖОК СИНХРОНИЗАЦИИ FIREBASE (phuket-app-af3e6) + WSS ==================== */
        function buildFullSyncPayload() {
            return {
                type: 'PHUKET_DB_STATE_V9',
                users: getUsersDb(),
                deletedUsers: getDeletedUsersMap(),
                presence: getOnlinePresenceDb(),
                checklists: getChecklistsDb(),
                sharedEvents: getSharedEventsDb(),
                eventsUpdatedAt: Number(localStorage.getItem(SHARED_EVENTS_KEY + '_ts') || 0),
                deletedEvents: getDeletedCalendarEvents(),
                directChats: getDirectChatsDb(),
                typingState: getChatTypingDb(),
                activityLog: getActivityLog(),
                ts: Date.now()
            };
        }

        function applyIncomingCloudSnapshot(snap) {
            if (!snap || typeof snap !== 'object') return;
            let anyUpdated = false;

            const deletedMap = getDeletedUsersMap();
            if (snap.deletedUsers && typeof snap.deletedUsers === 'object') {
                Object.keys(snap.deletedUsers).forEach(delKey => {
                    const delTs = Number(snap.deletedUsers[delKey] || 0);
                    if (delTs > (deletedMap[delKey] || 0)) {
                        deletedMap[delKey] = delTs;
                        anyUpdated = true;
                    }
                });
                saveDeletedUsersMap(deletedMap);
            }

            if (snap.users && typeof snap.users === 'object') {
                const localDb = getUsersDb();
                Object.keys(snap.users).forEach(uKey => {
                    const incU = snap.users[uKey];
                    if (!incU || typeof incU !== 'object') return;
                    const incTs = Number(incU.updatedAt || incU.createdAt || 0);
                    if (deletedMap[uKey] && deletedMap[uKey] >= incTs) {
                        if (localDb[uKey] && Number(localDb[uKey].updatedAt || localDb[uKey].createdAt || 0) <= deletedMap[uKey]) { delete localDb[uKey]; anyUpdated = true; }
                        return;
                    }
                    const locU = localDb[uKey];
                    if (!locU || Number(incTs) > Number(locU.updatedAt || locU.createdAt || 0)) {
                        localDb[uKey] = {
                            ...locU,
                            ...incU,
                            lastSeen: Math.max(locU?.lastSeen || 0, incU?.lastSeen || 0),
                            avatar: incU.avatar !== undefined ? incU.avatar : (locU?.avatar || '')
                        };
                        anyUpdated = true;
                    } else if ((incU?.lastSeen || 0) > (locU?.lastSeen || 0)) {
                        localDb[uKey].lastSeen = incU.lastSeen;
                        anyUpdated = true;
                    }
                });
                Object.keys(deletedMap).forEach(delKey => {
                    if (localDb[delKey] && deletedMap[delKey] >= (localDb[delKey].updatedAt || 0)) {
                        delete localDb[delKey];
                        anyUpdated = true;
                    }
                });
                localStorage.setItem(USERS_DB_KEY, JSON.stringify(localDb));
            }

            if (snap.presence && typeof snap.presence === 'object') {
                const localPres = getOnlinePresenceDb();
                const localDb = getUsersDb();
                Object.keys(snap.presence).forEach(uKey => {
                    if (deletedMap[uKey]) {
                        delete localPres[uKey];
                        return;
                    }
                    const incItem = snap.presence[uKey];
                    const incTs = (typeof incItem === 'object' && incItem !== null) ? (incItem.ts || 0) : Number(incItem || 0);
                    const locItem = localPres[uKey];
                    const locTs = (typeof locItem === 'object' && locItem !== null) ? (locItem.ts || 0) : Number(locItem || 0);

                    if (incTs === 0) {
                        if (localPres[uKey]) {
                            delete localPres[uKey];
                            anyUpdated = true;
                        }
                    } else if (incTs >= locTs) {
                        localPres[uKey] = typeof incItem === 'object' ? incItem : { ts: incTs, tab: 'home' };
                        if (localDb[uKey]) {
                            localDb[uKey].lastSeen = Math.max(localDb[uKey].lastSeen || 0, incTs);
                        }
                        anyUpdated = true;
                    }
                });
                localStorage.setItem(ONLINE_PRESENCE_KEY, JSON.stringify(localPres));
                localStorage.setItem(USERS_DB_KEY, JSON.stringify(localDb));
            }

            if (snap.checklists && typeof snap.checklists === 'object') {
                const localChk = getChecklistsDb();
                Object.keys(snap.checklists).forEach(uKey => {
                    if (deletedMap[uKey]) {
                        delete localChk[uKey];
                        return;
                    }
                    const incF = snap.checklists[uKey];
                    if (!incF || typeof incF !== 'object') return;
                    const locF = localChk[uKey];
                    if (!locF || Number(incF.updatedAt || 0) > Number(locF.updatedAt || 0)) {
                        localChk[uKey] = incF;
                        anyUpdated = true;
                    }
                });
                Object.keys(deletedMap).forEach(delKey => {
                    if (localChk[delKey]) {
                        delete localChk[delKey];
                        anyUpdated = true;
                    }
                });
                localStorage.setItem(SHARED_CHECKLIST_KEY, JSON.stringify(localChk));
            }

            const deletedEvents = getDeletedCalendarEvents();
            Object.entries(snap.deletedEvents || {}).forEach(([id, ts]) => {
                deletedEvents[id] = Math.max(Number(ts) || 0, deletedEvents[id] || 0);
            });
            localStorage.setItem(SHARED_EVENTS_KEY + '_deleted', JSON.stringify(deletedEvents));
            if ((snap.sharedEvents && typeof snap.sharedEvents === 'object') || snap.deletedEvents) {
                const events = getSharedEventsDb();
                Object.entries(snap.sharedEvents || {}).forEach(([date, incoming]) => {
                    if (!Array.isArray(incoming)) return;
                    const byId = new Map((events[date] || []).map(ev => [ev.id, ev]));
                    incoming.forEach(ev => {
                        if (!ev || !ev.id || deletedEvents[ev.id]) return;
                        const local = byId.get(ev.id);
                        if (!local || Number(ev.updatedAt || 0) > Number(local.updatedAt || 0)) byId.set(ev.id, ev);
                    });
                    events[date] = [...byId.values()];
                });
                localStorage.setItem(SHARED_EVENTS_KEY, JSON.stringify(events));
                localStorage.setItem(SHARED_EVENTS_KEY + '_ts', String(Math.max(
                    Number(snap.eventsUpdatedAt) || 0,
                    Number(localStorage.getItem(SHARED_EVENTS_KEY + '_ts')) || 0)));
                anyUpdated = true;
            }

            if (snap.directChats && typeof snap.directChats === 'object') {
                const localChats = getDirectChatsDb();
                let newIncomingMsgForMe = null;

                Object.keys(snap.directChats).forEach(roomId => {
                    const incMsgs = Array.isArray(snap.directChats[roomId]) ? snap.directChats[roomId] : [];
                    const locMsgs = Array.isArray(localChats[roomId]) ? localChats[roomId] : [];
                    const mapById = {};

                    locMsgs.forEach(m => { if (m && m.id) mapById[m.id] = m; });
                    incMsgs.forEach(m => {
                        if (!m || !m.id) return;
                        const existing = mapById[m.id];
                        if (!existing) {
                            mapById[m.id] = m;
                            anyUpdated = true;
                            if (currentUser && m.to && m.to.toLowerCase() === currentUser.toLowerCase() && !m.read) {
                                newIncomingMsgForMe = m;
                            }
                        } else if (Number(m.updatedAt || m.ts || 0) > Number(existing.updatedAt || existing.ts || 0)) {
                            mapById[m.id] = { ...existing, ...m, read: Boolean(existing.read || m.read),
                                readAt: Math.max(existing.readAt || 0, m.readAt || 0) };
                            anyUpdated = true;
                        } else if (m.read && !existing.read && Number(m.updatedAt || m.ts || 0) >= Number(existing.updatedAt || existing.ts || 0)) {
                            existing.read = true;
                            existing.readAt = m.readAt || Date.now();
                            anyUpdated = true;
                        }
                    });

                    localChats[roomId] = Object.values(mapById).sort((a, b) => (a.ts || 0) - (b.ts || 0)).slice(-150);
                });

                localStorage.setItem(DIRECT_CHATS_KEY, JSON.stringify(localChats));

                if (newIncomingMsgForMe && (currentActiveTab !== 'users' || !activeChatPeerKey || activeChatPeerKey.toLowerCase() !== (newIncomingMsgForMe.from || '').toLowerCase())) {
                    const avHtml = getUserInlineAvatarHtml(newIncomingMsgForMe.from, 22);
                    showLiveToast(`${avHtml} <span>💬 Новое сообщение от <b>${newIncomingMsgForMe.fromName || newIncomingMsgForMe.from}</b>: «${newIncomingMsgForMe.text.slice(0, 45)}»</span>`);
                }
            }

            if (snap.typingState && typeof snap.typingState === 'object') {
                const locTyp = getChatTypingDb();
                Object.keys(snap.typingState).forEach(k => {
                    if ((snap.typingState[k] || 0) > (locTyp[k] || 0)) {
                        locTyp[k] = snap.typingState[k];
                        anyUpdated = true;
                    }
                });
                saveChatTypingDb(locTyp);
            }

            if (Array.isArray(snap.activityLog) && snap.activityLog.length > 0) {
                const localAct = getActivityLog();
                const map = {};
                [...snap.activityLog, ...localAct].forEach(a => {
                    if (a && a.id) map[a.id] = a;
                });
                const mergedAct = Object.values(map).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 25);
                saveActivityLog(mergedAct);
                const newest = mergedAct[0];
                if (newest && newest.id !== lastSeenActivityId) {
                    if (lastSeenActivityId && currentUser && newest.userKey && newest.userKey.toLowerCase() !== currentUser.toLowerCase()) {
                        const avHtml = getUserInlineAvatarHtml(newest.userKey || newest.author, 22);
                        showLiveToast(`${avHtml} <span><b>${newest.author}</b>: ${newest.action}</span>`);
                    }
                    lastSeenActivityId = newest.id;
                }
                anyUpdated = true;
            }

            if (anyUpdated) {
                refreshAllSharedViews();
            }
        }

        async function initFirebaseAndRealtimeSync() {
            const connLbl = document.getElementById('firebaseConnStatusText');

            for (const candidateUrl of FIREBASE_DB_CANDIDATES) {
                try {
                    const res = await fetch(`${candidateUrl}/.json?shallow=true`);
                    if (res.ok || res.status === 401) {
                        activeFirebaseRestUrl = candidateUrl;
                        FIREBASE_CONFIG.databaseURL = candidateUrl;
                        break;
                    }
                } catch (e) {}
            }

            if (typeof firebase !== 'undefined') {
                try {
                    if (!firebase.apps.length) {
                        firebase.initializeApp(FIREBASE_CONFIG);
                    }
                    fbDb = firebase.database();

                    fbDb.ref('.info/connected').on('value', (snap) => {
                        fbConnected = Boolean(snap.val());
                        if (connLbl) {
                            connLbl.innerHTML = fbConnected
                                ? '<span style="color:var(--success);font-weight:700;">● Firebase RTDB подключена (Live)</span>'
                                : '<span style="color:var(--accent);font-weight:700;">● WebSocket Live канал активен</span>';
                        }
                        if (fbConnected && currentUser) {
                            const userPresRef = fbDb.ref(`phuket_app_v9/presence/${currentUser}`);
                            userPresRef.onDisconnect().remove();
                            pingOnlineStatus(true);
                        }
                    });

                    fbDb.ref('phuket_app_v9/state').on('value', (snap) => {
                        const val = snap.val();
                        if (val && val.type === 'PHUKET_DB_STATE_V9') {
                            applyIncomingCloudSnapshot(val);
                        }
                    });

                    fbDb.ref('phuket_app_v9/presence').on('value', (snap) => {
                        const presObj = snap.val() || {};
                        const localPres = getOnlinePresenceDb();
                        const deletedMap = getDeletedUsersMap();
                        const now = Date.now();
                        Object.keys(presObj).forEach(uKey => {
                            if (!deletedMap[uKey]) localPres[uKey] = presObj[uKey];
                        });
                        Object.keys(localPres).forEach(uKey => {
                            if (deletedMap[uKey]) { delete localPres[uKey]; return; }
                            if (!presObj[uKey] && uKey !== currentUser) {
                                const itemTs = localPres[uKey]?.ts || localPres[uKey] || 0;
                                if (now - itemTs > 15000) delete localPres[uKey];
                            }
                        });
                        localStorage.setItem(ONLINE_PRESENCE_KEY, JSON.stringify(localPres));
                        renderOnlineUsersUI();
                        renderUsersDirectoryAndChat();
                    });
                } catch (e) {}
            }

            if (typeof mqtt !== 'undefined') {
                try {
                    mqttClient = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
                        clientId: 'phuket_af3e6_' + Math.random().toString(36).slice(2, 10),
                        clean: true,
                        connectTimeout: 4000,
                        reconnectPeriod: 2000
                    });

                    mqttClient.on('connect', () => {
                        if (!fbConnected && connLbl) {
                            connLbl.innerHTML = '<span style="color:var(--success);font-weight:700;">● Live WebSocket синхронизация активна</span>';
                        }
                        mqttClient.subscribe(MQTT_STATE_TOPIC, { qos: 0 });
                        mqttClient.subscribe(MQTT_PRESENCE_TOPIC, { qos: 0 });
                        mqttClient.subscribe(MQTT_TYPING_TOPIC, { qos: 0 });
                        if (currentUser) pingOnlineStatus(true);
                        pushStateToCloudSilent(true);
                    });

                    mqttClient.on('message', (topic, message) => {
                        try {
                            const data = JSON.parse(message.toString());
                            if (topic === MQTT_STATE_TOPIC && data.type === 'PHUKET_DB_STATE_V9') {
                                applyIncomingCloudSnapshot(data);
                            } else if (topic === MQTT_PRESENCE_TOPIC && data.user) {
                                const pres = getOnlinePresenceDb();
                                if (data.ts === 0) delete pres[data.user];
                                else pres[data.user] = { ts: data.ts, tab: data.tab || 'home', displayName: data.displayName || data.user };
                                localStorage.setItem(ONLINE_PRESENCE_KEY, JSON.stringify(pres));
                                renderOnlineUsersUI();
                                renderUsersDirectoryAndChat();
                            } else if (topic === MQTT_TYPING_TOPIC && data.from && data.to) {
                                const typ = getChatTypingDb();
                                typ[`${data.from.toLowerCase()}__${data.to.toLowerCase()}`] = data.ts;
                                saveChatTypingDb(typ);
                                updateDirectChatTypingUI();
                            }
                        } catch (e) {}
                    });
                } catch (e) {}
            }
        }

        async function pushStateToCloudSilent(force = false) {
            const now = Date.now();
            if (!force && now - lastCloudPushTs < 150) return;
            lastCloudPushTs = now;

            const payload = buildFullSyncPayload();
            notifyRealtimePeers(payload);

            if (fbDb && fbConnected) {
                try {
                    fbDb.ref('phuket_app_v9/state').set(payload).catch(() => {});
                } catch (e) {}
            } else {
                fetch(`${activeFirebaseRestUrl}/phuket_app_v9/state.json`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }).catch(() => {});
            }

            if (mqttClient && mqttClient.connected) {
                try {
                    mqttClient.publish(MQTT_STATE_TOPIC, JSON.stringify(payload), { qos: 0, retain: true });
                } catch (e) {}
            }

            try {
                fetch(REST_BACKUP_URL, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                }).catch(() => {});
            } catch (e) {}
        }

        async function syncUsersFromCloud(showFeedback = false) {
            ensureAdminAccountExists();
            const statusLine = document.getElementById('adminSyncStatusLine');
            const gateBtn = document.getElementById('syncCloudGateBtn');
            if (statusLine) statusLine.innerText = '⏳ Синхронизация с Firebase Realtime Database...';
            if (showFeedback && gateBtn) gateBtn.innerText = '⏳ Синхронизация с Firebase...';

            for (const baseUrl of FIREBASE_DB_CANDIDATES) {
                try {
                    const r = await fetch(`${baseUrl}/phuket_app_v9/state.json`);
                    if (r.ok) {
                        const snap = await r.json();
                        if (snap && snap.type === 'PHUKET_DB_STATE_V9') {
                            activeFirebaseRestUrl = baseUrl;
                            applyIncomingCloudSnapshot(snap);
                            break;
                        }
                    }
                } catch (e) {}
            }

            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 3000);
                const res = await fetch(`${REST_BACKUP_URL}/json?poll=1&since=48h`, { signal: controller.signal });
                clearTimeout(timer);
                if (res.ok) {
                    const text = await res.text();
                    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                    lines.forEach(line => {
                        try {
                            const wrapper = JSON.parse(line);
                            if (wrapper && wrapper.message) {
                                const inner = JSON.parse(wrapper.message);
                                if (inner && inner.type === 'PHUKET_DB_STATE_V9') {
                                    applyIncomingCloudSnapshot(inner);
                                }
                            }
                        } catch (e) {}
                    });
                }
            } catch (e) {}

            refreshAllSharedViews();

            const totalUsers = Object.keys(getUsersDb()).length;
            const nowStr = new Date().toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
            if (statusLine) {
                statusLine.innerHTML = `✅ Синхронизировано с Firebase в <b>${nowStr}</b>. Всего зарегистрированных профилей: <b>${totalUsers}</b>.`;
            }
            if (gateBtn) {
                gateBtn.innerText = showFeedback ? `✅ Синхронизировано (профилей: ${totalUsers})` : '🔄 Синхронизировать с Firebase';
                if (showFeedback) {
                    setTimeout(() => { gateBtn.innerText = '🔄 Синхронизировать с Firebase'; }, 1800);
                }
            }
        }

        /* ==================== ОНЛАЙН УЧАСТНИКОВ, ВРЕМЯ ПОСЛЕДНЕГО ВИЗИТА И «Firebase Live (+N)» ==================== */
        function getOnlinePresenceDb() {
            const merged = {};
            const deletedMap = getDeletedUsersMap();
            [ONLINE_PRESENCE_KEY, 'phuket_online_presence_v8', 'phuket_online_presence_v7'].forEach(k => {
                try {
                    const p = JSON.parse(localStorage.getItem(k) || '{}');
                    Object.keys(p).forEach(u => {
                        if (deletedMap[u]) return;
                        const val = p[u];
                        const ts = (typeof val === 'object' && val !== null) ? (val.ts || 0) : Number(val || 0);
                        const curTs = (typeof merged[u] === 'object' && merged[u] !== null) ? (merged[u].ts || 0) : Number(merged[u] || 0);
                        if (ts >= curTs) {
                            merged[u] = typeof val === 'object' ? val : { ts, tab: 'home' };
                        }
                    });
                } catch (e) {}
            });
            return merged;
        }

        function formatLastSeenStatus(uKey) {
            const pres = getOnlinePresenceDb();
            const db = getUsersDb();
            const now = Date.now();
            const entry = pres[uKey];
            const presTs = (typeof entry === 'object' && entry !== null) ? (entry.ts || 0) : Number(entry || 0);
            const isOnline = (currentUser && uKey.toLowerCase() === currentUser.toLowerCase()) || (presTs > 0 && (now - presTs <= 35000));

            if (isOnline) {
                const tabKey = (typeof entry === 'object' && entry !== null) ? (entry.tab || 'home') : 'home';
                return {
                    isOnline: true,
                    html: `<span style="color:var(--success); font-weight:700;">🟢 Сейчас онлайн (${TAB_TITLES_RU[tabKey] || 'На сайте'})</span>`
                };
            }

            const lastTs = Math.max(presTs, db[uKey]?.lastSeen || db[uKey]?.updatedAt || db[uKey]?.createdAt || 0);
            if (!lastTs) {
                return { isOnline: false, html: `<span style="color:var(--muted);">⚪ Был(а) в сети недавно</span>` };
            }
            const dt = new Date(lastTs);
            const isToday = dt.toDateString() === new Date().toDateString();
            const timePart = dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const datePart = isToday ? 'сегодня' : dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
            return {
                isOnline: false,
                html: `<span style="color:var(--muted);">🕒 Был(а) в сети: ${datePart} в ${timePart}</span>`
            };
        }

        function pingOnlineStatus(pushToNetwork = true) {
            if (!currentUser) return;
            const now = Date.now();
            const db = getUsersDb();
            if (db[currentUser]) {
                db[currentUser].lastSeen = now;
                localStorage.setItem(USERS_DB_KEY, JSON.stringify(db));
            }
            const displayName = db[currentUser]?.displayName || currentUser;
            const pres = getOnlinePresenceDb();
            const presEntry = {
                ts: now,
                tab: currentActiveTab || 'home',
                displayName
            };
            pres[currentUser] = presEntry;

            try {
                localStorage.setItem(ONLINE_PRESENCE_KEY, JSON.stringify(pres));
                notifyRealtimePeers();
                if (pushToNetwork) {
                    if (fbDb && fbConnected) {
                        const ref = fbDb.ref(`phuket_app_v9/presence/${currentUser}`);
                        ref.onDisconnect().remove();
                        ref.set(presEntry).catch(() => {});
                    } else {
                        fetch(`${activeFirebaseRestUrl}/phuket_app_v9/presence/${encodeURIComponent(currentUser)}.json`, {
                            method: 'PUT', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(presEntry)
                        }).catch(() => {});
                    }
                    if (mqttClient && mqttClient.connected) {
                        mqttClient.publish(MQTT_PRESENCE_TOPIC, JSON.stringify({ user: currentUser, ...presEntry }));
                    }

                }
            } catch (e) {}
            renderOnlineUsersUI();
        }

        function removeCurrentUserFromOnline() {
            if (!currentUser) return;
            const db = getUsersDb();
            if (db[currentUser]) {
                db[currentUser].lastSeen = Date.now();
                localStorage.setItem(USERS_DB_KEY, JSON.stringify(db));
            }
            const pres = getOnlinePresenceDb();
            delete pres[currentUser];
            try {
                localStorage.setItem(ONLINE_PRESENCE_KEY, JSON.stringify(pres));
                notifyRealtimePeers();
                if (fbDb && fbConnected) {
                    fbDb.ref(`phuket_app_v9/presence/${currentUser}`).remove().catch(() => {});
                }
                if (mqttClient && mqttClient.connected) {
                    mqttClient.publish(MQTT_PRESENCE_TOPIC, JSON.stringify({ user: currentUser, ts: 0 }));
                }

            } catch (e) {}
            renderOnlineUsersUI();
        }

        function getActiveOnlineUsersList() {
            const pres = getOnlinePresenceDb();
            const db = getUsersDb();
            const deletedMap = getDeletedUsersMap();
            const now = Date.now();
            const active = [];

            if (currentUser && !deletedMap[currentUser]) {
                pres[currentUser] = {
                    ts: now,
                    tab: currentActiveTab || 'home',
                    displayName: db[currentUser]?.displayName || currentUser
                };
            }

            Object.keys(pres).forEach(uKey => {
                if (deletedMap[uKey]) return;
                const entry = pres[uKey];
                const lastSeen = (typeof entry === 'object' && entry !== null) ? (entry.ts || 0) : Number(entry || 0);
                const tabKey = (typeof entry === 'object' && entry !== null) ? (entry.tab || 'home') : 'home';
                if (lastSeen > 0 && (now - lastSeen <= 35000)) {
                    const uObj = db[uKey] || {};
                    const display = uObj.displayName || entry?.displayName || uKey;
                    active.push({
                        key: uKey,
                        displayName: display,
                        avatar: uObj.avatar || '',
                        tabTitle: TAB_TITLES_RU[tabKey] || '🏠 Главная',
                        isMe: currentUser && uKey.toLowerCase() === currentUser.toLowerCase()
                    });
                }
            });
            return active;
        }

        function updateHeaderFirebaseLiveBadge(activeList) {
            const badge = document.getElementById('networkBadge');
            if (!badge) return;
            if (!navigator.onLine) {
                badge.className = 'pwa-badge offline';
                badge.innerText = '📴 Оффлайн (Кэш)';
                return;
            }
            badge.className = 'pwa-badge online';
            const list = activeList || getActiveOnlineUsersList();
            const othersCount = list.filter(u => !u.isMe).length;
            if (othersCount > 0) {
                const otherNames = list.filter(u => !u.isMe).map(u => u.displayName).join(', ');
                badge.innerHTML = `● Firebase Live <b style="color:#fff; background:var(--success); padding:1px 6px; border-radius:10px; font-size:0.68rem;">+${othersCount}</b>`;
                badge.title = `Сейчас на сайте кроме вас (${othersCount}): ${otherNames}`;
            } else {
                badge.innerText = '● Firebase Live';
                badge.title = 'Вы онлайн (других участников сейчас нет на сайте)';
            }
        }

        function renderOnlineUsersUI() {
            const activeList = getActiveOnlineUsersList();
            const homeBox = document.getElementById('onlineUsersListBox');
            const adminBox = document.getElementById('adminOnlineUsersContainer');
            const countBadge = document.getElementById('onlineCountBadge');

            if (countBadge) countBadge.innerText = activeList.length;
            updateHeaderFirebaseLiveBadge(activeList);

            const html = activeList.length > 0
                ? activeList.map(u => {
                    const avHtml = getUserInlineAvatarHtml(u.key, 20);
                    return `
                        <span class="online-badge-pill" onclick="switchTab('users'); ${!u.isMe ? `openDirectChat('${u.key}')` : ''}" title="Нажмите, чтобы открыть профиль / чат (${u.tabTitle})">
                            ${avHtml}
                            <span class="online-dot-pulse"></span>
                            <span><b>${u.displayName}</b>${u.isMe ? ' (Вы)' : ''} • онлайн <span style="opacity:0.85; font-weight:600;">[${u.tabTitle}]</span></span>
                        </span>
                    `;
                }).join('')
                : `<span style="font-size:0.76rem; color:var(--muted);">Сейчас никого нет онлайн</span>`;

            if (homeBox) homeBox.innerHTML = html;
            if (adminBox) adminBox.innerHTML = html;
        }

        setInterval(() => {
            if (currentUser) {
                pingOnlineStatus(true);
                updateDirectChatTypingUI();
            } else {
                renderOnlineUsersUI();
            }
        }, 3500);

        window.addEventListener('beforeunload', () => {
            if (currentUser) {
                saveUserDataState(true);
                removeCurrentUserFromOnline();
            }
        });

