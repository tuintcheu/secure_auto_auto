/**
 * Service de sécurité - Gestion centralisée de la sécurité
 */
import { SECURITY_CONFIG, VALIDATION_PATTERNS, SECURITY_MESSAGES } from '../../config/security-config.js';

class SecurityService {
    constructor() {
        this.loginAttempts = new Map();
        this.csrfTokens = new Map();
        this.rateLimits = new Map();
    }

    /**
     * Génère un token CSRF sécurisé
     * @returns {string} Token CSRF
     */
    generateCSRFToken() {
        const array = new Uint8Array(SECURITY_CONFIG.CSRF_TOKEN_LENGTH);
        crypto.getRandomValues(array);
        const token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
        
        // Stocker le token avec expiration
        this.csrfTokens.set(token, Date.now() + SECURITY_CONFIG.CSRF_TOKEN_EXPIRY);
        
        return token;
    }

    /**
     * Valide un token CSRF
     * @param {string} token - Token à valider
     * @returns {boolean} True si valide
     */
    validateCSRFToken(token) {
        if (!token || !this.csrfTokens.has(token)) {
            return false;
        }

        const expiry = this.csrfTokens.get(token);
        if (Date.now() > expiry) {
            this.csrfTokens.delete(token);
            return false;
        }

        // Token utilisé, le supprimer
        this.csrfTokens.delete(token);
        return true;
    }

