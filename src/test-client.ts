#!/usr/bin/env node

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

interface McpClientConfig {
  url: string;
  authToken?: string;
  sessionId?: string;
}

class McpTestClient {
  private url: string;
  private authToken?: string;
  private sessionId: string;
  private requestId: number = 1;

  constructor(config: McpClientConfig) {
    this.url = config.url;
    this.authToken = config.authToken;
    this.sessionId = config.sessionId || randomUUID();
  }

  private async makeRequest(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId++
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'mcp-session-id': this.sessionId
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    } else {
      console.warn('⚠️  Aucun token d\'authentification fourni. Le serveur peut rejeter la requête.');
      console.warn('   Définissez AUTH_TOKEN dans .env ou passez-le au constructeur.');
    }

    console.log(`\n📤 Requête: ${method}`);
    if (params) {
      console.log(`   Params: ${JSON.stringify(params, null, 2)}`);
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
          throw new Error(`HTTP ${response.status}: Unauthorized - Le serveur nécessite un token d'authentification. Vérifiez les logs du serveur pour récupérer le token généré automatiquement, ou définissez AUTH_TOKEN dans .env`);
        }
        console.error(`   Réponse d'erreur: ${errorText.substring(0, 200)}`);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as JsonRpcResponse;

      if (data.error) {
        console.error(`❌ Erreur: ${data.error.message} (code: ${data.error.code})`);
        if (data.error.data) {
          console.error(`   Data: ${JSON.stringify(data.error.data, null, 2)}`);
        }
        return data;
      }

      console.log(`✅ Succès`);
      if (data.result) {
        // Afficher un résumé du résultat
        const resultStr = JSON.stringify(data.result, null, 2);
        if (resultStr.length > 500) {
          console.log(`   Résultat (tronqué): ${resultStr.substring(0, 500)}...`);
        } else {
          console.log(`   Résultat: ${resultStr}`);
        }
      }

