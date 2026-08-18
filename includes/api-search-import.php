<?php
// ===== Serviarr - api-search-import.php =====



// ── SEARCH MOVIE / SERIE ──────────────────────────────────────────────────────
if ($action === 'search_movie') {
    $cfg   = load_config();
    $query = urlencode($_GET['q'] ?? '');
    $radarr = find_app_by_driver($cfg, 'radarr');
    if (!$radarr) { echo json_encode(['error' => t('err_radarr_not_configured')]); exit; }
    $data = arr_get($radarr, "/api/v3/movie/lookup?term=" . $query);
    if (isset($data['_error'])) { echo json_encode(['error' => $data['_error']]); exit; }

    $library = arr_get($radarr, '/api/v3/movie');
    $in_lib  = [];
    if (is_array($library)) {
        foreach ($library as $m) { if (!empty($m['tmdbId'])) $in_lib[$m['tmdbId']] = true; }
    }

    $results = [];
    foreach (array_slice($data, 0, 15) as $mv) {
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
            // 🌟 CORRECTION ICI : mb_substr au lieu de substr
            'overview' => mb_substr($mv['overview'] ?? '', 0, 200, 'UTF-8'),
            'rating'   => round($mv['ratings']['tmdb']['value'] ?? 0, 1),
            'in_lib'   => isset($in_lib[$mv['tmdbId'] ?? null]),
            'poster'   => $poster
        ];
    }
    // 🌟 SÉCURITÉ : JSON_INVALID_UTF8_SUBSTITUTE empêche le JSON de planter si un caractère est bizarre
    echo json_encode(['results' => $results], JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}



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
            // 🌟 CORRECTION ICI : mb_substr au lieu de substr
            'overview' => mb_substr($s['overview'] ?? '', 0, 200, 'UTF-8'),
            'rating'   => round($s['ratings']['value'] ?? 0, 1),
            'seasons'  => count($s['seasons'] ?? []),
            'in_lib'   => isset($in_lib[$s['tvdbId'] ?? null]),
            'poster'   => $poster
        ];
    }
    // 🌟 SÉCURITÉ ICI AUSSI
    echo json_encode(['results' => $results], JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}



// ── BULK IMPORT ───────────────────────────────────────────────────────────────
if ($action === 'bulk_import_lookup') {
    require_auth();
    $cfg  = load_config();
    $type = $_POST['type'] ?? 'movie';
    $terms = json_decode($_POST['terms'] ?? '[]', true);
    if (!is_array($terms) || empty($terms)) { echo json_encode(['error' => t('err_no_lines_to_analyze')]); exit; }
    $terms = array_slice(array_filter(array_map('trim', $terms)), 0, 10000);

    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => ($type === 'movie' ? 'Radarr' : 'Sonarr') . ' non configuré']); exit; }

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
        if (preg_match('/^(tt\d{6,})\s*\(.*\)$/i', $term, $matches)) {
            $term = $matches[1];
        }

        $search_term = preg_match('/^tt\d{6,}$/i', $term) ? 'imdb:' . $term : $term;
        $data = arr_get($app, $lookup_endpoint . urlencode($search_term));

        if (isset($data['_error']) || empty($data) || !is_array($data) || empty($data[0]['title'])) {
            $results[] = ['term' => $term, 'found' => false];
            continue;
        }
        $m = $data[0];
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



// ── PROWLARR ──────────────────────────────────────────────────────────────────
if ($action === 'prowlarr_indexers') {
    require_auth();
    $cfg = load_config();
    $app = find_app_by_driver($cfg, 'indexer');
    if (!$app) { echo json_encode(['error' => t('err_indexer_not_configured')]); exit; }
    require_once APP_ROOT . '/drivers/indexer_driver.php';
    $client = $app['client'] ?? 'prowlarr';

    if ($client === 'jackett') {
        $raw = jackett_request($app, 'indexers');
        if (isset($raw['_error'])) { echo json_encode(['error' => $raw['_error']]); exit; }
        $indexers = [];
        if (is_array($raw)) {
            foreach ($raw as $idx) {
                $indexers[] = ['id' => $idx['id'], 'name' => $idx['title'] ?? $idx['id'], 'enable' => !empty($idx['configured']), 'protocol' => 'torrent', 'privacy' => t('word_unknown')];
            }
        }
    } else {
        $indexers = prowlarr_request($app, 'indexer');
        if (isset($indexers['_error'])) { echo json_encode(['error' => t('err_prowlarr_unreachable')]); exit; }
    }
    echo json_encode(['success' => true, 'indexers' => $indexers], JSON_UNESCAPED_UNICODE);
    exit;
}



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



