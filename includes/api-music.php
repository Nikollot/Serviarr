<?php
// ===== Serviarr - api-music.php =====
// Intégration Lidarr : artistes (≈ séries) / albums (≈ saisons) / pistes (≈ épisodes)

if ($action === 'add_artist') {
    $cfg    = load_config();
    $lidarr = find_app_by_driver($cfg, 'lidarr');
    if (!$lidarr) { echo json_encode(['error' => t('err_lidarr_not_configured')]); exit; }

    $mbId = trim($_POST['mbId'] ?? '');
    if (!$mbId) { echo json_encode(['error' => t('err_artist_id_missing')]); exit; }

    $lookup = arr_get($lidarr, "/api/v1/artist/lookup?term=lidarr:" . urlencode($mbId));
    if (isset($lookup['_error']) || empty($lookup[0]['artistName'])) {
        echo json_encode(['error' => t('err_artist_not_found_skyhook')]); exit;
    }
    $artist = $lookup[0];

    $rootPath = $_POST['rootFolderPath'] ?? '/music';
    $profileId = (int)($_POST['qualityProfileId'] ?? 1);
    $metadataProfileId = (int)($_POST['metadataProfileId'] ?? 1);
    $search = filter_var($_POST['search'] ?? 'true', FILTER_VALIDATE_BOOLEAN);

    $body = array_merge($artist, [
        'rootFolderPath'     => $rootPath,
        'qualityProfileId'   => $profileId,
        'metadataProfileId'  => $metadataProfileId,
        'monitored'          => true,
        'addOptions'         => ['searchForMissingAlbums' => $search, 'monitor' => 'all'],
    ]);
    if (!empty($_POST['path'])) {
        $body['path'] = $_POST['path'];
    }

    $res = arr_post($lidarr, '/api/v1/artist', $body);
    if (isset($res['_error'])) { echo json_encode(['error' => $res['_error']]); exit; }
    if (isset($res['message'])) { echo json_encode(['error' => $res['message']]); exit; }

    clear_media_caches('artist');
    log_activity('add_artist', 'artist', $res['id'] ?? null, $res['artistName'] ?? '?');

    echo json_encode(['ok' => true, 'title' => $res['artistName'] ?? '?', 'id' => $res['id'] ?? null]);
    exit;
}

