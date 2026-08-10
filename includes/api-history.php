<?php
// ===== Serviarr - api-history.php =====



// ── HISTORIQUE DE TÉLÉCHARGEMENT ──────────────────────────────────────────────
if ($action === 'get_history') {
    require_auth();
    $cfg = load_config();
    $type = $_GET['type'] ?? 'movie';

    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }

    // On récupère les 100 derniers événements
    if ($type === 'movie') {
        $endpoint = '/api/v3/history?pageSize=100&sortKey=date&sortDirection=descending';
    } else {
        $endpoint = '/api/v3/history?pageSize=100&sortKey=date&sortDirection=descending&includeSeries=true&includeEpisode=true';
    }

    $data = arr_get($app, $endpoint);
    if (isset($data['_error'])) { echo json_encode(['error' => $data['_error']]); exit; }

    $history = [];
    if (isset($data['records'])) {
        foreach ($data['records'] as $r) {
            $title = '';
            // Formatage intelligent du titre selon Radarr ou Sonarr
            if ($type === 'movie') {
                $title = $r['movie']['title'] ?? $r['sourceTitle'] ?? 'Inconnu';
            } else {
                $seriesTitle = $r['series']['title'] ?? $r['sourceTitle'] ?? 'Série inconnue';
                $seasonNum = $r['episode']['seasonNumber'] ?? null;
                $episodeNum = $r['episode']['episodeNumber'] ?? null;
                $epStr = ($seasonNum !== null && $episodeNum !== null)
                ? ' · S' . str_pad($seasonNum, 2, '0', STR_PAD_LEFT) . 'E' . str_pad($episodeNum, 2, '0', STR_PAD_LEFT)
                : '';
                $title = $seriesTitle . $epStr;
            }

            $history[] = [
                'id'          => $r['id'],
                'movieId'     => $r['movieId'] ?? ($r['movie']['id'] ?? null), // 🌟 AJOUT DE L'ID FILM
                'seriesId'    => $r['seriesId'] ?? ($r['series']['id'] ?? null), // 🌟 AJOUT DE L'ID SÉRIE
                'title'       => $title,
                'sourceTitle' => $r['sourceTitle'] ?? $title,
                'eventType'   => $r['eventType'] ?? 'unknown',
                'date'        => $r['date'] ?? '',
                'quality'     => $r['quality']['quality']['name'] ?? '?'
            ];
        }
    }

    echo json_encode(['success' => true, 'history' => $history], JSON_UNESCAPED_UNICODE);
    exit;
}



// ── STATISTIQUES SERVEUR (Espace Disque) ──────────────────────────────────────
if ($action === 'server_stats') {
    require_auth();
    $cfg = load_config();

    $disks_map = [];

    // 1. On interroge Radarr
    $radarr = find_app_by_driver($cfg, 'radarr');
    if ($radarr) {
        $diskspace = arr_get($radarr, '/api/v3/diskspace');
        if (is_array($diskspace) && !isset($diskspace['_error'])) {
            foreach($diskspace as $d) {
                // On utilise le chemin comme clé pour éviter les doublons
                $disks_map[$d['path']] = [
                    'path' => $d['path'],
                    'free' => $d['freeSpace'],
                    'total' => $d['totalSpace']
                ];
            }
        }
    }

    // 2. On interroge Sonarr (pour récupérer les disques exclusifs aux séries, ex: /tv)
    $sonarr = find_app_by_driver($cfg, 'sonarr');
    if ($sonarr) {
        $diskspace = arr_get($sonarr, '/api/v3/diskspace');
        if (is_array($diskspace) && !isset($diskspace['_error'])) {
            foreach($diskspace as $d) {
                $disks_map[$d['path']] = [
                    'path' => $d['path'],
                    'free' => $d['freeSpace'],
                    'total' => $d['totalSpace']
                ];
            }
        }
    }

    if (empty($disks_map)) {
        echo json_encode(['error' => 'Impossible de récupérer les disques. Vérifiez la connexion à Radarr/Sonarr.']);
        exit;
    }

    // On convertit le tableau fusionné pour le renvoyer proprement
    $disks = array_values($disks_map);

    // On trie les disques par ordre alphabétique pour un bel affichage
    usort($disks, function($a, $b) { return strcmp($a['path'], $b['path']); });

    echo json_encode(['success' => true, 'disks' => $disks]);
    exit;
}



