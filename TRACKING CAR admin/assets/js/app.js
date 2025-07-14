// Application principale TRACKING CAR
class TrackingCarApp {
    constructor() {
        this.currentView = null;
        this.components = {};
        this.init();
    }

    async init() {
        console.log('🚀 Initialisation TRACKING CAR');
        
        // Initialiser le mode sombre
        this.initializeDarkMode();
        
        // Attendre que Firebase soit prêt
        await this.waitForFirebase();
        
        // Setup des event listeners
        this.setupEventListeners();
        
        // Attendre l'authentification
        this.waitForAuth();
        
        console.log('✅ TRACKING CAR initialisé');
    }

    async waitForFirebase() {
        return new Promise((resolve) => {
            const checkFirebase = () => {
                if (window.firebase && window.db && window.auth) {
                    console.log('✅ Firebase prêt');
                    resolve();
                } else {
                    setTimeout(checkFirebase, 100);
                }
            };
            checkFirebase();
        });
    }

    waitForAuth() {
        const checkAuth = () => {
            if (window.trackingCarAuth) {
                // Masquer l'écran de chargement
                document.getElementById('loadingScreen').classList.add('hidden');
                
                // Vérifier si déjà connecté
                const currentUser = window.trackingCarAuth.getCurrentAdmin();
                if (currentUser) {
                    this.showAdminInterface();
                } else {
                    this.showLoginScreen();
                }
            } else {
                setTimeout(checkAuth, 100);
            }
        };
        checkAuth();
    }

