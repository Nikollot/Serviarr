<?php
$page = 'indexer';
$body_class = 'theme-prowlarr';
include 'includes/header.php';
?>

<div class="tab-page active">
    <div class="page-title">
        Prowlarr <span class="badge" id="prowlarr-results-count">—</span>
    </div>

    <div class="lib-toolbar prowlarr-toolbar">
        <input type="text" class="lib-search" id="prowlarr-search"
               placeholder="<?= t('prowlarr_search_placeholder') ?>"
               onkeypress="if(event.key === 'Enter') searchProwlarr()">
        <select class="lib-select" id="prowlarr-category">
            <option value="0"><?= t('prowlarr_all_categories') ?></option>
        </select>
        <select class="lib-select" id="prowlarr-indexer">
            <option value="0"><?= t('prowlarr_all_indexers') ?></option>
        </select>
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

