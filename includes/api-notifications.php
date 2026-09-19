<?php
// ===== Serviarr - api-notifications.php =====

// ── NOTIFICATIONS INTÉGRÉES ───────────────────────────────────────────────────
if ($action === 'get_notifications_list') {
    require_auth();
    $cfg = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    $sonarr = find_app_by_driver($cfg, 'sonarr');
    $notifs = [];

    if ($radarr) {
        $allMovies = arr_get($radarr, '/api/v3/movie');
        $moviesById = [];
        if (is_array($allMovies) && !isset($allMovies['_error'])) {
            foreach ($allMovies as $m) { $moviesById[$m['id']] = $m['title']; }
        }

        $h = arr_get($radarr, '/api/v3/history?pageSize=200&sortKey=date&sortDirection=descending&eventType=3');
        $baseUrl = rtrim($radarr['url'], '/');

        if (!empty($h['records'])) {
            $seenMovies = [];
            foreach ($h['records'] as $r) {
                $movieId = $r['movieId'] ?? ($r['movie']['id'] ?? null);
                if (!$movieId || isset($seenMovies[$movieId])) continue;
                $seenMovies[$movieId] = true;

                $title = $moviesById[$movieId] ?? $r['movie']['title'] ?? $r['sourceTitle'] ?? 'Film inconnu';
                $posterUrl = $baseUrl . '/api/v3/mediacover/' . $movieId . '/poster-250.jpg?apikey=' . $radarr['api_key'];
                $notifs[] = ['type' => 'movie', 'id' => $movieId, 'title' => $title, 'date' => $r['date'], 'poster' => 'api.php?action=proxy_image&url=' . urlencode($posterUrl)];
            }
        }
    }

    if ($sonarr) {
        $h = arr_get($sonarr, '/api/v3/history?pageSize=200&sortKey=date&sortDirection=descending&eventType=3&includeSeries=true&includeEpisode=true');
        $baseUrl = rtrim($sonarr['url'], '/');

        if (!empty($h['records'])) {
            $seenEpisodes = [];
            foreach ($h['records'] as $r) {
                $serieId = $r['series']['id'] ?? null;
                $episodeId = $r['episodeId'] ?? ($r['episode']['id'] ?? null);
                if (!$serieId || !$episodeId || isset($seenEpisodes[$episodeId])) continue;
                $seenEpisodes[$episodeId] = true;

                $title = ($r['series']['title'] ?? 'Série') . ' - ' . ($r['episode']['title'] ?? 'Épisode');
                $posterUrl = $baseUrl . '/api/v3/mediacover/' . $serieId . '/poster-250.jpg?apikey=' . $sonarr['api_key'];
                $notifs[] = ['type' => 'serie', 'id' => $serieId, 'title' => $title, 'date' => $r['date'], 'poster' => 'api.php?action=proxy_image&url=' . urlencode($posterUrl)];
            }
        }
    }

    usort($notifs, fn($a, $b) => strtotime($b['date']) - strtotime($a['date']));
    echo json_encode(array_slice($notifs, 0, 100));
    exit;
}

// ── WEBHOOK SILENCIEUX (Mise à jour du cache uniquement) ──────────────────────
if ($action === 'webhook_notif') {
    $expected_token = get_webhook_token();
    if (!hash_equals($expected_token, $_GET['token'] ?? '')) {
        error_log("Serviarr webhook_notif : token invalide, requête rejetée (403)");
        http_response_code(403);
        exit('Forbidden');
    }

    session_write_close();

    $raw_input = file_get_contents('php://input');
    $input = json_decode($raw_input, true);

    if (!$input) exit('OK');

    // On purge simplement les caches de l'application selon l'origine du webhook
    if (isset($input['movie'])) {
        clear_media_caches('movie');
    } elseif (isset($input['series'])) {
        clear_media_caches('serie');
    }

    exit('OK');
}
