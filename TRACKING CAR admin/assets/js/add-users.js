import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  Timestamp,
  writeBatch,
  doc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

class AddUsersManager {
  constructor() {
    this.db = getFirestore();
    this.excelData = [];
    this.currentEditingUserId = null;
    this.currentDeletingUserId = null;
    this.usersMap = new Map();
    this.init();
  }

  async init() {
    await this.waitForAuth();
    this.checkAdminAccess();
    this.setupEventListeners();
    await this.loadStats();
    await this.loadRecentUsers();
    await this.loadAllUsers();
  }

  async waitForAuth() {
    return new Promise((resolve) => {
      const checkAuth = () => {
        if (
          window.trackingCarAuth &&
          window.trackingCarAuth.isAuthenticated()
        ) {
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
    if (!admin || admin.role !== "global_admin") {
      alert(
        "Accès refusé : seuls les admins globaux peuvent ajouter des utilisateurs."
      );
      window.location.href = "../dashboard.html";
    }
  }

  setupEventListeners() {
    // Formulaire manuel
    document
      .getElementById("addUserForm")
      ?.addEventListener("submit", (e) => this.handleAddUser(e));

    // Drag & drop et file input Excel
    const dropZone = document.getElementById("dropZone");
    const excelFile = document.getElementById("excelFile");

    dropZone?.addEventListener("click", () => excelFile?.click());
    dropZone?.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("border-blue-500", "bg-blue-50");
    });
    dropZone?.addEventListener("dragleave", () => {
      dropZone.classList.remove("border-blue-500", "bg-blue-50");
    });
    dropZone?.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("border-blue-500", "bg-blue-50");
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleExcelFile(files[0]);
      }
    });