      return data;
    } catch (error) {
      console.error(`❌ Erreur réseau: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      throw error;
    }
  }

  async initialize(): Promise<JsonRpcResponse> {
    return this.makeRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'mcp-test-client',
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

  async readResource(uri: string): Promise<JsonRpcResponse> {
    return this.makeRequest('resources/read', {
      uri
    });
  }
}

async function runTests() {
  console.log('🧪 Client de test MCP Notion\n');
  console.log('=' .repeat(60));

  // Configuration
  const port = process.env.PORT || '3000';
  const url = process.env.MCP_SERVER_URL || `http://localhost:${port}/mcp`;
  const authToken = process.env.AUTH_TOKEN;

  console.log(`\n📋 Configuration:`);
  console.log(`   URL: ${url}`);
  console.log(`   Auth Token: ${authToken ? `${authToken.substring(0, 10)}...` : 'Non défini (généré automatiquement)'}`);

  if (!authToken) {
    console.log(`\n⚠️  AUTH_TOKEN non défini.`);
    console.log(`   Si le serveur a généré un token automatiquement,`);
    console.log(`   copiez-le depuis la console du serveur et ajoutez-le dans .env:`);
    console.log(`   AUTH_TOKEN=votre-token-ici\n`);
    console.log(`   Ou exportez-le temporairement :`);
    console.log(`   export AUTH_TOKEN=votre-token-ici\n`);
  }

  const client = new McpTestClient({
    url,
    authToken
  });

  try {
    // Test 1: Initialize
    console.log('\n' + '='.repeat(60));
    console.log('TEST 1: Initialize');
    console.log('='.repeat(60));
    const initResult = await client.initialize();
    
    if (initResult.error) {
      console.error('\n❌ Le test initialize a échoué. Vérifiez que le serveur est démarré et que le token est correct.');
      process.exit(1);
    }

    // Test 2: List Tools
    console.log('\n' + '='.repeat(60));
    console.log('TEST 2: List Tools');
    console.log('='.repeat(60));
    const toolsResult = await client.listTools();
    
    if (toolsResult.error) {
      console.error('\n❌ Le test listTools a échoué.');
      process.exit(1);
    }

    // Afficher les outils disponibles
    if (toolsResult.result && typeof toolsResult.result === 'object' && 'tools' in toolsResult.result) {
      const tools = (toolsResult.result as { tools: Array<{ name: string; description?: string }> }).tools;
      console.log(`\n📦 Outils disponibles (${tools.length}):`);
      tools.forEach((tool, index) => {
        console.log(`   ${index + 1}. ${tool.name}`);
        if (tool.description) {
          console.log(`      ${tool.description.substring(0, 80)}${tool.description.length > 80 ? '...' : ''}`);
        }
      });
    }

    // Test 3: List Resources
    console.log('\n' + '='.repeat(60));
    console.log('TEST 3: List Resources');
    console.log('='.repeat(60));
    const resourcesResult = await client.listResources();
    
    if (resourcesResult.error) {
      console.warn('\n⚠️  Le test listResources a retourné une erreur (peut être normal si aucune ressource n\'est configurée).');
    }

    // Test 4: Test d'un outil simple (si disponible)
    console.log('\n' + '='.repeat(60));
    console.log('TEST 4: Test d\'un outil (recherche de pages)');
    console.log('='.repeat(60));
    
    // Récupérer le nom de l'outil de recherche depuis la liste des outils
    let searchToolName: string | null = null;
    let searchResult: JsonRpcResponse | null = null;
    
    if (toolsResult.result && typeof toolsResult.result === 'object' && 'tools' in toolsResult.result) {
      const tools = (toolsResult.result as { tools: Array<{ name: string }> }).tools;
      // Chercher un outil de recherche (peut être v1/search, search_pages, etc.)
      searchToolName = tools.find(t => 
        t.name.toLowerCase().includes('search') || 
        t.name.toLowerCase().includes('page')
      )?.name || null;
    }

    if (searchToolName) {
      // Test avec une recherche simple
      searchResult = await client.callTool(searchToolName, {
        query: 'test'
      });

      if (searchResult.error) {
        console.warn(`\n⚠️  Le test ${searchToolName} a retourné une erreur: ${searchResult.error.message}`);
        console.warn('   Cela peut être normal si aucune page correspondante n\'est trouvée.');
      } else {
        console.log(`\n✅ L'outil ${searchToolName} a fonctionné !`);
      }
    } else {
      console.log('\n⚠️  Aucun outil de recherche trouvé dans la liste des outils.');
      console.log('   Test d\'outil ignoré.');
    }

    // Résumé
    console.log('\n' + '='.repeat(60));
    console.log('✅ TOUS LES TESTS SONT TERMINÉS');
    console.log('='.repeat(60));
    console.log('\n📊 Résumé:');
    console.log(`   ✅ Initialize: OK`);
    console.log(`   ✅ List Tools: OK`);
    console.log(`   ${resourcesResult.error ? '⚠️' : '✅'} List Resources: ${resourcesResult.error ? 'Erreur (peut être normal)' : 'OK'}`);
    if (searchResult) {
      console.log(`   ${searchResult.error ? '⚠️' : '✅'} Test d'outil: ${searchResult.error ? 'Erreur (peut être normal)' : 'OK'}`);
    } else {
      console.log(`   ⚠️  Test d'outil: Ignoré (aucun outil trouvé)`);
    }
    console.log('\n🎉 Le serveur MCP Notion fonctionne correctement !\n');

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ ERREUR LORS DES TESTS');
    console.error('='.repeat(60));
    console.error(`\n${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    console.error('\n💡 Vérifications:');
    console.error('   1. Le serveur est-il démarré ? (npm start ou npm run dev)');
    console.error('   2. L\'URL est-elle correcte ?');
    console.error('   3. Le token d\'authentification est-il correct ?');
    console.error('   4. La clé API Notion est-elle valide ?\n');
    process.exit(1);
  }
}

// Lancer les tests
runTests().catch((error) => {
  console.error('Erreur fatale:', error);
  process.exit(1);
});

