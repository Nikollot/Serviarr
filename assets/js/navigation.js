// ===== Serviarr - navigation.js (extrait de script.js) =====

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const isDesktop = window.innerWidth >= 1024;
    if (isDesktop) {
        document.body.classList.toggle('sidebar-closed');
    } else {
        if (sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
            overlay.classList.remove('show');
        } else {
            sidebar.classList.add('open');
            overlay.classList.add('show');
        }
    }
}

function showTab(name) {
    if (name === 'settings') {
        const settingsTab = document.getElementById('tab-settings');

        // 1. EFFET BASCULE (TOGGLE) : Si les paramètres sont déjà ouverts, on les ferme
        if (settingsTab.style.display === 'block') {
            hideSettings();
            return;
        }

        // 2. Sinon, on les ouvre et on charge les données
        settingsTab.style.display = 'block';
        loadTmdbConfig();
        loadPushConfig();
        loadWebhookUrl();
        loadActivityLog();
        if (typeof loadAppsList === 'function') loadAppsList();
        if (typeof loadDriverOptions === 'function') loadDriverOptions();
        if (typeof load2FAStatus === 'function') load2FAStatus();
        initSettingsAccordion();

        // 3. CROIX DE FERMETURE : Accrochée en haut de la page, parfaitement alignée avec le titre
        if (!document.getElementById('settings-floating-close')) {
            const closeBtn = document.createElement('button');
            closeBtn.id = 'settings-floating-close';
            closeBtn.innerHTML = '✕';
            closeBtn.setAttribute('onclick', 'hideSettings()');

            // 🛠️ CORRECTION : top réduit à 60px et taille légèrement affinée (36x36px)
            closeBtn.style.cssText = "position:absolute; top:60px; right:20px; width:36px; height:36px; border-radius:10px !important; background:var(--bg3) !important; border:1px solid var(--border) !important; color:var(--text) !important; font-size:16px !important; cursor:pointer; z-index:99999; display:flex; align-items:center; justify-content:center; padding:0 !important; margin:0 !important; box-shadow:0 4px 15px rgba(0,0,0,0.3);";

            // Petit effet visuel au survol
            closeBtn.onmouseover = () => closeBtn.style.background = 'var(--border)';
            closeBtn.onmouseout = () => closeBtn.style.background = 'var(--bg3)';

            settingsTab.appendChild(closeBtn);
        }
    }
}

function hideSettings() { document.getElementById('tab-settings').style.display = 'none'; }

function switchHomeTab(tabName, button, updateUrl = true) {
    if (document.getElementById('modal-movie')?.classList.contains('open')) closeMovieDetail();
    if (document.getElementById('modal-serie')?.classList.contains('open')) closeSerieDetail();

    document.querySelectorAll('.home-tab-content').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
    });

    if (button && button.parentNode) {
        button.parentNode.querySelectorAll('.hub-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        button.classList.add('active');
    } else {
        const btns = document.querySelectorAll('.hub-btn');
        if (btns.length > 0) {
            btns.forEach(b => b.classList.remove('active'));
            const targetBtn = Array.from(btns).find(b => b.getAttribute('onclick')?.includes(`'${tabName}'`));
            if (targetBtn) targetBtn.classList.add('active');
        }
    }

    const targetDiv = document.getElementById('home-tab-' + tabName);
    if (targetDiv) {
        targetDiv.style.display = 'block';
        targetDiv.classList.add('active');
    }

    // 🌟 Ajout de la condition pour l'onglet Serveur
    if (tabName === 'movies') {
        if (typeof loadMovies === 'function') loadMovies();
    } else if (tabName === 'series') {
        if (typeof loadSeries === 'function') loadSeries();
    } else if (tabName === 'server') {
        loadServerStats();
        if (typeof loadServerDlStats === 'function') loadServerDlStats();
        if (typeof loadServerTorrentHistory === 'function') loadServerTorrentHistory();
        if (typeof loadServerDetailedHistory === 'function') loadServerDetailedHistory(); // 🌟 AJOUT ICI
    } else {
        if (typeof loadHome === 'function') loadHome();
    }

    if (updateUrl) {
        let hash = '';
        if (tabName === 'movies') hash = '#hub_films';
        else if (tabName === 'series') hash = '#hub_series';
        else if (tabName === 'server') hash = '#hub_server';
        else hash = '#dashboard';

        history.pushState({ tab: tabName }, '', hash);
    }
}

