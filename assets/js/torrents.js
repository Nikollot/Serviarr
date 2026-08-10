// ===== Serviarr - torrents.js (extrait de script.js) =====

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getTransmissionStatus(code) {
    const statuses = {
        0: { text: t('dl_paused'), color: 'var(--muted)' },
        1: { text: t('status_check_wait'), color: '#ffa03c' },
        2: { text: t('status_checking'), color: '#ffa03c' },
        3: { text: t('status_dl_wait'), color: '#ffa03c' },
        4: { text: t('status_downloading'), color: 'var(--sonarr)' }, /* 👈 Bleu : En cours de DL */
        5: { text: t('status_seed_wait'), color: 'var(--muted)' },
        6: { text: t('status_seeding'), color: 'var(--accent)' }      /* 👈 Vert doux : Terminé / En Seed */
    };
    return statuses[code] || { text: t('status_unknown'), color: 'var(--muted)' };
}

let dlSortField = 'addedDate', dlSortReverse = false, dlTorrentsCache = [], dlFilterTab = 'all';

function formatEta(seconds) {
    if (!seconds || seconds < 0) return '∞';
    if (seconds < 60) return seconds + 's';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'min';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h' + Math.floor((seconds % 3600) / 60) + 'min';
    return Math.floor(seconds / 86400) + 'j';
}

function formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(currentLocale(), { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function sortTorrents(torrents) {
    const sorted = [...torrents].sort((a, b) => {
        switch (dlSortField) {
            case 'name':        return (a.name || '').localeCompare(b.name || '');
            // Pour tous les autres, on inverse l'ordre (b - a) pour avoir le plus grand/récent en premier
            case 'percentDone': return (b.percentDone || 0) - (a.percentDone || 0);
            case 'totalSize':   return (b.totalSize || 0) - (a.totalSize || 0);
            case 'status':      return (b.status || 0) - (a.status || 0);
            case 'uploadRatio': return (b.uploadRatio || 0) - (a.uploadRatio || 0);
            case 'addedDate':
            default:            return (b.addedDate || 0) - (a.addedDate || 0); /* 👈 Les plus récents en haut ! */
        }
    });
    return dlSortReverse ? sorted.reverse() : sorted;
}

function filterTorrents(torrents, tab) {
    switch (tab) {
        case 'active':   return torrents.filter(t => [3, 4].includes(t.status));
        // En seed : statut seed ET vitesse d'upload supérieure à zéro
        case 'seeding':  return torrents.filter(t => [5, 6].includes(t.status) && t.rateUpload > 0);
        // En pause : uniquement les torrents non terminés mis en pause (pour ne pas doublonner avec "Terminés")
        case 'paused':   return torrents.filter(t => t.status === 0 && t.percentDone < 1);
        // Terminés : TOUS les torrents à 100%, peu importe leur statut (en pause, en seed, etc.)
        case 'finished': return torrents.filter(t => t.percentDone >= 1);
        default:         return torrents;
    }
}

function updateDlBadges(torrents) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };
    set('dl-count',          torrents.length);
    set('dl-count-active',   torrents.filter(t => [3,4].includes(t.status)).length || '');
    set('dl-count-seeding',  torrents.filter(t => [5,6].includes(t.status) && t.rateUpload > 0).length || '');
    set('dl-count-paused',   torrents.filter(t => t.status === 0 && t.percentDone < 1).length || '');
    set('dl-count-finished', torrents.filter(t => t.percentDone >= 1).length || '');
}

function switchDlTab(tab, button) {
    dlFilterTab = tab;
    if (button && button.parentNode) {
        button.parentNode.querySelectorAll('.hub-btn').forEach(b => b.classList.remove('active'));
        button.classList.add('active');
    }
    renderTorrents();
}

function getVisibleTorrents() {
    const searchQuery = (document.getElementById('dl-search')?.value || '').toLowerCase();
    let torrents = filterTorrents(dlTorrentsCache, dlFilterTab);
    if (searchQuery) {
        torrents = torrents.filter(t => (t.name || '').toLowerCase().includes(searchQuery));
    }
    return sortTorrents(torrents);
}

