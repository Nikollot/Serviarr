// ===== Serviarr - settings.js (extrait de script.js) =====

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

function changeLanguage(lang) {
    document.cookie = "serviarr_lang=" + lang + "; path=/; max-age=31536000"; // Valable 1 an
    window.location.reload();
}

const defaultBlocksConfig = {
    movies: {
        order: ['recent', 'upcoming', 'physical', 'popular', 'reco'],
        visibility: { recent: true, upcoming: true, physical: true, popular: true, reco: true }
    },
    series: {
        order: ['recent', 'upcoming', 'new', 'popular', 'reco'],
        visibility: { recent: true, upcoming: true, new: true, popular: true, reco: true }
    },
    server: {
        order: ['disk', 'dl', 'torrent', 'history'],
        visibility: { disk: true, dl: true, torrent: true, history: true }
    }
};

function getBlockLabels() {
    return {
        movies: { recent: '⬇️ ' + t('block_recent_added'), upcoming: '📅 ' + t('block_upcoming'), physical: '💿 ' + t('block_physical'), popular: '🍿 ' + t('block_popular'), reco: '💡 ' + t('block_reco_movies') },
        series: { recent: '⬇️ ' + t('block_recent_added'), upcoming: '📺 ' + t('block_upcoming'), new: '🚀 ' + t('block_new_series'), popular: '🌟 ' + t('block_popular'), reco: '💡 ' + t('block_incomplete_series') },
        server: { disk: '💽 ' + t('block_disk_space'), dl: '⏱️ ' + t('block_dl_history'), torrent: '⬇️ ' + t('block_recent_client'), history: '📅 ' + t('block_detailed_history') }
    };
}

function getBlocksConfig() {
    try {
        const saved = JSON.parse(localStorage.getItem('serviarr_blocks_config'));
        // Fusion de sécurité si l'ancienne structure en JSON simple est détectée
        if (saved && !saved.movies?.order) return defaultBlocksConfig;
        return saved || defaultBlocksConfig;
    } catch(e) {
        return defaultBlocksConfig;
    }
}

