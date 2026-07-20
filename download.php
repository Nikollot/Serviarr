<?php
$page = 'downloads';
$body_class = 'theme-downloads';
include 'includes/header.php';

$config_path = __DIR__ . '/data/config.json';
$trans_url = '#';
$client_label = 'Transmission';
$client_labels = [
    'transmission' => 'Transmission',
    'qbittorrent'  => 'qBittorrent',
    'deluge'       => 'Deluge',
    'utorrent'     => 'uTorrent',
];
if (file_exists($config_path)) {
    $cfg = json_decode(file_get_contents($config_path), true);
    foreach ($cfg['apps'] ?? [] as $app) {
        if (($app['driver'] ?? '') === 'download') {
            $trans_url = rtrim($app['url'], '/');
            $client_label = $client_labels[$app['client'] ?? 'transmission'] ?? 'Transmission';
            break;
        }
    }
}
?>

<div class="page-title-row">
    <div class="page-title"><?= t('page_downloads') ?></div>
    <a href="<?= htmlspecialchars($trans_url) ?>" target="_blank" class="btn-app-link">
        <span class="icon">🌐</span>
        <span class="btn-torrent-text"><?= t('dl_open_client_prefix') ?> <?= htmlspecialchars($client_label) ?> ↗</span>
    </a>
</div>

<nav class="hub-nav dl-nav" id="dl-nav">
    <button class="hub-btn active" onclick="switchDlTab('all', this)">
        <span class="icon">📋</span>
        <span><?= t('dl_all') ?> <span class="badge" id="dl-count">—</span></span>
    </button>
    <button class="hub-btn" onclick="switchDlTab('active', this)">
        <span class="icon">⬇️</span>
        <span><?= t('dl_active') ?> <span class="badge dl-badge-active" id="dl-count-active"></span></span>
    </button>
    <button class="hub-btn" onclick="switchDlTab('seeding', this)">
        <span class="icon">🌱</span>
        <span><?= t('dl_seeding') ?> <span class="badge dl-badge-seeding" id="dl-count-seeding"></span></span>
    </button>
    <button class="hub-btn" onclick="switchDlTab('paused', this)">
        <span class="icon">⏸</span>
        <span><?= t('dl_paused') ?> <span class="badge dl-badge-paused" id="dl-count-paused"></span></span>
    </button>
    <button class="hub-btn" onclick="switchDlTab('finished', this)">
        <span class="icon">✅</span>
        <span><?= t('dl_finished') ?> <span class="badge dl-badge-done" id="dl-count-finished"></span></span>
    </button>
    <button class="btn-torrent-add" onclick="openAddTorrentModal()">
        <span>＋</span>
        <span class="btn-torrent-text"><?= t('torrent_add_btn') ?></span>
    </button>
</nav>

<div class="tab-page active">
    <div class="dl-toolbar">
        <div style="margin-bottom: 15px; display: flex;">
        <input type="text" id="dl-search" class="lib-search" placeholder="<?= t('dl_search_placeholder') ?>" oninput="renderTorrents()" style="flex: 1;">
        </div>
        <div class="dl-sort-wrap">
            <label class="dl-sort-label"><?= t('dl_sort_by') ?></label>
            <select id="dl-sort-select" class="lib-select" onchange="setDlSort(this.value)">
                <option value="addedDate"><?= t('dl_sort_date') ?></option>
                <option value="name"><?= t('dl_sort_name') ?></option>
                <option value="percentDone"><?= t('dl_sort_progress') ?></option>
                <option value="totalSize"><?= t('dl_sort_size') ?></option>
                <option value="uploadRatio"><?= t('dl_sort_ratio') ?></option>
                <option value="status"><?= t('dl_sort_status') ?></option>
            </select>
            <button class="btn-sort btn-dl-sort-reverse" onclick="dlSortReverse=!dlSortReverse; renderTorrents();"
                    title="<?= t('tooltip_reverse') ?>">⇅</button>
        </div>
        <div class="dl-actions">
            <button class="btn-sort" id="btn-bulk-toggle" onclick="toggleBulkMode()" title="<?= t('bulk_select_toggle') ?>">☑️</button>
            <button class="btn-sort" style="width: auto; padding: 0 14px; font-size: 13px; font-weight: 600; gap: 6px;" onclick="torrentActionGlobale('torrent-start')">▶ <?= t('dl_resume_all') ?></button>
            <button class="btn-sort" style="width: auto; padding: 0 14px; font-size: 13px; font-weight: 600; gap: 6px;" onclick="torrentActionGlobale('torrent-stop')">⏸ <?= t('dl_pause_all') ?></button>
        </div>
    </div>

    <div id="downloads-list" class="downloads-list">
        <div class="downloads-loader">⏳ <?= t('dl_loading') ?></div>
    </div>
</div>

<?php include 'includes/footer.php'; ?>
<script>
let dlInterval;
function pageInit() {
    loadDownloads();
    dlInterval = setInterval(loadDownloads, 3000);
}
window.addEventListener('beforeunload', () => clearInterval(dlInterval));
</script>
</body>
</html>
