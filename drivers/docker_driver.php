<?php
// Définit les champs requis dans le formulaire "Ajouter une application"
function docker_fields() {
    return [
        [
            'key' => 'url',
            'label' => t('docker_url_label'),
            'type' => 'text',
            'placeholder' => '/var/run/docker.sock'
        ],
        [
            'key' => 'web_name',
            'label' => t('docker_web_name_label'), // 🌟 Traduction au lieu de texte brut
            'type' => 'text',
            'placeholder' => 'Portainer, Dozzle, Yacht...'
        ],
        [
            'key' => 'portainer_url',
            'label' => t('docker_web_url_label'), // 🌟 Traduction au lieu de texte brut
            'type' => 'text',
            'placeholder' => 'https://mon-docker.domaine.fr'
        ]
    ];
}

// Test de connexion (affiché par la pastille verte/rouge dans les paramètres)
function docker_status($app) {
    $url = $app['url'] ?? '/var/run/docker.sock';

    $ch = curl_init("http://localhost/info");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_UNIX_SOCKET_PATH => $url,
        CURLOPT_TIMEOUT => 3
    ]);
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code === 200) {
        $data = json_decode($res, true);
        return [
            'status' => 'online',
            'info' => ($data['Containers'] ?? 0) . ' ' . t('docker_containers')
        ];
    }
    return ['status' => 'offline', 'error' => t('docker_socket_error')];
}