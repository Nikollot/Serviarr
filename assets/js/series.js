// ===== Serviarr - series.js (extrait de script.js) =====

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

                    // 🌟 AJOUT : Calcul du temps restant avant la diffusion
                    let dateBadge = '';
                    if (sr.release_date) {
                        const relDate = new Date(sr.release_date);
                        if (!isNaN(relDate.getTime())) {
                            const today = new Date();
                            today.setHours(0,0,0,0);
                            relDate.setHours(0,0,0,0);

                            const diffDays = Math.round((relDate - today) / (1000 * 60 * 60 * 24));

                            if (diffDays === 0) {
                                // Badge jaune Radarr remplacé par le badge bleu Sonarr
                                dateBadge = `<div style="position:absolute; top:6px; right:6px; background:var(--sonarr); color:#000; font-size:10px; font-weight:900; padding:3px 6px; border-radius:6px; z-index:10; box-shadow:0 2px 4px rgba(0,0,0,0.5);">${t('date_today')}</div>`;
                            } else if (diffDays > 0 && diffDays <= 30) {
                                dateBadge = `<div style="position:absolute; top:6px; right:6px; background:rgba(0,0,0,0.75); color:#fff; font-size:10px; font-weight:bold; padding:3px 6px; border-radius:6px; z-index:10; border:1px solid rgba(255,255,255,0.2); backdrop-filter:blur(4px);">${t('date_in_days').replace('{n}', diffDays)}</div>`;
                            } else {
                                // Gère les dates > 30 jours ET les dates passées (< 0)
                                const dateStr = relDate.toLocaleDateString(currentLocale(), {day: '2-digit', month: '2-digit', year: '2-digit'});
                                dateBadge = `<div style="position:absolute; top:6px; right:6px; background:rgba(0,0,0,0.75); color:#fff; font-size:10px; font-weight:bold; padding:3px 6px; border-radius:6px; z-index:10; border:1px solid rgba(255,255,255,0.2); backdrop-filter:blur(4px);">${dateStr}</div>`;
                            }
                        }
                    }

                    html += `
                    <div class="dash-item" onclick="${clickAction}">
                    <div class="dash-poster-wrap" style="position:relative;">
                    ${badge}
                    ${dateBadge}
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
    // 🌟 Le badge de poids avec la puce :
    const sizeBadge = s.sizeOnDisk > 0 ? `<span style="font-size:10px;color:var(--muted);font-weight:600;margin-left:4px;">${s.sizeOnDisk} GB</span>` : '';
    const networkBadge = s.network ? `<span style="font-size:10px;color:var(--muted)">${esc(s.network)}</span>` : '';
    const progressBar = (!isSearch && pct !== null) ? `<div class="progress-bar" style="margin-top:5px"><div class="progress-fill" style="width:${pct}%;background:var(--sonarr)"></div></div>` : '';
    const poster = s.poster ? `<img class="media-card-poster" src="${esc(s.poster)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : '';
    const placeholder = `<div class="media-card-poster-placeholder" style="${s.poster?'display:none':''}">📺</div>`;
    const fanartHtml = (!isSearch && s.fanart) ? `<img class="media-card-bg-mobile" src="${esc(s.fanart)}" loading="lazy">` : '';

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
    ${fanartHtml} <!-- 🌟 Fanart placé à la racine pour couvrir toute la carte -->
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
    <div class="media-card-footer" style="display:flex;align-items:center;">${seasonsBadge} ${sizeBadge} ${addBtn}</div>
    ${progressBar}
    </div>
    <div class="media-card-body">
    <div class="media-card-title" style="display:flex;align-items:center;gap:6px;">
    <span style="color:var(--sonarr);flex-shrink:0;" title="${monitored ? t('badge_monitored') : t('badge_unmonitored')}">${monitored ? ICON_MONITORED : ICON_UNMONITORED}</span>
    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.title)}</span>
    </div>
    <div class="media-card-meta">${s.year || ''}${s.rating ? ' · ⭐ ' + s.rating : ''}${s.network ? ' · ' + esc(s.network) : ''}</div>
    <div class="media-card-footer" style="margin-top:4px;display:flex;align-items:center;">${seasonsBadge} ${sizeBadge} ${addBtn}</div>
    ${progressBar}
    </div>`;
    return div;
}

function seriesGoPage(p) { seriesPage = p; loadSeries(); window.scrollTo(0,0); }

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

    // 🌟 CORRECTION ICI : On englobe tout dans UNE SEULE <div> principale pour éviter le bug CSS
    const backBtn = `
    <div style="padding: 20px; background: var(--bg2); width: 100%; box-sizing: border-box; border-radius: 12px;">
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;">
    <button onclick="closeSeasonView()" style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:8px 16px; border-radius:8px; cursor:pointer; font-size:14px; display:flex; align-items:center; gap:6px;">
    ‹ ${t('detail_back')}
    </button>
    <span style="font-weight:700; font-size:18px;">${seasonTitle}</span>
    </div>
    <div style="display:flex; flex-direction:column; gap:0; background:var(--bg3); border:1px solid var(--border); border-radius:12px; overflow:hidden;">
    ${epsContent}
    </div>
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
        _seriesSortAsc = (criteria === 'title' || criteria === 'network' || criteria === 'status' || criteria === 'nextAiring');
    }

    // Met à jour la liste déroulante
    const sel = document.getElementById('series-sort-select');
    if (sel) sel.value = criteria;

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
                let cardClickAction = '';

                if (mv.inLib) {
                    if (mv.hasFile) {
                        statusBadge = `<span style="background:var(--accent2); color:#000; font-size:9px; padding:3px 6px; border-radius:6px; font-weight:bold; display:inline-block;">✓ ${t('cal_avail_short')}</span>`;
                    } else {
                        statusBadge = `<span style="background:#ffa03c; color:#000; font-size:9px; padding:3px 6px; border-radius:6px; font-weight:bold; display:inline-block;">⏳ ${t('cal_wait_short')}</span>`;
                    }
                    const closeAndOpenAction = mv.media_type === 'movie'
                    ? `window._returnToActor = currentActiveActor; closeActorModal(); closeAnyFullscreenDetail(); openMovieDetail(${mv.localId});`
                    : `window._returnToActor = currentActiveActor; closeActorModal(); closeAnyFullscreenDetail(); openSerieDetail(${mv.localId});`;
                    cardClickAction = closeAndOpenAction;
                    actionButton = `<button class="actor-card-btn" onclick="event.stopPropagation(); ${closeAndOpenAction}">${t('detail_back')}</button>`;
                } else {
                    statusBadge = `<span style="background:var(--bg3); border:1px solid var(--border); color:var(--muted); font-size:9px; padding:3px 6px; border-radius:6px; font-weight:bold; display:inline-block;">${t('badge_unmonitored')}</span>`;

                    const mediaTypeParam = mv.media_type === 'movie' ? 'movie' : 'serie';
                    const titleEsced = esc(mv.title).replace(/'/g, "\\'");
                    const closeAndOpenTmdb = mv.media_type === 'movie'
                    ? `window._returnToActor = currentActiveActor; closeActorModal(); closeAnyFullscreenDetail(); openTmdbMovieDetail(${mv.tmdbId});`
                    : `window._returnToActor = currentActiveActor; closeActorModal(); closeAnyFullscreenDetail(); openTmdbSerieDetail(${mv.tmdbId});`;
                    cardClickAction = closeAndOpenTmdb;
                    actionButton = `<button class="actor-card-btn primary" onclick="event.stopPropagation(); promptAddMedia('${mediaTypeParam}', ${mv.tmdbId}, '${titleEsced}', this, 'tmdb')">＋ ${t('films_add')}</button>`;
                }

                const posterImg = mv.poster
                ? `<img src="${mv.poster}" class="actor-card-poster" loading="lazy">`
                : `<div class="actor-card-ph">${mv.media_type === 'movie' ? '🎬' : '📺'}</div>`;

                return `
                <div class="actor-card" style="cursor:pointer;" onclick="${cardClickAction}">
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