    setupEventListeners() {
        // Formulaire de connexion
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Clics en dehors des menus pour les fermer
        document.addEventListener('click', (event) => {
            this.handleOutsideClicks(event);
        });

        // Raccourcis clavier
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeAllModals();
            }
        });
    }

    async handleLogin(event) {
        event.preventDefault();
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        
        if (!email || !password) {
            TrackingCarUtils.showNotification('Veuillez remplir tous les champs', 'error');
            return;
        }

        const loginButton = document.getElementById('loginButton');
        const loginText = document.getElementById('loginText');
        const loginLoader = document.getElementById('loginLoader');

        try {
            // Afficher le loader
            loginButton.disabled = true;
            loginText.textContent = 'Connexion...';
            loginLoader.classList.remove('hidden');

            // Tentative de connexion
            await window.trackingCarAuth.login(email, password);
            
            // Le succès sera géré par onAuthStateChanged
            
        } catch (error) {
            console.error('❌ Erreur de connexion:', error);
            
            let errorMessage = 'Erreur de connexion';
            switch (error.code) {
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                    errorMessage = 'Email ou mot de passe incorrect';
                    break;
                case 'auth/too-many-requests':
                    errorMessage = 'Trop de tentatives. Réessayez plus tard.';
                    break;
                case 'auth/user-disabled':
                    errorMessage = 'Compte désactivé';
                    break;
                default:
                    errorMessage = error.message;
            }
            
            TrackingCarUtils.showNotification(errorMessage, 'error');
            
        } finally {
            // Masquer le loader
            loginButton.disabled = false;
            loginText.textContent = 'Se connecter';
            loginLoader.classList.add('hidden');
        }
    }

    showLoginScreen() {
        document.getElementById('adminDashboard').classList.add('hidden');
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('loadingScreen').classList.add('hidden');
    }

    async showAdminInterface() {
        const adminData = window.trackingCarAuth.getAdminData();
        if (!adminData) return;

        console.log('🎯 Affichage interface admin pour:', adminData.displayName);

        // Masquer l'écran de connexion
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('adminDashboard').classList.remove('hidden');

        // Remplir les informations utilisateur
        this.updateUserInterface(adminData);

        // Charger le tableau de bord par défaut
        await this.showView('dashboard');
    }

    updateUserInterface(adminData) {
        const userName = document.getElementById('userName');
        const userEmail = document.getElementById('userEmail');
        const userRoleBadge = document.getElementById('userRoleBadge');
        const userLegionBadge = document.getElementById('userLegionBadge');

        if (userName) userName.textContent = adminData.displayName || 'Admin';
        if (userEmail) userEmail.textContent = adminData.email;
        
        if (userRoleBadge) {
            userRoleBadge.textContent = adminData.role === 'global_admin' ? 'Admin Global' : 'Admin Légion';
        }

        if (adminData.legion && adminData.legion !== 'ALL' && userLegionBadge) {
            const legionName = TrackingCarUtils.getLegionName(adminData.legion);
            userLegionBadge.textContent = legionName;
            userLegionBadge.classList.remove('hidden');
        }

        // Afficher les onglets selon les permissions
        if (adminData.role === 'global_admin') {
            document.getElementById('usersTab')?.classList.remove('hidden');
            document.getElementById('adminsTab')?.classList.remove('hidden');
        }
    }

    async showView(viewName) {
        console.log('🔄 Changement de vue vers:', viewName);

        try {
            // Mettre à jour la navigation
            this.updateNavigationState(viewName);

            // Afficher un loader
            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
                <div class="flex items-center justify-center py-12">
                    <div class="text-center">
                        <div class="loading-spinner mx-auto mb-4"></div>
                        <p class="text-gray-600 dark:text-gray-400">Chargement de ${viewName}...</p>
                    </div>
                </div>
            `;

            // Charger le composant approprié
            let content = '';
            switch (viewName) {
                case 'dashboard':
                    content = await this.loadDashboard();
                    break;
                case 'vehicles':
                    content = await this.loadVehicles();
                    break;
                case 'detections':
                    content = await this.loadDetections();
                    break;
                case 'rewards':
                    content = await this.loadRewards();
                    break;
                case 'users':
                    content = await this.loadUsers();
                    break;
                case 'admins':
                    content = await this.loadAdmins();
                    break;
                case 'reports':
                    content = await this.loadReports();
                    break;
                case 'settings':
                    content = await this.loadSettings();
                    break;
                case 'logs':
                    content = await this.loadLogs();
                    break;
                default:
                    content = this.loadNotFound(viewName);
            }

            mainContent.innerHTML = content;
            this.currentView = viewName;

            console.log('✅ Vue', viewName, 'chargée');

        } catch (error) {
            console.error('❌ Erreur chargement vue:', error);
            this.showError(error);
        }
    }

    updateNavigationState(activeView) {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach((item) => {
            const onclick = item.getAttribute('onclick');
            if (onclick && onclick.includes(`'${activeView}'`)) {
                item.classList.add('active', 'text-white', 'border-primary');
                item.classList.remove('text-gray-300', 'border-transparent');
            } else {
                item.classList.remove('active', 'text-white', 'border-primary');
                item.classList.add('text-gray-300', 'border-transparent');
            }
        });
    }

    async loadDashboard() {
        // Contenu du tableau de bord
        return `
            <div class="space-y-6">
                <div class="flex items-center justify-between">
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Tableau de bord</h1>
                    <div class="text-sm text-gray-500 dark:text-gray-400">
                        Dernière mise à jour: ${new Date().toLocaleString('fr-FR')}
                    </div>
                </div>
                
                <!-- Stats rapides -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div class="flex items-center">
                            <div class="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-lg flex items-center justify-center mr-4">
                                <i class="fas fa-car text-red-600 dark:text-red-400 text-xl"></i>
                            </div>
                            <div>
                                <div class="text-2xl font-bold text-gray-900 dark:text-white">147</div>
                                <div class="text-sm text-gray-500 dark:text-gray-400">Véhicules volés</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div class="flex items-center">
                            <div class="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mr-4">
                                <i class="fas fa-search text-blue-600 dark:text-blue-400 text-xl"></i>
                            </div>
                            <div>
                                <div class="text-2xl font-bold text-gray-900 dark:text-white">23</div>
                                <div class="text-sm text-gray-500 dark:text-gray-400">Détections aujourd'hui</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div class="flex items-center">
                            <div class="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mr-4">
                                <i class="fas fa-check-circle text-green-600 dark:text-green-400 text-xl"></i>
                            </div>
                            <div>
                                <div class="text-2xl font-bold text-gray-900 dark:text-white">34</div>
                                <div class="text-sm text-gray-500 dark:text-gray-400">Véhicules récupérés</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div class="flex items-center">
                            <div class="w-12 h-12 bg-yellow-100 dark:bg-yellow-900 rounded-lg flex items-center justify-center mr-4">
                                <i class="fas fa-gift text-yellow-600 dark:text-yellow-400 text-xl"></i>
                            </div>
                            <div>
                                <div class="text-2xl font-bold text-gray-900 dark:text-white">12</div>
                                <div class="text-sm text-gray-500 dark:text-gray-400">Récompenses en attente</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Activité récente -->
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <div class="p-6 border-b border-gray-200 dark:border-gray-700">
                        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Activité récente</h3>
                    </div>
                    <div class="p-6">
                        <div class="space-y-4">
                            <div class="flex items-center space-x-4">
                                <div class="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                                    <i class="fas fa-search text-blue-600 dark:text-blue-400"></i>
                                </div>
                                <div class="flex-1">
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">Nouvelle détection de véhicule volé</p>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">Toyota Corolla - Plaque: LT 234 AB</p>
                                </div>
                                <div class="text-sm text-gray-500 dark:text-gray-400">Il y a 2 minutes</div>
                            </div>
                            
                            <div class="flex items-center space-x-4">
                                <div class="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                                    <i class="fas fa-check text-green-600 dark:text-green-400"></i>
                                </div>
                                <div class="flex-1">
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">Véhicule récupéré</p>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">Honda Civic - Plaque: CE 567 XY</p>
                                </div>
                                <div class="text-sm text-gray-500 dark:text-gray-400">Il y a 1 heure</div>
                            </div>
                            
                            <div class="flex items-center space-x-4">
                                <div class="w-10 h-10 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center">
                                    <i class="fas fa-gift text-yellow-600 dark:text-yellow-400"></i>
                                </div>
                                <div class="flex-1">
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">Nouvelle récompense en attente</p>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">Détection confirmée - 25,000 FCFA</p>
                                </div>
                                <div class="text-sm text-gray-500 dark:text-gray-400">Il y a 3 heures</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async loadVehicles() {
        return `
            <div class="space-y-6">
                <div class="flex items-center justify-between">
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Véhicules volés</h1>
                    <button onclick="app.addVehicle()" class="btn btn-primary">
                        <i class="fas fa-plus mr-2"></i>Nouveau véhicule
                    </button>
                </div>
                
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <p class="text-gray-600 dark:text-gray-400">Module de gestion des véhicules volés en cours de développement...</p>
                </div>
            </div>
        `;
    }

    async loadDetections() {
        return `
            <div class="space-y-6">
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Détections mobiles</h1>
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <p class="text-gray-600 dark:text-gray-400">Module de détections mobiles en cours de développement...</p>
                </div>
            </div>
        `;
    }

    async loadRewards() {
        return `
            <div class="space-y-6">
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Récompenses</h1>
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <p class="text-gray-600 dark:text-gray-400">Module de gestion des récompenses en cours de développement...</p>
                </div>
            </div>
        `;
    }

    async loadUsers() {
        if (!window.trackingCarAuth.hasPermission('can_manage_users')) {
            return this.loadUnauthorized();
        }
        
        return `
            <div class="space-y-6">
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Utilisateurs de l'application</h1>
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <p class="text-gray-600 dark:text-gray-400">Module de gestion des utilisateurs en cours de développement...</p>
                </div>
            </div>
        `;
    }

    async loadAdmins() {
        if (!window.trackingCarAuth.hasPermission('can_manage_admins')) {
            return this.loadUnauthorized();
        }
        
        return `
            <div class="space-y-6">
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Administrateurs</h1>
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <p class="text-gray-600 dark:text-gray-400">Module de gestion des administrateurs en cours de développement...</p>
                </div>
            </div>
        `;
    }

    async loadReports() {
        return `
            <div class="space-y-6">
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Rapports et analyses</h1>
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <p class="text-gray-600 dark:text-gray-400">Module de rapports et analyses en cours de développement...</p>
                </div>
            </div>
        `;
    }

    async loadSettings() {
        return `
            <div class="space-y-6">
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Paramètres système</h1>
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <p class="text-gray-600 dark:text-gray-400">Module de paramètres système en cours de développement...</p>
                </div>
            </div>
        `;
    }

    async loadLogs() {
        return `
            <div class="space-y-6">
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Journal d'activité</h1>
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <p class="text-gray-600 dark:text-gray-400">Module de logs d'activité en cours de développement...</p>
                </div>
            </div>
        `;
    }

    loadUnauthorized() {
        return `
            <div class="text-center py-12">
                <div class="text-6xl mb-4">🚫</div>
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                    Accès non autorisé
                </h2>
                <p class="text-gray-600 dark:text-gray-400 mb-6">
                    Vous n'avez pas les permissions nécessaires pour accéder à cette section.
                </p>
                <button onclick="app.showView('dashboard')" class="btn btn-primary">
                    Retour au tableau de bord
                </button>
            </div>
        `;
    }

    loadNotFound(viewName) {
        return `
            <div class="text-center py-12">
                <div class="text-6xl mb-4">🔍</div>
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                    Page non trouvée
                </h2>
                <p class="text-gray-600 dark:text-gray-400 mb-6">
                    La page "${viewName}" n'existe pas ou n'est pas encore disponible.
                </p>
                <button onclick="app.showView('dashboard')" class="btn btn-primary">
                    Retour au tableau de bord
                </button>
            </div>
        `;
    }

    showError(error) {
        const mainContent = document.getElementById('mainContent');
        mainContent.innerHTML = `
            <div class="text-center py-12">
                <div class="text-6xl mb-4">⚠️</div>
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                    Erreur de chargement
                </h2>
                <p class="text-gray-600 dark:text-gray-400 mb-2">
                    Une erreur est survenue lors du chargement de cette page.
                </p>
                <p class="text-sm text-red-600 dark:text-red-400 mb-6">
                    ${error.message}
                </p>
                <div class="space-x-4">
                    <button onclick="location.reload()" class="btn btn-secondary">
                        Recharger la page
                    </button>
                    <button onclick="app.showView('dashboard')" class="btn btn-primary">
                        Retour au tableau de bord
                    </button>
                </div>
            </div>
        `;
    }

    initializeDarkMode() {
        const savedMode = localStorage.getItem('darkMode');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const shouldBeDark = savedMode === 'true' || (savedMode === null && prefersDark);
        
        if (shouldBeDark) {
            document.documentElement.classList.add('dark');
            const icon = document.getElementById('darkModeIcon');
            if (icon) icon.className = 'fas fa-sun';
        }
    }

    handleOutsideClicks(event) {
        // Fermer les menus si clic en dehors
        const notifications = document.getElementById('notificationPanel');
        const notificationBtn = document.getElementById('notificationButton');
        const userMenu = document.getElementById('userMenu');
        const userMenuBtn = document.getElementById('userMenuButton');

        if (notifications && !notifications.contains(event.target) && !notificationBtn.contains(event.target)) {
            notifications.classList.add('hidden');
        }

        if (userMenu && !userMenu.contains(event.target) && !userMenuBtn.contains(event.target)) {
            userMenu.classList.add('hidden');
        }
    }

    closeAllModals() {
        // Fermer tous les modals et panels
        document.getElementById('notificationPanel')?.classList.add('hidden');
        document.getElementById('userMenu')?.classList.add('hidden');
        document.getElementById('loginHelpModal')?.classList.add('hidden');
    }
}

// Fonctions globales
window.toggleDarkMode = function() {
    const html = document.documentElement;
    const isDark = html.classList.contains('dark');
    const icon = document.getElementById('darkModeIcon');
    
    if (isDark) {
        html.classList.remove('dark');
        if (icon) icon.className = 'fas fa-moon';
        localStorage.setItem('darkMode', 'false');
    } else {
        html.classList.add('dark');
        if (icon) icon.className = 'fas fa-sun';
        localStorage.setItem('darkMode', 'true');
    }
};

window.togglePasswordVisibility = function() {
    const passwordInput = document.getElementById('password');
    const toggleIcon = document.getElementById('passwordToggleIcon');
    
    if (passwordInput && toggleIcon) {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggleIcon.className = 'fas fa-eye-slash text-gray-400 hover:text-gray-600';
        } else {
            passwordInput.type = 'password';
            toggleIcon.className = 'fas fa-eye text-gray-400 hover:text-gray-600';
        }
    }
};

window.showLoginHelp = function() {
    document.getElementById('loginHelpModal')?.classList.remove('hidden');
};

window.closeLoginHelp = function() {
    document.getElementById('loginHelpModal')?.classList.add('hidden');
};

window.toggleNotifications = function() {
    document.getElementById('notificationPanel')?.classList.toggle('hidden');
};

window.toggleUserMenu = function() {
    document.getElementById('userMenu')?.classList.toggle('hidden');
};

window.markAllAsRead = function() {
    TrackingCarUtils.showNotification('Toutes les notifications marquées comme lues', 'success');
};

window.showUserProfile = function() {
    TrackingCarUtils.showNotification('Profil utilisateur - En développement', 'info');
};

window.handleLogout = async function() {
    await window.trackingCarAuth.logout();
};

window.showView = function(viewName) {
    if (window.app) {
        window.app.showView(viewName);
    }
};

// Initialiser l'application
document.addEventListener('DOMContentLoaded', () => {
    window.app = new TrackingCarApp();
});