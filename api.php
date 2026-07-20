<?php
use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;

// 🔒 Cookie de session : SameSite=Lax empêche l'envoi du cookie depuis un site tiers (protection CSRF)
// Derrière un reverse proxy, $_SERVER['HTTPS'] n'est pas fiable : on regarde aussi X-Forwarded-Proto.
$_is_https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
|| strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'secure'   => $_is_https,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start(); // 👈 INDISPENSABLE : Active la mémoire du serveur pour TOUTES les requêtes API

ini_set('memory_limit', '512M');
set_time_limit(300);
error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE);
header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

// ── MOTEUR DE LANGUE POUR L'API ──
$lang = $_COOKIE['serviarr_lang'] ?? 'fr';
$lang_file = __DIR__ . "/lang/{$lang}.json";

$translations = [];
if (file_exists($lang_file)) {
    $content = file_get_contents($lang_file);
    $decoded = json_decode($content, true);
    if (is_array($decoded)) {
        $translations = $decoded;
    }
}

if (!function_exists('t')) {
    function t($key) {
        global $translations;
        return $translations[$key] ?? $key;
    }
}
// ─────────────────────────────────

$config_file = __DIR__ . '/data/config.json';

function load_config() {
    global $config_file, $_config_cache;
    if (isset($_config_cache)) return $_config_cache;
    if (!file_exists($config_file)) return $_config_cache = ['apps' => [], 'user' => null];
    return $_config_cache = json_decode(file_get_contents($config_file), true) ?? ['apps' => [], 'user' => null];
}

function save_config($cfg) {
    global $config_file, $_config_cache;
    $_config_cache = $cfg; // Met à jour le cache en mémoire
    return file_put_contents($config_file, json_encode($cfg, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) !== false;
}

// Récupère le token secret du webhook, le génère et le sauvegarde s'il n'existe pas encore
function get_webhook_token() {
    $cfg = load_config();
    if (empty($cfg['webhook_token'])) {
        $cfg['webhook_token'] = bin2hex(random_bytes(24));
        save_config($cfg);
    }
    return $cfg['webhook_token'];
}

// ── JOURNAL D'ACTIVITÉ ─────────────────────────────────────────────────────────
$activity_log_file = __DIR__ . '/data/activity_log.jsonl';
const ACTIVITY_LOG_MAX_LINES = 500; // Rotation automatique au-delà de ce nombre d'entrées

function log_activity($type, $target_type = null, $target_id = null, $detail = '') {
    global $activity_log_file;
    $data_dir = dirname($activity_log_file);
    if (!is_dir($data_dir)) @mkdir($data_dir, 0775, true);

    $entry = [
        'ts'          => time(),
        'type'        => $type,
        'target_type' => $target_type,
        'target_id'   => $target_id,
        'detail'      => $detail,
        'ip'          => get_client_ip(),
    ];

    $line = json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    @file_put_contents($activity_log_file, $line, FILE_APPEND | LOCK_EX);

    // Rotation : si le fichier dépasse la limite, on ne garde que les entrées les plus récentes.
    if (file_exists($activity_log_file) && filesize($activity_log_file) > 0) {
        $lines = file($activity_log_file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines !== false && count($lines) > ACTIVITY_LOG_MAX_LINES) {
            $trimmed = array_slice($lines, -ACTIVITY_LOG_MAX_LINES);
            @file_put_contents($activity_log_file, implode("\n", $trimmed) . "\n", LOCK_EX);
        }
    }
}

// ── PROTECTION ANTI-BRUTE-FORCE (login mot de passe + code 2FA) ───────────────
$lockout_file = __DIR__ . '/data/lockout.json';
const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 300; // 5 minutes

function get_client_ip() {
    return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

function load_lockout_data() {
    global $lockout_file;
    if (!file_exists($lockout_file)) return [];
    return json_decode(file_get_contents($lockout_file), true) ?? [];
}

function save_lockout_data($data) {
    global $lockout_file;
    file_put_contents($lockout_file, json_encode($data), LOCK_EX);
}

// Retourne le nombre de secondes restantes si verrouillé, sinon 0
function check_lockout($key) {
    $data = load_lockout_data();
    $entry = $data[$key] ?? null;
    if (!$entry) return 0;
    if (($entry['attempts'] ?? 0) >= LOCKOUT_MAX_ATTEMPTS) {
        $remaining = ($entry['locked_at'] ?? 0) + LOCKOUT_DURATION - time();
        if ($remaining > 0) return $remaining;
        // Le verrouillage a expiré : on réinitialise
        unset($data[$key]);
        save_lockout_data($data);
    }
    return 0;
}

function register_failed_attempt($key) {
    $data = load_lockout_data();
    $entry = $data[$key] ?? ['attempts' => 0, 'locked_at' => 0];
    $entry['attempts'] = ($entry['attempts'] ?? 0) + 1;
    if ($entry['attempts'] >= LOCKOUT_MAX_ATTEMPTS) {
        $entry['locked_at'] = time();
    }
    $data[$key] = $entry;
    save_lockout_data($data);
}

function reset_lockout($key) {
    $data = load_lockout_data();
    if (isset($data[$key])) {
        unset($data[$key]);
        save_lockout_data($data);
    }
}

function require_auth() {
    if (empty($_SESSION['auth'])) {
        http_response_code(401);
        echo json_encode(['error' => t('err_not_authenticated')]);
        exit;
    }

    // 🚀 L'ASTUCE EST ICI : On ferme l'accès en écriture à la session
    // Cela permet au serveur de traiter toutes tes requêtes API en parallèle !
    session_write_close();
}

// ── FONCTION POUR VIDER LE CACHE À LA DEMANDE ─────────────────────────────────
function clear_media_caches($type = 'all') {
    $cache_dir = __DIR__ . '/data/';
    if ($type === 'movie' || $type === 'all') {
        @unlink($cache_dir . '.cache_library_movies.json');
        @unlink($cache_dir . '.cache_movies_dashboard.json');
    }
    if ($type === 'serie' || $type === 'all') {
        @unlink($cache_dir . '.cache_library_series.json');
        @unlink($cache_dir . '.cache_series_dashboard.json');
    }
}

// ── OUTILS 2FA (TOTP) ─────────────────────────────────────────────────────────
function base32_decode($b32) {
    $b32 = strtoupper($b32);
    $l = strlen($b32);
    $n = 0; $j = 0; $dec = '';
    for ($i = 0; $i < $l; $i++) {
        $n = $n << 5;
        $n = $n + strpos("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", $b32[$i]);
        $j = $j + 5;
        if ($j >= 8) {
            $j = $j - 8;
            $dec .= chr(($n & (0xFF << $j)) >> $j);
        }
    }
    return $dec;
}

function verify_totp($secret, $code) {
    $key = base32_decode($secret);
    $time = floor(time() / 30);
    // On vérifie le code actuel, le précédent et le suivant (tolérance de 30s)
    for ($i = -1; $i <= 1; $i++) {
        $t = pack('N*', 0) . pack('N*', $time + $i);
        $hash = hash_hmac('sha1', $t, $key, true);
        $offset = ord(substr($hash, -1)) & 0x0F;
        $calculated = (
            ((ord($hash[$offset+0]) & 0x7F) << 24) |
            ((ord($hash[$offset+1]) & 0xFF) << 16) |
            ((ord($hash[$offset+2]) & 0xFF) << 8) |
            (ord($hash[$offset+3]) & 0xFF)
        ) % 1000000;
        if (hash_equals(str_pad($calculated, 6, '0', STR_PAD_LEFT), (string)$code)) return true;
    }
    return false;
}

function generate_base32_secret($length = 16) {
    $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $secret = '';
    for ($i = 0; $i < $length; $i++) $secret .= $chars[random_int(0, 31)];
    return $secret;
}

// Trouve la config d'une app par driver (retourne la première trouvée)
function find_app_by_driver($cfg, $driver) {
    foreach ($cfg['apps'] ?? [] as $app) {
        if (($app['driver'] ?? '') === $driver && ($app['enabled'] ?? true)) return $app;
    }
    return null;
}

// Requête HTTP générique
function http_get($url, $headers = []) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 300,  // 👈 Modifié : 90 secondes au lieu de 10
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $res = curl_exec($ch);
    $err = curl_error($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($err) return ['_error' => t('err_timeout_detail') . $err, '_code' => 0];
    $decoded = json_decode($res, true);
    if ($decoded === null) return ['_error' => 'Invalid JSON: ' . substr($res, 0, 200), '_code' => $code];
    return $decoded;
}

// Variante sécurisée (SSL vérifié) pour les appels vers des API publiques (TMDB, TVMaze...)
function http_get_secure($url, $headers = []) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $res = curl_exec($ch);
    $err = curl_error($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($err) return ['_error' => t('err_timeout_detail') . $err, '_code' => 0];
    $decoded = json_decode($res, true);
    if ($decoded === null) return ['_error' => 'Invalid JSON: ' . substr($res, 0, 200), '_code' => $code];
    return $decoded;
}


function http_post($url, $headers = [], $body = []) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 300,  // 👈 Modifié : 90 secondes au lieu de 10
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($body),
                      CURLOPT_HTTPHEADER     => array_merge(['Content-Type: application/json'], $headers),
                      CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $res = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);
    if ($err) return ['_error' => t('err_timeout_detail') . $err];
    return json_decode($res, true) ?? ['_error' => 'Invalid JSON'];
}

function http_put($url, $headers = [], $body = []) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 300,
        CURLOPT_CUSTOMREQUEST  => 'PUT',
        CURLOPT_POSTFIELDS     => json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                      CURLOPT_HTTPHEADER     => array_merge(['Content-Type: application/json'], $headers),
                      CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['body' => json_decode($res, true), 'code' => $code];
}

function http_put_raw($url, $headers = [], $body_encoded = '') {
    // Variante acceptant un objet déjà encodé (pour toggle_monitor qui doit garder le format stdClass)
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 300,
        CURLOPT_CUSTOMREQUEST  => 'PUT',
        CURLOPT_POSTFIELDS     => $body_encoded,
        CURLOPT_HTTPHEADER     => array_merge(['Content-Type: application/json'], $headers),
                      CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['body' => json_decode($res, true), 'code' => $code];
}

function http_delete($url, $headers = []) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_CUSTOMREQUEST  => 'DELETE',
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['body' => json_decode($res, true), 'code' => $code];
}

function arr_get($app, $endpoint) {
    $url = rtrim($app['url'], '/') . $endpoint;
    return http_get($url, ['X-Api-Key: ' . $app['api_key']]);
}

function arr_post($app, $endpoint, $body) {
    $url = rtrim($app['url'], '/') . $endpoint;
    return http_post($url, ['X-Api-Key: ' . $app['api_key']], $body);
}

function arr_put($app, $endpoint, $body) {
    $url = rtrim($app['url'], '/') . $endpoint;
    return http_put($url, ['X-Api-Key: ' . $app['api_key']], $body);
}

function arr_put_raw($app, $endpoint, $body_encoded) {
    $url = rtrim($app['url'], '/') . $endpoint;
    return http_put_raw($url, ['X-Api-Key: ' . $app['api_key']], $body_encoded);
}

function arr_delete($app, $endpoint) {
    $url = rtrim($app['url'], '/') . $endpoint;
    return http_delete($url, ['X-Api-Key: ' . $app['api_key']]);
}

$action = $_POST['action'] ?? $_GET['action'] ?? '';

// ── Auth (public) ─────────────────────────────────────────────────────────────
if ($action === 'setup') {
    $cfg = load_config();
    if (!empty($cfg['user'])) { echo json_encode(['error' => t('err_already_configured')]); exit; }
    $pw = $_POST['password'] ?? '';
    if (strlen($pw) < 4) { echo json_encode(['error' => t('err_password_too_short')]); exit; }
    $cfg['user'] = password_hash($pw, PASSWORD_BCRYPT);
    save_config($cfg);
    $_SESSION['auth'] = true;
    echo json_encode(['ok' => true]);
    exit;
}

if ($action === 'login') {
    $cfg = load_config();
    if (empty($cfg['user'])) { echo json_encode(['error' => t('err_not_configured')]); exit; }

    $lockout_key = 'login_' . get_client_ip();
    $remaining = check_lockout($lockout_key);
    if ($remaining > 0) {
        echo json_encode(['error' => t('err_too_many_attempts') . ' ' . ceil($remaining / 60) . ' ' . t('err_minutes_suffix')]);
        exit;
    }

    if (password_verify($_POST['password'] ?? '', $cfg['user'])) {
        reset_lockout($lockout_key);
        // Le mot de passe est bon, mais la 2FA est-elle activée ?
        if (!empty($cfg['2fa_enabled']) && !empty($cfg['2fa_secret'])) {
            $_SESSION['2fa_pending'] = true; // On garde le visiteur en attente
            echo json_encode(['ok' => true, 'requires_2fa' => true]);
        } else {
            $_SESSION['auth'] = true; // Connexion directe
            log_activity('login_success');
            echo json_encode(['ok' => true]);
        }
    } else {
        register_failed_attempt($lockout_key);
        log_activity('login_failed');
        echo json_encode(['error' => t('err_password_incorrect')]);
    }
    exit;
}

if ($action === 'verify_login_2fa') {
    $cfg = load_config();
    if (empty($_SESSION['2fa_pending'])) { echo json_encode(['error' => t('err_session_expired')]); exit; }
    $code = $_POST['code'] ?? '';

    $lockout_key = '2fa_' . get_client_ip();
    $remaining = check_lockout($lockout_key);
    if ($remaining > 0) {
        echo json_encode(['error' => t('err_too_many_attempts') . ' ' . ceil($remaining / 60) . ' ' . t('err_minutes_suffix')]);
        exit;
    }

    if (verify_totp($cfg['2fa_secret'], $code)) {
        reset_lockout($lockout_key);
        unset($_SESSION['2fa_pending']);
        $_SESSION['auth'] = true;
        echo json_encode(['ok' => true]);
    } else {
        register_failed_attempt($lockout_key);
        echo json_encode(['error' => 'Code 2FA incorrect']);
    }
    exit;
}

if ($action === 'logout') { session_destroy(); echo json_encode(['ok' => true]); exit; }

// ── CONFIGURATION 2FA (Connecté) ──────────────────────────────────────────────
if ($action === 'get_2fa_status') {
    require_auth();
    $cfg = load_config();
    echo json_encode(['enabled' => !empty($cfg['2fa_enabled'])]);
    exit;
}

if ($action === 'get_webhook_url') {
    require_auth();
    $token = get_webhook_token();
    // Derrière un reverse proxy (Nginx/OpenResty...), $_SERVER['HTTPS'] n'est pas fiable :
    // le proxy termine le TLS et transmet la requête en HTTP en interne. On se base donc
    // aussi sur l'en-tête X-Forwarded-Proto, que la plupart des proxys transmettent.
    $forwarded_proto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';
    $is_https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || strtolower($forwarded_proto) === 'https';
    $scheme = $is_https ? 'https' : 'http';
    $base = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    $url = $base . '/api.php?action=webhook_notif&token=' . $token;
    echo json_encode(['url' => $url]);
    exit;
}

if ($action === 'get_activity_log') {
    require_auth();
    global $activity_log_file;
    $entries = [];
    if (file_exists($activity_log_file)) {
        $lines = file($activity_log_file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        $limit = min((int)($_GET['limit'] ?? 100), ACTIVITY_LOG_MAX_LINES);
        $lines = array_slice($lines, -$limit);
        foreach (array_reverse($lines) as $line) {
            $decoded = json_decode($line, true);
            if ($decoded) $entries[] = $decoded;
        }
    }
    echo json_encode(['entries' => $entries]);
    exit;
}

if ($action === 'setup_2fa') {
    // Vérification manuelle pour ne pas bloquer l'écriture dans la session
    if (empty($_SESSION['auth'])) { echo json_encode(['error' => t('err_unauthorized')]); exit; }

    $secret = generate_base32_secret();
    $_SESSION['2fa_setup_secret'] = $secret;
    session_write_close(); // 👈 On ferme la session SEULEMENT APRÈS avoir sauvegardé le secret

    $url = "otpauth://totp/Serviarr:Admin?secret={$secret}&issuer=Serviarr";
    echo json_encode(['secret' => $secret, 'url' => $url]);
    exit;
}

if ($action === 'confirm_2fa') {
    if (empty($_SESSION['auth'])) { echo json_encode(['error' => t('err_unauthorized')]); exit; }

    $cfg = load_config();
    $code = $_POST['code'] ?? '';
    $secret = $_SESSION['2fa_setup_secret'] ?? '';

    if (!$secret) {
        echo json_encode(['error' => t('err_session_expired_settings')]);
        exit;
    }

    if (verify_totp($secret, $code)) {
        $cfg['2fa_secret'] = $secret;
        $cfg['2fa_enabled'] = true;
        save_config($cfg);
        unset($_SESSION['2fa_setup_secret']);
        session_write_close();
        echo json_encode(['ok' => true]);
    } else {
        echo json_encode(['error' => t('err_code_incorrect')]);
    }
    exit;
}

if ($action === 'disable_2fa') {
    require_auth();
    $cfg = load_config();
    unset($cfg['2fa_secret']);
    unset($cfg['2fa_enabled']);
    save_config($cfg);
    echo json_encode(['ok' => true]);
    exit;
}

if ($action === 'check_setup') {
    $cfg = load_config();
    echo json_encode(['setup_done' => !empty($cfg['user']), 'auth' => !empty($_SESSION['auth'])]);
    exit;
}

if ($action !== 'webhook_notif') {
    require_auth();
}

// 🔒 Défense en profondeur CSRF : seules les actions de LECTURE explicitement
// listées ci-dessous peuvent être appelées en GET. Toute autre action (donc
// potentiellement destructrice) exige une requête POST. Approche "liste blanche" :
// plus sûre qu'une liste noire, car tout nouvel endpoint est bloqué par défaut
// tant qu'il n'est pas explicitement déclaré ici comme sans effet de bord.
// (Complète le cookie SameSite=Lax défini plus haut, au cas où un proxy/navigateur l'ignorerait.)
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
'prowlarr_search', 'export_media_list',
];
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action !== 'webhook_notif' && !in_array($action, $get_safe_actions, true)) {
    http_response_code(405);
    echo json_encode(['error' => t('err_requires_post')]);
    exit;
}

// ── Apps CRUD ─────────────────────────────────────────────────────────────────
if ($action === 'get_apps') {
    $cfg = load_config();
    $full_apps = [];
    foreach ($cfg['apps'] ?? [] as $id => $app) {
        $app_data = $app; // On copie TOUTES les données (url, api_key, icon_url...)
        $app_data['id'] = $id; // On ajoute l'identifiant technique
        $full_apps[] = $app_data;
    }
    echo json_encode(['apps' => $full_apps]);
    exit;
}

if ($action === 'driver_fields') {
    $driver = preg_replace('/[^a-z0-9_]/', '', strtolower($_GET['driver'] ?? ''));
    $file   = __DIR__ . "/drivers/$driver.php";
    if (!file_exists($file)) { echo json_encode(['error' => t('err_driver_unknown')]); exit; }
    require_once $file;
    $fn = $driver . '_fields';
    echo json_encode(['fields' => $fn()]);
    exit;
}

if ($action === 'list_drivers') {
    $drivers = [];
    foreach (glob(__DIR__ . '/drivers/*.php') as $f) {
        $name = basename($f, '.php');
        $drivers[] = ['id' => $name, 'name' => ucfirst($name)];
    }
    echo json_encode(['drivers' => $drivers]);
    exit;
}

if ($action === 'save_app') {
    $cfg    = load_config();
    $driver = preg_replace('/[^a-z0-9_]/', '', strtolower($_POST['driver'] ?? ''));
    $id     = $_POST['id'] ?? ('app_' . uniqid());
    $name   = trim($_POST['name'] ?? ucfirst($driver));
    $file   = __DIR__ . "/drivers/$driver.php";
    if (!file_exists($file)) { echo json_encode(['error' => t('err_driver_unknown')]); exit; }
    require_once $file;
    $fn     = $driver . '_fields';
    $fields = $fn();
    $app_cfg = ['name' => $name, 'driver' => $driver, 'enabled' => true];
    foreach ($fields as $f) {
        // Le formulaire envoie désormais toujours la valeur du champ (même vide),
        // donc on fait confiance à ce qui est soumis. Si le champ est totalement
        // absent de la requête (cas non-standard), on garde l'ancienne valeur.
        if (array_key_exists($f['key'], $_POST)) {
            $app_cfg[$f['key']] = $_POST[$f['key']];
        } else {
            $app_cfg[$f['key']] = $cfg['apps'][$id][$f['key']] ?? '';
        }
    }
    if (isset($_POST['icon_url'])) {
        $app_cfg['icon_url'] = trim($_POST['icon_url']);
    }
    $cfg['apps'][$id] = $app_cfg;
    save_config($cfg);
    log_activity('save_app', 'app', $id, $name . ' (' . $driver . ')');
    echo json_encode(['ok' => true, 'id' => $id]);
    exit;
}

if ($action === 'delete_app') {
    $cfg = load_config();
    $id  = preg_replace('/[^a-z0-9_]/', '', $_POST['id'] ?? '');
    $deleted_name = $cfg['apps'][$id]['name'] ?? $id;
    unset($cfg['apps'][$id]);
    save_config($cfg);
    log_activity('delete_app', 'app', $id, $deleted_name);
    echo json_encode(['ok' => true]);
    exit;
}

