/**
 * Service Firebase - Gestion centralisée des opérations Firebase
 */
import { auth, db, storage } from '../../config/firebase-config.js';
import { SecurityService } from './security-service.js';

class FirebaseService {
    constructor() {
        this.auth = auth;
        this.db = db;
        this.storage = storage;
        this.securityService = new SecurityService();
    }

    /**
     * Authentifie un utilisateur admin
     * @param {string} email - Email de l'utilisateur
     * @param {string} password - Mot de passe
     * @returns {Promise<Object>} Résultat de l'authentification
     */
    async authenticateAdmin(email, password) {
        try {
            // Authentification Firebase
            const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // Vérifier les droits admin
            const adminDoc = await this.db.collection('admin_users').doc(user.uid).get();
            
            if (!adminDoc.exists) {
                await this.auth.signOut();
                throw new Error('Accès administrateur non autorisé');
            }

            const adminData = adminDoc.data();
            
            if (!adminData.isActive) {
                await this.auth.signOut();
                throw new Error('Compte administrateur désactivé');
            }

            // Mettre à jour les informations de dernière connexion
            await this.updateLastLogin(user.uid);

            return {
                user,
                adminData,
                role: adminData.role || 'admin',
                region: adminData.region || null,
                legion: adminData.legion || null
            };

        } catch (error) {
            throw this.securityService.handleAuthError(error);
        }
    }

    /**
     * Met à jour les informations de dernière connexion
     * @param {string} userId - ID de l'utilisateur
     */
    async updateLastLogin(userId) {
        try {
            await this.db.collection('admin_users').doc(userId).update({
                lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                lastLoginIP: await this.securityService.getClientIP()
            });
        } catch (error) {
            console.error('Erreur mise à jour dernière connexion:', error);
        }
    }

    /**
     * Ajoute un véhicule volé
     * @param {Object} vehicleData - Données du véhicule
     * @param {string} reporterId - ID de l'utilisateur qui signale
     * @returns {Promise<string>} ID du document créé
     */
    async addStolenVehicle(vehicleData, reporterId) {
        try {
            // Vérifier les doublons
            const existingVehicle = await this.db.collection('stolen_vehicles')
                .where('chassis_number', '==', vehicleData.chassisNumber.toUpperCase())
                .where('status', '==', 'active')
                .get();

            if (!existingVehicle.empty) {
                throw new Error('Ce véhicule est déjà signalé comme volé');
            }

            // Préparer les données
            const stolenVehicleData = {
                chassis_number: vehicleData.chassisNumber.toUpperCase(),
                license_plate: vehicleData.licensePlate.toUpperCase(),
                make: vehicleData.make,
                model: vehicleData.model,
                year: vehicleData.year ? parseInt(vehicleData.year) : null,
                color: vehicleData.color,
                theft_date: new Date(vehicleData.theftDate),
                theft_location: vehicleData.theftLocation,
                case_number: vehicleData.caseNumber || null,
                description: vehicleData.description || null,
                status: 'active',
                region: vehicleData.region,
                legion: vehicleData.legion,
                reported_by: reporterId,
                reported_at: firebase.firestore.FieldValue.serverTimestamp(),
                created_at: firebase.firestore.FieldValue.serverTimestamp(),
                updated_at: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Ajouter à Firestore
            const docRef = await this.db.collection('stolen_vehicles').add(stolenVehicleData);
            return docRef.id;

        } catch (error) {
            throw new Error(`Erreur lors de l'ajout du véhicule: ${error.message}`);
        }
    }

    /**
     * Récupère les véhicules volés selon les permissions de l'utilisateur
     * @param {string} userRole - Rôle de l'utilisateur
     * @param {string} userRegion - Région de l'utilisateur
     * @param {string} userLegion - Légion de l'utilisateur
     * @param {Object} filters - Filtres à appliquer
     * @returns {Promise<Array>} Liste des véhicules
     */
    async getStolenVehicles(userRole, userRegion = null, userLegion = null, filters = {}) {
        try {
            let query = this.db.collection('stolen_vehicles');

            // Appliquer les permissions selon le rôle
            if (userRole === 'legion_admin' && userLegion) {
                query = query.where('legion', '==', userLegion);
            } else if (userRole === 'regional_admin' && userRegion) {
                query = query.where('region', '==', userRegion);
            }
            // super_admin peut voir tout

            // Appliquer les filtres additionnels
            if (filters.status) {
                query = query.where('status', '==', filters.status);
            }
            if (filters.region && userRole === 'super_admin') {
                query = query.where('region', '==', filters.region);
            }
            if (filters.legion && (userRole === 'super_admin' || userRole === 'regional_admin')) {
                query = query.where('legion', '==', filters.legion);
            }

            // Tri et limitation
            query = query.orderBy('created_at', 'desc').limit(100);

            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

        } catch (error) {
            throw new Error(`Erreur lors de la récupération des véhicules: ${error.message}`);
        }
    }

    /**
     * Récupère les détections récentes
     * @param {string} userRole - Rôle de l'utilisateur
     * @param {string} userRegion - Région de l'utilisateur
     * @param {string} userLegion - Légion de l'utilisateur
     * @param {number} limit - Nombre de résultats à retourner
     * @returns {Promise<Array>} Liste des détections
     */
    async getRecentDetections(userRole, userRegion = null, userLegion = null, limit = 20) {
        try {
            let query = this.db.collection('detections')
                .where('result_data.result', '==', 'stolen')
                .orderBy('timestamp', 'desc')
                .limit(limit);

            const snapshot = await query.get();
            const detections = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Filtrer côté client selon les permissions
            // (Firestore ne permet pas de filtrer sur des champs imbriqués facilement)
            return detections.filter(detection => {
                const vehicleRegion = detection.result_data?.vehicleDetails?.region;
                const vehicleLegion = detection.result_data?.vehicleDetails?.legion;

                if (userRole === 'super_admin') return true;
                if (userRole === 'regional_admin') return vehicleRegion === userRegion;
                if (userRole === 'legion_admin') return vehicleLegion === userLegion;
                
                return false;
            });

        } catch (error) {
            throw new Error(`Erreur lors de la récupération des détections: ${error.message}`);
        }
    }

    /**
     * Récupère les statistiques selon les permissions
     * @param {string} userRole - Rôle de l'utilisateur
     * @param {string} userRegion - Région de l'utilisateur
     * @param {string} userLegion - Légion de l'utilisateur
     * @returns {Promise<Object>} Statistiques
     */
    async getStatistics(userRole, userRegion = null, userLegion = null) {
        try {
            const stats = {
                activeStolenVehicles: 0,
                todayDetections: 0,
                totalChecks: 0,
                pendingAlerts: 0
            };

            // Véhicules volés actifs
            let stolenQuery = this.db.collection('stolen_vehicles').where('status', '==', 'active');
            if (userRole === 'legion_admin' && userLegion) {
                stolenQuery = stolenQuery.where('legion', '==', userLegion);
            } else if (userRole === 'regional_admin' && userRegion) {
                stolenQuery = stolenQuery.where('region', '==', userRegion);
            }
            
            const stolenSnapshot = await stolenQuery.get();
            stats.activeStolenVehicles = stolenSnapshot.size;

            // Détections d'aujourd'hui
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const detectionsSnapshot = await this.db.collection('detections')
                .where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(today))
                .get();
            
            // Filtrer selon les permissions
            const todayDetections = detectionsSnapshot.docs.filter(doc => {
                const data = doc.data();
                const vehicleRegion = data.result_data?.vehicleDetails?.region;
                const vehicleLegion = data.result_data?.vehicleDetails?.legion;

                if (userRole === 'super_admin') return true;
                if (userRole === 'regional_admin') return vehicleRegion === userRegion;
                if (userRole === 'legion_admin') return vehicleLegion === userLegion;
                
                return false;
            });
            
            stats.todayDetections = todayDetections.length;

            // Total des vérifications (simplifié pour l'exemple)
            const checksSnapshot = await this.db.collection('vehicle_checks').get();
            stats.totalChecks = checksSnapshot.size;

            return stats;

        } catch (error) {
            console.error('Erreur récupération statistiques:', error);
            return {
                activeStolenVehicles: 0,
                todayDetections: 0,
                totalChecks: 0,
                pendingAlerts: 0
            };
        }
    }