// ── STATISTIQUES SERVEUR (Historique DL) ──────────────────────────────────────
if ($action === 'server_dl_stats') {
    require_auth();
    $cfg = load_config();

    $radarr = find_app_by_driver($cfg, 'radarr');
    $sonarr = find_app_by_driver($cfg, 'sonarr');

    // Initialise un tableau pour les 7 derniers jours (à 0 octet)
    $seven_days_ago = strtotime('-6 days 00:00:00');
    $days = [];
    for ($i = 6; $i >= 0; $i--) {
        $days[date('Y-m-d', strtotime("-$i days"))] = 0;
    }

    // 1. RADARR : On récupère tous les films et on filtre ceux ajoutés cette semaine
    if ($radarr) {
        $movies = arr_get($radarr, '/api/v3/movie');
        if (is_array($movies) && !isset($movies['_error'])) {
            foreach ($movies as $m) {
                if (!empty($m['hasFile']) && isset($m['movieFile'])) {
                    $added = strtotime($m['movieFile']['dateAdded'] ?? '');
                    if ($added >= $seven_days_ago) {
                        $day_key = date('Y-m-d', $added);
                        if (isset($days[$day_key])) {
                            $days[$day_key] += $m['movieFile']['size'] ?? 0;
                        }
                    }
                }
            }
        }
    }

    // 2. SONARR : On regarde l'historique pour trouver quelles séries ont été téléchargées cette semaine
    if ($sonarr) {
        $history = arr_get($sonarr, '/api/v3/history?page=1&pageSize=200&eventType=3'); // eventType=3 (Dossier Importé)
        $active_series = [];

        if (is_array($history) && isset($history['records'])) {
            foreach ($history['records'] as $record) {
                $added = strtotime($record['date'] ?? '');
                if ($added >= $seven_days_ago && isset($record['seriesId'])) {
                    $active_series[$record['seriesId']] = true; // Stocke l'ID de la série
                }
            }
        }

        // On interroge uniquement les fichiers des séries actives de la semaine (Très rapide !)
        foreach (array_keys($active_series) as $seriesId) {
            $epFiles = arr_get($sonarr, "/api/v3/episodefile?seriesId=$seriesId");
            if (is_array($epFiles) && !isset($epFiles['_error'])) {
                foreach ($epFiles as $ef) {
                    $added = strtotime($ef['dateAdded'] ?? '');
                    if ($added >= $seven_days_ago) {
                        $day_key = date('Y-m-d', $added);
                        if (isset($days[$day_key])) {
                            $days[$day_key] += $ef['size'] ?? 0;
                        }
                    }
                }
            }
        }
    }

    $total = array_sum($days);
    $chart_data = [];
    foreach ($days as $date => $size) {
        $chart_data[] = [
            'date' => $date,
            'size' => $size
        ];
    }

    echo json_encode(['success' => true, 'total' => $total, 'chart' => $chart_data]);
    exit;
}



