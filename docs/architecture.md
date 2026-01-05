# Architecture du système

## Diagramme d'architecture

```mermaid
graph TB
    subgraph Client["Client"]
        LLM["Client LLM<br/>llm-mcp-client.ts"]
        ChatMCP["ChatMCP iPhone"]
        TestClient["Client de Test"]
    end

    subgraph Server["Serveur MCP Notion"]
        ServerOfficial["serveur:official<br/>start-server-official.ts"]
        ServerCustom["serveur:custom<br/>start-server-custom.ts"]
        Wrapper["start.ts<br/>Wrapper"]
        MCP["serveur MCP Notion<br/>@notionhq/notion-mcp-server"]
    end

    subgraph API["API Notion"]
        NotionAPI["API Notion<br/>api.notion.com"]
    end

    LLM -->|"HTTP Request"| MCP
    ChatMCP -->|"HTTP Request"| MCP
    TestClient -->|"HTTP/STDIO"| MCP
    
    ServerOfficial -->|"npx spawn"| MCP
    ServerCustom -->|"tsx spawn"| Wrapper
    Wrapper -->|"npx spawn"| MCP
    
    MCP -->|"REST API"| NotionAPI

    style LLM fill:#e1f5ff
    style ChatMCP fill:#e1f5ff
    style TestClient fill:#e1f5ff
    style MCP fill:#fff4e1
    style NotionAPI fill:#ffe1e1
```

## Diagramme de séquence - Client LLM

```mermaid
sequenceDiagram
    participant User as Utilisateur
    participant LLMClient as Client LLM
    participant LLM as LLM<br/>(Mistral/Gemini)
    participant MCPServer as Serveur MCP Notion
    participant NotionAPI as API Notion

    Note over User,NotionAPI: Initialisation
    User->>LLMClient: npm run llm
    LLMClient->>MCPServer: Health Check / Initialize
    MCPServer-->>LLMClient: Session ID
    LLMClient->>MCPServer: tools/list
    MCPServer-->>LLMClient: Liste des 21 outils
    
    Note over User,NotionAPI: Requête utilisateur
    User->>LLMClient: "Quelles sont mes pages Notion ?"
    LLMClient->>LLM: Chat avec tools (function calling)
    LLM->>LLMClient: tool_calls: API-post-search
    LLMClient->>MCPServer: tools/call (API-post-search)
    MCPServer->>NotionAPI: POST /v1/search
    NotionAPI-->>MCPServer: Pages Notion
    MCPServer-->>LLMClient: Résultat JSON
    LLMClient->>LLM: Résultat de l'outil
    LLM->>LLMClient: Réponse en français
    LLMClient-->>User: "Voici vos pages Notion..."
```

## Diagramme de séquence - ChatMCP

```mermaid
sequenceDiagram
    participant iPhone as ChatMCP iPhone
    participant MCPServer as Serveur MCP Notion
    participant NotionAPI as API Notion

    Note over iPhone,NotionAPI: Connexion initiale
    iPhone->>MCPServer: POST /mcp (initialize)
    Note right of MCPServer: Pas de mcp-session-id<br/>pour initialize
    MCPServer-->>iPhone: Session ID (header)
    
    Note over iPhone,NotionAPI: Utilisation
    iPhone->>MCPServer: POST /mcp (tools/list)
    Note right of MCPServer: Header: mcp-session-id
    MCPServer-->>iPhone: Liste des outils
    
    iPhone->>MCPServer: POST /mcp (tools/call)
    MCPServer->>NotionAPI: Appel API Notion
    NotionAPI-->>MCPServer: Résultat
    MCPServer-->>iPhone: Résultat MCP
```

## Diagramme de séquence - Démarrage du serveur

