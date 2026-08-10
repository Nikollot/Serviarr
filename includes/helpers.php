<?php
// ===== Serviarr - helpers.php (bootstrap: CORS, session, lang, fonctions utilitaires) =====

// 🌟 AUTORISATIONS CORS (Pour l'application mobile Capacitor)
if (isset($_SERVER['HTTP_ORIGIN'])) {
    // Autorise dynamiquement l'application mobile (qui n'a pas le même nom de domaine)
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    // Autorise le passage des cookies de session
    header('Access-Control-Allow-Credentials: true');
}

header("Access-Control-Allow-Methods: GET, POST, OPTIONS");

header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");


// Si le téléphone fait une requête de pré-vérification (OPTIONS), on valide immédiatement
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit;
}


use Minishlink\WebPush\WebPush;

use Minishlink\WebPush\Subscription;


// 🔒 Cookie de session : SameSite=Lax empêche l'envoi du cookie depuis un site tiers (protection CSRF)
$_is_https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
|| strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';

session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'secure'   => $_is_https,
    'httponly' => true,
    'samesite' => 'Lax',
]);

session_start();


ini_set('memory_limit', '512M');

set_time_limit(300);

error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE);

header('Content-Type: application/json');

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

header('Pragma: no-cache');


// ── MOTEUR DE LANGUE POUR L'API ──
$lang = $_COOKIE['serviarr_lang'] ?? 'fr';

$lang_file = APP_ROOT . "/lang/{$lang}.json";


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


// ── TMDB : langue/région dynamiques ──
function tmdb_lang_code() {
    global $lang;
    $map = [
        'fr' => 'fr-FR', 'en' => 'en-US', 'es' => 'es-ES', 'de' => 'de-DE',
        'it' => 'it-IT', 'zh' => 'zh-CN', 'ja' => 'ja-JP',
    ];
    return $map[$lang] ?? 'fr-FR';
}

function tmdb_region_code() {
    global $lang;
    $map = [
        'fr' => 'FR', 'en' => 'US', 'es' => 'ES', 'de' => 'DE',
        'it' => 'IT', 'zh' => 'CN', 'ja' => 'JP',
    ];
    return $map[$lang] ?? 'FR';
}

$TMDB_LANG   = tmdb_lang_code();

$TMDB_REGION = tmdb_region_code();


$config_file = APP_ROOT . '/data/config.json';


function load_config() {
    global $config_file, $_config_cache;
    if (isset($_config_cache)) return $_config_cache;
    if (!file_exists($config_file)) return $_config_cache = ['apps' => [], 'user' => null];
    return $_config_cache = json_decode(file_get_contents($config_file), true) ?? ['apps' => [], 'user' => null];
}


function save_config($cfg) {
    global $config_file, $_config_cache;
    $_config_cache = $cfg;
    return file_put_contents($config_file, json_encode($cfg, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) !== false;
}


function get_webhook_token() {
    $cfg = load_config();
    if (empty($cfg['webhook_token'])) {
        $cfg['webhook_token'] = bin2hex(random_bytes(24));
        save_config($cfg);
    }
    return $cfg['webhook_token'];
}


// ── JOURNAL D'ACTIVITÉ ──
$activity_log_file = APP_ROOT . '/data/activity_log.jsonl';

const ACTIVITY_LOG_MAX_LINES = 500;


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

    if (file_exists($activity_log_file) && filesize($activity_log_file) > 0) {
        $lines = file($activity_log_file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines !== false && count($lines) > ACTIVITY_LOG_MAX_LINES) {
            $trimmed = array_slice($lines, -ACTIVITY_LOG_MAX_LINES);
            @file_put_contents($activity_log_file, implode("\n", $trimmed) . "\n", LOCK_EX);
        }
    }
}


// ── PROTECTION ANTI-BRUTE-FORCE ──
$lockout_file = APP_ROOT . '/data/lockout.json';

const LOCKOUT_MAX_ATTEMPTS = 5;

const LOCKOUT_DURATION = 300;


function get_client_ip() { return $_SERVER['REMOTE_ADDR'] ?? 'unknown'; }


function load_lockout_data() {
    global $lockout_file;
    if (!file_exists($lockout_file)) return [];
    return json_decode(file_get_contents($lockout_file), true) ?? [];
}


function save_lockout_data($data) {
    global $lockout_file;
    file_put_contents($lockout_file, json_encode($data), LOCK_EX);
}


