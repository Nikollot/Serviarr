<?php
// ===== Serviarr - api-auth.php (actions d'authentification, AVANT le portail de securite) =====



// ── Auth (public) ─────────────────────────────────────────────────────────────
if ($action === 'setup') {
    $cfg = load_config();
    if (!empty($cfg['user'])) { echo json_encode(['error' => t('err_already_configured')]); exit; }
    $pw = $_POST['password'] ?? '';
    if (strlen($pw) < 4) { echo json_encode(['error' => t('err_password_too_short')]); exit; }
    $cfg['user'] = password_hash($pw, PASSWORD_BCRYPT);
    save_config($cfg);
    $_SESSION['auth'] = true;
    echo json_encode(['ok' => true]);
    exit;
}



if ($action === 'login') {
    $cfg = load_config();
    if (empty($cfg['user'])) { echo json_encode(['error' => t('err_not_configured')]); exit; }

    $lockout_key = 'login_' . get_client_ip();
    $remaining = check_lockout($lockout_key);
    if ($remaining > 0) {
        echo json_encode(['error' => t('err_too_many_attempts') . ' ' . ceil($remaining / 60) . ' ' . t('err_minutes_suffix')]);
        exit;
    }

    if (password_verify($_POST['password'] ?? '', $cfg['user'])) {
        reset_lockout($lockout_key);
        if (!empty($cfg['2fa_enabled']) && !empty($cfg['2fa_secret'])) {
            $_SESSION['2fa_pending'] = true;
            echo json_encode(['ok' => true, 'requires_2fa' => true]);
        } else {
            $_SESSION['auth'] = true;
            log_activity('login_success');
            echo json_encode(['ok' => true]);
        }
    } else {
        register_failed_attempt($lockout_key);
        log_activity('login_failed');
        echo json_encode(['error' => t('err_password_incorrect')]);
    }
    exit;
}



if ($action === 'verify_login_2fa') {
    $cfg = load_config();
    if (empty($_SESSION['2fa_pending'])) { echo json_encode(['error' => t('err_session_expired')]); exit; }
    $code = $_POST['code'] ?? '';

    $lockout_key = '2fa_' . get_client_ip();
    $remaining = check_lockout($lockout_key);
    if ($remaining > 0) {
        echo json_encode(['error' => t('err_too_many_attempts') . ' ' . ceil($remaining / 60) . ' ' . t('err_minutes_suffix')]);
        exit;
    }

    if (verify_totp($cfg['2fa_secret'], $code)) {
        reset_lockout($lockout_key);
        unset($_SESSION['2fa_pending']);
        $_SESSION['auth'] = true;
        echo json_encode(['ok' => true]);
    } else {
        register_failed_attempt($lockout_key);
        echo json_encode(['error' => t('err_2fa_code_incorrect')]);
    }
    exit;
}



if ($action === 'logout') { session_destroy(); echo json_encode(['ok' => true]); exit; }



if ($action === 'get_2fa_status') {
    require_auth();
    $cfg = load_config();
    echo json_encode(['enabled' => !empty($cfg['2fa_enabled'])]);
    exit;
}



if ($action === 'get_webhook_url') {
    require_auth();
    $token = get_webhook_token();
    $forwarded_proto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';
    $is_https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || strtolower($forwarded_proto) === 'https';
    $scheme = $is_https ? 'https' : 'http';
    $base = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    $url = $base . '/api.php?action=webhook_notif&token=' . $token;
    echo json_encode(['url' => $url]);
    exit;
}



if ($action === 'get_activity_log') {
    require_auth();
    global $activity_log_file;
    $entries = [];
    if (file_exists($activity_log_file)) {
        $lines = file($activity_log_file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        $limit = min((int)($_GET['limit'] ?? 100), ACTIVITY_LOG_MAX_LINES);
        $lines = array_slice($lines, -$limit);
        foreach (array_reverse($lines) as $line) {
            $decoded = json_decode($line, true);
            if ($decoded) $entries[] = $decoded;
        }
    }
    echo json_encode(['entries' => $entries]);
    exit;
}



if ($action === 'setup_2fa') {
    if (empty($_SESSION['auth'])) { echo json_encode(['error' => t('err_unauthorized')]); exit; }

    $secret = generate_base32_secret();
    $_SESSION['2fa_setup_secret'] = $secret;
    session_write_close();

    $url = "otpauth://totp/Serviarr:Admin?secret={$secret}&issuer=Serviarr";
    echo json_encode(['secret' => $secret, 'url' => $url]);
    exit;
}



if ($action === 'confirm_2fa') {
    if (empty($_SESSION['auth'])) { echo json_encode(['error' => t('err_unauthorized')]); exit; }

    $cfg = load_config();
    $code = $_POST['code'] ?? '';
    $secret = $_SESSION['2fa_setup_secret'] ?? '';

    if (!$secret) {
        echo json_encode(['error' => t('err_session_expired_settings')]);
        exit;
    }

    if (verify_totp($secret, $code)) {
        $cfg['2fa_secret'] = $secret;
        $cfg['2fa_enabled'] = true;
        save_config($cfg);
        unset($_SESSION['2fa_setup_secret']);
        session_write_close();
        echo json_encode(['ok' => true]);
    } else {
        echo json_encode(['error' => t('err_code_incorrect')]);
    }
    exit;
}



if ($action === 'disable_2fa') {
    require_auth();
    $cfg = load_config();
    unset($cfg['2fa_secret']);
    unset($cfg['2fa_enabled']);
    save_config($cfg);
    echo json_encode(['ok' => true]);
    exit;
}



if ($action === 'check_setup') {
    $cfg = load_config();
    echo json_encode(['setup_done' => !empty($cfg['user']), 'auth' => !empty($_SESSION['auth'])]);
    exit;
}
