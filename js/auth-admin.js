        /* ==================== ВХОД, РЕГИСТРАЦИЯ (С НУЛЯМИ ПО УМОЛЧАНИЮ) И ПРОФИЛЬ ==================== */
        function findUserKeyCaseInsensitive(db, nickname) {
            const target = (nickname || '').trim().toLowerCase();
            return Object.keys(db).find(k => (k.toLowerCase() === target) || ((db[k]?.displayName || '').toLowerCase() === target)) || null;
        }

        function validatePasswordRules(pass) {
            const minLen = pass.length >= 5;
            const hasLet = HAS_LETTER_REGEX.test(pass);
            const hasDig = HAS_DIGIT_REGEX.test(pass);
            const hasSpec = HAS_SPECIAL_REGEX.test(pass);
            return {
                minLen, hasLet, hasDig, hasSpec,
                isValid: minLen && hasLet && hasDig && hasSpec
            };
        }

        function setAuthMode(mode) {
            authMode = mode;
            document.getElementById('tabModeLogin').classList.toggle('active', mode === 'login');
            document.getElementById('tabModeRegister').classList.toggle('active', mode === 'register');
            document.getElementById('regValidationBox').style.display = mode === 'register' ? 'block' : 'none';
            document.getElementById('gateSubmitBtn').innerText = mode === 'login' ? 'Войти в приложение' : 'Зарегистрироваться и войти';
            document.getElementById('authErrorBox').style.display = 'none';
            validateAuthInputsLive();
        }

        function showAuthError(msg) {
            const box = document.getElementById('authErrorBox');
            box.innerText = msg;
            box.style.display = 'block';
        }

        function validateAuthInputsLive() {
            const loginEl = document.getElementById('gateLoginInput');
            const passEl = document.getElementById('gatePassInput');
            const login = loginEl.value.trim();
            const pass = passEl.value;
            document.getElementById('authErrorBox').style.display = 'none';

            if (authMode === 'login') {
                loginEl.classList.remove('invalid', 'valid');
                passEl.classList.remove('invalid', 'valid');
                return true;
            }

            const db = getUsersDb();
            const existingKey = findUserKeyCaseInsensitive(db, login);
            const isFormatOk = LOGIN_REGEX.test(login);
            const isUnique = isFormatOk && !existingKey;

            const chkLogin = document.getElementById('chkLoginUnique');
            if (!login) {
                chkLogin.className = 'val-item';
                chkLogin.innerText = '⚪ Уникальный никнейм (рус/лат, от 2 символов)';
                loginEl.classList.remove('invalid', 'valid');
            } else if (!isFormatOk) {
                chkLogin.className = 'val-item err';
                chkLogin.innerText = '❌ Только русские/латинские буквы и цифры (2–25 симв.)';
                loginEl.classList.add('invalid');
                loginEl.classList.remove('valid');
            } else if (existingKey) {
                chkLogin.className = 'val-item err';
                chkLogin.innerText = `❌ Ник «${login}» уже занят! Выберите другой`;
                loginEl.classList.add('invalid');
                loginEl.classList.remove('valid');
            } else {
                chkLogin.className = 'val-item ok';
                chkLogin.innerText = `✅ Ник «${login}» свободен`;
                loginEl.classList.add('valid');
                loginEl.classList.remove('invalid');
            }

            const pRules = validatePasswordRules(pass);
            const setItemState = (id, ok, text) => {
                const el = document.getElementById(id);
                el.className = 'val-item ' + (pass ? (ok ? 'ok' : 'err') : '');
                el.innerText = `${!pass ? '⚪' : (ok ? '✅' : '❌')} ${text}`;
            };

            setItemState('chkPassLen', pRules.minLen, 'Минимум 5 символов');
            setItemState('chkPassLetters', pRules.hasLet, 'Содержит буквы (русские или латинские)');
            setItemState('chkPassDigits', pRules.hasDig, 'Содержит цифры (0–9)');
            setItemState('chkPassSpec', pRules.hasSpec, 'Содержит спецсимвол (!@#$%^&* и др.)');

            if (pass) {
                passEl.classList.toggle('valid', pRules.isValid);
                passEl.classList.toggle('invalid', !pRules.isValid);
            } else {
                passEl.classList.remove('valid', 'invalid');
            }

            return isUnique && pRules.isValid;
        }

        async function submitAuthGate() {
            ensureAdminAccountExists();
            const login = document.getElementById('gateLoginInput').value.trim();
            const pass = document.getElementById('gatePassInput').value;

            if (!login || !pass) {
                showAuthError('Пожалуйста, заполните логин и пароль.');
                return;
            }

            const db = getUsersDb();

            if (authMode === 'login') {
                const userKey = findUserKeyCaseInsensitive(db, login);
                if (!userKey) {
                    showAuthError('Пользователь с таким ником не найден. Переключитесь на вкладку «Регистрация».');
                    return;
                }
                if (db[userKey].password !== pass) {
                    showAuthError('Неверный пароль! Нажмите на 👁️, чтобы проверить введенные символы.');
                    return;
                }
                completeLoginSession(userKey);
            } else {
                if (!LOGIN_REGEX.test(login)) {
                    showAuthError('Никнейм должен быть от 2 до 25 символов (русские или латинские буквы, цифры).');
                    return;
                }
                if (findUserKeyCaseInsensitive(db, login)) {
                    showAuthError(`Никнейм «${login}» уже занят! Пожалуйста, выберите другой.`);
                    return;
                }
                const pRules = validatePasswordRules(pass);
                if (!pRules.isValid) {
                    showAuthError('Пароль должен содержать минимум 5 символов, включая буквы, цифры и спецсимвол.');
                    return;
                }

                const deletedMap = getDeletedUsersMap();
                if (deletedMap[login]) {
                    delete deletedMap[login];
                    saveDeletedUsersMap(deletedMap);
                }

                // У нового пользователя все суммы по умолчанию 0, а даты отпуска пустые
                db[login] = {
                    displayName: login,
                    password: pass,
                    role: 'user',
                    bio: '',
                    avatar: '',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    lastSeen: Date.now(),
                    data: createZeroInitialUserData()
                };
                setUsersDb(db, true);
                completeLoginSession(login);
                logUserActivity(`Зарегистрировался(ась) в сервисе Пхукет Помощник`, 'home');
            }
        }

        function isPersonalInputId(id) {
            return /^(num_|rng_)/.test(id) || [
                'budget', 'currency', 'plan_budget', 'plan_currency', 'plan_people', 'plan_days',
                'trip_start', 'trip_end', 'cal_trip_start', 'cal_trip_end', 'weatherDistrictSelect'
            ].includes(id);
        }

        function collectCurrentInputsState() {
            const db = getUsersDb();
            const targetKey = inspectedUserByAdmin || currentUser;
            const prevInputs = (targetKey && db[targetKey]?.data?.inputs) ? { ...db[targetKey].data.inputs } : {};

            Object.keys(prevInputs).forEach(id => { if (!isPersonalInputId(id)) delete prevInputs[id]; });

            document.querySelectorAll('#mainAppContainer input, #mainAppContainer select').forEach(el => {
                if (!isPersonalInputId(el.id)) return;
                // Если открыта вкладка чужого или совокупного бюджета, не перезаписываем личный бюджет пользователя
                if (el.id.startsWith('plan_') || el.id.startsWith('num_') || el.id.startsWith('rng_')) {
                    if (activeBudgetSubtab !== targetKey) return;
                }
                prevInputs[el.id] = el.type === 'checkbox' ? el.checked : el.value;
            });

            return {
                inputs: prevInputs,
                geoEnabled: geoState.enabled,
                theme: document.documentElement.getAttribute('data-theme') || 'dark'
            };
        }

        let userDataSaveTimer = null;
        function saveUserDataState(immediate = false) {
            clearTimeout(userDataSaveTimer);
            if (!currentUser) return;
            const targetKey = inspectedUserByAdmin || currentUser;
            const db = getUsersDb();
            if (!db[targetKey] || (targetKey !== currentUser && !isCurrentUserAdmin())) return;

            // Stage edits immediately so incoming older snapshots cannot erase a pending save.
            db[targetKey].data = collectCurrentInputsState();
            db[targetKey].updatedAt = Math.max(Date.now(), Number(db[targetKey].updatedAt || 0) + 1);
            db[targetKey].lastSeen = Date.now();
            localStorage.setItem(USERS_DB_KEY, JSON.stringify(db));
            if (immediate === true) flushUserDataSave();
            else userDataSaveTimer = setTimeout(flushUserDataSave, 300);
        }

        function flushUserDataSave() {
            clearTimeout(userDataSaveTimer);
            userDataSaveTimer = null;
            notifyRealtimePeers();
            pushStateToCloudSilent(true);
        }

        function loadUserDataState(username) {
            const db = getUsersDb();
            const userRecord = db[username];
            const zeroDefaults = createZeroInitialUserData().inputs;
            const inputs = { ...zeroDefaults, ...(userRecord?.data?.inputs || {}) };

            if (userRecord?.data?.theme) {
                applyTheme(userRecord.data.theme);
            }

            // Загружаем индивидуальные поля пользователя (включая личные даты отпуска и нули для нового аккаунта)
            Object.keys(inputs).forEach(id => {
                if (!isPersonalInputId(id)) return;
                const el = document.getElementById(id);
                if (el) {
                    if (el.type === 'checkbox') el.checked = Boolean(inputs[id]);
                    else el.value = inputs[id] !== undefined ? inputs[id] : '';
                }
            });

            // Гарантируем синхронность личных дат между Главной и Планированием
            const tStart = inputs.trip_start || '';
            const tEnd = inputs.trip_end || '';
            if (document.getElementById('trip_start')) document.getElementById('trip_start').value = tStart;
            if (document.getElementById('trip_end')) document.getElementById('trip_end').value = tEnd;
            if (document.getElementById('cal_trip_start')) document.getElementById('cal_trip_start').value = tStart;
            if (document.getElementById('cal_trip_end')) document.getElementById('cal_trip_end').value = tEnd;

            const geoToggle = document.getElementById('geoMasterToggle');
            const geoEnabled = Boolean(userRecord?.data?.geoEnabled);
            if (geoToggle) geoToggle.checked = geoEnabled;
            geoState.enabled = geoEnabled;

            loadSharedEvents();
            render(false);
            renderBudgetSubtabs();
            loadBudgetSubtabData(activeBudgetSubtab);
            updateTripCountdown();
            renderCalendarGrid();
            renderSelectedDayPreview();
            renderAllEventsSummary();
            renderNextEventOnHome();
            renderChecklistSection();
            renderChecklistDeadlineAlertsOnHome();
            renderUsersDirectoryAndChat();
            renderActivityFeedUI();
        }

        function completeLoginSession(userKey) {
            currentUser = userKey;
            inspectedUserByAdmin = null;
            activeBudgetSubtab = userKey;
            const chkDb = getChecklistsDb();
            activeChecklistFolderUser = chkDb[userKey] ? userKey : '__all__';
            sessionStorage.setItem(ACTIVE_SESSION_KEY, currentUser);
            localStorage.setItem(ACTIVE_SESSION_KEY, currentUser);

            document.getElementById('gateLoginInput').value = '';
            document.getElementById('gatePassInput').value = '';
            document.getElementById('authGateOverlay').classList.add('hidden');
            document.getElementById('mainAppContainer').classList.add('authenticated');

            pingOnlineStatus(true);
            loadUserDataState(currentUser);
            renderHeaderProfileUI();
            switchTab('home');
        }

        function logoutCurrentUser() {
            if (currentUser) {
                saveUserDataState(true);
                removeCurrentUserFromOnline();
            }
            currentUser = null;
            inspectedUserByAdmin = null;
            activeChatPeerKey = null;
            sessionStorage.removeItem(ACTIVE_SESSION_KEY);
            localStorage.removeItem(ACTIVE_SESSION_KEY);

            document.getElementById('profileDropdown').classList.remove('open');
            document.getElementById('mainAppContainer').classList.remove('authenticated');
            document.getElementById('authGateOverlay').classList.remove('hidden');
            setAuthMode('login');
        }

        /* ==================== МЕНЮ ПРОФИЛЯ И АДМИН-ПАНЕЛЬ (РОЛИ АДМИНА + УДАЛЕНИЕ) ==================== */
        function renderHeaderProfileUI() {
            if (!currentUser) return;
            const db = getUsersDb();
            const u = db[currentUser] || {};
            const isAdmin = isCurrentUserAdmin();

            const targetDisplay = inspectedUserByAdmin && isAdmin
                ? `${u.displayName || currentUser} (правки: ${db[inspectedUserByAdmin]?.displayName || inspectedUserByAdmin})`
                : (u.displayName || currentUser);

            document.getElementById('headerUsernameLabel').innerText = targetDisplay;
            document.getElementById('pdUsername').innerText = u.displayName || currentUser;
            document.getElementById('pdRoleLabel').innerText = isAdmin ? '🛡️ Администратор сервиса' : (u.bio || 'Путешественник');
            document.getElementById('pdAdminBtn').style.display = isAdmin ? 'flex' : 'none';

            const avBox = document.getElementById('headerAvatarBox');
            renderSafeAvatarIntoElement(avBox, u.avatar, u.displayName || currentUser);
            updateGlobalUnreadBadges();
        }

        function toggleProfileDropdown(e) {
            e.stopPropagation();
            document.getElementById('profileDropdown').classList.toggle('open');
        }

        document.addEventListener('click', (e) => {
            const wrap = document.getElementById('profileMenuWrap');
            const dd = document.getElementById('profileDropdown');
            if (wrap && dd && !wrap.contains(e.target)) {
                dd.classList.remove('open');
            }
        });

        function openProfileSettingsModal(targetUserKey = null) {
            document.getElementById('profileDropdown').classList.remove('open');
            const editKey = (targetUserKey && isCurrentUserAdmin()) ? targetUserKey : currentUser;
            const db = getUsersDb();
            const u = db[editKey] || {};

            document.getElementById('profTargetUserKey').value = editKey;
            document.getElementById('profModalHeaderTitle').innerText = (editKey !== currentUser)
                ? `🛠️ Редактирование профиля: ${u.displayName || editKey}`
                : '⚙️ Настройки вашего профиля';

            document.getElementById('modalProfileName').innerText = u.displayName || editKey;
            document.getElementById('modalProfileBioPreview').innerText = u.bio || 'Описание пока не добавлено';
            document.getElementById('profDisplayNameInput').value = u.displayName || editKey;
            document.getElementById('profAvatarUrlInput').value = u.avatar || '';
            document.getElementById('profBioInput').value = u.bio || '';
            document.getElementById('profNewPassInput').value = '';
            document.getElementById('profModalMsg').style.display = 'none';

            previewProfileAvatar(u.avatar || '', u.displayName || editKey);
            document.getElementById('profileSettingsModal').classList.add('open');
        }

        function closeProfileSettingsModal() {
            document.getElementById('profileSettingsModal').classList.remove('open');
        }

        function previewProfileAvatar(url, fallbackName) {
            const box = document.getElementById('modalAvatarPreview');
            const name = fallbackName || document.getElementById('profDisplayNameInput')?.value || currentUser || 'U';
            renderSafeAvatarIntoElement(box, url, name);
        }

        function selectPresetEmojiAvatar(emoji) {
            const val = emoji ? createEmojiSvgDataUrl(emoji, '#007aff') : '';
            document.getElementById('profAvatarUrlInput').value = val;
            previewProfileAvatar(val);
        }

        async function uploadProfileAvatarFile(inputEl) {
            const file = inputEl.files?.[0];
            if (!file) return;
            const compressedDataUrl = await compressImageFileToDataUrl(file, 96, 0.82);
            if (compressedDataUrl) {
                document.getElementById('profAvatarUrlInput').value = compressedDataUrl;
                previewProfileAvatar(compressedDataUrl);
            }
        }

        function saveProfileSettings() {
            const targetKey = document.getElementById('profTargetUserKey').value || currentUser;
            if (!targetKey) return;
            if (targetKey !== currentUser && !isCurrentUserAdmin()) return;

            const db = getUsersDb();
            const u = db[targetKey];
            if (!u) return;

            const newDisplayName = document.getElementById('profDisplayNameInput').value.trim();
            const newAvatar = document.getElementById('profAvatarUrlInput').value.trim();
            const newBio = document.getElementById('profBioInput').value.trim();
            const newPass = document.getElementById('profNewPassInput').value;
            const msgEl = document.getElementById('profModalMsg');

            if (!newDisplayName || newDisplayName.length < 2) {
                msgEl.style.display = 'block';
                msgEl.style.color = 'var(--danger)';
                msgEl.innerText = '❌ Имя / никнейм должен содержать минимум 2 символа!';
                return;
            }

            const duplicateKey = Object.keys(db).find(k => k !== targetKey && (db[k]?.displayName || k).toLowerCase() === newDisplayName.toLowerCase());
            if (duplicateKey) {
                msgEl.style.display = 'block';
                msgEl.style.color = 'var(--danger)';
                msgEl.innerText = `❌ Имя «${newDisplayName}» уже занято другим участником!`;
                return;
            }

            if (newPass) {
                const pRules = validatePasswordRules(newPass);
                if (!pRules.isValid) {
                    msgEl.style.display = 'block';
                    msgEl.style.color = 'var(--danger)';
                    msgEl.innerText = '❌ Новый пароль должен быть от 5 символов и включать буквы, цифры и спецсимвол!';
                    return;
                }
                u.password = newPass;
            }

            u.displayName = newDisplayName;
            u.avatar = newAvatar;
            u.bio = newBio;
            u.updatedAt = Date.now();

            const chkDb = getChecklistsDb();
            if (chkDb[targetKey]) {
                chkDb[targetKey].displayName = newDisplayName;
                chkDb[targetKey].updatedAt = Date.now();
                saveChecklistsDb(chkDb);
            }

            setUsersDb(db, true);
            pushStateToCloudSilent(true);
            refreshAllSharedViews();

            msgEl.style.display = 'block';
            msgEl.style.color = 'var(--success)';
            msgEl.innerText = '✅ Профиль успешно сохранен и синхронизирован у всех!';
            setTimeout(() => closeProfileSettingsModal(), 650);
        }

        function openAdminPanelModal() {
            document.getElementById('profileDropdown').classList.remove('open');
            renderAdminUsersList();
            document.getElementById('adminPanelModal').classList.add('open');
            syncUsersFromCloud(false);
        }

        function closeAdminPanelModal() {
            document.getElementById('adminPanelModal').classList.remove('open');
        }

        // Выдача или снятие прав Администратора любому пользователю
        function adminToggleUserRole(targetKey) {
            if (!isCurrentUserAdmin()) return;
            if (!targetKey || targetKey.toLowerCase() === 'admin') {
                alert('Системный аккаунт admin всегда имеет права администратора.');
                return;
            }
            const db = getUsersDb();
            const u = db[targetKey];
            if (!u) return;

            const makeAdmin = u.role !== 'admin';
            u.role = makeAdmin ? 'admin' : 'user';
            u.updatedAt = Date.now();
            setUsersDb(db, true);
            logUserActivity(`${makeAdmin ? 'Назначил(а) администратором 🛡️' : 'Снял(а) права администратора у'} «${u.displayName || targetKey}»`, 'users');
            pushStateToCloudSilent(true);
            renderAdminUsersList();
            refreshAllSharedViews();
        }

        function adminDeleteUser(targetKey) {
            if (!isCurrentUserAdmin()) return;
            if (!targetKey || targetKey.toLowerCase() === 'admin') {
                alert('Главный аккаунт администратора удалить нельзя!');
                return;
            }
            const db = getUsersDb();
            const dispName = db[targetKey]?.displayName || targetKey;
            if (!confirm(`Вы действительно хотите удалить пользователя «${dispName}» (@${targetKey}) и его личные папки?`)) {
                return;
            }

            const deletedMap = getDeletedUsersMap();
            deletedMap[targetKey] = Date.now() + 5000;
            saveDeletedUsersMap(deletedMap);

            delete db[targetKey];
            localStorage.setItem(USERS_DB_KEY, JSON.stringify(db));

            const pres = getOnlinePresenceDb();
            delete pres[targetKey];
            localStorage.setItem(ONLINE_PRESENCE_KEY, JSON.stringify(pres));

            const chkDb = getChecklistsDb();
            delete chkDb[targetKey];
            localStorage.setItem(SHARED_CHECKLIST_KEY, JSON.stringify(chkDb));

            if (inspectedUserByAdmin === targetKey) inspectedUserByAdmin = null;
            if (activeBudgetSubtab === targetKey) activeBudgetSubtab = '__main__';
            if (activeChecklistFolderUser === targetKey) activeChecklistFolderUser = '__all__';

            if (fbDb && fbConnected) {
                fbDb.ref(`phuket_app_v9/presence/${targetKey}`).remove().catch(() => {});
                fbDb.ref(`phuket_app_v9/state/users/${targetKey}`).remove().catch(() => {});
                fbDb.ref(`phuket_app_v9/state/checklists/${targetKey}`).remove().catch(() => {});
            }

            logUserActivity(`Администратор удалил профиль «${dispName}»`, 'home');
            pushStateToCloudSilent(true);
            refreshAllSharedViews();
            renderAdminUsersList();
        }

        function renderAdminUsersList() {
            ensureAdminAccountExists();
            renderOnlineUsersUI();
            const db = getUsersDb();
            const chkDb = getChecklistsDb();
            const container = document.getElementById('adminUsersListContainer');
            const keys = Object.keys(db);

            const countEl = document.getElementById('adminTotalUsersCount');
            if (countEl) countEl.innerText = keys.length;

            if (keys.length === 0) {
                container.innerHTML = `<div style="color:var(--muted);">Нет зарегистрированных пользователей.</div>`;
                return;
            }

            container.innerHTML = keys.map(uKey => {
                const u = db[uKey];
                const budgetVal = u.data?.inputs?.plan_budget || u.data?.inputs?.budget || '0';
                const isBeingEdited = (inspectedUserByAdmin || currentUser) === uKey;
                const seenInfo = formatLastSeenStatus(uKey);
                const userChkItems = chkDb[uKey]?.items || [];
                const userChkDone = userChkItems.filter(i => i.done).length;
                const safeId = 'adm_av_' + uKey.replace(/[^a-zA-Z0-9]/g, '_');
                const isRootAdmin = uKey.toLowerCase() === 'admin';
                const hasAdminRole = isRootAdmin || u.role === 'admin';

                setTimeout(() => {
                    renderSafeAvatarIntoElement(document.getElementById(safeId), u.avatar, u.displayName || uKey);
                }, 0);

                return `
                    <div class="admin-user-row" style="${isBeingEdited ? 'border-color:var(--success);' : ''}">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div class="profile-avatar-sm" id="${safeId}" style="width:38px; height:38px; font-size:0.95rem;">👤</div>
                            <div>
                                <div style="font-weight:800; color:var(--heading); display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                    <span>${u.displayName || uKey}</span>
                                    <span style="font-size:0.7rem; color:var(--muted);">(@${uKey})</span>
                                    ${hasAdminRole ? '<span style="color:var(--warning);font-size:0.72rem;">[🛡️ АДМИН]</span>' : '<span style="color:var(--muted);font-size:0.7rem;">[Участник]</span>'}
                                </div>
                                <div style="font-size:0.73rem; margin-top:2px;">${seenInfo.html}</div>
                                <div style="font-size:0.75rem; color:var(--muted); margin-top:2px;">
                                    Пароль: <b style="color:var(--text);">${u.password}</b> • Бюджет: <b>${budgetVal}</b> • Чек-лист: <b>${userChkDone}/${userChkItems.length}</b>
                                </div>
                                ${u.bio ? `<div style="font-size:0.74rem; color:var(--desc-text); margin-top:2px;">О себе: ${u.bio}</div>` : ''}
                            </div>
                        </div>
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                            ${!isRootAdmin ? `
                                <button class="link-btn" style="color:var(--warning); border-color:var(--warning);" onclick="adminToggleUserRole('${uKey}')">
                                    ${hasAdminRole ? '⬇️ Снять роль Админа' : '🛡️ Сделать Админом'}
                                </button>
                            ` : ''}
                            <button class="link-btn" onclick="openProfileSettingsModal('${uKey}')">🎭 Профиль / Пароль</button>
                            <button class="link-btn" style="color:var(--success); border-color:var(--success);" onclick="adminSwitchToUserContext('${uKey}')">
                                ${isBeingEdited ? '✓ Активен для правок' : '✏️ Править разделы'}
                            </button>
                            ${!isRootAdmin ? `<button class="ev-del-btn" onclick="adminDeleteUser('${uKey}')">🗑️ Удалить</button>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }

        function adminSwitchToUserContext(targetKey) {
            if (!isCurrentUserAdmin() || !getUsersDb()[targetKey]) return;
            saveUserDataState(true);
            inspectedUserByAdmin = (targetKey === currentUser) ? null : targetKey;
            activeBudgetSubtab = targetKey;
            activeChecklistFolderUser = targetKey;
            loadUserDataState(inspectedUserByAdmin || currentUser);
            renderHeaderProfileUI();
            renderAdminUsersList();
        }

