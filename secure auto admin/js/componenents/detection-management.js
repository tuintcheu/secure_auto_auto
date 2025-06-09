/**
 * Composant de gestion des détections de véhicules volés
 */
import { formatDate, formatCurrency } from '../utils/helpers.js';

class DetectionManagement {
    constructor(firebaseService, securityService, userRole, userRegion, userLegion) {
        this.firebaseService = firebaseService;
        this.securityService = securityService;
        this.userRole = userRole;
        this.userRegion = userRegion;
        this.userLegion = userLegion;
        this.currentFilters = {};
        this.detections = [];
    }

    /**
     * Rend le composant de gestion des détections
     */
    async render(container) {
        container.innerHTML = `
            <div class="space-y-6">
                <!-- En-tête -->
                <div class="sm:flex sm:items-center sm:justify-between">
                    <div>
                        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                            Gestion des Détections
                        </h1>
                        <p class="mt-2 text-sm text-gray-700 dark:text-gray-300">
                            Gérez les détections de véhicules volés et les récompenses
                        </p>
                    </div>
                </div>

                <!-- Statistiques rapides -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <div class="flex items-center">
                            <div class="flex-shrink-0">
                                <div class="w-8 h-8 bg-red-500 rounded-md flex items-center justify-center">
                                    <i class="fas fa-exclamation-triangle text-white text-sm"></i>
                                </div>
                            </div>
                            <div class="ml-5">
                                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">
                                    Détections ce mois
                                </p>
                                <p id="monthlyDetections" class="text-2xl font-semibold text-gray-900 dark:text-white">
                                    -
                                </p>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <div class="flex items-center">
                            <div class="flex-shrink-0">
                                <div class="w-8 h-8 bg-yellow-500 rounded-md flex items-center justify-center">
                                    <i class="fas fa-clock text-white text-sm"></i>
                                </div>
                            </div>
                            <div class="ml-5">
                                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">
                                    En attente vérification
                                </p>
                                <p id="pendingVerifications" class="text-2xl font-semibold text-gray-900 dark:text-white">
                                    -
                                </p>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <div class="flex items-center">
                            <div class="flex-shrink-0">
                                <div class="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                                    <i class="fas fa-check-circle text-white text-sm"></i>
                                </div>
                            </div>
                            <div class="ml-5">
                                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">
                                    Vérifiées
                                </p>
                                <p id="verifiedDetections" class="text-2xl font-semibold text-gray-900 dark:text-white">
                                    -
                                </p>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <div class="flex items-center">
                            <div class="flex-shrink-0">
                                <div class="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                                    <i class="fas fa-money-bill-wave text-white text-sm"></i>
                                </div>
                            </div>
                            <div class="ml-5">
                                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">
                                    Récompenses en attente
                                </p>
                                <p id="pendingRewards" class="text-2xl font-semibold text-gray-900 dark:text-white">
                                    -
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Filtres et recherche -->
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Recherche
                            </label>
                            <input 
                                type="text" 
                                id="detectionSearch"
                                placeholder="VIN, plaque, détecteur..."
                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-base"
                                oninput="window.detectionManagement.handleSearch(this.value)"
                            >
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Statut
                            </label>
                            <select 
                                id="statusFilter"
                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-base"
                                onchange="window.detectionManagement.applyFilters()"
                            >
                                <option value="">Tous les statuts</option>
                                <option value="pending_verification">En attente</option>
                                <option value="verified">Vérifiée</option>
                                <option value="rejected">Rejetée</option>
                                <option value="reward_paid">Récompense payée</option>
                            </select>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Période
                            </label>
                            <select 
                                id="periodFilter"
                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-base"
                                onchange="window.detectionManagement.applyFilters()"
                            >
                                <option value="">Toutes</option>
                                <option value="today">Aujourd'hui</option>
                                <option value="week">Cette semaine</option>
                                <option value="month">Ce mois</option>
                                <option value="quarter">Ce trimestre</option>
                            </select>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Actions
                            </label>
                            <button 
                                onclick="window.detectionManagement.exportDetections()"
                                class="w-full px-4 py-2 bg-primary text-white rounded-md hover:opacity-90 text-base"
                            >
                                <i class="fas fa-download mr-2"></i>Exporter
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Liste des détections -->
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
                    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                        <h3 class="text-lg font-medium text-gray-900 dark:text-white">
                            Détections de véhicules volés
                        </h3>
                    </div>
                    
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead class="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Date/Heure
                                    </th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Véhicule
                                    </th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Détecteur
                                    </th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Localisation
                                    </th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Statut
                                    </th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Récompense
                                    </th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody id="detectionsList" class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                <!-- Les détections seront chargées ici -->
                            </tbody>
                        </table>
                    </div>

                    <!-- Pagination -->
                    <div id="detectionsPagination" class="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                        <!-- Pagination sera ajoutée ici -->
                    </div>
                </div>
            </div>

            <!-- Modal de vérification de détection -->
            <div id="verificationModal" class="hidden fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                <div class="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white dark:bg-gray-800">
                    <!-- Contenu du modal sera chargé dynamiquement -->
                </div>
            </div>
        `;

        // Charger les données
        await this.loadStatistics();
        await this.loadDetections();

        // Exposer l'instance globalement pour les événements
        window.detectionManagement = this;
    }

