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
<button class="hub-btn" onclick="switchHomeTab('server', this)">
<span class="icon">📊</span>
<span><?= t('tab_server') ?></span>
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
<div style="display:flex; justify-content:flex-end; padding:15px 20px 0;">
<button onclick="openUiConfigModal('movies')" style="background:var(--bg3); color:var(--text); border:1px solid var(--border); padding:6px 12px; border-radius:8px; font-size:12px; font-weight:bold; cursor:pointer;">⚙️ <?= t('ui_config_btn') ?></button>
</div>
<div class="hub-section">
<div id="block-movies-recent">
<h2 class="hub-title radarr">⬇️ <?= t('hub_recent_movies') ?></h2>
<div id="dash-recent-movies"></div>
</div>
<div id="block-movies-upcoming">
<h2 class="hub-title radarr">📅 <?= t('hub_upcoming_movies') ?></h2>
<div id="dash-upcoming-movies"></div>
</div>
<div id="block-movies-physical">
<h2 class="hub-title radarr">💿 <?= t('hub_upcoming_physical') ?></h2>
<div id="dash-upcoming-physical-movies"></div>
</div>
<div id="block-movies-popular">
<h2 class="hub-title radarr">🍿 <?= t('hub_popular_movies') ?></h2>
<div id="dash-popular-movies"></div>
</div>
<div id="block-movies-reco">
<h2 class="hub-title radarr">💡 <?= t('hub_reco_movies') ?></h2>
<div id="dash-reco-movies"></div>
</div>
</div>
</div>

<div id="home-tab-series" class="home-tab-content">
<div style="display:flex; justify-content:flex-end; padding:15px 20px 0;">
<button onclick="openUiConfigModal('series')" style="background:var(--bg3); color:var(--text); border:1px solid var(--border); padding:6px 12px; border-radius:8px; font-size:12px; font-weight:bold; cursor:pointer;">⚙️ <?= t('ui_config_btn') ?></button>
</div>
<div class="hub-section">
<div id="block-series-recent">
<h2 class="hub-title sonarr">⬇️ <?= t('hub_recent_series') ?></h2>
<div id="dash-recent-series"></div>
</div>
<div id="block-series-upcoming">
<h2 class="hub-title sonarr">📺 <?= t('hub_upcoming_series') ?></h2>
<div id="dash-upcoming-series"></div>
</div>
<div id="block-series-new">
<h2 class="hub-title sonarr">🚀 <?= t('hub_upcoming_new_series') ?></h2>
<div id="dash-upcoming-new-series"></div>
</div>
<div id="block-series-popular">
<h2 class="hub-title sonarr">🌟 <?= t('hub_popular_series') ?></h2>
<div id="dash-popular-series"></div>
</div>
<div id="block-series-reco">
<h2 class="hub-title sonarr">💡 <?= t('hub_incomplete_series') ?></h2>
<div id="dash-reco-series"></div>
</div>
</div>
</div>

<!-- ONGLET SERVEUR -->
<div id="home-tab-server" class="home-tab-content" style="display:none;">
<div style="display:flex; justify-content:flex-end; padding:15px 20px 0;">
<button onclick="openUiConfigModal('server')" style="background:var(--bg3); color:var(--text); border:1px solid var(--border); padding:6px 12px; border-radius:8px; font-size:12px; font-weight:bold; cursor:pointer;">⚙️ <?= t('ui_config_btn') ?></button>
</div>

<!-- 🌟 CORRECTION ICI : On supprime le padding pour que les blocs collent aux bords ! -->
<div id="server-blocks-container" style="display: flex; flex-direction: column;">

<!-- BLOC ESPACE DISQUE -->
<div id="block-server-disk" style="background:var(--bg2); border:1px solid var(--border); border-radius:16px; padding:20px; box-shadow:0 4px 15px rgba(0,0,0,0.2); margin-top:20px;">
<div style="display:flex; align-items:center; gap:10px; margin-bottom:20px;">
<img src="assets/img/icons/disque-dur.png" alt="HDD" style="width:24px; height:24px; object-fit:contain;">
<h3 style="margin:0; font-size:16px; color:var(--text);"><?= t('server_disk_space') ?></h3>
</div>
<div id="server-disk-container">
<div style="text-align:center; color:var(--muted); padding:20px;">⏳ <?= t('status_loading') ?></div>
</div>
</div>

<!-- BLOC HISTORIQUE TÉLÉCHARGEMENT -->
<div id="block-server-dl" style="background:var(--bg2); border:1px solid var(--border); border-radius:16px; padding:20px; box-shadow:0 4px 15px rgba(0,0,0,0.2); margin-top:20px;">
<div style="display:flex; align-items:center; gap:10px; margin-bottom:5px;">
<span style="font-size:20px;">⏱️</span>
<h3 style="margin:0; font-size:16px; color:var(--text);"><?= t('server_dl_history') ?></h3>
</div>
<div id="server-dl-total" style="font-size: 24px; font-weight: 800; color: var(--text); margin-bottom: 20px;">
<span style="font-size:14px; font-weight:normal; color:var(--muted);">...</span>
</div>
<div id="server-dl-chart" style="height: 160px; position: relative;">
<div style="text-align:center; color:var(--muted); padding-top:40px;">⏳ <?= t('status_loading') ?></div>
</div>
</div>

<!-- BLOC HISTORIQUE CLIENT TORRENT (Graphique) -->
<div id="block-server-torrent" style="background:var(--bg2); border:1px solid var(--border); border-radius:16px; padding:20px; box-shadow:0 4px 15px rgba(0,0,0,0.2); margin-top:20px;">
<div style="display:flex; align-items:center; gap:10px; margin-bottom:5px;">
<span style="font-size:20px;">⬇️</span>
<h3 style="margin:0; font-size:16px; color:var(--text);"><?= t('server_recent_torrents') ?></h3>
</div>
<div id="server-torrent-total" style="font-size: 24px; font-weight: 800; color: var(--text); margin-bottom: 20px;">
<span style="font-size:14px; font-weight:normal; color:var(--muted);">...</span>
</div>
<div id="server-torrent-chart" style="height: 160px; position: relative;">
<div style="text-align:center; color:var(--muted); padding-top:40px;">⏳ <?= t('status_loading') ?></div>
</div>
</div>

<!-- BLOC HISTORIQUE DÉTAILLÉ (GROUPÉ) -->
<div id="block-server-history" style="background:var(--bg2); border:1px solid var(--border); border-radius:16px; padding:20px; box-shadow:0 4px 15px rgba(0,0,0,0.2); margin-top:20px;">
<div style="display:flex; align-items:center; gap:10px; margin-bottom:15px;">
<span style="font-size:20px;">📅</span>
<h3 style="margin:0; font-size:16px; color:var(--text);"><?= t('server_detailed_history') ?></h3>
</div>
<div id="server-detailed-history-container">
<div style="text-align:center; color:var(--muted); padding:20px;">⏳ <?= t('status_loading') ?></div>
</div>
</div>

</div>
</div>

<!-- Style pour cacher la petite flèche native du navigateur sur les accordéons -->
<style>
details.history-group summary::-webkit-details-marker { display: none; }
details.history-group summary { list-style: none; }
details.history-group[open] .history-chevron { transform: rotate(180deg); }
.history-chevron { transition: transform 0.3s; }
</style>

<?php include 'includes/footer.php'; ?>
<script>
function pageInit() { loadHome(); }
</script>
</body>
</html>
