import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

class DetectionsManager {
    constructor() {
        this.db = getFirestore();
        this.currentPage = 1;
        this.itemsPerPage = 15;
        this.allDetections = [];
        this.filteredDetections = [];
        this.filters = {
            search: '',
            type: '',
            result: '',
            period: ''
        };
        this.cityCache = {}; // Cache pour les villes
        this.init();
    }

    async init() {
        this.waitForAuth();
        this.setupEventListeners();
    }

    waitForAuth() {
        const checkAuth = () => {
            if (window.trackingCarAuth && window.trackingCarAuth.getCurrentAdmin()) {
                this.loadDetections();
            } else {
                setTimeout(checkAuth, 100);
            }
        };
        checkAuth();
    }

    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input',
                TrackingCarUtils.debounce(() => this.handleFilterChange(), 300)
            );
        }
        ['typeFilter', 'resultFilter', 'periodFilter'].forEach(filterId => {
            const element = document.getElementById(filterId);
            if (element) {
                element.addEventListener('change', () => this.handleFilterChange());
            }
        });
        document.getElementById('clearFiltersBtn')?.addEventListener('click', () => {
            this.clearFilters();
        });
        document.getElementById('exportDetectionsBtn')?.addEventListener('click', () => {
            this.exportDetections();
        });
        document.getElementById('closeDetectionModalBtn')?.addEventListener('click', () => {
            this.closeDetectionModal();
        });
        document.getElementById('closeSelfieModalBtn')?.addEventListener('click', () => {
            this.closeSelfieModal();
        });
        document.getElementById('prevPageBtn')?.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.displayDetections();
            }
        });
        document.getElementById('nextPageBtn')?.addEventListener('click', () => {
            const totalPages = Math.ceil(this.filteredDetections.length / this.itemsPerPage);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.displayDetections();
            }
        });
        document.getElementById('sidebarToggle')?.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('-translate-x-full');
        });
        document.getElementById('userMenuBtn')?.addEventListener('click', () => {
            document.getElementById('userDropdown').classList.toggle('hidden');
        });
    }

    async loadDetections() {
        try {
            document.getElementById('loadingState').style.display = 'block';
            document.getElementById('emptyState').style.display = 'none';

            let detectionsQuery = collection(this.db, 'vehicle_checks');
            const snapshot = await getDocs(detectionsQuery);

            this.allDetections = snapshot.docs.map(doc => {
                const data = doc.data();
                let location = null;
                if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
                    location = { latitude: data.latitude, longitude: data.longitude };
                }
                return {
                    id: doc.id,
                    ...data,
                    timestamp: data.check_date,
                    location
                };
            });

            this.filteredDetections = [...this.allDetections];

            document.getElementById('loadingState').style.display = 'none';

            if (this.allDetections.length === 0) {
                document.getElementById('emptyState').style.display = 'block';
            } else {
                this.displayDetections();
                this.updateResultsCount();
                this.updateStats();
            }
        } catch (error) {
            console.error('Erreur chargement détections:', error);
            TrackingCarUtils.showNotification('Erreur lors du chargement des détections', 'error');
        }
    }

    updateStats() {
        const totalDetections = this.allDetections.length;
        const stolenDetections = this.allDetections.filter(d => d.result === 'stolen').length;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayDetections = this.allDetections.filter(d => {
            if (d.timestamp && typeof d.timestamp.toDate === 'function') {
                const detectionDate = d.timestamp.toDate();
                return detectionDate >= today;
            }
            if (d.timestamp instanceof Date) {
                return d.timestamp >= today;
            }
            return false;
        }).length;
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const activeDetectors = new Set();
        this.allDetections.forEach(d => {
            let detectionDate = null;
            if (d.timestamp && typeof d.timestamp.toDate === 'function') {
                detectionDate = d.timestamp.toDate();
            } else if (d.timestamp instanceof Date) {
                detectionDate = d.timestamp;
            }
            if (detectionDate && detectionDate >= oneWeekAgo && d.user_id) {
                activeDetectors.add(d.user_id);
            }
        });

        TrackingCarUtils.animateCounter?.('totalDetections', totalDetections);
        TrackingCarUtils.animateCounter?.('stolenDetections', stolenDetections);
        TrackingCarUtils.animateCounter?.('todayDetections', todayDetections);
        TrackingCarUtils.animateCounter?.('activeDetectors', activeDetectors.size);

        document.getElementById('totalDetections').textContent = totalDetections;
        document.getElementById('stolenDetections').textContent = stolenDetections;
        document.getElementById('todayDetections').textContent = todayDetections;
        document.getElementById('activeDetectors').textContent = activeDetectors.size;
    }

    handleFilterChange() {
        this.filters.search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        this.filters.type = document.getElementById('typeFilter')?.value || '';
        this.filters.result = document.getElementById('resultFilter')?.value || '';
        this.filters.period = document.getElementById('periodFilter')?.value || '';

        this.applyFilters();
        this.currentPage = 1;
        this.displayDetections();
        this.updateResultsCount();
    }

    applyFilters() {
        this.filteredDetections = this.allDetections.filter(detection => {
            if (this.filters.search) {
                const searchText = this.filters.search;
                const matchFields = [
                    detection.user_name,
                    detection.user_email,
                    detection.chassis_number,
                    detection.license_plate
                ].filter(Boolean).join(' ').toLowerCase();
                if (!matchFields.includes(searchText)) {
                    return false;
                }
            }
            if (this.filters.type) {
                if (this.filters.type === 'chassis' && !detection.chassis_number) return false;
                if (this.filters.type === 'plate' && !detection.license_plate) return false;
            }
            if (this.filters.result) {
                if (detection.result !== this.filters.result) return false;
            }
            if (this.filters.period && detection.timestamp) {
                let detectionDate = null;
                if (typeof detection.timestamp.toDate === 'function') {
                    detectionDate = detection.timestamp.toDate();
                } else if (detection.timestamp instanceof Date) {
                    detectionDate = detection.timestamp;
                } else if (typeof detection.timestamp === 'string') {
                    detectionDate = new Date(detection.timestamp);
                }
                if (!detectionDate) return false;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                switch (this.filters.period) {
                    case 'today':
                        if (detectionDate < today) return false;
                        break;
                    case 'week':
                        const weekAgo = new Date();
                        weekAgo.setDate(weekAgo.getDate() - 7);
                        if (detectionDate < weekAgo) return false;
                        break;
                    case 'month':
                        const monthAgo = new Date();
                        monthAgo.setDate(monthAgo.getDate() - 30);
                        if (detectionDate < monthAgo) return false;
                        break;
                }
            }
            return true;
        });
    }

    async displayDetections() {
        const container = document.getElementById('detectionsList');
        if (!container) return;

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const detectionsToShow = this.filteredDetections.slice(startIndex, endIndex);

        if (detectionsToShow.length === 0 && this.filteredDetections.length > 0) {
            this.currentPage = 1;
            this.displayDetections();
            return;
        }

        if (detectionsToShow.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-search text-4xl text-gray-300 mb-4"></i>
                    <p class="text-gray-500 mb-4">Aucune détection ne correspond à vos critères</p>
                    <button onclick="document.getElementById('clearFiltersBtn').click()" class="btn btn-primary">
                        Effacer les filtres
                    </button>
                </div>
            `;
            document.getElementById('pagination').classList.add('hidden');
            return;
        }

        // Affichage asynchrone des villes pour chaque carte
        const cards = await Promise.all(detectionsToShow.map((detection, index) =>
            this.createDetectionCard(detection, startIndex + index)
        ));
        container.innerHTML = cards.join('');
        this.updatePagination();
    }

    async getCityFromCoords(lat, lng) {
        const key = `${lat},${lng}`;
        if (this.cityCache[key]) return this.cityCache[key];
        try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
            const data = await resp.json();
            const city = data.address?.city || data.address?.town || data.address?.village || data.address?.county || 'Localisation inconnue';
            this.cityCache[key] = city;
            return city;
        } catch {
            this.cityCache[key] = 'Localisation inconnue';
            return 'Localisation inconnue';
        }
    }

    async renderLocation(detection) {
        if (!detection.location) return '';
        const key = `${detection.location.latitude},${detection.location.longitude}`;
        let city = this.cityCache[key];
        if (!city) {
            city = await this.getCityFromCoords(detection.location.latitude, detection.location.longitude);
        }
        return `
            <div class="mt-1">
                <i class="fas fa-map-marker-alt mr-1"></i>
                ${city}
            </div>
        `;
    }

    async createDetectionCard(detection, index) {
        const isStolen = detection.result === 'stolen';
        const resultColor = isStolen ? 'red' : 'green';
        const resultIcon = isStolen ? 'exclamation-triangle' : 'check-circle';
        const resultText = isStolen ? 'VÉHICULE VOLÉ DÉTECTÉ' : 'VÉHICULE PROPRE';
        const verificationType = detection.chassis_number ? 'Châssis' : 'Plaque';
        const verificationValue = detection.chassis_number || detection.license_plate || 'N/A';
        const locationHtml = detection.location ? await this.renderLocation(detection) : '';

        // Version précédente AVEC les boutons d'action
        return `
            <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all duration-300 bg-white slide-in-right" 
                 style="animation-delay: ${index * 50}ms">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex-1">
                        <div class="flex items-center space-x-2 mb-2">
                            <h3 class="font-semibold text-gray-900">${detection.user_name || 'Utilisateur anonyme'}</h3>
                            <span class="status-badge bg-${resultColor}-100 text-${resultColor}-800">
                                <i class="fas fa-${resultIcon} mr-1"></i>
                                ${resultText}
                            </span>
                        </div>
                        <p class="text-sm text-gray-600">
                            <i class="fas fa-envelope mr-1"></i>
                            ${detection.user_email || 'Email non défini'}
                        </p>
                    </div>
                    <div class="text-right text-sm text-gray-500">
                        <div>${TrackingCarUtils.formatDate(detection.timestamp)}</div>
                        ${locationHtml}
                    </div>
                </div>
                <div class="bg-gray-50 rounded-lg p-3 mb-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div>
                            <span class="text-gray-600">Type de vérification:</span>
                            <span class="ml-2 font-medium">${verificationType}</span>
                        </div>
                        <div>
                            <span class="text-gray-600">Valeur vérifiée:</span>
                            <span class="ml-2 font-mono text-xs bg-white px-2 py-1 rounded">${verificationValue}</span>
                        </div>
                        ${detection.device_info?.platform ? `
                            <div>
                                <span class="text-gray-600">Plateforme:</span>
                                <span class="ml-2 font-medium">${detection.device_info.platform}</span>
                            </div>
                        ` : ''}
                        <div>
                            <span class="text-gray-600">ID Utilisateur:</span>
                            <span class="ml-2 font-mono text-xs">${detection.user_id || 'N/A'}</span>
                        </div>
                    </div>
                </div>
                ${isStolen && detection.vehicleDetails ? `
                    <div class="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                        <h4 class="font-medium text-red-900 mb-2">
                            <i class="fas fa-car mr-1"></i>
                            Détails du véhicule volé
                        </h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                            <div>
                                <span class="text-red-700">Marque:</span>
                                <span class="ml-2 font-medium">${detection.vehicleDetails.make || 'N/A'}</span>
                            </div>
                            <div>
                                <span class="text-red-700">Modèle:</span>
                                <span class="ml-2 font-medium">${detection.vehicleDetails.model || 'N/A'}</span>
                            </div>
                            <div>
                                <span class="text-red-700">Couleur:</span>
                                <span class="ml-2 font-medium">${detection.vehicleDetails.color || 'N/A'}</span>
                            </div>
                            <div>
                                <span class="text-red-700">Date du vol:</span>
                                <span class="ml-2 font-medium">${TrackingCarUtils.formatDate(detection.vehicleDetails.theft_date, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                            </div>
                        </div>
                    </div>
                ` : ''}
                <div class="flex justify-end space-x-2">
                    ${detection.selfie_url ? `
                        <button onclick="detectionsManager.viewSelfie('${detection.selfie_url}', '${detection.user_name || 'Utilisateur'}', '${TrackingCarUtils.formatDate(detection.timestamp)}')" 
                                class="btn text-sm bg-purple-100 text-purple-700 hover:bg-purple-200 px-3 py-1">
                            <i class="fas fa-camera mr-1"></i>Photo
                        </button>
                    ` : ''}
                    ${detection.location ? `
                        <button onclick="detectionsManager.viewLocation(${detection.location.latitude}, ${detection.location.longitude})" 
                                class="btn text-sm bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1">
                            <i class="fas fa-map-marker-alt mr-1"></i>Localisation
                        </button>
                    ` : ''}
                    <button onclick="detectionsManager.viewDetectionDetails('${detection.id}')" 
                            class="btn text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1">
                        <i class="fas fa-eye mr-1"></i>Détails complets
                    </button>
                    ${isStolen ? `
                        <button onclick="detectionsManager.processReward('${detection.id}')" 
                                class="btn text-sm bg-yellow-100 text-yellow-700 hover:bg-yellow-200 px-3 py-1">
                            <i class="fas fa-gift mr-1"></i>Récompense
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    updatePagination() {
        const totalPages = Math.ceil(this.filteredDetections.length / this.itemsPerPage);
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
        const endItem = Math.min(this.currentPage * this.itemsPerPage, this.filteredDetections.length);
        
        document.getElementById('pageStart').textContent = startItem;
        document.getElementById('pageEnd').textContent = endItem;
        document.getElementById('totalItems').textContent = this.filteredDetections.length;

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
                this.displayDetections();
            };
            pageNumbers.appendChild(button);
        }
    }

    updateResultsCount() {
        const resultsCount = document.getElementById('resultsCount');
        if (resultsCount) {
            resultsCount.textContent = `${this.filteredDetections.length} détection(s) trouvée(s)`;
        }
    }

    clearFilters() {
        document.getElementById('searchInput').value = '';
        document.getElementById('typeFilter').value = '';
        document.getElementById('resultFilter').value = '';
        document.getElementById('periodFilter').value = '';
        
        this.filters = { search: '', type: '', result: '', period: '' };
        this.filteredDetections = [...this.allDetections];
        this.currentPage = 1;
        this.displayDetections();
        this.updateResultsCount();
    }

    viewSelfie(selfieUrl, userName, timestamp) {
        const modal = document.getElementById('selfieModal');
        const image = document.getElementById('selfieImage');
        const info = document.getElementById('selfieInfo');
        
        if (!modal || !image || !info) return;

        image.src = selfieUrl;
        info.innerHTML = `
            <div class="space-y-1">
                <div><strong>Détecteur:</strong> ${userName}</div>
                <div><strong>Date:</strong> ${timestamp}</div>
                <div class="text-xs text-gray-500">Photo prise automatiquement lors de la détection d'un véhicule volé</div>
            </div>
        `;

        modal.classList.remove('hidden');
    }

    closeSelfieModal() {
        document.getElementById('selfieModal').classList.add('hidden');
    }

    viewLocation(latitude, longitude) {
        const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
        window.open(url, '_blank');
    }

    viewDetectionDetails(detectionId) {
        const detection = this.allDetections.find(d => d.id === detectionId);
        if (!detection) return;

        const modal = document.getElementById('detectionModal');
        const modalContent = document.getElementById('detectionModalContent');
        
        if (!modal || !modalContent) return;

        const isStolen = detection.result === 'stolen';
        
        modalContent.innerHTML = `
            <div class="space-y-6">
                <!-- Informations utilisateur -->
                <div>
                    <h4 class="font-semibold text-gray-900 mb-3">Informations du détecteur</h4>
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span class="text-gray-600">Nom:</span>
                            <span class="ml-2 font-medium">${detection.user_name || 'N/A'}</span>
                        </div>
                        <div>
                            <span class="text-gray-600">Email:</span>
                            <span class="ml-2 font-medium">${detection.user_email || 'N/A'}</span>
                        </div>
                        <div>
                            <span class="text-gray-600">ID Utilisateur:</span>
                            <span class="ml-2 font-mono text-xs">${detection.user_id || 'N/A'}</span>
                        </div>
                        <div>
                            <span class="text-gray-600">Date de détection:</span>
                            <span class="ml-2 font-medium">${TrackingCarUtils.formatDate(detection.timestamp)}</span>
                        </div>
                    </div>
                </div>
                <div>
                    <h4 class="font-semibold text-gray-900 mb-3">Détails de la vérification</h4>
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        ${detection.chassis_number ? `
                            <div class="col-span-2">
                                <span class="text-gray-600">Numéro de châssis vérifié:</span>
                                <span class="ml-2 font-mono bg-gray-100 px-2 py-1 rounded">${detection.chassis_number}</span>
                            </div>
                        ` : ''}
                        ${detection.license_plate ? `
                            <div class="col-span-2">
                                <span class="text-gray-600">Plaque d'immatriculation vérifiée:</span>
                                <span class="ml-2 font-mono bg-gray-100 px-2 py-1 rounded">${detection.license_plate}</span>
                            </div>
                        ` : ''}
                        <div class="col-span-2">
                            <span class="text-gray-600">Résultat:</span>
                            <span class="ml-2 font-medium ${isStolen ? 'text-red-600' : 'text-green-600'}">
                                ${isStolen ? 'VÉHICULE VOLÉ DÉTECTÉ' : 'VÉHICULE PROPRE'}
                            </span>
                        </div>
                    </div>
                </div>
                ${isStolen && detection.vehicleDetails ? `
                    <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h4 class="font-semibold text-red-900 mb-3">Détails du véhicule volé détecté</h4>
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span class="text-red-700">Marque:</span>
                                <span class="ml-2 font-medium">${detection.vehicleDetails.make || 'N/A'}</span>
                            </div>
                            <div>
                                <span class="text-red-700">Modèle:</span>
                                <span class="ml-2 font-medium">${detection.vehicleDetails.model || 'N/A'}</span>
                            </div>
                            <div>
                                <span class="text-red-700">Couleur:</span>
                                <span class="ml-2 font-medium">${detection.vehicleDetails.color || 'N/A'}</span>
                            </div>
                            <div>
                                <span class="text-red-700">Année:</span>
                                <span class="ml-2 font-medium">${detection.vehicleDetails.year || 'N/A'}</span>
                            </div>
                            <div>
                                <span class="text-red-700">Date du vol:</span>
                                <span class="ml-2 font-medium">${TrackingCarUtils.formatDate(detection.vehicleDetails.theft_date)}</span>
                            </div>
                            <div>
                                <span class="text-red-700">Lieu:</span>
                                <span class="ml-2 font-medium">${detection.vehicleDetails.location || 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                ` : ''}
                <div class="flex space-x-2 mt-4">
                    ${isStolen ? `
                        <button onclick="detectionsManager.processReward('${detection.id}')" 
                                class="btn btn-warning text-sm">
                            <i class="fas fa-gift mr-1"></i>Traiter la récompense
                        </button>
                    ` : ''}
                    <button onclick="detectionsManager.exportSingleDetection('${detection.id}')" 
                            class="btn btn-secondary text-sm">
                        <i class="fas fa-download mr-1"></i>Exporter cette détection
                    </button>
                </div>
            </div>
        </div>
        `;
        modal.classList.remove('hidden');
    }

    closeDetectionModal() {
        document.getElementById('detectionModal').classList.add('hidden');
    }

    processReward(detectionId) {
        window.location.href = `../rewards/list.html?detection=${detectionId}`;
    }

    exportData() {
        // Génère le CSV à partir des véhicules filtrés
        const detections = this.filteredDetections || [];
        if (detections.length === 0) {
            alert("Aucune donnée à exporter !");
            return;
        }
        // Colonnes utiles
        const headers = [
            "Date",
            "Détecteur",
            "Email",
            "Type",
            "Valeur",
            "Résultat",
            "Marque",
            "Modèle",
            "Couleur",
            "Lieu du vol",
            "Légion",
            "Plateforme"
        ];
        const legionMap = window.TrackingCarConfig?.LEGIONS || {};
        const rows = detections.map(d => {
            // Date
            let date = '';
            if (d.timestamp && typeof d.timestamp.toDate === 'function') {
                const dt = d.timestamp.toDate();
                date = dt.toLocaleDateString('fr-FR') + ' ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            } else if (d.timestamp instanceof Date) {
                date = d.timestamp.toLocaleDateString('fr-FR') + ' ' + d.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            }
            // Détecteur
            const detector = d.user_name || '';
            // Email
            const email = d.user_email || '';
            // Type & Valeur
            let type = '', valeur = '';
            if (d.chassis_number) {
                type = 'Châssis';
                valeur = d.chassis_number;
            } else if (d.license_plate) {
                type = 'Plaque';
                valeur = d.license_plate;
            }
            // Résultat
            let resultat = d.result === 'stolen' ? 'VÉHICULE VOLÉ' : 'VÉHICULE PROPRE';
            // Marque, Modèle, Couleur, Lieu du vol, Légion
            let marque = '', modele = '', couleur = '', lieu = '', legion = '', plateforme = '';
            if (d.result === 'stolen' && d.result_data && d.result_data.vehicleDetails) {
                const v = d.result_data.vehicleDetails;
                marque = v.make || '';
                modele = v.model || '';
                couleur = v.color || '';
                lieu = v.theft_location || '';
                legion = legionMap[v.legion]?.name || v.legion || '';
            }
            plateforme = d.device_info?.platform || '';
            // Échapper les valeurs
            const escape = val => '"' + String(val ?? '').replace(/"/g, '""') + '"';
            return [date, detector, email, type, valeur, resultat, marque, modele, couleur, lieu, legion, plateforme].map(escape).join(';');
        });
        // Ajoute le BOM UTF-8 pour Excel
        const csv = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "detections_tracking_car_" + new Date().toISOString().slice(0,10) + ".csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.detectionsManager = new DetectionsManager();
});