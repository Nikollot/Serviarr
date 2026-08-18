// ===== Serviarr - app-crud.js (extrait de script.js) =====

let appsCache = [], editingId = null;

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
                const badge = btn.querySelector('.not-planned-badge');
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

async function loadAppsList() {
    const r = await api('get_apps', {}, 'GET');
    appsCache = r.apps || [];
    updateSidebar(appsCache);
    renderAppsListHtml();
    // 🌟 Mise à jour de la visibilité du Dashboard
    if (typeof updateHubVisibility === 'function') updateHubVisibility();
}

function renderAppsListHtml() {
    const list = document.getElementById('apps-list');
    if (!appsCache.length) {
        list.innerHTML = `<p style="color:var(--muted);font-size:12px;">${t('settings_apps')} vide</p>`;
        return;
    }

    let html = appsCache.map((app, index) => {
        const isFirst = index === 0;
        const isLast = index === appsCache.length - 1;

        return `
        <div class="app-item-row" data-id="${app.id}">
        <div class="app-item-icon">${getAppIconHtml(app)}</div>

        <div class="app-item-text">
        <div class="app-item-name" title="${esc(app.name)}">${esc(app.name)}</div>
        <div class="app-item-driver">${esc(app.driver)}</div>
        </div>

        <div class="app-item-actions">
        <button class="app-item-btn" onclick="moveApp(-1, ${index})" ${isFirst ? 'disabled style="opacity:0.2;cursor:not-allowed;"' : ''} title="${t('btn_move_up')}"><svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg></button>
        <button class="app-item-btn" onclick="moveApp(1, ${index})" ${isLast ? 'disabled style="opacity:0.2;cursor:not-allowed;"' : ''} title="${t('btn_move_down')}"><svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></button>
        <button class="app-item-btn" onclick="editApp('${app.id}')" title="${t('edit_title')}">⚙️</button>
        <button class="app-item-btn danger" onclick="deleteApp('${app.id}', '${esc(app.name)}')" title="${t('detail_delete')}">🗑️</button>
        </div>

        <div class="app-item-switch">
        <button class="toggle ${app.enabled ? 'on' : ''}" onclick="toggleApp('${app.id}', this)" style="margin:0;"></button>
        </div>

        <div class="app-item-drag drag-handle app-item-drag-handle" title="${t('btn_reorder_drag') || 'Glisser pour réordonner'}"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></div>
        </div>`;
    }).join('');

    list.innerHTML = html;

    initDragReorder(list, '.app-item-row', '.app-item-drag-handle', async (orderedEls) => {
        const newOrder = orderedEls.map(el => el.dataset.id);
        appsCache.sort((a, b) => newOrder.indexOf(String(a.id)) - newOrder.indexOf(String(b.id)));
        
        // 🌟 CORRECTION : On regénère le HTML pour actualiser les index et les flèches grisées
        renderAppsListHtml(); 
        
        updateSidebar(appsCache);
        if (typeof updateHubVisibility === 'function') updateHubVisibility();

        const r = await api('reorder_apps', { order: JSON.stringify(newOrder) });
        if (!r.ok) notify(t('notif_error'), 'err');
    });
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
            // 🌟 Mise à jour en temps réel de l'interface
            if (typeof updateHubVisibility === 'function') updateHubVisibility();
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

    // 🌟 NOUVEAU : Récupération robuste du raccourci avec editingId
    let currentShortcut = '';
    if (typeof editingId !== 'undefined' && editingId) {
        try {
            const shortcuts = JSON.parse(localStorage.getItem('serviarr_shortcuts')) || {};
            currentShortcut = shortcuts[editingId] || '';
        } catch(e) {}
    }
    html += `
    <div class="form-row" style="margin-top:15px; border-top:1px solid var(--border); padding-top:15px;">
    <label style="font-size:12px; font-weight:bold; color:var(--muted); text-transform:uppercase;">${t('app_shortcut_label')}</label>
    <input type="text" id="modal-shortcut" name="shortcut" value="${esc(currentShortcut)}" placeholder="Ex: F" maxlength="1" style="width:100%; background:var(--bg3); border:1px solid var(--border); color:var(--text); border-radius:6px; padding:10px; font-size:14px; text-transform:uppercase; text-align:center; font-weight:bold;">
	<div style="font-size:11px; color:var(--muted); margin-top:6px;">${t('app_shortcut_hint')}</div>
    </div>`;

    container.innerHTML = html;

    // 🌟 PLACEMENT DU BOUTON TEST (AVEC TRADUCTION)
    const actionsDiv = document.querySelector('#modal-app .modal-actions');
    if (actionsDiv && !document.getElementById('btn-test-connection')) {
        const testBtn = document.createElement('button');
        testBtn.type = 'button';
        testBtn.id = 'btn-test-connection';
        testBtn.setAttribute('onclick', 'testConnection()');
        
        testBtn.style.cssText = 'margin-right: auto; background: var(--bg3); border: 1px solid var(--sonarr); color: var(--sonarr); padding: 8px 16px; border-radius: 8px; font-weight: bold; font-size: 13px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px;';
        
        testBtn.onmouseover = function() { this.style.background = 'var(--sonarr-bg)'; };
        testBtn.onmouseout = function() { this.style.background = 'var(--bg3)'; };
        
        // Appel à la traduction
        testBtn.innerHTML = '🔌 ' + t('btn_test_connection');
        
        actionsDiv.insertBefore(testBtn, actionsDiv.firstChild);
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

    if (!urlInput || urlInput.value.trim() === '') { notify(t('err_url_missing'), "err"); return; }
    let urlStr = urlInput.value.trim();
    if (urlStr.includes('.sock')) { notify(t('err_url_socket_invalid'), "err"); return; }
    if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) urlStr = 'http://' + urlStr;

        try { new URL(urlStr); } catch (e) { notify(t('err_url_invalid'), "err"); return; }

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

    // 🛡️ SÉCURITÉ : On capture la lettre tapée AVANT de communiquer avec le serveur
    const shortcutInput = document.getElementById('modal-shortcut');
    const shortcutValue = shortcutInput ? shortcutInput.value.toLowerCase() : '';

    if (!data.driver) { notify(t('modal_app_type_choose'), 'err'); return; }

    const r = await api('save_app', data);

    if (r.ok) {
        // 🌟 NOUVEAU : Sauvegarde fiable du raccourci dans le cache du navigateur
        const targetId = editingId || r.id;
        if (targetId) {
            let shortcuts = {};
            try { shortcuts = JSON.parse(localStorage.getItem('serviarr_shortcuts')) || {}; } catch(e) {}
            shortcuts[targetId] = shortcutValue;
            localStorage.setItem('serviarr_shortcuts', JSON.stringify(shortcuts));
        }

        notify(t('notif_saved'), 'ok');
        closeModal();
        loadAppsList();
    }
    else notify(r.error || t('notif_error'), 'err');
}

