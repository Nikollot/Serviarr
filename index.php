<?php
$page = 'home';
$body_class = '';
include 'includes/header.php';
?>

<nav class="hub-nav" id="hub-nav" class="hub-nav-dashboard">
<button class="hub-btn active" onclick="switchHomeTab('calendar', this)">
<span class="icon">📅</span> <span><?= t('hub_calendar') ?></span>
</button>
<button class="hub-btn" onclick="switchHomeTab('movies', this)">
<span class="icon">🎬</span> <span><?= t('hub_movies') ?></span>
</button>
<button class="hub-btn" onclick="switchHomeTab('series', this)">
<span class="icon">📺</span> <span><?= t('hub_series') ?></span>
</button>
</nav>

<div id="home-tab-calendar" class="home-tab-content active">
<div class="grid-2 cal-grid-wrap">
<div class="card">
<div class="card-header"><span class="icon">📅</span> <?= t('hub_calendar') ?></div>
<div class="card-body">
<div class="cal-nav">
<button class="btn-icon" onclick="calMove(-1)">‹</button>
<h3 id="cal-title">—</h3>
<button class="btn-icon" onclick="calMove(1)">›</button>
</div>
<div class="cal-grid" id="cal-dow">
<div class="cal-dow"><?= t('cal_dow_mon') ?></div><div class="cal-dow"><?= t('cal_dow_tue') ?></div><div class="cal-dow"><?= t('cal_dow_wed') ?></div>
<div class="cal-dow"><?= t('cal_dow_thu') ?></div><div class="cal-dow"><?= t('cal_dow_fri') ?></div><div class="cal-dow"><?= t('cal_dow_sat') ?></div><div class="cal-dow"><?= t('cal_dow_sun') ?></div>
</div>
<div class="cal-grid" id="cal-days"></div>
</div>
</div>
<div class="card" id="side-panel">
<div class="card-header">
<span class="icon" id="side-panel-icon">📅</span>
<span id="side-panel-title"><?= t('cal_select_day') ?></span>
</div>
<div class="card-body">
<div id="side-panel-content">
<p class="cal-hint"><?= t('cal_click_hint') ?></p>
</div>
</div>
</div>
</div>
</div>

<div id="home-tab-movies" class="home-tab-content">
<div class="hub-section">
<div>
<h2 class="hub-title radarr">⬇️ <?= t('hub_recent_movies') ?></h2>
<div id="dash-recent-movies"></div>
</div>
<div>
<h2 class="hub-title radarr">📅 <?= t('hub_upcoming_movies') ?></h2>
<div id="dash-upcoming-movies"></div>
</div>
<div>
<h2 class="hub-title radarr">🍿 <?= t('hub_popular_movies') ?></h2>
<div id="dash-popular-movies"></div>
</div>
<div>
<h2 class="hub-title radarr">💡 <?= t('hub_reco_movies') ?></h2>
<div id="dash-reco-movies"></div>
</div>
</div>
</div>

<div id="home-tab-series" class="home-tab-content">
<div class="hub-section">
<div>
<h2 class="hub-title sonarr">⬇️ <?= t('hub_recent_series') ?></h2>
<div id="dash-recent-series"></div>
</div>
<div>
<h2 class="hub-title sonarr">📺 <?= t('hub_upcoming_series') ?></h2>
<div id="dash-upcoming-series"></div>
</div>
<div>
<h2 class="hub-title sonarr">🚀 <?= t('hub_upcoming_new_series') ?></h2>
<div id="dash-upcoming-new-series"></div>
</div>
<div>
<h2 class="hub-title sonarr">🌟 <?= t('hub_popular_series') ?></h2>
<div id="dash-popular-series"></div>
</div>
</div>
</div>

<?php include 'includes/footer.php'; ?>
<script>
function pageInit() { loadHome(); }
</script>
</body>
</html>
