import { getFirestore, collection, doc, updateDoc, query, where, getDocs, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// SHA-256 pour mot de passe
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

class ProfileManager {
    constructor() {
        this.db = getFirestore();
        this.adminData = null;
        this.init();
    }

    async init() {
        await this.waitForAuth();
        this.setupEventListeners();
        await this.loadProfile();
    }

    async waitForAuth() {
        return new Promise(resolve => {
            const checkAuth = () => {
                if (window.trackingCarAuth && window.trackingCarAuth.isAuthenticated()) {
                    resolve();
                } else {
                    setTimeout(checkAuth, 100);
                }
            };
            checkAuth();
        });
    }

    setupEventListeners() {
        document.getElementById('editProfileBtn')?.addEventListener('click', () => this.toggleEditMode(true));
        document.getElementById('cancelEditBtn')?.addEventListener('click', () => this.toggleEditMode(false));
        document.getElementById('profileForm')?.addEventListener('submit', (e) => this.handleProfileUpdate(e));
        document.getElementById('passwordForm')?.addEventListener('submit', (e) => this.handlePasswordChange(e));
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
            window.location.href = '../index.html';
        });
    }

    async loadProfile() {
        // Contrôle d'accès centralisé : seul l'admin connecté accède à son profil
        const admin = window.checkAccessForAdmin();
        if (!admin) throw new Error('Accès refusé ou non authentifié');
        // Charge les infos Firestore (admin_users)
        const adminQuery = query(
            collection(this.db, 'admin_users'),
            where('email', '==', admin.email)
        );
        const snapshot = await getDocs(adminQuery);
        if (snapshot.empty) {
            alert("Impossible de charger les informations du profil.");
            return;
        }
        this.adminData = snapshot.docs[0].data();
        this.adminData._docId = snapshot.docs[0].id; // Pour updateDoc
        window.currentAdminData = this.adminData; // Pour accès global

        this.updateProfileDisplay();
        await this.loadLoginHistory();
        await this.loadUserStats();
        this.loadPermissions();
    }

    updateProfileDisplay() {
        const admin = this.adminData;
        // Informations principales
        document.getElementById('displayName').textContent = admin.displayName || admin.email;
        document.getElementById('email').textContent = admin.email;
        document.getElementById('role').textContent = this.getRoleText(admin.role);
        document.getElementById('legion').textContent = this.getLegionText(admin.legion);

        // Carte profil
        const initials = (admin.displayName || admin.email || 'A')
            .split(' ')
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2);

        document.getElementById('profileInitials').textContent = initials;
        document.getElementById('profileDisplayName').textContent = admin.displayName || 'Administrateur';
        document.getElementById('profileRole').textContent = this.getRoleText(admin.role);
        document.getElementById('profileLegion').textContent = this.getLegionText(admin.legion);

        // Dates
        document.getElementById('lastLogin').textContent = admin.lastLogin
            ? (admin.lastLogin.seconds ? new Date(admin.lastLogin.seconds * 1000) : new Date(admin.lastLogin)).toLocaleString('fr-FR')
            : '-';
        document.getElementById('accountCreated').textContent = admin.createdAt
            ? (admin.createdAt.seconds ? new Date(admin.createdAt.seconds * 1000) : new Date(admin.createdAt)).toLocaleDateString('fr-FR')
            : '-';
    }

    getRoleText(role) {
        const roleTexts = {
            'global_admin': 'Administrateur Global',
            'legion_admin': 'Administrateur de Légion'
        };
        return roleTexts[role] || role;
    }

    getLegionText(legion) {
        if (this.adminData.role === 'global_admin') {
            return 'Toutes les légions';
        }
        return legion || '-';
    }

    toggleEditMode(editing) {
        const profileView = document.getElementById('profileView');
        const profileForm = document.getElementById('profileForm');
        const editBtn = document.getElementById('editProfileBtn');

        if (editing) {
            profileView.classList.add('hidden');
            profileForm.classList.remove('hidden');
            editBtn.classList.add('hidden');
            document.getElementById('editDisplayName').value = this.adminData.displayName || '';
            document.getElementById('editEmail').value = this.adminData.email || '';
        } else {
            profileView.classList.remove('hidden');
            profileForm.classList.add('hidden');
            editBtn.classList.remove('hidden');
        }
    }

    async handleProfileUpdate(e) {
        e.preventDefault();
        const newDisplayName = document.getElementById('editDisplayName').value.trim();
        if (!newDisplayName) {
            alert('Le nom complet est requis');
            return;
        }
        try {
            // Mettre à jour dans admin_users
            await updateDoc(doc(this.db, 'admin_users', this.adminData._docId), {
                displayName: newDisplayName,
                updated_at: new Date()
            });
            this.adminData.displayName = newDisplayName;
            this.updateProfileDisplay();
            this.toggleEditMode(false);
            alert('Profil mis à jour avec succès');
        } catch (error) {
            console.error('Erreur mise à jour profil:', error);
            alert('Erreur lors de la mise à jour');
        }
    }

    async handlePasswordChange(e) {
        e.preventDefault();
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (newPassword !== confirmPassword) {
            alert('Les nouveaux mots de passe ne correspondent pas');
            return;
        }
        if (newPassword.length < 8) {
            alert('Le nouveau mot de passe doit contenir au moins 8 caractères');
            return;
        }
        try {
            // Vérifie l'ancien mot de passe (hash)
            const hashedCurrent = await hashPassword(currentPassword);
            if (hashedCurrent !== this.adminData.password) {
                alert("Mot de passe actuel incorrect");
                return;
            }
            // Hash du nouveau mot de passe
            const hashedNew = await hashPassword(newPassword);
            await updateDoc(doc(this.db, 'admin_users', this.adminData._docId), {
                password: hashedNew,
                updated_at: new Date()
            });
            this.adminData.password = hashedNew;
            document.getElementById('passwordForm').reset();
            alert("Mot de passe changé avec succès !");
        } catch (error) {
            console.error('Erreur changement mot de passe:', error);
            alert('Erreur lors du changement de mot de passe');
        }
    }

    async loadLoginHistory() {
        try {
            const logsQuery = query(
                collection(this.db, 'admin_logs'),
                where('adminEmail', '==', this.adminData.email),
                where('action', 'in', ['LOGIN_SUCCESS', 'LOGIN']),
                orderBy('timestamp', 'desc'),
                limit(10)
            );
            const snapshot = await getDocs(logsQuery);
            const loginHistory = document.getElementById('loginHistory');
            if (snapshot.empty) {
                loginHistory.innerHTML = `
                    <div class="text-center text-gray-500 py-4">
                        <i class="fas fa-history text-2xl mb-2"></i>
                        <p>Aucun historique de connexion trouvé</p>
                    </div>
                `;
                return;
            }
            loginHistory.innerHTML = snapshot.docs.map(doc => {
                const log = doc.data();
                return `
                    <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <div>
                            <div class="text-sm font-medium text-gray-900">
                                Connexion réussie
                            </div>
                            <div class="text-xs text-gray-500">
                                ${log.timestamp && log.timestamp.seconds ? new Date(log.timestamp.seconds * 1000).toLocaleString('fr-FR') : '-'}
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="text-xs text-gray-500">
                                ${log.ipAddress || 'IP inconnue'}
                            </div>
                            <div class="text-xs text-green-600">
                                <i class="fas fa-check-circle mr-1"></i>Succès
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Erreur chargement historique:', error);
            document.getElementById('loginHistory').innerHTML = `
                <div class="text-center text-red-500 py-4">
                    <i class="fas fa-exclamation-triangle text-xl mb-2"></i>
                    <p>Erreur lors du chargement</p>
                </div>
            `;
        }
    }

    loadPermissions() {
        const permissionsList = document.getElementById('permissionsList');
        const permissions = this.adminData.permissions || {};
        const permissionLabels = {
            'can_manage_users': 'Gérer les utilisateurs',
            'can_view_all_reports': 'Voir tous les rapports',
            'can_export_data': 'Exporter les données',
            'can_manage_system': 'Gérer le système',
            'can_manage_rewards': 'Gérer les récompenses',
            'can_view_all_legions': 'Voir toutes les légions',
            'can_create_vehicles': 'Créer des véhicules',
            'can_edit_vehicles': 'Modifier des véhicules',
            'can_delete_vehicles': 'Supprimer des véhicules',
            'can_verify_detections': 'Vérifier les détections',
            'can_process_rewards': 'Traiter les récompenses',
            'can_manage_admins': 'Gérer les administrateurs'
        };
        const permissionsHTML = Object.entries(permissions)
            .filter(([_, hasPermission]) => hasPermission)
            .map(([permission, _]) => {
                const label = permissionLabels[permission] || permission;
                return `
                    <div class="flex items-center text-sm">
                        <i class="fas fa-check text-green-500 mr-2"></i>
                        <span class="text-gray-700">${label}</span>
                    </div>
                `;
            }).join('');
        if (permissionsHTML) {
            permissionsList.innerHTML = permissionsHTML;
        } else {
            permissionsList.innerHTML = `
                <div class="text-center text-gray-500 text-sm">
                    <i class="fas fa-lock text-xl mb-2"></i>
                    <p>Aucune permission spécifique</p>
                </div>
            `;
        }
    }

    async loadUserStats() {
        try {
            // Connexions ce mois
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);
            const monthlyLoginsQuery = query(
                collection(this.db, 'admin_logs'),
                where('adminEmail', '==', this.adminData.email),
                where('action', 'in', ['LOGIN_SUCCESS', 'LOGIN']),
                where('timestamp', '>=', startOfMonth)
            );
            const monthlyLoginsSnapshot = await getDocs(monthlyLoginsQuery);

            // Toutes les actions
            const allActionsQuery = query(
                collection(this.db, 'admin_logs'),
                where('adminEmail', '==', this.adminData.email)
            );
            const allActionsSnapshot = await getDocs(allActionsQuery);

            // Dernière action
            const lastActionQuery = query(
                collection(this.db, 'admin_logs'),
                where('adminEmail', '==', this.adminData.email),
                where('action', '!=', 'LOGIN_SUCCESS'),
                orderBy('timestamp', 'desc'),
                limit(1)
            );
            const lastActionSnapshot = await getDocs(lastActionQuery);

            document.getElementById('monthlyLogins').textContent = monthlyLoginsSnapshot.size;
            document.getElementById('totalActions').textContent = allActionsSnapshot.size;
            if (!lastActionSnapshot.empty) {
                const lastAction = lastActionSnapshot.docs[0].data();
                document.getElementById('lastAction').textContent = lastAction.timestamp && lastAction.timestamp.seconds
                    ? new Date(lastAction.timestamp.seconds * 1000).toLocaleString('fr-FR')
                    : '-';
            } else {
                document.getElementById('lastAction').textContent = 'Aucune action';
            }
        } catch (error) {
            console.error('Erreur chargement statistiques:', error);
            document.getElementById('monthlyLogins').textContent = 'Erreur';
            document.getElementById('totalActions').textContent = 'Erreur';
            document.getElementById('lastAction').textContent = 'Erreur';
        }
    }
}

// Initialiser la gestion du profil
document.addEventListener('DOMContentLoaded', () => {
    new ProfileManager();
});