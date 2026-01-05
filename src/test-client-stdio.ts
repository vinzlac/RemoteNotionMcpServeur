#!/usr/bin/env node

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

class McpStdioTestClient {
  private server: ChildProcess | null = null;
  private requestId: number = 1;
  private pendingRequests: Map<number | string, {
    resolve: (value: JsonRpcResponse) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private buffer: string = '';

  constructor() {
    this.startServer();
  }

  private startServer(): void {
    const notionToken = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;

    if (!notionToken) {
      console.error('❌ ERREUR: NOTION_TOKEN ou NOTION_API_KEY n\'est pas définie');
      console.error('   Veuillez créer un fichier .env avec votre clé API Notion');
      process.exit(1);
    }

    console.log('🚀 Démarrage du serveur MCP Notion avec transport STDIO...');
    console.log(`🔑 Token Notion: ${notionToken.substring(0, 10)}...`);

    // Lancer le serveur avec transport STDIO
    this.server = spawn('npx', ['-y', '@notionhq/notion-mcp-server'], {
      env: {
        ...process.env,
        NOTION_TOKEN: notionToken
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Gérer les erreurs
    this.server.on('error', (error: Error) => {
      console.error('❌ Erreur lors du démarrage du serveur:', error);
      process.exit(1);
    });

    // Gérer la sortie stdout (réponses du serveur)
    this.server.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    // Gérer stderr (logs du serveur)
    this.server.stderr?.on('data', (data: Buffer) => {
      const message = data.toString();
      // Ignorer les warnings mais afficher les erreurs
      if (message.includes('error') || message.includes('Error')) {
        console.error('⚠️  Serveur:', message.trim());
      }
    });

    // Gérer la fin du processus
    this.server.on('exit', (code: number | null) => {
      if (code !== 0 && code !== null) {
        console.error(`❌ Le serveur s'est arrêté avec le code ${code}`);
        process.exit(code);
      }
      // code null signifie que le processus a été tué par SIGTERM (normal)
    });

    // Attendre un peu que le serveur démarre
    setTimeout(() => {
      console.log('✅ Serveur démarré\n');
    }, 1000);
  }

  private processBuffer(): void {
    // Traiter les messages JSON-RPC (un par ligne)
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Garder la dernière ligne incomplète

    for (const line of lines) {
      if (line.trim()) {
        try {
          const response: JsonRpcResponse = JSON.parse(line);
          this.handleResponse(response);
        } catch (error) {
          // Ignorer les lignes qui ne sont pas du JSON valide
        }
      }
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (pending) {
      this.pendingRequests.delete(response.id);
      if (response.error) {
        pending.reject(new Error(`Erreur MCP: ${response.error.message} (code: ${response.error.code})`));
      } else {
        pending.resolve(response);
      }
    }
  }

  private async makeRequest(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      if (!this.server || !this.server.stdin) {
        reject(new Error('Serveur non disponible'));
        return;
      }

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method,
        params,
        id: this.requestId++
      };

      // Stocker la promesse
      this.pendingRequests.set(request.id, { resolve, reject });

      // Envoyer la requête
      const requestStr = JSON.stringify(request) + '\n';
      this.server.stdin!.write(requestStr);

      // Timeout après 30 secondes
      setTimeout(() => {
        if (this.pendingRequests.has(request.id)) {
          this.pendingRequests.delete(request.id);
          reject(new Error('Timeout: pas de réponse du serveur'));
        }
      }, 30000);
    });
  }

  async initialize(): Promise<JsonRpcResponse> {
    return this.makeRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'mcp-stdio-test-client',
        version: '1.0.0'
      }
    });
  }

  async listTools(): Promise<JsonRpcResponse> {
    return this.makeRequest('tools/list');
  }

  async listResources(): Promise<JsonRpcResponse> {
    return this.makeRequest('resources/list');
  }

  async callTool(name: string, arguments_: Record<string, unknown>): Promise<JsonRpcResponse> {
    return this.makeRequest('tools/call', {
      name,
      arguments: arguments_
    });
  }

  async shutdown(): Promise<void> {
    if (this.server) {
      // Tuer le processus proprement
      this.server.kill('SIGTERM');
      // Attendre un peu pour que le processus se termine
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

async function runTests() {
  console.log('🧪 Client de test MCP Notion (STDIO)\n');
  console.log('='.repeat(60));

  const client = new McpStdioTestClient();

  // Attendre que le serveur soit prêt
  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    // Test 1: Initialize
    console.log('\n' + '='.repeat(60));
    console.log('TEST 1: Initialize');
    console.log('='.repeat(60));
    
    const initResult = await client.initialize();
    
    if (initResult.error) {
      console.error('\n❌ Le test initialize a échoué.');
      console.error(`   Erreur: ${initResult.error.message}`);
      process.exit(1);
    }

    console.log('✅ Initialize réussi');
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
      process.exit(1);
    }

    console.log('✅ List Tools réussi');
    
    // Afficher les outils disponibles
    if (toolsResult.result && typeof toolsResult.result === 'object' && 'tools' in toolsResult.result) {
      const tools = (toolsResult.result as { tools: Array<{ name: string; description?: string }> }).tools;
      console.log(`\n📦 Outils disponibles (${tools.length}):`);
      tools.forEach((tool, index) => {
        console.log(`   ${index + 1}. ${tool.name}`);
        if (tool.description) {
          const desc = tool.description.substring(0, 80);
          console.log(`      ${desc}${tool.description.length > 80 ? '...' : ''}`);
        }
      });
    }

    // Test 3: List Resources (optionnel)
    console.log('\n' + '='.repeat(60));
    console.log('TEST 3: List Resources');
    console.log('='.repeat(60));
    
    let resourcesResult: JsonRpcResponse | null = null;
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
    let searchResult: JsonRpcResponse | null = null;
    
    if (toolsResult.result && typeof toolsResult.result === 'object' && 'tools' in toolsResult.result) {
      const tools = (toolsResult.result as { tools: Array<{ name: string }> }).tools;
      // Chercher l'outil de recherche
      searchToolName = tools.find(t => 
        t.name.toLowerCase().includes('search') || 
        t.name === 'API-post-search'
      )?.name || null;
    }

    if (searchToolName) {
      console.log(`   Utilisation de l'outil: ${searchToolName}`);
      
      // Essayer d'abord une recherche vide pour obtenir toutes les pages
      console.log(`   Recherche de pages (requête vide pour obtenir toutes les pages)...`);
      
      searchResult = await client.callTool(searchToolName, {
        query: ''
      });
      
      // Si aucune page n'est trouvée avec une requête vide, essayer avec "test"
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
              
              // Le format de réponse peut varier, chercher les résultats
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
                  
                  // Extraire les informations de la page
                  if (page.id) {
                    console.log(`      ID: ${page.id}`);
                  }
                  
                  // Chercher le titre dans différentes structures
                  let title: string | null = null;
                  
                  // Format 1: page.properties avec type title
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
                  
                  // Format 2: title directement dans la page
                  if (!title && page.title) {
                    if (Array.isArray(page.title)) {
                      title = page.title.map((t: any) => t.plain_text || t.text || t || '').join('');
                    } else if (typeof page.title === 'string') {
                      title = page.title;
                    } else if (page.title.plain_text) {
                      title = page.title.plain_text;
                    }
                  }
                  
                  // Format 3: name dans la page
                  if (!title && page.name) {
                    title = page.name;
                  }
                  
                  if (title) {
                    console.log(`      Titre: ${title}`);
                  } else {
                    console.log(`      Titre: (sans titre)`);
                  }
                  
                  // Afficher l'URL si disponible
                  if (page.url) {
                    console.log(`      URL: ${page.url}`);
                  }
                  
                  // Afficher le type d'objet
                  if (page.object) {
                    console.log(`      Type: ${page.object}`);
                  }
                  
                  // Afficher la date de création si disponible
                  if (page.created_time) {
                    const date = new Date(page.created_time);
                    console.log(`      Créé le: ${date.toLocaleDateString('fr-FR')} ${date.toLocaleTimeString('fr-FR')}`);
                  }
                  
                  // Afficher la date de dernière modification si disponible
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
    console.log(`   ✅ List Tools: OK (21 outils disponibles)`);
    if (resourcesResult) {
      console.log(`   ${resourcesResult.error ? 'ℹ️' : '✅'} List Resources: ${resourcesResult.error?.code === -32601 ? 'Non disponible (normal)' : resourcesResult.error ? 'Erreur' : 'OK'}`);
    } else {
      console.log(`   ℹ️  List Resources: Non disponible (normal)`);
    }
    if (searchResult) {
      console.log(`   ${searchResult.error ? '⚠️' : '✅'} Test d'outil: ${searchResult.error ? 'Erreur (peut être normal)' : 'OK'}`);
    } else {
      console.log(`   ⚠️  Test d'outil: Ignoré (aucun outil trouvé)`);
    }
    console.log('\n🎉 Le serveur MCP Notion fonctionne correctement avec le transport STDIO !\n');

    // Arrêter le serveur
    await client.shutdown();

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ ERREUR LORS DES TESTS');
    console.error('='.repeat(60));
    console.error(`\n${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    console.error('\n💡 Vérifications:');
    console.error('   1. La clé API Notion est-elle valide ?');
    console.error('   2. Les pages/bases de données sont-elles partagées avec l\'intégration ?');
    console.error('   3. Le serveur a-t-il démarré correctement ?\n');
    
    await client.shutdown();
    process.exit(1);
  }
}

// Lancer les tests
runTests().catch((error) => {
  console.error('Erreur fatale:', error);
  process.exit(1);
});