function renderMediaRow(items, type) {
    if (!items || items.length === 0) {
        return `<p style="color:var(--muted); font-size:13px; padding: 10px;">${t('no_movie_found')}</p>`;
    }

    let html = '<div class="media-row">';

    items.forEach(item => {
        const clickAction = type === 'movie' ? `openMovieDetail(${item.id})` : `openSerieDetail(${item.id})`;
        const posterUrl = item.poster || 'placeholder.png';
        const titleDisplay = esc(item.title);

        html += `
        <div class="media-card" onclick="${clickAction}">
        <img src="${posterUrl}" alt="${titleDisplay}" loading="lazy">
        <div class="media-card-title">${titleDisplay}</div>
        </div>
        `;
    });

    html += '</div>';
    return html;
}

async function setSession() {
    await fetch('api.php?action=login_session', { method: 'POST' });
}

window.addEventListener('popstate', (event) => {
    const modalMovie = document.getElementById('modal-movie');
    const modalSerie = document.getElementById('modal-serie');

    if (modalMovie && modalMovie.classList.contains('open')) {
        closeMovieDetail(true);
        return;
    }

    if (modalSerie && modalSerie.classList.contains('open')) {
        const serieContent = document.getElementById('serie-detail-content');
        if (serieContent && serieContent.dataset.mainHtml) {
            closeSeasonView();
            history.pushState({ modal: 'serie' }, '', window.location.href);
        } else {
            closeSerieDetail(true);
        }
        return;
    }

    const hash = window.location.hash;
    if (hash === '#hub_films') {
        switchHomeTab('movies', null, false);
        return;
    } else if (hash === '#hub_series') {
        switchHomeTab('series', null, false);
        return;
    } else if (hash === '#hub_server') { // 🌟 AJOUT ICI
        switchHomeTab('server', null, false);
        return;
    } else if (hash === '#dashboard' || hash === '') {
        if (document.getElementById('home-tab-home')) {
            switchHomeTab('home', null, false);
            return;
        }
    }

    toggleListElements(true);
});

function initSettingsAccordion() {
    document.querySelectorAll('.settings-section').forEach(section => {
        const header = section.querySelector('.settings-section-header');
        const bodies = section.querySelectorAll('.settings-section-body');

        if (!header || bodies.length === 0 || header.dataset.accordionInited) return;
        header.dataset.accordionInited = 'true';

        header.style.cursor = 'pointer';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.userSelect = 'none';

        const chevron = document.createElement('span');
        chevron.innerHTML = '▼';
        chevron.style.transition = 'transform 0.2s';
        chevron.style.fontSize = '12px';
        chevron.style.color = 'var(--muted)';
        header.appendChild(chevron);

        header.addEventListener('click', () => {
            const isClosed = bodies[0].style.display === 'none';
            bodies.forEach(body => { body.style.display = isClosed ? 'block' : 'none'; });
            chevron.style.transform = isClosed ? 'rotate(0deg)' : 'rotate(-90deg)';
        });
    });
}

function initSidebarSwipe() {
    let touchStartX = 0;
    let touchStartY = 0;
    const threshold = 50;
    const edgeThreshold = 100;

    document.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.addEventListener('touchend', e => {
        if (window.innerWidth >= 1024) return;

        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

        if (Math.abs(diffX) > Math.abs(diffY)) {
            const sidebar = document.getElementById('sidebar');
            if (!sidebar) return;

            if (diffX > threshold && touchStartX < edgeThreshold) {
                if (!sidebar.classList.contains('open')) toggleSidebar();
            }
            if (diffX < -threshold) {
                if (sidebar.classList.contains('open')) toggleSidebar();
            }
        }
    }, { passive: true });
}

document.addEventListener('DOMContentLoaded', initSidebarSwipe);

function navigateFromCalendar(type, id) {
    sessionStorage.setItem('serviarr_hub_tab', 'calendar');
    if (type === 'movie' || type === 'radarr') window.location.href = 'films.php?movie=' + id + '&from=calendar';
    else window.location.href = 'series.php?serie=' + id + '&from=calendar';
}

document.addEventListener('DOMContentLoaded', () => {
    const activeTab = sessionStorage.getItem('serviarr_hub_tab');
    const hubNav = document.getElementById('hub-nav');

    if (activeTab && hubNav) {
        sessionStorage.removeItem('serviarr_hub_tab');
        setTimeout(() => {
            const btn = Array.from(hubNav.querySelectorAll('.hub-btn')).find(b => b.getAttribute('onclick') && b.getAttribute('onclick').includes(activeTab));
            if (btn && typeof switchHomeTab === 'function') switchHomeTab(activeTab, btn);
        }, 100);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const sidebarItems = document.querySelectorAll('.sidebar-item');

    sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth < 1024) {
                const sidebar = document.querySelector('.sidebar');
                const overlay = document.querySelector('.sidebar-overlay');

                if (sidebar) sidebar.classList.remove('open');
                if (overlay) overlay.classList.remove('show');
            }
        });
    });
});

