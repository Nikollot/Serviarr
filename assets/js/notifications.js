// ===== Serviarr - notifications.js (extrait de script.js) =====

async function toggleNotifMenu() {
    const dropdown = document.getElementById('notif-dropdown');
    if (!dropdown) return;

    if (dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
    } else {
        dropdown.style.display = 'block';
        loadNotifMenuData();
    }
}

function renderNotifsData(r) {
    const list = document.getElementById('notif-list');
    const grouped = [];
    const seriesMap = {};

    // 1. Regroupement logique des épisodes d'une même série
    r.forEach(n => {
        if (n.type === 'serie') {
            if (seriesMap[n.id] !== undefined) {
                grouped[seriesMap[n.id]].count++;
            } else {
                const lastDashIndex = n.title.lastIndexOf(' - ');
                const seriesTitle = lastDashIndex > 0 ? n.title.substring(0, lastDashIndex) : n.title;

                grouped.push({ ...n, seriesTitle: seriesTitle, count: 1 });
                seriesMap[n.id] = grouped.length - 1;
            }
        } else {
            grouped.push({ ...n, count: 1 });
        }
    });

    list.innerHTML = '';

    // 2. Fonction utilitaire pour générer le HTML d'une seule notification
    const buildNotifHtml = (n) => {
        const targetUrl = n.type === 'movie' ? `films.php?movie=${n.id}` : `series.php?serie=${n.id}`;
        const dateObj = new Date(n.date);
        const dateStr = dateObj.toLocaleDateString(currentLocale(), {day: '2-digit', month: 'short', hour:'2-digit', minute:'2-digit'});

        let titleToShow = n.title;
        let subTextHtml = `<div style="font-size:11px; color:var(--muted); margin-top:4px;">${dateStr}</div>`;

        if (n.type === 'serie' && n.count > 1) {
            titleToShow = n.seriesTitle;
            subTextHtml = `
            <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
            <span style="background:rgba(0, 202, 255, 0.15); color:var(--sonarr); border:1px solid rgba(0, 202, 255, 0.3); font-size:10px; font-weight:bold; padding:2px 6px; border-radius:6px;">${t('cal_episodes', {n: n.count})}</span>
            <span style="font-size:11px; color:var(--muted);">${dateStr}</span>
            </div>`;
        }

        const posterHtml = n.poster
        ? `<img src="${n.poster}" style="width:35px; height:50px; border-radius:6px; object-fit:cover; flex-shrink:0; border:1px solid var(--border);" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
        : '';
        const fallbackIcon = n.type === 'movie' ? '🎬' : '📺';
        const fallbackHtml = `<div style="width:35px; height:50px; border-radius:6px; background:var(--bg); display:${n.poster ? 'none' : 'flex'}; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; border:1px solid var(--border);">${fallbackIcon}</div>`;

        return `
        <div onclick="window.location.href='${targetUrl}'" style="padding:12px 16px; display:flex; gap:12px; align-items:center; cursor:pointer; border-bottom:1px solid var(--border); transition:background 0.2s;" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='transparent'">
        ${posterHtml}${fallbackHtml}
        <div style="flex:1; overflow:hidden;">
        <div style="font-size:13px; font-weight:bold; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(titleToShow)}</div>
        ${subTextHtml}
        </div>
        </div>
        `;
    };

    // 3. Séparation : Les 5 premières et les autres
    const MAX_VISIBLE = 5;
    const visibleNotifs = grouped.slice(0, MAX_VISIBLE);
    const hiddenNotifs = grouped.slice(MAX_VISIBLE);

    // Génération du HTML pour les 5 premières
    let finalHtml = visibleNotifs.map(buildNotifHtml).join('');

    // 4. S'il reste des notifications, on ajoute un bloc caché et un bouton
    if (hiddenNotifs.length > 0) {
        finalHtml += `
        <div id="notifs-expand-btn" onclick="event.stopPropagation(); document.getElementById('notifs-hidden-block').style.display='block'; this.style.display='none';" style="padding:12px; text-align:center; color:var(--text); font-size:12px; font-weight:bold; cursor:pointer; background:var(--bg3); transition:background 0.2s;" onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background='var(--bg3)'">
        ▼ ${t('notifs_show_more').replace('{n}', hiddenNotifs.length)}
        </div>
        <div id="notifs-hidden-block" style="display:none; background:rgba(0,0,0,0.1);">
        ${hiddenNotifs.map(buildNotifHtml).join('')}
        </div>
        `;
    }

    list.innerHTML = finalHtml;
}

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notif-dropdown');
    const btn = document.getElementById('notif-toggle-btn');
    if (dropdown && dropdown.style.display === 'block') {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    }
});

window.forceSyncNotifs = async function() {
    const syncIndicator = document.getElementById('notif-sync-indicator');
    if (syncIndicator) {
        syncIndicator.style.opacity = '1';
        syncIndicator.style.animation = 'syncPulse 1.2s infinite';
    }

    localStorage.removeItem('serviarr_notifs_cache');
    const list = document.getElementById('notif-list');
    if (list) list.innerHTML = `<div style="padding:15px; text-align:center; color:var(--muted); font-size:13px;">${t('notif_loading')}</div>`;

    await loadNotifMenuData();
};

async function loadNotifMenuData() {
    const list = document.getElementById('notif-list');
    const syncIndicator = document.getElementById('notif-sync-indicator');

    const cached = localStorage.getItem('serviarr_notifs_cache');
    let hasCache = false;
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.length > 0) {
                renderNotifsData(parsed);
                hasCache = true;
            }
        } catch(e) {}
    }

    if (!hasCache) {
        list.innerHTML = `<div style="padding:15px; text-align:center; color:var(--muted); font-size:13px;">${t('notif_loading')}</div>`;
    }

    if (syncIndicator) syncIndicator.style.opacity = '1';

    try {
        const r = await api('get_notifications_list', {}, 'GET');

        if (!r || r.length === 0) {
            if (!hasCache) list.innerHTML = `<div style="padding:15px; text-align:center; color:var(--muted); font-size:13px;">${t('no_recent_dl')}</div>`;
            return;
        }

        localStorage.setItem('serviarr_notifs_cache', JSON.stringify(r));
        const dropdown = document.getElementById('notif-dropdown');
        if (dropdown && dropdown.style.display === 'block') {
            renderNotifsData(r);
        }
    } catch (e) {
        console.error("Erreur maj notifs", e);
    } finally {
        if (syncIndicator) {
            syncIndicator.style.opacity = '0';
            syncIndicator.style.animation = 'none';
        }
    }
}
