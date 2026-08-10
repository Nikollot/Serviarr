<?php
// ===== Serviarr - api-apps.php =====



// ── Apps CRUD ─────────────────────────────────────────────────────────────────
if ($action === 'get_apps') {
    $cfg = load_config();
    $full_apps = [];
    foreach ($cfg['apps'] ?? [] as $id => $app) {
        $app_data = $app;
        $app_data['id'] = $id;
        $full_apps[] = $app_data;
    }
    echo json_encode(['apps' => $full_apps]);
    exit;
}



if ($action === 'driver_fields') {
    $driver = preg_replace('/[^a-z0-9_]/', '', strtolower($_GET['driver'] ?? ''));
    $file   = APP_ROOT . "/drivers/{$driver}_driver.php";
    if (!file_exists($file)) { echo json_encode(['error' => t('err_driver_unknown')]); exit; }
    require_once $file;
    $fn = $driver . '_fields';
    echo json_encode(['fields' => $fn()]);
    exit;
}



if ($action === 'list_drivers') {
    $drivers = [];
    foreach (glob(APP_ROOT . '/drivers/*_driver.php') as $f) {
        $name = str_replace('_driver', '', basename($f, '.php'));
        $drivers[] = ['id' => $name, 'name' => ucfirst($name)];
    }
    echo json_encode(['drivers' => $drivers]);
    exit;
}



if ($action === 'save_app') {
    $cfg    = load_config();
    $driver = preg_replace('/[^a-z0-9_]/', '', strtolower($_POST['driver'] ?? ''));
    $id     = $_POST['id'] ?? ('app_' . uniqid());
    $name   = trim($_POST['name'] ?? ucfirst($driver));
    $file   = APP_ROOT . "/drivers/{$driver}_driver.php";
    if (!file_exists($file)) { echo json_encode(['error' => t('err_driver_unknown')]); exit; }
    require_once $file;
    $fn     = $driver . '_fields';
    $fields = $fn();
    $app_cfg = ['name' => $name, 'driver' => $driver, 'enabled' => true];
    foreach ($fields as $f) {
        if (array_key_exists($f['key'], $_POST)) {
            $app_cfg[$f['key']] = $_POST[$f['key']];
        } else {
            $app_cfg[$f['key']] = $cfg['apps'][$id][$f['key']] ?? '';
        }
    }
    if (isset($_POST['icon_url'])) {
        $app_cfg['icon_url'] = trim($_POST['icon_url']);
    }
    $cfg['apps'][$id] = $app_cfg;
    save_config($cfg);
    log_activity('save_app', 'app', $id, $name . ' (' . $driver . ')');
    echo json_encode(['ok' => true, 'id' => $id]);
    exit;
}



if ($action === 'delete_app') {
    $cfg = load_config();
    $id  = preg_replace('/[^a-z0-9_]/', '', $_POST['id'] ?? '');
    $deleted_name = $cfg['apps'][$id]['name'] ?? $id;
    unset($cfg['apps'][$id]);
    save_config($cfg);
    log_activity('delete_app', 'app', $id, $deleted_name);
    echo json_encode(['ok' => true]);
    exit;
}



if ($action === 'toggle_app') {
    $cfg = load_config();
    $id  = preg_replace('/[^a-z0-9_]/', '', $_POST['id'] ?? '');
    if (isset($cfg['apps'][$id])) {
        $cfg['apps'][$id]['enabled'] = !($cfg['apps'][$id]['enabled'] ?? true);
        save_config($cfg);
        echo json_encode(['ok' => true, 'enabled' => $cfg['apps'][$id]['enabled']]);
    } else {
        echo json_encode(['error' => t('err_app_not_found')]);
    }
    exit;
}



if ($action === 'app_status') {
    $cfg = load_config();
    $id  = $_GET['id'] ?? '';
    if (!isset($cfg['apps'][$id])) { echo json_encode(['error' => t('err_app_not_found')]); exit; }
    $app    = $cfg['apps'][$id];
    $driver = preg_replace('/[^a-z0-9_]/', '', $app['driver']);
    $file   = APP_ROOT . "/drivers/{$driver}_driver.php";
    if (!file_exists($file)) { echo json_encode(['error' => t('err_driver_not_found')]); exit; }
    require_once $file;
    $fn = $driver . '_status';
    echo json_encode($fn($app));
    exit;
}



