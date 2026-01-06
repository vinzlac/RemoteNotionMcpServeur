#!/usr/bin/env node

/**
 * Script de démonstration du client LLM-MCP Notion
 * 
 * Ce script montre comment le client fonctionne sans nécessiter de clé API LLM.
 * Il simule les interactions entre le LLM et le serveur MCP Notion.
 */

import { spawn, ChildProcess } from 'child_process';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

// Types simplifiés pour la démonstration
interface McpTool {
  name: string;
  description?: string;
  inputSchema?: any;
}

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
  };
  id: number | string;
}

class McpNotionClient {
  private url: string;
  private authToken: string;
  private sessionId: string;
  private requestId: number = 1;
  private server: ChildProcess | null = null;

  constructor(url: string, authToken: string) {
    this.url = url;
    this.authToken = authToken;
    this.sessionId = randomUUID();
  }

  async startServer(): Promise<void> {
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

    // Attendre que le serveur démarre
    let serverReady = false;
    let serverOutput = '';
    
    this.server.stdout?.on('data', (data: Buffer) => {
      serverOutput += data.toString();
      if (serverOutput.includes('MCP Server listening on port')) {
        serverReady = true;
      }
    });
    
    // Attendre jusqu'à 10 secondes
    for (let i = 0; i < 20; i++) {
      if (serverReady) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (!serverReady) {
      console.warn('⚠️  Le serveur peut ne pas être complètement prêt, continuons...');
    }
    
    console.log('✅ Serveur MCP Notion démarré\n');
  }

  private async makeRequest(method: string, params?: Record<string, unknown>, includeSessionId: boolean = true): Promise<JsonRpcResponse> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId++
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.authToken}`,
      'Accept': 'application/json, text/event-stream'
    };

    if (includeSessionId && this.sessionId) {
      headers['mcp-session-id'] = this.sessionId;
    }

    const response = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const sessionIdHeader = response.headers.get('mcp-session-id') || 
                            response.headers.get('MCP-Session-ID');
    
    if (sessionIdHeader) {
      // Mettre à jour le session ID si on vient de l'initialiser
      if (method === 'initialize' || !this.sessionId || this.sessionId === 'test-session-123') {
        this.sessionId = sessionIdHeader;
      }
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
          } catch (e) {}
        } else if (line.trim() && !line.startsWith(':')) {
          try {
            data = JSON.parse(line) as JsonRpcResponse;
            break;
          } catch (e) {}
        }
      }
      if (!data!) {
        throw new Error('Impossible de parser la réponse SSE');
      }
    } else {
      data = await response.json() as JsonRpcResponse;
    }

    return data;
  }

  async initialize(): Promise<JsonRpcResponse> {
    return this.makeRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'llm-mcp-demo',
        version: '1.0.0'
      }
    }, false);
  }

  async listTools(): Promise<McpTool[]> {
    const response = await this.makeRequest('tools/list');
    
    if (response.error) {
      throw new Error(`Erreur: ${response.error.message}`);
    }

    if (response.result && typeof response.result === 'object' && 'tools' in response.result) {
      return (response.result as { tools: McpTool[] }).tools;
    }

    return [];
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

async function demonstrateLLMMcpFlow() {
  console.log('🎭 Démonstration du flux LLM-MCP Notion\n');
  console.log('='.repeat(60));
  console.log('Ce script montre comment fonctionne le client LLM-MCP');
  console.log('sans nécessiter de clé API LLM.\n');
  console.log('='.repeat(60));

  const port = process.env.PORT || '3000';
  const mcpUrl = `http://localhost:${port}/mcp`;
  const mcpAuthToken = process.env.AUTH_TOKEN || randomUUID().replace(/-/g, '');

  const mcpClient = new McpNotionClient(mcpUrl, mcpAuthToken);

