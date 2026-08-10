<?php
// ===== Serviarr - api-torrents.php =====

// --- Fonctions clients qBittorrent ---


// ── TORRENT CLIENTS ───────────────────────────────────────────────────────────
// ... transmission_rpc and qbt_* functions are exactly as you need them ...
function transmission_rpc($app, $method, $arguments = [], $sessionId = '') {
    $url     = rtrim($app['url'], '/') . '/transmission/rpc';
    $payload = json_encode(['method' => $method, 'arguments' => $arguments]);
    $headers = ['Content-Type: application/json'];
    if (!empty($app['username'])) $headers[] = 'Authorization: Basic ' . base64_encode($app['username'] . ':' . ($app['password'] ?? ''));
    if ($sessionId !== '') $headers[] = 'X-Transmission-Session-Id: ' . $sessionId;

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => $headers, CURLOPT_TIMEOUT => 10, CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_HEADER => true,
    ]);
    $raw      = curl_exec($ch);
    $httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $hsize    = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);

    if ($httpcode === 409) {
        $headers_raw = substr($raw, 0, $hsize);
        if (preg_match('/X-Transmission-Session-Id:\s*(\S+)/i', $headers_raw, $m)) {
            return transmission_rpc($app, $method, $arguments, trim($m[1]));
        }
        return ['result' => 'error', '_error' => t('err_session_id_failed')];
    }
    return json_decode(substr($raw, $hsize), true) ?? ['result' => 'error', '_error' => 'Invalid JSON'];
}



function qbt_login($app) {
    static $sid_cache = [];
    $cache_key = $app['url'] ?? '';
    if (isset($sid_cache[$cache_key])) return $sid_cache[$cache_key];

    $base_url = rtrim($app['url'], '/');
    $url = $base_url . '/api/v2/auth/login';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query(['username' => $app['username'] ?? '', 'password' => $app['password'] ?? '']),
                      CURLOPT_HTTPHEADER => ['Referer: ' . $base_url, 'Origin: ' . $base_url],
                      CURLOPT_HEADER => true, CURLOPT_TIMEOUT => 8, CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $raw = curl_exec($ch);
    $hsize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $curl_err = curl_error($ch);
    curl_close($ch);

    if ($curl_err) return $sid_cache[$cache_key] = ['_error' => 'Connexion impossible : ' . $curl_err];
    if (preg_match('/Set-Cookie:\s*(SID=[^;]+)/i', substr($raw, 0, $hsize), $m)) return $sid_cache[$cache_key] = trim($m[1]);
    $body = trim(substr($raw, $hsize));
    if ($body === 'Ok.') return $sid_cache[$cache_key] = 'bypass_local_auth';
    return $sid_cache[$cache_key] = ['_error' => t('err_qbt_auth_refused') . ($body ? " ({$body})" : '')];
}



function qbt_request($app, $endpoint, $post_fields = null) {
    $headers = [];
    $api_key = $app['api_key'] ?? '';
    if (empty($api_key) && strpos($app['password'] ?? '', 'qbt_') === 0) $api_key = $app['password'];
    if (empty($api_key) && strpos($app['username'] ?? '', 'qbt_') === 0) $api_key = $app['username'];

    if (!empty($api_key)) { $headers[] = 'Authorization: Bearer ' . trim($api_key); }
    else {
        $sid = qbt_login($app);
        if (!$sid) return ['_error' => t('err_qbt_auth_failed')];
        $headers[] = 'Cookie: ' . $sid;
    }

    $ch = curl_init(rtrim($app['url'], '/') . '/api/v2/' . ltrim($endpoint, '/'));
    $opts = [CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers, CURLOPT_TIMEOUT => 10, CURLOPT_SSL_VERIFYPEER => false];
    if ($post_fields !== null) { $opts[CURLOPT_POST] = true; $opts[CURLOPT_POSTFIELDS] = is_array($post_fields) ? http_build_query($post_fields) : $post_fields; }
    curl_setopt_array($ch, $opts);
    $raw = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code === 403) return ['_error' => t('err_qbt_session_expired')];
    $decoded = json_decode($raw, true);
    return $decoded !== null ? $decoded : $raw;
}



function qbt_map_state($state) {
    $map = [
        'pausedDL' => 0, 'pausedUP' => 0, 'checkingDL' => 2, 'checkingUP' => 2, 'checkingResumeData' => 2,
        'queuedDL' => 3, 'downloading' => 4, 'forcedDL' => 4, 'metaDL' => 4, 'stalledDL' => 4, 'allocating' => 4,
        'queuedUP' => 5, 'uploading' => 6, 'forcedUP' => 6, 'stalledUP' => 6, 'moving' => 6,
    ];
    return $map[$state] ?? 0;
}



