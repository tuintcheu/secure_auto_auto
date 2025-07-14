import { collection, query, where, getDocs, onSnapshot, doc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Fonction SHA-256
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

class TrackingCarAuth {
    constructor() {
        this.db = getFirestore(window.firebaseApp);
        this.auth = getAuth();
        this.currentAdmin = null;
        this.adminData = null;
        this.listeners = new Map(); // Pour gérer les listeners temps réel
        this.sessionKey = 'trackingcar_session';
        
        // Vérifier s'il y a une session active au chargement
        this.checkExistingSession();
    }

    // Vérifier s'il y a une session active
    checkExistingSession() {
        try {
            const savedSession = localStorage.getItem(this.sessionKey);
            if (savedSession) {
                const sessionData = JSON.parse(savedSession);
                // Vérifier si la session n'est pas expirée (24h)
                if (Date.now() - sessionData.timestamp < 24 * 60 * 60 * 1000) {
                    this.currentAdmin = sessionData.admin;
                    this.adminData = sessionData.adminData;
                    console.log('✅ Session restaurée:', this.adminData.email);
                    return true;
                }
            }
        } catch (error) {
            console.warn('⚠️ Erreur restauration session:', error);
        }
        return false;
    }

    // Sauvegarder la session
    saveSession() {
        try {
            const sessionData = {
                admin: this.currentAdmin,
                adminData: this.adminData,
                timestamp: Date.now()
            };
            localStorage.setItem(this.sessionKey, JSON.stringify(sessionData));
        } catch (error) {
            console.warn('⚠️ Erreur sauvegarde session:', error);
        }
    }

    async handleLogin(email, password) {
        try {
            const adminQuery = query(collection(this.db, 'admin_users'), where('email', '==', email));

            const snapshot = await getDocs(adminQuery);
            if (snapshot.empty) throw new Error('❌ Admin non trouvé');

            const adminDoc = snapshot.docs[0];
            const adminData = adminDoc.data();

            if (!adminData.isActive) throw new Error('❌ Compte désactivé');

            // Hachage du mot de passe et comparaison
            const hashedPassword = await hashPassword(password);
            if (hashedPassword !== adminData.password) throw new Error('❌ Mot de passe incorrect');

            this.currentAdmin = { uid: adminDoc.id, email: adminData.email };
            this.adminData = adminData;

            // Sauvegarder la session
            this.saveSession();

            console.log('✅ Connexion réussie:', this.adminData.email);
            return { success: true, admin: this.adminData };

        } catch (error) {
            console.error('Erreur de connexion:', error);
            return { success: false, message: error.message };
        }
    }

    async logout() {
        // Nettoyer tous les listeners
        this.cleanup();
        
        // Réinitialiser les données
        this.currentAdmin = null;
        this.adminData = null;
        
        // Supprimer la session
        localStorage.removeItem(this.sessionKey);
        
        console.log('✅ Déconnexion effectuée');
    }

    // Vérifier si l'utilisateur est connecté
    isAuthenticated() {
        return this.currentAdmin !== null && this.adminData !== null;
    }

    // Obtenir les données de l'admin connecté
    getCurrentAdmin() {
        return this.adminData;
    }

    // Vérifie si l'admin connecté est un admin global
    isGlobalAdmin() {
        // Selon ta structure, le champ est souvent "role" ou "isGlobal"
        // Adapte si besoin !
        return this.adminData && (this.adminData.role === 'global' || this.adminData.isGlobal === true);
    }

    // Retourne la légion de l'admin connecté (si applicable)
    getLegion() {
        return this.adminData && this.adminData.legion ? this.adminData.legion : null;
    }

    // Méthode pour écouter les changements en temps réel
    listenToCollection(collectionName, callback, queryConstraints = []) {
        if (!this.isAuthenticated()) {
            console.warn('⚠️ Non authentifié pour écouter:', collectionName);
            return null;
        }

        try {
            let queryRef = collection(this.db, collectionName);
            
            // Appliquer les contraintes de requête si fournies
            if (queryConstraints.length > 0) {
                queryRef = query(queryRef, ...queryConstraints);
            }

            const unsubscribe = onSnapshot(queryRef, 
                (snapshot) => {
                    const docs = [];
                    snapshot.forEach((doc) => {
                        docs.push({ id: doc.id, ...doc.data() });
                    });
                    callback(docs);
                },
                (error) => {
                    console.error(`❌ Erreur écoute ${collectionName}:`, error);
                }
            );

            // Stocker le listener pour pouvoir le nettoyer plus tard
            this.listeners.set(`${collectionName}_${Date.now()}`, unsubscribe);
            return unsubscribe;

        } catch (error) {
            console.error(`❌ Erreur création listener ${collectionName}:`, error);
            return null;
        }
    }

    // Méthode pour écouter un document spécifique
    listenToDocument(collectionName, docId, callback) {
        if (!this.isAuthenticated()) {
            console.warn('⚠️ Non authentifié pour écouter le document:', docId);
            return null;
        }

        try {
            const docRef = doc(this.db, collectionName, docId);
            
            const unsubscribe = onSnapshot(docRef,
                (doc) => {
                    if (doc.exists()) {
                        callback({ id: doc.id, ...doc.data() });
                    } else {
                        callback(null);
                    }
                },
                (error) => {
                    console.error(`❌ Erreur écoute document ${docId}:`, error);
                }
            );

            this.listeners.set(`${collectionName}_${docId}_${Date.now()}`, unsubscribe);
            return unsubscribe;

        } catch (error) {
            console.error(`❌ Erreur création listener document ${docId}:`, error);
            return null;
        }
    }

    // Nettoyer tous les listeners
    cleanup() {
        this.listeners.forEach((unsubscribe) => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
        this.listeners.clear();
        console.log('🧹 Listeners nettoyés');
    }

    // Méthode utilitaire pour obtenir la base de données
    getDb() {
        return this.db;
    }
}

// Classe utilitaire pour les opérations temps réel
class RealtimeManager {
    constructor() {
        this.auth = window.trackingCarAuth;
    }

    // Écouter les véhicules en temps réel
    listenToVehicles(callback) {
        return this.auth.listenToCollection('vehicles', callback);
    }

    // Écouter les utilisateurs en temps réel
    listenToUsers(callback) {
        return this.auth.listenToCollection('users', callback);
    }

    // Écouter les alertes en temps réel
    listenToAlerts(callback) {
        return this.auth.listenToCollection('alerts', callback);
    }

    // Écouter un véhicule spécifique
    listenToVehicle(vehicleId, callback) {
        return this.auth.listenToDocument('vehicles', vehicleId, callback);
    }

    // Écouter les positions d'un véhicule
    listenToVehiclePositions(vehicleId, callback) {
        const queryConstraints = [where('vehicleId', '==', vehicleId)];
        return this.auth.listenToCollection('positions', callback, queryConstraints);
    }
}

// Initialisation globale
window.trackingCarAuth = new TrackingCarAuth();
window.realtimeManager = new RealtimeManager();

// Ajout de la méthode hasPermission pour le contrôle d'accès
window.trackingCarAuth.hasPermission = function(permission) {
    const admin = this.getCurrentAdmin && this.getCurrentAdmin();
    return !!(admin && admin.permissions && admin.permissions[permission]);
};

// Fonction globale pour vérifier l'authentification sur les autres pages
window.checkAuth = function() {
    if (!window.trackingCarAuth.isAuthenticated()) {
        console.warn('⚠️ Non authentifié - redirection vers login');
        window.location.href = 'index.html';
        return false;
    }
    return true;
};

// Fonction pour nettoyer avant de quitter la page
window.addEventListener('beforeunload', () => {
    if (window.trackingCarAuth) {
        window.trackingCarAuth.cleanup();
    }
});

console.log('📊 Auth TrackingCar initialisé avec support temps réel');
//hashPassword("12345678").then(console.log);