<?php

// Définit les champs requis dans le formulaire d'ajout
function iframe_fields() {
    return [
        ['key' => 'url', 'label' => t('iframe_url_label'), 'type' => 'url', 'placeholder' => 'http://192.168.1.50:8080'],
        ['key' => 'icon', 'label' => t('iframe_icon_label'), 'type' => 'text', 'placeholder' => '🌐']
    ];
}

// L'interface web n'a pas d'API à interroger pour des statistiques, on renvoie un statut basique
function iframe_status($app) {
    return [
        'ok' => true,
        'stats' => [],
        'items' => []
    ];
}
