/**
 * Application principale SecurAuto Admin
 * Point d'entrée de l'application
 */

import { FirebaseService } from '../services/firebase-service.js';
import { SecurityService } from '../services/security-service.js';
import { AuthenticationManager } from './auth/authentication.js';
import { SessionManager } from './auth/session-manager.js';
import { Dashboard } from './components/dashboard.js';
import { VehicleManagement } from './components/vehicle-management.js';
import { DetectionHistory } from './components/detection-history.js';
import { RegionalStats } from './components/regional-stats.js';
import { UserManagement } from './components/user-management.js';
import { NotificationManager } from './components/notifications.js';
import { ROLE_PERMISSIONS } from '../config/regions-config.js';

class SecurAutoAdminApp {
    constructor() {
        // Services principaux
        this.firebaseService = new FirebaseService();
        this.securityService = new SecurityService();
        this.authManager = new AuthenticationManager(this.firebaseService, this.securityService);
        this.sessionManager = new SessionManager(this.securityService);
        this.notificationManager = new NotificationManager(this.firebaseService);
        
        // Composants de l'interface
        this.dashboard = null;
        this.vehicleManagement = null;
        this.detectionHistory = null;
        this.regionalStats = null;
        this.userManagement = null;
        
        // État de l'application
        this.currentUser = null;
        this.userRole = null;
        this.userRegion = null;
        this.userLegion = null;
        this.currentView = 'dashboard';
        
        // Initialisation
        this.init();
    }

    /**
     * Initialise l'application
     */
    async init() {
        try {
            console.log('🚀 Initialisation de SecurAuto Admin...');
            
            // Masquer l'écran de chargement après un délai minimum
            setTimeout(() => {
                document.getElementById('loadingScreen').classList.add('hidden');
            }, 1000);
            
            // Configurer les gestionnaires d'événements globaux
            this.setupGlobalEventHandlers();
            
            // Configurer l'écoute d'authentification
            this.setupAuthStateListener();
            
            // Nettoyer périodiquement les tokens expirés
            setInterval(() => {
                this.securityService.cleanupExpiredTokens();
            }, 300000); // 5 minutes
            
            console.log('✅ Application initialisée avec succès');
            
        } catch (error) {
            console.error('❌ Erreur lors de l\'initialisation:', error);
            this.showError('Erreur lors de l\'initialisation de l\'application');
        }
    }

    /**
     * Configure l'écoute des changements d'état d'authentification
     */
    setupAuthStateListener() {
        this.firebaseService.auth.onAuthStateChanged(async (user) => {
            if (user) {
                await this.handleUserSignedIn(user);
            } else {
                this.handleUserSignedOut();
            }
        });
    }

    /**
     * Gère l'utilisateur connecté
     * @param {Object} user - Utilisateur Firebase
     */
    async handleUserSignedIn(user) {
        try {
            console.log('👤 Utilisateur connecté:', user.email);
            
            // Vérifier les droits admin
            const adminDoc = await this.firebaseService.db.collection('admin_users').doc(user.uid).get();
            
            if (!adminDoc.exists || !adminDoc.data().isActive) {
                console.log('🚫 Accès admin non autorisé');
                await this.firebaseService.auth.signOut();
                this.showError('Accès administrateur non autorisé');
                return;
            }

            const adminData = adminDoc.data();
            
            // Stocker les informations utilisateur
            this.currentUser = user;
            this.userRole = adminData.role || 'legion_admin';
            this.userRegion = adminData.region || null;
            this.userLegion = adminData.legion || null;
            
            // Log de connexion
            await this.firebaseService.logActivity('LOGIN_SUCCESS', {
                role: this.userRole,
                region: this.userRegion,
                legion: this.userLegion
            }, user.uid, user.email);
            
            // Afficher l'interface admin
            this.showAdminInterface();
            
            // Démarrer la gestion de session
            this.sessionManager.startSession(user);
            
            console.log(`✅ Interface admin chargée - Rôle: ${this.userRole}`);
            
        } catch (error) {
            console.error('❌ Erreur lors de la gestion de l\'utilisateur connecté:', error);
            this.showError('Erreur lors de la vérification des permissions');
        }
    }

