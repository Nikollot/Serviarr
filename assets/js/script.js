const APP_VERSION = "1.3";
const UPDATE_URL = "https://raw.githubusercontent.com/Nikollot/Serviarr/main/version.json";

const DRIVER_ICONS = {docker:'🐳', sonarr:'📺',radarr:'🎬',prowlarr:'🔍',indexer:'🔍',transmission:'⬇',download:'⬇',jellyfin:'🎵',qbittorrent:'🌊',sabnzbd:'📥',lidarr:'🎶',readarr:'📚', iframe:'🌐', supervision:'📊'};
let appsCache = [], editingId = null;

// ── SÉLECTION GROUPÉE (films / séries / téléchargements) ────────────────────
let bulkSelectMode = false;
let bulkSelectedIds = new Set();

window.longPressTimer = null;
window.preventNextClick = false;

window.startLongPress = function(id) {
    window.preventNextClick = false;
    window.longPressTimer = setTimeout(() => {
        window.preventNextClick = true; // Empêchera le "clic" classique d'ouvrir le média
        if (!bulkSelectMode) {
            toggleBulkMode(); // Active le mode multi-sélection s'il est éteint
        }
        if (!bulkSelectedIds.has(id)) {
            toggleBulkSelect(id); // Coche l'élément
        }
        // Retour haptique (légère vibration) sur mobile si le navigateur le supporte
        if (navigator.vibrate) navigator.vibrate(50);
    }, 500); // Temps d'appui nécessaire : 500ms
};

window.cancelLongPress = function() {
    clearTimeout(window.longPressTimer);
};

function currentBulkType() {
    if (document.getElementById('movies-grid')) return 'movie';
    if (document.getElementById('series-grid')) return 'serie';
    if (document.getElementById('downloads-list')) return 'torrent';
    return null;
}

function getVisibleBulkIds() {
    const type = currentBulkType();
    if (type === 'movie') return _moviesAllData.map(m => m.id);
    if (type === 'serie') return _seriesAllData.map(s => s.id);
    if (type === 'torrent') return getVisibleTorrents().map(tor => tor.id);
    return [];
}

function toggleSelectAll() {
    const visibleIds = getVisibleBulkIds();
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => bulkSelectedIds.has(id));

    if (allSelected) {
        bulkSelectedIds.clear();
    } else {
        visibleIds.forEach(id => bulkSelectedIds.add(id));
    }

    if (bulkSelectMode && bulkSelectedIds.size === 0) {
        bulkSelectMode = false;
        const btn = document.getElementById('btn-bulk-toggle');
        if (btn) btn.classList.remove('active');
    }

    // 🔥 OPTIMISATION : On ne redessine plus toute la grille
    updateBulkDOM();
    renderBulkBar();
}

function refreshCurrentGridOnly() {
    if (document.getElementById('movies-grid') && typeof renderMoviesGridOnly === 'function') renderMoviesGridOnly();
    else if (document.getElementById('series-grid') && typeof renderSeriesGridOnly === 'function') renderSeriesGridOnly();
    else if (document.getElementById('downloads-list') && typeof renderTorrents === 'function') renderTorrents();
}

function toggleBulkMode() {
    bulkSelectMode = !bulkSelectMode;
    if (!bulkSelectMode) bulkSelectedIds.clear();
    const btn = document.getElementById('btn-bulk-toggle');
    if (btn) btn.classList.toggle('active', bulkSelectMode);

    // 🔥 OPTIMISATION
    updateBulkDOM();
    renderBulkBar();
}

function toggleBulkSelect(id) {
    if (bulkSelectedIds.has(id)) bulkSelectedIds.delete(id);
    else bulkSelectedIds.add(id);

    if (bulkSelectMode && bulkSelectedIds.size === 0) {
        bulkSelectMode = false;
        const btn = document.getElementById('btn-bulk-toggle');
        if (btn) btn.classList.remove('active');
    }

    // 🔥 OPTIMISATION
    updateBulkDOM();
    renderBulkBar();
}

function renderBulkBar() {
    let bar = document.getElementById('bulk-action-bar');
    if (!bulkSelectMode) {
        if (bar) bar.remove();
        return;
    }
    const type = currentBulkType();
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'bulk-action-bar';
        bar.className = 'bulk-action-bar';
        document.body.appendChild(bar);
    }

    const countLabel = `<span class="bulk-action-count">${bulkSelectedIds.size} ${t('bulk_selected_count')}</span>`;
    const cancelBtn = `<button class="btn-sm secondary" onclick="toggleBulkMode()">✕ ${t('bulk_cancel')}</button>`;

    const visibleIds = getVisibleBulkIds();
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => bulkSelectedIds.has(id));
    const selectAllBtn = `<button class="btn-sm secondary" onclick="toggleSelectAll()">${allSelected ? '◻️ ' + t('bulk_deselect_all') : '☑️ ' + t('bulk_select_all')}</button>`;

    // Tant que rien n'est sélectionné, on n'affiche que "tout sélectionner" + "annuler" (pas d'actions destructrices dans le vide)
    if (bulkSelectedIds.size === 0) {
        bar.innerHTML = `${countLabel} ${selectAllBtn} ${cancelBtn}`;
        return;
    }

    if (type === 'torrent') {
        bar.innerHTML = `
        ${countLabel}
        ${selectAllBtn}
        <button class="btn-sm secondary" onclick="executeBulkAction('torrent-start')">▶ ${t('torrent_resume')}</button>
        <button class="btn-sm secondary" onclick="executeBulkAction('torrent-stop')">⏸ ${t('torrent_pause')}</button>
        <button class="btn-sm" style="background:var(--accent3); color:#fff;" onclick="executeBulkAction('torrent-remove')">🗑️ ${t('bulk_delete')}</button>
        ${cancelBtn}
        `;
    } else {
        const iconMonitored = ICON_MONITORED.replace('width: 18px; height: 18px;', 'width: 16px; height: 16px;');
        const iconUnmonitored = ICON_UNMONITORED.replace('width: 18px; height: 18px;', 'width: 16px; height: 16px;').replace('color: rgba(255,255,255,0.8)', 'color: var(--muted)');
        bar.innerHTML = `
        ${countLabel}
        ${selectAllBtn}
        <button class="btn-sm secondary" onclick="executeBulkAction('monitor_on')">${iconMonitored} ${t('bulk_monitor_on')}</button>
        <button class="btn-sm secondary" onclick="executeBulkAction('monitor_off')">${iconUnmonitored} ${t('bulk_monitor_off')}</button>
        <button class="btn-sm" style="background:var(--accent3); color:#fff;" onclick="executeBulkAction('delete')">🗑️ ${t('bulk_delete')}</button>
        ${cancelBtn}
        `;
    }
}

function exitBulkMode() {
    bulkSelectedIds.clear();
    bulkSelectMode = false;
    const btn = document.getElementById('btn-bulk-toggle');
    if (btn) btn.classList.remove('active');
    renderBulkBar();
}

async function executeBulkAction(action) {
    const type = currentBulkType();
    if (!type || bulkSelectedIds.size === 0) return;
    const ids = Array.from(bulkSelectedIds);

    if (type === 'torrent') {
        const runTorrentAction = async (deleteFiles) => {
            notify(t('bulk_in_progress'), 'ok');
            const r = await api('torrent_action', {
                method: action,
                ids: JSON.stringify(ids),
                'delete-local-data': deleteFiles ? 'true' : 'false'
            });
            notify(r.ok ? t('bulk_done').replace('{n}', ids.length) : (r.error || t('notif_error')), r.ok ? 'ok' : 'err');
            exitBulkMode();
            loadDownloads();
        };

        if (action === 'torrent-remove') {
            showConfirmModal(
                t('bulk_delete_title'),
                t('bulk_delete_msg').replace('{n}', ids.length),
                () => runTorrentAction(true)
            );
        } else {
            runTorrentAction(false);
        }
        return;
    }

    const runIt = async (deleteFiles) => {
        notify(t('bulk_in_progress'), 'ok');
        const r = await api('bulk_media_action', {
            type,
            ids: JSON.stringify(ids),
            bulkAction: action,
            deleteFiles: deleteFiles ? '1' : '0'
        });
        if (r.ok) {
            notify(t('bulk_done').replace('{n}', r.success ?? ids.length), 'ok');
        } else {
            notify(r.error || t('notif_error'), 'err');
        }
        exitBulkMode();
        if (type === 'movie') loadMovies(); else loadSeries();
    };

    if (action === 'delete') {
        showConfirmModal(
            t('bulk_delete_title'),
            t('bulk_delete_msg').replace('{n}', ids.length),
            () => runIt(true)
        );
    } else {
        runIt(false);
    }
}

// Fonction universelle pour gérer l'affichage des icônes
function getAppIconHtml(app) {
    const fallbackEmoji = app.icon || DRIVER_ICONS[app.driver] || '📦';
    if (app.icon_url && app.icon_url.trim() !== '') {
        return `
        <img src="${esc(app.icon_url)}" style="width:20px; height:20px; object-fit:contain; border-radius:4px; display:block;" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';">
        <span style="display:none; align-items:center; justify-content:center; font-size:18px;">${fallbackEmoji}</span>`;
    }
    // 🌟 AJOUT DE 'indexer' ICI
    const imageDrivers = ['radarr', 'sonarr', 'prowlarr', 'indexer'];
    if (imageDrivers.includes(app.driver)) {
        return `
        <img src="/assets/img/default/${app.driver}.png" style="width:20px; height:20px; object-fit:contain; border-radius:4px; display:block;" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';">
        <span style="display:none; align-items:center; justify-content:center; font-size:18px;">${fallbackEmoji}</span>`;
    }
    return fallbackEmoji;
}

const ICON_MONITORED = `<svg aria-hidden="true" focusable="false" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" style="width: 18px; height: 18px; color: var(--accent);"><path fill="currentColor" d="M0 48V487.7C0 501.1 10.9 512 24.3 512c5 0 9.9-1.5 14-4.4L192 400 345.7 507.6c4.1 2.9 9 4.4 14 4.4c13.4 0 24.3-10.9 24.3-24.3V48c0-26.5-21.5-48-48-48H48C21.5 0 0 21.5 0 48z"></path></svg>`;
const ICON_UNMONITORED = `<svg aria-hidden="true" focusable="false" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" style="width: 18px; height: 18px; color: rgba(255,255,255,0.8);"><path fill="currentColor" d="M0 48C0 21.5 21.5 0 48 0l0 48 0 393.4 130.1-92.9c8.3-6 19.6-6 27.9 0L336 441.4 336 48 48 48 48 0 336 0c26.5 0 48 21.5 48 48l0 440c0 9-5 17.2-13 21.3s-17.6 3.4-24.9-1.8L192 397.5 37.9 507.5c-7.3 5.2-16.9 5.9-24.9 1.8S0 497 0 488L0 48z"></path></svg>`;

