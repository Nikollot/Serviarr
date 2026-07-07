<?php
// Driver: Indexer (Multi-support)
// Supported clients: prowlarr, jackett, newznab, spotweb
// Note : seuls Prowlarr et Jackett sont proposés dans le menu pour le moment.
// Les autres (Newznab, Spotweb) restent dans le code, prêts à être réactivés plus tard.

function indexer_fields() {
    return [
        ['key' => 'client', 'label' => 'Logiciel Indexeur', 'type' => 'select', 'options' => [
            ['value' => 'prowlarr', 'label' => 'Prowlarr'],
            ['value' => 'jackett', 'label' => 'Jackett'],
        ]],
        ['key' => 'url',     'label' => t('api_url_label') ?? 'URL', 'type' => 'text',     'placeholder' => 'http://192.168.1.x:9696'],
        ['key' => 'api_key', 'label' => t('api_key_label') ?? 'Clé API', 'type' => 'password', 'placeholder' => 'Clé API'],
    ];
}

function indexer_status($cfg) {
    $client = $cfg['client'] ?? 'prowlarr';

    // Logique de distribution selon le logiciel sélectionné
    switch ($client) {
        case 'prowlarr': return _status_prowlarr($cfg);
        case 'jackett':  return _status_jackett($cfg);
        case 'newznab':  return _status_newznab($cfg);
        case 'spotweb':  return _status_spotweb($cfg);
        default:         return ['ok' => false, 'error' => 'Indexeur non supporté'];
    }
}

/* ── PROWLARR ── */
function prowlarr_request($cfg, $endpoint) {
    $url = rtrim($cfg['url'], '/') . '/api/v1/' . ltrim($endpoint, '/');
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_HTTPHEADER => ['X-Api-Key: ' . ($cfg['api_key'] ?? '')],
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_FOLLOWLOCATION => true, // 👈 LIGNE AJOUTÉE ICI
    ]);
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($code === 401) return ['_error' => 'Clé API Prowlarr invalide ou manquante'];
    if ($err) return ['_error' => 'Erreur de connexion : ' . $err];
    if ($code !== 200) return ['_error' => 'Erreur HTTP ' . $code . ($res ? ' — ' . substr(strip_tags($res), 0, 300) : '')];

    return json_decode($res, true) ?? ['_error' => 'Réponse invalide de Prowlarr'];
}

function _status_prowlarr($cfg) {
    // 1. Vérification rapide de la clé API avant de charger les listes lourdes
    $status = prowlarr_request($cfg, 'system/status');
    if (isset($status['_error'])) {
        return ['ok' => false, 'error' => $status['_error']];
    }

    $indexers = prowlarr_request($cfg, 'indexer');
    $stats    = prowlarr_request($cfg, 'indexerstats');

    $total   = is_array($indexers) && !isset($indexers['_error']) ? count($indexers) : 0;
    $enabled = 0;
    if (is_array($indexers) && !isset($indexers['_error'])) {
        foreach ($indexers as $idx) { if (!empty($idx['enable'])) $enabled++; }
    }

    $grabs = 0; $queries = 0;
    if (isset($stats['indexers']) && is_array($stats['indexers'])) {
        foreach ($stats['indexers'] as $s) {
            $grabs   += $s['numberOfGrabs'] ?? 0;
            $queries += $s['numberOfQueries'] ?? 0;
        }
    }

    $items = [];
    if (is_array($indexers) && !isset($indexers['_error'])) {
        foreach (array_slice($indexers, 0, 8) as $idx) {
            $items[] = [
                'title'  => $idx['name'] ?? '?',
                'status' => !empty($idx['enable']) ? (function_exists('t') ? t('status_active') : 'Actif') : (function_exists('t') ? t('status_disabled') : 'Désactivé'),
                'pct'    => null,
            ];
        }
    }

    return [
        'ok' => true,
        'stats' => [
            ['label' => function_exists('t') ? t('prowlarr_indexers') : 'Indexeurs', 'value' => $total],
            ['label' => function_exists('t') ? t('api_active_plural') : 'Actifs', 'value' => $enabled],
            ['label' => function_exists('t') ? t('prowlarr_grabs') : 'Grabs', 'value' => $grabs],
            ['label' => function_exists('t') ? t('prowlarr_queries') : 'Requêtes', 'value' => $queries],
        ],
        'items' => $items,
    ];
}

