<?php
// Driver: Download (Multi-support)
// Supported clients: transmission, qbittorrent, deluge, utorrent

function download_fields() {
    return [
        ['key' => 'client', 'label' => 'Logiciel de Téléchargement', 'type' => 'select', 'options' => [
            ['value' => 'transmission', 'label' => 'Transmission'],
            ['value' => 'qbittorrent', 'label' => 'qBittorrent'],
        ]],
        ['key' => 'url',      'label' => 'URL', 'type' => 'text', 'placeholder' => 'http://192.168.1.x:9091'],
        ['key' => 'username', 'label' => 'Utilisateur', 'type' => 'text', 'placeholder' => 'admin (laisser vide si Clé API)'],
        ['key' => 'password', 'label' => 'Mot de passe', 'type' => 'password', 'placeholder' => 'password (laisser vide si Clé API)'],
        ['key' => 'api_key',  'label' => 'Clé API (qBittorrent >= 5.2.0)', 'type' => 'text', 'placeholder' => 'qbt_...'],
    ];
}

function download_status($cfg) {
    $client = $cfg['client'] ?? 'transmission';

    switch ($client) {
        case 'transmission': return _status_transmission($cfg);
        case 'qbittorrent':  return _status_qbittorrent($cfg);
        case 'deluge':       return _status_deluge($cfg);
        case 'utorrent':     return _status_utorrent($cfg);
        default:             return ['ok' => false, 'error' => 'Client non supporté'];
    }
}

/* ── TRANSMISSION ── */
function transmission_do_rpc($cfg, $method, $arguments = []) {
    $url = rtrim($cfg['url'], '/') . '/transmission/rpc';
    $payload = json_encode(['method' => $method, 'arguments' => $arguments]);
    $headers = ['Content-Type: application/json'];

    if (!empty($cfg['session_id'])) { $headers[] = 'X-Transmission-Session-Id: ' . $cfg['session_id']; }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => $headers, CURLOPT_TIMEOUT => 8, CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_HEADER => true,
    ]);
    if (!empty($cfg['username'])) { curl_setopt($ch, CURLOPT_USERPWD, $cfg['username'] . ':' . ($cfg['password'] ?? '')); }

    $raw = curl_exec($ch); $httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE); $hsize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);

    if ($httpcode === 409) {
        $headers_raw = substr($raw, 0, $hsize);
        if (preg_match('/X-Transmission-Session-Id:\s*(\S+)/i', $headers_raw, $m)) {
            $cfg['session_id'] = trim($m[1]);
            return transmission_do_rpc($cfg, $method, $arguments);
        }
    }
    $body = substr($raw, $hsize);
    return json_decode($body, true) ?? ['result' => 'error'];
}

function trans_format_speed($bps) {
    if ($bps >= 1048576) return round($bps / 1048576, 1) . ' MB/s';
    if ($bps >= 1024)    return round($bps / 1024, 1) . ' KB/s';
    return $bps . ' B/s';
}

function _status_transmission($cfg) {
    $res = transmission_do_rpc($cfg, 'torrent-get', [
        'fields' => ['name', 'status', 'percentDone', 'rateDownload', 'rateUpload', 'totalSize', 'error']
    ]);

    if (!isset($res['arguments']['torrents'])) { return ['ok' => false, 'error' => function_exists('t') ? t('trans_conn_failed') : 'Échec connexion']; }

    $torrents = $res['arguments']['torrents'];
    $status_map = [
        0 => function_exists('t') ? t('trans_stopped') : 'Arrêté',
        1 => function_exists('t') ? t('trans_check_wait') : 'Attente vérif.',
        2 => function_exists('t') ? t('trans_checking') : 'Vérification',
        3 => function_exists('t') ? t('trans_dl_wait') : 'Attente DL',
        4 => function_exists('t') ? t('trans_downloading') : 'Téléchargement',
        5 => function_exists('t') ? t('trans_seed_wait') : 'Attente Seed',
        6 => function_exists('t') ? t('trans_seeding') : 'Seeding',
    ];

    $active = 0; $total_dl = 0; $total_ul = 0;
    foreach ($torrents as $t) {
        if (in_array($t['status'], [3, 4])) { $active++; $total_dl += $t['rateDownload']; }
        if (in_array($t['status'], [5, 6])) { $total_ul += $t['rateUpload']; }
    }

    $items = [];
    foreach (array_slice($torrents, 0, 8) as $t) {
        $items[] = [
            'title'  => $t['name'],
            'status' => $status_map[$t['status']] ?? (function_exists('t') ? t('status_unknown') : 'Inconnu'),
            'pct'    => round($t['percentDone'] * 100),
        ];
    }

    return [
        'ok' => true,
        'stats' => [
            ['label' => function_exists('t') ? t('trans_torrents') : 'Torrents', 'value' => count($torrents)],
            ['label' => function_exists('t') ? t('api_active_plural') : 'Actifs', 'value' => $active],
            ['label' => function_exists('t') ? t('trans_dl_speed') : 'Vitesse DL', 'value' => trans_format_speed($total_dl)],
            ['label' => function_exists('t') ? t('trans_ul_speed') : 'Vitesse UL', 'value' => trans_format_speed($total_ul)],
        ],
        'items' => $items,
    ];
}

