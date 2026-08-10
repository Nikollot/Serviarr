// ===== Serviarr - movies.js (extrait de script.js) =====

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

let moviesSearchTimeout;

function moviesSearchDebounce() { clearTimeout(moviesSearchTimeout); moviesSearchTimeout = setTimeout(() => { loadMovies(); }, 400); }

function moviesReload() { loadMovies(); }

async function loadMovies() {
    const recentContainer = document.getElementById('dash-recent-movies');
    const upcomingContainer = document.getElementById('dash-upcoming-movies');
    const physicalContainer = document.getElementById('dash-upcoming-physical-movies'); // 🌟 AJOUT
    const recoContainer = document.getElementById('dash-reco-movies');
    const popularContainer = document.getElementById('dash-popular-movies');

    if (recentContainer || upcomingContainer || physicalContainer || recoContainer || popularContainer) {
        if (recentContainer) recentContainer.innerHTML = `<p style="color:var(--muted);">${t('status_loading')}</p>`;
        if (upcomingContainer) upcomingContainer.innerHTML = `<p style="color:var(--muted);">${t('status_loading')}</p>`;
        if (physicalContainer) physicalContainer.innerHTML = `<p style="color:var(--muted);">${t('status_loading')}</p>`; // 🌟 AJOUT
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
                if (physicalContainer) physicalContainer.innerHTML = errHtml; // 🌟 AJOUT
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

                    // 🌟 AJOUT : Calcul du temps restant avant la sortie
                    let dateBadge = '';
                    if (mv.release_date) {
                        const relDate = new Date(mv.release_date);
                        if (!isNaN(relDate.getTime())) {
                            const today = new Date();
                            today.setHours(0,0,0,0);
                            relDate.setHours(0,0,0,0);

                            const diffDays = Math.round((relDate - today) / (1000 * 60 * 60 * 24));

                            if (diffDays === 0) {
                                dateBadge = `<div style="position:absolute; top:6px; right:6px; background:var(--radarr); color:#000; font-size:10px; font-weight:900; padding:3px 6px; border-radius:6px; z-index:10; box-shadow:0 2px 4px rgba(0,0,0,0.5);">${t('date_today')}</div>`;
                            } else if (diffDays > 0 && diffDays <= 30) {
                                dateBadge = `<div style="position:absolute; top:6px; right:6px; background:rgba(0,0,0,0.75); color:#fff; font-size:10px; font-weight:bold; padding:3px 6px; border-radius:6px; z-index:10; border:1px solid rgba(255,255,255,0.2); backdrop-filter:blur(4px);">${t('date_in_days').replace('{n}', diffDays)}</div>`;
                            } else {
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
                if (physicalContainer) physicalContainer.innerHTML = ''; // 🌟 AJOUT
                if (popularContainer) popularContainer.innerHTML = '';
            } else {
                if (upcomingContainer && data.upcoming) upcomingContainer.innerHTML = renderHubRow(data.upcoming);
                if (physicalContainer && data.upcoming_physical) physicalContainer.innerHTML = renderHubRow(data.upcoming_physical); // 🌟 AJOUT
                if (recoContainer && data.reco) recoContainer.innerHTML = renderHubRow(data.reco);
                if (popularContainer && data.popular) popularContainer.innerHTML = renderHubRow(data.popular);
            }
        } catch (err) {
            const failMsg = `<p style="color:var(--accent3);">⚠️ ${t('err_conn_server')}</p>`;
            if (recentContainer) recentContainer.innerHTML = failMsg;
            if (upcomingContainer) upcomingContainer.innerHTML = failMsg;
            if (physicalContainer) physicalContainer.innerHTML = failMsg; // 🌟 AJOUT
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
    // 🌟 Le badge de poids avec la puce :
    const sizeBadge = mv.sizeOnDisk > 0 ? `<span style="font-size:10px;color:var(--muted);font-weight:600;margin-left:4px;">${mv.sizeOnDisk} GB</span>` : '';
    const poster = mv.poster ? `<img class="media-card-poster" src="${esc(mv.poster)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : '';
    const placeholder = `<div class="media-card-poster-placeholder" style="${mv.poster?'display:none':''}">🎬</div>`;
    const fanartHtml = (!isSearch && mv.fanart) ? `<img class="media-card-bg-mobile" src="${esc(mv.fanart)}" loading="lazy">` : '';

    if (!isSearch) {
        div.setAttribute('ontouchstart', `startLongPress(${mv.id})`);
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
    ${fanartHtml} <!-- 🌟 Fanart placé à la racine pour couvrir toute la carte -->
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
    <div class="media-card-footer" style="display:flex;align-items:center;">${qualityBadge} ${statusPill} ${sizeBadge} ${addBtn}</div>
    </div>
    <div class="media-card-body">
    <div class="media-card-title" style="display:flex;align-items:center;gap:6px;">
    <span style="color:var(--radarr);flex-shrink:0;" title="${monitored ? t('badge_monitored') : t('badge_unmonitored')}">${monitored ? ICON_MONITORED : ICON_UNMONITORED}</span>
    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(mv.title)}</span>
    </div>
    <div class="media-card-meta">${mv.year || ''}${mv.rating ? ' · ⭐ ' + mv.rating : ''}</div>
    <div class="media-card-footer" style="margin-top:4px;display:flex;align-items:center;">${qualityBadge} ${statusPill} ${sizeBadge} ${addBtn}</div>
    </div>`;
    return div;
}

function moviesGoPage(p) { moviesPage = p; loadMovies(); window.scrollTo(0,0); }

let currentActiveCollection = null;

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
        const badge       = notInLib ? `<div class="not-planned-badge" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.75);border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:10px;color:var(--muted);">${t('not_planned')}</div>` : '';
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
        ? `<button class="btn-pill" onclick="promptAddCollection('${esc(collectionTitle).replace(/'/g, "\\'")}')" style="font-weight:bold; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:13px;">＋ ${t('collection_add_btn')} (${window.currentCollectionUnmonitored.length})</button>`
        : `<span style="color:var(--accent2); font-weight:bold; font-size:12px; padding:4px 8px; background:rgba(93,255,214,0.1); border-radius:6px; border:1px solid rgba(93,255,214,0.3);">✓ ${t('collection_complete')}</span>`
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
        <div style="color:var(--text); font-weight:bold; margin-bottom:5px;">${t('col_adding_progress').replace('{n}', i+1).replace('{total}', total)}</div>
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
    notify(`${t('collection_added_success')} : ${successCount}/${total} ${t('word_movies').toLowerCase()}`, 'ok');

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

    // Met à jour la liste déroulante au cas où on inverse le tri sans changer de critère
    const sel = document.getElementById('movies-sort-select');
    if (sel) sel.value = criteria;

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

async function viewCollections() {
    let modal = document.getElementById('modal-collections');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-collections';
        modal.className = 'modal-bg';
        modal.style.zIndex = '10005';
        document.body.appendChild(modal);
        modal.addEventListener('click', e => {
            if (e.target === modal) modal.classList.remove('open');
        });
    }

    modal.innerHTML = `
    <div class="modal-box" style="width: clamp(420px, 90vw, 720px); max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column; padding: 0; overflow: hidden; background: var(--bg); border-radius: 16px;">
        
        <div style="padding: 15px 20px; display: flex; align-items: center; gap: 15px; background: var(--bg2);">
            <button onclick="document.getElementById('modal-collections').classList.remove('open');" style="background:none; border:none; color:var(--text); font-size:24px; cursor:pointer;">←</button>
            <div style="flex:1; position:relative;">
                <input type="text" id="col-search-input" placeholder="${t('col_search_placeholder')}" oninput="renderFilteredCollections()" style="width:100%; background:var(--bg3); border:1px solid var(--border); border-radius:24px; padding:12px 18px; color:var(--text); outline:none; font-size:14px;">
            </div>
        </div>
        
        <div style="display:flex; justify-content:space-around; background:var(--bg2); border-bottom: 1px solid var(--border); padding: 5px 10px 15px 10px;">
            <button class="col-filter-btn active" data-filter="all" onclick="setColFilter('all', this)" style="background:rgba(255, 193, 50, 0.15); color:var(--radarr); border:none; padding:8px 24px; border-radius:20px; font-weight:bold; cursor:pointer; font-size:13px;">${t('col_filter_all')}</button>
            <button class="col-filter-btn" data-filter="missing" onclick="setColFilter('missing', this)" style="background:none; color:var(--muted); border:none; padding:8px 24px; border-radius:20px; font-weight:bold; cursor:pointer; font-size:13px;">${t('col_filter_missing')}</button>
            <button class="col-filter-btn" data-filter="complete" onclick="setColFilter('complete', this)" style="background:none; color:var(--muted); border:none; padding:8px 24px; border-radius:20px; font-weight:bold; cursor:pointer; font-size:13px;">${t('col_filter_complete')}</button>
        </div>

        <div id="collections-content" style="padding: 20px; overflow-y: auto; flex: 1; display: block; background:var(--bg);">
            <div style="text-align:center; padding:40px; color:var(--muted);">⏳ ${t('loading')}</div>
        </div>
    </div>`;
    modal.classList.add('open');

    const r = await api('get_all_collections', {}, 'GET');
    const content = document.getElementById('collections-content');
    
    if (r.error) {
        content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>${t('notif_error')}</h3><p>${esc(r.error)}</p></div>`;
        return;
    }

    window._allCollectionsCache = r.collections || [];
    window._currentColFilter = 'all';
    renderFilteredCollections();
}

window.setColFilter = function(filter, btn) {
    window._currentColFilter = filter;
    document.querySelectorAll('.col-filter-btn').forEach(b => {
        b.classList.remove('active');
        b.style.background = 'none';
        b.style.color = 'var(--muted)';
    });
    btn.classList.add('active');
    btn.style.background = 'rgba(255, 193, 50, 0.15)';
    btn.style.color = 'var(--radarr)';
    renderFilteredCollections();
}

window.renderFilteredCollections = function() {
    const query = (document.getElementById('col-search-input').value || '').toLowerCase().trim();
    const content = document.getElementById('collections-content');
    const collections = window._allCollectionsCache;

    if (!collections || collections.length === 0) {
        content.innerHTML = `<div class="empty-state"><div class="icon">📚</div><h3>${t('col_none_found')}</h3></div>`;
        return;
    }

    const filtered = collections.filter(c => {
        if (query && !c.title.toLowerCase().includes(query)) return false;
        if (window._currentColFilter === 'missing' && c.inLibCount >= c.totalMovies) return false;
        if (window._currentColFilter === 'complete' && c.inLibCount < c.totalMovies) return false;
        return true;
    });

    if (filtered.length === 0) {
        content.innerHTML = `<div style="text-align:center; padding:40px; color:var(--muted);">${t('no_result')}</div>`;
        return;
    }

    const iconMonitoredSVG = ICON_MONITORED.replace(/width:\s*18px;\s*height:\s*18px;/, 'width: 14px; height: 14px;');
    const iconUnmonitoredSVG = ICON_UNMONITORED.replace(/width:\s*18px;\s*height:\s*18px;/, 'width: 14px; height: 14px;');

    let html = '';
    filtered.forEach(c => {
        const isComplete = c.inLibCount === c.totalMovies;
        const subtitleColor = isComplete ? 'var(--accent)' : 'var(--muted)';
        const subtitleText = isComplete 
            ? t('col_all_movies').replace('{total}', c.totalMovies) 
            : t('col_movies_in_lib').replace('{n}', c.inLibCount).replace('{total}', c.totalMovies);
        
        const colMonitorIcon = c.monitored ? iconMonitoredSVG : iconUnmonitoredSVG;
        
        let moviesHtml = '';
        (c.movies || []).forEach(m => {
            let overlayHtml = '';
            let yearColor = 'var(--muted)';
            let posterOpacity = '1';

            if (!m.inLib) {
                overlayHtml = `<div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.7); color:var(--muted); font-size:8px; text-align:center; padding:3px 0; font-weight:bold;">${t('col_not_added')}</div>`;
                posterOpacity = '0.4';
            } else {
                yearColor = 'var(--radarr)';
                const sizeStr = m.sizeOnDisk > 0 ? `${m.sizeOnDisk} GB` : '';
                const smallIcon = ICON_MONITORED.replace(/width:\s*18px;\s*height:\s*18px;/, 'width: 8px; height: 8px;').replace(/color:\s*var\(--accent\);/, 'color: var(--muted);');
                
                overlayHtml = `
                <div style="position:absolute; top:4px; left:4px; background:rgba(0,0,0,0.75); padding:2px 4px; border-radius:4px; display:flex; align-items:center; gap:3px; font-size:8px; font-weight:bold;">
                    <span style="display:flex; align-items:center;">${smallIcon}</span>
                    ${m.hasFile ? `<span style="color:var(--accent);">✓ ${sizeStr}</span>` : `<span style="color:#ffa03c;">⏳</span>`}
                </div>`;
            }

            moviesHtml += `
            <div style="display:flex; flex-direction:column; gap:4px; width:65px; flex-shrink:0; cursor:pointer;" onclick="document.getElementById('modal-collections').classList.remove('open'); makeFullscreenView('modal-movie', 'movie-detail-content'); openMovieCollection('${esc(c.title).replace(/'/g, "\\'")}', 0, ${c.tmdbId});">
                <div style="position:relative; width:100%; aspect-ratio:2/3; border-radius:6px; overflow:hidden; border:1px solid rgba(255,255,255,0.05); background:var(--bg3);">
                    ${m.poster ? `<img src="${esc(m.poster)}" style="width:100%; height:100%; object-fit:cover; opacity:${posterOpacity};">` : `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:16px; opacity:${posterOpacity};">🎬</div>`}
                    ${overlayHtml}
                </div>
                <div style="text-align:center; font-size:10px; font-weight:bold; color:${yearColor};">${m.year || ''}</div>
            </div>`;
        });

        const bgImage = c.fanart ? `url('${esc(c.fanart)}')` : 'none';

        html += `
        <div style="position:relative; border-radius:12px; overflow:hidden; background:var(--bg2); border:1px solid var(--border); margin-bottom: 12px; flex-shrink: 0;">
            <div style="position:absolute; inset:0; background-image:${bgImage}; background-size:cover; background-position:center; opacity:0.25;"></div>
            <div style="position:absolute; inset:0; background:linear-gradient(to right, var(--bg2) 0%, rgba(19,22,30,0.85) 60%, transparent 100%);"></div>
            
            <div style="position:relative; z-index:10; padding:10px 12px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                    <div style="display:flex; gap:8px; align-items:flex-start;">
                        <span style="margin-top:2px; display:flex;">${colMonitorIcon}</span>
                        <div>
                            <h4 style="margin:0 0 2px 0; font-size:14px; color:var(--text); font-weight:bold;">${esc(c.title)}</h4>
                            <div style="font-size:10px; font-weight:600; color:${subtitleColor};">${subtitleText}</div>
                        </div>
                    </div>
                    <button style="background:none; border:none; color:var(--muted); font-size:16px; cursor:pointer; padding:0 4px;" onclick="event.stopPropagation(); openCollectionBottomSheet(${c.tmdbId});">⋮</button>
                </div>

                <div style="display:flex; gap:8px; overflow-x:auto; padding-bottom:4px; scrollbar-width:none;">
                    ${moviesHtml}
                </div>
            </div>
        </div>`;
    });

    content.innerHTML = html;
}

    window.openCollectionBottomSheet = function(tmdbId) {
        const c = window._allCollectionsCache.find(x => x.tmdbId === tmdbId);
        if (!c) return;

        let sheet = document.getElementById('col-menu-sheet');
        let overlay = document.getElementById('col-menu-overlay');

        if (!sheet) {
            const html = `
            <div class="mobile-menu-overlay" id="col-menu-overlay" onclick="closeCollectionBottomSheet()" style="z-index:100006;"></div>
            <div class="mobile-bottom-sheet" id="col-menu-sheet" style="z-index:100007; padding:0; background:var(--bg2); display:flex; flex-direction:column; max-height:90vh; border-radius: 24px 24px 0 0;">
                <div id="col-menu-content" style="overflow-y:auto; padding:20px;"></div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', html);
            sheet = document.getElementById('col-menu-sheet');
            overlay = document.getElementById('col-menu-overlay');
        }

        const missingCount = c.totalMovies - c.inLibCount;
        const inLibIds = [];
        window.currentCollectionUnmonitored = [];

        let moviesHtml = '';
        (c.movies || []).forEach(m => {
            if (m.inLib && m.id) inLibIds.push(m.id);
            if (!m.inLib) window.currentCollectionUnmonitored.push(m);

            let overlayHtml = '';
            let posterOpacity = '1';

            if (!m.inLib) {
                overlayHtml = `<div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.7); color:var(--muted); font-size:9px; text-align:center; padding:4px 0; font-weight:bold;">${t('col_not_added')}</div>`;
                posterOpacity = '0.4';
            } else {
                const sizeStr = m.sizeOnDisk > 0 ? `${m.sizeOnDisk} GB` : '';
                const smallIcon = ICON_MONITORED.replace(/width:\s*18px;\s*height:\s*18px;/, 'width: 9px; height: 9px;').replace(/color:\s*var\(--accent\);/, 'color: var(--muted);');
                overlayHtml = `
                <div style="position:absolute; top:4px; left:4px; background:rgba(0,0,0,0.75); padding:2px 5px; border-radius:5px; display:flex; align-items:center; gap:4px; font-size:9px; font-weight:bold;">
                    <span style="display:flex; align-items:center;">${smallIcon}</span>
                    ${m.hasFile ? `<span style="color:var(--accent);">✓ ${sizeStr}</span>` : `<span style="color:#ffa03c;">⏳</span>`}
                </div>`;
            }

            moviesHtml += `
            <div style="display:flex; flex-direction:column; gap:6px; width:80px; flex-shrink:0;">
                <div style="position:relative; width:100%; aspect-ratio:2/3; border-radius:8px; overflow:hidden; border:1px solid rgba(255,255,255,0.05); background:var(--bg3);">
                    ${m.poster ? `<img src="${esc(m.poster)}" style="width:100%; height:100%; object-fit:cover; opacity:${posterOpacity};">` : `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:20px; opacity:${posterOpacity};">🎬</div>`}
                    ${overlayHtml}
                </div>
                <div style="text-align:center; font-size:11px; font-weight:bold; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(m.title)}">${esc(m.title)}</div>
                <div style="text-align:center; font-size:10px; font-weight:bold; color:var(--radarr);">${m.year || ''}</div>
            </div>`;
        });

        const safeTitle = esc(c.title).replace(/'/g, "\\'");
        const idsJson = JSON.stringify(inLibIds).replace(/"/g, '&quot;');

        const monitorIconSVG = c.monitored 
            ? ICON_MONITORED.replace(/width:\s*18px;\s*height:\s*18px;/, 'width: 20px; height: 20px;') 
            : ICON_UNMONITORED.replace(/width:\s*18px;\s*height:\s*18px;/, 'width: 20px; height: 20px;');

        const content = document.getElementById('col-menu-content');
        content.innerHTML = `
            <div style="width: 40px; height: 5px; background: var(--border); border-radius: 5px; margin: 0 auto 20px auto;"></div>
            
            <div style="display:flex; gap:15px; margin-bottom:15px;">
                <div style="width: 60px; height: 90px; flex-shrink:0; border-radius:8px; overflow:hidden; border:1px solid var(--border); background:var(--bg3);">
                    ${c.poster ? `<img src="${esc(c.poster)}" style="width:100%; height:100%; object-fit:cover;">` : `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:24px;">🎬</div>`}
                </div>
                <div style="flex:1;">
                    <h2 style="margin:0 0 6px 0; font-size:18px; color:var(--text); font-weight:bold; line-height:1.2;">${esc(c.title)}</h2>
                    <p style="font-size:12px; color:var(--muted); line-height:1.4; margin:0; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">${esc(c.overview || t('col_no_overview'))}</p>
                </div>
            </div>

            <div style="font-size:12px; font-weight:bold; color:var(--muted); margin-bottom:10px;">
                ${t('col_movies_in_lib').replace('{n}', c.inLibCount).replace('{total}', c.totalMovies)}
            </div>

            <div style="display:flex; gap:10px; overflow-x:auto; padding-bottom:15px; scrollbar-width:none; border-bottom:1px solid var(--border); margin-bottom:15px;">
                ${moviesHtml}
            </div>

            <div style="display:flex; flex-direction:column; gap:10px;">
                <button class="sheet-btn" onclick="closeCollectionBottomSheet(); toggleCollectionMonitor(${c.id}, '${idsJson}', ${!c.monitored})">
                    <span style="width:30px; display:flex; align-items:center; justify-content:center;">${monitorIconSVG}</span> ${t('col_action_monitoring')}
                </button>
                <button class="sheet-btn" onclick="closeCollectionBottomSheet(); promptCollectionQuality(${c.id}, ${c.qualityProfileId || 0}, '${idsJson}')">
                    <span style="color:var(--radarr); width:30px; text-align:center; font-size:18px; font-weight:bold; font-family:var(--mono);">HQ</span> ${t('col_action_quality')}
                </button>
                <button class="sheet-btn" onclick="closeCollectionBottomSheet(); promptAddCollection('${safeTitle}')" ${missingCount === 0 ? 'disabled style="opacity:0.5"' : ''}>
                    <span style="color:var(--radarr); width:30px; text-align:center; font-size:18px;">➕</span> ${t('col_action_add_missing')}
                </button>
                <button class="sheet-btn danger" onclick="closeCollectionBottomSheet(); removeCollectionMovies('${idsJson}', '${safeTitle}')">
                    <span style="color:var(--accent3); width:30px; text-align:center; font-size:18px;">🗑️</span> ${t('col_action_remove')}
                </button>
            </div>
        `;

        overlay.style.display = 'block';
        sheet.style.display = 'flex';
        setTimeout(() => { overlay.classList.add('open'); sheet.classList.add('open'); }, 10);
    }

    window.closeCollectionBottomSheet = function() {
        const sheet = document.getElementById('col-menu-sheet');
        const overlay = document.getElementById('col-menu-overlay');
        if (sheet && overlay) {
            sheet.classList.remove('open');
            overlay.classList.remove('open');
            setTimeout(() => { sheet.style.display = 'none'; overlay.style.display = 'none'; }, 300);
        }
    }

    window.toggleCollectionMonitor = async function(collectionId, idsJson, state) {
        const ids = JSON.parse(idsJson.replace(/&quot;/g, '"'));
        if (ids.length === 0) {
            notify(t('col_err_no_movies'), "err");
            return;
        }
        notify(t('loading'), 'ok');

        await api('edit_collection', { id: collectionId, monitored: state });

        if (ids.length > 0) {
            const action = state ? 'monitor_on' : 'monitor_off';
            await api('bulk_media_action', {
                type: 'movie',
                ids: JSON.stringify(ids),
                bulkAction: action,
                deleteFiles: '0'
            });
        }

        notify(t('col_monitor_updated'), 'ok');
        viewCollections();
    };

    window.promptCollectionQuality = async function(collectionId, currentProfileId, idsJson) {
        const r = await api('get_options&app=radarr', {}, 'GET');
        if (r.error || !r.profiles) {
            notify(t('error_connection'), 'err');
            return;
        }

        let optionsHtml = r.profiles.map(p => `<option value="${p.id}" ${p.id === currentProfileId ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
        const ids = JSON.parse(idsJson.replace(/&quot;/g, '"'));

        showConfirmModal(
            t('col_action_quality'),
            `<div class="form-row" style="text-align:left; margin-top:10px;">
                <label style="font-size:12px; font-weight:bold; color:var(--muted); text-transform:uppercase;">${t('col_profile_label')}</label>
                <select id="col-quality-select" style="width:100%; padding:10px; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:6px; appearance:auto;">
                    ${optionsHtml}
                </select>
            </div>
            <label style="display:flex; align-items:center; gap:10px; cursor:pointer; background:var(--bg3); padding:12px; border-radius:8px; margin-top:15px; text-align:left;">
                <input type="checkbox" id="col-quality-apply-existing" checked style="width:18px; height:18px; accent-color:var(--accent);">
                <span style="font-size:13px; color:var(--text);">${t('col_apply_existing').replace('{n}', ids.length)}</span>
            </label>`,
            async () => {
                const newProfileId = document.getElementById('col-quality-select').value;
                const applyExisting = document.getElementById('col-quality-apply-existing').checked;

                notify(t('loading'), 'ok');
                
                const res = await api('edit_collection', { id: collectionId, qualityProfileId: newProfileId });

                if (res.ok) {
                    if (applyExisting && ids.length > 0) {
                        const promises = ids.map(id => api('update_media_quality', { type: 'movie', id: id, profileId: newProfileId }));
                        await Promise.all(promises);
                    }
                    notify(t('col_profile_updated'), 'ok');
                    viewCollections(); 
                } else {
                    notify(res.error || t('notif_error'), 'err');
                }
            }
        );
    };

    window.removeCollectionMovies = function(idsJson, title) {
        const ids = JSON.parse(idsJson.replace(/&quot;/g, '"'));
        if (ids.length === 0) {
            notify(t('col_err_no_movies'), "err");
            return;
        }
        
        showConfirmModal(
            t('col_remove_title'),
            `${t('col_remove_msg').replace('{n}', ids.length).replace('{title}', title)}<br><br>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; background:var(--bg3); padding:10px; border-radius:8px;">
                <input type="checkbox" id="delete-files-checkbox" checked style="width:16px; height:16px; accent-color:var(--accent3);">
                <span style="font-size:13px;">${t('confirm_delete_files')}</span>
            </label>`,
            async () => {
                const deleteFiles = document.getElementById('delete-files-checkbox').checked;
                notify(t('col_removing'), 'ok');
                const r = await api('bulk_media_action', {
                    type: 'movie',
                    ids: JSON.stringify(ids),
                    bulkAction: 'delete',
                    deleteFiles: deleteFiles ? '1' : '0'
                });
                if (r.ok) {
                    notify(t('col_remove_success').replace('{n}', r.success), 'ok');
                    viewCollections();
                } else {
                    notify(r.error || t('notif_error'), 'err');
                }
            }
        );
    };

    window.openMovieCollection = async function(collectionTitle, fromMovieId, collectionTmdbId = 0) {
        const content = document.getElementById('movie-detail-content');
        content.innerHTML = `<div style="text-align:center;padding:40px;color:var(--muted);">${t('loading')}</div>`;

        currentActiveCollection = { title: collectionTitle, fromId: fromMovieId, tmdbId: collectionTmdbId };

        const r = await api('movie_collection&title=' + encodeURIComponent(collectionTitle) + '&tmdbId=' + (collectionTmdbId || 0), {}, 'GET');
        if (r.error) { content.innerHTML = `<p style="color:var(--accent3)">${esc(r.error)}</p>`; return; }

        const movies = r.movies || [];
        const total      = movies.length;
        const inLib      = movies.filter(m => m.inLib).length;
        const downloaded = movies.filter(m => m.hasFile).length;
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
            const badge       = notInLib ? `<div class="not-planned-badge" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.75);border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:10px;color:var(--muted);">${t('not_planned')}</div>` : '';
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

        const backAction = fromMovieId ? `openMovieDetail(${fromMovieId})` : `closeMovieDetail(); setTimeout(viewCollections, 300);`;

        content.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:20px;padding:10px 0;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <button onclick="${backAction}"
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
            ? `<button class="btn-pill" onclick="promptAddCollection('${esc(collectionTitle).replace(/'/g, "\\'")}')" style="font-weight:bold; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:13px;">＋ ${t('collection_add_btn')} (${window.currentCollectionUnmonitored.length})</button>`
            : `<span style="color:var(--accent2); font-weight:bold; font-size:12px; padding:4px 8px; background:rgba(93,255,214,0.1); border-radius:6px; border:1px solid rgba(93,255,214,0.3);">✓ ${t('collection_complete')}</span>`
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
    };

    window.promptAddCollection = async function(title) {
        currentAddMedia = { type: 'collection', title: title };
        const modal = document.getElementById('modal-add-media');

        if (modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }
        modal.style.position = 'fixed';
        modal.style.zIndex = '99999999';

        document.getElementById('add-media-title').textContent = t('detail_collection') + ' : ' + title;
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
        document.getElementById('btn-confirm-add').onclick = confirmAddCollection;
    };

    window.confirmAddCollection = async function() {
        if (!currentAddMedia || currentAddMedia.type !== 'collection') return;

        const profileId = document.getElementById('add-media-profile').value;
        const rootPath = document.getElementById('add-media-folder').value;
        const searchNow = document.getElementById('add-media-search') ? document.getElementById('add-media-search').checked : true;

        const modal = document.getElementById('modal-add-media');
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
            <div style="color:var(--text); font-weight:bold; margin-bottom:5px;">${t('collection_adding')} (${i+1}/${total})...</div>
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
        notify(`${t('collection_added_success')} : ${successCount}/${total} ${t('word_movies').toLowerCase()}`, 'ok');

        if (currentActiveCollection) {
            setTimeout(() => openMovieCollection(currentActiveCollection.title, currentActiveCollection.fromId, currentActiveCollection.tmdbId), 1000);
        }
    };

window.openLibraryImportModal = async function(type) {
    window._importListType = type;
    window._importResults = [];
    window._importSelected = new Set();
    window._unmappedFoldersCache = [];

    let modal = document.getElementById('modal-library-import');
    if (!modal) {
        const html = `
        <div id="modal-library-import" class="modal-bg" style="z-index:999999;">
            <div class="modal-box" style="width: clamp(480px, 90vw, 880px); max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column; padding: 0; overflow: hidden; background: var(--bg2); border-radius: 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 15px 20px; border-bottom: 1px solid var(--border); background:var(--bg2); flex-shrink:0;">
                    <h3 id="lib-import-title" style="margin:0; color:var(--text); font-size:18px;"></h3>
                    <span onclick="document.getElementById('modal-library-import').classList.remove('open')" style="cursor:pointer; color:var(--muted); font-size:24px; line-height:1;">&times;</span>
                </div>
                
                <div id="lib-import-step1" style="padding: 20px; background:var(--bg); flex-shrink:0; border-bottom:1px solid var(--border);">
                    <label style="font-size:12px; font-weight:bold; color:var(--muted); text-transform:uppercase;">${t('lib_import_root_folder')}</label>
                    <!-- 🌟 MODIFICATION ICI : flex-wrap et min-width ajoutés -->
                    <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:8px;">
                        <select id="lib-import-folder-select" style="flex:1; min-width:200px; padding:10px; background:var(--bg3); border:1px solid var(--border); color:var(--text); border-radius:6px; outline:none;"></select>
                        <button class="btn-primary" onclick="scanLibraryFolders()" style="flex:1; width:auto; min-width:180px; margin:0;">🔍 ${t('lib_import_btn_scan')}</button>
                    </div>
                </div>
                
                <div id="lib-import-results-container" style="flex:1; overflow-y:auto; padding:0; display:flex; flex-direction:column; background:var(--bg);">
                    <div id="lib-import-results" style="display:flex; flex-direction:column; gap:0;">
                        <div style="text-align:center; color:var(--muted); padding:40px;">⏳ ${t('loading')}</div>
                    </div>
                </div>

                <div id="lib-import-footer" style="padding: 15px 20px; background:var(--bg2); border-top: 1px solid var(--border); display:none; flex-shrink:0;">
                    <div style="display:flex; gap:10px; margin-bottom:12px;">
                        <select id="lib-import-profile" class="lib-select" style="flex:1;"></select>
                    </div>
                    <!-- 🌟 AJOUT margin:0; par sécurité ici aussi -->
                    <button class="btn-primary" id="btn-process-lib-import" onclick="confirmLibraryImport()" style="width:100%; margin:0;"></button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        modal = document.getElementById('modal-library-import');
        modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
    }
    
    document.getElementById('lib-import-title').textContent = type === 'movie' ? t('lib_import_title_movie') : t('lib_import_title_serie');
    document.getElementById('lib-import-results').innerHTML = `<div style="text-align:center; color:var(--muted); padding:40px;">⏳ ${t('lib_import_fetching')}</div>`;
    document.getElementById('lib-import-footer').style.display = 'none';
    modal.classList.add('open');

    const appDriver = type === 'movie' ? 'radarr' : 'sonarr';
    const opts = await api(`get_options&app=${appDriver}`, {}, 'GET');
    
    if (opts.folders && opts.profiles) {
        window._libraryProfiles = opts.profiles;
        window._unmappedFoldersCache = opts.folders;
        
        const folderSelect = document.getElementById('lib-import-folder-select');
        folderSelect.innerHTML = opts.folders.map((f, i) => `<option value="${i}">${esc(f.path)} (${(f.unmappedFolders || []).length})</option>`).join('');
        
        const profileSelect = document.getElementById('lib-import-profile');
        profileSelect.innerHTML = opts.profiles.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
        
        document.getElementById('lib-import-results').innerHTML = `<div style="text-align:center; color:var(--muted); padding:40px;">${t('lib_import_select_hint')}</div>`;
    } else {
        document.getElementById('lib-import-results').innerHTML = `<div style="text-align:center; color:var(--accent3); padding:40px;">${t('lib_import_err_connection')}</div>`;
    }
};

window.scanLibraryFolders = async function() {
    const folderIndex = document.getElementById('lib-import-folder-select').value;
    const folderObj = window._unmappedFoldersCache[folderIndex];
    
    if (!folderObj || !folderObj.unmappedFolders || folderObj.unmappedFolders.length === 0) {
        document.getElementById('lib-import-results').innerHTML = `<div style="text-align:center; color:var(--muted); padding:40px;">${t('lib_import_no_orphans')}</div>`;
        document.getElementById('lib-import-footer').style.display = 'none';
        return;
    }

    document.getElementById('lib-import-results').innerHTML = `<div style="text-align:center; color:var(--muted); padding:40px;">⏳ ${t('lib_import_searching').replace('{n}', folderObj.unmappedFolders.length)}</div>`;
    
    window._unmappedPathsMap = {};
    folderObj.unmappedFolders.forEach(f => {
        window._unmappedPathsMap[f.name] = f.path;
    });
    
    const folderNames = folderObj.unmappedFolders.map(f => f.name);
    
    const r = await api('bulk_import_lookup', { type: window._importListType, terms: JSON.stringify(folderNames) });
    
    if (r.error) {
        document.getElementById('lib-import-results').innerHTML = `<div style="text-align:center; color:var(--accent3); padding:40px;">⚠️ ${esc(r.error)}</div>`;
        return;
    }

    window._importResults = r.results || [];
    window._importSelected = new Set(window._importResults.map((res, i) => (res.found && !res.in_lib) ? i : null).filter(i => i !== null));
    
    renderLibraryImportResults();
    document.getElementById('lib-import-footer').style.display = 'block';
};

window.renderLibraryImportResults = function() {
    const container = document.getElementById('lib-import-results');
    container.innerHTML = window._importResults.map((r, i) => {
        if (!r.found) {
            return `<label style="display:flex; align-items:center; gap:12px; padding:12px 20px; border-bottom:1px solid var(--border); background:var(--bg3); opacity:0.6;">
                <span style="font-size:20px;">❓</span>
                <div style="flex:1; min-width:0;">
                    <div style="font-size:13px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(r.term)}</div>
                    <div style="font-size:11px; color:var(--accent3);">${t('lib_import_not_found')}</div>
                </div>
            </label>`;
        }
        const disabled = r.in_lib;
        const checked = window._importSelected.has(i);
        return `<label style="display:flex; align-items:center; gap:12px; padding:12px 20px; border-bottom:1px solid var(--border); background:var(--bg2); cursor:${disabled ? 'default' : 'pointer'}; ${disabled ? 'opacity:0.5;' : ''} transition:background 0.2s;" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='var(--bg2)'">
            <input type="checkbox" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} onchange="toggleLibImportItem(${i})" style="width:18px; height:18px; accent-color:var(--accent); flex-shrink:0;">
            ${r.poster ? `<img src="${esc(r.poster)}" style="width:36px; height:54px; object-fit:cover; border-radius:4px; flex-shrink:0;">` : '<div style="width:36px;height:54px;flex-shrink:0;background:var(--bg);border-radius:4px;border:1px solid var(--border);"></div>'}
            <div style="flex:1; min-width:0;">
                <div style="font-size:14px; font-weight:bold; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(r.title)} ${r.year ? `(${r.year})` : ''}</div>
                <div style="font-size:11px; color:var(--muted); font-family:var(--mono); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${t('lib_import_folder_lbl')} ${esc(r.term)}</div>
                ${disabled ? `<div style="font-size:11px; color:var(--accent); font-weight:bold; margin-top:2px;">${t('lib_import_already_in_lib')}</div>` : ''}
            </div>
        </label>`;
    }).join('');

    const btn = document.getElementById('btn-process-lib-import');
    btn.textContent = t('lib_import_btn_add_selected').replace('{n}', window._importSelected.size);
    btn.disabled = window._importSelected.size === 0;
};

window.toggleLibImportItem = function(i) {
    if (window._importSelected.has(i)) window._importSelected.delete(i);
    else window._importSelected.add(i);
    renderLibraryImportResults();
};

window.confirmLibraryImport = async function() {
    if (window._importSelected.size === 0) return;
    
    const profileId = document.getElementById('lib-import-profile').value;
    const folderIndex = document.getElementById('lib-import-folder-select').value;
    const rootPath = window._unmappedFoldersCache[folderIndex].path;
    
    const btn = document.getElementById('btn-process-lib-import');
    btn.disabled = true;

    let successCount = 0;
    const itemsToImport = Array.from(window._importSelected).map(i => window._importResults[i]);

    for (const item of itemsToImport) {
        btn.textContent = t('lib_import_adding').replace('{n}', successCount + 1).replace('{total}', itemsToImport.length);
        
        const exactPath = window._unmappedPathsMap[item.term] || null;
        const payload = { qualityProfileId: profileId, rootFolderPath: rootPath, search: false };
        if (exactPath) payload.path = exactPath;
        
        if (window._importListType === 'movie') payload.tmdbId = item.tmdbId;
        else payload.tvdbId = item.tvdbId;

        const action = window._importListType === 'movie' ? 'add_movie' : 'add_serie';
        const r = await api(action, payload);
        if (r.ok) successCount++;
    }

    notify(t('lib_import_success').replace('{n}', successCount), 'ok');
    document.getElementById('modal-library-import').classList.remove('open');
    
    if (window._importListType === 'movie') loadMovies(); else loadSeries();
};
