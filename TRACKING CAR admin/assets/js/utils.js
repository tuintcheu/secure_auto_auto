// Utilitaires pour TRACKING CAR
class TrackingCarUtils {
  // Formatage des dates
  static formatDate(timestamp, options = {}) {
    if (!timestamp) return "N/A";

    let date;
    if (timestamp.seconds) {
      // Timestamp Firestore
      date = new Date(timestamp.seconds * 1000);
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      date = new Date(timestamp);
    }

    const defaultOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };

    return date.toLocaleDateString("fr-FR", { ...defaultOptions, ...options });
  }

  // Formatage des montants en FCFA
  static formatCurrency(amount) {
    if (!amount && amount !== 0) return "N/A";
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "XAF",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
      .format(amount)
      .replace("XAF", "FCFA");
  }

  // Obtenir le nom complet d'une légion
  static getLegionName(code) {
    if (
      window.TrackingCarConfig &&
      window.TrackingCarConfig.LEGIONS &&
      window.TrackingCarConfig.LEGIONS[code]
    ) {
      return window.TrackingCarConfig.LEGIONS[code];
    }
    return code || "Non définie";
  }

  // Obtenir le siège d'une légion
  static getLegionHeadquarters(legionCode) {
    const legion = window.TrackingCarConfig.LEGIONS[legionCode];
    return legion ? legion.headquarters : "N/A";
  }

  // Validation des numéros de châssis (VIN)
  static validateVIN(vin) {
    if (!vin) return false;
    // VIN doit faire 17 caractères
    const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/i;
    return vinRegex.test(vin);
  }

  // Validation des plaques d'immatriculation camerounaises
  static validateLicensePlate(plate) {
    if (!plate) return false;
    // Format camerounais: AB-1234-CD ou variations
    const plateRegex = /^[A-Z]{2}-?\d{3,4}-?[A-Z]{2}$/i;
    return plateRegex.test(plate.replace(/\s/g, ""));
  }

  // Générer un numéro de dossier unique
  static generateCaseNumber(legionCode = "GEN") {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const day = String(new Date().getDate()).padStart(2, "0");
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");

    return `TC-${legionCode}-${year}${month}${day}-${random}`;
  }

  // Statuts des véhicules avec leurs couleurs
  static getVehicleStatusInfo(status) {
    const statusMap = {
      active: {
        text: "Recherché",
        color: "red",
        bgColor: "bg-red-100",
        textColor: "text-red-800",
        icon: "fas fa-exclamation-triangle",
      },
      recovered: {
        text: "Récupéré",
        color: "green",
        bgColor: "bg-green-100",
        textColor: "text-green-800",
        icon: "fas fa-check-circle",
      },
      closed: {
        text: "Dossier fermé",
        color: "gray",
        bgColor: "bg-gray-100",
        textColor: "text-gray-800",
        icon: "fas fa-archive",
      },
    };

    return statusMap[status] || statusMap["active"];
  }

  // Statuts des récompenses
  static getRewardStatusInfo(status) {
    const statusMap = {
      pending: {
        text: "En attente",
        color: "yellow",
        bgColor: "bg-yellow-100",
        textColor: "text-yellow-800",
        icon: "fas fa-clock",
      },
      approved: {
        text: "Approuvée",
        color: "blue",
        bgColor: "bg-blue-100",
        textColor: "text-blue-800",
        icon: "fas fa-thumbs-up",
      },
      paid: {
        text: "Payée",
        color: "green",
        bgColor: "bg-green-100",
        textColor: "text-green-800",
        icon: "fas fa-money-bill-wave",
      },
      rejected: {
        text: "Rejetée",
        color: "red",
        bgColor: "bg-red-100",
        textColor: "text-red-800",
        icon: "fas fa-times-circle",
      },
    };

    return statusMap[status] || statusMap["pending"];
  }

  // Animations d'apparition pour les éléments
  static animateElement(element, animation = "fade-in", delay = 0) {
    setTimeout(() => {
      element.classList.add(animation);
    }, delay);
  }

  // Notification toast
  static showNotification(message, type = "info", duration = 5000) {
    const notification = document.createElement("div");
    notification.className = `
            fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg transform transition-all duration-300 translate-x-full
            ${type === "success" ? "bg-green-500 text-white" : ""}
            ${type === "error" ? "bg-red-500 text-white" : ""}
            ${type === "warning" ? "bg-yellow-500 text-white" : ""}
            ${type === "info" ? "bg-blue-500 text-white" : ""}
        `;

    notification.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-${this.getNotificationIcon(type)} mr-2"></i>
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-white hover:text-gray-200">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

    document.body.appendChild(notification);

    // Animation d'apparition
    setTimeout(() => {
      notification.classList.remove("translate-x-full");
    }, 100);

    // Disparition automatique
    setTimeout(() => {
      notification.classList.add("translate-x-full");
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, duration);
  }

  static getNotificationIcon(type) {
    const icons = {
      success: "check-circle",
      error: "exclamation-circle",
      warning: "exclamation-triangle",
      info: "info-circle",
    };
    return icons[type] || "info-circle";
  }

  // Loading spinner overlay
  static showLoading(show = true, message = "Chargement...") {
    let loader = document.getElementById("globalLoader");

    if (show) {
      if (!loader) {
        loader = document.createElement("div");
        loader.id = "globalLoader";
        loader.className =
          "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50";
        loader.innerHTML = `
                    <div class="bg-white rounded-lg p-6 flex items-center shadow-xl">
                        <i class="fas fa-spinner fa-spin text-blue-600 text-2xl mr-4"></i>
                        <span class="text-gray-700 font-medium">${message}</span>
                    </div>
                `;
        document.body.appendChild(loader);
      }
      loader.style.display = "flex";
    } else {
      if (loader) {
        loader.style.display = "none";
      }
    }
  }

  // Confirmation modal
  static async showConfirmation(
    title,
    message,
    confirmText = "Confirmer",
    cancelText = "Annuler"
  ) {
    return new Promise((resolve) => {
      const modal = document.createElement("div");
      modal.className =
        "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50";
      modal.innerHTML = `
                <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                    <h3 class="text-lg font-bold text-gray-900 mb-4">${title}</h3>
                    <p class="text-gray-600 mb-6">${message}</p>
                    <div class="flex justify-end space-x-3">
                        <button id="cancelBtn" class="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">
                            ${cancelText}
                        </button>
                        <button id="confirmBtn" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                            ${confirmText}
                        </button>
                    </div>
                </div>
            `;

      document.body.appendChild(modal);

      modal.querySelector("#confirmBtn").onclick = () => {
        modal.remove();
        resolve(true);
      };

      modal.querySelector("#cancelBtn").onclick = () => {
        modal.remove();
        resolve(false);
      };

      // Fermer en cliquant à côté
      modal.onclick = (e) => {
        if (e.target === modal) {
          modal.remove();
          resolve(false);
        }
      };
    });
  }

  // Débounce pour les recherches
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Escape HTML pour éviter les injections
  static escapeHtml(text) {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  // Vérifier si un utilisateur est approuvé pour l'app mobile
  static async isUserApproved(userIdentifier) {
    try {
      if (!window.firebaseDb) {
        console.warn("Firebase DB non disponible");
        return false;
      }

      const { collection, getDocs, query, where } = await import(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
      );

      // Chercher par email ou prénom+nom
      let q;
      if (userIdentifier.includes("@")) {
        q = query(
          collection(window.firebaseDb, "approved_users"),
          where("email", "==", userIdentifier)
        );
      } else {
        // Vérifier avec prénom et nom
        q = query(
          collection(window.firebaseDb, "approved_users"),
          where("displayName", "==", userIdentifier)
        );
      }

      const snapshot = await getDocs(q);
      return !snapshot.empty && snapshot.docs[0].data().active === true;
    } catch (error) {
      console.error("Erreur vérification utilisateur approuvé:", error);
      return false;
    }
  }

  // Récupérer les infos d'un utilisateur approuvé
  static async getApprovedUserInfo(userIdentifier) {
    try {
      if (!window.firebaseDb) {
        console.warn("Firebase DB non disponible");
        return null;
      }

      const { collection, getDocs, query, where } = await import(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
      );

      let q;
      if (userIdentifier.includes("@")) {
        q = query(
          collection(window.firebaseDb, "approved_users"),
          where("email", "==", userIdentifier)
        );
      } else {
        q = query(
          collection(window.firebaseDb, "approved_users"),
          where("displayName", "==", userIdentifier)
        );
      }

      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        return snapshot.docs[0].data();
      }
      return null;
    } catch (error) {
      console.error("Erreur récupération utilisateur approuvé:", error);
      return null;
    }
  }
}

export { TrackingCarUtils };

// Export global pour accès via window (optionnel si tu veux le garder)
window.TrackingCarUtils = TrackingCarUtils;