document.getElementById('modal-app').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

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
        window._prowlarrResults = [];
        return;
    }

    container.innerHTML = `<div style="text-align:center; padding:50px; color:var(--muted);">${t('loading')}</div>`;

    const r = await api(`prowlarr_search&query=${encodeURIComponent(query)}&indexer=${indexer}&category=${category}`, {}, 'GET');

    if (r.error) {
        container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>${t('notif_error')}</h3><p>${esc(r.error)}</p></div>`;
        return;
    }

    const results = r.results || [];
    window._prowlarrResults = results;
    document.getElementById('prowlarr-results-count').textContent = results.length;

    sortProwlarrResults(_prowlarrSortCriteria, true);
}

// Extrait un libellé de catégorie exploitable, que le résultat vienne de Jackett (déjà mappé en string)
// ou de Prowlarr (tableau brut d'objets {id, name})
function getResultCategoryLabel(res) {
    if (res.category) return res.category;
    if (Array.isArray(res.categories) && res.categories.length) {
        return res.categories.map(c => (typeof c === 'object' ? (c.name || c.id) : c)).join(', ');
    }
    return '';
}

let _prowlarrSortCriteria = 'age';
let _prowlarrSortAsc = true;

function sortProwlarrResults(criteria, skipToggle = false) {
    if (!skipToggle) {
        if (_prowlarrSortCriteria === criteria) {
            _prowlarrSortAsc = !_prowlarrSortAsc;
        } else {
            _prowlarrSortCriteria = criteria;
            _prowlarrSortAsc = (criteria === 'title' || criteria === 'indexer' || criteria === 'category');
        }
    }

    const sel = document.getElementById('prowlarr-sort-select');
    if (sel) sel.value = _prowlarrSortCriteria;

    const container = document.getElementById('prowlarr-content');
    const allResults = window._prowlarrResults || [];
    document.getElementById('prowlarr-results-count').textContent = allResults.length;

    if (allResults.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><h3>${t('releases_none')}</h3></div>`;
        return;
    }

    const dir = _prowlarrSortAsc ? 1 : -1;
    const results = [...allResults].sort((a, b) => {
        switch (_prowlarrSortCriteria) {
            case 'title':    return dir * (a.title || '').localeCompare(b.title || '', 'fr', { sensitivity: 'base' });
            case 'age':      return dir * ((a.age || 0) - (b.age || 0));
            case 'indexer':  return dir * (a.indexer || '').localeCompare(b.indexer || '', 'fr', { sensitivity: 'base' });
            case 'size':     return dir * ((a.size || 0) - (b.size || 0));
            case 'category': return dir * getResultCategoryLabel(a).localeCompare(getResultCategoryLabel(b), 'fr', { sensitivity: 'base' });
            case 'grabs':    return dir * ((a.grabs || 0) - (b.grabs || 0));
            default:         return 0;
        }
    });

    let html = '<div style="display:flex; flex-direction:column; gap:10px;">';
    results.forEach(res => {
        const size = formatBytes(res.size || 0);
        const ageInDays = Math.floor((res.age || 0) / 24) || '< 1';
        const category = getResultCategoryLabel(res);
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
        ${category ? `<span style="color:var(--muted); background:var(--bg2); padding:2px 6px; border-radius:4px;">${esc(category)}</span>` : ''}
        <span style="color:var(--muted);">📁 ${size}</span>
        <span style="color:var(--muted);">🌱 ${res.seeders || 0} / 🧛 ${res.leechers || 0}</span>
        <span style="color:var(--muted);">📅 ${ageInDays} j</span>
        <span style="color:var(--muted);">🔗 ${res.grabs || 0}</span>
        </div>
        </div>`;
    });
    html += '</div>';

    container.innerHTML = html;
}

async function sendToTransmission(url, btn) {
    btn.disabled = true;
    btn.textContent = '⏳...';

    // 🌟 On utilise notre fonction api() qui gère automatiquement la sécurité et la session !
    const res = await api('add_torrent', { magnet: url });

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
}

async function loadAppSystemStatus(type) {
    const prefix = type === 'movie' ? 'movie' : 'serie';
    const verEl = document.getElementById('app-version');
    const badgeEl = document.getElementById('app-update-badge');
    
    if (verEl) verEl.textContent = t('loading');
    
    const r = await api('app_sys_status', { type: type });
    
    if (r.ok) {
        if (verEl) verEl.textContent = t('app_version').replace('{v}', r.version);
        if (badgeEl) badgeEl.style.display = r.update_available ? 'inline-block' : 'none';
        
        if (r.stats) {
            const elTotal = document.getElementById(`${prefix}-stat-total`);
            const elDl = document.getElementById(`${prefix}-stat-dl`);
            const elMissing = document.getElementById(`${prefix}-stat-missing`);
            const elSize = document.getElementById(`${prefix}-stat-size`);
            
            if (elTotal) elTotal.textContent = r.stats.total;
            if (elDl) elDl.textContent = r.stats.downloaded;
            if (elMissing) elMissing.textContent = r.stats.missing;
            if (elSize) elSize.textContent = formatBytes(r.stats.sizeOnDisk || 0);
        }
    } else {
        if (verEl) verEl.textContent = t('error_connection');
    }
}

async function appSystemCommand(type, commandName) {
    if (commandName === 'Restart') {
        if (!confirm(t('confirm_restart_app'))) return;
    }
    
    notify(t('command_sent'), 'ok');
    const r = await api('app_sys_command', { type: type, command: commandName });
    
    if (r.ok) notify(t('command_success'), 'ok');
    else notify(r.error || t('command_error'), 'err');
}