function qbt_get_torrents($app) {
    $torrents = qbt_request($app, 'torrents/info');
    if (!is_array($torrents)) return ['_error' => t('err_qbt_invalid_response')];
    if (isset($torrents['_error'])) return $torrents;

    $result = [];
    foreach ($torrents as $t) {
        $isErrorState = in_array($t['state'] ?? '', ['error', 'missingFiles'], true);
        $result[] = [
            'id' => $t['hash'], 'name' => $t['name'] ?? '?', 'status' => qbt_map_state($t['state'] ?? ''),
            'percentDone' => $t['progress'] ?? 0, 'rateDownload' => $t['dlspeed'] ?? 0, 'rateUpload' => $t['upspeed'] ?? 0,
            'totalSize' => $t['size'] ?? 0, 'errorString' => $isErrorState ? ($t['state'] ?? 'Erreur') : '',
            'uploadRatio' => $t['ratio'] ?? 0, 'uploadedEver' => $t['uploaded'] ?? 0, 'downloadedEver' => $t['downloaded'] ?? 0,
            'peersConnected' => ($t['num_seeds'] ?? 0) + ($t['num_leechs'] ?? 0), 'peersSendingToUs' => $t['num_seeds'] ?? 0,
            'peersGettingFromUs' => $t['num_leechs'] ?? 0, 'eta' => ($t['eta'] ?? -1) >= 8640000 ? -1 : ($t['eta'] ?? -1),
            'addedDate' => $t['added_on'] ?? 0, 'trackers' => !empty($t['tracker']) ? [['announce' => $t['tracker']]] : [],
            'files' => [], 'fileStats' => [],
        ];
    }
    return $result;
}



function qbt_get_torrent_files($app, $hash) {
    $files = qbt_request($app, 'torrents/files?hash=' . urlencode($hash));
    if (!is_array($files) || isset($files['_error'])) return ['files' => [], 'fileStats' => []];

    $out_files = []; $out_stats = [];
    foreach ($files as $f) {
        $out_files[] = ['name' => $f['name'] ?? '', 'length' => $f['size'] ?? 0];
        $out_stats[] = ['wanted' => ($f['priority'] ?? 1) !== 0, 'bytesCompleted' => (int) round(($f['size'] ?? 0) * ($f['progress'] ?? 0)), 'priority' => $f['priority'] ?? 1];
    }
    return ['files' => $out_files, 'fileStats' => $out_stats];
}



function qbt_torrent_action($app, $method, $hashes, $deleteFiles = false) {
    $hashes_str = implode('|', $hashes);
    switch ($method) {
        case 'torrent-start': qbt_request($app, 'torrents/resume', ['hashes' => $hashes_str]); return true;
        case 'torrent-stop': qbt_request($app, 'torrents/pause', ['hashes' => $hashes_str]); return true;
        case 'torrent-remove': qbt_request($app, 'torrents/delete', ['hashes' => $hashes_str, 'deleteFiles' => $deleteFiles ? 'true' : 'false']); return true;
        default: return false;
    }
}



function qbt_set_files($app, $hash, $wanted_indexes, $unwanted_indexes) {
    if (!empty($wanted_indexes)) qbt_request($app, 'torrents/filePrio', ['hash' => $hash, 'id' => implode('|', $wanted_indexes), 'priority' => 1]);
    if (!empty($unwanted_indexes)) qbt_request($app, 'torrents/filePrio', ['hash' => $hash, 'id' => implode('|', $unwanted_indexes), 'priority' => 0]);
    return true;
}



function qbt_add_torrent($app, $magnet_url = null, $file_path = null) {
    $headers = [];
    $api_key = $app['api_key'] ?? '';
    if (empty($api_key) && strpos($app['password'] ?? '', 'qbt_') === 0) $api_key = $app['password'];
    if (empty($api_key) && strpos($app['username'] ?? '', 'qbt_') === 0) $api_key = $app['username'];

    if (!empty($api_key)) { $headers[] = 'Authorization: Bearer ' . trim($api_key); }
    else {
        $sid = qbt_login($app);
        if (!$sid) return false;
        $headers[] = 'Cookie: ' . $sid;
    }

    $post_fields = [];
    if ($file_path) { $post_fields['torrents'] = new CURLFile($file_path, 'application/x-bittorrent', 'upload.torrent'); }
    elseif ($magnet_url) { $post_fields['urls'] = $magnet_url; }
    else { return false; }

    $ch = curl_init(rtrim($app['url'], '/') . '/api/v2/torrents/add');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $post_fields,
        CURLOPT_HTTPHEADER => $headers, CURLOPT_TIMEOUT => 20, CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $code === 200 && trim($res) === 'Ok.';
}

// --- Actions API ---


