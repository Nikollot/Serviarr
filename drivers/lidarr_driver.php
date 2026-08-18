<?php
// Driver: Lidarr
// Required fields: url, api_key

function lidarr_request($cfg, $endpoint) {
    $url = rtrim($cfg['url'], '/') . '/api/v1/' . ltrim($endpoint, '/');
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_HTTPHEADER => ['X-Api-Key: ' . $cfg['api_key']],
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $res = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);
    if ($err) return ['error' => $err];
    return json_decode($res, true) ?? ['error' => t('api_invalid_json')];
}

function lidarr_status($cfg) {
    $queue = lidarr_request($cfg, 'queue?pageSize=50');
    $artists = lidarr_request($cfg, 'artist');
    $wanted = lidarr_request($cfg, 'wanted/missing?pageSize=5');

    $queue_count = isset($queue['totalRecords']) ? $queue['totalRecords'] : 0;
    $artist_count = is_array($artists) && !isset($artists['error']) ? count($artists) : 0;
    $missing = isset($wanted['totalRecords']) ? $wanted['totalRecords'] : 0;

    $items = [];
    if (isset($queue['records']) && is_array($queue['records'])) {
        foreach (array_slice($queue['records'], 0, 5) as $r) {
            $pct = (isset($r['sizeleft'], $r['size']) && $r['size'] > 0)
            ? round((1 - $r['sizeleft'] / $r['size']) * 100) : 0;
            $items[] = [
                'title' => $r['title'] ?? '?',
                'status' => $r['status'] ?? '?',
                'pct' => $pct,
            ];
        }
    }

    return [
        'ok' => true,
        'stats' => [
            ['label' => t('page_music'),   'value' => $artist_count],
            ['label' => t('api_in_queue'), 'value' => $queue_count],
            ['label' => t('api_missing'),  'value' => $missing],
        ],
        'items' => $items,
    ];
}

function lidarr_fields() {
    return [
        ['key' => 'url',     'label' => t('api_url_label'), 'type' => 'text',     'placeholder' => 'http://192.168.1.x:8686'],
        ['key' => 'api_key', 'label' => t('api_key_label'), 'type' => 'password', 'placeholder' => t('api_key_lidarr')],
    ];
}
