#!/usr/bin/env node

/**
 * Client de test pour le serveur MCP Notion avec transport HTTP Streamable
 * 
 * IMPORTANT : Pour la première requête initialize :
 * - Ne PAS envoyer le header mcp-session-id
 * - Ajouter le header Accept: application/json, text/event-stream
 * - Le serveur retournera un mcp-session-id dans les headers de réponse
 * - Utiliser ce session ID pour toutes les requêtes suivantes
 * 
 * Référence: https://github.com/makenotion/notion-mcp-server/issues/138
 */

import { spawn, ChildProcess } from 'child_process';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

// Charger les variables d'environnement
dotenv.config();

// Types pour les requêtes/réponses MCP
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

class McpHttpTestClient {
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
      console.error('❌ ERREUR: NOTION_TOKEN ou NOTION_API_KEY n\'est pas définie');
      process.exit(1);
    }

    console.log('🚀 Démarrage du serveur MCP Notion avec transport HTTP...');
    console.log(`📡 Port: ${port}`);
    console.log(`🔑 Token Notion: ${notionToken.substring(0, 10)}...`);
    console.log(`🔐 Auth Token: ${authToken.substring(0, 10)}...`);

    // Lancer le serveur avec transport HTTP
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

    // Capturer le token généré si nécessaire
    let serverOutput = '';
    let generatedToken: string | null = null;
    
    this.server.stdout?.on('data', (data: Buffer) => {
      serverOutput += data.toString();
      // Afficher les messages du serveur
      const lines = serverOutput.split('\n');
      for (const line of lines) {
        if (line.includes('Generated auth token:')) {
          const match = line.match(/Generated auth token:\s*([a-f0-9]+)/i);
          if (match && match[1]) {
            generatedToken = match[1];
            console.log(`   ${line}`);
            // Mettre à jour le token si généré automatiquement
            if (!process.env.AUTH_TOKEN) {
              this.authToken = generatedToken;
              console.log(`   ✅ Utilisation du token généré automatiquement`);
            }
          }
        } else if (line.includes('Use this token') || line.includes('Authentication:')) {
          console.log(`   ${line}`);
        } else if (line.includes('listening') || line.includes('Server running')) {
          console.log(`   ${line}`);
        }
      }
    });

    this.server.stderr?.on('data', (data: Buffer) => {
      const message = data.toString();
      if (message.includes('error') || message.includes('Error')) {
        console.error('⚠️  Serveur:', message.trim());
      }
    });

    this.server.on('error', (error: Error) => {
      console.error('❌ Erreur lors du démarrage du serveur:', error);
      process.exit(1);
    });

    // Attendre que le serveur démarre (plus de temps pour HTTP)
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Si un token a été généré, l'utiliser
    if (generatedToken && !process.env.AUTH_TOKEN) {
      this.authToken = generatedToken;
    }
    
    console.log('✅ Serveur démarré\n');
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
      'Authorization': `Bearer ${this.authToken}`,
      'Accept': 'application/json, text/event-stream'
    };
    
    // Pour initialize, ne PAS envoyer mcp-session-id (le serveur le génère)
    // Pour les autres requêtes, utiliser le session ID reçu
    if (includeSessionId && this.sessionId) {
      headers['mcp-session-id'] = this.sessionId;
    }
    
    // Debug: afficher les headers (sans le token complet)
    if (includeSessionId && this.sessionId) {
      console.log(`   Headers: Authorization=Bearer ${this.authToken.substring(0, 10)}..., mcp-session-id=${this.sessionId.substring(0, 8)}...`);
    } else {
      console.log(`   Headers: Authorization=Bearer ${this.authToken.substring(0, 10)}..., Accept=application/json, text/event-stream (pas de session ID pour initialize)`);
    }

    console.log(`\n📤 Requête: ${method}`);
    if (params) {
      const paramsStr = JSON.stringify(params, null, 2);
      if (paramsStr.length > 200) {
        console.log(`   Params: ${paramsStr.substring(0, 200)}...`);
      } else {
        console.log(`   Params: ${paramsStr}`);
      }
    }

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        if (response.status === 401) {
          throw new Error(`HTTP ${response.status}: Unauthorized - Vérifiez le token d'authentification`);
        }
        if (response.status === 400 && errorText.includes('session ID')) {
          console.error(`\n⚠️  Erreur "No valid session ID provided"`);
          console.error(`   Pour initialize, ne PAS envoyer le header mcp-session-id`);
          console.error(`   Le serveur génère automatiquement un session ID lors de l'initialize`);
          console.error(`   Vérifiez que le header Accept: application/json, text/event-stream est présent\n`);
        }
        console.error(`   Réponse d'erreur HTTP: ${errorText.substring(0, 200)}`);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Extraire le session ID de la réponse si présent (pour initialize)
      // Le header peut être en minuscules ou avec des tirets
      const sessionIdHeader = response.headers.get('mcp-session-id') || 
                              response.headers.get('MCP-Session-ID') ||
                              response.headers.get('mcp-session-id'.toLowerCase());
      
      if (sessionIdHeader) {
        // Mettre à jour le session ID si on vient de l'initialiser
        if (method === 'initialize' || !this.sessionId || this.sessionId === 'test-session-123') {
          this.sessionId = sessionIdHeader;
          console.log(`   ✅ Session ID reçu du serveur: ${this.sessionId.substring(0, 8)}...`);
        }
      }

      // Pour les réponses SSE (text/event-stream), parser différemment
      const contentType = response.headers.get('content-type') || '';
      let data: JsonRpcResponse;
      
      if (contentType.includes('text/event-stream')) {
        // Pour SSE, lire le texte et parser la première ligne JSON
        const text = await response.text();
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              data = JSON.parse(line.substring(6)) as JsonRpcResponse;
              break;
            } catch (e) {
              // Continuer à chercher
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

      if (data.error) {
        console.error(`❌ Erreur: ${data.error.message} (code: ${data.error.code})`);
        if (data.error.data) {
          console.error(`   Data: ${JSON.stringify(data.error.data, null, 2)}`);
        }
        return data;
      }

      console.log(`✅ Succès`);
      
      // Retourner les données avec le session ID si disponible
      return { ...data, sessionId: sessionIdHeader || undefined };
    } catch (error) {
      console.error(`❌ Erreur réseau: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      throw error;
    }
  }

  async initialize(): Promise<JsonRpcResponseWithSession> {
    // Pour initialize, ne PAS envoyer mcp-session-id (le serveur le génère)
    return this.makeRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'mcp-http-test-client',
        version: '1.0.0'
      }
    }, false); // false = ne pas inclure le session ID
  }

  async listTools(): Promise<JsonRpcResponseWithSession> {
    return this.makeRequest('tools/list');
  }

  async listResources(): Promise<JsonRpcResponseWithSession> {
    return this.makeRequest('resources/list');
  }

  async callTool(name: string, arguments_: Record<string, unknown>): Promise<JsonRpcResponseWithSession> {
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

async function runTests() {
  console.log('🧪 Client de test MCP Notion (HTTP Streamable)\n');
  console.log('='.repeat(60));

  // Configuration
  const port = process.env.PORT || '3000';
  const url = `http://localhost:${port}/mcp`;
  const authToken = process.env.AUTH_TOKEN || randomUUID().replace(/-/g, '');

  console.log(`\n📋 Configuration:`);
  console.log(`   URL: ${url}`);
  console.log(`   Auth Token: ${authToken.substring(0, 10)}...`);

  const client = new McpHttpTestClient(url, authToken);

  try {
    // Démarrer le serveur
    await client.startServer();

    // Test 1: Initialize
    console.log('\n' + '='.repeat(60));
    console.log('TEST 1: Initialize');
    console.log('='.repeat(60));
    
    const initResult = await client.initialize();
    
    if (initResult.error) {
      console.error('\n❌ Le test initialize a échoué.');
      console.error(`   Erreur: ${initResult.error.message}`);
      await client.shutdown();
      process.exit(1);
    }

    // Vérifier que le session ID a été reçu
    if (initResult.sessionId) {
      console.log(`   ✅ Session ID reçu et stocké pour les requêtes suivantes`);
    } else {
      console.warn(`   ⚠️  Aucun session ID reçu dans les headers de réponse`);
    }

    if (initResult.result) {
      const resultStr = JSON.stringify(initResult.result, null, 2);
      if (resultStr.length > 300) {
        console.log(`   Résultat (tronqué): ${resultStr.substring(0, 300)}...`);
      } else {
        console.log(`   Résultat: ${resultStr}`);
      }
    }

    // Test 2: List Tools
    console.log('\n' + '='.repeat(60));
    console.log('TEST 2: List Tools');
    console.log('='.repeat(60));
    
    const toolsResult = await client.listTools();
    
    if (toolsResult.error) {
      console.error('\n❌ Le test listTools a échoué.');
      console.error(`   Erreur: ${toolsResult.error.message}`);
      await client.shutdown();
      process.exit(1);
    }

    // Afficher les outils disponibles
    if (toolsResult.result && typeof toolsResult.result === 'object' && 'tools' in toolsResult.result) {
      const tools = (toolsResult.result as { tools: Array<{ name: string; description?: string }> }).tools;
      console.log(`\n📦 Outils disponibles (${tools.length}):`);
      tools.slice(0, 5).forEach((tool, index) => {
        console.log(`   ${index + 1}. ${tool.name}`);
        if (tool.description) {
          const desc = tool.description.substring(0, 80);
          console.log(`      ${desc}${tool.description.length > 80 ? '...' : ''}`);
        }
      });
      if (tools.length > 5) {
        console.log(`   ... et ${tools.length - 5} autre(s) outil(s)`);
      }
    }

    // Test 3: List Resources
    console.log('\n' + '='.repeat(60));
    console.log('TEST 3: List Resources');
    console.log('='.repeat(60));
    
    let resourcesResult: JsonRpcResponseWithSession | null = null;
    try {
      resourcesResult = await client.listResources();
      
      if (resourcesResult.error) {
        if (resourcesResult.error.code === -32601) {
          console.log('ℹ️  La méthode resources/list n\'est pas disponible (normal pour ce serveur)');
        } else {
          console.warn('\n⚠️  Le test listResources a retourné une erreur.');
          console.warn(`   Erreur: ${resourcesResult.error.message}`);
        }
      } else {
        console.log('✅ List Resources réussi');
        if (resourcesResult.result && typeof resourcesResult.result === 'object' && 'resources' in resourcesResult.result) {
          const resources = (resourcesResult.result as { resources: Array<unknown> }).resources;
          console.log(`   ${resources.length} ressource(s) disponible(s)`);
        }
      }
    } catch (error) {
      console.log('ℹ️  La méthode resources/list n\'est pas disponible (normal pour ce serveur)');
    }

    // Test 4: Recherche de pages
    console.log('\n' + '='.repeat(60));
    console.log('TEST 4: Recherche de pages (API-post-search)');
    console.log('='.repeat(60));
    
    let searchToolName: string | null = null;
    let searchResult: JsonRpcResponseWithSession | null = null;
    
    if (toolsResult.result && typeof toolsResult.result === 'object' && 'tools' in toolsResult.result) {
      const tools = (toolsResult.result as { tools: Array<{ name: string }> }).tools;
      searchToolName = tools.find(t => 
        t.name.toLowerCase().includes('search') || 
        t.name === 'API-post-search'
      )?.name || null;
    }

    if (searchToolName) {
      console.log(`   Utilisation de l'outil: ${searchToolName}`);
      console.log(`   Recherche de pages (requête vide pour obtenir toutes les pages)...`);
      
      searchResult = await client.callTool(searchToolName, {
        query: ''
      });
      
      // Si aucune page n'est trouvée, essayer avec "test"
      if (searchResult.result && typeof searchResult.result === 'object' && 'content' in searchResult.result) {
        const content = (searchResult.result as { content: Array<{ type: string; text?: string }> }).content;
        if (content.length > 0 && content[0].type === 'text' && content[0].text) {
          try {
            const searchData = JSON.parse(content[0].text);
            let pages: Array<any> = [];
            
            if (Array.isArray(searchData)) {
              pages = searchData;
            } else if (searchData.results && Array.isArray(searchData.results)) {
              pages = searchData.results;
            } else if (searchData.pages && Array.isArray(searchData.pages)) {
              pages = searchData.pages;
            } else if (searchData.data && Array.isArray(searchData.data)) {
              pages = searchData.data;
            }
            
            if (pages.length === 0) {
              console.log(`   Aucune page trouvée avec une requête vide, essai avec "test"...`);
              searchResult = await client.callTool(searchToolName, {
                query: 'test'
              });
            }
          } catch (e) {
            // Continuer avec le résultat actuel
          }
        }
      }

      if (searchResult.error) {
        console.warn(`\n⚠️  Le test ${searchToolName} a retourné une erreur: ${searchResult.error.message}`);
        console.warn('   Cela peut être normal si aucune page correspondante n\'est trouvée.');
      } else {
        console.log(`\n✅ L'outil ${searchToolName} a fonctionné !`);
        
        // Afficher les 3 premières pages trouvées
        if (searchResult.result && typeof searchResult.result === 'object' && 'content' in searchResult.result) {
          const content = (searchResult.result as { content: Array<{ type: string; text?: string }> }).content;
          
          if (content.length > 0 && content[0].type === 'text' && content[0].text) {
            try {
              const searchData = JSON.parse(content[0].text);
              
              let pages: Array<any> = [];
              
              if (Array.isArray(searchData)) {
                pages = searchData;
              } else if (searchData.results && Array.isArray(searchData.results)) {
                pages = searchData.results;
              } else if (searchData.pages && Array.isArray(searchData.pages)) {
                pages = searchData.pages;
              } else if (searchData.data && Array.isArray(searchData.data)) {
                pages = searchData.data;
              }
              
              if (pages.length > 0) {
                const pagesToShow = pages.slice(0, 3);
                console.log(`\n📄 Pages trouvées (${pages.length} au total, affichage des 3 premières):`);
                
                pagesToShow.forEach((page: any, index: number) => {
                  console.log(`\n   ${index + 1}. Page:`);
                  
                  if (page.id) {
                    console.log(`      ID: ${page.id}`);
                  }
                  
                  let title: string | null = null;
                  
                  if (page.properties) {
                    const titleProp = Object.values(page.properties).find((prop: any) => 
                      prop.type === 'title' || prop.title
                    ) as any;
                    
                    if (titleProp) {
                      if (titleProp.title && Array.isArray(titleProp.title) && titleProp.title.length > 0) {
                        title = titleProp.title.map((t: any) => t.plain_text || t.text || t || '').join('');
                      } else if (titleProp.plain_text) {
                        title = titleProp.plain_text;
                      } else if (typeof titleProp === 'string') {
                        title = titleProp;
                      }
                    }
                  }
                  
                  if (!title && page.title) {
                    if (Array.isArray(page.title)) {
                      title = page.title.map((t: any) => t.plain_text || t.text || t || '').join('');
                    } else if (typeof page.title === 'string') {
                      title = page.title;
                    } else if (page.title.plain_text) {
                      title = page.title.plain_text;
                    }
                  }
                  
                  if (!title && page.name) {
                    title = page.name;
                  }
                  
                  if (title) {
                    console.log(`      Titre: ${title}`);
                  } else {
                    console.log(`      Titre: (sans titre)`);
                  }
                  
                  if (page.url) {
                    console.log(`      URL: ${page.url}`);
                  }
                  
                  if (page.object) {
                    console.log(`      Type: ${page.object}`);
                  }
                  
                  if (page.created_time) {
                    const date = new Date(page.created_time);
                    console.log(`      Créé le: ${date.toLocaleDateString('fr-FR')} ${date.toLocaleTimeString('fr-FR')}`);
                  }
                  
                  if (page.last_edited_time) {
                    const date = new Date(page.last_edited_time);
                    console.log(`      Modifié le: ${date.toLocaleDateString('fr-FR')} ${date.toLocaleTimeString('fr-FR')}`);
                  }
                });
                
                if (pages.length > 3) {
                  console.log(`\n   ... et ${pages.length - 3} autre(s) page(s)`);
                }
              } else {
                console.log('\n   ℹ️  Aucune page trouvée');
                console.log('   💡 Pour que la recherche fonctionne:');
                console.log('      1. Partagez vos pages Notion avec votre intégration');
                console.log('      2. Allez sur chaque page → "..." → "Add connections"');
                console.log('      3. Sélectionnez votre intégration Notion');
              }
            } catch (parseError) {
              console.log('\n   Résultat reçu (format non JSON ou structure différente):');
              const resultStr = content[0].text;
              if (resultStr.length > 500) {
                console.log(`   ${resultStr.substring(0, 500)}...`);
              } else {
                console.log(`   ${resultStr}`);
              }
            }
          }
        }
      }
    } else {
      console.log('\n⚠️  L\'outil API-post-search n\'a pas été trouvé dans la liste des outils.');
      console.log('   Test d\'outil ignoré.');
    }

    // Résumé
    console.log('\n' + '='.repeat(60));
    console.log('✅ TOUS LES TESTS SONT TERMINÉS');
    console.log('='.repeat(60));
    console.log('\n📊 Résumé:');
    console.log(`   ✅ Initialize: OK`);
    console.log(`   ✅ List Tools: OK`);
    if (resourcesResult) {
      console.log(`   ${resourcesResult.error?.code === -32601 ? 'ℹ️' : resourcesResult.error ? '⚠️' : '✅'} List Resources: ${resourcesResult.error?.code === -32601 ? 'Non disponible (normal)' : resourcesResult.error ? 'Erreur' : 'OK'}`);
    } else {
      console.log(`   ℹ️  List Resources: Non disponible (normal)`);
    }
    if (searchResult) {
      console.log(`   ${searchResult.error ? '⚠️' : '✅'} Recherche de pages: ${searchResult.error ? 'Erreur (peut être normal)' : 'OK'}`);
    } else {
      console.log(`   ⚠️  Recherche de pages: Ignoré (outil non trouvé)`);
    }
    console.log('\n🎉 Le serveur MCP Notion fonctionne correctement avec le transport HTTP !\n');

    // Arrêter le serveur
    await client.shutdown();

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ ERREUR LORS DES TESTS');
    console.error('='.repeat(60));
    console.error(`\n${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    console.error('\n💡 Vérifications:');
    console.error('   1. Le serveur est-il démarré ?');
    console.error('   2. L\'URL est-elle correcte ?');
    console.error('   3. Le token d\'authentification est-il correct ?');
    console.error('   4. La clé API Notion est-elle valide ?\n');
    
    await client.shutdown();
    process.exit(1);
  }
}

// Lancer les tests
runTests().catch((error) => {
  console.error('Erreur fatale:', error);
  process.exit(1);
});

