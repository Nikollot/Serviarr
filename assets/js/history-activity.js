// ===== Serviarr - history-activity.js (extrait de script.js) =====

async function loadRecentDownloads() {
    const r = await api('recent_downloads', {}, 'GET');
    const panel = document.getElementById('side-panel-content');
    const items = r.items || [];
    document.getElementById('side-panel-title').textContent = t('dash_recent_dl');
    document.getElementById('side-panel-icon').textContent = '⬇';
    if (!items.length) { panel.innerHTML = `<p style="color:var(--muted);font-size:13px;">${t('no_recent_dl')}</p>`; return; }
    panel.innerHTML = '<div class="recent-list">' + items.map(it => `
    <div class="recent-item">
    <span class="recent-badge ${it.type}">${it.type === 'film' ? t('type_movie') : t('type_serie')}</span>
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

let historyCache = [];

let currentHistoryTab = 'movie'; 

async function loadHistory(type) {
    currentHistoryTab = type; // 🌟 On enregistre si on est sur 'movie' ou 'serie'
    
    const container = document.getElementById('history-list');
    if (!container) return;

    // Remplacement de "Chargement..."
    container.innerHTML = `<div class="downloads-loader">⏳ ${t('dl_loading')}</div>`;

    try {
        const res = await api('get_history&type=' + type, {}, 'GET');

        if (res.history && res.history.length > 0) {
            historyCache = res.history;
            renderHistory();
        } else {
            // Remplacement de "Aucun historique trouvé"
            container.innerHTML = `<div class="empty-state"><div class="icon">⏱️</div><h3>${t('history_no_data')}</h3></div>`;
        }
    } catch (e) {
        // Remplacement de "Erreur lors du chargement"
        container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>${t('history_error')}</h3></div>`;
    }
}

function renderHistory() {
    const container = document.getElementById('history-list');
    const searchInput = document.getElementById('history-search');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    if (!historyCache || historyCache.length === 0) return;

    const filtered = historyCache.filter(item => {
        const title = item.sourceTitle || item.title || '';
        return title.toLowerCase().includes(searchTerm);
    });

    if (filtered.length === 0) {
        // Remplacement de "Aucun résultat"
        container.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><h3>${t('history_no_results')}</h3></div>`;
        return;
    }

    let html = '';
    filtered.forEach(item => {
        const d = new Date(item.date);
        const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

        let color = 'var(--muted)';
        let icon = 'ℹ️';

        if (item.eventType === 'grabbed') { color = 'var(--orange)'; icon = '⬇️'; }
        else if (item.eventType === 'downloadFolderImported') { color = 'var(--green)'; icon = '✅'; }
        else if (item.eventType === 'downloadFailed') { color = 'var(--red)'; icon = '❌'; }

        // 🌟 Nouvelle détection à toute épreuve basée sur l'onglet actif
        let clickAction = '';
        
        if (currentHistoryTab === 'movie') {
            // On cherche l'ID du film là où Radarr a pu le cacher
            const mId = item.movieId || (item.movie && item.movie.id);
            if (mId) clickAction = `openMovieDetail(${mId})`;
        } else {
            // On cherche l'ID de la série là où Sonarr a pu le cacher
            const sId = item.seriesId || (item.series && item.series.id);
            if (sId) clickAction = `openSerieDetail(${sId})`;
        }

        const pointerStyle = clickAction ? 'cursor:pointer;' : '';
        const hoverEffect = clickAction ? `onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'"` : '';
        const onClickAttr = clickAction ? `onclick="${clickAction}"` : '';

        // 🌟 Application des attributs cliquables
        html += `
        <div class="card" ${onClickAttr} style="padding:10px 14px; border-left:4px solid ${color}; margin-bottom:10px; ${pointerStyle} transition:opacity 0.2s;" ${hoverEffect}>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <div style="font-weight:600; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:10px;">
        ${icon} ${esc(item.sourceTitle || item.title || t('word_unknown'))}
        </div>
        <div style="font-size:11px; color:var(--muted); white-space:nowrap;">${dateStr}</div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--muted);">
        <div><span style="color:${color}; font-weight:700; text-transform:capitalize;">${esc(item.eventType)}</span> • ${esc(item.quality || '')}</div>
        </div>
        </div>`;
    });

    container.innerHTML = html;
}