function formatReleaseDate(dateStr) {
    if (!dateStr) return `<span style="color: var(--muted); font-style: italic;">${t('not_planned')}</span>`;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return `<span style="color: var(--muted); font-style: italic;">${t('not_planned')}</span>`;
    return d.toLocaleDateString(currentLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const isDesktop = window.innerWidth >= 1024;
    if (isDesktop) {
        document.body.classList.toggle('sidebar-closed');
    } else {
        if (sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
            overlay.classList.remove('show');
        } else {
            sidebar.classList.add('open');
            overlay.classList.add('show');
        }
    }
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
async function boot() {
    const r = await api('check_setup', {}, 'GET');

    // Si l'API renvoie une erreur (JSON corrompu, erreur PHP, etc.)
    if (r.error || typeof r.setup_done === 'undefined') {
        document.getElementById('auth-subtitle').innerHTML = '⚠️ ' + t('err_system_title');
        document.getElementById('auth-form-login').innerHTML = '<p style="color:var(--accent3); text-align:center; font-size:13px; line-height:1.5;">' + t('err_system_api') + '</p>';
        return;
    }

    if (r.setup_done === false) {
        document.getElementById('auth-form-login').style.display = 'none';
        document.getElementById('auth-form-setup').style.display = 'block';
        document.getElementById('auth-subtitle').textContent = t('auth_setup_hint');
    } else if (r.auth) {
        showApp();
    }

    document.getElementById('login-pw')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    document.getElementById('setup-pw2')?.addEventListener('keydown', e => { if (e.key === 'Enter') doSetup(); });
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
async function doLogin() {
    const r = await api('login', { password: document.getElementById('login-pw').value });
    if (r.ok) {
        if (r.requires_2fa) {
            document.getElementById('auth-form-login').style.display = 'none';
            document.getElementById('auth-form-2fa').style.display = 'block';
            document.getElementById('auth-subtitle').textContent = t('auth_2fa_title');
            setTimeout(() => document.getElementById('login-2fa-code').focus(), 100);
        } else {
            window.location.reload();
        }
    } else {
        showAuthErr('login', r.error || t('err_unknown'));
    }
}

async function doSetup() {
    const pw = document.getElementById('setup-pw').value, pw2 = document.getElementById('setup-pw2').value;
    if (pw !== pw2) { showAuthErr('setup', t('auth_pw_mismatch')); return; }
    const r = await api('setup', { password: pw });
    if (r.ok) showApp(); else showAuthErr('setup', r.error || t('err_unknown'));
}
async function doLogout() { await api('logout', {}); location.reload(); }
function showAuthErr(form, msg) {
    const el = document.getElementById(form + '-err');
    el.textContent = msg; el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 4000);
}

// ── SHOW APP ──────────────────────────────────────────────────────────────────
function showApp() {
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('app').style.display = 'flex';

    if (typeof pageInit === 'function') pageInit();

    setTimeout(() => {
        const hash = window.location.hash;
        const urlParams = new URLSearchParams(window.location.search);

        if (hash === '#hub_films') switchHomeTab('movies', null, false);
        else if (hash === '#hub_series') switchHomeTab('series', null, false);

        if (urlParams.has('movie')) openMovieDetail(urlParams.get('movie'));
        else if (urlParams.has('tmdb')) openTmdbMovieDetail(urlParams.get('tmdb'));
        else if (urlParams.has('tmdb_serie')) openTmdbSerieDetail(urlParams.get('tmdb_serie'));
        else if (urlParams.has('serie')) openSerieDetail(urlParams.get('serie'));
        else if (urlParams.has('magnet')) {
            if (typeof openAddTorrentModal === 'function') {
                openAddTorrentModal();
                document.getElementById('torrent-magnet-link').value = urlParams.get('magnet');
            }
        }
    }, 150);

    loadDriverOptions();
    loadAppsList();
    checkForUpdates();
}

function showTab(name) {
    if (name === 'settings') {
        document.getElementById('tab-settings').style.display = 'block';
        loadTmdbConfig();
        loadPushConfig();
        loadWebhookUrl();
        loadActivityLog();
        if (typeof loadAppsList === 'function') loadAppsList();
        if (typeof loadDriverOptions === 'function') loadDriverOptions();
        if (typeof load2FAStatus === 'function') load2FAStatus();
        initSettingsAccordion();
    }
}

function hideSettings() { document.getElementById('tab-settings').style.display = 'none'; }

// ── HOME ──────────────────────────────────────────────────────────────────────
let calYear = new Date().getFullYear(), calMonth = new Date().getMonth();
let calEvents = {};

async function loadHome() {
    renderCalendar();
    loadCalendarEvents();
    initCalendarSwipe();
}

let calTouchStartX = 0;
let calTouchStartY = 0;

function initCalendarSwipe() {
    const calContainer = document.getElementById('cal-days');
    if (!calContainer || calContainer.dataset.swipeInited) return;
    calContainer.dataset.swipeInited = 'true';

    calContainer.addEventListener('touchstart', e => {
        calTouchStartX = e.changedTouches[0].screenX;
        calTouchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    calContainer.addEventListener('touchend', e => {
        const diffX = e.changedTouches[0].screenX - calTouchStartX;
        const diffY = e.changedTouches[0].screenY - calTouchStartY;
        const threshold = 60;

        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > threshold) {
            calMove(diffX < 0 ? 1 : -1);
        }
    }, { passive: true });
}

function calMove(dir) {
    calMonth += dir;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    if (calMonth < 0)  { calMonth = 11; calYear--; }
    renderCalendar();
    loadCalendarEvents();
    document.getElementById('side-panel-title').textContent = t('cal_select_day');
    document.getElementById('side-panel-icon').textContent = '📅';
    document.getElementById('side-panel-content').innerHTML = `<p style="color:var(--muted);font-size:13px;">${t('cal_click_day')}</p>`;
}

async function loadCalendarEvents() {
    const start = `${calYear}-${String(calMonth+1).padStart(2,'0')}-01`;
    const nextMonth = new Date(calYear, calMonth + 1, 1);
    const end = nextMonth.getFullYear() + '-' + String(nextMonth.getMonth() + 1).padStart(2, '0') + '-' + String(nextMonth.getDate()).padStart(2, '0');
    const r = await api(`calendar&start=${start}&end=${end}`, {}, 'GET');
    calEvents = {};
    (r.events || []).forEach(ev => {
        if (!calEvents[ev.date]) calEvents[ev.date] = [];
        calEvents[ev.date].push(ev);
    });
    renderCalendar();
    const today = new Date();
    const todayKey = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    if (calYear === today.getFullYear() && calMonth === today.getMonth()) {
        showDayEvents(todayKey, today);
        document.querySelectorAll('.cal-day').forEach(d => {
            const num = d.querySelector('.day-num');
            if (num && parseInt(num.textContent) === today.getDate() && !d.classList.contains('other-month')) {
                d.classList.add('selected');
            }
        });
    }
}

function renderCalendar() {
    const months = [t('cal_month_01'),t('cal_month_02'),t('cal_month_03'),t('cal_month_04'),t('cal_month_05'),t('cal_month_06'),t('cal_month_07'),t('cal_month_08'),t('cal_month_09'),t('cal_month_10'),t('cal_month_11'),t('cal_month_12')];
    document.getElementById('cal-title').textContent = months[calMonth] + ' ' + calYear;

    const today = new Date();
    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay  = new Date(calYear, calMonth+1, 0);
    let startDow = (firstDay.getDay() + 6) % 7;

    const container = document.getElementById('cal-days');
    container.innerHTML = '';

    for (let i = 0; i < startDow; i++) container.appendChild(makeCalDay(new Date(calYear, calMonth, 1 - startDow + i), true));
    for (let d = 1; d <= lastDay.getDate(); d++) {
        const date = new Date(calYear, calMonth, d);
        container.appendChild(makeCalDay(date, false, date.toDateString() === today.toDateString()));
    }
    const remaining = (7 - ((startDow + lastDay.getDate()) % 7)) % 7;
    for (let i = 1; i <= remaining; i++) container.appendChild(makeCalDay(new Date(calYear, calMonth+1, i), true));
}

let selectedCalDay = null;

function makeCalDay(date, otherMonth, isToday) {
    const div = document.createElement('div');
    div.className = 'cal-day' + (otherMonth ? ' other-month' : '') + (isToday ? ' today' : '');
    const key = date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
    const events = calEvents[key] || [];

    const isNewSeason = events.some(ev => ev.type === 'episode' && (
        (ev.episode === 1 && ev.season > 0) || (ev.episodeNumber === 1 && ev.seasonNumber > 0) || (ev.sub && /E0?1\b/i.test(ev.sub) && !/S00/i.test(ev.sub))
    ));

    let html = `<div class="day-num">${date.getDate()}</div><div class="cal-dots">`;
    if (events.some(ev => ev.type === 'movie')) html += `<div class="cal-dot movie"></div>`;
    if (events.some(ev => ev.type === 'episode')) html += `<div class="cal-dot episode"></div>`;
    html += '</div>';

    if (isNewSeason) {
        html += `<div style="font-size:7.5px;font-weight:800;line-height:1.1;color:var(--sonarr);text-align:center;margin-top:4px;text-transform:uppercase;letter-spacing:0.3px;width:100%;box-sizing:border-box;">${t('cal_new_season')}</div>`;
    }

    div.innerHTML = html;
    if (!otherMonth) div.addEventListener('click', () => selectCalDay(key, date));
    return div;
}

function selectCalDay(key, date) {
    document.querySelectorAll('.cal-day.selected').forEach(d => d.classList.remove('selected'));
    document.querySelectorAll('.cal-day').forEach(d => {
        const num = d.querySelector('.day-num');
        if (num && parseInt(num.textContent) === date.getDate() && !d.classList.contains('other-month')) d.classList.add('selected');
    });
        selectedCalDay = key;
        showDayEvents(key, date);
}

function showDayEvents(key, date) {
    const events = calEvents[key] || [];
    const panel = document.getElementById('side-panel-content');
    const title = document.getElementById('side-panel-title');
    const icon  = document.getElementById('side-panel-icon');

    const [ky, km, kd] = key.split('-').map(Number);
    const d = new Date(ky, km-1, kd);
    const label = d.toLocaleDateString(currentLocale(), {weekday:'long', day:'numeric', month:'long'});
    title.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    icon.textContent = '📅';

    if (!events.length) {
        const isToday = ky === new Date().getFullYear() && km === new Date().getMonth()+1 && kd === new Date().getDate();
        panel.innerHTML = `<div style="text-align:center;padding:30px 20px;color:var(--muted);">
        <div style="font-size:32px;margin-bottom:10px;">${isToday ? '✨' : '📭'}</div>
        <div style="font-size:13px;">${isToday ? t('cal_nothing_today') : t('cal_no_event')}</div>
        </div>`;
        return;
    }

    const groupedSeries = {};
    const movies = [];

    events.forEach(ev => {
        if (ev.type === 'movie') movies.push(ev);
        else {
            if (!groupedSeries[ev.title]) groupedSeries[ev.title] = { poster: ev.poster, episodes: [] };
            groupedSeries[ev.title].episodes.push(ev);
        }
    });

    let html = '';

    movies.forEach(ev => {
        const safeTitle = esc(ev.title).replace(/'/g, "\\'");
        let posterUrl = ev.poster || '';
        if (posterUrl && !posterUrl.startsWith('http')) posterUrl = `api.php?action=proxy_image&driver=radarr&url=${encodeURIComponent(posterUrl)}`;

        const badge = ev.grabbed ? `<span class="day-event-badge grabbed">✅ ${t('cal_available')}</span>` : `<span class="day-event-badge pending">⏳ ${t('cal_waiting')}</span>`;
        const releaseLabel = ev.releaseType?.includes('Cinéma') ? `🎬 ${t('rel_cinema')}` : ev.releaseType?.includes('Digital') ? `💻 ${t('rel_digital')}` : ev.releaseType?.includes('Physique') ? `📦 ${t('rel_physical')}` : '';
        const releaseColor = ev.releaseType?.includes('Cinéma') ? 'var(--radarr)' : ev.releaseType?.includes('Digital') ? 'var(--sonarr)' : ev.releaseType?.includes('Physique') ? 'var(--accent2)' : 'var(--muted)';
        const releaseTag = releaseLabel ? `<span style="font-size:10px;font-weight:700;color:${releaseColor};background:${releaseColor}22;border:1px solid ${releaseColor}44;padding:2px 7px;border-radius:10px;">${releaseLabel}</span>` : '';

        html += `<div class="day-event-item" style="flex-shrink: 0;" onclick="navigateFromCalendar('movie', ${ev.radarrId})">
        <div class="day-event-bar ${ev.type}"></div>
        ${posterUrl ? `<img class="day-event-poster" src="${posterUrl}" loading="lazy">` : `<div class="day-event-poster-ph">🎬</div>`}
        <div class="day-event-info">
        <div class="day-event-title">${esc(ev.title)}</div>
        <div class="day-event-sub">${ev.year || ''}</div>
        <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-top:4px;">${releaseTag} ${badge}</div>
        ${ev.time ? `<div class="day-event-time">🕐 ${esc(ev.time)}</div>` : ''}
        </div>
        </div>`;
    });

    Object.entries(groupedSeries).forEach(([seriesTitle, data], index) => {
        const eps = data.episodes;
        const safeTitle = esc(seriesTitle).replace(/'/g, "\\'");
        const uniqueId = 'cal-series-' + index;

        let posterUrl = data.poster || '';
        if (posterUrl && !posterUrl.startsWith('http')) posterUrl = `api.php?action=proxy_image&driver=sonarr&url=${encodeURIComponent(posterUrl)}`;

        if (eps.length === 1) {
            const ev = eps[0];
            const badge = ev.grabbed ? `<span class="day-event-badge grabbed">✓ ${t('cal_available')}</span>` : `<span class="day-event-badge pending">${t('cal_waiting')}</span>`;
            const isNewSeason = (ev.episode === 1 && ev.season > 0) || (ev.episodeNumber === 1 && ev.seasonNumber > 0) || (ev.sub && /E0?1\b/i.test(ev.sub) && !/S00/i.test(ev.sub));
            const seasonBadge = isNewSeason ? `<span class="day-event-badge" style="background: rgba(0,202,255,0.15); color: var(--sonarr); border: 1px solid rgba(0,202,255,0.25); margin-right: 5px;">${t('cal_new_season').replace('<br>',' ')}</span>` : '';

            html += `<div class="day-event-item" style="flex-shrink: 0;" onclick="navigateFromCalendar('serie', ${ev.seriesId})">
            <div class="day-event-bar episode"></div>
            ${posterUrl ? `<img class="day-event-poster" src="${posterUrl}" loading="lazy">` : `<div class="day-event-poster-ph">📺</div>`}
            <div class="day-event-info">
            <div class="day-event-title">${esc(seriesTitle)}</div>
            <div class="day-event-sub">${esc(ev.sub || '')}</div>
            ${ev.time ? `<div class="day-event-time">🕐 ${esc(ev.time)}</div>` : ''}
            <div style="display: flex; gap: 5px; margin-top: 5px; flex-wrap: wrap;">${seasonBadge}${badge}</div>
            </div>
            </div>`;
        } else {
            const allGrabbed = eps.every(e => e.grabbed);
            const globalBadge = allGrabbed ? `<span class="day-event-badge grabbed" style="margin-left:auto;">✓ ${t('cal_all_avail')}</span>` : `<span class="day-event-badge pending" style="margin-left:auto;">${t('cal_waiting')}</span>`;

            html += `
            <div class="day-event-item" style="flex-direction: column; padding: 0; overflow: hidden; flex-shrink: 0;">
            <div style="display: flex; align-items: stretch; cursor: pointer;"
            onclick="const el = document.getElementById('${uniqueId}'); const icon = document.getElementById('icon-${uniqueId}'); if(el.style.display==='none'){el.style.display='block'; icon.style.transform='rotate(180deg)';}else{el.style.display='none'; icon.style.transform='rotate(0deg)';}">
            <div class="day-event-bar episode"></div>
            <div style="display: flex; padding: 10px; align-items: center; gap: 12px; flex: 1;">
            ${posterUrl ? `<img class="day-event-poster" src="${posterUrl}" loading="lazy">` : `<div class="day-event-poster-ph">📺</div>`}
            <div class="day-event-info" style="flex: 1; padding: 0;">
            <div class="day-event-title" style="font-size: 1.1em;">${esc(seriesTitle)}</div>
            <div class="day-event-sub" style="color: var(--sonarr); margin-top: 4px; font-weight: bold;">${t('cal_episodes', {n: eps.length})}</div>
            </div>
            ${globalBadge}
            <div id="icon-${uniqueId}" style="transition: transform 0.2s; color: var(--muted); padding: 0 10px;">▼</div>
            </div>
            </div>
            <div id="${uniqueId}" style="display: none; max-height: 250px; overflow-y: auto; padding: 5px 15px 10px 15px; background: rgba(0,0,0,0.15); border-top: 1px solid var(--border);">
            ${eps.map(ev => {
                const iconStatus = ev.grabbed ? '<span style="color:var(--accent2); font-weight:bold;">✓</span>' : '<span style="color:var(--accent3);">⏳</span>';
                const timeStr = ev.time ? '<span style="font-size:11px; color:var(--muted); margin-left: auto;">🕐 ' + esc(ev.time) + '</span>' : '';
                const isNewSeason = (ev.episode === 1 && ev.season > 0) || (ev.episodeNumber === 1 && ev.seasonNumber > 0) || (ev.sub && /E0?1\b/i.test(ev.sub) && !/S00/i.test(ev.sub));
                const seasonBadge = isNewSeason ? `<span style="font-size: 10px; font-weight: bold; background: rgba(0,202,255,0.12); color: var(--sonarr); border: 1px solid rgba(0,202,255,0.25); border-radius: 4px; padding: 1px 4px; margin-left: 6px; white-space: nowrap;">${t('cal_new_season').replace('<br>',' ')}</span>` : '';

                return `
                <div style="padding: 10px 0; border-bottom: 1px dashed var(--border); display:flex; align-items: center; gap: 10px; cursor: pointer;" onclick="navigateFromCalendar('serie', ${ev.seriesId})">
                ${iconStatus}
                <div style="font-weight:bold; font-size:13px; color: var(--text); display: flex; align-items: center; flex-wrap: wrap;">${esc(ev.sub || '')}${seasonBadge}</div>
                ${timeStr}
                </div>`;
            }).join('')}
            </div>
            </div>`;
        }
    });

    panel.innerHTML = `<div style="max-height:460px;overflow-y:auto;padding-right:2px;display:flex;flex-direction:column;gap:10px;">${html}</div>`;
}

async function openMovieDetailByTitle(title) {
    const r = await api('library_movies&q=' + encodeURIComponent(title) + '&filter=all&page=1', {}, 'GET');
    const mv = (r.movies || []).find(m => m.title === title);
    if (mv) {
        sessionStorage.setItem('serviarr_hub_tab', 'calendar');
        window.location.href = 'films.php?movie=' + mv.id;
    } else {
        notify(t('err_movie_not_found'), 'err');
    }
}

async function openSerieDetailByTitle(title) {
    const r = await api('library_series&q=' + encodeURIComponent(title) + '&filter=all&page=1', {}, 'GET');
    const s = (r.series || []).find(s => s.title === title);
    if (s) {
        sessionStorage.setItem('serviarr_hub_tab', 'calendar');
        window.location.href = 'series.php?serie=' + s.id;
    } else {
        notify(t('err_serie_not_found'), 'err');
    }
}

async function loadRecentDownloads() {
    const r = await api('recent_downloads', {}, 'GET');
    const panel = document.getElementById('side-panel-content');
    const items = r.items || [];
    document.getElementById('side-panel-title').textContent = t('dash_recent_dl');
    document.getElementById('side-panel-icon').textContent = '⬇';
    if (!items.length) { panel.innerHTML = `<p style="color:var(--muted);font-size:13px;">${t('no_recent_dl')}</p>`; return; }
    panel.innerHTML = '<div class="recent-list">' + items.map(it => `
    <div class="recent-item">
    <span class="recent-badge ${it.type}">${it.type === 'movie' ? t('type_movie') : t('type_serie')}</span>
    <span class="recent-title" title="${esc(it.title)}">${esc(it.title)}</span>
    <span class="recent-meta">${esc(it.quality)} · ${esc(it.date)}</span>
    </div>`).join('') + '</div>';
}

async function loadRecommendations() {
    const r = await api('recommendations', {}, 'GET');
    const grid = document.getElementById('reco-grid');
    const items = r.items || [];
    if (!items.length) { grid.innerHTML = `<p style="color:var(--muted);font-size:12px;">${t('dash_no_reco')}</p>`; return; }
    document.getElementById('reco-subtitle').textContent = `${items.length} ${t('dash_suggestions')}`;
    grid.innerHTML = items.map(it => `
    <div class="reco-card">
    <div class="reco-type">${it.type === 'film' ? `🎬 ${t('type_movie')}` : `📺 ${t('type_serie')}`}</div>
    <div class="reco-title">${esc(it.title)} ${it.year ? '<span style="color:var(--muted);font-weight:400">('+it.year+')</span>' : ''}</div>
    <div class="reco-overview">${esc(it.overview)}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;">
    <span class="rating">⭐ ${it.rating}</span>
    </div>
    </div>`).join('');
}

async function toggleMonitor(id, type, newState, element) {
    element.style.opacity = '0.5';
    const r = await api('toggle_monitor', { id: id, type: type, monitored: newState });
    element.style.opacity = '1';
    if (r.ok) {
        element.innerHTML = r.monitored ? ICON_MONITORED : ICON_UNMONITORED;
        element.onclick = (e) => { e.stopPropagation(); toggleMonitor(id, type, !r.monitored, element); };
        notify(r.monitored ? t('monitor_on') : t('monitor_off'), 'ok');
    } else {
        notify(r.error || t('err_change_failed'), 'err');
    }
}

async function toggleSeasonMonitor(seriesId, seasonNumber, newState, element) {
    element.style.opacity = '0.5';
    const r = await api('toggle_season_monitor', { seriesId: seriesId, seasonNumber: seasonNumber, monitored: newState });
    element.style.opacity = '1';
    if (r.ok) {
        element.innerHTML = r.monitored ? ICON_MONITORED : ICON_UNMONITORED;
        element.onclick = (e) => { e.stopPropagation(); toggleSeasonMonitor(seriesId, seasonNumber, !r.monitored, element); };
        notify(r.monitored ? t('season_monitored', {n: seasonNumber}) : t('season_ignored', {n: seasonNumber}), 'ok');
    } else {
        notify(r.error || t('err_change_failed'), 'err');
    }
}

// ── FILMS ─────────────────────────────────────────────────────────────────────
let moviesSearchTimeout;
function moviesSearchDebounce() { clearTimeout(moviesSearchTimeout); moviesSearchTimeout = setTimeout(() => { loadMovies(); }, 400); }
function moviesReload() { loadMovies(); }

async function loadMovies() {
    const recentContainer = document.getElementById('dash-recent-movies');
    const upcomingContainer = document.getElementById('dash-upcoming-movies');
    const recoContainer = document.getElementById('dash-reco-movies');
    const popularContainer = document.getElementById('dash-popular-movies');

    if (recentContainer || upcomingContainer || recoContainer || popularContainer) {
        if (recentContainer) recentContainer.innerHTML = `<p style="color:var(--muted);">${t('status_loading')}</p>`;
        if (upcomingContainer) upcomingContainer.innerHTML = `<p style="color:var(--muted);">${t('status_loading')}</p>`;
        if (recoContainer) recoContainer.innerHTML = `<p style="color:var(--muted);">${t('status_loading')}</p>`;
        if (popularContainer) popularContainer.innerHTML = `<p style="color:var(--muted);">${t('status_loading')}</p>`;

        try {
            const response = await fetch('api.php?action=movies_dashboard');
            const data = await response.json();

            if (!data || data.error) {
                const errMsg = data?.error || t('err_unknown');
                const errHtml = `<p style="color:var(--accent3);">⚠️ ${errMsg}</p>`;
                if (recentContainer) recentContainer.innerHTML = errHtml;
                if (upcomingContainer) upcomingContainer.innerHTML = errHtml;
                if (recoContainer) recoContainer.innerHTML = errHtml;
                if (popularContainer) popularContainer.innerHTML = errHtml;
                return;
            }

            const renderHubRow = (list) => {
                if (!list || list.length === 0) return `<p style="color:var(--muted); font-size:13px; padding:10px;">${t('no_movie_found')}</p>`;
                let html = '<div class="dash-list">';
                list.forEach(mv => {
                    const titleDisplay = typeof esc === 'function' ? esc(mv.title) : mv.title;
                    const titleEsced = titleDisplay.replace(/'/g, "\\'");
                    const clickAction = mv.is_new
                    ? `sessionStorage.setItem('serviarr_hub_tab', 'movies'); window.location.href='films.php?tmdb=${mv.tmdbId}'`
                    : `sessionStorage.setItem('serviarr_hub_tab', 'movies'); window.location.href='films.php?movie=${mv.id}'`;
                    const badge = mv.is_new ? `<div class="dash-badge" style="background:var(--accent); color:#000;">+ ${t('badge_discover')}</div>` : '';

                    html += `
                    <div class="dash-item" onclick="${clickAction}">
                    <div class="dash-poster-wrap">
                    ${badge}
                    <img src="${mv.poster}" class="dash-poster" alt="${titleEsced}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div style="display:none; align-items:center; justify-content:center; width:100%; height:100%; background:var(--bg3); border-radius:10px; border:1px solid var(--border); font-size:24px;">🎬</div>
                    </div>
                    <div class="dash-info">
                    <div class="dash-item-title" title="${titleEsced}">${titleDisplay}</div>
                    </div>
                    </div>`;
                });
                html += '</div>';
                return html;
            };

            if (recentContainer && data.recent) recentContainer.innerHTML = renderHubRow(data.recent);

            if (data.tmdb_missing && recoContainer) {
                const missingKeyMsg = `
                <div style="padding:15px 20px; border:1px solid var(--border); border-radius:10px; background:var(--bg3); font-size:13px; display:flex; align-items:center; gap:15px;">
                <span style="font-size:24px;">🔑</span>
                <div>
                <b style="color:var(--text);">${t('err_tmdb_key_req')}</b><br>
                <span style="color:var(--muted);">${t('err_tmdb_key_desc')}</span>
                </div>
                </div>`;
                recoContainer.innerHTML = missingKeyMsg;
                if (upcomingContainer) upcomingContainer.innerHTML = '';
                if (popularContainer) popularContainer.innerHTML = '';
            } else {
                if (upcomingContainer && data.upcoming) upcomingContainer.innerHTML = renderHubRow(data.upcoming);
                if (recoContainer && data.reco) recoContainer.innerHTML = renderHubRow(data.reco);
                if (popularContainer && data.popular) popularContainer.innerHTML = renderHubRow(data.popular);
            }
        } catch (err) {
            const failMsg = `<p style="color:var(--accent3);">⚠️ ${t('err_conn_server')}</p>`;
            if (recentContainer) recentContainer.innerHTML = failMsg;
            if (upcomingContainer) upcomingContainer.innerHTML = failMsg;
            if (recoContainer) recoContainer.innerHTML = failMsg;
            if (popularContainer) popularContainer.innerHTML = failMsg;
        }
        return;
    }

    const grid = document.getElementById('movies-grid');
    if (!grid) return;
    const mode   = document.getElementById('movies-mode').value;
    const q      = document.getElementById('movies-search').value.trim();
    const filter = document.getElementById('movies-filter').value;

    grid.innerHTML = Array(12).fill('<div class="media-card"><div class="media-card-poster-placeholder">🎬</div><div class="media-card-body"><div class="shimmer" style="height:11px;width:80%;margin-bottom:6px;"></div><div class="shimmer" style="height:10px;width:50%;"></div></div></div>').join('');

    if (mode === 'search') {
        if (!q) {
            grid.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><h3>${t('search_type_title')}</h3><p>${t('search_type_hint')}</p></div>`;
            return;
        }
        if (document.getElementById('movies-filter')) document.getElementById('movies-filter').style.display = 'none';

        const r = await api(`search_movie&q=${encodeURIComponent(q)}`, {}, 'GET');
        if (document.getElementById('movies-count')) document.getElementById('movies-count').textContent = (r.results || []).length + ` ${t('search_results')}`;
        grid.innerHTML = '';
        if (document.getElementById('movies-pagination')) document.getElementById('movies-pagination').innerHTML = '';

        const fragment = document.createDocumentFragment();
        (r.results || []).forEach(mv => fragment.appendChild(makeMovieCard(mv, true)));
        grid.appendChild(fragment);

    } else {
        if (document.getElementById('movies-filter')) document.getElementById('movies-filter').style.display = '';

        const r = await api(`library_movies&q=${encodeURIComponent(q)}&filter=${filter}`, {}, 'GET');

        if (r.error) {
            const titleEsced = typeof esc === 'function' ? esc(r.error) : r.error;
            grid.innerHTML = `<div class="empty-state"><div class="icon">❌</div><h3>${t('err_conn_server')}</h3><p>${titleEsced}</p></div>`;
            if (document.getElementById('movies-count')) document.getElementById('movies-count').textContent = t('err_title');
            return;
        }

        if (document.getElementById('movies-count')) document.getElementById('movies-count').textContent = (r.total || 0) + ` ${t('count_movies')}`;
        grid.innerHTML = '';
        _moviesAllData = r.movies || [];
        const sorted = applySortToMovies([..._moviesAllData]);

        const fragment = document.createDocumentFragment();
        sorted.forEach(mv => fragment.appendChild(makeMovieCard(mv, false)));
        grid.appendChild(fragment);

        if (document.getElementById('movies-pagination')) document.getElementById('movies-pagination').innerHTML = '';
    }
}

function makeMovieCard(mv, isSearch) {
    const div = document.createElement('div');
    div.className = 'media-card';
    const inLib = mv.in_lib || false;
    const hasFile = mv.hasFile ?? false;
    const monitored = mv.monitored ?? false;

    const monitoredIcon = monitored ? `<span title="${t('badge_monitored')}" style="color:var(--radarr)">🔖</span>` : `<span title="${t('badge_unmonitored')}" style="color:var(--muted)">🔕</span>`;
    const statusPill = isSearch
    ? (inLib ? `<span class="pill radarr" style="font-size:10px">✓ ${t('badge_library')}</span>` : '')
    : (hasFile ? '<span class="pill radarr" style="font-size:10px">✓</span>' : '<span class="pill orange" style="font-size:10px">⏳</span>');
    const addBtn = isSearch && !inLib
    ? `<button class="btn-add" onclick="event.stopPropagation();promptAddMedia('movie', ${mv.tmdbId}, '${esc(mv.title).replace(/'/g,"\\'").replace(/"/g,'&quot;')}', this)">＋</button>`
    : '';
    const qualityBadge = mv.quality ? `<span style="font-size:10px;color:var(--radarr)">${esc(mv.quality)}</span>` : '';
    const poster = mv.poster ? `<img class="media-card-poster" src="${esc(mv.poster)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : '';
    const placeholder = `<div class="media-card-poster-placeholder" style="${mv.poster?'display:none':''}">🎬</div>`;

    if (!isSearch) {
        // Ajout des événements tactiles pour le long press
        div.setAttribute('ontouchstart', `startLongPress(${mv.id})`);
        div.setAttribute('ontouchend', 'cancelLongPress()');
        div.setAttribute('ontouchcancel', 'cancelLongPress()');
        div.setAttribute('oncontextmenu', 'if(window.preventNextClick) return false;'); // Bloque le menu natif du navigateur

        div.addEventListener('click', (e) => {
            if (window.preventNextClick) {
                e.stopPropagation();
                e.preventDefault();
                window.preventNextClick = false;
                return;
            }
            if (bulkSelectMode) { e.stopPropagation(); toggleBulkSelect(mv.id); return; }
            openMovieDetail(mv.id);
        });
    }
    else if (inLib) div.addEventListener('click', () => openMovieDetailByTitle(mv.title));
    else if (mv.tmdbId) div.addEventListener('click', () => openTmdbMovieDetail(mv.tmdbId));

    if (!monitored && !isSearch) div.classList.add('unmonitored');
    const bulkCheckbox = (!isSearch) ? `
    <div class="bulk-select-checkbox ${bulkSelectMode ? 'visible' : ''}" onclick="event.stopPropagation(); toggleBulkSelect(${mv.id})">
        <input type="checkbox" ${bulkSelectedIds.has(mv.id) ? 'checked' : ''} readonly>
    </div>` : '';
    if (bulkSelectedIds.has(mv.id)) div.classList.add('bulk-selected');
    div.innerHTML = `
    ${bulkCheckbox}
    ${poster}${placeholder}
    <div class="monitored-badge">${!isSearch ? `<div class="monitored-badge" style="cursor:pointer;" onclick="event.stopPropagation(); toggleMonitor(${mv.id}, 'movie', ${!monitored}, this)">${monitored ? ICON_MONITORED : ICON_UNMONITORED}</div>` : ''}</div>
    <div class="media-card-strip">
    <div class="media-card-strip-title">${esc(mv.title)}</div>
    <div class="media-card-strip-meta">
    ${qualityBadge}
    ${statusPill}
    </div>
    </div>
    <div class="media-card-overlay">
    <div class="media-card-title">${esc(mv.title)}</div>
    <div class="media-card-meta">${mv.year || ''}${mv.rating ? ' &nbsp;⭐ ' + mv.rating : ''}</div>
    <div class="media-card-footer">${qualityBadge} ${statusPill} ${addBtn}</div>
    </div>
    <div class="media-card-body">
    <div class="media-card-title" style="display:flex;align-items:center;gap:6px;">
    <span style="color:var(--radarr);flex-shrink:0;" title="${monitored ? t('badge_monitored') : t('badge_unmonitored')}">${monitored ? ICON_MONITORED : ICON_UNMONITORED}</span>
    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(mv.title)}</span>
    </div>
    <div class="media-card-meta">${mv.year || ''}${mv.rating ? ' · ⭐ ' + mv.rating : ''}</div>
    <div class="media-card-footer" style="margin-top:4px">${qualityBadge} ${statusPill} ${addBtn}</div>
    </div>`;
    return div;
}

// ── SÉRIES ────────────────────────────────────────────────────────────────────
let seriesPage = 1, seriesTimer = null;
let seriesSearchTimeout;
function seriesSearchDebounce() { clearTimeout(seriesSearchTimeout); seriesSearchTimeout = setTimeout(() => { loadSeries(); }, 400); }
function seriesReload() { loadSeries(); }

async function loadSeries() {
    const recentContainer = document.getElementById('dash-recent-series');
    const upcomingContainer = document.getElementById('dash-upcoming-series');
    const recoContainer = document.getElementById('dash-reco-series');
    const popularContainer = document.getElementById('dash-popular-series');
    const upcomingNewContainer = document.getElementById('dash-upcoming-new-series');

    if (recentContainer || upcomingContainer || recoContainer || popularContainer || upcomingNewContainer) {
        if (recentContainer) recentContainer.innerHTML = `<p style="color:var(--muted);">${t('status_loading')}</p>`;
        if (upcomingContainer) upcomingContainer.innerHTML = `<p style="color:var(--muted);">${t('status_loading')}</p>`;
        if (recoContainer) recoContainer.innerHTML = `<p style="color:var(--muted);">${t('status_loading')}</p>`;
        if (popularContainer) popularContainer.innerHTML = `<p style="color:var(--muted);">${t('status_loading')}</p>`;
        if (upcomingNewContainer) upcomingNewContainer.innerHTML = `<p style="color:var(--muted);">${t('status_loading')}</p>`;

        try {
            const response = await fetch('api.php?action=series_dashboard');
            const data = await response.json();

            if (!data || data.error) {
                const errMsg = data?.error || t('err_unknown');
                const errHtml = `<p style="color:var(--accent3);">⚠️ ${errMsg}</p>`;
                if (recentContainer) recentContainer.innerHTML = errHtml;
                if (upcomingContainer) upcomingContainer.innerHTML = errHtml;
                if (recoContainer) recoContainer.innerHTML = errHtml;
                if (popularContainer) popularContainer.innerHTML = errHtml;
                if (upcomingNewContainer) upcomingNewContainer.innerHTML = errHtml;
                return;
            }

            const renderHubRow = (list) => {
                if (!list || list.length === 0) return `<p style="color:var(--muted); font-size:13px; padding:10px;">${t('no_series_found')}</p>`;
                let html = '<div class="dash-list">';
                list.forEach(sr => {
                    const titleDisplay = typeof esc === 'function' ? esc(sr.title) : sr.title;
                    const titleEsced = titleDisplay.replace(/'/g, "\\'");
                    const clickAction = sr.is_new
                    ? `sessionStorage.setItem('serviarr_hub_tab', 'series'); window.location.href='series.php?tmdb_serie=${sr.tmdbId}'`
                    : `sessionStorage.setItem('serviarr_hub_tab', 'series'); window.location.href='series.php?serie=${sr.id}'`;
                    const badge = sr.is_new ? `<div class="dash-badge" style="background:var(--sonarr); color:#000;">+ ${t('badge_discover')}</div>` : '';

                    html += `
                    <div class="dash-item" onclick="${clickAction}">
                    <div class="dash-poster-wrap">
                    ${badge}
                    <img src="${sr.poster}" class="dash-poster" alt="${titleEsced}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div style="display:none; align-items:center; justify-content:center; width:100%; height:100%; background:var(--bg3); border-radius:10px; border:1px solid var(--border); font-size:24px;">📺</div>
                    </div>
                    <div class="dash-info">
                    <div class="dash-item-title" title="${titleEsced}">${titleDisplay}</div>
                    </div>
                    </div>
                    `;
                });
                html += '</div>';
                return html;
            };

            if (recentContainer && data.recent) recentContainer.innerHTML = renderHubRow(data.recent);
            if (upcomingContainer && data.upcoming) upcomingContainer.innerHTML = renderHubRow(data.upcoming);

            if (data.tmdb_missing && (popularContainer || upcomingNewContainer)) {
                const missingKeyMsg = `<div style="padding:15px; border:1px solid var(--border); border-radius:10px; background:var(--bg3);"><b style="color:var(--text);">${t('err_tmdb_key_req')}</b></div>`;
                if (popularContainer) popularContainer.innerHTML = missingKeyMsg;
                if (upcomingNewContainer) upcomingNewContainer.innerHTML = missingKeyMsg;
            } else {
                if (recoContainer && data.reco) recoContainer.innerHTML = renderHubRow(data.reco);
                if (popularContainer && data.popular) popularContainer.innerHTML = renderHubRow(data.popular);
                if (upcomingNewContainer && data.upcoming_series) upcomingNewContainer.innerHTML = renderHubRow(data.upcoming_series);
            }
        } catch (err) { }
        return;
    }

    const mode   = document.getElementById('series-mode').value;
    const q      = document.getElementById('series-search').value.trim();
    const filter = document.getElementById('series-filter').value;
    const grid   = document.getElementById('series-grid');
    if(!grid) return;

    grid.innerHTML = Array(12).fill('<div class="media-card"><div class="media-card-poster-placeholder">🎬</div><div class="media-card-body"><div class="shimmer" style="height:11px;width:80%;margin-bottom:6px;"></div><div class="shimmer" style="height:10px;width:50%;"></div></div></div>').join('');

    if (mode === 'search') {
        if (!q) { grid.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><h3>${t('search_type_title')}</h3><p>${t('search_type_hint')}</p></div>`; return; }
        document.getElementById('series-filter').style.display = 'none';
        const r = await api(`search_serie&q=${encodeURIComponent(q)}`, {}, 'GET');
        document.getElementById('series-count').textContent = (r.results || []).length + ` ${t('search_results')}`;
        grid.innerHTML = '';
        document.getElementById('series-pagination').innerHTML = '';

        const fragment = document.createDocumentFragment();
        (r.results || []).forEach(s => fragment.appendChild(makeSerieCard(s, true)));
        grid.appendChild(fragment);

    } else {
        document.getElementById('series-filter').style.display = '';
        const r = await api(`library_series&q=${encodeURIComponent(q)}&filter=${filter}`, {}, 'GET');
        document.getElementById('series-count').textContent = (r.total || 0) + ` ${t('count_series')}`;
        grid.innerHTML = '';
        _seriesAllData = r.series || [];
        const sortedSeries = applySortToSeries([..._seriesAllData]);

        const fragment = document.createDocumentFragment();
        sortedSeries.forEach(s => fragment.appendChild(makeSerieCard(s, false)));
        grid.appendChild(fragment);

        document.getElementById('series-pagination').innerHTML = '';
    }
}

function makeSerieCard(s, isSearch) {
    const div = document.createElement('div');
    div.className = 'media-card';
    const inLib = s.in_lib || false;
    const pct = s.pct ?? null;
    const monitored = s.monitored ?? false;

    const monitoredIcon = monitored ? `<span title="${t('badge_monitored')}" style="color:var(--sonarr)">🔖</span>` : `<span title="${t('badge_unmonitored')}" style="color:var(--muted)">🔕</span>`;
    const addBtn = isSearch && !inLib ? `<button class="btn-add" onclick="event.stopPropagation();promptAddMedia('serie', ${s.tvdbId}, '${esc(s.title).replace(/'/g,"\\'").replace(/"/g,'&quot;')}', this)">＋</button>` : '';
    const seasonsBadge = !isSearch ? `<span style="font-size:10px;color:var(--sonarr)">${s.seasons} s.</span>` : (inLib ? '<span class="pill sonarr" style="font-size:10px">✓</span>' : '');
    const sizeBadge = s.sizeOnDisk > 0 ? `<span style="font-size:10px;color:var(--muted)">${s.sizeOnDisk} GB</span>` : '';
    const networkBadge = s.network ? `<span style="font-size:10px;color:var(--muted)">${esc(s.network)}</span>` : '';
    const progressBar = (!isSearch && pct !== null) ? `<div class="progress-bar" style="margin-top:5px"><div class="progress-fill" style="width:${pct}%;background:var(--sonarr)"></div></div>` : '';
    const poster = s.poster ? `<img class="media-card-poster" src="${esc(s.poster)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : '';
    const placeholder = `<div class="media-card-poster-placeholder" style="${s.poster?'display:none':''}">📺</div>`;

    if (!isSearch) {
        div.setAttribute('ontouchstart', `startLongPress(${s.id})`);
        div.setAttribute('ontouchend', 'cancelLongPress()');
        div.setAttribute('ontouchcancel', 'cancelLongPress()');
        div.setAttribute('oncontextmenu', 'if(window.preventNextClick) return false;');

        div.addEventListener('click', (e) => {
            if (window.preventNextClick) {
                e.stopPropagation();
                e.preventDefault();
                window.preventNextClick = false;
                return;
            }
            if (bulkSelectMode) { e.stopPropagation(); toggleBulkSelect(s.id); return; }
            openSerieDetail(s.id);
        });
    }
    else if (inLib) div.addEventListener('click', () => openSerieDetailByTitle(s.title));
    else if (s.tmdbId) div.addEventListener('click', () => openTmdbSerieDetail(s.tmdbId));

    if (!monitored && !isSearch) div.classList.add('unmonitored');
    const bulkCheckbox = (!isSearch) ? `
    <div class="bulk-select-checkbox ${bulkSelectMode ? 'visible' : ''}" onclick="event.stopPropagation(); toggleBulkSelect(${s.id})">
        <input type="checkbox" ${bulkSelectedIds.has(s.id) ? 'checked' : ''} readonly>
    </div>` : '';
    if (bulkSelectedIds.has(s.id)) div.classList.add('bulk-selected');
    div.innerHTML = `
    ${bulkCheckbox}
    ${poster}${placeholder}
    <div class="monitored-badge">${!isSearch ? `<div class="monitored-badge" style="cursor:pointer;" onclick="event.stopPropagation(); toggleMonitor(${s.id}, 'serie', ${!monitored}, this)">${monitored ? ICON_MONITORED : ICON_UNMONITORED}</div>` : ''}</div>
    <div class="media-card-strip">
    <div class="media-card-strip-title">${esc(s.title)}</div>
    <div class="media-card-strip-meta">
    ${seasonsBadge}
    ${pct !== null ? `<span style="color:var(--sonarr);font-size:10px">${pct}%</span>` : ''}
    </div>
    </div>
    <div class="media-card-overlay">
    <div class="media-card-title">${esc(s.title)}</div>
    <div class="media-card-meta">${s.year || ''}${s.rating ? ' &nbsp;⭐ ' + s.rating : ''}${s.network ? ' · ' + esc(s.network) : ''}</div>
    <div class="media-card-footer">${seasonsBadge} ${sizeBadge} ${addBtn}</div>
    ${progressBar}
    </div>
    <div class="media-card-body">
    <div class="media-card-title" style="display:flex;align-items:center;gap:6px;">
    <span style="color:var(--sonarr);flex-shrink:0;" title="${monitored ? t('badge_monitored') : t('badge_unmonitored')}">${monitored ? ICON_MONITORED : ICON_UNMONITORED}</span>
    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.title)}</span>
    </div>
    <div class="media-card-meta">${s.year || ''}${s.rating ? ' · ⭐ ' + s.rating : ''}${s.network ? ' · ' + esc(s.network) : ''}</div>
    <div class="media-card-footer" style="margin-top:4px">${seasonsBadge} ${sizeBadge} ${addBtn}</div>
    ${progressBar}
    </div>`;
    return div;
}

// ── SYSTÈME D'AJOUT AVEC OPTIONS (Films & Séries) ─────────────────────────────
let currentAddMedia = null;

async function promptAddMedia(type, id, title, btn, idType = 'default') {
    currentAddMedia = { type, id, btn, idType };
    const modal = document.getElementById('modal-add-media');

    if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
    modal.style.position = 'fixed';
    modal.style.zIndex = '99999999';

    // 🌟 PATCH FLEXBOX POUR FIGER LE TITRE EN HAUT
    const modalInner = modal.querySelector('.modal-box') || modal.querySelector('.modal');
    if (modalInner && !modalInner.dataset.flexPatched) {
        modalInner.dataset.flexPatched = 'true';
        modalInner.style.display = 'flex';
        modalInner.style.flexDirection = 'column';
        modalInner.style.maxHeight = '90vh';
        modalInner.style.padding = '0';
        modalInner.style.overflow = 'hidden';

        const titleEl = document.getElementById('add-media-title');
        if (titleEl) {
            titleEl.style.margin = '0';
            titleEl.style.padding = '20px';
            titleEl.style.borderBottom = '1px solid var(--border)';
            titleEl.style.flexShrink = '0';
            titleEl.style.background = 'var(--bg2)';
        }

        const formEl = document.getElementById('add-media-form');
        if (formEl) {
            formEl.style.padding = '20px';
            formEl.style.overflowY = 'auto';
            formEl.style.flex = '1';
        }
    }

    document.getElementById('add-media-title').textContent = t('add_media_title') + ' : ' + title;
    document.getElementById('add-media-loader').style.display = 'block';
    document.getElementById('add-media-form').style.display = 'none';

    modal.classList.add('open');

    const appDriver = type === 'movie' ? 'radarr' : 'sonarr';
    const r = await api(`get_options&app=${appDriver}`, {}, 'GET');

    if (r.error || !r.profiles) {
        document.getElementById('add-media-loader').innerHTML = `<span style="color:var(--accent3)">${t('add_media_loading')}</span>`;
        return;
    }

    const profileSel = document.getElementById('add-media-profile');
    const folderSel = document.getElementById('add-media-folder');

    profileSel.innerHTML = r.profiles.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    folderSel.innerHTML = r.folders.map(f => `<option value="${f.path}">${esc(f.path)}</option>`).join('');

    let searchDiv = document.getElementById('add-media-search-container');
    if (!searchDiv) {
        searchDiv = document.createElement('div');
        searchDiv.id = 'add-media-search-container';
        searchDiv.style.marginTop = '15px';
        searchDiv.innerHTML = `
        <label style="display:flex; align-items:center; gap:10px; cursor:pointer; background:var(--bg3); padding:12px; border-radius:8px; border:1px solid var(--border);">
        <input type="checkbox" id="add-media-search" checked style="width:18px; height:18px; accent-color:var(--accent); cursor:pointer;">
        <span style="font-size:13px; color:var(--text); font-weight:600;">${t('search_now')}</span>
        </label>
        `;
        folderSel.parentNode.insertAdjacentElement('afterend', searchDiv);
    } else {
        document.getElementById('add-media-search').checked = true;
    }

    document.getElementById('add-media-loader').style.display = 'none';
    document.getElementById('add-media-form').style.display = 'block';

    document.getElementById('btn-confirm-add').onclick = confirmAddMedia;
}

async function confirmAddMedia() {
    if (!currentAddMedia) return;
    const { type, id, btn, idType } = currentAddMedia;

    const profileId = document.getElementById('add-media-profile').value;
    const rootPath = document.getElementById('add-media-folder').value;
    const searchNow = document.getElementById('add-media-search') ? document.getElementById('add-media-search').checked : true;

    document.getElementById('modal-add-media').classList.remove('open');

    if (btn) {
        if (btn.tagName && btn.tagName.toLowerCase() === 'button') {
            btn.dataset.origText = btn.textContent;
            btn.disabled = true;
            btn.textContent = '⏳';
        } else if (btn.id && btn.id.startsWith('col-card-')) {
            btn.style.opacity = '0.5';
            btn.style.pointerEvents = 'none';
        }
    }

    let payload = { qualityProfileId: profileId, rootFolderPath: rootPath, search: searchNow };

    if (type === 'movie') payload.tmdbId = id;
    else {
        if (idType === 'tmdb') payload.tmdbId = id;
        else payload.tvdbId = id;
    }

    const action = type === 'movie' ? 'add_movie' : 'add_serie';
    const r = await api(action, payload);

    if (r.ok) {
        const mediaTypeTranslated = type === 'movie' ? t('type_movie') : t('type_serie');
        notify(t('media_added_ok').replace('{type}', mediaTypeTranslated), 'ok');

        // 🌟 FERMETURE AUTO DE LA MODALE DE RECHERCHE AU SUCCÈS
        const searchModal = document.getElementById('modal-search-media');
        if (searchModal && searchModal.style.display !== 'none') {
            searchModal.style.display = 'none';
        }

        if (btn) {
            const openClickAction = type === 'movie' ? `openMovieDetail(${r.id})` : `openSerieDetail(${r.id})`;

            if (btn.tagName && btn.tagName.toLowerCase() === 'button') {
                btn.disabled = false;
                btn.textContent = '✓ ' + t('detail_back');
                btn.style.background = 'var(--accent2)';
                btn.style.color = '#000';
                btn.style.borderColor = 'var(--accent2)';

                if (btn.classList.contains('actor-card-btn')) {
                    btn.setAttribute('onclick', `closeActorModal(); ${openClickAction}`);
                } else {
                    btn.setAttribute('onclick', `event.stopPropagation(); ${openClickAction}`);
                    const card = btn.closest('.media-card');
                    if (card) {
                        card.setAttribute('onclick', openClickAction);
                        card.classList.remove('unmonitored');
                    }
                }
            }
            else if (btn.id && btn.id.startsWith('col-card-')) {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
                btn.setAttribute('onclick', openClickAction);
                const badge = btn.querySelector('div[style*="Non ajouté"]');
                if (badge) badge.style.display = 'none';
                const icon = btn.querySelector('span[style*="color:#ffa03c"]');
                if (icon) {
                    icon.textContent = '✓';
                    icon.style.color = 'var(--accent2)';
                }
            }
        }

        setTimeout(() => {
            const hash = window.location.hash;
            const moviesMode = document.getElementById('movies-mode') ? document.getElementById('movies-mode').value : '';
            const seriesMode = document.getElementById('series-mode') ? document.getElementById('series-mode').value : '';

            if (hash === '#hub_films' && type === 'movie' && moviesMode !== 'search') {
                if (typeof loadMovies === 'function') loadMovies();
            } else if (hash === '#hub_series' && type === 'serie' && seriesMode !== 'search') {
                if (typeof loadSeries === 'function') loadSeries();
            }
        }, 600);

        if (type === 'movie' && r.id) {
            const currentTmdb = new URLSearchParams(window.location.search).get('tmdb');
            if (currentTmdb == id) setTimeout(() => openMovieDetail(r.id), 800);
        }
        if (type === 'serie' && r.id) {
            const currentTmdbSerie = new URLSearchParams(window.location.search).get('tmdb_serie');
            if (currentTmdbSerie == id) setTimeout(() => openSerieDetail(r.id), 800);
        }

    } else {
        if (btn) {
            if (btn.tagName && btn.tagName.toLowerCase() === 'button') {
                btn.disabled = false;
                btn.textContent = btn.dataset.origText || '＋ ' + t('films_add');
            } else {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
            }
        }
        notify(r.error || t('notif_error'), 'err');
    }
}

// ── STATUS ────────────────────────────────────────────────────────────────────
async function loadStatus() {
    const r = await api('get_apps', {}, 'GET');
    appsCache = r.apps || [];
    const enabled = appsCache.filter(a => a.enabled);
    const grid = document.getElementById('status-grid');
    if (!enabled.length) {
        grid.innerHTML = `<div class="empty-state"><div class="icon">📡</div><h3>${t('settings_apps')}</h3><p>${t('settings_add_app')}</p></div>`;
        return;
    }
    grid.innerHTML = '';
    enabled.forEach(app => {
        const card = document.createElement('div');
        card.className = 'app-card'; card.id = 'scard-' + app.id;
        card.innerHTML = `<div class="app-card-header"><div class="app-icon" style="display:flex; align-items:center; justify-content:center;">${getAppIconHtml(app)}</div><div class="app-card-title">${esc(app.name)}</div><div class="status-dot" id="sdot-${app.id}"></div></div><div class="app-card-body" id="sbody-${app.id}"><div class="shimmer" style="height:12px;width:60%;margin-bottom:6px;"></div><div class="shimmer" style="height:12px;width:80%;"></div></div>`;
        grid.appendChild(card);
        loadStatusCard(app);
    });
}

async function loadStatusCard(app) {
    const r = await api('app_status&id=' + app.id, {}, 'GET');
    const dot = document.getElementById('sdot-' + app.id);
    const body = document.getElementById('sbody-' + app.id);
    if (!body) return;
    if (!r.ok || r.error) {
        dot.className = 'status-dot err';
        body.innerHTML = `<p style="color:var(--accent3);font-size:12px;">⚠ ${esc(r.error||t('notif_error'))}</p>`;
        return;
    }
    dot.className = 'status-dot ok';
    let html = '<div class="stat-row">';
    (r.stats||[]).forEach(s => { html += `<div class="stat-pill"><span class="val">${esc(String(s.value))}</span><span class="lbl">${esc(s.label)}</span></div>`; });
    html += '</div><div class="item-list">';
    (r.items||[]).slice(0,4).forEach(it => {
        const pct = it.pct !== null ? it.pct : null;
        html += `<div class="item-row"><div class="item-row-top"><div class="item-name" title="${esc(it.title)}">${esc(it.title)}</div><div class="item-status">${esc(it.status)}${pct!==null?' · '+pct+'%':''}</div></div>${pct!==null?`<div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>`:''}</div>`;
    });
    html += '</div>';
    body.innerHTML = html;
}

// ── PAGINATION ────────────────────────────────────────────────────────────────
function renderPagination(prefix, current, total) {
    const el = document.getElementById(prefix + '-pagination');
    if (total <= 1) { el.innerHTML = ''; return; }
    let html = '';
    for (let i = 1; i <= Math.min(total, 10); i++) {
        html += `<button class="page-btn${i===current?' active':''}" onclick="${prefix}GoPage(${i})">${i}</button>`;
    }
    el.innerHTML = html;
}
function moviesGoPage(p) { moviesPage = p; loadMovies(); window.scrollTo(0,0); }
function seriesGoPage(p) { seriesPage = p; loadSeries(); window.scrollTo(0,0); }

// ── SETTINGS ──────────────────────────────────────────────────────────────────
async function loadAppsList() {
    const r = await api('get_apps', {}, 'GET');
    appsCache = r.apps || [];
    updateSidebar(appsCache);
    renderAppsListHtml();
}

function renderAppsListHtml() {
    const list = document.getElementById('apps-list');
    if (!appsCache.length) {
        list.innerHTML = `<p style="color:var(--muted);font-size:12px;">${t('settings_apps')} vide</p>`;
        return;
    }

    let html = `
    <style>
    .app-item-row { display: grid; grid-template-columns: 1fr auto; grid-template-areas: "identity switch" "actions actions"; gap: 12px; padding: 15px 0; border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s, border-radius 0.2s; }
    .app-item-row:last-child { border-bottom: none; }
    .app-item-identity { grid-area: identity; display: flex; align-items: center; gap: 14px; min-width: 0; }
    .app-item-icon { font-size: 20px; display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; background: var(--bg3); border-radius: 10px; flex-shrink: 0; }
    .app-item-text { flex: 1; min-width: 0; }
    .app-item-name { font-weight: bold; font-size: 15px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .app-item-driver { font-size: 11px; color: var(--muted); font-family: var(--mono); text-transform: lowercase; margin-top: 2px; }
    .app-item-switch { grid-area: switch; display: flex; align-items: center; justify-content: flex-end; }
    .app-item-actions { grid-area: actions; display: flex; justify-content: space-between; align-items: center; padding-left: 52px; }
    .app-item-arrows, .app-item-btns { display: flex; gap: 16px; align-items: center; }
    .app-item-btn { background: none; border: none; color: var(--muted); font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; cursor: pointer; transition: color 0.2s; padding: 0; }
    .app-item-btn:hover:not(:disabled) { color: var(--text); }
    .app-item-btn.danger { color: var(--accent3); font-size: 15px; }
    .app-item-btn.icon-only { font-size: 16px; }
    @media (min-width: 768px) {
        .app-item-row { grid-template-columns: 1fr auto auto; grid-template-areas: "identity actions switch"; padding: 10px 15px; align-items: center; border-bottom: 1px solid transparent; }
        .app-item-row:hover { background: rgba(255, 255, 255, 0.04); border-radius: 12px; }
        .app-item-actions { padding-left: 0; gap: 40px; }
    }
    </style>
    `;

    html += appsCache.map((app, index) => {
        const isFirst = index === 0;
        const isLast = index === appsCache.length - 1;

        return `
        <div class="app-item-row">
        <div class="app-item-identity">
        <div class="app-item-icon">${getAppIconHtml(app)}</div>
        <div class="app-item-text">
        <div class="app-item-name">${esc(app.name)}</div>
        <div class="app-item-driver">${esc(app.driver)}</div>
        </div>
        </div>
        <div class="app-item-switch">
        <button class="toggle ${app.enabled ? 'on' : ''}" onclick="toggleApp('${app.id}', this)" style="margin:0;"></button>
        </div>
        <div class="app-item-actions">
        <div class="app-item-arrows">
        <button class="app-item-btn icon-only" onclick="moveApp(-1, ${index})" ${isFirst ? 'disabled style="opacity:0.2;cursor:not-allowed;"' : ''} title="${t('btn_move_up')}">⬆️</button>
        <button class="app-item-btn icon-only" onclick="moveApp(1, ${index})" ${isLast ? 'disabled style="opacity:0.2;cursor:not-allowed;"' : ''} title="${t('btn_move_down')}">⬇️</button>
        </div>
        <div class="app-item-btns">
        <button class="app-item-btn" onclick="editApp('${app.id}')">⚙️ ${t('modal_edit_app')}</button>
        <button class="app-item-btn danger" onclick="deleteApp('${app.id}', '${esc(app.name)}')" title="${t('detail_delete')}">🗑️</button>
        </div>
        </div>
        </div>`;
    }).join('');

    list.innerHTML = html;
}

async function moveApp(direction, index) {
    if (direction === -1 && index > 0) {
        const temp = appsCache[index];
        appsCache[index] = appsCache[index - 1];
        appsCache[index - 1] = temp;
    } else if (direction === 1 && index < appsCache.length - 1) {
        const temp = appsCache[index];
        appsCache[index] = appsCache[index + 1];
        appsCache[index + 1] = temp;
    } else {
        return;
    }

    renderAppsListHtml();
    updateSidebar(appsCache);

    const newOrder = appsCache.map(a => a.id);
    const r = await api('reorder_apps', { order: JSON.stringify(newOrder) });

    if (!r.ok) notify(t('notif_error'), "err");
}

function updateSidebar(apps) {
    const nav = document.getElementById('sidebar-nav');
    if (!nav) return;

    let html = `
    <a href="index.php" class="sidebar-item ${typeof CURRENT_PAGE !== 'undefined' && CURRENT_PAGE === 'home' ? 'active' : ''}">
    <span class="icon">🏠</span> <span>${t('nav_dashboard')}</span>
    </a>`;

    apps.forEach(app => {
        if (!app.enabled) return;

        let href = '#';
        let pageId = '';

        if (app.driver === 'radarr') { href = 'films.php'; pageId = 'films'; }
        else if (app.driver === 'sonarr') { href = 'series.php'; pageId = 'series'; }
        else if (app.driver === 'prowlarr' || app.driver === 'indexer') { href = 'indexer.php'; pageId = 'indexer'; }
        else if (app.driver === 'transmission' || app.driver === 'download') { href = 'download.php'; pageId = 'downloads'; }
        else if (app.driver === 'docker') { href = 'docker.php'; pageId = 'docker'; }
        else if (app.driver === 'supervision') { href = 'supervision.php'; pageId = 'supervision'; }
        else if (app.driver === 'iframe') { href = 'iframe.php?id=' + app.id; pageId = 'iframe'; }

        if (href !== '#') {
            let isActive = false;

            // On vérifie si on est sur la bonne page
            if (typeof CURRENT_PAGE !== 'undefined' && CURRENT_PAGE === pageId) {
                if (app.driver === 'iframe') {
                    // Pour les iframes, on vérifie que l'ID dans l'URL correspond à l'application
                    const urlParams = new URLSearchParams(window.location.search);
                    if (urlParams.get('id') == app.id) isActive = true;
                } else {
                    isActive = true;
                }
            }

            const activeClass = isActive ? 'active' : '';
            html += `
            <a href="${href}" class="sidebar-item ${activeClass}">
            <span class="icon" style="display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px;">${getAppIconHtml(app)}</span>
            <span>${esc(app.name)}</span> </a>`;
        }
    });
    nav.innerHTML = html;
}

async function toggleApp(id, btn) {
    const r = await api('toggle_app', { id });
    if (r.ok) {
        btn.classList.toggle('on', r.enabled);
        const appIndex = appsCache.findIndex(a => a.id === id);
        if (appIndex !== -1) {
            appsCache[appIndex].enabled = r.enabled;
            if (typeof updateSidebar === 'function') updateSidebar(appsCache);
        }
    }
}

async function deleteApp(id, name) {
    if (!confirm(t('confirm_delete_app').replace('{name}', name))) return;
    const r = await api('delete_app', { id });
    if (r.ok) { notify(t('deleted_ok'), 'ok'); loadAppsList(); }
    else notify(r.error, 'err');
}

async function changePassword() {
    const current = document.getElementById('pw-current').value;
    const nw = document.getElementById('pw-new').value;
    const confirm = document.getElementById('pw-confirm').value;
    if (nw !== confirm) { notify(t('auth_pw_mismatch'), 'err'); return; }
    const r = await api('change_password', { current, new: nw });
    if (r.ok) { notify(t('pw_changed'), 'ok'); ['pw-current','pw-new','pw-confirm'].forEach(id => document.getElementById(id).value = ''); }
    else notify(r.error || t('notif_error'), 'err');
}

// ── MODAL ─────────────────────────────────────────────────────────────────────
async function loadDriverOptions() {
    const r = await api('list_drivers', {}, 'GET');
    const sel = document.getElementById('modal-driver');
    sel.innerHTML = `<option value="">— ${t('modal_app_type_choose')} —</option>`;
    (r.drivers||[]).forEach(d => { sel.innerHTML += `<option value="${d.id}">${DRIVER_ICONS[d.id]||'📦'} ${d.name}</option>`; });
}

function openAddModal() {
    editingId = null;
    document.getElementById('modal-title').textContent = t('modal_add_app');
    document.getElementById('modal-name').value = '';
    document.getElementById('modal-driver').value = '';
    document.getElementById('modal-fields').innerHTML = '';

    const modal = document.getElementById('modal-app');
    if (modal) {
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        modal.classList.add('open');
    }
}

async function editApp(id) {
    const app = appsCache.find(a => a.id === id);
    if (!app) return;
    editingId = id;
    document.getElementById('modal-title').textContent = t('modal_edit_app');
    document.getElementById('modal-name').value = app.name;
    document.getElementById('modal-driver').value = app.driver;
    await loadDriverFields();

    const modal = document.getElementById('modal-app');
    if (modal) {
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        modal.classList.add('open');
    }
}

async function loadDriverFields() {
    const driver = document.getElementById('modal-driver').value;
    const container = document.getElementById('modal-fields');
    if (!driver) { container.innerHTML = ''; return; }

    const app = appsCache.find(a => a.id === editingId);
    const r = await api('driver_fields&driver=' + driver, {}, 'GET');

    let html = (r.fields||[]).map(f => {
        const val = app ? (app[f.key] || '') : '';

        // 🌟 AJOUT : Support des listes déroulantes (select)
        if (f.type === 'select') {
            const optionsHtml = (f.options || []).map(opt => {
                const isSelected = (val === opt.value) ? 'selected' : '';
                return `<option value="${opt.value}" ${isSelected}>${opt.label}</option>`;
            }).join('');

            return `
            <div class="form-row">
            <label>${esc(f.label)}</label>
            <select name="${f.key}" style="width:100%; background:var(--bg3); border:1px solid var(--border); border-radius:var(--radius); color:var(--text); padding:9px 12px; font-family:var(--sans); font-size:14px; appearance:auto; outline:none; transition:border 0.15s;">
            ${optionsHtml}
            </select>
            </div>`;
        } else {
            // Comportement classique pour les inputs textes et mots de passe
            return `<div class="form-row"><label>${esc(f.label)}</label><input type="${f.type}" name="${f.key}" value="${esc(val)}" placeholder="${esc(f.placeholder||'')}"></div>`;
        }
    }).join('');

    const iconRes = await api('get_local_icons', {}, 'GET');
    const localIcons = iconRes.icons || [];
    const currentIcon = app ? (app.icon_url || '') : '';

    let gridHtml = localIcons.map(iconFile => {
        const iconPath = `assets/img/${iconFile}`;
        const isSelected = (currentIcon === iconPath);
        const border = isSelected ? 'var(--accent)' : 'transparent';
        const bg = isSelected ? 'rgba(226,255,93,0.1)' : 'transparent';

        return `
        <div onclick="selectLocalIcon('${iconPath}', this)" class="icon-choice" data-path="${iconPath}" style="width:46px; height:46px; padding:6px; border:2px solid ${border}; background:${bg}; border-radius:10px; cursor:pointer; transition:all 0.2s;">
        <img src="${iconPath}" style="width:100%; height:100%; object-fit:contain; display:block;">
        </div>`;
    }).join('');

    html += `
    <div class="form-row" style="margin-top:15px; border-top:1px solid var(--border); padding-top:15px;">
    <label>${t('app_custom_icon')}</label>
    <div style="display:flex; gap:10px; margin-bottom:12px;">
    <input type="text" name="icon_url" id="modal-icon_url" value="${esc(currentIcon)}" placeholder="${t('app_icon_url_placeholder')}" style="flex:1;">
    <button type="button" class="btn-sm accent" onclick="fetchFavicon()" style="padding:0 15px; font-weight:bold; cursor:pointer; flex-shrink:0;">🔍 ${t('btn_search_icon')}</button>
    </div>
    <label style="font-size:10px; margin-bottom:6px;">${t('app_local_icons')}</label>
    <div style="display:flex; flex-wrap:wrap; gap:8px; max-height:160px; overflow-y:auto; padding:10px; background:var(--bg3); border-radius:var(--radius); border:1px solid var(--border);">
    <div onclick="selectLocalIcon('', this)" class="icon-choice" data-path="" style="width:46px; height:46px; padding:6px; border:2px solid ${currentIcon === '' ? 'var(--accent)' : 'transparent'}; background:${currentIcon === '' ? 'rgba(226,255,93,0.1)' : 'transparent'}; border-radius:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:22px; transition:all 0.2s;" title="${t('tooltip_default')}">📦</div>
    ${gridHtml}
    </div>
    </div>`;

    container.innerHTML = html;

    // 🌟 SÉCURITÉ : Force le navigateur à appliquer la vraie valeur enregistrée dans l'application
    if (app) {
        container.querySelectorAll('select').forEach(sel => {
            if (app[sel.name]) {
                sel.value = app[sel.name];
            }
        });
    }
}

function selectLocalIcon(path, element) {
    document.getElementById('modal-icon_url').value = path;
    document.querySelectorAll('.icon-choice').forEach(el => {
        el.style.borderColor = 'transparent'; el.style.background = 'transparent';
    });
    if (element) {
        element.style.borderColor = 'var(--accent)'; element.style.background = 'rgba(226,255,93,0.1)';
    }
}

async function fetchFavicon() {
    const urlInput = document.querySelector('#modal-fields input[name="url"]');
    const iconInput = document.getElementById('modal-icon_url');

    if (!urlInput || urlInput.value.trim() === '') { notify('Erreur URL', "err"); return; }
    let urlStr = urlInput.value.trim();
    if (urlStr.includes('.sock')) { notify('URL Socket invalide', "err"); return; }
    if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) urlStr = 'http://' + urlStr;

        try { new URL(urlStr); } catch (e) { notify('URL invalide', "err"); return; }

        notify(t('search_started'), "ok");

    try {
        const r = await api('proxy_fetch&url=' + encodeURIComponent(urlStr), {}, 'GET');
        if (r.html) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(r.html, 'text/html');
            const selectors = ['link[rel="apple-touch-icon"]', 'link[rel="shortcut icon"]', 'link[rel="icon"]'];
            const base = new URL(urlStr);
            let faviconUrl = null;

            for (const sel of selectors) {
                const el = doc.querySelector(sel);
                if (el) {
                    let href = el.getAttribute('href');
                    if (href && href.trim() !== '') {
                        if (href.startsWith('http')) faviconUrl = href;
                        else if (href.startsWith('/')) faviconUrl = base.origin + href;
                        else faviconUrl = base.origin + '/' + href;
                        break;
                    }
                }
            }

            if (!faviconUrl) {
                faviconUrl = base.origin + '/favicon.ico';
                notify(t('favicon_default_used'), "err");
            } else { notify(t('favicon_found'), "ok"); }

            if (iconInput) {
                iconInput.value = faviconUrl;
                if (typeof selectLocalIcon === 'function') selectLocalIcon(faviconUrl, null);
            }
        } else { notify(t('error_connection'), "err"); }
    } catch (e) { notify(t('notif_error') + " : " + e.message, "err"); }
}

function closeModal() { document.getElementById('modal-app').classList.remove('open'); }

async function saveApp() {
    const data = { name: document.getElementById('modal-name').value, driver: document.getElementById('modal-driver').value };
    if (editingId) data.id = editingId;
    document.querySelectorAll('#modal-fields input, #modal-fields select').forEach(el => { data[el.name] = el.value; });
    if (!data.driver) { notify(t('modal_app_type_choose'), 'err'); return; }
    const r = await api('save_app', data);
    if (r.ok) { notify(t('notif_saved'), 'ok'); closeModal(); loadAppsList(); }
    else notify(r.error || t('notif_error'), 'err');
}

document.getElementById('modal-app').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

// ── HELPERS ───────────────────────────────────────────────────────────────────
async function api(action, data = {}, method = 'POST') {
    try {
        const isGet = method.toUpperCase() === 'GET';
        let url = isGet ? `api.php?action=${action}&_t=${new Date().getTime()}` : `api.php?action=${action}`;
        const opts = { method, credentials: 'same-origin' };
        if (method === 'POST') {
            const fd = new FormData();
            fd.append('action', action);
            Object.entries(data).forEach(([k,v]) => fd.append(k, v));
            opts.body = fd;
            const r = await fetch('api.php', opts);
            return await r.json();
        } else {
            const r = await fetch(url, opts);
            return await r.json();
        }
    } catch(e) { return { error: e.message }; }
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function notify(msg, type = 'ok') {
    const el = document.getElementById('notif');
    el.textContent = msg; el.className = `show ${type}`;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.className = '', 3000);
}

// ── GESTION DES VUES PLEINE PAGE ──────────────────────────────────────────────
let savedScrollPosition = 0;

function animateContentSlideIn(el) {
    if (!el) return;
    el.style.transition = 'none';
    el.style.transform = 'translateX(30px)';
    el.style.opacity = '0';
    void el.offsetWidth;
    el.style.transition = 'transform .25s ease, opacity .2s';
    el.style.transform = 'translateX(0)';
    el.style.opacity = '1';
    setTimeout(() => { el.style.transform = ''; el.style.transition = ''; el.style.opacity = ''; }, 250);
}

function toggleListElements(show) {
    document.querySelectorAll('.tab-page').forEach(el => el.style.display = show ? 'block' : 'none');
    document.querySelectorAll('.lib-toolbar, .page-title').forEach(el => el.style.display = show ? '' : 'none');
    const allHomeTabs = document.querySelectorAll('.home-tab-content');
    if (show) {
        const activeHomeTab = document.querySelector('.home-tab-content.active');
        if (activeHomeTab) activeHomeTab.style.display = 'block';
        else allHomeTabs.forEach(el => { el.style.display = ''; });
    } else {
        allHomeTabs.forEach(el => { el.style.display = 'none'; });
    }
}

function makeFullscreenView(bgId, contentId) {
    const bg = document.getElementById(bgId);
    const content = document.getElementById(contentId);
    if (typeof toggleListElements === 'function') toggleListElements(false);
    bg.classList.add('open', 'is-fullscreen');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (content) animateContentSlideIn(content);
}

function closeMovieDetail(fromPopState = false) {
    if (fromPopState !== true) {
        if (sessionStorage.getItem('serviarr_hub_tab')) { window.location.href = 'index.php'; return; }
    }
    const bg = document.getElementById('modal-movie');
    const content = document.getElementById('movie-detail-content');
    if (bg && content) {
        content.style.transition = 'transform .2s ease, opacity .15s';
        content.style.transform = 'translateX(30px)';
        content.style.opacity = '0';
        setTimeout(() => {
            bg.classList.remove('open', 'is-fullscreen');
            if (typeof toggleListElements === 'function') toggleListElements(true);
            window.scrollTo(0, savedScrollPosition);
            content.style.transform = ''; content.style.transition = ''; content.style.opacity = '';
        }, 200);
    }
    if (fromPopState !== true) history.pushState(null, '', window.location.pathname + window.location.hash);
}

function closeSerieDetail(fromPopState = false) {
    if (fromPopState !== true) {
        if (sessionStorage.getItem('serviarr_hub_tab')) { window.location.href = 'index.php'; return; }
    }
    const bg = document.getElementById('modal-serie');
    const content = document.getElementById('serie-detail-content');
    if (bg && content) {
        content.style.transition = 'transform .2s ease, opacity .15s';
        content.style.transform = 'translateX(30px)';
        content.style.opacity = '0';
        setTimeout(() => {
            bg.classList.remove('open', 'is-fullscreen');
            if (typeof toggleListElements === 'function') toggleListElements(true);
            window.scrollTo(0, savedScrollPosition);
            content.style.transform = ''; content.style.transition = ''; content.style.opacity = '';
        }, 200);
    }
    if (fromPopState !== true) history.pushState(null, '', window.location.pathname + window.location.hash);
}

// ── FICHE FILM PLEINE PAGE ────────────────────────────────────────────────────
async function openMovieDetail(id) {
    savedScrollPosition = window.scrollY;
    toggleListElements(false);
    makeFullscreenView('modal-movie', 'movie-detail-content');

    const currentParam = new URLSearchParams(window.location.search).get('movie');
    if (currentParam == id) history.replaceState({ modal: 'movie', id: id }, '', '?movie=' + id + window.location.hash);
    else history.pushState({ modal: 'movie', id: id }, '', '?movie=' + id + window.location.hash);

    const content = document.getElementById('movie-detail-content');
    content.innerHTML = `<div style="text-align:center;padding:60px;color:var(--muted);">${t('loading')}</div>`;

    const r = await api('movie_detail&id=' + id, {}, 'GET');
    if (r.error) { content.innerHTML = `<p style="color:var(--accent3); padding:20px;">${esc(r.error)}</p>`; return; }

    const genres = (r.genres || []).slice(0, 3).join(' • ');
    const runtime = r.runtime ? Math.floor(r.runtime/60) + 'h' + String(r.runtime%60).padStart(2,'0') : '';
    const posterUrl = r.poster || '';
    const fanartUrl = r.fanart || posterUrl;
    const safeTitle = esc(r.title).replace(/'/g, "\\'").replace(/"/g, '&quot;');

    const formatRelDate = (dStr) => {
        if (!dStr) return `<span style="color:var(--muted); font-style:italic;">--</span>`;
        const d = new Date(dStr);
        if (isNaN(d.getTime())) return `<span style="color:var(--muted); font-style:italic;">--</span>`;
        return d.toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const releaseDatesHtml = `
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 25px;">
    <div style="background:var(--bg3); border:1px solid var(--border); border-radius:10px; padding:10px 4px; text-align:center;" title="${t('cal_cinema')}">
    <div style="font-size: 16px; margin-bottom: 2px;">🎬</div>
    <div style="font-size: 9px; color: var(--muted); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">${t('cal_cinema')}</div>
    <div style="font-size: 11px; font-weight: 600; margin-top: 4px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${formatRelDate(r.inCinemas)}</div>
    </div>
    <div style="background:var(--bg3); border:1px solid var(--border); border-radius:10px; padding:10px 4px; text-align:center;" title="${t('cal_digital')}">
    <div style="font-size: 16px; margin-bottom: 2px;">🌐</div>
    <div style="font-size: 9px; color: var(--muted); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">${t('cal_digital')}</div>
    <div style="font-size: 11px; font-weight: 600; margin-top: 4px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${formatRelDate(r.digitalRelease)}</div>
    </div>
    <div style="background:var(--bg3); border:1px solid var(--border); border-radius:10px; padding:10px 4px; text-align:center;" title="${t('cal_physical')}">
    <div style="font-size: 16px; margin-bottom: 2px;">💿</div>
    <div style="font-size: 9px; color: var(--muted); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">${t('cal_physical')}</div>
    <div style="font-size: 11px; font-weight: 600; margin-top: 4px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${formatRelDate(r.physicalRelease)}</div>
    </div>
    </div>`;

    const fileHtml = r.file
    ? `<div style="background:var(--bg3); border:1px solid var(--border); padding:15px; border-radius:12px; margin-bottom:25px; display:flex; justify-content:space-between; align-items:center;">
    <div>
    <div style="font-family:var(--mono); font-size:11px; color:var(--muted); margin-bottom:4px; word-break:break-all;">${esc(r.file.path)}</div>
    <div style="color:var(--accent2); font-size:12px; font-weight:bold;">✓ ${esc(r.file.quality)} • ${esc(r.file.size)}</div>
    </div>
    <button class="btn-sm danger" onclick="deleteFile(${r.file.id}, 'movie', ${id})" style="flex-shrink:0;">🗑️</button>
    </div>`
    : '';

    let statusColor = r.hasFile ? 'var(--accent2)' : r.monitored ? 'var(--radarr)' : 'var(--muted)';
    let statusText  = r.hasFile ? t('torrent_downloaded') : r.monitored ? t('badge_monitored') : t('badge_unmonitored');

    const castHtml = (r.cast && r.cast.length > 0) ? `
    <h3 style="margin: 0 0 15px 0; font-size: 16px; color:var(--text);">${t('detail_cast')}</h3>
    <div style="display: flex; gap: 12px; overflow-x: auto; padding-bottom: 15px; margin-bottom: 20px; scrollbar-width: none; margin-left:-20px; padding-left:20px; margin-right:-20px; padding-right:20px;">
    ${r.cast.map(c => `
        <div style="flex: 0 0 90px; text-align: center; cursor: pointer; transition: transform 0.2s;" onclick="openActorCredits('${esc(c.name).replace(/'/g, "\\'")}')" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
        <div style="width: 90px; height: 135px; background: var(--bg3); border-radius: 10px; overflow: hidden; margin-bottom: 8px; border: 1px solid var(--border);">
        ${c.image ? `<img src="${c.image}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` : ''}
        <div style="display:${c.image ? 'none' : 'flex'};align-items:center;justify-content:center;height:100%;font-size:30px;color:var(--muted)">👤</div>
        </div>
        <div style="font-size: 11px; font-weight: bold; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${esc(c.name)}</div>
        <div style="font-size: 10px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.character ? esc(c.character) : t('status_unknown')}</div>
        </div>
        `).join('')}
        </div>` : '';

        content.innerHTML = `
        <div style="position:relative; width:100%; min-height:100vh; background:var(--bg2);">
        <button onclick="closeMovieDetail()" style="position:absolute; top:15px; left:15px; background:var(--bg3); color:var(--text); border:1px solid var(--border); padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600; font-size:13px; z-index:100; box-shadow:0 4px 15px rgba(0,0,0,0.6); display:inline-flex; align-items:center; gap:6px;">⬅ ${t('detail_back')}</button>

        <div style="width:100%; height:250px; background-image:url('${fanartUrl}'); background-size:cover; background-position:center 20%; position:relative;">
        <div style="position:absolute; inset:0; background:linear-gradient(to bottom, rgba(19, 22, 30, 0.2) 0%, var(--bg2) 100%);"></div>
        </div>

        <div style="display:flex; gap:16px; padding:0 20px; margin-top:-70px; position:relative; z-index:10; align-items:flex-end;">
        ${posterUrl ? `<img src="${posterUrl}" style="width:115px; height:170px; border-radius:12px; box-shadow:0 6px 20px rgba(0,0,0,0.6); object-fit:cover; flex-shrink:0; border:1px solid rgba(255,255,255,0.1);">` : `<div style="width:115px; height:170px; background:var(--bg3); border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:40px; box-shadow:0 6px 20px rgba(0,0,0,0.6); border:1px solid rgba(255,255,255,0.1); flex-shrink:0;">🎬</div>`}

        <div style="padding-bottom:5px; flex:1; min-width:0;">
        <div id="movie-status-badge" style="display:inline-block; font-size:10px; font-weight:bold; padding:3px 8px; border-radius:6px; background:var(--bg3); border:1px solid var(--border); color:${statusColor}; margin-bottom:6px;">${statusText}</div>
        <h2 style="font-size:22px; font-weight:800; line-height:1.2; margin:0 0 6px 0; color:var(--text); text-overflow:ellipsis; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${esc(r.title)}
		<!-- LE BOUTON STYLE "BTN-APP-LINK" EST ICI -->
        ${r.appUrl && r.titleSlug ? `<a href="${r.appUrl}/movie/${r.titleSlug}" target="_blank" class="btn-app-link" style="margin-left:auto; padding:6px 12px; font-size:11px; border-radius:6px; box-shadow:none;">
        <span class="icon" style="font-size:14px;">🌐</span>
        <span class="btn-app-link-text">${t('films_open_radarr')}</span>
        </a>` : ''}
		</h2>

        <div style="font-size:12px; color:var(--muted); display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        <span>${r.year}</span>
        ${runtime ? `<span>• ${runtime}</span>` : ''}
        ${r.rating ? `<span style="background:rgba(255,255,255,0.08); padding:1px 6px; border-radius:4px; color:var(--text);">⭐ ${r.rating}</span>` : ''}
        <span style="cursor:pointer; display:flex; align-items:center;" onclick="toggleMonitor(${id}, 'movie', ${!r.monitored}, this)" title="Surveiller">
        ${r.monitored ? ICON_MONITORED : ICON_UNMONITORED}
        </span>

        

        </div>
        </div>
        </div>

        <div style="display:flex; gap:10px; padding:20px; overflow-x:auto; scrollbar-width:none; border-bottom:1px solid var(--border); margin-bottom:20px;">
        <button style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:8px 16px; border-radius:20px; font-size:13px; font-weight:600; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center;" onclick="movieSearchAuto(${r.id}, this)">🔍 ${t('detail_auto_search')}</button>
        <button style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:8px 16px; border-radius:20px; font-size:13px; font-weight:600; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center;" onclick="openMovieReleases(${r.id}, '${safeTitle}')">👤 ${t('detail_search_releases')}</button>
        <button style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:8px 16px; border-radius:20px; font-size:13px; font-weight:600; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center;" onclick="refreshMedia(${r.id}, 'movie', this)">🔄 ${t('detail_refresh')}</button>
        <button style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:8px 16px; border-radius:20px; font-size:13px; font-weight:600; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center;" onclick="openEditMediaModal(${r.id}, 'movie')">⚙️ ${t('modal_edit_radarr')}</button>
        <button style="background:rgba(255,93,143,0.1); border:1px solid rgba(255,93,143,0.3); color:var(--accent3); padding:8px 16px; border-radius:20px; font-size:13px; font-weight:600; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center;" onclick="deleteMedia(${r.id}, 'movie', '${safeTitle}')">🗑️ ${t('detail_delete')}</button>
        </div>

        <div style="padding:0 20px 40px 20px;">
        <div style="font-size:12px; color:var(--muted); margin-bottom:20px; display:flex; justify-content:space-between;">
        <span>${genres}</span>
        <span>📅 ${t('sort_added')} : ${r.added || t('status_unknown')}</span>
        </div>

        ${fileHtml}
        ${releaseDatesHtml}

        <h3 style="margin:0 0 10px 0; font-size:16px; color:var(--text);">${t('detail_overview')}</h3>
        <p style="font-size:13.5px; line-height:1.6; color:#a0a5b5; margin:0 0 25px 0;">${esc(r.overview) || t('no_movie_found')}</p>

        ${r.collection ? `
            <div onclick="openMovieCollection('${esc(r.collection.title).replace(/'/g, "\\'")}', ${r.id}, ${r.collection.tmdbId || 0})"
            style="margin-bottom:25px; padding:15px; background:var(--bg3); border:1px solid var(--border); border-left:4px solid var(--radarr); border-radius:12px; display:flex; align-items:center; gap:15px; cursor:pointer;">
            <span style="font-size:24px;">🎞️</span>
            <div style="flex:1;">
            <div style="font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">${t('detail_collection')}</div>
            <div style="font-size:14px; font-weight:bold; color:var(--text);">${esc(r.collection.title)}</div>
            </div>
            <span style="color:var(--muted); font-size:20px;">›</span>
            </div>` : ''}

            ${castHtml}
            </div>
            </div>`;

            animateContentSlideIn(content);
}

// ── FICHE TMDB DÉCOUVERTE (Film non possédé) ──────────────────────────────────
async function openTmdbMovieDetail(tmdbId) {
    savedScrollPosition = window.scrollY;
    toggleListElements(false);
    makeFullscreenView('modal-movie', 'movie-detail-content');

    const currentParam = new URLSearchParams(window.location.search).get('tmdb');
    if (currentParam == tmdbId) history.replaceState({ modal: 'movie', tmdbId: tmdbId }, '', '?tmdb=' + tmdbId + window.location.hash);
    else history.pushState({ modal: 'movie', tmdbId: tmdbId }, '', '?tmdb=' + tmdbId + window.location.hash);

    const content = document.getElementById('movie-detail-content');
    content.innerHTML = `<div style="text-align:center;padding:60px;color:var(--muted);">${t('loading')}</div>`;

    const r = await api('tmdb_movie_detail&tmdbId=' + tmdbId, {}, 'GET');
    if (r.error) { content.innerHTML = `<p style="color:var(--accent3); padding:20px;">${esc(r.error)}</p>`; return; }

    const genres = (r.genres || []).slice(0, 3).join(' • ');
    const runtime = r.runtime ? Math.floor(r.runtime/60) + 'h' + String(r.runtime%60).padStart(2,'0') : '';
    const posterUrl = r.poster || '';
    const fanartUrl = r.fanart || posterUrl;
    const safeTitle = esc(r.title).replace(/'/g, "\\'").replace(/"/g, '&quot;');

    const formatRelDate = (dStr) => {
        if (!dStr) return `<span style="color:var(--muted); font-style:italic;">--</span>`;
        const d = new Date(dStr);
        if (isNaN(d.getTime())) return `<span style="color:var(--muted); font-style:italic;">--</span>`;
        return d.toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const releaseDatesHtml = `
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 25px;">
    <div style="background:var(--bg3); border:1px solid var(--border); border-radius:10px; padding:10px 4px; text-align:center;">
    <div style="font-size: 16px; margin-bottom: 2px;">🎬</div>
    <div style="font-size: 9px; color: var(--muted); font-weight: bold; text-transform: uppercase;">${t('cal_cinema')}</div>
    <div style="font-size: 11px; font-weight: 600; margin-top: 4px; color: var(--text);">${formatRelDate(r.inCinemas)}</div>
    </div>
    <div style="background:var(--bg3); border:1px solid var(--border); border-radius:10px; padding:10px 4px; text-align:center;">
    <div style="font-size: 16px; margin-bottom: 2px;">🌐</div>
    <div style="font-size: 9px; color: var(--muted); font-weight: bold; text-transform: uppercase;">${t('cal_digital')}</div>
    <div style="font-size: 11px; font-weight: 600; margin-top: 4px; color: var(--text);">${formatRelDate(r.digitalRelease)}</div>
    </div>
    <div style="background:var(--bg3); border:1px solid var(--border); border-radius:10px; padding:10px 4px; text-align:center;">
    <div style="font-size: 16px; margin-bottom: 2px;">💿</div>
    <div style="font-size: 9px; color: var(--muted); font-weight: bold; text-transform: uppercase;">${t('cal_physical')}</div>
    <div style="font-size: 11px; font-weight: 600; margin-top: 4px; color: var(--text);">${formatRelDate(r.physicalRelease)}</div>
    </div>
    </div>`;

    let imdbBtn = '';
    if (r.imdbId) {
        imdbBtn = `
        <a href="https://www.imdb.com/title/${r.imdbId}" target="_blank" style="background:var(--bg3); border:1px solid #f5c518; color:#f5c518; padding:10px 20px; border-radius:20px; font-size:14px; font-weight:800; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center; text-decoration:none; letter-spacing:0.5px;">IMDb ↗</a>`;
    }

    content.innerHTML = `
    <div style="position:relative; width:100%; min-height:100vh; background:var(--bg2);">
    <button onclick="closeMovieDetail()" style="position:absolute; top:15px; left:15px; background:var(--bg3); color:var(--text); border:1px solid var(--border); padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600; font-size:13px; z-index:100; box-shadow:0 4px 15px rgba(0,0,0,0.6); display:inline-flex; align-items:center; gap:6px;">⬅ ${t('detail_back')}</button>

    <div style="width:100%; height:250px; background-image:url('${fanartUrl}'); background-size:cover; background-position:center 20%; position:relative;">
    <div style="position:absolute; inset:0; background:linear-gradient(to bottom, rgba(19, 22, 30, 0.2) 0%, var(--bg2) 100%);"></div>
    </div>

    <div style="display:flex; gap:16px; padding:0 20px; margin-top:-70px; position:relative; z-index:10; align-items:flex-end;">
    ${posterUrl ? `<img src="${posterUrl}" style="width:115px; height:170px; border-radius:12px; box-shadow:0 6px 20px rgba(0,0,0,0.6); object-fit:cover; flex-shrink:0; border:1px solid rgba(255,255,255,0.1);">` : `<div style="width:115px; height:170px; background:var(--bg3); border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:40px; box-shadow:0 6px 20px rgba(0,0,0,0.6); border:1px solid rgba(255,255,255,0.1); flex-shrink:0;">🎬</div>`}

    <div style="padding-bottom:5px; flex:1; min-width:0;">
    <div style="display:inline-block; font-size:10px; font-weight:bold; padding:3px 8px; border-radius:6px; background:rgba(255, 160, 60, 0.1); border:1px solid rgba(255, 160, 60, 0.3); color:#ffa03c; margin-bottom:6px;">${t('badge_discover')}</div>
    <h2 style="font-size:22px; font-weight:800; line-height:1.2; margin:0 0 6px 0; color:var(--text); text-overflow:ellipsis; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${esc(r.title)}</h2>

    <div style="font-size:12px; color:var(--muted); display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
    <span>${r.year}</span>
    ${runtime ? `<span>• ${runtime}</span>` : ''}
    ${r.rating ? `<span style="background:rgba(255,255,255,0.08); padding:1px 6px; border-radius:4px; color:var(--text);">⭐ ${r.rating}</span>` : ''}
    </div>
    </div>
    </div>

    <div style="display:flex; gap:10px; padding:20px; overflow-x:auto; scrollbar-width:none; border-bottom:1px solid var(--border); margin-bottom:20px;">
    <button id="btn-add-tmdb" style="background:var(--accent); border:none; color:#000; padding:10px 20px; border-radius:20px; font-size:14px; font-weight:800; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center; box-shadow:0 4px 10px var(--accent-bg);;" onclick="promptAddMedia('movie', ${tmdbId}, '${safeTitle}', this, 'tmdb')">＋ ${t('add_radarr')}</button>
    <a href="https://www.themoviedb.org/movie/${tmdbId}" target="_blank" style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:10px 20px; border-radius:20px; font-size:14px; font-weight:600; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center; text-decoration:none;">TMDB ↗</a>
    ${imdbBtn} </div>

    <div style="padding:0 20px 40px 20px;">
    <div style="font-size:12px; color:var(--muted); margin-bottom:20px;">
    <span>${genres}</span>
    </div>
    ${releaseDatesHtml}
    <h3 style="margin:0 0 10px 0; font-size:16px; color:var(--text);">${t('detail_overview')}</h3>
    <p style="font-size:13.5px; line-height:1.6; color:#a0a5b5; margin:0 0 25px 0;">${esc(r.overview) || t('no_movie_found')}</p>
    </div>
    </div>`;
    animateContentSlideIn(content);
}

// ── FICHE TMDB DÉCOUVERTE (Série non possédée) ────────────────────────────────
async function openTmdbSerieDetail(tmdbId) {
    savedScrollPosition = window.scrollY;
    toggleListElements(false);
    makeFullscreenView('modal-serie', 'serie-detail-content');

    const currentParam = new URLSearchParams(window.location.search).get('tmdb_serie');
    if (currentParam == tmdbId) {
        history.replaceState({ modal: 'serie', tmdbId: tmdbId }, '', '?tmdb_serie=' + tmdbId + window.location.hash);
    } else {
        history.pushState({ modal: 'serie', tmdbId: tmdbId }, '', '?tmdb_serie=' + tmdbId + window.location.hash);
    }

    const content = document.getElementById('serie-detail-content');
    content.innerHTML = `<div style="text-align:center;padding:60px;color:var(--muted);">${t('loading')}</div>`;

    const r = await api('tmdb_serie_detail&tmdbId=' + tmdbId, {}, 'GET');
    if (r.error) { content.innerHTML = `<p style="color:var(--accent3); padding:20px;">${esc(r.error)}</p>`; return; }

    const genres = (r.genres || []).slice(0, 3).join(' • ');
    const posterUrl = r.poster || '';
    const fanartUrl = r.fanart || posterUrl;
    const safeTitle = esc(r.title).replace(/'/g, "\\'").replace(/"/g, '&quot;');

    let imdbBtn = '';
    if (r.imdbId) {
        imdbBtn = `
        <a href="https://www.imdb.com/title/${r.imdbId}" target="_blank" style="background:var(--bg3); border:1px solid #f5c518; color:#f5c518; padding:10px 20px; border-radius:20px; font-size:14px; font-weight:800; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center; text-decoration:none; letter-spacing:0.5px;">IMDb ↗</a>`;
    }

    content.innerHTML = `
    <div style="position:relative; width:100%; min-height:100vh; background:var(--bg2);">
    <button onclick="closeSerieDetail()" style="position:absolute; top:15px; left:15px; background:var(--bg3); color:var(--text); border:1px solid var(--border); padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600; font-size:13px; z-index:100; box-shadow:0 4px 15px rgba(0,0,0,0.6); display:inline-flex; align-items:center; gap:6px;">⬅ ${t('detail_back')}</button>

    <div style="width:100%; height:250px; background-image:url('${fanartUrl}'); background-size:cover; background-position:center 20%; position:relative;">
    <div style="position:absolute; inset:0; background:linear-gradient(to bottom, rgba(19, 22, 30, 0.2) 0%, var(--bg2) 100%);"></div>
    </div>

    <div style="display:flex; gap:16px; padding:0 20px; margin-top:-70px; position:relative; z-index:10; align-items:flex-end;">
    ${posterUrl ? `<img src="${posterUrl}" style="width:115px; height:170px; border-radius:12px; box-shadow:0 6px 20px rgba(0,0,0,0.6); object-fit:cover; flex-shrink:0; border:1px solid rgba(255,255,255,0.1);">` : `<div style="width:115px; height:170px; background:var(--bg3); border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:40px; box-shadow:0 6px 20px rgba(0,0,0,0.6); border:1px solid rgba(255,255,255,0.1); flex-shrink:0;">📺</div>`}

    <div style="padding-bottom:5px; flex:1; min-width:0;">
    <div style="display:inline-block; font-size:10px; font-weight:bold; padding:3px 8px; border-radius:6px; background:rgba(255, 160, 60, 0.1); border:1px solid rgba(255, 160, 60, 0.3); color:#ffa03c; margin-bottom:6px;">${t('badge_discover')}</div>
    <h2 style="font-size:22px; font-weight:800; line-height:1.2; margin:0 0 6px 0; color:var(--text); text-overflow:ellipsis; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${esc(r.title)}</h2>

    <div style="font-size:12px; color:var(--muted); display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
    <span>${r.year}</span>
    ${r.network ? `<span>• ${esc(r.network)}</span>` : ''}
    ${r.rating ? `<span style="background:rgba(255,255,255,0.08); padding:1px 6px; border-radius:4px; color:var(--text);">⭐ ${r.rating}</span>` : ''}
    </div>
    </div>
    </div>

    <div style="display:flex; gap:10px; padding:20px; overflow-x:auto; scrollbar-width:none; border-bottom:1px solid var(--border); margin-bottom:20px;">
    <button id="btn-add-tmdb" style="background:var(--sonarr); border:none; color:#000; padding:10px 20px; border-radius:20px; font-size:14px; font-weight:800; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center; box-shadow:0 4px 10px rgba(0,202,255,0.3);" onclick="promptAddMedia('serie', ${tmdbId}, '${safeTitle}', this, 'tmdb')">＋ ${t('add_sonarr')}</button>
    <a href="https://www.themoviedb.org/tv/${tmdbId}" target="_blank" style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:10px 20px; border-radius:20px; font-size:14px; font-weight:600; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center; text-decoration:none;">TMDB ↗</a>
    ${imdbBtn} </div>

    <div style="padding:0 20px 40px 20px;">
    <div style="font-size:12px; color:var(--muted); margin-bottom:20px; display:flex; justify-content:space-between;">
    <span>${genres}</span>
    </div>

    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg3); padding:12px 15px; border-radius:12px; border:1px solid var(--border); margin-bottom:20px;">
    <span style="font-size:13px; font-weight:bold; color:var(--text);">${r.seasons} Saisons</span>
    <span style="font-size:12px; color:var(--muted);">Infos TMDB</span>
    </div>

    <h3 style="margin:0 0 10px 0; font-size:16px; color:var(--text);">${t('detail_overview')}</h3>
    <p style="font-size:13.5px; line-height:1.6; color:#a0a5b5; margin:0 0 25px 0;">${esc(r.overview) || t('no_series_found')}</p>
    </div>
    </div>`;
    animateContentSlideIn(content);
}


// Variable globale pour mémoriser le contexte de la saga ouverte
let currentActiveCollection = null;

// ── VUE COLLECTION ────────────────────────────────────────────────────────────
async function openMovieCollection(collectionTitle, fromMovieId, collectionTmdbId = 0) {
    const content = document.getElementById('movie-detail-content');
    content.innerHTML = `<div style="text-align:center;padding:40px;color:var(--muted);">${t('loading')}</div>`;

    currentActiveCollection = { title: collectionTitle, fromId: fromMovieId, tmdbId: collectionTmdbId };

    const r = await api('movie_collection&title=' + encodeURIComponent(collectionTitle) + '&tmdbId=' + (collectionTmdbId || 0), {}, 'GET');
    if (r.error) { content.innerHTML = `<p style="color:var(--accent3)">${esc(r.error)}</p>`; return; }

    const movies = r.movies || [];
    const total      = movies.length;
    const inLib      = movies.filter(m => m.inLib).length;
    const downloaded = movies.filter(m => m.hasFile).length;
    // 🌟 ON SAUVEGARDE LES FILMS MANQUANTS POUR L'AJOUT MASSIF
    window.currentCollectionUnmonitored = movies.filter(m => !m.inLib);

    const cards = movies.map(mv => {
        const notInLib    = !mv.inLib;
        const statusColor = mv.hasFile ? 'var(--accent2)' : notInLib ? 'var(--muted)' : '#ffa03c';
        const statusIcon  = mv.hasFile ? '✓' : notInLib ? '＋' : '○';

        const safeTitle = esc(mv.title).replace(/'/g, "\\'");
        const clickAction = mv.inLib
        ? `openMovieDetail(${mv.id})`
        : `promptAddMedia('movie', ${mv.tmdbId}, '${safeTitle}', this)`;

        const dimStyle    = notInLib ? 'opacity:.55;' : '';
        const badge       = notInLib ? `<div style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.75);border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:10px;color:var(--muted);">${t('not_planned')}</div>` : '';
        return `
        <div onclick="${clickAction}" id="col-card-${mv.tmdbId}"
        style="position:relative;border-radius:10px;overflow:hidden;cursor:pointer;background:var(--bg3);transition:transform .2s,box-shadow .2s;"
        onmouseover="this.style.transform='translateY(-4px)';this.style.boxShadow='0 12px 30px rgba(0,0,0,.5)'"
        onmouseout="this.style.transform='';this.style.boxShadow=''">
        ${mv.poster
            ? `<img src="${esc(mv.poster)}" loading="lazy" style="width:100%;aspect-ratio:2/3;object-fit:cover;display:block;${dimStyle}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            : ''}
            <div style="width:100%;aspect-ratio:2/3;background:var(--bg2);display:${mv.poster ? 'none' : 'flex'};align-items:center;justify-content:center;font-size:36px;${dimStyle}">🎬</div>
            ${badge}
            <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,rgba(0,0,0,.92) 0%,transparent 100%);padding:28px 10px 10px;">
            <div style="font-size:12px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(mv.title)}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.65);display:flex;gap:6px;margin-top:2px;">
            <span>${mv.year}</span>
            ${mv.rating ? `<span>⭐ ${mv.rating}</span>` : ''}
            <span style="color:${statusColor};font-weight:600;">${statusIcon}</span>
            </div>
            </div>
            </div>`;
    }).join('');

    content.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:20px;padding:10px 0;">

    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
    <button onclick="openMovieDetail(${fromMovieId})"
    style="background:var(--bg3);color:var(--text);border:1px solid var(--border);padding:8px 18px;border-radius:8px;cursor:pointer;font-weight:600;font-size:14px;display:inline-flex;align-items:center;gap:8px;transition:all .15s;"
    onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
    onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text)'">
    ⬅ ${t('detail_back')}
    </button>
    </div>

    <div style="width:100%;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
    <span style="font-size:24px;">🎞️</span>
    <div style="flex:1; min-width:0;">

    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
    <div style="font-size:22px;font-weight:800;">${esc(collectionTitle)}</div>
    ${window.currentCollectionUnmonitored.length > 0
        ? `<button class="btn-pill" onclick="promptAddCollection('${esc(collectionTitle).replace(/'/g, "\\'")}')" style="font-weight:bold; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:13px;">＋ Ajouter la collection (${window.currentCollectionUnmonitored.length})</button>`
        : `<span style="color:var(--accent2); font-weight:bold; font-size:12px; padding:4px 8px; background:rgba(93,255,214,0.1); border-radius:6px; border:1px solid rgba(93,255,214,0.3);">✓ Collection complète</span>`
    }
    </div>

    <div style="font-size:13px;color:var(--muted);margin-top:4px;">
    ${total} ${t('word_movies')}
    · <span style="color:var(--accent2)">${downloaded} ${t('col_downloaded')}</span>
    · <span style="color:#ffa03c">${inLib - downloaded} ${t('col_monitored')}</span>
    </div>
    </div>
    </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;">
    ${cards}
    </div>

    </div>`;
    animateContentSlideIn(content);
}


async function addMovieFromCollection(tmdbId, btn, collectionTitle, fromMovieId, collectionTmdbId) {
    if (!tmdbId) { notify('tmdbId manquant', 'err'); return; }
    const card = document.getElementById('col-card-' + tmdbId);
    if (card) {
        card.style.opacity = '.5';
        card.style.pointerEvents = 'none';
    }
    const r = await api('add_movie', { tmdbId });
    if (r.ok) {
        notify('✓ ' + (r.title || 'Film') + ' ' + t('torrent_added'), 'ok');
        setTimeout(() => openMovieCollection(collectionTitle, fromMovieId, collectionTmdbId), 1200);
    } else {
        notify(r.error || t('notif_error'), 'err');
        if (card) { card.style.opacity = ''; card.style.pointerEvents = ''; }
    }
}

// ── AJOUT MASSIF D'UNE COLLECTION ─────────────────────────────────────────────
async function promptAddCollection(title) {
    currentAddMedia = { type: 'collection', title: title };
    const modal = document.getElementById('modal-add-media');

    if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
    modal.style.position = 'fixed';
    modal.style.zIndex = '99999999';

    document.getElementById('add-media-title').textContent = 'Collection : ' + title;
    document.getElementById('add-media-loader').style.display = 'block';
    document.getElementById('add-media-form').style.display = 'none';

    modal.classList.add('open');

    const r = await api('get_options&app=radarr', {}, 'GET');

    if (r.error || !r.profiles) {
        document.getElementById('add-media-loader').innerHTML = `<span style="color:var(--accent3)">${t('error_connection')}</span>`;
        return;
    }

    const profileSel = document.getElementById('add-media-profile');
    const folderSel = document.getElementById('add-media-folder');

    profileSel.innerHTML = r.profiles.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    folderSel.innerHTML = r.folders.map(f => `<option value="${f.path}">${esc(f.path)}</option>`).join('');

    let searchDiv = document.getElementById('add-media-search-container');
    if (!searchDiv) {
        searchDiv = document.createElement('div');
        searchDiv.id = 'add-media-search-container';
        searchDiv.style.marginTop = '15px';
        searchDiv.innerHTML = `
        <label style="display:flex; align-items:center; gap:10px; cursor:pointer; background:var(--bg3); padding:12px; border-radius:8px; border:1px solid var(--border);">
        <input type="checkbox" id="add-media-search" checked style="width:18px; height:18px; accent-color:var(--accent); cursor:pointer;">
        <span style="font-size:13px; color:var(--text); font-weight:600;">${t('search_now')}</span>
        </label>
        `;
        folderSel.parentNode.insertAdjacentElement('afterend', searchDiv);
    } else {
        document.getElementById('add-media-search').checked = true;
    }

    document.getElementById('add-media-loader').style.display = 'none';
    document.getElementById('add-media-form').style.display = 'block';

    // 🌟 On intercepte le clic du bouton Valider pour notre boucle personnalisée
    document.getElementById('btn-confirm-add').onclick = confirmAddCollection;
}

async function confirmAddCollection() {
    if (!currentAddMedia || currentAddMedia.type !== 'collection') return;

    const profileId = document.getElementById('add-media-profile').value;
    const rootPath = document.getElementById('add-media-folder').value;
    const searchNow = document.getElementById('add-media-search') ? document.getElementById('add-media-search').checked : true;

    const modal = document.getElementById('modal-add-media');

    // On cache le formulaire et on affiche une barre de progression
    document.getElementById('add-media-form').style.display = 'none';
    const loader = document.getElementById('add-media-loader');
    loader.style.display = 'block';

    const total = window.currentCollectionUnmonitored.length;
    let successCount = 0;

    for (let i = 0; i < total; i++) {
        const mv = window.currentCollectionUnmonitored[i];

        loader.innerHTML = `
        <div style="text-align:center;">
        <div style="font-size:24px; margin-bottom:10px;">⏳</div>
        <div style="color:var(--text); font-weight:bold; margin-bottom:5px;">Ajout en cours (${i+1}/${total})...</div>
        <div style="color:var(--accent); font-size:13px; font-family:var(--mono);">${esc(mv.title)}</div>
        <div class="progress-bar" style="margin-top:15px; height:6px; background:var(--bg); border-radius:3px; overflow:hidden;">
        <div class="progress-fill" style="height:100%; width:${((i)/total)*100}%; background:var(--accent); transition:width 0.3s;"></div>
        </div>
        </div>`;

        const payload = {
            tmdbId: mv.tmdbId,
            qualityProfileId: profileId,
            rootFolderPath: rootPath,
            search: searchNow
        };

        const r = await api('add_movie', payload);
        if(r.ok) successCount++;
    }

    modal.classList.remove('open');
    notify(`Collection ajoutée : ${successCount}/${total} films`, 'ok');

    // On rafraîchit la page de la collection pour voir les nouveaux statuts (Tout passera en "Coché")
    if (currentActiveCollection) {
        setTimeout(() => openMovieCollection(currentActiveCollection.title, currentActiveCollection.fromId, currentActiveCollection.tmdbId), 1000);
    }
}

async function movieSearchAuto(id, btn) {
    btn.disabled = true; btn.textContent = '⏳ ' + t('loading');
    const r = await api('movie_search_auto', { id });
    if (r.ok) { btn.textContent = '✓ OK'; notify(t('search_started'), 'ok'); }
    else { btn.disabled = false; btn.textContent = '🔍 ' + t('detail_auto_search'); notify(r.error || t('notif_error'), 'err'); }
}

async function openMovieReleases(id, title) {
    showReleasesModal(t('detail_search_releases') + ' — ' + title);
    const r = await api('movie_releases&id=' + id, {}, 'GET');
    if (r.error) {
        document.getElementById('releases-content').innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>${t('notif_error')}</h3><p>${esc(r.error)}</p></div>`;
        return;
    }
    renderReleasesTable(r.releases || [], 'movie', id);
}

// ── FICHE SÉRIE PLEINE PAGE ───────────────────────────────────────────────────
async function openSerieDetail(id) {
    savedScrollPosition = window.scrollY;
    toggleListElements(false);
    makeFullscreenView('modal-serie', 'serie-detail-content');

    const currentParam = new URLSearchParams(window.location.search).get('serie');
    if (currentParam == id) {
        history.replaceState({ modal: 'serie', id: id }, '', '?serie=' + id + window.location.hash);
    } else {
        history.pushState({ modal: 'serie', id: id }, '', '?serie=' + id + window.location.hash);
    }

    window.openMobileSeasonMenu = function(num) {
        const overlay = document.getElementById('season-menu-' + num + '-overlay');
        const sheet = document.getElementById('season-menu-' + num);
        if (overlay && sheet) {
            overlay.style.display = 'block';
            sheet.style.display = 'flex';
            setTimeout(() => { overlay.classList.add('open'); sheet.classList.add('open'); }, 10);
            document.body.style.overflow = 'hidden';
        }
    };

    window.closeMobileSeasonMenu = function(num) {
        const overlay = document.getElementById('season-menu-' + num + '-overlay');
        const sheet = document.getElementById('season-menu-' + num);
        if (overlay && sheet) {
            sheet.classList.remove('open'); overlay.classList.remove('open');
            setTimeout(() => { overlay.style.display = 'none'; sheet.style.display = 'none'; document.body.style.overflow = ''; }, 300);
        }
    };

    const content = document.getElementById('serie-detail-content');
    content.innerHTML = `<div style="text-align:center;padding:60px;color:var(--muted);">${t('loading')}</div>`;

    const r = await api('serie_detail&id=' + id, {}, 'GET');
    if (r.error) { content.innerHTML = `<p style="color:var(--accent3); padding:20px;">${esc(r.error)}</p>`; return; }

    const posterUrl = r.poster || '';
    const fanartUrl = r.fanart || posterUrl;
    const safeTitle = esc(r.title).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const genres = (r.genres || []).slice(0, 3).join(' • ');
    const statusColor = r.pct >= 100 ? 'var(--accent2)' : r.pct > 0 ? '#ffa03c' : 'var(--muted)';
    const statusText = r.pct >= 100 ? t('series_filter_complete') : r.pct > 0 ? t('series_filter_incomplete') : t('films_filter_missing');

    const todayStr = new Date().toISOString().slice(0, 10);
    let nextEpisode = null;
    let totalEpisodes = 0, haveEpisodes = 0, totalSerieSize = 0;
    let seasonsHtml = '<div style="display:flex; flex-direction:column; gap:10px; margin-bottom:25px;">';
    let seasonBottomSheetsHtml = '';

    (r.seasons || []).forEach(s => {
        totalEpisodes += s.total || 0;
        haveEpisodes += s.have || 0;
        let totalSeasonSize = 0;
        let epsHtml = '';
        const seasonFileIds = [];

        (s.episodes || []).forEach(ep => {
            if (ep.fileId) { seasonFileIds.push(ep.fileId); totalSeasonSize += ep.size || 0; }
            if (ep.airDate && ep.airDate >= todayStr) {
                if (!nextEpisode || ep.airDate < nextEpisode.airDate) {
                    nextEpisode = { season: s.number, episode: ep.episode, title: ep.title, airDate: ep.airDate };
                }
            }

            let statusStyle = '';
            let statusLabel = '';
            let isInitDownloading = (!ep.hasFile && ep.download_info);

            if (ep.hasFile) {
                statusStyle = 'background: rgba(93, 255, 214, 0.08); color: var(--accent2); border: 1px solid rgba(93, 255, 214, 0.2);';
                statusLabel = `<span style="color: var(--accent2);">${t('torrent_downloaded')}</span>`;
            } else if (isInitDownloading) {
                statusStyle = 'background: var(--accent-bg); color: var(--accent); border: 1px solid var(--accent);';
                statusLabel = `<span style="color: var(--accent); font-weight:bold;">⬇ ${ep.download_info.pct}%</span>`;
            } else if (ep.airDate && ep.airDate < todayStr) {
                statusStyle = 'background: rgba(255, 93, 143, 0.08); color: var(--accent3); border: 1px solid rgba(255, 93, 143, 0.2);';
                statusLabel = `<span style="color: var(--accent3);">${t('films_filter_missing')}</span>`;
            } else {
                statusStyle = 'background: var(--bg2); color: var(--muted); border: 1px solid var(--border);';
                statusLabel = `<span>${t('status_upcoming')}</span>`;
            }

            const sizeDisplay = ep.size ? `<span style="font-family:var(--mono);">${formatBytes(ep.size)}</span>` : '';
            const qualityDisplay = ep.quality ? `<span style="color:var(--sonarr); font-weight:600;">${esc(ep.quality)}</span>` : '';

            const seasonStr = String(s.number).padStart(2, '0');
            const epStr = String(ep.episode).padStart(2, '0');
            const formattedTitle = `S${seasonStr}E${epStr} - ${ep.title}`;

            epsHtml += `
            <div style="border-bottom:1px solid var(--border); background:var(--bg3); display:flex; flex-direction:column;">
            <div onclick="toggleEpisodeActions(${ep.id}, this)" style="display:flex; align-items:center; justify-content:space-between; padding:14px 16px; cursor:pointer; user-select:none; position:relative; overflow:hidden;">
            <div style="display:flex; align-items:center; gap:14px; flex:1; min-width:0;">
            <div id="ep-badge-wrap-${ep.id}" style="width:38px; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; font-family:var(--mono); flex-shrink:0; transition:all 0.3s; ${statusStyle}">
            E${String(ep.episode).padStart(2,'0')}
            </div>
            <div style="display:flex; flex-direction:column; gap:4px; flex:1; min-width:0;">
            <span style="font-size:14px; font-weight:600; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(ep.title)}</span>
            <div style="display:flex; align-items:center; gap:8px; font-size:11px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            <span>${ep.airDate || t('status_unknown')}</span>
            ${qualityDisplay ? `• ${qualityDisplay}` : ''}
            ${sizeDisplay ? `• ${sizeDisplay}` : ''}
            • <span id="ep-status-label-${ep.id}">${statusLabel}</span>
            </div>
            </div>
            </div>
            <div style="color:var(--muted); margin-left:10px; display:flex; align-items:center;">
            <svg class="ep-chevron" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="transition:transform 0.2s;"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
            <div id="ep-progress-container-${ep.id}" data-was-downloading="${isInitDownloading ? 'true' : 'false'}">
            ${isInitDownloading ? `
                <div style="position:absolute; bottom:0; left:0; height:3px; background:rgba(0,0,0,0.2); width:100%;">
                <div style="height:100%; width:${ep.download_info.pct}%; background:var(--accent); transition:width 1.5s linear;"></div>
                </div>` : ''}
                </div>
                </div>
                <div id="ep-actions-${ep.id}" style="display:none; background:rgba(0,0,0,0.15); border-top:1px solid rgba(255,255,255,0.03); padding:12px 16px;">
                ${ep.fileName ? `<div style="font-family:var(--mono); font-size:10px; color:var(--muted); margin-bottom:12px; padding:8px 10px; background:rgba(0,0,0,0.2); border-radius:6px; border:1px dashed var(--border); word-break:break-all;">📄 ${esc(ep.fileName)}</div>` : ''}
                <div style="display:flex; gap:10px; justify-content:space-around;">
                <button style="flex:1; background:var(--bg2); border:1px solid var(--border); border-radius:10px; color:var(--text); padding:10px 5px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:6px; font-size:11px; transition:background 0.2s;" onclick="episodeSearchAuto(${ep.id}, this)"><span style="font-size:18px;">🔍</span> ${t('detail_auto_search')}</button>
                <button style="flex:1; background:var(--bg2); border:1px solid var(--border); border-radius:10px; color:var(--text); padding:10px 5px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:6px; font-size:11px; transition:background 0.2s;" onclick="openEpisodeReleases(${ep.id}, '${esc(formattedTitle).replace(/'/g, "\\'")}', ${r.id})"><span style="font-size:18px;">👤</span> ${t('detail_search_releases')}</button>
                ${ep.fileId ? `<button style="flex:1; background:rgba(255,93,143,0.05); border:1px solid rgba(255,93,143,0.2); border-radius:10px; color:var(--accent3); padding:10px 5px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:6px; font-size:11px; transition:background 0.2s;" onclick="deleteFile(${ep.fileId}, 'serie', ${r.id})"><span style="font-size:18px;">🗑️</span> ${t('detail_delete')}</button>` : ''}
                </div>
                </div>
                </div>`;
        });

        totalSerieSize += totalSeasonSize;
        const pctBar = `<div style="flex:1; height:3px; background:var(--border); border-radius:2px; overflow:hidden; margin:0 15px;"><div style="height:100%; width:${s.pct}%; background:var(--sonarr);"></div></div>`;

        seasonsHtml += `
        <div style="background:var(--bg3); border:1px solid var(--border); border-radius:12px; overflow:hidden;">
        <div style="display:flex; align-items:stretch;">
        <div class="season-header" onclick="toggleSeason(this)" style="flex:1; padding:15px; display:flex; align-items:center; cursor:pointer; min-width:0;">
        <span style="font-weight:bold; font-size:13px; color:var(--text); white-space:nowrap;">${t('season')} ${s.number}</span>
        ${pctBar}
        <span style="font-size:11px; color:var(--muted); white-space:nowrap;">${s.have}/${s.total} Eps</span>
        <span style="margin-left:10px; color:var(--muted); font-size:14px;">›</span>
        </div>
        <div class="desktop-season-actions" style="display:flex; gap:10px; padding:0 15px; align-items:center; border-left:1px solid var(--border);" onclick="event.stopPropagation()">
        <span style="cursor:pointer; display:flex; align-items:center;" onclick="toggleSeasonMonitor(${r.id}, ${s.number}, ${!s.monitored}, this)" title="Surveiller">${s.monitored ? ICON_MONITORED : ICON_UNMONITORED}</span>
        <button style="background:none; border:none; color:var(--muted); cursor:pointer; font-size:14px; display:flex; align-items:center;" onclick="seasonSearchAuto(${r.id}, ${s.number}, this)" title="${t('detail_auto_search')}">🔍</button>
        <button style="background:none; border:none; color:var(--muted); cursor:pointer; font-size:14px; display:flex; align-items:center;" onclick="openSeasonReleases(${r.id}, ${s.number}, 'Saison ${s.number}')" title="${t('detail_search_releases')}">👤</button>
        ${seasonFileIds.length > 0 ? `<button style="background:none; border:none; color:var(--accent3); cursor:pointer; font-size:14px; display:flex; align-items:center;" onclick="deleteSeasonFiles([${seasonFileIds.join(',')}], ${r.id}, ${s.number})" title="${t('detail_delete')}">🗑️</button>` : ''}
        </div>
        <button class="mobile-season-actions-toggle" onclick="event.stopPropagation(); openMobileSeasonMenu(${s.number});" style="border-left:1px solid var(--border); background:none; color:var(--text); font-size:20px; font-weight:bold; cursor:pointer; padding:0 18px; align-items:center; justify-content:center;">⋮</button>
        </div>
        <div class="season-episodes" style="display:none; background:rgba(0,0,0,0.1);">${epsHtml}</div>
        </div>`;

        seasonBottomSheetsHtml += `
        <div class="mobile-menu-overlay" id="season-menu-${s.number}-overlay" onclick="closeMobileSeasonMenu(${s.number})"></div>
        <div class="mobile-bottom-sheet" id="season-menu-${s.number}">
        <div class="sheet-drag-handle" style="width: 40px; height: 5px; background: var(--border); border-radius: 5px; margin: 0 auto 20px auto;"></div>
        <div style="display:flex; flex-direction:column; gap:12px; width:100%;">
        <button class="sheet-btn" onclick="closeMobileSeasonMenu(${s.number}); toggleSeasonMonitor(${r.id}, ${s.number}, ${!s.monitored}, this.querySelector('.season-monitor-icon'));" style="background: var(--bg3); border: 1px solid var(--border); color: var(--text); padding: 18px; border-radius: 14px; font-size: 16px; font-weight: 500; display: flex; align-items: center; gap: 15px; cursor: pointer; text-align: left;">
        <span class="season-monitor-icon" style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; flex-shrink: 0;">${s.monitored ? ICON_MONITORED : ICON_UNMONITORED}</span>
        <span class="season-monitor-text">Surveiller</span>
        </button>
        <button class="sheet-btn" onclick="closeMobileSeasonMenu(${s.number}); seasonSearchAuto(${r.id}, ${s.number}, this);" style="background: var(--bg3); border: 1px solid var(--border); color: var(--text); padding: 18px; border-radius: 14px; font-size: 16px; font-weight: 500; display: flex; align-items: center; gap: 15px; cursor: pointer; text-align: left;"><span style="font-size: 20px;">🔍</span> ${t('detail_auto_search')}</button>
        <button class="sheet-btn" onclick="closeMobileSeasonMenu(${s.number}); openSeasonReleases(${r.id}, ${s.number}, 'Saison ${s.number}');" style="background: var(--bg3); border: 1px solid var(--border); color: var(--text); padding: 18px; border-radius: 14px; font-size: 16px; font-weight: 500; display: flex; align-items: center; gap: 15px; cursor: pointer; text-align: left;"><span style="font-size: 20px;">👤</span> ${t('detail_search_releases')}</button>
        ${seasonFileIds.length > 0 ? `<button class="sheet-btn danger" onclick="closeMobileSeasonMenu(${s.number}); deleteSeasonFiles([${seasonFileIds.join(',')}], ${r.id}, ${s.number});" style="background: rgba(255, 93, 143, 0.05); border: 1px solid rgba(255, 93, 143, 0.3); color: var(--accent3); padding: 18px; border-radius: 14px; font-size: 16px; font-weight: 500; display: flex; align-items: center; gap: 15px; cursor: pointer; text-align: left;"><span style="font-size: 20px;">🗑️</span> ${t('detail_delete')}</button>` : ''}
        </div>
        </div>`;
    });
    seasonsHtml += '</div>';

    let nextEpBannerHtml = '';
    if (nextEpisode) {
        const formattedDate = nextEpisode.airDate.includes('-') ? nextEpisode.airDate.split('-').reverse().join('/') : nextEpisode.airDate;
        nextEpBannerHtml = `
        <div style="background: var(--accent-bg); border: 1px solid rgba(226, 255, 93, 0.2); border-radius: 14px; padding: 14px 16px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 14px; min-width: 0;">
        <div style="font-size: 22px; flex-shrink: 0;">⏳</div>
        <div style="min-width: 0;">
        <div style="font-size: 11px; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">${t('next_episode')}</div>
        <div style="font-size: 14px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">S${String(nextEpisode.season).padStart(2,'0')}E${String(nextEpisode.episode).padStart(2,'0')} • ${esc(nextEpisode.title)}</div>
        </div>
        </div>
        <div style="font-size: 12px; font-family: var(--mono); font-weight: 700; background: var(--bg2); border: 1px solid var(--border); padding: 6px 10px; border-radius: 8px; color: var(--text); white-space: nowrap;">${formattedDate}</div>
        </div>`;
    }

    const castHtml = (r.cast && r.cast.length > 0) ? `
    <h3 style="margin: 30px 0 15px 0; font-size: 16px; color:var(--text);">${t('detail_cast')}</h3>
    <div style="display: flex; gap: 12px; overflow-x: auto; padding-bottom: 15px; margin-bottom: 20px; scrollbar-width: none; margin-left:-20px; padding-left:20px; margin-right:-20px; padding-right:20px;">
    ${r.cast.map(c => `
        <div style="flex: 0 0 90px; text-align: center; cursor: pointer; transition: transform 0.2s;" onclick="openActorCredits('${esc(c.name).replace(/'/g, "\\'")}')">
        <div style="width: 90px; height: 135px; background: var(--bg3); border-radius: 10px; overflow: hidden; margin-bottom: 8px; border: 1px solid var(--border);">
        ${c.image ? `<img src="${c.image}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` : ''}
        <div style="display:${c.image ? 'none' : 'flex'};align-items:center;justify-content:center;height:100%;font-size:30px;color:var(--muted)">👤</div>
        </div>
        <div style="font-size: 11px; font-weight: bold; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${esc(c.name)}</div>
        <div style="font-size: 10px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.character ? esc(c.character) : t('status_unknown')}</div>
        </div>`).join('')}
        </div>` : '';

        content.innerHTML = `
        <style>
        .mobile-season-actions-toggle { display: none; }
        @media (max-width: 768px) {
            .desktop-season-actions { display: none !important; }
            .mobile-season-actions-toggle { display: flex !important; }
        }
        .mobile-menu-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 99998; opacity: 0; transition: opacity 0.3s; backdrop-filter: blur(2px); }
        .mobile-menu-overlay.open { opacity: 1; }
        .mobile-bottom-sheet { position: fixed; bottom: 0; left: 0; width: 100%; background: var(--bg2); border-radius: 24px 24px 0 0; z-index: 99999; padding: 15px 20px 30px; display: none; transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); box-shadow: 0 -10px 25px rgba(0,0,0,0.6); flex-direction: column; box-sizing: border-box; }
        .mobile-bottom-sheet.open { transform: translateY(0); }
        </style>
        <div style="position:relative; width:100%; min-height:100vh; background:var(--bg2);">
        <button onclick="closeSerieDetail()" style="position:absolute; top:15px; left:15px; background:var(--bg3); color:var(--text); border:1px solid var(--border); padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600; font-size:13px; z-index:100; box-shadow:0 4px 15px rgba(0,0,0,0.6); display:inline-flex; align-items:center; gap:6px;">⬅ ${t('detail_back')}</button>

        <div style="width:100%; height:250px; background-image:url('${fanartUrl}'); background-size:cover; background-position:center 20%; position:relative;">
        <div style="position:absolute; inset:0; background:linear-gradient(to bottom, rgba(19, 22, 30, 0.2) 0%, var(--bg2) 100%);"></div>
        </div>

        <div style="display:flex; gap:16px; padding:0 20px; margin-top:-70px; position:relative; z-index:10; align-items:flex-end;">
        ${posterUrl ? `<img src="${posterUrl}" style="width:115px; height:170px; border-radius:12px; box-shadow:0 6px 20px rgba(0,0,0,0.6); object-fit:cover; flex-shrink:0; border:1px solid rgba(255,255,255,0.1);">` : `<div style="width:115px; height:170px; background:var(--bg3); border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:40px; box-shadow:0 6px 20px rgba(0,0,0,0.6); border:1px solid rgba(255,255,255,0.1); flex-shrink:0;">📺</div>`}

        <div style="padding-bottom:5px; flex:1; min-width:0;">
        <div id="movie-status-badge" style="display:inline-block; font-size:10px; font-weight:bold; padding:3px 8px; border-radius:6px; background:var(--bg3); border:1px solid var(--border); color:${statusColor}; margin-bottom:6px;">${r.pct}% • ${statusText}</div>
        <h2 style="font-size:22px; font-weight:800; line-height:1.2; margin:0 0 6px 0; color:var(--text); text-overflow:ellipsis; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${esc(r.title)}
		<!-- LE BOUTON STYLE "BTN-APP-LINK" EST ICI -->
        ${r.appUrl && r.titleSlug ? `<a href="${r.appUrl}/series/${r.titleSlug}" target="_blank" class="btn-app-link" style="margin-left:auto; padding:6px 12px; font-size:11px; border-radius:6px; box-shadow:none;">
        <span class="icon" style="font-size:14px;">🌐</span>
        <span class="btn-app-link-text">${t('films_open_sonarr')}</span>
        </a>` : ''}
		</h2>
        <div style="font-size:12px; color:var(--muted); display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        <span>${r.year}</span>
        ${r.network ? `<span>• ${esc(r.network)}</span>` : ''}
        ${r.rating ? `<span style="background:rgba(255,255,255,0.08); padding:1px 6px; border-radius:4px; color:var(--text);">⭐ ${r.rating}</span>` : ''}
        <span style="cursor:pointer; display:flex; align-items:center;" onclick="toggleMonitor(${r.id}, 'serie', ${!r.monitored}, this)" title="Surveiller">${r.monitored ? ICON_MONITORED : ICON_UNMONITORED}</span>

        

        </div>
        </div>
        </div>

        <div style="display:flex; gap:10px; padding:20px; overflow-x:auto; scrollbar-width:none; border-bottom:1px solid var(--border); margin-bottom:20px;">
        <button style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:8px 16px; border-radius:20px; font-size:13px; font-weight:600; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center;" onclick="refreshMedia(${r.id}, 'serie', this)">🔄 ${t('detail_refresh')}</button>
        <button style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:8px 16px; border-radius:20px; font-size:13px; font-weight:600; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center;" onclick="openEditMediaModal(${r.id}, 'serie')">⚙️ ${t('modal_edit_sonarr')}</button>
        <button style="background:rgba(255,93,143,0.1); border:1px solid rgba(255,93,143,0.3); color:var(--accent3); padding:8px 16px; border-radius:20px; font-size:13px; font-weight:600; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center;" onclick="deleteMedia(${r.id}, 'serie', '${safeTitle}')">🗑️ ${t('detail_delete')}</button>
        </div>

        <div style="padding:0 20px 40px 20px;">
        <div style="font-size:12px; color:var(--muted); margin-bottom:20px; display:flex; justify-content:space-between;">
        <span>${genres}</span>
        <span>📅 ${t('sort_added')} : ${r.added || t('status_unknown')}</span>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg3); padding:12px 15px; border-radius:12px; border:1px solid var(--border); margin-bottom:20px;">
        <span style="font-size:13px; font-weight:bold; color:var(--text);">${(r.seasons||[]).length} ${t('detail_seasons')}</span>
        <span style="font-size:12px; font-family:var(--mono); color:var(--sonarr); font-weight:bold;">${haveEpisodes} / ${totalEpisodes} Eps <span style="color:var(--muted); font-weight:normal;">${formatBytes(totalSerieSize) ? '('+formatBytes(totalSerieSize)+')' : ''}</span></span>
        </div>

        ${nextEpBannerHtml}
        ${seasonsHtml}

        <h3 style="margin:0 0 10px 0; font-size:16px; color:var(--text);">${t('detail_overview')}</h3>
        <p style="font-size:13.5px; line-height:1.6; color:#a0a5b5; margin:0 0 25px 0;">${esc(r.overview) || t('no_series_found')}</p>
        ${castHtml}
        </div>
        ${seasonBottomSheetsHtml}
        </div>`;

        animateContentSlideIn(content);

        clearInterval(window.serieProgressInterval);
        window.serieProgressInterval = setInterval(async () => {
            const modal = document.getElementById('modal-serie');
            if (!modal || modal.style.display === 'none') {
                clearInterval(window.serieProgressInterval);
                return;
            }

            const qRes = await api('queue_status&type=serie&id=' + id, {}, 'GET');
            if (qRes.ok && qRes.queue) {
                const containers = document.querySelectorAll('[id^="ep-progress-container-"]');

                containers.forEach(container => {
                    const epId = container.id.replace('ep-progress-container-', '');
                    const info = qRes.queue.episodes ? qRes.queue.episodes[epId] : null;
                    const labelSpan = document.getElementById(`ep-status-label-${epId}`);
                    const badgeWrap = document.getElementById(`ep-badge-wrap-${epId}`);

                    if (info) {
                        container.innerHTML = `
                        <div style="position:absolute; bottom:0; left:0; height:3px; background:rgba(0,0,0,0.2); width:100%;">
                        <div style="height:100%; width:${info.pct}%; background:var(--accent); transition:width 1.5s linear;"></div>
                        </div>`;

                        if(labelSpan) labelSpan.innerHTML = `<span style="color: var(--accent); font-weight:bold;">⬇ ${info.pct}%</span>`;
                        if(badgeWrap) {
                            badgeWrap.style.background = 'var(--accent-bg)';
                            badgeWrap.style.border = '1px solid var(--accent)';
                            badgeWrap.style.color = 'var(--accent)';
                        }
                        container.dataset.wasDownloading = "true";
                    }
                    else if (container.dataset.wasDownloading === "true") {
                        clearInterval(window.serieProgressInterval);
                        openSerieDetail(id);
                    }
                });
            }
        }, 2000);
}

window.toggleEpisodeActions = function(epId, element) {
    const actionsDiv = document.getElementById('ep-actions-' + epId);
    const chevron = element.querySelector('.ep-chevron');

    if (actionsDiv.style.display === 'none') {
        document.querySelectorAll('[id^="ep-actions-"]').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.ep-chevron').forEach(el => el.style.transform = 'rotate(0deg)');

        actionsDiv.style.display = 'block';
        if (chevron) chevron.style.transform = 'rotate(180deg)';
    } else {
        actionsDiv.style.display = 'none';
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
};

function toggleSeason(header) {
    const outerContainer = header.parentElement;
    const epDiv = outerContainer.nextElementSibling;
    const serieContent = document.getElementById('serie-detail-content');

    const seasonTitle = header.querySelector('span[style*="font-weight"]')?.textContent?.trim()
    || header.querySelector('span')?.textContent?.trim()
    || "Saison";

    if (!serieContent.dataset.mainHtml) {
        serieContent.dataset.mainHtml = serieContent.innerHTML;
    }

    const epsContent = epDiv.innerHTML;
    const backBtn = `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;">
    <button onclick="closeSeasonView()" style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:8px 16px; border-radius:8px; cursor:pointer; font-size:14px; display:flex; align-items:center; gap:6px;">
    ‹ ${t('detail_back')}
    </button>
    <span style="font-weight:700; font-size:18px;">${seasonTitle}</span>
    </div>
    <div style="display:flex; flex-direction:column; gap:0; background:var(--bg3); border:1px solid var(--border); border-radius:12px; overflow:hidden;">
    ${epsContent}
    </div>
    `;

    serieContent.style.transition = 'transform .25s ease, opacity .2s';
    serieContent.style.transform = 'translateX(30px)';
    serieContent.style.opacity = '0';

    setTimeout(() => {
        serieContent.innerHTML = backBtn;
        serieContent.style.transform = 'translateX(-30px)';
        setTimeout(() => {
            serieContent.style.transform = 'translateX(0)';
            serieContent.style.opacity = '1';
            setTimeout(() => {
                serieContent.style.transform = '';
                serieContent.style.transition = '';
            }, 250);
        }, 20);
    }, 180);
}

function closeSeasonView() {
    const serieContent = document.getElementById('serie-detail-content');
    const mainHtml = serieContent.dataset.mainHtml;
    if (!mainHtml) return;

    serieContent.style.transition = 'transform .25s ease, opacity .2s';
    serieContent.style.transform = 'translateX(-30px)';
    serieContent.style.opacity = '0';

    setTimeout(() => {
        serieContent.innerHTML = mainHtml;
        delete serieContent.dataset.mainHtml;
        serieContent.style.transform = 'translateX(30px)';
        setTimeout(() => {
            serieContent.style.transform = 'translateX(0)';
            serieContent.style.opacity = '1';
            setTimeout(() => {
                serieContent.style.transform = '';
                serieContent.style.transition = '';
            }, 250);
        }, 20);
    }, 180);
}

async function episodeSearchAuto(episodeId, btn) {
    btn.disabled = true; btn.textContent = '⏳';
    const r = await api('episode_search_auto', { episodeId });
    if (r.ok) { btn.textContent = '✓'; notify(t('search_started'), 'ok'); }
    else { btn.disabled = false; btn.textContent = '🔍'; notify(r.error || t('notif_error'), 'err'); }
}

async function seasonSearchAuto(seriesId, season, btn) {
    btn.disabled = true; btn.textContent = '⏳';
    const r = await api('season_search_auto', { seriesId, season });
    if (r.ok) { btn.textContent = '✓'; notify(t('search_started'), 'ok'); }
    else { btn.disabled = false; btn.textContent = '🔍'; notify(r.error || t('notif_error'), 'err'); }
}

async function openEpisodeReleases(episodeId, title, seriesId) {
    showReleasesModal(t('detail_search_releases') + ' — ' + title);
    const r = await api('episode_releases&episodeId=' + episodeId, {}, 'GET');
    if (r.error) {
        document.getElementById('releases-content').innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>${t('notif_error')}</h3><p>${esc(r.error)}</p></div>`;
        return;
    }
    renderReleasesTable(r.releases || [], 'episode', seriesId);
}

async function openSeasonReleases(seriesId, season, label) {
    showReleasesModal(t('detail_search_releases') + ' — ' + label);
    const r = await api('season_releases&seriesId=' + seriesId + '&season=' + season, {}, 'GET');
    if (r.error) {
        document.getElementById('releases-content').innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>${t('notif_error')}</h3><p>${esc(r.error)}</p></div>`;
        return;
    }
    renderReleasesTable(r.releases || [], 'episode', seriesId);
}

// ── RELEASES ──────────────────────────────────────────────────────────────────
function showReleasesModal(title) {
    const modal = document.getElementById('modal-releases');
    if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
    const inner = modal.querySelector('.modal');
    inner.innerHTML = `
    <div class="releases-modal-header">
    <button class="btn-icon" onclick="closeReleases()" style="flex-shrink:0;font-size:18px;">✕</button>
    <h3 id="releases-title" style="font-family:var(--mono);font-size:14px;color:var(--accent);margin:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(title)}</h3>
    </div>
    <div id="releases-toolbar-wrap"></div>
    <div id="releases-content"><div style="text-align:center;padding:40px;color:var(--muted);">${t('loading')}</div></div>
    `;
    modal.classList.add('open');
}

function closeReleases() {
    document.getElementById('modal-releases').classList.remove('open');
}

function renderReleasesTable(releases, type, mediaId) {
    _currentReleases = releases;
    _currentRelType = type;
    _currentRelMediaId = mediaId;

    const container = document.getElementById('releases-content');
    if (!releases.length) {
        container.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><h3>${t('releases_none')}</h3><p>${t('releases_hint')}</p></div>`;
        return;
    }

    const indexers = [...new Set(releases.map(r => r.indexer).filter(Boolean))].sort();
    const qualities = [...new Set(releases.map(r => r.quality).filter(Boolean))].sort();
    const indexerOptions = indexers.map(i => `<option value="${esc(i)}">${esc(i)}</option>`).join('');
    const qualityOptions = qualities.map(q => `<option value="${esc(q)}">${esc(q)}</option>`).join('');

    const toolbar = `
    <div class="rel-sort-wrap">
    <button class="btn-sort" onclick="toggleSortMenu()" title="Trier">⇅</button>
    <div class="sort-menu" id="sort-menu">
    <div class="sort-menu-item" onclick="sortReleases('age')">${t('sort_by_date')}</div>
    <div class="sort-menu-item" onclick="sortReleases('size')">${t('sort_by_size')}</div>
    <div class="sort-menu-item" onclick="sortReleases('indexer')">${t('sort_by_indexer')}</div>
    <div class="sort-menu-item" onclick="sortReleases('rejected')">${t('sort_by_rejections')}</div>
    <div class="sort-menu-item" onclick="sortReleases('quality')">${t('sort_by_quality')}</div>
    <div class="sort-menu-item" onclick="sortReleases('customscore')">${t('sort_by_score')}</div>
    </div>
    </div>`;

    let rows = '';
    releases.forEach(rel => {
        const uid = 'rej_' + Math.random().toString(36).substr(2, 9);
        const statusIcon = rel.rejected
        ? '<span style="color:var(--accent3); font-weight:bold; margin-right:8px; font-size:13px;">❌</span>'
        : '<span style="color:var(--accent2); font-weight:bold; margin-right:8px; font-size:13px;">✓</span>';

        const linkUrl = rel.infoUrl || (rel.guid && rel.guid.startsWith('http') ? rel.guid : '');
        const titleHtml = linkUrl
        ? `<a href="${esc(linkUrl)}" target="_blank" style="color:var(--text);text-decoration:none;" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text)'">${esc(rel.title)}</a>`
        : esc(rel.title);

        const ageInDays = Math.floor((rel.age || 0) / 24);

        const rejectionButton = rel.rejected
        ? `<button onclick="const e=document.getElementById('${uid}'); e.style.display=e.style.display==='none'?'block':'none';" style="width:100%; margin-top:10px; background:rgba(255,93,143,0.08); border:1px solid rgba(255,93,143,0.2); color:var(--accent3); border-radius:8px; padding:8px 12px; font-size:12px; font-weight:bold; cursor:pointer; display:flex; justify-content:center; align-items:center; gap:6px; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,93,143,0.15)'" onmouseout="this.style.background='rgba(255,93,143,0.08)'">
        ⚠️ ${t('show_rejections')}
        </button>`
        : '';

        const rejectionsDiv = rel.rejected
        ? `<div id="${uid}" style="display:none; margin-top:8px; padding:12px; background:rgba(0,0,0,0.2); border:1px dashed rgba(255,93,143,0.4); border-radius:8px; color:var(--accent3); font-size:12px; line-height:1.5;">
        <b style="color:var(--text);">${t('rejection_reasons')}</b><br>
        • ${(rel.rejections||[]).map(r => esc(r)).join('<br>• ')}
        </div>`
        : '';

        rows += `
        <div class="release-row"
        data-title="${esc(rel.title)}"
        data-indexer="${esc(rel.indexer||'')}"
        data-quality="${esc(rel.quality||'')}"
        data-seeders="${rel.seeders||0}"
        data-size="${rel.size||0}"
        data-age="${rel.age||0}"
        data-rejected="${rel.rejected ? '1' : '0'}"
        data-customscore="${rel.customScore||0}"
        style="display:flex; flex-direction:column; gap:8px; padding:12px; border-bottom:1px solid var(--border); transition:background 0.2s;" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='transparent'">

        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
        <div class="rel-title" style="font-size:13px; font-weight:600; color:var(--text); line-height:1.4; word-break:break-all;">
        ${statusIcon}${titleHtml}
        </div>
        <button class="btn-grab" onclick="grabRelease('${esc(rel.guid)}', ${rel.indexerId||0}, ${mediaId}, '${type}', this)" style="flex-shrink:0; background:var(--accent); color:#000; font-weight:bold; font-size:12px; border:none; padding:8px 12px; border-radius:6px; cursor:pointer;">⬇ ${t('torrent_add_btn')}</button>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:10px; font-size:11px; align-items:center;">
        <span class="pill ${rel.approved ? 'green' : 'orange'}" style="padding:2px 6px; border-radius:4px; font-weight:bold; background:${rel.approved ? 'rgba(93,255,214,0.1)' : 'rgba(255,160,60,0.1)'}; color:${rel.approved ? 'var(--accent2)' : '#ffa03c'}; border:1px solid ${rel.approved ? 'rgba(93,255,214,0.3)' : 'rgba(255,160,60,0.3)'};">${esc(rel.quality)}</span>
        <span style="color:var(--text); font-family:var(--mono);">${rel.size} GB</span>
        <span style="color:var(--muted);">${ageInDays} j</span>
        <span style="color:${(rel.customScore||0) > 0 ? 'var(--accent2)' : (rel.customScore||0) < 0 ? 'var(--accent3)' : 'var(--muted)'}; font-family:var(--mono);">⭐ ${rel.customScore||0}</span>
        <span style="color:var(--muted); background:var(--bg2); border:1px solid var(--border); padding:2px 6px; border-radius:4px;">${esc(rel.indexer)}</span>
        <span style="color:var(--muted); margin-left:auto;" title="Seeders">🌱 ${rel.seeders||0}</span>
        </div>

        ${rejectionButton}
        ${rejectionsDiv}
        </div>`;
    });

    const listHtml = `<div id="releases-list" style="display:flex; flex-direction:column;">${rows}</div>`;

    const toolbarWrap = document.getElementById('releases-toolbar-wrap');
    if (toolbarWrap) {
        toolbarWrap.innerHTML = toolbar;
        container.innerHTML = listHtml;
    } else {
        container.innerHTML = toolbar + listHtml;
    }
}

async function grabRelease(guid, indexerId, mediaId, type, btn) {
    btn.disabled = true; btn.textContent = '⏳';
    let r;
    if (type === 'movie') {
        r = await api('movie_download', { guid, indexerId, movieId: mediaId });
    } else {
        r = await api('episode_download', { guid, indexerId, seriesId: mediaId });
    }
    if (r.ok) { btn.textContent = '✓ OK'; btn.style.background = 'var(--accent2)'; notify(t('download_started'), 'ok'); }
    else { btn.disabled = false; btn.textContent = '⬇ ' + t('torrent_add_btn'); notify(r.error || t('notif_error'), 'err'); }
}

// ── ÉVÉNEMENTS GLOBAUX ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const pwInput = document.getElementById('login-pw');
    if (pwInput) {
        pwInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') doLogin();
        });
    }
});

