// Gestion des administrateurs - TRACKING CAR
import { getFirestore, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth, createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// S'assurer que LEGIONS est toujours défini
window.TrackingCarConfig = window.TrackingCarConfig || {};
window.TrackingCarConfig.LEGIONS = window.TrackingCarConfig.LEGIONS || {
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

class AdminsManager {
    constructor() {
        this.db = getFirestore();
        this.auth = getAuth();
        this.allAdmins = [];
        this.filteredAdmins = [];
        this.filters = {
            search: '',
            role: '',
            legion: '',
            status: ''
        };
        this.init();
    }

    async init() {
        this.waitForAuth();
        this.setupEventListeners();
        this.loadLegions();
    }

    waitForAuth() {
        const checkAuth = () => {
            if (window.trackingCarAuth && window.trackingCarAuth.getCurrentAdmin()) {
                this.checkPermissions();
            } else {
                setTimeout(checkAuth, 100);
            }
        };
        checkAuth();
    }

    checkPermissions() {
        const auth = window.trackingCarAuth;

        // DEBUG: Afficher l'admin courant et ses permissions
        console.log('Admin courant:', window.trackingCarAuth?.getCurrentAdmin());
        console.log('Permissions:', window.trackingCarAuth?.getCurrentAdmin()?.permissions);
        console.log('hasPermission:', typeof window.trackingCarAuth?.hasPermission);

        const admin = auth && auth.getCurrentAdmin && auth.getCurrentAdmin();
        if (!admin || admin.role !== 'global_admin') {
            // Afficher message de restriction
            document.getElementById('restrictionMessage').classList.remove('hidden');
            document.getElementById('adminManagement').classList.add('hidden');
            return;
        }
        // Si admin global, accès complet
        document.getElementById('restrictionMessage').classList.add('hidden');
        document.getElementById('adminManagement').classList.remove('hidden');
        this.loadAdmins();
    }

    setupEventListeners() {
        // Recherche et filtres
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', 
                TrackingCarUtils.debounce(() => this.handleFilterChange(), 300)
            );
        }

        ['roleFilter', 'legionFilter', 'statusFilter'].forEach(filterId => {
            const element = document.getElementById(filterId);
            if (element) {
                element.addEventListener('change', () => this.handleFilterChange());
            }
        });

        document.getElementById('clearFiltersBtn')?.addEventListener('click', () => {
            this.clearFilters();
        });

        // Actions
        document.getElementById('addAdminBtn')?.addEventListener('click', () => {
            this.openAddAdminModal();
        });

        document.getElementById('exportAdminsBtn')?.addEventListener('click', () => {
            this.exportAdmins();
        });

        // Modals
        document.getElementById('closeAddAdminModalBtn')?.addEventListener('click', () => {
            this.closeAddAdminModal();
        });

        document.getElementById('cancelAddAdminBtn')?.addEventListener('click', () => {
            this.closeAddAdminModal();
        });

        document.getElementById('closeEditAdminModalBtn')?.addEventListener('click', () => {
            this.closeEditAdminModal();
        });

        // Formulaires
        document.getElementById('addAdminForm')?.addEventListener('submit', (e) => {
            this.handleCreateAdmin(e);
        });

        document.getElementById('adminRole')?.addEventListener('change', (e) => {
            this.toggleLegionSelection(e.target.value);
        });

        // UI
        document.getElementById('sidebarToggle')?.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('-translate-x-full');
        });

        document.getElementById('userMenuBtn')?.addEventListener('click', () => {
            document.getElementById('userDropdown').classList.toggle('hidden');
        });
    }

    loadLegions() {
        const legionFilter = document.getElementById('legionFilter');
        const adminLegion = document.getElementById('adminLegion');
        
        Object.entries(window.TrackingCarConfig.LEGIONS).forEach(([code, info]) => {
            // Filtre
            if (legionFilter) {
                const option = document.createElement('option');
                option.value = code;
                option.textContent = info.name;
                legionFilter.appendChild(option);
            }
            
            // Modal d'ajout
            if (adminLegion) {
                const option = document.createElement('option');
                option.value = code;
                option.textContent = `${info.name} (${info.headquarters})`;
                adminLegion.appendChild(option);
            }
        });
    }

    async loadAdmins() {
        try {
            document.getElementById('loadingState').style.display = 'block';

            const adminsQuery = query(collection(this.db, 'admin_users'));
            const snapshot = await getDocs(adminsQuery);
            
            this.allAdmins = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            this.filteredAdmins = [...this.allAdmins];

            document.getElementById('loadingState').style.display = 'none';
            
            this.displayAdmins();
            this.updateStats();

        } catch (error) {
            console.error('Erreur chargement administrateurs:', error);
            TrackingCarUtils.showNotification('Erreur lors du chargement des administrateurs', 'error');
        }
    }

    updateStats() {
        const totalAdmins = this.allAdmins.length;
        const activeAdmins = this.allAdmins.filter(admin => admin.isActive !== false).length;
        const globalAdmins = this.allAdmins.filter(admin => admin.role === 'global_admin').length;
        const legionAdmins = this.allAdmins.filter(admin => admin.role === 'legion_admin').length;

        document.getElementById('totalAdmins').textContent = totalAdmins;
        document.getElementById('activeAdmins').textContent = activeAdmins;
        document.getElementById('globalAdmins').textContent = globalAdmins;
        document.getElementById('legionAdmins').textContent = legionAdmins;
    }

    handleFilterChange() {
        this.filters.search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        this.filters.role = document.getElementById('roleFilter')?.value || '';
        this.filters.legion = document.getElementById('legionFilter')?.value || '';
        this.filters.status = document.getElementById('statusFilter')?.value || '';

        this.applyFilters();
        this.displayAdmins();
    }

    applyFilters() {
        this.filteredAdmins = this.allAdmins.filter(admin => {
            // Filtre de recherche
            if (this.filters.search) {
                const searchText = this.filters.search;
                const matchFields = [
                    admin.displayName,
                    admin.email,
                    admin.id
                ].filter(Boolean).join(' ').toLowerCase();

                if (!matchFields.includes(searchText)) {
                    return false;
                }
            }

            // Filtre de rôle
            if (this.filters.role && admin.role !== this.filters.role) {
                return false;
            }

            // Filtre de légion
            if (this.filters.legion && admin.legion !== this.filters.legion) {
                return false;
            }

            // Filtre de statut
            if (this.filters.status) {
                switch (this.filters.status) {
                    case 'active':
                        if (admin.isActive === false) return false;
                        break;
                    case 'inactive':
                        if (admin.isActive !== false) return false;
                        break;
                    case 'pending':
                        if (admin.status !== 'pending') return false;
                        break;
                }
            }

            return true;
        });

        // Mettre à jour le compteur
        document.getElementById('resultsCount').textContent = `${this.filteredAdmins.length} administrateur(s) trouvé(s)`;
    }

    displayAdmins() {
        const container = document.getElementById('adminsList');
        if (!container) return;

        if (this.filteredAdmins.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-user-shield text-4xl text-gray-300 mb-4"></i>
                    <p class="text-gray-500 mb-4">Aucun administrateur trouvé</p>
                    <button onclick="adminsManager.openAddAdminModal()" class="btn btn-primary">
                        <i class="fas fa-plus mr-2"></i>Créer le premier administrateur
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = this.filteredAdmins.map((admin, index) => 
            this.createAdminCard(admin, index)
        ).join('');
    }

    createAdminCard(admin, index) {
        const isActive = admin.isActive !== false;
        const roleText = admin.role === 'global_admin' ? 'Administrateur Global' : 'Administrateur de Légion';
        const roleColor = admin.role === 'global_admin' ? 'purple' : 'blue';
        const statusColor = isActive ? 'green' : 'red';
        const statusText = isActive ? 'Actif' : 'Inactif';
        
        const legionText = admin.role === 'global_admin' ? 
            'Toutes les légions' : 
            TrackingCarUtils.getLegionName(admin.legion) || admin.legion;

        return `
            <div class="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-all duration-300 bg-white slide-in-right" 
                 style="animation-delay: ${index * 50}ms">
                
                <!-- Header admin -->
                <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center space-x-4">
                        <div class="w-12 h-12 bg-gradient-to-r from-${roleColor}-500 to-${roleColor}-600 rounded-full flex items-center justify-center">
                            <span class="text-white font-bold text-lg">
                                ${(admin.displayName || admin.email || 'A').charAt(0).toUpperCase()}
                            </span>
                        </div>
                        
                        <div>
                            <h3 class="font-semibold text-gray-900">${admin.displayName || 'Nom non défini'}</h3>
                            <p class="text-sm text-gray-600">${admin.email}</p>
                            <div class="flex items-center space-x-2 mt-1">
                                <span class="status-badge bg-${roleColor}-100 text-${roleColor}-800 text-xs">
                                    <i class="fas fa-${admin.role === 'global_admin' ? 'crown' : 'shield-alt'} mr-1"></i>
                                    ${roleText}
                                </span>
                                <span class="status-badge bg-${statusColor}-100 text-${statusColor}-800 text-xs">
                                    <i class="fas fa-circle mr-1"></i>
                                    ${statusText}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="text-right text-sm text-gray-500">
                        <div>Créé le ${TrackingCarUtils.formatDate(admin.createdAt, { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                        ${admin.lastLogin ? `
                            <div class="mt-1">Dernière connexion: ${TrackingCarUtils.formatDate(admin.lastLogin, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                        ` : ''}
                    </div>
                </div>

                <!-- Informations détaillées -->
                <div class="bg-gray-50 rounded-lg p-4 mb-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                            <span class="text-gray-600">Légion:</span>
                            <span class="ml-2 font-medium">${legionText}</span>
                        </div>
                        <div>
                            <span class="text-gray-600">ID:</span>
                            <span class="ml-2 font-mono text-xs">${admin.id}</span>
                        </div>
                        ${admin.createdBy ? `
                            <div>
                                <span class="text-gray-600">Créé par:</span>
                                <span class="ml-2 font-medium">${admin.createdBy}</span>
                            </div>
                        ` : ''}
                        ${admin.permissions ? `
                            <div>
                                <span class="text-gray-600">Permissions:</span>
                                <span class="ml-2 font-medium">${Object.keys(admin.permissions).length} autorisations</span>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Actions -->
                <div class="flex justify-end space-x-2">
                    <button onclick="adminsManager.viewAdminDetails('${admin.id}')" 
                            class="btn text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1">
                        <i class="fas fa-eye mr-1"></i>Détails
                    </button>
                    
                    <button onclick="adminsManager.editAdmin('${admin.id}')" 
                            class="btn text-sm bg-yellow-100 text-yellow-700 hover:bg-yellow-200 px-3 py-1">
                        <i class="fas fa-edit mr-1"></i>Modifier
                    </button>
                    
                    ${isActive ? `
                        <button onclick="adminsManager.deactivateAdmin('${admin.id}')" 
                                class="btn text-sm bg-orange-100 text-orange-700 hover:bg-orange-200 px-3 py-1">
                            <i class="fas fa-user-slash mr-1"></i>Désactiver
                        </button>
                    ` : `
                        <button onclick="adminsManager.activateAdmin('${admin.id}')" 
                                class="btn text-sm bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1">
                            <i class="fas fa-user-check mr-1"></i>Activer
                        </button>
                    `}
                    
                    <button onclick="adminsManager.resetPassword('${admin.id}')" 
                            class="btn text-sm bg-purple-100 text-purple-700 hover:bg-purple-200 px-3 py-1">
                        <i class="fas fa-key mr-1"></i>Reset MDP
                    </button>
                    
                    <button onclick="adminsManager.deleteAdmin('${admin.id}')" 
                            class="btn text-sm bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1">
                        <i class="fas fa-trash mr-1"></i>Supprimer
                    </button>
                </div>
            </div>
        `;
    }

    clearFilters() {
        document.getElementById('searchInput').value = '';
        document.getElementById('roleFilter').value = '';
        document.getElementById('legionFilter').value = '';
        document.getElementById('statusFilter').value = '';
        
        this.filters = { search: '', role: '', legion: '', status: '' };
        this.filteredAdmins = [...this.allAdmins];
        this.displayAdmins();
    }

    openAddAdminModal() {
        document.getElementById('addAdminModal').classList.remove('hidden');
        document.getElementById('addAdminForm').reset();
        document.getElementById('legionSelection').classList.add('hidden');
    }

    closeAddAdminModal() {
        document.getElementById('addAdminModal').classList.add('hidden');
    }

    closeEditAdminModal() {
        document.getElementById('editAdminModal').classList.add('hidden');
    }

    toggleLegionSelection(role) {
        const legionSelection = document.getElementById('legionSelection');
        const adminLegion = document.getElementById('adminLegion');
        
        if (role === 'legion_admin') {
            legionSelection.classList.remove('hidden');
            adminLegion.required = true;
        } else {
            legionSelection.classList.add('hidden');
            adminLegion.required = false;
            adminLegion.value = '';
        }
    }

    async handleCreateAdmin(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const adminData = {
            displayName: formData.get('displayName').trim(),
            email: formData.get('email').trim().toLowerCase(),
            role: formData.get('role'),
            legion: formData.get('legion') || null,
            password: formData.get('password')
        };

        // Validations
        if (!adminData.displayName || !adminData.email || !adminData.role || !adminData.password) {
            TrackingCarUtils.showNotification('Tous les champs obligatoires doivent être remplis', 'error');
            return;
        }

        if (adminData.role === 'legion_admin' && !adminData.legion) {
            TrackingCarUtils.showNotification('Une légion doit être sélectionnée pour un admin de légion', 'error');
            return;
        }

        // Vérifier si l'email existe déjà
        const existingAdmin = this.allAdmins.find(admin => admin.email === adminData.email);
        if (existingAdmin) {
            TrackingCarUtils.showNotification('Un administrateur avec cet email existe déjà', 'error');
            return;
        }

        try {
            TrackingCarUtils.showLoading(true, 'Création de l\'administrateur...');

            // Créer l'utilisateur dans Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(this.auth, adminData.email, adminData.password);
            
            // Définir les permissions selon le rôle
            const permissions = this.getPermissionsByRole(adminData.role);
            
            // Créer l'enregistrement admin
            const adminRecord = {
                email: adminData.email,
                displayName: adminData.displayName,
                role: adminData.role,
                legion: adminData.legion,
                permissions: permissions,
                isActive: true,
                status: 'active',
                createdAt: Timestamp.now(),
                createdBy: window.trackingCarAuth.getCurrentAdmin().email,
                mustChangePassword: true
            };

            await addDoc(collection(this.db, 'admin_users'), adminRecord);

            // Log de l'action
            await this.logAction('ADMIN_CREATED', {
                newAdminEmail: adminData.email,
                newAdminRole: adminData.role,
                newAdminLegion: adminData.legion
            });

            this.closeAddAdminModal();
            await this.loadAdmins();
            
            TrackingCarUtils.showNotification(`Administrateur ${adminData.displayName} créé avec succès`, 'success');

        } catch (error) {
            console.error('Erreur création admin:', error);
            let errorMessage = 'Erreur lors de la création de l\'administrateur';
            
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = 'Cette adresse email est déjà utilisée';
            } else if (error.code === 'auth/weak-password') {
                errorMessage = 'Le mot de passe est trop faible';
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = 'Format d\'email invalide';
            }
            
            TrackingCarUtils.showNotification(errorMessage, 'error');
        } finally {
            TrackingCarUtils.showLoading(false);
        }
    }

    getPermissionsByRole(role) {
        if (role === 'global_admin') {
            return window.TrackingCarConfig.PERMISSIONS.global_admin;
        } else {
            return window.TrackingCarConfig.PERMISSIONS.legion_admin;
        }
    }

    async activateAdmin(adminId) {
        const confirmed = await TrackingCarUtils.showConfirmation(
            'Activer l\'administrateur',
            'Êtes-vous sûr de vouloir activer cet administrateur ?',
            'Activer',
            'Annuler'
        );

        if (!confirmed) return;

        try {
            await updateDoc(doc(this.db, 'admin_users', adminId), {
                isActive: true,
                status: 'active',
                updated_at: Timestamp.now()
            });

            await this.logAction('ADMIN_ACTIVATED', { adminId: adminId });
            await this.loadAdmins();
            
            TrackingCarUtils.showNotification('Administrateur activé avec succès', 'success');

        } catch (error) {
            console.error('Erreur activation admin:', error);
            TrackingCarUtils.showNotification('Erreur lors de l\'activation', 'error');
        }
    }

    async deactivateAdmin(adminId) {
        const admin = this.allAdmins.find(a => a.id === adminId);
        
        const confirmed = await TrackingCarUtils.showConfirmation(
            'Désactiver l\'administrateur',
            `Êtes-vous sûr de vouloir désactiver ${admin?.displayName || 'cet administrateur'} ? Il ne pourra plus se connecter.`,
            'Désactiver',
            'Annuler'
        );

        if (!confirmed) return;

        try {
            await updateDoc(doc(this.db, 'admin_users', adminId), {
                isActive: false,
                status: 'inactive',
                updated_at: Timestamp.now()
            });

            await this.logAction('ADMIN_DEACTIVATED', { adminId: adminId });
            await this.loadAdmins();
            
            TrackingCarUtils.showNotification('Administrateur désactivé avec succès', 'warning');

        } catch (error) {
            console.error('Erreur désactivation admin:', error);
            TrackingCarUtils.showNotification('Erreur lors de la désactivation', 'error');
        }
    }

    async deleteAdmin(adminId) {
        const admin = this.allAdmins.find(a => a.id === adminId);
        
        const confirmed = await TrackingCarUtils.showConfirmation(
            'Supprimer l\'administrateur',
            `ATTENTION: Êtes-vous sûr de vouloir supprimer définitivement ${admin?.displayName || 'cet administrateur'} ? Cette action est irréversible.`,
            'Oui, supprimer',
            'Annuler'
        );

        if (!confirmed) return;

        try {
            TrackingCarUtils.showLoading(true, 'Suppression...');

            await deleteDoc(doc(this.db, 'admin_users', adminId));

            await this.logAction('ADMIN_DELETED', { 
                adminId: adminId,
                adminEmail: admin?.email,
                adminName: admin?.displayName 
            });
            
            await this.loadAdmins();
            
            TrackingCarUtils.showNotification('Administrateur supprimé avec succès', 'success');

        } catch (error) {
            console.error('Erreur suppression admin:', error);
            TrackingCarUtils.showNotification('Erreur lors de la suppression', 'error');
        } finally {
            TrackingCarUtils.showLoading(false);
        }
    }

    async resetPassword(adminId) {
        const admin = this.allAdmins.find(a => a.id === adminId);
        
        const confirmed = await TrackingCarUtils.showConfirmation(
            'Reset du mot de passe',
            `Réinitialiser le mot de passe de ${admin?.displayName || 'cet administrateur'} ? Un nouveau mot de passe temporaire sera généré.`,
            'Réinitialiser',
            'Annuler'
        );

        if (!confirmed) return;

        try {
            // Générer un mot de passe temporaire
            const tempPassword = this.generateTempPassword();
            
            // Ici, dans un vrai système, on enverrait un email avec le nouveau mot de passe
            // Pour la démo, on l'affiche dans une alerte
            
            await updateDoc(doc(this.db, 'admin_users', adminId), {
                mustChangePassword: true,
                passwordResetAt: Timestamp.now(),
                updated_at: Timestamp.now()
            });

            await this.logAction('ADMIN_PASSWORD_RESET', { adminId: adminId });
            
            // Afficher le mot de passe temporaire
            alert(`Mot de passe temporaire généré pour ${admin?.displayName}:\n\n${tempPassword}\n\nVeuillez le communiquer de manière sécurisée à l'administrateur.`);
            
            TrackingCarUtils.showNotification('Mot de passe réinitialisé avec succès', 'success');

        } catch (error) {
            console.error('Erreur reset password:', error);
            TrackingCarUtils.showNotification('Erreur lors de la réinitialisation', 'error');
        }
    }

    generateTempPassword() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
        let password = '';
        for (let i = 0; i < 12; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }

    async exportAdmins() {
        try {
            TrackingCarUtils.showLoading(true, 'Préparation de l\'export...');

            const dataToExport = this.filteredAdmins.map(admin => ({
                'ID': admin.id,
                'Nom': admin.displayName || 'N/A',
                'Email': admin.email,
                'Rôle': admin.role === 'global_admin' ? 'Admin Global' : 'Admin Légion',
                'Légion': admin.role === 'global_admin' ? 'Toutes' : TrackingCarUtils.getLegionName(admin.legion),
                'Statut': admin.isActive !== false ? 'Actif' : 'Inactif',
                'Créé le': TrackingCarUtils.formatDate(admin.createdAt, { year: 'numeric', month: '2-digit', day: '2-digit' }),
                'Créé par': admin.createdBy || 'N/A',
                'Dernière connexion': TrackingCarUtils.formatDate(admin.lastLogin, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
            }));

            const csvContent = this.convertToCSV(dataToExport);
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `administrateurs_tracking_car_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            TrackingCarUtils.showNotification('Export réalisé avec succès', 'success');

        } catch (error) {
            console.error('Erreur export:', error);
            TrackingCarUtils.showNotification('Erreur lors de l\'export', 'error');
        } finally {
            TrackingCarUtils.showLoading(false);
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

    async logAction(action, details) {
        try {
            const auth = window.trackingCarAuth;
            const adminData = auth.getAdminData();

            await addDoc(collection(this.db, 'admin_logs'), {
                timestamp: Timestamp.now(),
                adminId: adminData?.id || 'unknown',
                adminEmail: auth.getCurrentAdmin()?.email || 'unknown',
                action: action,
                details: details,
                ipAddress: 'web-interface',
                userAgent: navigator.userAgent,
                level: 'INFO',
                category: 'ADMIN_MANAGEMENT'
            });
        } catch (error) {
            console.error('Erreur log action:', error);
        }
    }
}

// Initialiser la gestion des administrateurs
document.addEventListener('DOMContentLoaded', () => {
    window.adminsManager = new AdminsManager();
});

// ===============================
// SCRIPT UTILITAIRE :
// Ajoute la permission can_manage_admins: true à tous les admins globaux
// (À exécuter une seule fois depuis la console du navigateur)
// ===============================
window.addCanManageAdminsToGlobals = async function() {
    const db = window.firebaseDb || getFirestore();
    const adminsSnap = await getDocs(collection(db, 'admin_users'));
    let count = 0;
    for (const docSnap of adminsSnap.docs) {
        const data = docSnap.data();
        if (data.role === 'global_admin') {
            const permissions = Object.assign({}, data.permissions, { can_manage_admins: true });
            await updateDoc(doc(db, 'admin_users', docSnap.id), { permissions });
            count++;
            console.log(`Permission ajoutée à: ${data.email}`);
        }
    }
    alert(`Mise à jour terminée. ${count} admin(s) global(aux) corrigé(s).`);
};
// Pour lancer : window.addCanManageAdminsToGlobals();
// ===============================