if ($action === 'prowlarr_search') {
    require_auth();
    $cfg = load_config();
    $app = find_app_by_driver($cfg, 'indexer');
    if (!$app) { echo json_encode(['error' => t('err_indexer_not_configured')]); exit; }

    $query = trim($_GET['query'] ?? '');
    $indexer = $_GET['indexer'] ?? '0';
    $category = (int)($_GET['category'] ?? 0);
    require_once APP_ROOT . '/drivers/indexer_driver.php';
    $client = $app['client'] ?? 'prowlarr';

    if ($client === 'jackett') {
        $idx_path = ($indexer !== '0' && !empty($indexer)) ? $indexer : 'all';
        $endpoint = "indexers/{$idx_path}/results";
        $params = [];
        if (!empty($query)) $params[] = "Query=" . urlencode($query);
        if ($category > 0) $params[] = "Category=" . $category;
        if (count($params) > 0) $endpoint .= "?" . implode("&", $params);
        $raw = jackett_request($app, $endpoint);
        if (isset($raw['_error'])) { echo json_encode(['error' => $raw['_error']]); exit; }

        $results = [];
        foreach ($raw['Results'] ?? [] as $res) {
            $ageHours = 0;
            if (!empty($res['PublishDate'])) $ageHours = max(0, (time() - strtotime($res['PublishDate'])) / 3600);
            $results[] = [
                'title' => $res['Title'] ?? 'Inconnu', 'indexer' => $res['Tracker'] ?? 'Jackett', 'size' => $res['Size'] ?? 0,
                'seeders' => $res['Seeders'] ?? 0, 'leechers' => $res['Peers'] ? max(0, $res['Peers'] - ($res['Seeders'] ?? 0)) : 0,
                'magnetUrl' => $res['MagnetUri'] ?? '', 'downloadUrl' => $res['Link'] ?? '', 'infoUrl' => $res['Details'] ?? '', 'age' => $ageHours,
                'grabs' => $res['Grabs'] ?? 0,
                'category' => $res['CategoryDesc'] ?? (is_array($res['Category'] ?? null) ? implode(', ', $res['Category']) : '')
            ];
        }
    } else {
        $endpoint = "search";
        $params = [];
        if (!empty($query)) $params[] = "query=" . urlencode($query);
        if ($indexer > 0) $params[] = "indexerIds=" . $indexer;
        if ($category > 0) $params[] = "categories=" . $category;
        if (count($params) > 0) $endpoint .= "?" . implode("&", $params);
        $results = prowlarr_request($app, $endpoint);
        if (isset($results['_error'])) { echo json_encode(['error' => $results['_error']]); exit; }
    }
    echo json_encode(['success' => true, 'results' => $results]);
    exit;
}



// ── OMNISEARCH ────────────────────────────────────────────────────────────────
if ($action === 'omnisearch') {
    require_auth();
    $cfg = load_config();
    $q = rawurlencode(trim($_GET['q'] ?? ''));
    $results = ['movies' => [], 'series' => [], 'debug' => []];

    if (strlen($q) >= 2) {
        $call_api = function($app, $endpoint) use (&$results) {
            if (!$app || empty($app['url']) || empty($app['api_key'])) {
                $results['debug'][] = ($app['name'] ?? 'Service') . " : URL ou Clé API non configurée.";
                return [];
            }
            $base_url = $app['url'];
            if (!preg_match("~^(?:f|ht)tps?://~i", $base_url)) $base_url = "http://" . $base_url;
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
            $list[] = $item['imdbId'] . ' (' . $title . ')';
        }
    }
    echo json_encode(['ok' => true, 'text' => implode("\n", $list), 'count' => count($list)]);
    exit;
}



// ── AJOUT MANUEL INTERACTIF ───────────────────────────────────────────────────
if ($action === 'manual_import_scan') {
    require_auth();
    $cfg = load_config();
    $type = $_GET['type'] ?? 'movie';
    $folder = $_GET['folder'] ?? '';

    if (empty($folder)) { echo json_encode(['error' => 'Le chemin du dossier est requis.']); exit; }

    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }

    // On lance le scan du dossier
    $res = arr_get($app, '/api/v3/manualimport?folder=' . urlencode($folder));

    if (isset($res['_error'])) {
        echo json_encode(['error' => $res['_error']]);
    } else {
        echo json_encode(['success' => true, 'files' => $res]);
    }
    exit;
}



if ($action === 'manual_import_process') {
    require_auth();
    $cfg = load_config();
    $type = $_POST['type'] ?? 'movie';
    $files = json_decode($_POST['files'] ?? '[]', true);

    if (empty($files)) { echo json_encode(['error' => 'Aucun fichier sélectionné.']); exit; }

    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }

    // Mappage précis des objets pour correspondre à ce que Radarr/Sonarr attend
    $formattedFiles = [];
    foreach ($files as $f) {
        $formatted = [
            'path' => $f['path'],
            'folder' => $f['folder'],
            'quality' => $f['quality'] ?? null,
            'languages' => $f['languages'] ?? null,
            'releaseGroup' => $f['releaseGroup'] ?? null,
        ];

        if ($type === 'movie') {
            if (isset($f['movie']['id'])) $formatted['movieId'] = $f['movie']['id'];
            elseif (isset($f['movieId'])) $formatted['movieId'] = $f['movieId'];
        } else {
            if (isset($f['series']['id'])) $formatted['seriesId'] = $f['series']['id'];
            elseif (isset($f['seriesId'])) $formatted['seriesId'] = $f['seriesId'];

            if (isset($f['episodes'])) {
                $formatted['episodeIds'] = array_map(fn($ep) => $ep['id'], $f['episodes']);
            } elseif (isset($f['episodeIds'])) {
                $formatted['episodeIds'] = $f['episodeIds'];
            }
        }
        $formattedFiles[] = array_filter($formatted, fn($val) => $val !== null);
    }

    $payload = [
        'name' => 'ManualImport',
        'files' => $formattedFiles,
        'importMode' => 'auto'
    ];

    $res = arr_post($app, '/api/v3/command', $payload);

    if (isset($res['_error'])) {
        echo json_encode(['error' => $res['_error']]);
    } else {
        echo json_encode(['success' => true]);
    }
    exit;
}
