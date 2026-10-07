# CLAUDE.md — RemoteNotionMcpServeur

Wrapper TypeScript autour du serveur MCP Notion officiel (`@notionhq/notion-mcp-server`) avec
support HTTP, pour l'utiliser à distance (ex. ChatMCP sur iPhone). Contient aussi des clients de
test et un client MCP branché sur un LLM (`src/`, scripts `npm run` dans `package.json`).
Voir `README.md` pour l'usage.

**Lien avec le CRM** : ce repo est de l'outillage MCP, indépendant du CRM Notion. Le CRM vit dans
`~/workspace/CrmNotion` (repo `vinzlac/CrmNotion`) ; l'intégration Notion `my-remote-mcp` en
est issue. Historique et état des lieux :
`~/workspace/CrmNotion/docs/HISTORIQUE-ET-ETAT-DES-LIEUX.md`.

Ne jamais écrire le token Notion en clair ; `.env` est ignoré par git.
