// ===== Serviarr - auth-boot.js (extrait de script.js) =====

async function boot() {
    const r = await api('check_setup', {}, 'GET');

    // Si l'API renvoie une erreur (JSON corrompu, erreur PHP, etc.)
    if (r.error || typeof r.setup_done === 'undefined') {
        document.getElementById('auth-subtitle').innerHTML = '⚠️ ' + t('err_system_title');
        document.getElementById('auth-form-login').innerHTML = '<p style="color:var(--accent3); text-align:center; font-size:13px; line-height:1.5;">' + t('err_system_api') + '</p>';
        return;
    }

    if (r.setup_done === false) {
        document.getElementById('auth-form-login').style.display = 'none';
        document.getElementById('auth-form-setup').style.display = 'block';
        document.getElementById('auth-subtitle').textContent = t('auth_setup_hint');
    } else if (r.auth) {
        showApp();
    }

    document.getElementById('login-pw')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    document.getElementById('setup-pw2')?.addEventListener('keydown', e => { if (e.key === 'Enter') doSetup(); });
}

async function doLogin() {
    const r = await api('login', { password: document.getElementById('login-pw').value });
    if (r.ok) {
        if (r.requires_2fa) {
            document.getElementById('auth-form-login').style.display = 'none';
            document.getElementById('auth-form-2fa').style.display = 'block';
            document.getElementById('auth-subtitle').textContent = t('auth_2fa_title');
            setTimeout(() => document.getElementById('login-2fa-code').focus(), 100);
        } else {
            window.location.reload();
        }
    } else {
        showAuthErr('login', r.error || t('err_unknown'));
    }
}

async function doSetup() {
    const pw = document.getElementById('setup-pw').value, pw2 = document.getElementById('setup-pw2').value;
    if (pw !== pw2) { showAuthErr('setup', t('auth_pw_mismatch')); return; }
    const r = await api('setup', { password: pw });
    if (r.ok) showApp(); else showAuthErr('setup', r.error || t('err_unknown'));
}

async function doLogout() { await api('logout', {}); location.reload(); }

function showAuthErr(form, msg) {
    const el = document.getElementById(form + '-err');
    el.textContent = msg; el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 4000);
}

function showApp() {
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('app').style.display = 'flex';

    if (typeof pageInit === 'function') pageInit();

    // 🌟 AJOUT : Vérifier les nouveautés même lors d'un lancement complet de l'app
    if (typeof checkNewDownloadsOnFocus === 'function') {
        // On attend 1 seconde pour laisser la page charger tranquillement
        setTimeout(() => checkNewDownloadsOnFocus(), 1000);
    }

    setTimeout(() => {
        const hash = window.location.hash;
        const urlParams = new URLSearchParams(window.location.search);

        if (hash === '#hub_films') switchHomeTab('movies', null, false);
        else if (hash === '#hub_series') switchHomeTab('series', null, false);
        else if (hash === '#hub_server') switchHomeTab('server', null, false);

        if (urlParams.has('movie')) openMovieDetail(urlParams.get('movie'));
        else if (urlParams.has('tmdb')) openTmdbMovieDetail(urlParams.get('tmdb'));
        else if (urlParams.has('tmdb_serie')) openTmdbSerieDetail(urlParams.get('tmdb_serie'));
        else if (urlParams.has('serie')) openSerieDetail(urlParams.get('serie'));
        else if (urlParams.has('magnet')) {
            if (typeof openAddTorrentModal === 'function') {
                openAddTorrentModal();
                document.getElementById('torrent-magnet-link').value = urlParams.get('magnet');
            }
        }
    }, 150);

    loadDriverOptions();
    loadAppsList();
    displayVersionInSidebar();
    checkForUpdates();
}

document.addEventListener('DOMContentLoaded', () => {
    const pwInput = document.getElementById('login-pw');
    if (pwInput) {
        pwInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') doLogin();
        });
    }
});

