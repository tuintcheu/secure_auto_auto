// Système de notifications en temps réel - TRACKING CAR
import { getFirestore, collection, query, where, onSnapshot, orderBy, limit, addDoc, Timestamp, doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

class NotificationsManager {
    constructor() {
        this.db = getFirestore();
        this.notifications = [];
        this.unreadCount = 0;
        this.listeners = [];
        this.init();
    }

    async init() {
        this.waitForAuth();
        this.setupEventListeners();
    }

    waitForAuth() {
        const checkAuth = () => {
            if (window.trackingCarAuth && window.trackingCarAuth.getCurrentAdmin()) {
                this.startListening();
            } else {
                setTimeout(checkAuth, 100);
            }
        };
        checkAuth();
    }

    setupEventListeners() {
        // Fermer notifications en cliquant ailleurs
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#notificationsBtn') && !e.target.closest('#notificationsDropdown')) {
                document.getElementById('notificationsDropdown')?.classList.add('hidden');
            }
        });
    }

    startListening() {
        const auth = window.trackingCarAuth;
        const adminData = auth.getCurrentAdmin();
        const isGlobalAdmin = auth.isGlobalAdmin();

        // Écouter les nouvelles détections de véhicules volés
        this.listenToStolenVehicleDetections(isGlobalAdmin, adminData?.legion);
        
        // Écouter les nouvelles récompenses
        this.listenToNewRewards(isGlobalAdmin, adminData?.legion);
        
        // Écouter les nouveaux véhicules volés
        this.listenToNewStolenVehicles(isGlobalAdmin, adminData?.legion);
    }

    listenToStolenVehicleDetections(isGlobalAdmin, legion) {
        let detectionsQuery = collection(this.db, 'detections');

        // Filtrer par légion si admin de légion
        if (!isGlobalAdmin && legion) {
            detectionsQuery = query(
                detectionsQuery,
                where('legion', '==', legion)
            );
        }

        // Écouter les détections récentes (dernières 24 heures)
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);

        detectionsQuery = query(
            detectionsQuery,
            where('timestamp', '>=', Timestamp.fromDate(yesterday)),
            orderBy('timestamp', 'desc')
        );

        const unsubscribe = onSnapshot(detectionsQuery, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const detection = change.doc.data();
                    
                    // Ne notifier que les détections de véhicules volés
                    if (detection.result_data?.result === 'stolen') {
                        this.addNotification({
                            id: change.doc.id,
                            type: 'stolen_vehicle_detected',
                            title: '🚨 Véhicule volé détecté !',
                            message: `${detection.user_name || 'Un utilisateur'} a détecté un véhicule volé`,
                            data: {
                                detectorName: detection.user_name,
                                detectorEmail: detection.user_email,
                                vehicleInfo: detection.result_data?.vehicleDetails,
                                location: detection.location,
                                timestamp: detection.timestamp
                            },
                            timestamp: detection.timestamp || Timestamp.now(),
                            priority: 'high'
                        });
                    }
                }
            });
        });

        this.listeners.push(unsubscribe);
    }

    listenToNewRewards(isGlobalAdmin, legion) {
        let rewardsQuery = collection(this.db, 'rewards');

        // Filtrer par légion si admin de légion
        if (!isGlobalAdmin && legion) {
            rewardsQuery = query(
                rewardsQuery,
                where('legion', '==', legion)
            );
        }

        // Écouter les nouvelles récompenses
        rewardsQuery = query(
            rewardsQuery,
            where('status', '==', 'pending'),
            orderBy('created_at', 'desc')
        );

        const unsubscribe = onSnapshot(rewardsQuery, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const reward = change.doc.data();
                    
                    this.addNotification({
                        id: change.doc.id,
                        type: 'new_reward',
                        title: '💰 Nouvelle récompense en attente',
                        message: `Récompense de ${TrackingCarUtils.formatCurrency(reward.amount || 0)} pour ${reward.detector_name}`,
                        data: {
                            rewardId: change.doc.id,
                            amount: reward.amount,
                            detectorName: reward.detector_name,
                            vehicleInfo: reward.vehicle_info
                        },
                        timestamp: reward.created_at || Timestamp.now(),
                        priority: 'medium'
                    });
                }
            });
        });

        this.listeners.push(unsubscribe);
    }

    listenToNewStolenVehicles(isGlobalAdmin, legion) {
        let vehiclesQuery = collection(this.db, 'stolen_vehicles');

        // Filtrer par légion si admin de légion
        if (!isGlobalAdmin && legion) {
            vehiclesQuery = query(
                vehiclesQuery,
                where('legion', '==', legion)
            );
        }

        // Écouter les nouveaux véhicules volés (dernières 24 heures)
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);

        vehiclesQuery = query(
            vehiclesQuery,
            where('created_at', '>=', Timestamp.fromDate(yesterday)),
            orderBy('created_at', 'desc')
        );

        const unsubscribe = onSnapshot(vehiclesQuery, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const vehicle = change.doc.data();
                    
                    this.addNotification({
                        id: change.doc.id,
                        type: 'new_stolen_vehicle',
                        title: '🚗 Nouveau véhicule volé signalé',
                        message: `${vehicle.make} ${vehicle.model} - ${vehicle.license_plate}`,
                        data: {
                            vehicleId: change.doc.id,
                            make: vehicle.make,
                            model: vehicle.model,
                            licensePlate: vehicle.license_plate,
                            theftLocation: vehicle.theft_location,
                            legion: vehicle.legion
                        },
                        timestamp: vehicle.created_at || Timestamp.now(),
                        priority: 'medium'
                    });
                }
            });
        });

        this.listeners.push(unsubscribe);
    }

    addNotification(notification) {
        // Éviter les doublons
        if (this.notifications.find(n => n.id === notification.id && n.type === notification.type)) {
            return;
        }

        // Ajouter la notification
        this.notifications.unshift(notification);
        this.unreadCount++;

        // Limiter à 50 notifications
        if (this.notifications.length > 50) {
            this.notifications = this.notifications.slice(0, 50);
        }

        // Mettre à jour l'interface
        this.updateNotificationsUI();

        // Afficher notification toast pour les priorités élevées
        if (notification.priority === 'high') {
            this.showNotificationToast(notification);
        }

        // Jouer un son pour les notifications importantes
        if (notification.type === 'stolen_vehicle_detected') {
            this.playNotificationSound();
        }
    }

    updateNotificationsUI() {
        // Mettre à jour le badge
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            if (this.unreadCount > 0) {
                badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        // Mettre à jour la liste des notifications
        const notificationsList = document.getElementById('notificationsList');
        if (notificationsList) {
            if (this.notifications.length === 0) {
                notificationsList.innerHTML = `
                    <div class="text-center text-gray-500 text-sm py-4">
                        <i class="fas fa-bell-slash text-2xl mb-2"></i>
                        <p>Aucune notification</p>
                    </div>
                `;
            } else {
                notificationsList.innerHTML = this.notifications.slice(0, 10).map(notification => 
                    this.createNotificationItem(notification)
                ).join('');
            }
        }
    }

    createNotificationItem(notification) {
        const timeAgo = this.getTimeAgo(notification.timestamp);
        const priorityColor = notification.priority === 'high' ? 'red' : notification.priority === 'medium' ? 'yellow' : 'blue';
        
        return `
            <div class="flex items-start space-x-3 p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100" 
                 onclick="notificationsManager.handleNotificationClick('${notification.id}', '${notification.type}')">
                <div class="flex-shrink-0">
                    <div class="w-8 h-8 bg-${priorityColor}-100 rounded-full flex items-center justify-center">
                        <i class="fas fa-${this.getNotificationIcon(notification.type)} text-${priorityColor}-600 text-sm"></i>
                    </div>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900">${notification.title}</p>
                    <p class="text-sm text-gray-600">${notification.message}</p>
                    <p class="text-xs text-gray-400 mt-1">${timeAgo}</p>
                </div>
                ${notification.priority === 'high' ? `
                    <div class="flex-shrink-0">
                        <div class="w-2 h-2 bg-red-500 rounded-full"></div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    getNotificationIcon(type) {
        const icons = {
            'stolen_vehicle_detected': 'exclamation-triangle',
            'new_reward': 'gift',
            'new_stolen_vehicle': 'car',
            'vehicle_recovered': 'check-circle'
        };
        return icons[type] || 'bell';
    }

    getTimeAgo(timestamp) {
        if (!timestamp) return 'À l\'instant';
        
        const now = new Date();
        const notificationTime = timestamp.toDate();
        const diffMs = now - notificationTime;
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMinutes < 1) return 'À l\'instant';
        if (diffMinutes < 60) return `${diffMinutes}m`;
        if (diffHours < 24) return `${diffHours}h`;
        if (diffDays < 7) return `${diffDays}j`;
        
        return notificationTime.toLocaleDateString('fr-FR', { 
            month: 'short', 
            day: 'numeric' 
        });
    }

    handleNotificationClick(notificationId, type) {
        // Marquer comme lue
        this.markAsRead(notificationId);
        
        // Rediriger selon le type
        switch (type) {
            case 'stolen_vehicle_detected':
                window.location.href = '../detections/list.html';
                break;
            case 'new_reward':
                window.location.href = '../rewards/list.html';
                break;
            case 'new_stolen_vehicle':
                window.location.href = '../vehicles/list.html';
                break;
        }
        
        // Fermer le dropdown
        document.getElementById('notificationsDropdown')?.classList.add('hidden');
    }

    markAsRead(notificationId) {
        const notification = this.notifications.find(n => n.id === notificationId);
        if (notification && !notification.read) {
            notification.read = true;
            this.unreadCount = Math.max(0, this.unreadCount - 1);
            this.updateNotificationsUI();
        }
    }

    markAllAsRead() {
        this.notifications.forEach(notification => {
            notification.read = true;
        });
        this.unreadCount = 0;
        this.updateNotificationsUI();
    }

    showNotificationToast(notification) {
        const toast = document.createElement('div');
        toast.className = `
            fixed top-20 right-4 z-50 bg-white border-l-4 border-red-500 rounded-lg shadow-lg p-4 max-w-sm
            transform translate-x-full transition-transform duration-300 ease-out
        `;
        
        toast.innerHTML = `
            <div class="flex items-start">
                <div class="flex-shrink-0">
                    <i class="fas fa-exclamation-triangle text-red-500"></i>
                </div>
                <div class="ml-3 flex-1">
                    <p class="text-sm font-medium text-gray-900">${notification.title}</p>
                    <p class="text-sm text-gray-600 mt-1">${notification.message}</p>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-gray-400 hover:text-gray-600">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        document.body.appendChild(toast);
        
        // Animation d'apparition
        setTimeout(() => {
            toast.classList.remove('translate-x-full');
        }, 100);
        
        // Disparition automatique après 8 secondes
        setTimeout(() => {
            toast.classList.add('translate-x-full');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 8000);
    }

    playNotificationSound() {
        try {
            // Créer un son de notification simple
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);
            
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
        } catch (error) {
            console.log('Son de notification non disponible:', error);
        }
    }

    destroy() {
        // Nettoyer les listeners
        this.listeners.forEach(unsubscribe => unsubscribe());
        this.listeners = [];
    }
}

// --- Notifications persistantes Firestore ---
class PersistentNotificationsManager {
    constructor() {
        this.db = getFirestore();
        this.notifications = [];
        this.unreadCount = 0;
        this.unsubscribe = null;
        this.admin = window.trackingCarAuth.getCurrentAdmin();
        this.listenToNotifications();
    }

    listenToNotifications() {
        if (!this.admin) return;
        const isGlobal = this.admin.role === 'global_admin';
        let notifQuery = collection(this.db, 'notifications');
        if (isGlobal) {
            notifQuery = query(notifQuery, where('to', 'in', ['global', 'all']));
        } else if (this.admin.legion) {
            notifQuery = query(notifQuery, where('to', 'in', [`legion_${this.admin.legion}`, 'all']));
        }
        notifQuery = query(notifQuery, orderBy('timestamp', 'desc'), limit(50));
        this.unsubscribe = onSnapshot(notifQuery, (snapshot) => {
            this.notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.updateUnreadCount();
            this.updateNotificationsUI();
        });
    }

    updateUnreadCount() {
        const adminId = this.admin.email || this.admin.id;
        this.unreadCount = this.notifications.filter(n => !n.readBy || !n.readBy.includes(adminId)).length;
        this.updateNotificationBadge();
    }

    updateNotificationBadge() {
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            badge.textContent = this.unreadCount > 0 ? this.unreadCount : '';
            badge.classList.toggle('hidden', this.unreadCount === 0);
        }
    }

    markAllAsRead() {
        const adminId = this.admin.email || this.admin.id;
        this.notifications.forEach(n => {
            if (!n.readBy || !n.readBy.includes(adminId)) {
                const notifRef = doc(this.db, 'notifications', n.id);
                const newReadBy = n.readBy ? [...n.readBy, adminId] : [adminId];
                updateDoc(notifRef, { readBy: newReadBy });
            }
        });
        this.unreadCount = 0;
        this.updateNotificationBadge();
    }

    updateNotificationsUI() {
        // À adapter selon ton HTML : exemple simple
        const list = document.getElementById('notificationsList');
        if (!list) return;
        list.innerHTML = this.notifications.map(n => `
            <li class="${(!n.readBy || !n.readBy.includes(this.admin.email)) ? 'font-bold' : ''}">
                <span>${n.title || 'Notification'}</span><br>
                <span class="text-xs text-gray-500">${n.message || ''}</span><br>
                <span class="text-xs text-gray-400">${new Date(n.timestamp?.seconds ? n.timestamp.seconds * 1000 : n.timestamp).toLocaleString('fr-FR')}</span>
            </li>
        `).join('');
    }
}

// Initialiser le gestionnaire de notifications
document.addEventListener('DOMContentLoaded', () => {
    window.notificationsManager = new NotificationsManager();
    window.persistentNotificationsManager = new PersistentNotificationsManager();
    const bell = document.getElementById('notificationBell');
    const panel = document.getElementById('notificationsPanel');

    if (bell && panel) {
        bell.addEventListener('click', () => {
            const isOpen = !panel.classList.contains('hidden');
            // Fermer tous les autres panneaux si besoin
            document.querySelectorAll('.notificationsPanel').forEach(p => p.classList.add('hidden'));
            if (!isOpen) {
                panel.classList.remove('hidden');
                // Marquer comme lues
                if (window.persistentNotificationsManager) {
                    window.persistentNotificationsManager.markAllAsRead();
                }
            } else {
                panel.classList.add('hidden');
            }
        });
        // Fermer le panneau si on clique en dehors
        document.addEventListener('click', (e) => {
            if (!panel.contains(e.target) && !bell.contains(e.target)) {
                panel.classList.add('hidden');
            }
        });
    }
});

// Nettoyer lors du changement de page
window.addEventListener('beforeunload', () => {
    if (window.notificationsManager) {
        window.notificationsManager.destroy();
    }
});