// ── TEST DE CONNEXION (Avant sauvegarde) ──────────────────────────────────────
if ($action === 'test_connection') {
    require_auth();
    $driver = preg_replace('/[^a-z0-9_]/', '', strtolower($_POST['driver'] ?? ''));
    $file   = APP_ROOT . "/drivers/{$driver}_driver.php";

    if (!file_exists($file)) { 
        echo json_encode(['error' => t('err_driver_unknown')]); 
        exit; 
    }
    require_once $file;

    // 1. On crée une fausse configuration "app" à la volée avec les données du formulaire
    $app = ['driver' => $driver];
    $fn_fields = $driver . '_fields';
    if (function_exists($fn_fields)) {
        foreach ($fn_fields() as $f) {
            $app[$f['key']] = $_POST[$f['key']] ?? '';
        }
    }

    // 🌟 CAS SPÉCIFIQUE : DOCKER (Connexion directe via Socket Unix)
    if ($driver === 'docker') {
        $socketPath = !empty($app['url']) ? $app['url'] : '/var/run/docker.sock';
        $ch = curl_init("http://localhost/info");
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, 
            CURLOPT_UNIX_SOCKET_PATH => $socketPath, 
            CURLOPT_TIMEOUT => 3
        ]);
        curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($code === 200) {
            echo json_encode(['ok' => true]);
        } else {
            echo json_encode(['error' => 'Socket inaccessible. Vérifiez les permissions ou le chemin.']);
        }
        exit;
    }

    // 🌟 CAS SPÉCIFIQUE : IFRAME / SUPERVISION (Simple Ping HTTP)
    if ($driver === 'iframe' || $driver === 'supervision') {
        $url = $app['url'] ?? '';
        if (empty($url) || !filter_var($url, FILTER_VALIDATE_URL)) {
            echo json_encode(['error' => 'URL invalide ou manquante.']);
            exit;
        }
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_NOBODY => true, // On récupère juste l'entête sans télécharger la page
            CURLOPT_TIMEOUT => 5,
            CURLOPT_SSL_VERIFYPEER => false
        ]);
        curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        // On accepte les redirections ou les erreurs 401/403 car ça prouve que le serveur existe et répond
        if ($code > 0 && $code < 500) {
            echo json_encode(['ok' => true]);
        } else {
            echo json_encode(['error' => 'Le site ne répond pas (Code HTTP: ' . $code . ').']);
        }
        exit;
    }

    // 🌟 CAS GÉNÉRAL (Radarr, Sonarr, Transmission, Prowlarr...)
    $fn_status = $driver . '_status';
    if (!function_exists($fn_status)) {
        echo json_encode(['error' => 'Ce pilote ne supporte pas le test de connexion.']);
        exit;
    }

    // 2. On exécute la fonction de statut du pilote avec cette configuration temporaire
    $status = $fn_status($app);

    // 3. On renvoie le résultat
    if (isset($status['ok']) && $status['ok'] === true) {
        echo json_encode(['ok' => true]);
    } elseif (isset($status['error'])) {
        echo json_encode(['error' => $status['error']]);
    } else {
        echo json_encode(['error' => 'Échec de la connexion. Vérifiez l\'URL et la clé API.']);
    }
    exit;
}



if ($action === 'change_password') {
    $cfg     = load_config();
    $current = $_POST['current'] ?? '';
    $new     = $_POST['new']     ?? '';
    if (!password_verify($current, $cfg['user'])) { echo json_encode(['error' => t('err_current_password_incorrect')]); exit; }
    if (strlen($new) < 4) { echo json_encode(['error' => t('err_new_password_too_short')]); exit; }
    $cfg['user'] = password_hash($new, PASSWORD_BCRYPT);
    save_config($cfg);
    echo json_encode(['ok' => true]);
    exit;
}



