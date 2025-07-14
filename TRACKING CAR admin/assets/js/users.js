import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

class UsersManager {
    constructor() {
        this.db = window.firebaseDb || getFirestore();
        this.currentPage = 1;
        this.itemsPerPage = 12;
        this.allUsers = [];
        this.filteredUsers = [];
        this.userDetections = new Map();
        this.filters = {
            search: '',
            platform: '',
            activity: ''
        };
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.loadUsers();
    }

    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', 
                TrackingCarUtils.debounce(() => this.handleFilterChange(), 300)
            );
        }
        ['platformFilter', 'activityFilter'].forEach(filterId => {
            const element = document.getElementById(filterId);
            if (element) {
                element.addEventListener('change', () => this.handleFilterChange());
            }
        });
        document.getElementById('clearFiltersBtn')?.addEventListener('click', () => this.clearFilters());
        document.getElementById('exportUsersBtn')?.addEventListener('click', () => this.exportUsers());
        document.getElementById('closeUserModalBtn')?.addEventListener('click', () => this.closeUserModal());
        document.getElementById('prevPageBtn')?.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.displayUsers();
            }
        });
        document.getElementById('nextPageBtn')?.addEventListener('click', () => {
            const totalPages = Math.ceil(this.filteredUsers.length / this.itemsPerPage);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.displayUsers();
            }
        });
        document.getElementById('sidebarToggle')?.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('-translate-x-full');
        });
        document.getElementById('userMenuBtn')?.addEventListener('click', () => {
            document.getElementById('userDropdown').classList.toggle('hidden');
        });
    }

   async loadUsers() {
    try {
        document.getElementById('loadingState').style.display = 'block';
        document.getElementById('emptyState').style.display = 'none';

        // Charger tous les checks (toutes les recherches faites par les utilisateurs)
        const checksSnap = await getDocs(collection(this.db, 'vehicle_checks'));
        const checks = checksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Grouper par utilisateur
        const userMap = new Map();
        checks.forEach(c => {
            const id = c.user_id || 'inconnu';
            if (!userMap.has(id)) {
                userMap.set(id, {
                    id,
                    displayName: c.user_name || '',
                    email: c.user_email || '',
                    createdAt: c.check_date?.seconds ? new Date(c.check_date.seconds * 1000) : null,
                    lastActive: c.check_date?.seconds ? new Date(c.check_date.seconds * 1000) : null,
                    checks: []
                });
            }
            const user = userMap.get(id);
            user.checks.push(c);
            // Mettre à jour la dernière activité
            const checkDate = c.check_date?.seconds ? new Date(c.check_date.seconds * 1000) : null;
            if (checkDate && (!user.lastActive || checkDate > user.lastActive)) {
                user.lastActive = checkDate;
            }
            // Mettre à jour la date de création (premier check)
            if (checkDate && (!user.createdAt || checkDate < user.createdAt)) {
                user.createdAt = checkDate;
            }
        });

        this.allUsers = Array.from(userMap.values());
        // Pour compatibilité avec le reste du code
        this.userDetections = new Map(this.allUsers.map(u => [u.id, u.checks]));

        this.filteredUsers = [...this.allUsers];

        document.getElementById('loadingState').style.display = 'none';
        if (this.allUsers.length === 0) {
            document.getElementById('emptyState').style.display = 'block';
        } else {
            this.displayUsers();
            this.updateResultsCount();
            this.updateStats();
        }
    } catch (error) {
        console.error('Erreur chargement utilisateurs:', error);
        TrackingCarUtils.showNotification('Erreur lors du chargement des utilisateurs', 'error');
    }
}

    updateStats() {
        const totalUsers = this.allUsers.length;
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        const activeUsers = this.allUsers.filter(user => user.lastActive && user.lastActive >= oneWeekAgo).length;
        const usersWithDetections = this.allUsers.filter(user => (user.checks?.length || 0) > 0).length;
        const newUsersThisMonth = this.allUsers.filter(user => user.createdAt && user.createdAt >= oneMonthAgo).length;

        document.getElementById('totalUsers').textContent = totalUsers;
        document.getElementById('activeUsers').textContent = activeUsers;
        document.getElementById('usersWithDetections').textContent = usersWithDetections;
        document.getElementById('newUsersThisMonth').textContent = newUsersThisMonth;
    }

    handleFilterChange() {
        this.filters.search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        this.filters.platform = document.getElementById('platformFilter')?.value || '';
        this.filters.activity = document.getElementById('activityFilter')?.value || '';
        this.applyFilters();
        this.currentPage = 1;
        this.displayUsers();
        this.updateResultsCount();
    }

    applyFilters() {
        this.filteredUsers = this.allUsers.filter(user => {
            // Recherche
            if (this.filters.search) {
                const searchText = this.filters.search;
                const matchFields = [
                    user.displayName,
                    user.email,
                    user.id
                ].filter(Boolean).join(' ').toLowerCase();
                if (!matchFields.includes(searchText)) return false;
            }
            // Plateforme
            if (this.filters.platform) {
                const platform = user.platform?.toLowerCase();
                if (platform !== this.filters.platform) return false;
            }
            // Activité
            if (this.filters.activity) {
                const now = new Date();
                const lastActive = user.lastActive;
                const createdAt = user.createdAt || user.lastLoginAt;
                switch (this.filters.activity) {
                    case 'active':
                        const oneWeekAgo = new Date();
                        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                        if (!lastActive || lastActive < oneWeekAgo) return false;
                        break;
                    case 'inactive':
                        const oneWeekAgoInactive = new Date();
                        oneWeekAgoInactive.setDate(oneWeekAgoInactive.getDate() - 7);
                        if (lastActive && lastActive >= oneWeekAgoInactive) return false;
                        break;
                    case 'new':
                        const oneMonthAgo = new Date();
                        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
                        if (!createdAt || createdAt < oneMonthAgo) return false;
                        break;
                }
            }
            return true;
        });
    }

    displayUsers() {
        const container = document.getElementById('usersList');
        if (!container) return;
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const usersToShow = this.filteredUsers.slice(startIndex, endIndex);

        if (usersToShow.length === 0 && this.filteredUsers.length > 0) {
            this.currentPage = 1;
            this.displayUsers();
            return;
        }
        if (usersToShow.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-search text-4xl text-gray-300 mb-4"></i>
                    <p class="text-gray-500 mb-4">Aucun utilisateur ne correspond à vos critères</p>
                    <button onclick="document.getElementById('clearFiltersBtn').click()" class="btn btn-primary">
                        Effacer les filtres
                    </button>
                </div>
            `;
            document.getElementById('pagination').classList.add('hidden');
            return;
        }
        container.innerHTML = usersToShow.map((user, index) => this.createUserCard(user, startIndex + index)).join('');
        this.updatePagination();
    }

    createUserCard(user, index) {
       const detectionCount = user.checks.length;
const stolenDetections = user.checks.filter(c => c.result === 'stolen').length;  const isActive = this.isUserActive(user);
        const activityStatus = isActive ? 
            { text: 'Actif', color: 'green', icon: 'user-check' } : 
            { text: 'Inactif', color: 'gray', icon: 'user-clock' };
        const platform = user.platform;
        const platformIcon = platform === 'android' ? 'fab fa-android' : 
                            platform === 'ios' ? 'fab fa-apple' : 'fas fa-mobile-alt';

        return `
            <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all duration-300 bg-white slide-in-right" 
                 style="animation-delay: ${index * 50}ms">
                <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center space-x-3">
                        <div class="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                            <span class="text-white font-bold text-lg">
                                ${(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                            </span>
                        </div>
                        <div>
                            <h3 class="font-semibold text-gray-900">${user.displayName || 'Utilisateur inconnu'}</h3>
                            <p class="text-sm text-gray-600">${user.email || 'Email non défini'}</p>
                            <div class="flex items-center space-x-2 mt-1">
                                <span class="status-badge bg-${activityStatus.color}-100 text-${activityStatus.color}-800 text-xs">
                                    <i class="fas fa-${activityStatus.icon} mr-1"></i>
                                    ${activityStatus.text}
                                </span>
                                ${platform ? `
                                    <span class="text-xs text-gray-500">
                                        <i class="${platformIcon} mr-1"></i>
                                        ${platform.charAt(0).toUpperCase() + platform.slice(1)}
                                    </span>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="bg-gray-50 rounded-lg p-3 mb-4">
                    <div class="grid grid-cols-3 gap-4 text-center">
                        <div>
                            <div class="text-lg font-bold text-blue-600">${detectionCount}</div>
                            <div class="text-xs text-gray-500">Détections</div>
                        </div>
                        <div>
                            <div class="text-lg font-bold text-red-600">${stolenDetections}</div>
                            <div class="text-xs text-gray-500">Véhicules volés</div>
                        </div>
                        <div>
                            <div class="text-lg font-bold text-green-600">${detectionCount - stolenDetections}</div>
                            <div class="text-xs text-gray-500">Véhicules propres</div>
                        </div>
                    </div>
                </div>
                <div class="space-y-2 text-sm text-gray-600 mb-4">
                    <div class="flex justify-between">
                        <span>Dernière activité:</span>
                        <span class="font-medium">${TrackingCarUtils.formatDate(user.lastActive, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Première connexion:</span>
                        <span class="font-medium">${TrackingCarUtils.formatDate(user.createdAt || user.lastLoginAt, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                    ${user.deviceInfo?.os_version ? `
                        <div class="flex justify-between">
                            <span>Version OS:</span>
                            <span class="font-medium">${user.deviceInfo.os_version}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="flex justify-end space-x-2">
                    <button onclick="usersManager.viewUserProfile('${user.id}')" 
                            class="btn text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1">
                        <i class="fas fa-user mr-1"></i>Profil complet
                    </button>
                    ${detectionCount > 0 ? `
                        <button onclick="usersManager.viewUserDetections('${user.id}')" 
                                class="btn text-sm bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1">
                            <i class="fas fa-search mr-1"></i>Détections (${detectionCount})
                        </button>
                    ` : ''}
                    <button onclick="usersManager.exportUserData('${user.id}')" 
                            class="btn text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1">
                        <i class="fas fa-download mr-1"></i>Export
                    </button>
                </div>
            </div>
        `;
    }

    isUserActive(user) {
        if (!user.lastActive) return false;
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        return user.lastActive >= oneWeekAgo;
    }

    updatePagination() {
        const totalPages = Math.ceil(this.filteredUsers.length / this.itemsPerPage);
        const pagination = document.getElementById('pagination');
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');
        const pageNumbers = document.getElementById('pageNumbers');
        if (totalPages <= 1) {
            pagination.classList.add('hidden');
            return;
        }
        pagination.classList.remove('hidden');
        const startItem = (this.currentPage - 1) * this.itemsPerPage + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, this.filteredUsers.length);
        document.getElementById('pageStart').textContent = startItem;
        document.getElementById('pageEnd').textContent = endItem;
        document.getElementById('totalItems').textContent = this.filteredUsers.length;
        prevBtn.disabled = this.currentPage === 1;
        nextBtn.disabled = this.currentPage === totalPages;
        pageNumbers.innerHTML = '';
        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        for (let i = startPage; i <= endPage; i++) {
            const button = document.createElement('button');
            button.className = `px-3 py-1 text-sm border rounded ${
                i === this.currentPage 
                    ? 'bg-blue-600 text-white border-blue-600' 
                    : 'border-gray-300 hover:bg-gray-50'
            }`;
            button.textContent = i;
            button.onclick = () => {
                this.currentPage = i;
                this.displayUsers();
            };
            pageNumbers.appendChild(button);
        }
    }

    updateResultsCount() {
        const resultsCount = document.getElementById('resultsCount');
        if (resultsCount) {
            resultsCount.textContent = `${this.filteredUsers.length} utilisateur(s) trouvé(s)`;
        }
    }

    clearFilters() {
        document.getElementById('searchInput').value = '';
        document.getElementById('platformFilter').value = '';
        document.getElementById('activityFilter').value = '';
        this.filters = { search: '', platform: '', activity: '' };
        this.filteredUsers = [...this.allUsers];
        this.currentPage = 1;
        this.displayUsers();
        this.updateResultsCount();
    }

    viewUserProfile(userId) {
        const user = this.allUsers.find(u => u.id === userId);
        if (!user) return;

        const userDetections = this.userDetections.get(userId) || [];
       const detectionCount = user.checks.length;
const stolenDetections = user.checks.filter(c => c.result === 'stolen').length;
        const modal = document.getElementById('userModal');
        const modalContent = document.getElementById('userModalContent');
        
        if (!modal || !modalContent) return;

        modalContent.innerHTML = `
            <div class="space-y-6">
                <!-- Informations personnelles -->
                <div>
                    <h4 class="font-semibold text-gray-900 mb-3">Informations personnelles</h4>
                    <div class="bg-gray-50 rounded-lg p-4">
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span class="text-gray-600">Nom affiché:</span>
                                <span class="ml-2 font-medium">${user.displayName || 'Non défini'}</span>
                            </div>
                            <div>
                                <span class="text-gray-600">Email:</span>
                                <span class="ml-2 font-medium">${user.email || 'Non défini'}</span>
                            </div>
                            <div>
                                <span class="text-gray-600">ID Utilisateur:</span>
                                <span class="ml-2 font-mono text-xs">${user.id}</span>
                            </div>
                            <div>
                                <span class="text-gray-600">Statut:</span>
                                <span class="ml-2 font-medium ${this.isUserActive(user) ? 'text-green-600' : 'text-gray-600'}">
                                    ${this.isUserActive(user) ? 'Actif' : 'Inactif'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Statistiques d'utilisation -->
                <div>
                    <h4 class="font-semibold text-gray-900 mb-3">Statistiques d'utilisation</h4>
                    <div class="grid grid-cols-3 gap-4">
                        <div class="bg-blue-50 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-blue-600">${detectionCount}</div>
                            <div class="text-sm text-blue-600">Total détections</div>
                        </div>
                        <div class="bg-red-50 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-red-600">${stolenDetections}</div>
                            <div class="text-sm text-red-600">Véhicules volés</div>
                        </div>
                        <div class="bg-green-50 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-green-600">${detectionCount - stolenDetections}</div>
                            <div class="text-sm text-green-600">Véhicules propres</div>
                        </div>
                    </div>
                </div>

                <!-- Activité -->
                <div>
                    <h4 class="font-semibold text-gray-900 mb-3">Activité</h4>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-600">Première connexion:</span>
                            <span class="font-medium">${TrackingCarUtils.formatDate(user.createdAt || user.lastLoginAt)}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">Dernière activité:</span>
                            <span class="font-medium">${TrackingCarUtils.formatDate(user.lastActive)}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">Dernière connexion:</span>
                            <span class="font-medium">${TrackingCarUtils.formatDate(user.lastLoginAt)}</span>
                        </div>
                    </div>
                </div>

                <!-- Informations de l'appareil -->
                ${user.deviceInfo ? `
                    <div>
                        <h4 class="font-semibold text-gray-900 mb-3">Informations de l'appareil</h4>
                        <div class="bg-gray-50 rounded-lg p-4">
                            <div class="space-y-2 text-sm">
                                ${user.deviceInfo.platform ? `
                                    <div class="flex justify-between">
                                        <span class="text-gray-600">Plateforme:</span>
                                        <span class="font-medium">${user.deviceInfo.platform}</span>
                                    </div>
                                ` : ''}
                                ${user.deviceInfo.os_version ? `
                                    <div class="flex justify-between">
                                        <span class="text-gray-600">Version OS:</span>
                                        <span class="font-medium">${user.deviceInfo.os_version}</span>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}

                <!-- Détections récentes -->
                ${userDetections.length > 0 ? `
                    <div>
                        <h4 class="font-semibold text-gray-900 mb-3">Détections récentes</h4>
                        <div class="max-h-48 overflow-y-auto space-y-2">
                            ${userDetections.slice(0, 5).map(detection => `
                                <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
                                    <div>
                                        <span class="text-sm font-medium">${detection.chassis_number ? 'Châssis' : 'Plaque'}: ${detection.chassis_number || detection.license_plate}</span>
                                        <div class="text-xs text-gray-500">${TrackingCarUtils.formatDate(detection.timestamp)}</div>
                                    </div>
                                    <span class="status-badge ${detection.result === 'stolen' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'} text-xs">
                                        ${detection.result === 'stolen' ? 'Volé' : 'Propre'}
                                    </span>
                                </div>
                            `).join('')}
                            ${userDetections.length > 5 ? `
                                <div class="text-center">
                                    <button onclick="usersManager.viewUserDetections('${userId}')" class="text-sm text-blue-600 hover:text-blue-800">
                                        Voir toutes les détections (${userDetections.length})
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                ` : ''}

                <!-- Actions -->
                <div class="border-t pt-4">
                    <div class="flex flex-wrap gap-2">
                        ${detectionCount > 0 ? `
                            <button onclick="usersManager.viewUserDetections('${userId}')" class="btn btn-primary text-sm">
                                <i class="fas fa-search mr-1"></i>Voir les détections
                            </button>
                        ` : ''}
                        <button onclick="usersManager.exportUserData('${userId}')" class="btn btn-secondary text-sm">
                            <i class="fas fa-download mr-1"></i>Exporter les données
                        </button>
                    </div>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
    }

    closeUserModal() {
        document.getElementById('userModal').classList.add('hidden');
    }

    viewUserDetections(userId) {
        // Rediriger vers la page des détections avec un filtre sur l'utilisateur
        const user = this.allUsers.find(u => u.id === userId);
        if (user) {
            window.location.href = `../detections/list.html?user=${encodeURIComponent(user.email || user.id)}`;
        }
    }

    async exportUserData(userId) {
        const user = this.allUsers.find(u => u.id === userId);
        if (!user) return;

        try {
            TrackingCarUtils.showLoading(true, 'Préparation de l\'export...');

            const userDetections = this.userDetections.get(userId) || [];
            
            // Données utilisateur
            const userData = {
                'ID Utilisateur': user.id,
                'Nom': user.displayName || 'N/A',
                'Email': user.email || 'N/A',
                'Première connexion': TrackingCarUtils.formatDate(user.createdAt || user.lastLoginAt),
                'Dernière activité': TrackingCarUtils.formatDate(user.lastActive),
                'Plateforme': user.deviceInfo?.platform || 'N/A',
                'Version OS': user.deviceInfo?.os_version || 'N/A',
                'Total détections': userDetections.length,
                'Véhicules volés détectés': userDetections.filter(d => d.result_data?.result === 'stolen').length,
                'Statut': this.isUserActive(user) ? 'Actif' : 'Inactif'
            };

            // Créer le CSV avec BOM UTF-8 et séparateur point-virgule
            const csvContent = this.convertToCSV([userData], ';');
            const BOM = '\uFEFF';
            const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
            
            // Télécharger le fichier
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `utilisateur_${user.id}_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            TrackingCarUtils.showNotification('Export utilisateur réalisé avec succès', 'success');

        } catch (error) {
            console.error('Erreur export utilisateur:', error);
            TrackingCarUtils.showNotification('Erreur lors de l\'export', 'error');
        } finally {
            TrackingCarUtils.showLoading(false);
        }
    }

    async exportUsers() {
        try {
            TrackingCarUtils.showLoading(true, 'Préparation de l\'export...');

            const dataToExport = this.filteredUsers.map(user => {
                const userDetections = this.userDetections.get(user.id) || [];
                
                return {
                    'ID Utilisateur': user.id,
                    'Nom': user.displayName || 'N/A',
                    'Email': user.email || 'N/A',
                    'Première connexion': TrackingCarUtils.formatDate(user.createdAt || user.lastLoginAt, { year: 'numeric', month: '2-digit', day: '2-digit' }),
                    'Dernière activité': TrackingCarUtils.formatDate(user.lastActive, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
                    'Plateforme': user.deviceInfo?.platform || 'N/A',
                    'Version OS': user.deviceInfo?.os_version || 'N/A',
                    'Total détections': userDetections.length,
                    'Véhicules volés détectés': userDetections.filter(d => d.result_data?.result === 'stolen').length,
                    'Véhicules propres': userDetections.filter(d => d.result_data?.result !== 'stolen').length,
                    'Statut': this.isUserActive(user) ? 'Actif' : 'Inactif'
                };
            });

            // Créer le CSV avec BOM UTF-8 et séparateur point-virgule
            const csvContent = this.convertToCSV(dataToExport, ';');
            const BOM = '\uFEFF';
            const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
            
            // Télécharger le fichier
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `utilisateurs_tracking_car_${new Date().toISOString().split('T')[0]}.csv`);
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

    convertToCSV(data, separator = ',') {
        if (data.length === 0) return '';

        const headers = Object.keys(data[0]);
        const csvRows = [];

        // En-têtes
        csvRows.push(headers.join(separator));

        // Données
        for (const row of data) {
            const values = headers.map(header => {
                const value = row[header] || '';
                return `"${value.toString().replace(/"/g, '""')}"`;
            });
            csvRows.push(values.join(separator));
        }

        return csvRows.join('\n');
    }
}

// Initialiser la gestion des utilisateurs
document.addEventListener('DOMContentLoaded', () => {
    window.usersManager = new UsersManager();
});