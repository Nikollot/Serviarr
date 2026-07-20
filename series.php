<?php
$page = 'series';
$body_class = 'theme-series';
include 'includes/header.php';

$config_path = __DIR__ . '/data/config.json';
$sonarr_url = '#';
if (file_exists($config_path)) {
    $cfg = json_decode(file_get_contents($config_path), true);
    foreach ($cfg['apps'] ?? [] as $app) {
        if (($app['driver'] ?? '') === 'sonarr') {
            $sonarr_url = rtrim($app['url'], '/');
            break;
        }
    }
}
?>

<div class="tab-page active">
<div class="page-title-row">
<div class="page-title"><?= t('page_series') ?> <span class="badge" id="series-count">—</span>
<div style="margin-left:auto; display:flex; gap:10px;">
    <button class="btn-app-link" onclick="openExportListModal('serie')">
        <span class="icon">📤</span>
        <span class="btn-torrent-text"><?= t('export_list_btn') ?></span>
    </button>
    <button class="btn-app-link" onclick="openImportListModal('serie')">
        <span class="icon">📋</span>
        <span class="btn-torrent-text"><?= t('import_list_btn') ?></span>
    </button>
</div>
<button class="btn-torrent-add" onclick="openSearchModal('serie')">
<span>＋</span>
<span class="btn-torrent-text"><?= t('films_add') ?></span>
</button>
</div>
<a href="<?= htmlspecialchars($sonarr_url) ?>" target="_blank" class="btn-app-link">
<span class="icon">🌐</span>
<span class="btn-torrent-text"><?= t('films_open_sonarr') ?></span>
</a>
</div>

<div class="lib-toolbar">
<input type="text" class="lib-search" id="series-search"
placeholder="<?= t('films_filter_placeholder') ?>" oninput="seriesSearchDebounce()">

<div class="lib-sort-wrap">
<button class="btn-sort" onclick="toggleSeriesSort()" title="<?= t('tooltip_sort') ?>">⇅</button>
<div class="sort-menu" id="series-sort-menu">
<div class="sort-menu-item active" onclick="sortSeries('title')"><?= t('sort_title') ?></div>
<div class="sort-menu-item" onclick="sortSeries('monitored')"><?= t('sort_monitored') ?></div>
<div class="sort-menu-item" onclick="sortSeries('nextAiring')"><?= t('sort_next_airing') ?></div>
<div class="sort-menu-item" onclick="sortSeries('added')"><?= t('sort_added') ?></div>
<div class="sort-menu-item" onclick="sortSeries('network')"><?= t('sort_network') ?></div>
<div class="sort-menu-item" onclick="sortSeries('sizeOnDisk')"><?= t('sort_size') ?></div>
<div class="sort-menu-item" onclick="sortSeries('rating')"><?= t('sort_rating') ?></div>
<div class="sort-menu-item" onclick="sortSeries('status')"><?= t('sort_status') ?></div>
</div>
</div>

<button class="btn-sort" id="btn-bulk-toggle" onclick="toggleBulkMode()" title="<?= t('bulk_select_toggle') ?>">☑️</button>


<input type="hidden" id="series-mode" value="library">

<select class="lib-select" id="series-filter" onchange="seriesReload()">
<option value="all"><?= t('series_filter_all') ?></option>
<option value="complete"><?= t('series_filter_complete') ?></option>
<option value="incomplete"><?= t('series_filter_incomplete') ?></option>
</select>
</div>

<div id="series-grid" class="media-grid"></div>
<div class="pagination" id="series-pagination"></div>
</div>

<?php include 'includes/footer.php'; ?>
<script>
function pageInit() {
    loadSeries();
    const params = new URLSearchParams(window.location.search);
    if (params.get('openAdd') === 'serie') {
        openSearchModal('serie');
        history.replaceState(null, '', window.location.pathname);
    }
}
</script>
</body>
</html>