document.getElementById('modal-releases').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

// ── GESTION DES ONGLETS DE LA PAGE D'ACCUEIL ──────────────────────────────────
function switchHomeTab(tabName, button, updateUrl = true) {
    if (document.getElementById('modal-movie')?.classList.contains('open')) closeMovieDetail();
    if (document.getElementById('modal-serie')?.classList.contains('open')) closeSerieDetail();

    document.querySelectorAll('.home-tab-content').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
    });

    if (button && button.parentNode) {
        button.parentNode.querySelectorAll('.hub-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        button.classList.add('active');
    } else {
        const btns = document.querySelectorAll('.hub-btn');
        if (btns.length > 0) {
            btns.forEach(b => b.classList.remove('active'));
            const targetBtn = Array.from(btns).find(b => b.getAttribute('onclick')?.includes(`'${tabName}'`));
            if (targetBtn) targetBtn.classList.add('active');
        }
    }

    const targetDiv = document.getElementById('home-tab-' + tabName);
    if (targetDiv) {
        targetDiv.style.display = 'block';
        targetDiv.classList.add('active');
    }

    if (tabName === 'movies') {
        if (typeof loadMovies === 'function') loadMovies();
    } else if (tabName === 'series') {
        if (typeof loadSeries === 'function') loadSeries();
    } else {
        if (typeof loadHome === 'function') loadHome();
    }

    if (updateUrl) {
        let hash = '';
        if (tabName === 'movies') hash = '#hub_films';
        else if (tabName === 'series') hash = '#hub_series';
        else hash = '#dashboard';

        history.pushState({ tab: tabName }, '', hash);
    }
}

