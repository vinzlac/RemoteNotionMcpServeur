#!/bin/bash

# Script d'aide pour configurer une clé API LLM

echo "🔧 Configuration d'une clé API LLM pour le client MCP Notion"
echo "============================================================"
echo ""

# Vérifier si .env existe
if [ ! -f .env ]; then
    echo "❌ Le fichier .env n'existe pas"
    echo "   Création du fichier .env à partir de env.example..."
    cp env.example .env
    echo "✅ Fichier .env créé"
    echo ""
fi

# Menu de sélection
echo "Choisissez votre option :"
echo ""
echo "1. Mistral (direct) - Recommandé pour commencer"
echo "2. Gemini (direct)"
echo "3. OpenRouter (proxy) - Recommandé pour function calling"
echo "4. Vérifier la configuration actuelle"
echo "5. Quitter"
echo ""

read -p "Votre choix (1-5): " choice

case $choice in
    1)
        echo ""
        echo "📝 Configuration Mistral direct"
        echo "-------------------------------"
        echo "Obtenez votre clé API sur : https://console.mistral.ai/"
        echo ""
        read -p "Entrez votre clé API Mistral: " mistral_key
        
        if [ -z "$mistral_key" ]; then
            echo "❌ Clé API vide, annulation"
            exit 1
        fi
        
        # Ajouter ou mettre à jour dans .env
        if grep -q "^MISTRAL_API_KEY=" .env; then
            sed -i '' "s|^MISTRAL_API_KEY=.*|MISTRAL_API_KEY=$mistral_key|" .env
        else
            echo "" >> .env
            echo "# Configuration LLM" >> .env
            echo "MISTRAL_API_KEY=$mistral_key" >> .env
        fi
        
        if grep -q "^LLM_PROVIDER=" .env; then
            sed -i '' "s|^LLM_PROVIDER=.*|LLM_PROVIDER=mistral|" .env
        else
            echo "LLM_PROVIDER=mistral" >> .env
        fi
        
        if grep -q "^USE_OPENROUTER=" .env; then
            sed -i '' "s|^USE_OPENROUTER=.*|USE_OPENROUTER=false|" .env
        else
            echo "USE_OPENROUTER=false" >> .env
        fi
        
        echo ""
        echo "✅ Configuration Mistral ajoutée dans .env"
        echo ""
        echo "Vous pouvez maintenant lancer: npm run llm"
        ;;
        
    2)
        echo ""
        echo "📝 Configuration Gemini direct"
        echo "-------------------------------"
        echo "Obtenez votre clé API sur : https://aistudio.google.com/app/apikey"
        echo ""
        read -p "Entrez votre clé API Gemini: " gemini_key
        
        if [ -z "$gemini_key" ]; then
            echo "❌ Clé API vide, annulation"
            exit 1
        fi
        
        # Ajouter ou mettre à jour dans .env
        if grep -q "^GEMINI_API_KEY=" .env; then
            sed -i '' "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=$gemini_key|" .env
        else
            echo "" >> .env
            echo "# Configuration LLM" >> .env
            echo "GEMINI_API_KEY=$gemini_key" >> .env
        fi
        
        if grep -q "^LLM_PROVIDER=" .env; then
            sed -i '' "s|^LLM_PROVIDER=.*|LLM_PROVIDER=gemini|" .env
        else
            echo "LLM_PROVIDER=gemini" >> .env
        fi
        
        if grep -q "^USE_OPENROUTER=" .env; then
            sed -i '' "s|^USE_OPENROUTER=.*|USE_OPENROUTER=false|" .env
        else
            echo "USE_OPENROUTER=false" >> .env
        fi
        
        echo ""
        echo "✅ Configuration Gemini ajoutée dans .env"
        echo ""
        echo "Vous pouvez maintenant lancer: npm run llm"
        ;;
        
    3)
        echo ""
        echo "📝 Configuration OpenRouter"
        echo "----------------------------"
        echo "Obtenez votre clé API sur : https://openrouter.ai/keys"
        echo ""
        read -p "Entrez votre clé API OpenRouter: " openrouter_key
        
        if [ -z "$openrouter_key" ]; then
            echo "❌ Clé API vide, annulation"
            exit 1
        fi
        
        echo ""
        read -p "Quel provider voulez-vous utiliser via OpenRouter? (mistral/gemini) [mistral]: " provider
        provider=${provider:-mistral}
        
        # Ajouter ou mettre à jour dans .env
        if grep -q "^OPENROUTER_API_KEY=" .env; then
            sed -i '' "s|^OPENROUTER_API_KEY=.*|OPENROUTER_API_KEY=$openrouter_key|" .env
        else
            echo "" >> .env
            echo "# Configuration LLM" >> .env
            echo "OPENROUTER_API_KEY=$openrouter_key" >> .env
        fi
        
        if grep -q "^LLM_PROVIDER=" .env; then
            sed -i '' "s|^LLM_PROVIDER=.*|LLM_PROVIDER=$provider|" .env
        else
            echo "LLM_PROVIDER=$provider" >> .env
        fi
        
        if grep -q "^USE_OPENROUTER=" .env; then
            sed -i '' "s|^USE_OPENROUTER=.*|USE_OPENROUTER=true|" .env
        else
            echo "USE_OPENROUTER=true" >> .env
        fi
        
        echo ""
        echo "✅ Configuration OpenRouter ajoutée dans .env"
        echo "   Provider: $provider"
        echo ""
        echo "Vous pouvez maintenant lancer: npm run llm"
        ;;
        
    4)
        echo ""
        echo "📋 Configuration actuelle dans .env:"
        echo "-----------------------------------"
        if grep -q "LLM_PROVIDER" .env; then
            grep "LLM_PROVIDER" .env
        else
            echo "LLM_PROVIDER: non défini"
        fi
        
        if grep -q "USE_OPENROUTER" .env; then
            grep "USE_OPENROUTER" .env
        else
            echo "USE_OPENROUTER: non défini"
        fi
        
        if grep -q "MISTRAL_API_KEY" .env && ! grep -q "^#.*MISTRAL_API_KEY" .env; then
            mistral_key=$(grep "^MISTRAL_API_KEY=" .env | cut -d= -f2)
            if [ ! -z "$mistral_key" ] && [ "$mistral_key" != "your_mistral_api_key_here" ]; then
                echo "MISTRAL_API_KEY: ${mistral_key:0:10}... (configuré)"
            else
                echo "MISTRAL_API_KEY: non configuré"
            fi
        else
            echo "MISTRAL_API_KEY: non configuré"
        fi
        
        if grep -q "GEMINI_API_KEY" .env && ! grep -q "^#.*GEMINI_API_KEY" .env; then
            gemini_key=$(grep "^GEMINI_API_KEY=" .env | cut -d= -f2)
            if [ ! -z "$gemini_key" ] && [ "$gemini_key" != "your_gemini_api_key_here" ]; then
                echo "GEMINI_API_KEY: ${gemini_key:0:10}... (configuré)"
            else
                echo "GEMINI_API_KEY: non configuré"
            fi
        else
            echo "GEMINI_API_KEY: non configuré"
        fi
        
        if grep -q "OPENROUTER_API_KEY" .env && ! grep -q "^#.*OPENROUTER_API_KEY" .env; then
            openrouter_key=$(grep "^OPENROUTER_API_KEY=" .env | cut -d= -f2)
            if [ ! -z "$openrouter_key" ] && [ "$openrouter_key" != "your_openrouter_api_key_here" ]; then
                echo "OPENROUTER_API_KEY: ${openrouter_key:0:10}... (configuré)"
            else
                echo "OPENROUTER_API_KEY: non configuré"
            fi
        else
            echo "OPENROUTER_API_KEY: non configuré"
        fi
        echo ""
        ;;
        
    5)
        echo "Au revoir !"
        exit 0
        ;;
        
    *)
        echo "❌ Choix invalide"
        exit 1
        ;;
esac

