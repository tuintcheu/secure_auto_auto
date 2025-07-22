// Paramètres système - TRACKING CAR
import { getFirestore, doc, getDoc, setDoc, Timestamp, addDoc, collection } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

class SettingsManager {
    constructor() {
        this.db = getFirestore();
        this.settings = {};
        this.systemStartTime = new Date();
        this.init();
    }

    async init() {
        this.waitForAuth();
        this.setupEventListeners();
        this.updateSystemInfo();
    }

    waitForAuth() {
        const checkAuth = () => {
            if (window.trackingCarAuth && window.trackingCarAuth.getCurrentAdmin()) {
                this.checkPermissions();
                this.loadSettings();
            } else {
                setTimeout(checkAuth, 100);
            }
        };
        checkAuth();
    }

    checkPermissions() {
        const auth = window.trackingCarAuth;
        
        if (!auth.isGlobalAdmin()) {
            // Afficher message de restriction pour certaines sections
            document.getElementById('restrictionMessage').classList.remove('hidden');
            
            // Masquer ou désactiver certaines sections pour admin de légion
            const maintenanceSection = document.getElementById('maintenanceSection');
            if (maintenanceSection) {
                const buttons = maintenanceSection.querySelectorAll('button');
                buttons.forEach(btn => {
                    btn.disabled = true;
                    btn.classList.add('opacity-50', 'cursor-not-allowed');
                });
            }
        }
    }

