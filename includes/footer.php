<div class="modal-bg" id="modal-movie"><div class="modal modal-movie"><div id="movie-detail-content"></div></div></div>
<div class="modal-bg" id="modal-serie"><div class="modal modal-serie"><div id="serie-detail-content"></div></div></div>

</main>
</div>

<div id="tab-settings">
<div class="settings-inner">
<button class="btn-icon settings-close-btn" onclick="hideSettings()">✕ <?= t('settings_close') ?></button>
<div class="page-title"><?= t('nav_settings') ?></div>

<div class="settings-section">
<div class="settings-section-header">🌐 <?= t('settings_lang') ?></div>
<div class="settings-section-body">
<div class="form-row">
<label><?= t('settings_lang') ?></label>
<select id="app-lang" onchange="setLang(this.value)" style="width:100%; padding:10px; background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:6px;">
<option value="fr" <?= ($lang === 'fr') ? 'selected' : '' ?>>Français</option>
<option value="en" <?= ($lang === 'en') ? 'selected' : '' ?>>English</option>
<option value="es" <?= ($lang === 'es') ? 'selected' : '' ?>>Español</option>
<option value="de" <?= ($lang === 'de') ? 'selected' : '' ?>>Deutsch</option>
<option value="it" <?= ($lang === 'it') ? 'selected' : '' ?>>Italiano</option>
<option value="zh" <?= ($lang === 'zh') ? 'selected' : '' ?>>中文</option>
<option value="ja" <?= ($lang === 'ja') ? 'selected' : '' ?>>日本語</option>
</select>
</div>
</div>
</div>

<div class="settings-section">
<div class="settings-section-header">📦 <?= t('settings_apps') ?></div>
<div class="settings-section-body">
<div id="apps-list"><p class="apps-list-loading"><?= t('loading') ?></p></div>
<div class="settings-add-app-wrap">
<button class="btn-sm accent" onclick="openAddModal()">＋ <?= t('settings_add_app') ?></button>
</div>
</div>
</div>

<div class="settings-section">
<div class="settings-section-header">🔔 <?= t('settings_notifications') ?></div>
<div class="settings-section-body">
<h3 class="vapid-title"><?= t('settings_webhook_title') ?></h3>
<p class="settings-api-hint"><?= t('settings_webhook_hint') ?></p>
<div class="input-btn-row">
<input type="text" id="setting-webhook-url" class="vapid-input mono" readonly placeholder="…">
<button class="btn-sm accent" onclick="copyWebhookUrl()"><?= t('settings_webhook_copy') ?></button>
</div>
</div>
<div class="settings-section-body">
<h3 class="vapid-title"><?= t('settings_vapid_title') ?></h3>
<p class="settings-api-hint">
<?= t('settings_vapid_hint') ?>
<a href="https://www.attheminute.com/vapid-key-generator" target="_blank" class="link-accent">vapid-key-generator</a>
</p>
<div class="vapid-form">
<div class="vapid-field">
<label class="vapid-label"><?= t('settings_vapid_email') ?></label>
<input type="email" id="setting-vapid-email" class="vapid-input" placeholder="votre.email@example.com">
</div>
<div class="vapid-field">
<label class="vapid-label"><?= t('settings_vapid_public') ?></label>
<input type="text" id="setting-vapid-public" class="vapid-input mono" placeholder="...">
</div>
<div class="vapid-field">
<label class="vapid-label"><?= t('settings_vapid_private') ?></label>
<input type="password" id="setting-vapid-private" class="vapid-input mono" placeholder="...">
</div>
<button id="btn-save-push" class="btn-primary" onclick="savePushConfig()"><?= t('settings_vapid_save') ?></button>
</div>
</div>
<div class="settings-section-body">
<p class="settings-notif-hint">
<?= t('settings_notif_hint') ?>
</p>
<button class="btn-sm accent" onclick="enableWebNotifications()"><?= t('settings_notif_allow') ?></button>
</div>
</div>

<div class="settings-section">
<div class="settings-section-header">🔒 <?= t('settings_security') ?></div>
<div class="settings-section-body settings-body-sm">
<div class="form-row"><label><?= t('settings_current_pw') ?></label><div style="position: relative;"><input type="password" id="pw-current" placeholder="••••••••" style="padding-right: 40px;"><span onclick="togglePassword('pw-current', this)" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); cursor: pointer; color: var(--muted); user-select: none;">👁️</span></div></div>
<div class="form-row"><label><?= t('settings_new_pw') ?></label><div style="position: relative;"><input type="password" id="pw-new" placeholder="••••••••" style="padding-right: 40px;"><span onclick="togglePassword('pw-new', this)" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); cursor: pointer; color: var(--muted); user-select: none;">👁️</span></div></div>
<div class="form-row"><label><?= t('settings_confirm_pw') ?></label><div style="position: relative;"><input type="password" id="pw-confirm" placeholder="••••••••" style="padding-right: 40px;"><span onclick="togglePassword('pw-confirm', this)" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); cursor: pointer; color: var(--muted); user-select: none;">👁️</span></div></div>
<button class="btn-sm accent" onclick="changePassword()"><?= t('settings_change_pw') ?></button>
</div>
<div class="settings-section-header"><?= t('settings_2fa') ?></div>
<div class="settings-section-body" id="settings-2fa-container">
<p class="settings-2fa-loading"><?= t('settings_2fa_loading') ?></p>
</div>
</div>

