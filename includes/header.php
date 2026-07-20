<?php
session_start();
if (isset($_SESSION['auth']) && $_SESSION['auth'] === true) {
    echo '<script>document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("auth-overlay").style.display = "none";
    document.getElementById("app").style.display = "flex";
});</script>';
}

// ── MOTEUR DE LANGUE PHP ──
$lang = $_COOKIE['serviarr_lang'] ?? 'fr';

// On cherche le fichier dans le dossier parent (racine du site)
$lang_file = __DIR__ . "/../lang/{$lang}.json";

// Sécurité au cas où header.php serait déjà à la racine
if (!file_exists($lang_file)) {
    $lang_file = __DIR__ . "/lang/{$lang}.json";
}

$translations = [];
if (file_exists($lang_file)) {
    $content = file_get_contents($lang_file);
    $decoded = json_decode($content, true);
    if (is_array($decoded)) {
        $translations = $decoded;
    }
}

function t($key) {
    global $translations;
    return $translations[$key] ?? $key; // Retourne la traduction, ou la clé si introuvable
}
?>
<!DOCTYPE html>
<html lang="<?= htmlspecialchars($lang) ?>">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="mobile-web-app-capable" content="yes">
<link rel="icon" href="/assets/img/icons/gemini-svg.svg">
<title>Serviarr</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/style.css">
<link rel="manifest" href="/manifest.json">
<script src="assets/js/i18n.js"></script>
<script>
// ── MOTEUR DE LANGUE JS ──
const I18N = <?= json_encode($translations) ?>;
</script>
<script>
const CURRENT_PAGE = '<?php echo isset($page) ? $page : ""; ?>';
const savedTheme = localStorage.getItem('serviarr_theme') || 'auto';
if (savedTheme === 'light' || (savedTheme === 'auto' && window.matchMedia('(prefers-color-scheme: light)').matches)) {
    document.documentElement.classList.add('theme-light');
}
</script>
</head>
<body class="<?php echo isset($body_class) ? $body_class : ''; ?>">

<div id="auth-overlay">
<div class="auth-box">
<div class="auth-logo-wrap">
<img src="/assets/img/icons/gemini-svg.svg" class="auth-logo-img" alt="Logo Serviarr">
<span class="auth-logo-serviarr">Serviarr</span>
</div>
<p id="auth-subtitle"><?= t('auth_title') ?></p>

<div id="auth-form-login">
<label><?= t('auth_password') ?></label>
<div style="position: relative; margin-bottom: 16px;"><input type="password" id="login-pw" placeholder="••••••••" autocomplete="current-password" style="padding-right: 40px; margin-bottom: 0;"><span onclick="togglePassword('login-pw', this)" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); cursor: pointer; color: var(--muted); user-select: none;">👁️</span></div>
<div class="auth-error auth-error-hidden" id="login-err"></div>
<button class="btn-primary" onclick="doLogin()"><?= t('auth_login_btn') ?></button>
</div>

<div id="auth-form-setup" class="auth-error-hidden">
<label style="display:block; text-align:left; margin-bottom:5px; font-size:12px; font-weight:bold; color:var(--muted); text-transform:uppercase;"><?= t('settings_lang') ?></label>
<select id="setup-lang" onchange="setLang(this.value)" style="width:100%; padding:10px; margin-bottom:20px; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:6px;">
<option value="fr" <?= ($lang === 'fr') ? 'selected' : '' ?>>Français</option>
<option value="en" <?= ($lang === 'en') ? 'selected' : '' ?>>English</option>
<option value="es" <?= ($lang === 'es') ? 'selected' : '' ?>>Español</option>
<option value="de" <?= ($lang === 'de') ? 'selected' : '' ?>>Deutsch</option>
<option value="it" <?= ($lang === 'it') ? 'selected' : '' ?>>Italiano</option>
<option value="zh" <?= ($lang === 'zh') ? 'selected' : '' ?>>中文</option>
<option value="ja" <?= ($lang === 'ja') ? 'selected' : '' ?>>日本語</option>
</select>

