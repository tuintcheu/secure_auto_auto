/**
 * Script de migration réel pour Firebase
 * Crée vraiment les collections dans votre base de données
 */
class RealDatabaseMigration {
    constructor() {
        this.db = null;
        this.auth = null;
        this.initialized = false;
    }

    /**
     * Initialise Firebase avec votre vraie configuration
     */
    async initializeFirebase() {
        try {
            const firebaseConfig = {
                apiKey: "AIzaSyAOS5eDHnRXGXn4QpkOqm3z0kcChSlU0Ho",
                authDomain: "securauto-19756.firebaseapp.com",
                projectId: "securauto-19756",
                storageBucket: "securauto-19756.firebasestorage.app",
                messagingSenderId: "42127478765",
                appId: "1:42127478765:web:7800e4c81932e9af4561e4",
                measurementId: "G-3Q2KNVXZPS"
            };

            // Initialiser Firebase s'il n'est pas déjà initialisé
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }

            this.db = firebase.firestore();
            this.auth = firebase.auth();
            this.initialized = true;

            console.log('✅ Firebase initialisé avec succès');
            console.log('📊 Projet:', firebaseConfig.projectId);
            return true;

        } catch (error) {
            console.error('❌ Erreur initialisation Firebase:', error);
            throw error;
        }
    }

    /**
     * Exécute la migration complète
     */
    async runRealMigration(progressCallback) {
        if (!this.initialized) {
            await this.initializeFirebase();
        }

        try {
            progressCallback('Connexion à Firebase...', 'sync');
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 1. Créer la collection admin_users
            progressCallback('Création de la collection admin_users...', 'users');
            await this.createAdminUsersCollection();
            await new Promise(resolve => setTimeout(resolve, 500));

            // 2. Créer la collection admin_logs
            progressCallback('Création de la collection admin_logs...', 'history');
            await this.createAdminLogsCollection();
            await new Promise(resolve => setTimeout(resolve, 500));

            // 3. Créer la collection system_settings
            progressCallback('Création de la collection system_settings...', 'settings');
            await this.createSystemSettingsCollection();
            await new Promise(resolve => setTimeout(resolve, 500));

            // 4. Créer la collection rewards
            progressCallback('Création de la collection rewards...', 'money');
            await this.createRewardsCollection();
            await new Promise(resolve => setTimeout(resolve, 500));

            // 5. Mettre à jour les collections existantes si nécessaire
            progressCallback('Mise à jour des collections existantes...', 'sync');
            await this.updateExistingCollections();
            await new Promise(resolve => setTimeout(resolve, 500));

            progressCallback('Migration terminée avec succès !', 'check');
            return true;

        } catch (error) {
            console.error('❌ Erreur lors de la migration:', error);
            progressCallback(`Erreur: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Crée la collection admin_users avec les vrais comptes
     */
    async createAdminUsersCollection() {
        try {
            // Vérifier si la collection existe déjà
            const existingDocs = await this.db.collection('admin_users').limit(1).get();
            
            if (!existingDocs.empty) {
                console.log('ℹ️ Collection admin_users existe déjà');
                return;
            }

            console.log('📝 Création des comptes administrateurs...');

            // Créer le super admin global
            await this.db.collection('admin_users').doc('global_admin').set({
                email: "admin.global@securAuto.cm",
                displayName: "Administrateur Global CED",
                role: "global_admin",
                region: "ALL",
                legion: "ALL", 
                isActive: true,
                permissions: {
                    can_manage_users: true,
                    can_view_all_reports: true,
                    can_export_data: true,
                    can_manage_system: true,
                    can_manage_rewards: true,
                    can_view_all_regions: true,
                    can_create_vehicles: true,
                    can_edit_vehicles: true,
                    can_delete_vehicles: true,
                    can_verify_detections: true,
                    can_process_rewards: true
                },
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: null,
                lastLoginIP: null,
                createdBy: 'SYSTEM_INIT',
                notes: 'Compte administrateur global créé automatiquement lors de l\'initialisation'
            });
            console.log('👑 Super admin global créé');

            // Créer des admins de légion pour chaque région
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
                },
                {
                    id: 'admin_ouest',
                    email: "admin.ouest@securAuto.cm",
                    displayName: "Admin Légion Ouest", 
                    region: "RG5",
                    legion: "OUEST"
                },
                {
                    id: 'admin_nord',
                    email: "admin.nord@securAuto.cm",
                    displayName: "Admin Légion Nord",
                    region: "RG3", 
                    legion: "NORD"
                },
                {
                    id: 'admin_sud_ouest',
                    email: "admin.sudouest@securAuto.cm",
                    displayName: "Admin Légion Sud-Ouest",
                    region: "RG2", 
                    legion: "SUD_OUEST"
                },
                {
                    id: 'admin_adamaoua',
                    email: "admin.adamaoua@securAuto.cm",
                    displayName: "Admin Légion Adamaoua",
                    region: "RG3", 
                    legion: "ADAMAOUA"
                },
                {
                    id: 'admin_extreme_nord',
                    email: "admin.extremenord@securAuto.cm",
                    displayName: "Admin Légion Extrême-Nord",
                    region: "RG4", 
                    legion: "EXTREME_NORD"
                },
                {
                    id: 'admin_nord_ouest',
                    email: "admin.nordouest@securAuto.cm",
                    displayName: "Admin Légion Nord-Ouest",
                    region: "RG5", 
                    legion: "NORD_OUEST"
                },
                {
                    id: 'admin_logone_chari',
                    email: "admin.logonechari@securAuto.cm",
                    displayName: "Admin Légion Logone et Chari",
                    region: "RG4", 
                    legion: "LOGONE_CHARI"
                },
                {
                    id: 'admin_centre_bafia',
                    email: "admin.bafia@securAuto.cm",
                    displayName: "Admin Légion Bafia",
                    region: "RG6", 
                    legion: "CENTRE_BAFIA"
                }
            ];

            for (const admin of legionAdmins) {
                await this.db.collection('admin_users').doc(admin.id).set({
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
                        can_manage_rewards: false,
                        can_view_all_regions: false,
                        can_create_vehicles: true,
                        can_edit_vehicles: true,
                        can_delete_vehicles: false,
                        can_verify_detections: true,
                        can_process_rewards: false
                    },
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLogin: null,
                    lastLoginIP: null,
                    createdBy: 'SYSTEM_INIT',
                    notes: `Compte admin légion ${admin.legion} créé automatiquement lors de l'initialisation`
                });
                console.log(`👤 Admin légion ${admin.legion} créé`);
            }

            console.log('✅ Collection admin_users créée avec succès');

        } catch (error) {
            console.error('❌ Erreur création admin_users:', error);
            throw error;
        }
    }

    /**
     * Crée la collection admin_logs
     */
    async createAdminLogsCollection() {
        try {
            const existingDocs = await this.db.collection('admin_logs').limit(1).get();
            
            if (!existingDocs.empty) {
                console.log('ℹ️ Collection admin_logs existe déjà');
                return;
            }

            // Créer le premier log d'initialisation
            await this.db.collection('admin_logs').add({
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                userId: 'SYSTEM',
                userEmail: 'system@securAuto.cm',
                action: 'SYSTEM_INITIALIZATION',
                details: {
                    message: 'Initialisation du système SecurAuto Admin',
                    version: '1.0.0',
                    collections_created: ['admin_users', 'admin_logs', 'system_settings', 'rewards'],
                    admin_accounts_created: 12, // 1 global + 11 légions
                    initialization_date: new Date().toISOString()
                },
                ipAddress: 'localhost',
                userAgent: 'SecurAuto Admin Initialization Script',
                level: 'INFO',
                category: 'SYSTEM'
            });

            console.log('✅ Collection admin_logs créée avec succès');

        } catch (error) {
            console.error('❌ Erreur création admin_logs:', error);
            throw error;
        }
    }

    /**
     * Crée la collection system_settings
     */
    async createSystemSettingsCollection() {
        try {
            const existingDoc = await this.db.collection('system_settings').doc('general').get();
            
            if (existingDoc.exists) {
                console.log('ℹ️ Collection system_settings existe déjà');
                return;
            }

            // Paramètres généraux du système
            await this.db.collection('system_settings').doc('general').set({
                app_name: 'SecurAuto Admin',
                app_version: '1.0.0',
                maintenance_mode: false,
                initialization_date: firebase.firestore.FieldValue.serverTimestamp(),
                
                // Paramètres des récompenses
                reward_settings: {
                    default_amount: 25000, // En FCFA
                    max_amount: 100000,
                    min_amount: 5000,
                    auto_approval_threshold: 50000,
                    requires_verification: true,
                    payment_methods: ['mobile_money', 'bank_transfer', 'cash']
                },
                
                // Paramètres de notification
                notification_settings: {
                    email_enabled: true,
                    sms_enabled: false,
                    push_enabled: true,
                    admin_notifications: true,
                    detection_alerts: true,
                    reward_notifications: true
                },
                
                // Paramètres de sécurité
                security_settings: {
                    max_login_attempts: 5,
                    lockout_duration: 300, // 5 minutes en secondes
                    session_timeout: 1800, // 30 minutes en secondes
                    password_min_length: 8,
                    require_2fa: false,
                    ip_whitelist_enabled: false,
                    auto_logout_inactive: true
                },
                
                // Paramètres des légions et régions
                legion_settings: {
                    total_legions: 11,
                    total_regions: 6,
                    regions: [
                        { 
                            code: 'RG1', 
                            name: 'Région de Yaoundé', 
                            headquarters: 'Yaoundé',
                            legions: ['CENTRE', 'SUD'] 
                        },
                        { 
                            code: 'RG2', 
                            name: 'Région de Douala', 
                            headquarters: 'Douala',
                            legions: ['LITTORAL', 'SUD_OUEST'] 
                        },
                        { 
                            code: 'RG3', 
                            name: 'Région de Garoua', 
                            headquarters: 'Garoua',
                            legions: ['ADAMAOUA', 'NORD'] 
                        },
                        { 
                            code: 'RG4', 
                            name: 'Région de Maroua', 
                            headquarters: 'Maroua',
                            legions: ['EXTREME_NORD', 'LOGONE_CHARI'] 
                        },
                        { 
                            code: 'RG5', 
                            name: 'Région de Bamenda', 
                            headquarters: 'Bamenda',
                            legions: ['OUEST', 'NORD_OUEST'] 
                        },
                        { 
                            code: 'RG6', 
                            name: 'Région de Bafia', 
                            headquarters: 'Bafia',
                            legions: ['CENTRE_BAFIA'] 
                        }
                    ]
                },
                
                updated_at: firebase.firestore.FieldValue.serverTimestamp(),
                updated_by: 'SYSTEM_INIT'
            });

            console.log('✅ Collection system_settings créée avec succès');

        } catch (error) {
            console.error('❌ Erreur création system_settings:', error);
            throw error;
        }
    }

    /**
     * Crée la collection rewards
     */
    async createRewardsCollection() {
        try {
            const existingDocs = await this.db.collection('rewards').limit(1).get();
            
            if (!existingDocs.empty) {
                console.log('ℹ️ Collection rewards existe déjà');
                return;
            }

            // Créer un document exemple pour initialiser la collection
            await this.db.collection('rewards').add({
                detection_id: 'EXAMPLE_DETECTION_001',
                detector_email: 'example.detector@email.com',
                detector_name: 'Détecteur Exemple',
                detector_id: 'example_detector_id',
                amount: 25000,
                status: 'example', // pending, approved, paid, rejected
                vehicle_info: {
                    chassis_number: 'EXAMPLE123456789AB',
                    license_plate: 'EX-001-CM',
                    make: 'Toyota',
                    model: 'Corolla',
                    color: 'Blanc',
                    year: 2020
                },
                detection_date: firebase.firestore.FieldValue.serverTimestamp(),
                detection_location: {
                    latitude: 3.848,
                    longitude: 11.502,
                    address: 'Yaoundé, Cameroun'
                },
                region: 'RG1',
                legion: 'CENTRE',
                verified_by: null,
                verified_at: null,
                processed_by: null,
                processed_at: null,
                payment_method: null,
                payment_reference: null,
                created_at: firebase.firestore.FieldValue.serverTimestamp(),
                notes: 'Document exemple créé lors de l\'initialisation du système pour tester la structure',
                is_example: true
            });

            console.log('✅ Collection rewards créée avec succès');

        } catch (error) {
            console.error('❌ Erreur création rewards:', error);
            throw error;
        }
    }

    /**
     * Met à jour les collections existantes avec les champs manquants
     */
    async updateExistingCollections() {
        try {
            console.log('🔄 Vérification des collections existantes...');
            
            // Mettre à jour stolen_vehicles si elle existe
            await this.updateStolenVehiclesCollection();
            
            // Mettre à jour stolen_vehicle_detections si elle existe  
            await this.updateDetectionsCollection();

            console.log('✅ Collections existantes vérifiées et mises à jour si nécessaire');

        } catch (error) {
            console.error('❌ Erreur mise à jour collections existantes:', error);
            // Ne pas faire échouer toute la migration pour ça
            console.log('⚠️ Continuons malgré les erreurs de mise à jour...');
        }
    }

    /**
     * Met à jour la collection stolen_vehicles
     */
    async updateStolenVehiclesCollection() {
        try {
            const vehicles = await this.db.collection('stolen_vehicles').limit(5).get();
            
            if (vehicles.empty) {
                console.log('ℹ️ Collection stolen_vehicles vide ou n\'existe pas');
                return;
            }

            console.log(`📋 ${vehicles.size} véhicules volés trouvés, vérification des champs...`);

            let updateCount = 0;
            const batch = this.db.batch();

            vehicles.docs.forEach(doc => {
                const data = doc.data();
                const updates = {};

                // Ajouter les champs manquants
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

                if (Object.keys(updates).length > 0) {
                    batch.update(doc.ref, updates);
                    updateCount++;
                }
            });

            if (updateCount > 0) {
                await batch.commit();
                console.log(`✅ ${updateCount} véhicules volés mis à jour`);
            } else {
                console.log('ℹ️ Aucun véhicule à mettre à jour');
            }

        } catch (error) {
            console.error('❌ Erreur mise à jour stolen_vehicles:', error);
        }
    }

    /**
     * Met à jour la collection stolen_vehicle_detections
     */
    async updateDetectionsCollection() {
        try {
            const detections = await this.db.collection('stolen_vehicle_detections').limit(5).get();
            
            if (detections.empty) {
                console.log('ℹ️ Collection stolen_vehicle_detections vide ou n\'existe pas');
                return;
            }

            console.log(`🔍 ${detections.size} détections trouvées, vérification des champs...`);

            let updateCount = 0;
            const batch = this.db.batch();

            detections.docs.forEach(doc => {
                const data = doc.data();
                const updates = {};

                // Ajouter les champs manquants
                if (!data.hasOwnProperty('region')) {
                    updates.region = 'RG1';
                }
                if (!data.hasOwnProperty('legion')) {
                    updates.legion = 'CENTRE';
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
            } else {
                console.log('ℹ️ Aucune détection à mettre à jour');
            }

        } catch (error) {
            console.error('❌ Erreur mise à jour detections:', error);
        }
    }

    /**
     * Vérifie si l'initialisation a déjà été faite
     */
    async checkIfAlreadyInitialized() {
        try {
            const settingsDoc = await this.db.collection('system_settings').doc('general').get();
            return settingsDoc.exists;
        } catch (error) {
            console.error('Erreur vérification initialisation:', error);
            return false;
        }
    }
}

// Export pour utilisation dans le navigateur
window.RealDatabaseMigration = RealDatabaseMigration;