// Aperçu d'un artiste pas encore ajouté (équivalent de tmdb_serie_detail, mais via MusicBrainz/Lidarr)
if ($action === 'mb_artist_detail') {
    require_auth();
    $cfg    = load_config();
    $lidarr = find_app_by_driver($cfg, 'lidarr');
    if (!$lidarr) { echo json_encode(['error' => t('err_lidarr_not_configured')]); exit; }

    $mbId = trim($_GET['mbId'] ?? '');
    if (!$mbId) { echo json_encode(['error' => t('err_artistid_missing')]); exit; }

    $lookup = arr_get($lidarr, "/api/v1/artist/lookup?term=lidarr:" . urlencode($mbId));
    if (isset($lookup['_error']) || empty($lookup[0]['artistName'])) {
        echo json_encode(['error' => t('err_artist_not_found_api')]); exit;
    }
    $artist = $lookup[0];

    $poster_url = null;
    $fanart_url = null;
    foreach ($artist['images'] ?? [] as $img) {
        if ($img['coverType'] === 'poster') $poster_url = $img['remoteUrl'] ?? $img['url'] ?? null;
        if ($img['coverType'] === 'fanart') $fanart_url = $img['remoteUrl'] ?? $img['url'] ?? null;
    }

    echo json_encode([
        'mbId'       => $mbId,
        'artistName' => $artist['artistName'] ?? '?',
        'overview'   => $artist['overview'] ?? '',
        'genres'     => $artist['genres'] ?? [],
        'rating'     => round($artist['ratings']['value'] ?? 0, 1),
                     'disambiguation' => $artist['disambiguation'] ?? '',
                     'poster'     => $poster_url,
                     'fanart'     => $fanart_url,
                     'albumCount' => count($artist['albums'] ?? []),
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_IGNORE);
    exit;
}

if ($action === 'library_artists') {
    $cfg    = load_config();
    $lidarr = find_app_by_driver($cfg, 'lidarr');
    if (!$lidarr) { echo json_encode(['error' => t('err_lidarr_not_configured')]); exit; }

    $q      = strtolower($_GET['q'] ?? '');
    $filter = $_GET['filter'] ?? 'all';

    $allArtists = arr_get($lidarr, '/api/v1/artist');
    if (isset($allArtists['_error'])) { echo json_encode(['error' => $allArtists['_error']]); exit; }

    $baseUrl = rtrim($lidarr['url'], '/');
    $artists = [];
    foreach ($allArtists as $a) {
        $title = $a['artistName'] ?? '?';
        if ($q && strpos(strtolower($title), $q) === false) continue;

        $pct = round($a['statistics']['percentOfTracks'] ?? 0);
        if ($filter === 'complete' && $pct < 100) continue;
        if ($filter === 'incomplete' && $pct >= 100) continue;

        $posterUrl = $baseUrl . '/api/v1/mediacover/' . $a['id'] . '/poster-250.jpg?apikey=' . $lidarr['api_key'];

        $artists[] = [
            'id'        => $a['id'],
            'title'     => $title,
            'poster'    => 'api.php?action=proxy_image&url=' . urlencode($posterUrl),
            'monitored' => $a['monitored'] ?? false,
            'pct'       => $pct,
            'albumCount'=> $a['statistics']['albumCount'] ?? 0,
            'ended'     => ($a['status'] ?? '') === 'ended',
        ];
    }

    usort($artists, fn($x, $y) => strcasecmp($x['title'], $y['title']));
    echo json_encode(['artists' => $artists, 'total' => count($artists)]);
    exit;
}

if ($action === 'artist_detail') {
    $cfg    = load_config();
    $lidarr = find_app_by_driver($cfg, 'lidarr');
    if (!$lidarr) { echo json_encode(['error' => t('err_lidarr_not_configured')]); exit; }
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { echo json_encode(['error' => t('err_id_missing')]); exit; }

    $a = arr_get($lidarr, "/api/v1/artist/$id");
    if (isset($a['_error'])) { echo json_encode(['error' => $a['_error']]); exit; }
    if (isset($a['message'])) { echo json_encode(['error' => t('err_artist_not_in_library')]); exit; }

    $poster_url = rtrim($lidarr['url'], '/') . '/api/v1/mediacover/' . $a['id'] . '/poster.jpg?apikey=' . $lidarr['api_key'];
    $fanart_url = rtrim($lidarr['url'], '/') . '/api/v1/mediacover/' . $a['id'] . '/fanart.jpg?apikey=' . $lidarr['api_key'];

    // Fichiers pistes pour ce artiste (pour retrouver taille/qualité/detail par fichier)
    $trackFiles = arr_get($lidarr, "/api/v1/trackfile?artistId=$id");
    $fileMap = [];
    if (is_array($trackFiles) && !isset($trackFiles['_error'])) {
        foreach ($trackFiles as $tf) {
            $mi = $tf['mediaInfo'] ?? [];
            $fileMap[$tf['id']] = [
                'id'         => $tf['id'] ?? 0,
                'path'       => $tf['path'] ?? '',
                'quality'    => $tf['quality']['quality']['name'] ?? '?',
                'size'       => round(($tf['size'] ?? 0) / 1048576, 1) . ' MB',
                'audioCodec' => $mi['audioCodec'] ?? '?',
                'audioBitRate' => isset($mi['audioBitrate']) ? round($mi['audioBitrate'] / 1000) . ' Kbps' : '?',
                'audioChannels'=> $mi['audioChannels'] ?? '?',
                'sampleRate' => $mi['audioSampleRate'] ?? '?',
            ];
        }
    }

    // Files d'attente en cours pour cet artiste
    $queue = arr_get($lidarr, "/api/v1/queue?artistId=$id&pageSize=100");
    $downloading_tracks = [];
    if (is_array($queue) && isset($queue['records'])) {
        foreach ($queue['records'] as $q) {
            $albumId = $q['albumId'] ?? null;
            if ($albumId) {
                $size = $q['size'] ?? 0;
                $sizeleft = $q['sizeleft'] ?? 0;
                $pct = $size > 0 ? (100 - round(($sizeleft / $size) * 100)) : 0;
                $timeleft = $q['timeleft'] ?? '';
                if (strpos($timeleft, '.') !== false) $timeleft = explode('.', $timeleft)[0];
                $downloading_tracks[$albumId] = [
                    'pct' => max(0, min(100, $pct)),
                    'status' => $q['status'] ?? 'Downloading',
                    'timeleft' => $timeleft
                ];
            }
        }
    }

    // Albums de cet artiste
    $albumsRaw = arr_get($lidarr, "/api/v1/album?artistId=$id");
    $tracks = arr_get($lidarr, "/api/v1/track?artistId=$id");
    $tracksByAlbum = [];
    if (is_array($tracks) && !isset($tracks['_error'])) {
        foreach ($tracks as $tr) {
            $albId = $tr['albumId'] ?? 0;
            $fileId = $tr['trackFileId'] ?? 0;
            $tracksByAlbum[$albId][] = [
                'id'        => $tr['id'],
                'track'     => $tr['trackNumber'] ?? 0,
                'title'     => $tr['title'] ?? '?',
                'duration'  => $tr['duration'] ?? 0,
                'hasFile'   => $tr['hasFile'] ?? false,
                'monitored' => $tr['monitored'] ?? false,
                'fileId'    => $fileId,
                'file_details' => $fileMap[$fileId] ?? null,
            ];
        }
    }

    $albums = [];
    if (is_array($albumsRaw) && !isset($albumsRaw['_error'])) {
        foreach ($albumsRaw as $alb) {
            $albId = $alb['id'];
            $albumPoster = null;
            foreach ($alb['images'] ?? [] as $img) {
                if ($img['coverType'] === 'cover') { $albumPoster = $img['remoteUrl'] ?? $img['url'] ?? null; break; }
            }
            $albums[] = [
                'id'            => $albId,
                'title'         => $alb['title'] ?? '?',
                'type'          => $alb['albumType'] ?? '',
                'releaseDate'   => substr($alb['releaseDate'] ?? '', 0, 10),
                'monitored'     => $alb['monitored'] ?? false,
                'total'         => $alb['statistics']['totalTrackCount'] ?? count($tracksByAlbum[$albId] ?? []),
                'have'          => $alb['statistics']['trackFileCount'] ?? 0,
                'pct'           => round($alb['statistics']['percentOfTracks'] ?? 0),
                'poster'        => $albumPoster,
                'tracks'        => $tracksByAlbum[$albId] ?? [],
                'download_info' => $downloading_tracks[$albId] ?? null,
            ];
        }
    }
    usort($albums, fn($x, $y) => strcmp($y['releaseDate'], $x['releaseDate']));

    $profiles = arr_get($lidarr, '/api/v1/qualityprofile');
    $profileName = t('profile_unknown');
    if (is_array($profiles) && !isset($profiles['_error'])) {
        foreach ($profiles as $p) {
            if ($p['id'] == ($a['qualityProfileId'] ?? 0)) { $profileName = $p['name']; break; }
        }
    }

    $added = !empty($a['added']) ? date('d/m/Y', strtotime($a['added'])) : t('status_unknown');

    echo json_encode([
        'id'        => $a['id'],
        'mbId'      => $a['foreignArtistId'] ?? null,
        'title'     => $a['artistName'] ?? '?',
        'poster'    => $poster_url,
        'fanart'    => $fanart_url,
        'overview'  => $a['overview'] ?? '',
        'status'    => $a['status'] ?? '?',
        'rating'    => round($a['ratings']['value'] ?? 0, 1),
                     'genres'    => $a['genres'] ?? [],
                     'albums'    => $albums,
                     'pct'       => round($a['statistics']['percentOfTracks'] ?? 0),
                     'monitored' => $a['monitored'] ?? false,
                     'qualityProfileId' => $a['qualityProfileId'] ?? 0,
                     'qualityProfileName' => $profileName,
                     'added'     => $added,
                     'appUrl'    => rtrim($lidarr['url'], '/'),
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_IGNORE);
    exit;
}

if ($action === 'album_releases') {
    $cfg    = load_config();
    $lidarr = find_app_by_driver($cfg, 'lidarr');
    if (!$lidarr) { echo json_encode(['error' => t('err_lidarr_not_configured')]); exit; }
    $albumId = (int)($_GET['albumId'] ?? 0);
    if (!$albumId) { echo json_encode(['error' => t('err_albumid_missing')]); exit; }

    $data = arr_get($lidarr, "/api/v1/release?albumId=$albumId");
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
            'infoUrl'    => $r['infoUrl'] ?? '',
            'customScore'=> $r['customFormatScore'] ?? 0,
        ];
    }
    usort($releases, fn($a, $b) => $b['seeders'] - $a['seeders']);
    echo json_encode(['releases' => $releases]);
    exit;
}

