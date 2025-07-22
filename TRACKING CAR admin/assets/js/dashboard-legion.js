import { getFirestore, collection, query, where, getDocs, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Initialisation Firebase (si pas déjà fait dans ton projet)
if (!firebase.apps.length) {
    firebase.initializeApp(window.TrackingCarConfig?.FIREBASE_CONFIG || {});
}

// Contrôle d'accès centralisé et adaptation UI selon le rôle
const admin = window.checkAccessForAdmin();
if (!admin) throw new Error('Accès refusé ou non authentifié');

class LegionDashboard {
    constructor() {
        this.db = getFirestore();
        this.admin = window.trackingCarAuth.getCurrentAdmin();
        if (!this.admin || !this.admin.legion) {
            alert("Accès refusé.");
            window.location.href = "index.html";
            return;
        }
        this.legion = this.admin.legion;
        this.charts = {};
        this.notifications = [];
        this.init();
    }

    async init() {
        this.fillUserMenu();
        document.getElementById('logoutBtn').addEventListener('click', async () => {
            await window.trackingCarAuth.logout();
            window.location.href = "index.html";
        });
        document.getElementById('exportExcelBtn').addEventListener('click', () => this.exportDetectionsToExcel());
        await this.loadCharts();
        this.listenForNotifications();
    }

    fillUserMenu() {
        document.getElementById('userName').textContent = this.admin.displayName || this.admin.email || 'Admin';
        document.getElementById('userRole').textContent = 'Admin légion';
        document.getElementById('userLegion').textContent = `Légion : ${this.legion}`;
    }

    async loadCharts() {
        // Détections par mois
        const detectionsQuery = query(
            collection(this.db, "vehicle_checks"),
            where("legion", "==", this.legion)
        );
        const detectionsSnap = await getDocs(detectionsQuery);

        const detectionsByMonth = {};
        detectionsSnap.forEach(doc => {
            const data = doc.data();
            let date = null;
            if (data.timestamp?.seconds) date = new Date(data.timestamp.seconds * 1000);
            else if (data.timestamp) date = new Date(data.timestamp);
            else if (data.check_date?.seconds) date = new Date(data.check_date.seconds * 1000);
            else return;
            if (isNaN(date.getTime())) return;
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            detectionsByMonth[key] = (detectionsByMonth[key] || 0) + 1;
        });

        const sortedMonths = Object.keys(detectionsByMonth).sort();
        const labels = sortedMonths.map(m => {
            const [y, mo] = m.split('-');
            return `${mo}/${y.slice(2)}`;
        });
        const dataPoints = sortedMonths.map(m => detectionsByMonth[m]);

        const ctx1 = document.getElementById('detectionsChart').getContext('2d');
        if (this.charts.detections) this.charts.detections.destroy();
        this.charts.detections = new Chart(ctx1, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Détections',
                    data: dataPoints,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37,99,235,0.1)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true } },
                scales: {
                    x: { title: { display: true, text: 'Mois/Année' } },
                    y: { beginAtZero: true, title: { display: true, text: 'Nombre de détections' } }
                }
            }
        });

        // Véhicules volés de la légion (pie chart par statut)
        const vehiclesQuery = query(
            collection(this.db, "stolen_vehicles"),
            where("legion", "==", this.legion)
        );
        const vehiclesSnap = await getDocs(vehiclesQuery);
        const statusCounts = {};
        vehiclesSnap.forEach(doc => {
            const status = doc.data().status || 'Inconnu';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        const statusLabels = Object.keys(statusCounts);
        const ctx2 = document.getElementById('legionChart').getContext('2d');
        if (this.charts.legion) this.charts.legion.destroy();
        this.charts.legion = new Chart(ctx2, {
            type: 'pie',
            data: {
                labels: statusLabels,
                datasets: [{
                    data: Object.values(statusCounts),
                    backgroundColor: [
                        '#2563eb', '#f59e42', '#10b981', '#f43f5e', '#a78bfa', '#fbbf24', '#38bdf8', '#6366f1'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }

    listenForNotifications() {
        const q = query(
            collection(this.db, "vehicle_checks"),
            where("legion", "==", this.legion),
            orderBy("timestamp", "desc"),
            limit(10)
        );
        onSnapshot(q, (snapshot) => {
            this.notifications = snapshot.docs.map(doc => {
                const data = doc.data();
                let date = null;
                if (data.timestamp?.seconds) date = new Date(data.timestamp.seconds * 1000);
                else if (data.timestamp) date = new Date(data.timestamp);
                else if (data.check_date?.seconds) date = new Date(data.check_date.seconds * 1000);
                return {
                    user: data.user_name || data.user_email || '',
                    plate: data.license_plate || data.chassis_number || '',
                    date,
                    result: data.result || ''
                };
            });
            this.renderNotificationsList();
        });
    }

    renderNotificationsList() {
        const list = document.getElementById('notificationsList');
        if (!list) return;
        if (this.notifications.length === 0) {
            list.innerHTML = '<div class="text-gray-400 text-sm">Aucune détection récente.</div>';
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

    async exportDetectionsToExcel() {
        const detectionsQuery = query(
            collection(this.db, "vehicle_checks"),
            where("legion", "==", this.legion)
        );
        const detectionsSnap = await getDocs(detectionsQuery);

        const rows = [['Date', 'Utilisateur', 'Plaque', 'Résultat', 'Légion']];
        detectionsSnap.forEach(doc => {
            const data = doc.data();
            let date = data.timestamp?.seconds ? new Date(data.timestamp.seconds * 1000) : (data.timestamp ? new Date(data.timestamp) : null);
            rows.push([
                date ? date.toLocaleString('fr-FR') : '',
                data.user_name || data.user_email || '',
                data.license_plate || data.chassis_number || '',
                data.result || '',
                data.legion || ''
            ]);
        });

        const csvContent = rows.map(e => e.map(v => `"${(v+'').replace(/"/g, '""')}"`).join(';')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'detections_legion.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new LegionDashboard();
});