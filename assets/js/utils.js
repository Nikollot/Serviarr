// ===== Serviarr - utils.js (extrait de script.js) =====

const APP_VERSION = "1.9";

const UPDATE_URL = "https://raw.githubusercontent.com/Nikollot/Serviarr/main/version.json";

const DRIVER_ICONS = {docker:'🐳', sonarr:'📺',radarr:'🎬',prowlarr:'🔍',indexer:'🔍',transmission:'⬇',download:'⬇',jellyfin:'🎵',qbittorrent:'🌊',lidarr:'🎶',readarr:'📚', iframe:'🌐'};

function renderPagination(prefix, current, total) {
    const el = document.getElementById(prefix + '-pagination');
    if (total <= 1) { el.innerHTML = ''; return; }
    let html = '';
    for (let i = 1; i <= Math.min(total, 10); i++) {
        html += `<button class="page-btn${i===current?' active':''}" onclick="${prefix}GoPage(${i})">${i}</button>`;
    }
    el.innerHTML = html;
}

async function api(action, data = {}, method = 'POST') {
    try {
        // 1. On cherche si une URL de serveur a été configurée manuellement (pour l'app mobile)
        let serverUrl = localStorage.getItem('serviarr_server_url');

        // 2. Si aucune URL n'est définie (ex: 1er lancement)
        if (!serverUrl) {
            // On vérifie si on est dans l'app Capacitor (Mobile natif)
            const isNative = window.Capacitor && window.Capacitor.isNativePlatform();

            if (isNative) {
                // Sur mobile, on doit demander l'URL à l'utilisateur
                if (typeof showServerSetup === 'function') showServerSetup();
                return { error: "Veuillez configurer l'URL de votre serveur." };
            } else {
                // Sur le Web, on déduit l'URL automatiquement
                serverUrl = window.location.origin;
            }
        }

        // On s'assure qu'il n'y a pas de slash à la fin de l'URL pour éviter les doublons
        serverUrl = serverUrl.replace(/\/$/, '');

        const isGet = method.toUpperCase() === 'GET';
        let url = `${serverUrl}/api.php?action=${action}`;

        // ⚠️ TRÈS IMPORTANT : 'include' permet de garder la session (cookies) active même sur l'app mobile
        const opts = { method, credentials: 'include' };
        let r;

        if (method === 'POST') {
            const fd = new FormData();
            fd.append('action', action);
            Object.entries(data).forEach(([k,v]) => fd.append(k, v));
            opts.body = fd;
            // On met à jour l'URL de fetch ici aussi
            r = await fetch(`${serverUrl}/api.php`, opts);
        } else {
            r = await fetch(url, opts);
        }

        // 🌟 SÉCURITÉ : On vérifie que la réponse est bien du JSON avant de la lire
        const contentType = r.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return await r.json();
        } else {
            // Renvoie l'erreur en utilisant ton moteur de traduction
            return { error: t('err_timeout') };
        }
    } catch(e) {
        return { error: e.message };
    }
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function notify(msg, type = 'ok') {
    const el = document.getElementById('notif');
    el.textContent = msg; el.className = `show ${type}`;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.className = '', 3000);
}

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

async function checkForUpdates() {
    if (!UPDATE_URL || UPDATE_URL.includes('...')) return;

    try {
        // Le "?t=" empêche le cache (comme on l'a vu tout à l'heure)
        const r = await fetch(UPDATE_URL + '?t=' + new Date().getTime(), { cache: 'no-store' });
        if (!r.ok) return;
        const data = await r.json();

        if (data.version && data.version !== APP_VERSION) {
            // Met à jour l'affichage dans le menu avec la nouvelle version
            displayVersionInSidebar(data.version, data.url);
        }
    } catch (e) {
        console.log("Erreur lors de la vérification des mises à jour.");
    }
}