function filterHistory() {
    renderHistory();
}

async function loadServerStats() {
    const container = document.getElementById('server-disk-container');
    if (!container) return;

    container.innerHTML = `<div style="text-align:center; color:var(--muted); padding:20px;">⏳ ${t('server_loading_disks')}</div>`;

    const r = await api('server_stats', {}, 'GET');

    if (r.error) {
        container.innerHTML = `<div style="color:var(--accent3); text-align:center; padding:10px;">⚠️ ${esc(r.error)}</div>`;
        return;
    }

    if (!r.disks || r.disks.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:var(--muted); padding:10px;">${t('server_no_disk')}</div>`;
        return;
    }

    let html = '';

    r.disks.forEach((disk) => {
        const used = disk.total - disk.free;
        const pct = disk.total > 0 ? (used / disk.total) * 100 : 0;

        let barColor = 'var(--accent2)';

        if (pct >= 90) {
            barColor = 'var(--accent3)';
        } else if (pct >= 80) {
            barColor = '#ffa03c';
        }

        const freeStr = formatBytes(disk.free).replace('GB', 'Go').replace('MB', 'Mo').replace('TB', 'To');

        html += `
        <div style="margin-bottom: 22px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="font-size: 13px; font-weight: bold; color: var(--text); font-family: var(--mono);">${esc(disk.path)}</div>
        <div style="font-size: 11px; color: var(--muted); white-space: nowrap;">${freeStr} ${t('server_free')}</div>
        </div>

        <div style="height: 4px; background: var(--bg3); border-radius: 2px; width: 100%; overflow: hidden;">
        <div style="height: 100%; width: ${pct}%; background: ${barColor}; border-radius: 2px; box-shadow: 0 0 8px ${barColor}66; transition: width 1s ease-in-out;"></div>
        </div>
        </div>`;
    });

    container.innerHTML = html;
}

