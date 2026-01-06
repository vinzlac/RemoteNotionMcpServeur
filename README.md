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
AUTH_TOKEN=your-secret-token-here  # Optionnel (généré automatiquement si non défini)
```

## 🏃 Démarrage du serveur MCP

Le serveur MCP Notion doit être lancé **séparément** avant d'utiliser le client LLM ou d'autres clients.

### Option 1 : Serveur officiel (recommandé)

Lance directement le serveur MCP Notion officiel :

```bash
pnpm run server:official
```

**Avantages :**
- Lancement direct, sans wrapper
- Moins de processus intermédiaires
- Plus simple et rapide

### Option 2 : Serveur custom (wrapper)

Lance le wrapper custom qui utilise également le serveur officiel :

```bash
npm run server:custom
```

**Avantages :**
- Passe par notre wrapper (`src/start.ts`)
- Permet d'ajouter des fonctionnalités personnalisées si nécessaire

### Mode développement (équivalent à server:custom)

```bash
npm run dev
```

### Mode production

```bash
pnpm run build
npm start
```

**Note :** Les deux options lancent le même serveur officiel (`@notionhq/notion-mcp-server`) via `npx`. La différence est que `server:custom` passe par notre wrapper TypeScript.

Le serveur démarrera avec le transport HTTP sur le port configuré (par défaut: 3000).

### Authentification

Le serveur utilise l'authentification par bearer token pour sécuriser l'accès HTTP :

- **Développement** : Si `AUTH_TOKEN` n'est pas défini, un token sera généré automatiquement et affiché dans la console
- **Production** : Définissez `AUTH_TOKEN` dans votre fichier `.env` pour utiliser un token personnalisé

**Important :** Si le serveur génère un token automatiquement, copiez-le dans votre fichier `.env` pour que le client LLM puisse s'y connecter.

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

## 🤖 Client LLM avec intégration MCP Notion

### Fonctionnalité

Un client qui combine un LLM (Mistral ou Gemini) avec le serveur MCP Notion pour permettre des **requêtes en langage naturel** sur vos pages Notion.

**Exemple d'utilisation :**
- "Quelles sont mes pages Notion ?"
- "Trouve-moi les pages qui contiennent le mot 'test'"
- "Quelle est la date de création de ma page Journal ?"

### Configuration

Ajoutez dans votre fichier `.env` :

```bash
# Provider LLM
LLM_PROVIDER=mistral  # ou 'gemini'

# Clé API (selon votre choix)
MISTRAL_API_KEY=your_key_here        # Si provider=mistral et USE_OPENROUTER=false
GEMINI_API_KEY=your_key_here        # Si provider=gemini et USE_OPENROUTER=false
OPENROUTER_API_KEY=your_key_here     # Si USE_OPENROUTER=true

# Utiliser OpenRouter comme proxy
USE_OPENROUTER=false  # ou true

# Modèle à utiliser (optionnel)
LLM_MODEL=mistral-small-latest
```

### Configuration rapide

**Option 1 : Script interactif (recommandé)**
```bash
./scripts/setup-llm-api-key.sh
```

**Option 2 : Configuration manuelle**

Ajoutez les variables dans votre fichier `.env` (voir ci-dessus).

### Utilisation

**Important :** Le serveur MCP Notion doit être lancé **avant** d'utiliser le client LLM.

1. **Lancer le serveur MCP** (dans un terminal) :
   ```bash
   pnpm run server:official
   # ou
   npm run server:custom
   ```

2. **Utiliser le client LLM** (dans un autre terminal) :
   ```bash
   pnpm run llm
   ```

**Démonstration (sans clé API LLM) :**
```bash
npm run demo
```
Montre comment fonctionne le flux LLM-MCP sans nécessiter de clé API LLM.

**Client complet (avec clé API LLM) :**
```bash
npm run llm
```

Le client va :
1. ✅ Vérifier que le serveur MCP Notion est accessible
2. ✅ Récupérer les 21 outils Notion disponibles
3. ✅ Les passer au LLM avec function calling
4. ✅ Permettre de poser des questions en langage naturel
5. ✅ Le LLM appellera automatiquement les outils Notion nécessaires
6. ✅ Retourner une réponse en français basée sur les résultats

**Note :** Le serveur MCP Notion doit être lancé séparément avec `pnpm run server:official` ou `npm run server:custom`.

## 🌐 Client MCP Générique

Un client MCP générique est disponible qui fonctionne avec **n'importe quel serveur MCP**, pas seulement Notion. Ce client utilise la bibliothèque standard `mcp-client` et permet d'interagir avec n'importe quel serveur MCP compatible via des questions en langage naturel.

### Caractéristiques

- ✅ **Générique** : Fonctionne avec n'importe quel serveur MCP
- ✅ **Dynamique** : Découvre automatiquement les outils disponibles sur le serveur
- ✅ **Intégration LLM** : Utilise Mistral ou Gemini pour les interactions en langage naturel
- ✅ **Pas de dépendances spécifiques** : Aucune référence à Notion ou autre service spécifique

### Configuration

Ajoutez les variables suivantes dans votre fichier `.env` :

```bash
# URL du serveur MCP (peut être n'importe quel serveur MCP)
MCP_SERVER_URL=http://localhost:3000/mcp

