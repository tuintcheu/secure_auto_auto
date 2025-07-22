import { getFirestore, collection, query, where, getDocs, orderBy, doc, deleteDoc, updateDoc, addDoc, Timestamp, getDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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
            let legion = this.admin.legion;
            // Log la valeur de legion utilisée
            console.log('Filtre Firestore - legion (avant normalisation):', legion);
            if (!isGlobal && legion) {
                legion = legion.trim().toLowerCase();
                if (legion === 'centre') legion = 'l1';
                if (legion === 'littoral') legion = 'l2';
                if (legion === 'ouest') legion = 'l3';
                if (legion === 'sud') legion = 'l4';
                if (legion === 'nord') legion = 'l5';
                if (legion === 'adamaoua') legion = 'l6';
                if (legion === 'est') legion = 'l7';
                if (legion === 'extreme-nord') legion = 'l8';
                if (legion === 'nord-ouest') legion = 'l9';
                if (legion === 'sud-ouest') legion = 'l10';
                if (legion === 'logone-et-chari (far north)') legion = 'l11';
                console.log('Filtre Firestore - legion (après normalisation):', legion);
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
            // Log brut Firestore
            console.log('Firestore snapshot docs:', snapshot.docs.map(doc => ({id: doc.id, ...doc.data()})));
            this.allVehicles = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            if (this.admin.role === 'legion_admin' && this.admin.legion) {
                this.allVehicles = this.allVehicles.filter(v => v.legion === this.admin.legion);
            }
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
        // Désactiver tous les filtres sauf recherche utilisateur
        this.filteredVehicles = this.allVehicles.filter(vehicle => {
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
            return true;
        });
        // Log pour debug
        console.log('Véhicules Firestore (camembert):', this.allVehicles.length, 'Affichés:', this.filteredVehicles.length, this.filteredVehicles);
    }

    displayVehicles() {
        const container = document.getElementById('vehiclesList');
        if (!container) {
            console.error('Container #vehiclesList introuvable dans le HTML');
            return;
        }
        // Affichage debug : tous les véhicules sans pagination
        if (!this.filteredVehicles || this.filteredVehicles.length === 0) {
            container.innerHTML = '<div style="background:orange; padding:16px; font-weight:bold;">AUCUN VEHICULE À AFFICHER (debug) - filteredVehicles.length = ' + (this.filteredVehicles ? this.filteredVehicles.length : 'null') + '</div>';
            console.log('DEBUG - filteredVehicles:', this.filteredVehicles);
            return;
        }
        container.innerHTML = this.filteredVehicles.map((vehicle, index) => {
            return `
            <div class="border border-gray-200 rounded-lg p-4 mb-2 bg-white shadow">
                <div class="font-bold text-blue-700 mb-1 text-lg">${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.year ? '('+vehicle.year+')' : ''}</div>
                <div class="grid grid-cols-2 gap-2 text-sm mb-2">
                    <div><b>Plaque:</b> ${vehicle.license_plate || '<i>Non défini</i>'}</div>
                    <div><b>Châssis:</b> ${vehicle.chassis_number || '<i>Non défini</i>'}</div>
                    <div><b>Couleur:</b> ${vehicle.color || '<i>Non défini</i>'}</div>
                    <div><b>Date vol:</b> ${vehicle.theft_date ? (vehicle.theft_date.seconds ? new Date(vehicle.theft_date.seconds * 1000).toLocaleDateString('fr-FR') : vehicle.theft_date) : '<i>Non défini</i>'}</div>
                    <div><b>Lieu vol:</b> ${vehicle.theft_location || '<i>Non défini</i>'}</div>
                    <div><b>Propriétaire:</b> ${vehicle.owner_name || '<i>Non défini</i>'}</div>
                    <div><b>Légion:</b> ${vehicle.legion || '<i>Non défini</i>'}</div>
                    <div><b>Statut:</b> ${vehicle.status || '<i>Non défini</i>'}</div>
                </div>
                <div class="mt-2">
                    <b>Détections associées :</b> ${detections.length === 0 ? '<span class="text-gray-400">Aucune</span>' : ''}
                    <ul class="mt-1 space-y-1">
                        ${detections.map(d => `
                            <li class="border rounded p-2 bg-gray-50 text-xs flex flex-col md:flex-row md:items-center md:space-x-2">
                                <span><b>Date:</b> ${d.check_date && d.check_date.seconds ? new Date(d.check_date.seconds * 1000).toLocaleString('fr-FR') : ''}</span>
                                <span><b>Utilisateur:</b> ${d.user_name || d.user_email || 'N/A'}</span>
                                <span><b>Résultat:</b> <span class="${d.result === 'stolen' ? 'text-red-600' : 'text-green-600'}">${d.result === 'stolen' ? 'VOLÉ' : 'PROPRE'}</span></span>
                                <span>
                                    ${d.location ? `<button onclick="window.open('https://www.google.com/maps?q=${d.location.latitude},${d.location.longitude}','_blank')" class="btn btn-xs bg-green-100 text-green-700 ml-1">Localisation</button>` : ''}
                                    ${d.selfie_url ? `<button onclick="window.open('${d.selfie_url}','_blank')" class="btn btn-xs bg-purple-100 text-purple-700 ml-1">Selfie</button>` : ''}
                                </span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            </div>
            `;
        }).join('');
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

// Initialisation après déclaration de la classe

// Gestion du formulaire d'ajout de véhicule (add.html)
document.addEventListener('DOMContentLoaded', () => {
    // Contrôle d'accès centralisé et filtrage légion
    const admin = window.checkAccessForAdmin();
    if (!admin || !admin.role) {
        const container = document.getElementById('vehiclesList');
        if (container) {
            container.innerHTML = '<div style="background:red;color:white;padding:16px;font-weight:bold;">ERREUR: Admin non authentifié ou mal formé (aucun affichage possible)</div>';
        }
        console.error('ERREUR: admin null ou mal formé', admin);
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
    // Ajoute une propriété pour stocker les détections par véhicule
    window.vehiclesManager.vehicleDetections = {};
    // Ajoute la récupération temps réel des détections pour tous les véhicules affichés
    window.vehiclesManager.listenDetectionsForVehicles = function() {
        const db = this.db;
        // Nettoie les anciens listeners
        if (this._detectionsUnsub) this._detectionsUnsub();
        // Récupère toutes les plaques et châssis affichés
        const plates = this.allVehicles.map(v => v.license_plate).filter(Boolean);
        const chassis = this.allVehicles.map(v => v.chassis_number).filter(Boolean);
        // Si aucun véhicule, rien à écouter
        if (plates.length === 0 && chassis.length === 0) return;
        // On écoute toutes les détections qui matchent une plaque ou un châssis
        const q = query(
            collection(db, 'vehicle_checks'),
            // Firestore ne permet pas deux in dans la même requête, donc on écoute tout et on filtre côté JS
        );
        this._detectionsUnsub = onSnapshot(q, (snapshot) => {
            // Regroupe les détections par véhicule
            const allDetections = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.vehicleDetections = {};
            for (const v of this.allVehicles) {
                const vPl = v.license_plate;
                const vCh = v.chassis_number;
                this.vehicleDetections[v.id] = allDetections.filter(d =>
                    (d.license_plate && vPl && d.license_plate === vPl) ||
                    (d.chassis_number && vCh && d.chassis_number === vCh)
                );
            }
            this.displayVehicles(); // Rafraîchit l'affichage
        });
    };
    // Modifie displayVehicles pour afficher les détections sous chaque carte véhicule
    const oldDisplayVehicles = window.vehiclesManager.displayVehicles;
    window.vehiclesManager.displayVehicles = function() {
        const container = document.getElementById('vehiclesList');
        if (!container) return;
        if (!this.filteredVehicles || this.filteredVehicles.length === 0) {
            container.innerHTML = '<div style="background:orange; padding:16px; font-weight:bold;">AUCUN VEHICULE À AFFICHER (debug) - filteredVehicles.length = ' + (this.filteredVehicles ? this.filteredVehicles.length : 'null') + '</div>';
            return;
        }
        container.innerHTML = this.filteredVehicles.map((vehicle, index) => {
            const detections = (this.vehicleDetections && this.vehicleDetections[vehicle.id]) || [];
            return `
            <div class="border border-gray-200 rounded-lg p-4 mb-2 bg-white shadow">
                <div class="font-bold text-blue-700 mb-1 text-lg">${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.year ? '('+vehicle.year+')' : ''}</div>
                <div class="grid grid-cols-2 gap-2 text-sm mb-2">
                    <div><b>Plaque:</b> ${vehicle.license_plate || '<i>Non défini</i>'}</div>
                    <div><b>Châssis:</b> ${vehicle.chassis_number || '<i>Non défini</i>'}</div>
                    <div><b>Couleur:</b> ${vehicle.color || '<i>Non défini</i>'}</div>
                    <div><b>Date vol:</b> ${vehicle.theft_date ? (vehicle.theft_date.seconds ? new Date(vehicle.theft_date.seconds * 1000).toLocaleDateString('fr-FR') : vehicle.theft_date) : '<i>Non défini</i>'}</div>
                    <div><b>Lieu vol:</b> ${vehicle.theft_location || '<i>Non défini</i>'}</div>
                    <div><b>Propriétaire:</b> ${vehicle.owner_name || '<i>Non défini</i>'}</div>
                    <div><b>Légion:</b> ${vehicle.legion || '<i>Non défini</i>'}</div>
                    <div><b>Statut:</b> ${vehicle.status || '<i>Non défini</i>'}</div>
                </div>
                <div class="flex justify-end space-x-2 mb-2">
                    <button onclick="vehiclesManager.viewVehicle('${vehicle.id}')" class="btn text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1"><i class="fas fa-eye mr-1"></i>Détails</button>
                    <button onclick="vehiclesManager.editVehicle('${vehicle.id}')" class="btn text-sm bg-yellow-100 text-yellow-700 hover:bg-yellow-200 px-3 py-1"><i class="fas fa-edit mr-1"></i>Modifier</button>
                    ${vehicle.status === 'active' ? `<button onclick="vehiclesManager.markAsRecovered('${vehicle.id}')" class="btn text-sm bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1"><i class="fas fa-check mr-1"></i>Récupéré</button>` : ''}
                    <button onclick="vehiclesManager.deleteVehicle('${vehicle.id}')" class="btn text-sm bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1"><i class="fas fa-trash mr-1"></i>Supprimer</button>
                </div>
                <div class="mt-2">
                   
                    <ul class="mt-1 space-y-1">
                        ${detections.map(d => `
                            <li class="border rounded p-2 bg-gray-50 text-xs flex flex-col md:flex-row md:items-center md:space-x-2">
                                <span><b>Date:</b> ${d.check_date && d.check_date.seconds ? new Date(d.check_date.seconds * 1000).toLocaleString('fr-FR') : ''}</span>
                                <span><b>Utilisateur:</b> ${d.user_name || d.user_email || 'N/A'}</span>
                                <span><b>Résultat:</b> <span class="${d.result === 'stolen' ? 'text-red-600' : 'text-green-600'}">${d.result === 'stolen' ? 'VOLÉ' : 'PROPRE'}</span></span>
                                <span>
                                    ${d.location ? `<button onclick="window.open('https://www.google.com/maps?q=${d.location.latitude},${d.location.longitude}','_blank')" class="btn btn-xs bg-green-100 text-green-700 ml-1">Localisation</button>` : ''}
                                    ${d.selfie_url ? `<button onclick="window.open('${d.selfie_url}','_blank')" class="btn btn-xs bg-purple-100 text-purple-700 ml-1">Selfie</button>` : ''}
                                </span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            </div>
            `;
        }).join('');
    };
    // Patch: forcer l'affichage de tous les véhicules récupérés (pas de filtrage par rôle)
    window.vehiclesManager.loadVehicles = function() {
        try {
            const loadingState = document.getElementById('loadingState');
            if (loadingState) loadingState.style.display = '';
            const emptyState = document.getElementById('emptyState');
            if (emptyState) emptyState.style.display = 'none';
            const admin = this.admin;
            let vehiclesQuery;
            if (admin.role === 'legion_admin' && admin.legion) {
                let legion = admin.legion.trim().toLowerCase();
                if (legion === 'centre') legion = 'l1';
                if (legion === 'littoral') legion = 'l2';
                if (legion === 'ouest') legion = 'l3';
                if (legion === 'sud') legion = 'l4';
                if (legion === 'nord') legion = 'l5';
                if (legion === 'adamaoua') legion = 'l6';
                if (legion === 'est') legion = 'l7';
                if (legion === 'extreme-nord') legion = 'l8';
                if (legion === 'nord-ouest') legion = 'l9';
                if (legion === 'sud-ouest') legion = 'l10';
                if (legion === 'logone-et-chari (far north)') legion = 'l11';
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
            // Utilise onSnapshot pour la synchro temps réel
            if (this._unsubscribe) this._unsubscribe();
            this._unsubscribe = onSnapshot(vehiclesQuery, (snapshot) => {
                this.allVehicles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.filteredVehicles = [...this.allVehicles];
                if (loadingState) loadingState.style.display = 'none';
                if (this.allVehicles.length === 0) {
                    if (emptyState) emptyState.style.display = '';
                    const container = document.getElementById('vehiclesList');
                    if (container) {
                        container.innerHTML = '<div style="background:orange; padding:16px; font-weight:bold;">AUCUN VEHICULE TROUVÉ POUR VOTRE LÉGION (debug)</div>';
                    }
                    console.log('DEBUG - Filtrage légion: aucun véhicule trouvé pour', admin.legion, this.allVehicles);
                } else {
                    this.displayVehicles();
                    this.updateResultsCount();
                }
            }, (error) => {
                console.error('Erreur Firestore onSnapshot:', error);
                const container = document.getElementById('vehiclesList');
                if (container) {
                    container.innerHTML = '<div style="background:red;color:white;padding:16px;font-weight:bold;">ERREUR JS: ' + error + '</div>';
                }
                alert('Erreur lors du chargement des véhicules (temps réel)');
            });
        } catch (error) {
            console.error('Erreur chargement véhicules (patch):', error);
            const container = document.getElementById('vehiclesList');
            if (container) {
                container.innerHTML = '<div style="background:red;color:white;padding:16px;font-weight:bold;">ERREUR JS: ' + error + '</div>';
            }
            alert('Erreur lors du chargement des véhicules (patch)');
        }
    }
    window.vehiclesManager.loadVehicles();

    // Gestion du formulaire d'ajout
    const form = document.getElementById('vehicleForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const db = window.vehiclesManager.db;
            // Récupération des champs
            const get = id => document.getElementById(id)?.value.trim();
            // Correction: toujours stocker le code légion (l1, l2, ...)
            let legionValue = admin.role === 'legion_admin' ? admin.legion : get('legion');
            if (legionValue) {
                legionValue = legionValue.trim().toLowerCase();
                if (legionValue === 'centre') legionValue = 'l1';
                if (legionValue === 'littoral') legionValue = 'l2';
                if (legionValue === 'ouest') legionValue = 'l3';
                if (legionValue === 'sud') legionValue = 'l4';
                if (legionValue === 'nord') legionValue = 'l5';
                if (legionValue === 'adamaoua') legionValue = 'l6';
                if (legionValue === 'est') legionValue = 'l7';
                if (legionValue === 'extreme-nord') legionValue = 'l8';
                if (legionValue === 'nord-ouest') legionValue = 'l9';
                if (legionValue === 'sud-ouest') legionValue = 'l10';
                if (legionValue === 'logone-et-chari (far north)') legionValue = 'l11';
            }
            const data = {
                license_plate: get('licensePlate'),
                chassis_number: get('chassisNumber'),
                make: get('make'),
                model: get('model'),
                year: get('year'),
                color: get('color'),
                theft_date: get('theftDate') ? new Date(get('theftDate')) : null,
                theft_time: get('theftTime'),
                theft_location: get('theftLocation'),
                case_number: get('caseNumber'),
                legion: legionValue,
                description: get('description'),
                owner_name: get('ownerName'),
                owner_phone: get('ownerPhone'),
                owner_cni: get('ownerCni'),
                owner_address: get('ownerAddress'),
                status: 'active',
                created_at: new Date(),
                reported_by_email: admin.email || '',
            };
            // Validation rapide
            if (!data.license_plate || !data.chassis_number || !data.make || !data.model || !data.year || !data.color || !data.theft_date || !data.theft_location || !data.legion || !data.owner_name || !data.owner_phone) {
                alert('Merci de remplir tous les champs obligatoires.');
                return;
            }
            try {
                // Ajout Firestore
                await addDoc(collection(db, 'stolen_vehicles'), data);
                alert('Véhicule enregistré avec succès !');
                window.location.href = 'list.html';
            } catch (err) {
                alert('Erreur lors de l\'enregistrement du véhicule.');
                console.error(err);
            }
        });
        // Pour les admins de légion, on bloque le champ legion
        if (admin.role === 'legion_admin') {
            const legionSelect = document.getElementById('legion');
            if (legionSelect) {
                legionSelect.value = admin.legion;
                legionSelect.disabled = true;
            }
        }
    }
});