if ($action === 'toggle_app') {
    $cfg = load_config();
    $id  = preg_replace('/[^a-z0-9_]/', '', $_POST['id'] ?? '');
    if (isset($cfg['apps'][$id])) {
        $cfg['apps'][$id]['enabled'] = !($cfg['apps'][$id]['enabled'] ?? true);
        save_config($cfg);
        echo json_encode(['ok' => true, 'enabled' => $cfg['apps'][$id]['enabled']]);
    } else {
        echo json_encode(['error' => t('err_app_not_found')]);
    }
    exit;
}

if ($action === 'app_status') {
    $cfg = load_config();
    $id  = $_GET['id'] ?? '';
    if (!isset($cfg['apps'][$id])) { echo json_encode(['error' => t('err_app_not_found')]); exit; }
    $app    = $cfg['apps'][$id];
    $driver = preg_replace('/[^a-z0-9_]/', '', $app['driver']);
    $file   = __DIR__ . "/drivers/$driver.php";
    if (!file_exists($file)) { echo json_encode(['error' => t('err_driver_not_found')]); exit; }
    require_once $file;
    $fn = $driver . '_status';
    echo json_encode($fn($app));
    exit;
}

if ($action === 'change_password') {
    $cfg     = load_config();
    $current = $_POST['current'] ?? '';
    $new     = $_POST['new']     ?? '';
    if (!password_verify($current, $cfg['user'])) { echo json_encode(['error' => t('err_current_password_incorrect')]); exit; }
    if (strlen($new) < 4) { echo json_encode(['error' => t('err_new_password_too_short')]); exit; }
    $cfg['user'] = password_hash($new, PASSWORD_BCRYPT);
    save_config($cfg);
    echo json_encode(['ok' => true]);
    exit;
}

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

// ── Filmographie de l'Acteur croisée avec Radarr & Sonarr ─────────────────────
if ($action === 'actor_credits') {
    require_auth();
    $cfg = load_config();
    $tmdb_key = $cfg['tmdb_api_key'] ?? '';
    if (!$tmdb_key) {
        echo json_encode(['error' => t('err_tmdb_not_configured')]);
        exit;
    }

    $name = $_GET['name'] ?? '';
    if (!$name) {
        echo json_encode(['error' => 'Nom de l\'acteur manquant.']);
        exit;
    }

    // 1. Recherche de l'acteur pour récupérer son ID TMDB original
    $search_url = "https://api.themoviedb.org/3/search/person?api_key=" . $tmdb_key . "&query=" . urlencode($name) . "&language=fr-FR";
    $search_res = http_get_secure($search_url);
    if (isset($search_res['_error']) || empty($search_res['results'])) {
        echo json_encode(['error' => 'Acteur introuvable sur TMDB.']);
        exit;
    }

    $person = $search_res['results'][0];
    $person_id = $person['id'];

    // 2. Récupération des crédits combinés (Films et Séries)
    $credits_url = "https://api.themoviedb.org/3/person/" . $person_id . "/combined_credits?api_key=" . $tmdb_key . "&language=fr-FR";
    $credits_res = http_get_secure($credits_url);
    if (isset($credits_res['_error'])) {
        echo json_encode(['error' => t('err_filmography_failed')]);
        exit;
    }

    // 3. Indexation locale des films Radarr existants par TMDB ID pour un croisement instantané
    $local_movies = [];
    $radarr = find_app_by_driver($cfg, 'radarr');
    if ($radarr) {
        $radarr_data = arr_get($radarr, '/api/v3/movie');
        if (is_array($radarr_data) && !isset($radarr_data['_error'])) {
            foreach ($radarr_data as $m) {
                if (isset($m['tmdbId'])) {
                    $local_movies[$m['tmdbId']] = ['id' => $m['id'], 'hasFile' => $m['hasFile'] ?? false];
                }
            }
        }
    }

    // 4. Indexation locale des séries Sonarr (par TMDB ID et Titre nettoyé)
    $local_series_by_title = [];
    $local_series_by_tmdb = [];
    $sonarr = find_app_by_driver($cfg, 'sonarr');
    if ($sonarr) {
        $sonarr_data = arr_get($sonarr, '/api/v3/series');
        if (is_array($sonarr_data) && !isset($sonarr_data['_error'])) {
            foreach ($sonarr_data as $s) {
                $has_file = ($s['statistics']['sizeOnDisk'] ?? 0) > 0;

                // Si ton Sonarr est assez récent pour nous donner l'ID TMDB
                if (!empty($s['tmdbId'])) {
                    $local_series_by_tmdb[$s['tmdbId']] = ['id' => $s['id'], 'hasFile' => $has_file];
                }

                // Fallback de sécurité robuste avec le titre
                $slug = strtolower(preg_replace('/[^a-z0-9]/', '', $s['title'] ?? ''));
                $local_series_by_title[$slug] = ['id' => $s['id'], 'hasFile' => $has_file];
            }
        }
    }

    // 5. Traitement et tri par popularité du contenu de la filmographie
    $cast_credits = $credits_res['cast'] ?? [];
    usort($cast_credits, fn($a, $b) => ($b['popularity'] ?? 0) <=> ($a['popularity'] ?? 0));
    $cast_credits = array_slice($cast_credits, 0, 60); // On limite aux 60 rôles les plus populaires

    $results = [];
    foreach ($cast_credits as $c) {
        $media_type = $c['media_type'] ?? 'movie';
        $tmdbId = $c['id'];
        $title = $c['title'] ?? $c['name'] ?? 'Inconnu';
        $release_date = $c['release_date'] ?? $c['first_air_date'] ?? '';
        $year = $release_date ? substr($release_date, 0, 4) : '';
        $character = $c['character'] ?? '';
        $poster = $c['poster_path'] ? 'https://image.tmdb.org/t/p/w300' . $c['poster_path'] : null;

        $in_lib = false;
        $has_file = false;
        $local_id = null;

        if ($media_type === 'movie') {
            if (isset($local_movies[$tmdbId])) {
                $in_lib = true;
                $local_id = $local_movies[$tmdbId]['id'];
                $has_file = $local_movies[$tmdbId]['hasFile'];
            }
        } else {
            $slug = strtolower(preg_replace('/[^a-z0-9]/', '', $title));
            // Vérifie d'abord via l'ID TMDB ultra-précis, sinon tente via le titre nettoyé
            if (isset($local_series_by_tmdb[$tmdbId])) {
                $in_lib = true;
                $local_id = $local_series_by_tmdb[$tmdbId]['id'];
                $has_file = $local_series_by_tmdb[$tmdbId]['hasFile'];
            } elseif (isset($local_series_by_title[$slug])) {
                $in_lib = true;
                $local_id = $local_series_by_title[$slug]['id'];
                $has_file = $local_series_by_title[$slug]['hasFile'];
            }
        }

        $results[] = [
            'tmdbId'     => $tmdbId,
            'media_type' => $media_type,
            'title'      => $title,
            'year'       => $year,
            'character'  => $character,
            'poster'     => $poster,
            'inLib'      => $in_lib,
            'hasFile'    => $has_file,
            'localId'    => $local_id
        ];
    }

    echo json_encode([
        'actor' => [
            'name' => $person['name'],
            'profile_path' => $person['profile_path'] ? 'https://image.tmdb.org/t/p/w300' . $person['profile_path'] : null,
            'known_for_department' => $person['known_for_department'] ?? 'Acting'
        ],
        'credits' => $results
    ]);
    exit;
}

// ── Configuration de la configuration Push VAPID ─────────────────────────────
if ($action === 'get_push_config') {
    require_auth();
    $cfg = load_config();
    echo json_encode([
        'vapid_email'  => $cfg['vapid_email'] ?? '',
        'vapid_public'  => $cfg['vapid_public'] ?? '',
        'vapid_private' => $cfg['vapid_private'] ?? ''
    ]);
    exit;
}

if ($action === 'save_push_config') {
    require_auth();
    $cfg = load_config();
    $cfg['vapid_email']   = trim($_POST['vapid_email'] ?? '');
    $cfg['vapid_public']   = trim($_POST['vapid_public'] ?? '');
    $cfg['vapid_private']  = trim($_POST['vapid_private'] ?? '');
    save_config($cfg);
    echo json_encode(['ok' => true]);
    exit;
}

// ── Calendrier (Sonarr + Radarr) ──────────────────────────────────────────────
if ($action === 'calendar') {
    $cfg   = load_config();
    $start = $_GET['start'] ?? date('Y-m-01');
    $end   = $_GET['end']   ?? date('Y-m-t');
    $events = [];

    $sonarr = find_app_by_driver($cfg, 'sonarr');
    if ($sonarr) {
        $base_url = rtrim($sonarr['url'], '/');
        $data = arr_get($sonarr, "/api/v3/calendar?start=$start&end=$end&includeSeries=true");
        if (is_array($data) && !isset($data['_error'])) {
            foreach ($data as $ep) {
                // Récupération de l'ID de la série pour l'affiche
                $seriesId = $ep['series']['id'] ?? null;
                $poster = $seriesId ? $base_url . '/api/v3/mediacover/' . $seriesId . '/poster-250.jpg?apikey=' . $sonarr['api_key'] : null;

                $events[] = [
                    'type'    => 'episode',
                    'date'    => substr($ep['airDateUtc'] ?? $ep['airDate'] ?? '', 0, 10),
                    'title'   => $ep['series']['title'] ?? '?',
                    'sub'     => 'S' . str_pad($ep['seasonNumber'] ?? 0, 2, '0', STR_PAD_LEFT) . 'E' . str_pad($ep['episodeNumber'] ?? 0, 2, '0', STR_PAD_LEFT) . ' · ' . ($ep['title'] ?? ''),
                    'poster'  => $poster,
                    'grabbed' => $ep['hasFile'] ?? false,
                    'seriesId' => $seriesId // 👈 LIGNE À AJOUTER
                ];
            }
        }
    }

    $radarr = find_app_by_driver($cfg, 'radarr');
    if ($radarr) {
        $base_url = rtrim($radarr['url'], '/');
        $data = arr_get($radarr, "/api/v3/calendar?start=$start&end=$end");
        if (is_array($data) && !isset($data['_error'])) {
            foreach ($data as $mv) {
                // Récupération de l'ID du film pour l'affiche
                $movieId = $mv['id'] ?? null;
                $poster = $movieId ? $base_url . '/api/v3/mediacover/' . $movieId . '/poster-250.jpg?apikey=' . $radarr['api_key'] : null;

                // Détermine la date et le type de sortie
                // Radarr classe les films dans le calendrier selon la date la plus proche dans la période
                $cinemas  = !empty($mv['inCinemas'])        ? substr($mv['inCinemas'], 0, 10) : null;
                $digital  = !empty($mv['digitalRelease'])   ? substr($mv['digitalRelease'], 0, 10) : null;
                $physical = !empty($mv['physicalRelease'])  ? substr($mv['physicalRelease'], 0, 10) : null;

                // Trouve quelle date tombe dans la période du calendrier
                $today = null;
                $releaseType = 'Attendu';
                foreach ([
                    $cinemas  => '🎬 Cinéma',
                    $digital  => '💻 Digital',
                    $physical => '📦 Physique',
                ] as $date => $label) {
                    if ($date && $date >= $start && $date <= $end) {
                        if ($today === null || $date < $today) {
                            $today = $date;
                            $releaseType = $label;
                        }
                    }
                }

                // Fallback : utilise n'importe quelle date disponible
                if ($today === null) {
                    $today = $cinemas ?? $digital ?? $physical ?? '';
                    if ($cinemas)  $releaseType = '🎬 Cinéma';
                    elseif ($digital)  $releaseType = '💻 Digital';
                    elseif ($physical) $releaseType = '📦 Physique';
                }

                if ($mv['hasFile'] ?? false) $releaseType .= ' · ✅ Disponible';

                if (empty($today)) continue; // Skip si aucune date

                $events[] = [
                    'type'        => 'movie',
                    'date'        => $today,
                    'title'       => $mv['title'] ?? '?',
                    'sub'         => ($mv['year'] ?? '') . ' · ' . $releaseType,
                    'releaseType' => $releaseType,
                    'poster'      => $poster,
                    'grabbed'     => $mv['hasFile'] ?? false,
                    'radarrId'    => $mv['id'] ?? null,
                ];
            }
        }
    }

    usort($events, fn($a, $b) => strcmp($a['date'], $b['date']));
    echo json_encode(['events' => $events]);
    exit;
}

// ── Derniers téléchargements (Radarr + Sonarr history) ────────────────────────
if ($action === 'recent_downloads') {
    $cfg   = load_config();
    $items = [];

    $radarr = find_app_by_driver($cfg, 'radarr');
    if ($radarr) {
        $data = arr_get($radarr, '/api/v3/history?pageSize=8&sortKey=date&sortDirection=descending&eventType=3');
        if (isset($data['records'])) {
            foreach ($data['records'] as $r) {
                $items[] = [
                    'type'    => 'film',
                    'title'   => $r['movie']['title'] ?? $r['sourceTitle'] ?? '?',
                    'date'    => substr($r['date'] ?? '', 0, 10),
                    'quality' => $r['quality']['quality']['name'] ?? '?',
                ];
            }
        }
    }

    $sonarr = find_app_by_driver($cfg, 'sonarr');
    if ($sonarr) {
        $data = arr_get($sonarr, '/api/v3/history?pageSize=8&sortKey=date&sortDirection=descending&eventType=3&includeSeries=true&includeEpisode=true');
        if (isset($data['records'])) {
            foreach ($data['records'] as $r) {
                $seriesTitle = $r['series']['title'] ?? $r['sourceTitle'] ?? '?';
                $seasonNum   = $r['episode']['seasonNumber'] ?? null;
                $episodeNum  = $r['episode']['episodeNumber'] ?? null;
                $ep = ($seasonNum !== null && $episodeNum !== null)
                ? ' · S' . str_pad($seasonNum, 2, '0', STR_PAD_LEFT) . 'E' . str_pad($episodeNum, 2, '0', STR_PAD_LEFT)
                : '';
                $items[] = [
                    'type'    => 'série',
                    'title'   => $seriesTitle . $ep,
                    'date'    => substr($r['date'] ?? '', 0, 10),
                    'quality' => $r['quality']['quality']['name'] ?? '?',
                ];
            }
        }
    }

    usort($items, fn($a, $b) => strcmp($b['date'], $a['date']));
    echo json_encode(['items' => array_slice($items, 0, 12)]);
    exit;
}

// ── Recommandations ───────────────────────────────────────────────────────────
if ($action === 'recommendations') {
    $cfg   = load_config();
    $items = [];

    $radarr = find_app_by_driver($cfg, 'radarr');
    if ($radarr) {
        $data = arr_get($radarr, '/api/v3/movie?pageSize=300');
        if (is_array($data) && !isset($data['_error'])) {
            // Films récents non téléchargés avec une bonne note
            foreach ($data as $mv) {
                if (!($mv['hasFile'] ?? false) && ($mv['ratings']['tmdb']['value'] ?? 0) >= 6.5 && !empty($mv['overview'])) {
                    $items[] = [
                        'type'     => 'film',
                        'title'    => $mv['title'] ?? '?',
                        'year'     => $mv['year'] ?? '',
                        'overview' => substr($mv['overview'] ?? '', 0, 150) . '…',
                        'rating'   => round($mv['ratings']['tmdb']['value'] ?? 0, 1),
                        'tmdbId'   => $mv['tmdbId'] ?? null,
                        'has_file' => false,
                    ];
                }
            }
        }
    }

    $sonarr = find_app_by_driver($cfg, 'sonarr');
    if ($sonarr) {
        $data = arr_get($sonarr, '/api/v3/series');
        if (is_array($data) && !isset($data['_error'])) {
            foreach ($data as $s) {
                if (($s['statistics']['percentOfEpisodes'] ?? 100) < 80 && ($s['ratings']['value'] ?? 0) >= 6) {
                    $items[] = [
                        'type'     => 'série',
                        'title'    => $s['title'] ?? '?',
                        'year'     => $s['year'] ?? '',
                        'overview' => substr($s['overview'] ?? '', 0, 150) . '…',
                        'rating'   => round($s['ratings']['value'] ?? 0, 1),
                        'tmdbId'   => null,
                        'has_file' => false,
                    ];
                }
            }
        }
    }

    shuffle($items);
    echo json_encode(['items' => array_slice($items, 0, 12)]);
    exit;
}

// ── Recherche films (Radarr via TMDB) ─────────────────────────────────────────
if ($action === 'search_movie') {
    $cfg   = load_config();
    $query = urlencode($_GET['q'] ?? '');
    $radarr = find_app_by_driver($cfg, 'radarr');
    if (!$radarr) { echo json_encode(['error' => t('err_radarr_not_configured')]); exit; }
    $data = arr_get($radarr, "/api/v3/movie/lookup?term=" . $query);
    if (isset($data['_error'])) { echo json_encode(['error' => $data['_error']]); exit; }

    // Récupère les tmdbId déjà dans la bibliothèque
    $library = arr_get($radarr, '/api/v3/movie');
    $in_lib  = [];
    if (is_array($library)) {
        foreach ($library as $m) { if (!empty($m['tmdbId'])) $in_lib[$m['tmdbId']] = true; }
    }

    $results = [];
    foreach (array_slice($data, 0, 15) as $mv) {
        // 👇 On fouille pour trouver l'affiche
        $poster = null;
        foreach ($mv['images'] ?? [] as $img) {
            if ($img['coverType'] === 'poster') {
                $poster = $img['remoteUrl'] ?? $img['url'] ?? null;
                break;
            }
        }
        if (!$poster && !empty($mv['remotePoster'])) $poster = $mv['remotePoster'];

        $results[] = [
            'tmdbId'   => $mv['tmdbId'] ?? null,
            'title'    => $mv['title'] ?? '?',
            'year'     => $mv['year'] ?? '',
            'overview' => substr($mv['overview'] ?? '', 0, 200),
            'rating'   => round($mv['ratings']['tmdb']['value'] ?? 0, 1),
            'in_lib'   => isset($in_lib[$mv['tmdbId'] ?? null]),
            'poster'   => $poster // 👈 On renvoie enfin l'affiche !
        ];
    }
    echo json_encode(['results' => $results]);
    exit;
}

// ── Recherche séries (Sonarr via TVDB) ────────────────────────────────────────
if ($action === 'search_serie') {
    $cfg   = load_config();
    $query = urlencode($_GET['q'] ?? '');
    $sonarr = find_app_by_driver($cfg, 'sonarr');
    if (!$sonarr) { echo json_encode(['error' => t('err_sonarr_not_configured')]); exit; }
    $data = arr_get($sonarr, "/api/v3/series/lookup?term=" . $query);
    if (isset($data['_error'])) { echo json_encode(['error' => $data['_error']]); exit; }

    $library = arr_get($sonarr, '/api/v3/series');
    $in_lib  = [];
    if (is_array($library)) {
        foreach ($library as $s) { if (!empty($s['tvdbId'])) $in_lib[$s['tvdbId']] = true; }
    }

    $results = [];
    foreach (array_slice($data, 0, 15) as $s) {
        // 👇 On récupère l'affiche de la série
        $poster = null;
        foreach ($s['images'] ?? [] as $img) {
            if ($img['coverType'] === 'poster') {
                $poster = $img['remoteUrl'] ?? $img['url'] ?? null;
                break;
            }
        }
        if (!$poster && !empty($s['remotePoster'])) $poster = $s['remotePoster'];

        $results[] = [
            'tvdbId'   => $s['tvdbId'] ?? null,
            'tmdbId'   => $s['tmdbId'] ?? null,
            'title'    => $s['title'] ?? '?',
            'year'     => $s['year'] ?? '',
            'overview' => substr($s['overview'] ?? '', 0, 200),
            'rating'   => round($s['ratings']['value'] ?? 0, 1),
            'seasons'  => count($s['seasons'] ?? []),
            'in_lib'   => isset($in_lib[$s['tvdbId'] ?? null]),
            'poster'   => $poster // 👈 L'affiche est transmise
        ];
    }
    echo json_encode(['results' => $results]);
    exit;
}