# Token d'authentification (optionnel, selon le serveur MCP)
MCP_AUTH_TOKEN=your-token-here

# Configuration LLM (identique au client LLM Notion)
LLM_PROVIDER=mistral
MISTRAL_API_KEY=your_key_here
# ou
GEMINI_API_KEY=your_key_here
USE_OPENROUTER=false
LLM_MODEL=mistral-small-latest
```

### Utilisation

1. **Lancer le serveur MCP** de votre choix (dans un terminal) :
   ```bash
   # Exemple avec le serveur Notion
   pnpm run server:official
   
   # Ou n'importe quel autre serveur MCP
   # Assurez-vous qu'il écoute sur l'URL configurée dans MCP_SERVER_URL
   ```

2. **Lancer le client générique** (dans un autre terminal) :
   ```bash
   npm run client:generic
   ```

Le client va :
1. ✅ Se connecter au serveur MCP spécifié
2. ✅ Découvrir automatiquement tous les outils disponibles
3. ✅ Permettre de poser des questions en langage naturel
4. ✅ Le LLM appellera automatiquement les outils nécessaires
5. ✅ Retourner une réponse basée sur les résultats

**Exemple d'utilisation :**
```
❓ Votre question: Quelles sont les pages disponibles ?
```

Le client fonctionne avec n'importe quel serveur MCP compatible, pas seulement Notion !

## 🧪 Tests

### Client de test automatique (STDIO - Recommandé)

Un client de test TypeScript utilisant le transport STDIO est inclus. C'est la méthode recommandée car elle fonctionne de manière fiable :

```bash
npm run test:stdio
```

### Client de test HTTP

Teste le serveur via HTTP (nécessite que le serveur soit lancé) :

```bash
# Terminal 1 : Lancer le serveur
npm run server:official

