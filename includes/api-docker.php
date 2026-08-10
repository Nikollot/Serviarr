<?php
// ===== Serviarr - api-docker.php =====



// ── DOCKER ────────────────────────────────────────────────────────────────────
if ($action === 'get_containers') {
    require_auth();
    $cfg = load_config();
    $docker = find_app_by_driver($cfg, 'docker');
    if (!$docker) { echo json_encode(['error' => t('err_docker_not_configured_settings')]); exit; }

    $socketPath = $docker['url'] ?? '/var/run/docker.sock';
    $ch = curl_init("http://localhost/containers/json?all=true");
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_UNIX_SOCKET_PATH => $socketPath, CURLOPT_TIMEOUT => 5]);
    $res = curl_exec($ch);
    curl_close($ch);

    $containers = json_decode($res, true);
    if (!is_array($containers)) { echo json_encode(['error' => t('err_docker_unreachable_via') . $socketPath]); exit; }

    $result = [];
    foreach ($containers as $c) {
        $name = ltrim($c['Names'][0] ?? 'Inconnu', '/');
        $result[] = ['id' => substr($c['Id'], 0, 12), 'name' => $name, 'state' => $c['State'] ?? 'unknown', 'status' => $c['Status'] ?? '?', 'image' => $c['Image'] ?? 'Inconnue'];
    }
    usort($result, fn($a, $b) => strcasecmp($a['name'], $b['name']));
    echo json_encode(['containers' => $result]);
    exit;
}



if ($action === 'docker_action') {
    require_auth();
    $cfg = load_config();
    $docker = find_app_by_driver($cfg, 'docker');
    if (!$docker) { echo json_encode(['error' => t('err_docker_app_not_configured')]); exit; }

    $containerId = preg_replace('/[^a-zA-Z0-9_.-]/', '', $_POST['id'] ?? '');
    $cmd = $_POST['cmd'] ?? '';
    if (!$containerId || !in_array($cmd, ['start', 'stop', 'restart'], true)) { echo json_encode(['error' => t('err_invalid_params')]); exit; }

    $socketPath = $docker['url'] ?? '/var/run/docker.sock';
    $ch = curl_init("http://localhost/containers/{$containerId}/{$cmd}");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_UNIX_SOCKET_PATH => $socketPath, CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => '', CURLOPT_HTTPHEADER => ['Content-Length: 0'], CURLOPT_TIMEOUT => 45
    ]);
    $res = curl_exec($ch);
    $httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpcode >= 200 && $httpcode < 300) {
        log_activity('docker_action', 'container', substr($containerId, 0, 12), $cmd);
        echo json_encode(['ok' => true]);
    } else {
        $err = json_decode($res, true);
        echo json_encode(['error' => $err['message'] ?? "Erreur Docker (Code: $httpcode)"]);
    }
    exit;
}



if ($action === 'docker_logs') {
    require_auth();
    $cfg = load_config();
    $docker = find_app_by_driver($cfg, 'docker');
    if (!$docker) { echo json_encode(['error' => t('err_docker_app_not_configured')]); exit; }

    $containerId = preg_replace('/[^a-zA-Z0-9_.-]/', '', $_GET['id'] ?? '');
    $socketPath = $docker['url'] ?? '/var/run/docker.sock';

    $ch = curl_init("http://localhost/containers/{$containerId}/logs?stdout=true&stderr=true&tail=50");
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_UNIX_SOCKET_PATH => $socketPath, CURLOPT_TIMEOUT => 5]);
    $res = curl_exec($ch);
    curl_close($ch);

    $clean_logs = preg_replace('/^[\x00-\x02]\x00\x00\x00[\x00-\xFF]{4}/m', '', $res);
    $clean_logs = htmlspecialchars(trim($clean_logs));
    echo json_encode(['success' => true, 'logs' => $clean_logs]);
    exit;
}



if ($action === 'docker_stats') {
    require_auth();
    $cfg = load_config();
    $docker = find_app_by_driver($cfg, 'docker');
    if (!$docker) { echo json_encode(['error' => t('err_docker_app_not_configured')]); exit; }

    $containerId = preg_replace('/[^a-zA-Z0-9_.-]/', '', $_GET['id'] ?? '');
    $socketPath = $docker['url'] ?? '/var/run/docker.sock';

    $ch = curl_init("http://localhost/containers/{$containerId}/stats?stream=false");
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_UNIX_SOCKET_PATH => $socketPath, CURLOPT_TIMEOUT => 5]);
    $res = curl_exec($ch);
    curl_close($ch);

    $stats = json_decode($res, true);
    if (!$stats || isset($stats['message'])) { echo json_encode(['error' => t('err_stats_read_failed')]); exit; }

    $cpuDelta = ($stats['cpu_stats']['cpu_usage']['total_usage'] ?? 0) - ($stats['precpu_stats']['cpu_usage']['total_usage'] ?? 0);
    $sysDelta = ($stats['cpu_stats']['system_cpu_usage'] ?? 0) - ($stats['precpu_stats']['system_cpu_usage'] ?? 0);
    $cpus = $stats['cpu_stats']['online_cpus'] ?? 1;
    $cpuPercent = ($sysDelta > 0 && $cpuDelta > 0) ? round(($cpuDelta / $sysDelta) * $cpus * 100, 2) : 0;

    $memUsage = $stats['memory_stats']['usage'] ?? 0;
    if (isset($stats['memory_stats']['stats']['cache'])) $memUsage -= $stats['memory_stats']['stats']['cache'];
    $memLimit = $stats['memory_stats']['limit'] ?? 0;
    $memPercent = ($memLimit > 0) ? round(($memUsage / $memLimit) * 100, 2) : 0;

    $formatSize = function($bytes) {
        if ($bytes >= 1073741824) return round($bytes / 1073741824, 2) . ' Go';
        if ($bytes >= 1048576) return round($bytes / 1048576, 2) . ' Mo';
        return round($bytes / 1024, 2) . ' Ko';
    };

    echo json_encode(['success' => true, 'cpu' => $cpuPercent, 'ram' => $memPercent, 'ram_used' => $formatSize($memUsage), 'ram_limit' => $formatSize($memLimit)]);
    exit;
}