// ── IMPORT DE LISTE (titres / IDs IMDb / IDs TMDB collés en masse) ────────────
if ($action === 'bulk_import_lookup') {
    require_auth();
    $cfg  = load_config();
    $type = $_POST['type'] ?? 'movie';
    $terms = json_decode($_POST['terms'] ?? '[]', true);
    if (!is_array($terms) || empty($terms)) { echo json_encode(['error' => t('err_no_lines_to_analyze')]); exit; }
    $terms = array_slice(array_filter(array_map('trim', $terms)), 0, 10000); // Limite de sécurité : 100 lignes 

    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => ($type === 'movie' ? 'Radarr' : 'Sonarr') . ' non configuré']); exit; }

    // IDs déjà en bibliothèque, pour marquer les doublons
    $endpoint = $type === 'movie' ? '/api/v3/movie' : '/api/v3/series';
    $idField  = $type === 'movie' ? 'tmdbId' : 'tvdbId';
    $library  = arr_get($app, $endpoint);
    $in_lib   = [];
    if (is_array($library)) {
        foreach ($library as $m) { if (!empty($m[$idField])) $in_lib[$m[$idField]] = true; }
    }

    $lookup_endpoint = $type === 'movie' ? '/api/v3/movie/lookup?term=' : '/api/v3/series/lookup?term=';
    $results = [];

    foreach ($terms as $term) {
        // Nettoyage : si la ligne ressemble à "tt1234567 (Nom du film)", on ne garde que le "tt1234567" pour chercher
        if (preg_match('/^(tt\d{6,})\s*\(.*\)$/i', $term, $matches)) {
            $term = $matches[1];
        }

        // Reconnaît automatiquement un ID IMDb (ttXXXXXXX) collé directement
        $search_term = preg_match('/^tt\d{6,}$/i', $term) ? 'imdb:' . $term : $term;
        $data = arr_get($app, $lookup_endpoint . urlencode($search_term));

        if (isset($data['_error']) || empty($data) || !is_array($data) || empty($data[0]['title'])) {
            $results[] = ['term' => $term, 'found' => false];
            continue;
        }
        $m = $data[0]; // On garde le meilleur résultat (le premier renvoyé par Radarr/Sonarr)
        $poster = null;
        foreach ($m['images'] ?? [] as $img) {
            if ($img['coverType'] === 'poster') { $poster = $img['remoteUrl'] ?? $img['url'] ?? null; break; }
        }
        if (!$poster && !empty($m['remotePoster'])) $poster = $m['remotePoster'];

        $results[] = [
            'term'    => $term,
            'found'   => true,
            'title'   => $m['title'] ?? '?',
            'year'    => $m['year'] ?? '',
            'poster'  => $poster,
            'tmdbId'  => $m['tmdbId'] ?? null,
            'tvdbId'  => $m['tvdbId'] ?? null,
            'in_lib'  => isset($in_lib[$m[$idField] ?? null]),
        ];
    }

    echo json_encode(['results' => $results]);
    exit;
}

// ── RÉCUPÉRER LES OPTIONS (Profils, Dossiers, Tags) ───────────────────────────
if ($action === 'get_options') {
    $cfg = load_config();
    $type = $_GET['app'] ?? 'radarr';
    $app = find_app_by_driver($cfg, $type);
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }

    // Utilisation de ta fonction native arr_get qui est plus fiable
    $profiles = arr_get($app, '/api/v3/qualityprofile');
    $folders = arr_get($app, '/api/v3/rootfolder');
    $tags = arr_get($app, '/api/v3/tag');

    echo json_encode([
        'profiles' => is_array($profiles) && !isset($profiles['_error']) ? $profiles : [],
                     'folders' => is_array($folders) && !isset($folders['_error']) ? $folders : [],
                     'tags' => is_array($tags) && !isset($tags['_error']) ? $tags : []
    ]);
    exit;
}

// ── RÉCUPÉRER LES DONNÉES BRUTES POUR L'ÉDITION ───────────────────────────────
if ($action === 'get_media_raw') {
    $cfg = load_config();
    $type = $_GET['type'] ?? 'movie';
    $id = (int)($_GET['id'] ?? 0);
    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }

    $endpoint = $type === 'movie' ? "/api/v3/movie/{$id}" : "/api/v3/series/{$id}";
    $data = arr_get($app, $endpoint);

    echo json_encode(isset($data['_error']) ? ['error' => $data['_error']] : $data);
    exit;
}

// ── SAUVEGARDER L'ÉDITION DU MÉDIA ────────────────────────────────────────────
if ($action === 'edit_media') {
    $cfg = load_config();
    $type = $_POST['type'] ?? 'movie';
    $id = (int)$_POST['id'];
    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');

    $endpoint = $type === 'movie' ? "/api/v3/movie/{$id}" : "/api/v3/series/{$id}";

    // 1. On récupère l'objet complet actuel
    $item = arr_get($app, $endpoint);
    if (isset($item['_error'])) { echo json_encode(['error' => t('err_media_not_found')]); exit; }

    // 2. On met à jour les champs
    $item['qualityProfileId'] = (int)$_POST['qualityProfileId'];
    $item['rootFolderPath'] = $_POST['rootFolderPath'];
    $item['path'] = $_POST['path'];
    $item['tags'] = isset($_POST['tags']) ? json_decode($_POST['tags'], true) : [];

    // 3. On renvoie l'objet mis à jour avec moveFiles=true (pour renommer les dossiers physiques)
    $res = arr_put_raw($app, $endpoint . '?moveFiles=true', json_encode($item, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

    if ($res['code'] >= 200 && $res['code'] < 300) {
        clear_media_caches($type);
        echo json_encode(['ok' => true]);
    } else {
        echo json_encode(['error' => "Erreur de sauvegarde ({$res['code']})"]);
    }
    exit;
}

// ── Ajouter un film (Radarr) ──────────────────────────────────────────────────
if ($action === 'add_movie') {
    $cfg    = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    if (!$radarr) { echo json_encode(['error' => t('err_radarr_not_configured')]); exit; }

    $tmdbId = (int)($_POST['tmdbId'] ?? 0);
    if (!$tmdbId) { echo json_encode(['error' => t('err_tmdbid_missing')]); exit; }

    $lookup = arr_get($radarr, "/api/v3/movie/lookup/tmdb?tmdbId=$tmdbId");
    if (isset($lookup['_error']) || empty($lookup['title'])) {
        echo json_encode(['error' => t('err_movie_not_found_short')]); exit;
    }

    $rootPath = $_POST['rootFolderPath'] ?? '/movies';
    $profileId = (int)($_POST['qualityProfileId'] ?? 1);
    // 🌟 NOUVEAU : On lit l'information "search" (true ou false) envoyée par le JS
    $search = filter_var($_POST['search'] ?? 'true', FILTER_VALIDATE_BOOLEAN);

    $body = array_merge($lookup, [
        'rootFolderPath'   => $rootPath,
        'qualityProfileId' => $profileId,
        'monitored'        => true,
        // 🌟 MODIFIÉ : On passe la variable $search au lieu de true en dur
        'addOptions'       => ['searchForMovie' => $search],
    ]);

    $res = arr_post($radarr, '/api/v3/movie', $body);
    if (isset($res['_error'])) { echo json_encode(['error' => $res['_error']]); exit; }
    if (isset($res['message'])) { echo json_encode(['error' => $res['message']]); exit; }
    clear_media_caches('movie');
    log_activity('add_movie', 'movie', $res['id'] ?? null, $res['title'] ?? '?');

    echo json_encode(['ok' => true, 'title' => $res['title'] ?? '?', 'id' => $res['id'] ?? null]);
    exit;
}

// ── Fiche TMDB détail (Film non possédé) ──────────────────────────────────────
if ($action === 'tmdb_movie_detail') {
    require_auth();
    $cfg    = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    if (!$radarr) { echo json_encode(['error' => t('err_radarr_not_configured')]); exit; }

    $tmdbId = (int)($_GET['tmdbId'] ?? 0);
    if (!$tmdbId) { echo json_encode(['error' => t('err_tmdbid_missing')]); exit; }

    // On demande à Radarr de chercher les infos du film sur TMDB
    $lookup = arr_get($radarr, "/api/v3/movie/lookup/tmdb?tmdbId=$tmdbId");
    if (isset($lookup['_error']) || empty($lookup['title'])) {
        echo json_encode(['error' => 'Film introuvable via l\'API Radarr']); exit;
    }

    $poster_url = null;
    $fanart_url = null;
    foreach ($lookup['images'] ?? [] as $img) {
        if ($img['coverType'] === 'poster') $poster_url = $img['remoteUrl'] ?? $img['url'] ?? null;
        if ($img['coverType'] === 'fanart') $fanart_url = $img['remoteUrl'] ?? $img['url'] ?? null;
    }

    echo json_encode([
        'tmdbId'     => $lookup['tmdbId'],
        'imdbId'     => $lookup['imdbId'] ?? null,
        'title'      => $lookup['title'] ?? '?',
        'year'       => $lookup['year'] ?? '',
        'overview'   => $lookup['overview'] ?? '',
        'rating'     => round($lookup['ratings']['tmdb']['value'] ?? 0, 1),
                     'runtime'    => $lookup['runtime'] ?? 0,
                     'genres'     => $lookup['genres'] ?? [],
                     'poster'     => $poster_url,
                     'fanart'     => $fanart_url,
                     'inCinemas'       => $lookup['inCinemas'] ?? null,
                     'digitalRelease'  => $lookup['digitalRelease'] ?? null,
                     'physicalRelease' => $lookup['physicalRelease'] ?? null
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_IGNORE);
    exit;
}

/// ── Ajouter une série (Sonarr) ────────────────────────────────────────────────
if ($action === 'add_serie') {
    $cfg    = load_config();
    $sonarr = find_app_by_driver($cfg, 'sonarr');
    if (!$sonarr) { echo json_encode(['error' => t('err_sonarr_not_configured')]); exit; }

    $tvdbId = (int)($_POST['tvdbId'] ?? 0);
    $tmdbId = (int)($_POST['tmdbId'] ?? 0);

    if (!$tvdbId && !$tmdbId) { echo json_encode(['error' => t('err_serie_id_missing')]); exit; }

    $term = $tvdbId ? "tvdb:$tvdbId" : "tmdb:$tmdbId";
    $lookup = arr_get($sonarr, "/api/v3/series/lookup?term=" . $term);

    if (isset($lookup['_error']) || empty($lookup[0]['title'])) {
        echo json_encode(['error' => t('err_serie_not_found_skyhook')]); exit;
    }
    $serie = $lookup[0];

    $rootPath = $_POST['rootFolderPath'] ?? '/tv';
    $profileId = (int)($_POST['qualityProfileId'] ?? 1);
    // 🌟 NOUVEAU : On lit l'information "search" (true ou false) envoyée par le JS
    $search = filter_var($_POST['search'] ?? 'true', FILTER_VALIDATE_BOOLEAN);

    $body = array_merge($serie, [
        'rootFolderPath'   => $rootPath,
        'qualityProfileId' => $profileId,
        'monitored'        => true,
        'seasonFolder'     => true,
        // 🌟 MODIFIÉ : On passe la variable $search au lieu de true en dur
        'addOptions'       => ['searchForMissingEpisodes' => $search, 'monitor' => 'all'],
    ]);

    $res = arr_post($sonarr, '/api/v3/series', $body);
    if (isset($res['_error'])) { echo json_encode(['error' => $res['_error']]); exit; }
    if (isset($res['message'])) { echo json_encode(['error' => $res['message']]); exit; }
    clear_media_caches('serie');
    log_activity('add_serie', 'serie', $res['id'] ?? null, $res['title'] ?? '?');

    echo json_encode(['ok' => true, 'title' => $res['title'] ?? '?', 'id' => $res['id'] ?? null]);
    exit;
}

// ── Fiche TMDB détail (Série non possédée) ────────────────────────────────────
if ($action === 'tmdb_serie_detail') {
    require_auth();
    $cfg    = load_config();
    $sonarr = find_app_by_driver($cfg, 'sonarr');
    if (!$sonarr) { echo json_encode(['error' => t('err_sonarr_not_configured')]); exit; }

    $tmdbId = (int)($_GET['tmdbId'] ?? 0);
    if (!$tmdbId) { echo json_encode(['error' => t('err_tmdbid_missing')]); exit; }

    // On utilise l'endpoint lookup de Sonarr qui comprend "tmdb:"
    $lookup = arr_get($sonarr, "/api/v3/series/lookup?term=tmdb:$tmdbId");
    if (isset($lookup['_error']) || empty($lookup[0]['title'])) {
        echo json_encode(['error' => t('err_serie_not_found_api')]); exit;
    }
    $serie = $lookup[0];

    // 🌟 NOUVEAU : Récupération forcée de l'IMDb ID via TMDB si Sonarr ne l'a pas !
    $imdbId = $serie['imdbId'] ?? null;
    $tmdb_api_key = $cfg['tmdb_api_key'] ?? '';

    if (empty($imdbId) && !empty($tmdb_api_key)) {
        $ext_url = "https://api.themoviedb.org/3/tv/{$tmdbId}/external_ids?api_key={$tmdb_api_key}";
        $ch = curl_init($ext_url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_TIMEOUT => 3
        ]);
        $ext_raw = curl_exec($ch);
        curl_close($ch);
        $ext_data = json_decode($ext_raw, true);

        if (!empty($ext_data['imdb_id'])) {
            $imdbId = $ext_data['imdb_id'];
        }
    }

    $poster_url = null;
    $fanart_url = null;
    foreach ($serie['images'] ?? [] as $img) {
        if ($img['coverType'] === 'poster') $poster_url = $img['remoteUrl'] ?? $img['url'] ?? null;
        if ($img['coverType'] === 'fanart') $fanart_url = $img['remoteUrl'] ?? $img['url'] ?? null;
    }

    echo json_encode([
        'tmdbId'     => $tmdbId,
        'imdbId'     => $imdbId, // 👈 On injecte l'ID trouvé avec certitude
        'tvdbId'     => $serie['tvdbId'] ?? 0,
        'title'      => $serie['title'] ?? '?',
        'year'       => $serie['year'] ?? '',
        'overview'   => $serie['overview'] ?? '',
        'rating'     => round($serie['ratings']['value'] ?? 0, 1),
                     'network'    => $serie['network'] ?? '',
                     'genres'     => $serie['genres'] ?? [],
                     'poster'     => $poster_url,
                     'fanart'     => $fanart_url,
                     'seasons'    => count($serie['seasons'] ?? [])
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_IGNORE);
    exit;
}

// ── Bibliothèque films ────────────────────────────────────────────────────────
if ($action === 'library_movies') {
    $cfg    = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    if (!$radarr) { echo json_encode(['error' => t('err_radarr_not_configured')]); exit; }
    $q      = strtolower($_GET['q'] ?? '');
    $filter = $_GET['filter'] ?? 'all'; // all | downloaded | missing

    // 1. GESTION DU CACHE (Stockage de TOUTE la bibliothèque, TTL 1h)
    $cacheFile = __DIR__ . '/data/.cache_library_movies.json';
    $all_movies = [];

    if (file_exists($cacheFile)) {
        $all_movies = json_decode(file_get_contents($cacheFile), true);
        header('X-Cache: HIT');
    } else {
        header('X-Cache: MISS');
        $data = arr_get($radarr, '/api/v3/movie');
        if (isset($data['_error'])) { echo json_encode(['error' => $data['_error']]); exit; }

        $base_url = rtrim($radarr['url'], '/');
        foreach ($data as $mv) {
            $poster = null;
            foreach ($mv['images'] ?? [] as $img) {
                if ($img['coverType'] === 'poster') {
                    $poster = $base_url . '/api/v3/mediacover/' . $mv['id'] . '/poster-250.jpg?apikey=' . $radarr['api_key'];
                    break;
                }
            }
            $quality = null;
            if (!empty($mv['movieFile']['quality']['quality']['name'])) {
                $quality = $mv['movieFile']['quality']['quality']['name'];
            }
            $all_movies[] = [
                'id'             => $mv['id'],
                'tmdbId'         => $mv['tmdbId'] ?? null,
                'title'          => $mv['title'] ?? '?',
                'year'           => $mv['year'] ?? '',
                'rating'         => round($mv['ratings']['tmdb']['value'] ?? 0, 1),
                'hasFile'        => $mv['hasFile'] ?? false,
                'monitored'      => $mv['monitored'] ?? false,
                'quality'        => $quality,
                'poster'         => $poster,
                'runtime'        => $mv['runtime'] ?? 0,
                'overview'       => substr($mv['overview'] ?? '', 0, 150),
                'sizeOnDisk'     => round(($mv['movieFile']['size'] ?? 0) / 1073741824, 2),
                'added'          => substr($mv['added'] ?? '', 0, 10),
                'collectionTitle'=> $mv['collection']['title'] ?? null,
            ];
        }
        // Sauvegarde de la liste complète structurée
        file_put_contents($cacheFile, json_encode($all_movies, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_IGNORE));
    }

    // 🚀 2. APPLICATION DES FILTRES SUR LE CACHE
    $movies = [];
    foreach ($all_movies as $mv) {
        if ($q && strpos(strtolower($mv['title'] ?? ''), $q) === false) continue;
        if ($filter === 'downloaded' && !($mv['hasFile'] ?? false)) continue;
        if ($filter === 'missing' && ($mv['hasFile'] ?? false)) continue;
        $movies[] = $mv;
    }

    usort($movies, fn($a, $b) => strcmp($a['title'], $b['title']));
    $total = count($movies);

    $output = json_encode(['movies' => $movies, 'total' => $total], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_IGNORE);
    if ($output === false) {
        echo json_encode(['error' => 'Erreur fatale de conversion : ' . json_last_error_msg()]);
    } else {
        echo $output;
    }
    exit;
}

// ── Bibliothèque séries ───────────────────────────────────────────────────────
if ($action === 'library_series') {
    $cfg    = load_config();
    $sonarr = find_app_by_driver($cfg, 'sonarr');
    if (!$sonarr) { echo json_encode(['error' => t('err_sonarr_not_configured')]); exit; }
    $q      = strtolower($_GET['q'] ?? '');
    $filter = $_GET['filter'] ?? 'all';

    // 1. GESTION DU CACHE (TTL 1h)
    $cacheFile = __DIR__ . '/data/.cache_library_series.json';
    $all_series = [];

    if (file_exists($cacheFile)) {
        $all_series = json_decode(file_get_contents($cacheFile), true);
        header('X-Cache: HIT');
    } else {
        header('X-Cache: MISS');
        $data = arr_get($sonarr, '/api/v3/series');
        if (isset($data['_error'])) { echo json_encode(['error' => $data['_error']]); exit; }

        $base_url = rtrim($sonarr['url'], '/');
        foreach ($data as $s) {
            $pct = round($s['statistics']['percentOfEpisodes'] ?? 0);
            $poster = $base_url . '/api/v3/mediacover/' . $s['id'] . '/poster-250.jpg?apikey=' . $sonarr['api_key'];

            $all_series[] = [
                'id'         => $s['id'],
                'tvdbId'     => $s['tvdbId'] ?? null,
                'title'      => $s['title'] ?? '?',
                'year'       => $s['year'] ?? '',
                'rating'     => round($s['ratings']['value'] ?? 0, 1),
                'seasons'    => $s['statistics']['seasonCount'] ?? 0,
                'episodes'   => $s['statistics']['episodeCount'] ?? 0,
                'sizeOnDisk' => round(($s['statistics']['sizeOnDisk'] ?? 0) / 1073741824, 1),
                'pct'        => $pct,
                'status'     => $s['status'] ?? '?',
                'monitored'  => $s['monitored'] ?? false,
                'network'    => $s['network'] ?? '',
                'poster'     => $poster,
                'overview'   => substr($s['overview'] ?? '', 0, 150),
                'added'      => substr($s['added'] ?? '', 0, 10),
                'nextAiring' => substr($s['nextAiring'] ?? '', 0, 10),
            ];
        }
        file_put_contents($cacheFile, json_encode($all_series, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_IGNORE));
    }

    // 🚀 2. APPLICATION DES FILTRES SUR LE CACHE
    $series = [];
    foreach ($all_series as $s) {
        if ($q && strpos(strtolower($s['title'] ?? ''), $q) === false) continue;
        if ($filter === 'complete' && $s['pct'] < 100) continue;
        if ($filter === 'incomplete' && $s['pct'] >= 100) continue;
        $series[] = $s;
    }

    usort($series, fn($a, $b) => strcmp($a['title'], $b['title']));
    $total = count($series);
    echo json_encode(['series' => $series, 'total' => $total]);
    exit;
}

// ── Fiche film détaillée ──────────────────────────────────────────────────────
if ($action === 'movie_detail') {
    $cfg    = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    if (!$radarr) { echo json_encode(['error' => t('err_radarr_not_configured')]); exit; }
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { echo json_encode(['error' => t('err_id_missing')]); exit; }

    $mv = arr_get($radarr, "/api/v3/movie/$id");
    if (isset($mv['_error'])) { echo json_encode(['error' => $mv['_error']]); exit; }

    if (isset($mv['message'])) { echo json_encode(['error' => t('err_media_not_in_library')]); exit; }

    // Construction de l'URL directe vers l'API Radarr
    $poster_url = rtrim($radarr['url'], '/') . '/api/v3/mediacover/' . $mv['id'] . '/poster.jpg?apikey=' . $radarr['api_key'];
    $fanart_url = rtrim($radarr['url'], '/') . '/api/v3/mediacover/' . $mv['id'] . '/fanart.jpg?apikey=' . $radarr['api_key'];

    $file_info = null;
    if (!empty($mv['movieFile'])) {
        $mf = $mv['movieFile'];
        $file_info = [
            'id'       => $mf['id'] ?? 0,
            'path'     => basename($mf['relativePath'] ?? $mf['path'] ?? 'Fichier inconnu'),
            'quality'  => $mf['quality']['quality']['name'] ?? '?',
            'size'     => round(($mf['size'] ?? 0) / 1073741824, 2) . ' GB',
            'codec'    => $mf['mediaInfo']['videoCodec'] ?? '?',
        ];
    }

    // Collection
    $collection = null;
    if (!empty($mv['collection']['title'])) {
        $collection = [
            'title' => $mv['collection']['title'],
            'tmdbId' => $mv['collection']['tmdbId'] ?? null,
        ];
    }

    // --- Récupération de l'état du téléchargement (File d'attente) ---
    $queue = arr_get($radarr, "/api/v3/queue?movieId=$id");
    $download_info = null;
    if (is_array($queue) && isset($queue['records']) && count($queue['records']) > 0) {
        $q = $queue['records'][0]; // On prend le premier élément
        $size = $q['size'] ?? 0;
        $sizeleft = $q['sizeleft'] ?? 0;
        $pct = $size > 0 ? (100 - round(($sizeleft / $size) * 100)) : 0;

        $timeleft = $q['timeleft'] ?? '';
        if (strpos($timeleft, '.') !== false) $timeleft = explode('.', $timeleft)[0];

        $download_info = [
            'pct' => max(0, min(100, $pct)),
            'status' => $q['status'] ?? 'Downloading',
            'timeleft' => $timeleft
        ];
    }

    $profiles = arr_get($radarr, '/api/v3/qualityprofile');
    $profileName = 'Profil inconnu';
    if (is_array($profiles) && !isset($profiles['_error'])) {
        foreach ($profiles as $p) {
            if ($p['id'] == ($mv['qualityProfileId'] ?? 0)) {
                $profileName = $p['name'];
                break;
            }
        }
    }

    // --- Date d'ajout et Casting (Radarr) ---
    $added = !empty($mv['added']) ? date('d/m/Y', strtotime($mv['added'])) : 'Inconnue';

    $credits = arr_get($radarr, "/api/v3/credit?movieId=$id");
    $cast = [];
    if (is_array($credits) && !isset($credits['_error'])) {
        foreach ($credits as $c) {
            if (($c['type'] ?? '') === 'cast' || isset($c['character'])) {
                $img = '';
                foreach ($c['images'] ?? [] as $i) {
                    if ($i['coverType'] === 'headshot') { $img = $i['remoteUrl'] ?? $i['url'] ?? ''; break; }
                }
                $cast[] = [
                    'name'      => $c['personName'] ?? $c['name'] ?? '?',
                    'character' => $c['character'] ?? '',
                    'image'     => $img
                ];
                if (count($cast) >= 15) break; 
            }
        }
    }

    echo json_encode([
        'id'         => $mv['id'],
        'imdbId'     => $mv['imdbId'] ?? null,
        'title'      => $mv['title'] ?? '?',
        'year'       => $mv['year'] ?? '',
        'overview'   => $mv['overview'] ?? '',
        'rating'     => round($mv['ratings']['tmdb']['value'] ?? 0, 1),
        'runtime'    => $mv['runtime'] ?? 0,
        'genres'     => $mv['genres'] ?? [],
        'status'     => $mv['status'] ?? '',
        'studio'     => $mv['studio'] ?? '',
        'poster'     => $poster_url,
        'fanart'     => $fanart_url,
        'hasFile'    => $mv['hasFile'] ?? false,
        'monitored'  => $mv['monitored'] ?? false,
        'qualityProfileId' => $mv['qualityProfileId'] ?? 0,
        'qualityProfileName' => $profileName,
        'file'       => $file_info,
        'collection' => $collection,
        'added'      => $added,
        'cast'       => $cast,
        'inCinemas'       => $mv['inCinemas'] ?? null,
        'digitalRelease'  => $mv['digitalRelease'] ?? null,
        'physicalRelease' => $mv['physicalRelease'] ?? null,
        'download_info'   => $download_info,
        'titleSlug'       => $mv['titleSlug'] ?? '',
        'appUrl'          => rtrim($radarr['url'], '/')
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_IGNORE);
    exit;
}

// ── Recherche manuelle film (releases Prowlarr via Radarr) ────────────────────
if ($action === 'movie_releases') {
    $cfg    = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    if (!$radarr) { echo json_encode(['error' => t('err_radarr_not_configured')]); exit; }
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { echo json_encode(['error' => t('err_id_missing')]); exit; }

    $data = arr_get($radarr, "/api/v3/release?movieId=$id");
    if (isset($data['_error'])) { echo json_encode(['error' => $data['_error']]); exit; }

    $releases = [];
    foreach ($data as $r) {
        $releases[] = [
            'guid'        => $r['guid'] ?? '',
            'title'       => $r['title'] ?? '?',
            'indexer'     => $r['indexer'] ?? '?',
            'size'        => round(($r['size'] ?? 0) / 1073741824, 2),
            'quality'     => $r['quality']['quality']['name'] ?? '?',
            'seeders'     => $r['seeders'] ?? 0,
            'leechers'    => $r['leechers'] ?? 0,
            'approved'    => $r['approved'] ?? false,
            'rejected'    => !empty($r['rejections']),
            'rejections'  => $r['rejections'] ?? [],
            'age'         => $r['ageHours'] ?? 0,
            'infoUrl'     => $r['infoUrl'] ?? '',
            'customScore' => $r['customFormatScore'] ?? 0,
            'indexerId'   => $r['indexerId'] ?? 0,
        ];
    }

    usort($releases, fn($a, $b) => $b['seeders'] - $a['seeders']);
    echo json_encode(['releases' => $releases]);
    exit;
}

// ── Télécharger une release film ──────────────────────────────────────────────
if ($action === 'movie_download') {
    $cfg    = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    if (!$radarr) { echo json_encode(['error' => t('err_radarr_not_configured')]); exit; }
    $guid    = $_POST['guid']    ?? '';
    $indexer = $_POST['indexer'] ?? '';
    $movieId = (int)($_POST['movieId'] ?? 0);
    if (!$guid || !$movieId) { echo json_encode(['error' => t('err_params_missing')]); exit; }

    $res = arr_post($radarr, '/api/v3/release', ['guid' => $guid, 'indexerId' => (int)$_POST['indexerId'], 'movieId' => $movieId]);
    if (isset($res['_error'])) { echo json_encode(['error' => $res['_error']]); exit; }
    echo json_encode(['ok' => true]);
    exit;
}

// ── Recherche auto film ───────────────────────────────────────────────────────
if ($action === 'movie_search_auto') {
    $cfg    = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    if (!$radarr) { echo json_encode(['error' => t('err_radarr_not_configured')]); exit; }
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) { echo json_encode(['error' => t('err_id_missing')]); exit; }

    $res = arr_post($radarr, '/api/v3/command', ['name' => 'MoviesSearch', 'movieIds' => [$id]]);
    if (isset($res['_error'])) { echo json_encode(['error' => $res['_error']]); exit; }
    echo json_encode(['ok' => true, 'commandId' => $res['id'] ?? null]);
    exit;
}

// ── Fiche série détaillée ─────────────────────────────────────────────────────
if ($action === 'serie_detail') {
    $cfg    = load_config();
    $sonarr = find_app_by_driver($cfg, 'sonarr');
    if (!$sonarr) { echo json_encode(['error' => t('err_sonarr_not_configured')]); exit; }
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { echo json_encode(['error' => t('err_id_missing')]); exit; }

    $s = arr_get($sonarr, "/api/v3/series/$id");

    $epFiles = arr_get($sonarr, "/api/v3/episodefile?seriesId=$id");
    $fileMap = [];
    $fileSizeMap = [];
    $fileQualityMap = [];
    if (is_array($epFiles) && !isset($epFiles['_error'])) {
        foreach ($epFiles as $ef) {
            $fileMap[$ef['id']] = basename($ef['relativePath'] ?? $ef['path'] ?? '');
            $fileSizeMap[$ef['id']] = $ef['size'] ?? 0;
            $fileQualityMap[$ef['id']] = $ef['quality']['quality']['name'] ?? '';
        }
    }
    if (isset($s['_error'])) { echo json_encode(['error' => $s['_error']]); exit; }

    if (isset($s['message'])) { echo json_encode(['error' => t('err_serie_not_in_library')]); exit; }

    $poster_url = rtrim($sonarr['url'], '/') . '/api/v3/mediacover/' . $s['id'] . '/poster.jpg?apikey=' . $sonarr['api_key'];
    $fanart_url = rtrim($sonarr['url'], '/') . '/api/v3/mediacover/' . $s['id'] . '/fanart.jpg?apikey=' . $sonarr['api_key'];

    $queue = arr_get($sonarr, "/api/v3/queue?seriesId=$id");
    $downloading_eps = [];
    if (is_array($queue) && isset($queue['records'])) {
        foreach ($queue['records'] as $q) {
            $epId = $q['episodeId'] ?? null;
            if ($epId) {
                $size = $q['size'] ?? 0;
                $sizeleft = $q['sizeleft'] ?? 0;
                $pct = $size > 0 ? (100 - round(($sizeleft / $size) * 100)) : 0;
                $timeleft = $q['timeleft'] ?? '';
                if (strpos($timeleft, '.') !== false) $timeleft = explode('.', $timeleft)[0];

                $downloading_eps[$epId] = [
                    'pct' => max(0, min(100, $pct)),
                    'status' => $q['status'] ?? 'Downloading',
                    'timeleft' => $timeleft
                ];
            }
        }
    }

    $episodes = arr_get($sonarr, "/api/v3/episode?seriesId=$id");
    $ep_by_season = [];
    if (is_array($episodes) && !isset($episodes['_error'])) {
        foreach ($episodes as $ep) {
            $sn = $ep['seasonNumber'] ?? 0;
            if ($sn === 0) continue; 
            $fileId = $ep['episodeFileId'] ?? 0;
            $ep_by_season[$sn][] = [
                'id'            => $ep['id'],
                'episode'       => $ep['episodeNumber'] ?? 0,
                'title'         => $ep['title'] ?? '?',
                'airDate'       => substr($ep['airDateUtc'] ?? $ep['airDate'] ?? '', 0, 10),
                'hasFile'       => $ep['hasFile'] ?? false,
                'monitored'     => $ep['monitored'] ?? false,
                'fileId'        => $fileId,
                'fileName'      => isset($fileMap[$fileId]) ? $fileMap[$fileId] : '',
                'size'          => isset($fileSizeMap[$fileId]) ? $fileSizeMap[$fileId] : 0,
                'quality'       => isset($fileQualityMap[$fileId]) ? $fileQualityMap[$fileId] : '',
                'download_info' => $downloading_eps[$ep['id']] ?? null,
            ];
        }
    }
    ksort($ep_by_season);

    $seasons = [];
    foreach ($s['seasons'] ?? [] as $season) {
        $sn = $season['seasonNumber'] ?? 0;
        if ($sn === 0) continue;
        $seasons[] = [
            'number'   => $sn,
            'monitored'=> $season['monitored'] ?? false,
            'total'    => $season['statistics']['totalEpisodeCount'] ?? 0,
            'have'     => $season['statistics']['episodeFileCount'] ?? 0,
            'pct'      => round($season['statistics']['percentOfEpisodes'] ?? 0),
            'episodes' => $ep_by_season[$sn] ?? [],
        ];
    }

    $profiles = arr_get($sonarr, '/api/v3/qualityprofile');
    $profileName = 'Profil inconnu';
    if (is_array($profiles) && !isset($profiles['_error'])) {
        foreach ($profiles as $p) {
            if ($p['id'] == ($s['qualityProfileId'] ?? 0)) {
                $profileName = $p['name'];
                break;
            }
        }
    }

    $added = !empty($s['added']) ? date('d/m/Y', strtotime($s['added'])) : 'Inconnue';
    $cast = [];
    $tmdb_api_key = $cfg['tmdb_api_key'] ?? '';
    $tvdb_id = $s['tvdbId'] ?? 0;

    if ($tvdb_id && $tmdb_api_key) {
        $find_url = "https://api.themoviedb.org/3/find/{$tvdb_id}?api_key={$tmdb_api_key}&external_source=tvdb_id";
        $ch = curl_init($find_url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_TIMEOUT => 5]);
        $find_raw = curl_exec($ch);
        curl_close($ch);
        $find_data = json_decode($find_raw, true);
        $tmdb_id = $find_data['tv_results'][0]['id'] ?? null;

        if ($tmdb_id) {
            $credits_url = "https://api.themoviedb.org/3/tv/{$tmdb_id}/credits?api_key={$tmdb_api_key}&language=fr-FR";
            $ch = curl_init($credits_url);
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_TIMEOUT => 5]);
            $credits_raw = curl_exec($ch);
            curl_close($ch);
            $credits_data = json_decode($credits_raw, true);

            if (is_array($credits_data['cast'] ?? null)) {
                foreach ($credits_data['cast'] as $member) {
                    $img_path = $member['profile_path'] ?? null;
                    $image_url = $img_path ? "https://image.tmdb.org/t/p/w185{$img_path}" : null;
                    $cast[] = [
                        'name'      => $member['name'] ?? '?',
                        'character' => $member['character'] ?? '',
                        'image'     => $image_url,
                    ];
                    if (count($cast) >= 15) break;
                }
            }
        }
    }

    if (empty($cast)) {
        $tvmaze_id = $s['tvMazeId'] ?? 0;
        if (!$tvmaze_id && !empty($s['tvdbId'])) {
            $lookup = arr_get($sonarr, "/api/v3/series/lookup?term=tvdb:{$s['tvdbId']}");
            if (is_array($lookup) && !isset($lookup['_error']) && !empty($lookup)) {
                $tvmaze_id = $lookup[0]['tvMazeId'] ?? 0;
            }
        }
        if ($tvmaze_id) {
            $ch = curl_init("https://api.tvmaze.com/shows/{$tvmaze_id}/cast");
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_TIMEOUT => 4]);
            $cast_raw = curl_exec($ch);
            curl_close($ch);
            if ($cast_raw) {
                $tvmaze_cast = json_decode($cast_raw, true);
                if (is_array($tvmaze_cast)) {
                    foreach ($tvmaze_cast as $member) {
                        $cast[] = [
                            'name' => $member['person']['name'] ?? '?',
                            'character' => $member['character']['name'] ?? '',
                            'image' => $member['person']['image']['medium'] ?? null,
                        ];
                        if (count($cast) >= 15) break;
                    }
                }
            }
        }
    }

    echo json_encode([
        'id'        => $s['id'],
        'imdbId'    => $s['imdbId'] ?? null,
        'title'     => $s['title'] ?? '?',
        'poster'    => $poster_url,
        'fanart'    => $fanart_url,
        'year'      => $s['year'] ?? '',
        'overview'  => $s['overview'] ?? '',
        'status'    => $s['status'] ?? '?',
        'rating'    => round($s['ratings']['value'] ?? 0, 1),
        'network'   => $s['network'] ?? '',
        'genres'    => $s['genres'] ?? [],
        'seasons'   => $seasons,
        'pct'       => round($s['statistics']['percentOfEpisodes'] ?? 0),
        'monitored' => $s['monitored'] ?? false,
        'qualityProfileId' => $s['qualityProfileId'] ?? 0,
        'qualityProfileName' => $profileName,
        'added'     => $added,
        'cast'      => $cast,
        'titleSlug' => $s['titleSlug'] ?? '',
        'appUrl'    => rtrim($sonarr['url'], '/')
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_IGNORE);
    exit;
}

