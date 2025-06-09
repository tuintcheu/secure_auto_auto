/**
 * Script de migration et mise à jour de la base de données
 * Crée les collections manquantes sans toucher aux existantes
 */
import { db } from '../../config/firebase-config.js';

class DatabaseMigration {
    constructor() {
        this.db = db;
    }

    /**
     * Exécute toutes les migrations nécessaires
     */
    async runMigrations() {
        console.log('🔄 Début des migrations de base de données...');
        
        try {
            // 1. Créer la collection admin_users si elle n'existe pas
            await this.createAdminUsersCollection();
            
            // 2. Ajouter les champs manquants aux collections existantes
            await this.updateExistingCollections();
            
            // 3. Créer les nouvelles collections nécessaires
            await this.createNewCollections();
            
            // 4. Créer les index nécessaires
            await this.createIndexes();
            
            console.log('✅ Migrations terminées avec succès');
            
        } catch (error) {
            console.error('❌ Erreur lors des migrations:', error);
            throw error;
        }
    }

    /**
     * Crée la collection admin_users
     */
    async createAdminUsersCollection() {
        console.log('📁 Vérification collection admin_users...');
        
        try {
            const adminUsers = await this.db.collection('admin_users').limit(1).get();
            
            if (adminUsers.empty) {
                console.log('➕ Création des comptes administrateurs...');
                
                // Créer le super admin global (CED Yaoundé)
                await this.createGlobalAdmin();
                
                // Créer des exemples d'admins de légion
                await this.createLegionAdmins();
                
                console.log('✅ Collection admin_users créée');
            } else {
                console.log('ℹ️ Collection admin_users existe déjà');
            }
        } catch (error) {
            console.error('❌ Erreur création admin_users:', error);
        }
    }

    /**
     * Crée le compte super admin global
     */
    async createGlobalAdmin() {
        const globalAdminData = {
            email: "admin.global@securAuto.cm",
            displayName: "Administrateur Global CED",
            role: "global_admin",
            region: "ALL", // Accès à toutes les régions
            legion: "ALL", // Accès à toutes les légions
            isActive: true,
            permissions: {
                can_manage_users: true,
                can_view_all_reports: true,
                can_export_data: true,
                can_manage_system: true,
                can_manage_rewards: true
            },
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: null,
            lastLoginIP: null
        };

        // Utiliser l'email comme ID de document pour faciliter les recherches
        await this.db.collection('admin_users').doc('global_admin').set(globalAdminData);
        console.log('👑 Super admin global créé');
    }

    /**
     * Crée des exemples d'admins de légion
     */
    async createLegionAdmins() {
        const legionAdmins = [
            {
                id: 'admin_centre',
                email: "admin.centre@securAuto.cm",
                displayName: "Admin Légion Centre",
                region: "RG1",
                legion: "CENTRE"
            },
            {
                id: 'admin_littoral',
                email: "admin.littoral@securAuto.cm",
                displayName: "Admin Légion Littoral",
                region: "RG2", 
                legion: "LITTORAL"
            },
            {
                id: 'admin_sud',
                email: "admin.sud@securAuto.cm",
                displayName: "Admin Légion Sud",
                region: "RG1",
                legion: "SUD"
            }
        ];

        for (const admin of legionAdmins) {
            const adminData = {
                email: admin.email,
                displayName: admin.displayName,
                role: "legion_admin",
                region: admin.region,
                legion: admin.legion,
                isActive: true,
                permissions: {
                    can_manage_users: false,
                    can_view_all_reports: false,
                    can_export_data: true,
                    can_manage_system: false,
                    can_manage_rewards: false
                },
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: null,
                lastLoginIP: null
            };

            await this.db.collection('admin_users').doc(admin.id).set(adminData);
            console.log(`👤 Admin légion ${admin.legion} créé`);
        }
    }

    /**
     * Met à jour les collections existantes avec les champs manquants
     */
    async updateExistingCollections() {
        console.log('🔄 Mise à jour des collections existantes...');
        
        try {
            // Mettre à jour stolen_vehicles avec les champs manquants
            await this.updateStolenVehicles();
            
            // Mettre à jour stolen_vehicle_detections 
            await this.updateDetections();
            
        } catch (error) {
            console.error('❌ Erreur mise à jour collections:', error);
        }
    }

    /**
     * Met à jour la collection stolen_vehicles
     */
    async updateStolenVehicles() {
        console.log('🚗 Mise à jour collection stolen_vehicles...');
        
        const vehicles = await this.db.collection('stolen_vehicles').get();
        
        if (!vehicles.empty) {
            const batch = this.db.batch();
            let updateCount = 0;
            
            vehicles.docs.forEach(doc => {
                const data = doc.data();
                const updates = {};
                
                // Ajouter les champs manquants seulement s'ils n'existent pas
                if (!data.hasOwnProperty('region')) {
                    updates.region = 'RG1'; // Par défaut Centre
                }
                if (!data.hasOwnProperty('legion')) {
                    updates.legion = 'CENTRE'; // Par défaut
                }
                if (!data.hasOwnProperty('updated_at')) {
                    updates.updated_at = firebase.firestore.FieldValue.serverTimestamp();
                }
                if (!data.hasOwnProperty('reported_by_email')) {
                    updates.reported_by_email = 'system@securAuto.cm';
                }
                
                // Normaliser les champs existants
                if (data.chassis_number && data.chassis_number !== data.chassis_number.toUpperCase()) {
                    updates.chassis_number = data.chassis_number.toUpperCase();
                }
                if (data.license_plate && data.license_plate !== data.license_plate.toUpperCase()) {
                    updates.license_plate = data.license_plate.toUpperCase();
                }
                
                if (Object.keys(updates).length > 0) {
                    batch.update(doc.ref, updates);
                    updateCount++;
                }
            });
            
            if (updateCount > 0) {
                await batch.commit();
                console.log(`✅ ${updateCount} véhicules mis à jour`);
            } else {
                console.log('ℹ️ Aucun véhicule à mettre à jour');
            }
        }
    }

