#!/bin/bash
set -e

# Vérifier si le fichier config.json existe dans le dossier monté par l'utilisateur
if [ ! -f "/var/www/html/data/config.json" ]; then
    echo "⏳ Création du fichier config.json par défaut..."
    mkdir -p /var/www/html/data
    echo '{}' > /var/www/html/data/config.json
fi

# Sécuriser le dossier data avec un .htaccess s'il n'existe pas
if [ ! -f "/var/www/html/data/.htaccess" ]; then
    echo "🔒 Création du fichier .htaccess de sécurité..."
    cat << 'EOF' > /var/www/html/data/.htaccess
# Interdit l'accès web à tout le contenu du dossier /data
<IfModule mod_authz_core.c>
    Require all denied
</IfModule>
<IfModule !mod_authz_core.c>
    Order deny,allow
    Deny from all
</IfModule>
EOF
fi

# Forcer les droits pour qu'Apache puisse lire et écrire, peu importe comment l'utilisateur a créé son dossier
echo "✅ Application des permissions pour Apache..."
chown -R www-data:www-data /var/www/html/data
chmod 660 /var/www/html/data/config.json || true

# Lancer la commande principale demandée par le conteneur (ici, Apache)
echo "🚀 Démarrage de Serviarr..."
exec "$@"
