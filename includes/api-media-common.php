<?php
// ===== Serviarr - api-media-common.php =====



// ── Filmographie de l'Acteur ──────────────────────────────────────────────────
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

    $search_url = "https://api.themoviedb.org/3/search/person?api_key=" . $tmdb_key . "&query=" . urlencode($name) . "&language=" . $TMDB_LANG;
    $search_res = http_get_secure($search_url);
    if (isset($search_res['_error']) || empty($search_res['results'])) {
        echo json_encode(['error' => t('err_actor_not_found_tmdb')]);
        exit;
    }

    $person = $search_res['results'][0];
    $person_id = $person['id'];

    $credits_url = "https://api.themoviedb.org/3/person/" . $person_id . "/combined_credits?api_key=" . $tmdb_key . "&language=" . $TMDB_LANG;
    $credits_res = http_get_secure($credits_url);
    if (isset($credits_res['_error'])) {
        echo json_encode(['error' => t('err_filmography_failed')]);
        exit;
    }

    $local_movies = [];
    $cache_movies = APP_ROOT . '/data/.cache_library_movies.json';

    if (file_exists($cache_movies)) {
        $radarr_data = json_decode(file_get_contents($cache_movies), true);
    } else {
        $radarr = find_app_by_driver($cfg, 'radarr');
        $radarr_data = $radarr ? arr_get($radarr, '/api/v3/movie') : [];
    }

    if (is_array($radarr_data) && !isset($radarr_data['_error'])) {
        foreach ($radarr_data as $m) {
            if (!empty($m['tmdbId'])) {
                $local_movies[$m['tmdbId']] = ['id' => $m['id'], 'hasFile' => $m['hasFile'] ?? false];
            }
        }
    }

    $local_series_by_title = [];
    $local_series_by_tmdb = [];
    $cache_series = APP_ROOT . '/data/.cache_library_series.json';

    if (file_exists($cache_series)) {
        $sonarr_data = json_decode(file_get_contents($cache_series), true);
    } else {
        $sonarr = find_app_by_driver($cfg, 'sonarr');
        $sonarr_data = $sonarr ? arr_get($sonarr, '/api/v3/series') : [];
    }

    if (is_array($sonarr_data) && !isset($sonarr_data['_error'])) {
        foreach ($sonarr_data as $s) {
            $size = $s['statistics']['sizeOnDisk'] ?? $s['sizeOnDisk'] ?? 0;
            $has_file = $size > 0;
            if (!empty($s['tmdbId'])) {
                $local_series_by_tmdb[$s['tmdbId']] = ['id' => $s['id'], 'hasFile' => $has_file];
            }
            $slug = strtolower(preg_replace('/[^a-z0-9]/', '', $s['title'] ?? ''));
            if ($slug) {
                $local_series_by_title[$slug] = ['id' => $s['id'], 'hasFile' => $has_file];
            }
        }
    }

    $cast_credits = $credits_res['cast'] ?? [];
    usort($cast_credits, fn($a, $b) => ($b['popularity'] ?? 0) <=> ($a['popularity'] ?? 0));
    $cast_credits = array_slice($cast_credits, 0, 60);

    $results = [];
    foreach ($cast_credits as $c) {
        $media_type = $c['media_type'] ?? 'movie';
        $tmdbId = $c['id'];
        $title = $c['title'] ?? $c['name'] ?? t('word_unknown');
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



// ── GET OPTIONS & RAW ─────────────────────────────────────────────────────────
if ($action === 'get_options') {
    $cfg = load_config();
    $type = $_GET['app'] ?? 'radarr';
    $app = find_app_by_driver($cfg, $type);
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }

    $profiles = arr_get($app, '/api/v3/qualityprofile');
    $folders = arr_get($app, '/api/v3/rootfolder');
    $tags = arr_get($app, '/api/v3/tag');

    echo json_encode([
        'profiles' => is_array($profiles) && !isset($profiles['_error']) ? $profiles : [],
                     'folders'  => is_array($folders) && !isset($folders['_error']) ? $folders : [],
                     'tags'     => is_array($tags) && !isset($tags['_error']) ? $tags : []
    ]);
    exit;
}



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