// ── Releases d'un épisode ─────────────────────────────────────────────────────
if ($action === 'episode_releases') {
    $cfg    = load_config();
    $sonarr = find_app_by_driver($cfg, 'sonarr');
    if (!$sonarr) { echo json_encode(['error' => t('err_sonarr_not_configured')]); exit; }
    $episodeId = (int)($_GET['episodeId'] ?? 0);
    if (!$episodeId) { echo json_encode(['error' => t('err_episodeid_missing')]); exit; }

    $data = arr_get($sonarr, "/api/v3/release?episodeId=$episodeId");
    if (isset($data['_error'])) { echo json_encode(['error' => $data['_error']]); exit; }

    $releases = [];
    foreach ($data as $r) {
        $releases[] = [
            'guid'       => $r['guid'] ?? '',
            'title'      => $r['title'] ?? '?',
            'indexer'    => $r['indexer'] ?? '?',
            'indexerId'  => $r['indexerId'] ?? 0,
            'size'       => round(($r['size'] ?? 0) / 1073741824, 2),
            'quality'    => $r['quality']['quality']['name'] ?? '?',
            'seeders'    => $r['seeders'] ?? 0,
            'approved'   => $r['approved'] ?? false,
            'rejected'   => !empty($r['rejections']),
            'rejections' => $r['rejections'] ?? [],
            'age'        => $r['ageHours'] ?? 0,
            'infoUrl'     => $r['infoUrl'] ?? '',
            'customScore' => $r['customFormatScore'] ?? 0,
        ];
    }
    usort($releases, fn($a, $b) => $b['seeders'] - $a['seeders']);
    echo json_encode(['releases' => $releases]);
    exit;
}

// ── Releases d'une saison ─────────────────────────────────────────────────────
if ($action === 'season_releases') {
    $cfg    = load_config();
    $sonarr = find_app_by_driver($cfg, 'sonarr');
    if (!$sonarr) { echo json_encode(['error' => t('err_sonarr_not_configured')]); exit; }
    $seriesId = (int)($_GET['seriesId'] ?? 0);
    $season   = (int)($_GET['season'] ?? 0);
    if (!$seriesId) { echo json_encode(['error' => t('err_seriesid_missing')]); exit; }

    $data = arr_get($sonarr, "/api/v3/release?seriesId=$seriesId&seasonNumber=$season");
    if (isset($data['_error'])) { echo json_encode(['error' => $data['_error']]); exit; }

    $releases = [];
    foreach ($data as $r) {
        $releases[] = [
            'guid'       => $r['guid'] ?? '',
            'title'      => $r['title'] ?? '?',
            'indexer'    => $r['indexer'] ?? '?',
            'indexerId'  => $r['indexerId'] ?? 0,
            'size'       => round(($r['size'] ?? 0) / 1073741824, 2),
            'quality'    => $r['quality']['quality']['name'] ?? '?',
            'seeders'    => $r['seeders'] ?? 0,
            'approved'   => $r['approved'] ?? false,
            'rejected'   => !empty($r['rejections']),
            'rejections' => $r['rejections'] ?? [],
            'age'        => $r['ageHours'] ?? 0,
            'infoUrl'     => $r['infoUrl'] ?? '',
            'customScore' => $r['customFormatScore'] ?? 0,
        ];
    }
    usort($releases, fn($a, $b) => $b['seeders'] - $a['seeders']);
    echo json_encode(['releases' => $releases]);
    exit;
}

// ── Télécharger une release épisode/saison ────────────────────────────────────
if ($action === 'episode_download') {
    $cfg    = load_config();
    $sonarr = find_app_by_driver($cfg, 'sonarr');
    if (!$sonarr) { echo json_encode(['error' => t('err_sonarr_not_configured')]); exit; }
    $guid      = $_POST['guid']      ?? '';
    $indexerId = (int)($_POST['indexerId'] ?? 0);
    $seriesId  = (int)($_POST['seriesId']  ?? 0);
    if (!$guid || !$seriesId) { echo json_encode(['error' => t('err_params_missing')]); exit; }

    $res = arr_post($sonarr, '/api/v3/release', ['guid' => $guid, 'indexerId' => $indexerId, 'seriesId' => $seriesId]);
    if (isset($res['_error'])) { echo json_encode(['error' => $res['_error']]); exit; }
    echo json_encode(['ok' => true]);
    exit;
}

// ── Recherche auto épisode ────────────────────────────────────────────────────
if ($action === 'episode_search_auto') {
    $cfg    = load_config();
    $sonarr = find_app_by_driver($cfg, 'sonarr');
    if (!$sonarr) { echo json_encode(['error' => t('err_sonarr_not_configured')]); exit; }
    $episodeId = (int)($_POST['episodeId'] ?? 0);
    if (!$episodeId) { echo json_encode(['error' => t('err_episodeid_missing')]); exit; }

    $res = arr_post($sonarr, '/api/v3/command', ['name' => 'EpisodeSearch', 'episodeIds' => [$episodeId]]);
    if (isset($res['_error'])) { echo json_encode(['error' => $res['_error']]); exit; }
    echo json_encode(['ok' => true]);
    exit;
}

// ── Recherche auto saison ─────────────────────────────────────────────────────
if ($action === 'season_search_auto') {
    $cfg      = load_config();
    $sonarr   = find_app_by_driver($cfg, 'sonarr');
    if (!$sonarr) { echo json_encode(['error' => t('err_sonarr_not_configured')]); exit; }
    $seriesId = (int)($_POST['seriesId'] ?? 0);
    $season   = (int)($_POST['season']   ?? 0);
    if (!$seriesId) { echo json_encode(['error' => t('err_seriesid_missing')]); exit; }

    $res = arr_post($sonarr, '/api/v3/command', ['name' => 'SeasonSearch', 'seriesId' => $seriesId, 'seasonNumber' => $season]);
    if (isset($res['_error'])) { echo json_encode(['error' => $res['_error']]); exit; }
    echo json_encode(['ok' => true]);
    exit;
}