async function doVerify2FA() {
    const code = document.getElementById('login-2fa-code').value;
    const r = await api('verify_login_2fa', { code: code });
    if (r.ok) {
        window.location.reload();
    } else {
        showAuthErr('2fa', r.error || t('notif_error'));
    }
}

document.getElementById('login-2fa-code')?.addEventListener('keydown', e => { if (e.key === 'Enter') doVerify2FA(); });

async function load2FAStatus() {
    const r = await api('get_2fa_status', {}, 'GET');
    const container = document.getElementById('settings-2fa-container');
    if (!container) return;

    if (r.enabled) {
        container.innerHTML = `
        <div style="display:flex; align-items:center; gap:15px; padding:15px; background:rgba(93,255,214,0.1); border:1px solid var(--accent2); border-radius:10px;">
        <span style="font-size:24px;">🛡️</span>
        <div style="flex:1;">
        <div style="color:var(--accent2); font-weight:bold;">${t('2fa_enabled', {fallback:'2FA activé'})}</div>
        <div style="font-size:12px; color:var(--muted);">${t('2fa_protected', {fallback:'Compte protégé'})}</div>
        </div>
        <button class="btn-sm danger" onclick="disable2FA()">${t('btn_disable_2fa')}</button>
        </div>
        `;
    } else {
        container.innerHTML = `
        <div style="display:flex; align-items:center; gap:15px; padding:15px; background:var(--bg2); border:1px solid var(--border); border-radius:10px;">
        <span style="font-size:24px;">🔓</span>
        <div style="flex:1;">
        <div style="color:var(--text); font-weight:bold;">${t('2fa_disabled', {fallback:'2FA désactivé'})}</div>
        <div style="font-size:12px; color:var(--muted);">${t('2fa_unprotected', {fallback:'Compte vulnérable'})}</div>
        </div>
        <button class="btn-sm accent" onclick="startSetup2FA()">${t('btn_enable_2fa')}</button>
        </div>

        <div id="setup-2fa-box" style="display:none; margin-top:15px; padding:20px; background:var(--bg3); border:1px solid var(--border); border-radius:10px; text-align:center;">
        <p style="font-size:13px; color:var(--text); margin-bottom:15px;">${t('2fa_step1', {fallback:'Scannez ce QR code'})}</p>
        <img id="qr-2fa" src="" style="width:160px; height:160px; border-radius:10px; border:4px solid white; margin-bottom:15px;">
        <div style="font-family:var(--mono); font-size:12px; color:var(--accent); margin-bottom:20px;" id="secret-2fa"></div>
        <p style="font-size:13px; color:var(--text); margin-bottom:10px;">${t('2fa_step2', {fallback:'Entrez le code'})}</p>
        <div style="display:flex; gap:10px; justify-content:center;">
        <input type="text" id="confirm-2fa-code" placeholder="123456" maxlength="6" style="width:120px; text-align:center; font-size:16px; letter-spacing:2px; font-weight:bold; background:var(--bg2); border:1px solid var(--border); color:var(--text); border-radius:var(--radius);">
        <button class="btn-primary" onclick="confirmSetup2FA()">${t('btn_validate')}</button>
        </div>
        </div>
        `;
    }
}

async function startSetup2FA() {
    const r = await api('setup_2fa', {}, 'GET');
    if (r.secret) {
        document.getElementById('setup-2fa-box').style.display = 'block';
        document.getElementById('secret-2fa').textContent = r.secret;
        document.getElementById('qr-2fa').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(r.url)}`;
    }
}

async function confirmSetup2FA() {
    const code = document.getElementById('confirm-2fa-code').value;
    const r = await api('confirm_2fa', { code: code });

    if (r.ok) {
        alert('✅ ' + t('success'));
        load2FAStatus();
    } else {
        alert('❌ ' + (r.error || t('notif_error')));
    }
}

async function disable2FA() {
    if (!confirm(t('confirm_disable_2fa'))) return;
    const r = await api('disable_2fa');
    if (r.ok) {
        notify(t('2fa_disabled_ok'), 'ok');
        load2FAStatus();
    }
}
