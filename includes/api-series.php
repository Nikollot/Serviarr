<?php
// ===== Serviarr - api-series.php =====



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
    $search = filter_var($_POST['search'] ?? 'true', FILTER_VALIDATE_BOOLEAN);

    $body = array_merge($serie, [
        'rootFolderPath'   => $rootPath,
        'qualityProfileId' => $profileId,
        'monitored'        => true,
        'seasonFolder'     => true,
        'addOptions'       => ['searchForMissingEpisodes' => $search, 'monitor' => 'all'],
    ]);
    // 🌟 AJOUT : Pour l'import de bibliothèque, on force le chemin exact existant
    if (!empty($_POST['path'])) {
        $body['path'] = $_POST['path'];
    }

    $res = arr_post($sonarr, '/api/v3/series', $body);
    if (isset($res['_error'])) { echo json_encode(['error' => $res['_error']]); exit; }
    if (isset($res['message'])) { echo json_encode(['error' => $res['message']]); exit; }

    clear_media_caches('serie');
    log_activity('add_serie', 'serie', $res['id'] ?? null, $res['title'] ?? '?');

    echo json_encode(['ok' => true, 'title' => $res['title'] ?? '?', 'id' => $res['id'] ?? null]);
    exit;
}



if ($action === 'tmdb_serie_detail') {
    require_auth();
    $cfg    = load_config();
    $sonarr = find_app_by_driver($cfg, 'sonarr');
    if (!$sonarr) { echo json_encode(['error' => t('err_sonarr_not_configured')]); exit; }

    $tmdbId = (int)($_GET['tmdbId'] ?? 0);
    if (!$tmdbId) { echo json_encode(['error' => t('err_tmdbid_missing')]); exit; }

    $lookup = arr_get($sonarr, "/api/v3/series/lookup?term=tmdb:$tmdbId");
    if (isset($lookup['_error']) || empty($lookup[0]['title'])) {
        echo json_encode(['error' => t('err_serie_not_found_api')]); exit;
    }
    $serie = $lookup[0];

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

    $youtubeTrailerId = get_tmdb_trailer('tv', $tmdbId);

    echo json_encode([
        'tmdbId'     => $tmdbId,
        'imdbId'     => $imdbId,
        'tvdbId'     => $serie['tvdbId'] ?? 0,
        'title'      => $serie['title'] ?? '?',
        'year'       => $serie['year'] ?? '',
        'overview'   => $serie['overview'] ?? '',
        'rating'     => round($serie['ratings']['value'] ?? 0, 1),
                     'network'    => $serie['network'] ?? '',
                     'genres'     => $serie['genres'] ?? [],
                     'poster'     => $poster_url,
                     'fanart'     => $fanart_url,
                     'seasons'    => count($serie['seasons'] ?? []),
                     'youtubeTrailerId'=> $youtubeTrailerId
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_IGNORE);
    exit;
}



if ($action === 'library_series') {
    $q      = strtolower($_GET['q'] ?? '');
    $filter = $_GET['filter'] ?? 'all';

    $cacheFile = APP_ROOT . '/data/.cache_library_series.json';
    $all_series = [];

    if (!file_exists($cacheFile)) {
        header('X-Cache: MISS');
        $res = generate_series_cache();
        if ($res !== true) { echo json_encode(['error' => $res]); exit; }
    } else {
        header('X-Cache: HIT');
    }

    if (file_exists($cacheFile)) {
        $all_series = json_decode(file_get_contents($cacheFile), true) ?: [];
    }

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

    $queue = arr_get($sonarr, "/api/v3/queue?seriesId=$id&pageSize=100");
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
    $youtubeTrailerId = null;
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
            $youtubeTrailerId = get_tmdb_trailer('tv', $tmdb_id);

            $credits_url = "https://api.themoviedb.org/3/tv/{$tmdb_id}/credits?api_key={$tmdb_api_key}&language={$TMDB_LANG}";
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
                     'appUrl'    => rtrim($sonarr['url'], '/'),
                     'youtubeTrailerId'=> $youtubeTrailerId ?? $s['youTubeTrailerId'] ?? null
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_IGNORE);
    exit;
}



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



if ($action === 'toggle_season_monitor') {
    $cfg = load_config();
    $seriesId = (int)$_POST['seriesId'];
    $seasonNumber = (int)$_POST['seasonNumber'];
    $monitored = filter_var($_POST['monitored'], FILTER_VALIDATE_BOOLEAN);

    $app = find_app_by_driver($cfg, 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_sonarr_not_configured')]); exit; }

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



if ($action === 'series_dashboard') {
    require_auth();
    $cfg = load_config();
    $sonarr = find_app_by_driver($cfg, 'sonarr');

    if (!$sonarr) {
        echo json_encode(['error' => t('err_sonarr_not_configured')]);
        exit;
    }

    $cacheFile = APP_ROOT . '/data/.cache_series_dashboard.json';
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
    $sonarrIdByTmdb = [];

    if (is_array($allSeries) && !isset($allSeries['_error'])) {
        foreach ($allSeries as $sr) {
            if (!empty($sr['tmdbId'])) {
                $existingTmdbIds[] = $sr['tmdbId'];
                $sonarrIdByTmdb[$sr['tmdbId']] = $sr['id'];
            }
        }
    }

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
                        'is_new' => false,
                        'release_date' => substr($ep['airDateUtc'] ?? $ep['airDate'] ?? '', 0, 10) // 🌟 AJOUT DE LA DATE
                    ];
                }
            }
        }
    }

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

    $tmdbKey = $cfg['tmdb_api_key'] ?? '';
    if (!empty($tmdbKey)) {
        $today = date('Y-m-d');
        $urlUp = "https://api.themoviedb.org/3/discover/tv?api_key={$tmdbKey}&language={$TMDB_LANG}&sort_by=popularity.desc&first_air_date.gte={$today}";
        $chUp = curl_init($urlUp);
        curl_setopt_array($chUp, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 3]);
        $resUp = curl_exec($chUp);
        curl_close($chUp);
        $dataUp = json_decode($resUp, true);
        foreach ($dataUp['results'] ?? [] as $s) {
            if (!empty($s['poster_path'])) {
                $tmdbId = $s['id'];
                $is_in_lib = in_array($tmdbId, $existingTmdbIds);
                $upcoming_series[] = [
                    'id' => $is_in_lib ? $sonarrIdByTmdb[$tmdbId] : 'tmdb_' . $tmdbId,
                    'tmdbId' => $tmdbId,
                    'title' => $s['name'],
                    'poster' => 'https://image.tmdb.org/t/p/w500' . $s['poster_path'],
                    'is_new' => !$is_in_lib,
                    'release_date' => $s['first_air_date'] ?? '' // 🌟 AJOUT DE LA DATE
                ];
                if (count($upcoming_series) >= 15) break;
            }
        }

        $urlPop = "https://api.themoviedb.org/3/discover/tv?api_key={$tmdbKey}&language={$TMDB_LANG}&sort_by=popularity.desc&vote_count.gte=10";
        $chPop = curl_init($urlPop);
        curl_setopt_array($chPop, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 3]);
        $resPop = curl_exec($chPop);
        curl_close($chPop);
        $dataPop = json_decode($resPop, true);
        foreach ($dataPop['results'] ?? [] as $s) {
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