<p class="auth-hint"><?= t('auth_setup_hint') ?></p>
<label><?= t('auth_password') ?></label>
<div style="position: relative; margin-bottom: 16px;"><input type="password" id="setup-pw" placeholder="<?= t('setup_pw_placeholder') ?>" style="padding-right: 40px; margin-bottom: 0;"><span onclick="togglePassword('setup-pw', this)" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); cursor: pointer; color: var(--muted); user-select: none;">👁️</span></div>
<label><?= t('auth_confirm') ?></label>
<div style="position: relative; margin-bottom: 16px;"><input type="password" id="setup-pw2" placeholder="<?= t('setup_pw2_placeholder') ?>" style="padding-right: 40px; margin-bottom: 0;"><span onclick="togglePassword('setup-pw2', this)" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); cursor: pointer; color: var(--muted); user-select: none;">👁️</span></div>
<div class="auth-error auth-error-hidden" id="setup-err"></div>
<button class="btn-primary" onclick="doSetup()"><?= t('auth_create_btn') ?></button>
</div>

<div id="auth-form-2fa" class="auth-error-hidden">
<p class="auth-hint"><?= t('auth_2fa_hint') ?></p>
<label><?= t('auth_2fa_code') ?></label>
<input type="text" id="login-2fa-code" class="auth-2fa-input" placeholder="123456"
autocomplete="one-time-code" maxlength="6">
<div class="auth-error auth-error-hidden" id="2fa-err"></div>
<button class="btn-primary" onclick="doVerify2FA()"><?= t('auth_verify_btn') ?></button>
<button class="btn-detail secondary auth-cancel-btn" onclick="location.reload()"><?= t('auth_cancel_btn') ?></button>
</div>
</div>
</div>

<div id="app">
<div class="sidebar-overlay" id="sidebar-overlay" onclick="toggleSidebar()"></div>
<aside class="sidebar" id="sidebar">
<div class="sidebar-header">
<div class="sidebar-logo">
<img src="/assets/img/icons/gemini-svg.svg" alt="Logo">
<span>Serviarr</span>
</div>
</div>

<div class="omni-search-wrap">
<div class="omni-search-inner">
<input type="text" id="omni-input" class="omni-input"
placeholder="<?= t('nav_search_placeholder') ?>"
oninput="triggerOmnisearch()">
<span class="omni-icon">🔍</span>
</div>
<div id="omni-results" class="omni-dropdown"></div>
</div>

<nav class="sidebar-nav" id="sidebar-nav">
<a href="index.php" class="sidebar-item <?php if(isset($page) && $page=='home') echo 'active'; ?>">
<span class="icon">🏠</span> <span><?= t('nav_dashboard') ?></span>
</a>
</nav>

<div class="sidebar-footer">
<div class="sidebar-item" onclick="showTab('settings')">
<span class="icon">⚙️</span> <span><?= t('nav_settings') ?></span>
</div>
<div class="sidebar-item" onclick="doLogout()">
<span class="icon">🚪</span> <span><?= t('nav_logout') ?></span>
</div>
</div>
</aside>

<header>
<button class="btn-icon btn-menu" onclick="toggleSidebar()">☰</button>

<div class="header-right">
<div class="notif-wrap">
<button id="notif-toggle-btn" class="btn-notif" onclick="toggleNotifMenu()" title="<?= t('notif_latest') ?>">
🔔
</button>
<div id="notif-dropdown" class="notif-dropdown">
<div class="notif-dropdown-header" style="display: flex; justify-content: space-between; align-items: center;">
    <span><?= t('notif_history') ?></span>
    <span id="notif-sync-indicator" style="font-size: 11px; font-weight: normal; color: var(--accent); opacity: 0; transition: opacity 0.3s; display: flex; align-items: center; gap: 4px;">
        <span class="sync-dot">●</span> Sync...
    </span>
</div>
<div id="notif-list" class="notif-list">
<div class="notif-placeholder">⏳ <?= t('loading') ?></div>
</div>
</div>
</div>

<button id="theme-toggle-btn" class="btn-theme" onclick="quickToggleTheme()" title="<?= t('theme_change') ?>">
🌓
</button>
</div>
</header>

<main>