// Fonction de test pour exécuter la requête Firestore manuellement
window.testFirestoreLegionQuery = async function(admin) {
    const db = getFirestore();
    let legion = admin.legion;
    const isGlobal = admin.role === 'global_admin';
    console.log('TEST - Filtre Firestore - legion (avant normalisation):', legion);
    if (!isGlobal && legion) {
        legion = legion.trim().toLowerCase();
        if (legion === 'centre') legion = 'l1';
        if (legion === 'littoral') legion = 'l2';
        if (legion === 'ouest') legion = 'l3';
        if (legion === 'sud') legion = 'l4';
        if (legion === 'nord') legion = 'l5';
        if (legion === 'adamaoua') legion = 'l6';
        if (legion === 'est') legion = 'l7';
        if (legion === 'extreme-nord') legion = 'l8';
        if (legion === 'nord-ouest') legion = 'l9';
        if (legion === 'sud-ouest') legion = 'l10';
        if (legion === 'logone-et-chari (far north)') legion = 'l11';
        console.log('TEST - Filtre Firestore - legion (après normalisation):', legion);
        const vehiclesQuery = query(
            collection(db, 'stolen_vehicles'),
            where('legion', '==', legion),
            orderBy('theft_date', 'desc')
        );
        const snapshot = await getDocs(vehiclesQuery);
        console.log('TEST - Résultat Firestore:', snapshot.docs.map(doc => ({id: doc.id, ...doc.data()})));
    } else {
        const vehiclesQuery = query(
            collection(db, 'stolen_vehicles'),
            orderBy('theft_date', 'desc')
        );
        const snapshot = await getDocs(vehiclesQuery);
        console.log('TEST - Résultat Firestore (global):', snapshot.docs.map(doc => ({id: doc.id, ...doc.data()})));
    }
}