// ── STATISTIQUES SERVEUR (Historique Chronologique Unifié & Dédoublonné) ────
if ($action === 'server_detailed_history') {
    require_auth();
    $cfg = load_config();

    $seven_days_ago = strtotime('-7 days 00:00:00');
    $raw_history_list = [];

    // 1. RADARR (Films individuels)
    $radarr = find_app_by_driver($cfg, 'radarr');
    if ($radarr) {
        $movies_map = [];
        $all_movies = arr_get($radarr, '/api/v3/movie');
        if (is_array($all_movies) && !isset($all_movies['_error'])) {
            foreach ($all_movies as $m) {
                if (isset($m['id'])) $movies_map[$m['id']] = $m;
            }
        }

        $h = arr_get($radarr, '/api/v3/history?page=1&pageSize=100&eventType=3');
        if (is_array($h) && isset($h['records'])) {
            foreach ($h['records'] as $r) {
                $added = strtotime($r['date'] ?? '');
                if ($added >= $seven_days_ago) {
                    $m_id = $r['movieId'] ?? 0;
                    $movie = $movies_map[$m_id] ?? null;

                    $m_title = $movie['title'] ?? $r['sourceTitle'] ?? t('unknown_movie');

                    // 🌟 FIX : Construction manuelle sécurisée pour le Proxy
                    $url = $radarr['url'] ?? '';
                    $apikey = $radarr['api_key'] ?? '';
                    if ($m_id > 0 && !empty($url) && !empty($apikey)) {
                        $raw_poster = rtrim($url, '/') . '/api/v3/mediacover/' . $m_id . '/poster-250.jpg?apikey=' . $apikey;
                        $poster = 'api.php?action=proxy_image&url=' . urlencode($raw_poster);
                    } else {
                        $poster = 'assets/img/default_poster.png';
                    }

                    $unique_key = 'movie_' . $m_id;

                    if (!isset($raw_history_list[$unique_key]) || $added > $raw_history_list[$unique_key]['date']) {
                        $raw_history_list[$unique_key] = [
                            'type' => 'movie',
                            'id' => $m_id, // 🌟 AJOUT DE L'ID
                            'title' => $m_title,
                            'date' => $added,
                            'poster' => $poster,
                            'episodes' => []
                        ];
                    }
                }
            }
        }
    }

    // 2. SONARR (Séries groupées)
    $sonarr = find_app_by_driver($cfg, 'sonarr');
    if ($sonarr) {
        $series_map = [];
        $all_series = arr_get($sonarr, '/api/v3/series');
        if (is_array($all_series) && !isset($all_series['_error'])) {
            foreach ($all_series as $s) {
                if (isset($s['id'])) $series_map[$s['id']] = $s;
            }
        }

        $h = arr_get($sonarr, '/api/v3/history?page=1&pageSize=200&eventType=3&includeEpisode=true');

        if (is_array($h) && isset($h['records'])) {
            foreach ($h['records'] as $r) {
                $added = strtotime($r['date'] ?? '');
                if ($added >= $seven_days_ago) {
                    $s_id = $r['seriesId'] ?? 0;
                    if (!$s_id) continue;

                    $serie = $series_map[$s_id] ?? null;
                    $s_title = $serie['title'] ?? t('unknown_serie');

                    $unique_key = 'serie_' . $s_id;

                    if (!isset($raw_history_list[$unique_key])) {
                        // 🌟 FIX : Construction manuelle sécurisée pour le Proxy
                        $url = $sonarr['url'] ?? '';
                        $apikey = $sonarr['api_key'] ?? '';
                        if ($s_id > 0 && !empty($url) && !empty($apikey)) {
                            $raw_poster = rtrim($url, '/') . '/api/v3/mediacover/' . $s_id . '/poster-250.jpg?apikey=' . $apikey;
                            $poster = 'api.php?action=proxy_image&url=' . urlencode($raw_poster);
                        } else {
                            $poster = 'assets/img/default_poster.png';
                        }

                        $raw_history_list[$unique_key] = [
                            'type' => 'serie',
                            'id' => $s_id, // 🌟 AJOUT DE L'ID
                            'title' => $s_title,
                            'date' => $added,
                            'poster' => $poster,
                            'episodes' => []
                        ];
                    }

                    if ($added > $raw_history_list[$unique_key]['date']) {
                        $raw_history_list[$unique_key]['date'] = $added;
                    }

                    $s_season = sprintf("%02d", $r['episode']['seasonNumber'] ?? 0);
                    $s_ep = sprintf("%02d", $r['episode']['episodeNumber'] ?? 0);
                    $ep_title = $r['episode']['title'] ?? t('unknown_episode') . ' ' . ltrim($s_ep, '0');

                    $episode_str = "S{$s_season}E{$s_ep} · $ep_title";

                    $exists = false;
                    foreach ($raw_history_list[$unique_key]['episodes'] as $existing_ep) {
                        if ($existing_ep['title'] === $episode_str) {
                            $exists = true;
                            break;
                        }
                    }

                    if (!$exists) {
                        $raw_history_list[$unique_key]['episodes'][] = [
                            'title' => $episode_str,
                            'date' => $added
                        ];
                    }
                }
            }
        }
    }

    $history_list = [];
    foreach ($raw_history_list as $item) {
        if ($item['type'] === 'serie') {
            usort($item['episodes'], function($a, $b) { return $b['date'] - $a['date']; });
        }
        $history_list[] = $item;
    }

    usort($history_list, function($a, $b) {
        return $b['date'] - $a['date'];
    });

    if (ob_get_length()) ob_clean();
    echo json_encode(['success' => true, 'history' => $history_list]);
    exit;
}
