<?php
$page = 'iframe';
$body_class = 'theme-iframe';
include 'includes/header.php';

$config_file = __DIR__ . '/data/config.json';
$cfg = file_exists($config_file) ? json_decode(file_get_contents($config_file), true) : null;
$app_id = $_GET['id'] ?? '';
$app = $cfg['apps'][$app_id] ?? null;

if (!$app || $app['driver'] !== 'iframe') {
    echo "<div class='empty-state iframe-not-found'><div class='icon'>⚠️</div><h3>" . t('iframe_not_found_title') . "</h3></div></main>";
    include 'includes/footer.php';
    exit;
}

$url = $app['url'] ?? '';
?>

<iframe class="web-iframe" src="<?php echo htmlspecialchars($url); ?>" allowfullscreen></iframe>

<?php include 'includes/footer.php'; ?>

