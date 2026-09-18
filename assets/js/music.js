// ===== Serviarr - music.js (miroir de series.js pour Lidarr) =====

// Injection automatique du CSS pour forcer UNIQUEMENT les affiches de la librairie à être carrées
(function() {
    if (!document.getElementById('music-custom-styles')) {
        const style = document.createElement('style');
        style.id = 'music-custom-styles';
        style.innerHTML = `
        .music-square-card .media-card-poster { aspect-ratio: 1 / 1 !important; height: auto !important; object-fit: cover !important; }
        .music-square-card .media-card-poster-placeholder { aspect-ratio: 1 / 1 !important; height: auto !important; }
        `;
        document.head.appendChild(style);
    }
})();

async function openArtistDetailByTitle(title) {
    const r = await api('library_artists&q=' + encodeURIComponent(title) + '&filter=all', {}, 'GET');
    const a = (r.artists || []).find(a => a.title === title);
    if (a) {
        sessionStorage.setItem('serviarr_hub_tab', 'calendar');
        window.location.href = 'music.php?artist=' + a.id;
    } else {
        notify(t('err_artist_not_found'), 'err');
    }
}

async function toggleArtistMonitor(artistId, newState, element) {
    element.style.opacity = '0.5';
    const r = await api('toggle_artist_monitor', { artistId: artistId, monitored: newState });
    element.style.opacity = '1';
    if (r.ok) {
        element.innerHTML = r.monitored ? ICON_MONITORED : ICON_UNMONITORED;
        element.onclick = (e) => { e.stopPropagation(); toggleArtistMonitor(artistId, !r.monitored, element); };
        notify(r.monitored ? t('monitor_on') : t('monitor_off'), 'ok');
    } else {
        notify(r.error || t('err_change_failed'), 'err');
    }
}

async function toggleAlbumMonitor(albumId, newState, element) {
    element.style.opacity = '0.5';
    const r = await api('toggle_album_monitor', { albumId: albumId, monitored: newState });
    element.style.opacity = '1';
    if (r.ok) {
        element.innerHTML = r.monitored ? ICON_MONITORED : ICON_UNMONITORED;
        element.onclick = (e) => { e.stopPropagation(); toggleAlbumMonitor(albumId, !r.monitored, element); };
        notify(r.monitored ? t('album_monitored') : t('album_ignored'), 'ok');
    } else {
        notify(r.error || t('err_change_failed'), 'err');
    }
}

function switchToArtistSearch() {
    document.getElementById('music-mode').value = 'search';
    document.getElementById('music-filter').style.display = 'none';
    const input = document.getElementById('music-search');
    input.value = '';
    input.focus();
    input.placeholder = t('search_artist_placeholder') || t('films_filter_placeholder');
    loadArtists();
}

function switchToArtistLibrary() {
    document.getElementById('music-mode').value = 'library';
    document.getElementById('music-filter').style.display = '';
    document.getElementById('music-search').value = '';
    document.getElementById('music-search').placeholder = t('films_filter_placeholder');
    renderFilteredArtists(); // 🌟 SYSTÈME DE CACHE
}

let musicPage = 1;
let musicSearchTimeout;

// 🌟 VARIABLES DU CACHE GLOBAL
let _musicSortCriteria = 'title';
let _musicSortAsc = true;
let _musicSortOpen = false;
let _musicAllData = [];
let _musicDataLoaded = false;

function musicSearchDebounce() { 
    clearTimeout(musicSearchTimeout); 
    const mode = document.getElementById('music-mode').value;
    if (mode === 'search') {
        musicSearchTimeout = setTimeout(() => { loadArtists(); }, 400);
    } else {
        // En mode local, on filtre très vite sans recharger l'API
        musicSearchTimeout = setTimeout(() => { renderFilteredArtists(); }, 200); 
    }
}

function musicReload(forceRefresh = false) { 
    if (forceRefresh) {
        _musicDataLoaded = false; // Force la purge du cache si on supprime un média
        loadArtists();
    } else {
        renderFilteredArtists(); 
    }
}