// ── Basculer le statut Surveillé (Monitored) ──────────────────────────────────
if ($action === 'toggle_monitor') {
    $cfg = load_config();
    $type = $_POST['type'] ?? 'movie';
    $id = (int)$_POST['id'];
    $monitored = filter_var($_POST['monitored'], FILTER_VALIDATE_BOOLEAN);

    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }

    $endpoint = $type === 'movie' ? "/api/v3/movie/{$id}" : "/api/v3/series/{$id}";

    // 1. Récupération en texte brut pour conserver le format exact attendu par l'API
    $raw = http_get(rtrim($app['url'], '/') . $endpoint . '?apikey=' . $app['api_key']);
    if (isset($raw['_error']) || !isset($raw['id'])) {
        echo json_encode(['error' => t('err_element_not_found_server')]); exit;
    }
    $raw['monitored'] = $monitored;

    // 2. Renvoi de la mise à jour
    $res = arr_put_raw($app, $endpoint, json_encode($raw, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

    if ($res['code'] >= 200 && $res['code'] < 300) {
        clear_media_caches($type);
        echo json_encode(['ok' => true, 'monitored' => $monitored]);
    } else {
        echo json_encode(['error' => "Erreur API ({$res['code']})"]);
    }
    exit;
}

// ── Basculer le statut Surveillé d'une Saison (Sonarr) ────────────────────────
if ($action === 'toggle_season_monitor') {
    $cfg = load_config();
    $seriesId = (int)$_POST['seriesId'];
    $seasonNumber = (int)$_POST['seasonNumber'];
    $monitored = filter_var($_POST['monitored'], FILTER_VALIDATE_BOOLEAN);

    $app = find_app_by_driver($cfg, 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_sonarr_not_configured')]); exit; }

    // 1. Récupération de la série (tableau associatif)
    $item = arr_get($app, "/api/v3/series/{$seriesId}");
    if (isset($item['_error']) || !isset($item['id'])) {
        echo json_encode(['error' => t('err_serie_not_found_server')]); exit;
    }

    $updated = false;
    foreach ($item['seasons'] as &$season) {
        if ($season['seasonNumber'] === $seasonNumber) {
            $season['monitored'] = $monitored;
            $updated = true;
            break;
        }
    }
    unset($season);

    if ($updated) {
        $res = arr_put_raw($app, "/api/v3/series/{$seriesId}", json_encode($item, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        if ($res['code'] >= 200 && $res['code'] < 300) {
            clear_media_caches('serie');
            echo json_encode(['ok' => true, 'monitored' => $monitored]); exit;
        } else {
            echo json_encode(['error' => "Erreur API Sonarr ({$res['code']})"]); exit;
        }
    }
    echo json_encode(['error' => "Saison introuvable"]); exit;
}

// ── CHANGER LE PROFIL DE QUALITÉ ──────────────────────────────────────────────
if ($action === 'update_media_quality') {
    $cfg = load_config();
    $type = $_POST['type'] ?? 'movie';
    $mediaId = (int)$_POST['id'];
    $profileId = (int)$_POST['profileId'];

    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }

    // Utilisation de l'endpoint "editor" pour une modification rapide
    $endpoint = $type === 'movie' ? '/api/v3/movie/editor' : '/api/v3/series/editor';
    $payload = [
        $type === 'movie' ? 'movieIds' : 'seriesIds' => [$mediaId],
        'qualityProfileId' => $profileId
    ];

    $res = arr_put($app, $endpoint, $payload);

    if ($res['code'] >= 200 && $res['code'] < 300) {
        echo json_encode(['ok' => true]);
    } else {
        echo json_encode(['error' => t('err_update_failed') . " ({$res['code']})"]);
    }
    exit;
}

// ── PROGRESSION DYNAMIQUE (Téléchargements en cours) ─────────────────────────
if ($action === 'queue_status') {
    require_auth();
    $cfg = load_config();
    $type = $_GET['type'] ?? 'movie';
    $id = (int)($_GET['id'] ?? 0);
    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }

    // --- PROGRESSION DYNAMIQUE ---
    $endpoint = $type === 'movie' ? "/api/v3/queue?movieId=$id" : "/api/v3/queue?seriesId=$id";
    $queue = arr_get($app, $endpoint);

    $results = [];
    if (is_array($queue) && isset($queue['records'])) {
        foreach ($queue['records'] as $q) {
            $size = $q['size'] ?? 0;
            $sizeleft = $q['sizeleft'] ?? 0;
            $pct = $size > 0 ? (100 - round(($sizeleft / $size) * 100)) : 0;

            $timeleft = $q['timeleft'] ?? '';
            if (strpos($timeleft, '.') !== false) $timeleft = explode('.', $timeleft)[0];

            if ($type === 'movie') {
                $results['movie'] = [
                    'pct' => max(0, min(100, $pct)),
                    'timeleft' => $timeleft
                ];
            } else {
                $epId = $q['episodeId'] ?? 0;
                if ($epId) {
                    $results['episodes'][$epId] = [
                        'pct' => max(0, min(100, $pct)),
                        'timeleft' => $timeleft
                    ];
                }
            }
        }
    }
    echo json_encode(['ok' => true, 'queue' => $results]);
    exit;
}

// ── PROXY IMAGE ───────────────────────────────────────────────────────────────
if ($action === 'proxy_image') {
    require_auth();
    $url = urldecode($_GET['url'] ?? '');

    $parsed = parse_url($url);
    $path_ok = isset($parsed['path']) && strpos($parsed['path'], '/api/v3/mediacover') === 0;

    // Le host doit correspondre à une des apps Radarr/Sonarr réellement configurées
    // (et non une simple sous-chaîne présente n'importe où dans l'URL).
    $host_ok = false;
    if ($path_ok && !empty($parsed['host'])) {
        $cfg = load_config();
        foreach ($cfg['apps'] ?? [] as $app) {
            if (in_array($app['driver'] ?? '', ['radarr', 'sonarr'], true)) {
                $app_host = parse_url($app['url'] ?? '', PHP_URL_HOST);
                if ($app_host && strcasecmp($app_host, $parsed['host']) === 0) { $host_ok = true; break; }
            }
        }
    }

    if ($path_ok && $host_ok) {
        header('Content-Type: image/jpeg');
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_exec($ch);
        curl_close($ch);
        exit;
    }
    http_response_code(404);
    exit;
}

// ── PROXY HTML (pour récupérer les favicons) ──────────────────────────────────
if ($action === 'proxy_fetch') {
    require_auth();
    $url = $_GET['url'] ?? '';

    if (!$url || !filter_var($url, FILTER_VALIDATE_URL)) {
        echo json_encode(['error' => 'URL invalide']);
        exit;
    }

    // Bloque spécifiquement les adresses de métadonnées cloud (169.254.0.0/16, dont
    // 169.254.169.254), vecteur classique de vol d'identifiants cloud via SSRF. On laisse
    // volontairement passer les IP privées du LAN (192.168.x.x, 10.x.x.x...) car c'est
    // l'usage normal de cette fonctionnalité (favicon d'une app auto-hébergée sur le réseau local).
    $host = parse_url($url, PHP_URL_HOST);
    $resolved_ip = $host ? gethostbyname($host) : '';
    $is_link_local = $resolved_ip && filter_var($resolved_ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)
    && (ip2long($resolved_ip) & 0xFFFF0000) === ip2long('169.254.0.0');
    if ($is_link_local) {
        echo json_encode(['error' => t('err_url_not_allowed')]);
        exit;
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; Serviarr)',
    ]);
    $html = curl_exec($ch);
    curl_close($ch);

    echo json_encode(['html' => $html ?: '']);
    exit;
}

// ── DASHBOARD : HUB FILMS ─────────────────────────────────────────────────────
if ($action === 'movies_dashboard') {
    require_auth();
    $cfg = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    if (!$radarr) { echo json_encode(['error' => t('err_radarr_not_configured')]); exit; }

    // 🚀 1. LECTURE DU CACHE (Durée : 6 heures)
    $cacheFile = __DIR__ . '/data/.cache_movies_dashboard.json';
    $cacheLife = 21600;

    if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheLife) {
        header('X-Cache: HIT');
        echo file_get_contents($cacheFile);
        exit;
    }

    $recent = []; $upcoming = []; $reco = []; $popular = [];
    $baseUrl = rtrim($radarr['url'], '/');

    // 1. RÉCUPÉRATION DE LA BIBLIOTHÈQUE LOCALE
    $allMovies = arr_get($radarr, '/api/v3/movie');
    $existingTmdbIds = [];
    $downloaded = [];
    $moviesById = [];
    $radarrIdByTmdb = []; // 🌟 NOUVEAU : On fait le lien entre TMDB et ton Radarr

    if (is_array($allMovies) && !isset($allMovies['_error'])) {
        foreach ($allMovies as $m) {
            $moviesById[$m['id']] = $m['title'];

            if (isset($m['tmdbId'])) {
                $existingTmdbIds[] = $m['tmdbId'];
                $radarrIdByTmdb[$m['tmdbId']] = $m['id'];
                if (!empty($m['hasFile'])) $downloaded[] = $m;
            }
        }
    }

    // 2. DERNIERS TÉLÉCHARGEMENTS
    $historyData = arr_get($radarr, '/api/v3/history?pageSize=40&sortKey=date&sortDirection=descending&eventType=3');
    if (is_array($historyData) && isset($historyData['records'])) {
        foreach ($historyData['records'] as $record) {
            $movieId = $record['movieId'] ?? ($record['movie']['id'] ?? null);

            if ($movieId && !isset($recent[$movieId])) {
                $title = $moviesById[$movieId] ?? $record['sourceTitle'] ?? 'Film inconnu';
                $posterUrl = $baseUrl . '/api/v3/mediacover/' . $movieId . '/poster-250.jpg?apikey=' . $radarr['api_key'];

                $recent[$movieId] = [
                    'id' => $movieId,
                    'title' => $title,
                    'poster' => 'api.php?action=proxy_image&url=' . urlencode($posterUrl),
                    'is_new' => false
                ];
                if (count($recent) >= 15) break;
            }
        }
    }

    // 🌟 3. À VENIR : LE MÉLANGE PARFAIT (Radarr + TMDB)
    $upcomingPool = [];
    $start = date('Y-m-d');
    $end = date('Y-m-d', strtotime('+6 months'));

    // A. Ajout des films que tu attends déjà dans TON Radarr
    $calendarData = arr_get($radarr, "/api/v3/calendar?start={$start}&end={$end}");
    if (is_array($calendarData) && !isset($calendarData['_error'])) {
        foreach ($calendarData as $mv) {
            if (empty($mv['hasFile'])) {
                $posterUrl = $baseUrl . '/api/v3/mediacover/' . $mv['id'] . '/poster-250.jpg?apikey=' . $radarr['api_key'];
                $releaseDate = substr($mv['digitalRelease'] ?? $mv['physicalRelease'] ?? $mv['inCinemas'] ?? '', 0, 10);

                if (!empty($releaseDate) && $releaseDate >= $start) {
                    $upcomingPool[$mv['tmdbId']] = [
                        'id' => $mv['id'],
                        'tmdbId' => $mv['tmdbId'],
                        'title' => $mv['title'],
                        'poster' => 'api.php?action=proxy_image&url=' . urlencode($posterUrl),
                        'release_date' => $releaseDate,
                        'is_new' => false
                    ];
                }
            }
        }
    }

    // 4. TMDB : RECOMMANDATIONS & POPULAIRES & NOUVEAUTÉS À VENIR
    $tmdbKey = $cfg['tmdb_api_key'] ?? '';
    if (!empty($tmdbKey)) {

        // B. Compléter "À venir"
        $today = date('Y-m-d');
        $tmdbUpcomingUrl = "https://api.themoviedb.org/3/discover/movie?api_key={$tmdbKey}&language=fr-FR&region=FR&sort_by=popularity.desc&primary_release_date.gte={$today}&with_release_type=2|3";

        $chUp = curl_init($tmdbUpcomingUrl);
        curl_setopt_array($chUp, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 3]);
        $resUp = curl_exec($chUp);
        curl_close($chUp);

        $dataUp = json_decode($resUp, true);
        foreach ($dataUp['results'] ?? [] as $m) {
            $tmdbId = $m['id'];
            $releaseDate = $m['release_date'] ?? '';
            // 🌟 On n'exclut plus les films que tu possèdes
            if (!isset($upcomingPool[$tmdbId])) {
                $is_in_lib = in_array($tmdbId, $existingTmdbIds);
                $upcomingPool[$tmdbId] = [
                    'id' => $is_in_lib ? $radarrIdByTmdb[$tmdbId] : 'tmdb_' . $tmdbId, // ID Radarr si possédé
                    'tmdbId' => $tmdbId,
                    'title' => $m['title'],
                    'poster' => $m['poster_path'] ? 'https://image.tmdb.org/t/p/w500' . $m['poster_path'] : '',
                    'release_date' => $releaseDate,
                    'is_new' => !$is_in_lib // Affiche le bouton DÉCOUVRIR uniquement si tu ne l'as pas
                ];
            }
        }

        // ── RECOMMANDATIONS PERSONNALISÉES (On garde l'exclusion ici, car on ne veut pas qu'on nous recommande un film déjà possédé) ──
        if (count($allMovies) > 0) {
            $baseList = !empty($downloaded) ? $downloaded : $allMovies;
            $randomMovie = $baseList[array_rand($baseList)];
            $tmdbUrl = "https://api.themoviedb.org/3/movie/{$randomMovie['tmdbId']}/recommendations?api_key={$tmdbKey}&language=fr-FR&page=1";

            $chTmdb = curl_init($tmdbUrl);
            curl_setopt_array($chTmdb, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 5]);
            $tmdbRes = curl_exec($chTmdb);
            curl_close($chTmdb);

            $tmdbData = json_decode($tmdbRes, true);
            foreach ($tmdbData['results'] ?? [] as $m) {
                if (isset($m['id']) && !in_array($m['id'], $existingTmdbIds)) {
                    $reco[] = [
                        'id' => 'tmdb_' . $m['id'], 'tmdbId' => $m['id'], 'title' => $m['title'],
                        'poster' => $m['poster_path'] ? 'https://image.tmdb.org/t/p/w500' . $m['poster_path'] : '',
                        'is_new' => true
                    ];
                    if (count($reco) >= 15) break;
                }
            }
        }

        // ── POPULAIRES ──
        $urlPop = "https://api.themoviedb.org/3/discover/movie?api_key={$tmdbKey}&language=fr-FR&region=FR&sort_by=popularity.desc&vote_count.gte=10";
        $ch = curl_init($urlPop);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 3]);
        $res = curl_exec($ch);
        curl_close($ch);

        $dataPop = json_decode($res, true);
        foreach ($dataPop['results'] ?? [] as $m) {
            // 🌟 On n'exclut plus les films que tu possèdes
            if (isset($m['id']) && !empty($m['poster_path'])) {
                $tmdbId = $m['id'];
                $is_in_lib = in_array($tmdbId, $existingTmdbIds);
                $popular[] = [
                    'id' => $is_in_lib ? $radarrIdByTmdb[$tmdbId] : 'tmdb_' . $tmdbId,
                    'tmdbId' => $tmdbId,
                    'title' => $m['title'],
                    'poster' => 'https://image.tmdb.org/t/p/w500' . $m['poster_path'],
                    'is_new' => !$is_in_lib
                ];
                if (count($popular) >= 15) break;
            }
        }
    }

    $upcoming = array_values($upcomingPool);
    usort($upcoming, function($a, $b) {
        return strcmp($a['release_date'], $b['release_date']);
    });

    $upcoming = array_slice($upcoming, 0, 25);

    // 🚀 2. ÉCRITURE DU CACHE
    $finalJson = json_encode([
        'recent' => array_values($recent),
                             'upcoming' => $upcoming,
                             'reco' => $reco,
                             'popular' => $popular,
                             'tmdb_missing' => empty($tmdbKey)
    ]);

    file_put_contents($cacheFile, $finalJson);

    header('X-Cache: MISS');
    echo $finalJson;
    exit;
}

// ── DASHBOARD : HUB SÉRIES ────────────────────────────────────────────────────
if ($action === 'series_dashboard') {
    require_auth();
    $cfg = load_config();
    $sonarr = find_app_by_driver($cfg, 'sonarr');

    if (!$sonarr) {
        echo json_encode(['error' => t('err_sonarr_not_configured')]);
        exit;
    }

    // 🚀 1. LECTURE DU CACHE (Durée : 6 heures)
    $cacheFile = __DIR__ . '/data/.cache_series_dashboard.json';
    $cacheLife = 21600;

    if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheLife) {
        header('X-Cache: HIT');
        echo file_get_contents($cacheFile);
        exit;
    }

    $recent = []; $upcoming = []; $recoPool = [];
    $popular = []; $upcoming_series = [];
    $baseUrl = rtrim($sonarr['url'], '/');

    $allSeries = arr_get($sonarr, '/api/v3/series');
    $existingTmdbIds = [];
    $sonarrIdByTmdb = []; // 🌟 NOUVEAU : On fait le lien entre TMDB et ton Sonarr

    if (is_array($allSeries) && !isset($allSeries['_error'])) {
        foreach ($allSeries as $sr) {
            if (!empty($sr['tmdbId'])) {
                $existingTmdbIds[] = $sr['tmdbId'];
                $sonarrIdByTmdb[$sr['tmdbId']] = $sr['id'];
            }
        }
    }

    // 1. DERNIERS ÉPISODES TÉLÉCHARGÉS
    $historyData = arr_get($sonarr, '/api/v3/history?pageSize=40&sortKey=date&sortDirection=descending&eventType=3&includeSeries=true&includeEpisode=true');
    if (is_array($historyData) && isset($historyData['records'])) {
        foreach ($historyData['records'] as $record) {
            if (isset($record['series'])) {
                $sr = $record['series'];
                if (!isset($recent[$sr['id']])) {
                    $posterUrl = $baseUrl . '/api/v3/mediacover/' . $sr['id'] . '/poster-250.jpg?apikey=' . $sonarr['api_key'];
                    $recent[$sr['id']] = [
                        'id' => $sr['id'],
                        'title' => $sr['title'],
                        'poster' => 'api.php?action=proxy_image&url=' . urlencode($posterUrl),
                        'is_new' => false
                    ];
                    if (count($recent) >= 15) break;
                }
            }
        }
    }

    // 2. ÉPISODES À VENIR (Calendrier Sonarr)
    $start = date('Y-m-d');
    $end = date('Y-m-d', strtotime('+15 days'));
    $calendarData = arr_get($sonarr, "/api/v3/calendar?start={$start}&end={$end}&includeSeries=true");

    if (is_array($calendarData) && !isset($calendarData['_error'])) {
        foreach ($calendarData as $ep) {
            if (isset($ep['series'])) {
                $srId = $ep['series']['id'];
                if (!isset($upcoming[$srId])) {
                    $posterUrl = $baseUrl . '/api/v3/mediacover/' . $srId . '/poster-250.jpg?apikey=' . $sonarr['api_key'];
                    $titleWithEpisode = $ep['series']['title'] . ' (S' . ($ep['seasonNumber'] ?? 0) . 'E' . ($ep['episodeNumber'] ?? 0) . ')';
                    $upcoming[$srId] = [
                        'id' => $srId,
                        'title' => $titleWithEpisode,
                        'poster' => 'api.php?action=proxy_image&url=' . urlencode($posterUrl),
                        'is_new' => false
                    ];
                }
            }
        }
    }

    // 3. RECOMMANDATIONS SONARR (Exclut naturellement celles qu'on a déjà à 100%)
    if (is_array($allSeries) && !isset($allSeries['_error'])) {
        foreach ($allSeries as $sr) {
            if ((($sr['statistics']['percentOfEpisodes'] ?? 100) < 80) && (($sr['ratings']['value'] ?? 0) >= 6)) {
                $posterUrl = $baseUrl . '/api/v3/mediacover/' . $sr['id'] . '/poster-250.jpg?apikey=' . $sonarr['api_key'];
                $recoPool[] = [
                    'id' => $sr['id'],
                    'title' => $sr['title'],
                    'poster' => 'api.php?action=proxy_image&url=' . urlencode($posterUrl),
                    'is_new' => false
                ];
            }
        }
    }
    shuffle($recoPool);
    $reco = array_slice($recoPool, 0, 15);

    // 🌟 4. DÉCOUVERTE TMDB
    $tmdbKey = $cfg['tmdb_api_key'] ?? '';
    if (!empty($tmdbKey)) {

        // A. NOUVELLES SÉRIES À VENIR
        $today = date('Y-m-d');
        $urlUp = "https://api.themoviedb.org/3/discover/tv?api_key={$tmdbKey}&language=fr-FR&sort_by=popularity.desc&first_air_date.gte={$today}";
        $chUp = curl_init($urlUp);
        curl_setopt_array($chUp, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 3]);
        $resUp = curl_exec($chUp);
        curl_close($chUp);

        $dataUp = json_decode($resUp, true);
        foreach ($dataUp['results'] ?? [] as $s) {
            // 🌟 N'exclut plus tes propres séries
            if (!empty($s['poster_path'])) {
                $tmdbId = $s['id'];
                $is_in_lib = in_array($tmdbId, $existingTmdbIds);

                $upcoming_series[] = [
                    'id' => $is_in_lib ? $sonarrIdByTmdb[$tmdbId] : 'tmdb_' . $tmdbId, // ID Sonarr si possédé
                    'tmdbId' => $tmdbId,
                    'title' => $s['name'],
                    'poster' => 'https://image.tmdb.org/t/p/w500' . $s['poster_path'],
                    'is_new' => !$is_in_lib
                ];
                if (count($upcoming_series) >= 15) break;
            }
        }

        // B. SÉRIES POPULAIRES
        $urlPop = "https://api.themoviedb.org/3/discover/tv?api_key={$tmdbKey}&language=fr-FR&sort_by=popularity.desc&vote_count.gte=10";
        $chPop = curl_init($urlPop);
        curl_setopt_array($chPop, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 3]);
        $resPop = curl_exec($chPop);
        curl_close($chPop);

        $dataPop = json_decode($resPop, true);
        foreach ($dataPop['results'] ?? [] as $s) {
            // 🌟 N'exclut plus tes propres séries
            if (!empty($s['poster_path'])) {
                $tmdbId = $s['id'];
                $is_in_lib = in_array($tmdbId, $existingTmdbIds);

                $popular[] = [
                    'id' => $is_in_lib ? $sonarrIdByTmdb[$tmdbId] : 'tmdb_' . $tmdbId,
                    'tmdbId' => $tmdbId,
                    'title' => $s['name'],
                    'poster' => 'https://image.tmdb.org/t/p/w500' . $s['poster_path'],
                    'is_new' => !$is_in_lib
                ];
                if (count($popular) >= 15) break;
            }
        }
    }

    // 🚀 2. ÉCRITURE DU CACHE
    $finalJson = json_encode([
        'recent' => array_values($recent),
                             'upcoming' => array_values($upcoming),
                             'reco' => $reco,
                             'popular' => $popular,
                             'upcoming_series' => $upcoming_series,
                             'tmdb_missing' => empty($tmdbKey)
    ]);

    file_put_contents($cacheFile, $finalJson);
    header('X-Cache: MISS');
    echo $finalJson;
    exit;
}