function renderTorrents() {
    const container = document.getElementById('downloads-list');
    updateDlBadges(dlTorrentsCache);

    const torrents = getVisibleTorrents();

    if (torrents.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><h3>${t('torrent_none_found')}</h3></div>`;
        return;
    }

    let html = '';
    torrents.forEach(tInfo => {
        const status = getTransmissionStatus(tInfo.status);
        const percent = (tInfo.percentDone * 100).toFixed(1);
        const size = formatBytes(tInfo.totalSize);
        const dlSpeed = tInfo.rateDownload > 0 ? `↓ ${formatBytes(tInfo.rateDownload)}/s` : '';
        const upSpeed = tInfo.rateUpload > 0 ? `↑ ${formatBytes(tInfo.rateUpload)}/s` : '';
        const isPaused = tInfo.status === 0;

        const btnPlayPause = isPaused
        ? `<button class="btn-ep" onclick="event.stopPropagation(); torrentAction('torrent-start', '${tInfo.id}')" title="${t('torrent_resume')}">▶</button>`
        : `<button class="btn-ep" onclick="event.stopPropagation(); torrentAction('torrent-stop', '${tInfo.id}')" title="${t('torrent_pause')}">⏸</button>`;

        const bulkCheckbox = `
        <div class="bulk-select-checkbox ${bulkSelectMode ? 'visible' : ''}" style="top:8px; left:8px;" onclick="event.stopPropagation(); toggleBulkSelect('${tInfo.id}')">
        <input type="checkbox" ${bulkSelectedIds.has(tInfo.id) ? 'checked' : ''} readonly>
        </div>`;

        html += `
        <div class="card ${bulkSelectedIds.has(tInfo.id) ? 'bulk-selected' : ''}"
        style="padding:10px 14px; border-left:4px solid ${status.color}; cursor:pointer; position:relative; -webkit-touch-callout:none; user-select:none;"
        ontouchstart="startLongPress('${tInfo.id}')"
        ontouchend="cancelLongPress()"
        ontouchcancel="cancelLongPress()"
        oncontextmenu="if(window.preventNextClick) return false;"
        onclick="if(window.preventNextClick){ window.preventNextClick=false; return; } ${bulkSelectMode ? `toggleBulkSelect('${tInfo.id}')` : `openTorrentDetail('${tInfo.id}')`}">
        ${bulkCheckbox}

        <!-- Ligne 1 : Titre et Boutons -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <div style="font-weight:600; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:15px; ${bulkSelectMode ? 'padding-left:34px;' : ''}">${esc(tInfo.name)}</div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
        ${btnPlayPause}
        <button class="btn-ep" style="color:var(--accent3); border-color:var(--accent3);" onclick="event.stopPropagation(); confirmDeleteTorrent('${tInfo.id}', '${esc(tInfo.name).replace(/'/g,"\'")}')">🗑</button>
        </div>
        </div>

        <!-- Ligne 2 : Statuts, Vitesses et Infos condensées -->
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--muted); margin-bottom:6px; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; gap:12px; align-items:center;">
        <span style="color:${status.color}; font-weight:700;">${status.text}${tInfo.errorString ? ' ⚠️' : ''}</span>
        <span style="color:var(--accent); font-family:var(--mono);">${dlSpeed}</span>
        <span style="color:var(--accent2); font-family:var(--mono);">${upSpeed}</span>
        </div>

        <div style="display:flex; gap:12px; align-items:center; font-family:var(--mono);">
        <span>Ratio: ${(tInfo.uploadRatio || 0).toFixed(2)}</span>
        ${tInfo.eta > 0 ? `<span>ETA: ${formatEta(tInfo.eta)}</span>` : ''}
        <span style="font-weight:600; color:var(--text);">${percent}% / ${size}</span>
        </div>
        </div>

        <!-- Ligne 3 : Barre de progression (plus fine) -->
        <div class="progress-bar" style="height:4px; background:var(--bg3); margin:0;">
        <div class="progress-fill" style="width:${percent}%; background:${status.color}; transition:width 0.5s;"></div>
        </div>

        </div>`;
    });

    container.innerHTML = html;
}

let _dlLastErrorShown = null;

async function loadDownloads() {
    if (document.hidden) return; // 🌟 Stoppe les requêtes si l'app est en arrière-plan

    if (typeof CURRENT_PAGE === 'undefined' || CURRENT_PAGE !== 'downloads') return;

    const r = await api('get_downloads', {}, 'GET');
    if (!r.torrents) {
        if (r.error && r.error !== _dlLastErrorShown) {
            notify(r.error, 'err');
            _dlLastErrorShown = r.error;
        }
        return;
    }
    _dlLastErrorShown = null;

    dlTorrentsCache = r.torrents;
    document.getElementById('dl-count').textContent = r.torrents.length;
    renderTorrents();
}

function openAddTorrentModal() {
    let modal = document.getElementById('modal-add-torrent');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-add-torrent';
        modal.className = 'modal-bg';
        modal.style.zIndex = '10002';

        modal.innerHTML = `
        <div class="modal-box" style="width: clamp(320px, 90vw, 440px); max-width: 92vw; max-height: 90vh; display: flex; flex-direction: column; padding: 0; border-radius: 16px; overflow: hidden; background: var(--bg2);">
        <h3 style="margin:0; border-bottom:1px solid var(--border); padding: 20px; flex-shrink: 0; background: var(--bg2);">${t('torrent_add_title')}</h3>
        <div style="padding: 20px; overflow-y: auto; flex: 1;">
        <div class="form-row">
        <label style="font-size:12px; font-weight:bold; color:var(--muted); text-transform:uppercase;">${t('torrent_file_label')}</label>
        <div style="display:flex; align-items:center; gap:10px; width:100%; padding:10px; background:var(--bg3); border:1px solid var(--border); border-radius:6px;">
        <button type="button" class="btn-sm" onclick="document.getElementById('torrent-upload-file').click()" style="flex-shrink:0;">${t('file_choose')}</button>
        <span id="torrent-file-name" style="color:var(--muted); font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${t('file_none_chosen')}</span>
        <input type="file" id="torrent-upload-file" accept=".torrent" style="display:none;" onchange="document.getElementById('torrent-file-name').textContent = this.files.length ? this.files[0].name : t('file_none_chosen')">
        </div>
        </div>
        <div style="text-align:center; margin:15px 0; color:var(--muted); font-size:12px; font-weight:bold;">${t('word_or')}</div>
        <div class="form-row">
        <label style="font-size:12px; font-weight:bold; color:var(--muted); text-transform:uppercase;">${t('torrent_magnet_label')}</label>
        <input type="text" id="torrent-magnet-link" placeholder="magnet:?xt=urn:btih:..." style="width:100%; padding:10px; background:var(--bg3); border:1px solid var(--border); color:var(--text); border-radius:6px;">
        </div>
        <div style="display:flex; gap:10px; margin-top:25px; flex-shrink:0;">
        <button class="btn-primary" onclick="submitAddTorrent()" style="flex:1;">＋ ${t('torrent_add_btn')}</button>
        <button class="btn-detail secondary" onclick="document.getElementById('modal-add-torrent').classList.remove('open')">${t('auth_cancel_btn')}</button>
        </div>
        </div>
        </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
    }

    document.getElementById('torrent-upload-file').value = '';
    document.getElementById('torrent-file-name').textContent = t('file_none_chosen');
    document.getElementById('torrent-magnet-link').value = '';

    modal.classList.add('open');
}