async function loadArtists() {
    const recentContainer = document.getElementById('dash-recent-music');
    const upcomingContainer = document.getElementById('dash-upcoming-music');

    if (recentContainer || upcomingContainer) {
        if (recentContainer) recentContainer.innerHTML = `<p style="color:var(--muted);">${t('status_loading')}</p>`;
        if (upcomingContainer) upcomingContainer.innerHTML = `<p style="color:var(--muted);">${t('status_loading')}</p>`;

        try {
            const response = await fetch('api.php?action=artists_dashboard');
            const data = await response.json();

            if (!data || data.error) {
                const errMsg = data?.error || t('err_unknown');
                const errHtml = `<p style="color:var(--accent3);">⚠️ ${errMsg}</p>`;
                if (recentContainer) recentContainer.innerHTML = errHtml;
                if (upcomingContainer) upcomingContainer.innerHTML = errHtml;
                return;
            }

            const renderHubRow = (list) => {
                if (!list || list.length === 0) return `<p style="color:var(--muted); font-size:13px; padding:10px;">${t('no_artist_found')}</p>`;
                let html = '<div class="dash-list">';
                list.forEach(ar => {
                    const titleDisplay = typeof esc === 'function' ? esc(ar.title) : ar.title;
                    const titleEsced = titleDisplay.replace(/'/g, "\\'");
                    const clickAction = `sessionStorage.setItem('serviarr_hub_tab', 'music'); window.location.href='music.php?artist=${ar.id}'`;

                    let dateBadge = '';
                    if (ar.release_date) {
                        const relDate = new Date(ar.release_date);
                        if (!isNaN(relDate.getTime())) {
                            const today = new Date();
                            today.setHours(0,0,0,0);
                            relDate.setHours(0,0,0,0);
                            const diffDays = Math.round((relDate - today) / (1000 * 60 * 60 * 24));

                            if (diffDays === 0) {
                                dateBadge = `<div style="position:absolute; top:6px; right:6px; background:var(--lidarr); color:#000; font-size:10px; font-weight:900; padding:3px 6px; border-radius:6px; z-index:10; box-shadow:0 2px 4px rgba(0,0,0,0.5);">${t('date_today')}</div>`;
                            } else if (diffDays > 0 && diffDays <= 30) {
                                dateBadge = `<div style="position:absolute; top:6px; right:6px; background:rgba(0,0,0,0.75); color:#fff; font-size:10px; font-weight:bold; padding:3px 6px; border-radius:6px; z-index:10; border:1px solid rgba(255,255,255,0.2); backdrop-filter:blur(4px);">${t('date_in_days').replace('{n}', diffDays)}</div>`;
                            } else {
                                const dateStr = relDate.toLocaleDateString(currentLocale(), {day: '2-digit', month: '2-digit', year: '2-digit'});
                                dateBadge = `<div style="position:absolute; top:6px; right:6px; background:rgba(0,0,0,0.75); color:#fff; font-size:10px; font-weight:bold; padding:3px 6px; border-radius:6px; z-index:10; border:1px solid rgba(255,255,255,0.2); backdrop-filter:blur(4px);">${dateStr}</div>`;
                            }
                        }
                    }

                    // 🌟 FIX DU DASHBOARD : Proxy garanti à 100%
                    let finalPoster = ar.poster || '';
                    if (finalPoster && finalPoster.toLowerCase().includes('mediacover') && !finalPoster.includes('proxy_image')) {
                        const bustDash = finalPoster.includes('?') ? '&cb=5' : '?cb=5';
                        finalPoster = `api.php?action=proxy_image&url=${encodeURIComponent(finalPoster + bustDash)}`;
                    }

                    html += `
                    <div class="dash-item" onclick="${clickAction}">
                    <div class="dash-poster-wrap" style="position:relative; aspect-ratio:1/1;">
                    ${dateBadge}
                    <img src="${finalPoster}" class="dash-poster" alt="${titleEsced}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" style="object-fit:cover;">
                    <div style="display:none; align-items:center; justify-content:center; width:100%; height:100%; background:var(--bg3); border-radius:10px; border:1px solid var(--border); font-size:24px;">🎵</div>
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
        } catch (err) { }
        return;
    }

    const mode   = document.getElementById('music-mode').value;
    const q      = document.getElementById('music-search').value.trim();
    const filter = document.getElementById('music-filter').value;
    const grid   = document.getElementById('music-grid');
    if(!grid) return;

    if (mode === 'search') {
        grid.innerHTML = Array(12).fill('<div class="media-card music-square-card"><div class="media-card-poster-placeholder">🎵</div><div class="media-card-body"><div class="shimmer" style="height:11px;width:80%;margin-bottom:6px;"></div><div class="shimmer" style="height:10px;width:50%;"></div></div></div>').join('');
        if (!q) { grid.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><h3>${t('search_type_title')}</h3><p>${t('search_type_hint')}</p></div>`; return; }
        document.getElementById('music-filter').style.display = 'none';
        const r = await api(`search_artist&q=${encodeURIComponent(q)}`, {}, 'GET');
        document.getElementById('music-count').textContent = (r.results || []).length + ` ${t('search_results')}`;
        grid.innerHTML = '';
        document.getElementById('music-pagination').innerHTML = '';

        const fragment = document.createDocumentFragment();
        (r.results || []).forEach(a => fragment.appendChild(makeArtistCard(a, true)));
        grid.appendChild(fragment);

    } else {
        if (document.getElementById('music-filter')) document.getElementById('music-filter').style.display = '';
        
        // 🌟 CACHE PERSISTANT
        if (!_musicDataLoaded) {
            
            const localCache = localStorage.getItem('serviarr_music_library');
            if (localCache) {
                try {
                    _musicAllData = JSON.parse(localCache);
                    renderFilteredArtists();
                } catch (e) {}
            } else {
                grid.innerHTML = Array(12).fill('<div class="media-card music-square-card"><div class="media-card-poster-placeholder">🎵</div><div class="media-card-body"><div class="shimmer" style="height:11px;width:80%;margin-bottom:6px;"></div><div class="shimmer" style="height:10px;width:50%;"></div></div></div>').join('');
            }

            api(`library_artists&q=&filter=all`, {}, 'GET').then(r => {
                if (!r.error && r.artists) {
                    const newDataStr = JSON.stringify(r.artists);
                    if (newDataStr !== localStorage.getItem('serviarr_music_library')) {
                        _musicAllData = r.artists;
                        localStorage.setItem('serviarr_music_library', newDataStr);
                        renderFilteredArtists();
                    }
                } else if (r.error && !localCache) {
                    grid.innerHTML = `<div class="empty-state"><div class="icon">❌</div><h3>${t('err_conn_server')}</h3><p>${esc(r.error)}</p></div>`;
                }
            });

            _musicDataLoaded = true;
        } else {
            renderFilteredArtists();
        }
    }
}

// 🌟 MOTEUR DE RENDU ET FILTRAGE 100% LOCAL
function renderFilteredArtists() {
    const grid = document.getElementById('music-grid');
    if (!grid) return;

    const q = document.getElementById('music-search').value.trim().toLowerCase();
    const filter = document.getElementById('music-filter').value;

    let filtered = _musicAllData.filter(a => {
        if (q && !(a.title || '').toLowerCase().includes(q)) return false;
        if (filter === 'complete' && a.pct < 100) return false;
        if (filter === 'incomplete' && a.pct >= 100) return false;
        return true;
    });

    const countEl = document.getElementById('music-count');
    if (countEl) countEl.textContent = filtered.length + ` ${t('count_artists')}`;

    const sorted = applySortToArtists(filtered);

    grid.innerHTML = '';
    const fragment = document.createDocumentFragment();
    sorted.forEach(a => fragment.appendChild(makeArtistCard(a, false)));
    grid.appendChild(fragment);

    const paginationEl = document.getElementById('music-pagination');
    if (paginationEl) paginationEl.innerHTML = '';
}

function makeArtistCard(a, isSearch) {
    const div = document.createElement('div');
    div.className = 'media-card music-square-card';
    const inLib = a.in_lib || false;
    const pct = a.pct ?? null;
    const monitored = a.monitored ?? false;

    // 🌟 FIX PROXY GRILLE BIBLIOTHÈQUE
    let finalPoster = a.poster || '';
    if (finalPoster && finalPoster.toLowerCase().includes('mediacover') && !finalPoster.includes('proxy_image')) {
        const bustPoster = finalPoster.includes('?') ? '&cb=5' : '?cb=5';
        finalPoster = `api.php?action=proxy_image&url=${encodeURIComponent(finalPoster + bustPoster)}`;
    }

    const addBtn = isSearch && !inLib ? `<button class="btn-add" onclick="event.stopPropagation();promptAddMedia('artist', '${esc(a.mbId)}', '${esc(a.title).replace(/'/g,"\\'").replace(/"/g,'&quot;')}', this, 'mb')">＋</button>` : '';
    const albumsBadge = !isSearch ? `<span style="font-size:10px;color:var(--lidarr)">${a.albumCount} alb.</span>` : (inLib ? '<span class="pill" style="font-size:10px; background:var(--lidarr-bg); color:var(--lidarr); border:1px solid var(--lidarr-border);">✓</span>' : '');
    const progressBar = (!isSearch && pct !== null) ? `<div class="progress-bar" style="margin-top:5px"><div class="progress-fill" style="width:${pct}%;background:var(--lidarr)"></div></div>` : '';
    const poster = finalPoster ? `<img class="media-card-poster" src="${esc(finalPoster)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : '';
    const placeholder = `<div class="media-card-poster-placeholder" style="${finalPoster?'display:none':''}">🎵</div>`;

    if (!isSearch) {
        div.setAttribute('ontouchstart', `startLongPress(${a.id})`);
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
            if (bulkSelectMode) { e.stopPropagation(); toggleBulkSelect(a.id); return; }
            openArtistDetail(a.id);
        });
    }
    else if (inLib) div.addEventListener('click', () => openArtistDetailByTitle(a.title));
    else if (a.mbId) div.addEventListener('click', () => openMbArtistDetail(a.mbId));

    if (!monitored && !isSearch) div.classList.add('unmonitored');
    const bulkCheckbox = (!isSearch) ? `
    <div class="bulk-select-checkbox ${bulkSelectMode ? 'visible' : ''}" onclick="event.stopPropagation(); toggleBulkSelect(${a.id})">
    <input type="checkbox" ${bulkSelectedIds.has(a.id) ? 'checked' : ''} readonly>
    </div>` : '';
    if (bulkSelectedIds.has(a.id)) div.classList.add('bulk-selected');

    div.innerHTML = `
    ${bulkCheckbox}
    ${poster}${placeholder}
    <div class="monitored-badge">${!isSearch ? `<div class="monitored-badge" style="cursor:pointer;" onclick="event.stopPropagation(); toggleArtistMonitor(${a.id}, ${!monitored}, this)">${monitored ? ICON_MONITORED : ICON_UNMONITORED}</div>` : ''}</div>
    <div class="media-card-strip">
    <div class="media-card-strip-title">${esc(a.title)}</div>
    <div class="media-card-strip-meta">
    ${albumsBadge}
    ${pct !== null ? `<span style="color:var(--lidarr);font-size:10px">${pct}%</span>` : ''}
    </div>
    </div>
    <div class="media-card-overlay">
    <div class="media-card-title">${esc(a.title)}</div>
    <div class="media-card-footer" style="display:flex;align-items:center;">${albumsBadge} ${addBtn}</div>
    ${progressBar}
    </div>
    <div class="media-card-body">
    <div class="media-card-title" style="display:flex;align-items:center;gap:6px;">
    <span style="color:var(--lidarr);flex-shrink:0;" title="${monitored ? t('badge_monitored') : t('badge_unmonitored')}">${monitored ? ICON_MONITORED : ICON_UNMONITORED}</span>
    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(a.title)}</span>
    </div>
    <div class="media-card-footer" style="margin-top:4px;display:flex;align-items:center;">${albumsBadge} ${addBtn}</div>
    ${progressBar}
    </div>`;
    return div;
}

function musicGoPage(p) { musicPage = p; loadArtists(); window.scrollTo(0,0); }

function toggleMusicSort() {
    _musicSortOpen = !_musicSortOpen;
    const menu = document.getElementById('music-sort-menu');
    if (menu) menu.classList.toggle('open', _musicSortOpen);
}

function renderMusicGridOnly() {
    renderFilteredArtists();
}

function sortArtists(criteria) {
    if (_musicSortCriteria === criteria) {
        _musicSortAsc = !_musicSortAsc;
    } else {
        _musicSortCriteria = criteria;
        _musicSortAsc = (criteria === 'title');
    }

    const sel = document.getElementById('music-sort-select');
    if (sel) sel.value = criteria;

    renderFilteredArtists();
}

function applySortToArtists(artists) {
    const dir = _musicSortAsc ? 1 : -1;
    return artists.sort((a, b) => {
        switch (_musicSortCriteria) {
            case 'title':      return dir * (a.title || '').localeCompare(b.title || '', 'fr', {sensitivity: 'base'});
            case 'monitored':  return dir * ((a.monitored ? 1 : 0) - (b.monitored ? 1 : 0));
            case 'albumCount': return dir * ((a.albumCount || 0) - (b.albumCount || 0));
            case 'pct':        return dir * ((a.pct || 0) - (b.pct || 0));
            default:           return 0;
        }
    });
}

document.addEventListener('click', e => {
    if (_musicSortOpen && !e.target.closest('.lib-sort-wrap')) {
        _musicSortOpen = false;
        const m = document.getElementById('music-sort-menu');
        if (m) m.classList.remove('open');
    }
});

function openMobileArtistMenu() {
    const overlay = document.getElementById('mobile-artist-menu-overlay');
    const sheet = document.getElementById('mobile-artist-menu');
    if(overlay && sheet) {
        overlay.classList.add('open');
        setTimeout(() => sheet.classList.add('open'), 10);
        document.body.style.overflow = 'hidden';
    }
}

function closeMobileArtistMenu() {
    const overlay = document.getElementById('mobile-artist-menu-overlay');
    const sheet = document.getElementById('mobile-artist-menu');
    if(overlay && sheet) {
        sheet.classList.remove('open');
        setTimeout(() => {
            overlay.classList.remove('open');
            document.body.style.overflow = '';
        }, 300);
    }
}

document.addEventListener('click', e => {
    const overlay = document.getElementById('mobile-artist-menu-overlay');
    if (overlay && e.target === overlay) {
        closeMobileArtistMenu();
    }
});