// ── SUPPRIMER FILM / SÉRIE ────────────────────────────────────────────────────
// ── ACTIONS GROUPÉES (sélection multiple sur la médiathèque) ─────────────────
if ($action === 'bulk_media_action') {
    $cfg = load_config();
    $type = $_POST['type'] ?? 'movie';
    $bulkAction = $_POST['bulkAction'] ?? '';
    $ids = json_decode($_POST['ids'] ?? '[]', true);
    $deleteFiles = filter_var($_POST['deleteFiles'] ?? 'true', FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false';

    if (!is_array($ids) || empty($ids) || !in_array($bulkAction, ['monitor_on', 'monitor_off', 'delete'], true)) {
        echo json_encode(['error' => t('err_invalid_request')]); exit;
    }

    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }

    $success = 0;
    $failed = [];

    foreach ($ids as $id) {
        $id = (int)$id;
        $endpoint = $type === 'movie' ? "/api/v3/movie/{$id}" : "/api/v3/series/{$id}";

        if ($bulkAction === 'delete') {
            $res = arr_delete($app, $endpoint . "?deleteFiles={$deleteFiles}");
            if ($res['code'] >= 200 && $res['code'] < 300) $success++; else $failed[] = $id;
        } else {
            $raw = http_get(rtrim($app['url'], '/') . $endpoint . '?apikey=' . $app['api_key']);
            if (isset($raw['_error']) || !isset($raw['id'])) { $failed[] = $id; continue; }
            $raw['monitored'] = ($bulkAction === 'monitor_on');
            $res = arr_put_raw($app, $endpoint, json_encode($raw, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
            if ($res['code'] >= 200 && $res['code'] < 300) $success++; else $failed[] = $id;
        }
    }

    clear_media_caches($type);
    log_activity($bulkAction === 'delete' ? 'bulk_delete' : 'bulk_monitor', $type, null,
                 "{$success} élément(s) sur " . count($ids) . " (" . $bulkAction . ")");

    if ($success > 0) {
        echo json_encode(['ok' => true, 'success' => $success, 'failed' => $failed]);
    } else {
        echo json_encode(['error' => 'Aucune action n\'a pu être effectuée', 'failed' => $failed]);
    }
    exit;
}

if ($action === 'delete_media') {
    $cfg = load_config();
    $type = $_POST['type'] ?? 'movie';
    $id = (int)$_POST['id'];

    // 🌟 NOUVEAU : On lit le choix de l'utilisateur (true ou false)
    $deleteFiles = filter_var($_POST['deleteFiles'] ?? 'true', FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false';

    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }

    // On injecte la variable dynamiquement dans l'URL
    $endpoint = $type === 'movie'
    ? "/api/v3/movie/{$id}?deleteFiles={$deleteFiles}"
    : "/api/v3/series/{$id}?deleteFiles={$deleteFiles}";

    $res = arr_delete($app, $endpoint);

    if ($res['code'] >= 200 && $res['code'] < 300) {
        clear_media_caches($type);
        log_activity('delete_media', $type, $id, $_POST['title'] ?? '');
        echo json_encode(['ok' => true]);
    } else {
        echo json_encode(['error' => "Erreur de suppression ({$res['code']})"]);
    }
    exit;
}

// ── SUPPRIMER UN FICHIER PRÉCIS ───────────────────────────────────────────────
if ($action === 'delete_file') {
    $cfg = load_config();
    $type = $_POST['type'] ?? 'movie';
    $fileId = (int)$_POST['fileId'];
    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }

    $endpoint = $type === 'movie' ? "/api/v3/moviefile/{$fileId}" : "/api/v3/episodefile/{$fileId}";
    $res = arr_delete($app, $endpoint);

    if ($res['code'] >= 200 && $res['code'] < 300) {
        clear_media_caches($type);
        echo json_encode(['ok' => true]);
    } else {
        echo json_encode(['error' => "Erreur de suppression fichier ({$res['code']})"]);
    }
    exit;
}

// ── ACTUALISER FILM / SÉRIE (Refresh & Scan) ──────────────────────────────────
if ($action === 'refresh_media') {
    $cfg = load_config();
    $type = $_POST['type'] ?? 'movie';
    $id = (int)$_POST['id'];
    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }

    // Radarr et Sonarr n'attendent pas exactement les mêmes paramètres
    $payload = [];
    if ($type === 'movie') {
        $payload = ['name' => 'RefreshMovie', 'movieIds' => [$id]];
    } else {
        $payload = ['name' => 'RefreshSeries', 'seriesId' => $id];
    }

    $res = arr_post($app, '/api/v3/command', $payload);

    if (isset($res['_error'])) { echo json_encode(['error' => $res['_error']]); exit; }
    clear_media_caches($type); // 🌟 CACHE VIDÉ
    echo json_encode(['ok' => true]);
    exit;
}


// ── Films d'une collection ────────────────────────────────────────────────────
if ($action === 'movie_collection') {
    $cfg    = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    if (!$radarr) { echo json_encode(['error' => t('err_radarr_not_configured')]); exit; }

    $collection_title  = $_GET['title'] ?? '';
    $collection_tmdbid = (int)($_GET['tmdbId'] ?? 0);
    if (!$collection_title) { echo json_encode(['error' => t('err_collection_title_missing')]); exit; }

    $base_url = rtrim($radarr['url'], '/');

    // 1. Récupère toutes les collections directement depuis la base Radarr
    $collections = arr_get($radarr, '/api/v3/collection');
    if (isset($collections['_error'])) { echo json_encode(['error' => $collections['_error']]); exit; }

    // 2. Trouve la bonne collection
    $target_collection = null;
    foreach ($collections as $c) {
        if ($collection_tmdbid && isset($c['tmdbId']) && $c['tmdbId'] == $collection_tmdbid) {
            $target_collection = $c;
            break;
        } elseif ($c['title'] === $collection_title || ($c['name'] ?? '') === $collection_title) {
            $target_collection = $c;
            break;
        }
    }

    if (!$target_collection) {
        echo json_encode(['error' => 'Collection introuvable dans Radarr.']); exit;
    }

    // 3. Récupère la bibliothèque pour croiser les données (savoir ce qu'on a déjà)
    $library = arr_get($radarr, '/api/v3/movie');
    $in_library = [];
    if (!isset($library['_error'])) {
        foreach ($library as $mv) {
            $in_library[$mv['tmdbId']] = $mv;
        }
    }

    // 4. Construction de la liste avec TOUS les films de la saga
    $all_movies = [];
    foreach ($target_collection['movies'] ?? [] as $mv) {
        $tmdbId = $mv['tmdbId'] ?? null;
        $libData = $in_library[$tmdbId] ?? null; // Les infos si on l'a déjà
        $inLib = ($libData !== null);

        // Gestion de l'affiche (locale si on a le film, via TMDB sinon)
        $poster = null;
        if ($inLib) {
            $poster = $base_url . '/api/v3/mediacover/' . $libData['id'] . '/poster-250.jpg?apikey=' . $radarr['api_key'];
        } else {
            foreach ($mv['images'] ?? [] as $img) {
                if ($img['coverType'] === 'poster') {
                    $poster = $img['remoteUrl'] ?? $img['url'] ?? null;
                    break;
                }
            }
        }

        $all_movies[] = [
            'id'       => $libData['id'] ?? null,
            'tmdbId'   => $tmdbId,
            'title'    => $mv['title'] ?? '?',
            'year'     => $mv['year'] ?? '',
            'rating'   => round($mv['ratings']['tmdb']['value'] ?? 0, 1),
            'hasFile'  => $libData ? ($libData['hasFile'] ?? false) : false,
            'monitored'=> $libData ? ($libData['monitored'] ?? false) : false,
            'inLib'    => $inLib,
            'quality'  => $libData ? ($libData['movieFile']['quality']['quality']['name'] ?? null) : null,
            'poster'   => $poster,
            'overview' => substr($mv['overview'] ?? '', 0, 200),
        ];
    }

    // Tri chronologique des films de la saga
    usort($all_movies, fn($a, $b) => ($a['year'] ?? 0) - ($b['year'] ?? 0));

    echo json_encode(['movies' => $all_movies, 'collection' => $collection_title], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_IGNORE);
    exit;
}

// ── LISTE DES ICÔNES LOCALES ──────────────────────────────────────────────────
if ($action === 'get_local_icons') {
    require_auth();
    $icons = [];
    // Scanne le dossier img/ à la recherche d'images
    $files = glob(__DIR__ . '/assets/img/*.{png,jpg,jpeg,svg,gif,ico,webp}', GLOB_BRACE);
    if ($files !== false) {
        foreach ($files as $f) {
            $icons[] = basename($f); // Ne garde que le nom du fichier (ex: radarr.png)
        }
    }
    echo json_encode(['icons' => $icons]);
    exit;
}

// ── MOTEUR TRANSMISSION RPC ───────────────────────────────────────────────────
function transmission_rpc($app, $method, $arguments = [], $sessionId = '') {
    $url     = rtrim($app['url'], '/') . '/transmission/rpc';
    $payload = json_encode(['method' => $method, 'arguments' => $arguments]);

    $headers = ['Content-Type: application/json'];

    // Authentification basique
    if (!empty($app['username'])) {
        $headers[] = 'Authorization: Basic ' . base64_encode($app['username'] . ':' . ($app['password'] ?? ''));
    }

    // Session-Id si on l'a déjà
    if ($sessionId !== '') {
        $headers[] = 'X-Transmission-Session-Id: ' . $sessionId;
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_HEADER         => true,
    ]);
    $raw      = curl_exec($ch);
    $httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $hsize    = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);

    // 409 = Transmission demande un Session-Id valide → on le récupère et on réessaie
    if ($httpcode === 409) {
        $headers_raw = substr($raw, 0, $hsize);
        if (preg_match('/X-Transmission-Session-Id:\s*(\S+)/i', $headers_raw, $m)) {
            return transmission_rpc($app, $method, $arguments, trim($m[1]));
        }
        return ['result' => 'error', '_error' => t('err_session_id_failed')];
    }

    $body = substr($raw, $hsize);
    return json_decode($body, true) ?? ['result' => 'error', '_error' => 'Invalid JSON'];
}

// ══════════════════════════════════════════════════════════════════════════
// ── qBITTORRENT ──────────────────────────────────────────────────────────
// qBittorrent utilise une API WebUI complètement différente de Transmission
// (auth par cookie SID, endpoints REST classiques). On normalise ses réponses
// pour qu'elles aient exactement la même forme que celles de Transmission,
// afin que le reste du code (et tout le frontend) n'ait rien à savoir du
// client réellement utilisé.
// ══════════════════════════════════════════════════════════════════════════

// Se connecte à qBittorrent et retourne le cookie de session (SID), mis en
// cache pour la durée de la requête PHP (évite de se reconnecter à chaque appel).
function qbt_login($app) {
    static $sid_cache = [];
    $cache_key = $app['url'] ?? '';
    if (isset($sid_cache[$cache_key])) return $sid_cache[$cache_key];

    $base_url = rtrim($app['url'], '/');
    $url = $base_url . '/api/v2/auth/login';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query([
            'username' => $app['username'] ?? '',
            'password' => $app['password'] ?? '',
        ]),
        // 🔒 qBittorrent rejette silencieusement les requêtes sans Referer/Origin
        // valides quand sa protection CSRF est activée (réglage par défaut).
        CURLOPT_HTTPHEADER     => ['Referer: ' . $base_url, 'Origin: ' . $base_url],
        CURLOPT_HEADER         => true,
        CURLOPT_TIMEOUT        => 8,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $raw = curl_exec($ch);
    $hsize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $curl_err = curl_error($ch);
    curl_close($ch);

    if ($curl_err) {
        return $sid_cache[$cache_key] = ['_error' => 'Connexion impossible : ' . $curl_err];
    }

    $headers_raw = substr($raw, 0, $hsize);
    $body = trim(substr($raw, $hsize));
    if (preg_match('/Set-Cookie:\s*(SID=[^;]+)/i', $headers_raw, $m)) {
        return $sid_cache[$cache_key] = trim($m[1]);
    }

    // NOUVEAU : Si qBittorrent valide la connexion (bypass local activé) mais ne donne pas de cookie
    if ($body === 'Ok.') {
        return $sid_cache[$cache_key] = 'bypass_local_auth';
    }

    // Pas de cookie renvoyé : on remonte le corps de la réponse pour diagnostiquer
    // (qBittorrent répond "Fails." en cas de mauvais identifiants, par exemple).
    return $sid_cache[$cache_key] = ['_error' => t('err_qbt_auth_refused') . ($body ? " ({$body})" : '')];
}

// Requête générique vers l'API qBittorrent, avec authentification automatique ou Clé API
function qbt_request($app, $endpoint, $post_fields = null) {
    $headers = [];
    $api_key = $app['api_key'] ?? '';

    // Astuce : si la clé API (qui commence par qbt_) est collée dans le mot de passe
    if (empty($api_key) && strpos($app['password'] ?? '', 'qbt_') === 0) $api_key = $app['password'];
    if (empty($api_key) && strpos($app['username'] ?? '', 'qbt_') === 0) $api_key = $app['username'];

    if (!empty($api_key)) {
        $headers[] = 'Authorization: Bearer ' . trim($api_key);
    } else {
        $sid = qbt_login($app);
        if (!$sid) return ['_error' => t('err_qbt_auth_failed')];
        $headers[] = 'Cookie: ' . $sid;
    }

    $url = rtrim($app['url'], '/') . '/api/v2/' . ltrim($endpoint, '/');
    $ch = curl_init($url);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_SSL_VERIFYPEER => false,
    ];
    if ($post_fields !== null) {
        $opts[CURLOPT_POST] = true;
        $opts[CURLOPT_POSTFIELDS] = is_array($post_fields) ? http_build_query($post_fields) : $post_fields;
    }
    curl_setopt_array($ch, $opts);
    $raw = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code === 403) return ['_error' => t('err_qbt_session_expired')];
    $decoded = json_decode($raw, true);
    return $decoded !== null ? $decoded : $raw;
}

// Traduit l'état qBittorrent (chaîne) vers le code numérique de statut de Transmission (0-6),
// pour que getTransmissionStatus() côté frontend fonctionne sans aucune modification.
function qbt_map_state($state) {
    $map = [
        'pausedDL' => 0, 'pausedUP' => 0,
        'checkingDL' => 2, 'checkingUP' => 2, 'checkingResumeData' => 2,
        'queuedDL' => 3,
        'downloading' => 4, 'forcedDL' => 4, 'metaDL' => 4, 'stalledDL' => 4, 'allocating' => 4,
        'queuedUP' => 5,
        'uploading' => 6, 'forcedUP' => 6, 'stalledUP' => 6, 'moving' => 6,
    ];
    return $map[$state] ?? 0; // error, missingFiles, unknown... → traité comme "en pause"
}

// Récupère la liste des torrents qBittorrent et la normalise au format Transmission
function qbt_get_torrents($app) {
    $torrents = qbt_request($app, 'torrents/info');
    if (!is_array($torrents)) return ['_error' => t('err_qbt_invalid_response')];
    if (isset($torrents['_error'])) return $torrents; // on propage l'erreur telle quelle

    $result = [];
    foreach ($torrents as $t) {
        $isErrorState = in_array($t['state'] ?? '', ['error', 'missingFiles'], true);
        $result[] = [
            'id'              => $t['hash'],
            'name'            => $t['name'] ?? '?',
            'status'          => qbt_map_state($t['state'] ?? ''),
            'percentDone'     => $t['progress'] ?? 0,
            'rateDownload'    => $t['dlspeed'] ?? 0,
            'rateUpload'      => $t['upspeed'] ?? 0,
            'totalSize'       => $t['size'] ?? 0,
            'errorString'     => $isErrorState ? ($t['state'] ?? 'Erreur') : '',
            'uploadRatio'     => $t['ratio'] ?? 0,
            'uploadedEver'    => $t['uploaded'] ?? 0,
            'downloadedEver'  => $t['downloaded'] ?? 0,
            'peersConnected'  => ($t['num_seeds'] ?? 0) + ($t['num_leechs'] ?? 0),
            'peersSendingToUs'   => $t['num_seeds'] ?? 0,
            'peersGettingFromUs' => $t['num_leechs'] ?? 0,
            'eta'             => ($t['eta'] ?? -1) >= 8640000 ? -1 : ($t['eta'] ?? -1), // qBt renvoie 8640000 pour "infini"
            'addedDate'       => $t['added_on'] ?? 0,
            'trackers'        => !empty($t['tracker']) ? [['announce' => $t['tracker']]] : [],
            'files'           => [], // chargés à la demande (voir qbt_get_torrent_files)
            'fileStats'       => [],
        ];
    }
    return $result;
}

// Récupère le détail des fichiers d'un torrent qBittorrent (appelé à l'ouverture du détail)
function qbt_get_torrent_files($app, $hash) {
    $files = qbt_request($app, 'torrents/files?hash=' . urlencode($hash));
    if (!is_array($files) || isset($files['_error'])) return ['files' => [], 'fileStats' => []];

    $out_files = [];
    $out_stats = [];
    foreach ($files as $f) {
        $out_files[] = ['name' => $f['name'] ?? '', 'length' => $f['size'] ?? 0];
        $out_stats[] = [
            'wanted'        => ($f['priority'] ?? 1) !== 0,
            'bytesCompleted' => (int) round(($f['size'] ?? 0) * ($f['progress'] ?? 0)),
            'priority'      => $f['priority'] ?? 1,
        ];
    }
    return ['files' => $out_files, 'fileStats' => $out_stats];
}

// Démarre/stoppe/supprime un ou plusieurs torrents qBittorrent (identifiés par hash)
function qbt_torrent_action($app, $method, $hashes, $deleteFiles = false) {
    $hashes_str = implode('|', $hashes);
    switch ($method) {
        case 'torrent-start':
            qbt_request($app, 'torrents/resume', ['hashes' => $hashes_str]);
            return true;
        case 'torrent-stop':
            qbt_request($app, 'torrents/pause', ['hashes' => $hashes_str]);
            return true;
        case 'torrent-remove':
            qbt_request($app, 'torrents/delete', ['hashes' => $hashes_str, 'deleteFiles' => $deleteFiles ? 'true' : 'false']);
            return true;
        default:
            return false;
    }
}

// Applique la priorité "voulu / pas voulu" sur des fichiers spécifiques d'un torrent
function qbt_set_files($app, $hash, $wanted_indexes, $unwanted_indexes) {
    if (!empty($wanted_indexes)) {
        qbt_request($app, 'torrents/filePrio', ['hash' => $hash, 'id' => implode('|', $wanted_indexes), 'priority' => 1]);
    }
    if (!empty($unwanted_indexes)) {
        qbt_request($app, 'torrents/filePrio', ['hash' => $hash, 'id' => implode('|', $unwanted_indexes), 'priority' => 0]);
    }
    return true;
}

// Ajoute un torrent (fichier .torrent ou lien magnet) à qBittorrent
function qbt_add_torrent($app, $magnet_url = null, $file_path = null) {
    $headers = [];
    $api_key = $app['api_key'] ?? '';

    if (empty($api_key) && strpos($app['password'] ?? '', 'qbt_') === 0) $api_key = $app['password'];
    if (empty($api_key) && strpos($app['username'] ?? '', 'qbt_') === 0) $api_key = $app['username'];

    if (!empty($api_key)) {
        $headers[] = 'Authorization: Bearer ' . trim($api_key);
    } else {
        $sid = qbt_login($app);
        if (!$sid) return false;
        $headers[] = 'Cookie: ' . $sid;
    }

    $post_fields = [];
    if ($file_path) {
        $post_fields['torrents'] = new CURLFile($file_path, 'application/x-bittorrent', 'upload.torrent');
    } elseif ($magnet_url) {
        $post_fields['urls'] = $magnet_url;
    } else {
        return false;
    }

    $ch = curl_init(rtrim($app['url'], '/') . '/api/v2/torrents/add');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $post_fields,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return $code === 200 && trim($res) === 'Ok.';
}