async function loadServerDlStats() {
    const chartContainer = document.getElementById('server-dl-chart');
    const totalContainer = document.getElementById('server-dl-total');
    if (!chartContainer || !totalContainer) return;

    const r = await api('server_dl_stats', {}, 'GET');

    if (r.error || !r.success) {
        chartContainer.innerHTML = `<div style="color:var(--accent3); text-align:center; padding-top:40px;">⚠️ ${esc(r.error || t('notif_error'))}</div>`;
        return;
    }

    const totalStr = formatBytes(r.total).replace('GB', 'Go').replace('MB', 'Mo').replace('TB', 'To');
    totalContainer.innerHTML = `${totalStr} <span style="font-size:14px; font-weight:normal; color:var(--muted);">${t('server_dl_last_week')}</span>`;

    let maxSize = Math.max(...r.chart.map(d => d.size));
    if (maxSize === 0) maxSize = 1024 * 1024; // Evite la division par 0 si 0 téléchargement

    const maxStr = formatBytes(maxSize).replace('GB', 'Go').replace('MB', 'Mo').replace('TB', 'To');
    const halfStr = formatBytes(maxSize / 2).replace('GB', 'Go').replace('MB', 'Mo').replace('TB', 'To');

    let barsHtml = '';
    r.chart.forEach(d => {
        const dateObj = new Date(d.date);
        // Ex: "lun", "mar", "mer" selon la langue de ton appareil
        const dayName = dateObj.toLocaleDateString(currentLocale(), { weekday: 'short' });
        const sizeStr = formatBytes(d.size).replace('GB', 'Go').replace('MB', 'Mo').replace('TB', 'To');

        const pct = (d.size / maxSize) * 100;
        // On s'assure qu'une toute petite barre (2%) s'affiche s'il y a eu un téléchargement minime
        const barHeight = d.size > 0 ? Math.max(pct, 2) : 0;

        barsHtml += `
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 8px; height: 100%;">
        <div style="width: 100%; max-width: 20px; height: calc(100% - 20px); display: flex; align-items: flex-end; position: relative;">
        <div style="width: 100%; height: ${barHeight}%; background: #8b5cf6; border-radius: 6px 6px 0 0; transition: height 1s ease-out;" title="${sizeStr}"></div>
        </div>
        <div style="font-size: 10px; color: var(--muted); text-transform: lowercase;">${dayName}</div>
        </div>`;
    });

    chartContainer.innerHTML = `
    <!-- Lignes de fond (Grille) -->
    <div style="position: absolute; left: 50px; right: 0; top: 10px; bottom: 24px; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none;">
    <div style="border-top: 1px dashed rgba(255,255,255,0.05); width: 100%;"></div>
    <div style="border-top: 1px dashed rgba(255,255,255,0.05); width: 100%;"></div>
    <div style="border-top: 1px solid rgba(255,255,255,0.1); width: 100%;"></div>
    </div>

    <!-- Axe Y (Valeurs à gauche) -->
    <div style="position: absolute; left: 0; top: 4px; bottom: 24px; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; font-size: 9px; color: var(--muted); font-family: var(--mono); width: 45px; text-align: right;">
    <span>${maxStr}</span>
    <span>${halfStr}</span>
    <span>0 Go</span>
    </div>

    <!-- Barres graphiques -->
    <div style="display: flex; align-items: flex-end; justify-content: space-between; padding-left: 55px; height: 100%;">
    ${barsHtml}
    </div>`;
}

