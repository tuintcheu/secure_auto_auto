import { getFirestore, collection, query, where, getDocs, orderBy, limit, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { VehiclesManager } from './vehicles.js';

// Contrôle d'accès centralisé et adaptation UI selon le rôle
const admin = window.checkAccessForAdmin();
if (!admin) throw new Error('Accès refusé ou non authentifié');

// Affiche/Masque les menus/fonctionnalités selon le rôle
if (admin.role === 'global_admin') {
    document.querySelectorAll('.menu-global').forEach(e => e.classList.remove('hidden'));
    document.querySelectorAll('.menu-legion').forEach(e => e.classList.add('hidden'));
} else {
    document.querySelectorAll('.menu-global').forEach(e => e.classList.add('hidden'));
    document.querySelectorAll('.menu-legion').forEach(e => e.classList.remove('hidden'));
    // Masquer le lien utilisateurs pour les admins de légion
    const usersLink = document.querySelector('a[href="users/list.html"]');
    if (usersLink) usersLink.style.display = 'none';
    // Afficher un message d'information
    const dashInfo = document.createElement('div');
    dashInfo.className = 'bg-blue-100 text-blue-800 text-sm rounded-lg p-3 mb-4';
    dashInfo.innerHTML = '<i class="fas fa-info-circle mr-2"></i>Vous ne voyez que les données de votre légion.';
    const main = document.querySelector('main .p-6') || document.querySelector('main');
    if (main) main.prepend(dashInfo);
}

class TrackingCarDashboard {
    constructor(admin) {
        this.db = getFirestore();
        this.notifications = [];
        this.unreadCount = 0;
        this.charts = {};
        this.admin = admin;
        this.setupEventListeners();
        this.listenForRecentDetections();
        this.loadDashboardData();
    }

    setupEventListeners() {
        document.getElementById('sidebarToggle')?.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('-translate-x-full');
        });
        document.getElementById('userMenuBtn')?.addEventListener('click', () => {
            document.getElementById('userDropdown').classList.toggle('hidden');
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#userMenuBtn')) {
                document.getElementById('userDropdown').classList.add('hidden');
            }
        });
        document.getElementById('logoutBtn')?.addEventListener('click', async () => {
            await window.trackingCarAuth.logout();
            window.location.href = 'index.html';
        });
        document.getElementById('notificationsBtn')?.addEventListener('click', () => {
            this.showNotificationsPanel();
        });
        document.getElementById('closeNotificationsPanel')?.addEventListener('click', () => {
            this.hideNotificationsPanel();
        });
        document.addEventListener('mousedown', (e) => {
            const panel = document.getElementById('notificationsPanel');
            if (panel && !panel.contains(e.target) && !e.target.closest('#notificationsBtn')) {
                this.hideNotificationsPanel();
            }
        });
        setInterval(() => {
            this.loadDashboardData();
        }, 5 * 60 * 1000);
    }

    async loadDashboardData() {
        try {
            this.showLoading(true);
            this.fillUserMenu(this.admin);
            await this.loadStats(this.admin);
            await this.loadCharts(this.admin);
            await this.loadRecentActivity(this.admin);
            await this.checkAlerts(this.admin);
        } catch (error) {
            console.error('Erreur chargement dashboard:', error);
            alert('Erreur lors du chargement des données');
        } finally {
            this.showLoading(false);
        }
    }

    fillUserMenu(admin) {
        const userName = document.getElementById('userName');
        const userRole = document.getElementById('userRole');
        const userLegion = document.getElementById('userLegion');
        if (userName) userName.textContent = admin.displayName || admin.email || 'Admin';
        if (userRole) userRole.textContent = admin.role === 'global_admin' ? 'Administrateur Global' : 'Administrateur Légion';
        if (userLegion) userLegion.textContent = admin.legion === 'ALL' ? 'Toutes les légions' : (window.TrackingCarConfig?.LEGIONS?.[admin.legion]?.name || admin.legion || '-');
    }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.toggle('hidden', !show);
    }

    async loadStats(admin) {
        const isGlobal = admin.role === 'global_admin';
        const legion = admin.legion;

        let vehiclesQuery, detectionsQuery, usersQuery, rewardsQuery;
        if (!isGlobal && legion) {
            vehiclesQuery = query(collection(this.db, 'stolen_vehicles'), where('legion', '==', legion));
            detectionsQuery = query(collection(this.db, 'vehicle_checks'), where('legion', '==', legion));
            usersQuery = query(collection(this.db, 'users'), where('legion', '==', legion));
            rewardsQuery = query(collection(this.db, 'rewards'), where('legion', '==', legion));
        } else {
            vehiclesQuery = collection(this.db, 'stolen_vehicles');
            detectionsQuery = collection(this.db, 'vehicle_checks');
            usersQuery = collection(this.db, 'users');
            rewardsQuery = collection(this.db, 'rewards');
        }

        const [
            vehiclesSnap,
            detectionsSnap,
            usersSnap,
            rewardsSnap
        ] = await Promise.all([
            getDocs(vehiclesQuery),
            getDocs(detectionsQuery),
            getDocs(usersQuery),
            getDocs(rewardsQuery)
        ]);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Utilisateurs actifs aujourd'hui uniquement
        const activeUsers = usersSnap.docs.filter(doc => {
            const data = doc.data();
            if (data.lastActive) {
                const lastActive = data.lastActive.seconds ? new Date(data.lastActive.seconds * 1000) : new Date(data.lastActive);
                return lastActive >= today;
            }
            return false;
        }).length;

        const todayDetections = detectionsSnap.docs.filter(doc => {
            const data = doc.data();
            let detectionDate = null;
            if (data.timestamp?.seconds) detectionDate = new Date(data.timestamp.seconds * 1000);
            else if (data.timestamp) detectionDate = new Date(data.timestamp);
            else if (data.check_date?.seconds) detectionDate = new Date(data.check_date.seconds * 1000);
            if (detectionDate) return detectionDate >= today;
            return false;
        }).length;

        const pendingRewards = rewardsSnap.docs.filter(doc => doc.data().status === 'pending').length;

        // this.animateCounter('totalVehicles', vehiclesSnap.size); // Désactivé, géré par onSnapshot
        this.animateCounter('todayDetections', todayDetections);
        this.animateCounter('activeUsers', activeUsers);
        this.animateCounter('pendingRewards', pendingRewards);
    }

    animateCounter(elementId, targetValue) {
        const element = document.getElementById(elementId);
        if (!element) return;
        let currentValue = 0;
        const increment = targetValue / 30;
        const duration = 1000;
        const frameTime = duration / 30;
        const animate = () => {
            currentValue += increment;
            if (currentValue >= targetValue) {
                element.textContent = targetValue.toLocaleString('fr-FR');
                return;
            }
            element.textContent = Math.floor(currentValue).toLocaleString('fr-FR');
            setTimeout(animate, frameTime);
        };
        animate();
    }

    async loadCharts(admin) {
        const db = this.db;
        const isGlobal = admin.role === 'global_admin';
        const legion = admin.legion;

        let detectionsQuery;
        if (!isGlobal && legion) {
            detectionsQuery = query(collection(db, 'vehicle_checks'), where('legion', '==', legion));
        } else {
            detectionsQuery = collection(db, 'vehicle_checks');
        }
        const detectionsSnap = await getDocs(detectionsQuery);

        // Générer les 12 derniers mois glissants
        const now = new Date();
        const months = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
        const detectionsByMonth = {};
        months.forEach(m => detectionsByMonth[m] = 0);

        detectionsSnap.forEach(doc => {
            const data = doc.data();
            let date = data.timestamp;
            if (date && date.seconds) date = new Date(date.seconds * 1000);
            else if (date) date = new Date(date);
            else if (data.check_date?.seconds) date = new Date(data.check_date.seconds * 1000);
            else return;
            if (isNaN(date.getTime())) return;
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (detectionsByMonth[key] !== undefined) detectionsByMonth[key]++;
        });

        const detectionLabels = months.map(m => {
            const [y, mo] = m.split('-');
            return `${mo}/${y.slice(2)}`;
        });
        const detectionDataPoints = months.map(m => detectionsByMonth[m]);

        // Stockage global pour l'export Excel
        window.detectionChartLabels = detectionLabels;
        window.detectionChartData = detectionDataPoints;

        const detectionsChartEl = document.getElementById('detectionsChart');
        if (detectionsChartEl) {
            const ctx1 = detectionsChartEl.getContext('2d');
            if (this.charts.detections) this.charts.detections.destroy();
            this.charts.detections = new Chart(ctx1, {
                type: 'line',
                data: {
                    labels: detectionLabels,
                    datasets: [{
                        label: 'Détections',
                        data: detectionDataPoints,
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37,99,235,0.1)',
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

        let vehiclesQuery;
        // Utiliser les variables du scope parent (déjà définies dans la classe ou passées en paramètre)
        if (!admin.role === 'global_admin' && admin.legion) {
            vehiclesQuery = query(this.db, 'stolen_vehicles', where('legion', '==', admin.legion));
        } else {
            vehiclesQuery = collection(this.db, 'stolen_vehicles');
        }
        const vehiclesSnap = await getDocs(vehiclesQuery);
        const legionCounts = {};
        vehiclesSnap.forEach(doc => {
            // Normaliser le code légion (ex: l1, l2, ...)
            let code = (doc.data().legion || 'inconnu').toString().trim().toLowerCase();
            // Corriger les variantes (ex: centre -> l1 si besoin)
            if (code === 'centre') code = 'l1';
            if (code === 'littoral') code = 'l2';
            if (code === 'ouest') code = 'l3';
            if (code === 'sud') code = 'l4';
            if (code === 'nord') code = 'l5';
            if (code === 'adamaoua') code = 'l6';
            if (code === 'est') code = 'l7';
            if (code === 'extreme-nord') code = 'l8';
            if (code === 'nord-ouest') code = 'l9';
            if (code === 'sud-ouest') code = 'l10';
            if (code === 'logone-et-chari (far north)') code = 'l11';
            legionCounts[code] = (legionCounts[code] || 0) + 1;
        });
        const legionConfig = window.TrackingCarConfig?.LEGIONS || {};
        // Palette de couleurs fixes par code légion
        const legionColors = {
            l1: '#2563eb', // CENTRE
            l2: '#f59e42', // LITTORAL
            l3: '#10b981', // OUEST
            l4: '#fbbf24', // SUD
            l5: '#f43f5e', // NORD
            l6: '#6366f1', // ADAMAOUA
            l7: '#a78bfa', // EST
            l8: '#38bdf8', // EXTREME-NORD
            l9: '#f472b6', // NORD-OUEST
            l10: '#34d399', // SUD-OUEST
            l11: '#b91c1c', // Logone-et-Chari
            inconnu: '#d1d5db' // gris pour inconnu
        };
        // Labels et couleurs alignés
        let codes, labels, colors, data;
        if (!isGlobal && legion) {
            // Admin de légion : une seule portion, sa légion
            let code = legion.toString().trim().toLowerCase();
            // Corriger les variantes
            if (code === 'centre') code = 'l1';
            if (code === 'littoral') code = 'l2';
            if (code === 'ouest') code = 'l3';
            if (code === 'sud') code = 'l4';
            if (code === 'nord') code = 'l5';
            if (code === 'adamaoua') code = 'l6';
            if (code === 'est') code = 'l7';
            if (code === 'extreme-nord') code = 'l8';
            if (code === 'nord-ouest') code = 'l9';
            if (code === 'sud-ouest') code = 'l10';
            if (code === 'logone-et-chari (far north)') code = 'l11';
            const count = legionCounts[code] || 0;
            codes = [code];
            labels = [legionConfig[code]?.name || code.toUpperCase()];
            colors = [legionColors[code] || '#d1d5db'];
            data = [count];
        } else {
            // Admin global : toutes les légions
            codes = Object.keys(legionCounts);
            labels = codes.map(code => legionConfig[code]?.name || code.toUpperCase());
            colors = codes.map(code => legionColors[code] || '#d1d5db');
            data = codes.map(code => legionCounts[code]);
        }
        const ctx2 = document.getElementById('legionChart').getContext('2d');
        if (this.charts.legion) this.charts.legion.destroy();
        this.charts.legion = new Chart(ctx2, {
            type: 'pie',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                cutout: '10%' // Camembert plus épais
            }
        });
    }

    async loadRecentActivity(admin) {
        const db = this.db;
        const isGlobal = admin.role === 'global_admin';
        const legion = admin.legion;
        const activities = [];

        let detectionsQuery;
        if (!isGlobal && legion) {
            detectionsQuery = query(collection(db, 'vehicle_checks'), where('legion', '==', legion), orderBy('timestamp', 'desc'), limit(5));
        } else {
            detectionsQuery = query(collection(db, 'vehicle_checks'), orderBy('timestamp', 'desc'), limit(5));
        }
        const detectionsSnap = await getDocs(detectionsQuery);
        detectionsSnap.docs.forEach(doc => {
            const data = doc.data();
            activities.push({
                type: 'detection',
                title: 'Nouvelle détection',
                description: `${data.user_name || 'Utilisateur'} a vérifié un véhicule`,
                timestamp: data.timestamp,
                icon: 'fas fa-search',
                color: 'blue'
            });
        });

        let vehiclesQuery;
        if (!isGlobal && legion) {
            vehiclesQuery = query(collection(db, 'stolen_vehicles'), where('legion', '==', legion), orderBy('theft_date', 'desc'), limit(3));
        } else {
            vehiclesQuery = query(collection(db, 'stolen_vehicles'), orderBy('theft_date', 'desc'), limit(3));
        }
        const vehiclesSnap = await getDocs(vehiclesQuery);
        vehiclesSnap.docs.forEach(doc => {
            const data = doc.data();
            activities.push({
                type: 'vehicle',
                title: 'Véhicule signalé volé',
                description: `${data.make || ''} ${data.model || ''} - ${data.license_plate || ''}`,
                timestamp: data.theft_date,
                icon: 'fas fa-car',
                color: 'red'
            });
        });

        activities.sort((a, b) => {
            const timeA = a.timestamp?.seconds || 0;
            const timeB = b.timestamp?.seconds || 0;
            return timeB - timeA;
        });

        this.displayRecentActivity(activities.slice(0, 8));
    }

    displayRecentActivity(activities) {
        const container = document.getElementById('recentActivity');
        if (!container) return;
        if (activities.length === 0) {
            container.innerHTML = `
                <div class="text-center text-gray-500 py-8">
                    <i class="fas fa-inbox text-4xl mb-4"></i>
                    <p>Aucune activité récente</p>
                </div>
            `;
            return;
        }
        container.innerHTML = activities.map(activity => `
            <div class="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <div class="flex-shrink-0">
                    <div class="w-8 h-8 bg-${activity.color}-100 text-${activity.color}-600 rounded-full flex items-center justify-center">
                        <i class="${activity.icon} text-sm"></i>
                    </div>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900">${activity.title}</p>
                    <p class="text-sm text-gray-500">${activity.description}</p>
                    <p class="text-xs text-gray-400 mt-1">
                        ${this.formatDate(activity.timestamp)}
                    </p>
                </div>
            </div>
        `).join('');
    }

    formatDate(date) {
        if (!date) return '-';
        if (date.seconds) date = new Date(date.seconds * 1000);
        else date = new Date(date);
        return date.toLocaleString('fr-FR');
    }

    async checkAlerts(admin) {
        const db = this.db;
        const isGlobal = admin.role === 'global_admin';
        const legion = admin.legion;
        const alerts = [];

        let rewardsQuery;
        if (!isGlobal && legion) {
            rewardsQuery = query(collection(db, 'rewards'), where('legion', '==', legion), where('status', '==', 'pending'));
        } else {
            rewardsQuery = query(collection(db, 'rewards'), where('status', '==', 'pending'));
        }
        const rewardsSnap = await getDocs(rewardsQuery);

        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const oldRewards = rewardsSnap.docs.filter(doc => {
            const data = doc.data();
            if (data.created_at) {
                const d = data.created_at.seconds ? new Date(data.created_at.seconds * 1000) : new Date(data.created_at);
                return d < oneWeekAgo;
            }
            return false;
        }).length;

        if (oldRewards > 0) {
            alerts.push(`${oldRewards} récompense(s) en attente depuis plus d'une semaine`);
        }

        let vehiclesQuery;
        if (!isGlobal && legion) {
            vehiclesQuery = query(collection(db, 'stolen_vehicles'), where('legion', '==', legion), where('status', '==', 'active'));
        } else {
            vehiclesQuery = query(collection(db, 'stolen_vehicles'), where('status', '==', 'active'));
        }
        const vehiclesSnap = await getDocs(vehiclesQuery);

        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        const oldVehicles = vehiclesSnap.docs.filter(doc => {
            const data = doc.data();
            if (data.theft_date) {
                const d = data.theft_date.seconds ? new Date(data.theft_date.seconds * 1000) : new Date(data.theft_date);
                return d < oneMonthAgo;
            }
            return false;
        }).length;

        if (oldVehicles > 0) {
            alerts.push(`${oldVehicles} véhicule(s) sans mise à jour depuis plus d'un mois`);
        }

        this.displayAlerts(alerts);
    }

    displayAlerts(alerts) {
        const alertsSection = document.getElementById('alertsSection');
        const alertsList = document.getElementById('alertsList');
        if (!alertsSection || !alertsList) return;
        if (alerts.length === 0) {
            alertsSection.classList.add('hidden');
            return;
        }
        alertsList.innerHTML = alerts.map(alert => `
            <div class="flex items-center">
                <i class="fas fa-exclamation-circle mr-2"></i>
                <span>${alert}</span>
            </div>
        `).join('');
        alertsSection.classList.remove('hidden');
    }

    // --- Notifications cloche : détections récentes ---
    listenForRecentDetections() {
        const admin = this.admin;
        if (!admin) return;
        const isGlobal = admin.role === 'global_admin';
        let q;
        if (!isGlobal && admin.legion) {
            q = query(collection(this.db, 'vehicle_checks'), where('legion', '==', admin.legion), orderBy('timestamp', 'desc'), limit(10));
        } else {
            q = query(collection(this.db, 'vehicle_checks'), orderBy('timestamp', 'desc'), limit(10));
        }
        onSnapshot(q, (snapshot) => {
            this.notifications = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    user: data.user_name || data.user_email || 'Utilisateur',
                    plate: data.license_plate || data.chassis_number || '',
                    date: data.timestamp?.seconds ? new Date(data.timestamp.seconds * 1000) : (data.timestamp ? new Date(data.timestamp) : null),
                    result: data.result
                };
            });
            this.renderNotificationsList();
            // Badge si panneau fermé
            if (document.getElementById('notificationsPanel').classList.contains('hidden')) {
                this.unreadCount = this.notifications.length;
                this.updateNotificationBadge();
            }
        });
    }

    showNotificationsPanel() {
        document.getElementById('notificationsPanel').classList.remove('hidden');
        this.unreadCount = 0;
        this.updateNotificationBadge();
    }

    hideNotificationsPanel() {
        document.getElementById('notificationsPanel').classList.add('hidden');
    }

    updateNotificationBadge() {
        const badge = document.getElementById('notificationBadge');
        if (!badge) return;
        if (this.unreadCount > 0) {
            badge.textContent = this.unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    renderNotificationsList() {
        const list = document.getElementById('notificationsList');
        if (!list) return;
        if (this.notifications.length === 0) {
            list.innerHTML = `<div class="text-center text-gray-400 py-8"><i class="fas fa-inbox mb-2"></i><p>Aucune détection récente</p></div>`;
            return;
        }
        list.innerHTML = this.notifications.map(n => `
            <div class="flex items-center space-x-2 p-2 rounded hover:bg-gray-50">
                <div class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${n.result === 'stolen' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}">
                    <i class="fas fa-search"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-900">${n.user}</div>
                    <div class="text-xs text-gray-500">${n.plate}</div>
                    <div class="text-xs text-gray-400">${n.date ? n.date.toLocaleString('fr-FR') : ''}</div>
                </div>
                <span class="text-xs px-2 py-1 rounded ${n.result === 'stolen' ? 'bg-red-200 text-red-800' : 'bg-green-200 text-green-800'}">
                    ${n.result === 'stolen' ? 'Volé' : 'Propre'}
                </span>
            </div>
        `).join('');
    }
}

// Ajoute la synchro temps réel du compteur de véhicules volés
function syncTotalVehiclesRealtime(admin) {
    const db = getFirestore();
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
        vehiclesQuery = query(collection(db, 'stolen_vehicles'), where('legion', '==', legion));
    } else {
        vehiclesQuery = collection(db, 'stolen_vehicles');
    }
    onSnapshot(vehiclesQuery, (snapshot) => {
        const count = snapshot.size;
        const el = document.getElementById('totalVehicles');
        if (el) el.textContent = count.toLocaleString('fr-FR');
    });
}
// Ajoute la synchro temps réel du compteur de détections aujourd'hui
function syncTodayDetectionsRealtime(admin) {
    const db = getFirestore();
    let detectionsQuery;
    let legionCode = admin.legion;
    if (admin.role === 'legion_admin' && legionCode) {
        legionCode = legionCode.trim().toLowerCase();
        if (legionCode === 'centre') legionCode = 'l1';
        if (legionCode === 'littoral') legionCode = 'l2';
        if (legionCode === 'ouest') legionCode = 'l3';
        if (legionCode === 'sud') legionCode = 'l4';
        if (legionCode === 'nord') legionCode = 'l5';
        if (legionCode === 'adamaoua') legionCode = 'l6';
        if (legionCode === 'est') legionCode = 'l7';
        if (legionCode === 'extreme-nord') legionCode = 'l8';
        if (legionCode === 'nord-ouest') legionCode = 'l9';
        if (legionCode === 'sud-ouest') legionCode = 'l10';
        if (legionCode === 'logone-et-chari (far north)') legionCode = 'l11';
        detectionsQuery = query(collection(db, 'vehicle_checks'), where('legion', '==', legionCode));
    } else {
        detectionsQuery = collection(db, 'vehicle_checks');
    }
    onSnapshot(detectionsQuery, (snapshot) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let count = 0;
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            // Utilise check_date comme référence
            let detectionDate = null;
            if (data.check_date && typeof data.check_date === 'object' && data.check_date.seconds) {
                detectionDate = new Date(data.check_date.seconds * 1000);
            } else if (data.check_date && typeof data.check_date === 'string') {
                detectionDate = new Date(data.check_date);
            }
            if (detectionDate && detectionDate >= today) count++;
        });
        const el = document.getElementById('todayDetections');
        if (el) el.textContent = count.toLocaleString('fr-FR');
    });
}
// Ajoute la synchro temps réel du diagramme des détections par mois
function syncDetectionsChartRealtime(admin, dashboardInstance) {
    const db = getFirestore();
    let detectionsQuery;
    let legionCode = admin.legion;
    if (admin.role === 'legion_admin' && legionCode) {
        legionCode = legionCode.trim().toLowerCase();
        if (legionCode === 'centre') legionCode = 'l1';
        if (legionCode === 'littoral') legionCode = 'l2';
        if (legionCode === 'ouest') legionCode = 'l3';
        if (legionCode === 'sud') legionCode = 'l4';
        if (legionCode === 'nord') legionCode = 'l5';
        if (legionCode === 'adamaoua') legionCode = 'l6';
        if (legionCode === 'est') legionCode = 'l7';
        if (legionCode === 'extreme-nord') legionCode = 'l8';
        if (legionCode === 'nord-ouest') legionCode = 'l9';
        if (legionCode === 'sud-ouest') legionCode = 'l10';
        if (legionCode === 'logone-et-chari (far north)') legionCode = 'l11';
        detectionsQuery = query(collection(db, 'vehicle_checks'), where('legion', '==', legionCode));
    } else {
        detectionsQuery = collection(db, 'vehicle_checks');
    }
    onSnapshot(detectionsQuery, (snapshot) => {
        // Générer les 12 derniers mois glissants
        const now = new Date();
        const months = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
        const detectionsByMonth = {};
        months.forEach(m => detectionsByMonth[m] = 0);
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            let date = null;
            if (data.check_date && typeof data.check_date === 'object' && data.check_date.seconds) {
                date = new Date(data.check_date.seconds * 1000);
            } else if (data.check_date && typeof data.check_date === 'string') {
                date = new Date(data.check_date);
            }
            console.log('DEBUG diagramme - check_date:', data.check_date, 'date JS:', date);
            if (!date || isNaN(date.getTime())) return;
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (detectionsByMonth[key] !== undefined) detectionsByMonth[key]++;
        });
        console.log('DEBUG diagramme - months:', months);
        console.log('DEBUG diagramme - detectionsByMonth:', detectionsByMonth);
        const detectionLabels = months.map(m => {
            const [y, mo] = m.split('-');
            return `${mo}/${y.slice(2)}`;
        });
        const detectionDataPoints = months.map(m => detectionsByMonth[m]);
        // Met à jour le chart
        if (dashboardInstance && dashboardInstance.charts && dashboardInstance.charts.detections) {
            dashboardInstance.charts.detections.data.labels = detectionLabels;
            dashboardInstance.charts.detections.data.datasets[0].data = detectionDataPoints;
            dashboardInstance.charts.detections.update();
        }
    });
}
// Ajoute la synchro temps réel de l'activité récente
function syncRecentActivityRealtime(admin, dashboardInstance) {
    const db = getFirestore();
    const isGlobal = admin.role === 'global_admin';
    let legionCode = admin.legion;
    let detectionsQuery, vehiclesQuery;
    if (!isGlobal && legionCode) {
        legionCode = legionCode.trim().toLowerCase();
        if (legionCode === 'centre') legionCode = 'l1';
        if (legionCode === 'littoral') legionCode = 'l2';
        if (legionCode === 'ouest') legionCode = 'l3';
        if (legionCode === 'sud') legionCode = 'l4';
        if (legionCode === 'nord') legionCode = 'l5';
        if (legionCode === 'adamaoua') legionCode = 'l6';
        if (legionCode === 'est') legionCode = 'l7';
        if (legionCode === 'extreme-nord') legionCode = 'l8';
        if (legionCode === 'nord-ouest') legionCode = 'l9';
        if (legionCode === 'sud-ouest') legionCode = 'l10';
        if (legionCode === 'logone-et-chari (far north)') legionCode = 'l11';
        detectionsQuery = query(collection(db, 'vehicle_checks'), where('legion', '==', legionCode), orderBy('timestamp', 'desc'), limit(5));
        vehiclesQuery = query(collection(db, 'stolen_vehicles'), where('legion', '==', legionCode), orderBy('theft_date', 'desc'), limit(3));
    } else {
        detectionsQuery = query(collection(db, 'vehicle_checks'), orderBy('timestamp', 'desc'), limit(5));
        vehiclesQuery = query(collection(db, 'stolen_vehicles'), orderBy('theft_date', 'desc'), limit(3));
    }
    let activities = [];
    onSnapshot(detectionsQuery, (detectionsSnap) => {
        activities = [];
        detectionsSnap.docs.forEach(doc => {
            const data = doc.data();
            activities.push({
                type: 'detection',
                title: 'Nouvelle détection',
                description: `${data.user_name || 'Utilisateur'} a vérifié un véhicule`,
                timestamp: data.timestamp,
                icon: 'fas fa-search',
                color: 'blue'
            });
        });
        // On écoute aussi les véhicules volés
        onSnapshot(vehiclesQuery, (vehiclesSnap) => {
            vehiclesSnap.docs.forEach(doc => {
                const data = doc.data();
                activities.push({
                    type: 'vehicle',
                    title: 'Véhicule signalé volé',
                    description: `${data.make || ''} ${data.model || ''} - ${data.license_plate || ''}`,
                    timestamp: data.theft_date,
                    icon: 'fas fa-car',
                    color: 'red'
                });
            });
            activities.sort((a, b) => {
                const timeA = a.timestamp?.seconds || 0;
                const timeB = b.timestamp?.seconds || 0;
                return timeB - timeA;
            });
            if (dashboardInstance && typeof dashboardInstance.displayRecentActivity === 'function') {
                dashboardInstance.displayRecentActivity(activities.slice(0, 8));
            }
        });
    });
}
document.addEventListener('DOMContentLoaded', () => {
    const admin = window.checkAccessForAdmin();
    if (!admin) throw new Error('Accès refusé ou non authentifié');
    // Affiche/Masque les menus/fonctionnalités selon le rôle
    if (admin.role === 'global_admin') {
        document.querySelectorAll('.menu-global').forEach(e => e.classList.remove('hidden'));
        document.querySelectorAll('.menu-legion').forEach(e => e.classList.add('hidden'));
    } else {
        document.querySelectorAll('.menu-global').forEach(e => e.classList.add('hidden'));
        document.querySelectorAll('.menu-legion').forEach(e => e.classList.remove('hidden'));
    }
    const dash = new TrackingCarDashboard(admin);
    window.vehiclesManager = new VehiclesManager(admin);
    syncTotalVehiclesRealtime(admin);
    syncTodayDetectionsRealtime(admin);
    syncDetectionsChartRealtime(admin, dash);
    syncRecentActivityRealtime(admin, dash);
});
const exportBtn = document.getElementById('exportDetectionsExcel');
if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
        // Utilise les variables globales pour garantir la cohérence avec le diagramme
        const labels = window.detectionChartLabels || [];
        const data = window.detectionChartData || [];
        // Prépare les données pour Excel
        const rows = [['Mois', 'Détections']];
        for (let i = 0; i < labels.length; i++) {
            rows.push([labels[i], data[i]]);
        }
        // Charge SheetJS dynamiquement si besoin
        if (typeof XLSX === 'undefined') {
            await import('https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs').then(mod => { window.XLSX = mod.default; });
        }
        // Crée le fichier Excel
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Détections');
        XLSX.writeFile(wb, 'rapport_detections.xlsx');
    });
}