// ===== Serviarr - docker.js (extrait de script.js) =====

let _dockerAllData = [];

async function loadContainers() {
    const grid = document.getElementById('docker-grid');
    if (!grid) return;
    grid.innerHTML = `<div style="text-align:center; padding:40px; color:var(--muted); grid-column: 1 / -1;">⏳ ${t('docker_loading')}</div>`;

    const res = await api('get_containers', {}, 'GET');

    if (res.error) {
        grid.innerHTML = `<div class="empty-state"><div class="icon">🐳</div><h3>${t('docker_error')}</h3><p>${esc(res.error)}</p></div>`;
        return;
    }

    _dockerAllData = res.containers || [];
    document.getElementById('docker-count').textContent = _dockerAllData.length;
    renderDockerContainers();
}

function filterDocker() { renderDockerContainers(); }

function renderDockerContainers() {
    const grid = document.getElementById('docker-grid');
    if (!grid) return;

    const q = (document.getElementById('docker-search')?.value || '').toLowerCase();
    const filter = document.getElementById('docker-filter')?.value || 'all';

    const filtered = _dockerAllData.filter(c => {
        if (q && !c.name.toLowerCase().includes(q) && !c.image.toLowerCase().includes(q)) return false;
        if (filter === 'running' && c.state !== 'running') return false;
        if (filter === 'stopped' && c.state === 'running') return false;
        return true;
    });

    grid.innerHTML = '';

    if (filtered.length === 0) {
        grid.innerHTML = `<div style="text-align:center; padding:40px; color:var(--muted); grid-column: 1 / -1;">${t('docker_no_result')}</div>`;
        return;
    }

    filtered.forEach(c => {
        let dotColor = 'var(--muted)';
        let stateText = t('docker_unknown');
        let actionBtns = '';

        if (c.state === 'running') {
            dotColor = 'var(--accent2)';
            stateText = t('docker_running');
            actionBtns = `
            <button onclick="showDockerStats('${c.id}', '${esc(c.name)}')" style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer;" title="Stats">📊</button>
            <button onclick="showDockerLogs('${c.id}', '${esc(c.name)}')" style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer;" title="Logs">📝</button>
            <button onclick="doDockerAction('${c.id}', 'restart', this)" style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer;" title="${t('docker_restart')}">🔄</button>
            <button onclick="doDockerAction('${c.id}', 'stop', this)" style="background:rgba(255,93,143,0.1); border:1px solid rgba(255,93,143,0.3); color:var(--accent3); padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer;" title="${t('docker_stop')}">⏹</button>
            `;
        } else if (c.state === 'exited' || c.state === 'created') {
            dotColor = 'var(--accent3)';
            stateText = t('docker_stopped');
            actionBtns = `
            <button onclick="showDockerLogs('${c.id}', '${esc(c.name)}')" style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer;" title="Logs">📝</button>
            <button onclick="doDockerAction('${c.id}', 'start', this)" style="background:rgba(93,255,214,0.1); border:1px solid rgba(93,255,214,0.3); color:var(--accent2); padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer;" title="${t('docker_start')}">▶️ ${t('docker_start')}</button>
            `;
        }

        grid.innerHTML += `
        <div style="background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius); padding:16px; display:flex; flex-direction:column; gap:12px;">
        <div style="font-weight:bold; font-size:16px; color:var(--text); display:flex; align-items:center; gap:8px;">
        <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${dotColor}; box-shadow: 0 0 8px ${dotColor}; flex-shrink:0;"></span>
        <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block; flex:1;" title="${esc(c.name)}">${esc(c.name)}</span>
        </div>
        <div style="font-size:12px; color:var(--muted); font-family:var(--mono);">
        <div style="margin-bottom:4px;">📦 ${esc(c.image.split(':')[0])}</div>
        <div>⏱️ ${esc(c.status)}</div>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px;">
        ${actionBtns}
        </div>
        </div>`;
    });
}

async function doDockerAction(id, cmd, btn) {
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '⏳';
    btn.disabled = true;

    const r = await api('docker_action', { id: id, cmd: cmd });

    if (r.ok) {
        notify(t('docker_cmd_ok'), 'ok');
        setTimeout(() => loadContainers(), 1000);
    } else {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
        notify(r.error || t('docker_cmd_error'), 'err');
    }
}

