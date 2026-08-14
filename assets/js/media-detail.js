// ===== Serviarr - media-detail.js (extrait de script.js) =====

function _fdRow(label, value) {
    if (value === undefined || value === null || value === '' || value === '?') return '';
    return `<div style="display:flex; justify-content:space-between; gap:10px; padding:4px 0; font-size:12px;">
    <span style="color:var(--muted); flex-shrink:0;">${esc(label)}</span>
    <span style="color:var(--text); text-align:right; word-break:break-word;">${esc(String(value))}</span>
    </div>`;
}

function toggleFileDetailsCard(uid) {
    const body = document.getElementById('file-body-' + uid);
    const chevron = document.getElementById('file-chevron-' + uid);
    if (!body) return;
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'block';
    if (chevron) chevron.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
}

// Carte dépliable des détails d'un fichier (codecs vidéo/audio, sous-titres, chemin, formats personnalisés)
// file: objet retourné par le backend (r.file pour un film, ep.file_details pour un épisode)
// deleteArgs: chaîne d'arguments JS à passer à deleteFile(...), ex: "123, 'movie', 45"
function buildFileDetailsCard(file, uid, deleteArgs) {
    if (!file) return '';
    const cfs = file.customFormats || [];
    return `
    <div style="background:var(--bg3); border:1px solid var(--border); border-radius:12px; margin-bottom:20px; overflow:hidden;">
    <div onclick="toggleFileDetailsCard('${uid}')" style="padding:14px 16px; cursor:pointer; display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
    <div style="min-width:0; flex:1;">
    <div style="font-size:12px; font-weight:600; color:var(--text); word-break:break-all; line-height:1.4;">${esc(file.releaseName || '?')}</div>
    <div style="display:flex; align-items:center; gap:8px; margin-top:6px; flex-wrap:wrap; font-size:11px;">
    ${file.size ? `<span style="color:var(--accent2); font-weight:bold;">✓ ${esc(file.size)}</span>` : ''}
    ${file.quality ? `<span style="background:rgba(255,255,255,0.08); padding:2px 8px; border-radius:6px; color:var(--muted);">${esc(file.quality)}</span>` : ''}
    ${cfs.length ? `<span style="color:var(--accent2);">${cfs.length} format${cfs.length > 1 ? 's' : ''}</span>` : ''}
    </div>
    </div>
    <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
    ${deleteArgs ? `<button onclick="event.stopPropagation(); deleteFile(${deleteArgs})" style="background:none; border:none; color:var(--accent3); cursor:pointer; padding:4px; font-size:16px;" title="${t('detail_delete')}">🗑️</button>` : ''}
    <svg id="file-chevron-${uid}" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="transition:transform 0.2s; margin-top:2px;"><polyline points="6 9 12 15 18 9"></polyline></svg>
    </div>
    </div>
    <div id="file-body-${uid}" style="display:none; padding:0 16px 16px 16px; border-top:1px solid var(--border);">
    ${cfs.length ? `
    <div style="margin:14px 0 10px 0;">
    <div style="font-size:10px; font-weight:bold; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">${'Formats personnalisés'}</div>
    <div style="display:flex; flex-wrap:wrap; gap:6px;">
    ${cfs.map(f => `<span style="border:1px solid var(--accent); color:var(--accent); padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600;">${esc(f)}</span>`).join('')}
    </div>
    </div>` : ''}
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:14px;">
    <div>
    <div style="font-size:10px; font-weight:bold; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">${'Vidéo'}</div>
    ${_fdRow('Résolution', file.resolution)}
    ${_fdRow('Codec', file.videoCodec)}
    ${_fdRow('Profondeur', file.bitDepth)}
    ${_fdRow('Débit', file.bitRate)}
    ${_fdRow('FPS', file.fps)}
    </div>
    <div>
    <div style="font-size:10px; font-weight:bold; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">${'Audio'}</div>
    ${_fdRow('Canaux', file.audioChannels)}
    ${_fdRow('Codec', file.audioCodec)}
    ${_fdRow('Langues', file.audioLanguages)}
    ${_fdRow('Débit', file.audioBitRate)}
    ${_fdRow('Flux', file.audioStreams)}
    </div>
    </div>
    <div style="margin-top:14px;">
    <div style="font-size:10px; font-weight:bold; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">${'Autre'}</div>
    ${_fdRow('Durée', file.runTime)}
    ${_fdRow('Sous-titres', file.subtitles)}
    ${_fdRow('Groupe', file.releaseGroup)}
    ${_fdRow('Chemin', file.path)}
    </div>
    </div>
    </div>`;
}