async function submitAddTorrent() {
    const fileInput = document.getElementById('torrent-upload-file');
    const magnetInput = document.getElementById('torrent-magnet-link').value.trim();

    const fd = new FormData();
    fd.append('action', 'add_torrent');

    if (fileInput.files.length > 0) {
        fd.append('torrent_file', fileInput.files[0]);
    } else if (magnetInput) {
        fd.append('magnet', magnetInput);
    } else {
        notify(t('torrent_select_or_paste'), 'err');
        return;
    }

    document.getElementById('modal-add-torrent').classList.remove('open');
    notify(t('torrent_sending'), 'ok');

    try {
        // 🌟 AJOUT VITAL : credentials: 'same-origin' pour envoyer le cookie de session !
        const response = await fetch('api.php', { method: 'POST', body: fd, credentials: 'same-origin' });
        const res = await response.json();

        if (res.ok) {
            notify(t('torrent_added'), 'ok');
            loadDownloads();
        } else {
            notify(res.error || t('notif_error'), 'err');
        }
    } catch (e) {
        notify(t('error_connection'), 'err');
    }
}

function setDlSort(field) {
    if (dlSortField === field) {
        dlSortReverse = !dlSortReverse;
    } else {
        dlSortField = field;
        dlSortReverse = false;
    }
    const sel = document.getElementById('dl-sort-select');
    if (sel) sel.value = field;
    renderTorrents();
}

