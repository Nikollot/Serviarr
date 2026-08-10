<?php
// ===== Serviarr - api-settings.php =====



// ── Gestion de la clé TMDB (Général) ──────────────────────────────────────────
if ($action === 'get_tmdb_key') {
    $cfg = load_config();
    echo json_encode(['tmdb_api_key' => $cfg['tmdb_api_key'] ?? '']);
    exit;
}



if ($action === 'save_tmdb_key') {
    $cfg = load_config();
    $cfg['tmdb_api_key'] = trim($_POST['key'] ?? '');
    save_config($cfg);
    echo json_encode(['ok' => true]);
    exit;
}



// ── BACKUP & EXPORT ───────────────────────────────────────────────────────────
if ($action === 'export_backup') {
    require_auth();
    $cfg = load_config();
    $frontend_prefs = isset($_POST['prefs']) ? json_decode($_POST['prefs'], true) : [];

    $backup = [
        'version' => '1.0',
        'date' => date('Y-m-d H:i:s'),
        'backend' => $cfg,
        'frontend' => $frontend_prefs
    ];

    header('Content-Type: application/json');
    header('Content-Disposition: attachment; filename="serviarr_backup_' . date('Y-m-d') . '.json"');
    echo json_encode($backup, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}



if ($action === 'import_backup') {
    require_auth();
    if (!isset($_FILES['backup_file']) || $_FILES['backup_file']['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(['error' => t('err_file_transfer_failed')]);
        exit;
    }
    $content = file_get_contents($_FILES['backup_file']['tmp_name']);
    $backup = json_decode($content, true);

    if (!$backup || !isset($backup['backend'])) {
        echo json_encode(['error' => t('err_backup_file_invalid')]);
        exit;
    }

    save_config($backup['backend']);
    echo json_encode(['ok' => true, 'frontend' => $backup['frontend'] ?? []]);
    exit;
}
