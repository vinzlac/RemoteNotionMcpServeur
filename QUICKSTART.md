# 🚀 Démarrage Rapide

## 1. Configuration initiale

```bash
# Installer les dépendances
npm install

# Créer le fichier .env
cp env.example .env

# Éditer .env et ajouter votre clé API Notion
# NOTION_TOKEN=ntn_votre_cle_ici
```

## 2. Obtenir votre clé API Notion

1. Allez sur https://www.notion.so/my-integrations
2. Cliquez sur "+ New integration"
3. Donnez un nom à votre intégration
4. Copiez le "Internal Integration Token" (format: `ntn_...` ou `secret_...`)
5. Collez-le dans votre fichier `.env` comme `NOTION_TOKEN`

⚠️ **Important** : Partagez les pages/bases de données Notion que vous voulez utiliser avec cette intégration (menu "..." → "Add connections" → sélectionnez votre intégration)

## 3. Démarrer le serveur

### Mode développement (avec rechargement automatique) :
```bash
npm run dev
```

### Mode production :
```bash
npm run build
npm start
```

Le serveur démarre sur `http://localhost:3000` et affiche :
- L'URL du serveur
- Le token d'authentification (si généré automatiquement)

## 4. Accéder depuis votre iPhone

### Option A : Même réseau Wi-Fi (le plus simple)

1. Trouvez l'IP de votre Mac :
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

2. Dans ChatMCP sur iPhone :
   - Server Name : `Notion MCP`
   - URL : `http://VOTRE_IP:3000/mcp`
   - Exemple : `http://192.168.1.100:3000/mcp`
   - **Note** : L'endpoint est `/mcp` (pas `/v1/mcp`)

### Option B : Tunnel ngrok (accès depuis n'importe où)

1. Installez ngrok : https://ngrok.com/download

2. Dans un nouveau terminal :
```bash
ngrok http 3000
```

3. Copiez l'URL HTTPS (ex: `https://abc123.ngrok.io`)

4. Dans ChatMCP :
   - URL : `https://abc123.ngrok.io/mcp`

## 5. Authentification

Le serveur utilise l'authentification par bearer token :

- **Si `AUTH_TOKEN` n'est pas défini** : Un token sera généré automatiquement et affiché dans la console au démarrage
- **Pour la production** : Définissez `AUTH_TOKEN` dans votre `.env`

Si ChatMCP nécessite l'authentification, vous devrez peut-être configurer les headers dans l'application (consultez la documentation de ChatMCP).

## 6. Tester

Le serveur affichera les informations de connexion au démarrage. Vous pouvez tester avec curl :

```bash
# Remplacez VOTRE_AUTH_TOKEN par le token affiché au démarrage
curl -H "Authorization: Bearer VOTRE_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     -H "mcp-session-id: test-session" \
     -d '{"jsonrpc": "2.0", "method": "initialize", "params": {}, "id": 1}' \
     http://localhost:3000/mcp
```

## ✅ C'est prêt !

Votre serveur MCP Notion officiel est maintenant accessible depuis ChatMCP sur votre iPhone.

**Rappel** : L'endpoint est `/mcp` (pas `/v1/mcp` comme dans certains exemples)
