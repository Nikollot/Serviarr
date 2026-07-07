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
<button class="btn-pill" style="background:var(--bg2); color:var(--text); border:1px solid var(--border); padding:8px 16px; font-weight:bold; margin-left:auto;" onclick="openImportListModal('movie')">📋 <?= t('import_list_btn') ?></button>
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

<div class="lib-sort-wrap">
<button class="btn-sort" onclick="toggleMoviesSort()" title="<?= t('tooltip_sort') ?>">⇅</button>
<div class="sort-menu" id="movies-sort-menu">
<div class="sort-menu-item active" onclick="sortMovies('title')"><?= t('sort_title') ?></div>
<div class="sort-menu-item" onclick="sortMovies('monitored')"><?= t('sort_monitored') ?></div>
<div class="sort-menu-item" onclick="sortMovies('rating')"><?= t('sort_rating') ?></div>
<div class="sort-menu-item" onclick="sortMovies('year')"><?= t('sort_year') ?></div>
<div class="sort-menu-item" onclick="sortMovies('added')"><?= t('sort_added') ?></div>
<div class="sort-menu-item" onclick="sortMovies('sizeOnDisk')"><?= t('sort_size') ?></div>
</div>
</div>

<button class="btn-sort" id="btn-bulk-toggle" onclick="toggleBulkMode()" title="<?= t('bulk_select_toggle') ?>">☑️</button>


<input type="hidden" id="movies-mode" value="library">

<select class="lib-select" id="movies-filter" onchange="moviesReload()">
<option value="all"><?= t('films_filter_all') ?></option>
<option value="downloaded"><?= t('films_filter_downloaded') ?></option>
<option value="missing"><?= t('films_filter_missing') ?></option>
</select>
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
