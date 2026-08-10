// ===== Serviarr - bulk-select.js (extrait de script.js) =====

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