function formatReleaseDate(dateStr) {
    if (!dateStr) return `<span style="color: var(--muted); font-style: italic;">${t('not_planned')}</span>`;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return `<span style="color: var(--muted); font-style: italic;">${t('not_planned')}</span>`;
    return d.toLocaleDateString(currentLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
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
    
    // 🌟 CORRECTION ICI : On ajoute '.page-title-row' pour masquer toute la ligne du haut (incluant le bouton global)
    document.querySelectorAll('.lib-toolbar, .page-title, .page-title-row').forEach(el => el.style.display = show ? '' : 'none');
    
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
            
            // 🌟 AJOUT : Réouverture automatique de la modale de recherche si on vient de là
            if (window._fromSearchModal) {
                const searchModal = document.getElementById('modal-search-media');
                if (searchModal) searchModal.style.display = 'flex';
                window._fromSearchModal = false; // On efface le marque-page
            }
            
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
            
            // 🌟 AJOUT : Réouverture automatique de la modale de recherche si on vient de là
            if (window._fromSearchModal) {
                const searchModal = document.getElementById('modal-search-media');
                if (searchModal) searchModal.style.display = 'flex';
                window._fromSearchModal = false; // On efface le marque-page
            }
            
        }, 200);
    }
    if (fromPopState !== true) history.pushState(null, '', window.location.pathname + window.location.hash);
}

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
    ? buildFileDetailsCard(r.file, 'movie-' + id, `${r.file.id}, 'movie', ${id}`)
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
        <style>
        .action-buttons-mobile { display: none !important; }
        .action-buttons-desktop { display: flex !important; }
        @media (max-width: 768px) {
            .action-buttons-mobile { display: flex !important; }
            .action-buttons-desktop { display: none !important; }
        }
        </style>
        <div style="position:relative; width:100%; min-height:100vh; background:var(--bg2);">
        <button onclick="closeMovieDetail()" style="position:absolute; top:15px; left:15px; background:var(--bg3); color:var(--text); border:1px solid var(--border); padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600; font-size:13px; z-index:100; box-shadow:0 4px 15px rgba(0,0,0,0.6); display:inline-flex; align-items:center; gap:6px;">⬅ ${t('detail_back')}</button>

        <div style="width:100%; height:250px; background-image:url('${fanartUrl}'); background-size:cover; background-position:center 20%; position:relative;">
        <div style="position:absolute; inset:0; background:linear-gradient(to bottom, rgba(19, 22, 30, 0.2) 0%, var(--bg2) 100%);"></div>
        ${r.youtubeTrailerId ? `
            <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; z-index:5;">
            <button onclick="openTrailerModal('${r.youtubeTrailerId}')" style="background:rgba(0,0,0,0.5); border:2px solid rgba(255,255,255,0.8); color:#fff; width:64px; height:64px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s; backdrop-filter:blur(4px); box-shadow:0 5px 15px rgba(0,0,0,0.5);" onmouseover="this.style.background='var(--accent)'; this.style.color='#000'; this.style.borderColor='var(--accent)'; this.style.transform='scale(1.1)';" onmouseout="this.style.background='rgba(0,0,0,0.5)'; this.style.color='#fff'; this.style.borderColor='rgba(255,255,255,0.8)'; this.style.transform='scale(1)';">
            <span style="font-size:24px; margin-left:6px;">▶</span>
            </button>
            </div>` : ''}
            </div>

            <div style="display:flex; gap:16px; padding:0 20px; margin-top:-70px; position:relative; z-index:10; align-items:flex-end;">
            ${posterUrl ? `<img src="${posterUrl}" style="width:115px; height:170px; border-radius:12px; box-shadow:0 6px 20px rgba(0,0,0,0.6); object-fit:cover; flex-shrink:0; border:1px solid rgba(255,255,255,0.1);">` : `<div style="width:115px; height:170px; background:var(--bg3); border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:40px; box-shadow:0 6px 20px rgba(0,0,0,0.6); border:1px solid rgba(255,255,255,0.1); flex-shrink:0;">🎬</div>`}

            <div style="padding-bottom:5px; flex:1; min-width:0;">
            <div id="movie-status-badge" style="display:inline-block; font-size:10px; font-weight:bold; padding:3px 8px; border-radius:6px; background:var(--bg3); border:1px solid var(--border); color:${statusColor}; margin-bottom:6px;">${statusText}</div>
            <h2 style="font-size:22px; font-weight:800; line-height:1.2; margin:0 0 6px 0; color:var(--text); text-overflow:ellipsis; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${esc(r.title)}
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

            <!-- 💻 VERSION PC (Ancienne version avec texte) -->
            <div class="action-buttons-desktop" style="gap:10px; padding:20px; overflow-x:auto; scrollbar-width:none; border-bottom:1px solid var(--border); margin-bottom:20px;">
            <button style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:8px 16px; border-radius:20px; font-size:13px; font-weight:600; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center; transition:background 0.2s;" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='var(--bg3)'" onclick="movieSearchAuto(${r.id}, this)">🔍 ${t('detail_auto_search')}</button>
            <button style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:8px 16px; border-radius:20px; font-size:13px; font-weight:600; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center; transition:background 0.2s;" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='var(--bg3)'" onclick="openMovieReleases(${r.id}, '${safeTitle}')">👤 ${t('detail_search_releases')}</button>
            <button style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:8px 16px; border-radius:20px; font-size:13px; font-weight:600; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center; transition:background 0.2s;" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='var(--bg3)'" onclick="refreshMedia(${r.id}, 'movie', this)">🔄 ${t('detail_refresh')}</button>
            <button style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:8px 16px; border-radius:20px; font-size:13px; font-weight:600; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center; transition:background 0.2s;" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='var(--bg3)'" onclick="openEditMediaModal(${r.id}, 'movie')">⚙️ ${t('modal_edit_radarr')}</button>
            <button style="background:rgba(255,93,143,0.1); border:1px solid rgba(255,93,143,0.3); color:var(--accent3); padding:8px 16px; border-radius:20px; font-size:13px; font-weight:600; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,93,143,0.2)'" onmouseout="this.style.background='rgba(255,93,143,0.1)'" onclick="deleteMedia(${r.id}, 'movie', '${safeTitle}')">🗑️ ${t('detail_delete')}</button>
            </div>

            <!-- 📱 VERSION MOBILE (Icônes rondes avec loupe déroulante) -->
            <div class="action-buttons-mobile" style="justify-content:center; gap:20px; padding:15px 20px; border-bottom:1px solid var(--border); margin-bottom:20px; position:relative;">

            <div style="position:relative;">
            <button style="background:var(--bg2); border:1px solid var(--border); border-radius:50%; color:var(--text); width:48px; height:48px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 4px 10px rgba(0,0,0,0.2);" onclick="const m=document.getElementById('movie-search-menu-mobile'); m.style.display=m.style.display==='none'?'flex':'none';">🔍</button>

            <div id="movie-search-menu-mobile" style="display:none; position:absolute; top:calc(100% + 10px); left:0; background:var(--bg3); border:1px solid var(--border); border-radius:12px; padding:8px; flex-direction:column; gap:8px; box-shadow:0 10px 30px rgba(0,0,0,0.6); z-index:100; min-width:200px;">
            <button style="background:var(--bg2); border:1px solid var(--border); border-radius:8px; color:var(--text); padding:12px; cursor:pointer; font-size:13px; font-weight:600; display:flex; align-items:center; gap:10px;" onclick="document.getElementById('movie-search-menu-mobile').style.display='none'; movieSearchAuto(${r.id}, this)">
            <span style="font-size:18px;">🤖</span> ${t('detail_auto_search')}
            </button>
            <button style="background:var(--bg2); border:1px solid var(--border); border-radius:8px; color:var(--text); padding:12px; cursor:pointer; font-size:13px; font-weight:600; display:flex; align-items:center; gap:10px;" onclick="document.getElementById('movie-search-menu-mobile').style.display='none'; openMovieReleases(${r.id}, '${safeTitle}')">
            <span style="font-size:18px;">👤</span> ${t('detail_search_manual')}
            </button>
            </div>
            </div>

            <button style="background:var(--bg2); border:1px solid var(--border); border-radius:50%; color:var(--text); width:48px; height:48px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 4px 10px rgba(0,0,0,0.2);" onclick="refreshMedia(${r.id}, 'movie', this)" title="${t('detail_refresh')}">🔄</button>
            <button style="background:var(--bg2); border:1px solid var(--border); border-radius:50%; color:var(--text); width:48px; height:48px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 4px 10px rgba(0,0,0,0.2);" onclick="openEditMediaModal(${r.id}, 'movie')" title="${t('modal_edit_radarr')}">⚙️</button>
            <button style="background:rgba(255,93,143,0.05); border:1px solid rgba(255,93,143,0.2); border-radius:50%; color:var(--accent3); width:48px; height:48px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 4px 10px rgba(0,0,0,0.2);" onclick="deleteMedia(${r.id}, 'movie', '${safeTitle}')" title="${t('detail_delete')}">🗑️</button>
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
    ${r.youtubeTrailerId ? `
        <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; z-index:5;">
        <button onclick="openTrailerModal('${r.youtubeTrailerId}')" style="background:rgba(0,0,0,0.5); border:2px solid rgba(255,255,255,0.8); color:#fff; width:64px; height:64px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s; backdrop-filter:blur(4px); box-shadow:0 5px 15px rgba(0,0,0,0.5);" onmouseover="this.style.background='var(--accent)'; this.style.color='#000'; this.style.borderColor='var(--accent)'; this.style.transform='scale(1.1)';" onmouseout="this.style.background='rgba(0,0,0,0.5)'; this.style.color='#fff'; this.style.borderColor='rgba(255,255,255,0.8)'; this.style.transform='scale(1)';">
        <span style="font-size:24px; margin-left:6px;">▶</span>
        </button>
        </div>` : ''}
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
    ${r.youtubeTrailerId ? `
        <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; z-index:5;">
        <button onclick="openTrailerModal('${r.youtubeTrailerId}')" style="background:rgba(0,0,0,0.5); border:2px solid rgba(255,255,255,0.8); color:#fff; width:64px; height:64px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s; backdrop-filter:blur(4px); box-shadow:0 5px 15px rgba(0,0,0,0.5);" onmouseover="this.style.background='var(--sonarr)'; this.style.color='#000'; this.style.borderColor='var(--sonarr)'; this.style.transform='scale(1.1)';" onmouseout="this.style.background='rgba(0,0,0,0.5)'; this.style.color='#fff'; this.style.borderColor='rgba(255,255,255,0.8)'; this.style.transform='scale(1)';">
        <span style="font-size:24px; margin-left:6px;">▶</span>
        </button>
        </div>` : ''}
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
                ${ep.file_details ? buildFileDetailsCard(ep.file_details, 'ep-' + ep.id, null) : (ep.fileName ? `<div style="font-family:var(--mono); font-size:10px; color:var(--muted); margin-bottom:12px; padding:8px 10px; background:rgba(0,0,0,0.2); border-radius:6px; border:1px dashed var(--border); word-break:break-all;">📄 ${esc(ep.fileName)}</div>` : '')}
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
        .action-buttons-mobile { display: none !important; }
        .action-buttons-desktop { display: flex !important; }
        @media (max-width: 768px) {
            .desktop-season-actions { display: none !important; }
            .mobile-season-actions-toggle { display: flex !important; }
            .action-buttons-mobile { display: flex !important; }
            .action-buttons-desktop { display: none !important; }
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
        ${r.youtubeTrailerId ? `
            <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; z-index:5;">
            <button onclick="openTrailerModal('${r.youtubeTrailerId}')" style="background:rgba(0,0,0,0.5); border:2px solid rgba(255,255,255,0.8); color:#fff; width:64px; height:64px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s; backdrop-filter:blur(4px); box-shadow:0 5px 15px rgba(0,0,0,0.5);" onmouseover="this.style.background='var(--sonarr)'; this.style.color='#000'; this.style.borderColor='var(--sonarr)'; this.style.transform='scale(1.1)';" onmouseout="this.style.background='rgba(0,0,0,0.5)'; this.style.color='#fff'; this.style.borderColor='rgba(255,255,255,0.8)'; this.style.transform='scale(1)';">
            <span style="font-size:24px; margin-left:6px;">▶</span>
            </button>
            </div>` : ''}
            </div>

            <div style="display:flex; gap:16px; padding:0 20px; margin-top:-70px; position:relative; z-index:10; align-items:flex-end;">
            ${posterUrl ? `<img src="${posterUrl}" style="width:115px; height:170px; border-radius:12px; box-shadow:0 6px 20px rgba(0,0,0,0.6); object-fit:cover; flex-shrink:0; border:1px solid rgba(255,255,255,0.1);">` : `<div style="width:115px; height:170px; background:var(--bg3); border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:40px; box-shadow:0 6px 20px rgba(0,0,0,0.6); border:1px solid rgba(255,255,255,0.1); flex-shrink:0;">📺</div>`}

            <div style="padding-bottom:5px; flex:1; min-width:0;">
            <div id="movie-status-badge" style="display:inline-block; font-size:10px; font-weight:bold; padding:3px 8px; border-radius:6px; background:var(--bg3); border:1px solid var(--border); color:${statusColor}; margin-bottom:6px;">${r.pct}% • ${statusText}</div>
            <h2 style="font-size:22px; font-weight:800; line-height:1.2; margin:0 0 6px 0; color:var(--text); text-overflow:ellipsis; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${esc(r.title)}
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

            <!-- 💻 VERSION PC (Ancienne version avec texte) -->
            <div class="action-buttons-desktop" style="gap:10px; padding:20px; overflow-x:auto; scrollbar-width:none; border-bottom:1px solid var(--border); margin-bottom:20px;">
            <button style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:8px 16px; border-radius:20px; font-size:13px; font-weight:600; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center; transition:background 0.2s;" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='var(--bg3)'" onclick="refreshMedia(${r.id}, 'serie', this)">🔄 ${t('detail_refresh')}</button>
            <button style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:8px 16px; border-radius:20px; font-size:13px; font-weight:600; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center; transition:background 0.2s;" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='var(--bg3)'" onclick="openEditMediaModal(${r.id}, 'serie')">⚙️ ${t('modal_edit_sonarr')}</button>
            <button style="background:rgba(255,93,143,0.1); border:1px solid rgba(255,93,143,0.3); color:var(--accent3); padding:8px 16px; border-radius:20px; font-size:13px; font-weight:600; white-space:nowrap; cursor:pointer; flex-shrink:0; display:flex; gap:6px; align-items:center; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,93,143,0.2)'" onmouseout="this.style.background='rgba(255,93,143,0.1)'" onclick="deleteMedia(${r.id}, 'serie', '${safeTitle}')">🗑️ ${t('detail_delete')}</button>
            </div>

            <!-- 📱 VERSION MOBILE (Icônes rondes centrées) -->
            <div class="action-buttons-mobile" style="justify-content:center; gap:20px; padding:15px 20px; border-bottom:1px solid var(--border); margin-bottom:20px;">
            <button style="background:var(--bg2); border:1px solid var(--border); border-radius:50%; color:var(--text); width:48px; height:48px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 4px 10px rgba(0,0,0,0.2);" onclick="refreshMedia(${r.id}, 'serie', this)" title="${t('detail_refresh')}">🔄</button>
            <button style="background:var(--bg2); border:1px solid var(--border); border-radius:50%; color:var(--text); width:48px; height:48px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 4px 10px rgba(0,0,0,0.2);" onclick="openEditMediaModal(${r.id}, 'serie')" title="${t('modal_edit_sonarr')}">⚙️</button>
            <button style="background:rgba(255,93,143,0.05); border:1px solid rgba(255,93,143,0.2); border-radius:50%; color:var(--accent3); width:48px; height:48px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 4px 10px rgba(0,0,0,0.2);" onclick="deleteMedia(${r.id}, 'serie', '${safeTitle}')" title="${t('detail_delete')}">🗑️</button>
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
                if (document.hidden) return; // 🌟 Stoppe les requêtes en arrière-plan
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
            }, 5000);
}

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

