/**
 * Script d'initialisation principal
 * À exécuter au premier démarrage pour configurer la base de données
 */
import { DatabaseMigration } from './utils/database-migration.js';

class AppInitializer {
    constructor() {
        this.migration = new DatabaseMigration();
    }

    /**
     * Initialise l'application pour la première fois
     */
    async initialize() {
        console.log('🚀 Initialisation première fois de SecurAuto Admin...');
        
        try {
            // 1. Exécuter les migrations
            await this.migration.runMigrations();
            
            // 2. Afficher les instructions
            this.showInitInstructions();
            
            console.log('✅ Initialisation terminée');
            
        } catch (error) {
            console.error('❌ Erreur lors de l\'initialisation:', error);
            alert('Erreur lors de l\'initialisation. Consultez la console pour plus de détails.');
        }
    }

    /**
     * Affiche les instructions post-initialisation
     */
    showInitInstructions() {
        const instructions = `
🎉 Initialisation terminée !

📋 Prochaines étapes :

1. 🔑 Créer les comptes administrateurs dans Firebase Auth :
   - admin.global@securAuto.cm (Super Admin)
   - admin.centre@securAuto.cm (Admin Légion Centre)
   - admin.littoral@securAuto.cm (Admin Légion Littoral)
   - etc.

2. 🔧 Configurer les règles Firestore dans la console Firebase

3. 📊 Créer les index composites nécessaires :
   - stolen_vehicles: region + status
   - stolen_vehicle_detections: legion + status + detection_date

4. 🔐 Mettre à jour config/firebase-config.js avec vos vraies clés

5. 🚀 L'application est prête à être utilisée !

Consultez documentation/setup-guide.md pour plus de détails.
        `;
        
        console.log(instructions);
        alert('Initialisation terminée ! Consultez la console pour les prochaines étapes.');
    }
}

// Auto-exécution si ce script est appelé directement
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('init') === 'true') {
            const initializer = new AppInitializer();
            initializer.initialize();
        }
    });
}

export { AppInitializer };