#!/usr/bin/env node

/**
 * Client LLM avec intégration MCP Notion
 * 
 * Ce client permet d'interroger le serveur MCP Notion en langage naturel
 * en utilisant un LLM (Mistral ou Gemini) qui peut appeler les outils Notion.
 * 
 * Fonctionnalités:
 * - Support Mistral et Gemini (direct ou via OpenRouter)
 * - Communication avec le serveur MCP Notion via HTTP streaming
 * - Function calling pour utiliser les outils Notion
 * - Mode interactif pour poser des questions en langage naturel
 */

import { spawn, ChildProcess } from 'child_process';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

// Charger les variables d'environnement
dotenv.config();

// Types pour JSON-RPC MCP
interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id: number | string;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  id: number | string;
}

interface JsonRpcResponseWithSession extends JsonRpcResponse {
  sessionId?: string;
}

// Types pour les outils MCP
interface McpTool {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, any>;
    required?: string[];
    [key: string]: any;
  };
}

// Types pour les appels LLM
interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string;
}

interface LLMResponse {
  id?: string;
  choices: Array<{
    message: LLMMessage;
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

class McpNotionClient {
  private url: string;
  private authToken: string;
  private sessionId: string;
  private requestId: number = 1;
  private server: ChildProcess | null = null;
  private autoStartServer: boolean;

  constructor(url: string, authToken: string, autoStartServer: boolean = false) {
    this.url = url;
    this.authToken = authToken;
    this.sessionId = randomUUID();
    this.autoStartServer = autoStartServer;
  }

  async startServer(): Promise<void> {
    if (!this.autoStartServer) {
      console.log('ℹ️  Mode client uniquement - le serveur doit être lancé séparément');
      console.log('   Utilisez: pnpm run server:official ou pnpm run server:custom\n');
      return;
    }
    const notionToken = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
    const port = process.env.PORT || '3000';
    const authToken = process.env.AUTH_TOKEN || this.authToken;

    if (!notionToken) {
      throw new Error('NOTION_TOKEN ou NOTION_API_KEY n\'est pas définie');
    }

    console.log('🚀 Démarrage du serveur MCP Notion...');
    console.log(`📡 Port: ${port}`);

    const args = [
      '-y',
      '@notionhq/notion-mcp-server',
      '--transport',
      'http',
      '--port',
      port,
      '--auth-token',
      authToken
    ];

    this.server = spawn('npx', args, {
      env: {
        ...process.env,
        NOTION_TOKEN: notionToken,
        AUTH_TOKEN: authToken
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.server.on('error', (error: Error) => {
      console.error('❌ Erreur lors du démarrage du serveur:', error);
      process.exit(1);
    });

    // Attendre que le serveur démarre
    let serverReady = false;
    let serverOutput = '';
    
    this.server.stdout?.on('data', (data: Buffer) => {
      serverOutput += data.toString();
      if (serverOutput.includes('MCP Server listening on port')) {
        serverReady = true;
      }
    });
    
    // Attendre jusqu'à 15 secondes
    for (let i = 0; i < 30; i++) {
      if (serverReady) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (!serverReady) {
      console.warn('⚠️  Le serveur peut ne pas être complètement prêt, continuons...');
    }
    
    // Attendre encore un peu pour que le serveur soit vraiment prêt
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('✅ Serveur MCP Notion démarré\n');
  }

  private async makeRequest(method: string, params?: Record<string, unknown>, includeSessionId: boolean = true): Promise<JsonRpcResponseWithSession> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId++
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    };

    // Ajouter le token d'authentification seulement s'il est défini
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    if (includeSessionId && this.sessionId) {
      headers['mcp-session-id'] = this.sessionId;
      console.log(`   🔑 Utilisation du session ID: ${this.sessionId.substring(0, 8)}...`);
    } else if (!includeSessionId) {
      console.log(`   🔑 Pas de session ID pour ${method} (le serveur le génère)`);
    }

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(`   ❌ Réponse d'erreur HTTP ${response.status}: ${errorText.substring(0, 300)}`);
        throw new Error(`HTTP ${response.status}: ${response.statusText}${errorText ? ` - ${errorText.substring(0, 200)}` : ''}`);
      }

      const sessionIdHeader = response.headers.get('mcp-session-id') || 
                              response.headers.get('MCP-Session-ID');
      
      // Toujours mettre à jour le session ID si on le reçoit du serveur
      // C'est particulièrement important après initialize
      if (sessionIdHeader) {
        this.sessionId = sessionIdHeader;
      }

      const contentType = response.headers.get('content-type') || '';
      let data: JsonRpcResponse;
      
      if (contentType.includes('text/event-stream')) {
        const text = await response.text();
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              data = JSON.parse(line.substring(6)) as JsonRpcResponse;
              break;
            } catch (e) {
              // Continuer
            }
          } else if (line.trim() && !line.startsWith(':')) {
            try {
              data = JSON.parse(line) as JsonRpcResponse;
              break;
            } catch (e) {
              // Continuer
            }
          }
        }
        if (!data!) {
          throw new Error('Impossible de parser la réponse SSE');
        }
      } else {
        data = await response.json() as JsonRpcResponse;
      }

      return { ...data, sessionId: sessionIdHeader || undefined };
    } catch (error) {
      throw new Error(`Erreur MCP: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  async initialize(): Promise<JsonRpcResponseWithSession> {
    // Pour initialize, ne PAS envoyer mcp-session-id (le serveur le génère)
    const result = await this.makeRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'llm-mcp-client',
        version: '1.0.0'
      }
    }, false); // false = ne pas inclure le session ID
    
    // Le session ID devrait maintenant être dans this.sessionId
    return { ...result, sessionId: this.sessionId };
  }

  async listTools(): Promise<McpTool[]> {
    try {
      const response = await this.makeRequest('tools/list');
      
      if (response.error) {
        throw new Error(`Erreur lors de la récupération des outils: ${response.error.message}`);
      }

      if (response.result && typeof response.result === 'object' && 'tools' in response.result) {
        return (response.result as { tools: McpTool[] }).tools;
      }

      return [];
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des outils: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async callTool(name: string, arguments_: Record<string, unknown>): Promise<JsonRpcResponse> {
    return this.makeRequest('tools/call', {
      name,
      arguments: arguments_
    });
  }

  async shutdown(): Promise<void> {
    if (this.server) {
      this.server.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

class LLMClient {
  private apiKey: string;
  private provider: 'mistral' | 'gemini';
  private useOpenRouter: boolean;
  private model: string;
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(
    provider: 'mistral' | 'gemini',
    apiKey: string,
    model: string,
    useOpenRouter: boolean = false
  ) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.model = model;
    this.useOpenRouter = useOpenRouter;

    if (useOpenRouter) {
      this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
      this.headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/your-repo',
        'X-Title': 'MCP Notion LLM Client'
      };
    } else if (provider === 'mistral') {
      this.baseUrl = 'https://api.mistral.ai/v1/chat/completions';
      this.headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      };
    } else {
      // Gemini direct - format différent
      this.baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      this.headers = {
        'X-goog-api-key': apiKey,
        'Content-Type': 'application/json'
      };
    }
  }

  async chat(messages: LLMMessage[], tools?: McpTool[]): Promise<LLMResponse> {
    if (this.provider === 'gemini' && !this.useOpenRouter) {
      // Format Gemini direct
      const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content || '' }]
        }));

      const data: any = { contents };
      
      if (tools && tools.length > 0) {
        // Gemini direct ne supporte pas function calling de la même manière
        // On va utiliser OpenRouter pour Gemini avec function calling
        console.warn('⚠️  Function calling non supporté avec Gemini direct. Utilisez --proxy openrouter');
      }

      const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as any;
      
      // Convertir au format standard
      return {
        choices: [{
          message: {
            role: 'assistant',
            content: result.candidates?.[0]?.content?.parts?.[0]?.text || ''
          },
          finish_reason: result.candidates?.[0]?.finishReason?.toLowerCase()
        }]
      };
    } else {
      // Format OpenAI-compatible (Mistral direct ou OpenRouter)
      const data: any = {
        model: this.useOpenRouter && this.model.startsWith(`${this.provider === 'mistral' ? 'mistralai' : 'google'}/`) 
          ? this.model 
          : this.provider === 'mistral' 
            ? this.model 
            : `google/${this.model}`,
        messages: messages.filter(m => m.role !== 'system' || this.useOpenRouter),
        temperature: 0.7,
        max_tokens: 2000
      };

      // Ajouter les tools si disponibles
      if (tools && tools.length > 0) {
        data.tools = tools.map((tool: McpTool) => {
          // Convertir le inputSchema MCP au format OpenAI function calling
          let parameters: any = {
            type: 'object',
            properties: {},
            required: []
          };

          if (tool.inputSchema) {
            // Si inputSchema a déjà un type, l'utiliser
            if (tool.inputSchema.type) {
              parameters.type = tool.inputSchema.type;
            }
            
            // Copier les properties
            if (tool.inputSchema.properties) {
              parameters.properties = tool.inputSchema.properties;
            }
            
            // Copier les required
            if (tool.inputSchema.required) {
              parameters.required = tool.inputSchema.required;
            }
          }

          return {
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description || `Notion API tool: ${tool.name}`,
              parameters: parameters
            }
          };
        });
        data.tool_choice = 'auto';
      }

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return await response.json() as LLMResponse;
    }
  }
}

class LLMMcpNotionClient {
  private mcpClient: McpNotionClient;
  private llmClient: LLMClient;
  private tools: McpTool[] = [];
  private conversationHistory: LLMMessage[] = [];

  constructor(
    llmProvider: 'mistral' | 'gemini',
    llmApiKey: string,
    llmModel: string,
    useOpenRouter: boolean = false,
    autoStartServer: boolean = false
  ) {
    const port = process.env.PORT || '3000';
    const mcpUrl = `http://localhost:${port}/mcp`;
    // Utiliser AUTH_TOKEN du .env, ou générer un UUID si non défini
    // Note: si le serveur a généré un token automatiquement, il faut le mettre dans .env
    const mcpAuthToken = process.env.AUTH_TOKEN || '';

    if (!mcpAuthToken) {
      console.warn('⚠️  AUTH_TOKEN non défini dans .env');
      console.warn('   Si le serveur a généré un token automatiquement,');
      console.warn('   copiez-le depuis les logs du serveur dans votre fichier .env\n');
    }

    this.mcpClient = new McpNotionClient(mcpUrl, mcpAuthToken, autoStartServer);
    this.llmClient = new LLMClient(llmProvider, llmApiKey, llmModel, useOpenRouter);
  }

  async initialize(): Promise<void> {
    console.log('🔧 Initialisation...\n');

    // Démarrer le serveur MCP (seulement si autoStartServer est true)
    await this.mcpClient.startServer();
    
    // Attendre un peu pour que le serveur soit prêt (si lancé automatiquement)
    if (this.mcpClient['autoStartServer']) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Initialiser la connexion MCP
    console.log('🔌 Initialisation de la connexion MCP...');
    const initResult = await this.mcpClient.initialize();
    if (initResult.error) {
      throw new Error(`Erreur d'initialisation MCP: ${initResult.error.message}`);
    }
    
    // Vérifier que le session ID a été reçu
    if (initResult.sessionId) {
      console.log(`✅ Session ID reçu: ${initResult.sessionId.substring(0, 8)}...`);
    } else {
      console.warn('⚠️  Aucun session ID reçu lors de l\'initialisation');
    }

    // Récupérer les outils disponibles
    console.log('📦 Récupération des outils Notion...');
    try {
      this.tools = await this.mcpClient.listTools();
      console.log(`✅ ${this.tools.length} outils disponibles\n`);
    } catch (error) {
      console.error(`❌ Impossible de récupérer les outils: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    // Améliorer les descriptions des outils pour guider le LLM
    const enhancedTools = this.tools.map(tool => {
      let enhancedDescription = tool.description || '';
      
      // Améliorer la description de l'outil de recherche
      if (tool.name === 'API-post-search' || tool.name.toLowerCase().includes('search')) {
        enhancedDescription = 'Recherche et liste les pages Notion. Utilise cet outil pour répondre aux questions sur les pages disponibles, pour lister les pages, ou pour trouver des pages par titre/mot-clé. Pour lister toutes les pages, utilise une requête vide (query: "").';
      }
      
      // Améliorer la description des outils pour récupérer les blocs enfants
      if (tool.name === 'API-get-block-children' || tool.name.toLowerCase().includes('block-children') || tool.name.toLowerCase().includes('block_children')) {
        enhancedDescription = (tool.description || '') + ' IMPORTANT: Cet outil retourne seulement les blocs de premier niveau. Pour récupérer TOUS les blocs d\'une page (y compris les enfants), tu dois appeler cet outil récursivement pour chaque bloc qui a has_children: true. Pour compter tous les blocs d\'une page, commence par récupérer les blocs enfants de la page (block_id = page_id), puis pour chaque bloc retourné avec has_children: true, récupère ses blocs enfants récursivement.';
      }
      
      return {
        ...tool,
        description: enhancedDescription
      };
    });

    // Message système pour le LLM
    this.conversationHistory.push({
      role: 'system',
      content: `Tu es un assistant qui peut interagir avec Notion via des outils MCP. 
Tu as accès à ${this.tools.length} outils Notion pour rechercher, lire, créer et modifier des pages.

**RÈGLES IMPORTANTES pour utiliser les outils :**

1. **Pour lister ou rechercher des pages** : 
   - Utilise TOUJOURS l'outil "API-post-search" (ou tout outil avec "search" dans le nom)
   - Pour lister TOUTES les pages : utilise API-post-search avec query: ""
   - Pour rechercher par mot-clé : utilise API-post-search avec query: "mot-clé"
   - C'est l'outil principal pour répondre aux questions sur les pages disponibles

2. **Pour récupérer les blocs d'une page** :
   - IMPORTANT : L'API Notion retourne seulement les blocs de premier niveau par défaut
   - Pour compter TOUS les blocs d'une page (y compris les blocs enfants), tu DOIS :
     a) D'abord récupérer les blocs de premier niveau avec l'outil approprié (ex: API-get-block-children)
     b) Pour CHAQUE bloc qui a des enfants (has_children: true), récupérer récursivement ses blocs enfants
     c) Compter TOUS les blocs récupérés (premier niveau + tous les enfants récursifs)
   - Les tables contiennent des lignes (table_row) qui sont des blocs enfants - ne les oublie pas !
   - Les listes peuvent avoir des éléments imbriqués - compte-les tous
   - Exemple : Si une page a 10 blocs de premier niveau, et que 3 d'entre eux ont chacun 5 enfants, le total est 10 + (3 × 5) = 25 blocs
   - Utilise plusieurs appels d'outils si nécessaire pour récupérer tous les blocs enfants récursivement

3. **Pour compter les blocs d'une page** :
   - Utilise l'outil pour récupérer les blocs enfants de la page (block_id = page_id)
   - Pour chaque bloc retourné, vérifie si has_children est true
   - Si oui, récupère les blocs enfants de ce bloc (récursivement si nécessaire)
   - Compte TOUS les blocs : niveau principal + tous les enfants + enfants des enfants, etc.
   - Regroupe par type de bloc pour donner une répartition détaillée

4. **Ne demande JAMAIS à l'utilisateur** :
   - L'ID de l'espace de travail
   - L'ID d'une page (utilise la recherche pour trouver les pages)
   - Des informations que tu peux obtenir via les outils

5. **Exemples d'utilisation** :
   - Question: "Quelles sont mes pages ?" → Utilise API-post-search avec query: ""
   - Question: "Trouve les pages avec 'test'" → Utilise API-post-search avec query: "test"
   - Question: "Liste mes pages Notion" → Utilise API-post-search avec query: ""
   - Question: "Combien de blocs dans la page X ?" → Récupère récursivement TOUS les blocs (premier niveau + enfants) puis compte-les tous

Réponds en français de manière naturelle et utile. Utilise directement les outils sans demander d'informations supplémentaires à l'utilisateur.`
    });
  }

  async processQuery(query: string): Promise<string> {
    console.log(`\n💬 Question: ${query}\n`);

    // Ajouter la question de l'utilisateur
    this.conversationHistory.push({
      role: 'user',
      content: query
    });

    let maxIterations = 5;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      // Préparer les outils avec descriptions améliorées
      const enhancedTools = this.tools.map(tool => {
        let enhancedDescription = tool.description || '';
        
        // Améliorer la description de l'outil de recherche
        if (tool.name === 'API-post-search' || tool.name.toLowerCase().includes('search')) {
          enhancedDescription = 'Recherche et liste les pages Notion. Utilise cet outil pour répondre aux questions sur les pages disponibles, pour lister les pages, ou pour trouver des pages par titre/mot-clé. Pour lister toutes les pages, utilise une requête vide (query: "").';
        }
        
        // Améliorer la description des outils pour récupérer les blocs enfants
        if (tool.name === 'API-get-block-children' || tool.name.toLowerCase().includes('block-children') || tool.name.toLowerCase().includes('block_children')) {
          enhancedDescription = (tool.description || '') + ' IMPORTANT: Cet outil retourne seulement les blocs de premier niveau. Pour récupérer TOUS les blocs d\'une page (y compris les enfants), tu dois appeler cet outil récursivement pour chaque bloc qui a has_children: true. Pour compter tous les blocs d\'une page, commence par récupérer les blocs enfants de la page (block_id = page_id), puis pour chaque bloc retourné avec has_children: true, récupère ses blocs enfants récursivement.';
        }
        
        return {
          ...tool,
          description: enhancedDescription
        };
      });

      // Appeler le LLM avec l'historique et les outils améliorés
      const response = await this.llmClient.chat(this.conversationHistory, enhancedTools);

      if (!response.choices || response.choices.length === 0) {
        throw new Error('Aucune réponse du LLM');
      }

      const assistantMessage = response.choices[0].message;
      this.conversationHistory.push(assistantMessage);

      // Vérifier si le LLM veut appeler des outils
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        console.log(`🔧 Le LLM souhaite appeler ${assistantMessage.tool_calls.length} outil(s)...\n`);

        // Exécuter chaque appel d'outil
        for (const toolCall of assistantMessage.tool_calls) {
          try {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);

            console.log(`   📞 Appel: ${functionName}`);
            if (Object.keys(functionArgs).length > 0) {
              console.log(`      Arguments: ${JSON.stringify(functionArgs, null, 2).substring(0, 200)}...`);
            }

            // Appeler l'outil MCP
            const toolResult = await this.mcpClient.callTool(functionName, functionArgs);

            // Extraire le résultat
            let resultContent = '';
            const result = toolResult.result;
            if (result && typeof result === 'object' && 'content' in result) {
              const content = (result as { content: Array<{ type: string; text?: string }> }).content;
              if (content.length > 0 && content[0].type === 'text' && content[0].text) {
                resultContent = content[0].text;
              }
            } else if (result) {
              resultContent = JSON.stringify(result, null, 2);
            }

            if (toolResult.error) {
              resultContent = `Erreur: ${toolResult.error.message}`;
            }

            // Ajouter le résultat au contexte
            // Augmenter la limite pour permettre les réponses complètes (50000 caractères)
            this.conversationHistory.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: functionName,
              content: resultContent.substring(0, 50000) // Limiter la taille mais permettre plus de contenu
            });

            console.log(`   ✅ Résultat reçu (${resultContent.length} caractères)\n`);

          } catch (error) {
            console.error(`   ❌ Erreur lors de l'appel de l'outil: ${error instanceof Error ? error.message : String(error)}`);
            
            this.conversationHistory.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: `Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
            });
          }
        }

        // Continuer la boucle pour que le LLM traite les résultats
        continue;
      }

      // Pas d'appels d'outils, retourner la réponse finale
      const finalResponse = assistantMessage.content || 'Aucune réponse générée';
      console.log(`\n💡 Réponse:\n${finalResponse}\n`);
      return finalResponse;
    }

    throw new Error('Nombre maximum d\'itérations atteint');
  }

  async shutdown(): Promise<void> {
    await this.mcpClient.shutdown();
  }
}

