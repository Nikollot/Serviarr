// ── i18n.js — Système de gestion des langues Serviarr ────────────────────────
// Ce fichier ne stocke plus les textes (ils sont dans les fichiers .json).
// Il gère uniquement la logique, les cookies et le remplacement de variables.

const SUPPORTED_LANGS = ['fr', 'en', 'es', 'de', 'it', 'zh', 'ja'];
const LANG_LOCALE = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', de: 'de-DE', it: 'it-IT', zh: 'zh-CN', ja: 'ja-JP' };

// Récupère la langue depuis le cookie
function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
}

let _currentLang = getCookie('serviarr_lang') || 'fr';

/**
 * Traduit une clé. Supporte les variables : t('clé', {n: 3}) avec '{n}' dans la chaîne.
 * Note : La variable globale I18N est injectée dynamiquement par PHP dans header.php.
 */
function t(key, vars) {
    // On cherche dans l'objet I18N généré par PHP. Si introuvable, on affiche la clé brute.
    let str = (typeof I18N !== 'undefined' && I18N[key] !== undefined) ? I18N[key] : key;

    // Si on a des variables à injecter (ex: {n} épisodes)
    if (vars && typeof str === 'string') {
        Object.entries(vars).forEach(([k, v]) => {
            str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
        });
    }
    return str;
}

/**
 * Change la langue active, sauvegarde dans le cookie et recharge la page.
 */
function setLang(lang) {
    if (!SUPPORTED_LANGS.includes(lang)) return;
    
    // Le cookie est indispensable pour que PHP puisse le lire au prochain chargement (valable 1 an)
    document.cookie = `serviarr_lang=${lang}; path=/; max-age=31536000`;
    localStorage.setItem('serviarr_lang', lang); // Sauvegarde annexe
    
    // On recharge la page pour appliquer la langue côté PHP et JS
    window.location.reload();
}

/**
 * Retourne le format régional pour les dates (ex: "fr-FR" ou "en-US")
 */
function currentLocale() {
    return LANG_LOCALE[_currentLang] || 'fr-FR';
}

// Initialisation de la balise HTML
document.documentElement.setAttribute('lang', _currentLang);