if ($action === 'get_downloads') {
    require_auth();
    $cfg = load_config();
    $trans = find_app_by_driver($cfg, 'download');
    if (!$trans) { echo json_encode(['error' => t('err_download_app_not_configured')]); exit; }

    $client = $trans['client'] ?? 'transmission';

    if ($client === 'qbittorrent') {
        $result = qbt_get_torrents($trans);
        if (isset($result['_error'])) { echo json_encode(['error' => $result['_error']]); }
        else { echo json_encode(['torrents' => $result]); }
        exit;
    }

    $res = transmission_rpc($trans, 'torrent-get', [
        'fields' => [
            'id', 'name', 'status', 'percentDone', 'rateDownload', 'rateUpload',
            'totalSize', 'errorString', 'uploadRatio', 'uploadedEver', 'downloadedEver',
            'peersConnected', 'peersSendingToUs', 'peersGettingFromUs',
            'eta', 'addedDate', 'trackers', 'files', 'fileStats'
        ]
    ]);
    $torrents = $res['arguments']['torrents'] ?? [];
    foreach ($torrents as &$tor) { $tor['id'] = (string) $tor['id']; }
    echo json_encode(['torrents' => $torrents]);
    exit;
}



if ($action === 'torrent_action') {
    require_auth();
    $cfg = load_config();
    $trans = find_app_by_driver($cfg, 'download');
    if (!$trans) { echo json_encode(['error' => t('err_download_app_not_configured')]); exit; }

    $client = $trans['client'] ?? 'transmission';
    $method = $_POST['method'] ?? '';
    $deleteFiles = filter_var($_POST['delete-local-data'] ?? false, FILTER_VALIDATE_BOOLEAN);

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
        if ($ok && $ids !== null && count($ids) > 1) { log_activity('bulk_torrent', 'torrent', null, count($ids) . ' torrent(s) — ' . $method); }
        echo json_encode(['ok' => $ok]);
        exit;
    }

    $args = [];
    if ($ids !== null) $args['ids'] = array_map('intval', $ids);
    if ($method === 'torrent-remove') $args['delete-local-data'] = $deleteFiles;

    $res = transmission_rpc($trans, $method, $args);
    $ok = ($res['result'] ?? '') === 'success';

    if ($ok && isset($args['ids']) && count($args['ids']) > 1) {
        log_activity('bulk_torrent', 'torrent', null, count($args['ids']) . ' torrent(s) — ' . $method);
    }
    echo json_encode(['ok' => $ok]);
    exit;
}



if ($action === 'get_torrent_files') {
    require_auth();
    $cfg = load_config();
    $trans = find_app_by_driver($cfg, 'download');
    if (!$trans) { echo json_encode(['error' => t('err_download_app_not_configured')]); exit; }

    $client = $trans['client'] ?? 'transmission';
    $id = $_GET['id'] ?? '';

    if ($client === 'qbittorrent') { echo json_encode(qbt_get_torrent_files($trans, $id)); exit; }

    $res = transmission_rpc($trans, 'torrent-get', ['ids' => [(int) $id], 'fields' => ['files', 'fileStats']]);
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

    $args = ['ids' => [(int) $id]];
    if (!empty($wanted)) $args['files-wanted'] = $wanted;
    if (!empty($unwanted)) $args['files-unwanted'] = $unwanted;

    $res = transmission_rpc($trans, 'torrent-set', $args);
    echo json_encode(['ok' => ($res['result'] ?? '') === 'success']);
    exit;
}



if ($action === 'add_torrent') {
    require_auth();
    $cfg = load_config();
    $trans = find_app_by_driver($cfg, 'download');
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
        $result = $has_file ? qbt_add_torrent($trans, null, $_FILES['torrent_file']['tmp_name']) : qbt_add_torrent($trans, $magnet_link, null);
        if ($is_share) { header('Location: /'); exit; }

        if ($result === true) {
            log_activity('add_torrent', 'torrent', null, $has_file ? t('torrent_file_label') : $magnet_link);
            echo json_encode(['ok' => true]);
        } else {
            echo json_encode(['error' => is_string($result) ? $result : 'Erreur lors de l\'ajout']);
        }
        exit;
    }

    $args = [];
    if ($has_file) { $args['metainfo'] = base64_encode(file_get_contents($_FILES['torrent_file']['tmp_name'])); }
    else { $args['filename'] = $magnet_link; }

    $res = transmission_rpc($trans, 'torrent-add', $args);

    if ($is_share) { header('Location: /'); exit; }
    else {
        if (isset($res['result']) && $res['result'] === 'success') {
            if (isset($res['arguments']['torrent-duplicate'])) {
                echo json_encode(['error' => t('err_torrent_duplicate')]);
            } else {
                $torrent_name = $res['arguments']['torrent-added']['name'] ?? $res['arguments']['torrent-duplicate']['name'] ?? (isset($args['metainfo']) ? 'Fichier .torrent' : ($args['filename'] ?? '?'));
                log_activity('add_torrent', 'torrent', null, $torrent_name);
                echo json_encode(['ok' => true]);
            }
        } else {
            echo json_encode(['error' => $res['result'] ?? 'Erreur lors de l\'ajout']);
        }
        exit;
    }
}