// ── SYSTÈME ET STATISTIQUES (RADARR / SONARR) ─────────────────────────────────
if ($action === 'app_sys_status') {
    require_auth();
    $cfg = load_config();
    $type = $_POST['type'] ?? 'movie';
    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }

    $status = arr_get($app, '/api/v3/system/status');
    $updates = arr_get($app, '/api/v3/update');

    $update_available = false;
    if (is_array($updates) && !isset($updates['_error'])) {
        foreach ($updates as $u) {
            // 🌟 LA CORRECTION EST ICI : On s'assure qu'une mise à jour est proposée ET qu'elle n'est pas déjà installée !
            if (empty($u['installed']) && (!empty($u['latest']) || !empty($u['installable']))) {
                $update_available = true;
                break;
            }
        }
    }

    // Calcul des statistiques
    $stats = ['total' => 0, 'downloaded' => 0, 'missing' => 0, 'sizeOnDisk' => 0];
    if ($type === 'movie') {
        $movies = arr_get($app, '/api/v3/movie');
        if (is_array($movies) && !isset($movies['_error'])) {
            $stats['total'] = count($movies);
            foreach ($movies as $m) {
                if ($m['hasFile'] ?? false) $stats['downloaded']++;
                else $stats['missing']++;
                $stats['sizeOnDisk'] += $m['sizeOnDisk'] ?? 0;
            }
        }
    } else {
        $series = arr_get($app, '/api/v3/series');
        if (is_array($series) && !isset($series['_error'])) {
            $stats['total'] = count($series);
            foreach ($series as $s) {
                $stats['downloaded'] += $s['statistics']['episodeFileCount'] ?? 0;
                $stats['missing'] += ($s['statistics']['totalEpisodeCount'] ?? 0) - ($s['statistics']['episodeFileCount'] ?? 0);
                $stats['sizeOnDisk'] += $s['statistics']['sizeOnDisk'] ?? 0;
            }
        }
    }

    echo json_encode([
        'ok' => true,
        'version' => $status['version'] ?? t('status_unknown'),
                     'update_available' => $update_available,
                     'stats' => $stats
    ]);
    exit;
}



if ($action === 'app_sys_command') {
    require_auth();
    $cfg = load_config();
    $type = $_POST['type'] ?? 'movie';
    $command = $_POST['command'] ?? '';

    $app = find_app_by_driver($cfg, $type === 'movie' ? 'radarr' : 'sonarr');
    if (!$app) { echo json_encode(['error' => t('err_app_not_configured')]); exit; }

    $payload = ['name' => $command];
    // Gère l'envoi d'un dossier spécifique pour l'import auto
    if (!empty($_POST['folder'])) {
        $payload['folder'] = $_POST['folder'];
        $payload['importMode'] = 'auto';
    }

    $res = arr_post($app, '/api/v3/command', $payload);
    if (isset($res['_error'])) { echo json_encode(['error' => $res['_error']]); exit; }

    echo json_encode(['ok' => true]);
    exit;
}



// ── GET LOCAL ICONS ───────────────────────────────────────────────────────────
if ($action === 'get_local_icons') {
    require_auth();
    $icons = [];
    $files = glob(APP_ROOT . '/assets/img/*.{png,jpg,jpeg,svg,gif,ico,webp}', GLOB_BRACE);
    if ($files !== false) {
        foreach ($files as $f) {
            $icons[] = basename($f);
        }
    }
    echo json_encode(['icons' => $icons]);
    exit;
}



// ── REORDER APPS ──────────────────────────────────────────────────────────────
if ($action === 'reorder_apps') {
    require_auth();
    $cfg = load_config();
    $new_order = json_decode($_POST['order'] ?? '[]', true);

    if (!empty($new_order) && is_array($new_order)) {
        $reordered_apps = [];
        foreach ($new_order as $id) {
            if (isset($cfg['apps'][$id])) { $reordered_apps[$id] = $cfg['apps'][$id]; }
        }
        foreach ($cfg['apps'] ?? [] as $id => $app) {
            if (!isset($reordered_apps[$id])) { $reordered_apps[$id] = $app; }
        }
        $cfg['apps'] = $reordered_apps;
        save_config($cfg);
        echo json_encode(['ok' => true]);
        exit;
    }
    echo json_encode(['error' => t('err_invalid_order')]);
    exit;
}



if ($action === 'check_auth') {
    // On vérifie simplement si la session est active
    if (isset($_SESSION['auth']) && $_SESSION['auth'] === true) {
        echo json_encode(['auth' => true]);
    } else {
        echo json_encode(['auth' => false]);
    }
    exit;
}
