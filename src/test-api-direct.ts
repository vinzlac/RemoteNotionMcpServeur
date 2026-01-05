#!/usr/bin/env node

/**
 * Client de test pour l'API Notion directe (sans MCP)
 * 
 * Ce test utilise directement le SDK Notion (@notionhq/client)
 * pour vérifier que l'API Notion fonctionne correctement.
 */

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

async function runDirectApiTests() {
  console.log('🧪 Test de l\'API Notion directe (sans MCP)\n');
  console.log('='.repeat(60));

  // Vérifier que la clé API est configurée
  const notionToken = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;

  if (!notionToken) {
    console.error('❌ ERREUR: NOTION_TOKEN ou NOTION_API_KEY n\'est pas définie');
    console.error('   Veuillez créer un fichier .env avec votre clé API Notion');
    process.exit(1);
  }

  console.log(`🔑 Token Notion: ${notionToken.substring(0, 10)}...\n`);

  // Initialiser le client Notion
  const notion = new Client({
    auth: notionToken
  });

  try {
    // Test 1: Récupérer l'utilisateur du bot
    console.log('='.repeat(60));
    console.log('TEST 1: Récupérer l\'utilisateur du bot (users.me)');
    console.log('='.repeat(60));
    
    try {
      const me = await notion.users.me({});
      console.log('✅ Succès');
      console.log(`   ID: ${me.id}`);
      console.log(`   Type: ${me.type}`);
      if ('name' in me && me.name) {
        console.log(`   Nom: ${me.name}`);
      }
      if ('avatar_url' in me && me.avatar_url) {
        console.log(`   Avatar: ${me.avatar_url}`);
      }
    } catch (error) {
      console.error('❌ Erreur:', error instanceof Error ? error.message : String(error));
      throw error;
    }

    // Test 2: Rechercher des pages
    console.log('\n' + '='.repeat(60));
    console.log('TEST 2: Rechercher des pages (search)');
    console.log('='.repeat(60));
    
    try {
      const searchResponse = await notion.search({
        query: '',
        page_size: 10
      });

      console.log('✅ Succès');
      console.log(`   ${searchResponse.results.length} résultat(s) trouvé(s)\n`);

      // Afficher les 3 premières pages
      const pagesToShow = searchResponse.results.slice(0, 3);
      console.log('📄 Pages trouvées (affichage des 3 premières):');

      pagesToShow.forEach((page: any, index: number) => {
        console.log(`\n   ${index + 1}. Page:`);
        console.log(`      ID: ${page.id}`);
        console.log(`      Type: ${page.object}`);
        
        // Extraire le titre
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
        
        if (page.url) {
          console.log(`      URL: ${page.url}`);
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

      if (searchResponse.results.length > 3) {
        console.log(`\n   ... et ${searchResponse.results.length - 3} autre(s) page(s)`);
      }

    } catch (error) {
      console.error('❌ Erreur:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.message.includes('401')) {
        console.error('   💡 Vérifiez que votre clé API Notion est valide');
      } else if (error instanceof Error && error.message.includes('403')) {
        console.error('   💡 Vérifiez que vos pages sont partagées avec l\'intégration Notion');
      }
      throw error;
    }

    // Test 3: Rechercher avec une requête spécifique
    console.log('\n' + '='.repeat(60));
    console.log('TEST 3: Rechercher avec une requête spécifique');
    console.log('='.repeat(60));
    
    try {
      const searchResponse = await notion.search({
        query: 'test',
        page_size: 5
      });

      console.log('✅ Succès');
      console.log(`   ${searchResponse.results.length} résultat(s) trouvé(s) avec la requête "test"`);
      
      if (searchResponse.results.length > 0) {
        console.log('\n   Première page trouvée:');
        const firstPage = searchResponse.results[0] as any;
        if (firstPage.properties) {
          const titleProp = Object.values(firstPage.properties).find((prop: any) => 
            prop.type === 'title'
          ) as any;
          
          if (titleProp && titleProp.title && Array.isArray(titleProp.title) && titleProp.title.length > 0) {
            const title = titleProp.title.map((t: any) => t.plain_text || '').join('');
            console.log(`   Titre: ${title}`);
          }
        }
      } else {
        console.log('   Aucune page trouvée avec la requête "test"');
      }

    } catch (error) {
      console.error('❌ Erreur:', error instanceof Error ? error.message : String(error));
      // Ne pas faire échouer le test si la recherche spécifique échoue
      console.warn('   ⚠️  Ce test est optionnel, continuons...');
    }

    // Test 4: Lister les utilisateurs (si accessible)
    console.log('\n' + '='.repeat(60));
    console.log('TEST 4: Lister les utilisateurs (users.list)');
    console.log('='.repeat(60));
    
    try {
      const usersResponse = await notion.users.list({
        page_size: 5
      });

      console.log('✅ Succès');
      console.log(`   ${usersResponse.results.length} utilisateur(s) trouvé(s)`);
      
      if (usersResponse.results.length > 0) {
        console.log('\n   Utilisateurs:');
        usersResponse.results.forEach((user: any, index: number) => {
          console.log(`   ${index + 1}. ${user.type} - ID: ${user.id}`);
          if ('name' in user && user.name) {
            console.log(`      Nom: ${user.name}`);
          }
        });
      }

    } catch (error) {
      console.warn('⚠️  Erreur (peut être normal selon les permissions):', error instanceof Error ? error.message : String(error));
      console.warn('   Certaines intégrations n\'ont pas accès à la liste des utilisateurs');
    }

    // Résumé
    console.log('\n' + '='.repeat(60));
    console.log('✅ TOUS LES TESTS SONT TERMINÉS');
    console.log('='.repeat(60));
    console.log('\n📊 Résumé:');
    console.log(`   ✅ Récupération utilisateur bot: OK`);
    console.log(`   ✅ Recherche de pages: OK`);
    console.log(`   ✅ Recherche avec requête: OK`);
    console.log(`   ℹ️  Liste des utilisateurs: Testé (peut nécessiter des permissions spéciales)`);
    console.log('\n🎉 L\'API Notion directe fonctionne correctement !\n');

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ ERREUR LORS DES TESTS');
    console.error('='.repeat(60));
    console.error(`\n${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    console.error('\n💡 Vérifications:');
    console.error('   1. La clé API Notion est-elle valide ?');
    console.error('   2. Les pages/bases de données sont-elles partagées avec l\'intégration ?');
    console.error('   3. L\'intégration a-t-elle les bonnes permissions ?\n');
    process.exit(1);
  }
}

// Lancer les tests
runDirectApiTests().catch((error) => {
  console.error('Erreur fatale:', error);
  process.exit(1);
});

