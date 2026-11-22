function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
}
        /* ==================== РАЗДЕЛ «👥 ПОЛЬЗОВАТЕЛИ» И ЛИЧНЫЕ СООБЩЕНИЯ (ЧАТ REALTIME) ==================== */
        function getUnreadMessagesCountFromUser(peerKey) {
            if (!currentUser || !peerKey) return 0;
            const roomId = getChatRoomId(currentUser, peerKey);
            const chats = getDirectChatsDb();
            const msgs = chats[roomId] || [];
            return msgs.filter(m => m.to && m.to.toLowerCase() === currentUser.toLowerCase() && !m.read).length;
        }

        function getTotalUnreadMessagesCount() {
            if (!currentUser) return 0;
            const db = getUsersDb();
            let total = 0;
            Object.keys(db).forEach(uKey => {
                if (uKey.toLowerCase() !== currentUser.toLowerCase()) {
                    total += getUnreadMessagesCountFromUser(uKey);
                }
            });
            return total;
        }

        function updateGlobalUnreadBadges() {
            const total = getTotalUnreadMessagesCount();
            ['navUnreadBadge', 'homeUsersUnreadBadge', 'pdUnreadBadge'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                if (total > 0) {
                    el.style.display = 'inline-flex';
                    el.innerText = total;
                } else {
                    el.style.display = 'none';
                }
            });
        }

        function renderUsersDirectoryAndChat() {
            if (activeChatPeerKey && currentActiveTab === 'users' && document.getElementById('directChatWrap')?.classList.contains('open')) markChatMessagesRead(activeChatPeerKey);
            updateGlobalUnreadBadges();
            const grid = document.getElementById('usersDirectoryGrid');
            if (!grid) return;

            const db = getUsersDb();
            const keys = Object.keys(db);

            // Сортируем: сначала те, от кого есть непрочитанные сообщения, затем кто онлайн
            keys.sort((a, b) => {
                const unA = getUnreadMessagesCountFromUser(a);
                const unB = getUnreadMessagesCountFromUser(b);
                if (unA !== unB) return unB - unA;
                const stA = formatLastSeenStatus(a).isOnline ? 1 : 0;
                const stB = formatLastSeenStatus(b).isOnline ? 1 : 0;
                return stB - stA;
            });

            grid.innerHTML = keys.map(uKey => {
                const u = db[uKey] || {};
                const isMe = currentUser && uKey.toLowerCase() === currentUser.toLowerCase();
                const isAdminRole = u.role === 'admin' || uKey.toLowerCase() === 'admin';
                const unreadCount = isMe ? 0 : getUnreadMessagesCountFromUser(uKey);
                const seenInfo = formatLastSeenStatus(uKey);
                const avHtml = getUserInlineAvatarHtml(uKey, 40);
                const userDates = (u.data?.inputs?.trip_start && u.data?.inputs?.trip_end)
                    ? `🌴 Отпуск: ${u.data.inputs.trip_start} — ${u.data.inputs.trip_end}`
                    : '📅 Даты отпуска еще не выбраны';

                return `
                    <div class="user-directory-card ${unreadCount > 0 ? 'has-unread' : ''}">
                        <div style="display:flex; align-items:flex-start; gap:10px; flex:1;">
                            ${avHtml}
                            <div style="flex:1;">
                                <div style="font-weight:800; color:var(--heading); font-size:0.94rem; display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                                    <span>${u.displayName || uKey}</span>
                                    ${isMe ? '<span style="font-size:0.7rem; color:var(--accent);">(Вы)</span>' : ''}
                                    ${isAdminRole ? '<span style="font-size:0.68rem; color:var(--warning);">[🛡️ Админ]</span>' : ''}
                                    ${unreadCount > 0 ? `<span class="unread-badge" title="Пропущенных сообщений: ${unreadCount}">${unreadCount} новых</span>` : ''}
                                </div>
                                <div style="font-size:0.73rem; margin-top:2px;">${seenInfo.html}</div>
                                <div style="font-size:0.76rem; color:var(--desc-text); margin-top:4px;">
                                    ${u.bio ? `💬 «${u.bio}»` : '<span style="color:var(--muted);">Описание профиля не указано</span>'}
                                </div>
                                <div style="font-size:0.71rem; color:var(--muted); margin-top:3px;">${userDates}</div>
                            </div>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
                            ${!isMe ? `
                                <button class="cal-nav-btn" style="background:${unreadCount > 0 ? 'var(--danger)' : 'var(--accent)'}; color:#fff; border:none; display:flex; align-items:center; gap:5px;" onclick="openDirectChat('${uKey}')">
                                    <span>💬 Сообщение</span>
                                    ${unreadCount > 0 ? `<span class="unread-badge" style="background:#fff; color:var(--danger); margin:0;">${unreadCount}</span>` : ''}
                                </button>
                            ` : `
                                <button class="link-btn" onclick="openProfileSettingsModal()">⚙️ Настроить</button>
                            `}
                        </div>
                    </div>
                `;
            }).join('');

            if (activeChatPeerKey && document.getElementById('directChatWrap')?.classList.contains('open')) {
                if (currentActiveTab === 'users') {
                    markChatMessagesRead(activeChatPeerKey);
                }
                renderDirectChatMessages();
            }
        }

        function openDirectChat(peerKey) {
            if (!currentUser || !peerKey) return;
            activeChatPeerKey = peerKey;
            const wrap = document.getElementById('directChatWrap');
            if (wrap) wrap.classList.add('open');

            markChatMessagesRead(peerKey);
            renderUsersDirectoryAndChat();
            renderDirectChatMessages();

            setTimeout(() => {
                document.getElementById('directChatInput')?.focus();
                wrap?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 80);
        }

        function closeDirectChat() {
            activeChatPeerKey = null;
            document.getElementById('directChatWrap')?.classList.remove('open');
        }

        function markChatMessagesRead(peerKey) {
            if (!currentUser || !peerKey) return;
            const roomId = getChatRoomId(currentUser, peerKey);
            const chats = getDirectChatsDb();
            const msgs = chats[roomId] || [];
            let changed = false;

            msgs.forEach(m => {
                if (m.to && m.to.toLowerCase() === currentUser.toLowerCase() && !m.read) {
                    m.read = true;
                    m.readAt = Date.now();
                    changed = true;
                }
            });

            if (changed) {
                saveDirectChatsDb(chats, true);
                updateGlobalUnreadBadges();
            }
        }

        function onDirectChatInputTyping() {
            if (!currentUser || !activeChatPeerKey) return;
            const now = Date.now();
            if (now - lastTypingSentTs < 1200) return;
            lastTypingSentTs = now;

            const typ = getChatTypingDb();
            typ[`${currentUser.toLowerCase()}__${activeChatPeerKey.toLowerCase()}`] = now;
            saveChatTypingDb(typ);

            if (mqttClient && mqttClient.connected) {
                try {
                    mqttClient.publish(MQTT_TYPING_TOPIC, JSON.stringify({ from: currentUser, to: activeChatPeerKey, ts: now }));
                } catch (e) {}
            }
            pushStateToCloudSilent();
        }

        function updateDirectChatTypingUI() {
            const line = document.getElementById('chatTypingIndicatorLine');
            if (!line || !currentUser || !activeChatPeerKey) return;
            const typ = getChatTypingDb();
            const peerTypingTs = typ[`${activeChatPeerKey.toLowerCase()}__${currentUser.toLowerCase()}`] || 0;
            const isPeerTyping = (Date.now() - peerTypingTs) <= 4200;
            const db = getUsersDb();
            const peerName = db[activeChatPeerKey]?.displayName || activeChatPeerKey;
            if (isPeerTyping) {
                line.style.display = 'block';
                line.innerText = `✍️ ${peerName} печатает сообщение...`;
            } else {
                line.style.display = 'none';
            }
        }

        function sendDirectChatMessage() {
            if (!currentUser || !activeChatPeerKey) return;
            const inp = document.getElementById('directChatInput');
            const text = (inp?.value || '').trim();
            if (!text) return;

            const db = getUsersDb();
            const senderName = db[currentUser]?.displayName || currentUser;
            const roomId = getChatRoomId(currentUser, activeChatPeerKey);
            const chats = getDirectChatsDb();
            if (!chats[roomId]) chats[roomId] = [];

            chats[roomId].push({
                id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                from: currentUser,
                fromName: senderName,
                to: activeChatPeerKey,
                text,
                ts: Date.now(),
                sent: true,
                read: false
            });

            inp.value = '';
            // Сбрасываем индикатор печати после отправки
            const typ = getChatTypingDb();
            typ[`${currentUser.toLowerCase()}__${activeChatPeerKey.toLowerCase()}`] = 0;
            saveChatTypingDb(typ);

            saveDirectChatsDb(chats, true);
            renderDirectChatMessages();
        }

        function renderDirectChatMessages() {
            if (!currentUser || !activeChatPeerKey) return;
            const db = getUsersDb();
            const peerObj = db[activeChatPeerKey] || {};
            const peerName = peerObj.displayName || activeChatPeerKey;
            const seenInfo = formatLastSeenStatus(activeChatPeerKey);

            document.getElementById('chatPeerAvatarBox').innerHTML = getUserInlineAvatarHtml(activeChatPeerKey, 36);
            document.getElementById('chatPeerNameLbl').innerText = peerName;
            document.getElementById('chatPeerStatusLbl').innerHTML = seenInfo.html;

            updateDirectChatTypingUI();

            const area = document.getElementById('directChatMessagesArea');
            if (!area) return;

            const roomId = getChatRoomId(currentUser, activeChatPeerKey);
            const chats = getDirectChatsDb();
            const msgs = chats[roomId] || [];

            if (msgs.length === 0) {
                area.innerHTML = `<div style="margin:auto; text-align:center; color:var(--muted); font-size:0.8rem;">Диалог с <b>${escapeHtml(peerName)}</b> пока пуст. Напишите первое сообщение ниже!</div>`;
                return;
            }

            area.innerHTML = msgs.map(m => {
                const isMine = m.from && m.from.toLowerCase() === currentUser.toLowerCase();
                const tStr = new Date(m.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                const checkTicks = isMine
                    ? (m.read
                        ? `<span style="color:#a7f3d0; font-weight:800;" title="Прочитано собеседником">✓✓ Прочитано</span>`
                        : `<span style="opacity:0.85;" title="Отправлено">✓ Отправлено</span>`)
                    : '';

                return `
                    <div class="chat-msg-bubble ${isMine ? 'me' : 'peer'}">
                        <div>${escapeHtml(m.text)}</div>
                        <div class="chat-msg-meta">
                            <span>${tStr}</span>
                            ${checkTicks}
                        </div>
                    </div>
                `;
            }).join('');

            area.scrollTop = area.scrollHeight;
        }
