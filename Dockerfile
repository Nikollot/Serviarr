# Image de base avec PHP et Apache
FROM php:8.2-apache

# Installation des paquets système et de l'extension GMP
RUN apt-get update && apt-get install -y \
    git \
    unzip \
    libgmp-dev \
    && docker-php-ext-install gmp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Activation du module rewrite d'Apache
RUN a2enmod rewrite

# Installation de Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Définition du dossier de travail
WORKDIR /var/www/html

# Copie de tout ton code source dans l'image
COPY . /var/www/html/

# Installation de la dépendance Web Push pour les notifications
RUN composer require minishlink/web-push

# Préparation initiale du dossier et création de la sécurité de base (rétrocompatible)
RUN mkdir -p /var/www/html/data \
    && { \
        echo "# Interdit l'accès web à tout le contenu du dossier /data"; \
        echo "<IfModule mod_authz_core.c>"; \
        echo "    Require all denied"; \
        echo "</IfModule>"; \
        echo "<IfModule !mod_authz_core.c>"; \
        echo "    Order deny,allow"; \
        echo "    Deny from all"; \
        echo "</IfModule>"; \
    } > /var/www/html/data/.htaccess \
    && chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html

# Copier le script de démarrage, nettoyer les retours chariot Windows (\r) éventuels et rendre exécutable
COPY entrypoint.sh /usr/local/bin/
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh \
    && chmod +x /usr/local/bin/entrypoint.sh

# Définir le script comme point d'entrée
ENTRYPOINT ["entrypoint.sh"]

# Commande par défaut pour lancer Apache
CMD ["apache2-foreground"]
