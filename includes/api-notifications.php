<?php
// ===== Serviarr - api-notifications.php =====



// ── VAPID ───────────────────────────────────────────────────────────────────────
if ($action === 'get_push_config') {
    require_auth();
    $cfg = load_config();
    echo json_encode([
        'vapid_email'  => $cfg['vapid_email'] ?? '',
        'vapid_public'  => $cfg['vapid_public'] ?? '',
        'vapid_private' => $cfg['vapid_private'] ?? ''
    ]);
    exit;
}



if ($action === 'save_push_config') {
    require_auth();
    $cfg = load_config();
    $cfg['vapid_email']   = trim($_POST['vapid_email'] ?? '');
    $cfg['vapid_public']   = trim($_POST['vapid_public'] ?? '');
    $cfg['vapid_private']  = trim($_POST['vapid_private'] ?? '');
    save_config($cfg);
    echo json_encode(['ok' => true]);
    exit;
}



// ── NOTIFICATIONS & WEBHOOK ───────────────────────────────────────────────────
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



if ($action === 'webhook_notif') {
    $received_token = $_GET['token'] ?? '(aucun)';
    error_log("Serviarr webhook_notif : requête reçue depuis " . ($_SERVER['REMOTE_ADDR'] ?? '?') . " | méthode=" . ($_SERVER['REQUEST_METHOD'] ?? '?') . " | token fourni=" . ($received_token !== '(aucun)' ? substr($received_token, 0, 6) . '…' : '(aucun)'));

    $expected_token = get_webhook_token();
    if (!hash_equals($expected_token, $_GET['token'] ?? '')) {
        error_log("Serviarr webhook_notif : token invalide, requête rejetée (403)");
        http_response_code(403);
        exit('Forbidden');
    }

    session_write_close();

    $data_dir = APP_ROOT . '/data';
    if (!is_dir($data_dir)) { @mkdir($data_dir, 0775, true); }

    $debugFile = APP_ROOT . '/data/debug_push.txt';
    if (file_exists($debugFile) && filesize($debugFile) > 1048576) { file_put_contents($debugFile, "--- Journal tronqué automatiquement ---\n"); }

    require APP_ROOT . '/vendor/autoload.php';

    $raw_input = file_get_contents('php://input');
    $input = json_decode($raw_input, true);

    $write_ok = @file_put_contents(
        $debugFile,
        "[" . date('Y-m-d H:i:s') . "] Requête reçue. Longueur brute: " . strlen($raw_input) . " octets. JSON valide: " . ($input ? 'oui' : 'non') . ". Contenu brut: " . substr($raw_input, 0, 200) . "\n",
                                   FILE_APPEND | LOCK_EX
    );
    if ($write_ok === false) { error_log("Serviarr webhook_notif : impossible d'écrire dans {$debugFile} — vérifier les permissions du dossier data/"); }

    if (!$input) exit('OK');

    $cfg = load_config();
    $radarr = find_app_by_driver($cfg, 'radarr');
    $sonarr = find_app_by_driver($cfg, 'sonarr');

    $image = null; $tag = 'sys_notif'; $clickUrl = '/'; $seasonNum = 0; $seriesTitle = '';

    $formatSize = function($bytes) {
        if (!$bytes) return 'Inconnu';
        if ($bytes >= 1073741824) return round($bytes / 1073741824, 2) . ' Go';
        if ($bytes >= 1048576) return round($bytes / 1048576, 2) . ' Mo';
        return $bytes . ' o';
    };

    $eventType = $input['eventType'] ?? 'Unknown';
    $isUpgrade = $input['isUpgrade'] ?? false;
    $actionText = "";
    switch ($eventType) {
        case 'Grab': $actionText = "⬇️ En cours de téléchargement"; break;
        case 'Download': $actionText = $isUpgrade ? "✨ Qualité améliorée" : "✅ Téléchargement terminé"; break;
        case 'Rename': $actionText = "🏷️ Fichiers renommés"; break;
        case 'MovieDelete':
        case 'SeriesDelete': $actionText = "🗑️ Média supprimé de la bibliothèque"; break;
        case 'MovieFileDelete':
        case 'EpisodeFileDelete': $actionText = "🗑️ Fichier vidéo supprimé"; break;
        case 'HealthIssue': $actionText = "⚠️ Avertissement système"; break;
        case 'ApplicationUpdate': $actionText = "🔄 Application mise à jour"; break;
        case 'Test': $actionText = "🔔 Test de connexion réussi !"; break;
        default: $actionText = "ℹ️ Notification système"; break;
    }

    if ($eventType === 'Test') {
        $title = $actionText;
        $body = "Radarr/Sonarr communique parfaitement avec ton téléphone.";
        $tag = 'test_notif';
    } elseif (isset($input['movie'])) {
        $m = $input['movie'];
        $title = "🎬 " . $m['title'] . " (" . ($m['year'] ?? '') . ")";
        $body = $actionText . "\n";
        $tag = 'movie_' . $m['id'];
        $clickUrl = 'films.php?movie=' . $m['id'];

        if ($eventType === 'Grab' && isset($input['release'])) {
            $body .= "Qualité : " . ($input['release']['quality'] ?? 'Inconnue') . "\n";
            $body .= "Poids : " . $formatSize($input['release']['size'] ?? 0) . "\n";
            $body .= "Source : " . ($input['release']['indexer'] ?? 'Inconnue');
        } elseif (isset($input['movieFile'])) {
            $mf = $input['movieFile'];
            $fileName = basename($mf['relativePath'] ?? 'Fichier inconnu');
            $body .= "Qualité : " . ($mf['quality'] ?? 'Inconnue') . "\n";
            $body .= "Poids : " . $formatSize($mf['size'] ?? 0) . "\n";
            $body .= "Fichier : {$fileName}";
        }

        if ($radarr) { $image = rtrim($radarr['url'], '/') . '/api/v3/mediacover/' . $m['id'] . '/poster.jpg?apikey=' . $radarr['api_key']; }
        clear_media_caches('movie');

    } elseif (isset($input['series'])) {
        $s = $input['series'];
        $seriesTitle = $s['title'];
        $title = "📺 " . $seriesTitle;
        $body = $actionText . "\n";
        $tag = 'serie_' . $s['id'];
        $clickUrl = 'series.php?serie=' . $s['id'];

        if (isset($input['episodes']) && count($input['episodes']) > 0) {
            $ep = $input['episodes'][0];
            $seasonNum = $ep['seasonNumber'] ?? 0;
            $saison = sprintf("%02d", $seasonNum);
            $episode = sprintf("%02d", $ep['episodeNumber'] ?? 0);
            $title .= " - S{$saison}E{$episode}";
            $body .= "Épisode : " . ($ep['title'] ?? 'Inconnu') . "\n";
            $tag .= '_ep_' . ($ep['id'] ?? 0);
        }

        if ($eventType === 'Grab' && isset($input['release'])) {
            $body .= "Qualité : " . ($input['release']['quality'] ?? 'Inconnue') . "\n";
            $body .= "Poids : " . $formatSize($input['release']['size'] ?? 0) . "\n";
            $body .= "Source : " . ($input['release']['indexer'] ?? 'Inconnue');
        } elseif (isset($input['episodeFile'])) {
            $ef = $input['episodeFile'];
            $fileName = basename($ef['relativePath'] ?? 'Fichier inconnu');
            $body .= "Qualité : " . ($ef['quality'] ?? 'Inconnue') . "\n";
            $body .= "Poids : " . $formatSize($ef['size'] ?? 0) . "\n";
            $body .= "Fichier : {$fileName}";
        }

        if ($sonarr) { $image = rtrim($sonarr['url'], '/') . '/api/v3/mediacover/' . $s['id'] . '/poster.jpg?apikey=' . $sonarr['api_key']; }
        clear_media_caches('serie');

    } elseif ($eventType === 'HealthIssue') {
        $title = $actionText;
        $body = $input['healthIssue']['message'] ?? 'Erreur système détectée.';
    } elseif ($eventType === 'ApplicationUpdate') {
        $title = $actionText;
        $body = "Version : " . ($input['applicationUpdate']['newVersion'] ?? 'Inconnue');
    }

    $subFile = APP_ROOT . '/data/push_subscription.json';
    if (!file_exists($subFile)) {
        file_put_contents($debugFile, "❌ ECHEC : Le fichier push_subscription.json est introuvable !\n", FILE_APPEND | LOCK_EX);
        http_response_code(400);
        exit('⚠️ ERREUR : Aucun téléphone associé.');
    }
    file_put_contents($debugFile, "✅ SUCCES : Le fichier du téléphone a bien été trouvé.\n", FILE_APPEND | LOCK_EX);

    try {
        $subRaw = file_get_contents($subFile);
        $subJson = json_decode($subRaw, true);
        if (!$subJson || !isset($subJson['endpoint'])) throw new Exception("Le fichier push_subscription.json est vide ou corrompu !");

        $subscription = Subscription::create([
            'endpoint' => $subJson['endpoint'],
            'publicKey' => $subJson['keys']['p256dh'] ?? '',
            'authToken' => $subJson['keys']['auth'] ?? '',
        ]);

        $vapid_email   = !empty($cfg['vapid_email']) ? $cfg['vapid_email'] : 'niko.sallot@gmail.com';
        $vapid_public  = !empty($cfg['vapid_public']) ? $cfg['vapid_public'] : 'BEtLH83HDQX7EbavV0DF2bp2V7yf7BVoaqhqSVXjaEsMg4IwqbIi39q3MCj5x0z5B4g8Mya0S1Id0NseA6qODzI';
        $vapid_private = !empty($cfg['vapid_private']) ? $cfg['vapid_private'] : 'WF-qAb027VD4steNAgod2CERorqA3nfko5t2D_KnBZA';

        $auth = [
            'VAPID' => [
                'subject' => 'mailto:' . $vapid_email,
                'publicKey' => $vapid_public,
                'privateKey' => $vapid_private,
            ],
        ];

        $webPush = new WebPush($auth);
        $notificationData = [
            'title' => $title, 'body'  => $body, 'tag'   => $tag, 'url'   => $clickUrl,
            'mediaType'    => isset($s) ? 'serie' : (isset($m) ? 'movie' : 'system'),
            'seriesId'     => $s['id'] ?? 0, 'seasonNumber' => $seasonNum, 'seriesTitle'  => $seriesTitle,
            'movieTitle'   => isset($m) ? $m['title'] : ''
        ];
        if ($image) { $notificationData['icon']  = $image; }
        $payload = json_encode($notificationData);
        $report = $webPush->sendOneNotification($subscription, $payload);

        if ($report->isSuccess()) {
            file_put_contents($debugFile, "✅ SUCCES : Google a accepté le message !\n", FILE_APPEND | LOCK_EX);
            exit('✅ Push envoyé avec succès !');
        } else {
            file_put_contents($debugFile, "❌ ECHEC GOOGLE : " . $report->getReason() . "\n", FILE_APPEND | LOCK_EX);
            http_response_code(200);
            exit('❌ Refusé par Google : ' . $report->getReason());
        }
    } catch (\Throwable $e) {
        file_put_contents($debugFile, "💥 CRASH PHP : " . $e->getMessage() . " (Ligne " . $e->getLine() . ")\n", FILE_APPEND | LOCK_EX);
        http_response_code(200);
        exit('💥 Erreur Interne PHP : ' . $e->getMessage());
    }
}



if ($action === 'save_push_sub') {
    require_auth();
    $sub = $_POST['sub'] ?? '';
    if (!empty($sub)) {
        file_put_contents(APP_ROOT . '/data/push_subscription.json', $sub);
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['error' => t('err_no_sub_data')]);
    }
    exit;
}
