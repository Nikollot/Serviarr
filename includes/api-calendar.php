<?php
// ===== Serviarr - api-calendar.php =====



// ── CALENDRIER ──────────────────────────────────────────────────────────────────
if ($action === 'calendar') {
    $cfg   = load_config();
    $start = $_GET['start'] ?? date('Y-m-01');
    $end   = $_GET['end']   ?? date('Y-m-t');
    $events = [];

    $sonarr = find_app_by_driver($cfg, 'sonarr');
    if ($sonarr) {
        $base_url = rtrim($sonarr['url'], '/');
        $data = arr_get($sonarr, "/api/v3/calendar?start=$start&end=$end&includeSeries=true");
        if (is_array($data) && !isset($data['_error'])) {
            foreach ($data as $ep) {
                $seriesId = $ep['series']['id'] ?? null;
                $poster = $seriesId ? $base_url . '/api/v3/mediacover/' . $seriesId . '/poster-250.jpg?apikey=' . $sonarr['api_key'] : null;

                $events[] = [
                    'type'    => 'episode',
                    'date'    => substr($ep['airDateUtc'] ?? $ep['airDate'] ?? '', 0, 10),
                    'title'   => $ep['series']['title'] ?? '?',
                    'sub'     => 'S' . str_pad($ep['seasonNumber'] ?? 0, 2, '0', STR_PAD_LEFT) . 'E' . str_pad($ep['episodeNumber'] ?? 0, 2, '0', STR_PAD_LEFT) . ' · ' . ($ep['title'] ?? ''),
                    'poster'  => $poster,
                    'grabbed' => $ep['hasFile'] ?? false,
                    'seriesId' => $seriesId
                ];
            }
        }
    }

    $radarr = find_app_by_driver($cfg, 'radarr');
    if ($radarr) {
        $base_url = rtrim($radarr['url'], '/');
        $data = arr_get($radarr, "/api/v3/calendar?start=$start&end=$end");
        if (is_array($data) && !isset($data['_error'])) {
            foreach ($data as $mv) {
                $movieId = $mv['id'] ?? null;
                $poster = $movieId ? $base_url . '/api/v3/mediacover/' . $movieId . '/poster-250.jpg?apikey=' . $radarr['api_key'] : null;

                $cinemas  = !empty($mv['inCinemas'])        ? substr($mv['inCinemas'], 0, 10) : null;
                $digital  = !empty($mv['digitalRelease'])   ? substr($mv['digitalRelease'], 0, 10) : null;
                $physical = !empty($mv['physicalRelease'])  ? substr($mv['physicalRelease'], 0, 10) : null;

                $today = null;
                $releaseType = 'Attendu';
                foreach ([
                    $cinemas  => '🎬 Cinéma',
                    $digital  => '💻 Digital',
                    $physical => '📦 Physique',
                ] as $date => $label) {
                    if ($date && $date >= $start && $date <= $end) {
                        if ($today === null || $date < $today) {
                            $today = $date;
                            $releaseType = $label;
                        }
                    }
                }

                if ($today === null) {
                    $today = $cinemas ?? $digital ?? $physical ?? '';
                    if ($cinemas)  $releaseType = '🎬 Cinéma';
                    elseif ($digital)  $releaseType = '💻 Digital';
                    elseif ($physical) $releaseType = '📦 Physique';
                }

                if ($mv['hasFile'] ?? false) $releaseType .= ' · ✅ Disponible';

                if (empty($today)) continue;

                $events[] = [
                    'type'        => 'movie',
                    'date'        => $today,
                    'title'       => $mv['title'] ?? '?',
                    'sub'         => ($mv['year'] ?? '') . ' · ' . $releaseType,
                    'releaseType' => $releaseType,
                    'poster'      => $poster,
                    'grabbed'     => $mv['hasFile'] ?? false,
                    'radarrId'    => $mv['id'] ?? null,
                ];
            }
        }
    }

    usort($events, fn($a, $b) => strcmp($a['date'], $b['date']));
    echo json_encode(['events' => $events]);
    exit;
}