function displayVersionInSidebar(latestVersion = null, releaseUrl = '#') {
    const sidebarFooter = document.querySelector('.sidebar-footer');
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    // Cherche ou crée le conteneur de la version
    let versionDiv = document.getElementById('sidebar-version-info');
    if (!versionDiv) {
        versionDiv = document.createElement('div');
        versionDiv.id = 'sidebar-version-info';
        // Marges et polices réduites pour gagner de la place
        versionDiv.style = "text-align: center; font-size: 10px; color: var(--muted); font-family: var(--mono); padding-top: 5px;";

        if (sidebarFooter) {
            sidebarFooter.appendChild(versionDiv);
        } else {
            versionDiv.style.marginTop = 'auto';
            versionDiv.style.padding = '10px 20px';
            versionDiv.style.borderTop = '1px solid var(--border)';
            sidebar.appendChild(versionDiv);
        }
    }

    // Si une mise à jour est disponible, on affiche le bouton rouge compacté
    if (latestVersion && latestVersion !== APP_VERSION) {
        versionDiv.innerHTML = `
        <div style="margin-bottom: 4px;">v${APP_VERSION}</div>
        <a href="${releaseUrl}" target="_blank" style="display: block; padding: 6px 8px; font-size: 10.5px; line-height: 1.3; background: rgba(255,93,143,0.1); border: 1px solid rgba(255,93,143,0.3); color: var(--accent3); border-radius: 6px; text-decoration: none; font-weight: bold; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,93,143,0.2)'" onmouseout="this.style.background='rgba(255,93,143,0.1)'">
        🚀 ${t('update_available')}<br>(${latestVersion})
        </a>
        `;
    }
    // Sinon, on affiche juste la version actuelle
    else {
        versionDiv.innerHTML = `v${APP_VERSION}`;
    }
}