function check_lockout($key) {
    $data = load_lockout_data();
    $entry = $data[$key] ?? null;
    if (!$entry) return 0;
    if (($entry['attempts'] ?? 0) >= LOCKOUT_MAX_ATTEMPTS) {
        $remaining = ($entry['locked_at'] ?? 0) + LOCKOUT_DURATION - time();
        if ($remaining > 0) return $remaining;
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
    session_write_close();
}


// ── FONCTIONS DE GÉNÉRATION ET MISE À JOUR DES CACHES ─────────────────────────
function generate_movies_cache() {
    $cfg = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    if (!$radarr) return 'Radarr non configuré';
    $data = arr_get($radarr, '/api/v3/movie');
    if (isset($data['_error'])) return $data['_error'];

    $base_url = rtrim($radarr['url'], '/');
    $all_movies = [];
    foreach ($data as $mv) {
        $poster = null;
        $fanart = null;
        foreach ($mv['images'] ?? [] as $img) {
            if ($img['coverType'] === 'poster') {
                $poster = $base_url . '/api/v3/mediacover/' . $mv['id'] . '/poster-250.jpg?apikey=' . $radarr['api_key'];
            }
            if ($img['coverType'] === 'fanart') {
                $fanart = $base_url . '/api/v3/mediacover/' . $mv['id'] . '/fanart.jpg?apikey=' . $radarr['api_key'];
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
            'fanart'         => $fanart,
            'runtime'        => $mv['runtime'] ?? 0,
            'overview'       => substr($mv['overview'] ?? '', 0, 150),
            'sizeOnDisk'     => round(($mv['movieFile']['size'] ?? 0) / 1073741824, 2),
            'added'          => substr($mv['added'] ?? '', 0, 10),
            'collectionTitle'=> $mv['collection']['title'] ?? null,
        ];
    }
    file_put_contents(APP_ROOT . '/data/.cache_library_movies.json', json_encode($all_movies, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_IGNORE));
    return true;
}


function generate_series_cache() {
    $cfg = load_config();
    $sonarr = find_app_by_driver($cfg, 'sonarr');
    if (!$sonarr) return 'Sonarr non configuré';
    $data = arr_get($sonarr, '/api/v3/series');
    if (isset($data['_error'])) return $data['_error'];

    $base_url = rtrim($sonarr['url'], '/');
    $all_series = [];
    foreach ($data as $s) {
        $pct = round($s['statistics']['percentOfEpisodes'] ?? 0);
        $poster = $base_url . '/api/v3/mediacover/' . $s['id'] . '/poster-250.jpg?apikey=' . $sonarr['api_key'];
        $fanart = $base_url . '/api/v3/mediacover/' . $s['id'] . '/fanart.jpg?apikey=' . $sonarr['api_key'];

        $all_series[] = [
            'id'         => $s['id'],
            'tvdbId'     => $s['tvdbId'] ?? null,
            'tmdbId'     => $s['tmdbId'] ?? null,
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
            'fanart'     => $fanart,
            'overview'   => substr($s['overview'] ?? '', 0, 150),
            'added'      => substr($s['added'] ?? '', 0, 10),
            'nextAiring' => substr($s['nextAiring'] ?? '', 0, 10),
        ];
    }
    file_put_contents(APP_ROOT . '/data/.cache_library_series.json', json_encode($all_series, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_IGNORE));
    return true;
}


function clear_media_caches($type = 'all') {
    $cache_dir = APP_ROOT . '/data/';
    if ($type === 'movie' || $type === 'all') {
        @unlink($cache_dir . '.cache_movies_dashboard.json');
        @unlink($cache_dir . '.cache_library_movies.json'); // On supprime juste le fichier
    }
    if ($type === 'serie' || $type === 'all') {
        @unlink($cache_dir . '.cache_series_dashboard.json');
        @unlink($cache_dir . '.cache_library_series.json'); // Pareil ici
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


function find_app_by_driver($cfg, $driver) {
    foreach ($cfg['apps'] ?? [] as $app) {
        if (($app['driver'] ?? '') === $driver && ($app['enabled'] ?? true)) return $app;
    }
    return null;
}


// ── FONCTIONS HTTP ──
function http_get($url, $headers = []) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 300,
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
        CURLOPT_TIMEOUT        => 300,
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


// ── FONCTION POUR RÉCUPÉRER LE TRAILER YOUTUBE VIA TMDB ──
function get_tmdb_trailer($type, $tmdb_id) {
    $cfg = load_config();
    $api_key = $cfg['tmdb_api_key'] ?? '';
    if (!$api_key || !$tmdb_id) return null;
    global $TMDB_LANG;

    $url = "https://api.themoviedb.org/3/{$type}/{$tmdb_id}/videos?api_key={$api_key}&language={$TMDB_LANG}";
    $data = http_get_secure($url);

    $trailer = null;
    if (!isset($data['_error']) && !empty($data['results'])) {
        foreach ($data['results'] as $v) {
            if (($v['site'] ?? '') === 'YouTube' && ($v['type'] ?? '') === 'Trailer') {
                $trailer = $v['key'];
                break;
            }
        }
    }

    if (!$trailer && $TMDB_LANG !== 'en-US') {
        $url_en = "https://api.themoviedb.org/3/{$type}/{$tmdb_id}/videos?api_key={$api_key}&language=en-US";
        $data_en = http_get_secure($url_en);
        if (!isset($data_en['_error']) && !empty($data_en['results'])) {
            foreach ($data_en['results'] as $v) {
                if (($v['site'] ?? '') === 'YouTube' && ($v['type'] ?? '') === 'Trailer') {
                    $trailer = $v['key'];
                    break;
                }
            }
        }
    }
    return $trailer;
}
