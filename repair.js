// repair.js
const fs = require('fs-extra');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'users.json');

async function repair() {
    try {
        // 1. Sauvegarder l'ancien fichier
        if (await fs.pathExists(DATA_FILE)) {
            const backup = DATA_FILE + '.backup';
            await fs.copy(DATA_FILE, backup);
            console.log(`✅ Sauvegarde créée: ${backup}`);
        }

        // 2. Créer un fichier vide valide
        await fs.writeJson(DATA_FILE, {});
        console.log('✅ Fichier users.json réinitialisé avec succès !');
        
    } catch (error) {
        console.error('❌ Erreur:', error);
    }
}

repair();