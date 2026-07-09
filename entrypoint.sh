#!/bin/bash
set -e

# Vérifier si le fichier config.json existe dans le dossier monté par l'utilisateur
if [ ! -f "/var/www/html/data/config.json" ]; then
    echo "⏳ Création du fichier config.json par défaut..."
    mkdir -p /var/www/html/data
    echo '{}' > /var/www/html/data/config.json
fi

# Forcer les droits pour qu'Apache puisse lire et écrire, peu importe comment l'utilisateur a créé son dossier
echo "✅ Application des permissions pour Apache..."
chown -R www-data:www-data /var/www/html/data
chmod 660 /var/www/html/data/config.json || true

# Lancer la commande principale demandée par le conteneur (ici, Apache)
echo "🚀 Démarrage de Serviarr..."
exec "$@"