// ── RÉCUPÉRER LES TÉLÉCHARGEMENTS ─────────────────────────────────────────────
if ($action === 'get_downloads') {
    require_auth();
    $cfg = load_config();
    $trans = find_app_by_driver($cfg, 'download');
    if (!$trans) { echo json_encode(['error' => t('err_download_app_not_configured')]); exit; }

    $client = $trans['client'] ?? 'transmission';

    if ($client === 'qbittorrent') {
        $result = qbt_get_torrents($trans);
        if (isset($result['_error'])) {
            echo json_encode(['error' => $result['_error']]);
        } else {
            echo json_encode(['torrents' => $result]);
        }
        exit;
    }

    // Transmission (comportement par défaut / historique)
    $res = transmission_rpc($trans, 'torrent-get', [
        'fields' => [
            'id', 'name', 'status', 'percentDone', 'rateDownload', 'rateUpload',
            'totalSize', 'errorString', 'uploadRatio', 'uploadedEver', 'downloadedEver',
            'peersConnected', 'peersSendingToUs', 'peersGettingFromUs',
            'eta', 'addedDate', 'trackers', 'files', 'fileStats'
        ]
    ]);

    // On force l'id en chaîne de caractères pour que le frontend traite tous les
    // clients (Transmission = entier, qBittorrent = hash) de la même façon.
    $torrents = $res['arguments']['torrents'] ?? [];
    foreach ($torrents as &$tor) { $tor['id'] = (string) $tor['id']; }
    unset($tor);

    echo json_encode(['torrents' => $torrents]);
    exit;
}

if ($action === 'torrent_action') {
    require_auth();
    $cfg = load_config();
    $trans = find_app_by_driver($cfg, 'download');
    if (!$trans) { echo json_encode(['error' => t('err_download_app_not_configured')]); exit; }

    $client = $trans['client'] ?? 'transmission';
    $method = $_POST['method'] ?? ''; // torrent-start, torrent-stop, torrent-remove
    $deleteFiles = filter_var($_POST['delete-local-data'] ?? false, FILTER_VALIDATE_BOOLEAN);

    // Détermine les IDs ciblés (chaînes : entiers Transmission ou hash qBittorrent).
    // Si aucun ID n'est fourni, l'action s'applique à TOUS les torrents.
    $ids = null;
    if (isset($_POST['ids'])) {
        $decoded_ids = json_decode($_POST['ids'], true);
        if (is_array($decoded_ids) && !empty($decoded_ids)) $ids = $decoded_ids;
    } elseif (isset($_POST['id'])) {
        $ids = [$_POST['id']];
    }

    if ($client === 'qbittorrent') {
        $hashes = $ids !== null ? $ids : ['all'];
        $ok = qbt_torrent_action($trans, $method, $hashes, $deleteFiles);
        if ($ok && $ids !== null && count($ids) > 1) {
            log_activity('bulk_torrent', 'torrent', null, count($ids) . ' torrent(s) — ' . $method);
        }
        echo json_encode(['ok' => $ok]);
        exit;
    }

    // Transmission (comportement par défaut / historique)
    $args = [];
    if ($ids !== null) $args['ids'] = array_map('intval', $ids);
    if ($method === 'torrent-remove') $args['delete-local-data'] = $deleteFiles;

    $res = transmission_rpc($trans, $method, $args);
    $ok = ($res['result'] ?? '') === 'success';

    // On ne journalise que les actions groupées explicites (pas les "tout mettre en pause/reprendre")
    if ($ok && isset($args['ids']) && count($args['ids']) > 1) {
        log_activity('bulk_torrent', 'torrent', null, count($args['ids']) . ' torrent(s) — ' . $method);
    }

    echo json_encode(['ok' => $ok]);
    exit;
}

// ── NOUVEAU : CHOIX DES FICHIERS À TÉLÉCHARGER ────────────────────────────────
// ── DÉTAIL DES FICHIERS D'UN TORRENT (chargé à la demande à l'ouverture) ──────
if ($action === 'get_torrent_files') {
    require_auth();
    $cfg = load_config();
    $trans = find_app_by_driver($cfg, 'download');
    if (!$trans) { echo json_encode(['error' => t('err_download_app_not_configured')]); exit; }

    $client = $trans['client'] ?? 'transmission';
    $id = $_GET['id'] ?? '';

    if ($client === 'qbittorrent') {
        echo json_encode(qbt_get_torrent_files($trans, $id));
        exit;
    }

    // Transmission : les fichiers sont déjà inclus dans get_downloads, mais on garde
    // ce chemin pour rester cohérent si jamais on veut un jour les charger à part.
    $res = transmission_rpc($trans, 'torrent-get', [
        'ids' => [(int) $id],
        'fields' => ['files', 'fileStats'],
    ]);
    $t = $res['arguments']['torrents'][0] ?? null;
    echo json_encode(['files' => $t['files'] ?? [], 'fileStats' => $t['fileStats'] ?? []]);
    exit;
}

if ($action === 'torrent_set_files') {
    require_auth();
    $cfg = load_config();
    $trans = find_app_by_driver($cfg, 'download');
    if (!$trans) { echo json_encode(['error' => t('err_download_app_not_configured')]); exit; }

    $client = $trans['client'] ?? 'transmission';
    $id = $_POST['id'] ?? '';
    $wanted = isset($_POST['wanted']) ? json_decode($_POST['wanted'], true) : [];
    $unwanted = isset($_POST['unwanted']) ? json_decode($_POST['unwanted'], true) : [];

    if ($id === '') { echo json_encode(['error' => t('err_id_missing')]); exit; }

    if ($client === 'qbittorrent') {
        echo json_encode(['ok' => qbt_set_files($trans, $id, $wanted ?: [], $unwanted ?: [])]);
        exit;
    }

    // Transmission (comportement par défaut / historique)
    $args = ['ids' => [(int) $id]];
    if (!empty($wanted)) $args['files-wanted'] = $wanted;
    if (!empty($unwanted)) $args['files-unwanted'] = $unwanted;

    $res = transmission_rpc($trans, 'torrent-set', $args);
    echo json_encode(['ok' => ($res['result'] ?? '') === 'success']);
    exit;
}

// ── AJOUTER UN TORRENT (Fichier ou Magnet) ────────────────────────────────────
if ($action === 'add_torrent') {
    require_auth();
    $cfg = load_config();
    $trans = find_app_by_driver($cfg, 'download');

    // 🌟 NOUVEAU : Détecte si l'ajout vient du menu "Partager" du téléphone
    $is_share = isset($_GET['from_share']);

    if (!$trans) {
        if ($is_share) die("Application de téléchargement non configurée");
        echo json_encode(['error' => t('err_download_app_not_configured')]); exit;
    }

    $client = $trans['client'] ?? 'transmission';
    $has_file = isset($_FILES['torrent_file']) && $_FILES['torrent_file']['error'] === UPLOAD_ERR_OK;
    $magnet_link = trim($_POST['magnet'] ?? $_POST['text_data'] ?? $_POST['url_data'] ?? '');

    if (!$has_file && empty($magnet_link)) {
        if ($is_share) { header('Location: /'); exit; }
        echo json_encode(['error' => t('err_no_file_or_link')]); exit;
    }

    if ($client === 'qbittorrent') {
        $result = $has_file
            ? qbt_add_torrent($trans, null, $_FILES['torrent_file']['tmp_name'])
            : qbt_add_torrent($trans, $magnet_link, null);

        if ($is_share) { header('Location: /'); exit; }

        if ($result === true) {
            log_activity('add_torrent', 'torrent', null, $has_file ? 'Fichier .torrent' : $magnet_link);
            echo json_encode(['ok' => true]);
        } else {
            $error_msg = is_string($result) ? $result : 'Erreur lors de l\'ajout';
            echo json_encode(['error' => $error_msg]);
        }
        exit;
    }

    // Transmission (comportement par défaut / historique)
    $args = [];
    if ($has_file) {
        $args['metainfo'] = base64_encode(file_get_contents($_FILES['torrent_file']['tmp_name']));
    } else {
        $args['filename'] = $magnet_link;
    }

    $res = transmission_rpc($trans, 'torrent-add', $args);

    // 🌟 LA MAGIE POUR LE MOBILE : Si on a utilisé le bouton Partager
    if ($is_share) {
        // Au lieu d'afficher du JSON, on renvoie l'utilisateur directement dans l'application !
        header('Location: /');
        exit;
    }
    // Comportement normal pour la modale sur PC
    else {
        if (isset($res['result']) && $res['result'] === 'success') {
            if (isset($res['arguments']['torrent-duplicate'])) {
                echo json_encode(['error' => t('err_torrent_duplicate')]);
            } else {
                $torrent_name = $res['arguments']['torrent-added']['name']
                ?? $res['arguments']['torrent-duplicate']['name']
                ?? (isset($args['metainfo']) ? 'Fichier .torrent' : ($args['filename'] ?? '?'));
                log_activity('add_torrent', 'torrent', null, $torrent_name);
                echo json_encode(['ok' => true]);
            }
        } else {
            echo json_encode(['error' => $res['result'] ?? 'Erreur lors de l\'ajout']);
        }
        exit;
    }
}

// ── REORDONNER LES APPLICATIONS ───────────────────────────────────────────────
if ($action === 'reorder_apps') {
    require_auth();
    $cfg = load_config();

    // On récupère le tableau des identifiants dans leur nouvel ordre
    $new_order = json_decode($_POST['order'] ?? '[]', true);

    if (!empty($new_order) && is_array($new_order)) {
        $reordered_apps = [];

        // 1. On reconstruit la liste en respectant le nouvel ordre reçu
        foreach ($new_order as $id) {
            if (isset($cfg['apps'][$id])) {
                $reordered_apps[$id] = $cfg['apps'][$id];
            }
        }

        // 2. Sécurité : on rajoute à la fin les apps qui auraient été oubliées
        foreach ($cfg['apps'] ?? [] as $id => $app) {
            if (!isset($reordered_apps[$id])) {
                $reordered_apps[$id] = $app;
            }
        }

        $cfg['apps'] = $reordered_apps;
        save_config($cfg);

        echo json_encode(['ok' => true]);
        exit;
    }

    echo json_encode(['error' => 'Ordre invalide']);
    exit;
}

// ── HUB FILMS : DERNIERS TÉLÉCHARGEMENTS RADARR ──────────────────────────────
if ($action === 'get_recent_movies') {
    require_auth();
    $cfg = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');

    if (!$radarr) {
        echo json_encode(['error' => t('err_radarr_not_configured')]);
        exit;
    }

    $url = rtrim($radarr['url'], '/') . '/api/v3/movie?apikey=' . $radarr['api_key'];

    // Requête cURL propre vers Radarr
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 5
    ]);
    $response = curl_exec($ch);
    curl_close($ch);

    $movies = json_decode($response, true);
    if (!is_array($movies)) {
        echo json_encode(['error' => t('err_radarr_unreachable')]);
        exit;
    }

    // 1. Ne garder que les films réellement téléchargés (présents sur le disque)
    $downloaded = array_filter($movies, function($m) {
        return isset($m['hasFile']) && $m['hasFile'] === true;
    });

    // 2. Trier par date d'ajout du fichier (du plus récent au plus ancien)
    usort($downloaded, function($a, $b) {
        $dateA = strtotime($a['movieFile']['dateAdded'] ?? $a['added']);
        $dateB = strtotime($b['movieFile']['dateAdded'] ?? $b['added']);
        return $dateB <=> $dateA;
    });

    // 3. Garder uniquement les 12 derniers ajouts pour ne pas surcharger l'interface
    $recent = array_slice($downloaded, 0, 12);

    // 4. Formater les données pour le JavaScript
    $results = [];
    $base_url = rtrim($radarr['url'], '/');
    foreach ($recent as $m) {
        $results[] = [
            'id'     => $m['id'],
            'title'  => $m['title'],
            'year'   => $m['year'] ?? '',
            'poster' => $base_url . '/api/v3/mediacover/' . $m['id'] . '/poster-250.jpg?apikey=' . $radarr['api_key']
        ];
    }

    echo json_encode(['movies' => $results]);
    exit;
}

// ── GESTION DOCKER ────────────────────────────────────────────────────────────
if ($action === 'get_containers') {
    require_auth();
    $cfg = load_config();
    $docker = find_app_by_driver($cfg, 'docker');

    if (!$docker) {
        echo json_encode(['error' => t('err_docker_not_configured_settings')]);
        exit;
    }

    $socketPath = $docker['url'] ?? '/var/run/docker.sock';

    $ch = curl_init("http://localhost/containers/json?all=true");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_UNIX_SOCKET_PATH => $socketPath,
        CURLOPT_TIMEOUT => 5
    ]);
    $res = curl_exec($ch);
    curl_close($ch);

    $containers = json_decode($res, true);

    if (!is_array($containers)) {
        echo json_encode(['error' => t('err_docker_unreachable_via') . $socketPath]);
        exit;
    }

    $result = [];
    foreach ($containers as $c) {
        $name = ltrim($c['Names'][0] ?? 'Inconnu', '/');
        $result[] = [
            'id'     => substr($c['Id'], 0, 12),
            'name'   => $name,
            'state'  => $c['State'] ?? 'unknown',
            'status' => $c['Status'] ?? '?',
            'image'  => $c['Image'] ?? 'Inconnue'
        ];
    }

    usort($result, fn($a, $b) => strcasecmp($a['name'], $b['name']));
    echo json_encode(['containers' => $result]);
    exit;
}

// ── GESTION DOCKER : ACTIONS (Start / Stop / Restart) ─────────────────────────
if ($action === 'docker_action') {
    require_auth();
    $cfg = load_config();
    $docker = find_app_by_driver($cfg, 'docker');

    if (!$docker) {
        echo json_encode(['error' => t('err_docker_app_not_configured')]);
        exit;
    }

    $containerId = preg_replace('/[^a-zA-Z0-9_.-]/', '', $_POST['id'] ?? '');
    $cmd = $_POST['cmd'] ?? ''; // start, stop, restart

    if (!$containerId || !in_array($cmd, ['start', 'stop', 'restart'], true)) {
        echo json_encode(['error' => t('err_invalid_params')]);
        exit;
    }

    $socketPath = $docker['url'] ?? '/var/run/docker.sock';

    // 🚀 CORRECTION : On initialise la requête POST sans corps
    $ch = curl_init("http://localhost/containers/{$containerId}/{$cmd}");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_UNIX_SOCKET_PATH => $socketPath,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => '',      // 👈 Force un corps vide explicite
        CURLOPT_HTTPHEADER => ['Content-Length: 0'], // 👈 Force la longueur à 0 pour éviter le message d'erreur
        CURLOPT_TIMEOUT => 45
    ]);

    $res = curl_exec($ch);
    $httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    // L'API Docker renvoie 204 (No Content) en cas de succès
    if ($httpcode >= 200 && $httpcode < 300) {
        log_activity('docker_action', 'container', substr($containerId, 0, 12), $cmd);
        echo json_encode(['ok' => true]);
    } else {
        // En cas d'erreur, on tente de décoder le message d'erreur de Docker
        $err = json_decode($res, true);
        echo json_encode(['error' => $err['message'] ?? "Erreur Docker (Code: $httpcode)"]);
    }
    exit;
}

// ── NOTIFICATIONS (Menu déroulant) ────────────────────────────────────────────
if ($action === 'get_notifications_list') {
    require_auth();
    $cfg = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    $sonarr = find_app_by_driver($cfg, 'sonarr');

    $notifs = [];

    // 1. On récupère les derniers imports de Radarr
    if ($radarr) {
        // On crée le dictionnaire infaillible des titres
        $allMovies = arr_get($radarr, '/api/v3/movie');
        $moviesById = [];
        if (is_array($allMovies) && !isset($allMovies['_error'])) {
            foreach ($allMovies as $m) {
                $moviesById[$m['id']] = $m['title'];
            }
        }

        // 🌟 MODIFIÉ : pageSize=60 au lieu de 30
        $h = arr_get($radarr, '/api/v3/history?pageSize=200&sortKey=date&sortDirection=descending&eventType=3');
        $baseUrl = rtrim($radarr['url'], '/');

        if (!empty($h['records'])) {
            $seenMovies = []; // Le filtre anti-doublon

            foreach ($h['records'] as $r) {
                $movieId = $r['movieId'] ?? ($r['movie']['id'] ?? null);

                if (!$movieId || isset($seenMovies[$movieId])) continue;
                $seenMovies[$movieId] = true; // On marque le film comme "Vu"

                $title = $moviesById[$movieId] ?? $r['movie']['title'] ?? $r['sourceTitle'] ?? 'Film inconnu';
                $posterUrl = $baseUrl . '/api/v3/mediacover/' . $movieId . '/poster-250.jpg?apikey=' . $radarr['api_key'];

                $notifs[] = [
                    'type'   => 'movie',
                    'id'     => $movieId,
                    'title'  => $title,
                    'date'   => $r['date'],
                    'poster' => 'api.php?action=proxy_image&url=' . urlencode($posterUrl)
                ];
            }
        }
    }

    // 2. On récupère les derniers imports de Sonarr
    if ($sonarr) {
        // 🌟 MODIFIÉ : pageSize=60 au lieu de 30
        $h = arr_get($sonarr, '/api/v3/history?pageSize=200&sortKey=date&sortDirection=descending&eventType=3&includeSeries=true&includeEpisode=true');
        $baseUrl = rtrim($sonarr['url'], '/');

        if (!empty($h['records'])) {
            $seenEpisodes = []; // Anti-doublon pour les épisodes

            foreach ($h['records'] as $r) {
                $serieId = $r['series']['id'] ?? null;
                $episodeId = $r['episodeId'] ?? ($r['episode']['id'] ?? null);

                if (!$serieId || !$episodeId || isset($seenEpisodes[$episodeId])) continue;
                $seenEpisodes[$episodeId] = true;

                $title = ($r['series']['title'] ?? 'Série') . ' - ' . ($r['episode']['title'] ?? 'Épisode');
                $posterUrl = $baseUrl . '/api/v3/mediacover/' . $serieId . '/poster-250.jpg?apikey=' . $sonarr['api_key'];

                $notifs[] = [
                    'type'   => 'serie',
                    'id'     => $serieId,
                    'title'  => $title,
                    'date'   => $r['date'],
                    'poster' => 'api.php?action=proxy_image&url=' . urlencode($posterUrl)
                ];
            }
        }
    }

    // 3. On mélange et on trie du plus récent au plus ancien
    usort($notifs, fn($a, $b) => strtotime($b['date']) - strtotime($a['date']));

    // 🌟 MODIFIÉ : On renvoie les 30 plus récents au lieu de 15
    echo json_encode(array_slice($notifs, 0, 100));
    exit;
}

