<?php
// ===== Serviarr - api-movies.php =====



// ── ADD MEDIA ─────────────────────────────────────────────────────────────────
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
    $search = filter_var($_POST['search'] ?? 'true', FILTER_VALIDATE_BOOLEAN);

    $body = array_merge($lookup, [
        'rootFolderPath'   => $rootPath,
        'qualityProfileId' => $profileId,
        'monitored'        => true,
        'addOptions'       => ['searchForMovie' => $search],
    ]);
    // 🌟 AJOUT : Pour l'import de bibliothèque, on force le chemin exact existant
    if (!empty($_POST['path'])) {
        $body['path'] = $_POST['path'];
    }

    $res = arr_post($radarr, '/api/v3/movie', $body);
    if (isset($res['_error'])) { echo json_encode(['error' => $res['_error']]); exit; }
    if (isset($res['message'])) { echo json_encode(['error' => $res['message']]); exit; }

    clear_media_caches('movie');
    log_activity('add_movie', 'movie', $res['id'] ?? null, $res['title'] ?? '?');

    echo json_encode(['ok' => true, 'title' => $res['title'] ?? '?', 'id' => $res['id'] ?? null]);
    exit;
}



// ── TMDB DETAILS ──────────────────────────────────────────────────────────────
if ($action === 'tmdb_movie_detail') {
    require_auth();
    $cfg    = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    if (!$radarr) { echo json_encode(['error' => t('err_radarr_not_configured')]); exit; }

    $tmdbId = (int)($_GET['tmdbId'] ?? 0);
    if (!$tmdbId) { echo json_encode(['error' => t('err_tmdbid_missing')]); exit; }

    $lookup = arr_get($radarr, "/api/v3/movie/lookup/tmdb?tmdbId=$tmdbId");
    if (isset($lookup['_error']) || empty($lookup['title'])) {
        echo json_encode(['error' => t('err_movie_not_found_radarr')]); exit;
    }

    $poster_url = null;
    $fanart_url = null;
    foreach ($lookup['images'] ?? [] as $img) {
        if ($img['coverType'] === 'poster') $poster_url = $img['remoteUrl'] ?? $img['url'] ?? null;
        if ($img['coverType'] === 'fanart') $fanart_url = $img['remoteUrl'] ?? $img['url'] ?? null;
    }

    $youtubeTrailerId = $lookup['youTubeTrailerId'] ?? get_tmdb_trailer('movie', $tmdbId);

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
                     'physicalRelease' => $lookup['physicalRelease'] ?? null,
                     'youtubeTrailerId'=> $youtubeTrailerId
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_IGNORE);
    exit;
}



// ── LIBRARIES ─────────────────────────────────────────────────────────────────
if ($action === 'library_movies') {
    $q      = strtolower($_GET['q'] ?? '');
    $filter = $_GET['filter'] ?? 'all';

    $cacheFile = APP_ROOT . '/data/.cache_library_movies.json';
    $all_movies = [];

    if (!file_exists($cacheFile)) {
        header('X-Cache: MISS');
        $res = generate_movies_cache();
        if ($res !== true) { echo json_encode(['error' => $res]); exit; }
    } else {
        header('X-Cache: HIT');
    }

    if (file_exists($cacheFile)) {
        $all_movies = json_decode(file_get_contents($cacheFile), true) ?: [];
    }

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
        echo json_encode(['error' => t('err_conversion_fatal') . ' ' . json_last_error_msg()]);
    } else {
        echo $output;
    }
    exit;
}



// ── DETAILS ───────────────────────────────────────────────────────────────────
if ($action === 'movie_detail') {
    $cfg    = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    if (!$radarr) { echo json_encode(['error' => t('err_radarr_not_configured')]); exit; }
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { echo json_encode(['error' => t('err_id_missing')]); exit; }

    $mv = arr_get($radarr, "/api/v3/movie/$id");
    if (isset($mv['_error'])) { echo json_encode(['error' => $mv['_error']]); exit; }

    if (isset($mv['message'])) { echo json_encode(['error' => t('err_media_not_in_library')]); exit; }

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

    $collection = null;
    if (!empty($mv['collection']['title'])) {
        $collection = [
            'title' => $mv['collection']['title'],
            'tmdbId' => $mv['collection']['tmdbId'] ?? null,
        ];
    }

    $queue = arr_get($radarr, "/api/v3/queue?movieId=$id&pageSize=100");
    $download_info = null;
    if (is_array($queue) && isset($queue['records']) && count($queue['records']) > 0) {
        $q = $queue['records'][0];
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
                     'appUrl'          => rtrim($radarr['url'], '/'),
                     'youtubeTrailerId'=> $mv['youTubeTrailerId'] ?? null
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_IGNORE);
    exit;
}



