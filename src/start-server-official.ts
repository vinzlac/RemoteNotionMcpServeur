#!/usr/bin/env node

/**
 * Script pour lancer le serveur MCP Notion officiel
 * 
 * Ce script lance le serveur MCP Notion officiel (@notionhq/notion-mcp-server)
 * avec le transport HTTP pour permettre l'accès à distance.
 * 
 * Usage:
 *   pnpm run server:official
 */

import { spawn, ChildProcess } from 'child_process';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

// Vérifier que la clé API Notion est configurée
if (!process.env.NOTION_TOKEN && !process.env.NOTION_API_KEY) {
  console.error('❌ ERREUR: NOTION_TOKEN ou NOTION_API_KEY n\'est pas définie');
  console.error('   Veuillez créer un fichier .env avec votre clé API Notion');
  console.error('   Exemple: NOTION_TOKEN=ntn_xxxxxxxxxxxxx');
  process.exit(1);
}

// Utiliser NOTION_API_KEY si NOTION_TOKEN n'est pas défini (compatibilité)
const notionToken: string = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY || '';
const port: number = parseInt(process.env.PORT || '3000', 10);
const authToken: string | undefined = process.env.AUTH_TOKEN;

// Arguments pour le serveur officiel
const args: string[] = [
  '-y',
  '@notionhq/notion-mcp-server',
  '--transport',
  'http',
  '--port',
  port.toString()
];

// Ajouter le token d'authentification si fourni
if (authToken) {
  args.push('--auth-token', authToken);
}

// Variables d'environnement pour le processus enfant
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NOTION_TOKEN: notionToken
};

console.log('🚀 Démarrage du serveur MCP Notion officiel...');
console.log(`📡 Port: ${port}`);
console.log(`🔑 Token Notion: ${notionToken.substring(0, 10)}...`);
if (authToken) {
  console.log(`🔐 Auth Token: ${authToken.substring(0, 10)}...`);
} else {
  console.log('⚠️  AUTH_TOKEN non défini - un token sera généré automatiquement');
  console.log('   Pour la production, définissez AUTH_TOKEN dans .env');
  console.log('   Le token généré sera affiché dans les logs du serveur');
}
console.log('\n💡 Pour arrêter le serveur, utilisez Ctrl+C\n');

// Lancer le serveur officiel
const server: ChildProcess = spawn('npx', args, {
  env,
  stdio: 'inherit',
  shell: true
});

// Gérer les erreurs
server.on('error', (error: Error) => {
  console.error('❌ Erreur lors du démarrage:', error);
  process.exit(1);
});

// Gérer la sortie
server.on('exit', (code: number | null) => {
  if (code !== 0) {
    console.error(`❌ Le serveur s'est arrêté avec le code ${code}`);
    process.exit(code || 1);
  }
});

// Gérer l'interruption (Ctrl+C)
process.on('SIGINT', () => {
  console.log('\n🛑 Arrêt du serveur...');
  server.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Arrêt du serveur...');
  server.kill('SIGTERM');
  process.exit(0);
});

