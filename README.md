# Serveur MCP Notion à Distance

Wrapper pour le [serveur MCP Notion officiel](https://github.com/makenotion/notion-mcp-server) avec support HTTP, accessible à distance depuis votre application ChatMCP sur iPhone.

## 🎯 Fonctionnalités

Ce projet utilise le serveur MCP Notion officiel de Notion (`@notionhq/notion-mcp-server`) qui expose une API HTTP permettant d'accéder à Notion via le protocole MCP depuis n'importe quel appareil, y compris votre iPhone.

### Outils disponibles (via le serveur officiel) :

- **Recherche de pages** : Rechercher des pages dans Notion
- **Lecture de pages** : Récupérer le contenu des pages
- **Création de pages** : Créer de nouvelles pages
- **Mise à jour de pages** : Modifier des pages existantes
- **Gestion de bases de données** : Interroger et gérer les bases de données
- **Commentaires** : Ajouter des commentaires aux pages
- Et bien plus encore...

## 📋 Prérequis

1. **Clé API Notion** :
   - Allez sur https://www.notion.so/my-integrations
   - Créez une nouvelle intégration
   - Copiez le "Internal Integration Token" (format: `ntn_...` ou `secret_...`)
   - Partagez les pages/bases de données que vous souhaitez utiliser avec cette intégration

2. **Node.js** (version 18 ou supérieure)

## 🚀 Installation

1. **Cloner ou télécharger ce projet**

2. **Installer les dépendances** :
```bash
npm install
```

3. **Configurer les variables d'environnement** :
```bash
cp env.example .env
```

4. **Éditer le fichier `.env`** et ajouter votre clé API Notion :
```
NOTION_TOKEN=ntn_votre_cle_api_ici
PORT=3000
```

## 🏃 Démarrage

### Mode développement (avec rechargement automatique) :
```bash
npm run dev
```

### Mode production :
```bash
npm run build
npm start
```

Le serveur officiel démarrera avec le transport HTTP sur le port configuré (par défaut: 3000).

### Authentification

Le serveur utilise l'authentification par bearer token pour sécuriser l'accès HTTP :

- **Développement** : Si `AUTH_TOKEN` n'est pas défini, un token sera généré automatiquement et affiché dans la console
- **Production** : Définissez `AUTH_TOKEN` dans votre fichier `.env` pour utiliser un token personnalisé

## 🌐 Accès à distance

Pour accéder au serveur depuis votre iPhone, vous avez plusieurs options :

### Option 1 : Utiliser votre IP locale (même réseau Wi-Fi)

1. Trouvez l'IP de votre machine :
   - **Mac/Linux** : `ifconfig | grep "inet " | grep -v 127.0.0.1`
   - **Windows** : `ipconfig`

2. Dans ChatMCP, utilisez l'URL : `http://VOTRE_IP:3000/mcp`
   - Exemple : `http://192.168.1.100:3000/mcp`
   - **Important** : L'endpoint est `/mcp` (pas `/v1/mcp`)

### Option 2 : Utiliser un tunnel (ngrok, Cloudflare Tunnel, etc.)

#### Avec ngrok :
```bash
# Installer ngrok : https://ngrok.com/download
ngrok http 3000
```

Vous obtiendrez une URL publique comme : `https://abc123.ngrok.io`
Utilisez dans ChatMCP : `https://abc123.ngrok.io/mcp`

#### Avec Cloudflare Tunnel :
```bash
# Installer cloudflared
cloudflared tunnel --url http://localhost:3000
```

### Option 3 : Déployer sur un serveur cloud

Déployez ce serveur sur :
- **Railway** : https://railway.app
- **Render** : https://render.com
- **Heroku** : https://heroku.com
- **VPS** : DigitalOcean, AWS EC2, etc.

## 📱 Configuration dans ChatMCP

Dans votre application ChatMCP sur iPhone :

1. Ouvrez l'application
2. Cliquez sur "Add Server"
3. Remplissez les champs :
   - **Server Name** : `Notion MCP` (ou le nom de votre choix)
   - **URL** : L'URL de votre serveur avec l'endpoint `/mcp`
     - Exemple local : `http://192.168.1.100:3000/mcp`
     - Exemple ngrok : `https://abc123.ngrok.io/mcp`
     - Exemple cloud : `https://votre-domaine.com/mcp`
   - **Enabled** : Activez le toggle

4. **Authentification** : Si vous utilisez un `AUTH_TOKEN`, vous devrez peut-être le configurer dans ChatMCP (consultez la documentation de ChatMCP pour les headers d'authentification)

5. Cliquez sur le ✓ pour confirmer

## 🔒 Sécurité

⚠️ **Important** : Pour un déploiement en production :

1. **Utilisez un token d'authentification** :
   - Définissez `AUTH_TOKEN` dans votre fichier `.env`
   - Utilisez un token fort et unique

2. **Utilisez HTTPS** :
   - Utilisez un tunnel HTTPS (ngrok, Cloudflare) ou déployez avec SSL

3. **Protégez votre clé API** :
   - Ne commitez jamais le fichier `.env`
   - Utilisez des variables d'environnement sécurisées sur votre plateforme de déploiement

## 🧪 Test

### Client de test automatique (STDIO - Recommandé)

Un client de test TypeScript utilisant le transport STDIO est inclus. C'est la méthode recommandée car elle fonctionne de manière fiable :

```bash
npm run test:stdio
```

Le client de test va :
- ✅ Démarrer automatiquement le serveur MCP Notion
- ✅ Tester la méthode `initialize`
- ✅ Lister les 21 outils disponibles
- ✅ Tester un outil de recherche

**Résultat attendu :**
```
✅ Initialize: OK
✅ List Tools: OK (21 outils disponibles)
✅ Test d'outil: OK
🎉 Le serveur MCP Notion fonctionne correctement avec le transport STDIO !
```

### Client de test HTTP (Expérimental)

Pour tester le serveur avec le transport HTTP :

```bash
# 1. Démarrer le serveur dans un terminal
npm run dev

# 2. Dans un autre terminal, lancer les tests HTTP
npm test
```

**Note :** Le transport HTTP peut avoir des problèmes avec la gestion des sessions. Le transport STDIO est recommandé pour les tests.

### Test manuel avec curl

Vous pouvez aussi tester manuellement avec curl :

```bash
# Le serveur affichera l'URL et le token d'authentification au démarrage
# Utilisez ces informations pour tester avec curl :

curl -H "Authorization: Bearer VOTRE_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     -H "mcp-session-id: test-session" \
     -d '{"jsonrpc": "2.0", "method": "initialize", "params": {}, "id": 1}' \
     http://localhost:3000/mcp
```

### Configuration du client de test

Le client de test utilise les variables d'environnement suivantes :
- `MCP_SERVER_URL` : URL du serveur (par défaut: `http://localhost:3000/mcp`)
- `AUTH_TOKEN` : Token d'authentification (optionnel, depuis `.env`)
- `PORT` : Port du serveur (par défaut: 3000)

## 📝 Structure du projet

```
RemoteNotionMcpServeur/
├── src/
│   ├── start.ts          # Script de démarrage TypeScript qui lance le serveur officiel
│   └── test-client.ts    # Client de test pour vérifier les appels MCP
├── dist/                 # Code compilé (généré)
├── .env                  # Variables d'environnement (à créer)
├── env.example           # Exemple de configuration
├── package.json
├── tsconfig.json         # Configuration TypeScript
└── README.md
```

## 🔗 Ressources

- [Serveur MCP Notion officiel](https://github.com/makenotion/notion-mcp-server)
- [Package npm](https://www.npmjs.com/package/@notionhq/notion-mcp-server)
- [Documentation MCP](https://modelcontextprotocol.io)
- [API Notion](https://developers.notion.com)

## 📄 Licence

MIT