// ── RECENT DOWNLOADS ──────────────────────────────────────────────────────────
if ($action === 'recent_downloads') {
    $cfg   = load_config();
    $items = [];

    $radarr = find_app_by_driver($cfg, 'radarr');
    if ($radarr) {
        $data = arr_get($radarr, '/api/v3/history?pageSize=8&sortKey=date&sortDirection=descending&eventType=3');
        if (isset($data['records'])) {
            foreach ($data['records'] as $r) {
                $items[] = [
                    'type'    => 'film',
                    'title'   => $r['movie']['title'] ?? $r['sourceTitle'] ?? '?',
                    'date'    => substr($r['date'] ?? '', 0, 10),
                    'quality' => $r['quality']['quality']['name'] ?? '?',
                ];
            }
        }
    }

    $sonarr = find_app_by_driver($cfg, 'sonarr');
    if ($sonarr) {
        $data = arr_get($sonarr, '/api/v3/history?pageSize=8&sortKey=date&sortDirection=descending&eventType=3&includeSeries=true&includeEpisode=true');
        if (isset($data['records'])) {
            foreach ($data['records'] as $r) {
                $seriesTitle = $r['series']['title'] ?? $r['sourceTitle'] ?? '?';
                $seasonNum   = $r['episode']['seasonNumber'] ?? null;
                $episodeNum  = $r['episode']['episodeNumber'] ?? null;
                $ep = ($seasonNum !== null && $episodeNum !== null)
                ? ' · S' . str_pad($seasonNum, 2, '0', STR_PAD_LEFT) . 'E' . str_pad($episodeNum, 2, '0', STR_PAD_LEFT)
                : '';
                $items[] = [
                    'type'    => 'série',
                    'title'   => $seriesTitle . $ep,
                    'date'    => substr($r['date'] ?? '', 0, 10),
                    'quality' => $r['quality']['quality']['name'] ?? '?',
                ];
            }
        }
    }

    usort($items, fn($a, $b) => strcmp($b['date'], $a['date']));
    echo json_encode(['items' => array_slice($items, 0, 12)]);
    exit;
}



// ── RECOMMANDATIONS ───────────────────────────────────────────────────────────
if ($action === 'recommendations') {
    $cfg   = load_config();
    $items = [];

    $radarr = find_app_by_driver($cfg, 'radarr');
    if ($radarr) {
        $data = arr_get($radarr, '/api/v3/movie?pageSize=300');
        if (is_array($data) && !isset($data['_error'])) {
            foreach ($data as $mv) {
                if (!($mv['hasFile'] ?? false) && ($mv['ratings']['tmdb']['value'] ?? 0) >= 6.5 && !empty($mv['overview'])) {
                    $items[] = [
                        'type'     => 'film',
                        'title'    => $mv['title'] ?? '?',
                        'year'     => $mv['year'] ?? '',
                        'overview' => substr($mv['overview'] ?? '', 0, 150) . '…',
                        'rating'   => round($mv['ratings']['tmdb']['value'] ?? 0, 1),
                        'tmdbId'   => $mv['tmdbId'] ?? null,
                        'has_file' => false,
                    ];
                }
            }
        }
    }

    $sonarr = find_app_by_driver($cfg, 'sonarr');
    if ($sonarr) {
        $data = arr_get($sonarr, '/api/v3/series');
        if (is_array($data) && !isset($data['_error'])) {
            foreach ($data as $s) {
                if (($s['statistics']['percentOfEpisodes'] ?? 100) < 80 && ($s['ratings']['value'] ?? 0) >= 6) {
                    $items[] = [
                        'type'     => 'série',
                        'title'    => $s['title'] ?? '?',
                        'year'     => $s['year'] ?? '',
                        'overview' => substr($s['overview'] ?? '', 0, 150) . '…',
                        'rating'   => round($s['ratings']['value'] ?? 0, 1),
                        'tmdbId'   => null,
                        'has_file' => false,
                    ];
                }
            }
        }
    }

    shuffle($items);
    echo json_encode(['items' => array_slice($items, 0, 12)]);
    exit;
}



// ── GET RECENT MOVIES ─────────────────────────────────────────────────────────
if ($action === 'get_recent_movies') {
    require_auth();
    $cfg = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    if (!$radarr) { echo json_encode(['error' => t('err_radarr_not_configured')]); exit; }

    $url = rtrim($radarr['url'], '/') . '/api/v3/movie?apikey=' . $radarr['api_key'];
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 5]);
    $response = curl_exec($ch);
    curl_close($ch);

    $movies = json_decode($response, true);
    if (!is_array($movies)) { echo json_encode(['error' => t('err_radarr_unreachable')]); exit; }

    $downloaded = array_filter($movies, function($m) { return isset($m['hasFile']) && $m['hasFile'] === true; });
    usort($downloaded, function($a, $b) {
        $dateA = strtotime($a['movieFile']['dateAdded'] ?? $a['added']);
        $dateB = strtotime($b['movieFile']['dateAdded'] ?? $b['added']);
        return $dateB <=> $dateA;
    });

    $recent = array_slice($downloaded, 0, 12);
    $results = [];
    $base_url = rtrim($radarr['url'], '/');
    foreach ($recent as $m) {
        $results[] = [
            'id'     => $m['id'],
            'title'  => $m['title'],
            'year'   => $m['year'] ?? '',
            'poster' => $base_url . '/api/v3/mediacover/' . $m['id'] . '/poster-250.jpg?apikey=' . $radarr['api_key']
        ];
    }
    echo json_encode(['movies' => $results]);
    exit;
}