// ── RELEASES & DOWNLOADS ──────────────────────────────────────────────────────
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



if ($action === 'movie_download') {
    $cfg    = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    if (!$radarr) { echo json_encode(['error' => t('err_radarr_not_configured')]); exit; }
    $guid    = $_POST['guid']    ?? '';
    $movieId = (int)($_POST['movieId'] ?? 0);
    if (!$guid || !$movieId) { echo json_encode(['error' => t('err_params_missing')]); exit; }

    $res = arr_post($radarr, '/api/v3/release', ['guid' => $guid, 'indexerId' => (int)$_POST['indexerId'], 'movieId' => $movieId]);
    if (isset($res['_error'])) { echo json_encode(['error' => $res['_error']]); exit; }
    echo json_encode(['ok' => true]);
    exit;
}



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



// ── DASHBOARDS ────────────────────────────────────────────────────────────────
// ── DASHBOARDS ────────────────────────────────────────────────────────────────
if ($action === 'movies_dashboard') {
    require_auth();
    $cfg = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    if (!$radarr) { echo json_encode(['error' => t('err_radarr_not_configured')]); exit; }

    $cacheFile = APP_ROOT . '/data/.cache_movies_dashboard.json';
    $cacheLife = 21600;

    if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheLife) {
        header('X-Cache: HIT');
        echo file_get_contents($cacheFile);
        exit;
    }

    $recent = []; $upcoming = []; $reco = []; $popular = [];
    $baseUrl = rtrim($radarr['url'], '/');

    $allMovies = arr_get($radarr, '/api/v3/movie');
    $existingTmdbIds = [];
    $downloaded = [];
    $moviesById = [];
    $radarrIdByTmdb = [];

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

    $upcomingPool = [];
    $physicalPool = []; // 🌟 AJOUT : Pour stocker les futures sorties physiques
    $start = date('Y-m-d');
    $end = date('Y-m-d', strtotime('+6 months'));

    $calendarData = arr_get($radarr, "/api/v3/calendar?start={$start}&end={$end}");
    if (is_array($calendarData) && !isset($calendarData['_error'])) {
        foreach ($calendarData as $mv) {
            if (empty($mv['hasFile'])) {
                $posterUrl = $baseUrl . '/api/v3/mediacover/' . $mv['id'] . '/poster-250.jpg?apikey=' . $radarr['api_key'];

                // Sorties "générales"
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

                // 🌟 AJOUT : Sorties exclusivement physiques
                $physDate = substr($mv['physicalRelease'] ?? '', 0, 10);
                if (!empty($physDate) && $physDate >= $start) {
                    $physicalPool[$mv['tmdbId']] = [
                        'id' => $mv['id'],
                        'tmdbId' => $mv['tmdbId'],
                        'title' => $mv['title'],
                        'poster' => 'api.php?action=proxy_image&url=' . urlencode($posterUrl),
                        'release_date' => $physDate,
                        'is_new' => false
                    ];
                }
            }
        }
    }

    $tmdbKey = $cfg['tmdb_api_key'] ?? '';
    if (!empty($tmdbKey)) {
        $today = date('Y-m-d');
        $tmdbUpcomingUrl = "https://api.themoviedb.org/3/discover/movie?api_key={$tmdbKey}&language={$TMDB_LANG}&region={$TMDB_REGION}&sort_by=popularity.desc&primary_release_date.gte={$today}&with_release_type=2|3";
        $chUp = curl_init($tmdbUpcomingUrl);
        curl_setopt_array($chUp, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 3]);
        $resUp = curl_exec($chUp);
        curl_close($chUp);
        $dataUp = json_decode($resUp, true);
        foreach ($dataUp['results'] ?? [] as $m) {
            $tmdbId = $m['id'];
            $releaseDate = $m['release_date'] ?? '';
            if (!isset($upcomingPool[$tmdbId])) {
                $is_in_lib = in_array($tmdbId, $existingTmdbIds);
                $upcomingPool[$tmdbId] = [
                    'id' => $is_in_lib ? $radarrIdByTmdb[$tmdbId] : 'tmdb_' . $tmdbId,
                    'tmdbId' => $tmdbId,
                    'title' => $m['title'],
                    'poster' => $m['poster_path'] ? 'https://image.tmdb.org/t/p/w500' . $m['poster_path'] : '',
                    'release_date' => $releaseDate,
                    'is_new' => !$is_in_lib
                ];
            }
        }

        if (count($allMovies) > 0) {
            $baseList = !empty($downloaded) ? $downloaded : $allMovies;
            $randomMovie = $baseList[array_rand($baseList)];
            $tmdbUrl = "https://api.themoviedb.org/3/movie/{$randomMovie['tmdbId']}/recommendations?api_key={$tmdbKey}&language={$TMDB_LANG}&page=1";
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

        $urlPop = "https://api.themoviedb.org/3/discover/movie?api_key={$tmdbKey}&language={$TMDB_LANG}&region={$TMDB_REGION}&sort_by=popularity.desc&vote_count.gte=10";
        $ch = curl_init($urlPop);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 3]);
        $res = curl_exec($ch);
        curl_close($ch);
        $dataPop = json_decode($res, true);
        foreach ($dataPop['results'] ?? [] as $m) {
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
    usort($upcoming, function($a, $b) { return strcmp($a['release_date'], $b['release_date']); });
    $upcoming = array_slice($upcoming, 0, 25);

    // 🌟 AJOUT : Tri du tableau des sorties physiques
    $upcoming_physical = array_values($physicalPool);
    usort($upcoming_physical, function($a, $b) { return strcmp($a['release_date'], $b['release_date']); });
    $upcoming_physical = array_slice($upcoming_physical, 0, 25);

    $finalJson = json_encode([
        'recent' => array_values($recent),
                             'upcoming' => $upcoming,
                             'upcoming_physical' => $upcoming_physical, // 🌟 AJOUT : On inclut les données dans la réponse
                             'reco' => $reco,
                             'popular' => $popular,
                             'tmdb_missing' => empty($tmdbKey)
    ]);

    file_put_contents($cacheFile, $finalJson);
    header('X-Cache: MISS');
    echo $finalJson;
    exit;
}



