// ── sw.js (Service Worker pour Serviarr) ──

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
    if (!event.data) return;
    const data = event.data.json();

    event.waitUntil(
        self.registration.getNotifications().then(existingNotifications => {

            // 🌟 1. REGROUPEMENT DES FILMS (Dès le 2ème film)
            if (data.mediaType === 'movie') {
                let movieNotifs = existingNotifications.filter(n => n.data && n.data.mediaType === 'movie');
                const movieGroupTag = 'serviarr_movies_group';
                const isAlreadyGrouped = movieNotifs.some(n => n.tag === movieGroupTag);

                // Si on a déjà au moins 1 film affiché ou qu'on est déjà groupé
                if (isAlreadyGrouped || movieNotifs.length >= 1) {
                    movieNotifs.forEach(n => n.close());

                    let allTitles = [];

                    // On récupère les titres des notifications précédentes
                    movieNotifs.forEach(n => {
                        if (n.data.allTitles) {
                            allTitles = allTitles.concat(n.data.allTitles); // Récupère depuis le groupe
                        } else if (n.data.movieTitle) {
                            allTitles.push(n.data.movieTitle); // Récupère depuis le film seul
                        }
                    });

                    // On ajoute le nouveau film (s'il n'est pas déjà dans la liste)
                    if (data.movieTitle && !allTitles.includes(data.movieTitle)) {
                        allTitles.push(data.movieTitle);
                    }

                    const totalMovies = allTitles.length;
                    let bodyText = allTitles.join(', ');

                    // Sécurité : si le texte est trop long, on coupe proprement
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
                            url: '/', // Pour plusieurs films, on renvoie à l'accueil
                            mediaType: 'movie',
                            allTitles: allTitles // On sauvegarde la liste pour le prochain !
                        }
                    };

                    return self.registration.showNotification(`🎬 ${totalMovies} films téléchargés`, options);
                }
            }

            // 🌟 2. REGROUPEMENT DES SÉRIES PAR SAISON (Dès le 3ème épisode)
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

            // 🌟 3. LOGIQUE CLASSIQUE (1er film, 1er/2ème épisode d'une série)
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
                    movieTitle: data.movieTitle, // On sauvegarde le titre pour un éventuel regroupement futur
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