// ===== Glisser-déposer réutilisable (souris + tactile) pour réordonner une liste =====
// container : élément parent contenant les lignes (doit avoir position:relative, ajouté automatiquement)
// itemSelector : sélecteur CSS des lignes déplaçables (ex: '.app-item-row')
// handleSelector : sélecteur CSS de la poignée qui déclenche le drag (ex: '.drag-handle')
// onDrop(orderedEls) : callback appelé à la fin du drag avec les éléments dans leur nouvel ordre
function initDragReorder(container, itemSelector, handleSelector, onDrop) {
    if (!container || container._dragReorderBound) return;
    container._dragReorderBound = true;

    const containerStyle = getComputedStyle(container);
    if (containerStyle.position === 'static') container.style.position = 'relative';

    let draggedEl = null;
    let placeholder = null;
    let offsetX = 0, offsetY = 0;

    function getItems() {
        return Array.from(container.querySelectorAll(itemSelector));
    }

    function onPointerDown(e) {
        const handle = e.target.closest(handleSelector);
        if (!handle || !container.contains(handle)) return;
        const item = handle.closest(itemSelector);
        if (!item) return;

        e.preventDefault();

        draggedEl = item;
        const containerRect = container.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();

        offsetX = e.clientX - itemRect.left;
        offsetY = e.clientY - itemRect.top;

        // Espace réservé qui prend la place de la ligne dans le flux normal pendant le drag
        placeholder = document.createElement('div');
        placeholder.className = 'drag-placeholder';
        placeholder.style.height = itemRect.height + 'px';
        item.after(placeholder);

        item.style.position = 'absolute';
        item.style.top = (itemRect.top - containerRect.top) + 'px';
        item.style.left = (itemRect.left - containerRect.left) + 'px';
        item.style.width = itemRect.width + 'px';
        item.style.zIndex = '50';
        item.style.pointerEvents = 'none';
        item.classList.add('drag-active');

        document.body.classList.add('drag-noselect');

        try { handle.setPointerCapture(e.pointerId); } catch (err) {}

        document.addEventListener('pointermove', onPointerMove, { passive: false });
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
    }

    function onPointerMove(e) {
        if (!draggedEl) return;
        e.preventDefault();

        const containerRect = container.getBoundingClientRect();
        draggedEl.style.top = (e.clientY - containerRect.top - offsetY) + 'px';
        draggedEl.style.left = (e.clientX - containerRect.left - offsetX) + 'px';

        const elAtPoint = document.elementFromPoint(e.clientX, e.clientY);
        const target = elAtPoint ? elAtPoint.closest(itemSelector) : null;

        if (target && target !== draggedEl && container.contains(target)) {
            const rect = target.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) target.before(placeholder);
            else target.after(placeholder);
        }
    }

    function onPointerUp() {
        if (!draggedEl) return;

        placeholder.replaceWith(draggedEl);

        draggedEl.style.position = '';
        draggedEl.style.top = '';
        draggedEl.style.left = '';
        draggedEl.style.width = '';
        draggedEl.style.zIndex = '';
        draggedEl.style.pointerEvents = '';
        draggedEl.classList.remove('drag-active');

        document.body.classList.remove('drag-noselect');

        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);

        const finishedEl = draggedEl;
        draggedEl = null;
        placeholder = null;

        if (typeof onDrop === 'function') onDrop(getItems(), finishedEl);
    }

    container.addEventListener('pointerdown', onPointerDown);
}

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
        <div style="background:var(--bg2); width:100%; max-width:min(920px, 92vw); height:90vh; max-height:90vh; border:1px solid var(--border); border-radius:12px; display:flex; flex-direction:column; box-shadow:0 10px 40px rgba(0,0,0,0.5); overflow:hidden;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 15px 20px; border-bottom: 1px solid var(--border); flex-shrink:0; background:var(--bg2);">
        <h3 id="import-list-title" style="margin:0; color:var(--text); font-size:18px;"></h3>
        <span onclick="document.getElementById('modal-import-list').style.display='none'" style="cursor:pointer; color:var(--muted); font-size:24px; line-height:1;">&times;</span>
        </div>
        <div id="import-list-step1" style="padding: 20px; overflow-y: auto; flex: 1; display:flex; flex-direction:column;">

        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:10px; flex-wrap:wrap; gap:10px;">
        <p style="color:var(--muted); font-size:13px; margin:0;">${t('import_list_hint')}</p>
        <button class="btn-sm" onclick="document.getElementById('import-file-upload').click()" style="background:var(--bg3); color:var(--text); border:1px solid var(--border); padding:6px 12px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:6px;">
        📂 Charger un fichier .txt
        </button>
        <input type="file" id="import-file-upload" accept=".txt" style="display:none;" onchange="handleImportFileUpload(event)">
        </div>

        <textarea id="import-list-textarea" rows="8" style="width:100%; background:var(--bg3); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:12px; font-size:14px; resize:vertical; flex:1; min-height:160px;" placeholder="${t('import_list_placeholder')}"></textarea>
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
    document.getElementById('import-list-step1').style.display = 'flex';
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
            textarea.value = e.target.result;
        }
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
        <div style="background:var(--bg2); width:100%; max-width:min(920px, 92vw); border:1px solid var(--border); border-radius:12px; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 10px 40px rgba(0,0,0,0.5); overflow:hidden;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 15px 20px; border-bottom: 1px solid var(--border); flex-shrink:0; background:var(--bg2);">
        <h3 id="search-modal-title" style="margin:0; color:var(--text); font-size:18px;">${t('add_media_title') || 'Ajouter'}</h3>
        <span onclick="document.getElementById('modal-search-media').style.display='none'" style="cursor:pointer; color:var(--muted); font-size:24px; line-height:1;">&times;</span>
        </div>
        <div style="padding: 20px; display:flex; flex-direction:column; flex:1; overflow:hidden;">
        <input type="text" id="search-modal-input" class="lib-search" style="width:100%; margin-bottom:15px; font-size:16px; padding:12px 15px; border-radius:8px; flex-shrink:0;" placeholder="${t('search_type_title') || 'Rechercher...'}">
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

    let titleText = t('type_movie') || 'Film';
    if (type === 'serie') titleText = t('type_serie') || 'Série';
    if (type === 'artist') titleText = 'Artiste';

    document.getElementById('search-modal-title').textContent = titleText;
    const input = document.getElementById('search-modal-input');
    input.dataset.type = type;
    input.value = '';

    document.getElementById('search-modal-results').innerHTML = `<div style="color:var(--muted); text-align:center; padding:40px;">${t('search_type_title') || 'Tapez votre recherche et appuyez sur Entrée'}</div>`;

    modal.style.display = 'flex';
    setTimeout(() => input.focus(), 100);
}

