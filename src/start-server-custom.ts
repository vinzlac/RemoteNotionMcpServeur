#!/usr/bin/env node

/**
 * Script pour lancer le serveur MCP Notion custom (start.ts)
 * 
 * Ce script lance le wrapper custom du serveur MCP Notion
 * qui utilise également le serveur officiel mais avec notre propre gestion.
 * 
 * Usage:
 *   npm run server:custom
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

const port: number = parseInt(process.env.PORT || '3000', 10);

console.log('🚀 Démarrage du serveur MCP Notion custom (start.ts)...');
console.log(`📡 Port: ${port}`);
console.log('\n💡 Pour arrêter le serveur, utilisez Ctrl+C\n');

// Lancer le serveur custom via start.ts
const server: ChildProcess = spawn('tsx', ['src/start.ts'], {
  env: process.env,
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