    /**
     * Met à jour la collection stolen_vehicle_detections
     */
    async updateDetections() {
        console.log('🔍 Mise à jour collection stolen_vehicle_detections...');
        
        const detections = await this.db.collection('stolen_vehicle_detections').get();
        
        if (!detections.empty) {
            const batch = this.db.batch();
            let updateCount = 0;
            
            detections.docs.forEach(doc => {
                const data = doc.data();
                const updates = {};
                
                // Ajouter les champs manquants
                if (!data.hasOwnProperty('region')) {
                    updates.region = 'RG1'; // Par défaut
                }
                if (!data.hasOwnProperty('legion')) {
                    updates.legion = 'CENTRE'; // Par défaut
                }
                if (!data.hasOwnProperty('verified_by')) {
                    updates.verified_by = null;
                }
                if (!data.hasOwnProperty('verification_notes')) {
                    updates.verification_notes = '';
                }
                if (!data.hasOwnProperty('reward_amount')) {
                    updates.reward_amount = 0;
                }
                
                if (Object.keys(updates).length > 0) {
                    batch.update(doc.ref, updates);
                    updateCount++;
                }
            });
            
            if (updateCount > 0) {
                await batch.commit();
                console.log(`✅ ${updateCount} détections mises à jour`);
            }
        }
    }

    /**
     * Crée les nouvelles collections nécessaires
     */
    async createNewCollections() {
        console.log('📁 Création des nouvelles collections...');
        
        try {
            // Collection pour les logs d'administration
            await this.createAdminLogsCollection();
            
            // Collection pour les paramètres système
            await this.createSystemSettingsCollection();
            
            // Collection pour les récompenses
            await this.createRewardsCollection();
            
        } catch (error) {
            console.error('❌ Erreur création nouvelles collections:', error);
        }
    }

    /**
     * Crée la collection admin_logs
     */
    async createAdminLogsCollection() {
        const logs = await this.db.collection('admin_logs').limit(1).get();
        
        if (logs.empty) {
            // Créer un document exemple
            await this.db.collection('admin_logs').add({
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                userId: 'system',
                userEmail: 'system@securAuto.cm',
                action: 'SYSTEM_INIT',
                details: { message: 'Initialisation du système de logs' },
                ipAddress: 'localhost',
                userAgent: 'Migration Script'
            });
            console.log('📋 Collection admin_logs créée');
        }
    }

    /**
     * Crée la collection system_settings
     */
    async createSystemSettingsCollection() {
        const settings = await this.db.collection('system_settings').doc('general').get();
        
        if (!settings.exists) {
            await this.db.collection('system_settings').doc('general').set({
                app_version: '1.0.0',
                maintenance_mode: false,
                max_reward_amount: 100000, // En FCFA
                auto_reward_threshold: 50000,
                notification_settings: {
                    email_enabled: true,
                    sms_enabled: false,
                    push_enabled: true
                },
                security_settings: {
                    max_login_attempts: 5,
                    session_timeout: 1800, // 30 minutes en secondes
                    password_min_length: 8
                },
                updated_at: firebase.firestore.FieldValue.serverTimestamp(),
                updated_by: 'system'
            });
            console.log('⚙️ Collection system_settings créée');
        }
    }

    /**
     * Crée la collection rewards
     */
    async createRewardsCollection() {
        const rewards = await this.db.collection('rewards').limit(1).get();
        
        if (rewards.empty) {
            // Créer un document exemple
            await this.db.collection('rewards').add({
                detection_id: 'example_detection',
                detector_email: 'example@email.com',
                detector_name: 'Exemple Détecteur',
                amount: 25000,
                status: 'pending',
                vehicle_info: {
                    chassis_number: 'EXAMPLE123456789',
                    license_plate: 'EXAMPLE',
                    make: 'Exemple'
                },
                processed_by: null,
                processed_at: null,
                payment_method: null,
                payment_reference: null,
                created_at: firebase.firestore.FieldValue.serverTimestamp(),
                notes: 'Exemple de récompense'
            });
            console.log('💰 Collection rewards créée');
        }
    }

    /**
     * Crée les index nécessaires (à faire manuellement dans la console Firebase)
     */
    async createIndexes() {
        console.log('📊 Index à créer manuellement dans Firebase Console:');
        console.log('1. stolen_vehicles: region, legion, status');
        console.log('2. stolen_vehicle_detections: region, legion, status');
        console.log('3. admin_logs: userId, timestamp');
        console.log('4. rewards: status, created_at');
    }
}

export { DatabaseMigration };