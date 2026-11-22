        /* ==================== ЧЕК-ЛИСТ ВЕЩЕЙ: ПАПКА «ОБЩЕЕ», ДАТА ПОКУПКИ И 5-ДНЕВНЫЙ АЛЕРТ ==================== */
        const CURRENCY_SYMBOLS = { RUB: '₽', THB: '฿', USD: '$', EUR: '€' };
        let sharedAllViewCurrency = 'RUB';

        function getChecklistsDb() {
            let chk = {};
            try {
                chk = JSON.parse(localStorage.getItem(SHARED_CHECKLIST_KEY) || '{}');
            } catch (e) { chk = {}; }

            const deletedMap = getDeletedUsersMap();

            ['phuket_shared_checklists_v8', 'phuket_shared_checklists_v7'].forEach(oldK => {
                try {
                    const oldObj = JSON.parse(localStorage.getItem(oldK) || '{}');
                    Object.keys(oldObj).forEach(uKey => {
                        if (deletedMap[uKey]) return;
                        if (!chk[uKey] || (oldObj[uKey]?.updatedAt || 0) > (chk[uKey]?.updatedAt || 0)) {
                            chk[uKey] = oldObj[uKey];
                        }
                    });
                } catch (e) {}
            });

            Object.keys(deletedMap).forEach(delKey => {
                if (chk[delKey]) delete chk[delKey];
            });
            return chk;
        }

        function saveChecklistsDb(chkDb) {
            try {
                localStorage.setItem(SHARED_CHECKLIST_KEY, JSON.stringify(chkDb));
                notifyRealtimePeers();
                pushStateToCloudSilent(true);
            } catch (e) {}
        }

        function canEditChecklistFolder(folderOwnerKey) {
            if (!currentUser || !folderOwnerKey) return false;
            if (isCurrentUserAdmin()) return true;
            if (folderOwnerKey === '__all__') return false;
            return folderOwnerKey === currentUser;
        }

        function convertChecklistCurrencyAmount(amount, fromCurr, toCurr) {
            const val = Number(amount || 0);
            if (!val || fromCurr === toCurr) return val;

            const spbUsd = parseFloat(document.getElementById('usd_spb_1')?.value) || 84.20;
            const vpThb = parseFloat(document.getElementById('usd_vp')?.value) || 33.58;
            const eurThb = parseFloat(document.getElementById('eur_vp')?.value) || 37.55;
            const rubPerThb = spbUsd / vpThb;

            let inThb = val;
            if (fromCurr === 'RUB') inThb = val / rubPerThb;
            else if (fromCurr === 'USD') inThb = val * vpThb;
            else if (fromCurr === 'EUR') inThb = val * eurThb;

            if (toCurr === 'THB') return inThb;
            if (toCurr === 'RUB') return inThb * rubPerThb;
            if (toCurr === 'USD') return inThb / vpThb;
            if (toCurr === 'EUR') return inThb / eurThb;
            return val;
        }

        function calcDaysUntilTargetDate(targetDateIso) {
            if (!targetDateIso) return null;
            const now = new Date();
            const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const [y, m, d] = targetDateIso.split('-').map(Number);
            if (!y || !m || !d) return null;
            const targetMidnight = new Date(y, m - 1, d).getTime();
            return Math.round((targetMidnight - todayMidnight) / 86400000);
        }

        function renderChecklistDeadlineAlertsOnHome() {
            const alertBox = document.getElementById('homeChecklistDeadlineAlertBox');
            const listBox = document.getElementById('homeChecklistDeadlineList');
            if (!alertBox || !listBox) return;

            const chkDb = getChecklistsDb();
            const db = getUsersDb();
            const urgentItems = [];

            Object.keys(chkDb).forEach(uKey => {
                const folder = chkDb[uKey];
                const ownerDisplay = db[uKey]?.displayName || folder?.displayName || uKey;
                (folder?.items || []).forEach(item => {
                    if (item.done || !item.targetDate) return;
                    const daysLeft = calcDaysUntilTargetDate(item.targetDate);
                    if (daysLeft !== null && daysLeft <= 5) {
                        urgentItems.push({
                            ownerKey: uKey,
                            ownerDisplay,
                            item,
                            daysLeft
                        });
                    }
                });
            });

            urgentItems.sort((a, b) => a.daysLeft - b.daysLeft);

            if (urgentItems.length === 0) {
                alertBox.style.display = 'none';
                listBox.innerHTML = '';
                return;
            }

            alertBox.style.display = 'block';
            listBox.innerHTML = urgentItems.map(entry => {
                const { ownerKey, ownerDisplay, item, daysLeft } = entry;
                const avHtml = getUserInlineAvatarHtml(ownerKey, 20);
                const itCurr = item.currency || 'RUB';
                const itSym = CURRENCY_SYMBOLS[itCurr] || '₽';
                let statusBadge = '';
                if (daysLeft < 0) {
                    statusBadge = `<span class="status-pill pill-bad">🚨 Просрочено на ${Math.abs(daysLeft)} дн. (срок был ${formatIsoHuman(item.targetDate)})</span>`;
                } else if (daysLeft === 0) {
                    statusBadge = `<span class="status-pill pill-bad">🔥 СЕГОДНЯ последний день! (${formatIsoHuman(item.targetDate)})</span>`;
                } else if (daysLeft === 1) {
                    statusBadge = `<span class="status-pill pill-warn">⏰ Остался 1 день (к ${formatIsoHuman(item.targetDate)})</span>`;
                } else {
                    statusBadge = `<span class="status-pill pill-warn">⏳ Осталось ${daysLeft} дн. (к ${formatIsoHuman(item.targetDate)})</span>`;
                }

                return `
                    <div class="chk-deadline-row" onclick="switchTab('checklist'); selectChecklistFolder('${ownerKey}');">
                        <div style="display:flex; align-items:center; gap:7px; flex-wrap:wrap;">
                            ${avHtml}
                            <b style="color:var(--accent);">${ownerDisplay}:</b>
                            <span style="font-weight:800; color:var(--heading);">${item.title}</span>
                            ${item.amount > 0 ? `<span style="color:var(--success); font-weight:700;">(${fmtInt(item.amount)} ${itSym})</span>` : ''}
                        </div>
                        ${statusBadge}
                    </div>
                `;
            }).join('');
        }

        function onChecklistCurrencyChange(newCurr) {
            if (activeChecklistFolderUser === '__all__') {
                sharedAllViewCurrency = newCurr;
                renderChecklistItems();
                return;
            }
            if (!activeChecklistFolderUser) return;
            const chkDb = getChecklistsDb();
            const folder = chkDb[activeChecklistFolderUser];
            if (folder && canEditChecklistFolder(activeChecklistFolderUser)) {
                folder.currency = newCurr;
                folder.updatedAt = Date.now();
                saveChecklistsDb(chkDb);
            }
            const itemCurrSel = document.getElementById('chkItemCurrency');
            if (itemCurrSel) itemCurrSel.value = newCurr;
            renderChecklistItems();
        }

        function createUserChecklistFolder() {
            if (!currentUser) return;
            const chkDb = getChecklistsDb();
            const db = getUsersDb();
            const dispName = db[currentUser]?.displayName || currentUser;
            if (!chkDb[currentUser]) {
                chkDb[currentUser] = {
                    owner: currentUser,
                    displayName: dispName,
                    currency: 'RUB',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    items: []
                };
                saveChecklistsDb(chkDb);
                logUserActivity(`Создал(а) личную папку в Чек-листе вещей`, 'checklist');
            }
            activeChecklistFolderUser = currentUser;
            renderChecklistSection();
        }

        function selectChecklistFolder(ownerKey) {
            activeChecklistFolderUser = ownerKey;
            toggleChecklistItemEditor(false);
            renderChecklistSection();
        }

        function renderChecklistSection() {
            const chkDb = getChecklistsDb();
            const db = getUsersDb();
            const createBanner = document.getElementById('createMyChecklistBanner');
            const foldersGrid = document.getElementById('checklistFoldersGrid');
            const folderView = document.getElementById('checklistFolderContentView');
            if (!foldersGrid || !folderView) return;

            const hasOwnFolder = Boolean(currentUser && chkDb[currentUser]);
            if (createBanner) {
                createBanner.style.display = hasOwnFolder ? 'none' : 'block';
            }

            const folderKeys = Object.keys(chkDb);
            if (!activeChecklistFolderUser || (activeChecklistFolderUser !== '__all__' && !chkDb[activeChecklistFolderUser])) {
                activeChecklistFolderUser = '__all__';
            }

            let totalAllItems = 0;
            let totalAllDone = 0;
            let totalAllSumRub = 0;
            folderKeys.forEach(uKey => {
                const f = chkDb[uKey];
                const fCurr = f.currency || 'RUB';
                (f.items || []).forEach(it => {
                    totalAllItems++;
                    if (it.done) totalAllDone++;
                    totalAllSumRub += convertChecklistCurrencyAmount(it.amount || 0, it.currency || fCurr, 'RUB');
                });
            });

            let cardsHtml = `
                <div class="folder-card shared-all-folder ${activeChecklistFolderUser === '__all__' ? 'active-folder' : ''}" onclick="selectChecklistFolder('__all__')">
                    <div>
                        <div style="font-weight:800; color:var(--heading); font-size:0.96rem; display:flex; align-items:center; gap:6px;">
                            <span>🌐 Папка «Общее» (Все списки участников)</span>
                        </div>
                        <div style="font-size:0.75rem; color:var(--muted); margin-top:4px;">
                            Всего позиций: <b>${totalAllItems}</b> (выполнено: <b style="color:var(--success);">${totalAllDone}</b>) • Общая сумма: <b>${fmtInt(totalAllSumRub)} ₽</b>
                        </div>
                    </div>
                    <span class="status-pill pill-good">🌐 Общий свод</span>
                </div>
            `;

            cardsHtml += folderKeys.map(uKey => {
                const f = chkDb[uKey];
                const ownerDisplay = db[uKey]?.displayName || f.displayName || uKey;
                const items = f.items || [];
                const doneCount = items.filter(i => i.done).length;
                const isSelected = uKey === activeChecklistFolderUser;
                const canWrite = canEditChecklistFolder(uKey);
                const folderCurr = f.currency || 'RUB';
                const sym = CURRENCY_SYMBOLS[folderCurr] || '₽';
                const folderSum = items.reduce((acc, it) => acc + convertChecklistCurrencyAmount(it.amount || 0, it.currency || folderCurr, folderCurr), 0);
                const avHtml = getUserInlineAvatarHtml(uKey, 22);

                return `
                    <div class="folder-card ${isSelected ? 'active-folder' : ''}" onclick="selectChecklistFolder('${uKey}')">
                        <div>
                            <div style="font-weight:800; color:var(--heading); font-size:0.95rem; display:flex; align-items:center; gap:7px;">
                                ${avHtml}
                                <span>📂 Список: ${ownerDisplay}</span>
                            </div>
                            <div style="font-size:0.75rem; color:var(--muted); margin-top:4px;">
                                Позиций: <b>${items.length}</b> (выполнено: <b style="color:var(--success);">${doneCount}</b>) • Сумма: <b>${fmtInt(folderSum)} ${sym}</b>
                            </div>
                        </div>
                        <span class="status-pill ${canWrite ? 'pill-good' : 'pill-warn'}">
                            ${canWrite ? '✏️ Ваш / Админ' : '👁️ Чтение'}
                        </span>
                    </div>
                `;
            }).join('');

            foldersGrid.innerHTML = cardsHtml;
            folderView.style.display = 'block';

            const currSel = document.getElementById('chkFolderCurrencySelect');
            if (activeChecklistFolderUser === '__all__') {
                if (currSel) {
                    currSel.value = sharedAllViewCurrency;
                    currSel.disabled = false;
                }
                document.getElementById('chkActiveFolderTitle').innerHTML = `🌐 Папка «Общее» — все вещи и покупки участников (${totalAllItems})`;
                document.getElementById('chkActiveFolderAccessHint').innerHTML = `<span style="color:var(--accent);font-weight:700;">ℹ️ Здесь собраны все позиции из чек-листов всех пользователей. Вы можете отмечать и редактировать свои позиции (админ — любые).</span>`;
                document.getElementById('chkOpenEditorBtn').style.display = 'inline-block';
                document.getElementById('chkOpenEditorBtn').disabled = !currentUser;
            } else {
                const activeFolder = chkDb[activeChecklistFolderUser];
                const editable = canEditChecklistFolder(activeChecklistFolderUser);
                const activeOwnerName = db[activeChecklistFolderUser]?.displayName || activeFolder.displayName || activeChecklistFolderUser;
                const folderCurr = activeFolder.currency || 'RUB';
                const avHtml = getUserInlineAvatarHtml(activeChecklistFolderUser, 24);

                if (currSel) {
                    currSel.value = folderCurr;
                    currSel.disabled = !editable;
                }

                document.getElementById('chkActiveFolderTitle').innerHTML = `${avHtml} <span>📂 Чек-лист вещей — автор папки: ${activeOwnerName}</span>`;
                document.getElementById('chkActiveFolderAccessHint').innerHTML = editable
                    ? `<span style="color:var(--success);font-weight:700;">✓ Вы можете добавлять, редактировать и отмечать позиции в этой папке</span>`
                    : `<span style="color:var(--warning);font-weight:700;">👁️ Режим чтения: вы видите все вещи, даты покупок и отметки участника ${activeOwnerName} в реальном времени</span>`;

                document.getElementById('chkOpenEditorBtn').style.display = 'inline-block';
                document.getElementById('chkOpenEditorBtn').disabled = !editable;
            }

            renderChecklistItems();
            renderChecklistDeadlineAlertsOnHome();
        }

        function resetChecklistEditorFields() {
            const chkDb = getChecklistsDb();
            const targetFolderKey = (activeChecklistFolderUser && activeChecklistFolderUser !== '__all__') ? activeChecklistFolderUser : currentUser;
            const folderCurr = chkDb[targetFolderKey]?.currency || sharedAllViewCurrency || 'RUB';
            document.getElementById('chkEditingItemId').value = '';
            document.getElementById('chkEditingItemOwner').value = '';
            document.getElementById('chkItemTitle').value = '';
            document.getElementById('chkItemCategory').value = 'take';
            document.getElementById('chkItemTargetDate').value = '';
            document.getElementById('chkItemAmount').value = '';
            document.getElementById('chkItemCurrency').value = folderCurr;
            document.getElementById('chkItemUrgency').value = 'medium';
            document.getElementById('chkItemColor').value = '#007aff';
            document.getElementById('chkItemDesc').value = '';
            document.getElementById('chkItemImageUrl').value = '';
            document.getElementById('chkItemLinks').value = '';
            document.getElementById('chkItemSubtasks').value = '';
            uploadedChecklistImgData = '';
            const hdr = document.getElementById('chkEditorHeaderTitle');
            const btn = document.getElementById('chkSaveItemBtn');
            if (hdr) hdr.innerText = '➕ Новая позиция в чек-лист';
            if (btn) btn.innerText = '💾 Сохранить позицию в список';
        }

        function openNewChecklistItemModal() {
            if (activeChecklistFolderUser !== '__all__' && !canEditChecklistFolder(activeChecklistFolderUser)) return;
            resetChecklistEditorFields();
            toggleChecklistItemEditor(true);
            document.getElementById('chkItemTitle').focus();
        }

        function openEditChecklistItemModal(itemId, ownerKeyParam = null) {
            const ownerKey = ownerKeyParam || (activeChecklistFolderUser === '__all__' ? currentUser : activeChecklistFolderUser);
            if (!canEditChecklistFolder(ownerKey)) return;
            const chkDb = getChecklistsDb();
            const folder = chkDb[ownerKey];
            if (!folder) return;
            const item = (folder.items || []).find(i => i.id === itemId);
            if (!item) return;

            document.getElementById('chkEditingItemId').value = item.id;
            document.getElementById('chkEditingItemOwner').value = ownerKey;
            document.getElementById('chkItemTitle').value = item.title || '';
            document.getElementById('chkItemCategory').value = item.category || 'take';
            document.getElementById('chkItemTargetDate').value = item.targetDate || '';
            document.getElementById('chkItemAmount').value = item.amount > 0 ? item.amount : '';
            document.getElementById('chkItemCurrency').value = item.currency || folder.currency || 'RUB';
            document.getElementById('chkItemUrgency').value = item.urgency || 'medium';
            document.getElementById('chkItemColor').value = item.color || '#007aff';
            document.getElementById('chkItemDesc').value = item.desc || '';
            document.getElementById('chkItemImageUrl').value = item.imageUrl || '';
            document.getElementById('chkItemLinks').value = (item.links || []).join(', ');
            document.getElementById('chkItemSubtasks').value = (item.subtasks || []).map(s => s.title).join(', ');

            const hdr = document.getElementById('chkEditorHeaderTitle');
            const btn = document.getElementById('chkSaveItemBtn');
            if (hdr) hdr.innerText = `✏️ Редактирование позиции: ${item.title}`;
            if (btn) btn.innerText = '💾 Сохранить изменения позиции';

            toggleChecklistItemEditor(true);
            document.getElementById('chkItemTitle').focus();
        }

        function toggleChecklistItemEditor(forceState) {
            const modal = document.getElementById('checklistItemEditorModal');
            if (!modal) return;
            const next = typeof forceState === 'boolean' ? forceState : !modal.classList.contains('open');
            modal.classList.toggle('open', next);
            if (!next) resetChecklistEditorFields();
        }

        function setChecklistFilter(mode) {
            checklistFilterMode = mode;
            ['all', 'open', 'done'].forEach(m => {
                document.getElementById('chkFilter_' + m)?.classList.toggle('active', m === mode);
            });
            renderChecklistItems();
        }

        async function uploadChecklistImageFile(inputEl) {
            const file = inputEl.files?.[0];
            if (!file) return;
            const compressed = await compressImageFileToDataUrl(file, 220, 0.78);
            if (compressed) {
                uploadedChecklistImgData = compressed;
                document.getElementById('chkItemImageUrl').value = compressed;
            }
        }

        function saveNewChecklistItem() {
            const editingId = document.getElementById('chkEditingItemId').value.trim();
            const editingOwner = document.getElementById('chkEditingItemOwner').value.trim();
            const targetFolderKey = editingOwner || (activeChecklistFolderUser === '__all__' ? currentUser : activeChecklistFolderUser);

            if (!canEditChecklistFolder(targetFolderKey)) {
                alert('Редактировать можно только свою папку чек-листа!');
                return;
            }
            const title = document.getElementById('chkItemTitle').value.trim();
            if (!title) {
                alert('Введите название вещи или задачи.');
                return;
            }
            const category = document.getElementById('chkItemCategory').value;
            const targetDate = document.getElementById('chkItemTargetDate').value || '';
            const amount = parseFloat(document.getElementById('chkItemAmount').value) || 0;
            const itemCurrency = document.getElementById('chkItemCurrency').value || 'RUB';
            const urgency = document.getElementById('chkItemUrgency').value;
            const color = document.getElementById('chkItemColor').value || '#007aff';
            const desc = document.getElementById('chkItemDesc').value.trim();
            const imageUrl = document.getElementById('chkItemImageUrl').value.trim();
            const linksRaw = document.getElementById('chkItemLinks').value;
            const subtasksRaw = document.getElementById('chkItemSubtasks').value;

            const links = linksRaw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);

            const chkDb = getChecklistsDb();
            const db = getUsersDb();
            const authorDisplay = db[currentUser]?.displayName || currentUser;

            if (!chkDb[targetFolderKey]) {
                chkDb[targetFolderKey] = {
                    owner: targetFolderKey,
                    displayName: db[targetFolderKey]?.displayName || targetFolderKey,
                    currency: itemCurrency,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    items: []
                };
            }

            const folder = chkDb[targetFolderKey];
            const timeStr = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

            if (editingId) {
                const existingItem = (folder.items || []).find(i => i.id === editingId);
                if (existingItem) {
                    const oldSubMap = {};
                    (existingItem.subtasks || []).forEach(st => {
                        oldSubMap[st.title.toLowerCase()] = { done: st.done, doneBy: st.doneBy };
                    });
                    const updatedSubtasks = subtasksRaw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).map((st, idx) => ({
                        id: 'sub_' + Date.now() + '_' + idx,
                        title: st,
                        done: existingItem.done ? true : Boolean(oldSubMap[st.toLowerCase()]?.done),
                        doneBy: oldSubMap[st.toLowerCase()]?.doneBy || ''
                    }));

                    existingItem.title = title;
                    existingItem.category = category;
                    existingItem.targetDate = targetDate;
                    existingItem.amount = amount;
                    existingItem.currency = itemCurrency;
                    existingItem.urgency = urgency;
                    existingItem.color = color;
                    existingItem.desc = desc;
                    existingItem.imageUrl = imageUrl;
                    existingItem.links = links;
                    existingItem.subtasks = updatedSubtasks;
                    existingItem.editedBy = authorDisplay;
                    existingItem.editedAtStr = timeStr;
                    logUserActivity(`Обновил(а) вещь «${title}»${targetDate ? ' (к ' + formatIsoHuman(targetDate) + ')' : ''}`, 'checklist');
                }
            } else {
                const subtasks = subtasksRaw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).map((st, idx) => ({
                    id: 'sub_' + Date.now() + '_' + idx,
                    title: st,
                    done: false,
                    doneBy: ''
                }));

                folder.items.push({
                    id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                    title,
                    category,
                    targetDate,
                    amount,
                    currency: itemCurrency,
                    urgency,
                    color,
                    desc,
                    imageUrl,
                    links,
                    subtasks,
                    done: false,
                    authorKey: currentUser,
                    author: authorDisplay,
                    createdAtStr: timeStr,
                    completedBy: '',
                    completedAtStr: ''
                });
                logUserActivity(`Добавил(а) вещь «${title}»${targetDate ? ' (купить к ' + formatIsoHuman(targetDate) + ')' : ''}`, 'checklist');
            }

            folder.updatedAt = Date.now();
            saveChecklistsDb(chkDb);
            toggleChecklistItemEditor(false);
            renderChecklistSection();
        }

        function toggleChecklistMainItem(itemId, ownerKeyParam = null) {
            const ownerKey = ownerKeyParam || activeChecklistFolderUser;
            if (!canEditChecklistFolder(ownerKey)) return;
            const chkDb = getChecklistsDb();
            const folder = chkDb[ownerKey];
            if (!folder) return;
            const item = (folder.items || []).find(i => i.id === itemId);
            if (!item) return;

            const db = getUsersDb();
            const actorName = db[currentUser]?.displayName || currentUser;
            const timeStr = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

            item.done = !item.done;
            item.completedBy = item.done ? actorName : '';
            item.completedByKey = item.done ? currentUser : '';
            item.completedAtStr = item.done ? timeStr : '';

            if (item.done && Array.isArray(item.subtasks)) {
                item.subtasks.forEach(st => {
                    st.done = true;
                    st.doneBy = actorName;
                });
            }
            folder.updatedAt = Date.now();
            saveChecklistsDb(chkDb);
            logUserActivity(`${item.done ? 'Отметил(а) выполненным ✅' : 'Вернул(а) в работу ⏳'} «${item.title}»`, 'checklist');
            renderChecklistSection();
        }

        function toggleChecklistSubtask(itemId, subId, ownerKeyParam = null) {
            const ownerKey = ownerKeyParam || activeChecklistFolderUser;
            if (!canEditChecklistFolder(ownerKey)) return;
            const chkDb = getChecklistsDb();
            const folder = chkDb[ownerKey];
            if (!folder) return;
            const item = (folder.items || []).find(i => i.id === itemId);
            if (!item || !Array.isArray(item.subtasks)) return;

            const sub = item.subtasks.find(s => s.id === subId);
            if (!sub) return;

            const db = getUsersDb();
            const actorName = db[currentUser]?.displayName || currentUser;
            const timeStr = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

            sub.done = !sub.done;
            sub.doneBy = sub.done ? actorName : '';

            if (item.subtasks.length > 0 && item.subtasks.every(s => s.done)) {
                item.done = true;
                item.completedBy = actorName;
                item.completedByKey = currentUser;
                item.completedAtStr = timeStr;
            } else if (!sub.done) {
                item.done = false;
                item.completedBy = '';
                item.completedByKey = '';
                item.completedAtStr = '';
            }
            folder.updatedAt = Date.now();
            saveChecklistsDb(chkDb);
            logUserActivity(`${sub.done ? 'Закрыл(а) подзадачу ✅' : 'Открыл(а) подзадачу'} «${sub.title}» (${item.title})`, 'checklist');
            renderChecklistSection();
        }

        function deleteChecklistItem(itemId, ownerKeyParam = null) {
            const ownerKey = ownerKeyParam || activeChecklistFolderUser;
            if (!canEditChecklistFolder(ownerKey)) return;
            const chkDb = getChecklistsDb();
            const folder = chkDb[ownerKey];
            if (!folder) return;
            const removed = (folder.items || []).find(i => i.id === itemId);
            folder.items = (folder.items || []).filter(i => i.id !== itemId);
            folder.updatedAt = Date.now();
            saveChecklistsDb(chkDb);
            if (removed) {
                logUserActivity(`Удалил(а) вещь «${removed.title}» из списка`, 'checklist');
            }
            renderChecklistSection();
        }

        function renderChecklistItems() {
            const container = document.getElementById('checklistItemsContainer');
            if (!container) return;
            const chkDb = getChecklistsDb();
            const db = getUsersDb();

            let combinedEntries = [];
            let folderCurr = sharedAllViewCurrency || 'RUB';

            if (activeChecklistFolderUser === '__all__') {
                folderCurr = document.getElementById('chkFolderCurrencySelect')?.value || sharedAllViewCurrency || 'RUB';
                Object.keys(chkDb).forEach(uKey => {
                    const f = chkDb[uKey];
                    const fOwnerName = db[uKey]?.displayName || f.displayName || uKey;
                    (f.items || []).forEach(it => {
                        combinedEntries.push({
                            ownerKey: uKey,
                            ownerName: fOwnerName,
                            folderCurr: f.currency || 'RUB',
                            item: it
                        });
                    });
                });
            } else {
                const folder = chkDb[activeChecklistFolderUser];
                if (!folder) {
                    container.innerHTML = '';
                    return;
                }
                folderCurr = folder.currency || document.getElementById('chkFolderCurrencySelect')?.value || 'RUB';
                const fOwnerName = db[activeChecklistFolderUser]?.displayName || folder.displayName || activeChecklistFolderUser;
                (folder.items || []).forEach(it => {
                    combinedEntries.push({
                        ownerKey: activeChecklistFolderUser,
                        ownerName: fOwnerName,
                        folderCurr,
                        item: it
                    });
                });
            }

            const catFilter = document.getElementById('chkCatFilterSelect')?.value || 'all';
            const folderSym = CURRENCY_SYMBOLS[folderCurr] || '₽';
            const altCurr = folderCurr === 'THB' ? 'RUB' : 'THB';
            const altSym = CURRENCY_SYMBOLS[altCurr];

            let sumAll = 0, sumOpen = 0, sumDone = 0;
            combinedEntries.forEach(entry => {
                const it = entry.item;
                const conv = convertChecklistCurrencyAmount(it.amount || 0, it.currency || entry.folderCurr, folderCurr);
                sumAll += conv;
                if (it.done) sumDone += conv;
                else sumOpen += conv;
            });

            const sumAllAlt = convertChecklistCurrencyAmount(sumAll, folderCurr, altCurr);
            const sumOpenAlt = convertChecklistCurrencyAmount(sumOpen, folderCurr, altCurr);
            const sumDoneAlt = convertChecklistCurrencyAmount(sumDone, folderCurr, altCurr);

            document.getElementById('chkFooterPositionsCount').innerText = `Всего позиций: ${combinedEntries.length} (Валюта итогов: ${folderCurr})`;
            document.getElementById('chkTotalAllVal').innerText = `${fmtInt(sumAll)} ${folderSym}`;
            document.getElementById('chkTotalAllEq').innerText = `≈ ${fmtInt(sumAllAlt)} ${altSym}`;
            document.getElementById('chkTotalOpenVal').innerText = `${fmtInt(sumOpen)} ${folderSym}`;
            document.getElementById('chkTotalOpenEq').innerText = `≈ ${fmtInt(sumOpenAlt)} ${altSym}`;
            document.getElementById('chkTotalDoneVal').innerText = `${fmtInt(sumDone)} ${folderSym}`;
            document.getElementById('chkTotalDoneEq').innerText = `≈ ${fmtInt(sumDoneAlt)} ${altSym}`;

            let filtered = combinedEntries.slice();
            if (checklistFilterMode === 'open') filtered = filtered.filter(e => !e.item.done);
            if (checklistFilterMode === 'done') filtered = filtered.filter(e => e.item.done);
            if (catFilter !== 'all') filtered = filtered.filter(e => e.item.category === catFilter);

            if (filtered.length === 0) {
                container.innerHTML = `<div style="color:var(--muted); padding:10px 0; text-align:center;">В этом списке пока нет позиций по выбранному фильтру.</div>`;
                return;
            }

            const catNames = {
                take: '🎒 Нужно взять',
                packed: '✅ Уже собрали',
                buy: '🛒 Надо купить'
            };
            const urgMeta = {
                low: { cls: 'urg-low', text: '🟢 Не срочно' },
                medium: { cls: 'urg-med', text: '🟡 Средняя срочность' },
                high: { cls: 'urg-high', text: '🔴 Очень срочно!' }
            };

            container.innerHTML = filtered.map(entry => {
                const { ownerKey, ownerName, item } = entry;
                const editable = canEditChecklistFolder(ownerKey);
                const u = urgMeta[item.urgency] || urgMeta.medium;
                const itCurr = item.currency || entry.folderCurr;
                const itSym = CURRENCY_SYMBOLS[itCurr] || '₽';
                const avHtml = getUserInlineAvatarHtml(item.authorKey || ownerKey, 18);

                let targetDateHtml = '';
                if (item.targetDate) {
                    const daysLeft = calcDaysUntilTargetDate(item.targetDate);
                    const isSoon = !item.done && daysLeft !== null && daysLeft <= 5;
                    const dateColor = isSoon ? 'var(--warning)' : 'var(--muted)';
                    const daysText = daysLeft === null ? '' : (daysLeft < 0 ? ` • просрочено на ${Math.abs(daysLeft)} дн.` : (daysLeft === 0 ? ' • СЕГОДНЯ!' : ` • через ${daysLeft} дн.`));
                    targetDateHtml = `<span style="font-size:0.72rem; font-weight:700; color:${dateColor}; background:rgba(255,159,10,0.12); padding:2px 7px; border-radius:8px; border:1px solid rgba(255,159,10,0.3);">📅 К дате: ${formatIsoHuman(item.targetDate)}${!item.done ? daysText : ''}</span>`;
                }

                const linksHtml = (item.links || []).map((lnk, idx) => {
                    const href = lnk.startsWith('http') ? lnk : 'https://' + lnk;
                    return `<a href="${href}" target="_blank" rel="noopener" class="vp-link" style="background:rgba(0,122,255,0.14); padding:3px 8px; border-radius:6px; border:1px solid rgba(0,122,255,0.3);">🔗 Ссылка #${idx + 1} ↗</a>`;
                }).join(' ');

                const subtasksHtml = (item.subtasks || []).map(st => `
                    <div class="subtask-row" role="checkbox" aria-disabled="${!editable}" aria-checked="${Boolean(st.done)}" onclick="${editable ? `toggleChecklistSubtask('${item.id}', '${st.id}', '${ownerKey}')` : ''}" style="cursor:${editable ? 'pointer' : 'default'};">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="chk-circle ${st.done ? 'checked' : ''}" style="width:18px; height:18px; font-size:0.65rem;">${st.done ? '✓' : ''}</span>
                            <span style="${st.done ? 'text-decoration:line-through; color:var(--muted);' : 'color:var(--text);'}">${st.title}</span>
                        </div>
                        ${st.done && st.doneBy ? `<span style="font-size:0.68rem; color:var(--success); font-weight:700;">✓ ${st.doneBy}</span>` : ''}
                    </div>
                `).join('');

                return `
                    <div class="chk-item-card ${item.done ? 'done' : ''}" style="border-left-color:${item.color || '#007aff'};">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                            <div style="display:flex; align-items:flex-start; gap:10px; flex:1;">
                                <div role="checkbox" aria-disabled="${!editable}" aria-checked="${Boolean(item.done)}" class="chk-circle ${item.done ? 'checked' : ''}" onclick="${editable ? `toggleChecklistMainItem('${item.id}', '${ownerKey}')` : ''}" title="${editable ? 'Отметить выполненным' : 'Только автор папки может отмечать выполнение'}">
                                    ${item.done ? '✓' : ''}
                                </div>
                                <div style="flex:1;">
                                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                        <span style="font-size:0.96rem; font-weight:800; color:var(--heading); ${item.done ? 'text-decoration:line-through;' : ''}">${item.title}</span>
                                        <span class="urgency-badge ${u.cls}">${u.text}</span>
                                        <span style="font-size:0.72rem; color:var(--accent); font-weight:700;">${catNames[item.category] || '🎒 Вещь'}</span>
                                        ${item.amount > 0 ? `<span style="font-size:0.76rem; font-weight:800; color:var(--success);">💰 ${fmtInt(item.amount)} ${itSym}</span>` : ''}
                                        ${targetDateHtml}
                                        <span class="ev-author-badge">${avHtml} <span>${item.author || ownerName}${item.createdAtStr ? ' • ' + item.createdAtStr : ''}</span></span>
                                        ${item.done ? `<span style="font-size:0.7rem; color:var(--success); font-weight:700;">[✅ Выполнил(а): ${item.completedBy || ownerName}${item.completedAtStr ? ' в ' + item.completedAtStr : ''}]</span>` : ''}
                                    </div>
                                    ${item.desc ? `<div style="font-size:0.8rem; color:var(--desc-text); margin-top:4px;">${item.desc}</div>` : ''}
                                    ${item.imageUrl ? `<div style="margin-top:8px;"><img src="${item.imageUrl}" alt="img" onerror="this.style.display='none'" style="max-width:180px; max-height:130px; border-radius:8px; border:1px solid var(--border); object-fit:cover;"></div>` : ''}
                                    ${linksHtml ? `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:7px;">${linksHtml}</div>` : ''}
                                    ${subtasksHtml ? `<div style="margin-top:8px;">${subtasksHtml}</div>` : ''}
                                </div>
                            </div>
                            ${editable ? `
                                <div style="display:flex; gap:5px; flex-shrink:0;">
                                    <button class="ev-edit-btn" onclick="openEditChecklistItemModal('${item.id}', '${ownerKey}')" title="Изменить позицию">✏️ Изменить</button>
                                    <button class="ev-del-btn" onclick="deleteChecklistItem('${item.id}', '${ownerKey}')" title="Удалить">✕</button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }

