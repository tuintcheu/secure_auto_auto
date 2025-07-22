// Gestion des logs d'activité - TRACKING CAR
import { getFirestore, collection, query, where, getDocs, orderBy, limit, deleteDoc, doc, Timestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

class LogsManager {
    constructor() {
        this.db = getFirestore();
        this.currentPage = 1;
        this.itemsPerPage = 50;
        this.allLogs = [];
        this.filteredLogs = [];
        this.autoRefreshInterval = null;
        this.filters = {
            level: '',
            category: '',
            admin: '',
            period: 'week',
            actionSearch: '',
            detailsSearch: ''
        };
        this.init();
    }

    async init() {
        // Contrôle d'accès centralisé : seuls les admins globaux ont accès à cette page
        const admin = window.checkAccessForAdmin();
        if (!admin || admin.role !== 'global_admin') {
            alert('Accès réservé aux administrateurs globaux.');
            window.location.href = '/dashboard.html';
            throw new Error('Accès refusé');
        }
        this.waitForAuth();
        this.setupEventListeners();
    }

    waitForAuth() {
        const checkAuth = () => {
            if (window.trackingCarAuth && window.trackingCarAuth.getCurrentAdmin()) {
                this.loadLogs();
                this.loadAdminOptions();
            } else {
                setTimeout(checkAuth, 100);
            }
        };
        checkAuth();
    }

    setupEventListeners() {
        // Filtres
        ['levelFilter', 'categoryFilter', 'adminFilter', 'periodFilter'].forEach(filterId => {
            const element = document.getElementById(filterId);
            if (element) {
                element.addEventListener('change', () => this.handleFilterChange());
            }
        });

        // Recherche avec debounce
        ['actionSearch', 'detailsSearch'].forEach(inputId => {
            const element = document.getElementById(inputId);
            if (element) {
                element.addEventListener('input', 
                    TrackingCarUtils.debounce(() => this.handleFilterChange(), 500)
                );
            }
        });

        // Actions
        document.getElementById('clearFiltersBtn')?.addEventListener('click', () => {
            this.clearFilters();
        });

        document.getElementById('refreshLogsBtn')?.addEventListener('click', () => {
            this.loadLogs();
        });

        document.getElementById('exportLogsBtn')?.addEventListener('click', () => {
            this.exportLogs();
        });

        document.getElementById('deleteOldLogsBtn')?.addEventListener('click', () => {
            this.deleteOldLogs();
        });

        // Auto-refresh
        document.getElementById('autoRefresh')?.addEventListener('change', (e) => {
            this.toggleAutoRefresh(e.target.checked);
        });

        // Modal
        document.getElementById('closeLogModalBtn')?.addEventListener('click', () => {
            this.closeLogModal();
        });

        // Pagination
        document.getElementById('prevPageBtn')?.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.displayLogs();
            }
        });

        document.getElementById('nextPageBtn')?.addEventListener('click', () => {
            const totalPages = Math.ceil(this.filteredLogs.length / this.itemsPerPage);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.displayLogs();
            }
        });

        // UI
        document.getElementById('sidebarToggle')?.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('-translate-x-full');
        });

        document.getElementById('userMenuBtn')?.addEventListener('click', () => {
            document.getElementById('userDropdown').classList.toggle('hidden');
        });
    }

    async loadAdminOptions() {
        try {
            const adminsQuery = query(collection(this.db, 'admin_users'));
            const snapshot = await getDocs(adminsQuery);
            
            const adminFilter = document.getElementById('adminFilter');
            if (!adminFilter) return;

            // Vider les options existantes (sauf la première)
            while (adminFilter.children.length > 1) {
                adminFilter.removeChild(adminFilter.lastChild);
            }

            snapshot.docs.forEach(doc => {
                const admin = doc.data();
                const option = document.createElement('option');
                option.value = admin.email;
                option.textContent = `${admin.displayName || admin.email} (${admin.role === 'global_admin' ? 'Global' : 'Légion'})`;
                adminFilter.appendChild(option);
            });

        } catch (error) {
            console.error('Erreur chargement admins:', error);
        }
    }

    async loadLogs() {
        try {
            document.getElementById('loadingLogs').style.display = 'block';

            // Construire la requête selon les permissions
            const auth = window.trackingCarAuth;
            let logsQuery = collection(this.db, 'admin_logs');

            // Pour admin de légion, ne voir que ses propres logs et ceux de sa légion
            if (!auth.isGlobalAdmin()) {
                const adminEmail = auth.getCurrentAdmin().email;
                logsQuery = query(logsQuery, where('adminEmail', '==', adminEmail));
            }

            // Ordonner par timestamp descendant et limiter
            logsQuery = query(logsQuery, orderBy('timestamp', 'desc'), limit(1000));

            const snapshot = await getDocs(logsQuery);
            
            this.allLogs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            this.applyFilters();
            document.getElementById('loadingLogs').style.display = 'none';
            
            this.displayLogs();
            this.updateStats();

        } catch (error) {
            console.error('Erreur chargement logs:', error);
            TrackingCarUtils.showNotification('Erreur lors du chargement des logs', 'error');
            document.getElementById('loadingLogs').style.display = 'none';
        }
    }

    updateStats() {
        const totalLogs = this.allLogs.length;
        
        // Logs d'aujourd'hui
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayLogs = this.allLogs.filter(log => {
            if (log.timestamp) {
                const logDate = log.timestamp.toDate();
                return logDate >= today;
            }
            return false;
        }).length;

        // Logs d'erreur (ERROR et CRITICAL)
        const errorLogs = this.allLogs.filter(log => 
            log.level === 'ERROR' || log.level === 'CRITICAL'
        ).length;

        // Admins actifs (ayant des logs dans les dernières 24h)
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);
        const activeAdmins = new Set();
        this.allLogs.forEach(log => {
            if (log.timestamp && log.timestamp.toDate() >= yesterday && log.adminEmail) {
                activeAdmins.add(log.adminEmail);
            }
        });

        // Mettre à jour l'interface
        document.getElementById('totalLogs').textContent = totalLogs;
        document.getElementById('todayLogs').textContent = todayLogs;
        document.getElementById('errorLogs').textContent = errorLogs;
        document.getElementById('activeAdmins').textContent = activeAdmins.size;
    }

    handleFilterChange() {
        this.filters.level = document.getElementById('levelFilter')?.value || '';
        this.filters.category = document.getElementById('categoryFilter')?.value || '';
        this.filters.admin = document.getElementById('adminFilter')?.value || '';
        this.filters.period = document.getElementById('periodFilter')?.value || 'week';
        this.filters.actionSearch = document.getElementById('actionSearch')?.value.toLowerCase() || '';
        this.filters.detailsSearch = document.getElementById('detailsSearch')?.value.toLowerCase() || '';

        this.applyFilters();
        this.currentPage = 1;
        this.displayLogs();
    }

    applyFilters() {
        this.filteredLogs = this.allLogs.filter(log => {
            // Filtre de niveau
            if (this.filters.level && log.level !== this.filters.level) {
                return false;
            }

            // Filtre de catégorie
            if (this.filters.category && log.category !== this.filters.category) {
                return false;
            }

            // Filtre d'admin
            if (this.filters.admin && log.adminEmail !== this.filters.admin) {
                return false;
            }

            // Filtre de période
            if (this.filters.period !== 'all' && log.timestamp) {
                const logDate = log.timestamp.toDate();
                const now = new Date();
                
                switch (this.filters.period) {
                    case 'today':
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        if (logDate < today) return false;
                        break;
                    case 'week':
                        const weekAgo = new Date();
                        weekAgo.setDate(weekAgo.getDate() - 7);
                        if (logDate < weekAgo) return false;
                        break;
                    case 'month':
                        const monthAgo = new Date();
                        monthAgo.setDate(monthAgo.getDate() - 30);
                        if (logDate < monthAgo) return false;
                        break;
                }
            }

            // Recherche dans l'action
            if (this.filters.actionSearch) {
                const action = (log.action || '').toLowerCase();
                if (!action.includes(this.filters.actionSearch)) {
                    return false;
                }
            }

            // Recherche dans les détails
            if (this.filters.detailsSearch) {
                const details = JSON.stringify(log.details || {}).toLowerCase();
                if (!details.includes(this.filters.detailsSearch)) {
                    return false;
                }
            }

            return true;
        });

        // Mettre à jour le compteur
        document.getElementById('resultsCount').textContent = `${this.filteredLogs.length} logs affichés`;
    }

    displayLogs() {
        const container = document.getElementById('logsTimeline');
        if (!container) return;

        // Calculer la pagination
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const logsToShow = this.filteredLogs.slice(startIndex, endIndex);

        if (logsToShow.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-search text-4xl text-gray-300 mb-4"></i>
                    <p class="text-gray-500 mb-4">Aucun log ne correspond à vos critères</p>
                    <button onclick="logsManager.clearFilters()" class="btn btn-primary">
                        Effacer les filtres
                    </button>
                </div>
            `;
            document.getElementById('logsPagination').classList.add('hidden');
            return;
        }

        // Afficher les logs
        container.innerHTML = logsToShow.map((log, index) => 
            this.createLogEntry(log, startIndex + index)
        ).join('');

        // Mettre à jour la pagination
        this.updatePagination();
    }

    createLogEntry(log, index) {
        const levelInfo = this.getLevelInfo(log.level);
        const timeAgo = this.getTimeAgo(log.timestamp);

        return `
            <div class="log-entry border-l-4 ${levelInfo.borderColor} bg-white p-4 mb-2 rounded-r-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                 onclick="logsManager.viewLogDetails('${log.id}')"
                 style="animation-delay: ${index * 20}ms">
                
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <div class="flex items-center space-x-2 mb-1">
                            <span class="log-level ${levelInfo.bgColor} ${levelInfo.textColor} px-2 py-1 rounded-full text-xs font-medium">
                                <i class="${levelInfo.icon} mr-1"></i>
                                ${log.level || 'INFO'}
                            </span>
                            
                            ${log.category ? `
                                <span class="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                                    ${log.category}
                                </span>
                            ` : ''}
                            
                            <span class="text-xs text-gray-500">${timeAgo}</span>
                        </div>
                        
                        <div class="log-action font-medium text-gray-900 mb-1">
                            ${this.formatAction(log.action)}
                        </div>
                        
                        <div class="log-admin text-sm text-gray-600 mb-2">
                            <i class="fas fa-user mr-1"></i>
                            ${log.adminEmail || 'Système'}
                        </div>
                        
                        ${log.details ? `
                            <div class="log-details text-sm text-gray-700 bg-gray-50 p-2 rounded">
                                ${this.formatLogDetails(log.details)}
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="text-right text-xs text-gray-400 ml-4">
                        <div>${TrackingCarUtils.formatDate(log.timestamp, { 
                            month: 'short', 
                            day: 'numeric', 
                            hour: '2-digit', 
                            minute: '2-digit',
                            second: '2-digit'
                        })}</div>
                        ${log.ipAddress ? `
                            <div class="mt-1">IP: ${log.ipAddress}</div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    getLevelInfo(level) {
        const levels = {
            'INFO': {
                borderColor: 'border-blue-400',
                bgColor: 'bg-blue-100',
                textColor: 'text-blue-800',
                icon: 'fas fa-info-circle'
            },
            'WARNING': {
                borderColor: 'border-yellow-400',
                bgColor: 'bg-yellow-100',
                textColor: 'text-yellow-800',
                icon: 'fas fa-exclamation-triangle'
            },
            'ERROR': {
                borderColor: 'border-red-400',
                bgColor: 'bg-red-100',
                textColor: 'text-red-800',
                icon: 'fas fa-times-circle'
            },
            'CRITICAL': {
                borderColor: 'border-red-600',
                bgColor: 'bg-red-200',
                textColor: 'text-red-900',
                icon: 'fas fa-exclamation-circle'
            }
        };

        return levels[level] || levels['INFO'];
    }

    getTimeAgo(timestamp) {
        if (!timestamp) return 'Temps inconnu';
        
        const now = new Date();
        const logTime = timestamp.toDate();
        const diffMs = now - logTime;
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMinutes < 1) return 'À l\'instant';
        if (diffMinutes < 60) return `${diffMinutes}m`;
        if (diffHours < 24) return `${diffHours}h`;
        if (diffDays < 7) return `${diffDays}j`;
        
        return logTime.toLocaleDateString('fr-FR', { 
            month: 'short', 
            day: 'numeric' 
        });
    }

    formatAction(action) {
        const actionLabels = {
            'LOGIN_SUCCESS': 'Connexion réussie',
            'LOGIN_FAILED': 'Échec de connexion',
            'LOGOUT': 'Déconnexion',
            'VEHICLE_CREATED': 'Véhicule ajouté',
            'VEHICLE_UPDATED': 'Véhicule modifié',
            'VEHICLE_DELETED': 'Véhicule supprimé',
            'VEHICLE_RECOVERED': 'Véhicule récupéré',
            'DETECTION_VIEWED': 'Détection consultée',
            'REWARD_APPROVED': 'Récompense approuvée',
            'REWARD_REJECTED': 'Récompense rejetée',
            'REWARD_PAID': 'Récompense payée',
            'ADMIN_CREATED': 'Admin créé',
            'ADMIN_UPDATED': 'Admin modifié',
            'ADMIN_DELETED': 'Admin supprimé',
            'ADMIN_ACTIVATED': 'Admin activé',
            'ADMIN_DEACTIVATED': 'Admin désactivé',
            'SYSTEM_BACKUP': 'Sauvegarde système',
            'SYSTEM_MAINTENANCE': 'Maintenance système'
        };

        return actionLabels[action] || action || 'Action inconnue';
    }

    formatLogDetails(details) {
        if (!details || typeof details !== 'object') {
            return 'Aucun détail disponible';
        }

        // Formater les détails de manière lisible
        const formatted = Object.entries(details)
            .filter(([key, value]) => value !== null && value !== undefined && value !== '')
            .map(([key, value]) => {
                let displayKey = key.replace(/([A-Z])/g, ' $1').toLowerCase();
                displayKey = displayKey.charAt(0).toUpperCase() + displayKey.slice(1);
                
                let displayValue = value;
                if (typeof value === 'object') {
                    displayValue = JSON.stringify(value);
                }
                
                return `${displayKey}: ${displayValue}`;
            })
            .slice(0, 3) // Limiter à 3 éléments pour l'aperçu
            .join(' • ');

        return formatted || 'Détails non disponibles';
    }

    updatePagination() {
        const totalPages = Math.ceil(this.filteredLogs.length / this.itemsPerPage);
        const pagination = document.getElementById('logsPagination');
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
        const endItem = Math.min(this.currentPage * this.itemsPerPage, this.filteredLogs.length);
        
        document.getElementById('pageStart').textContent = startItem;
        document.getElementById('pageEnd').textContent = endItem;
        document.getElementById('totalItems').textContent = this.filteredLogs.length;

        // Update buttons
        prevBtn.disabled = this.currentPage === 1;
        nextBtn.disabled = this.currentPage === totalPages;

        // Generate page numbers
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
                this.displayLogs();
            };
            pageNumbers.appendChild(button);
        }
    }

    clearFilters() {
        document.getElementById('levelFilter').value = '';
        document.getElementById('categoryFilter').value = '';
        document.getElementById('adminFilter').value = '';
        document.getElementById('periodFilter').value = 'week';
        document.getElementById('actionSearch').value = '';
        document.getElementById('detailsSearch').value = '';
        
        this.filters = {
            level: '',
            category: '',
            admin: '',
            period: 'week',
            actionSearch: '',
            detailsSearch: ''
        };
        
        this.applyFilters();
        this.currentPage = 1;
        this.displayLogs();
    }

    toggleAutoRefresh(enabled) {
        if (enabled) {
            this.autoRefreshInterval = setInterval(() => {
                this.loadLogs();
            }, 30000); // Rafraîchir toutes les 30 secondes
            
            TrackingCarUtils.showNotification('Actualisation automatique activée (30s)', 'info');
        } else {
            if (this.autoRefreshInterval) {
                clearInterval(this.autoRefreshInterval);
                this.autoRefreshInterval = null;
            }
            
            TrackingCarUtils.showNotification('Actualisation automatique désactivée', 'info');
        }
    }

    viewLogDetails(logId) {
        const log = this.allLogs.find(l => l.id === logId);
        if (!log) return;

        const modal = document.getElementById('logModal');
        const modalContent = document.getElementById('logModalContent');
        
        if (!modal || !modalContent) return;

        const levelInfo = this.getLevelInfo(log.level);

        modalContent.innerHTML = `
            <div class="space-y-6">
                <!-- En-tête du log -->
                <div class="border-l-4 ${levelInfo.borderColor} pl-4">
                    <div class="flex items-center space-x-2 mb-2">
                        <span class="log-level ${levelInfo.bgColor} ${levelInfo.textColor} px-3 py-1 rounded-full text-sm font-medium">
                            <i class="${levelInfo.icon} mr-1"></i>
                            ${log.level || 'INFO'}
                        </span>
                        
                        ${log.category ? `
                            <span class="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm">
                                ${log.category}
                            </span>
                        ` : ''}
                    </div>
                    
                    <h4 class="text-xl font-bold text-gray-900">${this.formatAction(log.action)}</h4>
                    <p class="text-gray-600">${TrackingCarUtils.formatDate(log.timestamp)}</p>
                </div>

                <!-- Informations de l'administrateur -->
                <div>
                    <h5 class="font-semibold text-gray-900 mb-3">Administrateur</h5>
                    <div class="bg-gray-50 rounded-lg p-4">
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span class="text-gray-600">Email:</span>
                                <span class="ml-2 font-medium">${log.adminEmail || 'Système'}</span>
                            </div>
                            <div>
                                <span class="text-gray-600">ID Admin:</span>
                                <span class="ml-2 font-mono text-xs">${log.adminId || 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Informations techniques -->
                <div>
                    <h5 class="font-semibold text-gray-900 mb-3">Informations techniques</h5>
                    <div class="bg-gray-50 rounded-lg p-4">
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span class="text-gray-600">Adresse IP:</span>
                                <span class="ml-2 font-medium">${log.ipAddress || 'Non définie'}</span>
                            </div>
                            <div>
                                <span class="text-gray-600">Timestamp:</span>
                                <span class="ml-2 font-mono text-xs">${log.timestamp?.seconds || 'N/A'}</span>
                            </div>
                            ${log.userAgent ? `
                                <div class="col-span-2">
                                    <span class="text-gray-600">User Agent:</span>
                                    <span class="ml-2 text-xs break-all">${log.userAgent}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <!-- Détails de l'action -->
                ${log.details ? `
                    <div>
                        <h5 class="font-semibold text-gray-900 mb-3">Détails de l'action</h5>
                        <div class="bg-gray-800 text-gray-100 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                            <pre>${JSON.stringify(log.details, null, 2)}</pre>
                        </div>
                    </div>
                ` : ''}

                <!-- Actions -->
                <div class="border-t pt-4">
                    <div class="flex space-x-2">
                        <button onclick="logsManager.copyLogDetails('${log.id}')" class="btn btn-secondary text-sm">
                            <i class="fas fa-copy mr-1"></i>Copier les détails
                        </button>
                        
                        ${log.level === 'ERROR' || log.level === 'CRITICAL' ? `
                            <button onclick="logsManager.reportIssue('${log.id}')" class="btn btn-warning text-sm">
                                <i class="fas fa-exclamation-triangle mr-1"></i>Signaler le problème
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
    }

    closeLogModal() {
        document.getElementById('logModal').classList.add('hidden');
    }

    copyLogDetails(logId) {
        const log = this.allLogs.find(l => l.id === logId);
        if (!log) return;

        const logDetails = {
            timestamp: TrackingCarUtils.formatDate(log.timestamp),
            level: log.level,
            action: log.action,
            admin: log.adminEmail,
            details: log.details
        };

        navigator.clipboard.writeText(JSON.stringify(logDetails, null, 2))
            .then(() => {
                TrackingCarUtils.showNotification('Détails du log copiés dans le presse-papiers', 'success');
            })
            .catch(() => {
                TrackingCarUtils.showNotification('Erreur lors de la copie', 'error');
            });
    }

    async exportLogs() {
        try {
            TrackingCarUtils.showLoading(true, 'Préparation de l\'export...');

            const dataToExport = this.filteredLogs.map(log => ({
                'Timestamp': TrackingCarUtils.formatDate(log.timestamp, { 
                    year: 'numeric', 
                    month: '2-digit', 
                    day: '2-digit', 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit' 
                }),
                'Niveau': log.level || 'INFO',
                'Catégorie': log.category || 'N/A',
                'Action': this.formatAction(log.action),
                'Administrateur': log.adminEmail || 'Système',
                'Adresse IP': log.ipAddress || 'N/A',
                'Détails': log.details ? JSON.stringify(log.details) : 'N/A'
            }));

            const csvContent = this.convertToCSV(dataToExport);
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `logs_tracking_car_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            TrackingCarUtils.showNotification('Export des logs réalisé avec succès', 'success');

        } catch (error) {
            console.error('Erreur export logs:', error);
            TrackingCarUtils.showNotification('Erreur lors de l\'export', 'error');
        } finally {
            TrackingCarUtils.showLoading(false);
        }
    }

    async deleteOldLogs() {
        const confirmed = await TrackingCarUtils.showConfirmation(
            'Purger les anciens logs',
            'ATTENTION: Cette action va supprimer définitivement tous les logs de plus de 90 jours. Cette action est irréversible.\n\nÊtes-vous sûr de vouloir continuer ?',
            'Oui, purger',
            'Annuler'
        );

        if (!confirmed) return;

        try {
            TrackingCarUtils.showLoading(true, 'Suppression des anciens logs...');

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 90);

            const oldLogs = this.allLogs.filter(log => {
                if (log.timestamp) {
                    return log.timestamp.toDate() < cutoffDate;
                }
                return false;
            });

            if (oldLogs.length === 0) {
                TrackingCarUtils.showNotification('Aucun log ancien à supprimer', 'info');
                return;
            }

            // Supprimer les logs par batch
            const batchSize = 10;
            let deletedCount = 0;

            for (let i = 0; i < oldLogs.length; i += batchSize) {
                const batch = oldLogs.slice(i, i + batchSize);
                
                await Promise.all(
                    batch.map(log => deleteDoc(doc(this.db, 'admin_logs', log.id)))
                );
                
                deletedCount += batch.length;
                
                // Mettre à jour le progress
                const progress = Math.round((deletedCount / oldLogs.length) * 100);
                TrackingCarUtils.showLoading(true, `Suppression... ${progress}%`);
            }

            await this.loadLogs();
            
            TrackingCarUtils.showNotification(
                `${deletedCount} logs anciens supprimés avec succès`, 
                'success'
            );

        } catch (error) {
            console.error('Erreur suppression logs:', error);
            TrackingCarUtils.showNotification('Erreur lors de la suppression', 'error');
        } finally {
            TrackingCarUtils.showLoading(false);
        }
    }

    convertToCSV(data) {
        if (data.length === 0) return '';

        const headers = Object.keys(data[0]);
        const csvRows = [];

        csvRows.push(headers.join(','));

        for (const row of data) {
            const values = headers.map(header => {
                const value = row[header] || '';
                return `"${value.toString().replace(/"/g, '""')}"`;
            });
            csvRows.push(values.join(','));
        }

        return csvRows.join('\n');
    }

    destroy() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }
    }
}

// Initialiser la gestion des logs
document.addEventListener('DOMContentLoaded', () => {
    window.logsManager = new LogsManager();
});

// Nettoyer lors du changement de page
window.addEventListener('beforeunload', () => {
    if (window.logsManager) {
        window.logsManager.destroy();
    }
});