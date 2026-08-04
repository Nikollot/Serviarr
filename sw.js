// ── sw.js (Service Worker pour Serviarr avec mode Hors-Ligne) ──

const CACHE_NAME = 'serviarr-cache-v2'; // 🌟 v2 : Force le nettoyage des images cassées !

const STATIC_ASSETS = [
    '/',
    '/index.php',
    '/films.php',
    '/series.php',
    '/assets/css/style.css',
    '/assets/js/i18n.js',
    '/script.js', 
    '/assets/img/icons/gemini-svg.svg',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return Promise.all(
                STATIC_ASSETS.map(url => 
                    fetch(url).then(response => {
                        if (response.ok) return cache.put(url, response);
                    }).catch(err => console.log('Fichier non mis en cache:', url, err))
                )
            );
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.map(key => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            })
        ))
    );
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    const isApiRequest = url.pathname.includes('api.php');
    const isImageRequest = event.request.destination === 'image' || url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp)$/i) || url.hostname.includes('tmdb.org');

    // STRATÉGIE A : Requêtes API (Réseau en priorité, fallback sur le cache)
    if (isApiRequest) {
        event.respondWith(
            fetch(event.request)
            .then(response => {
                // SÉCURITÉ : On ne cache que si c'est un succès (200 OK)
                if (response && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
                }
                return response;
            })
            .catch(async () => {
                // Hors-ligne : on cherche dans le cache
                const cachedResponse = await caches.match(event.request);
                if (cachedResponse) return cachedResponse;

                // Si rien en cache, on renvoie une erreur au format JSON pour ne pas faire planter JavaScript
                return new Response(JSON.stringify({ error: "Mode hors-ligne : données indisponibles." }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    if (isImageRequest) {
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                if (cachedResponse) return cachedResponse;
                
                return fetch(event.request).then(response => {
                    // 🌟 SÉCURITÉ : On ne cache que les vraies images (200) ou opaques (0)
                    // Si Sonarr plante (502, 404), on refuse de cacher l'erreur !
                    if (response && (response.status === 200 || response.status === 0)) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
                    }
                    return response;
                }).catch(() => new Response('')); 
            })
        );
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
                }
                return response;
            })
            .catch(async () => {
                const cachedResponse = await caches.match(event.request, { ignoreSearch: true });
                if (cachedResponse) return cachedResponse;

                if (event.request.mode === 'navigate') {
                    const indexResponse = await caches.match('/index.php') || await caches.match('/');
                    if (indexResponse) return indexResponse;
                }
                
                return new Response('', { status: 503, statusText: 'Service Unavailable' });
            })
    );
});

// ── GESTION DES NOTIFICATIONS PUSH ──
self.addEventListener('push', (event) => {
    if (!event.data) return;
    const data = event.data.json();

    event.waitUntil(
        self.registration.getNotifications().then(existingNotifications => {

            if (data.mediaType === 'movie') {
                let movieNotifs = existingNotifications.filter(n => n.data && n.data.mediaType === 'movie');
                const movieGroupTag = 'serviarr_movies_group';
                const isAlreadyGrouped = movieNotifs.some(n => n.tag === movieGroupTag);

                if (isAlreadyGrouped || movieNotifs.length >= 1) {
                    movieNotifs.forEach(n => n.close());

                    let allTitles = [];
                    movieNotifs.forEach(n => {
                        if (n.data.allTitles) {
                            allTitles = allTitles.concat(n.data.allTitles);
                        } else if (n.data.movieTitle) {
                            allTitles.push(n.data.movieTitle);
                        }
                    });

                    if (data.movieTitle && !allTitles.includes(data.movieTitle)) {
                        allTitles.push(data.movieTitle);
                    }

                    const totalMovies = allTitles.length;
                    let bodyText = allTitles.join(', ');

                    if (bodyText.length > 150) {
                        bodyText = allTitles.slice(0, 3).join(', ') + `... et ${totalMovies - 3} autres.`;
                    }

                    const options = {
                        body: bodyText,
                        icon: data.icon || '/assets/img/icons/icon.png',
                        tag: movieGroupTag,
                        badge: '/assets/img/icons/badge.png',
                        vibrate: [200, 100, 200],
                        renotify: true,
                        data: {
                            url: '/', 
                            mediaType: 'movie',
                            allTitles: allTitles 
                        }
                    };

                    return self.registration.showNotification(`🎬 ${totalMovies} films téléchargés`, options);
                }
            }

            if (data.mediaType === 'serie' && data.seasonNumber > 0) {
                let seasonNotifs = existingNotifications.filter(n =>
                n.data && n.data.mediaType === 'serie' &&
                n.data.seriesId === data.seriesId && n.data.seasonNumber === data.seasonNumber
                );

                const seasonGroupTag = `serie_${data.seriesId}_season_${data.seasonNumber}`;
                const isAlreadyGrouped = seasonNotifs.some(n => n.tag === seasonGroupTag);

                if (isAlreadyGrouped || seasonNotifs.length >= 2) {
                    seasonNotifs.forEach(n => n.close());

                    const options = {
                        body: `Plusieurs épisodes ou la saison complète ont été téléchargés.`,
                        icon: data.icon || '/assets/img/icons/icon.png',
                        image: data.image,
                        tag: seasonGroupTag,
                        badge: '/assets/img/icons/badge.png',
                        vibrate: [200, 100, 200],
                        renotify: true,
                        data: {
                            url: data.url || '/',
                            mediaType: 'serie',
                            seriesId: data.seriesId,
                            seasonNumber: data.seasonNumber
                        }
                    };

                    return self.registration.showNotification(`📺 ${data.seriesTitle} - Saison ${data.seasonNumber}`, options);
                }
            }

            const uniqueTag = data.tag ?
            (data.tag + '-' + Math.random().toString(36).substr(2, 5)) :
            ('serviarr-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5));

            const options = {
                body: data.body,
                icon: data.icon || '/assets/img/icons/icon.png',
                image: data.image,
                tag: uniqueTag,
                badge: '/assets/img/icons/badge.png',
                vibrate: [200, 100, 200, 100, 200],
                renotify: true,
                data: {
                    url: data.url || '/',
                    mediaType: data.mediaType,
                    movieTitle: data.movieTitle, 
                    seriesId: data.seriesId,
                    seasonNumber: data.seasonNumber
                }
            };

            return self.registration.showNotification(data.title || 'Serviarr', options);
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = event.notification.data.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.navigate(targetUrl).then(c => c.focus());
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