    /**
     * Configure les listeners en temps réel pour les notifications
     * @param {string} userRole - Rôle de l'utilisateur
     * @param {string} userRegion - Région de l'utilisateur
     * @param {string} userLegion - Légion de l'utilisateur
     * @param {Function} callback - Fonction à appeler lors de nouvelles détections
     * @returns {Function} Fonction pour arrêter l'écoute
     */
    setupRealtimeNotifications(userRole, userRegion, userLegion, callback) {
        let query = this.db.collection('detections')
            .where('result_data.result', '==', 'stolen')
            .orderBy('timestamp', 'desc');

        const unsubscribe = query.onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const detection = change.doc.data();
                    
                    // Vérifier les permissions
                    const vehicleRegion = detection.result_data?.vehicleDetails?.region;
                    const vehicleLegion = detection.result_data?.vehicleDetails?.legion;
                    
                    let hasPermission = false;
                    if (userRole === 'super_admin') hasPermission = true;
                    else if (userRole === 'regional_admin' && vehicleRegion === userRegion) hasPermission = true;
                    else if (userRole === 'legion_admin' && vehicleLegion === userLegion) hasPermission = true;
                    
                    if (hasPermission) {
                        callback(detection);
                    }
                }
            });
        }, error => {
            console.error('Erreur notifications temps réel:', error);
        });

        return unsubscribe;
    }

    /**
     * Enregistre une activité d'administration
     * @param {string} action - Action effectuée
     * @param {Object} details - Détails de l'action
     * @param {string} userId - ID de l'utilisateur
     * @param {string} userEmail - Email de l'utilisateur
     */
    async logActivity(action, details = {}, userId = null, userEmail = null) {
        try {
            await this.db.collection('admin_logs').add({
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                userId: userId || 'system',
                userEmail: userEmail || 'system',
                action: this.securityService.sanitizeInput(action),
                details: details,
                ipAddress: await this.securityService.getClientIP(),
                userAgent: navigator.userAgent.substring(0, 200)
            });
        } catch (error) {
            console.error('Erreur lors du logging:', error);
        }
    }
}

export { FirebaseService };