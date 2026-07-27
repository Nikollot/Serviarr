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

<div class="tab-page active">
<div class="page-title-row">
<div class="page-title"><?= t('page_films') ?> <span class="badge" id="movies-count">—</span>
<div style="margin-left:auto; display:flex; gap:10px;">
    <button class="btn-app-link" onclick="openExportListModal('movie')">
        <span class="icon">📤</span>
        <span class="btn-torrent-text"><?= t('export_list_btn') ?></span>
    </button>
    <button class="btn-app-link" onclick="openImportListModal('movie')">
        <span class="icon">📋</span>
        <span class="btn-torrent-text"><?= t('import_list_btn') ?></span>
    </button>
</div>

<button class="btn-torrent-add" onclick="openSearchModal('movie')">
<span>＋</span>
<span class="btn-torrent-text"><?= t('films_add') ?></span>
</button>
</div>
<a href="<?= htmlspecialchars($radarr_url) ?>" target="_blank" class="btn-app-link">
<span class="icon">🌐</span>
<span class="btn-torrent-text"><?= t('films_open_radarr') ?></span>
</a>
</div>

<div class="lib-toolbar">
<input type="text" class="lib-search" id="movies-search"
placeholder="<?= t('films_filter_placeholder') ?>" oninput="moviesSearchDebounce()">



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

<?php include 'includes/footer.php'; ?>
<script>
function pageInit() {
    loadMovies();
    const params = new URLSearchParams(window.location.search);
    if (params.get('openAdd') === 'movie') {
        openSearchModal('movie');
        history.replaceState(null, '', window.location.pathname);
    }
}
</script>
</body>
</html>