document.addEventListener('keydown', function(event) {
    // 1. SÉCURITÉ : On ignore si on écrit dans une barre de recherche
    const activeElement = document.activeElement.tagName;
    if (activeElement === 'INPUT' || activeElement === 'TEXTAREA' || activeElement === 'SELECT') {
        return;
    }

    // 2. Si la touche "Alt" est pressée avec une lettre
    if (event.altKey && event.key) {
        const pressedKey = event.key.toLowerCase();

        // Raccourcis fixes (Système)
        if (pressedKey === 'd') { // Alt + D = Dashboard
            event.preventDefault();
            window.location.href = 'index.php';
            return;
        }
        if (pressedKey === 'p') { // Alt + P = Paramètres
            event.preventDefault();
            if (typeof showTab === 'function') showTab('settings');
            return;
        }

        // 3. Raccourcis dynamiques (Gérés par l'utilisateur)
        if (typeof appsCache !== 'undefined') {
            let shortcuts = {};
            try { shortcuts = JSON.parse(localStorage.getItem('serviarr_shortcuts')) || {}; } catch(e) {}

            // On cherche si une application active possède ce raccourci
            const targetApp = appsCache.find(a => a.enabled && shortcuts[a.id] === pressedKey);

            if (targetApp) {
                event.preventDefault();
                let href = '#';

                if (targetApp.driver === 'radarr') href = 'films.php';
                else if (targetApp.driver === 'sonarr') href = 'series.php';
                else if (targetApp.driver === 'prowlarr' || targetApp.driver === 'indexer') href = 'indexer.php';
                else if (targetApp.driver === 'transmission' || targetApp.driver === 'download') href = 'download.php';
                else if (targetApp.driver === 'docker') href = 'docker.php';
                else if (targetApp.driver === 'supervision') href = 'supervision.php';
                else if (targetApp.driver === 'iframe') href = 'iframe.php?id=' + targetApp.id;

                if (href !== '#') {
                    window.location.href = href;
                }
            }
        }
    }
});

function updateHubVisibility() {
    // Vérifie si Radarr et Sonarr sont présents ET activés dans le cache
    const hasRadarr = appsCache.some(a => a.driver === 'radarr' && a.enabled);
    const hasSonarr = appsCache.some(a => a.driver === 'sonarr' && a.enabled);

    // 1. Masquer ou afficher les boutons (onglets) des Hubs
    document.querySelectorAll('.hub-btn').forEach(btn => {
        const onclick = btn.getAttribute('onclick') || '';
        if (onclick.includes("'movies'")) {
            btn.style.display = hasRadarr ? '' : 'none';
        }
        if (onclick.includes("'series'")) {
            btn.style.display = hasSonarr ? '' : 'none';
        }
    });

    // 2. Masquer ou afficher les blocs du Dashboard (Zuletzt, Demnächst, etc.)
    const movieElements = ['dash-recent-movies', 'dash-upcoming-movies', 'dash-reco-movies', 'dash-popular-movies'];
    movieElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = hasRadarr ? '' : 'none';
            // Cacher également le titre (H3, H4...) situé juste avant la liste
            if (el.previousElementSibling && el.previousElementSibling.tagName.match(/^H[1-6]$/)) {
                el.previousElementSibling.style.display = hasRadarr ? '' : 'none';
            }
        }
    });

    const serieElements = ['dash-recent-series', 'dash-upcoming-series', 'dash-reco-series', 'dash-popular-series', 'dash-upcoming-new-series'];
    serieElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = hasSonarr ? '' : 'none';
            if (el.previousElementSibling && el.previousElementSibling.tagName.match(/^H[1-6]$/)) {
                el.previousElementSibling.style.display = hasSonarr ? '' : 'none';
            }
        }
    });

    // 3. Sécurité : Rediriger vers l'accueil si on désactive une app alors qu'on est sur son Hub
    const hash = window.location.hash;
    if (!hasRadarr && hash === '#hub_films') switchHomeTab('home', null, false);
    if (!hasSonarr && hash === '#hub_series') switchHomeTab('home', null, false);
}
