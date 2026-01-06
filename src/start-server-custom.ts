#!/usr/bin/env node

/**
 * Script pour lancer le serveur MCP Notion custom
 * 
 * Ce script utilise directement la librairie @notionhq/notion-mcp-server
 * au lieu de lancer un processus externe.
 * 
 * Usage:
 *   pnpm run server:custom
 */

import dotenv from 'dotenv';
// @ts-ignore - tsx peut résoudre les imports TypeScript depuis node_modules
import { startServer } from '@notionhq/notion-mcp-server/scripts/start-server.ts';
// @ts-ignore - tsx peut résoudre les imports TypeScript depuis node_modules
import { ValidationError } from '@notionhq/notion-mcp-server/src/init-server.ts';

// Charger les variables d'environnement
dotenv.config();

// Vérifier que la clé API Notion est configurée
if (!process.env.NOTION_TOKEN && !process.env.NOTION_API_KEY) {
  console.error('❌ ERREUR: NOTION_TOKEN ou NOTION_API_KEY n\'est pas définie');
  console.error('   Veuillez créer un fichier .env avec votre clé API Notion');
  console.error('   Exemple: NOTION_TOKEN=ntn_xxxxxxxxxxxxx');
  process.exit(1);
}

const port: number = parseInt(process.env.PORT || '3000', 10);
const authToken: string | undefined = process.env.AUTH_TOKEN;

console.log('🚀 Démarrage du serveur MCP Notion custom (via librairie)...');
console.log(`📡 Port: ${port}`);
console.log(`🔑 Token Notion: ${(process.env.NOTION_TOKEN || process.env.NOTION_API_KEY || '').substring(0, 10)}...`);
if (authToken) {
  console.log(`🔐 Auth Token: ${authToken.substring(0, 10)}...`);
} else {
  console.log('⚠️  AUTH_TOKEN non défini - un token sera généré automatiquement');
  console.log('   Pour la production, définissez AUTH_TOKEN dans .env');
}
console.log('\n💡 Pour arrêter le serveur, utilisez Ctrl+C\n');

// Construire les arguments pour la fonction startServer
// La fonction startServer utilise process.argv.slice(2), donc on doit modifier process.argv
const originalArgv = process.argv;
const customArgs: string[] = [
  '--transport',
  'http',
  '--port',
  port.toString()
];

// Ajouter le token d'authentification si fourni
if (authToken) {
  customArgs.push('--auth-token', authToken);
}

// Modifier temporairement process.argv pour que startServer puisse parser les arguments
process.argv = [process.argv[0], process.argv[1], ...customArgs];

// Lancer le serveur directement via la librairie
startServer().catch((error: unknown) => {
  // Restaurer process.argv en cas d'erreur
  process.argv = originalArgv;
  
  if (error instanceof ValidationError) {
    console.error('❌ Erreur de validation OpenAPI:');
    error.errors.forEach((err: unknown) => console.error(err));
  } else {
    console.error('❌ Erreur lors du démarrage:', error);
  }
  process.exit(1);
});

// Gérer l'interruption (Ctrl+C)
process.on('SIGINT', () => {
  console.log('\n🛑 Arrêt du serveur...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Arrêt du serveur...');
  process.exit(0);
});

