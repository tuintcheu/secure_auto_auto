// Rapports et analyses - TRACKING CAR
import { getFirestore, collection, query, where, getDocs, orderBy, Timestamp, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { TrackingCarUtils } from './utils.js'; 
export class ReportsManager {
    constructor() {
        this.db = getFirestore();
        this.charts = {};
        this.currentPeriod = 30;
        this.reportData = {};
        this.unsubscribeFns = [];
        this.tryUpdateReports = TrackingCarUtils.debounce(this.tryUpdateReports.bind(this), 300); // Ajoute ce debounce
        this.init();
    }

    async init() {
        this.waitForAuth();
        this.setupEventListeners();
    }

    waitForAuth() {
        const checkAuth = () => {
            if (window.trackingCarAuth && window.trackingCarAuth.getCurrentAdmin()) {
                this.loadReports();
            } else {
                setTimeout(checkAuth, 100);
            }
        };
        checkAuth();
    }

    setupEventListeners() {
        // Sélecteur de période
        document.getElementById('periodSelector')?.addEventListener('change', (e) => {
            this.currentPeriod = parseInt(e.target.value);
            this.loadReports();
        });

        // Boutons de toggle des graphiques
        document.querySelectorAll('.chart-toggle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.handleChartToggle(e.target);
            });
        });

        // Type de heatmap
        document.getElementById('heatmapType')?.addEventListener('change', (e) => {
            this.updateHeatmap(e.target.value);
        });

        // Génération de rapport
        document.getElementById('generateReportBtn')?.addEventListener('click', () => {
            this.generateCompleteReport();
        });

        // Export tableau détaillé
        document.getElementById('exportDetailedBtn')?.addEventListener('click', () => {
            this.exportDetailedStats();
        });

        // UI
        document.getElementById('sidebarToggle')?.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('-translate-x-full');
        });

        document.getElementById('userMenuBtn')?.addEventListener('click', () => {
            document.getElementById('userDropdown').classList.toggle('hidden');
        });
    }

    loadReports() {
        // Nettoyer les anciens listeners
        this.unsubscribeFns.forEach(unsub => unsub());
        this.unsubscribeFns = [];

        TrackingCarUtils.showLoading(true, 'Chargement des rapports...');

        // Calculer les dates
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - this.currentPeriod);

        // Lancer les listeners en temps réel
        this.listenVehiclesData(startDate, endDate);
        this.listenDetectionsData(startDate, endDate);
        this.listenUsersData(startDate, endDate);
        this.listenRewardsData(startDate, endDate);
    }

    listenVehiclesData(startDate, endDate) {
        const auth = window.trackingCarAuth;
        const vehiclesCol = collection(this.db, 'stolen_vehicles');
        const allConstraints = [];
        if (!auth.isGlobalAdmin()) {
            const legion = auth.getLegion();
            if (legion) {
                allConstraints.push(where('legion', '==', legion));
            }
        }

        // Listener pour tous les véhicules (filtré légion si besoin)
        const unsubAll = onSnapshot(
            allConstraints.length > 0 ? query(vehiclesCol, ...allConstraints) : vehiclesCol,
            (snapshot) => {
                this.reportData.allVehicles = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                this.tryUpdateReports();
            }
        );
        this.unsubscribeFns.push(unsubAll);

        // Listener pour la période (filtré légion ET date)
        const periodConstraints = [...allConstraints];
        periodConstraints.push(where('theft_date', '>=', Timestamp.fromDate(startDate)));
        periodConstraints.push(where('theft_date', '<=', Timestamp.fromDate(endDate)));
        const periodQuery = query(vehiclesCol, ...periodConstraints);

        const unsubPeriod = onSnapshot(periodQuery, (snapshot) => {
            this.reportData.periodVehicles = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            this.tryUpdateReports();
        });
        this.unsubscribeFns.push(unsubPeriod);
    }

    listenDetectionsData(startDate, endDate) {
        const auth = window.trackingCarAuth;
        const detectionsCol = collection(this.db, 'detections');
        const allConstraints = [];
        if (!auth.isGlobalAdmin()) {
            const legion = auth.getLegion();
            if (legion) {
                allConstraints.push(where('legion', '==', legion));
            }
        }

        // Listener pour toutes les détections (filtré légion si besoin)
        const unsubAll = onSnapshot(
            allConstraints.length > 0 ? query(detectionsCol, ...allConstraints) : detectionsCol,
            (snapshot) => {
                this.reportData.allDetections = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                this.tryUpdateReports();
            }
        );
        this.unsubscribeFns.push(unsubAll);

        // Listener pour la période (filtré légion ET date)
        const periodConstraints = [...allConstraints];
        periodConstraints.push(where('timestamp', '>=', Timestamp.fromDate(startDate)));
        periodConstraints.push(where('timestamp', '<=', Timestamp.fromDate(endDate)));
        const periodQuery = query(detectionsCol, ...periodConstraints);

        const unsubPeriod = onSnapshot(periodQuery, (snapshot) => {
            this.reportData.periodDetections = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            this.tryUpdateReports();
        });
        this.unsubscribeFns.push(unsubPeriod);
    }

    listenUsersData(startDate, endDate) {
        const usersQuery = collection(this.db, 'users');
        const unsub = onSnapshot(usersQuery, (snapshot) => {
            this.reportData.allUsers = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Filtrer les utilisateurs actifs dans la période
            this.reportData.activeUsers = this.reportData.allUsers.filter(user => {
                if (user.lastActive) {
                    const lastActive = user.lastActive.toDate();
                    return lastActive >= startDate && lastActive <= endDate;
                }
                return false;
            });
            this.tryUpdateReports();
        });
        this.unsubscribeFns.push(unsub);
    }

    listenRewardsData(startDate, endDate) {
        const auth = window.trackingCarAuth;
        let rewardsQuery = collection(this.db, 'rewards');
        if (!auth.isGlobalAdmin()) {
            const legion = auth.getLegion();
            if (legion) {
                rewardsQuery = query(rewardsQuery, where('legion', '==', legion));
            }
        }

        // Listener pour toutes les récompenses
        const unsubAll = onSnapshot(rewardsQuery, (snapshot) => {
            this.reportData.allRewards = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            this.tryUpdateReports();
        });
        this.unsubscribeFns.push(unsubAll);

        // Listener pour la période
        const periodQuery = query(
            rewardsQuery,
            where('created_at', '>=', Timestamp.fromDate(startDate)),
            where('created_at', '<=', Timestamp.fromDate(endDate))
        );
        const unsubPeriod = onSnapshot(periodQuery, (snapshot) => {
            this.reportData.periodRewards = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            this.tryUpdateReports();
        });
        this.unsubscribeFns.push(unsubPeriod);
    }

    // Cette méthode s'assure que toutes les données sont chargées avant de mettre à jour l'UI
    tryUpdateReports() {
        // Vérifier que toutes les clés nécessaires sont présentes
        if (
            this.reportData.allVehicles &&
            this.reportData.periodVehicles &&
            this.reportData.allDetections &&
            this.reportData.periodDetections &&
            this.reportData.allUsers &&
            this.reportData.activeUsers &&
            this.reportData.allRewards &&
            this.reportData.periodRewards
        ) {
            try {
                this.calculateMetrics();
                this.updateCharts();
                this.updateAnalytics();
                this.updateDetailedStats();
            } catch (error) {
                console.error('Erreur mise à jour UI:', error);
            } finally {
                TrackingCarUtils.showLoading(false);
            }
        }
        console.log('periodVehicles', this.reportData.periodVehicles);
        console.log('periodDetections', this.reportData.periodDetections);
    }

    async calculateMetrics() {
        const metrics = {};

        // Véhicules volés
        metrics.totalStolenVehicles = this.reportData.periodVehicles.length;
        const recoveredVehicles = this.reportData.allVehicles.filter(v => v.status === 'recovered').length;
        
        // Détections
        metrics.totalDetections = this.reportData.periodDetections.length;
        metrics.stolenDetections = this.reportData.periodDetections.filter(d => 
            d.result_data?.result === 'stolen'
        ).length;

        // Taux de récupération
        const totalVehicles = this.reportData.allVehicles.length;
        metrics.recoveryRate = totalVehicles > 0 ? 
            Math.round((recoveredVehicles / totalVehicles) * 100) : 0;

        // Utilisateurs actifs
        metrics.activeUsers = this.reportData.activeUsers.length;

        // Calculer les tendances (comparaison avec la période précédente)
        await this.calculateTrends(metrics);

        this.reportData.metrics = metrics;
        this.updateMetricsUI(metrics);
    }

    async calculateTrends(metrics) {
        // Calculer les données de la période précédente pour les tendances
        const previousEndDate = new Date();
        previousEndDate.setDate(previousEndDate.getDate() - this.currentPeriod);
        const previousStartDate = new Date();
        previousStartDate.setDate(previousStartDate.getDate() - (this.currentPeriod * 2));

        try {
            // Charger les données de la période précédente
            const auth = window.trackingCarAuth;
            let vehiclesQuery = collection(this.db, 'stolen_vehicles');
            let detectionsQuery = collection(this.db, 'detections');

            if (!auth.isGlobalAdmin()) {
                const legion = auth.getLegion();
                if (legion) {
                    vehiclesQuery = query(vehiclesQuery, where('legion', '==', legion));
                    detectionsQuery = query(detectionsQuery, where('legion', '==', legion));
                }
            }

            const [prevVehiclesSnap, prevDetectionsSnap] = await Promise.all([
                getDocs(query(vehiclesQuery,
                    where('theft_date', '>=', Timestamp.fromDate(previousStartDate)),
                    where('theft_date', '<=', Timestamp.fromDate(previousEndDate))
                )),
                getDocs(query(detectionsQuery,
                    where('timestamp', '>=', Timestamp.fromDate(previousStartDate)),
                    where('timestamp', '<=', Timestamp.fromDate(previousEndDate))
                )),
            ,]);

            const prevVehicles = prevVehiclesSnap.size;
            const prevDetections = prevDetectionsSnap.size;

            // Calculer les pourcentages de changement
            metrics.vehiclesTrend = this.calculatePercentageChange(prevVehicles, metrics.totalStolenVehicles);
            metrics.detectionsTrend = this.calculatePercentageChange(prevDetections, metrics.totalDetections);

        } catch (error) {
            console.error('Erreur calcul tendances:', error);
            metrics.vehiclesTrend = 0;
            metrics.detectionsTrend = 0;
        }
    }

    calculatePercentageChange(previous, current) {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
    }

    updateMetricsUI(metrics) {
        // Véhicules volés
        document.getElementById('totalStolenVehicles').textContent = metrics.totalStolenVehicles;
        document.getElementById('stolenVehiclesTrend').innerHTML = this.formatTrend(metrics.vehiclesTrend);

        // Détections
        document.getElementById('totalDetections').textContent = metrics.totalDetections;
        document.getElementById('detectionsTrend').innerHTML = this.formatTrend(metrics.detectionsTrend);

        // Taux de récupération
        document.getElementById('recoveryRate').textContent = `${metrics.recoveryRate}%`;
        document.getElementById('recoveryTrend').innerHTML = this.formatTrend(metrics.recoveryRate - 50); // Baseline à 50%

        // Utilisateurs actifs
        document.getElementById('activeUsers').textContent = metrics.activeUsers;
        document.getElementById('usersTrend').innerHTML = this.formatTrend(10); // Trend simulé
    }

    formatTrend(percentage) {
        if (percentage > 0) {
            return `<span class="text-green-600"><i class="fas fa-arrow-up mr-1"></i>+${percentage}%</span>`;
        } else if (percentage < 0) {
            return `<span class="text-red-600"><i class="fas fa-arrow-down mr-1"></i>${percentage}%</span>`;
        } else {
            return `<span class="text-gray-500"><i class="fas fa-minus mr-1"></i>0%</span>`;
        }
    }

    updateCharts() {
        this.createTheftsChart();
        this.createLegionDetectionsChart();
    }

    createTheftsChart() {
        const ctx = document.getElementById('theftsChart');
        if (ctx) ctx.height = 250;

        if (this.charts.thefts) {
            this.charts.thefts.destroy();
        }

        // Préparer les données par jour pour la période
        const dailyData = this.prepareDailyTheftsData();

        this.charts.thefts = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dailyData.labels,
                datasets: [{
                    label: 'Véhicules volés',
                    data: dailyData.data,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }

    prepareDailyTheftsData() {
        const days = this.currentPeriod;
        const labels = [];
        const data = [];
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            labels.push(date.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' }));
            
            // Compter les vols pour ce jour
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(date);
            dayEnd.setHours(23, 59, 59, 999);
            
            const theftsCount = this.reportData.periodVehicles.filter(vehicle => {
                if (vehicle.theft_date) {
                    const theftDate = vehicle.theft_date.toDate();
                    return theftDate >= dayStart && theftDate <= dayEnd;
                }
                return false;
            }).length;
            
            data.push(theftsCount);
        }
        
        return { labels, data };
    }

    createLegionDetectionsChart() {
        const ctx = document.getElementById('legionDetectionsChart');
        if (!ctx) return;

        if (this.charts.legionDetections) {
            this.charts.legionDetections.destroy();
        }

        // Préparer les données par légion
        const legionData = this.prepareLegionDetectionsData();

        this.charts.legionDetections = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: legionData.labels,
                datasets: [{
                    data: legionData.data,
                    backgroundColor: [
                        '#ef4444', '#f97316', '#f59e0b', '#eab308',
                        '#84cc16', '#22c55e', '#10b981', '#14b8a6',
                        '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1'
                    ],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true
                        }
                    }
                }
            }
        });
    }

    prepareLegionDetectionsData() {
        const legionCounts = {};
        
        // Compter les détections par légion
        this.reportData.periodDetections.forEach(detection => {
            const legion = detection.legion || 'Non définie';
            legionCounts[legion] = (legionCounts[legion] || 0) + 1;
        });

        // Convertir en format Chart.js
        const labels = Object.keys(legionCounts).map(code => 
            TrackingCarUtils.getLegionName(code) || code
        );
        const data = Object.values(legionCounts);

        return { labels, data };
    }

    updateAnalytics() {
        this.updateTopBrands();
        this.updateLegionEfficiency();
        this.updateTopDetectors();
    }

    updateTopBrands() {
        const brandCounts = {};
        
        this.reportData.periodVehicles.forEach(vehicle => {
            const brand = vehicle.make || 'Marque inconnue';
            brandCounts[brand] = (brandCounts[brand] || 0) + 1;
        });

        const sortedBrands = Object.entries(brandCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5);

        const container = document.getElementById('topBrands');
        if (sortedBrands.length === 0) {
            container.innerHTML = `
                <div class="text-center text-gray-500 py-4">
                    <i class="fas fa-car text-2xl mb-2"></i>
                    <p>Aucune donnée disponible</p>
                </div>
            `;
            return;
        }

        const maxCount = sortedBrands[0][1];
        
        container.innerHTML = sortedBrands.map(([brand, count]) => {
            const percentage = (count / maxCount) * 100;
            return `
                <div class="flex items-center justify-between">
                    <span class="text-sm font-medium text-gray-900">${brand}</span>
                    <div class="flex items-center space-x-2">
                        <div class="w-20 bg-gray-200 rounded-full h-2">
                            <div class="bg-red-500 h-2 rounded-full" style="width: ${percentage}%"></div>
                        </div>
                        <span class="text-sm text-gray-600 w-8">${count}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateLegionEfficiency() {
        const auth = window.trackingCarAuth;
        
        if (!auth.isGlobalAdmin()) {
            // Pour admin de légion, afficher ses propres stats
            const legion = auth.getLegion();
            const legionVehicles = this.reportData.allVehicles.filter(v => v.legion === legion);
            const recoveredCount = legionVehicles.filter(v => v.status === 'recovered').length;
            const efficiency = legionVehicles.length > 0 ? 
                Math.round((recoveredCount / legionVehicles.length) * 100) : 0;

            document.getElementById('legionEfficiency').innerHTML = `
                <div class="text-center">
                    <div class="text-3xl font-bold text-blue-600">${efficiency}%</div>
                    <div class="text-sm text-gray-500">Taux de récupération</div>
                    <div class="text-xs text-gray-400 mt-1">${recoveredCount}/${legionVehicles.length} véhicules</div>
                </div>
            `;
            return;
        }

        // Pour admin global, afficher le top 5 des légions
        const legionStats = {};
        
        Object.keys(window.TrackingCarConfig.LEGIONS).forEach(legionCode => {
            const legionVehicles = this.reportData.allVehicles.filter(v => v.legion === legionCode);
            const recoveredCount = legionVehicles.filter(v => v.status === 'recovered').length;
            const efficiency = legionVehicles.length > 0 ? 
                Math.round((recoveredCount / legionVehicles.length) * 100) : 0;
            
            if (legionVehicles.length > 0) {
                legionStats[legionCode] = { efficiency, total: legionVehicles.length, recovered: recoveredCount };
            }
        });

        const sortedLegions = Object.entries(legionStats)
            .sort(([,a], [,b]) => b.efficiency - a.efficiency)
            .slice(0, 5);

        const container = document.getElementById('legionEfficiency');
        if (sortedLegions.length === 0) {
            container.innerHTML = `
                <div class="text-center text-gray-500 py-4">
                    <i class="fas fa-chart-line text-2xl mb-2"></i>
                    <p>Aucune donnée disponible</p>
                </div>
            `;
            return;
        }

        container.innerHTML = sortedLegions.map(([legionCode, stats]) => {
            const legionName = TrackingCarUtils.getLegionName(legionCode);
            return `
                <div class="flex items-center justify-between">
                    <div>
                        <div class="text-sm font-medium text-gray-900">${legionName}</div>
                        <div class="text-xs text-gray-500">${stats.recovered}/${stats.total} récupérés</div>
                    </div>
                    <div class="text-right">
                        <div class="text-lg font-bold text-green-600">${stats.efficiency}%</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateTopDetectors() {
        const detectorStats = {};
        
        this.reportData.periodDetections
            .filter(d => d.result_data?.result === 'stolen')
            .forEach(detection => {
                const detectorKey = detection.user_name || detection.user_email || 'Utilisateur anonyme';
                detectorStats[detectorKey] = (detectorStats[detectorKey] || 0) + 1;
            });

        const sortedDetectors = Object.entries(detectorStats)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5);

        const container = document.getElementById('topDetectors');
        if (sortedDetectors.length === 0) {
            container.innerHTML = `
                <div class="text-center text-gray-500 py-4">
                    <i class="fas fa-medal text-2xl mb-2"></i>
                    <p>Aucune détection dans la période</p>
                </div>
            `;
            return;
        }

        container.innerHTML = sortedDetectors.map(([detector, count], index) => {
            const medal = index === 0 ? 'fas fa-trophy text-yellow-500' : 
                         index === 1 ? 'fas fa-medal text-gray-400' : 
                         index === 2 ? 'fas fa-medal text-orange-500' : 
                         'fas fa-star text-blue-500';
            
            return `
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-2">
                        <i class="${medal}"></i>
                        <span class="text-sm font-medium text-gray-900">${detector}</span>
                    </div>
                    <span class="text-sm text-gray-600 font-bold">${count}</span>
                </div>
            `;
        }).join('');
    }

    updateDetailedStats() {
        const tbody = document.getElementById('statsTableBody');
        if (!tbody) return;

        const auth = window.trackingCarAuth;
        let legionsToShow = [];

        if (auth.isGlobalAdmin()) {
            // Admin global : toutes les légions
            legionsToShow = Object.keys(window.TrackingCarConfig.LEGIONS);
        } else {
            // Admin de légion : seulement sa légion
            legionsToShow = [auth.getLegion()];
        }

        tbody.innerHTML = legionsToShow.map(legionCode => {
            const legionName = TrackingCarUtils.getLegionName(legionCode);
            
            // Calculer les stats pour cette légion
            const legionVehicles = this.reportData.allVehicles.filter(v => v.legion === legionCode);
            const legionDetections = this.reportData.allDetections.filter(d => d.legion === legionCode);
            const legionRecovered = legionVehicles.filter(v => v.status === 'recovered');
            const legionRewards = this.reportData.allRewards.filter(r => r.legion === legionCode);
            const legionActiveUsers = this.reportData.activeUsers.filter(u => u.legion === legionCode);
            
            const recoveryRate = legionVehicles.length > 0 ? 
                Math.round((legionRecovered.length / legionVehicles.length) * 100) : 0;
            
            const paidRewards = legionRewards.filter(r => r.status === 'paid');
            const totalAmount = paidRewards.reduce((sum, r) => sum + (r.amount || 0), 0);

            return `
                <tr>
                    <td class="font-medium">${legionName}</td>
                    <td>${legionVehicles.length}</td>
                    <td>${legionDetections.length}</td>
                    <td>${legionRecovered.length}</td>
                    <td>
                        <span class="px-2 py-1 text-xs rounded-full ${
                            recoveryRate >= 70 ? 'bg-green-100 text-green-800' :
                            recoveryRate >= 40 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                        }">
                            ${recoveryRate}%
                        </span>
                    </td>
                    <td>${legionActiveUsers.length}</td>
                    <td>${paidRewards.length}</td>
                    <td class="font-medium">${TrackingCarUtils.formatCurrency(totalAmount)}</td>
                </tr>
            `;
        }).join('');
    }

    handleChartToggle(button) {
        // Mettre à jour les boutons actifs
        const chartType = button.dataset.chart;
        const period = button.dataset.period;
        
        document.querySelectorAll(`[data-chart="${chartType}"]`).forEach(btn => {
            btn.classList.remove('active');
        });
        button.classList.add('active');

        // Recharger le graphique avec la nouvelle période
        if (chartType === 'thefts') {
            this.createTheftsChart(period);
        }
    }

    async generateCompleteReport() {
        try {
            TrackingCarUtils.showLoading(true, 'Génération du rapport complet...');

            const reportData = {
                generatedAt: new Date().toISOString(),
                period: `${this.currentPeriod} derniers jours`,
                admin: {
                    name: window.trackingCarAuth.getAdminData()?.displayName || 'Administrateur',
                    email: window.trackingCarAuth.getCurrentAdmin()?.email,
                    role: window.trackingCarAuth.isGlobalAdmin() ? 'Admin Global' : 'Admin Légion'
                },
                summary: {
                    totalVehicles: this.reportData.metrics.totalStolenVehicles,
                    totalDetections: this.reportData.metrics.totalDetections,
                    recoveryRate: this.reportData.metrics.recoveryRate,
                    activeUsers: this.reportData.metrics.activeUsers
                },
                details: {
                    vehiclesByBrand: this.getVehiclesByBrand(),
                    detectionsByLegion: this.getDetectionsByLegion(),
                    topDetectors: this.getTopDetectors(),
                    financialSummary: this.getFinancialSummary()
                }
            };

            // Créer le rapport CSV
            const csvContent = this.generateReportCSV(reportData);
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `rapport_tracking_car_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            TrackingCarUtils.showNotification('Rapport complet généré avec succès', 'success');

        } catch (error) {
            console.error('Erreur génération rapport:', error);
            TrackingCarUtils.showNotification('Erreur lors de la génération du rapport', 'error');
        } finally {
            TrackingCarUtils.showLoading(false);
        }
    }

    getVehiclesByBrand() {
        const brandCounts = {};
        this.reportData.periodVehicles.forEach(vehicle => {
            const brand = vehicle.make || 'Marque inconnue';
            brandCounts[brand] = (brandCounts[brand] || 0) + 1;
        });
        return brandCounts;
    }

    getDetectionsByLegion() {
        const legionCounts = {};
        this.reportData.periodDetections.forEach(detection => {
            const legion = detection.legion || 'Non définie';
            legionCounts[legion] = (legionCounts[legion] || 0) + 1;
        });
        return legionCounts;
    }

    getTopDetectors() {
        const detectorStats = {};
        this.reportData.periodDetections
            .filter(d => d.result_data?.result === 'stolen')
            .forEach(detection => {
                const detectorKey = detection.user_name || detection.user_email || 'Utilisateur anonyme';
                detectorStats[detectorKey] = (detectorStats[detectorKey] || 0) + 1;
            });
        return detectorStats;
    }

    getFinancialSummary() {
        const paidRewards = this.reportData.allRewards.filter(r => r.status === 'paid');
        const totalAmount = paidRewards.reduce((sum, r) => sum + (r.amount || 0), 0);
        const pendingRewards = this.reportData.allRewards.filter(r => r.status === 'pending');
        const pendingAmount = pendingRewards.reduce((sum, r) => sum + (r.amount || 0), 0);
        
        return {
            totalPaid: totalAmount,
            totalPending: pendingAmount,
            paidCount: paidRewards.length,
            pendingCount: pendingRewards.length
        };
    }

    generateReportCSV(reportData) {
        const csvRows = [];
        
        // En-tête du rapport
        csvRows.push(`RAPPORT TRACKING CAR - ${reportData.period}`);
        csvRows.push(`Généré le: ${new Date().toLocaleString('fr-FR')}`);
        csvRows.push(`Par: ${reportData.admin.name} (${reportData.admin.email})`);
        csvRows.push('');
        
        // Résumé
        csvRows.push('RÉSUMÉ EXÉCUTIF');
        csvRows.push(`Véhicules volés dans la période,${reportData.summary.totalVehicles}`);
        csvRows.push(`Détections effectuées,${reportData.summary.totalDetections}`);
        csvRows.push(`Taux de récupération,${reportData.summary.recoveryRate}%`);
        csvRows.push(`Utilisateurs actifs,${reportData.summary.activeUsers}`);
        csvRows.push('');
        
        // Détails par marque
        csvRows.push('RÉPARTITION PAR MARQUE');
        csvRows.push('Marque,Nombre de vols');
        Object.entries(reportData.details.vehiclesByBrand).forEach(([brand, count]) => {
            csvRows.push(`${brand},${count}`);
        });
        csvRows.push('');
        
        // Détails par légion
        csvRows.push('DÉTECTIONS PAR LÉGION');
        csvRows.push('Légion,Nombre de détections');
        Object.entries(reportData.details.detectionsByLegion).forEach(([legion, count]) => {
            const legionName = TrackingCarUtils.getLegionName(legion) || legion;
            csvRows.push(`${legionName},${count}`);
        });
        csvRows.push('');
        
        // Résumé financier
        csvRows.push('RÉSUMÉ FINANCIER');
        csvRows.push(`Récompenses payées,${reportData.details.financialSummary.paidCount}`);
        csvRows.push(`Montant total payé,${reportData.details.financialSummary.totalPaid} FCFA`);
        csvRows.push(`Récompenses en attente,${reportData.details.financialSummary.pendingCount}`);
        csvRows.push(`Montant en attente,${reportData.details.financialSummary.totalPending} FCFA`);
        
        return csvRows.join('\n');
    }

    async exportDetailedStats() {
        try {
            const tableData = [];
            const rows = document.querySelectorAll('#statsTableBody tr');
            
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length > 0) {
                    tableData.push({
                        'Légion': cells[0].textContent.trim(),
                        'Véhicules volés': cells[1].textContent.trim(),
                        'Détections': cells[2].textContent.trim(),
                        'Récupérations': cells[3].textContent.trim(),
                        'Taux récupération': cells[4].textContent.trim(),
                        'Utilisateurs actifs': cells[5].textContent.trim(),
                        'Récompenses payées': cells[6].textContent.trim(),
                        'Montant total': cells[7].textContent.trim()
                    });
                }
            });

            const csvContent = this.convertToCSV(tableData);
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `statistiques_detaillees_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            TrackingCarUtils.showNotification('Statistiques détaillées exportées avec succès', 'success');

        } catch (error) {
            console.error('Erreur export tableau:', error);
            TrackingCarUtils.showNotification('Erreur lors de l\'export', 'error');
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
}

// Initialiser les rapports
document.addEventListener('DOMContentLoaded', () => {
    new ReportsManager();
});