function buildFileTree(files, stats) {
    const root = { name: 'root', type: 'dir', children: {}, size: 0, completed: 0, wantedFiles: 0, totalFiles: 0 };

    files.forEach((f, i) => {
        const parts = f.name.split('/');
        let current = root;
        const isWanted = stats[i] ? stats[i].wanted : true;
        const bytesCompleted = stats[i] ? stats[i].bytesCompleted : 0;

        root.size += f.length || 0;
        root.completed += bytesCompleted;
        root.totalFiles++;
        if (isWanted) root.wantedFiles++;

        for (let j = 0; j < parts.length; j++) {
            const part = parts[j];
            const isFile = (j === parts.length - 1);

            if (!current.children[part]) {
                current.children[part] = {
                    name: part,
                    type: isFile ? 'file' : 'dir',
                    children: {},
                    fileIndex: isFile ? i : -1,
                    size: 0,
                    completed: 0,
                    wantedFiles: 0,
                    totalFiles: 0,
                    wanted: isWanted
                };
            }

            const nextNode = current.children[part];
            if (!isFile) {
                nextNode.size += f.length || 0;
                nextNode.completed += bytesCompleted;
                nextNode.totalFiles++;
                if (isWanted) nextNode.wantedFiles++;
            } else {
                nextNode.size = f.length || 0;
                nextNode.completed = bytesCompleted;
                nextNode.totalFiles = 1;
                nextNode.wantedFiles = isWanted ? 1 : 0;
            }

            current = nextNode;
        }
    });

    const rootKeys = Object.keys(root.children);
    if (rootKeys.length === 1 && root.children[rootKeys[0]].type === 'dir') {
        return root.children[rootKeys[0]];
    }

    return root;
}

function renderFileTreeHtml(node, torrentId, depth = 0) {
    let html = '';
    const sortedKeys = Object.keys(node.children).sort((a, b) => {
        const childA = node.children[a];
        const childB = node.children[b];
        if (childA.type !== childB.type) return childA.type === 'dir' ? -1 : 1;
        return a.localeCompare(b);
    });

    sortedKeys.forEach(key => {
        const child = node.children[key];
        const paddingLeft = depth > 0 ? 15 : 0;
        const pct = child.size > 0 ? (child.completed / child.size * 100).toFixed(0) : 0;

        let checkboxState = '';
        if (child.type === 'file') {
            checkboxState = child.wanted ? 'checked' : '';
        } else {
            if (child.wantedFiles === child.totalFiles) checkboxState = 'checked';
            else if (child.wantedFiles > 0) checkboxState = 'indeterminate';
        }

        const isIndeterminate = child.type === 'dir' && child.wantedFiles > 0 && child.wantedFiles < child.totalFiles;
        const fileIdAttr = child.type === 'file' ? `data-file-index="${child.fileIndex}"` : '';
        const dirAttr = child.type === 'dir' ? `data-is-dir="true"` : '';

        const checkboxHtml = `
        <input type="checkbox" class="torrent-file-checkbox"
        data-torrent-id="${torrentId}"
        ${fileIdAttr} ${dirAttr}
        ${checkboxState === 'checked' ? 'checked' : ''}
        ${isIndeterminate ? 'data-indeterminate="true"' : ''}
        onclick="event.stopPropagation()"
        onchange="toggleTorrentFileWanted(event, '${torrentId}')"
        style="margin:0; width:16px; height:16px; accent-color:var(--accent); cursor:pointer;">
        `;

        if (child.type === 'dir') {
            const folderUid = 'folder_' + Math.random().toString(36).substr(2, 9);
            html += `
            <div style="padding-left:${paddingLeft}px; margin-bottom:4px;">
            <div style="display:flex; align-items:center; gap:10px; padding:6px 8px; cursor:pointer; border-radius:6px; transition:background 0.2s;" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='transparent'" onclick="const e=document.getElementById('${folderUid}'); e.style.display=e.style.display==='none'?'block':'none'; const i=document.getElementById('icon_${folderUid}'); i.style.transform=i.style.transform==='rotate(90deg)'?'rotate(0deg)':'rotate(90deg)';">
            <div style="display:flex; align-items:center; justify-content:center;" onclick="event.stopPropagation()">
            ${checkboxHtml}
            </div>
            <span id="icon_${folderUid}" style="transition:transform 0.2s; color:var(--muted); font-size:12px; display:inline-block;">▶</span>
            <span style="font-size:16px;">📁</span>
            <div style="font-size:13px; font-weight:bold; color:var(--text); flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(child.name)}</div>
            <div style="font-size:11px; color:var(--muted);">${formatBytes(child.size)}</div>
            </div>
            <div id="${folderUid}" style="display:none; border-left:1px solid var(--border); margin-left:18px; margin-top:4px;">
            ${renderFileTreeHtml(child, torrentId, depth + 1)}
            </div>
            </div>`;
        } else {
            const isCompleted = child.completed === child.size && child.size > 0;
            const titleColor = isCompleted ? 'var(--accent)' : (child.wanted ? 'var(--text)' : 'var(--muted)');

            html += `
            <div class="torrent-file-row" style="display:flex; align-items:center; gap:10px; padding:6px 8px; padding-left:${paddingLeft + 15}px; border-radius:6px; transition:background 0.2s;" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='transparent'">
            <div style="display:flex; align-items:center; justify-content:center;">
            ${checkboxHtml}
            </div>
            <span style="font-size:16px;">📄</span>
            <div style="flex:1; min-width:0;">
            <div class="torrent-file-name" style="font-size:12px; color:${titleColor}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-decoration:${child.wanted ? 'none' : 'line-through'};" title="${esc(child.name)}">${esc(child.name)}</div>
            <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--muted); margin-top:2px;">
            <span>${formatBytes(child.size)}</span>
            <span style="color:${isCompleted ? 'var(--accent)' : 'var(--muted)'};">${pct}%</span>
            </div>
            </div>
            </div>`;
        }
    });

    return html;
}