function renderMediaRow(items, type) {
    if (!items || items.length === 0) {
        return `<p style="color:var(--muted); font-size:13px; padding: 10px;">${t('no_movie_found')}</p>`;
    }

    let html = '<div class="media-row">';

    items.forEach(item => {
        const clickAction = type === 'movie' ? `openMovieDetail(${item.id})` : `openSerieDetail(${item.id})`;
        const posterUrl = item.poster || 'placeholder.png';
        const titleDisplay = esc(item.title);

        html += `
        <div class="media-card" onclick="${clickAction}">
        <img src="${posterUrl}" alt="${titleDisplay}" loading="lazy">
        <div class="media-card-title">${titleDisplay}</div>
        </div>
        `;
    });

    html += '</div>';
    return html;
}

async function setSession() {
    await fetch('api.php?action=login_session', { method: 'POST' });
}

// ── SYSTÈME DE CONFIRMATION CUSTOM ────────────────────────────────────────────
let pendingConfirmAction = null;

function showConfirmModal(title, message, actionCallback) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').innerHTML = message;
    pendingConfirmAction = actionCallback;
    const modal = document.getElementById('modal-confirm');
    modal.style.zIndex = '999999999'; // 🌟 FORCE LA MODALE AU-DESSUS DE TOUT
    modal.classList.add('open');
}