function showDockerLogs(id, name) {
    let modal = document.getElementById('modal-docker-logs');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-docker-logs';
        modal.className = 'modal-bg';
        modal.style.zIndex = '10005';
        document.body.appendChild(modal);
        modal.addEventListener('click', e => {
            if (e.target === modal) {
                modal.classList.remove('open');
                if (window.dockerLogsInterval) clearInterval(window.dockerLogsInterval);
            }
        });
    }

    modal.innerHTML = `
    <div class="modal-box" style="width: clamp(480px, 90vw, 880px); max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column; padding: 0; overflow: hidden; background: var(--bg2); border-radius: 16px;">
    <h3 style="margin:0; border-bottom:1px solid var(--border); padding: 15px 20px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0; background: var(--bg2);">
    <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📝 ${t('docker_logs_title', {name: esc(name)})}</span>
    <div style="display:flex; align-items:center; gap:10px;">
    <span id="docker-logs-spinner" style="font-size:12px; color:var(--muted); opacity:0; transition:opacity 0.2s; animation: syncPulse 1.2s infinite;">↻</span>
    <button onclick="document.getElementById('modal-docker-logs').classList.remove('open'); if(window.dockerLogsInterval) clearInterval(window.dockerLogsInterval);" class="btn-circle" style="flex-shrink:0; background:var(--bg3); border:1px solid var(--border); color:var(--text); width:32px; height:32px; border-radius:8px; cursor:pointer;">✕</button>
    </div>
    </h3>
    <div style="padding: 20px; overflow-y: auto; flex: 1; display: flex; flex-direction: column;">
    <div id="docker-logs-content" style="background:var(--bg3); color:var(--text); border:1px solid var(--border); padding:15px; border-radius:8px; font-family:var(--mono); font-size:12px; flex:1; overflow-y:auto; white-space:pre-wrap; word-break:break-all;">
    ⏳ ${t('docker_logs_loading')}
    </div>
    </div>
    </div>`;
    modal.classList.add('open');

    if (window.dockerLogsInterval) clearInterval(window.dockerLogsInterval);

    const fetchLogs = () => {
        if (document.hidden) return; // 🌟 Stoppe les requêtes en arrière-plan
        if (!document.getElementById('modal-docker-logs').classList.contains('open')) {
            clearInterval(window.dockerLogsInterval);
            return;
        }

        const spinner = document.getElementById('docker-logs-spinner');
        if (spinner) spinner.style.opacity = '1';

        api('docker_logs&id=' + id, {}, 'GET').then(r => {
            if (spinner) spinner.style.opacity = '0';
            const content = document.getElementById('docker-logs-content');
            if (!content) return;

            // Auto-scroll si on est déjà en bas
            const isAtBottom = content.scrollHeight - content.clientHeight <= content.scrollTop + 20;

            if (r.success) {
                content.innerHTML = r.logs || t('docker_no_result');
                if (isAtBottom) content.scrollTop = content.scrollHeight;
            } else {
                content.innerHTML = `<span style="color:var(--accent3);">⚠️ ${r.error}</span>`;
            }
        });
    };

    fetchLogs();
    window.dockerLogsInterval = setInterval(fetchLogs, 5000); // Actualisation toutes les 3s
}

function showDockerStats(id, name) {
    let modal = document.getElementById('modal-docker-stats');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-docker-stats';
        modal.className = 'modal-bg';
        modal.style.zIndex = '10005';
        document.body.appendChild(modal);
        modal.addEventListener('click', e => {
            if (e.target === modal) {
                modal.classList.remove('open');
                if (window.dockerStatsInterval) clearInterval(window.dockerStatsInterval);
            }
        });
    }

    modal.innerHTML = `
    <div class="modal-box" style="width: clamp(340px, 88vw, 480px); max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column; padding: 0; overflow: hidden; background: var(--bg2); border-radius: 16px;">
    <h3 style="margin:0; border-bottom:1px solid var(--border); padding: 15px 20px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0; background: var(--bg2);">
    <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📊 ${t('docker_stats_title', {name: esc(name)})}</span>
    <div style="display:flex; align-items:center; gap:10px;">
    <span id="docker-stats-spinner" style="font-size:12px; color:var(--muted); opacity:0; transition:opacity 0.2s; animation: syncPulse 1.2s infinite;">↻</span>
    <button onclick="document.getElementById('modal-docker-stats').classList.remove('open'); if(window.dockerStatsInterval) clearInterval(window.dockerStatsInterval);" class="btn-circle" style="flex-shrink:0; background:var(--bg3); border:1px solid var(--border); color:var(--text); width:32px; height:32px; border-radius:8px; cursor:pointer;">✕</button>
    </div>
    </h3>
    <div id="docker-stats-content" style="padding: 20px; overflow-y: auto; flex: 1; text-align:center; color:var(--muted);">
    ⏳ ${t('docker_stats_loading')}
    </div>
    </div>`;
    modal.classList.add('open');

    if (window.dockerStatsInterval) clearInterval(window.dockerStatsInterval);

    const fetchStats = () => {
        if (document.hidden) return; // 🌟 Stoppe les requêtes en arrière-plan
        if (!document.getElementById('modal-docker-stats').classList.contains('open')) {
            clearInterval(window.dockerStatsInterval);
            return;
        }

        const spinner = document.getElementById('docker-stats-spinner');
        if (spinner) spinner.style.opacity = '1';

        api('docker_stats&id=' + id, {}, 'GET').then(r => {
            if (spinner) spinner.style.opacity = '0';
            const content = document.getElementById('docker-stats-content');
            if (!content) return;

            if (r.success) {
                content.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:20px;">
                <div style="background:var(--bg3); padding:20px; border-radius:12px; border:1px solid var(--border);">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="font-weight:bold; color:var(--text);">🧠 CPU</span>
                <span style="color:var(--accent); font-family:var(--mono); font-weight:bold;">${r.cpu}%</span>
                </div>
                <div style="background:var(--bg); height:8px; border-radius:4px; overflow:hidden;">
                <div style="background:var(--accent); height:100%; width:${Math.min(r.cpu, 100)}%; transition:width 0.5s ease;"></div>
                </div>
                </div>

                <div style="background:var(--bg3); padding:20px; border-radius:12px; border:1px solid var(--border);">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="font-weight:bold; color:var(--text);">⚡ RAM</span>
                <span style="color:var(--accent2); font-family:var(--mono); font-weight:bold;">${r.ram}%</span>
                </div>
                <div style="background:var(--bg); height:8px; border-radius:4px; overflow:hidden;">
                <div style="background:var(--accent2); height:100%; width:${Math.min(r.ram, 100)}%; transition:width 0.5s ease;"></div>
                </div>
                <div style="font-size:12px; color:var(--muted); text-align:right; margin-top:8px;">
                ${r.ram_used} / ${r.ram_limit}
                </div>
                </div>
                </div>`;
            } else {
                content.innerHTML = `<span style="color:var(--accent3);">⚠️ ${r.error}</span>`;
            }
        });
    };

    fetchStats();
    window.dockerStatsInterval = setInterval(fetchStats, 5000); // Actualisation toutes les 2s
}