    /**
     * Charge les statistiques
     */
    async loadStatistics() {
        try {
            const stats = await this.getDetectionStatistics();
            
            document.getElementById('monthlyDetections').textContent = stats.monthly;
            document.getElementById('pendingVerifications').textContent = stats.pending;
            document.getElementById('verifiedDetections').textContent = stats.verified;
            document.getElementById('pendingRewards').textContent = formatCurrency(stats.pendingRewards);
            
        } catch (error) {
            console.error('Erreur chargement statistiques détections:', error);
        }
    }

    /**
     * Récupère les statistiques des détections
     */
    async getDetectionStatistics() {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        let query = this.firebaseService.db.collection('stolen_vehicle_detections');
        
        // Filtrer selon les permissions
        if (this.userRole === 'legion_admin') {
            query = query.where('legion', '==', this.userLegion);
        }
        
        const snapshot = await query.get();
        
        let monthly = 0;
        let pending = 0;
        let verified = 0;
        let pendingRewards = 0;
        
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const detectionDate = data.detection_date?.toDate();
            
            if (detectionDate && detectionDate >= startOfMonth) {
                monthly++;
            }
            
            switch (data.status) {
                case 'pending_verification':
                    pending++;
                    break;
                case 'verified':
                    verified++;
                    if (data.reward_status === 'pending') {
                        pendingRewards += data.reward_amount || 25000;
                    }
                    break;
            }
        });
        
        return { monthly, pending, verified, pendingRewards };
    }

    /**
     * Charge la liste des détections
     */
    async loadDetections() {
        try {
            let query = this.firebaseService.db.collection('stolen_vehicle_detections');
            
            // Appliquer les permissions
            if (this.userRole === 'legion_admin') {
                query = query.where('legion', '==', this.userLegion);
            }
            
            // Appliquer les filtres
            if (this.currentFilters.status) {
                query = query.where('status', '==', this.currentFilters.status);
            }
            
            // Tri par date (plus récentes en premier)
            query = query.orderBy('detection_date', 'desc').limit(50);
            
            const snapshot = await query.get();
            this.detections = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            this.renderDetectionsList();
            
        } catch (error) {
            console.error('Erreur chargement détections:', error);
            this.showError('Erreur lors du chargement des détections');
        }
    }

    /**
     * Rend la liste des détections
     */
    renderDetectionsList() {
        const tbody = document.getElementById('detectionsList');
        
        if (this.detections.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                        Aucune détection trouvée
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = this.detections.map(detection => this.createDetectionRow(detection)).join('');
    }

    /**
     * Crée une ligne pour une détection
     */
    createDetectionRow(detection) {
        const statusColors = {
            'pending_verification': 'bg-yellow-100 text-yellow-800',
            'verified': 'bg-green-100 text-green-800',
            'rejected': 'bg-red-100 text-red-800',
            'reward_paid': 'bg-blue-100 text-blue-800'
        };
        
        const statusTexts = {
            'pending_verification': 'En attente',
            'verified': 'Vérifiée',
            'rejected': 'Rejetée',
            'reward_paid': 'Récompense payée'
        };
        
        const vehicleInfo = detection.vehicle_data || {};
        const location = detection.detection_location;
        const locationText = location ? 
            `${location.latitude?.toFixed(4)}, ${location.longitude?.toFixed(4)}` : 
            'Non disponible';
        
        return `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    ${formatDate(detection.detection_date)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-medium text-gray-900 dark:text-white">
                        ${vehicleInfo.make || 'N/A'} ${vehicleInfo.model || 'N/A'}
                    </div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">
                        ${vehicleInfo.license_plate || vehicleInfo.chassis_number || 'N/A'}
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-900 dark:text-white">
                        ${detection.detector_name || 'Anonyme'}
                    </div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">
                        ${detection.detector_email || 'N/A'}
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    ${locationText}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusColors[detection.status] || statusColors.pending_verification}">
                        ${statusTexts[detection.status] || 'En attente'}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    ${detection.reward_status === 'pending' ? formatCurrency(detection.reward_amount || 25000) : '-'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button 
                        onclick="window.detectionManagement.viewDetectionDetails('${detection.id}')"
                        class="text-blue-600 hover:text-blue-800"
                        title="Voir détails"
                    >
                        <i class="fas fa-eye"></i>
                    </button>
                    ${detection.status === 'pending_verification' ? `
                        <button 
                            onclick="window.detectionManagement.showVerificationModal('${detection.id}')"
                            class="text-green-600 hover:text-green-800"
                            title="Vérifier"
                        >
                            <i class="fas fa-check-circle"></i>
                        </button>
                    ` : ''}
                    ${this.userRole === 'global_admin' && detection.status === 'verified' && detection.reward_status === 'pending' ? `
                        <button 
                            onclick="window.detectionManagement.processReward('${detection.id}')"
                            class="text-yellow-600 hover:text-yellow-800"
                            title="Traiter récompense"
                        >
                            <i class="fas fa-money-bill-wave"></i>
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    }

    /**
     * Gère la recherche de détections
     */
    handleSearch(searchTerm) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.currentFilters.search = searchTerm.toLowerCase();
            this.filterDetections();
        }, 300);
    }

    /**
     * Applique les filtres
     */
    applyFilters() {
        const statusFilter = document.getElementById('statusFilter').value;
        const periodFilter = document.getElementById('periodFilter').value;
        
        this.currentFilters.status = statusFilter;
        this.currentFilters.period = periodFilter;
        
        this.loadDetections();
    }

    /**
     * Filtre les détections côté client
     */
    filterDetections() {
        let filtered = [...this.detections];
        
        if (this.currentFilters.search) {
            filtered = filtered.filter(detection => {
                const searchTerm = this.currentFilters.search;
                const vehicleData = detection.vehicle_data || {};
                
                return (
                    detection.detector_name?.toLowerCase().includes(searchTerm) ||
                    detection.detector_email?.toLowerCase().includes(searchTerm) ||
                    vehicleData.chassis_number?.toLowerCase().includes(searchTerm) ||
                    vehicleData.license_plate?.toLowerCase().includes(searchTerm) ||
                    vehicleData.make?.toLowerCase().includes(searchTerm)
                );
            });
        }
        
        this.detections = filtered;
        this.renderDetectionsList();
    }

    /**
     * Affiche le modal de vérification
     */
    async showVerificationModal(detectionId) {
        const detection = this.detections.find(d => d.id === detectionId);
        if (!detection) return;
        
        const modal = document.getElementById('verificationModal');
        const vehicleData = detection.vehicle_data || {};
        
        modal.innerHTML = `
            <div class="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white dark:bg-gray-800">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-medium text-gray-900 dark:text-white">
                        Vérification de Détection
                    </h3>
                    <button onclick="window.detectionManagement.closeVerificationModal()" class="text-gray-400 hover:text-gray-600">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                
                <div class="space-y-4">
                    <!-- Informations de la détection -->
                    <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                        <h4 class="font-medium text-gray-900 dark:text-white mb-2">Informations de la détection</h4>
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span class="text-gray-600 dark:text-gray-400">Date:</span>
                                <span class="ml-2 text-gray-900 dark:text-white">${formatDate(detection.detection_date)}</span>
                            </div>
                            <div>
                                <span class="text-gray-600 dark:text-gray-400">Détecteur:</span>
                                <span class="ml-2 text-gray-900 dark:text-white">${detection.detector_name}</span>
                            </div>
                            <div>
                                <span class="text-gray-600 dark:text-gray-400">Email:</span>
                                <span class="ml-2 text-gray-900 dark:text-white">${detection.detector_email}</span>
                            </div>
                            <div>
                                <span class="text-gray-600 dark:text-gray-400">Véhicule:</span>
                                <span class="ml-2 text-gray-900 dark:text-white">${vehicleData.make} ${vehicleData.model}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Formulaire de vérification -->
                    <form id="verificationForm" onsubmit="window.detectionManagement.submitVerification(event, '${detectionId}')">
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Décision *
                                </label>
                                <select 
                                    name="decision" 
                                    required
                                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-base"
                                >
                                    <option value="">Sélectionner une décision</option>
                                    <option value="verified">Vérifiée - Détection valide</option>
                                    <option value="rejected">Rejetée - Détection invalide</option>
                                </select>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Montant de la récompense (FCFA)
                                </label>
                                <input 
                                    type="number" 
                                    name="rewardAmount"
                                    value="25000"
                                    min="0"
                                    max="100000"
                                    step="1000"
                                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-base"
                                >
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Notes de vérification
                                </label>
                                <textarea 
                                    name="notes"
                                    rows="3"
                                    placeholder="Commentaires sur la vérification..."
                                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-base"
                                ></textarea>
                            </div>
                        </div>
                        
                        <div class="flex justify-end space-x-3 mt-6">
                            <button 
                                type="button" 
                                onclick="window.detectionManagement.closeVerificationModal()"
                                class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-base"
                            >
                                Annuler
                            </button>
                            <button 
                                type="submit"
                                class="px-4 py-2 bg-primary text-white rounded-md hover:opacity-90 text-base"
                            >
                                Confirmer la vérification
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        modal.classList.remove('hidden');
    }

    /**
     * Soumet la vérification
     */
    async submitVerification(event, detectionId) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        const decision = formData.get('decision');
        const rewardAmount = parseInt(formData.get('rewardAmount')) || 0;
        const notes = formData.get('notes') || '';
        
        try {
            // Mettre à jour la détection
            await this.firebaseService.db.collection('stolen_vehicle_detections').doc(detectionId).update({
                status: decision,
                verified_by: this.firebaseService.auth.currentUser.uid,
                verified_at: firebase.firestore.FieldValue.serverTimestamp(),
                verification_notes: notes,
                reward_amount: decision === 'verified' ? rewardAmount : 0,
                reward_status: decision === 'verified' ? 'pending' : 'none'
            });
            
            // Si vérifiée, créer une entrée de récompense
            if (decision === 'verified' && rewardAmount > 0) {
                const detection = this.detections.find(d => d.id === detectionId);
                await this.firebaseService.db.collection('rewards').add({
                    detection_id: detectionId,
                    detector_email: detection.detector_email,
                    detector_name: detection.detector_name,
                    detector_id: detection.detector_id,
                    amount: rewardAmount,
                    status: 'pending',
                    vehicle_info: detection.vehicle_data,
                    detection_date: detection.detection_date,
                    verified_by: this.firebaseService.auth.currentUser.uid,
                    created_at: firebase.firestore.FieldValue.serverTimestamp(),
                    notes: notes
                });
            }
            
            // Log de l'activité
            await this.firebaseService.logActivity('DETECTION_VERIFIED', {
                detectionId,
                decision,
                rewardAmount
            });
            
            this.closeVerificationModal();
            this.showSuccess('Détection vérifiée avec succès');
            await this.loadDetections();
            await this.loadStatistics();
            
        } catch (error) {
            console.error('Erreur vérification détection:', error);
            this.showError('Erreur lors de la vérification');
        }
    }

    /**
     * Ferme le modal de vérification
     */
    closeVerificationModal() {
        document.getElementById('verificationModal').classList.add('hidden');
    }

    /**
     * Exporte les détections
     */
    async exportDetections() {
        try {
            const data = this.detections.map(detection => ({
                Date: formatDate(detection.detection_date),
                Véhicule: `${detection.vehicle_data?.make || ''} ${detection.vehicle_data?.model || ''}`,
                Plaque: detection.vehicle_data?.license_plate || '',
                Châssis: detection.vehicle_data?.chassis_number || '',
                Détecteur: detection.detector_name,
                Email: detection.detector_email,
                Statut: detection.status,
                Récompense: detection.reward_amount || 0,
                Notes: detection.verification_notes || ''
            }));
            
            const csv = this.convertToCSV(data);
            this.downloadCSV(csv, `detections_${new Date().toISOString().split('T')[0]}.csv`);
            
        } catch (error) {
            console.error('Erreur export:', error);
            this.showError('Erreur lors de l\'export');
        }
    }

    /**
     * Convertit les données en CSV
     */
    convertToCSV(data) {
        const headers = Object.keys(data[0]).join(',');
        const rows = data.map(row => Object.values(row).join(','));
        return [headers, ...rows].join('\n');
    }

    /**
     * Télécharge un fichier CSV
     */
    downloadCSV(csv, filename) {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    /**
     * Affiche un message de succès
     */
    showSuccess(message) {
        // Utiliser le système de notifications de l'app
        if (window.app) {
            window.app.showSuccess(message);
        }
    }

    /**
     * Affiche un message d'erreur
     */
    showError(message) {
        // Utiliser le système de notifications de l'app
        if (window.app) {
            window.app.showError(message);
        }
    }

    /**
     * Nettoie le composant
     */
    destroy() {
        window.detectionManagement = null;
    }
}

export { DetectionManagement };