let wantedUpdateTimeout = null;

function toggleTorrentFileWanted(event, torrentId) {
    const cb = event.target;
    const isChecked = cb.checked;

    if (cb.dataset.isDir) {
        const container = cb.closest('div[style*="padding-left"]').querySelector('div[id^="folder_"]');
        if (container) {
            container.querySelectorAll('.torrent-file-checkbox').forEach(childCb => {
                childCb.checked = isChecked;
                childCb.indeterminate = false;

                if (!childCb.dataset.isDir) {
                    const textDiv = childCb.closest('.torrent-file-row').querySelector('.torrent-file-name');
                    if (textDiv) {
                        textDiv.style.textDecoration = isChecked ? 'none' : 'line-through';
                        textDiv.style.color = isChecked ? 'var(--text)' : 'var(--muted)';
                    }
                }
            });
        }
    } else {
        const textDiv = cb.closest('.torrent-file-row').querySelector('.torrent-file-name');
        if (textDiv) {
            textDiv.style.textDecoration = isChecked ? 'none' : 'line-through';
            textDiv.style.color = isChecked ? 'var(--text)' : 'var(--muted)';
        }
    }

    const detailModal = document.getElementById('modal-torrent-detail');
    if (detailModal) {
        const allDirs = detailModal.querySelectorAll('.torrent-file-checkbox[data-is-dir="true"]');
        Array.from(allDirs).reverse().forEach(dirCb => {
            const container = dirCb.closest('div[style*="padding-left"]').querySelector('div[id^="folder_"]');
            if (container) {
                const fileCbs = Array.from(container.querySelectorAll('.torrent-file-checkbox:not([data-is-dir="true"])'));
                if (fileCbs.length > 0) {
                    const checkedCount = fileCbs.filter(c => c.checked).length;
                    if (checkedCount === 0) {
                        dirCb.checked = false;
                        dirCb.indeterminate = false;
                    } else if (checkedCount === fileCbs.length) {
                        dirCb.checked = true;
                        dirCb.indeterminate = false;
                    } else {
                        dirCb.checked = false;
                        dirCb.indeterminate = true;
                    }
                }
            }
        });
    }

    clearTimeout(wantedUpdateTimeout);
    wantedUpdateTimeout = setTimeout(async () => {
        if (!detailModal) return;
        const allFileCbs = detailModal.querySelectorAll('.torrent-file-checkbox:not([data-is-dir="true"])');
        const wanted = [];
        const unwanted = [];

        allFileCbs.forEach(c => {
            const idx = parseInt(c.dataset.fileIndex, 10);
            if (!isNaN(idx)) {
                if (c.checked) wanted.push(idx);
                else unwanted.push(idx);
            }
        });

        await api('torrent_set_files', {
            id: torrentId,
            wanted: JSON.stringify(wanted),
                  unwanted: JSON.stringify(unwanted)
        });

        if (typeof loadDownloads === 'function') loadDownloads();
    }, 600);
}