if ($action === 'album_download') {
    $cfg    = load_config();
    $lidarr = find_app_by_driver($cfg, 'lidarr');
    if (!$lidarr) { echo json_encode(['error' => t('err_lidarr_not_configured')]); exit; }
    $guid      = $_POST['guid']      ?? '';
    $indexerId = (int)($_POST['indexerId'] ?? 0);
    $albumId   = (int)($_POST['albumId']  ?? 0);
    if (!$guid || !$albumId) { echo json_encode(['error' => t('err_params_missing')]); exit; }

    $res = arr_post($lidarr, '/api/v1/release', ['guid' => $guid, 'indexerId' => $indexerId, 'albumId' => $albumId]);
    if (isset($res['_error'])) { echo json_encode(['error' => $res['_error']]); exit; }
    echo json_encode(['ok' => true]);
    exit;
}

if ($action === 'album_search_auto') {
    $cfg    = load_config();
    $lidarr = find_app_by_driver($cfg, 'lidarr');
    if (!$lidarr) { echo json_encode(['error' => t('err_lidarr_not_configured')]); exit; }
    $albumId = (int)($_POST['albumId'] ?? 0);
    if (!$albumId) { echo json_encode(['error' => t('err_albumid_missing')]); exit; }

    $res = arr_post($lidarr, '/api/v1/command', ['name' => 'AlbumSearch', 'albumIds' => [$albumId]]);
    if (isset($res['_error'])) { echo json_encode(['error' => $res['_error']]); exit; }
    echo json_encode(['ok' => true]);
    exit;
}