    /**
     * Gère l'utilisateur déconnecté
     */
    handleUserSignedOut() {
        console.log('👋 Utilisateur déconnecté');
        
        // Réinitialiser l'état
        this.currentUser = null;
        this.userRole = null;
        this.userRegion = null;
        this.userLegion = null;
        
        // Arrêter la session
        this.sessionManager.endSession();
        
        // Détruire les composants
        this.destroyComponents();
        
        // Afficher l'écran de connexion
        this.showLoginScreen();
    }

    /**
     * Affiche l'écran de connexion
     */
    showLoginScreen() {
        document.getElementById('adminDashboard').classList.add('hidden');
        document.getElementById('loginScreen').classList.remove('hidden');
        
        // Charger le composant de connexion s'il n'est pas déjà chargé
        this.authManager.renderLoginForm();
    }

    /**
     * Affiche l'interface d'administration
     */
    showAdminInterface() {
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('adminDashboard').classList.remove('hidden');
        
        // Initialiser les composants
        this.initializeComponents();
        
        // Rendre l'interface
        this.renderAdminInterface();
        
        // Configurer les notifications temps réel
        this.setupRealtimeNotifications();
    }

    /**
     * Initialise les composants de l'interface
     */
    initializeComponents() {
        // Dashboard
        this.dashboard = new Dashboard(
            this.firebaseService, 
            this.userRole, 
            this.userRegion, 
            this.userLegion
        );
        
        // Gestion des véhicules
        this.vehicleManagement = new VehicleManagement(
            this.firebaseService, 
            this.securityService,
            this.userRole, 
            this.userRegion, 
            this.userLegion
        );
        
        // Historique des détections
        this.detectionHistory = new DetectionHistory(
            this.firebaseService, 
            this.userRole, 
            this.userRegion, 
            this.userLegion
        );
        
        // Statistiques régionales
        this.regionalStats = new RegionalStats(
            this.firebaseService, 
            this.userRole, 
            this.userRegion, 
            this.userLegion
        );
        
        // Gestion des utilisateurs (Super Admin uniquement)
        if (this.userRole === 'super_admin') {
            this.userManagement = new UserManagement(
                this.firebaseService, 
                this.securityService
            );
        }
    }

    /**
     * Détruit les composants
     */
    destroyComponents() {
        if (this.dashboard) this.dashboard.destroy();
        if (this.vehicleManagement) this.vehicleManagement.destroy();
        if (this.detectionHistory) this.detectionHistory.destroy();
        if (this.regionalStats) this.regionalStats.destroy();
        if (this.userManagement) this.userManagement.destroy();
        
        this.dashboard = null;
        this.vehicleManagement = null;
        this.detectionHistory = null;
        this.regionalStats = null;
        this.userManagement = null;
    }

    /**
     * Rend l'interface d'administration
     */
    renderAdminInterface() {
        // Rendre l'en-tête
        this.renderHeader();
        
        // Rendre la navigation
        this.renderNavigation();
        
        // Afficher la vue par défaut
        this.showView('dashboard');
    }