async function openTorrentDetail(id) {
    const tInfo = dlTorrentsCache.find(x => x.id === id);
    if (!tInfo) return;

    if (!tInfo.files || tInfo.files.length === 0) {
        const filesRes = await api('get_torrent_files', { id: tInfo.id }, 'GET');
        tInfo.files = filesRes.files || [];
        tInfo.fileStats = filesRes.fileStats || [];
    }

    const status = getTransmissionStatus(tInfo.status);
    const percent = (tInfo.percentDone * 100).toFixed(1);
    const eta = tInfo.eta > 0 ? formatEta(tInfo.eta) : '∞';
    const ratio = (tInfo.uploadRatio || 0).toFixed(3);
    const seeders = tInfo.peersSendingToUs || 0;
    const leechers = tInfo.peersGettingFromUs || 0;
    const totalPeers = tInfo.peersConnected || 0;
    const downloaded = formatBytes(tInfo.downloadedEver || 0);
    const uploaded = formatBytes(tInfo.uploadedEver || 0);
    const size = formatBytes(tInfo.totalSize || 0);

    let trackersStr = '-';
    if (tInfo.trackers && tInfo.trackers.length > 0) {
        trackersStr = tInfo.trackers.map(t => {
            try { return new URL(t.announce).hostname; } catch(e) { return t.announce; }
        }).filter((v, i, a) => a.indexOf(v) === i).join(', ');
    } else if (tInfo.tracker) {
        trackersStr = tInfo.tracker;
    }

    let addedDateStr = '-';
    if (tInfo.addedDate && tInfo.addedDate > 0) {
        const d = new Date(tInfo.addedDate * 1000);
        addedDateStr = d.toLocaleDateString(currentLocale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    const tree = buildFileTree(tInfo.files || [], tInfo.fileStats || []);
    const filesHtml = renderFileTreeHtml(tree, tInfo.id);

    const isPaused = (tInfo.status === 0);

    // 🌟 On ajoute des IDs (ex: id="torrent-detail-action-btn") pour pouvoir cibler ces éléments lors du rafraîchissement
    const bottomActionsHtml = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; padding-top:10px; border-top:1px solid var(--border);">
    <button id="torrent-detail-action-btn" onclick="torrentAction('torrent-${isPaused ? 'start' : 'stop'}', '${tInfo.id}'); closeTorrentDetail();"
    style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:10px; border-radius:var(--radius); cursor:pointer; font-weight:600;">
    ${isPaused ? '▶ ' + t('torrent_resume') : '⏸ ' + t('torrent_pause')}
    </button>
    <button onclick="confirmDeleteTorrent('${tInfo.id}', '${esc(tInfo.name).replace(/'/g, "\\'")}')"
    style="background:rgba(255,93,143,0.1); border:1px solid rgba(255,93,143,0.3); color:var(--accent3); padding:10px; border-radius:var(--radius); cursor:pointer; font-weight:600;">
    🗑 ${t('detail_delete')}
    </button>
    </div>`;

    const content = `
    <div style="padding:20px;">
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; gap:10px;">
    <h3 style="color:var(--accent); font-family:var(--mono); font-size:14px; line-height:1.4; margin:0; flex:1; min-width:0; overflow-wrap:anywhere; word-break:break-word;">${esc(tInfo.name)}</h3>
    <button onclick="closeTorrentDetail()" style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:6px 12px; border-radius:var(--radius); cursor:pointer; flex-shrink:0;">✕</button>
    </div>

    <div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap;">
    <span id="torrent-detail-status-badge" style="padding:4px 10px; border-radius:20px; font-size:11px; font-weight:700; background:${status.color}22; color:${status.color}; border:1px solid ${status.color}44;">${status.text}</span>
    <span id="torrent-detail-percent" style="padding:4px 10px; border-radius:20px; font-size:11px; background:var(--bg3); color:var(--muted);">${percent}%</span>
    <span id="torrent-detail-spinner" style="font-size:12px; color:var(--muted); opacity:0; transition:opacity 0.2s; animation: syncPulse 1.2s infinite; display:flex; align-items:center; margin-left:auto;">↻</span>
    </div>

    <div style="height:6px; background:var(--bg3); border-radius:3px; margin-bottom:16px;">
    <div id="torrent-detail-progress-fill" style="height:6px; width:${percent}%; background:${status.color}; border-radius:3px; transition:width 0.5s, background 0.5s;"></div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px 10px; margin-bottom:24px; padding:16px; background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius);">
    <div>
    <div style="font-size:11px; color:var(--muted); margin-bottom:4px; display:flex; align-items:center; gap:6px; text-transform:uppercase;">⬇️ ${t('torrent_downloaded')}</div>
    <div id="torrent-detail-downloaded" style="font-size:14px; font-weight:600;">${downloaded} / ${size}</div>
    </div>
    <div>
    <div style="font-size:11px; color:var(--muted); margin-bottom:4px; display:flex; align-items:center; gap:6px; text-transform:uppercase;">⬆️ ${t('torrent_uploaded')}</div>
    <div id="torrent-detail-uploaded" style="font-size:14px; font-weight:600;">${uploaded} (${ratio})</div>
    </div>
    <div>
    <div style="font-size:11px; color:var(--muted); margin-bottom:4px; display:flex; align-items:center; gap:6px; text-transform:uppercase;">⏱️ ${t('time_remaining')}</div>
    <div id="torrent-detail-eta" style="font-size:14px; font-weight:600;">${eta}</div>
    </div>
    <div>
    <div style="font-size:11px; color:var(--muted); margin-bottom:4px; display:flex; align-items:center; gap:6px; text-transform:uppercase;">👥 ${t('torrent_peers_label')}</div>
    <div id="torrent-detail-peers" style="font-size:14px; font-weight:600;">${totalPeers} (${seeders} / ${leechers})</div>
    </div>
    <div>
    <div style="font-size:11px; color:var(--muted); margin-bottom:4px; display:flex; align-items:center; gap:6px; text-transform:uppercase;">📅 ${t('torrent_added_on')}</div>
    <div style="font-size:14px; font-weight:600;">${addedDateStr}</div>
    </div>
    <div style="min-width:0;">
    <div style="font-size:11px; color:var(--muted); margin-bottom:4px; display:flex; align-items:center; gap:6px; text-transform:uppercase;">🌐 ${t('torrent_trackers')}</div>
    <div style="font-size:14px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${trackersStr}">${trackersStr}</div>
    </div>
    </div>

    <h4 style="font-size:13px; color:var(--text); margin:20px 0 10px 0; display:flex; justify-content:space-between; align-items:center;">
    <span>${t('torrent_files', { n: tInfo.files ? tInfo.files.length : 0 })}</span>
    </h4>
    <div style="background:var(--bg3); border:1px solid var(--border); border-radius:var(--radius); padding:10px; max-height:280px; overflow-y:auto; margin-bottom:16px;">
    ${filesHtml}
    </div>

    ${bottomActionsHtml}
    </div>`;

    let modal = document.getElementById('modal-torrent-detail');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-torrent-detail';
        modal.className = 'modal-bg';
        modal.addEventListener('click', e => { if (e.target === modal) closeTorrentDetail(); });
        document.body.appendChild(modal);
    }

    modal.innerHTML = `<div style="background:var(--bg); border-radius:16px; width:100%; max-width:min(680px, 92vw); margin:auto; box-shadow:0 10px 40px rgba(0,0,0,0.5);">${content}</div>`;
    modal.style.display = 'flex';
    modal.classList.add('open');

    setTimeout(() => {
        modal.querySelectorAll('.torrent-file-checkbox[data-indeterminate="true"]').forEach(cb => { cb.indeterminate = true; });
    }, 10);

    // 🚀 LA MAGIE COMMENCE ICI : Boucle d'actualisation en arrière-plan
    if (window.torrentDetailInterval) clearInterval(window.torrentDetailInterval);

    const fetchTorrentUpdates = async () => {
        if (document.hidden) return; // 🌟 Stoppe les requêtes en arrière-plan
        const modalCheck = document.getElementById('modal-torrent-detail');
        if (!modalCheck || !modalCheck.classList.contains('open')) {
            clearInterval(window.torrentDetailInterval);
            return;
        }

        const spinner = document.getElementById('torrent-detail-spinner');
        if(spinner) spinner.style.opacity = '1';

        const r = await api('get_downloads', {}, 'GET');

        if(spinner) spinner.style.opacity = '0';

        if (r.torrents) {
            dlTorrentsCache = r.torrents;

            // Met aussi à jour la liste en arrière-plan discrètement
            if (typeof renderTorrents === 'function') renderTorrents();

            const tInfoLive = r.torrents.find(x => x.id === id);
            if (tInfoLive) {
                const statusLive = getTransmissionStatus(tInfoLive.status);
                const percentLive = (tInfoLive.percentDone * 100).toFixed(1);
                const etaLive = tInfoLive.eta > 0 ? formatEta(tInfoLive.eta) : '∞';
                const ratioLive = (tInfoLive.uploadRatio || 0).toFixed(3);
                const seedersLive = tInfoLive.peersSendingToUs || 0;
                const leechersLive = tInfoLive.peersGettingFromUs || 0;
                const totalPeersLive = tInfoLive.peersConnected || 0;
                const downloadedLive = formatBytes(tInfoLive.downloadedEver || 0);
                const uploadedLive = formatBytes(tInfoLive.uploadedEver || 0);
                const sizeLive = formatBytes(tInfoLive.totalSize || 0);

                // On injecte les nouvelles valeurs sans recréer le HTML
                const badge = document.getElementById('torrent-detail-status-badge');
                if(badge) {
                    badge.textContent = statusLive.text + (tInfoLive.errorString ? ' ⚠️' : '');
                    badge.style.background = statusLive.color + '22';
                    badge.style.color = statusLive.color;
                    badge.style.borderColor = statusLive.color + '44';
                }

                const pctEl = document.getElementById('torrent-detail-percent');
                if(pctEl) pctEl.textContent = percentLive + '%';

                const fillEl = document.getElementById('torrent-detail-progress-fill');
                if(fillEl) {
                    fillEl.style.width = percentLive + '%';
                    fillEl.style.background = statusLive.color;
                }

                const dlEl = document.getElementById('torrent-detail-downloaded');
                if(dlEl) dlEl.textContent = downloadedLive + ' / ' + sizeLive;

                const ulEl = document.getElementById('torrent-detail-uploaded');
                if(ulEl) ulEl.textContent = uploadedLive + ' (' + ratioLive + ')';

                const etaEl = document.getElementById('torrent-detail-eta');
                if(etaEl) etaEl.textContent = etaLive;

                const peersEl = document.getElementById('torrent-detail-peers');
                if(peersEl) peersEl.textContent = totalPeersLive + ' (' + seedersLive + ' / ' + leechersLive + ')';

                const btnAction = document.getElementById('torrent-detail-action-btn');
                if (btnAction) {
                    const isPausedLive = (tInfoLive.status === 0);
                    btnAction.innerHTML = isPausedLive ? '▶ ' + t('torrent_resume') : '⏸ ' + t('torrent_pause');
                    btnAction.setAttribute('onclick', `torrentAction('torrent-${isPausedLive ? 'start' : 'stop'}', '${tInfoLive.id}'); closeTorrentDetail();`);
                }
            } else {
                // Si le torrent a disparu (supprimé en arrière-plan)
                clearInterval(window.torrentDetailInterval);
                closeTorrentDetail();
            }
        }
    };

    // Exécute la boucle toutes les 2,5 secondes (2500 ms)
    window.torrentDetailInterval = setInterval(fetchTorrentUpdates, 5000);
}

function closeTorrentDetail() {
    const modal = document.getElementById('modal-torrent-detail');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }
    // 🌟 On n'oublie pas de couper la boucle quand on ferme la fenêtre !
    if (window.torrentDetailInterval) clearInterval(window.torrentDetailInterval);
}

function confirmDeleteTorrent(id, name) {
    const modal = document.getElementById('modal-confirm');
    document.getElementById('confirm-title').textContent = t('torrent_delete_title');

    document.getElementById('confirm-message').innerHTML = `
    ${t('torrent_delete_msg', {name: esc(name)})}<br><br>
    <label style="display:flex; align-items:center; gap:8px; cursor:pointer; background:var(--bg3); padding:10px; border-radius:8px;">
    <input type="checkbox" id="delete-files-checkbox" style="width:16px; height:16px;">
    <span style="font-size:13px;">${t('confirm_delete_files')}</span>
    </label>
    <br>
    <span style="color:var(--accent3); font-size:11px;">⚠️ ${t('torrent_irreversible')}</span>`;

    const btn = document.getElementById('btn-confirm-action');
    btn.textContent = t('torrent_delete_confirm');

    btn.onclick = async () => {
        const deleteFiles = document.getElementById('delete-files-checkbox').checked;

        closeConfirmModal();
        closeTorrentDetail(); // 👈 LIGNE À AJOUTER ICI POUR FERMER LE DÉTAIL

        await api('torrent_action', {
            method: 'torrent-remove',
            id: id,
            'delete-local-data': deleteFiles
        });
        loadDownloads();
    };

    if (modal) modal.classList.add('open');
}

async function torrentAction(method, id) {
    await api('torrent_action', { method: method, id: id });
    loadDownloads();
}

async function torrentActionGlobale(method) {
    await api('torrent_action', { method: method });
    loadDownloads();
}

if ('registerProtocolHandler' in navigator) {
    try { navigator.registerProtocolHandler('magnet', window.location.origin + '/download.php?magnet=%s', 'Serviarr'); } catch(e) {}
}

if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (launchParams) => {
        if (!launchParams.files.length) return;
        for (const fileHandle of launchParams.files) {
            const file = await fileHandle.getFile();
            if (file.name.endsWith('.torrent')) {
                if (typeof openAddTorrentModal === 'function') {
                    openAddTorrentModal();
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    document.getElementById('torrent-upload-file').files = dataTransfer.files;
                }
            }
        }
    });
}
