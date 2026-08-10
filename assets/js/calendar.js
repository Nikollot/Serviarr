// ===== Serviarr - calendar.js (extrait de script.js) =====

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

        const badge = ev.grabbed ? `<span class="day-event-badge grabbed">✓ ${t('cal_available')}</span>` : `<span class="day-event-badge pending">⏳ ${t('cal_waiting')}</span>`;
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