// ── WEB PUSH : LE WEBHOOK POUR RADARR ET SONARR ───────────────────────────────
if ($action === 'webhook_notif') {
    // 🔍 DIAGNOSTIC PRIORITAIRE : on trace l'arrivée de CHAQUE requête ici, tout en haut,
    // avant même la vérification du token. Passe par error_log() qui ne dépend pas
    // des permissions du dossier data/ (contrairement à debug_push.txt plus bas).
    $received_token = $_GET['token'] ?? '(aucun)';
    error_log("Serviarr webhook_notif : requête reçue depuis " . ($_SERVER['REMOTE_ADDR'] ?? '?') . " | méthode=" . ($_SERVER['REQUEST_METHOD'] ?? '?') . " | token fourni=" . ($received_token !== '(aucun)' ? substr($received_token, 0, 6) . '…' : '(aucun)'));

    // 🔒 Vérification du token secret pour empêcher les faux webhooks
    $expected_token = get_webhook_token();
    if (!hash_equals($expected_token, $_GET['token'] ?? '')) {
        error_log("Serviarr webhook_notif : token invalide, requête rejetée (403)");
        http_response_code(403);
        exit('Forbidden');
    }

    // 🌟 CORRECTION 1 : Libère la session pour permettre à PHP de traiter l'import et la suppression en même temps !
    session_write_close();

    // S'assure que le dossier data/ existe avant d'essayer d'y écrire (peut manquer sur une install fraîche)
    $data_dir = __DIR__ . '/data';
    if (!is_dir($data_dir)) {
        @mkdir($data_dir, 0775, true);
    }

    // Journal de diagnostic pour les notifications push (utile en cas de souci).
    // On le tronque automatiquement s'il devient trop gros pour éviter qu'il grossisse indéfiniment.
    $debugFile = __DIR__ . '/data/debug_push.txt';
    if (file_exists($debugFile) && filesize($debugFile) > 1048576) { // > 1 Mo
        file_put_contents($debugFile, "--- Journal tronqué automatiquement ---\n");
    }

    require __DIR__ . '/vendor/autoload.php';

    $raw_input = file_get_contents('php://input');
    $input = json_decode($raw_input, true);

    // 🔍 On trace CHAQUE requête reçue, même les tests vides, pour diagnostiquer.
    $write_ok = @file_put_contents(
        $debugFile,
        "[" . date('Y-m-d H:i:s') . "] Requête reçue. Longueur brute: " . strlen($raw_input) . " octets. JSON valide: " . ($input ? 'oui' : 'non') . ". Contenu brut (200 premiers caractères): " . substr($raw_input, 0, 200) . "\n",
                                   FILE_APPEND | LOCK_EX
    );
    if ($write_ok === false) {
        // Le dossier data/ n'est probablement pas accessible en écriture par le serveur web (www-data).
        error_log("Serviarr webhook_notif : impossible d'écrire dans {$debugFile} — vérifier les permissions du dossier data/");
    }

    if (!$input) exit('OK'); // Ignore les pings de test vides

    $cfg = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    $sonarr = find_app_by_driver($cfg, 'sonarr');

    $image = null;
    $tag = 'sys_notif'; // 🌟 NOUVEAU : Identifiant unique par défaut
    $clickUrl = '/';

    $formatSize = function($bytes) {
        if (!$bytes) return 'Inconnu';
        if ($bytes >= 1073741824) return round($bytes / 1073741824, 2) . ' Go';
        if ($bytes >= 1048576) return round($bytes / 1048576, 2) . ' Mo';
        return $bytes . ' o';
    };

    $eventType = $input['eventType'] ?? 'Unknown';
    $isUpgrade = $input['isUpgrade'] ?? false;

    $actionText = "";
    switch ($eventType) {
        case 'Grab': $actionText = "⬇️ En cours de téléchargement"; break;
        case 'Download': $actionText = $isUpgrade ? "✨ Qualité améliorée" : "✅ Téléchargement terminé"; break;
        case 'Rename': $actionText = "🏷️ Fichiers renommés"; break;
        case 'MovieDelete':
        case 'SeriesDelete': $actionText = "🗑️ Média supprimé de la bibliothèque"; break;
        case 'MovieFileDelete':
        case 'EpisodeFileDelete': $actionText = "🗑️ Fichier vidéo supprimé"; break;
        case 'HealthIssue': $actionText = "⚠️ Avertissement système"; break;
        case 'ApplicationUpdate': $actionText = "🔄 Application mise à jour"; break;
        case 'Test': $actionText = "🔔 Test de connexion réussi !"; break;
        default: $actionText = "ℹ️ Notification système"; break;
    }

    if ($eventType === 'Test') {
        $title = $actionText;
        $body = "Radarr/Sonarr communique parfaitement avec ton téléphone.";
        $tag = 'test_notif';

    } elseif (isset($input['movie'])) {
        $m = $input['movie'];
        $title = "🎬 " . $m['title'] . " (" . ($m['year'] ?? '') . ")";
        $body = $actionText . "\n";

        // 🌟 NOUVEAU : On crée un Tag lié à l'ID du film
        $tag = 'movie_' . $m['id'];
        $clickUrl = 'films.php?movie=' . $m['id'];

        if ($eventType === 'Grab' && isset($input['release'])) {
            $body .= "Qualité : " . ($input['release']['quality'] ?? 'Inconnue') . "\n";
            $body .= "Poids : " . $formatSize($input['release']['size'] ?? 0) . "\n";
            $body .= "Source : " . ($input['release']['indexer'] ?? 'Inconnue');
        } elseif (isset($input['movieFile'])) {
            $mf = $input['movieFile'];
            $fileName = basename($mf['relativePath'] ?? 'Fichier inconnu');
            $body .= "Qualité : " . ($mf['quality'] ?? 'Inconnue') . "\n";
            $body .= "Poids : " . $formatSize($mf['size'] ?? 0) . "\n";
            $body .= "Fichier : {$fileName}";
        }

        if ($radarr) {
            $image = rtrim($radarr['url'], '/') . '/api/v3/mediacover/' . $m['id'] . '/poster.jpg?apikey=' . $radarr['api_key'];
        }
        clear_media_caches('movie');

    } elseif (isset($input['series'])) {
        $s = $input['series'];
        $title = "📺 " . $s['title'];
        $body = $actionText . "\n";

        // 🌟 NOUVEAU : On crée un Tag lié à l'ID de la série
        $tag = 'serie_' . $s['id'];
        $clickUrl = 'series.php?serie=' . $s['id'];

        if (isset($input['episodes']) && count($input['episodes']) > 0) {
            $ep = $input['episodes'][0];
            $saison = sprintf("%02d", $ep['seasonNumber'] ?? 0);
            $episode = sprintf("%02d", $ep['episodeNumber'] ?? 0);
            $title .= " - S{$saison}E{$episode}";
            $body .= "Épisode : " . ($ep['title'] ?? 'Inconnu') . "\n";
        }

        if ($eventType === 'Grab' && isset($input['release'])) {
            $body .= "Qualité : " . ($input['release']['quality'] ?? 'Inconnue') . "\n";
            $body .= "Poids : " . $formatSize($input['release']['size'] ?? 0) . "\n";
            $body .= "Source : " . ($input['release']['indexer'] ?? 'Inconnue');
        } elseif (isset($input['episodeFile'])) {
            $ef = $input['episodeFile'];
            $fileName = basename($ef['relativePath'] ?? 'Fichier inconnu');
            $body .= "Qualité : " . ($ef['quality'] ?? 'Inconnue') . "\n";
            $body .= "Poids : " . $formatSize($ef['size'] ?? 0) . "\n";
            $body .= "Fichier : {$fileName}";
        }

        if ($sonarr) {
            $image = rtrim($sonarr['url'], '/') . '/api/v3/mediacover/' . $s['id'] . '/poster.jpg?apikey=' . $sonarr['api_key'];
        }
        clear_media_caches('serie');

    } elseif ($eventType === 'HealthIssue') {
        $title = $actionText;
        $body = $input['healthIssue']['message'] ?? 'Erreur système détectée.';
    } elseif ($eventType === 'ApplicationUpdate') {
        $title = $actionText;
        $body = "Version : " . ($input['applicationUpdate']['newVersion'] ?? 'Inconnue');
    }

    $subFile = __DIR__ . '/data/push_subscription.json';
    if (!file_exists($subFile)) {
        file_put_contents($debugFile, "❌ ECHEC : Le fichier push_subscription.json est introuvable !\n", FILE_APPEND | LOCK_EX);
        http_response_code(400);
        exit('⚠️ ERREUR : Aucun téléphone associé.');
    }
    file_put_contents($debugFile, "✅ SUCCES : Le fichier du téléphone a bien été trouvé.\n", FILE_APPEND | LOCK_EX);

    try {
        $subRaw = file_get_contents($subFile);
        $subJson = json_decode($subRaw, true);

        if (!$subJson || !isset($subJson['endpoint'])) {
            throw new Exception("Le fichier push_subscription.json est vide ou corrompu !");
        }

        $subscription = Subscription::create([
            'endpoint' => $subJson['endpoint'],
            'publicKey' => $subJson['keys']['p256dh'] ?? '',
            'authToken' => $subJson['keys']['auth'] ?? '',
        ]);

        $vapid_email   = !empty($cfg['vapid_email']) ? $cfg['vapid_email'] : 'niko.sallot@gmail.com';
        $vapid_public  = !empty($cfg['vapid_public']) ? $cfg['vapid_public'] : 'BEtLH83HDQX7EbavV0DF2bp2V7yf7BVoaqhqSVXjaEsMg4IwqbIi39q3MCj5x0z5B4g8Mya0S1Id0NseA6qODzI';
        $vapid_private = !empty($cfg['vapid_private']) ? $cfg['vapid_private'] : 'WF-qAb027VD4steNAgod2CERorqA3nfko5t2D_KnBZA';

        $auth = [
            'VAPID' => [
                'subject' => 'mailto:' . $vapid_email,
                'publicKey' => $vapid_public,
                'privateKey' => $vapid_private,
            ],
        ];

        $webPush = new WebPush($auth);

        $notificationData = [
            'title' => $title,
            'body'  => $body,
            'tag'   => $tag,
            'url'   => $clickUrl
        ];
        if ($image) {
            $notificationData['icon']  = $image;
        }
        $payload = json_encode($notificationData);

        $report = $webPush->sendOneNotification($subscription, $payload);

        if ($report->isSuccess()) {
            file_put_contents($debugFile, "✅ SUCCES : Google a accepté le message !\n", FILE_APPEND | LOCK_EX);
            exit('✅ Push envoyé avec succès !');
        } else {
            file_put_contents($debugFile, "❌ ECHEC GOOGLE : " . $report->getReason() . "\n", FILE_APPEND | LOCK_EX);
            http_response_code(200);
            exit('❌ Refusé par Google : ' . $report->getReason());
        }
    } catch (\Throwable $e) {
        file_put_contents($debugFile, "💥 CRASH PHP : " . $e->getMessage() . " (Ligne " . $e->getLine() . ")\n", FILE_APPEND | LOCK_EX);
        http_response_code(200);
        exit('💥 Erreur Interne PHP : ' . $e->getMessage());
    }
}

// ── WEB PUSH : SAUVEGARDER L'ABONNEMENT DU TÉLÉPHONE ──────────────────────────
if ($action === 'save_push_sub') {
    require_auth(); // Sécurité : seul toi peux t'abonner

    $sub = $_POST['sub'] ?? '';

    if (!empty($sub)) {
        // On sauvegarde le ticket du téléphone dans un fichier caché
        file_put_contents(__DIR__ . '/data/push_subscription.json', $sub);
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['error' => 'No sub data']);
    }
    exit;
}


// ── PROWLARR / JACKETT : LISTE DES INDEXERS ───────────────────────────────────
if ($action === 'prowlarr_indexers') {
    require_auth();
    $cfg = load_config();
    $app = find_app_by_driver($cfg, 'indexer');

    if (!$app) {
        echo json_encode(['error' => 'L\'indexeur n\'est pas configuré dans les paramètres.']);
        exit;
    }

    require_once __DIR__ . '/drivers/indexer.php';
    $client = $app['client'] ?? 'prowlarr';

    if ($client === 'jackett') {
        $raw = jackett_request($app, 'indexers');
        if (isset($raw['_error'])) {
            echo json_encode(['error' => $raw['_error']]);
            exit;
        }
        
        $indexers = [];
        if (is_array($raw)) {
            foreach ($raw as $idx) {
                $indexers[] = [
                    'id' => $idx['id'],
                    'name' => $idx['title'] ?? $idx['id'],
                    'enable' => !empty($idx['configured']),
                    'protocol' => 'torrent',
                    'privacy' => t('word_unknown')
                ];
            }
        }
    } else {
        $indexers = prowlarr_request($app, 'indexer');
        if (isset($indexers['_error'])) {
            echo json_encode(['error' => t('err_prowlarr_unreachable')]);
            exit;
        }
    }

    echo json_encode([
        'success' => true,
        'indexers' => $indexers
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ── PROWLARR : LISTE DES CATÉGORIES ───────────────────────────────────────────
if ($action === 'prowlarr_categories') {
    require_auth();
    $cfg = load_config();
    $prowlarr = find_app_by_driver($cfg, 'indexer');
    if (!$prowlarr) { echo json_encode(['error' => t('err_prowlarr_not_configured')]); exit; }

    $categories = arr_get($prowlarr, '/api/v1/indexerCategory');
    if (isset($categories['_error'])) { echo json_encode(['error' => $categories['_error']]); exit; }

    echo json_encode(['success' => true, 'categories' => $categories]);
    exit;
}

// ── PROWLARR / JACKETT : RECHERCHE MANUELLE ───────────────────────────────────
if ($action === 'prowlarr_search') {
    require_auth();
    $cfg = load_config();
    $app = find_app_by_driver($cfg, 'indexer');
    if (!$app) { echo json_encode(['error' => t('err_indexer_not_configured')]); exit; }

    $query = trim($_GET['query'] ?? '');
    $indexer = $_GET['indexer'] ?? '0';
    $category = (int)($_GET['category'] ?? 0);

    require_once __DIR__ . '/drivers/indexer.php';
    $client = $app['client'] ?? 'prowlarr';

    if ($client === 'jackett') {
        $idx_path = ($indexer !== '0' && !empty($indexer)) ? $indexer : 'all';
        $endpoint = "indexers/{$idx_path}/results";
        
        $params = [];
        if (!empty($query)) {
            $params[] = "Query=" . urlencode($query);
        }
        if ($category > 0) {
            // Jackett n'accepte pas de crochets, juste Category=
            $params[] = "Category=" . $category;
        }
        
        if (count($params) > 0) {
            $endpoint .= "?" . implode("&", $params);
        }

        $raw = jackett_request($app, $endpoint);
        if (isset($raw['_error'])) { echo json_encode(['error' => $raw['_error']]); exit; }

        $results = [];
        foreach ($raw['Results'] ?? [] as $res) {
            $ageHours = 0;
            if (!empty($res['PublishDate'])) {
                $ageHours = max(0, (time() - strtotime($res['PublishDate'])) / 3600);
            }
            
            $results[] = [
                'title' => $res['Title'] ?? 'Inconnu',
                'indexer' => $res['Tracker'] ?? 'Jackett',
                'size' => $res['Size'] ?? 0,
                'seeders' => $res['Seeders'] ?? 0,
                'leechers' => $res['Peers'] ? max(0, $res['Peers'] - ($res['Seeders'] ?? 0)) : 0,
                'magnetUrl' => $res['MagnetUri'] ?? '',
                'downloadUrl' => $res['Link'] ?? '',
                'infoUrl' => $res['Details'] ?? '',
                'age' => $ageHours
            ];
        }
    } else {
        // Logique Prowlarr
        $endpoint = "search";
        $params = [];
        if (!empty($query)) {
            $params[] = "query=" . urlencode($query);
        }
        if ($indexer > 0) {
            $params[] = "indexerIds=" . $indexer;
        }
        if ($category > 0) {
            $params[] = "categories=" . $category;
        }
        
        if (count($params) > 0) {
            $endpoint .= "?" . implode("&", $params);
        }

        $results = prowlarr_request($app, $endpoint);
        if (isset($results['_error'])) { echo json_encode(['error' => $results['_error']]); exit; }
    }

    echo json_encode(['success' => true, 'results' => $results]);
    exit;
}



// ── OMNISEARCH (RECHERCHE GLOBALE) ─────────────────────────────────────────
if ($action === 'omnisearch') {
    require_auth();
    $cfg = load_config();
    $q = rawurlencode(trim($_GET['q'] ?? ''));
    $results = ['movies' => [], 'series' => [], 'debug' => []];

    if (strlen($q) >= 2) {
        $call_api = function($app, $endpoint) use (&$results) {
            // 🌟 CORRECTION ICI : api_key avec un tiret du bas !
            if (!$app || empty($app['url']) || empty($app['api_key'])) {
                $results['debug'][] = ($app['name'] ?? 'Service') . " : URL ou Clé API non configurée.";
                return [];
            }

            $base_url = $app['url'];
            if (!preg_match("~^(?:f|ht)tps?://~i", $base_url)) $base_url = "http://" . $base_url;

                // 🌟 CORRECTION ICI AUSSI : On utilise bien $app['api_key']
                $url = rtrim($base_url, '/') . $endpoint . "&apiKey=" . $app['api_key'];

            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 4);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

            $res = curl_exec($ch);
            $err = curl_error($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($err || $code !== 200) {
                $results['debug'][] = "Erreur sur " . ($app['name'] ?? 'Service') . " -> Code HTTP: $code | cURL: " . ($err ?: "Aucune erreur curl");
                return [];
            }

            return $res ? json_decode($res, true) : [];
        };

        // On cherche Radarr et Sonarr
        $radarr = null; $sonarr = null;
        foreach ($cfg['apps'] as $a) {
            if (($a['driver'] ?? '') === 'radarr') $radarr = $a;
            if (($a['driver'] ?? '') === 'sonarr') $sonarr = $a;
        }

        $movies = $call_api($radarr, "/api/v3/movie/lookup?term=$q");
        $series = $call_api($sonarr, "/api/v3/series/lookup?term=$q");

        $results['movies'] = is_array($movies) && !isset($movies['message']) ? array_slice($movies, 0, 4) : [];
        $results['series'] = is_array($series) && !isset($series['message']) ? array_slice($series, 0, 4) : [];
    }

    echo json_encode(['success' => true, 'data' => $results]);
    exit;
}

// ── GESTION DOCKER : LOGS (50 dernières lignes) ───────────────────────────────
if ($action === 'docker_logs') {
    require_auth();
    $cfg = load_config();
    $docker = find_app_by_driver($cfg, 'docker');
    if (!$docker) { echo json_encode(['error' => t('err_docker_app_not_configured')]); exit; }

    $containerId = preg_replace('/[^a-zA-Z0-9_.-]/', '', $_GET['id'] ?? '');
    $socketPath = $docker['url'] ?? '/var/run/docker.sock';

    // On demande stdout et stderr, limités aux 50 dernières lignes
    $ch = curl_init("http://localhost/containers/{$containerId}/logs?stdout=true&stderr=true&tail=50");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_UNIX_SOCKET_PATH => $socketPath,
        CURLOPT_TIMEOUT => 5
    ]);
    $res = curl_exec($ch);
    curl_close($ch);

    // Docker renvoie un flux brut avec 8 octets d'en-tête binaire par ligne.
    // Cette petite expression régulière nettoie le texte pour le rendre lisible :
    $clean_logs = preg_replace('/^[\x00-\x02]\x00\x00\x00[\x00-\xFF]{4}/m', '', $res);
    $clean_logs = htmlspecialchars(trim($clean_logs));

    echo json_encode(['success' => true, 'logs' => $clean_logs]);
    exit;
}

// ── GESTION DOCKER : STATISTIQUES (CPU & RAM) ─────────────────────────────────
if ($action === 'docker_stats') {
    require_auth();
    $cfg = load_config();
    $docker = find_app_by_driver($cfg, 'docker');
    if (!$docker) { echo json_encode(['error' => t('err_docker_app_not_configured')]); exit; }

    $containerId = preg_replace('/[^a-zA-Z0-9_.-]/', '', $_GET['id'] ?? '');
    $socketPath = $docker['url'] ?? '/var/run/docker.sock';

    // On demande un "snapshot" des stats (stream=false)
    $ch = curl_init("http://localhost/containers/{$containerId}/stats?stream=false");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_UNIX_SOCKET_PATH => $socketPath,
        CURLOPT_TIMEOUT => 5
    ]);
    $res = curl_exec($ch);
    curl_close($ch);

    $stats = json_decode($res, true);
    if (!$stats || isset($stats['message'])) {
        echo json_encode(['error' => t('err_stats_read_failed')]); exit;
    }

    // Calcul complexe de Docker pour obtenir le pourcentage CPU exact
    $cpuDelta = ($stats['cpu_stats']['cpu_usage']['total_usage'] ?? 0) - ($stats['precpu_stats']['cpu_usage']['total_usage'] ?? 0);
    $sysDelta = ($stats['cpu_stats']['system_cpu_usage'] ?? 0) - ($stats['precpu_stats']['system_cpu_usage'] ?? 0);
    $cpus = $stats['cpu_stats']['online_cpus'] ?? 1;
    $cpuPercent = ($sysDelta > 0 && $cpuDelta > 0) ? round(($cpuDelta / $sysDelta) * $cpus * 100, 2) : 0;

    // Calcul de la RAM
    $memUsage = $stats['memory_stats']['usage'] ?? 0;
    if (isset($stats['memory_stats']['stats']['cache'])) {
        $memUsage -= $stats['memory_stats']['stats']['cache']; // On retire le cache pour la vraie conso
    }
    $memLimit = $stats['memory_stats']['limit'] ?? 0;
    $memPercent = ($memLimit > 0) ? round(($memUsage / $memLimit) * 100, 2) : 0;

    $formatSize = function($bytes) {
        if ($bytes >= 1073741824) return round($bytes / 1073741824, 2) . ' Go';
        if ($bytes >= 1048576) return round($bytes / 1048576, 2) . ' Mo';
        return round($bytes / 1024, 2) . ' Ko';
    };

    echo json_encode([
        'success' => true,
        'cpu' => $cpuPercent,
        'ram' => $memPercent,
        'ram_used' => $formatSize($memUsage),
                     'ram_limit' => $formatSize($memLimit)
    ]);
    exit;
}

// ── SAUVEGARDE & RESTAURATION (BACKUP) ────────────────────────────────────────
if ($action === 'export_backup') {
    require_auth();
    $cfg = load_config();

    // On récupère les préférences du navigateur (thème, etc.) envoyées par le JS
    $frontend_prefs = isset($_POST['prefs']) ? json_decode($_POST['prefs'], true) : [];

    $backup = [
        'version' => '1.0',
        'date' => date('Y-m-d H:i:s'),
        'backend' => $cfg,
        'frontend' => $frontend_prefs
    ];

    // On force le navigateur à télécharger le fichier
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
        echo json_encode(['error' => 'Fichier de sauvegarde invalide ou corrompu']);
        exit;
    }

    // 1. On restaure la configuration côté serveur
    save_config($backup['backend']);

    // 2. On renvoie les préférences d'affichage au JS pour qu'il les restaure
    echo json_encode([
        'ok' => true,
        'frontend' => $backup['frontend'] ?? []
    ]);
    exit;
}

// ── EXPORT DE LISTE (IMDb IDs) ────────────────────────────────────────────────
if ($action === 'export_media_list') {
    require_auth();
    $cfg = load_config();
    $type = $_GET['type'] ?? 'movie';
    
    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }
    
    $endpoint = $type === 'movie' ? '/api/v3/movie' : '/api/v3/series';
    $library = arr_get($app, $endpoint);
    
    if (isset($library['_error'])) { echo json_encode(['error' => $library['_error']]); exit; }
    
    $list = [];
    foreach ($library as $item) {
        if (!empty($item['imdbId'])) {
            $title = $item['title'] ?? 'Inconnu';
            // Ajoute le titre entre parenthèses
            $list[] = $item['imdbId'] . ' (' . $title . ')';
        }
    }
    
    echo json_encode(['ok' => true, 'text' => implode("\n", $list), 'count' => count($list)]);
    exit;
}

echo json_encode(['error' => 'Action inconnue: ' . $action]);
