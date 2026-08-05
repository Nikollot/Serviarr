<?php
$page = 'films';
$body_class = 'theme-movies';
include 'includes/header.php';

$config_path = __DIR__ . '/data/config.json';
$radarr_url = '#';
if (file_exists($config_path)) {
    $cfg = json_decode(file_get_contents($config_path), true);
    foreach ($cfg['apps'] ?? [] as $app) {
        if (($app['driver'] ?? '') === 'radarr') {
            $radarr_url = rtrim($app['url'], '/');
            break;
        }
    }
}
?>

<style>
.page-tab-content { display: none; }
.page-tab-content.active { display: block; }
</style>

<div class="page-title-row">
<div class="page-title">
<?= t('page_films') ?> <span class="badge" id="movies-count">—</span>

<div style="margin-left:auto; display:flex; gap:10px;">
<button class="btn-torrent-add" onclick="openSearchModal('movie')">
<span>＋</span>
<span class="btn-torrent-text"><?= t('films_add') ?></span>
</button>
</div>
</div>
<a href="<?= htmlspecialchars($radarr_url) ?>" target="_blank" class="btn-app-link">
<span class="icon">🌐</span>
<span class="btn-torrent-text"><?= t('films_open_radarr') ?></span>
</a>
</div>

<!-- NAVIGATION DES ONGLETS -->
<nav class="hub-nav" id="movies-nav">
    <button class="hub-btn active" onclick="switchContentTab('library', this)">
        <span class="icon">🎬</span>
        <span><?= t('page_films') ?></span>
    </button>
    <button class="hub-btn" onclick="switchContentTab('history', this)">
        <span class="icon">⏱️</span>
        <span><?= t('tab_history') ?></span>
    </button>
    <!-- Nouvel onglet Serveur -->
    <button class="hub-btn" onclick="switchContentTab('app-settings', this)">
        <span class="icon">🗄️</span>
        <span><?= t('tab_server') ?></span>
    </button>
</nav>

<div class="tab-page active">

<!-- 1. ONGLET : BIBLIOTHÈQUE -->
<div id="tab-library" class="page-tab-content active">
<div class="lib-toolbar">
<input type="text" class="lib-search" id="movies-search" placeholder="<?= t('films_filter_placeholder') ?>" oninput="moviesSearchDebounce()">
<button class="btn-sort" id="btn-bulk-toggle" onclick="toggleBulkMode()" title="<?= t('bulk_select_toggle') ?>">☑️</button>
<input type="hidden" id="movies-mode" value="library">

<select class="lib-select" id="movies-filter" onchange="moviesReload()">
<option value="all"><?= t('films_filter_all') ?></option>
<option value="downloaded"><?= t('films_filter_downloaded') ?></option>
<option value="missing"><?= t('films_filter_missing') ?></option>
</select>

<div class="lib-sort-wrap" style="display:flex; align-items:center;">
<label class="dl-sort-label" style="margin-right:8px; font-size:12px; font-weight:bold; color:var(--muted); text-transform:uppercase;"><?= t('dl_sort_by') ?? 'Tri' ?></label>
<select id="movies-sort-select" class="lib-select" onchange="sortMovies(this.value)">
<option value="title"><?= t('sort_title') ?></option>
<option value="monitored"><?= t('sort_monitored') ?></option>
<option value="rating"><?= t('sort_rating') ?></option>
<option value="year"><?= t('sort_year') ?></option>
<option value="added"><?= t('sort_added') ?></option>
<option value="sizeOnDisk"><?= t('sort_size') ?></option>
</select>
<button class="btn-sort" onclick="sortMovies(_moviesSortCriteria)" title="<?= t('tooltip_reverse') ?>" style="margin-left:8px;">⇅</button>
</div>
</div>

<div id="movies-grid" class="media-grid"></div>
<div class="pagination" id="movies-pagination"></div>
</div>

<!-- 2. ONGLET : HISTORIQUE -->
<div id="tab-history" class="page-tab-content">
<div class="lib-toolbar">
<input type="text" class="lib-search" id="history-search" placeholder="<?= t('history_search_placeholder') ?>" oninput="filterHistory()">
<button class="btn-sort" onclick="loadHistory('movie')" title="<?= t('btn_refresh') ?>">↻</button>
</div>
<div id="history-list" class="downloads-list">
<div class="empty-state">
<div class="icon">⏱️</div>
<h3><?= t('history_empty') ?></h3>
</div>
</div>
</div>