    excelFile?.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        this.handleExcelFile(e.target.files[0]);
      }
    });

    document
      .getElementById("confirmImportBtn")
      ?.addEventListener("click", () => this.importExcelData());
    document
      .getElementById("cancelImportBtn")
      ?.addEventListener("click", () => this.cancelExcelImport());

    // User menu
    document.getElementById("userMenuBtn")?.addEventListener("click", () => {
      document.getElementById("userDropdown").classList.toggle("hidden");
    });

    document
      .getElementById("logoutBtn")
      ?.addEventListener("click", async () => {
        await window.trackingCarAuth.logout();
        window.location.href = "../index.html";
      });

    // Sidebar toggle
    document.getElementById("sidebarToggle")?.addEventListener("click", () => {
      document.getElementById("sidebar").classList.toggle("-translate-x-full");
    });

    // Modals d'édition et suppression
    document
      .getElementById("closeEditModalBtn")
      ?.addEventListener("click", () => this.closeEditModal());
    document
      .getElementById("cancelEditBtn")
      ?.addEventListener("click", () => this.closeEditModal());
    document
      .getElementById("saveEditBtn")
      ?.addEventListener("click", () => this.saveEditUser());

    document
      .getElementById("cancelDeleteBtn")
      ?.addEventListener("click", () => this.closeDeleteModal());
    document
      .getElementById("confirmDeleteBtn")
      ?.addEventListener("click", () => this.confirmDeleteUser());
  }

  closeEditModal() {
    document.getElementById("editUserModal").classList.add("hidden");
    this.currentEditingUserId = null;
  }

  closeDeleteModal() {
    document.getElementById("deleteConfirmModal").classList.add("hidden");
    this.currentDeletingUserId = null;
  }

  openEditModal(userId, user) {
    this.currentEditingUserId = userId;
    document.getElementById("editFirstName").value = user.firstName;
    document.getElementById("editLastName").value = user.lastName;
    document.getElementById("editMatricule").value = user.matricule;
    document.getElementById("editLieuAffectation").value = user.lieuAffectation;
    document.getElementById("editUserModal").classList.remove("hidden");
  }

  openDeleteModal(userId, user) {
    this.currentDeletingUserId = userId;
    document.getElementById(
      "deleteUserInfo"
    ).textContent = `${user.firstName} ${user.lastName} (${user.matricule})`;
    document.getElementById("deleteConfirmModal").classList.remove("hidden");
  }

  async saveEditUser() {
    const btn = document.getElementById("saveEditBtn");
    btn.disabled = true;
    btn.innerHTML =
      '<i class="fas fa-spinner fa-spin mr-1"></i>Enregistrement...';

    try {
      const firstName = document.getElementById("editFirstName").value.trim();
      const lastName = document.getElementById("editLastName").value.trim();
      const matricule = document.getElementById("editMatricule").value.trim();
      const lieuAffectation = document
        .getElementById("editLieuAffectation")
        .value.trim();

      if (!firstName || !lastName || !matricule || !lieuAffectation) {
        throw new Error("Tous les champs sont requis");
      }

      const { updateDoc } = await import(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
      );

      await updateDoc(
        doc(this.db, "approved_users", this.currentEditingUserId),
        {
          firstName,
          lastName,
          matricule,
          lieuAffectation,
          displayName: `${firstName} ${lastName}`,
        }
      );

      this.showNotification("Utilisateur modifié avec succès", "success");
      this.closeEditModal();
      await this.loadAllUsers();
      await this.loadStats();
      await this.loadRecentUsers();
    } catch (error) {
      console.error("Erreur:", error);
      this.showNotification(
        error.message || "Erreur lors de la modification",
        "error"
      );
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save mr-1"></i>Enregistrer';
    }
  }

  async confirmDeleteUser() {
    const btn = document.getElementById("confirmDeleteBtn");
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Suppression...';

    try {
      const { deleteDoc } = await import(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
      );

      await deleteDoc(
        doc(this.db, "approved_users", this.currentDeletingUserId)
      );

      this.showNotification("Utilisateur supprimé avec succès", "success");
      this.closeDeleteModal();
      await this.loadAllUsers();
      await this.loadStats();
      await this.loadRecentUsers();
    } catch (error) {
      console.error("Erreur:", error);
      this.showNotification("Erreur lors de la suppression", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-trash mr-1"></i>Supprimer';
    }
  }

  async loadAllUsers() {
    try {
      const usersSnap = await getDocs(collection(this.db, "approved_users"));
      const users = [];
      this.usersMap = new Map(); // Stocker les users en mémoire

      usersSnap.docs.forEach((doc) => {
        const userData = { id: doc.id, ...doc.data() };
        users.push(userData);
        this.usersMap.set(doc.id, userData);
      });

      users.sort((a, b) => {
        const timeA =
          a.createdAt?.toDate?.() || new Date(a.createdAt) || new Date(0);
        const timeB =
          b.createdAt?.toDate?.() || new Date(b.createdAt) || new Date(0);
        return timeB - timeA;
      });

      const container = document.getElementById("allUsersList");
      if (users.length === 0) {
        container.innerHTML = `
          <tr class="text-center text-gray-500">
            <td colspan="6" class="px-4 py-4">
              <i class="fas fa-inbox text-2xl mb-2"></i>
              <p>Aucun utilisateur enregistré</p>
            </td>
          </tr>
        `;
        return;
      }

      container.innerHTML = users
        .map(
          (user) => `
        <tr class="hover:bg-gray-50">
          <td class="px-4 py-3">${user.firstName}</td>
          <td class="px-4 py-3">${user.lastName}</td>
          <td class="px-4 py-3"><span class="font-mono text-xs bg-gray-100 px-2 py-1 rounded">${
            user.matricule
          }</span></td>
          <td class="px-4 py-3">${user.lieuAffectation}</td>
          <td class="px-4 py-3">
            <span class="px-2 py-1 rounded text-xs font-medium ${
              user.active
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-800"
            }">
              ${user.active ? "Actif" : "Inactif"}
            </span>
          </td>
          <td class="px-4 py-3 text-center space-x-2">
            <button 
              data-user-id="${user.id}"
              class="btn-edit btn text-xs bg-blue-100 text-blue-700 hover:bg-blue-200"
            >
              <i class="fas fa-edit mr-1"></i>Modifier
            </button>
            <button 
              data-user-id="${user.id}"
              class="btn-delete btn text-xs bg-red-100 text-red-700 hover:bg-red-200"
            >
              <i class="fas fa-trash mr-1"></i>Supprimer
            </button>
          </td>
        </tr>
      `
        )
        .join("");

      // Ajouter les event listeners
      document.querySelectorAll(".btn-edit").forEach((btn) => {
        btn.addEventListener("click", () => {
          const userId = btn.getAttribute("data-user-id");
          const user = this.usersMap.get(userId);
          this.openEditModal(userId, user);
        });
      });

      document.querySelectorAll(".btn-delete").forEach((btn) => {
        btn.addEventListener("click", () => {
          const userId = btn.getAttribute("data-user-id");
          const user = this.usersMap.get(userId);
          this.openDeleteModal(userId, user);
        });
      });
    } catch (error) {
      console.error("Erreur chargement utilisateurs:", error);
    }
  }

  async handleAddUser(e) {
    e.preventDefault();
    const btn = document.getElementById("addUserBtn");
    btn.disabled = true;
    btn.innerHTML =
      '<i class="fas fa-spinner fa-spin mr-1"></i>Ajout en cours...';

    try {
      const firstName = document.getElementById("firstName").value.trim();
      const lastName = document.getElementById("lastName").value.trim();
      const matricule = document.getElementById("matricule").value.trim();
      const lieuAffectation = document
        .getElementById("lieuAffectation")
        .value.trim();

      if (!firstName || !lastName || !matricule || !lieuAffectation) {
        throw new Error("Tous les champs sont requis");
      }

      // Vérifier si l'utilisateur existe déjà
      const existing = await getDocs(
        query(
          collection(this.db, "approved_users"),
          where("matricule", "==", matricule)
        )
      );
      if (!existing.empty) {
        throw new Error(
          "Cet utilisateur existe déjà (matricule déjà enregistré)"
        );
      }

      // Récupérer l'admin connecté
      const admin = window.trackingCarAuth.getCurrentAdmin();
      if (!admin) {
        throw new Error("Vous devez être connecté pour ajouter un utilisateur");
      }

      // Ajouter l'utilisateur à la collection approved_users
      await addDoc(collection(this.db, "approved_users"), {
        firstName,
        lastName,
        matricule,
        lieuAffectation,
        displayName: `${firstName} ${lastName}`,
        createdAt: Timestamp.now(),
        createdBy: admin.uid || admin.email,
        status: "approved",
        active: true,
      });

      this.showNotification("Utilisateur ajouté avec succès", "success");
      document.getElementById("addUserForm").reset();
      await this.loadStats();
      await this.loadRecentUsers();
    } catch (error) {
      console.error("Erreur:", error);
      this.showNotification(error.message || "Erreur lors de l'ajout", "error");
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
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Filtrer les lignes vides et convertir
        this.excelData = jsonData
          .slice(1)
          .filter((row) => row[0] || row[1])
          .map((row) => ({
            firstName: row[0]?.toString().trim() || "",
            lastName: row[1]?.toString().trim() || "",
            matricule: row[2]?.toString().trim() || "",
            lieuAffectation: row[3]?.toString().trim() || "",
          }));

        if (this.excelData.length === 0) {
          throw new Error("Aucune donnée valide trouvée dans le fichier");
        }

        this.displayExcelPreview();
      } catch (error) {
        console.error("Erreur lecture fichier:", error);
        this.showNotification(
          "Erreur lors de la lecture du fichier Excel",
          "error"
        );
      }
    };
    reader.readAsArrayBuffer(file);
  }

  displayExcelPreview() {
    const preview = document.getElementById("excelPreview");
    const table = document.getElementById("excelTable");

    table.innerHTML = this.excelData
      .slice(0, 10)
      .map(
        (user) => `
            <tr class="border-b border-gray-300">
                <td class="border border-gray-300 px-3 py-2">${user.firstName}</td>
                <td class="border border-gray-300 px-3 py-2">${user.lastName}</td>
                <td class="border border-gray-300 px-3 py-2">${user.matricule}</td>
                <td class="border border-gray-300 px-3 py-2">${user.lieuAffectation}</td>
            </tr>
        `
      )
      .join("");

    if (this.excelData.length > 10) {
      table.innerHTML += `
                <tr class="bg-gray-100">
                    <td colspan="4" class="border border-gray-300 px-3 py-2 text-center text-sm text-gray-600">
                        ... et ${this.excelData.length - 10} autres utilisateurs
                    </td>
                </tr>
            `;
    }

    preview.classList.remove("hidden");
  }

  async importExcelData() {
    const btn = document.getElementById("confirmImportBtn");
    btn.disabled = true;
    btn.innerHTML =
      '<i class="fas fa-spinner fa-spin mr-1"></i>Import en cours...';

    try {
      const admin = window.trackingCarAuth.getCurrentAdmin();
      if (!admin) {
        throw new Error("Vous devez être connecté pour importer");
      }

      const batch = writeBatch(this.db);
      let successCount = 0;
      let errorCount = 0;

      for (const user of this.excelData) {
        if (
          !user.firstName ||
          !user.lastName ||
          !user.matricule ||
          !user.lieuAffectation
        ) {
          errorCount++;
          continue;
        }

        try {
          // Vérifier si l'utilisateur existe déjà
          const existing = await getDocs(
            query(
              collection(this.db, "approved_users"),
              where("matricule", "==", user.matricule)
            )
          );
          if (!existing.empty) {
            errorCount++;
            continue;
          }

          // Ajouter le document
          const docRef = doc(collection(this.db, "approved_users"));
          batch.set(docRef, {
            firstName: user.firstName,
            lastName: user.lastName,
            matricule: user.matricule,
            lieuAffectation: user.lieuAffectation,
            displayName: `${user.firstName} ${user.lastName}`,
            createdAt: Timestamp.now(),
            createdBy: admin.uid || admin.email,
            status: "approved",
            active: true,
          });
          successCount++;
        } catch (error) {
          console.error("Erreur import:", error);
          errorCount++;
        }
      }

      await batch.commit();

      this.showNotification(
        `Import terminé: ${successCount} utilisateur(s) ajouté(s)${
          errorCount > 0 ? `, ${errorCount} en erreur` : ""
        }`,
        successCount > 0 ? "success" : "error"
      );

      this.cancelExcelImport();
      await this.loadStats();
      await this.loadRecentUsers();
    } catch (error) {
      console.error("Erreur import batch:", error);
      this.showNotification("Erreur lors de l'import", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-upload mr-1"></i>Importer';
    }
  }

  cancelExcelImport() {
    this.excelData = [];
    document.getElementById("excelPreview").classList.add("hidden");
    document.getElementById("excelFile").value = "";
  }

  async loadStats() {
    try {
      const approvedSnap = await getDocs(collection(this.db, "approved_users"));
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let todayCount = 0;
      approvedSnap.docs.forEach((doc) => {
        const createdAt =
          doc.data().createdAt?.toDate() || new Date(doc.data().createdAt);
        if (createdAt >= today) {
          todayCount++;
        }
      });

      document.getElementById("totalUsersCount").textContent =
        approvedSnap.size;
      document.getElementById("approvedUsersCount").textContent =
        approvedSnap.size;
      document.getElementById("todayUsersCount").textContent = todayCount;
    } catch (error) {
      console.error("Erreur chargement stats:", error);
    }
  }

  async loadRecentUsers() {
    try {
      const usersSnap = await getDocs(collection(this.db, "approved_users"));
      const recentUsers = [];

      usersSnap.docs.forEach((doc) => {
        recentUsers.push({ id: doc.id, ...doc.data() });
      });

      recentUsers.sort((a, b) => {
        const timeA =
          a.createdAt?.toDate?.() || new Date(a.createdAt) || new Date(0);
        const timeB =
          b.createdAt?.toDate?.() || new Date(b.createdAt) || new Date(0);
        return timeB - timeA;
      });

      const container = document.getElementById("recentUsersList");
      if (recentUsers.length === 0) {
        container.innerHTML = `
                    <div class="text-center text-gray-500 py-4">
                        <i class="fas fa-inbox text-2xl mb-2"></i>
                        <p>Aucun utilisateur ajouté</p>
                    </div>
                `;
        return;
      }

      container.innerHTML = recentUsers
        .slice(0, 10)
        .map(
          (user) => `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                        <div class="font-semibold text-gray-900">${
                          user.firstName
                        } ${user.lastName}</div>
                        <div class="text-xs text-gray-500">
                            <span>${user.matricule || "N/A"}</span> • 
                            <span>${user.lieuAffectation || "N/A"}</span>
                        </div>
                        <div class="text-xs text-gray-400 mt-1">
                            Ajouté le ${
                              user.createdAt
                                ? new Date(
                                    user.createdAt.toDate?.() || user.createdAt
                                  ).toLocaleDateString("fr-FR")
                                : "-"
                            }
                        </div>
                    </div>
                    <span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                        Approuvé
                    </span>
                </div>
            `
        )
        .join("");
    } catch (error) {
      console.error("Erreur chargement utilisateurs récents:", error);
    }
  }

  showNotification(message, type = "info") {
    const container = document.getElementById("validationMessages");
    const bgColor =
      type === "success"
        ? "bg-green-100"
        : type === "error"
        ? "bg-red-100"
        : "bg-blue-100";
    const textColor =
      type === "success"
        ? "text-green-800"
        : type === "error"
        ? "text-red-800"
        : "text-blue-800";
    const icon =
      type === "success"
        ? "fa-check-circle"
        : type === "error"
        ? "fa-exclamation-circle"
        : "fa-info-circle";

    const notification = document.createElement("div");
    notification.className = `${bgColor} ${textColor} p-3 rounded-lg text-sm flex items-center`;
    notification.innerHTML = `<i class="fas ${icon} mr-2"></i>${message}`;

    container.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
  }
}

// Initialiser
document.addEventListener("DOMContentLoaded", () => {
  window.addUsersManager = new AddUsersManager();
});
