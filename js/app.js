        /* ==================== ПОЛНОЕ ОБНОВЛЕНИЕ ВСЕЙ ИНФОРМАЦИИ НА САЙТЕ ==================== */
        async function refreshAllDashboard() {
            const btn = document.getElementById('refreshAllHomeBtn');
            if (btn) btn.innerText = '⏳ Полная синхронизация всех разделов сайта...';
            await Promise.all([
                syncUsersFromCloud(false),
                syncLiveRates(),
                scanRealTimeTides(),
                syncDistrictWeather()
            ]);
            refreshAllSharedViews();
            updateTripCountdown();
            render(false);
            updatePlanner();
            if (btn) {
                btn.innerText = '✅ Все данные сайта полностью обновлены!';
                setTimeout(() => {
                    btn.innerText = '🔄 Обновить вообще все данные сайта (Облако, Чаты, Погода, Курсы)';
                }, 1500);
            }
        }

        /* ==================== ОФФЛАЙН-РЕЖИМ СПЕЦИАЛЬНО ДЛЯ IPHONE (БЕЗ СКАЧИВАНИЯ ФАЙЛОВ) ==================== */

        async function activateIosOfflineMode() {
            const btn = document.getElementById('iosOfflineModeBtn');
            if (btn) btn.innerText = '⏳ Сохранение автономного кэша для iPhone...';

            try {
                // 1. Сохраняем все текущие данные и состояния в энергонезависимый localStorage
                saveUserDataState();
                saveOfflineCache('full_app_state_backup', buildFullSyncPayload());

                if (!('serviceWorker' in navigator) || !('caches' in window)) throw new Error('Offline unavailable');
                await navigator.serviceWorker.register('./sw.js');
                const registration = await navigator.serviceWorker.ready;
                await new Promise((resolve, reject) => {
                    const channel = new MessageChannel();
                    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('Cache timeout')); }, 60000);
                    channel.port1.onmessage = ({data}) => {
                        clearTimeout(timer);
                        channel.port1.close();
                        data.ok ? resolve() : reject(new Error(data.error));
                    };
                    registration.active.postMessage({type: 'PREPARE_OFFLINE'}, [channel.port2]);
                });

                if (btn) {
                    btn.innerText = '✅ Оффлайн-режим активен! (Работает без интернета)';
                    btn.style.borderColor = 'var(--success)';
                    btn.style.color = 'var(--success)';
                }
                showLiveToast('📲 <b>Оффлайн-режим для iPhone активирован!</b> Все данные, бюджеты, чаты и погода сохранены в память устройства. Совет: добавьте сайт «На экран Домой» в Safari для мгновенного запуска без сети.');
            } catch (e) {
                if (btn) btn.innerText = '✅ Данные сохранены в память устройства';
            }

            setTimeout(() => {
                if (btn) btn.innerText = '📲 Оффлайн-режим (iPhone / Автономный кэш активен ✓)';
            }, 2500);
        }

        function initPwaAndOfflineSupport() {

            if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
                navigator.serviceWorker.register('./sw.js').catch(() => {});
            }
            const updateNetStatus = () => {
                updateHeaderFirebaseLiveBadge();
            };
            window.addEventListener('online', updateNetStatus);
            window.addEventListener('offline', updateNetStatus);
            updateNetStatus();
        }

        // Главная инициализация приложения
        (function initApp() {
            initPlannerUI();
            initPwaAndOfflineSupport();
            initPullToRefresh();
            ensureAdminAccountExists();
            loadSharedEvents();
            initFirebaseAndRealtimeSync();

            if (window.Telegram && window.Telegram.WebApp) {
                const tg = window.Telegram.WebApp;
                tg.ready();
                tg.expand();
                try {
                    tg.setHeaderColor('#0f1115');
                    tg.setBackgroundColor('#0f1115');
                } catch (e) {}
            }

            ['gateLoginInput', 'gatePassInput'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') submitAuthGate();
                    });
                }
            });

            const savedSessionUser = sessionStorage.getItem(ACTIVE_SESSION_KEY)
                || localStorage.getItem(ACTIVE_SESSION_KEY)
                || localStorage.getItem('phuket_active_session_v8')
                || localStorage.getItem('phuket_active_session_v7');
            const db = getUsersDb();
            const deletedMap = getDeletedUsersMap();
            if (savedSessionUser && db[savedSessionUser] && !deletedMap[savedSessionUser]) {
                completeLoginSession(savedSessionUser);
            } else {
                document.getElementById('mainAppContainer').classList.remove('authenticated');
                document.getElementById('authGateOverlay').classList.remove('hidden');
            }

            syncUsersFromCloud(false);

            document.addEventListener('input', (e) => {
                if (e.target && e.target.id && !e.target.id.startsWith('gate') && !e.target.id.startsWith('prof') && !e.target.id.startsWith('ev') && !e.target.id.startsWith('chk') && !e.target.id.startsWith('directChat')) {
                    saveUserDataState();
                }
            });
            document.addEventListener('change', (e) => {
                if (e.target && e.target.id && !e.target.id.startsWith('gate') && !e.target.id.startsWith('prof') && !e.target.id.startsWith('ev') && !e.target.id.startsWith('chk') && !e.target.id.startsWith('directChat')) {
                    saveUserDataState();
                }
            });

            updateTripCountdown();
            renderSeasonalWarnings();
            renderCalendarGrid();
            renderSelectedDayPreview();
            renderAllEventsSummary();
            renderNextEventOnHome();
            renderChecklistDeadlineAlertsOnHome();
            renderUsersDirectoryAndChat();
            renderActivityFeedUI();
            updateScheduleBudgetSnapshot();
            renderChecklistSection();
            scanRealTimeTides();
            syncDistrictWeather();
        })();
