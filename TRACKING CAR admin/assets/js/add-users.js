import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    query,
    where,
    Timestamp,
    writeBatch,
    doc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

class AddUsersManager {
    constructor() {
        this.db = getFirestore();
        this.excelData = [];
        this.init();
    }

    async init() {
        await this.waitForAuth();
        this.checkAdminAccess();
        this.setupEventListeners();
        await this.loadStats();
        await this.loadRecentUsers();
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

    checkAdminAccess() {
        const admin = window.checkAccessForAdmin();
        if (!admin || admin.role !== 'global_admin') {
            alert('Accès refusé : seuls les admins globaux peuvent ajouter des utilisateurs.');
            window.location.href = '../dashboard.html';
        }
    }

    setupEventListeners() {
        // Formulaire manuel
        document.getElementById('addUserForm')?.addEventListener('submit', (e) => this.handleAddUser(e));

        // Drag & drop et file input Excel
        const dropZone = document.getElementById('dropZone');
        const excelFile = document.getElementById('excelFile');

        dropZone?.addEventListener('click', () => excelFile?.click());
        dropZone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('border-blue-500', 'bg-blue-50');
        });
        dropZone?.addEventListener('dragleave', () => {
            dropZone.classList.remove('border-blue-500', 'bg-blue-50');
        });
        dropZone?.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-blue-500', 'bg-blue-50');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleExcelFile(files[0]);
            }
        });

        excelFile?.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleExcelFile(e.target.files[0]);
            }
        });

        document.getElementById('confirmImportBtn')?.addEventListener('click', () => this.importExcelData());
        document.getElementById('cancelImportBtn')?.addEventListener('click', () => this.cancelExcelImport());

        // User menu
        document.getElementById('userMenuBtn')?.addEventListener('click', () => {
            document.getElementById('userDropdown').classList.toggle('hidden');
        });

        document.getElementById('logoutBtn')?.addEventListener('click', async () => {
            await window.trackingCarAuth.logout();
            window.location.href = '../index.html';
        });

        // Sidebar toggle
        document.getElementById('sidebarToggle')?.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('-translate-x-full');
        });
    }

    async handleAddUser(e) {
        e.preventDefault();
        const btn = document.getElementById('addUserBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Ajout en cours...';

        try {
            const firstName = document.getElementById('firstName').value.trim();
            const lastName = document.getElementById('lastName').value.trim();
            const matricule = document.getElementById('matricule').value.trim();
            const lieuAffectation = document.getElementById('lieuAffectation').value.trim();

            if (!firstName || !lastName || !matricule || !lieuAffectation) {
                throw new Error('Tous les champs sont requis');
            }

            // Vérifier si l'utilisateur existe déjà
            const existing = await getDocs(
                query(collection(this.db, 'approved_users'), 
                    where('matricule', '==', matricule))
            );
            if (!existing.empty) {
                throw new Error('Cet utilisateur existe déjà (matricule déjà enregistré)');
            }

            // Récupérer l'admin connecté
            const admin = window.trackingCarAuth.getCurrentAdmin();
            if (!admin) {
                throw new Error('Vous devez être connecté pour ajouter un utilisateur');
            }

            // Ajouter l'utilisateur à la collection approved_users
            await addDoc(collection(this.db, 'approved_users'), {
                firstName,
                lastName,
                matricule,
                lieuAffectation,
                displayName: `${firstName} ${lastName}`,
                createdAt: Timestamp.now(),
                createdBy: admin.uid || admin.email,
                status: 'approved',
                active: true
            });

            this.showNotification('Utilisateur ajouté avec succès', 'success');
            document.getElementById('addUserForm').reset();
            await this.loadStats();
            await this.loadRecentUsers();
        } catch (error) {
            console.error('Erreur:', error);
            this.showNotification(error.message || 'Erreur lors de l\'ajout', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check mr-1"></i>Ajouter utilisateur';
        }
    }

    handleExcelFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                // Filtrer les lignes vides et convertir
                this.excelData = jsonData.slice(1).filter(row => row[0] || row[1]).map(row => ({
                    firstName: row[0]?.toString().trim() || '',
                    lastName: row[1]?.toString().trim() || '',
                    matricule: row[2]?.toString().trim() || '',
                    lieuAffectation: row[3]?.toString().trim() || ''
                }));

                if (this.excelData.length === 0) {
                    throw new Error('Aucune donnée valide trouvée dans le fichier');
                }

                this.displayExcelPreview();
            } catch (error) {
                console.error('Erreur lecture fichier:', error);
                this.showNotification('Erreur lors de la lecture du fichier Excel', 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    }

    displayExcelPreview() {
        const preview = document.getElementById('excelPreview');
        const table = document.getElementById('excelTable');

        table.innerHTML = this.excelData.slice(0, 10).map(user => `
            <tr class="border-b border-gray-300">
                <td class="border border-gray-300 px-3 py-2">${user.firstName}</td>
                <td class="border border-gray-300 px-3 py-2">${user.lastName}</td>
                <td class="border border-gray-300 px-3 py-2">${user.matricule}</td>
                <td class="border border-gray-300 px-3 py-2">${user.lieuAffectation}</td>
            </tr>
        `).join('');

        if (this.excelData.length > 10) {
            table.innerHTML += `
                <tr class="bg-gray-100">
                    <td colspan="4" class="border border-gray-300 px-3 py-2 text-center text-sm text-gray-600">
                        ... et ${this.excelData.length - 10} autres utilisateurs
                    </td>
                </tr>
            `;
        }

        preview.classList.remove('hidden');
    }

    async importExcelData() {
        const btn = document.getElementById('confirmImportBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Import en cours...';

        try {
            const admin = window.trackingCarAuth.getCurrentAdmin();
            if (!admin) {
                throw new Error('Vous devez être connecté pour importer');
            }

            const batch = writeBatch(this.db);
            let successCount = 0;
            let errorCount = 0;

            for (const user of this.excelData) {
                if (!user.firstName || !user.lastName || !user.matricule || !user.lieuAffectation) {
                    errorCount++;
                    continue;
                }

                try {
                    // Vérifier si l'utilisateur existe déjà
                    const existing = await getDocs(
                        query(collection(this.db, 'approved_users'), where('matricule', '==', user.matricule))
                    );
                    if (!existing.empty) {
                        errorCount++;
                        continue;
                    }

                    // Ajouter le document
                    const docRef = doc(collection(this.db, 'approved_users'));
                    batch.set(docRef, {
                        firstName: user.firstName,
                        lastName: user.lastName,
                        matricule: user.matricule,
                        lieuAffectation: user.lieuAffectation,
                        displayName: `${user.firstName} ${user.lastName}`,
                        createdAt: Timestamp.now(),
                        createdBy: admin.uid || admin.email,
                        status: 'approved',
                        active: true
                    });
                    successCount++;
                } catch (error) {
                    console.error('Erreur import:', error);
                    errorCount++;
                }
            }

            await batch.commit();

            this.showNotification(
                `Import terminé: ${successCount} utilisateur(s) ajouté(s)${errorCount > 0 ? `, ${errorCount} en erreur` : ''}`,
                successCount > 0 ? 'success' : 'error'
            );

            this.cancelExcelImport();
            await this.loadStats();
            await this.loadRecentUsers();
        } catch (error) {
            console.error('Erreur import batch:', error);
            this.showNotification('Erreur lors de l\'import', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-upload mr-1"></i>Importer';
        }
    }

    cancelExcelImport() {
        this.excelData = [];
        document.getElementById('excelPreview').classList.add('hidden');
        document.getElementById('excelFile').value = '';
    }

    async loadStats() {
        try {
            const approvedSnap = await getDocs(collection(this.db, 'approved_users'));
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let todayCount = 0;
            approvedSnap.docs.forEach(doc => {
                const createdAt = doc.data().createdAt?.toDate() || new Date(doc.data().createdAt);
                if (createdAt >= today) {
                    todayCount++;
                }
            });

            document.getElementById('totalUsersCount').textContent = approvedSnap.size;
            document.getElementById('approvedUsersCount').textContent = approvedSnap.size;
            document.getElementById('todayUsersCount').textContent = todayCount;
        } catch (error) {
            console.error('Erreur chargement stats:', error);
        }
    }

    async loadRecentUsers() {
        try {
            const usersSnap = await getDocs(collection(this.db, 'approved_users'));
            const recentUsers = [];

            usersSnap.docs.forEach(doc => {
                recentUsers.push({ id: doc.id, ...doc.data() });
            });

            recentUsers.sort((a, b) => {
                const timeA = a.createdAt?.toDate?.() || new Date(a.createdAt) || new Date(0);
                const timeB = b.createdAt?.toDate?.() || new Date(b.createdAt) || new Date(0);
                return timeB - timeA;
            });

            const container = document.getElementById('recentUsersList');
            if (recentUsers.length === 0) {
                container.innerHTML = `
                    <div class="text-center text-gray-500 py-4">
                        <i class="fas fa-inbox text-2xl mb-2"></i>
                        <p>Aucun utilisateur ajouté</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = recentUsers.slice(0, 10).map(user => `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                        <div class="font-semibold text-gray-900">${user.firstName} ${user.lastName}</div>
                        <div class="text-xs text-gray-500">
                            <span>${user.matricule || 'N/A'}</span> • 
                            <span>${user.lieuAffectation || 'N/A'}</span>
                        </div>
                        <div class="text-xs text-gray-400 mt-1">
                            Ajouté le ${user.createdAt ? new Date(user.createdAt.toDate?.() || user.createdAt).toLocaleDateString('fr-FR') : '-'}
                        </div>
                    </div>
                    <span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                        Approuvé
                    </span>
                </div>
            `).join('');
        } catch (error) {
            console.error('Erreur chargement utilisateurs récents:', error);
        }
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('validationMessages');
        const bgColor = type === 'success' ? 'bg-green-100' : type === 'error' ? 'bg-red-100' : 'bg-blue-100';
        const textColor = type === 'success' ? 'text-green-800' : type === 'error' ? 'text-red-800' : 'text-blue-800';
        const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';

        const notification = document.createElement('div');
        notification.className = `${bgColor} ${textColor} p-3 rounded-lg text-sm flex items-center`;
        notification.innerHTML = `<i class="fas ${icon} mr-2"></i>${message}`;
        
        container.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    }
}

// Initialiser
document.addEventListener('DOMContentLoaded', () => {
    new AddUsersManager();
});