# Terminal 2 : Lancer les tests
npm run test:http
```

### Test API Notion directe (sans MCP)

Teste directement l'API Notion sans passer par MCP :

```bash
npm run test:api
```

## 📚 Scripts disponibles

| Script | Description |
|--------|-------------|
| `pnpm run server:official` | Lance le serveur MCP Notion officiel directement |
| `npm run server:custom` | Lance le serveur MCP Notion via le wrapper custom |
| `npm run dev` | Lance le serveur en mode développement (équivalent à server:custom) |
| `npm run build` | Compile TypeScript vers JavaScript |
| `pnpm start` | Lance le serveur compilé (production) |
| `pnpm run llm` | Lance le client LLM interactif (nécessite serveur lancé) |
| `npm run client:generic` | Lance le client MCP générique (fonctionne avec n'importe quel serveur MCP) |
| `npm run demo` | Démonstration du flux LLM-MCP (sans clé API LLM) |
| `npm run test:stdio` | Tests avec transport STDIO |
| `npm run test:http` | Tests avec transport HTTP (nécessite serveur lancé) |
| `npm run test:api` | Tests API Notion directe |

## 🏗️ Architecture

Voir le fichier [docs/architecture.md](docs/architecture.md) pour les diagrammes détaillés au format Mermaid.

### Vue d'ensemble

```
┌─────────────────────────────────────────────────────────┐
│                    Client LLM                            │
│              (pnpm run llm)                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │  LLM (Mistral/Gemini)                           │   │
│  │  - Function calling                             │   │
│  │  - Génération de réponses                       │   │
│  └──────────────┬──────────────────────────────────┘   │
│                 │ Appels HTTP                           │
└─────────────────┼───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│         Serveur MCP Notion (HTTP)                        │
│  ┌──────────────────────────────────────────────────┐   │
│  │  @notionhq/notion-mcp-server                     │   │
│  │  - Transport HTTP                                │   │
│  │  - 21 outils Notion                              │   │
│  │  - Authentification Bearer token                 │   │
│  └──────────────┬──────────────────────────────────┘   │
│                 │ API Notion                            │
└─────────────────┼───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│                    API Notion                            │
│              (https://api.notion.com)                    │
└─────────────────────────────────────────────────────────┘
```

### Diagrammes Mermaid

Les diagrammes suivants sont disponibles dans [docs/architecture.md](docs/architecture.md) :

- **Diagramme d'architecture** : Vue d'ensemble des composants
- **Diagramme de séquence - Client LLM** : Flux d'une requête LLM
- **Diagramme de séquence - ChatMCP** : Flux d'une requête depuis iPhone
- **Diagramme de séquence - Démarrage** : Processus de démarrage du serveur
- **Architecture des composants** : Relations entre les modules
- **Flux de données** : Logique de traitement des requêtes

## 🔧 Dépannage

### Le client LLM ne peut pas se connecter au serveur

1. Vérifiez que le serveur est lancé : `pnpm run server:official`
2. Vérifiez que le port correspond (par défaut: 3000)
3. Vérifiez que `AUTH_TOKEN` dans `.env` correspond au token du serveur
4. Attendez quelques secondes après le démarrage du serveur

### Erreur "No valid session ID provided"

C'est un problème connu avec certaines versions du serveur MCP Notion officiel. Le client a été corrigé pour gérer cela automatiquement. Si le problème persiste :

1. Vérifiez que vous utilisez la dernière version : `pnpm update @notionhq/notion-mcp-server`
2. Utilisez le transport STDIO pour les tests : `npm run test:stdio`

### Le serveur ne démarre pas

1. Vérifiez que `NOTION_TOKEN` est défini dans `.env`
2. Vérifiez que le port 3000 n'est pas déjà utilisé
3. Vérifiez les logs d'erreur dans la console

## 📝 Structure du projet

```
RemoteNotionMcpServeur/
├── docs/
│   └── architecture.md             # Diagrammes d'architecture Mermaid
├── src/
│   ├── start.ts                    # Wrapper pour lancer le serveur officiel
│   ├── start-server-official.ts    # Script pour lancer le serveur officiel
│   ├── start-server-custom.ts      # Script pour lancer le serveur custom
│   ├── llm-mcp-client.ts           # Client LLM avec intégration MCP
│   ├── llm-mcp-demo.ts             # Démonstration du flux LLM-MCP
│   ├── test-client-http.ts         # Tests HTTP
│   ├── test-client-stdio.ts        # Tests STDIO
│   └── test-api-direct.ts          # Tests API Notion directe
├── scripts/
│   └── setup-llm-api-key.sh        # Script interactif pour configurer les clés API LLM
├── .env                            # Variables d'environnement (non commité)
├── env.example                     # Exemple de fichier .env
├── package.json                     # Dépendances et scripts
├── tsconfig.json                    # Configuration TypeScript
└── README.md                        # Ce fichier
```

## 📊 Diagrammes d'architecture

Des diagrammes détaillés au format Mermaid sont disponibles dans [docs/architecture.md](docs/architecture.md) :

- **Diagramme d'architecture** : Vue d'ensemble des composants et leurs relations
- **Diagramme de séquence - Client LLM** : Flux complet d'une requête depuis l'utilisateur jusqu'à Notion
- **Diagramme de séquence - ChatMCP** : Flux d'une requête depuis l'iPhone
- **Diagramme de séquence - Démarrage** : Processus de démarrage du serveur
- **Architecture des composants** : Relations entre les modules TypeScript/Node.js
- **Flux de données** : Logique de traitement des requêtes avec décisions

Ces diagrammes peuvent être visualisés dans :
- GitHub (rendu automatique des fichiers .md avec Mermaid)
- VS Code avec l'extension Mermaid
- Tout éditeur Markdown supportant Mermaid

## 📄 Licence

Ce projet est open source et disponible sous la licence MIT.

## 🔗 Liens utiles

- [Serveur MCP Notion officiel](https://github.com/makenotion/notion-mcp-server)
- [Documentation Notion API](https://developers.notion.com/)
- [Protocole MCP](https://modelcontextprotocol.io/)
- [ChatMCP](https://github.com/your-repo/chatmcp) (si disponible)

## 💡 Support

Pour des questions ou des problèmes :

1. Vérifiez la section [Dépannage](#-dépannage)
2. Consultez les [issues GitHub](https://github.com/makenotion/notion-mcp-server/issues) du serveur officiel
3. Vérifiez que votre clé API Notion est valide et que les pages sont partagées avec l'intégration