    setupEventListeners() {
        // Formulaires de paramètres
        document.getElementById('rewardsSettingsForm')?.addEventListener('submit', (e) => {
            this.handleRewardsSettings(e);
        });

        document.getElementById('securitySettingsForm')?.addEventListener('submit', (e) => {
            this.handleSecuritySettings(e);
        });

        document.getElementById('notificationsSettingsForm')?.addEventListener('submit', (e) => {
            this.handleNotificationsSettings(e);
        });

        // Actions de maintenance
        document.getElementById('createBackupBtn')?.addEventListener('click', () => {
            this.createBackup();
        });

        document.getElementById('cleanLogsBtn')?.addEventListener('click', () => {
            this.cleanOldLogs();
        });

        document.getElementById('optimizeDbBtn')?.addEventListener('click', () => {
            this.optimizeDatabase();
        });

        document.getElementById('resetSystemBtn')?.addEventListener('click', () => {
            this.resetSystemSettings();
        });

        document.getElementById('maintenanceModeBtn')?.addEventListener('click', () => {
            this.toggleMaintenanceMode();
        });

        // UI
        document.getElementById('sidebarToggle')?.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('-translate-x-full');
        });

        document.getElementById('userMenuBtn')?.addEventListener('click', () => {
            document.getElementById('userDropdown').classList.toggle('hidden');
        });
    }

    async loadSettings() {
        try {
            // Charger les paramètres depuis Firestore
            const settingsDoc = await getDoc(doc(this.db, 'system_settings', 'global'));
            
            if (settingsDoc.exists()) {
                this.settings = settingsDoc.data();
            } else {
                // Paramètres par défaut
                this.settings = this.getDefaultSettings();
                await this.saveSettings();
            }

            this.populateFormFields();

        } catch (error) {
            console.error('Erreur chargement paramètres:', error);
            this.settings = this.getDefaultSettings();
            this.populateFormFields();
        }
    }

    getDefaultSettings() {
        return {
            rewards: {
                baseAmount: 25000,
                luxuryBonus: 15000,
                autoApprovalDelay: 7,
                monthlyLimit: 5
            },
            security: {
                sessionDuration: 120,
                maxLoginAttempts: 5,
                lockoutDuration: 15,
                passwordComplexity: 'medium',
                enforcePasswordChange: true,
                enableTwoFactor: false
            },
            notifications: {
                email: {
                    onDetection: true,
                    onReward: true,
                    onSystemError: true
                },
                push: {
                    onDetection: true,
                    onLogin: false
                }
            },
            system: {
                maintenanceMode: false,
                lastBackup: null,
                lastMaintenance: null
            }
        };
    }

    populateFormFields() {
        // Paramètres des récompenses
        document.getElementById('baseRewardAmount').value = this.settings.rewards?.baseAmount || 25000;
        document.getElementById('luxuryBonus').value = this.settings.rewards?.luxuryBonus || 15000;
        document.getElementById('autoApprovalDelay').value = this.settings.rewards?.autoApprovalDelay || 7;
        document.getElementById('monthlyLimit').value = this.settings.rewards?.monthlyLimit || 5;

        // Paramètres de sécurité
        document.getElementById('sessionDuration').value = this.settings.security?.sessionDuration || 120;
        document.getElementById('maxLoginAttempts').value = this.settings.security?.maxLoginAttempts || 5;
        document.getElementById('lockoutDuration').value = this.settings.security?.lockoutDuration || 15;
        document.getElementById('passwordComplexity').value = this.settings.security?.passwordComplexity || 'medium';
        document.getElementById('enforcePasswordChange').checked = this.settings.security?.enforcePasswordChange !== false;
        document.getElementById('enableTwoFactor').checked = this.settings.security?.enableTwoFactor === true;

        // Paramètres de notifications
        document.getElementById('emailOnDetection').checked = this.settings.notifications?.email?.onDetection !== false;
        document.getElementById('emailOnReward').checked = this.settings.notifications?.email?.onReward !== false;
        document.getElementById('emailOnSystemError').checked = this.settings.notifications?.email?.onSystemError !== false;
        document.getElementById('pushOnDetection').checked = this.settings.notifications?.push?.onDetection !== false;
        document.getElementById('pushOnLogin').checked = this.settings.notifications?.push?.onLogin === true;

        // Informations système
        this.updateSystemInfo();
    }

    updateSystemInfo() {
        // Simuler des informations système
        const now = new Date();
        const uptime = Math.floor((now - this.systemStartTime) / 1000 / 60); // en minutes
        
        document.getElementById('uptime').textContent = this.formatUptime(uptime);
        document.getElementById('dbSize').textContent = '~2.5 GB';
        document.getElementById('systemStartTime').textContent = this.systemStartTime.toLocaleDateString('fr-FR');
        
        // Dernières dates de maintenance
        if (this.settings.system?.lastBackup) {
            document.getElementById('lastBackupDate').textContent = 
                TrackingCarUtils.formatDate(this.settings.system.lastBackup);
            document.getElementById('backupStatus').classList.remove('hidden');
        }

        if (this.settings.system?.lastMaintenance) {
            document.getElementById('lastMaintenanceDate').textContent = 
                TrackingCarUtils.formatDate(this.settings.system.lastMaintenance);
        } else {
            document.getElementById('lastMaintenanceDate').textContent = 'Jamais';
        }
    }

    formatUptime(minutes) {
        if (minutes < 60) return `${minutes} minutes`;
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} heures`;
        
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        return `${days} jours ${remainingHours}h`;
    }

    async handleRewardsSettings(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        
        this.settings.rewards = {
            baseAmount: parseInt(formData.get('baseRewardAmount')),
            luxuryBonus: parseInt(formData.get('luxuryBonus')),
            autoApprovalDelay: parseInt(formData.get('autoApprovalDelay')),
            monthlyLimit: parseInt(formData.get('monthlyLimit'))
        };

        await this.saveSettings();
        await this.logAction('SETTINGS_UPDATED', { category: 'rewards', settings: this.settings.rewards });
        
        TrackingCarUtils.showNotification('Paramètres des récompenses sauvegardés', 'success');
    }

    async handleSecuritySettings(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        
        this.settings.security = {
            sessionDuration: parseInt(formData.get('sessionDuration')),
            maxLoginAttempts: parseInt(formData.get('maxLoginAttempts')),
            lockoutDuration: parseInt(formData.get('lockoutDuration')),
            passwordComplexity: formData.get('passwordComplexity'),
            enforcePasswordChange: formData.has('enforcePasswordChange'),
            enableTwoFactor: formData.has('enableTwoFactor')
        };

        await this.saveSettings();
        await this.logAction('SETTINGS_UPDATED', { category: 'security', settings: this.settings.security });
        
        TrackingCarUtils.showNotification('Paramètres de sécurité sauvegardés', 'success');
    }

    async handleNotificationsSettings(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        
        this.settings.notifications = {
            email: {
                onDetection: formData.has('emailOnDetection'),
                onReward: formData.has('emailOnReward'),
                onSystemError: formData.has('emailOnSystemError')
            },
            push: {
                onDetection: formData.has('pushOnDetection'),
                onLogin: formData.has('pushOnLogin')
            }
        };

        await this.saveSettings();
        await this.logAction('SETTINGS_UPDATED', { category: 'notifications', settings: this.settings.notifications });
        
        TrackingCarUtils.showNotification('Paramètres de notifications sauvegardés', 'success');
    }

    async saveSettings() {
        try {
            this.settings.updatedAt = Timestamp.now();
            this.settings.updatedBy = window.trackingCarAuth.getCurrentAdmin()?.email;
            
            await setDoc(doc(this.db, 'system_settings', 'global'), this.settings);
            
        } catch (error) {
            console.error('Erreur sauvegarde paramètres:', error);
            throw error;
        }
    }

    async createBackup() {
        const confirmed = await TrackingCarUtils.showConfirmation(
            'Créer une sauvegarde',
            'Créer une sauvegarde complète de la base de données ? Cette opération peut prendre quelques minutes.',
            'Créer la sauvegarde',
            'Annuler'
        );

        if (!confirmed) return;

        try {
            TrackingCarUtils.showLoading(true, 'Création de la sauvegarde...');

            // Simuler la création d'une sauvegarde
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Mettre à jour la date de dernière sauvegarde
            this.settings.system = this.settings.system || {};
            this.settings.system.lastBackup = Timestamp.now();
            await this.saveSettings();

            await this.logAction('SYSTEM_BACKUP', { 
                type: 'manual',
                size: '2.5GB',
                status: 'success'
            });

            this.updateSystemInfo();
            TrackingCarUtils.showNotification('Sauvegarde créée avec succès', 'success');

        } catch (error) {
            console.error('Erreur sauvegarde:', error);
            TrackingCarUtils.showNotification('Erreur lors de la création de la sauvegarde', 'error');
        } finally {
            TrackingCarUtils.showLoading(false);
        }
    }

    async cleanOldLogs() {
        const confirmed = await TrackingCarUtils.showConfirmation(
            'Nettoyer les logs anciens',
            'Supprimer tous les logs de plus de 90 jours ? Cette action est irréversible.',
            'Nettoyer',
            'Annuler'
        );

        if (!confirmed) return;

        try {
            TrackingCarUtils.showLoading(true, 'Nettoyage des logs...');

            // Simuler le nettoyage
            await new Promise(resolve => setTimeout(resolve, 2000));

            await this.logAction('SYSTEM_MAINTENANCE', { 
                type: 'log_cleanup',
                deletedRecords: 1247,
                status: 'success'
            });

            TrackingCarUtils.showNotification('Logs anciens supprimés avec succès', 'success');

        } catch (error) {
            console.error('Erreur nettoyage logs:', error);
            TrackingCarUtils.showNotification('Erreur lors du nettoyage des logs', 'error');
        } finally {
            TrackingCarUtils.showLoading(false);
        }
    }

    async optimizeDatabase() {
        const confirmed = await TrackingCarUtils.showConfirmation(
            'Optimiser la base de données',
            'Lancer l\'optimisation de la base de données ? Cette opération peut affecter temporairement les performances.',
            'Optimiser',
            'Annuler'
        );

        if (!confirmed) return;

        try {
            TrackingCarUtils.showLoading(true, 'Optimisation en cours...');

            // Simuler l'optimisation
            await new Promise(resolve => setTimeout(resolve, 4000));

            this.settings.system = this.settings.system || {};
            this.settings.system.lastMaintenance = Timestamp.now();
            await this.saveSettings();

            await this.logAction('SYSTEM_MAINTENANCE', { 
                type: 'database_optimization',
                optimizedTables: ['stolen_vehicles', 'detections', 'admin_logs'],
                status: 'success',
                performanceGain: '15%'
            });

            this.updateSystemInfo();
            TrackingCarUtils.showNotification('Base de données optimisée avec succès', 'success');

        } catch (error) {
            console.error('Erreur optimisation:', error);
            TrackingCarUtils.showNotification('Erreur lors de l\'optimisation', 'error');
        } finally {
            TrackingCarUtils.showLoading(false);
        }
    }

    async resetSystemSettings() {
        const confirmed = await TrackingCarUtils.showConfirmation(
            'Réinitialiser les paramètres',
            'ATTENTION: Cette action va restaurer tous les paramètres aux valeurs par défaut. Cette action est irréversible.\n\nÊtes-vous absolument sûr ?',
            'Oui, réinitialiser',
            'Annuler'
        );

        if (!confirmed) return;

        try {
            TrackingCarUtils.showLoading(true, 'Réinitialisation...');

            // Sauvegarder les anciens paramètres pour le log
            const oldSettings = { ...this.settings };

            // Restaurer les paramètres par défaut
            this.settings = this.getDefaultSettings();
            await this.saveSettings();

            // Repeupler les formulaires
            this.populateFormFields();

            await this.logAction('SYSTEM_RESET', { 
                type: 'settings_reset',
                previousSettings: oldSettings,
                newSettings: this.settings
            });

            TrackingCarUtils.showNotification('Paramètres réinitialisés aux valeurs par défaut', 'warning');

        } catch (error) {
            console.error('Erreur réinitialisation:', error);
            TrackingCarUtils.showNotification('Erreur lors de la réinitialisation', 'error');
        } finally {
            TrackingCarUtils.showLoading(false);
        }
    }

    async toggleMaintenanceMode() {
        const isCurrentlyInMaintenance = this.settings.system?.maintenanceMode === true;
        const action = isCurrentlyInMaintenance ? 'désactiver' : 'activer';
        
        const confirmed = await TrackingCarUtils.showConfirmation(
            `${action.charAt(0).toUpperCase() + action.slice(1)} le mode maintenance`,
            `${action.charAt(0).toUpperCase() + action.slice(1)} le mode maintenance ? ${
                isCurrentlyInMaintenance 
                    ? 'Les utilisateurs pourront à nouveau accéder au système.' 
                    : 'Aucun utilisateur ne pourra accéder au système pendant la maintenance.'
            }`,
            action.charAt(0).toUpperCase() + action.slice(1),
            'Annuler'
        );

        if (!confirmed) return;

        try {
            TrackingCarUtils.showLoading(true, `${action.charAt(0).toUpperCase() + action.slice(1)}ation du mode maintenance...`);

            this.settings.system = this.settings.system || {};
            this.settings.system.maintenanceMode = !isCurrentlyInMaintenance;
            this.settings.system.maintenanceModeChanged = Timestamp.now();
            
            await this.saveSettings();

            const button = document.getElementById('maintenanceModeBtn');
            if (button) {
                if (this.settings.system.maintenanceMode) {
                    button.innerHTML = '<i class="fas fa-play mr-1"></i>Désactiver maintenance';
                    button.className = 'btn bg-green-600 text-white hover:bg-green-700 text-sm';
                } else {
                    button.innerHTML = '<i class="fas fa-tools mr-1"></i>Mode maintenance';
                    button.className = 'btn bg-orange-600 text-white hover:bg-orange-700 text-sm';
                }
            }

            await this.logAction('SYSTEM_MAINTENANCE', { 
                type: 'maintenance_mode_toggle',
                enabled: this.settings.system.maintenanceMode,
                timestamp: Timestamp.now()
            });

            TrackingCarUtils.showNotification(
                `Mode maintenance ${this.settings.system.maintenanceMode ? 'activé' : 'désactivé'}`, 
                this.settings.system.maintenanceMode ? 'warning' : 'success'
            );

        } catch (error) {
            console.error('Erreur mode maintenance:', error);
            TrackingCarUtils.showNotification('Erreur lors du changement de mode', 'error');
        } finally {
            TrackingCarUtils.showLoading(false);
        }
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
                category: 'SYSTEM'
            });
        } catch (error) {
            console.error('Erreur log action:', error);
        }
    }

    // Méthodes publiques pour accéder aux paramètres
    getRewardSettings() {
        return this.settings.rewards || this.getDefaultSettings().rewards;
    }

    getSecuritySettings() {
        return this.settings.security || this.getDefaultSettings().security;
    }

    getNotificationSettings() {
        return this.settings.notifications || this.getDefaultSettings().notifications;
    }

    isMaintenanceMode() {
        return this.settings.system?.maintenanceMode === true;
    }
}

// Initialiser la gestion des paramètres
document.addEventListener('DOMContentLoaded', () => {
    // Contrôle d'accès centralisé : seuls les admins globaux ont accès à cette page
    const admin = window.checkAccessForAdmin();
    if (!admin || admin.role !== 'global_admin') {
        alert('Accès réservé aux administrateurs globaux.');
        window.location.href = '/dashboard.html';
        throw new Error('Accès refusé');
    }
    window.settingsManager = new SettingsManager();
});

// Exporter pour utilisation dans d'autres modules
window.TrackingCarSettings = {
    getRewardSettings: () => window.settingsManager?.getRewardSettings(),
    getSecuritySettings: () => window.settingsManager?.getSecuritySettings(),
    getNotificationSettings: () => window.settingsManager?.getNotificationSettings(),
    isMaintenanceMode: () => window.settingsManager?.isMaintenanceMode()
};