/* ── QBITTORRENT ── */
// Connexion + test réel de l'API qBittorrent (utilisé pour la pastille verte/rouge des paramètres)
function _qbt_login($cfg) {
    $base_url = rtrim($cfg['url'], '/');
    $url = $base_url . '/api/v2/auth/login';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query([
            'username' => $cfg['username'] ?? '',
            'password' => $cfg['password'] ?? '',
        ]),
        // 🔒 Referer/Origin requis par la protection CSRF de qBittorrent (activée par défaut)
        CURLOPT_HTTPHEADER     => ['Referer: ' . $base_url, 'Origin: ' . $base_url],
        CURLOPT_HEADER         => true,
        CURLOPT_TIMEOUT        => 6,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $raw = curl_exec($ch);
    $hsize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);

    $headers_raw = substr($raw, 0, $hsize);
    if (preg_match('/Set-Cookie:\s*(SID=[^;]+)/i', $headers_raw, $m)) return trim($m[1]);
    return null;
}

function _status_qbittorrent($cfg) {
    $base_url = rtrim($cfg['url'], '/');
    $headers = ['Referer: ' . $base_url, 'Origin: ' . $base_url];

    $api_key = $cfg['api_key'] ?? '';

    // Si une clé API est configurée, on l'utilise, sinon on tente la connexion par identifiants
    if (!empty($api_key)) {
        $headers[] = 'Authorization: Bearer ' . trim($api_key);
    } else {
        $sid = _qbt_login($cfg);
        if (!$sid) {
            return ['ok' => false, 'error' => function_exists('t') ? t('trans_conn_failed') : 'Échec connexion (identifiants ou URL incorrects)'];
        }
        $headers[] = 'Cookie: ' . $sid;
    }

    $url = $base_url . '/api/v2/torrents/info';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 6,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $raw = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code === 403) {
        return ['ok' => false, 'error' => 'Clé API ou session qBittorrent invalide'];
    }

    $torrents = json_decode($raw, true);
    if (!is_array($torrents)) {
        return ['ok' => false, 'error' => function_exists('t') ? t('trans_conn_failed') : 'Échec connexion'];
    }

    $active = 0; $total_dl = 0; $total_ul = 0;
    foreach ($torrents as $t) {
        if (in_array($t['state'] ?? '', ['downloading', 'forcedDL', 'metaDL', 'stalledDL'], true)) {
            $active++; $total_dl += $t['dlspeed'] ?? 0;
        }
        if (in_array($t['state'] ?? '', ['uploading', 'forcedUP', 'stalledUP'], true)) {
            $total_ul += $t['upspeed'] ?? 0;
        }
    }

    $items = [];
    foreach (array_slice($torrents, 0, 8) as $t) {
        $items[] = [
            'title'  => $t['name'] ?? '?',
            'status' => $t['state'] ?? (function_exists('t') ? t('status_unknown') : 'Inconnu'),
            'pct'    => round(($t['progress'] ?? 0) * 100),
        ];
    }

    return [
        'ok' => true,
        'stats' => [
            ['label' => function_exists('t') ? t('trans_torrents') : 'Torrents', 'value' => count($torrents)],
            ['label' => function_exists('t') ? t('api_active_plural') : 'Actifs', 'value' => $active],
            ['label' => function_exists('t') ? t('trans_dl_speed') : 'Vitesse DL', 'value' => trans_format_speed($total_dl)],
            ['label' => function_exists('t') ? t('trans_ul_speed') : 'Vitesse UL', 'value' => trans_format_speed($total_ul)],
        ],
        'items' => $items,
    ];
}

/* ── DELUGE / UTORRENT (Fonctions à étoffer) ── */
function _status_deluge($cfg) { return ['ok' => true, 'stats' => [['label' => 'Logiciel', 'value' => 'Deluge']], 'items' => []]; }
function _status_utorrent($cfg) { return ['ok' => true, 'stats' => [['label' => 'Logiciel', 'value' => 'uTorrent']], 'items' => []]; }