if ($action === 'toggle_album_monitor') {
    $cfg = load_config();
    $albumId = (int)($_POST['albumId'] ?? 0);
    $monitored = filter_var($_POST['monitored'] ?? 'false', FILTER_VALIDATE_BOOLEAN);

    $lidarr = find_app_by_driver($cfg, 'lidarr');
    if (!$lidarr) { echo json_encode(['error' => t('err_lidarr_not_configured')]); exit; }
    if (!$albumId) { echo json_encode(['error' => t('err_albumid_missing')]); exit; }

    // Lidarr expose un endpoint dédié bulk pour monitorer/démonitorer des albums
    $res = arr_put($lidarr, '/api/v1/album/monitor', ['albumIds' => [$albumId], 'monitored' => $monitored]);
    if ($res['code'] < 200 || $res['code'] >= 300) {
        echo json_encode(['error' => "Erreur API Lidarr ({$res['code']})"]); exit;
    }

    clear_media_caches('artist');
    echo json_encode(['ok' => true, 'monitored' => $monitored]);
    exit;
}

if ($action === 'artists_dashboard') {
    require_auth();
    $cfg    = load_config();
    $lidarr = find_app_by_driver($cfg, 'lidarr');
    if (!$lidarr) { echo json_encode(['error' => t('err_lidarr_not_configured')]); exit; }

    $cacheFile = APP_ROOT . '/data/.cache_artists_dashboard.json';
    $cacheLife = 21600;

    if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheLife) {
        header('X-Cache: HIT');
        echo file_get_contents($cacheFile);
        exit;
    }

    $recent = []; $upcoming = [];
    $baseUrl = rtrim($lidarr['url'], '/');

    $historyData = arr_get($lidarr, '/api/v1/history?pageSize=40&sortKey=date&sortDirection=descending&eventType=3&includeArtist=true&includeAlbum=true');
    if (is_array($historyData) && isset($historyData['records'])) {
        foreach ($historyData['records'] as $record) {
            if (isset($record['artist'])) {
                $ar = $record['artist'];
                if (!isset($recent[$ar['id']])) {
                    $posterUrl = $baseUrl . '/api/v1/mediacover/' . $ar['id'] . '/poster-250.jpg?apikey=' . $lidarr['api_key'];
                    $recent[$ar['id']] = [
                        'id' => $ar['id'],
                        'title' => $ar['artistName'],
                        'poster' => 'api.php?action=proxy_image&url=' . urlencode($posterUrl),
                        'is_new' => false
                    ];
                    if (count($recent) >= 15) break;
                }
            }
        }
    }

    $start = date('Y-m-d');
    $end = date('Y-m-d', strtotime('+30 days'));
    $calendarData = arr_get($lidarr, "/api/v1/calendar?start={$start}&end={$end}&includeArtist=true");

    if (is_array($calendarData) && !isset($calendarData['_error'])) {
        foreach ($calendarData as $alb) {
            $arId = $alb['artistId'] ?? null;
            if ($arId && !isset($upcoming[$arId])) {
                $posterUrl = $baseUrl . '/api/v1/mediacover/' . $arId . '/poster-250.jpg?apikey=' . $lidarr['api_key'];
                $titleWithAlbum = ($alb['artist']['artistName'] ?? '?') . ' — ' . ($alb['title'] ?? '?');
                $upcoming[$arId] = [
                    'id' => $arId,
                    'title' => $titleWithAlbum,
                    'poster' => 'api.php?action=proxy_image&url=' . urlencode($posterUrl),
                    'is_new' => false,
                    'release_date' => substr($alb['releaseDate'] ?? '', 0, 10)
                ];
            }
        }
    }

    $finalJson = json_encode([
        'recent' => array_values($recent),
        'upcoming' => array_values($upcoming),
    ]);

    file_put_contents($cacheFile, $finalJson);
    header('X-Cache: MISS');
    echo $finalJson;
    exit;
}