    /**
     * Nettoie les entrées utilisateur contre XSS
     * @param {string} input - Entrée à nettoyer
     * @returns {string} Entrée nettoyée
     */
    sanitizeInput(input) {
        if (typeof input !== 'string') return '';
        
        return input
            .replace(/[<>'"&]/g, '') // Supprime les caractères dangereux
            .trim()
            .substring(0, SECURITY_CONFIG.MAX_INPUT_LENGTH);
    }

    /**
     * Valide un email
     * @param {string} email - Email à valider
     * @returns {boolean} True si valide
     */
    validateEmail(email) {
        return VALIDATION_PATTERNS.EMAIL.test(email) && email.length <= 100;
    }

    /**
     * Valide un numéro VIN
     * @param {string} vin - VIN à valider
     * @returns {boolean} True si valide
     */
    validateVIN(vin) {
        return VALIDATION_PATTERNS.VIN.test(vin);
    }

    /**
     * Valide une plaque d'immatriculation
     * @param {string} plate - Plaque à valider
     * @returns {boolean} True si valide
     */
    validateLicensePlate(plate) {
        return VALIDATION_PATTERNS.LICENSE_PLATE.test(plate);
    }

    /**
     * Évalue la force d'un mot de passe
     * @param {string} password - Mot de passe à évaluer
     * @returns {Object} Score et message
     */
    evaluatePasswordStrength(password) {
        let score = 0;
        let message = 'Très faible';
        
        if (password.length >= 8) score++;
        if (password.length >= 12) score++;
        if (/[a-z]/.test(password)) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;
        
        switch(true) {
            case score <= 2: message = 'Très faible'; break;
            case score === 3: message = 'Faible'; break;
            case score === 4: message = 'Moyen'; break;
            case score === 5: message = 'Fort'; break;
            case score === 6: message = 'Très fort'; break;
        }
        
        return { score, message };
    }

    /**
     * Gère les tentatives de connexion échouées
     * @param {string} identifier - Identifiant (email/IP)
     * @returns {Object} État du compte
     */
    handleFailedLogin(identifier) {
        const attempts = this.loginAttempts.get(identifier) || { count: 0, lastAttempt: 0 };
        attempts.count++;
        attempts.lastAttempt = Date.now();
        
        this.loginAttempts.set(identifier, attempts);
        
        const isLocked = attempts.count >= SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS;
        const lockoutTime = isLocked ? SECURITY_CONFIG.LOCKOUT_DURATION : 0;
        
        if (isLocked) {
            // Programmer la réinitialisation automatique
            setTimeout(() => {
                this.loginAttempts.delete(identifier);
            }, SECURITY_CONFIG.LOCKOUT_DURATION);
        }
        
        return {
            isLocked,
            attemptsRemaining: Math.max(0, SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS - attempts.count),
            lockoutTime
        };
    }

    /**
     * Réinitialise les tentatives de connexion après succès
     * @param {string} identifier - Identifiant
     */
    resetLoginAttempts(identifier) {
        this.loginAttempts.delete(identifier);
    }

    /**
     * Vérifie si un utilisateur est dans la limite de taux
     * @param {string} identifier - Identifiant
     * @param {string} action - Action effectuée
     * @returns {boolean} True si dans la limite
     */
    checkRateLimit(identifier, action = 'general') {
        const key = `${identifier}_${action}`;
        const now = Date.now();
        const windowStart = now - 60000; // 1 minute
        
        const requests = this.rateLimits.get(key) || [];
        const recentRequests = requests.filter(time => time > windowStart);
        
        if (recentRequests.length >= SECURITY_CONFIG.MAX_REQUESTS_PER_MINUTE) {
            return false;
        }
        
        recentRequests.push(now);
        this.rateLimits.set(key, recentRequests);
        
        return true;
    }

    /**
     * Gère les erreurs d'authentification de manière sécurisée
     * @param {Error} error - Erreur Firebase
     * @returns {Error} Erreur sécurisée
     */
    handleAuthError(error) {
        let message = SECURITY_MESSAGES.OPERATION_FAILED;
        
        switch (error.code) {
            case 'auth/user-not-found':
            case 'auth/wrong-password':
                message = SECURITY_MESSAGES.INVALID_CREDENTIALS;
                break;
            case 'auth/too-many-requests':
                message = SECURITY_MESSAGES.RATE_LIMITED;
                break;
            case 'auth/user-disabled':
                message = SECURITY_MESSAGES.ACCESS_DENIED;
                break;
            default:
                message = error.message;
        }
        
        return new Error(message);
    }

    /**
     * Récupère l'IP du client (simulation)
     * @returns {Promise<string>} Adresse IP
     */
    async getClientIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (error) {
            return 'unknown';
        }
    }

    /**
     * Valide les données d'un véhicule
     * @param {Object} vehicleData - Données du véhicule
     * @returns {Object} Résultat de validation
     */
    validateVehicleData(vehicleData) {
        const errors = [];

        // VIN
        if (!vehicleData.chassisNumber || !this.validateVIN(vehicleData.chassisNumber)) {
            errors.push('Numéro de châssis invalide (17 caractères alphanumériques requis)');
        }

        // Plaque
        if (!vehicleData.licensePlate || !this.validateLicensePlate(vehicleData.licensePlate)) {
            errors.push('Plaque d\'immatriculation invalide');
        }

        // Champs obligatoires
        const requiredFields = ['make', 'model', 'color', 'theftLocation', 'theftDate', 'region'];
        for (const field of requiredFields) {
            if (!vehicleData[field] || vehicleData[field].trim() === '') {
                errors.push(`Le champ ${field} est obligatoire`);
            }
        }

        // Date du vol
        if (vehicleData.theftDate) {
            const theftDate = new Date(vehicleData.theftDate);
            const now = new Date();
            if (theftDate > now) {
                errors.push('La date du vol ne peut pas être dans le futur');
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Nettoie les tokens expirés
     */
    cleanupExpiredTokens() {
        const now = Date.now();
        
        // Nettoyer les tokens CSRF expirés
        for (const [token, expiry] of this.csrfTokens.entries()) {
            if (now > expiry) {
                this.csrfTokens.delete(token);
            }
        }
        
        // Nettoyer les anciennes tentatives de connexion
        for (const [key, attempts] of this.loginAttempts.entries()) {
            if (now - attempts.lastAttempt > SECURITY_CONFIG.LOCKOUT_DURATION * 2) {
                this.loginAttempts.delete(key);
            }
        }
    }
}

export { SecurityService };