  try {
    // Étape 1: Démarrer le serveur MCP
    console.log('\n📋 ÉTAPE 1: Démarrage du serveur MCP Notion');
    console.log('-'.repeat(60));
    await mcpClient.startServer();

    // Étape 2: Initialiser la connexion
    console.log('\n📋 ÉTAPE 2: Initialisation de la connexion MCP');
    console.log('-'.repeat(60));
    const initResult = await mcpClient.initialize();
    if (initResult.error) {
      throw new Error(`Erreur: ${initResult.error.message}`);
    }
    console.log('✅ Connexion MCP initialisée');

    // Étape 3: Récupérer les outils
    console.log('\n📋 ÉTAPE 3: Récupération des outils Notion');
    console.log('-'.repeat(60));
    const tools = await mcpClient.listTools();
    console.log(`✅ ${tools.length} outils récupérés\n`);

    // Afficher quelques outils
    console.log('📦 Exemples d\'outils disponibles:');
    tools.slice(0, 5).forEach((tool, index) => {
      console.log(`   ${index + 1}. ${tool.name}`);
      if (tool.description) {
        const desc = tool.description.substring(0, 60);
        console.log(`      ${desc}${tool.description.length > 60 ? '...' : ''}`);
      }
    });
    if (tools.length > 5) {
      console.log(`   ... et ${tools.length - 5} autre(s) outil(s)`);
    }

    // Étape 4: Simuler un appel LLM avec function calling
    console.log('\n📋 ÉTAPE 4: Simulation d\'un appel LLM avec function calling');
    console.log('-'.repeat(60));
    console.log('💬 Question utilisateur: "Quelles sont mes pages Notion ?"\n');

    // Simuler la réponse du LLM avec tool calls
    const simulatedLLMResponse = {
      tool_calls: [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'API-post-search',
            arguments: JSON.stringify({ query: '' })
          }
        }
      ]
    };

    console.log('🤖 Réponse du LLM (simulée):');
    console.log(JSON.stringify(simulatedLLMResponse, null, 2));

    // Étape 5: Exécuter l'outil
    console.log('\n📋 ÉTAPE 5: Exécution de l\'outil Notion');
    console.log('-'.repeat(60));
    console.log(`🔧 Appel de l'outil: ${simulatedLLMResponse.tool_calls[0].function.name}`);
    console.log(`   Arguments: ${simulatedLLMResponse.tool_calls[0].function.arguments}\n`);

    const toolResult = await mcpClient.callTool(
      simulatedLLMResponse.tool_calls[0].function.name,
      JSON.parse(simulatedLLMResponse.tool_calls[0].function.arguments)
    );

    if (toolResult.error) {
      console.log(`❌ Erreur: ${toolResult.error.message}`);
    } else {
      console.log('✅ Résultat reçu de l\'outil Notion');
      
      // Extraire et afficher les pages
      if (toolResult.result && typeof toolResult.result === 'object' && 'content' in toolResult.result) {
        const content = (toolResult.result as { content: Array<{ type: string; text?: string }> }).content;
        if (content.length > 0 && content[0].type === 'text' && content[0].text) {
          try {
            const searchData = JSON.parse(content[0].text);
            let pages: Array<any> = [];
            
            if (Array.isArray(searchData)) {
              pages = searchData;
            } else if (searchData.results && Array.isArray(searchData.results)) {
              pages = searchData.results;
            }
            
            if (pages.length > 0) {
              console.log(`\n📄 Pages trouvées (${pages.length} au total, affichage des 3 premières):\n`);
              
              pages.slice(0, 3).forEach((page: any, index: number) => {
                console.log(`   ${index + 1}. Page:`);
                if (page.id) console.log(`      ID: ${page.id}`);
                
                let title = '(sans titre)';
                if (page.properties) {
                  const titleProp = Object.values(page.properties).find((prop: any) => 
                    prop.type === 'title'
                  ) as any;
                  if (titleProp && titleProp.title && Array.isArray(titleProp.title) && titleProp.title.length > 0) {
                    title = titleProp.title.map((t: any) => t.plain_text || '').join('');
                  }
                }
                console.log(`      Titre: ${title}`);
                if (page.url) console.log(`      URL: ${page.url}`);
              });
            } else {
              console.log('\n   Aucune page trouvée');
            }
          } catch (e) {
            console.log('\n   Résultat reçu (format non JSON)');
          }
        }
      }
    }

    // Étape 6: Simuler la réponse finale du LLM
    console.log('\n📋 ÉTAPE 6: Réponse finale du LLM (simulée)');
    console.log('-'.repeat(60));
    console.log('💡 Le LLM génère maintenant une réponse en français basée sur les résultats:');
    console.log('\n"Voici vos pages Notion :');
    if (toolResult.result && typeof toolResult.result === 'object' && 'content' in toolResult.result) {
      const content = (toolResult.result as { content: Array<{ type: string; text?: string }> }).content;
      if (content.length > 0 && content[0].type === 'text' && content[0].text) {
        try {
          const searchData = JSON.parse(content[0].text);
          let pages: Array<any> = [];
          if (Array.isArray(searchData)) {
            pages = searchData;
          } else if (searchData.results && Array.isArray(searchData.results)) {
            pages = searchData.results;
          }
          if (pages.length > 0) {
            pages.slice(0, 3).forEach((page: any, index: number) => {
              let title = '(sans titre)';
              if (page.properties) {
                const titleProp = Object.values(page.properties).find((prop: any) => 
                  prop.type === 'title'
                ) as any;
                if (titleProp && titleProp.title && Array.isArray(titleProp.title) && titleProp.title.length > 0) {
                  title = titleProp.title.map((t: any) => t.plain_text || '').join('');
                }
              }
              console.log(`   - ${title}`);
            });
            if (pages.length > 3) {
              console.log(`   ... et ${pages.length - 3} autre(s) page(s)"`);
            } else {
              console.log('"');
            }
          }
        } catch (e) {
          console.log('   (résultats disponibles)"');
        }
      }
    }

    // Résumé
    console.log('\n' + '='.repeat(60));
    console.log('✅ DÉMONSTRATION TERMINÉE');
    console.log('='.repeat(60));
    console.log('\n📊 Résumé du flux:');
    console.log('   1. ✅ Serveur MCP Notion démarré');
    console.log('   2. ✅ Connexion MCP initialisée');
    console.log('   3. ✅ Outils Notion récupérés');
    console.log('   4. ✅ LLM décide d\'appeler un outil (simulé)');
    console.log('   5. ✅ Outil Notion exécuté');
    console.log('   6. ✅ LLM génère une réponse (simulée)');
    console.log('\n💡 Pour utiliser le vrai client LLM:');
    console.log('   1. Ajoutez une clé API LLM dans votre fichier .env');
    console.log('   2. Lancez: pnpm run llm');
    console.log('   3. Posez vos questions en langage naturel !\n');

    await mcpClient.shutdown();

  } catch (error) {
    console.error('\n❌ Erreur:', error instanceof Error ? error.message : 'Erreur inconnue');
    await mcpClient.shutdown();
    process.exit(1);
  }
}

// Lancer la démonstration
demonstrateLLMMcpFlow().catch((error) => {
  console.error('Erreur fatale:', error);
  process.exit(1);
});