document.getElementById('modal-releases').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

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
    <div class="modal-box" style="width: clamp(340px, 90vw, 560px); max-width: 92vw; max-height: 90vh; overflow-y: auto; background: var(--bg2); border: 1px solid var(--border); border-radius: 16px; padding: 26px; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
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
    <label style="font-size:12px; font-weight:bold; color:var(--muted); text-transform:uppercase;">${t('edit_path_label')}</label>
    <input type="text" id="edit-path" style="width:100%; padding:10px; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:6px;">
    </div>

    <div class="form-row" style="position: relative;">
    <label style="font-size:12px; font-weight:bold; color:var(--muted); text-transform:uppercase;">Tags</label>

    <div id="edit-tags-badges" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;"></div>

    <input type="text" id="edit-tags-input" placeholder="${t('tags', {fallback:'Ajouter...'})}" style="width:100%; padding:10px; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:6px;" autocomplete="off">

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

document.addEventListener('click', e => {
    const modal = document.getElementById('modal-actor');
    if (modal && modal.style.display === 'block' && e.target === modal) {
        closeActorModal();
    }
});

function openTrailerModal(videoId) {
    let modal = document.getElementById('modal-trailer');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-trailer';

        // 🛠️ CORRECTION : On force le centrage absolu avec Flexbox directement en CSS
        modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:999999; align-items:center; justify-content:center; padding:15px; backdrop-filter:blur(5px);';

        // Ferme la modale si on clique à l'extérieur de la vidéo
        modal.addEventListener('click', e => {
            if (e.target === modal) closeTrailerModal();
        });
            document.body.appendChild(modal);
    }

    // On injecte un iframe YouTube optimisé
    modal.innerHTML = `
    <div class="modal-box" style="width: clamp(320px, 90vw, 960px); max-width: 92vw; padding: 0; background: #000; border-radius: 12px; overflow: hidden; position: relative; box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
    <div style="display:flex; justify-content:flex-end; position:absolute; top:10px; right:10px; z-index:10;">
    <button onclick="closeTrailerModal()" style="background:rgba(0,0,0,0.6); border:1px solid rgba(255,255,255,0.3); color:#fff; width:34px; height:34px; border-radius:50%; cursor:pointer; font-weight:bold; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,93,143,0.8)'" onmouseout="this.style.background='rgba(0,0,0,0.6)'">✕</button>
    </div>
    <div style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden;">
    <iframe id="trailer-iframe" style="position:absolute; top:0; left:0; width:100%; height:100%; border:none;" src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&showinfo=0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
    </div>
    </div>`;

    // 🛠️ CORRECTION : On utilise 'flex' pour centrer l'écran
    modal.style.display = 'flex';
}

