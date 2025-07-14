import { getFirestore, collection, query, where, getDocs, orderBy, doc, deleteDoc, updateDoc, addDoc, Timestamp, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Contrôle d'accès centralisé et adaptation UI selon le rôle
document.addEventListener('DOMContentLoaded', () => {
    const admin = window.trackingCarAuth?.getCurrentAdmin?.();
    if (!admin) {
        window.location.href = 'index.html';
        return;
    }
    // Affiche/Masque les menus/fonctionnalités selon le rôle
    if (admin.role === 'global_admin') {
        document.querySelectorAll('.menu-global').forEach(e => e.classList.remove('hidden'));
        document.querySelectorAll('.menu-legion').forEach(e => e.classList.add('hidden'));
    } else {
        document.querySelectorAll('.menu-global').forEach(e => e.classList.add('hidden'));
        document.querySelectorAll('.menu-legion').forEach(e => e.classList.remove('hidden'));
    }
    window.vehiclesManager = new VehiclesManager(admin);
});

// Mapping des légions pour affichage clair
window.TrackingCarConfig = window.TrackingCarConfig || {};
window.TrackingCarConfig.LEGIONS = {
    l1: { name: "CENTRE" },
    l2: { name: "LITTORAL" },
    l3: { name: "OUEST" },
    l4: { name: "SUD" },
    l5: { name: "NORD" },
    l6: { name: "ADAMAOUA" },
    l7: { name: "EST" },
    l8: { name: "EXTREME-NORD" },
    l9: { name: "NORD-OUEST" },
    l10: { name: "SUD-OUEST" },
    l11: { name: " Logone-et-Chari (Far North)" }
};

export class VehiclesManager {
    constructor(admin) {
        this.admin = admin;
        this.db = getFirestore();
        this.currentPage = 1;
        this.itemsPerPage = 12;
        this.allVehicles = [];
        this.filteredVehicles = [];
        this.filters = { search: '', status: '', legion: '', period: '' };
        this.admin = admin;
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.loadVehicles();
    }

    setupEventListeners() {
        // Recherche
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.handleFilterChange());
        }
        // Filtres
        ['statusFilter', 'legionFilter', 'periodFilter'].forEach(filterId => {
            const element = document.getElementById(filterId);
            if (element) {
                element.addEventListener('change', () => this.handleFilterChange());
            }
        });
        // Clear filters
        document.getElementById('clearFiltersBtn')?.addEventListener('click', () => this.clearFilters());
        // Export
        document.getElementById('exportBtn')?.addEventListener('click', () => this.exportData());
        // Modal close
        document.getElementById('closeModalBtn')?.addEventListener('click', () => this.closeModal());
        // Pagination
        document.getElementById('prevPageBtn')?.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.displayVehicles();
            }
        });
        document.getElementById('nextPageBtn')?.addEventListener('click', () => {
            const totalPages = Math.ceil(this.filteredVehicles.length / this.itemsPerPage);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.displayVehicles();
            }
        });
        // Sidebar toggle
        document.getElementById('sidebarToggle')?.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('-translate-x-full');
        });
        // User menu
        document.getElementById('userMenuBtn')?.addEventListener('click', () => {
            document.getElementById('userDropdown').classList.toggle('hidden');
        });
    }

    async loadVehicles() {
        try {
            const loadingState = document.getElementById('loadingState');
            if (loadingState) loadingState.style.display = '';
            const emptyState = document.getElementById('emptyState');
            if (emptyState) emptyState.style.display = 'none';

            let vehiclesQuery;
            const isGlobal = this.admin.role === 'global_admin';
            const legion = this.admin.legion;

            if (!isGlobal && legion) {
                vehiclesQuery = query(
                    collection(this.db, 'stolen_vehicles'),
                    where('legion', '==', legion),
                    orderBy('theft_date', 'desc')
                );
            } else {
                vehiclesQuery = query(
                    collection(this.db, 'stolen_vehicles'),
                    orderBy('theft_date', 'desc')
                );
            }

            const snapshot = await getDocs(vehiclesQuery);
            this.allVehicles = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            this.filteredVehicles = [...this.allVehicles];
            if (loadingState) loadingState.style.display = 'none';
            if (this.allVehicles.length === 0) {
                if (emptyState) emptyState.style.display = '';
            } else {
                this.displayVehicles();
                this.updateResultsCount();
            }
        } catch (error) {
            console.error('Erreur chargement véhicules:', error);
            alert('Erreur lors du chargement des véhicules');
        }
    }

    handleFilterChange() {
        this.filters.search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        this.filters.status = document.getElementById('statusFilter')?.value || '';
        this.filters.legion = document.getElementById('legionFilter')?.value || '';
        this.filters.period = document.getElementById('periodFilter')?.value || '';
        this.applyFilters();
        this.currentPage = 1;
        this.displayVehicles();
        this.updateResultsCount();
    }

    applyFilters() {
        this.filteredVehicles = this.allVehicles.filter(vehicle => {
            // Recherche
            if (this.filters.search) {
                const searchText = this.filters.search;
                const matchFields = [
                    vehicle.license_plate,
                    vehicle.chassis_number,
                    vehicle.make,
                    vehicle.model,
                    vehicle.owner_name,
                    vehicle.case_number
                ].filter(Boolean).join(' ').toLowerCase();
                if (!matchFields.includes(searchText)) return false;
            }
            // Statut
            if (this.filters.status && vehicle.status !== this.filters.status) return false;
            // Légion
            if (this.filters.legion && vehicle.legion !== this.filters.legion) return false;
            // Période
            if (this.filters.period && vehicle.theft_date) {
                const theftDate = vehicle.theft_date.seconds ? new Date(vehicle.theft_date.seconds * 1000) : new Date(vehicle.theft_date);
                const daysAgo = parseInt(this.filters.period);
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
                if (theftDate < cutoffDate) return false;
            }
            return true;
        });
    }

    displayVehicles() {
        const container = document.getElementById('vehiclesList');
        if (!container) return;
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const vehiclesToShow = this.filteredVehicles.slice(startIndex, endIndex);
        if (vehiclesToShow.length === 0 && this.filteredVehicles.length > 0) {
            this.currentPage = 1;
            this.displayVehicles();
            return;
        }
        if (vehiclesToShow.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-search text-4xl text-gray-300 mb-4"></i>
                    <p class="text-gray-500 mb-4">Aucun véhicule ne correspond à vos critères</p>
                    <button onclick="document.getElementById('clearFiltersBtn').click()" class="btn btn-primary">
                        Effacer les filtres
                    </button>
                </div>
            `;
            const pagination = document.getElementById('pagination');
            if (pagination) pagination.classList.add('hidden');
            return;
        }
        container.innerHTML = vehiclesToShow.map((vehicle, index) => this.createVehicleCard(vehicle, startIndex + index)).join('');
        this.updatePagination();
    }

    createVehicleCard(vehicle, index) {
        const statusMap = {
            active: { text: 'Recherché', color: 'bg-yellow-100 text-yellow-700', icon: 'fas fa-exclamation' },
            recovered: { text: 'Récupéré', color: 'bg-green-100 text-green-700', icon: 'fas fa-check' },
            closed: { text: 'Fermé', color: 'bg-gray-200 text-gray-700', icon: 'fas fa-lock' }
        };
        const status = statusMap[vehicle.status] || statusMap.active;
        const legion = (window.TrackingCarConfig?.LEGIONS?.[vehicle.legion]?.name) || vehicle.legion || '-';
        return `
            <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all duration-300 bg-white">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex-1">
                        <div class="flex items-center space-x-2 mb-2">
                            <h3 class="font-semibold text-gray-900">${vehicle.make || 'N/A'} ${vehicle.model || ''}</h3>
                            <span class="px-2 py-1 rounded text-xs ${status.color}">
                                <i class="${status.icon} mr-1"></i>${status.text}
                            </span>
                        </div>
                        <p class="text-sm text-gray-600"><i class="fas fa-id-card mr-1"></i>Plaque: <span class="font-medium">${vehicle.license_plate || 'N/A'}</span></p>
                        <p class="text-sm text-gray-600"><i class="fas fa-barcode mr-1"></i>Châssis: <span class="font-mono text-xs">${vehicle.chassis_number || 'N/A'}</span></p>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-2 text-sm text-gray-600 mb-4">
                    <div><i class="fas fa-calendar mr-1"></i>Année: ${vehicle.year || 'N/A'}</div>
                    <div><i class="fas fa-palette mr-1"></i>Couleur: ${vehicle.color || 'N/A'}</div>
                    <div><i class="fas fa-map-marker-alt mr-1"></i>Lieu: ${vehicle.theft_location || 'N/A'}</div>
                    <div><i class="fas fa-calendar-times mr-1"></i>Date: ${this.formatDate(vehicle.theft_date)}</div>
                    <div class="col-span-2"><i class="fas fa-shield-alt mr-1"></i>Légion: <span class="font-semibold">${legion}</span></div>
                    ${vehicle.case_number ? `<div class="col-span-2"><i class="fas fa-folder mr-1"></i>Dossier: <span class="font-mono text-xs">${vehicle.case_number}</span></div>` : ''}
                </div>
                <div class="flex justify-end space-x-2">
                    <button onclick="vehiclesManager.viewVehicle('${vehicle.id}')" class="btn text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1"><i class="fas fa-eye mr-1"></i>Détails</button>
                    <button onclick="vehiclesManager.editVehicle('${vehicle.id}')" class="btn text-sm bg-yellow-100 text-yellow-700 hover:bg-yellow-200 px-3 py-1"><i class="fas fa-edit mr-1"></i>Modifier</button>
                    ${vehicle.status === 'active' ? `<button onclick="vehiclesManager.markAsRecovered('${vehicle.id}')" class="btn text-sm bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1"><i class="fas fa-check mr-1"></i>Récupéré</button>` : ''}
                    <button onclick="vehiclesManager.deleteVehicle('${vehicle.id}')" class="btn text-sm bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1"><i class="fas fa-trash mr-1"></i>Supprimer</button>
                </div>
            </div>
        `;
    }

    updatePagination() {
        const totalPages = Math.ceil(this.filteredVehicles.length / this.itemsPerPage);
        const pagination = document.getElementById('pagination');
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');
        const pageNumbers = document.getElementById('pageNumbers');
        if (!pagination || !prevBtn || !nextBtn || !pageNumbers) return;
        if (totalPages <= 1) {
            pagination.classList.add('hidden');
            return;
        }
        pagination.classList.remove('hidden');
        const startItem = (this.currentPage - 1) * this.itemsPerPage + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, this.filteredVehicles.length);
        document.getElementById('pageStart').textContent = startItem;
        document.getElementById('pageEnd').textContent = endItem;
        document.getElementById('totalItems').textContent = this.filteredVehicles.length;
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
            button.className = `px-3 py-1 text-sm border rounded ${i === this.currentPage ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-50'}`;
            button.textContent = i;
            button.onclick = () => {
                this.currentPage = i;
                this.displayVehicles();
            };
            pageNumbers.appendChild(button);
        }
    }

     async viewVehicle(vehicleId) {
        const vehicle = this.allVehicles.find(v => v.id === vehicleId);
        if (!vehicle) return;
        const modal = document.getElementById('vehicleModal');
        const modalContent = document.getElementById('modalContent');
        if (!modal || !modalContent) return;
        const statusMap = {
            active: { text: 'Recherché', color: 'bg-yellow-100 text-yellow-700', icon: 'fas fa-exclamation' },
            recovered: { text: 'Récupéré', color: 'bg-green-100 text-green-700', icon: 'fas fa-check' },
            closed: { text: 'Fermé', color: 'bg-gray-200 text-gray-700', icon: 'fas fa-lock' }
        };
        const status = statusMap[vehicle.status] || statusMap.active;
        const legion = (window.TrackingCarConfig?.LEGIONS?.[vehicle.legion]?.name) || vehicle.legion || '-';
        modalContent.innerHTML = `
            <div class="space-y-6">
                <div>
                    <h4 class="font-semibold text-gray-900 mb-3">Informations du véhicule</h4>
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div><span class="text-gray-600">Marque:</span> <span class="ml-2 font-medium">${vehicle.make || 'N/A'}</span></div>
                        <div><span class="text-gray-600">Modèle:</span> <span class="ml-2 font-medium">${vehicle.model || 'N/A'}</span></div>
                        <div><span class="text-gray-600">Année:</span> <span class="ml-2 font-medium">${vehicle.year || 'N/A'}</span></div>
                        <div><span class="text-gray-600">Couleur:</span> <span class="ml-2 font-medium">${vehicle.color || 'N/A'}</span></div>
                        <div class="col-span-2"><span class="text-gray-600">Plaque d'immatriculation:</span> <span class="ml-2 font-medium text-blue-600">${vehicle.license_plate || 'N/A'}</span></div>
                        <div class="col-span-2"><span class="text-gray-600">Numéro de châssis:</span> <span class="ml-2 font-mono text-xs bg-gray-100 px-2 py-1 rounded">${vehicle.chassis_number || 'N/A'}</span></div>
                    </div>
                </div>
                <div>
                    <h4 class="font-semibold text-gray-900 mb-3">Statut</h4>
                    <span class="px-2 py-1 rounded text-xs ${status.color}"><i class="${status.icon} mr-1"></i>${status.text}</span>
                </div>
                <div>
                    <h4 class="font-semibold text-gray-900 mb-3">Informations du vol</h4>
                    <div class="space-y-2 text-sm">
                        <div><span class="text-gray-600">Date du vol:</span> <span class="ml-2 font-medium">${this.formatDate(vehicle.theft_date)}</span></div>
                        <div><span class="text-gray-600">Lieu du vol:</span> <span class="ml-2 font-medium">${vehicle.theft_location || 'N/A'}</span></div>
                        <div><span class="text-gray-600">Légion responsable:</span> <span class="ml-2 font-medium">${legion}</span></div>
                        ${vehicle.case_number ? `<div><span class="text-gray-600">Numéro de dossier:</span> <span class="ml-2 font-mono text-xs bg-gray-100 px-2 py-1 rounded">${vehicle.case_number}</span></div>` : ''}
                        ${vehicle.description ? `<div><span class="text-gray-600">Description:</span><p class="mt-1 text-gray-800">${vehicle.description}</p></div>` : ''}
                    </div>
                </div>
                <div class="border-t pt-4">
                    <h4 class="font-semibold text-gray-900 mb-3">Métadonnées</h4>
                    <div class="space-y-2 text-xs text-gray-500">
                        ${vehicle.created_at ? `<div>Enregistré le: ${this.formatDate(vehicle.created_at)}</div>` : ''}
                        ${vehicle.reported_by_email ? `<div>Signalé par: ${vehicle.reported_by_email}</div>` : ''}
                        ${vehicle.updated_at ? `<div>Dernière modification: ${this.formatDate(vehicle.updated_at)}</div>` : ''}
                        ${vehicle.region ? `<div>Région: ${vehicle.region}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
        modal.classList.remove('hidden');
    }

    closeModal() {
        document.getElementById('vehicleModal').classList.add('hidden');
    }

    editVehicle(vehicleId) {
        window.location.href = `edit.html?id=${vehicleId}`;
    }

    async markAsRecovered(vehicleId) {
        if (!confirm('Êtes-vous sûr que ce véhicule a été récupéré ?')) return;
        try {
            await updateDoc(doc(this.db, 'stolen_vehicles', vehicleId), {
                status: 'recovered',
                updated_at: Timestamp.now()
            });
            alert('Véhicule marqué comme récupéré');
            this.loadVehicles();
        } catch (error) {
            alert('Erreur lors de la mise à jour');
        }
    }

    async deleteVehicle(vehicleId) {
        if (!confirm('Supprimer définitivement ce véhicule ?')) return;
        try {
            await deleteDoc(doc(this.db, 'stolen_vehicles', vehicleId));
            alert('Véhicule supprimé');
            this.loadVehicles();
        } catch (error) {
            alert('Erreur lors de la suppression');
        }
    }


    updateResultsCount() {
        const resultsCount = document.getElementById('resultsCount');
        if (resultsCount) {
            resultsCount.textContent = `${this.filteredVehicles.length} véhicule(s) trouvé(s)`;
        }
    }

    clearFilters() {
        document.getElementById('searchInput').value = '';
        document.getElementById('statusFilter').value = '';
        document.getElementById('legionFilter').value = '';
        document.getElementById('periodFilter').value = '';
        this.filters = { search: '', status: '', legion: '', period: '' };
        this.filteredVehicles = [...this.allVehicles];
        this.currentPage = 1;
        this.displayVehicles();
        this.updateResultsCount();
    }

    exportData() {
        // Génère le CSV à partir des véhicules filtrés
        const vehicles = this.filteredVehicles || [];
        if (vehicles.length === 0) {
            alert("Aucune donnée à exporter !");
            return;
        }
        const headers = [
            "Plaque", "Châssis", "Marque", "Modèle", "Année", "Couleur", "Date vol", "Lieu vol", "Légion", "Statut"
        ];
        const rows = vehicles.map(v => [
            v.license_plate || "",
            v.chassis_number || "",
            v.make || "",
            v.model || "",
            v.year || "",
            v.color || "",
            v.theft_date && v.theft_date.seconds ? new Date(v.theft_date.seconds * 1000).toLocaleDateString('fr-FR') : "",
            v.theft_location || "",
            (window.TrackingCarConfig?.LEGIONS?.[v.legion]?.name) || v.legion || "",
            v.status || ""
        ]);
        const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "vehicules.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    formatDate(date) {
        if (!date) return '';
        if (date.seconds) date = new Date(date.seconds * 1000);
        else date = new Date(date);
        return date.toLocaleDateString('fr-FR');
    }
}