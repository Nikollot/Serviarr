<?php
$page = 'music';
$body_class = 'theme-music';
include 'includes/header.php';

$config_path = __DIR__ . '/data/config.json';
$lidarr_url = '#';
if (file_exists($config_path)) {
    $cfg = json_decode(file_get_contents($config_path), true);
    foreach ($cfg['apps'] ?? [] as $app) {
        if (($app['driver'] ?? '') === 'lidarr') {
            $lidarr_url = rtrim($app['url'], '/');
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
<?= t('page_music') ?> <span class="badge" id="music-count">—</span>

<div style="margin-left:auto; display:flex; gap:10px;">
<!-- 🌟 CORRECTION 1 : Appel de la modale d'ajout pour un ARTISTE -->
<button class="btn-torrent-add" onclick="openSearchModal('artist')">
<span>＋</span>
<span class="btn-torrent-text"><?= t('music_add') ?></span>
</button>
</div>
</div>
<a href="<?= htmlspecialchars($lidarr_url) ?>" target="_blank" class="btn-app-link">
<span class="icon">🌐</span>
<span class="btn-torrent-text"><?= t('music_open_lidarr') ?></span>
</a>
</div>

<!-- NAVIGATION DES ONGLETS -->
<nav class="hub-nav" id="music-nav">
<button class="hub-btn active" onclick="switchMusicContentTab('library', this)">
<span class="icon">🎵</span>
<span><?= t('page_music') ?></span>
</button>
<button class="hub-btn" onclick="switchMusicContentTab('history', this)">
<span class="icon">⏱️</span>
<span><?= t('tab_history') ?></span>
</button>
<button class="hub-btn" onclick="switchMusicContentTab('app-settings', this)">
<span class="icon">🗄️</span>
<span><?= t('tab_server') ?></span>
</button>
</nav>

<div class="tab-page active">

<!-- 1. ONGLET : BIBLIOTHÈQUE -->
<div id="tab-library" class="page-tab-content active">
<div class="lib-toolbar">
<input type="text" class="lib-search" id="music-search" placeholder="<?= t('music_filter_placeholder') ?>" oninput="musicSearchDebounce()">
<button class="btn-sort" id="btn-bulk-toggle" onclick="toggleBulkMode()" title="<?= t('bulk_select_toggle') ?>">☑️</button>
<input type="hidden" id="music-mode" value="library">

<select class="lib-select" id="music-filter" onchange="musicReload()">
<option value="all"><?= t('films_filter_all') ?></option>
<option value="complete"><?= t('series_filter_complete') ?></option>
<option value="incomplete"><?= t('series_filter_incomplete') ?></option>
</select>

<div class="lib-sort-wrap" style="display:flex; align-items:center;">
<label class="dl-sort-label" style="margin-right:8px; font-size:12px; font-weight:bold; color:var(--muted); text-transform:uppercase;"><?= t('dl_sort_by') ?></label>
<select id="music-sort-select" class="lib-select" onchange="sortArtists(this.value)">
<option value="title"><?= t('sort_title') ?></option>
<option value="monitored"><?= t('sort_monitored') ?></option>
<option value="albumCount"><?= t('detail_albums') ?></option>
<option value="pct"><?= t('music_sort_completion') ?></option>
</select>
<button class="btn-sort" onclick="sortArtists(_musicSortCriteria)" title="<?= t('tooltip_reverse') ?>" style="margin-left:8px;">⇅</button>
</div>
</div>

<div id="music-grid" class="media-grid"></div>
<div class="pagination" id="music-pagination"></div>
</div>

<!-- 2. ONGLET : HISTORIQUE -->
<div id="tab-history" class="page-tab-content">
<div class="lib-toolbar">
<input type="text" class="lib-search" id="history-search" placeholder="<?= t('history_search_placeholder') ?>" oninput="filterHistory()">
<button class="btn-sort" onclick="loadHistory('artist')" title="<?= t('btn_refresh') ?>">↻</button>
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
<h2 id="app-title" style="color: var(--lidarr); margin: 0 0 4px 0;">Lidarr</h2>
<div class="version-container" style="font-size: 13px; color: var(--muted);">
<span id="app-version"><?= t('dl_loading') ?></span>
<span id="app-update-badge" class="update-badge" style="display: none; background-color: #ff9800; color: #000; padding: 2px 8px; border-radius: 12px; font-weight: bold; margin-left: 10px; font-size: 11px;">✨ <?= t('update_available') ?></span>
</div>
</div>
<button class="restart-btn" onclick="appSystemCommand('artist', 'Restart')" title="<?= t('btn_restart') ?>" style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); background: transparent; border: none; color: var(--text); cursor: pointer; padding: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: color 0.2s;">
<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
<path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
<line x1="12" y1="2" x2="12" y2="12"></line>
</svg>
</button>
</div>

<div class="stats-card">
<div class="stats-card-header">
<span style="display:flex; align-items:center; gap:6px;"><span style="color:var(--lidarr);">▶</span> <?= t('stat_library') ?></span>
</div>
<div class="stats-grid">
<div class="stat-item">
<span class="stat-value" id="music-stat-total">--</span>
<span class="stat-label"><?= t('page_music') ?></span>
</div>
<div class="stat-item">
<span class="stat-value" id="music-stat-dl">--</span>
<span class="stat-label"><?= t('stat_downloaded') ?></span>
</div>
<div class="stat-item">
<span class="stat-value" id="music-stat-missing">--</span>
<span class="stat-label"><?= t('stat_missing') ?></span>
</div>
<div class="stat-item">
<span class="stat-value" id="music-stat-size">--</span>
<span class="stat-label"><?= t('stat_on_disk') ?></span>
</div>
</div>
</div>

<div class="action-menu-group">
<button class="menu-list-btn" onclick="appSystemCommand('artist', 'RssSync')"><span style="width:30px; display:inline-block; color:var(--lidarr);">🔄</span> <?= t('btn_update_library') ?></button>
</div>
</div>
</div>

</div>

<?php include 'includes/footer.php'; ?>
<script>
function switchMusicContentTab(tabId, btn) {
    const modalSerie = document.getElementById('modal-serie');
    if (modalSerie && modalSerie.classList.contains('open')) {
        closeSerieDetail(true);
    }

    document.querySelectorAll('.page-tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('#music-nav .hub-btn').forEach(el => el.classList.remove('active'));

    document.getElementById('tab-' + tabId).classList.add('active');
    if (btn) btn.classList.add('active');

    if (tabId === 'history') loadHistory('artist');
    if (tabId === 'app-settings') loadAppSystemStatus('artist');

    history.replaceState(null, '', '#' + tabId);
}

function pageInit() {
    loadArtists();

    const hash = window.location.hash.replace('#', '');
    const validTabs = ['library', 'history', 'app-settings'];

    if (hash && validTabs.includes(hash) && hash !== 'library') {
        const btn = document.querySelector(`#music-nav .hub-btn[onclick*="'${hash}'"]`);
        switchMusicContentTab(hash, btn);
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('artist')) {
        openArtistDetail(params.get('artist'));
    } else if (params.get('openAdd') === 'artist') {
        // 🌟 CORRECTION 2 : Appel de la bonne modale lors d'une redirection depuis le bouton d'ajout global
        openSearchModal('artist');
        history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
}
</script>
</body>
</html>