# Serviarr 🚀

Unified self-hosted dashboard to manage your media stack (Radarr, Sonarr, Prowlarr, Transmission) and your Docker containers from a single interface — designed for personal use on a NAS or home server.

> ⚠️ **Personal project, not a professional security audit.** This repository has undergone several code review passes (authentication, CSRF, SSRF, XSS) but has **not** been subjected to a formal security audit by a third party or a penetration test. Use it knowingly, ideally behind your own reverse proxy and on a network you control.

## ⚠️ Important Warning: Docker Socket Access

If you enable the Docker management feature, the `docker-compose.yml` example below mounts `/var/run/docker.sock` inside the container:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

**This mount gives the application almost total control over the host machine** (create, modify, or delete any container, including privileged containers capable of breaking out of the Docker sandbox). This is not a bug — it's the standard trade-off for managing Docker from a web interface. Only mount this socket if:
- you understand the implications,
- the application runs on a trusted network,
- access to Serviarr itself is protected (strong password, 2FA enabled, reverse proxy with HTTPS).

If you do not want this risk, simply do not configure the "Docker" app in the settings: the rest of Serviarr works normally without it.

## 💡 Project Origin

Being a huge fan of the **NZB360** Android app, I was looking for an equivalent solution accessible directly from a web browser, regardless of the device (PC, Mac, or iOS/Android mobile). Unable to find a web dashboard bringing together exactly these features with a clean interface, I decided to create Serviarr.

🤖 **Development Note:** This project was entirely coded and architected with the help of artificial intelligence, using **Claude Code** and **Gemini**.

## ✨ Key Features

* **Centralized Media Management:** Full integration to view, search, and add movies and TV shows.
* **Custom Indexers:** Choice between **Prowlarr** and **Jackett** for source management and searching.
* **Download Clients:** Support for **Transmission** and **qBittorrent** to monitor and manage your downloads in real-time.
* **Advanced Security:** Secure login system with Two-Factor Authentication (2FA / TOTP) support.
* **Clean & Responsive UI:** A polished design (light/dark mode), tailored for a seamless experience on both smartphones and desktops.
* **Web Push Notifications:** Real-time alerts on mobile and desktop to track your imports and downloads (via VAPID).
* **100% Multilingual:** The interface is fully translated using a dynamic JSON file system, with no hardcoded text, supporting multiple languages (French, English, Spanish, etc.).

## 🛠️ Technologies Used

* **Backend:** PHP
* **Frontend:** HTML5, CSS3, Vanilla JavaScript
* **Architecture:** Designed to run easily via Docker containers (Apache/PHP).

## 🚀 Quick Installation

1. Clone this repository to your server:
   ```bash
   git clone https://github.com/Nikollot/Serviarr.git
   cd serviarr
   ```

2. Adapt the provided `docker-compose.yml` to your environment (especially volume paths).

3. Start the container:
   ```bash
   docker compose up -d
   ```

4. Open `http://your-server:80` (or your chosen port) and create your administrator password on the first launch.

5. Go to **Settings → Applications** to connect Radarr, Sonarr, Prowlarr, Transmission, and/or Docker.

### `docker-compose.yml` Example

```yaml
version: '3.8'
services:
  mediaboard:
    image: php:apache
    container_name: serviarr
    ports:
      - "80:80"
    volumes:
      - .:/var/www/html #change the path
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped
    environment:
      - APACHE_RUN_USER=www-data
      - APACHE_RUN_GROUP=www-data
      - COMPOSER_ALLOW_SUPERUSER=1 # Allows Composer to run as root
    entrypoint: >
      bash -c "
        if ! php -m | grep -q 'gmp'; then
          echo '⏳ Installing system packages and GMP...'
          apt-get update && apt-get install -y git unzip libgmp-dev
          docker-php-ext-install gmp
        fi &&
        if [ ! -f '/usr/local/bin/composer' ]; then
          echo '⏳ Installing Composer...'
          curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
        fi &&
        if [ ! -d '/var/www/html/vendor' ]; then
          echo '⏳ Installing Web-Push (Serviarr)...'
          cd /var/www/html && composer require minishlink/web-push && rm -f composer.json composer.lock
        fi &&
        echo '✅ Applying permissions...'
        chown -R www-data:www-data /var/www/html &&
        chmod -R 755 /var/www/html &&
        chmod 660 /var/www/html/data/config.json || true &&
        echo '🚀 Starting Apache...'
        apache2-foreground
      "      
```

> Remember to enable `AllowOverride All` so that the `.htaccess` files of the project (which protect the `data/` folder) are properly processed by Apache — this is not the case by default on the `php:apache` image.

## Deployment Recommendations

- Place Serviarr behind a reverse proxy with HTTPS (Nginx Proxy Manager, Traefik, Caddy...)
- Enable 2FA in Settings → Security
- Only mount the Docker socket if you really need it
- Verify that `https://your-domain/data/config.json` returns a 403 error before considering your instance secure
- Regularly back up your `data/config.json` via the built-in export feature

## Radarr/Sonarr Webhook Configuration

To receive push notifications upon downloads:
1. Go to Settings → Notifications, and copy the displayed webhook URL
2. In Radarr/Sonarr: Go to Settings → Connect → Add → Webhook, and paste the copied URL
3. Check the desired events (On Import, On Upgrade...)

## Tech Stack

- Backend: PHP 8+ (no framework, no database — JSON configuration)
- Frontend: Vanilla JavaScript, custom CSS
- Push notifications: [minishlink/web-push](https://github.com/web-push-libs/web-push-php)

## Contributing

Feedback, bug reports, and pull requests are welcome via GitHub Issues. For any security-related issues, please report them privately rather than via a public Issue.

## License

[To be completed — MIT recommended for this type of project]

## Disclaimer

This software is provided "as is", without warranty of any kind. The author cannot be held liable for any damages resulting from its use, including — but not limited to — unauthorized access, data loss, or compromise of the host system via the Docker socket if it is mounted.

