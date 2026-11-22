        function fmt(num, digits = 2) {
            return Number(num || 0).toLocaleString('ru-RU', {minimumFractionDigits: digits, maximumFractionDigits: digits});
        }
        function fmtInt(num) {
            return Math.round(Number(num || 0)).toLocaleString('ru-RU');
        }

        /* ==================== ПЕРЕКЛЮЧЕНИЕ ТЕМЫ (СВЕТЛАЯ / ТЕМНАЯ) ==================== */
        function applyTheme(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            const btn = document.getElementById('themeToggleBtn');
            const meta = document.getElementById('metaThemeColor');
            if (theme === 'light') {
                if (btn) btn.innerText = '🌙 Темная';
                if (meta) meta.setAttribute('content', '#f2f5f9');
            } else {
                if (btn) btn.innerText = '☀️ Светлая';
                if (meta) meta.setAttribute('content', '#0f1115');
            }
        }

        function toggleTheme() {
            const cur = document.documentElement.getAttribute('data-theme') || 'dark';
            const next = cur === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            saveUserDataState();
        }

        /* ==================== ОБНОВЛЕНИЕ ЭКРАНА СМАХИВАНИЕМ ВНИЗ (PULL-TO-REFRESH) ==================== */
        function initPullToRefresh() {
            let startY = 0;
            let pulling = false;
            const ptrEl = document.getElementById('ptrIndicator');
            if (!ptrEl) return;

            window.addEventListener('touchstart', (e) => {
                if (window.scrollY <= 2 && e.touches.length === 1) {
                    startY = e.touches[0].clientY;
                    pulling = true;
                } else {
                    pulling = false;
                }
            }, { passive: true });

            window.addEventListener('touchmove', (e) => {
                if (!pulling) return;
                const dy = e.touches[0].clientY - startY;
                if (dy > 18 && window.scrollY <= 2) {
                    const h = Math.min(58, Math.round((dy - 18) * 0.45));
                    ptrEl.style.height = h + 'px';
                    ptrEl.classList.add('active');
                    ptrEl.innerText = h >= 48
                        ? '⬆️ Отпустите для полного обновления данных сайта...'
                        : '⬇️ Потяните вниз для обновления...';
                }
            }, { passive: true });

            window.addEventListener('touchend', async () => {
                if (!pulling) return;
                pulling = false;
                const curH = parseInt(ptrEl.style.height || '0', 10);
                if (curH >= 48) {
                    ptrEl.style.height = '46px';
                    ptrEl.innerText = '⏳ Синхронизация всех данных сайта...';
                    await refreshAllDashboard();
                    ptrEl.innerText = '✅ Все данные обновлены!';
                    setTimeout(() => {
                        ptrEl.style.height = '0px';
                        ptrEl.classList.remove('active');
                    }, 550);
                } else {
                    ptrEl.style.height = '0px';
                    ptrEl.classList.remove('active');
                }
            }, { passive: true });
        }

        /* ==================== КНОПКА ПРОСМОТРА ПАРОЛЯ («ГЛАЗОК») ==================== */
        function togglePasswordVisibility(inputId, btnEl) {
            const inp = document.getElementById(inputId);
            if (!inp) return;
            if (inp.type === 'password') {
                inp.type = 'text';
                if (btnEl) btnEl.innerText = '🙈';
            } else {
                inp.type = 'password';
                if (btnEl) btnEl.innerText = '👁️';
            }
        }

        /* ==================== АВАТАРКИ ПОЛЬЗОВАТЕЛЕЙ ВО ВСЕХ РАЗДЕЛАХ ==================== */
        function createEmojiSvgDataUrl(emoji, bg = '#007aff') {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="${bg}"/><text x="50" y="68" font-size="56" text-anchor="middle">${emoji}</text></svg>`;
            return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
        }

        function compressImageFileToDataUrl(file, maxSize = 96, quality = 0.78) {
            return new Promise((resolve) => {
                if (!file) { resolve(''); return; }
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        let w = img.width;
                        let h = img.height;
                        if (w > h) {
                            if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
                        } else {
                            if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
                        }
                        canvas.width = w;
                        canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = '#181b21';
                        ctx.fillRect(0, 0, w, h);
                        ctx.drawImage(img, 0, 0, w, h);
                        resolve(canvas.toDataURL('image/jpeg', quality));
                    };
                    img.onerror = () => resolve('');
                    img.src = e.target.result;
                };
                reader.onerror = () => resolve('');
                reader.readAsDataURL(file);
            });
        }

        function renderSafeAvatarIntoElement(el, avatarVal, fallbackName) {
            if (!el) return;
            const letter = ((fallbackName || 'U').trim().charAt(0) || 'U').toUpperCase();
            const val = (avatarVal || '').trim();

            if (!val) {
                el.innerText = letter;
                return;
            }
            if (val.length <= 4 && !val.startsWith('http') && !val.startsWith('data:')) {
                el.innerText = val;
                return;
            }
            el.innerHTML = '';
            const img = document.createElement('img');
            img.alt = letter;
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
            img.onerror = () => {
                el.innerHTML = '';
                el.innerText = letter;
            };
            img.src = val;
            el.appendChild(img);
        }

        function getUserInlineAvatarHtml(userKeyOrName, sizePx = 20) {
            const db = getUsersDb();
            const target = (userKeyOrName || '').trim().toLowerCase();
            let uObj = db[userKeyOrName];
            if (!uObj && target) {
                const foundKey = Object.keys(db).find(k => k.toLowerCase() === target || (db[k]?.displayName || '').toLowerCase() === target);
                if (foundKey) uObj = db[foundKey];
            }
            const nameStr = uObj?.displayName || userKeyOrName || 'У';
            const letter = (nameStr.trim().charAt(0) || 'У').toUpperCase().replace(/["'<>]/g, '');
            const av = (uObj?.avatar || '').trim();
            const styleStr = `width:${sizePx}px;height:${sizePx}px;font-size:${Math.round(sizePx * 0.56)}px;`;

            if (!av) {
                return `<span class="inline-user-av" style="${styleStr}">${letter}</span>`;
            }
            if (av.length <= 4 && !av.startsWith('http') && !av.startsWith('data:')) {
                return `<span class="inline-user-av" style="${styleStr}">${av}</span>`;
            }
            const safeSrc = av.replace(/"/g, '&quot;');
            return `<span class="inline-user-av" style="${styleStr}"><img src="${safeSrc}" alt="${letter}" onerror="this.parentElement.innerText='${letter}'"></span>`;
        }


/* ==================== ТУМБЛЕР ГЕОЛОКАЦИИ НА ГЛАВНОЙ ==================== */
        function calcDistanceKm(lat1, lon1, lat2, lon2) {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                      Math.sin(dLon/2) * Math.sin(dLon/2);
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }

        function findNearestPhuketDistrict(lat, lon) {
            let bestKey = 'kata';
            let minDist = Infinity;
            Object.keys(phuketDistricts).forEach(k => {
                const d = phuketDistricts[k];
                const dist = calcDistanceKm(lat, lon, d.lat, d.lon);
                if (dist < minDist) {
                    minDist = dist;
                    bestKey = k;
                }
            });
            return { key: bestKey, distKm: minDist };
        }

        function onGeoToggleChange(checked) {
            geoState.enabled = Boolean(checked);
            const subEl = document.getElementById('geoStatusSub');
            if (!checked) {
                if (subEl) subEl.innerText = 'Выключено (используется выбранный вручную район)';
                saveUserDataState();
                return;
            }

            if (!('geolocation' in navigator)) {
                if (subEl) subEl.innerText = '⚠️ Браузер не поддерживает GPS';
                document.getElementById('geoMasterToggle').checked = false;
                geoState.enabled = false;
                return;
            }

            if (subEl) subEl.innerText = '📡 Определение ваших координат...';
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    geoState.lat = pos.coords.latitude;
                    geoState.lon = pos.coords.longitude;
                    const nearest = findNearestPhuketDistrict(geoState.lat, geoState.lon);
                    geoState.nearestDistrict = nearest.key;

                    const sel = document.getElementById('weatherDistrictSelect');
                    if (sel && phuketDistricts[nearest.key]) {
                        sel.value = nearest.key;
                    }
                    const dName = phuketDistricts[nearest.key]?.name || 'Ката';
                    if (subEl) {
                        subEl.innerHTML = `<span style="color:var(--success);font-weight:700;">✓ GPS активен:</span> ${geoState.lat.toFixed(3)}°, ${geoState.lon.toFixed(3)}° ➔ <b>${dName}</b>`;
                    }
                    onDistrictChange();
                    scanRealTimeTides();
                    saveUserDataState();
                },
                () => {
                    if (subEl) subEl.innerText = '⚠️ Доступ к геолокации отклонен (работает район Ката)';
                    document.getElementById('geoMasterToggle').checked = false;
                    geoState.enabled = false;
                    saveUserDataState();
                },
                { enableHighAccuracy: true, timeout: 7000 }
            );
        }