/* ── JACKETT ── */
function jackett_request($cfg, $endpoint) {
    // Nettoyage de l'URL
    $base_url = preg_replace('/\/UI.*$/', '', rtrim($cfg['url'], '/'));
    $url = $base_url . '/api/v2.0/' . ltrim($endpoint, '/');
    $url .= (strpos($url, '?') === false ? '?' : '&') . 'apikey=' . urlencode(preg_replace('/\s+/', '', $cfg['api_key'] ?? ''));

    // Création d'un fichier cookie unique pour cette session
    $cookie_file = tempnam(sys_get_temp_dir(), 'jackett_session');

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'Referer: ' . $base_url . '/',
            'Origin: ' . $base_url
        ],
        // On force cURL à gérer les cookies comme un navigateur
        CURLOPT_COOKIEJAR => $cookie_file,
        CURLOPT_COOKIEFILE => $cookie_file,
    ]);

    // Étape 1: Faire une requête "vide" à la racine pour récupérer le cookie de session
    curl_setopt($ch, CURLOPT_URL, $base_url . '/');
    curl_exec($ch);

    // Étape 2: Faire la vraie requête API
    curl_setopt($ch, CURLOPT_URL, $url);
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if (file_exists($cookie_file)) unlink($cookie_file);

    if ($err) return ['_error' => 'Erreur réseau : ' . $err];
    if ($code !== 200) return ['_error' => 'Erreur ' . $code . ': ' . substr(strip_tags($res), 0, 100)];
    
    return json_decode($res, true) ?? ['_error' => 'Pas de JSON'];
}

function _status_jackett($cfg) {
    // Appel à l'API Jackett pour lister tous les indexeurs
    $indexers = jackett_request($cfg, 'indexers');

    // Gestion des erreurs de connexion pour le tableau de bord
    if (isset($indexers['_error'])) {
        return ['ok' => false, 'error' => $indexers['_error']];
    }

    $total = 0;
    $enabled = 0;
    $items = [];

    if (is_array($indexers)) {
        $total = count($indexers);
        foreach ($indexers as $idx) {
            // Dans Jackett, on vérifie si l'indexeur est "configuré"
            $is_configured = !empty($idx['configured']);
            if ($is_configured) $enabled++;

            // On ajoute les 8 premiers à la liste pour le widget
            if (count($items) < 8) {
                $items[] = [
                    'title'  => $idx['title'] ?? $idx['id'] ?? '?',
                    'status' => $is_configured ? (function_exists('t') ? t('status_active') : 'Actif') : (function_exists('t') ? t('status_disabled') : 'Désactivé'),
                    'pct'    => null,
                ];
            }
        }
    }

    return [
        'ok' => true,
        'stats' => [
            ['label' => function_exists('t') ? t('prowlarr_indexers') : 'Indexeurs', 'value' => $total],
            ['label' => function_exists('t') ? t('api_active_plural') : 'Configurés', 'value' => $enabled],
        ],
        'items' => $items,
    ];
}

/* ── NEWZNAB / SPOTWEB (Fonctions à étoffer) ── */
function _status_newznab($cfg) { return ['ok' => true, 'stats' => [['label' => 'Logiciel', 'value' => 'Newznab']], 'items' => []]; }
function _status_spotweb($cfg) { return ['ok' => true, 'stats' => [['label' => 'Logiciel', 'value' => 'Spotweb']], 'items' => []]; }