async function loadServerTorrentHistory() {
    const chartContainer = document.getElementById('server-torrent-chart');
    const totalContainer = document.getElementById('server-torrent-total');
    if (!chartContainer || !totalContainer) return;

    const r = await api('get_downloads', {}, 'GET');

    if (r.error || (!r.torrents && !r.downloads)) {
        chartContainer.innerHTML = `<div style="color:var(--accent3); text-align:center; padding-top:40px;">⚠️ Erreur de chargement.</div>`;
        return;
    }

    const torrents = r.torrents || r.downloads || [];

    // 1. Initialiser les 7 derniers jours à 0
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0); // On remet à minuit pour comparer facilement
        days.push({ date: d, size: 0 });
    }

    // 2. Calculer le poids ajouté chaque jour (parmi les torrents actifs)
    let totalSize = 0;
    torrents.forEach(t => {
        const size = t.size || t.totalSize || t.total_size || 0;
        // Transmission et qBittorrent n'utilisent pas la même clé pour la date
        const addedTs = t.addedDate || t.added_on || t.added_time || null;

        if (addedTs) {
            // Certains clients renvoient des secondes, JS a besoin de millisecondes
            const addedMs = addedTs < 10000000000 ? addedTs * 1000 : addedTs;
            const addedDate = new Date(addedMs);
            addedDate.setHours(0, 0, 0, 0);

            // Trouver le bon jour dans notre tableau des 7 jours
            const bucket = days.find(d => d.date.getTime() === addedDate.getTime());
            if (bucket) {
                bucket.size += size;
                totalSize += size;
            }
        }
    });

    const totalStr = formatBytes(totalSize).replace('GB', 'Go').replace('MB', 'Mo').replace('TB', 'To');
    totalContainer.innerHTML = `${totalStr} <span style="font-size:14px; font-weight:normal; color:var(--muted);">${t('server_dl_last_week')}</span>`;

    let maxSize = Math.max(...days.map(d => d.size));
    if (maxSize === 0) maxSize = 1024 * 1024; // Évite la division par 0

    const maxStr = formatBytes(maxSize).replace('GB', 'Go').replace('MB', 'Mo').replace('TB', 'To');
    const halfStr = formatBytes(maxSize / 2).replace('GB', 'Go').replace('MB', 'Mo').replace('TB', 'To');

    // 3. Dessiner le graphique
    let barsHtml = '';
    days.forEach(d => {
        const dayName = d.date.toLocaleDateString(currentLocale(), { weekday: 'short' });
        const sizeStr = formatBytes(d.size).replace('GB', 'Go').replace('MB', 'Mo').replace('TB', 'To');

        const pct = (d.size / maxSize) * 100;
        const barHeight = d.size > 0 ? Math.max(pct, 2) : 0;

        // 🌟 Couleur bleue (#0ea5e9) pour différencier du graphique Radarr/Sonarr
        barsHtml += `
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 8px; height: 100%;">
        <div style="width: 100%; max-width: 20px; height: calc(100% - 20px); display: flex; align-items: flex-end; position: relative;">
        <div style="width: 100%; height: ${barHeight}%; background: #0ea5e9; border-radius: 6px 6px 0 0; transition: height 1s ease-out;" title="${sizeStr}"></div>
        </div>
        <div style="font-size: 10px; color: var(--muted); text-transform: lowercase;">${dayName}</div>
        </div>`;
    });

    chartContainer.innerHTML = `
    <div style="position: absolute; left: 50px; right: 0; top: 10px; bottom: 24px; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none;">
    <div style="border-top: 1px dashed rgba(255,255,255,0.05); width: 100%;"></div>
    <div style="border-top: 1px dashed rgba(255,255,255,0.05); width: 100%;"></div>
    <div style="border-top: 1px solid rgba(255,255,255,0.1); width: 100%;"></div>
    </div>

    <div style="position: absolute; left: 0; top: 4px; bottom: 24px; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; font-size: 9px; color: var(--muted); font-family: var(--mono); width: 45px; text-align: right;">
    <span>${maxStr}</span>
    <span>${halfStr}</span>
    <span>0 Go</span>
    </div>

    <div style="display: flex; align-items: flex-end; justify-content: space-between; padding-left: 55px; height: 100%;">
    ${barsHtml}
    </div>`;
}