function closeConfirmModal() {
    document.getElementById('modal-confirm').classList.remove('open');
    pendingConfirmAction = null;
}

document.getElementById('btn-confirm-action').addEventListener('click', () => {
    if (pendingConfirmAction) pendingConfirmAction();
    closeConfirmModal();
});

document.getElementById('modal-confirm').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeConfirmModal();
});


// ── FONCTIONS DE SUPPRESSION SÉCURISÉES ───────────────────────────────────────
function deleteMedia(id, type, title) {
    const safeTitle = esc(title);

    const msgHtml = `
    <div style="margin-bottom: 15px;">${t('confirm_delete_media')} <strong>${safeTitle}</strong> ?</div>
    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; background: var(--bg2); padding: 12px; border-radius: 8px; border: 1px solid var(--border);">
    <input type="checkbox" id="delete-files-checkbox" checked style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent3);">
    <span style="font-size: 13px; color: var(--text);">${t('confirm_delete_files')}</span>
    </label>
    <div style="color: var(--accent3); font-size: 12px; margin-top: 12px;">${t('confirm_irreversible')}</div>
    `;

    showConfirmModal(
        t('confirm_delete_media'),
                     msgHtml,
                     async () => {
                         const deleteFiles = document.getElementById('delete-files-checkbox') ? document.getElementById('delete-files-checkbox').checked : true;
                         const r = await api('delete_media', { id, type, deleteFiles, title });

                         if (r.ok) {
                             notify(t('deleted_ok').replace('{title}', title), 'ok');

                             if (type === 'movie') closeMovieDetail();
                             else closeSerieDetail();

                             setTimeout(() => {
                                 const path = window.location.pathname;
                                 const hash = window.location.hash;
                                 const isMoviePage = hash === '#hub_films' || path.includes('films.php');
                                 const isSeriePage = hash === '#hub_series' || path.includes('series.php');

                                 if (isMoviePage && type === 'movie' && typeof loadMovies === 'function') {
                                     loadMovies();
                                 } else if (isSeriePage && type === 'serie' && typeof loadSeries === 'function') {
                                     loadSeries();
                                 } else if (path.includes('index.php') || hash === '#dashboard' || hash === '') {
                                     if (typeof loadHome === 'function') loadHome();
                                 }
                             }, 300);

                         } else {
                             notify(r.error || t('delete_error'), 'err');
                         }
                     }
    );
}

function deleteFile(fileId, type, mediaId) {
    showConfirmModal(
        t('confirm_delete_media'),
                     t('confirm_delete_file_msg'),
                     async () => {
                         const r = await api('delete_file', { fileId, type });
                         if (r.ok) {
                             notify(t('deleted_ok').replace('{title}', 'Fichier'), 'ok');
                             if (type === 'movie') openMovieDetail(mediaId);
                             else openSerieDetail(mediaId);
                         } else {
                             notify(r.error || t('delete_error'), 'err');
                         }
                     }
    );
}

async function refreshMedia(id, type, btn) {
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.textContent = '⏳ ' + t('loading');

    const r = await api('refresh_media', { id, type });
    if (r.ok) {
        btn.textContent = '✓ OK';
        btn.style.borderColor = 'var(--accent2)';
        btn.style.color = 'var(--accent2)';
        notify(t('refresh_started'), 'ok');

        setTimeout(() => {
            if (type === 'movie') openMovieDetail(id);
            else openSerieDetail(id);
        }, 3000);

    } else {
        btn.disabled = false;
        btn.innerHTML = originalText;
        notify(r.error || t('error_connection'), 'err');
    }
}

// ── RELEASES FILTER/SORT STATE ────────────────────────────────────────────────
let _currentReleases = [];
let _currentRelType = '';
let _currentRelMediaId = 0;
let _sortMenuOpen = false;

function applyFilters() {
    const search  = (document.getElementById('rel-search')?.value || '').toLowerCase();
    const indexer = document.getElementById('rel-indexer')?.value || 'all';
    const quality = document.getElementById('rel-quality')?.value || 'all';
    document.querySelectorAll('.release-row').forEach(row => {
        const ok = row.dataset.title.toLowerCase().includes(search)
        && (indexer === 'all' || row.dataset.indexer === indexer)
        && (quality === 'all' || row.dataset.quality === quality);
        row.style.display = ok ? '' : 'none';
    });
}

function toggleSortMenu() {
    _sortMenuOpen = !_sortMenuOpen;
    const menu = document.getElementById('sort-menu');
    if (menu) menu.classList.toggle('open', _sortMenuOpen);
}

let _sortCriteria = 'seeders';
let _sortAsc = false;

function sortReleases(criteria) {
    if (_sortCriteria === criteria) {
        _sortAsc = !_sortAsc;
    } else {
        _sortCriteria = criteria;
        _sortAsc = false;
    }

    _sortMenuOpen = false;
    const menu = document.getElementById('sort-menu');
    if (menu) {
        menu.classList.remove('open');
        menu.querySelectorAll('.sort-menu-item').forEach(el => {
            const match = el.textContent.toLowerCase().includes(criteria);
            el.classList.toggle('active', match);
            if (match) {
                el.setAttribute('data-arrow', _sortAsc ? ' ↑' : ' ↓');
                el.textContent = el.textContent.replace(/ [↑↓]$/, '') + (_sortAsc ? ' ↑' : ' ↓');
            } else {
                el.textContent = el.textContent.replace(/ [↑↓]$/, '');
            }
        });
    }

    const tbody = document.getElementById('releases-list');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('.release-row'));
    const dir = _sortAsc ? 1 : -1;

    rows.sort((a, b) => {
        if (criteria === 'indexer') return dir * a.dataset.indexer.localeCompare(b.dataset.indexer);
        if (criteria === 'quality') return dir * a.dataset.quality.localeCompare(b.dataset.quality);
        if (criteria === 'rejected') return dir * (parseInt(a.dataset.rejected) - parseInt(b.dataset.rejected));
        const key = criteria === 'customscore' ? 'customscore' : criteria;
        return dir * ((parseFloat(b.dataset[key])||0) - (parseFloat(a.dataset[key])||0)) * -1;
    });

    rows.forEach(row => tbody.appendChild(row));
}

document.addEventListener('click', e => {
    if (_sortMenuOpen && !e.target.closest('.rel-sort-wrap')) {
        _sortMenuOpen = false;
        const m = document.getElementById('sort-menu');
        if (m) m.classList.remove('open');
    }
});


// ── MOVIES SORT ───────────────────────────────────────────────────────────────
let _moviesSortCriteria = 'title';
let _moviesSortAsc = true;
let _moviesSortOpen = false;
let _moviesAllData = [];

function toggleMoviesSort() {
    _moviesSortOpen = !_moviesSortOpen;
    const menu = document.getElementById('movies-sort-menu');
    if (menu) menu.classList.toggle('open', _moviesSortOpen);
}