```mermaid
sequenceDiagram
    participant User as Utilisateur
    participant Script as Script de démarrage
    participant NPX as npx
    participant MCPServer as Serveur MCP Notion
    participant NotionAPI as API Notion

    User->>Script: npm run server:official
    Script->>Script: Charger .env
    Script->>NPX: spawn('npx', ['@notionhq/notion-mcp-server'])
    NPX->>MCPServer: Démarrer avec transport HTTP
    MCPServer->>MCPServer: Générer AUTH_TOKEN si absent
    MCPServer->>MCPServer: Écouter sur port 3000
    MCPServer-->>Script: "MCP Server listening on port 3000"
    Script-->>User: Serveur prêt
    
    Note over MCPServer,NotionAPI: Le serveur attend les requêtes
    MCPServer->>NotionAPI: (quand appelé par un client)
    NotionAPI-->>MCPServer: (réponses)
```

## Architecture des composants

```mermaid
graph LR
    subgraph TS["TypeScript/Node.js"]
        A["Scripts de démarrage"]
        B["Client LLM"]
        C["Clients de test"]
    end
    
    subgraph Proc["Processus enfants"]
        D["npx @notionhq/notion-mcp-server"]
    end
    
    subgraph HTTP["HTTP Server"]
        E["Port 3000<br/>/mcp endpoint"]
    end
    
    subgraph Ext["External"]
        F["API Notion"]
        G["LLM APIs"]
    end
    
    A -->|spawn| D
    B -->|HTTP| E
    C -->|"HTTP/STDIO"| E
    D --> E
    E -->|REST| F
    B -->|HTTP| G
```

## Flux de données

```mermaid
flowchart TD
    Start([Démarrage]) --> LoadEnv[Charger .env]
    LoadEnv --> CheckToken{NOTION_TOKEN<br/>défini?}
    CheckToken -->|Non| Error1[❌ Erreur]
    CheckToken -->|Oui| StartServer[Démarrer serveur MCP]
    
    StartServer --> ServerReady{Serveur<br/>prêt?}
    ServerReady -->|Non| Wait[Attendre...]
    Wait --> ServerReady
    ServerReady -->|Oui| Listen[Écouter sur port 3000]
    
    Listen --> ReceiveReq[Recevoir requête HTTP]
    ReceiveReq --> CheckAuth{Token<br/>valide?}
    CheckAuth -->|Non| Error2[401 Unauthorized]
    CheckAuth -->|Oui| CheckSession{Session ID<br/>valide?}
    
    CheckSession -->|Non pour initialize| GenerateSession[Générer Session ID]
    CheckSession -->|Oui| ProcessReq[Traiter requête MCP]
    GenerateSession --> ProcessReq
    
    ProcessReq --> CallNotion[Appeler API Notion]
    CallNotion --> ReturnResult[Retourner résultat]
    ReturnResult --> ReceiveReq
    
    style Error1 fill:#ffcccc
    style Error2 fill:#ffcccc
    style Start fill:#ccffcc
    style Listen fill:#ccffff
```

## Comparaison des méthodes de démarrage

```mermaid
graph TB
    subgraph M1["Méthode 1: server:official"]
        A1["npm run server:official"]
        A2["start-server-official.ts"]
        A3["npx spawn"]
        A4["@notionhq/notion-mcp-server"]
    end
    
    subgraph M2["Méthode 2: server:custom"]
        B1["npm run server:custom"]
        B2["start-server-custom.ts"]
        B3["tsx spawn"]
        B4["start.ts"]
        B5["npx spawn"]
        B6["@notionhq/notion-mcp-server"]
    end
    
    A1 --> A2
    A2 --> A3
    A3 --> A4
    
    B1 --> B2
    B2 --> B3
    B3 --> B4
    B4 --> B5
    B5 --> B6
    
    A4 --> MCP["Serveur MCP HTTP<br/>Port 3000"]
    B6 --> MCP
    
    style A4 fill:#ccffcc
    style B6 fill:#ccffcc
    style MCP fill:#ffffcc
```

**Différence principale :**
- `server:official` : Lance directement le serveur officiel (1 processus intermédiaire)
- `server:custom` : Passe par le wrapper `start.ts` (2 processus intermédiaires)

Les deux méthodes aboutissent au même résultat : le serveur MCP Notion officiel en HTTP.

