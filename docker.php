<?php
$page = 'docker';
$body_class = 'theme-docker';
include 'includes/header.php';

$config_path = __DIR__ . '/data/config.json';
$portainer_url = '';
if (file_exists($config_path)) {
    $cfg = json_decode(file_get_contents($config_path), true);
    foreach ($cfg['apps'] ?? [] as $app) {
        if (($app['driver'] ?? '') === 'docker' && !empty($app['portainer_url'])) {
            $portainer_url = rtrim($app['portainer_url'], '/');
            break;
        }
    }
}
?>

<div class="tab-page active">
    <div class="page-title-row">
        <div class="page-title">Docker <span class="badge" id="docker-count">—</span></div>
        <?php if ($portainer_url): ?>
        <a href="<?= htmlspecialchars($portainer_url) ?>" target="_blank" class="btn-app-link">
            <span class="icon">🌐</span>
            <span class="btn-torrent-text"><?= t('docker_open_portainer') ?></span>
        </a>
        <?php endif; ?>
    </div>

    <div class="lib-toolbar">
        <input type="text" class="lib-search" id="docker-search"
               placeholder="<?= t('docker_search_placeholder') ?>"
               oninput="filterDocker()">
        <select class="lib-select" id="docker-filter" onchange="filterDocker()">
            <option value="all"><?= t('docker_filter_all') ?></option>
            <option value="running"><?= t('docker_filter_running') ?></option>
            <option value="stopped"><?= t('docker_filter_stopped') ?></option>
        </select>
    </div>

    <div id="docker-grid" class="docker-grid">
        <div class="docker-placeholder">⏳ <?= t('docker_loading') ?></div>
    </div>
</div>

<?php include 'includes/footer.php'; ?>
<script>
document.addEventListener("DOMContentLoaded", loadContainers);
setTimeout(() => {
    if (typeof loadPortainerStacks === 'function') loadPortainerStacks();
}, 500);
</script>