function renderMoviesGridOnly() {
    const sorted = applySortToMovies([..._moviesAllData]);
    const grid = document.getElementById('movies-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const fragment = document.createDocumentFragment();
    sorted.forEach(mv => fragment.appendChild(makeMovieCard(mv, false)));
    grid.appendChild(fragment);
}

function sortMovies(criteria) {
    if (_moviesSortCriteria === criteria) {
        _moviesSortAsc = !_moviesSortAsc;
    } else {
        _moviesSortCriteria = criteria;
        _moviesSortAsc = (criteria === 'title');
    }

    _moviesSortOpen = false;
    const menu = document.getElementById('movies-sort-menu');
    if (menu) {
        menu.classList.remove('open');
        menu.querySelectorAll('.sort-menu-item').forEach(el => {
            const match = el.textContent.replace(/ [↑↓]$/, '').toLowerCase() === criteria.toLowerCase()
            || el.textContent.replace(/ [↑↓]$/, '') === criteria;
            el.classList.toggle('active', match);
            if (match) {
                el.textContent = el.textContent.replace(/ [↑↓]$/, '') + (_moviesSortAsc ? ' ↑' : ' ↓');
            } else {
                el.textContent = el.textContent.replace(/ [↑↓]$/, '');
            }
        });
    }

    const sorted = applySortToMovies([..._moviesAllData]);
    const grid = document.getElementById('movies-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const fragment = document.createDocumentFragment();
    sorted.forEach(mv => fragment.appendChild(makeMovieCard(mv, false)));
    grid.appendChild(fragment);
}

function applySortToMovies(movies) {
    const dir = _moviesSortAsc ? 1 : -1;
    return movies.sort((a, b) => {
        switch (_moviesSortCriteria) {
            case 'title':      return dir * (a.title || '').localeCompare(b.title || '', 'fr', {sensitivity: 'base'});
            case 'monitored':  return dir * ((a.monitored ? 1 : 0) - (b.monitored ? 1 : 0));
            case 'rating':     return dir * ((a.rating || 0) - (b.rating || 0));
            case 'year':       return dir * ((a.year || 0) - (b.year || 0));
            case 'added':      return dir * ((a.added || '').localeCompare(b.added || ''));
            case 'sizeOnDisk': return dir * ((a.sizeOnDisk || 0) - (b.sizeOnDisk || 0));
            default:           return 0;
        }
    });
}

document.addEventListener('click', e => {
    if (_moviesSortOpen && !e.target.closest('.lib-sort-wrap')) {
        _moviesSortOpen = false;
        const m = document.getElementById('movies-sort-menu');
        if (m) m.classList.remove('open');
    }
});

function deleteSeasonFiles(fileIds, seriesId, seasonNumber) {
    showConfirmModal(
        t('detail_delete') + seasonNumber,
                     t('confirm_delete_msg'),
                     async () => {
                         notify(t('loading'), 'ok');
                         let successCount = 0;

                         for (let fileId of fileIds) {
                             const r = await api('delete_file', { fileId: fileId, type: 'serie' });
                             if (r.ok) successCount++;
                         }

                         if (successCount > 0) {
                             notify(t('deleted_ok').replace('{title}', 'Fichiers'), 'ok');
                             openSerieDetail(seriesId);
                         } else {
                             notify(t('delete_error'), 'err');
                         }
                     }
    );
}

// ── SERIES SORT ───────────────────────────────────────────────────────────────
let _seriesSortCriteria = 'title';
let _seriesSortAsc = true;
let _seriesSortOpen = false;
let _seriesAllData = [];

function toggleSeriesSort() {
    _seriesSortOpen = !_seriesSortOpen;
    const menu = document.getElementById('series-sort-menu');
    if (menu) menu.classList.toggle('open', _seriesSortOpen);
}

function renderSeriesGridOnly() {
    const sorted = applySortToSeries([..._seriesAllData]);
    const grid = document.getElementById('series-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const fragment = document.createDocumentFragment();
    sorted.forEach(s => fragment.appendChild(makeSerieCard(s, false)));
    grid.appendChild(fragment);
}

function sortSeries(criteria) {
    if (_seriesSortCriteria === criteria) {
        _seriesSortAsc = !_seriesSortAsc;
    } else {
        _seriesSortCriteria = criteria;
        _seriesSortAsc = (criteria === 'title' || criteria === 'network' || criteria === 'status');
    }

    _seriesSortOpen = false;
    const menu = document.getElementById('series-sort-menu');
    if (menu) {
        menu.classList.remove('open');
        menu.querySelectorAll('.sort-menu-item').forEach(el => {
            const label = el.textContent.replace(/ [↑↓]$/, '');
            const match = label.toLowerCase().replace(' ', '') === criteria.toLowerCase().replace(/([A-Z])/g, ' $1').trim().toLowerCase().replace(' ', '');
            el.classList.toggle('active', match);
            if (match) {
                el.textContent = label + (_seriesSortAsc ? ' ↑' : ' ↓');
            } else {
                el.textContent = label;
            }
        });
    }

    const sorted = applySortToSeries([..._seriesAllData]);
    const grid = document.getElementById('series-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const fragment = document.createDocumentFragment();
    sorted.forEach(s => fragment.appendChild(makeSerieCard(s, false)));
    grid.appendChild(fragment);
}

function applySortToSeries(series) {
    const dir = _seriesSortAsc ? 1 : -1;
    return series.sort((a, b) => {
        switch (_seriesSortCriteria) {
            case 'title':      return dir * (a.title || '').localeCompare(b.title || '', 'fr', {sensitivity: 'base'});
            case 'monitored':  return dir * ((a.monitored ? 1 : 0) - (b.monitored ? 1 : 0));
            case 'nextAiring': return dir * ((a.nextAiring || '9999').localeCompare(b.nextAiring || '9999'));
            case 'added':      return dir * ((a.added || '').localeCompare(b.added || ''));
            case 'network':    return dir * (a.network || '').localeCompare(b.network || '');
            case 'sizeOnDisk': return dir * ((a.sizeOnDisk || 0) - (b.sizeOnDisk || 0));
            case 'rating':     return dir * ((a.rating || 0) - (b.rating || 0));
            case 'status':     return dir * (a.status || '').localeCompare(b.status || '');
            default:           return 0;
        }
    });
}

document.addEventListener('click', e => {
    if (_seriesSortOpen && !e.target.closest('.lib-sort-wrap')) {
        _seriesSortOpen = false;
        const m = document.getElementById('series-sort-menu');
        if (m) m.classList.remove('open');
    }
});

// ── SYSTÈME D'ÉDITION AVANCÉ (Films & Séries) ─────────────────────────────────
async function openEditMediaModal(id, type) {
    let modal = document.getElementById('modal-edit-media');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-edit-media';
        modal.className = 'modal-bg';
        modal.style.zIndex = '10002';

        modal.addEventListener('click', e => {
            if (e.target === modal) modal.classList.remove('open');
        });
            document.body.appendChild(modal);
    }

    modal.innerHTML = `
    <div class="modal-box" style="width: 500px; max-width: 90%; overflow: visible;">
    <h2 id="edit-media-title" style="margin-top:0; border-bottom:1px solid var(--border); padding-bottom:10px;">${t('loading')}</h2>
    <div id="edit-media-loader" style="padding: 30px; text-align: center; color: var(--muted);">${t('loading')}</div>
    <div id="edit-media-form" style="display:none; display:flex; flex-direction:column; gap:15px; margin-top:20px;">

    <div class="form-row">
    <label style="font-size:12px; font-weight:bold; color:var(--muted); text-transform:uppercase;">${t('add_media_quality')}</label>
    <select id="edit-profile" style="width:100%; padding:10px; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:6px;"></select>
    </div>

    <div class="form-row">
    <label style="font-size:12px; font-weight:bold; color:var(--muted); text-transform:uppercase;">${t('add_media_folder')}</label>
    <select id="edit-root-folder" style="width:100%; padding:10px; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:6px;"></select>
    </div>

    <div class="form-row">
    <label style="font-size:12px; font-weight:bold; color:var(--muted); text-transform:uppercase;">Chemin</label>
    <input type="text" id="edit-path" style="width:100%; padding:10px; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:6px;">
    </div>

    <div class="form-row" style="position: relative;">
    <label style="font-size:12px; font-weight:bold; color:var(--muted); text-transform:uppercase;">Tags</label>

    <div id="edit-tags-badges" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;"></div>

    <input type="text" id="edit-tags-input" placeholder="Ajouter..." style="width:100%; padding:10px; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:6px;" autocomplete="off">

    <div id="edit-tags-suggestions" style="position:absolute; left:0; right:0; top:100%; background:var(--bg2); border:1px solid var(--border); border-radius:6px; max-height:160px; overflow-y:auto; z-index:10005; display:none; box-shadow:0 6px 16px rgba(0,0,0,0.4); margin-top:4px;"></div>
    </div>

    <div style="display:flex; gap:10px; margin-top:25px;">
    <button class="btn-primary" id="btn-save-edit" style="flex:1;">💾 ${t('settings_tmdb_save')}</button>
    <button class="btn-detail secondary" onclick="document.getElementById('modal-edit-media').classList.remove('open')">${t('auth_cancel_btn')}</button>
    </div>
    </div>
    </div>
    `;

    modal.classList.add('open');
    const appDriver = type === 'movie' ? 'radarr' : 'sonarr';

    const [optionsRes, mediaRes] = await Promise.all([
        api(`get_options&app=${appDriver}`, {}, 'GET'),
                                                     api(`get_media_raw&type=${type}&id=${id}`, {}, 'GET')
    ]);

    if (optionsRes.error || mediaRes.error || !mediaRes.title) {
        document.getElementById('edit-media-loader').innerHTML = `<span style="color:var(--accent3)">${t('error_connection')}</span>`;
        return;
    }

    // On choisit la bonne traduction selon le type de média
    const titleTranslation = type === 'movie' ? t('modal_edit_radarr') : t('modal_edit_sonarr');
    document.getElementById('edit-media-title').textContent = titleTranslation + ' : ' + mediaRes.title;

    const profileSel = document.getElementById('edit-profile');
    const folderSel = document.getElementById('edit-root-folder');
    const pathInput = document.getElementById('edit-path');

    const badgesContainer = document.getElementById('edit-tags-badges');
    const tagsInput = document.getElementById('edit-tags-input');
    const suggestionsContainer = document.getElementById('edit-tags-suggestions');

    let selectedTagIds = [...(mediaRes.tags || [])];
    const allAvailableTags = optionsRes.tags || [];

    profileSel.innerHTML = optionsRes.profiles.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    folderSel.innerHTML = optionsRes.folders.map(f => `<option value="${f.path}">${esc(f.path)}</option>`).join('');

    profileSel.value = mediaRes.qualityProfileId;
    folderSel.value = mediaRes.rootFolderPath;
    pathInput.value = mediaRes.path;

    function renderBadges() {
        if (selectedTagIds.length === 0) {
            badgesContainer.innerHTML = `<span style="color:var(--muted); font-size:13px; font-style:italic; margin-bottom:4px;">Aucun tag</span>`;
            return;
        }

        badgesContainer.innerHTML = selectedTagIds.map(id => {
            const tagObj = allAvailableTags.find(t => t.id === id);
            if (!tagObj) return '';
            return `
            <span style="display:inline-flex; align-items:center; gap:6px; background:var(--accent); color:#fff; padding:4px 10px; border-radius:14px; font-size:13px; font-weight:500;">
            ${esc(tagObj.label)}
            <span class="remove-tag-btn" data-id="${tagObj.id}" style="cursor:pointer; font-weight:bold; font-size:14px; opacity:0.7; transition:0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7">×</span>
            </span>
            `;
        }).join('');

        badgesContainer.querySelectorAll('.remove-tag-btn').forEach(btn => {
            btn.onclick = (e) => {
                const idToRemove = parseInt(btn.dataset.id);
                selectedTagIds = selectedTagIds.filter(id => id !== idToRemove);
                renderBadges();
                filterSuggestions(tagsInput.value);
            };
        });
    }

    function filterSuggestions(searchQuery = '') {
        const query = searchQuery.toLowerCase().trim();

        const matches = allAvailableTags.filter(t => {
            const matchesSearch = t.label.toLowerCase().includes(query);
            const alreadySelected = selectedTagIds.includes(t.id);
            return matchesSearch && !alreadySelected;
        });

        if (matches.length === 0) {
            suggestionsContainer.style.display = 'none';
            return;
        }

        suggestionsContainer.innerHTML = matches.map(t => `
        <div class="tag-suggestion-item" data-id="${t.id}" style="padding:10px; cursor:pointer; font-size:14px; border-bottom:1px solid var(--border); transition:background 0.2s;" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='none'">
        🔍 ${esc(t.label)}
        </div>
        `).join('');

        suggestionsContainer.style.display = 'block';

        suggestionsContainer.querySelectorAll('.tag-suggestion-item').forEach(item => {
            item.onclick = () => {
                const idToAdd = parseInt(item.dataset.id);
                if (!selectedTagIds.includes(idToAdd)) {
                    selectedTagIds.push(idToAdd);
                }
                tagsInput.value = '';
                suggestionsContainer.style.display = 'none';
                renderBadges();
                tagsInput.focus();
            };
        });
    }

    tagsInput.oninput = (e) => filterSuggestions(e.target.value);
    tagsInput.onfocus = () => filterSuggestions(tagsInput.value);

    const closeSuggestionsEvent = (e) => {
        if (e.target !== tagsInput && e.target !== suggestionsContainer) {
            suggestionsContainer.style.display = 'none';
        }
    };
    document.addEventListener('click', closeSuggestionsEvent);

    renderBadges();

    document.getElementById('edit-media-loader').style.display = 'none';
    document.getElementById('edit-media-form').style.display = 'flex';

    document.getElementById('btn-save-edit').onclick = async function() {
        this.disabled = true;
        this.textContent = '⏳ ' + t('settings_vapid_saving');

        document.removeEventListener('click', closeSuggestionsEvent);

        const payload = {
            id: id,
            type: type,
            qualityProfileId: profileSel.value,
            rootFolderPath: folderSel.value,
            path: pathInput.value.trim(),
            tags: JSON.stringify(selectedTagIds)
        };

        const r = await api('edit_media', payload);
        if (r.ok) {
            notify(t('notif_saved'), 'ok');
            modal.classList.remove('open');
            if (type === 'movie') openMovieDetail(id); else openSerieDetail(id);
        } else {
            this.disabled = false;
            this.textContent = '💾 ' + t('settings_tmdb_save');
            notify(r.error || t('notif_error'), 'err');
            document.addEventListener('click', closeSuggestionsEvent);
        }
    };
}

let currentActiveActor = null;

async function openActorCredits(actorName) {
    if (!actorName) return;

    currentActiveActor = actorName;

    const modal = document.getElementById('modal-actor');
    if (!modal) return;

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    const headerDetail = document.getElementById('actor-header-detail');
    const creditsList = document.getElementById('actor-credits-list');

    headerDetail.innerHTML = `<div style="color:var(--muted); width:100%; text-align:center; padding:25px;">${t('loading')} <strong>${esc(actorName)}</strong>... ⏳</div>`;
    creditsList.innerHTML = '';

    creditsList.style.display = 'flex';
    creditsList.style.flexDirection = 'column';
    creditsList.style.gap = '24px';

    try {
        const r = await api(`actor_credits&name=${encodeURIComponent(actorName)}`, {}, 'GET');
        if (r.error) {
            headerDetail.innerHTML = `<div style="color:var(--accent3); padding:10px;">⚠️ ${t('notif_error')} : ${esc(r.error)}</div>`;
            return;
        }

        const actor = r.actor;
        const profileImg = actor.profile_path
        ? `<img src="${actor.profile_path}" style="width:75px; height:75px; border-radius:50%; object-fit:cover; border:2px solid var(--border);">`
        : `<div style="width:75px; height:75px; border-radius:50%; background:var(--bg3); display:flex; align-items:center; justify-content:center; font-size:28px;">👤</div>`;

        headerDetail.innerHTML = `
        ${profileImg}
        <div>
        <h2 style="margin:0 0 4px 0; color:var(--text); font-size:1.6em;">${esc(actor.name)}</h2>
        <div style="font-size:12px; color:var(--muted); font-family:var(--mono);">${esc(actor.known_for_department)}</div>
        </div>
        `;

        if (!r.credits || r.credits.length === 0) {
            creditsList.innerHTML = `<p style="color:var(--muted); padding:10px;">${t('no_result')}</p>`;
            return;
        }

        const groups = {};
        r.credits.forEach(mv => {
            const year = mv.year ? mv.year.toString().trim() : t('hub_upcoming_movies');
            if (!groups[year]) groups[year] = [];
            groups[year].push(mv);
        });

        const sortedYears = Object.keys(groups).sort((a, b) => {
            if (a === t('hub_upcoming_movies')) return -1;
            if (b === t('hub_upcoming_movies')) return 1;
            return parseInt(b, 10) - parseInt(a, 10);
        });

        let finalHTML = `
        <style>
        .actor-cards-container { display: flex; flex-direction: column; gap: 10px; }
        .actor-card { background: var(--bg2); padding: 10px; border-radius: 12px; border: 1px solid var(--border); display: flex; flex-direction: row; gap: 12px; align-items: center; position: relative; }
        .actor-card-poster { width: 60px; height: 90px; object-fit: cover; border-radius: 8px; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.05); }
        .actor-card-ph { width: 60px; height: 90px; background: var(--bg3); display: flex; align-items: center; justify-content: center; font-size: 24px; border-radius: 8px; color: var(--muted); flex-shrink: 0; border: 1px solid rgba(255,255,255,0.05); }
        .actor-card-content { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
        .actor-card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 4px; }
        .actor-card-title { font-size: 14px; font-weight: bold; color: var(--text); line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .actor-card-char { font-size: 12px; color: var(--muted); margin-bottom: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .actor-card-badge-wrap { flex-shrink: 0; }
        .actor-card-btn-wrap { display: flex; align-items: center; }
        .actor-card-btn { background: var(--bg3); color: var(--text); border: 1px solid var(--border); padding: 6px 12px; font-size: 12px; border-radius: 6px; cursor: pointer; transition: background 0.2s; }
        .actor-card-btn.primary { background: var(--accent); color: #000; font-weight: bold; border: none; }

        @media (min-width: 768px) {
            .actor-cards-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 16px; }
            .actor-card { flex-direction: column; padding: 8px; align-items: stretch; justify-content: space-between; gap: 0; transition: transform 0.2s, box-shadow 0.2s; }
            .actor-card:hover { transform: translateY(-4px); box-shadow: 0 10px 20px rgba(0,0,0,0.4); }
            .actor-card-poster, .actor-card-ph { width: 100%; aspect-ratio: 2/3; height: auto; border-radius: var(--radius); }
            .actor-card-ph { font-size: 32px; }
            .actor-card-content { margin-top: 8px; flex: 1; justify-content: space-between; }
            .actor-card-header { display: block; margin-bottom: 0; }
            .actor-card-title { font-size: 12px; white-space: nowrap; display: block; overflow: hidden; text-overflow: ellipsis; }
            .actor-card-char { margin-bottom: 0; font-size: 11px; margin-top: 2px; }
            .actor-card-badge-wrap { position: absolute; top: 14px; right: 14px; z-index: 10; box-shadow: 0 2px 10px rgba(0,0,0,0.5); border-radius: 6px; }
            .actor-card-btn-wrap { margin-top: 8px; }
            .actor-card-btn { width: 100%; }
        }
        </style>
        `;

        sortedYears.forEach(year => {
            const itemsHTML = groups[year].map(mv => {
                let statusBadge = '';
                let actionButton = '';

                if (mv.inLib) {
                    if (mv.hasFile) {
                        statusBadge = `<span style="background:var(--accent2); color:#000; font-size:9px; padding:3px 6px; border-radius:6px; font-weight:bold; display:inline-block;">✓ ${t('cal_avail_short')}</span>`;
                    } else {
                        statusBadge = `<span style="background:#ffa03c; color:#000; font-size:9px; padding:3px 6px; border-radius:6px; font-weight:bold; display:inline-block;">⏳ ${t('cal_wait_short')}</span>`;
                    }
                    const closeAndOpenAction = mv.media_type === 'movie'
                    ? `closeActorModal(); openMovieDetail(${mv.localId});`
                    : `closeActorModal(); openSerieDetail(${mv.localId});`;
                    actionButton = `<button class="actor-card-btn" onclick="${closeAndOpenAction}">${t('detail_back')}</button>`;
                } else {
                    statusBadge = `<span style="background:var(--bg3); border:1px solid var(--border); color:var(--muted); font-size:9px; padding:3px 6px; border-radius:6px; font-weight:bold; display:inline-block;">${t('badge_unmonitored')}</span>`;

                    const mediaTypeParam = mv.media_type === 'movie' ? 'movie' : 'serie';
                    const titleEsced = esc(mv.title).replace(/'/g, "\\'");
                    actionButton = `<button class="actor-card-btn primary" onclick="promptAddMedia('${mediaTypeParam}', ${mv.tmdbId}, '${titleEsced}', this, 'tmdb')">＋ ${t('films_add')}</button>`;
                }

                const posterImg = mv.poster
                ? `<img src="${mv.poster}" class="actor-card-poster" loading="lazy">`
                : `<div class="actor-card-ph">${mv.media_type === 'movie' ? '🎬' : '📺'}</div>`;

                return `
                <div class="actor-card">
                ${posterImg}
                <div class="actor-card-content">
                <div class="actor-card-header">
                <div class="actor-card-title" title="${esc(mv.title)}">${esc(mv.title)}</div>
                <div class="actor-card-badge-wrap">${statusBadge}</div>
                </div>
                <div class="actor-card-char" title="${mv.character ? esc(mv.character) : ''}">
                ${mv.character ? esc(mv.character) : `<span style="opacity:0.4;">${t('status_unknown')}</span>`}
                </div>
                <div class="actor-card-btn-wrap">
                ${actionButton}
                </div>
                </div>
                </div>
                `;
            }).join('');

            const sectionTitle = year === t('hub_upcoming_movies') ? `🚀 ${year}` : `📅 ${year}`;

            finalHTML += `
            <div class="actor-year-group">
            <h3 style="font-family: var(--mono); font-size: 15px; color: var(--accent); margin: 0 0 12px 0; border-bottom: 1px solid var(--border); padding-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
            <span>${sectionTitle}</span>
            <span style="font-size: 11px; color: var(--muted); font-weight: normal; font-family: var(--sans);">${groups[year].length}</span>
            </h3>
            <div class="actor-cards-container">
            ${itemsHTML}
            </div>
            </div>
            `;
        });

        creditsList.innerHTML = finalHTML;

    } catch (err) {
        headerDetail.innerHTML = `<div style="color:var(--accent3); padding:10px;">⚠️ ${t('notif_error')}</div>`;
    }
}

function closeActorModal() {
    const modal = document.getElementById('modal-actor');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    currentActiveActor = null;
}

document.addEventListener('click', e => {
    const modal = document.getElementById('modal-actor');
    if (modal && modal.style.display === 'block' && e.target === modal) {
        closeActorModal();
    }
});

// ── FONCTIONS DE CONFIGURATION DE LA CLÉ TMDB ────────────────────────────────
async function loadTmdbConfig() {
    const r = await api('get_tmdb_key', {}, 'GET');
    const input = document.getElementById('setting-tmdb-key');
    if (input && r.tmdb_api_key) input.value = r.tmdb_api_key;
}

async function saveTmdbConfig() {
    const key = document.getElementById('setting-tmdb-key').value.trim();
    const btn = document.getElementById('btn-save-tmdb');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ ' + t('settings_vapid_saving'); }

    const r = await api('save_tmdb_key', { key: key });
    if (btn) { btn.disabled = false; btn.textContent = t('settings_tmdb_save'); }

    if (r.ok) notify(t('notif_saved'), 'ok');
    else notify(r.error || t('notif_error'), 'err');
}

// ── CONFIGURATION PUSH VAPID ──
async function loadPushConfig() {
    const r = await api('get_push_config', {}, 'GET');
    if (document.getElementById('setting-vapid-email')) document.getElementById('setting-vapid-email').value = r.vapid_email || '';
    if (document.getElementById('setting-vapid-public')) document.getElementById('setting-vapid-public').value = r.vapid_public || '';
    if (document.getElementById('setting-vapid-private')) document.getElementById('setting-vapid-private').value = r.vapid_private || '';
}

// ── URL DU WEBHOOK SÉCURISÉ (Radarr/Sonarr) ──
async function loadWebhookUrl() {
    const el = document.getElementById('setting-webhook-url');
    if (!el) return;
    const r = await api('get_webhook_url', {}, 'GET');
    el.value = r.url || '';
}

function copyWebhookUrl() {
    const el = document.getElementById('setting-webhook-url');
    if (!el || !el.value) return;
    navigator.clipboard.writeText(el.value).then(() => notify(t('notif_saved'), 'ok'));
}

// ── JOURNAL D'ACTIVITÉ ───────────────────────────────────────────────────────
const ACTIVITY_ICONS = {
    add_movie: '🎬', add_serie: '📺', delete_media: '🗑️',
    bulk_monitor: '🔖', bulk_delete: '🗑️', bulk_torrent: '⬇️',
    add_torrent: '⬇️', save_app: '📦', delete_app: '📦',
    docker_action: '🐳', login_success: '🔓', login_failed: '⚠️',
};

function activityRelativeTime(ts) {
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return t('activity_just_now');
    if (diff < 3600) return Math.floor(diff / 60) + t('activity_min_ago');
    if (diff < 86400) return Math.floor(diff / 3600) + t('activity_hour_ago');
    if (diff < 604800) return Math.floor(diff / 86400) + t('activity_day_ago');
    return new Date(ts * 1000).toLocaleDateString(currentLocale());
}

async function loadActivityLog() {
    const container = document.getElementById('activity-log-list');
    if (!container) return;
    const r = await api('get_activity_log', { limit: 100 }, 'GET');
    const entries = r.entries || [];

    if (entries.length === 0) {
        container.innerHTML = `<p style="color:var(--muted); font-size:13px;">${t('activity_empty')}</p>`;
        return;
    }

    container.innerHTML = entries.map(e => {
        const icon = ACTIVITY_ICONS[e.type] || '•';
        const label = t('activity_' + e.type) || e.type;
        const detail = e.detail ? `<span style="color:var(--muted);">— ${esc(e.detail)}</span>` : '';
        return `
        <div style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border); font-size:13px;">
            <span style="font-size:16px; flex-shrink:0;">${icon}</span>
            <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                <strong>${esc(label)}</strong> ${detail}
            </span>
            <span style="color:var(--muted); font-size:11px; flex-shrink:0;">${activityRelativeTime(e.ts)}</span>
        </div>`;
    }).join('');
}

async function savePushConfig() {
    const email = document.getElementById('setting-vapid-email').value.trim();
    const pubKey = document.getElementById('setting-vapid-public').value.trim();
    const privKey = document.getElementById('setting-vapid-private').value.trim();

    const btn = document.getElementById('btn-save-push');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ ' + t('settings_vapid_saving'); }

    const r = await api('save_push_config', {
        vapid_email: email,
        vapid_public: pubKey,
        vapid_private: privKey
    });

    if (btn) { btn.disabled = false; btn.textContent = t('settings_vapid_save'); }

    if (r.ok) notify(t('settings_vapid_saved'), 'ok');
    else notify(r.error || t('notif_error'), 'err');
}

function openMobileSerieMenu() {
    const overlay = document.getElementById('mobile-serie-menu-overlay');
    const sheet = document.getElementById('mobile-serie-menu');
    if(overlay && sheet) {
        overlay.classList.add('open');
        setTimeout(() => sheet.classList.add('open'), 10);
        document.body.style.overflow = 'hidden';
    }
}

function closeMobileSerieMenu() {
    const overlay = document.getElementById('mobile-serie-menu-overlay');
    const sheet = document.getElementById('mobile-serie-menu');
    if(overlay && sheet) {
        sheet.classList.remove('open');
        setTimeout(() => {
            overlay.classList.remove('open');
            document.body.style.overflow = '';
        }, 300);
    }
}

document.addEventListener('click', e => {
    const overlay = document.getElementById('mobile-serie-menu-overlay');
    if (overlay && e.target === overlay) {
        closeMobileSerieMenu();
    }
});

// ── GESTION DU BOUTON RETOUR NATIF (NAVIGATEUR / TÉLÉPHONE) ───────────────────
window.addEventListener('popstate', (event) => {
    const modalMovie = document.getElementById('modal-movie');
    const modalSerie = document.getElementById('modal-serie');

    if (modalMovie && modalMovie.classList.contains('open')) {
        closeMovieDetail(true);
        return;
    }

    if (modalSerie && modalSerie.classList.contains('open')) {
        const serieContent = document.getElementById('serie-detail-content');
        if (serieContent && serieContent.dataset.mainHtml) {
            closeSeasonView();
            history.pushState({ modal: 'serie' }, '', window.location.href);
        } else {
            closeSerieDetail(true);
        }
        return;
    }

    const hash = window.location.hash;
    if (hash === '#hub_films') {
        switchHomeTab('movies', null, false);
        return;
    } else if (hash === '#hub_series') {
        switchHomeTab('series', null, false);
        return;
    } else if (hash === '#dashboard' || hash === '') {
        if (document.getElementById('home-tab-home')) {
            switchHomeTab('home', null, false);
            return;
        }
    }

    toggleListElements(true);
});

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getTransmissionStatus(code) {
    const statuses = {
        0: { text: t('dl_paused'), color: 'var(--muted)' },
        1: { text: t('status_check_wait'), color: '#ffa03c' },
        2: { text: t('status_checking'), color: '#ffa03c' },
        3: { text: t('status_dl_wait'), color: '#ffa03c' },
        4: { text: t('status_downloading'), color: 'var(--sonarr)' }, /* 👈 Bleu : En cours de DL */
        5: { text: t('status_seed_wait'), color: 'var(--muted)' },
        6: { text: t('status_seeding'), color: 'var(--accent)' }      /* 👈 Vert doux : Terminé / En Seed */
    };
    return statuses[code] || { text: t('status_unknown'), color: 'var(--muted)' };
}

// ── TÉLÉCHARGEMENTS ──────────────────────────────────────────────────────────
let dlSortField = 'addedDate', dlSortReverse = false, dlTorrentsCache = [], dlFilterTab = 'all';

function formatEta(seconds) {
    if (!seconds || seconds < 0) return '∞';
    if (seconds < 60) return seconds + 's';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'min';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h' + Math.floor((seconds % 3600) / 60) + 'min';
    return Math.floor(seconds / 86400) + 'j';
}

function formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(currentLocale(), { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function sortTorrents(torrents) {
    const sorted = [...torrents].sort((a, b) => {
        switch (dlSortField) {
            case 'name':        return (a.name || '').localeCompare(b.name || '');
            case 'percentDone': return (a.percentDone || 0) - (b.percentDone || 0);
            case 'totalSize':   return (a.totalSize || 0) - (b.totalSize || 0);
            case 'status':      return (a.status || 0) - (b.status || 0);
            case 'uploadRatio': return (a.uploadRatio || 0) - (b.uploadRatio || 0);
            case 'addedDate':
            default:            return (a.addedDate || 0) - (b.addedDate || 0);
        }
    });
    return dlSortReverse ? sorted.reverse() : sorted;
}

function filterTorrents(torrents, tab) {
    switch (tab) {
        case 'active':   return torrents.filter(t => [3, 4].includes(t.status));
        case 'seeding':  return torrents.filter(t => [5, 6].includes(t.status));
        case 'paused':   return torrents.filter(t => t.status === 0);
        case 'finished': return torrents.filter(t => t.percentDone >= 1 && t.status === 0);
        default:         return torrents;
    }
}

function updateDlBadges(torrents) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };
    set('dl-count',          torrents.length);
    set('dl-count-active',   torrents.filter(t => [3,4].includes(t.status)).length || '');
    set('dl-count-seeding',  torrents.filter(t => [5,6].includes(t.status)).length || '');
    set('dl-count-paused',   torrents.filter(t => t.status === 0 && t.percentDone < 1).length || '');
    set('dl-count-finished', torrents.filter(t => t.percentDone >= 1 && t.status === 0).length || '');
}

function switchDlTab(tab, button) {
    dlFilterTab = tab;
    if (button && button.parentNode) {
        button.parentNode.querySelectorAll('.hub-btn').forEach(b => b.classList.remove('active'));
        button.classList.add('active');
    }
    renderTorrents();
}

function getVisibleTorrents() {
    const searchQuery = (document.getElementById('dl-search')?.value || '').toLowerCase();
    let torrents = filterTorrents(dlTorrentsCache, dlFilterTab);
    if (searchQuery) {
        torrents = torrents.filter(t => (t.name || '').toLowerCase().includes(searchQuery));
    }
    return sortTorrents(torrents);
}

function renderTorrents() {
    const container = document.getElementById('downloads-list');
    updateDlBadges(dlTorrentsCache);

    const torrents = getVisibleTorrents();

    if (torrents.length === 0) {
        // J'ai légèrement adapté le message vide pour que ça ait du sens si la recherche ne trouve rien
        container.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><h3>Aucun torrent trouvé</h3></div>`;
        return;
    }

    let html = '';
    torrents.forEach(tInfo => {
        const status = getTransmissionStatus(tInfo.status);
        const percent = (tInfo.percentDone * 100).toFixed(1);
        const size = formatBytes(tInfo.totalSize);
        const dlSpeed = tInfo.rateDownload > 0 ? `↓ ${formatBytes(tInfo.rateDownload)}/s` : '';
        const upSpeed = tInfo.rateUpload > 0 ? `↑ ${formatBytes(tInfo.rateUpload)}/s` : '';
        const isPaused = tInfo.status === 0;

        const btnPlayPause = isPaused
        ? `<button class="btn-ep" onclick="event.stopPropagation(); torrentAction('torrent-start', '${tInfo.id}')" title="${t('torrent_resume')}">▶</button>`
        : `<button class="btn-ep" onclick="event.stopPropagation(); torrentAction('torrent-stop', '${tInfo.id}')" title="${t('torrent_pause')}">⏸</button>`;

        const bulkCheckbox = `
        <div class="bulk-select-checkbox ${bulkSelectMode ? 'visible' : ''}" style="top:8px; left:8px;" onclick="event.stopPropagation(); toggleBulkSelect('${tInfo.id}')">
            <input type="checkbox" ${bulkSelectedIds.has(tInfo.id) ? 'checked' : ''} readonly>
        </div>`;

        html += `
        <div class="card ${bulkSelectedIds.has(tInfo.id) ? 'bulk-selected' : ''}"
        style="padding:15px; border-left:4px solid ${status.color}; cursor:pointer; position:relative; -webkit-touch-callout:none; user-select:none;"
        ontouchstart="startLongPress('${tInfo.id}')"
        ontouchend="cancelLongPress()"
        ontouchcancel="cancelLongPress()"
        oncontextmenu="if(window.preventNextClick) return false;"
        onclick="if(window.preventNextClick){ window.preventNextClick=false; return; } ${bulkSelectMode ? `toggleBulkSelect('${tInfo.id}')` : `openTorrentDetail('${tInfo.id}')`}">
        ${bulkCheckbox}
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
        <div style="font-weight:600; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:15px; ${bulkSelectMode ? 'padding-left:34px;' : ''}">${esc(tInfo.name)}</div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
        ${btnPlayPause}
        <button class="btn-ep" style="color:var(--accent3); border-color:var(--accent3);" onclick="event.stopPropagation(); confirmDeleteTorrent('${tInfo.id}', '${esc(tInfo.name).replace(/'/g,"\'")}')">🗑</button>
        </div>
        </div>

        <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--muted); margin-bottom:6px;">
        <span style="color:${status.color}; font-weight:600;">${status.text}${tInfo.errorString ? ' ⚠️' : ''}</span>
        <span>${percent}% / ${size}</span>
        </div>

        <div class="progress-bar" style="height:6px; background:var(--bg3); margin-bottom:6px;">
        <div class="progress-fill" style="width:${percent}%; background:${status.color}; transition:width 0.5s;"></div>
        </div>

        <div style="display:flex; gap:15px; font-family:var(--mono); font-size:10px; color:var(--muted);">
        <span style="color:var(--accent);">${dlSpeed}</span>
        <span style="color:var(--accent2);">${upSpeed}</span>
        <span style="margin-left:auto;">Ratio: ${(tInfo.uploadRatio || 0).toFixed(2)}</span>
        ${tInfo.eta > 0 ? `<span>ETA: ${formatEta(tInfo.eta)}</span>` : ''}
        </div>
        </div>`;
    });

    container.innerHTML = html;
}

let _dlLastErrorShown = null;
async function loadDownloads() {
    if (typeof CURRENT_PAGE === 'undefined' || CURRENT_PAGE !== 'downloads') return;

    const r = await api('get_downloads', {}, 'GET');
    if (!r.torrents) {
        if (r.error && r.error !== _dlLastErrorShown) {
            notify(r.error, 'err');
            _dlLastErrorShown = r.error;
        }
        return;
    }
    _dlLastErrorShown = null;

    dlTorrentsCache = r.torrents;
    document.getElementById('dl-count').textContent = r.torrents.length;
    renderTorrents();
}

// ── MODALE AJOUTER UN TORRENT ─────────────────────────────────────────────────
function openAddTorrentModal() {
    let modal = document.getElementById('modal-add-torrent');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-add-torrent';
        modal.className = 'modal-bg';
        modal.style.zIndex = '10002';

        modal.innerHTML = `
        <div class="modal-box" style="width: 400px; max-width: 90%; max-height: 90vh; display: flex; flex-direction: column; padding: 0; border-radius: 16px; overflow: hidden; background: var(--bg2);">
        <h3 style="margin:0; border-bottom:1px solid var(--border); padding: 20px; flex-shrink: 0; background: var(--bg2);">${t('torrent_add_title')}</h3>
        <div style="padding: 20px; overflow-y: auto; flex: 1;">
        <div class="form-row">
        <label style="font-size:12px; font-weight:bold; color:var(--muted); text-transform:uppercase;">${t('torrent_file_label')}</label>
        <div style="display:flex; align-items:center; gap:10px; width:100%; padding:10px; background:var(--bg3); border:1px solid var(--border); border-radius:6px;">
        <button type="button" class="btn-sm" onclick="document.getElementById('torrent-upload-file').click()" style="flex-shrink:0;">${t('file_choose')}</button>
        <span id="torrent-file-name" style="color:var(--muted); font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${t('file_none_chosen')}</span>
        <input type="file" id="torrent-upload-file" accept=".torrent" style="display:none;" onchange="document.getElementById('torrent-file-name').textContent = this.files.length ? this.files[0].name : t('file_none_chosen')">
        </div>
        </div>
        <div style="text-align:center; margin:15px 0; color:var(--muted); font-size:12px; font-weight:bold;">${t('word_or')}</div>
        <div class="form-row">
        <label style="font-size:12px; font-weight:bold; color:var(--muted); text-transform:uppercase;">${t('torrent_magnet_label')}</label>
        <input type="text" id="torrent-magnet-link" placeholder="magnet:?xt=urn:btih:..." style="width:100%; padding:10px; background:var(--bg3); border:1px solid var(--border); color:var(--text); border-radius:6px;">
        </div>
        <div style="display:flex; gap:10px; margin-top:25px; flex-shrink:0;">
        <button class="btn-primary" onclick="submitAddTorrent()" style="flex:1;">＋ ${t('torrent_add_btn')}</button>
        <button class="btn-detail secondary" onclick="document.getElementById('modal-add-torrent').classList.remove('open')">${t('auth_cancel_btn')}</button>
        </div>
        </div>
        </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
    }

    document.getElementById('torrent-upload-file').value = '';
    document.getElementById('torrent-file-name').textContent = t('file_none_chosen');
    document.getElementById('torrent-magnet-link').value = '';

    modal.classList.add('open');
}

async function submitAddTorrent() {
    const fileInput = document.getElementById('torrent-upload-file');
    const magnetInput = document.getElementById('torrent-magnet-link').value.trim();

    const fd = new FormData();
    fd.append('action', 'add_torrent');

    if (fileInput.files.length > 0) {
        fd.append('torrent_file', fileInput.files[0]);
    } else if (magnetInput) {
        fd.append('magnet', magnetInput);
    } else {
        notify(t('torrent_select_or_paste'), 'err');
        return;
    }

    document.getElementById('modal-add-torrent').classList.remove('open');
    notify(t('torrent_sending'), 'ok');

    try {
        const response = await fetch('api.php', { method: 'POST', body: fd });
        const res = await response.json();

        if (res.ok) {
            notify(t('torrent_added'), 'ok');
            loadDownloads();
        } else {
            notify(res.error || t('notif_error'), 'err');
        }
    } catch (e) {
        notify(t('error_connection'), 'err');
    }
}

function setDlSort(field) {
    if (dlSortField === field) {
        dlSortReverse = !dlSortReverse;
    } else {
        dlSortField = field;
        dlSortReverse = false;
    }
    const sel = document.getElementById('dl-sort-select');
    if (sel) sel.value = field;
    renderTorrents();
}

// ── GESTION DES FICHIERS TORRENT (ARBORESCENCE & COCHES) ─────────────────────
function buildFileTree(files, stats) {
    const root = { name: 'root', type: 'dir', children: {}, size: 0, completed: 0, wantedFiles: 0, totalFiles: 0 };

    files.forEach((f, i) => {
        const parts = f.name.split('/');
        let current = root;
        const isWanted = stats[i] ? stats[i].wanted : true;
        const bytesCompleted = stats[i] ? stats[i].bytesCompleted : 0;

        root.size += f.length || 0;
        root.completed += bytesCompleted;
        root.totalFiles++;
        if (isWanted) root.wantedFiles++;

        for (let j = 0; j < parts.length; j++) {
            const part = parts[j];
            const isFile = (j === parts.length - 1);

            if (!current.children[part]) {
                current.children[part] = {
                    name: part,
                    type: isFile ? 'file' : 'dir',
                    children: {},
                    fileIndex: isFile ? i : -1,
                    size: 0,
                    completed: 0,
                    wantedFiles: 0,
                    totalFiles: 0,
                    wanted: isWanted
                };
            }

            const nextNode = current.children[part];
            if (!isFile) {
                nextNode.size += f.length || 0;
                nextNode.completed += bytesCompleted;
                nextNode.totalFiles++;
                if (isWanted) nextNode.wantedFiles++;
            } else {
                nextNode.size = f.length || 0;
                nextNode.completed = bytesCompleted;
                nextNode.totalFiles = 1;
                nextNode.wantedFiles = isWanted ? 1 : 0;
            }

            current = nextNode;
        }
    });

    const rootKeys = Object.keys(root.children);
    if (rootKeys.length === 1 && root.children[rootKeys[0]].type === 'dir') {
        return root.children[rootKeys[0]];
    }

    return root;
}

function renderFileTreeHtml(node, torrentId, depth = 0) {
    let html = '';
    const sortedKeys = Object.keys(node.children).sort((a, b) => {
        const childA = node.children[a];
        const childB = node.children[b];
        if (childA.type !== childB.type) return childA.type === 'dir' ? -1 : 1;
        return a.localeCompare(b);
    });

    sortedKeys.forEach(key => {
        const child = node.children[key];
        const paddingLeft = depth > 0 ? 15 : 0;
        const pct = child.size > 0 ? (child.completed / child.size * 100).toFixed(0) : 0;

        let checkboxState = '';
        if (child.type === 'file') {
            checkboxState = child.wanted ? 'checked' : '';
        } else {
            if (child.wantedFiles === child.totalFiles) checkboxState = 'checked';
            else if (child.wantedFiles > 0) checkboxState = 'indeterminate';
        }

        const isIndeterminate = child.type === 'dir' && child.wantedFiles > 0 && child.wantedFiles < child.totalFiles;
        const fileIdAttr = child.type === 'file' ? `data-file-index="${child.fileIndex}"` : '';
        const dirAttr = child.type === 'dir' ? `data-is-dir="true"` : '';

        const checkboxHtml = `
        <input type="checkbox" class="torrent-file-checkbox"
        data-torrent-id="${torrentId}"
        ${fileIdAttr} ${dirAttr}
        ${checkboxState === 'checked' ? 'checked' : ''}
        ${isIndeterminate ? 'data-indeterminate="true"' : ''}
        onclick="event.stopPropagation()"
        onchange="toggleTorrentFileWanted(event, '${torrentId}')"
        style="margin:0; width:16px; height:16px; accent-color:var(--accent); cursor:pointer;">
        `;

        if (child.type === 'dir') {
            const folderUid = 'folder_' + Math.random().toString(36).substr(2, 9);
            html += `
            <div style="padding-left:${paddingLeft}px; margin-bottom:4px;">
            <div style="display:flex; align-items:center; gap:10px; padding:6px 8px; cursor:pointer; border-radius:6px; transition:background 0.2s;" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='transparent'" onclick="const e=document.getElementById('${folderUid}'); e.style.display=e.style.display==='none'?'block':'none'; const i=document.getElementById('icon_${folderUid}'); i.style.transform=i.style.transform==='rotate(90deg)'?'rotate(0deg)':'rotate(90deg)';">
            <div style="display:flex; align-items:center; justify-content:center;" onclick="event.stopPropagation()">
            ${checkboxHtml}
            </div>
            <span id="icon_${folderUid}" style="transition:transform 0.2s; color:var(--muted); font-size:12px; display:inline-block;">▶</span>
            <span style="font-size:16px;">📁</span>
            <div style="font-size:13px; font-weight:bold; color:var(--text); flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(child.name)}</div>
            <div style="font-size:11px; color:var(--muted);">${formatBytes(child.size)}</div>
            </div>
            <div id="${folderUid}" style="display:none; border-left:1px solid var(--border); margin-left:18px; margin-top:4px;">
            ${renderFileTreeHtml(child, torrentId, depth + 1)}
            </div>
            </div>`;
        } else {
            const isCompleted = child.completed === child.size && child.size > 0;
            const titleColor = isCompleted ? 'var(--accent)' : (child.wanted ? 'var(--text)' : 'var(--muted)');

            html += `
            <div class="torrent-file-row" style="display:flex; align-items:center; gap:10px; padding:6px 8px; padding-left:${paddingLeft + 15}px; border-radius:6px; transition:background 0.2s;" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='transparent'">
            <div style="display:flex; align-items:center; justify-content:center;">
            ${checkboxHtml}
            </div>
            <span style="font-size:16px;">📄</span>
            <div style="flex:1; min-width:0;">
            <div class="torrent-file-name" style="font-size:12px; color:${titleColor}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-decoration:${child.wanted ? 'none' : 'line-through'};" title="${esc(child.name)}">${esc(child.name)}</div>
            <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--muted); margin-top:2px;">
            <span>${formatBytes(child.size)}</span>
            <span style="color:${isCompleted ? 'var(--accent)' : 'var(--muted)'};">${pct}%</span>
            </div>
            </div>
            </div>`;
        }
    });

    return html;
}

let wantedUpdateTimeout = null;

function toggleTorrentFileWanted(event, torrentId) {
    const cb = event.target;
    const isChecked = cb.checked;

    if (cb.dataset.isDir) {
        const container = cb.closest('div[style*="padding-left"]').querySelector('div[id^="folder_"]');
        if (container) {
            container.querySelectorAll('.torrent-file-checkbox').forEach(childCb => {
                childCb.checked = isChecked;
                childCb.indeterminate = false;

                if (!childCb.dataset.isDir) {
                    const textDiv = childCb.closest('.torrent-file-row').querySelector('.torrent-file-name');
                    if (textDiv) {
                        textDiv.style.textDecoration = isChecked ? 'none' : 'line-through';
                        textDiv.style.color = isChecked ? 'var(--text)' : 'var(--muted)';
                    }
                }
            });
        }
    } else {
        const textDiv = cb.closest('.torrent-file-row').querySelector('.torrent-file-name');
        if (textDiv) {
            textDiv.style.textDecoration = isChecked ? 'none' : 'line-through';
            textDiv.style.color = isChecked ? 'var(--text)' : 'var(--muted)';
        }
    }

    const detailModal = document.getElementById('modal-torrent-detail');
    if (detailModal) {
        const allDirs = detailModal.querySelectorAll('.torrent-file-checkbox[data-is-dir="true"]');
        Array.from(allDirs).reverse().forEach(dirCb => {
            const container = dirCb.closest('div[style*="padding-left"]').querySelector('div[id^="folder_"]');
            if (container) {
                const fileCbs = Array.from(container.querySelectorAll('.torrent-file-checkbox:not([data-is-dir="true"])'));
                if (fileCbs.length > 0) {
                    const checkedCount = fileCbs.filter(c => c.checked).length;
                    if (checkedCount === 0) {
                        dirCb.checked = false;
                        dirCb.indeterminate = false;
                    } else if (checkedCount === fileCbs.length) {
                        dirCb.checked = true;
                        dirCb.indeterminate = false;
                    } else {
                        dirCb.checked = false;
                        dirCb.indeterminate = true;
                    }
                }
            }
        });
    }

    clearTimeout(wantedUpdateTimeout);
    wantedUpdateTimeout = setTimeout(async () => {
        if (!detailModal) return;
        const allFileCbs = detailModal.querySelectorAll('.torrent-file-checkbox:not([data-is-dir="true"])');
        const wanted = [];
        const unwanted = [];

        allFileCbs.forEach(c => {
            const idx = parseInt(c.dataset.fileIndex, 10);
            if (!isNaN(idx)) {
                if (c.checked) wanted.push(idx);
                else unwanted.push(idx);
            }
        });

        await api('torrent_set_files', {
            id: torrentId,
            wanted: JSON.stringify(wanted),
                  unwanted: JSON.stringify(unwanted)
        });

        if (typeof loadDownloads === 'function') loadDownloads();
    }, 600);
}

// ── MODAL DÉTAIL TORRENT ──────────────────────────────────────────────────────
async function openTorrentDetail(id) {
    const tInfo = dlTorrentsCache.find(x => x.id === id);
    if (!tInfo) return;

    if (!tInfo.files || tInfo.files.length === 0) {
        const filesRes = await api('get_torrent_files', { id: tInfo.id }, 'GET');
        tInfo.files = filesRes.files || [];
        tInfo.fileStats = filesRes.fileStats || [];
    }

    const status = getTransmissionStatus(tInfo.status);
    const percent = (tInfo.percentDone * 100).toFixed(1);
    const eta = tInfo.eta > 0 ? formatEta(tInfo.eta) : '∞';
    const ratio = (tInfo.uploadRatio || 0).toFixed(3);
    const seeders = tInfo.peersSendingToUs || 0;
    const leechers = tInfo.peersGettingFromUs || 0;
    const totalPeers = tInfo.peersConnected || 0;
    const downloaded = formatBytes(tInfo.downloadedEver || 0);
    const uploaded = formatBytes(tInfo.uploadedEver || 0);
    const size = formatBytes(tInfo.totalSize || 0);

    let trackersStr = '-';
    if (tInfo.trackers && tInfo.trackers.length > 0) {
        trackersStr = tInfo.trackers.map(t => {
            try { return new URL(t.announce).hostname; } catch(e) { return t.announce; }
        }).filter((v, i, a) => a.indexOf(v) === i).join(', ');
    } else if (tInfo.tracker) {
        trackersStr = tInfo.tracker;
    }

    let addedDateStr = '-';
    if (tInfo.addedDate && tInfo.addedDate > 0) {
        const d = new Date(tInfo.addedDate * 1000);
        addedDateStr = d.toLocaleDateString(currentLocale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    const tree = buildFileTree(tInfo.files || [], tInfo.fileStats || []);
    const filesHtml = renderFileTreeHtml(tree, tInfo.id);

    const isPaused = (tInfo.status === 0);
    const bottomActionsHtml = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; padding-top:10px; border-top:1px solid var(--border);">
    <button onclick="torrentAction('torrent-${isPaused ? 'start' : 'stop'}', '${tInfo.id}'); closeTorrentDetail();"
    style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:10px; border-radius:var(--radius); cursor:pointer; font-weight:600;">
    ${isPaused ? '▶ ' + t('torrent_resume') : '⏸ ' + t('torrent_pause')}
    </button>
    <button onclick="confirmDeleteTorrent('${tInfo.id}', '${esc(tInfo.name).replace(/'/g, "\\'")}')"
    style="background:rgba(255,93,143,0.1); border:1px solid rgba(255,93,143,0.3); color:var(--accent3); padding:10px; border-radius:var(--radius); cursor:pointer; font-weight:600;">
    🗑 ${t('detail_delete')}
    </button>
    </div>`;

    const content = `
    <div style="padding:20px;">
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; gap:10px;">
    <h3 style="color:var(--accent); font-family:var(--mono); font-size:14px; line-height:1.4; margin:0; flex:1; min-width:0; overflow-wrap:anywhere; word-break:break-word;">${esc(tInfo.name)}</h3>
    <button onclick="closeTorrentDetail()" style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:6px 12px; border-radius:var(--radius); cursor:pointer; flex-shrink:0;">✕</button>
    </div>

    <div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap;">
    <span style="padding:4px 10px; border-radius:20px; font-size:11px; font-weight:700; background:${status.color}22; color:${status.color}; border:1px solid ${status.color}44;">${status.text}</span>
    <span style="padding:4px 10px; border-radius:20px; font-size:11px; background:var(--bg3); color:var(--muted);">${percent}%</span>
    </div>

    <div style="height:6px; background:var(--bg3); border-radius:3px; margin-bottom:16px;">
    <div style="height:6px; width:${percent}%; background:${status.color}; border-radius:3px; transition:width 0.5s;"></div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px 10px; margin-bottom:24px; padding:16px; background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius);">
    <div>
    <div style="font-size:11px; color:var(--muted); margin-bottom:4px; display:flex; align-items:center; gap:6px;">⬇️ TÉLÉCHARGÉ</div>
    <div style="font-size:14px; font-weight:600;">${downloaded} / ${size}</div>
    </div>
    <div>
    <div style="font-size:11px; color:var(--muted); margin-bottom:4px; display:flex; align-items:center; gap:6px;">⬆️ ENVOYÉ (RATIO)</div>
    <div style="font-size:14px; font-weight:600;">${uploaded} (${ratio})</div>
    </div>
    <div>
    <div style="font-size:11px; color:var(--muted); margin-bottom:4px; display:flex; align-items:center; gap:6px;">⏱️ TEMPS RESTANT</div>
    <div style="font-size:14px; font-weight:600;">${eta}</div>
    </div>
    <div>
    <div style="font-size:11px; color:var(--muted); margin-bottom:4px; display:flex; align-items:center; gap:6px;">👥 PAIRS (S/L)</div>
    <div style="font-size:14px; font-weight:600;">${totalPeers} (${seeders} / ${leechers})</div>
    </div>
    <div>
    <div style="font-size:11px; color:var(--muted); margin-bottom:4px; display:flex; align-items:center; gap:6px;">📅 AJOUTÉ LE</div>
    <div style="font-size:14px; font-weight:600;">${addedDateStr}</div>
    </div>
    <div style="min-width:0;">
    <div style="font-size:11px; color:var(--muted); margin-bottom:4px; display:flex; align-items:center; gap:6px;">🌐 TRACKER</div>
    <div style="font-size:14px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${trackersStr}">${trackersStr}</div>
    </div>
    </div>

    <h4 style="font-size:13px; color:var(--text); margin:20px 0 10px 0; display:flex; justify-content:space-between; align-items:center;">
    <span>${t('torrent_files', { n: tInfo.files ? tInfo.files.length : 0 })}</span>
    </h4>
    <div style="background:var(--bg3); border:1px solid var(--border); border-radius:var(--radius); padding:10px; max-height:280px; overflow-y:auto; margin-bottom:16px;">
    ${filesHtml}
    </div>

    ${bottomActionsHtml}
    </div>`;

    let modal = document.getElementById('modal-torrent-detail');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-torrent-detail';
        modal.className = 'modal-bg';
        modal.addEventListener('click', e => { if (e.target === modal) closeTorrentDetail(); });
        document.body.appendChild(modal);
    }

    modal.innerHTML = `<div style="background:var(--bg); border-radius:16px; width:100%; max-width:600px; margin:auto; box-shadow:0 10px 40px rgba(0,0,0,0.5);">${content}</div>`;
    modal.style.display = 'flex';
    modal.classList.add('open');

    setTimeout(() => {
        modal.querySelectorAll('.torrent-file-checkbox[data-indeterminate="true"]').forEach(cb => { cb.indeterminate = true; });
    }, 10);
}

function closeTorrentDetail() {
    const modal = document.getElementById('modal-torrent-detail');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }
}

// ── CONFIRMATION SUPPRESSION ──────────────────────────────────────────────────
function confirmDeleteTorrent(id, name) {
    const modal = document.getElementById('modal-confirm');
    document.getElementById('confirm-title').textContent = t('torrent_delete_title');

    document.getElementById('confirm-message').innerHTML = `
    ${t('torrent_delete_msg', {name: esc(name)})}<br><br>
    <label style="display:flex; align-items:center; gap:8px; cursor:pointer; background:var(--bg3); padding:10px; border-radius:8px;">
    <input type="checkbox" id="delete-files-checkbox" style="width:16px; height:16px;">
    <span style="font-size:13px;">${t('confirm_delete_files')}</span>
    </label>
    <br>
    <span style="color:var(--accent3); font-size:11px;">⚠️ ${t('torrent_irreversible')}</span>`;

    const btn = document.getElementById('btn-confirm-action');
    btn.textContent = t('torrent_delete_confirm');

    btn.onclick = async () => {
        const deleteFiles = document.getElementById('delete-files-checkbox').checked;

        closeConfirmModal();
        closeTorrentDetail(); // 👈 LIGNE À AJOUTER ICI POUR FERMER LE DÉTAIL

        await api('torrent_action', {
            method: 'torrent-remove',
            id: id,
            'delete-local-data': deleteFiles
        });
        loadDownloads();
    };

    if (modal) modal.classList.add('open');
}

// ── ACTIONS (Boutons) ─────────────────────────────────────────────────────────
async function torrentAction(method, id) {
    await api('torrent_action', { method: method, id: id });
    loadDownloads();
}

async function torrentActionGlobale(method) {
    await api('torrent_action', { method: method });
    loadDownloads();
}

// ── DOCKER (Mini-Portainer) ───────────────────────────────────────────────────
let _dockerAllData = [];

async function loadContainers() {
    const grid = document.getElementById('docker-grid');
    if (!grid) return;
    grid.innerHTML = `<div style="text-align:center; padding:40px; color:var(--muted); grid-column: 1 / -1;">⏳ ${t('docker_loading')}</div>`;

    const res = await api('get_containers', {}, 'GET');

    if (res.error) {
        grid.innerHTML = `<div class="empty-state"><div class="icon">🐳</div><h3>${t('docker_error')}</h3><p>${esc(res.error)}</p></div>`;
        return;
    }

    _dockerAllData = res.containers || [];
    document.getElementById('docker-count').textContent = _dockerAllData.length;
    renderDockerContainers();
}

function filterDocker() { renderDockerContainers(); }

function renderDockerContainers() {
    const grid = document.getElementById('docker-grid');
    if (!grid) return;

    const q = (document.getElementById('docker-search')?.value || '').toLowerCase();
    const filter = document.getElementById('docker-filter')?.value || 'all';

    const filtered = _dockerAllData.filter(c => {
        if (q && !c.name.toLowerCase().includes(q) && !c.image.toLowerCase().includes(q)) return false;
        if (filter === 'running' && c.state !== 'running') return false;
        if (filter === 'stopped' && c.state === 'running') return false;
        return true;
    });

    grid.innerHTML = '';

    if (filtered.length === 0) {
        grid.innerHTML = `<div style="text-align:center; padding:40px; color:var(--muted); grid-column: 1 / -1;">${t('docker_no_result')}</div>`;
        return;
    }

    filtered.forEach(c => {
        let dotColor = 'var(--muted)';
        let stateText = t('docker_unknown');
        let actionBtns = '';

        if (c.state === 'running') {
            dotColor = 'var(--accent2)';
            stateText = t('docker_running');
            actionBtns = `
            <button onclick="showDockerStats('${c.id}', '${esc(c.name)}')" style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer;" title="Stats">📊</button>
            <button onclick="showDockerLogs('${c.id}', '${esc(c.name)}')" style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer;" title="Logs">📝</button>
            <button onclick="doDockerAction('${c.id}', 'restart', this)" style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer;" title="${t('docker_restart')}">🔄</button>
            <button onclick="doDockerAction('${c.id}', 'stop', this)" style="background:rgba(255,93,143,0.1); border:1px solid rgba(255,93,143,0.3); color:var(--accent3); padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer;" title="${t('docker_stop')}">⏹</button>
            `;
        } else if (c.state === 'exited' || c.state === 'created') {
            dotColor = 'var(--accent3)';
            stateText = t('docker_stopped');
            actionBtns = `
            <button onclick="showDockerLogs('${c.id}', '${esc(c.name)}')" style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer;" title="Logs">📝</button>
            <button onclick="doDockerAction('${c.id}', 'start', this)" style="background:rgba(93,255,214,0.1); border:1px solid rgba(93,255,214,0.3); color:var(--accent2); padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer;" title="${t('docker_start')}">▶️ ${t('docker_start')}</button>
            `;
        }

        grid.innerHTML += `
        <div style="background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius); padding:16px; display:flex; flex-direction:column; gap:12px;">
        <div style="font-weight:bold; font-size:16px; color:var(--text); display:flex; align-items:center; gap:8px;">
        <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${dotColor}; box-shadow: 0 0 8px ${dotColor}; flex-shrink:0;"></span>
        <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block; flex:1;" title="${esc(c.name)}">${esc(c.name)}</span>
        </div>
        <div style="font-size:12px; color:var(--muted); font-family:var(--mono);">
        <div style="margin-bottom:4px;">📦 ${esc(c.image.split(':')[0])}</div>
        <div>⏱️ ${esc(c.status)}</div>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px;">
        ${actionBtns}
        </div>
        </div>`;
    });
}

async function doDockerAction(id, cmd, btn) {
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '⏳';
    btn.disabled = true;

    const r = await api('docker_action', { id: id, cmd: cmd });

    if (r.ok) {
        notify(t('docker_cmd_ok'), 'ok');
        setTimeout(() => loadContainers(), 1000);
    } else {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
        notify(r.error || t('docker_cmd_error'), 'err');
    }
}

function showDockerLogs(id, name) {
    let modal = document.getElementById('modal-docker-logs');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-docker-logs';
        modal.className = 'modal-bg';
        modal.style.zIndex = '10005';
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { 
            if (e.target === modal) {
                modal.classList.remove('open');
                if (window.dockerLogsInterval) clearInterval(window.dockerLogsInterval);
            }
        });
    }

    modal.innerHTML = `
    <div class="modal-box" style="width: 800px; max-width: 95%; max-height: 90vh; display: flex; flex-direction: column; padding: 0; overflow: hidden; background: var(--bg2); border-radius: 16px;">
    <h3 style="margin:0; border-bottom:1px solid var(--border); padding: 15px 20px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0; background: var(--bg2);">
    <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📝 ${t('docker_logs_title', {name: esc(name)})}</span>
    <div style="display:flex; align-items:center; gap:10px;">
        <span id="docker-logs-spinner" style="font-size:12px; color:var(--muted); opacity:0; transition:opacity 0.2s; animation: syncPulse 1.2s infinite;">↻</span>
        <button onclick="document.getElementById('modal-docker-logs').classList.remove('open'); if(window.dockerLogsInterval) clearInterval(window.dockerLogsInterval);" class="btn-circle" style="flex-shrink:0; background:var(--bg3); border:1px solid var(--border); color:var(--text); width:32px; height:32px; border-radius:8px; cursor:pointer;">✕</button>
    </div>
    </h3>
    <div style="padding: 20px; overflow-y: auto; flex: 1; display: flex; flex-direction: column;">
    <div id="docker-logs-content" style="background:var(--bg3); color:var(--text); border:1px solid var(--border); padding:15px; border-radius:8px; font-family:var(--mono); font-size:12px; flex:1; overflow-y:auto; white-space:pre-wrap; word-break:break-all;">
    ⏳ ${t('docker_logs_loading')}
    </div>
    </div>
    </div>`;
    modal.classList.add('open');
    
    if (window.dockerLogsInterval) clearInterval(window.dockerLogsInterval);

    const fetchLogs = () => {
        if (!document.getElementById('modal-docker-logs').classList.contains('open')) {
            clearInterval(window.dockerLogsInterval);
            return;
        }
        
        const spinner = document.getElementById('docker-logs-spinner');
        if (spinner) spinner.style.opacity = '1';

        api('docker_logs&id=' + id, {}, 'GET').then(r => {
            if (spinner) spinner.style.opacity = '0';
            const content = document.getElementById('docker-logs-content');
            if (!content) return;
            
            // Auto-scroll si on est déjà en bas
            const isAtBottom = content.scrollHeight - content.clientHeight <= content.scrollTop + 20;
            
            if (r.success) {
                content.innerHTML = r.logs || t('docker_no_result');
                if (isAtBottom) content.scrollTop = content.scrollHeight;
            } else {
                content.innerHTML = `<span style="color:var(--accent3);">⚠️ ${r.error}</span>`;
            }
        });
    };
    
    fetchLogs();
    window.dockerLogsInterval = setInterval(fetchLogs, 3000); // Actualisation toutes les 3s
}

function showDockerStats(id, name) {
    let modal = document.getElementById('modal-docker-stats');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-docker-stats';
        modal.className = 'modal-bg';
        modal.style.zIndex = '10005';
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { 
            if (e.target === modal) {
                modal.classList.remove('open');
                if (window.dockerStatsInterval) clearInterval(window.dockerStatsInterval);
            }
        });
    }

    modal.innerHTML = `
    <div class="modal-box" style="width: 450px; max-width: 95%; max-height: 90vh; display: flex; flex-direction: column; padding: 0; overflow: hidden; background: var(--bg2); border-radius: 16px;">
    <h3 style="margin:0; border-bottom:1px solid var(--border); padding: 15px 20px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0; background: var(--bg2);">
    <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📊 ${t('docker_stats_title', {name: esc(name)})}</span>
    <div style="display:flex; align-items:center; gap:10px;">
        <span id="docker-stats-spinner" style="font-size:12px; color:var(--muted); opacity:0; transition:opacity 0.2s; animation: syncPulse 1.2s infinite;">↻</span>
        <button onclick="document.getElementById('modal-docker-stats').classList.remove('open'); if(window.dockerStatsInterval) clearInterval(window.dockerStatsInterval);" class="btn-circle" style="flex-shrink:0; background:var(--bg3); border:1px solid var(--border); color:var(--text); width:32px; height:32px; border-radius:8px; cursor:pointer;">✕</button>
    </div>
    </h3>
    <div id="docker-stats-content" style="padding: 20px; overflow-y: auto; flex: 1; text-align:center; color:var(--muted);">
    ⏳ ${t('docker_stats_loading')}
    </div>
    </div>`;
    modal.classList.add('open');
    
    if (window.dockerStatsInterval) clearInterval(window.dockerStatsInterval);

    const fetchStats = () => {
        if (!document.getElementById('modal-docker-stats').classList.contains('open')) {
            clearInterval(window.dockerStatsInterval);
            return;
        }
        
        const spinner = document.getElementById('docker-stats-spinner');
        if (spinner) spinner.style.opacity = '1';
        
        api('docker_stats&id=' + id, {}, 'GET').then(r => {
            if (spinner) spinner.style.opacity = '0';
            const content = document.getElementById('docker-stats-content');
            if (!content) return;
            
            if (r.success) {
                content.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:20px;">
                <div style="background:var(--bg3); padding:20px; border-radius:12px; border:1px solid var(--border);">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="font-weight:bold; color:var(--text);">🧠 CPU</span>
                <span style="color:var(--accent); font-family:var(--mono); font-weight:bold;">${r.cpu}%</span>
                </div>
                <div style="background:var(--bg); height:8px; border-radius:4px; overflow:hidden;">
                <div style="background:var(--accent); height:100%; width:${Math.min(r.cpu, 100)}%; transition:width 0.5s ease;"></div>
                </div>
                </div>

                <div style="background:var(--bg3); padding:20px; border-radius:12px; border:1px solid var(--border);">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="font-weight:bold; color:var(--text);">⚡ RAM</span>
                <span style="color:var(--accent2); font-family:var(--mono); font-weight:bold;">${r.ram}%</span>
                </div>
                <div style="background:var(--bg); height:8px; border-radius:4px; overflow:hidden;">
                <div style="background:var(--accent2); height:100%; width:${Math.min(r.ram, 100)}%; transition:width 0.5s ease;"></div>
                </div>
                <div style="font-size:12px; color:var(--muted); text-align:right; margin-top:8px;">
                ${r.ram_used} / ${r.ram_limit}
                </div>
                </div>
                </div>`;
            } else {
                content.innerHTML = `<span style="color:var(--accent3);">⚠️ ${r.error}</span>`;
            }
        });
    };
    
    fetchStats();
    window.dockerStatsInterval = setInterval(fetchStats, 2000); // Actualisation toutes les 2s
}