// ── COLLECTION ────────────────────────────────────────────────────────────────
if ($action === 'movie_collection') {
    $cfg    = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    if (!$radarr) { echo json_encode(['error' => t('err_radarr_not_configured')]); exit; }

    $collection_title  = $_GET['title'] ?? '';
    $collection_tmdbid = (int)($_GET['tmdbId'] ?? 0);
    if (!$collection_title) { echo json_encode(['error' => t('err_collection_title_missing')]); exit; }

    $base_url = rtrim($radarr['url'], '/');
    $collections = arr_get($radarr, '/api/v3/collection');
    if (isset($collections['_error'])) { echo json_encode(['error' => $collections['_error']]); exit; }

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
        echo json_encode(['error' => t('err_collection_not_found_radarr')]); exit;
    }

    $library = arr_get($radarr, '/api/v3/movie');
    $in_library = [];
    if (!isset($library['_error'])) {
        foreach ($library as $mv) {
            $in_library[$mv['tmdbId']] = $mv;
        }
    }

    $all_movies = [];
    foreach ($target_collection['movies'] ?? [] as $mv) {
        $tmdbId = $mv['tmdbId'] ?? null;
        $libData = $in_library[$tmdbId] ?? null;
        $inLib = ($libData !== null);

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

    usort($all_movies, fn($a, $b) => ($a['year'] ?? 0) - ($b['year'] ?? 0));
    echo json_encode(['movies' => $all_movies, 'collection' => $collection_title], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_IGNORE);
    exit;
}