<!-- 3. ONGLET : PARAMÈTRES -->
    <div id="tab-app-settings" class="page-tab-content">
        <div class="settings-page">
            <div class="settings-header" style="position: relative; display: flex; justify-content: center; align-items: center; min-height: 50px;">
                <div class="header-info" style="text-align: center; width: 100%; padding: 0 40px;">
                    <h2 id="app-title" style="color: var(--radarr); margin: 0 0 4px 0;">Radarr</h2>
                    <div class="version-container" style="font-size: 13px; color: var(--muted);">
                        <span id="app-version"><?= t('dl_loading') ?></span>
                        <span id="app-update-badge" class="update-badge" style="display: none; background-color: #ff9800; color: #000; padding: 2px 8px; border-radius: 12px; font-weight: bold; margin-left: 10px; font-size: 11px;">✨ <?= t('update_available') ?></span>
                    </div>
                </div>
                <button class="restart-btn" onclick="appSystemCommand('movie', 'Restart')" title="<?= t('btn_restart') ?>" style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); background: transparent; border: none; color: var(--text); cursor: pointer; padding: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: color 0.2s;">
                    <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                        <line x1="12" y1="2" x2="12" y2="12"></line>
                    </svg>
                </button>
            </div>

            <div class="stats-card">
                <div class="stats-card-header">
                    <span style="display:flex; align-items:center; gap:6px;"><span style="color:var(--radarr);">▶</span> <?= t('stat_library') ?></span>
                </div>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-value" id="movie-stat-total">--</span>
                        <span class="stat-label"><?= t('stat_movies') ?></span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value" id="movie-stat-dl">--</span>
                        <span class="stat-label"><?= t('stat_downloaded') ?></span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value" id="movie-stat-missing">--</span>
                        <span class="stat-label"><?= t('stat_missing') ?></span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value" id="movie-stat-size">--</span>
                        <span class="stat-label"><?= t('stat_on_disk') ?></span>
                    </div>
                </div>
            </div>

            <div class="action-menu-group">
                <button class="menu-list-btn" onclick="openImportListModal('movie')"><span style="width:30px; display:inline-block; color:var(--radarr);">📋</span> <?= t('import_list_btn') ?></button>
                <button class="menu-list-btn" onclick="openExportListModal('movie')"><span style="width:30px; display:inline-block; color:var(--radarr);">📤</span> <?= t('export_list_btn') ?></button>
            </div>

            <div class="action-menu-group">
                <button class="menu-list-btn" onclick="openLibraryImportModal('movie')"><span style="width:30px; display:inline-block; color:var(--radarr);">📁</span> <?= t('btn_library_import') ?></button>
                <button class="menu-list-btn" onclick="viewCollections()"><span style="width:30px; display:inline-block; color:var(--radarr);">📚</span> <?= t('btn_collections') ?></button>
            </div>

            <div class="action-menu-group">
                <button class="menu-list-btn" onclick="appSystemCommand('movie', 'RefreshMovie')"><span style="width:30px; display:inline-block; color:var(--radarr);">🔄</span> <?= t('btn_update_library') ?></button>
            </div>
        </div>
    </div>

</div>

<?php include 'includes/footer.php'; ?>
<script>
function switchContentTab(tabId, btn) {
    document.querySelectorAll('.page-tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('#movies-nav .hub-btn').forEach(el => el.classList.remove('active'));

    document.getElementById('tab-' + tabId).classList.add('active');
    if (btn) btn.classList.add('active');

    if (tabId === 'history') loadHistory('movie');
    if (tabId === 'app-settings') loadAppSystemStatus('movie');

    // 🌟 Enregistre l'onglet actuel dans l'URL (sans recharger la page)
    history.replaceState(null, '', '#' + tabId);
}

function pageInit() {
    // 1. On charge toujours la librairie en arrière-plan
    loadMovies();
    
    // 2. On vérifie si un onglet spécifique est demandé dans l'URL
    const hash = window.location.hash.replace('#', '');
    const validTabs = ['library', 'history', 'app-settings'];

    if (hash && validTabs.includes(hash) && hash !== 'library') {
        const btn = document.querySelector(`#movies-nav .hub-btn[onclick*="'${hash}'"]`);
        switchContentTab(hash, btn);
    }

    // 3. Gestion de l'ouverture automatique de la modale de recherche
    const params = new URLSearchParams(window.location.search);
    if (params.get('openAdd') === 'movie') {
        openSearchModal('movie');
        history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
}
</script>
</body>
</html>