function closeTrailerModal() {
    const modal = document.getElementById('modal-trailer');
    if (modal) {
        const iframe = document.getElementById('trailer-iframe');
        if (iframe) iframe.src = ''; // 🛑 Coupe la vidéo
        modal.style.display = 'none'; // Cache la modale
    }
}

let _modalMousedownTarget = null;

window.closeAndGoMedia = function(type, id) {
    // 1. On ferme la popup
    const popup = document.getElementById('instant-popup-overlay');
    if (popup) popup.remove();

    // 2. On ouvre la modale correspondante avec tes vraies fonctions
    if (type === 'movie' || type === 'film') {
        openMovieDetail(id);
    } else {
        openSerieDetail(id);
    }
};

function showDetailedPopup(items) {
    const oldPopup = document.getElementById('instant-popup-overlay');
    if (oldPopup) oldPopup.remove();

    let innerContent = '';
    const titleText = items.length === 1 ? "Nouveau téléchargement" : `${items.length} Nouveaux téléchargements`;
    let backgroundHtml = '';

    // 1. CAS UNIQUE : Un seul média (cliquable)
    if (items.length === 1) {
        const item = items[0];
        let description = "Disponible dans ta bibliothèque.";
        if (item.type === 'serie' && item.episodes && item.episodes.length > 0) {
            description = item.episodes[0].title;
        }

        // 🌟 Ajout de l'événement onclick et d'un effet de zoom au survol
        innerContent = `
        <div onclick="closeAndGoMedia('${item.type}', ${item.id})" style="cursor:pointer; display:flex; flex-direction:column; align-items:center; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
        <img src="${item.poster}" style="width:140px; border-radius:8px; margin-bottom:18px; box-shadow:0 8px 16px rgba(0,0,0,0.5);">
        <div style="color:var(--text); font-weight:600; font-size:18px; margin-bottom:8px; word-break:break-word;">${item.title}</div>
        <div style="color:var(--accent3); font-size:14px; font-weight:500;">${description}</div>
        </div>
        `;
        backgroundHtml = `<div style="position:absolute; inset:0; background:url('${item.poster}') center/cover; opacity:0.12; z-index:0; filter: blur(4px);"></div>`;
    }
    // 2. CAS MULTIPLE : Liste élargie, scrollable et cliquable
    else {
        innerContent = `<div style="text-align:left; width:100%; max-height:45vh; overflow-y:auto; padding-right:8px;">`;

        items.slice(0, 6).forEach(item => {
            let desc = item.type === 'movie' ? 'Film' : 'Série';
            if (item.type === 'serie' && item.episodes && item.episodes.length > 0) {
                desc = item.episodes.length + (item.episodes.length > 1 ? " épisodes" : " épisode");
            }
            // 🌟 Ajout de l'événement onclick et d'un effet de surbrillance
            innerContent += `
            <div onclick="closeAndGoMedia('${item.type}', ${item.id})" style="display:flex; align-items:center; gap:12px; margin-bottom:12px; background:var(--bg); padding:10px; border-radius:10px; border:1px solid var(--border); cursor:pointer; transition:all 0.2s;" onmouseover="this.style.borderColor='var(--accent3)'; this.style.background='rgba(255, 255, 255, 0.05)';" onmouseout="this.style.borderColor='var(--border)'; this.style.background='var(--bg)';">
            <img src="${item.poster}" style="width:45px; height:65px; object-fit:cover; border-radius:6px;">
            <div style="flex:1; overflow:hidden;">
            <div style="color:var(--text); font-weight:600; font-size:15px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:4px;">${item.title}</div>
            <div style="color:var(--muted); font-size:13px;">${desc}</div>
            </div>
            </div>
            `;
        });

        if (items.length > 6) {
            innerContent += `<div style="color:var(--muted); font-size:14px; text-align:center; margin-top:10px; font-weight:500;">+ ${items.length - 6} autres médias...</div>`;
        }
        innerContent += `</div>`;
    }

    const popupHtml = `
    <div id="instant-popup-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,0.75); z-index:9999; display:flex; align-items:center; justify-content:center; backdrop-filter: blur(8px); animation: fadeIn 0.3s ease;">
    <div style="background:var(--bg2); border:1px solid var(--border); border-radius:20px; width:92%; max-width:480px; text-align:center; box-shadow:0 20px 40px rgba(0,0,0,0.7); overflow:hidden; position:relative;">
    ${backgroundHtml}
    <div style="position:relative; z-index:1; padding:30px 25px;">
    <div style="font-size:32px; margin-bottom:15px; display:inline-block; background:rgba(255, 255, 255, 0.05); border:1px solid rgba(255,255,255,0.1); color:var(--text); width:60px; height:60px; line-height:60px; border-radius:50%; box-shadow:0 8px 16px rgba(0,0,0, 0.3);">🎉</div>
    <h3 style="color:var(--text); margin-bottom:25px; font-size:22px; font-weight:700;">${titleText}</h3>
    <div style="background:var(--bg3); border-radius:14px; padding:20px; margin-bottom:25px; border:1px solid var(--border); display:flex; flex-direction:column; align-items:center;">
    ${innerContent}
    </div>
    <button onclick="document.getElementById('instant-popup-overlay').remove()" style="width:100%; padding:14px; background:rgba(255, 255, 255, 0.05); border:1px solid rgba(255, 255, 255, 0.15); color:var(--text); border-radius:12px; cursor:pointer; font-size:15px; font-weight:600; transition:all 0.2s;">Fermer</button>
    </div>
    </div>
    </div>
    <style>
    @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    #instant-popup-overlay div::-webkit-scrollbar { width: 6px; }
    #instant-popup-overlay div::-webkit-scrollbar-track { background: transparent; }
    #instant-popup-overlay div::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 10px; }
    #instant-popup-overlay div::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
    </style>
    `;
    document.body.insertAdjacentHTML('beforeend', popupHtml);
}