    /**
     * Rend l'en-tête de l'application
     */
    renderHeader() {
        const header = document.getElementById('adminHeader');
        const permissions = ROLE_PERMISSIONS[this.userRole];
        
        header.innerHTML = `
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex justify-between items-center py-4">
                    <div class="flex items-center">
                        <div class="h-8 w-8 bg-primary rounded flex items-center justify-center">
                            <i class="fas fa-shield-alt text-white"></i>
                        </div>
                        <h1 class="ml-3 text-xl font-semibold text-gray-900 dark:text-white">
                            SecurAuto Admin
                        </h1>
                        <span class="ml-4 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                            ${permissions.name}
                        </span>
                        ${this.userRegion ? `
                            <span class="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                                ${this.userRegion}
                            </span>
                        ` : ''}
                        ${this.userLegion ? `
                            <span class="ml-2 px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                                ${this.userLegion}
                            </span>
                        ` : ''}
                    </div>
                    
                    <div class="flex items-center space-x-4">
                        <!-- Notifications -->
                        <div class="relative">
                            <button 
                                id="notificationButton" 
                                class="p-2 text-gray-400 hover:text-gray-600 relative"
                                onclick="app.toggleNotifications()"
                            >
                                <i class="fas fa-bell text-xl"></i>
                                <span id="notificationBadge" class="hidden absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center notification-pulse">0</span>
                            </button>
                        </div>
                        
                        <!-- Statut de connexion -->
                        <div class="flex items-center text-sm text-gray-600 dark:text-gray-400">
                            <div class="h-2 w-2 bg-green-400 rounded-full mr-2"></div>
                            <span>Connexion sécurisée</span>
                        </div>
                        
                        <!-- Menu utilisateur -->
                        <div class="relative">
                            <button 
                                id="userMenuButton" 
                                class="flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                                onclick="app.toggleUserMenu()"
                            >
                                <img class="h-8 w-8 rounded-full" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%235D5CDE' viewBox='0 0 24 24'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E" alt="Avatar">
                                <span class="ml-2 text-gray-700 dark:text-gray-300">
                                    ${this.currentUser.displayName || this.currentUser.email}
                                </span>
                            </button>
                            
                            <div id="userMenu" class="hidden absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border z-50">
                                <div class="py-1">
                                    <div class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border-b">
                                        <div>Connecté en tant que:</div>
                                        <div class="font-medium">${this.currentUser.email}</div>
                                    </div>
                                    <button onclick="app.showSecuritySettings()" class="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                                        <i class="fas fa-cog mr-2"></i>Paramètres de sécurité
                                    </button>
                                    <button onclick="app.showActivityLog()" class="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                                        <i class="fas fa-history mr-2"></i>Journal d'activité
                                    </button>
                                    <button onclick="app.handleLogout()" class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700">
                                        <i class="fas fa-sign-out-alt mr-2"></i>Déconnexion sécurisée
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Rend la navigation principale
     */
    renderNavigation() {
        const navigation = document.getElementById('adminNavigation');
        const permissions = ROLE_PERMISSIONS[this.userRole];
        
        navigation.innerHTML = `
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex space-x-8">
                    <button onclick="app.showView('dashboard')" class="nav-item active px-3 py-4 text-sm font-medium text-white border-b-2 border-primary">
                        <i class="fas fa-tachometer-alt mr-2"></i>Tableau de bord
                    </button>
                    <button onclick="app.showView('vehicles')" class="nav-item px-3 py-4 text-sm font-medium text-gray-300 hover:text-white border-b-2 border-transparent hover:border-primary transition-all">
                        <i class="fas fa-car mr-2"></i>Gestion véhicules
                    </button>
                    <button onclick="app.showView('detections')" class="nav-item px-3 py-4 text-sm font-medium text-gray-300 hover:text-white border-b-2 border-transparent hover:border-primary transition-all">
                        <i class="fas fa-search mr-2"></i>Historique détections
                    </button>
                    <button onclick="app.showView('stats')" class="nav-item px-3 py-4 text-sm font-medium text-gray-300 hover:text-white border-b-2 border-transparent hover:border-primary transition-all">
                        <i class="fas fa-chart-bar mr-2"></i>Statistiques
                    </button>
                    ${permissions.can_manage_users ? `
                        <button onclick="app.showView('users')" class="nav-item px-3 py-4 text-sm font-medium text-gray-300 hover:text-white border-b-2 border-transparent hover:border-primary transition-all">
                            <i class="fas fa-users-cog mr-2"></i>Gestion utilisateurs
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Affiche une vue spécifique
     * @param {string} viewName - Nom de la vue à afficher
     */
    showView(viewName) {
        // Mettre à jour l'état
        this.currentView = viewName;
        
        // Mettre à jour la navigation
        this.updateNavigationState(viewName);
        
        // Rendre la vue
        switch (viewName) {
            case 'dashboard':
                this.dashboard.render(document.getElementById('mainContent'));
                break;
            case 'vehicles':
                this.vehicleManagement.render(document.getElementById('mainContent'));
                break;
            case 'detections':
                this.detectionHistory.render(document.getElementById('mainContent'));
                break;
            case 'stats':
                this.regionalStats.render(document.getElementById('mainContent'));
                break;
            case 'users':
                if (this.userManagement) {
                    this.userManagement.render(document.getElementById('mainContent'));
                }
                break;
            default:
                console.error('Vue inconnue:', viewName);
        }
    }

    /**
     * Met à jour l'état de la navigation
     * @param {string} activeView - Vue active
     */
    updateNavigationState(activeView) {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach((item, index) => {
            const viewNames = ['dashboard', 'vehicles', 'detections', 'stats', 'users'];
            const viewName = viewNames[index];
            
            if (viewName === activeView) {
                item.classList.add('active', 'text-white', 'border-primary');
                item.classList.remove('text-gray-300', 'border-transparent');
            } else {
                item.classList.remove('active', 'text-white', 'border-primary');
                item.classList.add('text-gray-300', 'border-transparent');
            }
        });
    }

    /**
     * Configure les notifications en temps réel
     */
    setupRealtimeNotifications() {
        this.notificationManager.setup(
            this.userRole, 
            this.userRegion, 
            this.userLegion,
            (notification) => {
                this.showNotification(notification);
            }
        );
    }

    /**
     * Configure les gestionnaires d'événements globaux
     */
    setupGlobalEventHandlers() {
        // Fermer les menus en cliquant ailleurs
        document.addEventListener('click', (event) => {
            const notificationButton = document.getElementById('notificationButton');
            const userMenuButton = document.getElementById('userMenuButton');
            
            if (notificationButton && !notificationButton.contains(event.target)) {
                document.getElementById('notificationPanel')?.classList.add('hidden');
            }
            
            if (userMenuButton && !userMenuButton.contains(event.target)) {
                document.getElementById('userMenu')?.classList.add('hidden');
            }
        });
        
        // Gestion des erreurs globales
        window.addEventListener('error', (event) => {
            console.error('Erreur globale:', event.error);
            this.firebaseService.logActivity('GLOBAL_ERROR', {
                message: event.error.message,
                stack: event.error.stack,
                filename: event.filename,
                lineno: event.lineno
            }, this.currentUser?.uid, this.currentUser?.email);
        });
        
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Promise rejetée:', event.reason);
            event.preventDefault();
            this.firebaseService.logActivity('UNHANDLED_REJECTION', {
                reason: event.reason.toString()
            }, this.currentUser?.uid, this.currentUser?.email);
        });
    }

    /**
     * Gère la déconnexion
     */
    async handleLogout() {
        try {
            if (this.currentUser) {
                await this.firebaseService.logActivity('LOGOUT', {}, this.currentUser.uid, this.currentUser.email);
            }
            
            await this.firebaseService.auth.signOut();
            this.showSuccess('Déconnexion réussie');
            
        } catch (error) {
            console.error('Erreur de déconnexion:', error);
            this.showError('Erreur lors de la déconnexion');
        }
    }

    /**
     * Bascule l'affichage des notifications
     */
    toggleNotifications() {
        this.notificationManager.togglePanel();
    }

    /**
     * Bascule le menu utilisateur
     */
    toggleUserMenu() {
        const menu = document.getElementById('userMenu');
        menu?.classList.toggle('hidden');
    }

    /**
     * Affiche les paramètres de sécurité
     */
    showSecuritySettings() {
        // À implémenter
        console.log('Paramètres de sécurité');
    }

    /**
     * Affiche le journal d'activité
     */
    showActivityLog() {
        // À implémenter
        console.log('Journal d\'activité');
    }

    /**
     * Affiche une notification de succès
     * @param {string} message - Message à afficher
     */
    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    /**
     * Affiche une notification d'erreur
     * @param {string} message - Message à afficher
     */
    showError(message) {
        this.showNotification(message, 'error');
    }

    /**
     * Affiche une notification
     * @param {string} message - Message à afficher
     * @param {string} type - Type de notification
     */
    showNotification(message, type = 'info') {
        const container = document.getElementById('notificationsContainer');
        const notification = document.createElement('div');
        
        const colors = {
            success: 'bg-green-100 border-green-400 text-green-700',
            error: 'bg-red-100 border-red-400 text-red-700',
            warning: 'bg-yellow-100 border-yellow-400 text-yellow-700',
            info: 'bg-blue-100 border-blue-400 text-blue-700'
        };
        
        notification.className = `p-4 border rounded-md shadow-lg max-w-sm animate-pulse ${colors[type] || colors.info}`;
        notification.innerHTML = `
            <div class="flex items-center justify-between">
                <span>${this.securityService.sanitizeInput(message)}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-2 text-gray-500 hover:text-gray-700">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        container.appendChild(notification);
        
        // Supprimer automatiquement après 5 secondes
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }
}

// Initialiser l'application quand le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SecurAutoAdminApp();
});

export { SecurAutoAdminApp };