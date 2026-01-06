#!/usr/bin/env node

/**
 * Client MCP générique avec intégration LLM
 * 
 * Ce client permet d'interroger n'importe quel serveur MCP en langage naturel
 * en utilisant un LLM (Mistral ou Gemini) qui peut appeler les outils du serveur MCP.
 * 
 * Fonctionnalités:
 * - Support Mistral et Gemini (direct ou via OpenRouter)
 * - Communication avec n'importe quel serveur MCP via HTTP streaming
 * - Function calling pour utiliser les outils du serveur MCP
 * - Mode interactif pour poser des questions en langage naturel
 * - Complètement générique - fonctionne avec n'importe quel serveur MCP
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

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
        'X-Title': 'Generic MCP LLM Client'
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
              description: tool.description || `MCP tool: ${tool.name}`,
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

class GenericMcpClient {
  private mcpClient: Client;
  private transport: StreamableHTTPClientTransport | null = null;
  private llmClient: LLMClient;
  private tools: McpTool[] = [];
  private conversationHistory: LLMMessage[] = [];
  private serverUrl: string;
  private authToken?: string;

  constructor(
    serverUrl: string,
    llmProvider: 'mistral' | 'gemini',
    llmApiKey: string,
    llmModel: string,
    useOpenRouter: boolean = false,
    authToken?: string
  ) {
    this.serverUrl = serverUrl;
    this.authToken = authToken;

    // Créer le client MCP directement avec le SDK
    this.mcpClient = new Client(
      {
        name: 'generic-mcp-llm-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    // Créer le client LLM
    this.llmClient = new LLMClient(llmProvider, llmApiKey, llmModel, useOpenRouter);
  }

  async initialize(): Promise<void> {
    console.log('🔧 Initialisation du client MCP générique...\n');

    // Connexion au serveur MCP
    console.log(`🔌 Connexion au serveur MCP: ${this.serverUrl}`);
    
    try {
      // Créer le transport avec support des headers d'authentification
      const transportOptions: any = {};
      
      if (this.authToken) {
        transportOptions.requestInit = {
          headers: {
            'Authorization': `Bearer ${this.authToken}`,
          },
        };
        console.log(`🔐 Token d'authentification configuré (${this.authToken.substring(0, 10)}...)\n`);
      }

      this.transport = new StreamableHTTPClientTransport(
        new URL(this.serverUrl),
        transportOptions
      );

      // connect() démarre automatiquement le transport
      await this.mcpClient.connect(this.transport);
      
      console.log('✅ Connecté au serveur MCP\n');
    } catch (error) {
      console.error(`❌ Erreur de connexion: ${error instanceof Error ? error.message : String(error)}`);
      if (this.authToken) {
        console.error('   Vérifiez que le token d\'authentification est correct');
      }
      throw error;
    }

    // Récupérer les outils disponibles
    console.log('📦 Récupération des outils disponibles...');
    try {
      // Utiliser listTools() du SDK MCP
      const toolsResponse = await this.mcpClient.listTools();
      const allTools = toolsResponse.tools || [];
      
      // Convertir au format McpTool
      this.tools = allTools.map((tool: any) => ({
        name: tool.name || tool.ref?.name || 'unknown',
        description: tool.description || '',
        inputSchema: tool.inputSchema || tool.parameters || {}
      }));

      console.log(`✅ ${this.tools.length} outils disponibles\n`);
      
      if (this.tools.length > 0) {
        console.log('📋 Outils disponibles:');
        this.tools.forEach(tool => {
          // Nettoyer la description pour enlever les "Error Responses"
          let cleanDescription = tool.description || 'Pas de description';
          // Supprimer les lignes contenant "Error Responses"
          cleanDescription = cleanDescription.split('\n')
            .filter(line => !line.includes('Error Responses') && !line.trim().match(/^\d{3}:/))
            .join('\n')
            .trim();
          
          console.log(`   - ${tool.name}: ${cleanDescription}`);
        });
        console.log('');
      }
    } catch (error) {
      console.error(`❌ Impossible de récupérer les outils: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    // Message système pour le LLM
    this.conversationHistory.push({
      role: 'system',
      content: `Tu es un assistant qui peut interagir avec un serveur MCP (Model Context Protocol) via des outils.
Tu as accès à ${this.tools.length} outils pour interagir avec le serveur MCP.

**RÈGLES IMPORTANTES pour utiliser les outils :**

1. **Pour utiliser un outil** :
   - Appelle l'outil avec les paramètres requis selon son schéma
   - Respecte les types de données attendus (string, number, object, etc.)
   - Les paramètres marqués comme "required" sont obligatoires
   - Si un outil n'a pas de paramètres requis, utilise un objet vide {} ou ne passe aucun argument
   - Lis attentivement la description de chaque outil pour comprendre son usage

2. **Pour gérer les erreurs** :
   - Si un appel d'outil échoue, informe l'utilisateur de manière claire
   - Vérifie que les paramètres fournis sont corrects avant de réessayer

3. **Ne demande JAMAIS à l'utilisateur** :
   - Des informations que tu peux obtenir via les outils
   - Des détails techniques sur le protocole MCP
   - Utilise directement les outils pour découvrir les capacités du serveur

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

    let maxIterations = 10; // Augmenter pour permettre plus d'itérations
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      // Appeler le LLM avec l'historique et les outils
      const response = await this.llmClient.chat(this.conversationHistory, this.tools);

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
            
            // Parser les arguments, avec gestion des cas vides/null
            let functionArgs: Record<string, unknown> = {};
            try {
              const parsed = JSON.parse(toolCall.function.arguments || '{}');
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                functionArgs = parsed;
              }
            } catch (parseError) {
              console.warn(`   ⚠️  Erreur de parsing des arguments, utilisation d'un objet vide: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
              functionArgs = {};
            }

            console.log(`   📞 Appel: ${functionName}`);
            if (Object.keys(functionArgs).length > 0) {
              console.log(`      Arguments: ${JSON.stringify(functionArgs, null, 2).substring(0, 200)}...`);
            } else {
              console.log(`      Arguments: aucun (outil sans paramètres)`);
            }

            // Appeler l'outil MCP via le SDK MCP
            // Construire l'objet conditionnellement pour omettre arguments si vide
            // Utiliser spread operator pour omettre complètement la propriété si vide
            const hasArguments = functionArgs && typeof functionArgs === 'object' && Object.keys(functionArgs).length > 0;
            
            const toolCallParams = {
              name: functionName,
              ...(hasArguments && { arguments: functionArgs })
            };
            
            // Debug: afficher ce qui sera envoyé
            console.log(`   🔍 Paramètres d'appel: ${JSON.stringify(toolCallParams)}`);
            
            let toolResult;
            try {
              toolResult = await this.mcpClient.callTool(toolCallParams);
            } catch (error) {
              // Gestion d'erreur détaillée pour debug
              const errorMessage = error instanceof Error ? error.message : String(error);
              
              // Si c'est une erreur 400 avec un outil sans paramètres (comme API-get-users),
              // essayer de contourner en utilisant directement le transport HTTP
              if (errorMessage.includes('400') && !hasArguments && this.transport) {
                console.warn(`   ⚠️  Erreur 400 avec un outil sans paramètres. Tentative de contournement...`);
                
                try {
                  // Utiliser directement le transport pour envoyer la requête sans arguments
                  const directResult = await this.callToolDirect(functionName);
                  if (directResult) {
                    console.log(`   ✅ Contournement réussi via appel direct`);
                    toolResult = directResult;
                  } else {
                    throw error;
                  }
                } catch (directError) {
                  console.error(`   ❌ Le contournement a échoué: ${directError instanceof Error ? directError.message : String(directError)}`);
                  throw error;
                }
              } else {
                console.error(`   ❌ Erreur lors de l'appel de l'outil: ${errorMessage}`);
                
                if (error instanceof Error && 'cause' in error) {
                  console.error(`   🔍 Cause: ${JSON.stringify(error.cause)}`);
                }
                throw error;
              }
            }

            // Extraire le résultat
            let resultContent = '';
            if (toolResult && typeof toolResult === 'object') {
              // Le format peut varier selon le serveur MCP
              if ('content' in toolResult) {
                const content = (toolResult as { content: Array<{ type: string; text?: string }> }).content;
                if (content && Array.isArray(content) && content.length > 0) {
                  if (content[0].type === 'text' && content[0].text) {
                    resultContent = content[0].text;
                  } else {
                    resultContent = JSON.stringify(content, null, 2);
                  }
                }
              } else {
                resultContent = JSON.stringify(toolResult, null, 2);
              }
            } else if (toolResult) {
              resultContent = String(toolResult);
            }

            // Ajouter le résultat au contexte
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

  /**
   * Appel direct d'un outil via HTTP pour contourner le problème du SDK MCP
   * qui sérialise toujours arguments: {} même pour les outils sans paramètres
   */
  private async callToolDirect(toolName: string): Promise<any> {
    if (!this.transport) {
      throw new Error('Transport non disponible');
    }

    // Récupérer l'URL du transport
    const transportUrl = (this.transport as any).url?.href || this.serverUrl;
    
    // Préparer la requête JSON-RPC
    const request = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        // Ne pas inclure arguments du tout pour les outils sans paramètres
      },
      id: Math.floor(Math.random() * 1000000)
    };

    // Préparer les headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    // Récupérer le session ID si disponible
    const sessionId = (this.mcpClient as any).sessionId;
    if (sessionId) {
      headers['mcp-session-id'] = sessionId;
    }

    try {
      const response = await fetch(transportUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json() as {
        jsonrpc?: string;
        result?: any;
        error?: {
          code?: number;
          message?: string;
          data?: any;
        };
        id?: number;
      };
      
      // Vérifier s'il y a une erreur dans la réponse
      if (data.error) {
        throw new Error(`MCP Error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      // Retourner le résultat au format attendu par le reste du code
      return {
        content: [
          {
            type: 'text',
            text: typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Erreur lors de l'appel direct: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.transport) {
        await this.transport.close();
      }
      console.log('✅ Déconnecté du serveur MCP');
    } catch (error) {
      console.error(`⚠️  Erreur lors de la déconnexion: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function main() {
  console.log('🤖 Client MCP générique avec intégration LLM\n');
  console.log('='.repeat(60));

  // Configuration du serveur MCP
  const mcpServerUrl = process.env.MCP_SERVER_URL || 'http://localhost:3000/mcp';
  const mcpAuthToken = process.env.MCP_AUTH_TOKEN || process.env.AUTH_TOKEN;

  // Configuration LLM
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
  console.log(`   Serveur MCP: ${mcpServerUrl}`);
  if (mcpAuthToken) {
    console.log(`   Token d'authentification: ${mcpAuthToken.substring(0, 10)}...`);
  }
  console.log(`   LLM Provider: ${llmProvider}`);
  console.log(`   Modèle: ${llmModel}`);
  console.log(`   OpenRouter: ${useOpenRouter ? 'Oui' : 'Non'}\n`);

  // Créer le client
  const client = new GenericMcpClient(
    mcpServerUrl,
    llmProvider,
    llmApiKey,
    llmModel,
    useOpenRouter,
    mcpAuthToken
  );

  try {
    await client.initialize();

    console.log('='.repeat(60));
    console.log('✅ Prêt à répondre à vos questions !');
    console.log('='.repeat(60));
    console.log('\n💡 Le client est connecté au serveur MCP et peut utiliser ses outils.');
    console.log('   Posez vos questions en langage naturel.\n');
    console.log('Tapez "quit", "exit" ou "q" pour quitter\n');

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
          await client.disconnect();
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
    await client.disconnect();
    process.exit(1);
  }
}

// Lancer l'application
main().catch((error) => {
  console.error('Erreur fatale:', error);
  process.exit(1);
});

