<?php
define('APP_ROOT', __DIR__);
require_once __DIR__ . '/includes/helpers.php';



$action = $_POST['action'] ?? $_GET['action'] ?? '';

// Actions d'authentification (doivent s'executer AVANT le portail de securite)
require_once __DIR__ . '/includes/api-auth.php';

// ===== PORTAIL DE SECURITE CENTRALISE - NE PAS DEPLACER =====


if ($action !== 'webhook_notif') {
    require_auth();
}



// 🔒 Défense en profondeur CSRF
$get_safe_actions = [
    'check_setup', 'get_2fa_status', 'get_activity_log', 'get_apps', 'get_containers',
'get_downloads', 'get_local_icons', 'get_notifications_list', 'get_push_config',
'get_tmdb_key', 'get_webhook_url', 'list_drivers', 'prowlarr_indexers',
'recent_downloads', 'recommendations', 'setup_2fa', 'get_options', 'proxy_image',
'proxy_fetch', 'movies_dashboard', 'series_dashboard', 'driver_fields',
'library_movies', 'library_series', 'movie_detail', 'serie_detail',
'movie_releases', 'episode_releases', 'season_releases', 'omnisearch',
'movie_collection', 'docker_logs', 'docker_stats', 'app_status', 'queue_status',
'tmdb_movie_detail', 'tmdb_serie_detail', 'get_torrent_files',
'calendar', 'search_movie', 'search_serie', 'get_media_raw', 'actor_credits',
'prowlarr_search', 'export_media_list', 'prowlarr_categories', 'get_recent_movies', 'get_history', 'get_all_collections',
'manual_import_scan', 'manual_import_process', 'server_stats', 'server_dl_stats', 'server_detailed_history'
];



if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action !== 'webhook_notif' && !in_array($action, $get_safe_actions, true)) {
    http_response_code(405);
    echo json_encode(['error' => t('err_requires_post')]);
    exit;
}
// ===== FIN PORTAIL =====

require_once __DIR__ . '/includes/api-apps.php';
require_once __DIR__ . '/includes/api-movies.php';
require_once __DIR__ . '/includes/api-series.php';
require_once __DIR__ . '/includes/api-media-common.php';
require_once __DIR__ . '/includes/api-torrents.php';
require_once __DIR__ . '/includes/api-docker.php';
require_once __DIR__ . '/includes/api-search-import.php';
require_once __DIR__ . '/includes/api-settings.php';
require_once __DIR__ . '/includes/api-notifications.php';
require_once __DIR__ . '/includes/api-history.php';
require_once __DIR__ . '/includes/api-calendar.php';



echo json_encode(['error' => t('err_unknown_action') . ' ' . $action]);
