/**
 * Service de données - Gestion des opérations sur les vraies collections
 */
import { DatabaseMigration } from '../utils/database-migration.js';

class DataService {
    constructor(firebaseService, securityService) {
        this.firebaseService = firebaseService;
        this.securityService = securityService;
        this.db = firebaseService.db;
        this.migration = new DatabaseMigration();
    }

    /**
     * Initialise le service et exécute les migrations
     */
    async initialize() {
        try {
            await this.migration.runMigrations();
            console.log('✅ Service de données initialisé');
        } catch (error) {
            console.error('❌ Erreur initialisation service de données:', error);
            throw error;
        }
    }

    /**
     * Récupère les véhicules volés de la vraie collection
     */
    async getStolenVehicles(userRole, userRegion, userLegion, filters = {}) {
        try {
            let query = this.db.collection('stolen_vehicles');
            
            // Appliquer les permissions
            if (userRole === 'legion_admin' && userLegion) {
                query = query.where('legion', '==', userLegion);
            }
            
            // Appliquer les filtres
            if (filters.status) {
                query = query.where('status', '==', filters.status);
            }
            
            // Tri et limitation
            query = query.orderBy('created_at', 'desc').limit(100);
            
            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
        } catch (error) {
            console.error('Erreur récupération véhicules volés:', error);
            throw error;
        }
    }

    /**
     * Récupère les détections de la vraie collection
     */
    async getDetections(userRole, userRegion, userLegion, filters = {}) {
        try {
            let query = this.db.collection('stolen_vehicle_detections');
            
            // Appliquer les permissions
            if (userRole === 'legion_admin' && userLegion) {
                query = query.where('legion', '==', userLegion);
            }
            
            // Appliquer les filtres
            if (filters.status) {
                query = query.where('status', '==', filters.status);
            }
            
            query = query.orderBy('detection_date', 'desc').limit(50);
            
            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
        } catch (error) {
            console.error('Erreur récupération détections:', error);
            throw error;
        }
    }

    /**
     * Récupère les statistiques avec les vraies collections
     */
    async getStatistics(userRole, userRegion, userLegion) {
        try {
            const stats = {
                activeStolenVehicles: 0,
                todayDetections: 0,
                totalChecks: 0,
                pendingRewards: 0,
                totalRewards: 0
            };

            // Véhicules volés actifs
            let stolenQuery = this.db.collection('stolen_vehicles').where('status', '==', 'active');
            if (userRole === 'legion_admin' && userLegion) {
                stolenQuery = stolenQuery.where('legion', '==', userLegion);
            }
            
            const stolenSnapshot = await stolenQuery.get();
            stats.activeStolenVehicles = stolenSnapshot.size;

            // Détections d'aujourd'hui
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            let detectionsQuery = this.db.collection('stolen_vehicle_detections')
                .where('detection_date', '>=', firebase.firestore.Timestamp.fromDate(today));
            
            if (userRole === 'legion_admin' && userLegion) {
                detectionsQuery = detectionsQuery.where('legion', '==', userLegion);
            }
            
            const detectionsSnapshot = await detectionsQuery.get();
            stats.todayDetections = detectionsSnapshot.size;

            // Récompenses
            let rewardsQuery = this.db.collection('rewards');
            if (userRole === 'legion_admin' && userLegion) {
                // Filtrer par légion si nécessaire
            }
            
            const rewardsSnapshot = await rewardsQuery.get();
            let pendingRewards = 0;
            let totalRewards = 0;
            
            rewardsSnapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.status === 'pending') {
                    pendingRewards += data.amount || 0;
                }
                totalRewards += data.amount || 0;
            });
            
            stats.pendingRewards = pendingRewards;
            stats.totalRewards = totalRewards;

            return stats;

        } catch (error) {
            console.error('Erreur récupération statistiques:', error);
            return {
                activeStolenVehicles: 0,
                todayDetections: 0,
                totalChecks: 0,
                pendingRewards: 0,
                totalRewards: 0
            };
        }
    }

    /**
     * Ajoute un véhicule volé dans la vraie collection
     */
    async addStolenVehicle(vehicleData, reporterId, reporterEmail) {
        try {
            // Vérifier les doublons
            const existingVehicle = await this.db.collection('stolen_vehicles')
                .where('chassis_number', '==', vehicleData.chassisNumber.toUpperCase())
                .where('status', '==', 'active')
                .get();

            if (!existingVehicle.empty) {
                throw new Error('Ce véhicule est déjà signalé comme volé');
            }

            // Préparer les données pour la vraie structure
            const stolenVehicleData = {
                chassis_number: vehicleData.chassisNumber.toUpperCase(),
                license_plate: vehicleData.licensePlate.toUpperCase(),
                make: vehicleData.make,
                model: vehicleData.model,
                year: vehicleData.year ? parseInt(vehicleData.year) : null,
                color: vehicleData.color,
                theft_date: firebase.firestore.Timestamp.fromDate(new Date(vehicleData.theftDate)),
                theft_location: vehicleData.theftLocation,
                case_number: vehicleData.caseNumber || '',
                status: 'active',
                region: vehicleData.region,
                legion: vehicleData.legion,
                reporter_id: reporterId,
                reported_by_email: reporterEmail,
                created_at: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Ajouter à la collection
            const docRef = await this.db.collection('stolen_vehicles').add(stolenVehicleData);
            return docRef.id;

        } catch (error) {
            console.error('Erreur ajout véhicule volé:', error);
            throw error;
        }
    }

    /**
     * Met à jour le statut d'un véhicule volé
     */
    async updateVehicleStatus(vehicleId, newStatus, notes = '') {
        try {
            await this.db.collection('stolen_vehicles').doc(vehicleId).update({
                status: newStatus,
                updated_at: firebase.firestore.FieldValue.serverTimestamp(),
                status_notes: notes
            });
            
            return true;
        } catch (error) {
            console.error('Erreur mise à jour statut véhicule:', error);
            throw error;
        }
    }

    /**
     * Traite une récompense
     */
    async processReward(rewardId, paymentData) {
        try {
            await this.db.collection('rewards').doc(rewardId).update({
                status: 'paid',
                processed_by: this.firebaseService.auth.currentUser.uid,
                processed_at: firebase.firestore.FieldValue.serverTimestamp(),
                payment_method: paymentData.method,
                payment_reference: paymentData.reference,
                payment_notes: paymentData.notes || ''
            });
            
            return true;
        } catch (error) {
            console.error('Erreur traitement récompense:', error);
            throw error;
        }
    }
}

export { DataService };