async function main() {
  console.log('🤖 Client LLM avec intégration MCP Notion\n');
  console.log('='.repeat(60));

  // Configuration
  const llmProvider = (process.env.LLM_PROVIDER || 'mistral') as 'mistral' | 'gemini';
  const useOpenRouter = process.env.USE_OPENROUTER === 'true';
  
  let llmApiKey: string;
  let llmModel: string;

  if (useOpenRouter) {
    llmApiKey = process.env.OPENROUTER_API_KEY || '';
    if (!llmApiKey) {
      console.error('❌ OPENROUTER_API_KEY n\'est pas définie');
      console.error('\n💡 Pour utiliser OpenRouter:');
      console.error('   1. Obtenez une clé API sur https://openrouter.ai/keys');
      console.error('   2. Ajoutez OPENROUTER_API_KEY=votre_cle dans votre fichier .env');
      console.error('   3. Ajoutez USE_OPENROUTER=true dans votre fichier .env\n');
      process.exit(1);
    }
    llmModel = process.env.LLM_MODEL || (llmProvider === 'mistral' ? 'mistralai/mistral-small-latest' : 'google/gemini-2.5-flash');
  } else {
    if (llmProvider === 'mistral') {
      llmApiKey = process.env.MISTRAL_API_KEY || '';
      if (!llmApiKey) {
        console.error('❌ MISTRAL_API_KEY n\'est pas définie');
        console.error('\n💡 Pour utiliser Mistral:');
        console.error('   1. Obtenez une clé API sur https://console.mistral.ai/');
        console.error('   2. Ajoutez MISTRAL_API_KEY=votre_cle dans votre fichier .env');
        console.error('   3. (Optionnel) Ajoutez LLM_PROVIDER=mistral dans votre fichier .env\n');
        process.exit(1);
      }
      llmModel = process.env.LLM_MODEL || 'mistral-small-latest';
    } else {
      llmApiKey = process.env.GEMINI_API_KEY || '';
      if (!llmApiKey) {
        console.error('❌ GEMINI_API_KEY n\'est pas définie');
        console.error('\n💡 Pour utiliser Gemini:');
        console.error('   1. Obtenez une clé API sur https://aistudio.google.com/app/apikey');
        console.error('   2. Ajoutez GEMINI_API_KEY=votre_cle dans votre fichier .env');
        console.error('   3. Ajoutez LLM_PROVIDER=gemini dans votre fichier .env\n');
        process.exit(1);
      }
      llmModel = process.env.LLM_MODEL || 'gemini-2.5-flash';
    }
  }

  console.log(`📋 Configuration:`);
  console.log(`   LLM Provider: ${llmProvider}`);
  console.log(`   Modèle: ${llmModel}`);
  console.log(`   OpenRouter: ${useOpenRouter ? 'Oui' : 'Non'}\n`);

  // Vérifier que le serveur MCP est accessible
  const port = process.env.PORT || '3000';
  const mcpUrl = `http://localhost:${port}/mcp`;
  
  // Récupérer AUTH_TOKEN depuis .env (dotenv devrait l'avoir chargé)
  const mcpAuthToken = process.env.AUTH_TOKEN || '';
  
  if (mcpAuthToken) {
    console.log(`🔐 Token d'authentification: ${mcpAuthToken.substring(0, 10)}...`);
  } else {
    console.warn('⚠️  AUTH_TOKEN non défini dans .env');
    console.warn('   Le serveur peut avoir généré un token automatiquement');
    console.warn('   Vérifiez les logs du serveur pour le token généré');
  }
  console.log(`🔍 Vérification de l'accessibilité du serveur...`);
  console.log(`   URL: ${mcpUrl}\n`);

  try {
    // Essayer d'abord le health check endpoint si disponible
    const healthUrl = `http://localhost:${port}/health`;
    let serverAccessible = false;
    
    try {
      const healthResponse = await fetch(healthUrl, {
        method: 'GET',
        headers: mcpAuthToken ? {
          'Authorization': `Bearer ${mcpAuthToken}`
        } : {},
        signal: AbortSignal.timeout(5000) // Timeout de 5 secondes
      });
      
      if (healthResponse.ok) {
        serverAccessible = true;
        console.log('✅ Health check réussi\n');
      }
    } catch (e) {
      // Health check endpoint peut ne pas exister ou timeout, continuer avec initialize
    }

    // Si health check n'a pas fonctionné, essayer initialize
    if (!serverAccessible) {
      const initResponse = await fetch(mcpUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          ...(mcpAuthToken ? { 'Authorization': `Bearer ${mcpAuthToken}` } : {})
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'health-check', version: '1.0.0' }
          },
          id: 0
        }),
        signal: AbortSignal.timeout(10000) // Timeout de 10 secondes
      });

      if (initResponse.ok || initResponse.status === 200) {
        serverAccessible = true;
        console.log('✅ Serveur MCP Notion accessible (initialize réussi)\n');
      } else {
        const errorText = await initResponse.text().catch(() => '');
        if (initResponse.status === 401) {
          console.error('❌ Erreur d\'authentification (401 Unauthorized)');
          console.error('   Le serveur nécessite un token d\'authentification');
          if (!mcpAuthToken) {
            console.error('   AUTH_TOKEN n\'est pas défini dans .env');
            console.error('   Vérifiez les logs du serveur pour le token généré automatiquement');
            console.error('   Ajoutez-le dans votre fichier .env : AUTH_TOKEN=votre_token\n');
          } else {
            console.error(`   Token utilisé: ${mcpAuthToken.substring(0, 10)}...`);
            console.error('   Vérifiez que ce token correspond au token du serveur');
            console.error('   Si le serveur a généré un token automatiquement, copiez-le dans .env\n');
          }
        } else if (initResponse.status === 400) {
          console.error(`❌ Erreur 400: Bad Request`);
          if (errorText) {
            const errorJson = JSON.parse(errorText).catch(() => null);
            if (errorJson?.error?.message) {
              console.error(`   ${errorJson.error.message}\n`);
            } else {
              console.error(`   ${errorText.substring(0, 300)}\n`);
            }
          }
        } else {
          console.error(`❌ Le serveur a retourné une erreur: ${initResponse.status}`);
          if (errorText) {
            console.error(`   ${errorText.substring(0, 300)}\n`);
          }
        }
      }
    }

    if (!serverAccessible) {
      console.error('❌ Le serveur MCP Notion n\'est pas accessible');
      console.error(`   URL: ${mcpUrl}`);
      console.error('\n💡 Veuillez lancer le serveur MCP dans un autre terminal :');
      console.error('   - Serveur officiel: pnpm run server:official');
      console.error('   - Serveur custom:   pnpm run server:custom');
      console.error('\n💡 Si le serveur est lancé, vérifiez :');
      console.error('   - Que le port correspond (par défaut: 3000)');
      console.error('   - Que AUTH_TOKEN dans .env correspond au token du serveur');
      console.error('   - Attendez quelques secondes après le démarrage du serveur\n');
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      console.error('❌ Timeout lors de la vérification du serveur');
      console.error('   Le serveur ne répond pas dans les délais');
      console.error('   Vérifiez qu\'il est bien lancé et accessible\n');
    } else {
      console.error('❌ Impossible de vérifier l\'accessibilité du serveur MCP');
      console.error(`   Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      console.error('   Assurez-vous que le serveur est lancé et accessible\n');
    }
    process.exit(1);
  }

  // Ne pas démarrer automatiquement le serveur - il doit être lancé séparément
  const client = new LLMMcpNotionClient(llmProvider, llmApiKey, llmModel, useOpenRouter, false);

  try {
    await client.initialize();

    console.log('='.repeat(60));
    console.log('✅ Prêt à répondre à vos questions sur Notion !');
    console.log('='.repeat(60));
    console.log('\n💡 Exemples de questions:');
    console.log('   - "Quelles sont mes pages Notion ?"');
    console.log('   - "Trouve-moi les pages qui contiennent le mot \'test\'"');
    console.log('   - "Quelle est la date de création de ma page Journal ?"');
    console.log('\nTapez "quit", "exit" ou "q" pour quitter\n');

    // Mode interactif
    const readlineModule = await import('readline');
    const rl = readlineModule.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const askQuestion = () => {
      rl.question('\n❓ Votre question: ', async (query: string) => {
        if (query.toLowerCase().trim() === 'quit' || 
            query.toLowerCase().trim() === 'exit' || 
            query.toLowerCase().trim() === 'q') {
          console.log('\n👋 Au revoir !');
          await client.shutdown();
          rl.close();
          process.exit(0);
        }

        if (!query.trim()) {
          askQuestion();
          return;
        }

        try {
          await client.processQuery(query);
        } catch (error) {
          console.error(`\n❌ Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
        }

        askQuestion();
      });
    };

    askQuestion();

  } catch (error) {
    console.error('\n❌ Erreur:', error instanceof Error ? error.message : 'Erreur inconnue');
    await client.shutdown();
    process.exit(1);
  }
}

// Lancer l'application
main().catch((error) => {
  console.error('Erreur fatale:', error);
  process.exit(1);
});

