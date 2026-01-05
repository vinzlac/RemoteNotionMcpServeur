# Guide de Test du Serveur MCP Notion

Ce guide explique comment tester le serveur MCP Notion en local et avec un client externe.

## 🚀 Démarrage du Serveur

### 1. Démarrer le serveur

```bash
npm run dev
```

Le serveur affichera dans la console :
```
Generated auth token: 1df844e9fa0795f5b5b4dde65ec0e38fded9352def8976efcd2895057ed2ce91
Use this token in the Authorization header: Bearer 1df844e9fa0795f5b5b4dde65ec0e38fded9352def8976efcd2895057ed2ce91
MCP Server listening on port 3000
Endpoint: http://0.0.0.0:3000/mcp
Health check: http://0.0.0.0:3000/health
Authentication: Bearer token required
```

**Important** : Copiez le token généré ! Vous en aurez besoin pour les tests.

### 2. Optionnel : Définir un token personnalisé

Pour éviter de copier le token à chaque démarrage, vous pouvez définir `AUTH_TOKEN` dans votre fichier `.env` :

```bash
AUTH_TOKEN=votre-token-personnalise-ici
```

## 🧪 Tests avec le Client de Test Inclus

### Test automatique

```bash
# Dans un terminal, le serveur doit être démarré
# Dans un autre terminal :
npm test
```

Le client de test va :
1. Se connecter au serveur avec le token depuis `.env` ou vous demander de le configurer
2. Tester `initialize`
3. Lister les outils disponibles
4. Lister les ressources
5. Tester un outil de recherche

### Configuration du client de test

Le client utilise les variables d'environnement suivantes :
- `MCP_SERVER_URL` : URL du serveur (défaut: `http://localhost:3000/mcp`)
- `AUTH_TOKEN` : Token d'authentification (depuis `.env` ou à définir)
- `PORT` : Port du serveur (défaut: 3000)

## 🔧 Tests Manuels avec curl

### 1. Test de santé (health check)

```bash
curl http://localhost:3000/health
```

Devrait retourner : `{"status":"ok"}`

### 2. Test d'initialisation

Remplacez `VOTRE_TOKEN` par le token affiché dans la console du serveur :

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer VOTRE_TOKEN" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    },
    "id": 1
  }'
```

### 3. Lister les outils disponibles

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer VOTRE_TOKEN" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": {},
    "id": 2
  }'
```

### 4. Appeler un outil (exemple : recherche)

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer VOTRE_TOKEN" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "v1/search",
      "arguments": {
        "query": "test"
      }
    },
    "id": 3
  }'
```

## 📱 Test avec un Client Externe (ChatMCP, etc.)

### Configuration

1. **URL du serveur** : `http://VOTRE_IP:3000/mcp` ou `https://votre-domaine.com/mcp`
2. **Authentification** : Bearer token dans le header `Authorization`
3. **Session ID** : Header `mcp-session-id` avec un identifiant unique par session

### Exemple de requête depuis un client externe

```javascript
const response = await fetch('http://localhost:3000/mcp', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer VOTRE_TOKEN',
    'Content-Type': 'application/json',
    'mcp-session-id': 'unique-session-id-123'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'mon-client',
        version: '1.0.0'
      }
    },
    id: 1
  })
});
```

## ⚠️ Problèmes Courants

### Erreur : "Forbidden: Invalid bearer token"

- Vérifiez que le token est correct (copié depuis la console du serveur)
- Vérifiez que le header `Authorization` est au format `Bearer TOKEN` (avec un espace)
- Si vous avez défini `AUTH_TOKEN` dans `.env`, utilisez ce token

### Erreur : "Bad Request: No valid session ID provided"

- Vérifiez que le header `mcp-session-id` est présent
- Le session ID doit être une chaîne non vide
- Utilisez le même session ID pour toutes les requêtes d'une même session

### Erreur : "Connection refused"

- Vérifiez que le serveur est démarré (`npm run dev`)
- Vérifiez que le port est correct (par défaut: 3000)
- Vérifiez que le firewall n'bloque pas le port

### Le serveur ne démarre pas

- Vérifiez que `NOTION_TOKEN` est défini dans `.env`
- Vérifiez que la clé API Notion est valide
- Vérifiez que Node.js est installé (version 18+)

## 🔍 Debug

### Vérifier les logs du serveur

Le serveur affiche toutes les requêtes dans la console. Surveillez les erreurs.

### Tester la connexion réseau

```bash
# Test de connectivité
curl http://localhost:3000/health

# Test avec verbose pour voir les headers
curl -v http://localhost:3000/health
```

### Vérifier les variables d'environnement

```bash
# Vérifier que les variables sont chargées
node -e "require('dotenv').config(); console.log('NOTION_TOKEN:', process.env.NOTION_TOKEN ? 'Défini' : 'Non défini');"
```

## 📚 Ressources

- [Documentation du serveur Notion MCP](https://github.com/makenotion/notion-mcp-server)
- [Spécification MCP](https://modelcontextprotocol.io)
- [API Notion](https://developers.notion.com)