// 🌟 CORRECTION CRUCIALE ICI : Gestion du type "artist" pour la recherche globale
async function executeModalSearch(type, query) {
    if (!query || query.trim().length < 2) return;

    const resultsDiv = document.getElementById('search-modal-results');
    resultsDiv.innerHTML = `<div style="color:var(--muted); text-align:center; padding:40px;">${t('loading') || 'Chargement...'}</div>`;

    let action = '';
    if (type === 'movie') action = 'search_movie';
    else if (type === 'artist') action = 'search_artist';
    else action = 'search_serie';

    const r = await api(action + '&q=' + encodeURIComponent(query), {}, 'GET');

    if (r.error || !r.results) {
        resultsDiv.innerHTML = `<div style="color:var(--accent3); text-align:center;">${t('notif_error') || 'Erreur'} : ${esc(r.error || 'Erreur de connexion')}</div>`;
        return;
    }

    if (r.results.length === 0) {
        let noResText = t('no_movie_found') || 'Aucun résultat';
        if (type === 'serie') noResText = t('no_series_found') || 'Aucun résultat';
        if (type === 'artist') noResText = 'Aucun artiste trouvé';
        resultsDiv.innerHTML = `<div style="color:var(--muted); text-align:center; padding:40px;">${noResText}</div>`;
        return;
    }

    let html = '';
    r.results.forEach((item, index) => {
        const isMovie = type === 'movie';
        const isArtist = type === 'artist';

        let id = '';
        let idType = '';
        if (isMovie) {
            id = item.tmdbId; idType = 'tmdb';
        } else if (isArtist) {
            id = item.mbId; idType = 'mb';
        } else {
            id = item.tvdbId || item.tmdbId; idType = item.tvdbId ? 'tvdb' : 'tmdb';
        }

        const safeTitle = esc(item.title).replace(/'/g, "\\'");
        let fallbackIcon = '🎬';
        if (type === 'serie') fallbackIcon = '📺';
        if (isArtist) fallbackIcon = '🎵';

        const posterHtml = item.poster
        ? `<img src="${item.poster}" loading="lazy" style="width:100%; height:135px; object-fit:cover; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">`
        : `<div style="width:100%; height:135px; background:var(--bg2); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:30px; border:1px solid var(--border);">${fallbackIcon}</div>`;

        let actionHtml = '';
        if (item.in_lib) {
            actionHtml = `<div style="background:rgba(93,255,214,0.1); color:var(--accent2); text-align:center; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:bold; border:1px solid rgba(93,255,214,0.3); display:inline-block;">✓ ${t('badge_library') || 'Dans la bibliothèque'}</div>`;
        } else {
            let btnClass = 'primary-sonarr';
            if (isMovie) btnClass = 'primary-radarr';
            if (isArtist) btnClass = 'primary-lidarr'; // S'appuie sur la couleur Lidarr si tu l'as définie dans ton CSS, sinon prendra la couleur par défaut

            actionHtml = `<button id="col-card-${index}" class="btn-pill ${btnClass}" style="padding:6px 16px; font-size:12px; font-weight:bold; background:var(--accent); color:#000; border:none;" onclick="event.stopPropagation(); promptAddMedia('${type}', '${id}', '${safeTitle}', this, '${idType}')">＋ ${t('films_add') || 'Ajouter'}</button>`;
        }

        const networkText = item.network ? ` • ${esc(item.network)}` : '';
        const ratingText = item.rating ? ` • ⭐ ${item.rating}` : '';
        const overviewText = item.overview ? esc(item.overview) : (isArtist ? '' : (t('detail_overview') || 'Synopsis'));

        let rowClickAction = '';
        if (isMovie) {
            rowClickAction = `document.getElementById('modal-search-media').style.display='none'; window._fromSearchModal=true; openTmdbMovieDetail(${item.tmdbId});`;
        } else if (isArtist) {
            rowClickAction = `document.getElementById('modal-search-media').style.display='none'; window._fromSearchModal=true; openMbArtistDetail('${item.mbId}');`;
        } else {
            rowClickAction = `document.getElementById('modal-search-media').style.display='none'; window._fromSearchModal=true; openTmdbSerieDetail(${item.tmdbId});`;
        }

        html += `
        <div onclick="${rowClickAction}" style="cursor:pointer; display:flex; gap:15px; background:var(--bg3); padding:12px; border-radius:12px; border:1px solid var(--border); transition:background 0.2s;" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='var(--bg3)'">

        <div style="width: 90px; flex-shrink: 0;">
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

    window.addEventListener('scroll', checkVisibility, { passive: true });
    document.addEventListener('click', () => setTimeout(checkVisibility, 50));
    document.addEventListener('touchend', () => setTimeout(checkVisibility, 50), { passive: true });

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

async function openExportListModal(type) {
    let modal = document.getElementById('modal-export-list');
    if (!modal) {
        const modalHtml = `
        <div id="modal-export-list" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:999999; align-items:center; justify-content:center; padding:20px; backdrop-filter:blur(5px);">
        <div style="background:var(--bg2); width:100%; max-width:clamp(420px, 90vw, 720px); height:90vh; max-height:90vh; border:1px solid var(--border); border-radius:12px; display:flex; flex-direction:column; box-shadow:0 10px 40px rgba(0,0,0,0.5); overflow:hidden;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 15px 20px; border-bottom: 1px solid var(--border); background:var(--bg2); flex-shrink:0;">
        <h3 id="export-list-title" style="margin:0; color:var(--text); font-size:18px;">${t('export_modal_title')}</h3>
        <span onclick="document.getElementById('modal-export-list').style.display='none'" style="cursor:pointer; color:var(--muted); font-size:24px; line-height:1;">&times;</span>
        </div>
        <div style="padding: 20px; display:flex; flex-direction:column; flex:1; overflow:hidden;">
        <p id="export-list-hint" style="color:var(--muted); font-size:13px; margin-bottom:10px; flex-shrink:0;">${t('export_loading')}</p>
        <textarea id="export-list-textarea" rows="12" style="width:100%; background:var(--bg3); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:12px; font-size:14px; resize:vertical; font-family:var(--mono); flex:1; min-height:200px;" readonly></textarea>

        <div id="export-actions" style="display:flex; gap:10px; margin-top:15px; display:none; flex-shrink:0;">
        <button class="btn-primary" style="flex:1; background:var(--bg3); color:var(--text); border:1px solid var(--border);" onclick="copyExportList()">📋 ${t('btn_copy')}</button>
        <button class="btn-primary" style="flex:1; background:var(--accent2); color:#000; border:none;" onclick="downloadExportList()">💾 ${t('btn_save_txt')}</button>
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

    document.getElementById('export-list-title').textContent = type === 'movie' ? t('export_movies_title') : t('export_series_title');
    document.getElementById('export-list-textarea').value = t('export_loading');
    document.getElementById('export-list-hint').textContent = t('export_wait_hint');
    document.getElementById('export-actions').style.display = 'none';
    modal.style.display = 'flex';

    const r = await api(`export_media_list&type=${type}`, {}, 'GET');
    if (r.error) {
        document.getElementById('export-list-textarea').value = r.error;
        document.getElementById('export-list-hint').textContent = t('export_error');
    } else {
        document.getElementById('export-list-textarea').value = r.text;
        document.getElementById('export-list-hint').textContent = t('export_success').replace('{n}', r.count);
        document.getElementById('export-actions').style.display = 'flex';
    }
}

function copyExportList() {
    const textarea = document.getElementById('export-list-textarea');
    textarea.select();
    document.execCommand('copy');
    notify(t('copied_clipboard'), 'ok');
}

function downloadExportList() {
    const textarea = document.getElementById('export-list-textarea');
    const type = textarea.dataset.type === 'movie' ? 'films' : 'series';

    const date = new Date().toISOString().split('T')[0];
    const filename = `export_imdb_${type}_${date}.txt`;

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
