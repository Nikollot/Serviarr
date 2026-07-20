<?php
$page = 'indexer';
$body_class = 'theme-prowlarr';
include 'includes/header.php';

// 1. Récupération de l'URL de Prowlarr/Jackett depuis la configuration
$config_path = __DIR__ . '/data/config.json';
$prowlarr_url = '#';
$app_name = 'Prowlarr';

if (file_exists($config_path)) {
    $cfg = json_decode(file_get_contents($config_path), true);
    foreach ($cfg['apps'] ?? [] as $app) {
        if (($app['driver'] ?? '') === 'indexer' || ($app['driver'] ?? '') === 'prowlarr') {
            $prowlarr_url = rtrim($app['url'], '/');
            if (!empty($app['name'])) $app_name = $app['name'];
            break;
        }
    }
}
?>

<div class="tab-page active">
    <div class="page-title-row">
        <div class="page-title">
            <?= htmlspecialchars($app_name) ?> <span class="badge" id="prowlarr-results-count">—</span>
        </div>
        
        <?php if ($prowlarr_url !== '#'): ?>
        <a href="<?= htmlspecialchars($prowlarr_url) ?>" target="_blank" class="btn-app-link">
            <span class="icon">🌐</span>
            <span class="btn-torrent-text">Ouvrir <?= htmlspecialchars($app_name) ?></span>
        </a>
        <?php endif; ?>
    </div>

    <div class="lib-toolbar prowlarr-toolbar">
        <div class="prowlarr-search-wrap">
            <input type="text" class="lib-search" id="prowlarr-search"
                   placeholder="<?= t('prowlarr_search_placeholder') ?>"
                   onkeypress="if(event.key === 'Enter') searchProwlarr()">
        </div>
        
        <div class="prowlarr-filters-wrap">
            <select class="lib-select" id="prowlarr-category">
                <option value="0"><?= t('prowlarr_all_categories') ?></option>
            </select>
            <select class="lib-select" id="prowlarr-indexer">
                <option value="0"><?= t('prowlarr_all_indexers') ?></option>
            </select>
        </div>
        
        <button class="btn-primary btn-search-prowlarr" onclick="searchProwlarr()"><?= t('prowlarr_search_btn') ?></button>
    </div>

    <div id="prowlarr-content" class="prowlarr-content">
        <div class="prowlarr-placeholder"><?= t('prowlarr_loading') ?></div>
    </div>
</div>

<?php include 'includes/footer.php'; ?>
<script>
document.addEventListener('DOMContentLoaded', () => {
    if (typeof initProwlarr === 'function') {
        initProwlarr();
    } else {
        console.error("Erreur : la fonction initProwlarr est introuvable.");
    }
});
</script>