// Validation de la connexion avec le code 2FA
async function doVerify2FA() {
    const code = document.getElementById('login-2fa-code').value;
    const r = await api('verify_login_2fa', { code: code });
    if (r.ok) {
        window.location.reload();
    } else {
        showAuthErr('2fa', r.error || t('notif_error'));
    }
}

document.getElementById('login-2fa-code')?.addEventListener('keydown', e => { if (e.key === 'Enter') doVerify2FA(); });

// ── PARAMÈTRES 2FA ──
async function load2FAStatus() {
    const r = await api('get_2fa_status', {}, 'GET');
    const container = document.getElementById('settings-2fa-container');
    if (!container) return;

    if (r.enabled) {
        container.innerHTML = `
        <div style="display:flex; align-items:center; gap:15px; padding:15px; background:rgba(93,255,214,0.1); border:1px solid var(--accent2); border-radius:10px;">
        <span style="font-size:24px;">🛡️</span>
        <div style="flex:1;">
        <div style="color:var(--accent2); font-weight:bold;">${t('2fa_enabled', {fallback:'2FA activé'})}</div>
        <div style="font-size:12px; color:var(--muted);">${t('2fa_protected', {fallback:'Compte protégé'})}</div>
        </div>
        <button class="btn-sm danger" onclick="disable2FA()">Désactiver</button>
        </div>
        `;
    } else {
        container.innerHTML = `
        <div style="display:flex; align-items:center; gap:15px; padding:15px; background:var(--bg2); border:1px solid var(--border); border-radius:10px;">
        <span style="font-size:24px;">🔓</span>
        <div style="flex:1;">
        <div style="color:var(--text); font-weight:bold;">${t('2fa_disabled', {fallback:'2FA désactivé'})}</div>
        <div style="font-size:12px; color:var(--muted);">${t('2fa_unprotected', {fallback:'Compte vulnérable'})}</div>
        </div>
        <button class="btn-sm accent" onclick="startSetup2FA()">Activer</button>
        </div>

        <div id="setup-2fa-box" style="display:none; margin-top:15px; padding:20px; background:var(--bg3); border:1px solid var(--border); border-radius:10px; text-align:center;">
        <p style="font-size:13px; color:var(--text); margin-bottom:15px;">${t('2fa_step1', {fallback:'Scannez ce QR code'})}</p>
        <img id="qr-2fa" src="" style="width:160px; height:160px; border-radius:10px; border:4px solid white; margin-bottom:15px;">
        <div style="font-family:var(--mono); font-size:12px; color:var(--accent); margin-bottom:20px;" id="secret-2fa"></div>
        <p style="font-size:13px; color:var(--text); margin-bottom:10px;">${t('2fa_step2', {fallback:'Entrez le code'})}</p>
        <div style="display:flex; gap:10px; justify-content:center;">
        <input type="text" id="confirm-2fa-code" placeholder="123456" maxlength="6" style="width:120px; text-align:center; font-size:16px; letter-spacing:2px; font-weight:bold; background:var(--bg2); border:1px solid var(--border); color:var(--text); border-radius:var(--radius);">
        <button class="btn-primary" onclick="confirmSetup2FA()">Valider</button>
        </div>
        </div>
        `;
    }
}

async function startSetup2FA() {
    const r = await api('setup_2fa', {}, 'GET');
    if (r.secret) {
        document.getElementById('setup-2fa-box').style.display = 'block';
        document.getElementById('secret-2fa').textContent = r.secret;
        document.getElementById('qr-2fa').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(r.url)}`;
    }
}

async function confirmSetup2FA() {
    const code = document.getElementById('confirm-2fa-code').value;
    const r = await api('confirm_2fa', { code: code });

    if (r.ok) {
        alert('✅ ' + t('success'));
        load2FAStatus();
    } else {
        alert('❌ ' + (r.error || t('notif_error')));
    }
}

async function disable2FA() {
    if (!confirm(t('confirm_disable_2fa'))) return;
    const r = await api('disable_2fa');
    if (r.ok) {
        notify(t('2fa_disabled_ok'), 'ok');
        load2FAStatus();
    }
}

// ── GESTION DE L'APPARENCE (Thèmes) ──────────────────────────────────────────
function applyTheme(theme) {
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    const isLight = theme === 'light' || (theme === 'auto' && prefersLight);

    if (isLight) document.documentElement.classList.add('theme-light');
    else document.documentElement.classList.remove('theme-light');

    const selector = document.getElementById('theme-selector');
    if (selector) selector.value = theme;

    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) {
        if (theme === 'auto') {
            toggleBtn.innerHTML = '🌗';
        } else if (theme === 'light') {
            toggleBtn.innerHTML = '☀️';
        } else {
            toggleBtn.innerHTML = '🌙';
        }
    }
}

function changeTheme(theme) {
    localStorage.setItem('serviarr_theme', theme);
    applyTheme(theme);
}

window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (localStorage.getItem('serviarr_theme') === 'auto') applyTheme('auto');
});

const originalShowTab = showTab;
showTab = function(name) {
    if (typeof originalShowTab === 'function') originalShowTab(name);
    if (name === 'settings') {
        const currentTheme = localStorage.getItem('serviarr_theme') || 'auto';
        const selector = document.getElementById('theme-selector');
        if (selector) selector.value = currentTheme;
    }
};

function quickToggleTheme() {
    const currentTheme = localStorage.getItem('serviarr_theme') || 'auto';
    let nextTheme = 'auto';

    if (currentTheme === 'auto') nextTheme = 'light';
    else if (currentTheme === 'light') nextTheme = 'dark';
    else nextTheme = 'auto';

    changeTheme(nextTheme);
}

document.addEventListener('DOMContentLoaded', () => {
    applyTheme(localStorage.getItem('serviarr_theme') || 'auto');
});

// ── NOTIFICATIONS WEB (Push Vrai PWA) ────────────────────────────────────────

// Remplace par la Public Key générée à l'étape 2 !
const VAPID_PUBLIC_KEY = 'BEtLH83HDQX7EbavV0DF2bp2V7yf7BVoaqhqSVXjaEsMg4IwqbIi39q3MCj5x0z5B4g8Mya0S1Id0NseA6qODzI';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function enableWebNotifications() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        alert(t('notif_error') + " : " + t('push_not_supported'));
        return;
    }

    const cfg = await api('get_push_config', {}, 'GET');
    const keyToUse = cfg.vapid_public ? cfg.vapid_public : VAPID_PUBLIC_KEY;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
        alert(t('notif_error') + " : " + t('push_permission_denied'));
        return;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(keyToUse)
        });

        const fd = new FormData();
        fd.append('action', 'save_push_sub');
        fd.append('sub', JSON.stringify(subscription));

        const response = await fetch('api.php', { method: 'POST', body: fd });
        const r = await response.json();

        if (r.success) {
            alert("✅ " + t('settings_vapid_saved'));
        }
    } catch (e) {
        console.error("Erreur d'abonnement Push: ", e);
        alert(t('notif_error'));
    }
}

// ── MENU DÉROULANT DES NOTIFICATIONS ──────────────────────────────────────────

async function toggleNotifMenu() {
    const dropdown = document.getElementById('notif-dropdown');
    if (!dropdown) return;

    if (dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
    } else {
        dropdown.style.display = 'block';
        loadNotifMenuData();
    }
}


async function loadNotifMenuData() {
    const list = document.getElementById('notif-list');
    
    // 1. Essayer d'afficher immédiatement depuis le cache
    const cached = localStorage.getItem('serviarr_notifs_cache');
    let hasCache = false;
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.length > 0) {
                renderNotifsData(parsed);
                hasCache = true;
            }
        } catch(e) {}
    }
    
    if (!hasCache) {
        list.innerHTML = `<div style="padding:15px; text-align:center; color:var(--muted); font-size:13px;">${t('notif_loading')}</div>`;
    }

    // 2. Fetch en arrière plan pour mettre à jour
    try {
        const r = await api('get_notifications_list', {}, 'GET');
        
        if (!r || r.length === 0) {
            if (!hasCache) list.innerHTML = `<div style="padding:15px; text-align:center; color:var(--muted); font-size:13px;">${t('no_recent_dl')}</div>`;
            return;
        }

        // 3. Sauvegarder dans le cache et réafficher silencieusement (seulement si le menu est encore ouvert)
        localStorage.setItem('serviarr_notifs_cache', JSON.stringify(r));
        const dropdown = document.getElementById('notif-dropdown');
        if (dropdown && dropdown.style.display === 'block') {
            renderNotifsData(r);
        }
    } catch (e) {
        console.error("Erreur maj notifs", e);
    }
}

function renderNotifsData(r) {
    const list = document.getElementById('notif-list');
    const grouped = [];
    const seriesMap = {};

    r.forEach(n => {
        if (n.type === 'serie') {
            if (seriesMap[n.id] !== undefined) {
                grouped[seriesMap[n.id]].count++;
            } else {
                const lastDashIndex = n.title.lastIndexOf(' - ');
                const seriesTitle = lastDashIndex > 0 ? n.title.substring(0, lastDashIndex) : n.title;

                grouped.push({ ...n, seriesTitle: seriesTitle, count: 1 });
                seriesMap[n.id] = grouped.length - 1;
            }
        } else {
            grouped.push({ ...n, count: 1 });
        }
    });

    list.innerHTML = '';

    grouped.forEach(n => {
        const targetUrl = n.type === 'movie' ? `films.php?movie=${n.id}` : `series.php?serie=${n.id}`;
        const dateObj = new Date(n.date);
        const dateStr = dateObj.toLocaleDateString(currentLocale(), {day: '2-digit', month: 'short', hour:'2-digit', minute:'2-digit'});

        let titleToShow = n.title;
        let subTextHtml = `<div style="font-size:11px; color:var(--muted); margin-top:4px;">${dateStr}</div>`;

        if (n.type === 'serie' && n.count > 1) {
            titleToShow = n.seriesTitle;
            subTextHtml = `
            <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
            <span style="background:rgba(0, 202, 255, 0.15); color:var(--sonarr); border:1px solid rgba(0, 202, 255, 0.3); font-size:10px; font-weight:bold; padding:2px 6px; border-radius:6px;">${t('cal_episodes', {n: n.count})}</span>
            <span style="font-size:11px; color:var(--muted);">${dateStr}</span>
            </div>`;
        }

        const posterHtml = n.poster
        ? `<img src="${n.poster}" style="width:35px; height:50px; border-radius:6px; object-fit:cover; flex-shrink:0; border:1px solid var(--border);" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
        : '';
        const fallbackIcon = n.type === 'movie' ? '🎬' : '📺';
        const fallbackHtml = `<div style="width:35px; height:50px; border-radius:6px; background:var(--bg); display:${n.poster ? 'none' : 'flex'}; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; border:1px solid var(--border);">${fallbackIcon}</div>`;

        list.innerHTML += `
        <div onclick="window.location.href='${targetUrl}'" style="padding:12px 16px; display:flex; gap:12px; align-items:center; cursor:pointer; border-bottom:1px solid var(--border); transition:background 0.2s;" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='transparent'">
        ${posterHtml}${fallbackHtml}
        <div style="flex:1; overflow:hidden;">
        <div style="font-size:13px; font-weight:bold; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(titleToShow)}</div>
        ${subTextHtml}
        </div>
        </div>
        `;
    });
}

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notif-dropdown');
    const btn = document.getElementById('notif-toggle-btn');
    if (dropdown && dropdown.style.display === 'block') {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    }
});

// ── INSTALLATION DU SERVICE WORKER ─────────────────────────
if ('serviceWorker' in navigator && 'PushManager' in window) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
        .then(registration => { console.log('✅ Service Worker enregistré.'); })
        .catch(error => { console.error('❌ Erreur Service Worker:', error); });
    });
}

// ── GESTIONNAIRE DE FICHIERS ET PROTOCOLES (OS) ───────────────────────────────
if ('registerProtocolHandler' in navigator) {
    try { navigator.registerProtocolHandler('magnet', window.location.origin + '/download.php?magnet=%s', 'Serviarr'); } catch(e) {}
}

if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (launchParams) => {
        if (!launchParams.files.length) return;
        for (const fileHandle of launchParams.files) {
            const file = await fileHandle.getFile();
            if (file.name.endsWith('.torrent')) {
                if (typeof openAddTorrentModal === 'function') {
                    openAddTorrentModal();
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    document.getElementById('torrent-upload-file').files = dataTransfer.files;
                }
            }
        }
    });
}

// ── PAGE PROWLARR : RÉCUPÉRATION ET AFFICHAGE DES INDEXERS ────────────────────
async function loadProwlarrIndexers() {
    const container = document.getElementById('prowlarr-content');
    if (!container) return;

    container.innerHTML = `<div style="text-align:center; padding:50px; color:var(--muted);">${t('prowlarr_loading')}</div>`;

    const r = await api('prowlarr_indexers', {}, 'GET');

    if (r.error) {
        container.innerHTML = `<div style="padding:20px; text-align:center; color:var(--accent3); background:rgba(255, 60, 60, 0.1); border-radius:12px;">${esc(r.error)}</div>`;
        return;
    }

    if (!r.indexers || r.indexers.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--muted);">${t('releases_none')}</div>`;
        return;
    }

    let html = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:16px; padding-bottom:30px;">';

    r.indexers.forEach(ind => {
        const isActive = ind.enable;
        const statusText = isActive ? 'ON' : 'OFF';
        const protocol = ind.protocol === 'torrent' ? 'Torrent 🧲' : 'Usenet 📥';

        // Utilisation du bleu cyan pour ON, et rouge pour OFF (barre latérale)
        const barColor = isActive ? 'var(--accent)' : 'var(--accent3)';
        
        // Pastilles translucides très propres, sans bordure
        const badgeStyle = isActive 
            ? 'background: var(--accent-bg); color: var(--accent); border: none;' 
            : 'background: rgba(255,93,143, 0.15); color: var(--accent3); border: none;';

        html += `
        <div style="background:var(--bg3); padding:20px; border-radius:16px; border:1px solid var(--border); box-shadow:0 4px 15px rgba(0,0,0,0.2); position:relative; overflow:hidden;">
        <div style="position:absolute; left:0; top:0; bottom:0; width:4px; background:${barColor};"></div>

        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
        <h3 style="margin:0; font-size:16px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding-right:10px;">${esc(ind.name)}</h3>
        <span style="font-size:11px; font-weight:bold; padding:4px 8px; border-radius:12px; ${badgeStyle} flex-shrink:0;">
        ${statusText}
        </span>
        </div>

        <div style="font-size:13px; color:var(--muted); margin-bottom:6px; display:flex; justify-content:space-between;">
        <span>Type :</span> <span style="color:var(--text);">${protocol}</span>
        </div>
        <div style="font-size:13px; color:var(--muted); margin-bottom:6px; display:flex; justify-content:space-between;">
        <span>Privacy :</span> <span style="color:var(--text);">${esc(ind.privacy)}</span>
        </div>
        </div>`;
    });
	

    html += '</div>';
    container.innerHTML = html;
}

// ── PROWLARR : INITIALISATION ET RECHERCHE ────────────────────────────────────
async function initProwlarr() {
    await Promise.all([
        loadProwlarrIndexersSelect(),
                      loadProwlarrCategoriesSelect()
    ]);
    if (typeof loadProwlarrIndexers === 'function') loadProwlarrIndexers();
}

async function loadProwlarrIndexersSelect() {
    const r = await api('prowlarr_indexers', {}, 'GET');
    if (r.success && r.indexers) {
        const select = document.getElementById('prowlarr-indexer');
        if (!select) return;
        r.indexers.forEach(ind => {
            if (ind.enable) select.innerHTML += `<option value="${ind.id}">${esc(ind.name)}</option>`;
        });
    } else if (r.error) {
        notify(r.error, 'err');
    }
}

async function loadProwlarrCategoriesSelect() {
    const select = document.getElementById('prowlarr-category');
    if (!select) return;

    const categories = [
        { id: 2000, name: "🎬 " + t('page_films') },
        { id: 5000, name: "📺 " + t('page_series') },
        { id: 3000, name: "🎵 " + t('cat_audio') },
        { id: 4000, name: "💻 " + t('cat_pc') },
        { id: 1000, name: "🎮 " + t('cat_console') },
        { id: 7000, name: "📚 " + t('cat_books') },
        { id: 6000, name: "🔞 " + t('cat_adult') },
        { id: 8000, name: "📦 " + t('cat_misc') }
    ];

    categories.forEach(cat => {
        select.innerHTML += `<option value="${cat.id}" style="font-weight:bold;">${cat.name}</option>`;
    });
}

async function searchProwlarr() {
    const query = document.getElementById('prowlarr-search').value.trim();
    const indexer = document.getElementById('prowlarr-indexer').value;
    const category = document.getElementById('prowlarr-category').value;
    const container = document.getElementById('prowlarr-content');

    if (!query && indexer === "0" && category === "0") {
        if (typeof loadProwlarrIndexers === 'function') loadProwlarrIndexers();
        document.getElementById('prowlarr-results-count').textContent = '—';
        return;
    }

    container.innerHTML = `<div style="text-align:center; padding:50px; color:var(--muted);">${t('loading')}</div>`;

    const r = await api(`prowlarr_search&query=${encodeURIComponent(query)}&indexer=${indexer}&category=${category}`, {}, 'GET');

    if (r.error) {
        container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>${t('notif_error')}</h3><p>${esc(r.error)}</p></div>`;
        return;
    }

    const results = r.results || [];
    document.getElementById('prowlarr-results-count').textContent = results.length;

    if (results.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><h3>${t('releases_none')}</h3></div>`;
        return;
    }

    let html = '<div style="display:flex; flex-direction:column; gap:10px;">';
    results.forEach(res => {
        const size = formatBytes(res.size || 0);
        const ageInDays = Math.floor((res.age || 0) / 24) || '< 1';
        const magnetOrTorrent = res.magnetUrl || res.downloadUrl || '';

        const downloadBtn = magnetOrTorrent
        ? `<button class="btn-primary btn-prowlarr-dl" onclick="sendToTransmission('${esc(magnetOrTorrent).replace(/'/g, "\\'")}', this)">
            <span class="icon">⬇️</span>
            <span class="text-dl">${t('btn_download') !== 'btn_download' ? t('btn_download') : 'Télécharger'}</span>
           </button>`
        : '';

        html += `
        <div style="background:var(--bg3); padding:15px; border-radius:12px; border:1px solid var(--border); display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <a href="${esc(res.infoUrl || '#')}" target="_blank" style="font-weight:600; font-size:14px; color:var(--text); text-decoration:none; word-break:break-all;">${esc(res.title)}</a>
        ${downloadBtn}
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:10px; font-size:12px; align-items:center;">
        <span style="color:var(--accent); background:var(--accent-bg); padding:2px 6px; border-radius:4px; font-weight:bold; border:none;">${esc(res.indexer)}</span>
		<span style="color:var(--muted);">📁 ${size}</span>
        <span style="color:var(--muted);">🌱 ${res.seeders || 0} / 🧛 ${res.leechers || 0}</span>
        <span style="color:var(--muted);">📅 ${ageInDays} j</span>
        </div>
        </div>`;
    });
    html += '</div>';

    container.innerHTML = html;
}