<div class="settings-section">
<div class="settings-section-header"><?= t('settings_tmdb') ?></div>
<div class="settings-section-body settings-body-md">
<p class="settings-api-hint">
<?= t('settings_tmdb_hint') ?>
</p>
<div class="form-row">
<label><?= t('settings_tmdb_key') ?></label>
<div class="input-btn-row">
<input type="password" id="setting-tmdb-key" placeholder="Ex: e4b8f...">
<button id="btn-save-tmdb" class="btn-sm accent" onclick="saveTmdbConfig()"><?= t('settings_tmdb_save') ?></button>
</div>
</div>
</div>
</div>

<div class="settings-section">
<div class="settings-section-header"><?= t('settings_backup') ?></div>
<div class="settings-section-body settings-backup-row">
<button class="btn-sm btn-backup" onclick="exportBackup()">📥 <?= t('settings_export') ?></button>
<label class="btn-sm btn-file-label">
📤 <?= t('settings_import') ?>
<input type="file" accept=".json" class="input-file-hidden" onchange="importBackup(this)">
</label>
</div>
</div>

<div class="settings-section">
<div class="settings-section-header">📜 <?= t('settings_activity_log') ?></div>
<div class="settings-section-body">
<div id="activity-log-list"><p class="apps-list-loading"><?= t('loading') ?></p></div>
</div>
</div>
</div>
</div>

<div class="modal-bg modal-app-inner" id="modal-app">
<div class="modal">
<h3 id="modal-title"><?= t('modal_add_app') ?></h3>
<div class="form-row"><label><?= t('modal_app_name') ?></label><input type="text" id="modal-name" placeholder="<?= t('modal_app_name_placeholder') ?>"></div>
<div class="form-row">
<label><?= t('modal_app_type') ?></label>
<select id="modal-driver" onchange="loadDriverFields()"><option value=""><?= t('modal_app_type_choose') ?></option></select>
</div>
<div id="modal-fields"></div>
<div class="modal-actions">
<button class="btn-modal-cancel" onclick="closeModal()"><?= t('modal_cancel') ?></button>
<button class="btn-modal-save" onclick="saveApp()"><?= t('modal_save') ?></button>
</div>
</div>
</div>

<div class="modal-bg" id="modal-releases" class="modal-z-releases">
<div class="modal modal-releases-inner"></div>
</div>

<div class="modal-bg" id="modal-add-media" class="modal-z-add-media">
<div class="modal modal-add-media-inner">
<h3 id="add-media-title" class="modal-add-title"><?= t('add_media_title') ?></h3>
<div id="add-media-loader" class="modal-add-loader">⏳ <?= t('loading') ?></div>
<div id="add-media-form" class="auth-error-hidden">
<div class="form-row"><label><?= t('add_media_quality') ?></label><select id="add-media-profile"></select></div>
<div class="form-row"><label><?= t('add_media_folder') ?></label><select id="add-media-folder"></select></div>
<div class="modal-actions">
<button class="btn-modal-cancel" onclick="document.getElementById('modal-add-media').classList.remove('open')"><?= t('modal_cancel') ?></button>
<button class="btn-modal-save" id="btn-confirm-add"><?= t('add_media_confirm') ?></button>
</div>
</div>
</div>
</div>

<div class="modal-bg" id="modal-confirm" class="modal-z-confirm">
<div class="modal modal-confirm-inner">
<div class="modal-confirm-icon">⚠️</div>
<h3 id="confirm-title" class="modal-confirm-title"><?= t('confirm_title') ?></h3>
<p id="confirm-message" class="modal-confirm-msg"></p>
<div class="modal-actions modal-confirm-actions">
<button class="btn-modal-cancel btn-confirm-cancel" onclick="closeConfirmModal()"><?= t('confirm_cancel') ?></button>
<button class="btn-modal-save btn-confirm-delete" id="btn-confirm-action"><?= t('confirm_yes_delete') ?></button>
</div>
</div>
</div>

<div id="modal-actor" class="modal-actor">
<div class="modal-actor-scroll">
<div class="modal-actor-inner">
<button onclick="closeActorModal()" class="modal-actor-close">✕ <?= t('actor_close') ?></button>
<div id="actor-header-detail" class="actor-header-detail"></div>
<h3 class="actor-filmography-title"><span>🎬</span> <?= t('actor_filmography') ?></h3>
<div id="actor-credits-list" class="actor-credits-list"></div>
</div>
</div>
</div>

<div id="notif"></div>
<script src="assets/js/script.js?v=21"></script>
</body>
</html>