if ($action === 'edit_media') {
    $cfg = load_config();
    $type = $_POST['type'] ?? 'movie';
    $id = (int)$_POST['id'];
    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');

    $endpoint = $type === 'movie' ? "/api/v3/movie/{$id}" : "/api/v3/series/{$id}";

    $item = arr_get($app, $endpoint);
    if (isset($item['_error'])) { echo json_encode(['error' => t('err_media_not_found')]); exit; }

    $item['qualityProfileId'] = (int)$_POST['qualityProfileId'];
    $item['rootFolderPath'] = $_POST['rootFolderPath'];
    $item['path'] = $_POST['path'];
    $item['tags'] = isset($_POST['tags']) ? json_decode($_POST['tags'], true) : [];

    $res = arr_put_raw($app, $endpoint . '?moveFiles=true', json_encode($item, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

    if ($res['code'] >= 200 && $res['code'] < 300) {
        clear_media_caches($type);
        echo json_encode(['ok' => true]);
    } else {
        echo json_encode(['error' => "Erreur de sauvegarde ({$res['code']})"]);
    }
    exit;
}



// ── TOGGLES & QUALITY ─────────────────────────────────────────────────────────
if ($action === 'toggle_monitor') {
    $cfg = load_config();
    $type = $_POST['type'] ?? 'movie';
    $id = (int)$_POST['id'];
    $monitored = filter_var($_POST['monitored'], FILTER_VALIDATE_BOOLEAN);

    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }

    $endpoint = $type === 'movie' ? "/api/v3/movie/{$id}" : "/api/v3/series/{$id}";

    $raw = http_get(rtrim($app['url'], '/') . $endpoint . '?apikey=' . $app['api_key']);
    if (isset($raw['_error']) || !isset($raw['id'])) {
        echo json_encode(['error' => t('err_element_not_found_server')]); exit;
    }
    $raw['monitored'] = $monitored;

    $res = arr_put_raw($app, $endpoint, json_encode($raw, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

    if ($res['code'] >= 200 && $res['code'] < 300) {
        clear_media_caches($type);
        echo json_encode(['ok' => true, 'monitored' => $monitored]);
    } else {
        echo json_encode(['error' => "Erreur API ({$res['code']})"]);
    }
    exit;
}



if ($action === 'update_media_quality') {
    $cfg = load_config();
    $type = $_POST['type'] ?? 'movie';
    $mediaId = (int)$_POST['id'];
    $profileId = (int)$_POST['profileId'];

    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }

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



// ── QUEUE & PROXY ─────────────────────────────────────────────────────────────
if ($action === 'queue_status') {
    require_auth();
    $cfg = load_config();
    $type = $_GET['type'] ?? 'movie';
    $id = (int)($_GET['id'] ?? 0);
    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }

    $endpoint = $type === 'movie' ? "/api/v3/queue?movieId=$id&pageSize=100" : "/api/v3/queue?seriesId=$id&pageSize=100";
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



if ($action === 'proxy_image') {
    require_auth();
    $url = urldecode($_GET['url'] ?? '');
    $parsed = parse_url($url);
    $path_ok = isset($parsed['path']) && strpos($parsed['path'], '/api/v3/mediacover') === 0;
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



if ($action === 'proxy_fetch') {
    require_auth();
    $url = $_GET['url'] ?? '';
    if (!$url || !filter_var($url, FILTER_VALIDATE_URL)) {
        echo json_encode(['error' => t('err_url_invalid')]);
        exit;
    }
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



// ── BULK & DELETE & REFRESH ───────────────────────────────────────────────────
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
    log_activity($bulkAction === 'delete' ? 'bulk_delete' : 'bulk_monitor', $type, null, "{$success} " . t('word_items_of') . " " . count($ids) . " (" . $bulkAction . ")");

    if ($success > 0) {
        echo json_encode(['ok' => true, 'success' => $success, 'failed' => $failed]);
    } else {
        echo json_encode(['error' => t('err_no_action_taken'), 'failed' => $failed]);
    }
    exit;
}



if ($action === 'delete_media') {
    $cfg = load_config();
    $type = $_POST['type'] ?? 'movie';
    $id = (int)$_POST['id'];
    $deleteFiles = filter_var($_POST['deleteFiles'] ?? 'true', FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false';

    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }

    $endpoint = $type === 'movie' ? "/api/v3/movie/{$id}?deleteFiles={$deleteFiles}" : "/api/v3/series/{$id}?deleteFiles={$deleteFiles}";
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



if ($action === 'refresh_media') {
    $cfg = load_config();
    $type = $_POST['type'] ?? 'movie';
    $id = (int)$_POST['id'];
    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }

    $payload = [];
    if ($type === 'movie') {
        $payload = ['name' => 'RefreshMovie', 'movieIds' => [$id]];
    } else {
        $payload = ['name' => 'RefreshSeries', 'seriesId' => $id];
    }

    $res = arr_post($app, '/api/v3/command', $payload);

    if (isset($res['_error'])) { echo json_encode(['error' => $res['_error']]); exit; }
    clear_media_caches($type);
    echo json_encode(['ok' => true]);
    exit;
}