async function sendToTransmission(url, btn) {
    btn.disabled = true;
    btn.textContent = '⏳...';

    const fd = new FormData();
    fd.append('action', 'add_torrent');
    fd.append('magnet', url);

    try {
        const response = await fetch('api.php', { method: 'POST', body: fd });
        const res = await response.json();

        if (res.ok) {
            btn.textContent = '✅';
            btn.style.background = 'var(--accent2)';
            btn.style.color = '#000';
            btn.style.border = 'none';
            notify(t('torrent_added'), 'ok');
        } else {
            btn.disabled = false;
            btn.textContent = '⬇️ DL';
            notify(res.error || t('torrent_add_error'), 'err');
        }
    } catch (e) {
        btn.disabled = false;
        btn.textContent = '⬇️ DL';
        notify(t('error_connection'), 'err');
    }
}

// ── SYSTÈME D'ACCORDÉON POUR LES PARAMÈTRES ───────────────────────────────────
function initSettingsAccordion() {
    document.querySelectorAll('.settings-section').forEach(section => {
        const header = section.querySelector('.settings-section-header');
        const bodies = section.querySelectorAll('.settings-section-body');

        if (!header || bodies.length === 0 || header.dataset.accordionInited) return;
        header.dataset.accordionInited = 'true';

        header.style.cursor = 'pointer';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.userSelect = 'none';

        const chevron = document.createElement('span');
        chevron.innerHTML = '▼';
        chevron.style.transition = 'transform 0.2s';
        chevron.style.fontSize = '12px';
        chevron.style.color = 'var(--muted)';
        header.appendChild(chevron);

        header.addEventListener('click', () => {
            const isClosed = bodies[0].style.display === 'none';
            bodies.forEach(body => { body.style.display = isClosed ? 'block' : 'none'; });
            chevron.style.transform = isClosed ? 'rotate(0deg)' : 'rotate(-90deg)';
        });
    });
}

// ── SYSTÈME DE GLISSEMENT (SWIPE) POUR LE MENU LATÉRAL SUR MOBILE ─────────────
function initSidebarSwipe() {
    let touchStartX = 0;
    let touchStartY = 0;
    const threshold = 50;
    const edgeThreshold = 100;

    document.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.addEventListener('touchend', e => {
        if (window.innerWidth >= 1024) return;

        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

        if (Math.abs(diffX) > Math.abs(diffY)) {
            const sidebar = document.getElementById('sidebar');
            if (!sidebar) return;

            if (diffX > threshold && touchStartX < edgeThreshold) {
                if (!sidebar.classList.contains('open')) toggleSidebar();
            }
            if (diffX < -threshold) {
                if (sidebar.classList.contains('open')) toggleSidebar();
            }
        }
    }, { passive: true });
}

document.addEventListener('DOMContentLoaded', initSidebarSwipe);

// ── REDIRECTION DEPUIS LE CALENDRIER VERS LES PAGES NATIVES + MODALE ──────────
function navigateFromCalendar(type, id) {
    sessionStorage.setItem('serviarr_hub_tab', 'calendar');
    if (type === 'movie' || type === 'radarr') window.location.href = 'films.php?movie=' + id + '&from=calendar';
    else window.location.href = 'series.php?serie=' + id + '&from=calendar';
}

// ── RESTAURATION DE L'ONGLET DASHBOARD AU RETOUR ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const activeTab = sessionStorage.getItem('serviarr_hub_tab');
    const hubNav = document.getElementById('hub-nav');

    if (activeTab && hubNav) {
        sessionStorage.removeItem('serviarr_hub_tab');
        setTimeout(() => {
            const btn = Array.from(hubNav.querySelectorAll('.hub-btn')).find(b => b.getAttribute('onclick') && b.getAttribute('onclick').includes(activeTab));
            if (btn && typeof switchHomeTab === 'function') switchHomeTab(activeTab, btn);
        }, 100);
    }
});

// ── OMNISEARCH (RECHERCHE GLOBALE) ────────────────────────────────────────────
let omniTimeout;

function triggerOmnisearch() {
    const input = document.getElementById('omni-input');
    const resultsDiv = document.getElementById('omni-results');
    const query = input.value.trim();

    clearTimeout(omniTimeout);

    if (query.length < 2) {
        resultsDiv.style.display = 'none';
        return;
    }

    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = `<div style="padding:15px; text-align:center; color:var(--muted); font-size:13px;">${t('loading')}</div>`;

    omniTimeout = setTimeout(() => {
        api('omnisearch&q=' + encodeURIComponent(query), {}, 'GET').then(r => {
            if (r.success && r.data) {
                renderOmnisearch(r.data, query);
            } else {
                resultsDiv.innerHTML = `<div style="padding:15px; text-align:center; color:var(--accent3);">${t('error_connection')}</div>`;
            }
        });
    }, 300);
}

function renderOmnisearch(data, query) {
    const resultsDiv = document.getElementById('omni-results');
    const movies = data.movies || [];
    const series = data.series || [];

    if (movies.length === 0 && series.length === 0) {
        resultsDiv.innerHTML = `<div style="padding:15px; text-align:center; color:var(--text); font-size:13px;">
        ${t('no_movie_found')} / ${t('no_series_found')}
        </div>`;
        return;
    }

    const getImgUrl = (item) => {
        if (item.images && item.images.length > 0) {
            const poster = item.images.find(i => i.coverType === 'poster');
            if (poster) return poster.remoteUrl || poster.url;
        }
        return '/assets/img/placeholder.png';
    };

    let html = '<div class="omni-grid">';

    // Colonne FILMS
    html += `<div><div style="font-size:12px; font-weight:bold; color:var(--radarr); margin-bottom:8px; text-transform:uppercase;">🎬 ${t('page_films')}</div>`;
    if (movies.length > 0) {
        movies.forEach(m => {
            const year = m.year ? `(${m.year})` : '';
            const url = m.id ? `films.php?movie=${m.id}&from=omni` : `films.php?tmdb=${m.tmdbId}&from=omni`;

            html += `
            <a href="${url}" class="omni-item">
            <img src="${getImgUrl(m)}" class="omni-poster" loading="lazy">
            <div style="flex:1; overflow:hidden;">
            <div style="font-weight:bold; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(m.title)}</div>
            <div style="font-size:11px; color:var(--muted);">${year}</div>
            </div>
            </a>`;
        });
    } else {
        html += `<div style="font-size:12px; color:var(--muted); padding:8px;">${t('no_movie_found')}</div>`;
    }
    html += '</div>';

    // Colonne SÉRIES
    html += `<div><div style="font-size:12px; font-weight:bold; color:var(--sonarr); margin-bottom:8px; text-transform:uppercase;">📺 ${t('page_series')}</div>`;
    if (series.length > 0) {
        series.forEach(s => {
            const year = s.year ? `(${s.year})` : '';
            const url = s.id ? `series.php?serie=${s.id}&from=omni` : `series.php?tmdb=${s.tvdbId}&from=omni`;

            html += `
            <a href="${url}" class="omni-item">
            <img src="${getImgUrl(s)}" class="omni-poster" loading="lazy">
            <div style="flex:1; overflow:hidden;">
            <div style="font-weight:bold; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(s.title)}</div>
            <div style="font-size:11px; color:var(--muted);">${year}</div>
            </div>
            </a>`;
        });
    } else {
        html += `<div style="font-size:12px; color:var(--muted); padding:8px;">${t('no_series_found')}</div>`;
    }
    html += '</div>';

    html += '</div>';

    html += `
    <div style="padding:10px; border-top:1px solid var(--border); background:var(--bg); text-align:center;">
    <a href="prowlarr.php?q=${encodeURIComponent(query)}" style="color:var(--text); font-size:12px; text-decoration:none;">
    🔍 Prowlarr ➔
    </a>
    </div>`;

    resultsDiv.innerHTML = html;
}

document.addEventListener('click', (e) => {
    const resultsDiv = document.getElementById('omni-results');
    const input = document.getElementById('omni-input');
    if (resultsDiv && e.target !== input && !resultsDiv.contains(e.target)) {
        resultsDiv.style.display = 'none';
    }
});

// ── SAUVEGARDE & RESTAURATION (BACKUP) ────────────────────────────────────────

function exportBackup() {
    let prefs = {};
    for (let i = 0; i < localStorage.length; i++) {
        let key = localStorage.key(i);
        if (key && key.startsWith('serviarr_')) {
            prefs[key] = localStorage.getItem(key);
        }
    }

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'api.php?action=export_backup';

    const prefsInput = document.createElement('input');
    prefsInput.type = 'hidden';
    prefsInput.name = 'prefs';
    prefsInput.value = JSON.stringify(prefs);
    form.appendChild(prefsInput);

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
}

function importBackup(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    if (!confirm(t('settings_import'))) {
        input.value = '';
        return;
    }

    const formData = new FormData();
    formData.append('action', 'import_backup');
    formData.append('backup_file', file);

    document.body.style.cursor = 'wait';

    fetch('api.php', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        if (data.ok) {
            if (data.frontend) {
                for (const [key, value] of Object.entries(data.frontend)) {
                    localStorage.setItem(key, value);
                }
            }
            alert("✅ " + t('notif_saved'));
            window.location.reload();
        } else {
            alert("❌ " + t('notif_error') + " : " + (data.error || t('err_invalid_file')));
        }
    })
    .catch(err => {
        alert("❌ " + t('error_connection'));
    })
    .finally(() => {
        input.value = '';
        document.body.style.cursor = 'default';
    });
}

// ── IMPORT DE LISTE ──────────────────────────────────────────────────────────
let _importListType = 'movie';
let _importResults = [];
let _importSelected = new Set();

function openImportListModal(type) {
    _importListType = type;
    _importResults = [];
    _importSelected = new Set();

    let modal = document.getElementById('modal-import-list');
    if (!modal) {
        const modalHtml = `
        <div id="modal-import-list" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:999999; align-items:center; justify-content:center; padding:20px; backdrop-filter:blur(5px);">
        <div style="background:var(--bg2); width:100%; max-width:800px; border:1px solid var(--border); border-radius:12px; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 10px 40px rgba(0,0,0,0.5); overflow:hidden;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 15px 20px; border-bottom: 1px solid var(--border); flex-shrink:0; background:var(--bg2);">
        <h3 id="import-list-title" style="margin:0; color:var(--text); font-size:18px;"></h3>
        <span onclick="document.getElementById('modal-import-list').style.display='none'" style="cursor:pointer; color:var(--muted); font-size:24px; line-height:1;">&times;</span>
        </div>
        <div id="import-list-step1" style="padding: 20px; overflow-y: auto; flex: 1;">
        
        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:10px; flex-wrap:wrap; gap:10px;">
            <p style="color:var(--muted); font-size:13px; margin:0;">${t('import_list_hint')}</p>
            <button class="btn-sm" onclick="document.getElementById('import-file-upload').click()" style="background:var(--bg3); color:var(--text); border:1px solid var(--border); padding:6px 12px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:6px;">
                📂 Charger un fichier .txt
            </button>
            <input type="file" id="import-file-upload" accept=".txt" style="display:none;" onchange="handleImportFileUpload(event)">
        </div>

        <textarea id="import-list-textarea" rows="8" style="width:100%; background:var(--bg3); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:12px; font-size:14px; resize:vertical;" placeholder="${t('import_list_placeholder')}"></textarea>
        <button class="btn-primary" style="margin-top:15px; width:100%; flex-shrink:0;" onclick="analyzeImportList()">${t('import_list_analyze')}</button>
        </div>
        <div id="import-list-step2" style="display:none; flex-direction:column; padding: 20px; overflow:hidden; flex:1;">
        <div id="import-list-options" style="display:flex; gap:10px; margin-bottom:12px; flex-wrap:wrap; flex-shrink:0;"></div>
        <div id="import-list-results" style="overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:8px; padding-right:5px;"></div>
        <button class="btn-primary" id="btn-confirm-import" style="margin-top:15px; width:100%; flex-shrink:0;" onclick="confirmBulkImport()"></button>
        </div>
        </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('modal-import-list');
        modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
    }

    document.getElementById('import-list-title').textContent = type === 'movie' ? t('import_list_title_movie') : t('import_list_title_serie');
    document.getElementById('import-list-textarea').value = '';
    document.getElementById('import-list-step1').style.display = 'block';
    document.getElementById('import-list-step2').style.display = 'none';
    modal.style.display = 'flex';
}

function handleImportFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const textarea = document.getElementById('import-list-textarea');
        if (textarea) {
            // Remplit le champ texte avec le contenu du fichier
            textarea.value = e.target.result;
        }
        // Réinitialise l'input file pour permettre de recharger le même fichier si on se trompe
        event.target.value = '';
    };
    reader.readAsText(file);
}

async function analyzeImportList() {
    const raw = document.getElementById('import-list-textarea').value;
    const terms = raw.split('\n').map(l => l.trim()).filter(Boolean);
    if (terms.length === 0) return;

    document.getElementById('import-list-step1').innerHTML = `<p style="text-align:center; padding:30px; color:var(--muted);">⏳ ${t('loading')}</p>`;

    const r = await api('bulk_import_lookup', { type: _importListType, terms: JSON.stringify(terms) });
    if (r.error) {
        notify(r.error, 'err');
        document.getElementById('modal-import-list').style.display = 'none';
        return;
    }

    _importResults = r.results || [];
    _importSelected = new Set(_importResults.map((r, i) => (r.found && !r.in_lib) ? i : null).filter(i => i !== null));

    document.getElementById('import-list-step1').style.display = 'none';
    document.getElementById('import-list-step2').style.display = 'flex';

    // Charge les options (profil qualité / dossier) une seule fois pour tout le lot
    const appDriver = _importListType === 'movie' ? 'radarr' : 'sonarr';
    const opts = await api(`get_options&app=${appDriver}`, {}, 'GET');
    const optsDiv = document.getElementById('import-list-options');
    if (opts.profiles && opts.folders) {
        optsDiv.innerHTML = `
        <select id="import-list-profile" class="lib-select" style="flex:1;">${opts.profiles.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
        <select id="import-list-folder" class="lib-select" style="flex:1;">${opts.folders.map(f => `<option value="${f.path}">${esc(f.path)}</option>`).join('')}</select>
        `;
    }

    renderImportResults();
}

function renderImportResults() {
    const container = document.getElementById('import-list-results');
    container.innerHTML = _importResults.map((r, i) => {
        if (!r.found) {
            return `<div style="display:flex; align-items:center; gap:10px; padding:8px; background:var(--bg3); border-radius:8px; opacity:0.6;">
                <span style="font-size:18px;">❓</span>
                <span style="flex:1; font-size:13px;">${esc(r.term)}</span>
                <span style="font-size:11px; color:var(--accent3);">${t('import_list_not_found')}</span>
            </div>`;
        }
        const disabled = r.in_lib;
        const checked = _importSelected.has(i);
        return `<div style="display:flex; align-items:center; gap:10px; padding:8px; background:var(--bg3); border-radius:8px; ${disabled ? 'opacity:0.5;' : ''}">
            <input type="checkbox" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} onchange="toggleImportItem(${i})" style="width:18px; height:18px; accent-color:var(--accent); flex-shrink:0;">
            ${r.poster ? `<img src="${esc(r.poster)}" style="width:32px; height:48px; object-fit:cover; border-radius:4px; flex-shrink:0;">` : '<div style="width:32px;height:48px;flex-shrink:0;"></div>'}
            <span style="flex:1; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(r.title)} ${r.year ? `(${r.year})` : ''}</span>
            ${disabled ? `<span style="font-size:11px; color:var(--accent);">${t('already_added')}</span>` : ''}
        </div>`;
    }).join('');

    const btn = document.getElementById('btn-confirm-import');
    btn.textContent = t('import_list_add_selection').replace('{n}', _importSelected.size);
    btn.disabled = _importSelected.size === 0;
}

function toggleImportItem(i) {
    if (_importSelected.has(i)) _importSelected.delete(i);
    else _importSelected.add(i);
    renderImportResults();
}

async function confirmBulkImport() {
    if (_importSelected.size === 0) return;
    const profileId = document.getElementById('import-list-profile')?.value;
    const rootPath = document.getElementById('import-list-folder')?.value;
    const btn = document.getElementById('btn-confirm-import');
    btn.disabled = true;

    let successCount = 0;
    const items = Array.from(_importSelected).map(i => _importResults[i]);

    for (const item of items) {
        btn.textContent = t('import_list_adding') + ` (${successCount + 1}/${items.length})`;
        const payload = { qualityProfileId: profileId, rootFolderPath: rootPath, search: true };
        if (_importListType === 'movie') payload.tmdbId = item.tmdbId;
        else payload.tvdbId = item.tvdbId;

        const action = _importListType === 'movie' ? 'add_movie' : 'add_serie';
        const r = await api(action, payload);
        if (r.ok) successCount++;
    }

    notify(t('bulk_done').replace('{n}', successCount), 'ok');
    document.getElementById('modal-import-list').style.display = 'none';
    if (_importListType === 'movie') loadMovies(); else loadSeries();
}

function openSearchModal(type) {
    let modal = document.getElementById('modal-search-media');

    if (!modal) {
        const modalHtml = `
        <div id="modal-search-media" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:999999; align-items:center; justify-content:center; padding:20px; backdrop-filter:blur(5px);">
        <div style="background:var(--bg2); width:100%; max-width:800px; border:1px solid var(--border); border-radius:12px; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 10px 40px rgba(0,0,0,0.5); overflow:hidden;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 15px 20px; border-bottom: 1px solid var(--border); flex-shrink:0; background:var(--bg2);">
        <h3 id="search-modal-title" style="margin:0; color:var(--text); font-size:18px;">${t('add_media_title')}</h3>
        <span onclick="document.getElementById('modal-search-media').style.display='none'" style="cursor:pointer; color:var(--muted); font-size:24px; line-height:1;">&times;</span>
        </div>
        <div style="padding: 20px; display:flex; flex-direction:column; flex:1; overflow:hidden;">
        <input type="text" id="search-modal-input" class="lib-search" style="width:100%; margin-bottom:15px; font-size:16px; padding:12px 15px; border-radius:8px; flex-shrink:0;" placeholder="${t('search_type_title')}">
        <div id="search-modal-results" style="display:flex; flex-direction:column; gap:12px; overflow-y:auto; padding-right:5px; flex:1;">
        </div>
        </div>
        </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('modal-search-media');

        document.getElementById('search-modal-input').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                executeModalSearch(this.dataset.type, this.value);
            }
        });
    }

    const isMovie = type === 'movie';
    document.getElementById('search-modal-title').textContent = isMovie ? t('type_movie') : t('type_serie');
    const input = document.getElementById('search-modal-input');
    input.dataset.type = type;
    input.value = '';

    document.getElementById('search-modal-results').innerHTML = `<div style="color:var(--muted); text-align:center; padding:40px;">${t('search_type_title')}</div>`;

    modal.style.display = 'flex';
    setTimeout(() => input.focus(), 100);
}

async function executeModalSearch(type, query) {
    if (!query || query.trim().length < 2) return;

    const resultsDiv = document.getElementById('search-modal-results');
    resultsDiv.innerHTML = `<div style="color:var(--muted); text-align:center; padding:40px;">${t('loading')}</div>`;

    const action = type === 'movie' ? 'search_movie' : 'search_serie';
    const r = await api(action + '&q=' + encodeURIComponent(query), {}, 'GET');

    if (r.error || !r.results) {
        resultsDiv.innerHTML = `<div style="color:var(--accent3); text-align:center;">${t('notif_error')} : ${esc(r.error || 'Erreur')}</div>`;
        return;
    }

    if (r.results.length === 0) {
        resultsDiv.innerHTML = `<div style="color:var(--muted); text-align:center; padding:40px;">${type === 'movie' ? t('no_movie_found') : t('no_series_found')}</div>`;
        return;
    }

    let html = '';
    r.results.forEach((item, index) => {
        const isMovie = type === 'movie';
        const id = isMovie ? item.tmdbId : (item.tvdbId || item.tmdbId);
        const idType = isMovie ? 'tmdb' : (item.tvdbId ? 'tvdb' : 'tmdb');
        const safeTitle = esc(item.title).replace(/'/g, "\\'");

        const posterHtml = item.poster
        ? `<img src="${item.poster}" loading="lazy" style="width:100%; height:135px; object-fit:cover; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">`
        : `<div style="width:100%; height:135px; background:var(--bg2); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:30px; border:1px solid var(--border);">${isMovie ? '🎬' : '📺'}</div>`;

        let actionHtml = '';
        if (item.in_lib) {
            actionHtml = `<div style="background:rgba(93,255,214,0.1); color:var(--accent2); text-align:center; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:bold; border:1px solid rgba(93,255,214,0.3); display:inline-block;">✓ ${t('badge_library')}</div>`;
        } else {
            actionHtml = `<button id="col-card-${index}" class="btn-pill primary-${isMovie ? 'radarr' : 'sonarr'}" style="padding:6px 16px; font-size:12px; font-weight:bold;" onclick="promptAddMedia('${type}', ${id}, '${safeTitle}', this, '${idType}')">＋ ${t('films_add')}</button>`;
        }

        const networkText = item.network ? ` • ${esc(item.network)}` : '';
        const ratingText = item.rating ? ` • ⭐ ${item.rating}` : '';
        const overviewText = item.overview ? esc(item.overview) : t('detail_overview');

        html += `
        <div style="display:flex; gap:15px; background:var(--bg3); padding:12px; border-radius:12px; border:1px solid var(--border); transition:background 0.2s;" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='var(--bg3)'">

        <div style="width: 90px; flex-shrink: 0; cursor:pointer;" onclick="${isMovie ? `openTmdbMovieDetail(${item.tmdbId})` : `openTmdbSerieDetail(${item.tmdbId})`}">
        ${posterHtml}
        </div>

        <div style="flex:1; min-width:0; display:flex; flex-direction:column;">

        <div style="font-size:15px; font-weight:bold; color:var(--text); margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(item.title)}">
        ${esc(item.title)}
        </div>

        <div style="font-size:11px; color:var(--muted); margin-bottom:8px; font-weight:600;">
        <span style="color:var(--text);">${item.year || ''}</span>${networkText}${ratingText}
        </div>

        <div style="font-size:12px; color:#a0a5b5; line-height:1.4; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; margin-bottom:12px;">
        ${overviewText}
        </div>

        <div style="margin-top:auto; display:flex; gap:10px; align-items:center;">
        ${actionHtml}
        </div>

        </div>
        </div>`;
    });

    resultsDiv.innerHTML = html;
}

// ── INDEX ALPHABÉTIQUE (Saut rapide A-Z) ──────────────────────────────────────
function initAlphabetScrubber() {
    const path = window.location.pathname;
    const isMediaPage = path.includes('films.php') || path.includes('series.php');
    if (!isMediaPage) return;

    const oldScrubber = document.getElementById('alphabet-scrubber');
    if(oldScrubber) oldScrubber.remove();

    const alphabet = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
    let html = '<div id="alphabet-scrubber" class="alphabet-scrubber">';
    alphabet.forEach(letter => {
        html += `<div class="alphabet-letter" data-letter="${letter}">${letter}</div>`;
    });
    html += '</div>';

    document.body.insertAdjacentHTML('beforeend', html);

    const scrubber = document.getElementById('alphabet-scrubber');

    scrubber.style.opacity = '0';
    scrubber.style.visibility = 'hidden';
    scrubber.style.transition = 'opacity 0.3s, visibility 0.3s';

    const checkVisibility = () => {
        if (!scrubber) return;

        const movieModal = document.getElementById('modal-movie');
        const serieModal = document.getElementById('modal-serie');

        const isMovieOpen = movieModal && (movieModal.classList.contains('open') || (window.getComputedStyle(movieModal).opacity !== '0' && window.getComputedStyle(movieModal).display !== 'none' && window.getComputedStyle(movieModal).visibility !== 'hidden'));
        const isSerieOpen = serieModal && (serieModal.classList.contains('open') || (window.getComputedStyle(serieModal).opacity !== '0' && window.getComputedStyle(serieModal).display !== 'none' && window.getComputedStyle(serieModal).visibility !== 'hidden'));

        const isAddOpen = document.querySelector('.modal-bg.open') !== null;

        const isModalOpen = isMovieOpen || isSerieOpen || isAddOpen;

        if (window.scrollY > 250 && !isModalOpen) {
            scrubber.style.opacity = '1';
            scrubber.style.visibility = 'visible';
            scrubber.style.pointerEvents = 'auto';
        } else {
            scrubber.style.opacity = '0';
            scrubber.style.visibility = 'hidden';
            scrubber.style.pointerEvents = 'none';
        }
    };

    window.addEventListener('scroll', checkVisibility);
    setInterval(checkVisibility, 300);

    let lastLetter = '';
    const handleScrub = (letter) => {
        if (letter === lastLetter) return;
        lastLetter = letter;
        document.querySelectorAll('.alphabet-letter').forEach(el => el.classList.remove('active'));
        const activeEl = document.querySelector(`.alphabet-letter[data-letter="${letter}"]`);
        if(activeEl) activeEl.classList.add('active');
        scrollToLetter(letter);
    };

    scrubber.addEventListener('click', (e) => {
        if (e.target.classList.contains('alphabet-letter')) handleScrub(e.target.dataset.letter);
    });

        scrubber.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            if (target && target.classList.contains('alphabet-letter')) handleScrub(target.dataset.letter);
        }, { passive: false });

            scrubber.addEventListener('touchstart', (e) => {
                const target = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
                if (target && target.classList.contains('alphabet-letter')) handleScrub(target.dataset.letter);
            }, { passive: true });

                scrubber.addEventListener('touchend', () => {
                    document.querySelectorAll('.alphabet-letter').forEach(el => el.classList.remove('active'));
                    lastLetter = '';
                });
}

function scrollToLetter(letter) {
    const grid = document.getElementById('movies-grid') || document.getElementById('series-grid');
    if (!grid) return;

    const titles = grid.querySelectorAll('.media-card-title, .media-card-strip-title');

    for (let el of titles) {
        let text = el.innerText || el.textContent;
        text = text.trim().toUpperCase();

        //text = text.replace(/^(THE|A|AN|LE|LA|LES|L')\s+/i, '');

        let match = false;
        if (letter === '#') {
            if (/[0-9]/.test(text.charAt(0))) match = true;
        } else if (text.startsWith(letter)) {
            match = true;
        }

        if (match) {
            const card = el.closest('.media-card');
            if (card) {
                card.scrollIntoView({ behavior: window.innerWidth < 768 ? 'auto' : 'smooth', block: 'center' });

                const originalBg = card.style.background;
                card.style.transition = 'box-shadow 0.3s, background 0.3s';
                card.style.boxShadow = '0 0 20px var(--accent)';
                card.style.background = 'var(--bg)';

                setTimeout(() => {
                    card.style.boxShadow = '';
                    card.style.background = originalBg;
                }, 800);
            }
            break;
        }
    }
}

document.addEventListener('DOMContentLoaded', initAlphabetScrubber);


// ── FERMETURE AUTOMATIQUE DU MENU LATÉRAL SUR MOBILE ────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const sidebarItems = document.querySelectorAll('.sidebar-item');

    sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth < 1024) {
                const sidebar = document.querySelector('.sidebar');
                const overlay = document.querySelector('.sidebar-overlay');

                if (sidebar) sidebar.classList.remove('open');
                if (overlay) overlay.classList.remove('show');
            }
        });
    });
});

// Change le cookie et recharge la page
function changeLanguage(lang) {
    document.cookie = "serviarr_lang=" + lang + "; path=/; max-age=31536000"; // Valable 1 an
    window.location.reload();
}

// Sélectionne la bonne langue dans le menu au chargement
document.addEventListener('DOMContentLoaded', () => {
    const match = document.cookie.match(new RegExp('(^| )serviarr_lang=([^;]+)'));
    const currentLang = match ? match[2] : 'fr';
    const langSelect = document.getElementById('app-lang');
    if(langSelect) langSelect.value = currentLang;
});

function updateBulkDOM() {
    // 1. On met à jour la visibilité globale des cases à cocher
    document.querySelectorAll('.bulk-select-checkbox').forEach(box => {
        if (bulkSelectMode) box.classList.add('visible');
        else box.classList.remove('visible');

        // 2. On récupère l'ID du média en lisant l'attribut 'onclick' de la case
        const onclickStr = box.getAttribute('onclick') || '';
        const match = onclickStr.match(/toggleBulkSelect\(['"]?([^)'"]+)['"]?\)/);

    if (match && match[1]) {
        const idStr = match[1];
        // Le Set peut contenir des Number (Films/Séries) ou des String (Torrents)
        const isSelected = bulkSelectedIds.has(idStr) || bulkSelectedIds.has(Number(idStr));

        // Met à jour la coche
        const input = box.querySelector('input');
        if (input) input.checked = isSelected;

        // Met à jour la surbrillance de la carte parente
        const card = box.closest('.media-card') || box.closest('.card');
        if (card) {
            if (isSelected) card.classList.add('bulk-selected');
            else card.classList.remove('bulk-selected');
        }
    }
    });
}

// ── AFFICHER / MASQUER MOT DE PASSE ──────────────────────────────────────────
function togglePassword(inputId, iconElement) {
    const input = document.getElementById(inputId);
    if (!input) return;

    if (input.type === 'password') {
        input.type = 'text';
        iconElement.textContent = '🙈';
    } else {
        input.type = 'password';
        iconElement.textContent = '👁️';
    }
}

window.forceSyncNotifs = async function() {
    const syncIndicator = document.getElementById('notif-sync-indicator');
    if (syncIndicator) {
        syncIndicator.style.opacity = '1';
        syncIndicator.style.animation = 'syncPulse 1.2s infinite';
    }
    
    localStorage.removeItem('serviarr_notifs_cache');
    const list = document.getElementById('notif-list');
    if (list) list.innerHTML = `<div style="padding:15px; text-align:center; color:var(--muted); font-size:13px;">${t('notif_loading')}</div>`;
    
    await loadNotifMenuData();
};

async function loadNotifMenuData() {
    const list = document.getElementById('notif-list');
    const syncIndicator = document.getElementById('notif-sync-indicator');
    
    const cached = localStorage.getItem('serviarr_notifs_cache');
    let hasCache = false;
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.length > 0) {
                renderNotifsData(parsed);
                hasCache = true;
            }
        } catch(e) {}
    }
    
    if (!hasCache) {
        list.innerHTML = `<div style="padding:15px; text-align:center; color:var(--muted); font-size:13px;">${t('notif_loading')}</div>`;
    }

    if (syncIndicator) syncIndicator.style.opacity = '1';

    try {
        const r = await api('get_notifications_list', {}, 'GET');
        
        if (!r || r.length === 0) {
            if (!hasCache) list.innerHTML = `<div style="padding:15px; text-align:center; color:var(--muted); font-size:13px;">${t('no_recent_dl')}</div>`;
            return;
        }

        localStorage.setItem('serviarr_notifs_cache', JSON.stringify(r));
        const dropdown = document.getElementById('notif-dropdown');
        if (dropdown && dropdown.style.display === 'block') {
            renderNotifsData(r);
        }
    } catch (e) {
        console.error("Erreur maj notifs", e);
    } finally {
        if (syncIndicator) {
            syncIndicator.style.opacity = '0';
            syncIndicator.style.animation = 'none';
        }
    }
}

// ── EXPORT DE LISTE ───────────────────────────────────────────────────────────
async function openExportListModal(type) {
    let modal = document.getElementById('modal-export-list');
    if (!modal) {
        const modalHtml = `
        <div id="modal-export-list" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:999999; align-items:center; justify-content:center; padding:20px; backdrop-filter:blur(5px);">
        <div style="background:var(--bg2); width:100%; max-width:600px; border:1px solid var(--border); border-radius:12px; display:flex; flex-direction:column; box-shadow:0 10px 40px rgba(0,0,0,0.5); overflow:hidden;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 15px 20px; border-bottom: 1px solid var(--border); background:var(--bg2);">
        <h3 id="export-list-title" style="margin:0; color:var(--text); font-size:18px;">Exporter une liste</h3>
        <span onclick="document.getElementById('modal-export-list').style.display='none'" style="cursor:pointer; color:var(--muted); font-size:24px; line-height:1;">&times;</span>
        </div>
        <div style="padding: 20px; display:flex; flex-direction:column;">
        <p id="export-list-hint" style="color:var(--muted); font-size:13px; margin-bottom:10px;">Chargement en cours...</p>
        <textarea id="export-list-textarea" rows="12" style="width:100%; background:var(--bg3); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:12px; font-size:14px; resize:vertical; font-family:var(--mono);" readonly></textarea>
        
        <div id="export-actions" style="display:flex; gap:10px; margin-top:15px; display:none;">
            <button class="btn-primary" style="flex:1; background:var(--bg3); color:var(--text); border:1px solid var(--border);" onclick="copyExportList()">📋 Copier</button>
            <button class="btn-primary" style="flex:1; background:var(--accent2); color:#000; border:none;" onclick="downloadExportList()">💾 Enregistrer (.txt)</button>
        </div>
        
        </div>
        </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('modal-export-list');
        modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
    }

    // On stocke le type de média pour générer le nom du fichier
    document.getElementById('export-list-textarea').dataset.type = type;

    document.getElementById('export-list-title').textContent = type === 'movie' ? 'Exporter les films' : 'Exporter les séries';
    document.getElementById('export-list-textarea').value = 'Chargement en cours...';
    document.getElementById('export-list-hint').textContent = 'Veuillez patienter pendant la génération de la liste...';
    document.getElementById('export-actions').style.display = 'none';
    modal.style.display = 'flex';

    const r = await api(`export_media_list&type=${type}`, {}, 'GET');
    if (r.error) {
        document.getElementById('export-list-textarea').value = r.error;
        document.getElementById('export-list-hint').textContent = 'Erreur lors de l\'export.';
    } else {
        document.getElementById('export-list-textarea').value = r.text;
        document.getElementById('export-list-hint').textContent = `${r.count} identifiants IMDb exportés avec succès.`;
        document.getElementById('export-actions').style.display = 'flex';
    }
}

function copyExportList() {
    const textarea = document.getElementById('export-list-textarea');
    textarea.select();
    document.execCommand('copy');
    notify('Copié dans le presse-papier !', 'ok');
}

function downloadExportList() {
    const textarea = document.getElementById('export-list-textarea');
    const type = textarea.dataset.type === 'movie' ? 'films' : 'series';
    
    // Génère la date du jour (ex: 2026-07-17)
    const date = new Date().toISOString().split('T')[0];
    const filename = `export_imdb_${type}_${date}.txt`;
    
    // Création du fichier "virtuel" et téléchargement
    const blob = new Blob([textarea.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ── SYSTÈME DE MISE À JOUR ────────────────────────────────────────────────────
async function checkForUpdates() {
    if (!UPDATE_URL || UPDATE_URL.includes('...')) return; // Ignore si non configuré

    try {
        const r = await fetch(UPDATE_URL, { cache: 'no-cache' });
        if (!r.ok) return;
        const data = await r.json();

        // Si la version distante est différente de la version locale
        if (data.version && data.version !== APP_VERSION) {

            // 1. Ajouter un point rouge clignotant sur les boutons "Paramètres"
            const settingsBtns = document.querySelectorAll('[onclick*="settings"]');
            settingsBtns.forEach(btn => {
                if (!btn.querySelector('.update-dot')) {
                    btn.innerHTML += `<span class="update-dot" style="width:8px; height:8px; background:var(--accent3); border-radius:50%; margin-left:auto; box-shadow:0 0 8px var(--accent3); animation: syncPulse 1.5s infinite;"></span>`;
                }
            });

            // 2. Ajouter une belle bannière dans la page des paramètres
            const settingsInner = document.querySelector('.settings-inner');
            if (settingsInner && !document.getElementById('update-banner')) {
                const banner = document.createElement('div');
                banner.id = 'update-banner';
                banner.style = "background:rgba(255,93,143,0.1); border:1px solid rgba(255,93,143,0.3); padding:15px 20px; border-radius:12px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;";
                banner.innerHTML = `
                <div>
                <div style="color:var(--accent3); font-weight:bold; font-size:14px; margin-bottom:4px;">🚀 ${t('update_available')} (${data.version})</div>
                <div style="color:var(--text); font-size:12px; opacity:0.8;">${data.changelog || t('update_changelog_default')}</div>
                </div>
                <a href="${data.url || '#'}" target="_blank" class="btn-sm danger" style="text-decoration:none; padding:8px 16px; border-radius:8px; font-weight:bold;">${t('btn_download_update')}</a>
                `;

                // On insère la bannière juste après le bouton Fermer
                const closeBtn = settingsInner.querySelector('.settings-close-btn');
                if (closeBtn) closeBtn.insertAdjacentElement('afterend', banner);
                else settingsInner.insertBefore(banner, settingsInner.firstChild);
            }
        }
    } catch (e) {
        console.log("Erreur lors de la vérification des mises à jour.");
    }
}

boot();