function applyBlocksVisibility() {
    const cfg = getBlocksConfig();

    ['movies', 'series', 'server'].forEach(tab => {
        const tabCfg = cfg[tab] || defaultBlocksConfig[tab];

        // 🌟 CORRECTION ICI : On utilise l'ID exact pour l'onglet Serveur
        const container = tab === 'server'
        ? document.getElementById('server-blocks-container')
        : document.querySelector(`#home-tab-${tab} .hub-section`);

        if (!container) return;

        tabCfg.order.forEach(blockKey => {
            const elId = tab === 'server' ? `block-server-${blockKey}` : `block-${tab}-${blockKey}`;
            const el = document.getElementById(elId);
            if (el) {
                // Réordonne physiquement l'élément dans le DOM
                container.appendChild(el);
                // Applique la visibilité activée/désactivée
                el.style.display = tabCfg.visibility[blockKey] ? '' : 'none';
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', applyBlocksVisibility);

function openUiConfigModal(tab) {
    let modal = document.getElementById('modal-ui-config');

    if (!modal) {
        const modalHtml = `
        <div id="modal-ui-config" class="modal-bg" style="display:none; z-index:10005;">
        <div class="modal-box" style="width: clamp(320px, 90vw, 440px); max-height: 90vh; display: flex; flex-direction: column; padding: 0; border-radius: 16px; background: var(--bg2); border: 1px solid var(--border);">
        <h3 style="margin:0; border-bottom:1px solid var(--border); padding: 20px; background: var(--bg2); display:flex; justify-content:space-between; align-items:center;">
        <span>⚙️ ${t('ui_config_modal_title')}</span>
        <button onclick="closeUiConfigModal()" style="background:none; border:none; color:var(--text); cursor:pointer; font-size:16px;">✕</button>
        </h3>
        <div style="padding: 20px; overflow-y: auto; flex: 1;" id="ui-config-list">
        <!-- Rempli dynamiquement -->
        </div>
        <div style="padding:20px; border-top:1px solid var(--border); display:flex; gap:10px;">
        <button class="btn-primary" onclick="saveUiConfig()" style="flex:1;">💾 ${t('ui_config_save')}</button>
        </div>
        </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('modal-ui-config');
        modal.addEventListener('click', e => { if (e.target === modal) closeUiConfigModal(); });
    }

    const cfg = getBlocksConfig();
    const tabCfg = cfg[tab] || defaultBlocksConfig[tab];
    const listContainer = document.getElementById('ui-config-list');

    renderConfigList(tab, tabCfg);

    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('open'), 10);
}

function renderConfigList(tab, tabCfg) {
    const listContainer = document.getElementById('ui-config-list');
    let html = `<div style="font-size:11px; color:var(--muted); text-transform:uppercase; font-weight:bold; margin-bottom:10px;">${t('ui_config_drag_hint')}</div>`;

    const labels = getBlockLabels();
    tabCfg.order.forEach((blockKey, index) => {
        const isVisible = tabCfg.visibility[blockKey];
        const label = labels[tab][blockKey] || blockKey;
        const isFirst = index === 0;
        const isLast = index === tabCfg.order.length - 1;

        html += `
        <div class="config-item-row" data-key="${blockKey}" style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; background:var(--bg3); padding:10px 15px; border-radius:8px; border:1px solid var(--border); gap:10px;">
        <label style="display:flex; align-items:center; gap:10px; flex:1; cursor:pointer; user-select:none; min-width:0;">
        <input type="checkbox" class="ui-block-checkbox" data-key="${blockKey}" ${isVisible ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--accent); flex-shrink:0;">
        <span style="font-size:13px; font-weight:600; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${label}</span>
        </label>
        <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
        <button type="button" onclick="moveConfigItem('${tab}', ${index}, -1)" ${isFirst ? 'disabled style="opacity:0.2;cursor:not-allowed;"' : ''} style="background:var(--bg2); border:1px solid var(--border); color:var(--text); width:28px; height:28px; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center;"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg></button>
        <button type="button" onclick="moveConfigItem('${tab}', ${index}, 1)" ${isLast ? 'disabled style="opacity:0.2;cursor:not-allowed;"' : ''} style="background:var(--bg2); border:1px solid var(--border); color:var(--text); width:28px; height:28px; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center;"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></button>
        <div class="drag-handle config-item-drag-handle" title="Glisser pour réordonner"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></div>
        </div>
        </div>`;
    });

    listContainer.innerHTML = html;
    listContainer.dataset.currentTab = tab;

    initDragReorder(listContainer, '.config-item-row', '.config-item-drag-handle', (orderedEls) => {
        // 🌟 CORRECTION : On récupère le nouvel ordre après le glissé-déposé
        const currentOrder = orderedEls.map(el => el.dataset.key);
        const currentVisibility = {};
        
        // On récupère aussi l'état des cases à cocher pour ne pas les perdre
        orderedEls.forEach(el => {
            const cb = el.querySelector('.ui-block-checkbox');
            if (cb) currentVisibility[el.dataset.key] = cb.checked;
        });
        
        // On regénère la liste pour corriger les flèches haut/bas
        renderConfigList(tab, { order: currentOrder, visibility: currentVisibility });
    });
}

function moveConfigItem(tab, index, direction) {
    // 1. On lit l'ordre et l'état ACTUELS directement depuis ce qui est affiché dans la modale
    const currentOrder = [];
    const currentVisibility = {};

    document.querySelectorAll('.config-item-row').forEach(row => {
        const key = row.dataset.key;
        currentOrder.push(key);

        const cb = row.querySelector('.ui-block-checkbox');
        if (cb) {
            currentVisibility[key] = cb.checked;
        }
    });

    // 2. On calcule le nouvel emplacement
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= currentOrder.length) return;

    // 3. On inverse les éléments dans notre liste temporaire
    const temp = currentOrder[index];
    currentOrder[index] = currentOrder[newIndex];
    currentOrder[newIndex] = temp;

    // 4. On crée un objet de configuration temporaire pour l'affichage
    const tempTabCfg = {
        order: currentOrder,
        visibility: currentVisibility
    };

    // 5. On réaffiche la liste dans la modale
    renderConfigList(tab, tempTabCfg);
}

function closeUiConfigModal() {
    const modal = document.getElementById('modal-ui-config');
    if (modal) {
        modal.classList.remove('open');
        setTimeout(() => { modal.style.display = 'none'; }, 200);
    }
}

function saveUiConfig() {
    const listContainer = document.getElementById('ui-config-list');
    const tab = listContainer.dataset.currentTab;
    const cfg = getBlocksConfig();
    const tabCfg = cfg[tab] || defaultBlocksConfig[tab];

    // Récupère l'ordre actuel affiché dans la modale et l'état des cases
    const newOrder = [];
    document.querySelectorAll('.config-item-row').forEach(row => {
        const key = row.dataset.key;
        newOrder.push(key);
        const cb = row.querySelector('.ui-block-checkbox');
        if (cb) tabCfg.visibility[key] = cb.checked;
    });

        tabCfg.order = newOrder;
        cfg[tab] = tabCfg;

        localStorage.setItem('serviarr_blocks_config', JSON.stringify(cfg));

        // Applique instantanément sur la page
        applyBlocksVisibility();

        closeUiConfigModal();
        if (typeof notify === 'function') notify('Préférences enregistrées', 'ok');
}

async function testConnection() {
    const driver = document.getElementById('modal-driver').value;
    if (!driver) { notify(t('modal_app_type_choose'), 'err'); return; }

    const data = { driver: driver };
    document.querySelectorAll('#modal-fields input, #modal-fields select').forEach(el => {
        data[el.name] = el.value;
    });

    const btn = document.getElementById('btn-test-connection');
    const origText = btn.innerHTML;
    btn.disabled = true;
    
    // Appel à la traduction
    btn.innerHTML = '⏳ ' + t('testing_connection');

    const r = await api('test_connection', data);

    btn.disabled = false;
    btn.innerHTML = origText;

    if (r.ok) {
        // Appel à la traduction
        notify('✅ ' + t('test_success'), 'ok');
        btn.style.borderColor = 'var(--accent2)';
        btn.style.color = 'var(--accent2)';
    } else {
        notify('❌ ' + (r.error || t('error_connection')), 'err');
        btn.style.borderColor = 'var(--accent3)';
        btn.style.color = 'var(--accent3)';
    }
    
    setTimeout(() => {
        btn.style.borderColor = 'var(--sonarr)';
        btn.style.color = 'var(--sonarr)';
    }, 3000);
}