// ── COLLECTIONS GLOBALES ──────────────────────────────────────────────────────
if ($action === 'get_all_collections') {
    require_auth();
    $cfg = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    if (!$radarr) { echo json_encode(['error' => t('err_radarr_not_configured')]); exit; }

    $collections = arr_get($radarr, '/api/v3/collection');
    if (isset($collections['_error'])) { echo json_encode(['error' => $collections['_error']]); exit; }

    $library = arr_get($radarr, '/api/v3/movie');
    $in_library = [];
    if (is_array($library) && !isset($library['_error'])) {
        foreach ($library as $mv) {
            if (!empty($mv['tmdbId'])) $in_library[$mv['tmdbId']] = $mv;
        }
    }

    $base_url = rtrim($radarr['url'], '/');
    $results = [];

    foreach ($collections as $c) {
        $poster = null;
        $fanart = null;
        foreach ($c['images'] ?? [] as $img) {
            if ($img['coverType'] === 'poster') $poster = $img['remoteUrl'] ?? $img['url'] ?? null;
            if ($img['coverType'] === 'fanart') $fanart = $img['remoteUrl'] ?? $img['url'] ?? null;
        }
        if (!$fanart) $fanart = $poster; // Fallback

        $movies = $c['movies'] ?? [];
        if (count($movies) > 0) {
            $mapped_movies = [];
            $downloaded_count = 0;
            $in_lib_count = 0;

            foreach ($movies as $m) {
                $tmdbId = $m['tmdbId'] ?? null;
                $libData = $in_library[$tmdbId] ?? null;
                $inLib = ($libData !== null);
                $hasFile = $inLib ? ($libData['hasFile'] ?? false) : false;
                $sizeOnDisk = $inLib ? round(($libData['sizeOnDisk'] ?? 0) / 1073741824, 1) : 0;

                if ($inLib) $in_lib_count++;
                if ($hasFile) $downloaded_count++;

                $m_poster = null;
                if ($inLib) {
                    $m_poster = $base_url . '/api/v3/mediacover/' . $libData['id'] . '/poster-250.jpg?apikey=' . $radarr['api_key'];
                } else {
                    foreach ($m['images'] ?? [] as $img) {
                        if ($img['coverType'] === 'poster') {
                            $m_poster = $img['remoteUrl'] ?? $img['url'] ?? null;
                            break;
                        }
                    }
                }

                $mapped_movies[] = [
                    'id' => $inLib ? $libData['id'] : null, // Requis pour agir sur les films
                    'tmdbId' => $tmdbId,
                    'title' => $m['title'] ?? '?',
                    'year' => $m['year'] ?? '',
                    'inLib' => $inLib,
                    'hasFile' => $hasFile,
                    'poster' => $m_poster,
                    'sizeOnDisk' => $sizeOnDisk
                ];
            }

            usort($mapped_movies, fn($a, $b) => ($a['year'] ?? 0) - ($b['year'] ?? 0));

            $results[] = [
                'id' => $c['id'],
                'tmdbId' => $c['tmdbId'] ?? 0,
                'title' => $c['title'] ?? '?',
                'overview' => $c['overview'] ?? '',
                'poster' => $poster,
                'fanart' => $fanart,
                'monitored' => $c['monitored'] ?? false,
                'qualityProfileId' => $c['qualityProfileId'] ?? 0,
                'totalMovies' => count($movies),
                'inLibCount' => $in_lib_count,
                'movies' => $mapped_movies
            ];
        }
    }

    usort($results, fn($a, $b) => strcasecmp($a['title'], $b['title']));
    echo json_encode(['success' => true, 'collections' => $results]);
    exit;
}



// ── EDIT COLLECTION (Monitoring & Quality) ────────────────────────────────────
if ($action === 'edit_collection') {
    require_auth();
    $cfg = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    if (!$radarr) { echo json_encode(['error' => t('err_radarr_not_configured')]); exit; }

    $id = (int)($_POST['id'] ?? 0);
    if (!$id) { echo json_encode(['error' => t('err_id_missing')]); exit; }

    // Récupération de la collection ciblée
    $col = arr_get($radarr, "/api/v3/collection/{$id}");
    if (isset($col['_error'])) { echo json_encode(['error' => $col['_error']]); exit; }

    if (isset($_POST['monitored'])) {
        $col['monitored'] = filter_var($_POST['monitored'], FILTER_VALIDATE_BOOLEAN);
    }
    if (isset($_POST['qualityProfileId'])) {
        $col['qualityProfileId'] = (int)$_POST['qualityProfileId'];
    }

    // Sauvegarde
    $res = arr_put_raw($radarr, "/api/v3/collection/{$id}", json_encode($col, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

    if ($res['code'] >= 200 && $res['code'] < 300) {
        echo json_encode(['ok' => true]);
    } else {
        echo json_encode(['error' => t('err_save_failed') . " ({$res['code']})"]);
    }
    exit;
}