async function loadServerDetailedHistory() {
    const container = document.getElementById('server-detailed-history-container');
    if (!container) return;

    const r = await api('server_detailed_history', {}, 'GET');

    if (r.error || !r.success) {
        container.innerHTML = `<div style="color:var(--accent3); text-align:center; padding:10px;">⚠️ Erreur de chargement.</div>`;
        return;
    }

    if (r.history.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:var(--muted); padding:10px;">${t('server_history_empty')}</div>`;
        return;
    }

    // On met le conteneur en position relative pour accrocher le dégradé
    container.style.padding = '0';
    container.style.marginTop = '10px';
    container.style.position = 'relative';

    let itemsHtml = '';

    r.history.forEach((item, index) => {
        const clickAction = item.type === 'movie' ? `openMovieDetail(${item.id})` : `openSerieDetail(${item.id})`;
        const d = new Date(item.date * 1000);
        const dateStr = d.toLocaleDateString(currentLocale(), {day: 'numeric', month: 'short'}) + '.';
        const timeStr = d.toLocaleTimeString(currentLocale(), {hour: '2-digit', minute:'2-digit'});
        const timeLabel = `${dateStr} ${timeStr}`;

        const isMovie = item.type === 'movie';
        const barClass = isMovie ? 'movie' : 'episode';
        const fallbackIcon = isMovie ? '🎬' : '📺';

        let posterHtml = item.poster && item.poster !== 'assets/img/default_poster.png'
        ? `<img class="day-event-poster" src="${item.poster}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div class="day-event-poster-ph" style="display:none;">${fallbackIcon}</div>`
        : `<div class="day-event-poster-ph">${fallbackIcon}</div>`;

        // 1. FILMS : La ligne entière est cliquable
        if (isMovie) {
            itemsHtml += `
            <div class="day-event-item" onclick="${clickAction}" style="flex-shrink: 0; margin-bottom: 0; cursor: pointer;">
            <div class="day-event-bar ${barClass}"></div>
            ${posterHtml}
            <div class="day-event-info">
            <div class="day-event-title">${esc(item.title)}</div>
            <div class="day-event-sub" style="margin-top: 4px;">${timeLabel}</div>
            </div>
            </div>`;
        } else {
            const epCount = item.episodes.length;

            // 2. SÉRIES (1 seul épisode) : La ligne entière est cliquable
            if (epCount === 1) {
                const epTitle = item.episodes[0].title;
                itemsHtml += `
                <div class="day-event-item" onclick="${clickAction}" style="flex-shrink: 0; margin-bottom: 0; cursor: pointer;">
                <div class="day-event-bar ${barClass}"></div>
                ${posterHtml}
                <div class="day-event-info">
                <div class="day-event-title">${esc(item.title)}</div>
                <div class="day-event-sub" style="margin-top: 2px;">${esc(epTitle)}</div>
                <div style="margin-top: 4px;"><span style="font-size:11px; color:var(--muted); font-weight:600;">${timeLabel}</span></div>
                </div>
                </div>`;
            } else {
                // 3. SÉRIES (Plusieurs épisodes) : La ligne déroule la liste
                const uniqueId = 'hist-series-' + index;
                itemsHtml += `
                <div class="day-event-item" style="flex-direction: column; padding: 0; overflow: hidden; flex-shrink: 0; margin-bottom: 0;">
                
                <!-- Zone qui déroule la liste (La barre de couleur est réparée ici) -->
                <div style="display: flex; align-items: stretch; cursor: pointer;"
                     onclick="const el = document.getElementById('${uniqueId}'); const icon = document.getElementById('icon-${uniqueId}'); if(el.style.display==='none'){el.style.display='block'; icon.style.transform='rotate(180deg)';}else{el.style.display='none'; icon.style.transform='rotate(0deg)';}">
                    <div class="day-event-bar ${barClass}"></div>
                    <div style="display: flex; padding: 10px; align-items: center; gap: 12px; flex: 1;">
                        ${posterHtml}
                        <div class="day-event-info" style="flex: 1; padding: 0;">
                            <div class="day-event-title" style="font-size: 1.1em;">${esc(item.title)}</div>
                            <div class="day-event-sub" style="color: var(--sonarr); margin-top: 4px; font-weight: bold;">${t('server_history_episodes').replace('{n}', epCount)}</div>
                        </div>
                        <div id="icon-${uniqueId}" style="transition: transform 0.2s; color: var(--muted); padding: 0 10px; margin-left: auto;">▼</div>
                    </div>
                </div>
                
                <!-- Liste des épisodes qui s'affiche au clic -->
                <div id="${uniqueId}" style="display: none; max-height: 250px; overflow-y: auto; padding: 5px 15px 10px 15px; background: rgba(0,0,0,0.15); border-top: 1px solid var(--border);">
                
                <!-- Lien explicite en haut de la liste pour ouvrir la fiche -->
                <div onclick="${clickAction}" style="padding: 10px 0 5px 0; text-align: center; cursor: pointer; color: var(--sonarr); font-weight: bold; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                    Ouvrir la fiche de la série ➔
                </div>

                ${item.episodes.map(ep => {
                    const epDate = new Date(ep.date * 1000);
                    const epDateStr = epDate.toLocaleDateString(currentLocale(), {day:'numeric', month:'short'});
                    const epTimeStr = epDate.toLocaleTimeString(currentLocale(), {hour:'2-digit', minute:'2-digit'});
                    return `
                    <!-- Chaque épisode est également cliquable -->
                    <div onclick="${clickAction}" style="padding: 10px 0; border-bottom: 1px dashed var(--border); display:flex; align-items: center; justify-content: space-between; gap: 10px; cursor: pointer;" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">
                    <span style="font-weight:bold; font-size:13px; color: var(--text);">${esc(ep.title)}</span>
                    <span style="font-size:11px; color:var(--muted); white-space:nowrap;">${epDateStr}. ${epTimeStr}</span>
                    </div>`;
                }).join('')}
                </div>
                </div>`;
            }
        }
    });

    // 🌟 LOGIQUE D'AFFICHAGE "VOIR PLUS" / "VOIR MOINS"
    let finalHtml = `
    <div id="hist-wrapper" style="display:flex; flex-direction:column; gap:12px; max-height: 380px; overflow: hidden; transition: max-height 0.5s ease; padding-bottom: 20px;">
    ${itemsHtml}

    <!-- Le bouton Voir Moins (caché par défaut) -->
    <div id="hist-less-btn-container" style="display:none; justify-content:center; padding: 10px 0;">
    <button onclick="document.getElementById('hist-wrapper').style.maxHeight='380px'; document.getElementById('hist-fade').style.display='flex'; this.parentElement.style.display='none'; document.getElementById('server-detailed-history-container').scrollIntoView({behavior: 'smooth', block: 'nearest'});" style="background:none; border:none; color:var(--muted); font-weight:600; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:8px; letter-spacing:0.5px; transition: color 0.2s;" onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color='var(--muted)'">
    <span style="border:1px solid currentColor; border-radius:50%; width:16px; height:16px; display:flex; align-items:center; justify-content:center; font-size:10px; transform:rotate(-90deg);">➔</span> ${t('server_history_see_less')}
    </div>
    </div>`;

    // S'il y a plus de 4 éléments, on active le fondu et le bouton "Voir tout"
    if (r.history.length > 4) {
        finalHtml += `
        <div id="hist-fade" style="position:absolute; bottom:0; left:0; right:0; height:120px; background:linear-gradient(to top, var(--bg2) 35%, transparent 100%); display:flex; align-items:flex-end; justify-content:center; padding-bottom:15px; z-index:10;">
        <button onclick="document.getElementById('hist-wrapper').style.maxHeight='10000px'; document.getElementById('hist-fade').style.display='none'; setTimeout(() => document.getElementById('hist-less-btn-container').style.display='flex', 500);" style="background:none; border:none; color:#4ade80; font-weight:bold; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:8px; letter-spacing:0.5px;">
        ${t('server_history_see_all')} <span style="border:1px solid #4ade80; border-radius:50%; width:16px; height:16px; display:flex; align-items:center; justify-content:center; font-size:10px;">➔</span>
        </button>
        </div>`;
    }

    container.innerHTML = finalHtml;
}

async function checkNewDownloadsOnFocus() {
    try {
        const data = await api('server_detailed_history', {}, 'GET');
        if (!data || !data.history || data.history.length === 0) return;

        const latestTimestamp = parseInt(data.history[0].date, 10);
        // On récupère le timestamp mémorisé (ou 0 si c'est la toute première fois)
        const storedTimestamp = parseInt(localStorage.getItem('serviarr_last_seen_timestamp')) || 0;

        // S'il y a une nouveauté et qu'on n'est pas au premier lancement
        if (storedTimestamp > 0 && latestTimestamp > storedTimestamp) {

            // On filtre pour ne garder QUE les éléments plus récents que notre dernière visite
            const newItems = data.history.filter(item => parseInt(item.date, 10) > storedTimestamp);

            if (newItems.length > 0) {
                showDetailedPopup(newItems);
            }
        }

        // On met à jour la mémoire avec l'heure du dernier élément
        localStorage.setItem('serviarr_last_seen_timestamp', latestTimestamp);
    } catch (e) {
        console.error("Erreur lors de la vérification des téléchargements :", e);
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        checkNewDownloadsOnFocus();
    }
});
