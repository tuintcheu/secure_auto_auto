// Gestion des récompenses - TRACKING CAR
import { getFirestore, collection, query, where, getDocs, orderBy, limit, doc, updateDoc, addDoc, Timestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

class RewardsManager {
    constructor() {
        this.db = getFirestore();
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.allRewards = [];
        this.filteredRewards = [];
        this.selectedRewards = new Set();
        this.filters = {
            search: '',
            status: '',
            amount: '',
            period: ''
        };
        this.init();
    }

    async init() {
        this.waitForAuth();
        this.setupEventListeners();
    }

    waitForAuth() {
        const checkAuth = () => {
            if (window.trackingCarAuth && window.trackingCarAuth.getCurrentAdmin()) {
                this.loadRewards();
            } else {
                setTimeout(checkAuth, 100);
            }
        };
        checkAuth();
    }

    setupEventListeners() {
        // Recherche avec debounce
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', 
                TrackingCarUtils.debounce(() => this.handleFilterChange(), 300)
            );
        }

        // Filtres
        ['statusFilter', 'amountFilter', 'periodFilter'].forEach(filterId => {
            const element = document.getElementById(filterId);
            if (element) {
                element.addEventListener('change', () => this.handleFilterChange());
            }
        });

        // Actions
        document.getElementById('exportRewardsBtn')?.addEventListener('click', () => {
            this.exportRewards();
        });

        document.getElementById('generateReportBtn')?.addEventListener('click', () => {
            this.generateFinancialReport();
        });

        // Sélection
        document.getElementById('selectAll')?.addEventListener('change', (e) => {
            this.toggleSelectAll(e.target.checked);
        });

        // Actions de groupe
        document.getElementById('approveSelectedBtn')?.addEventListener('click', () => {
            this.processSelectedRewards('approved');
        });

        document.getElementById('rejectSelectedBtn')?.addEventListener('click', () => {
            this.processSelectedRewards('rejected');
        });

        document.getElementById('markPaidSelectedBtn')?.addEventListener('click', () => {
            this.processSelectedRewards('paid');
        });

        // Modal
        document.getElementById('closeRewardModalBtn')?.addEventListener('click', () => {
            this.closeRewardModal();
        });

        // Pagination
        document.getElementById('prevPageBtn')?.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.displayRewards();
            }
        });

        document.getElementById('nextPageBtn')?.addEventListener('click', () => {
            const totalPages = Math.ceil(this.filteredRewards.length / this.itemsPerPage);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.displayRewards();
            }
        });

        // UI
        document.getElementById('sidebarToggle')?.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('-translate-x-full');
        });

        document.getElementById('userMenuBtn')?.addEventListener('click', () => {
            document.getElementById('userDropdown').classList.toggle('hidden');
        });

        document.getElementById('notificationsBtn')?.addEventListener('click', () => {
            document.getElementById('notificationsDropdown').classList.toggle('hidden');
        });
    }

    async loadRewards() {
        try {
            document.getElementById('loadingState').style.display = 'block';
            document.getElementById('emptyState').style.display = 'none';

            const auth = window.trackingCarAuth;
            let rewardsQuery = collection(this.db, 'rewards');

            // Filtrer par légion si admin de légion
            if (!auth.isGlobalAdmin()) {
                const legion = auth.getLegion();
                if (legion) {
                    rewardsQuery = query(rewardsQuery, where('legion', '==', legion));
                }
            }

            // Exclure les exemples et ordonner par date
            rewardsQuery = query(
                rewardsQuery, 
                where('is_example', '!=', true),
                orderBy('created_at', 'desc')
            );

            const snapshot = await getDocs(rewardsQuery);
            
            this.allRewards = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            this.filteredRewards = [...this.allRewards];

            document.getElementById('loadingState').style.display = 'none';
            
            if (this.allRewards.length === 0) {
                document.getElementById('emptyState').style.display = 'block';
            } else {
                this.displayRewards();
                this.updateStats();
            }

        } catch (error) {
            console.error('Erreur chargement récompenses:', error);
            TrackingCarUtils.showNotification('Erreur lors du chargement des récompenses', 'error');
        }
    }

    updateStats() {
        const pendingRewards = this.allRewards.filter(r => r.status === 'pending').length;
        const approvedRewards = this.allRewards.filter(r => r.status === 'approved').length;
        const paidRewards = this.allRewards.filter(r => r.status === 'paid').length;
        const totalAmount = this.allRewards
            .filter(r => r.status === 'paid')
            .reduce((sum, r) => sum + (r.amount || 0), 0);

        document.getElementById('pendingRewards').textContent = pendingRewards;
        document.getElementById('approvedRewards').textContent = approvedRewards;
        document.getElementById('paidRewards').textContent = paidRewards;
        document.getElementById('totalAmount').textContent = TrackingCarUtils.formatCurrency(totalAmount);
    }

    handleFilterChange() {
        this.filters.search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        this.filters.status = document.getElementById('statusFilter')?.value || '';
        this.filters.amount = document.getElementById('amountFilter')?.value || '';
        this.filters.period = document.getElementById('periodFilter')?.value || '';

        this.applyFilters();
        this.currentPage = 1;
        this.displayRewards();
    }

    applyFilters() {
        this.filteredRewards = this.allRewards.filter(reward => {
            // Filtre de recherche
            if (this.filters.search) {
                const searchText = this.filters.search;
                const matchFields = [
                    reward.detector_name,
                    reward.detector_email,
                    reward.vehicle_info?.license_plate,
                    reward.vehicle_info?.make,
                    reward.vehicle_info?.model
                ].filter(Boolean).join(' ').toLowerCase();

                if (!matchFields.includes(searchText)) {
                    return false;
                }
            }

            // Filtre de statut
            if (this.filters.status && reward.status !== this.filters.status) {
                return false;
            }

            // Filtre de montant
            if (this.filters.amount) {
                const amount = reward.amount || 0;
                const [min, max] = this.filters.amount.includes('-') 
                    ? this.filters.amount.split('-').map(Number)
                    : [100000, Infinity];
                
                if (this.filters.amount === '100000+') {
                    if (amount < 100000) return false;
                } else {
                    if (amount < min || amount > max) return false;
                }
            }

            // Filtre de période
            if (this.filters.period && reward.created_at) {
                const rewardDate = reward.created_at.toDate();
                const now = new Date();
                
                switch (this.filters.period) {
                    case 'today':
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        if (rewardDate < today) return false;
                        break;
                    case 'week':
                        const weekAgo = new Date();
                        weekAgo.setDate(weekAgo.getDate() - 7);
                        if (rewardDate < weekAgo) return false;
                        break;
                    case 'month':
                        const monthAgo = new Date();
                        monthAgo.setDate(monthAgo.getDate() - 30);
                        if (rewardDate < monthAgo) return false;
                        break;
                }
            }

            return true;
        });
    }

    displayRewards() {
        const container = document.getElementById('rewardsList');
        if (!container) return;

        // Calculer la pagination
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const rewardsToShow = this.filteredRewards.slice(startIndex, endIndex);

        if (rewardsToShow.length === 0 && this.filteredRewards.length > 0) {
            this.currentPage = 1;
            this.displayRewards();
            return;
        }

        if (rewardsToShow.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-search text-4xl text-gray-300 mb-4"></i>
                    <p class="text-gray-500">Aucune récompense ne correspond à vos critères</p>
                </div>
            `;
            document.getElementById('pagination').classList.add('hidden');
            return;
        }

        // Afficher les récompenses
        container.innerHTML = rewardsToShow.map((reward, index) => 
            this.createRewardCard(reward, startIndex + index)
        ).join('');

        // Mettre à jour la pagination
        this.updatePagination();
        
        // Mettre à jour la sélection
        this.updateSelection();
    }

    createRewardCard(reward, index) {
        const statusInfo = TrackingCarUtils.getRewardStatusInfo(reward.status);
        const isSelected = this.selectedRewards.has(reward.id);
        
        return `
            <div class="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-all duration-300 bg-white slide-in-right ${isSelected ? 'ring-2 ring-blue-500' : ''}" 
                 style="animation-delay: ${index * 50}ms">
                
                <!-- Header avec sélection -->
                <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center space-x-3">
                        <input type="checkbox" 
                               class="reward-checkbox form-checkbox" 
                               data-reward-id="${reward.id}"
                               ${isSelected ? 'checked' : ''}
                               onchange="rewardsManager.toggleRewardSelection('${reward.id}')">
                        
                        <div class="w-12 h-12 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-full flex items-center justify-center">
                            <i class="fas fa-gift text-white text-lg"></i>
                        </div>
                        
                        <div>
                            <h3 class="font-semibold text-gray-900">${reward.detector_name || 'Détecteur anonyme'}</h3>
                            <p class="text-sm text-gray-600">${reward.detector_email || 'Email non défini'}</p>
                            <div class="flex items-center space-x-2 mt-1">
                                <span class="status-badge ${statusInfo.bgColor} ${statusInfo.textColor} text-xs">
                                    <i class="${statusInfo.icon} mr-1"></i>
                                    ${statusInfo.text}
                                </span>
                                <span class="text-lg font-bold text-green-600">
                                    ${TrackingCarUtils.formatCurrency(reward.amount || 0)}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="text-right text-sm text-gray-500">
                        <div>${TrackingCarUtils.formatDate(reward.created_at)}</div>
                        ${reward.region && reward.legion ? `
                            <div class="mt-1">
                                <i class="fas fa-map-marker-alt mr-1"></i>
                                ${TrackingCarUtils.getLegionName(reward.legion)}
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Informations du véhicule -->
                <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                    <h4 class="font-medium text-red-900 mb-2">
                        <i class="fas fa-car mr-1"></i>
                        Véhicule volé détecté
                    </h4>
                    <div class="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <span class="text-red-700">Marque:</span>
                            <span class="ml-2 font-medium">${reward.vehicle_info?.make || 'N/A'}</span>
                        </div>
                        <div>
                            <span class="text-red-700">Modèle:</span>
                            <span class="ml-2 font-medium">${reward.vehicle_info?.model || 'N/A'}</span>
                        </div>
                        <div>
                            <span class="text-red-700">Plaque:</span>
                            <span class="ml-2 font-medium">${reward.vehicle_info?.license_plate || 'N/A'}</span>
                        </div>
                        <div>
                            <span class="text-red-700">Couleur:</span>
                            <span class="ml-2 font-medium">${reward.vehicle_info?.color || 'N/A'}</span>
                        </div>
                    </div>
                </div>

                <!-- Informations de détection -->
                <div class="bg-gray-50 rounded-lg p-3 mb-4">
                    <div class="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <span class="text-gray-600">Date de détection:</span>
                            <span class="ml-2 font-medium">${TrackingCarUtils.formatDate(reward.detection_date)}</span>
                        </div>
                        ${reward.detection_location ? `
                            <div>
                                <span class="text-gray-600">Lieu:</span>
                                <span class="ml-2 font-medium">${reward.detection_location.address || 'Coordonnées GPS'}</span>
                            </div>
                        ` : ''}
                        ${reward.verified_by ? `
                            <div>
                                <span class="text-gray-600">Vérifié par:</span>
                                <span class="ml-2 font-medium">${reward.verified_by}</span>
                            </div>
                        ` : ''}
                        ${reward.processed_by ? `
                            <div>
                                <span class="text-gray-600">Traité par:</span>
                                <span class="ml-2 font-medium">${reward.processed_by}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Actions individuelles -->
                <div class="flex justify-end space-x-2">
                    ${reward.status === 'pending' ? `
                        <button onclick="rewardsManager.approveReward('${reward.id}')" 
                                class="btn text-sm bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1">
                            <i class="fas fa-check mr-1"></i>Approuver
                        </button>
                        <button onclick="rewardsManager.rejectReward('${reward.id}')" 
                                class="btn text-sm bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1">
                            <i class="fas fa-times mr-1"></i>Rejeter
                        </button>
                    ` : ''}
                    
                    ${reward.status === 'approved' ? `
                        <button onclick="rewardsManager.markAsPaid('${reward.id}')" 
                                class="btn text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1">
                            <i class="fas fa-money-bill-wave mr-1"></i>Marquer payée
                        </button>
                    ` : ''}
                    
                    <button onclick="rewardsManager.viewRewardDetails('${reward.id}')" 
                            class="btn text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1">
                        <i class="fas fa-eye mr-1"></i>Détails complets
                    </button>
                </div>
            </div>
        `;
    }

    updatePagination() {
        const totalPages = Math.ceil(this.filteredRewards.length / this.itemsPerPage);
        const pagination = document.getElementById('pagination');
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');
        const pageNumbers = document.getElementById('pageNumbers');
        
        if (totalPages <= 1) {
            pagination.classList.add('hidden');
            return;
        }

        pagination.classList.remove('hidden');

        // Update page info
        const startItem = (this.currentPage - 1) * this.itemsPerPage + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, this.filteredRewards.length);
        
        document.getElementById('pageStart').textContent = startItem;
        document.getElementById('pageEnd').textContent = endItem;
        document.getElementById('totalItems').textContent = this.filteredRewards.length;

        // Update buttons
        prevBtn.disabled = this.currentPage === 1;
        nextBtn.disabled = this.currentPage === totalPages;

        // Generate page numbers
        pageNumbers.innerHTML = '';
        for (let i = 1; i <= Math.min(totalPages, 5); i++) {
            const button = document.createElement('button');
            button.className = `px-3 py-1 text-sm border rounded ${
                i === this.currentPage 
                    ? 'bg-blue-600 text-white border-blue-600' 
                    : 'border-gray-300 hover:bg-gray-50'
            }`;
            button.textContent = i;
            button.onclick = () => {
                this.currentPage = i;
                this.displayRewards();
            };
            pageNumbers.appendChild(button);
        }
    }

    toggleRewardSelection(rewardId) {
        if (this.selectedRewards.has(rewardId)) {
            this.selectedRewards.delete(rewardId);
        } else {
            this.selectedRewards.add(rewardId);
        }
        this.updateSelection();
    }

    toggleSelectAll(checked) {
        if (checked) {
            this.filteredRewards.forEach(reward => {
                this.selectedRewards.add(reward.id);
            });
        } else {
            this.selectedRewards.clear();
        }
        this.updateSelection();
    }

    updateSelection() {
        // Mettre à jour les checkboxes
        document.querySelectorAll('.reward-checkbox').forEach(checkbox => {
            const rewardId = checkbox.dataset.rewardId;
            checkbox.checked = this.selectedRewards.has(rewardId);
        });

        // Mettre à jour le select all
        const selectAllCheckbox = document.getElementById('selectAll');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = this.selectedRewards.size === this.filteredRewards.length;
            selectAllCheckbox.indeterminate = this.selectedRewards.size > 0 && this.selectedRewards.size < this.filteredRewards.length;
        }

        // Afficher/cacher les actions de groupe
        const groupActions = document.getElementById('groupActions');
        const selectedCount = document.getElementById('selectedCount');
        
        if (this.selectedRewards.size > 0) {
            groupActions.classList.remove('hidden');
            selectedCount.textContent = this.selectedRewards.size;
        } else {
            groupActions.classList.add('hidden');
        }
    }

    async approveReward(rewardId) {
        const confirmed = await TrackingCarUtils.showConfirmation(
            'Approuver la récompense',
            'Êtes-vous sûr de vouloir approuver cette récompense ?',
            'Approuver',
            'Annuler'
        );

        if (!confirmed) return;

        try {
            await this.updateRewardStatus(rewardId, 'approved');
            TrackingCarUtils.showNotification('Récompense approuvée avec succès', 'success');
        } catch (error) {
            TrackingCarUtils.showNotification('Erreur lors de l\'approbation', 'error');
        }
    }

    async rejectReward(rewardId) {
        const confirmed = await TrackingCarUtils.showConfirmation(
            'Rejeter la récompense',
            'Êtes-vous sûr de vouloir rejeter cette récompense ? Cette action est irréversible.',
            'Rejeter',
            'Annuler'
        );

        if (!confirmed) return;

        try {
            await this.updateRewardStatus(rewardId, 'rejected');
            TrackingCarUtils.showNotification('Récompense rejetée', 'warning');
        } catch (error) {
            TrackingCarUtils.showNotification('Erreur lors du rejet', 'error');
        }
    }

    async markAsPaid(rewardId) {
        const confirmed = await TrackingCarUtils.showConfirmation(
            'Marquer comme payée',
            'Confirmez-vous que cette récompense a été payée au détecteur ?',
            'Oui, payée',
            'Annuler'
        );

        if (!confirmed) return;

        try {
            await this.updateRewardStatus(rewardId, 'paid');
            TrackingCarUtils.showNotification('Récompense marquée comme payée', 'success');
        } catch (error) {
            TrackingCarUtils.showNotification('Erreur lors de la mise à jour', 'error');
        }
    }

    async updateRewardStatus(rewardId, newStatus) {
        const auth = window.trackingCarAuth;
        const adminData = auth.getAdminData();

        await updateDoc(doc(this.db, 'rewards', rewardId), {
            status: newStatus,
            [`${newStatus}_at`]: Timestamp.now(),
            [`${newStatus}_by`]: adminData?.email || auth.getCurrentAdmin()?.email,
            updated_at: Timestamp.now()
        });

        // Log de l'action
        await this.logAction('REWARD_STATUS_CHANGED', {
            rewardId: rewardId,
            newStatus: newStatus,
            changedBy: adminData?.email || auth.getCurrentAdmin()?.email
        });

        // Recharger les données
        await this.loadRewards();
    }

    async processSelectedRewards(newStatus) {
        if (this.selectedRewards.size === 0) return;

        const confirmed = await TrackingCarUtils.showConfirmation(
            `Traitement par lot`,
            `Êtes-vous sûr de vouloir ${newStatus === 'approved' ? 'approuver' : newStatus === 'rejected' ? 'rejeter' : 'marquer comme payées'} ${this.selectedRewards.size} récompense(s) ?`,
            'Confirmer',
            'Annuler'
        );

        if (!confirmed) return;

        try {
            TrackingCarUtils.showLoading(true, 'Traitement en cours...');

            const promises = Array.from(this.selectedRewards).map(rewardId => 
                this.updateRewardStatus(rewardId, newStatus)
            );

            await Promise.all(promises);

            this.selectedRewards.clear();
            this.updateSelection();

            TrackingCarUtils.showNotification(
                `${this.selectedRewards.size} récompense(s) traitée(s) avec succès`,
                'success'
            );

        } catch (error) {
            TrackingCarUtils.showNotification('Erreur lors du traitement par lot', 'error');
        } finally {
            TrackingCarUtils.showLoading(false);
        }
    }

    viewRewardDetails(rewardId) {
        const reward = this.allRewards.find(r => r.id === rewardId);
        if (!reward) return;

        const modal = document.getElementById('rewardModal');
        const modalContent = document.getElementById('rewardModalContent');
        
        if (!modal || !modalContent) return;

        const statusInfo = TrackingCarUtils.getRewardStatusInfo(reward.status);

        modalContent.innerHTML = `
            <div class="space-y-6">
                <!-- En-tête de la récompense -->
                <div class="text-center">
                    <div class="w-16 h-16 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-gift text-white text-2xl"></i>
                    </div>
                    <h4 class="text-xl font-bold text-gray-900">${TrackingCarUtils.formatCurrency(reward.amount || 0)}</h4>
                    <span class="status-badge ${statusInfo.bgColor} ${statusInfo.textColor}">
                        <i class="${statusInfo.icon} mr-1"></i>
                        ${statusInfo.text}
                    </span>
                </div>

                <!-- Informations du détecteur -->
                <div>
                    <h5 class="font-semibold text-gray-900 mb-3">Informations du détecteur</h5>
                    <div class="bg-gray-50 rounded-lg p-4">
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span class="text-gray-600">Nom:</span>
                                <span class="ml-2 font-medium">${reward.detector_name || 'N/A'}</span>
                            </div>
                            <div>
                                <span class="text-gray-600">Email:</span>
                                <span class="ml-2 font-medium">${reward.detector_email || 'N/A'}</span>
                            </div>
                            <div class="col-span-2">
                                <span class="text-gray-600">ID Détecteur:</span>
                                <span class="ml-2 font-mono text-xs">${reward.detector_id || 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Détails du véhicule volé -->
                <div>
                    <h5 class="font-semibold text-gray-900 mb-3">Véhicule volé détecté</h5>
                    <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span class="text-red-700">Marque:</span>
                                <span class="ml-2 font-medium">${reward.vehicle_info?.make || 'N/A'}</span>
                            </div>
                            <div>
                                <span class="text-red-700">Modèle:</span>
                                <span class="ml-2 font-medium">${reward.vehicle_info?.model || 'N/A'}</span>
                            </div>
                            <div>
                                <span class="text-red-700">Année:</span>
                                <span class="ml-2 font-medium">${reward.vehicle_info?.year || 'N/A'}</span>
                            </div>
                            <div>
                                <span class="text-red-700">Couleur:</span>
                                <span class="ml-2 font-medium">${reward.vehicle_info?.color || 'N/A'}</span>
                            </div>
                            <div class="col-span-2">
                                <span class="text-red-700">Plaque d'immatriculation:</span>
                                <span class="ml-2 font-medium">${reward.vehicle_info?.license_plate || 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Informations de la détection -->
                <div>
                    <h5 class="font-semibold text-gray-900 mb-3">Détails de la détection</h5>
                    <div class="space-y-3 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-600">Date de détection:</span>
                            <span class="font-medium">${TrackingCarUtils.formatDate(reward.detection_date)}</span>
                        </div>
                        ${reward.detection_location ? `
                            <div class="flex justify-between">
                                <span class="text-gray-600">Lieu de détection:</span>
                                <span class="font-medium">${reward.detection_location.address || 'Coordonnées GPS'}</span>
                            </div>
                        ` : ''}
                        <div class="flex justify-between">
                            <span class="text-gray-600">Légion responsable:</span>
                            <span class="font-medium">${TrackingCarUtils.getLegionName(reward.legion)}</span>
                        </div>
                    </div>
                </div>

                <!-- Historique de traitement -->
                <div>
                    <h5 class="font-semibold text-gray-900 mb-3">Historique de traitement</h5>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-600">Créée le:</span>
                            <span class="font-medium">${TrackingCarUtils.formatDate(reward.created_at)}</span>
                        </div>
                        ${reward.verified_by ? `
                            <div class="flex justify-between">
                                <span class="text-gray-600">Vérifiée par:</span>
                                <span class="font-medium">${reward.verified_by}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Vérifiée le:</span>
                                <span class="font-medium">${TrackingCarUtils.formatDate(reward.verified_at)}</span>
                            </div>
                        ` : ''}
                        ${reward.approved_by ? `
                            <div class="flex justify-between">
                                <span class="text-gray-600">Approuvée par:</span>
                                <span class="font-medium">${reward.approved_by}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Approuvée le:</span>
                                <span class="font-medium">${TrackingCarUtils.formatDate(reward.approved_at)}</span>
                            </div>
                        ` : ''}
                        ${reward.paid_by ? `
                            <div class="flex justify-between">
                                <span class="text-gray-600">Payée par:</span>
                                <span class="font-medium">${reward.paid_by}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Payée le:</span>
                                <span class="font-medium">${TrackingCarUtils.formatDate(reward.paid_at)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Actions rapides -->
                <div class="border-t pt-4">
                    <div class="flex flex-wrap gap-2">
                        ${reward.status === 'pending' ? `
                            <button onclick="rewardsManager.approveReward('${reward.id}'); rewardsManager.closeRewardModal();" 
                                    class="btn btn-success text-sm">
                                <i class="fas fa-check mr-1"></i>Approuver
                            </button>
                            <button onclick="rewardsManager.rejectReward('${reward.id}'); rewardsManager.closeRewardModal();" 
                                    class="btn btn-error text-sm">
                                <i class="fas fa-times mr-1"></i>Rejeter
                            </button>
                        ` : ''}
                        
                        ${reward.status === 'approved' ? `
                            <button onclick="rewardsManager.markAsPaid('${reward.id}'); rewardsManager.closeRewardModal();" 
                                    class="btn btn-primary text-sm">
                                <i class="fas fa-money-bill-wave mr-1"></i>Marquer payée
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
    }

    closeRewardModal() {
        document.getElementById('rewardModal').classList.add('hidden');
    }

    async generateFinancialReport() {
        try {
            TrackingCarUtils.showLoading(true, 'Génération du rapport...');

            // Calculer les statistiques financières
            const stats = {
                totalPending: this.allRewards.filter(r => r.status === 'pending').length,
                totalApproved: this.allRewards.filter(r => r.status === 'approved').length,
                totalPaid: this.allRewards.filter(r => r.status === 'paid').length,
                totalRejected: this.allRewards.filter(r => r.status === 'rejected').length,
                amountPending: this.allRewards.filter(r => r.status === 'pending').reduce((sum, r) => sum + (r.amount || 0), 0),
                amountApproved: this.allRewards.filter(r => r.status === 'approved').reduce((sum, r) => sum + (r.amount || 0), 0),
                amountPaid: this.allRewards.filter(r => r.status === 'paid').reduce((sum, r) => sum + (r.amount || 0), 0),
                amountTotal: this.allRewards.reduce((sum, r) => sum + (r.amount || 0), 0)
            };

            const reportData = [
                { 'Statut': 'En attente', 'Nombre': stats.totalPending, 'Montant (FCFA)': stats.amountPending },
                { 'Statut': 'Approuvées', 'Nombre': stats.totalApproved, 'Montant (FCFA)': stats.amountApproved },
                { 'Statut': 'Payées', 'Nombre': stats.totalPaid, 'Montant (FCFA)': stats.amountPaid },
                { 'Statut': 'Rejetées', 'Nombre': stats.totalRejected, 'Montant (FCFA)': 0 },
                { 'Statut': 'TOTAL', 'Nombre': this.allRewards.length, 'Montant (FCFA)': stats.amountTotal }
            ];

            // Créer le CSV
            const csvContent = this.convertToCSV(reportData);
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            
            // Télécharger le fichier
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `rapport_financier_recompenses_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            TrackingCarUtils.showNotification('Rapport financier généré avec succès', 'success');

        } catch (error) {
            console.error('Erreur génération rapport:', error);
            TrackingCarUtils.showNotification('Erreur lors de la génération du rapport', 'error');
        } finally {
            TrackingCarUtils.showLoading(false);
        }
    }

    async exportRewards() {
        try {
            TrackingCarUtils.showLoading(true, 'Préparation de l\'export...');

            const dataToExport = this.filteredRewards.map(reward => ({
                'ID Récompense': reward.id,
                'Détecteur': reward.detector_name || 'N/A',
                'Email': reward.detector_email || 'N/A',
                'Montant (FCFA)': reward.amount || 0,
                'Statut': TrackingCarUtils.getRewardStatusInfo(reward.status).text,
                'Date création': TrackingCarUtils.formatDate(reward.created_at, { year: 'numeric', month: '2-digit', day: '2-digit' }),
                'Date détection': TrackingCarUtils.formatDate(reward.detection_date, { year: 'numeric', month: '2-digit', day: '2-digit' }),
                'Véhicule marque': reward.vehicle_info?.make || 'N/A',
                'Véhicule modèle': reward.vehicle_info?.model || 'N/A',
                'Plaque': reward.vehicle_info?.license_plate || 'N/A',
                'Légion': TrackingCarUtils.getLegionName(reward.legion),
                'Approuvée par': reward.approved_by || 'N/A',
                'Payée par': reward.paid_by || 'N/A'
            }));

            // Créer le CSV
            const csvContent = this.convertToCSV(dataToExport);
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            
            // Télécharger le fichier
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `recompenses_tracking_car_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            TrackingCarUtils.showNotification('Export réalisé avec succès', 'success');

        } catch (error) {
            console.error('Erreur export:', error);
            TrackingCarUtils.showNotification('Erreur lors de l\'export', 'error');
        } finally {
            TrackingCarUtils.showLoading(false);
        }
    }

    convertToCSV(data) {
        if (data.length === 0) return '';

        const headers = Object.keys(data[0]);
        const csvRows = [];

        // En-têtes
        csvRows.push(headers.join(','));

        // Données
        for (const row of data) {
            const values = headers.map(header => {
                const value = row[header] || '';
                return `"${value.toString().replace(/"/g, '""')}"`;
            });
            csvRows.push(values.join(','));
        }

        return csvRows.join('\n');
    }

    async logAction(action, details) {
        try {
            const auth = window.trackingCarAuth;
            const adminData = auth.getAdminData();

            await addDoc(collection(this.db, 'admin_logs'), {
                timestamp: Timestamp.now(),
                adminId: adminData?.id || 'unknown',
                adminEmail: auth.getCurrentAdmin()?.email || 'unknown',
                action: action,
                details: details,
                ipAddress: 'web-interface',
                userAgent: navigator.userAgent,
                level: 'INFO',
                category: 'REWARDS'
            });
        } catch (error) {
            console.error('Erreur log action:', error);
        }
    }
}

// Initialiser la gestion des récompenses
document.addEventListener('DOMContentLoaded', () => {
    window.rewardsManager = new RewardsManager();
});