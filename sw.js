// ── sw.js (Service Worker pour Serviarr) ──

// 1. Installation et activation immédiate
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force le nouveau Service Worker à s'installer immédiatement
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim()); // Prend le contrôle de la page instantanément
});

// 2. Interception des messages Push (Venant de api.php)
self.addEventListener('push', (event) => {
    if (event.data) {
        // On lit les données envoyées par ton serveur PHP
        const data = event.data.json();

        // Configuration du design de la notification
        const options = {
            body: data.body,
            icon: data.icon || '/assets/img/icons/icon.png',  // 👈 Affiche miniature (ou icône par défaut)
            image: data.image,                                // 👈 L'affiche en très grand quand on déploie
            tag: data.tag || 'serviarr_default',              // 🌟 NOUVEAU : Identifiant pour écraser les anciennes notifs !
            badge: '/assets/img/icons/badge.png',             // 👈 La petite icône transparente de la barre d'état
            vibrate: [200, 100, 200, 100, 200, 100, 200],     // Schéma de vibration
            data: {
                url: data.url || '/' // L'URL à ouvrir lors du clic
            }
        };

        // On déclenche l'affichage de la notification sur le système
        event.waitUntil(
            self.registration.showNotification(data.title || 'Serviarr', options)
        );
    }
});

// 3. Action quand on clique sur la notification (écran verrouillé ou centre de notifs)
self.addEventListener('notificationclick', (event) => {
    event.notification.close(); // Ferme la notification

    // On récupère l'URL cible (ex: films.php?movie=12)
    const targetUrl = event.notification.data.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                // Si l'application est déjà ouverte en arrière-plan
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    // 🌟 NOUVEAU : On la force à naviguer vers la fiche du film, puis on l'affiche
                    return client.navigate(targetUrl).then(c => c.focus());
                }
            }
            // Si elle était complètement fermée, on ouvre une nouvelle fenêtre
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
