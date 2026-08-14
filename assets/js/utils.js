// ===== Serviarr - utils.js (extrait de script.js) =====

const APP_VERSION = "1.8.1";

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