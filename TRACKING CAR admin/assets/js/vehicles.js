import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  deleteDoc,
  updateDoc,
  addDoc,
  Timestamp,
  getDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Mapping des légions pour affichage clair
window.TrackingCarConfig = window.TrackingCarConfig || {};
window.TrackingCarConfig.LEGIONS = {
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
  l11: { name: "GENDARMERIE MOBILE" },
};

export class VehiclesManager {
  constructor(admin) {
    this.admin = admin;
    this.db = getFirestore();
    this.currentPage = 1;
    this.itemsPerPage = 12;
    this.allVehicles = [];
    this.filteredVehicles = [];
    this.filters = { search: "", status: "", legion: "", period: "" };
    this.init();
  }

  async init() {
    this.setupEventListeners();
    this.loadVehicles();
  }

  setupEventListeners() {
    const searchInput = document.getElementById("searchInput");
    if (searchInput)
      searchInput.addEventListener("input", () => this.handleFilterChange());

    ["statusFilter", "legionFilter", "periodFilter"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", () => this.handleFilterChange());
    });

    document
      .getElementById("clearFiltersBtn")
      ?.addEventListener("click", () => this.clearFilters());
    document
      .getElementById("exportBtn")
      ?.addEventListener("click", () => this.exportData());
    document
      .getElementById("closeModalBtn")
      ?.addEventListener("click", () => this.closeModal());
    document.getElementById("prevPageBtn")?.addEventListener("click", () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.displayVehicles();
      }
    });
    document.getElementById("nextPageBtn")?.addEventListener("click", () => {
      const totalPages = Math.ceil(
        this.filteredVehicles.length / this.itemsPerPage
      );
      if (this.currentPage < totalPages) {
        this.currentPage++;
        this.displayVehicles();
      }
    });
    document.getElementById("sidebarToggle")?.addEventListener("click", () => {
      document.getElementById("sidebar").classList.toggle("-translate-x-full");
    });
    document.getElementById("userMenuBtn")?.addEventListener("click", () => {
      document.getElementById("userDropdown").classList.toggle("hidden");
    });
  }

  async loadVehicles() {
    try {
      const loadingState = document.getElementById("loadingState");
      if (loadingState) loadingState.style.display = "";
      const emptyState = document.getElementById("emptyState");
      if (emptyState) emptyState.style.display = "none";

      let vehiclesQuery;
      const isGlobal = this.admin.role === "global_admin";
      let legion = this.admin.legion;

      if (!isGlobal && legion) {
        legion = normalizeLegion(legion);
        vehiclesQuery = query(
          collection(this.db, "stolen_vehicles"),
          where("legion", "==", legion),
          orderBy("theft_date", "desc")
        );
      } else {
        vehiclesQuery = query(
          collection(this.db, "stolen_vehicles"),
          orderBy("theft_date", "desc")
        );
      }

      // real-time sync
      if (this._unsubscribe) this._unsubscribe();
      this._unsubscribe = onSnapshot(
        vehiclesQuery,
        (snapshot) => {
          this.allVehicles = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));
          if (this.admin.role === "legion_admin" && this.admin.legion) {
            this.allVehicles = this.allVehicles.filter(
              (v) => v.legion === this.admin.legion
            );
          }
          this.filteredVehicles = [...this.allVehicles];
          if (loadingState) loadingState.style.display = "none";
          if (this.allVehicles.length === 0) {
            if (emptyState) emptyState.style.display = "";
          } else {
            this.displayVehicles();
            this.updateResultsCount();
            // optionally start listening for detections if implemented
            if (this.listenDetectionsForVehicles)
              this.listenDetectionsForVehicles();
          }
        },
        (err) => {
          console.error("Erreur Firestore onSnapshot:", err);
          if (loadingState) loadingState.style.display = "none";
          alert("Erreur lors du chargement des véhicules (temps réel)");
        }
      );
    } catch (err) {
      console.error("Erreur chargement véhicules:", err);
      alert("Erreur lors du chargement des véhicules");
    }
  }

  handleFilterChange() {
    this.filters.search =
      document.getElementById("searchInput")?.value.toLowerCase() || "";
    this.filters.status = document.getElementById("statusFilter")?.value || "";
    this.filters.legion = document.getElementById("legionFilter")?.value || "";
    this.filters.period = document.getElementById("periodFilter")?.value || "";
    this.applyFilters();
    this.currentPage = 1;
    this.displayVehicles();
    this.updateResultsCount();
  }

  applyFilters() {
    this.filteredVehicles = this.allVehicles.filter((vehicle) => {
      if (this.filters.search) {
        const searchText = this.filters.search;
        const matchFields = [
          vehicle.license_plate,
          vehicle.chassis_number,
          vehicle.registration_number,
          vehicle.make,
          vehicle.model,
          vehicle.owner?.full_name,
          vehicle.case_number,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!matchFields.includes(searchText)) return false;
      }
      if (this.filters.status && vehicle.status !== this.filters.status)
        return false;
      if (this.filters.legion && vehicle.legion !== this.filters.legion)
        return false;
      // period filter can be implemented as needed
      return true;
    });
  }

  displayVehicles() {
    const container = document.getElementById("vehiclesList");
    if (!container) {
      console.error("#vehiclesList introuvable");
      return;
    }
    if (!this.filteredVehicles || this.filteredVehicles.length === 0) {
      container.innerHTML =
        '<div style="background:orange; padding:16px; font-weight:bold;">AUCUN VEHICULE À AFFICHER</div>';
      return;
    }

    // pagination slice
    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    const pageItems = this.filteredVehicles.slice(start, end);

    container.innerHTML = pageItems
      .map((vehicle) => {
        const ownerName =
          (vehicle.owner && vehicle.owner.full_name) ||
          vehicle.owner_name ||
          "N/A";
        const registration =
          vehicle.registration_number || vehicle.license_plate || "N/A";
        const types =
          vehicle.vehicle_types && vehicle.vehicle_types.length
            ? vehicle.vehicle_types.join(", ")
            : "-";
        const estimated = vehicle.estimated_value
          ? typeof vehicle.estimated_value === "number"
            ? vehicle.estimated_value.toLocaleString("fr-FR")
            : vehicle.estimated_value
          : "-";
        const foundBadge = vehicle.found
          ? `<span class="text-green-700 bg-green-100 px-2 py-0.5 rounded text-xs">Retrouvé</span>`
          : `<span class="text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded text-xs">Recherché</span>`;
        const legionName =
          window.TrackingCarConfig?.LEGIONS?.[vehicle.legion]?.name ||
          vehicle.legion ||
          "-";

        return `
            <div class="border border-gray-200 rounded-lg p-4 mb-4 bg-white shadow">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <h3 class="font-semibold text-gray-900 text-lg">${
                          vehicle.make || "N/A"
                        } ${vehicle.model || ""} ${
          vehicle.year ? "(" + vehicle.year + ")" : ""
        }</h3>
                        <div class="text-sm text-gray-600">${types} • ${legionName}</div>
                    </div>
                    <div class="text-right">
                        ${foundBadge}
                        <div class="text-xs text-gray-500 mt-2">${
                          vehicle.theft_date
                            ? vehicle.theft_date.seconds
                              ? new Date(
                                  vehicle.theft_date.seconds * 1000
                                ).toLocaleDateString("fr-FR")
                              : vehicle.theft_date
                            : "Date N/A"
                        }</div>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-2 text-sm text-gray-700 mb-3">
                    <div><i class="fas fa-id-card mr-1"></i>Plaque: <span class="font-medium">${vehicle.license_plate || "-"}</span></div>
                    <div><i class="fas fa-barcode mr-1"></i>Châssis: <span class="font-medium">${vehicle.chassis_number || "-"}</span></div>
                    <div><i class="fas fa-hashtag mr-1"></i>Enreg: <span class="font-medium">${registration}</span></div>
                    <div><i class="fas fa-calendar-alt mr-1"></i>Année: <span class="font-medium">${vehicle.year || "-"}</span></div>
                    <div><i class="fas fa-palette mr-1"></i>Couleur: <span class="font-medium">${vehicle.color || "-"}</span></div>
                    <div><i class="fas fa-euro-sign mr-1"></i>Valeur: <span class="font-medium">${estimated}</span></div>
                    <div><i class="fas fa-user mr-1"></i>Propriétaire: <span class="font-medium">${ownerName}</span></div>
                    <div><i class="fas fa-phone mr-1"></i>Tél: <span class="font-medium">${vehicle.owner?.phone || vehicle.owner_phone || "-"}</span></div>
                    <div><i class="fas fa-map-marker-alt mr-1"></i>Lieu vol: <span class="font-medium">${vehicle.theft_location || "-"}</span></div>
                    <div><i class="fas fa-building mr-1"></i>Admin: <span class="font-medium">${vehicle.administration || "-"}</span></div>
                    <div><i class="fas fa-map-marker mr-1"></i>Dernier lieu: <span class="font-medium">${vehicle.last_seen_location || "-"}</span></div>
                    ${vehicle.insurance_company ? `<div><i class="fas fa-shield-alt mr-1"></i>Assurance: <span class="font-medium">${vehicle.insurance_company}</span></div>` : ''}
                </div>

                <div class="flex justify-end space-x-2">
                    <button onclick="vehiclesManager.viewVehicle('${
                      vehicle.id
                    }')" class="btn text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded"><i class="fas fa-eye mr-1"></i>Détails</button>
                    <button onclick="vehiclesManager.editVehicle('${
                      vehicle.id
                    }')" class="btn text-sm bg-yellow-100 text-yellow-700 px-3 py-1 rounded"><i class="fas fa-edit mr-1"></i>Modifier</button>
                    ${
                      vehicle.status === "active"
                        ? `<button onclick="vehiclesManager.markAsRecovered('${vehicle.id}')" class="btn text-sm bg-green-100 text-green-700 px-3 py-1 rounded"><i class="fas fa-check mr-1"></i>Récupéré</button>`
                        : ""
                    }
                    <button onclick="vehiclesManager.deleteVehicle('${
                      vehicle.id
                    }')" class="btn text-sm bg-red-100 text-red-700 px-3 py-1 rounded"><i class="fas fa-trash mr-1"></i>Supprimer</button>
                </div>
            </div>`;
      })
      .join("");

    this.updatePagination();
  }

  viewVehicle(vehicleId) {
    const vehicle = this.allVehicles.find((v) => v.id === vehicleId);
    if (!vehicle) return;
    const modal = document.getElementById("vehicleModal");
    const modalContent = document.getElementById("modalContent");
    if (!modal || !modalContent) return;

    const formatDate = (date) => this.formatDate(date);
    
    const legionName =
      window.TrackingCarConfig?.LEGIONS?.[vehicle.legion]?.name ||
      vehicle.legion ||
      "-";
    const ownerName =
      (vehicle.owner && vehicle.owner.full_name) || vehicle.owner_name || "-";
    const types =
      vehicle.vehicle_types && vehicle.vehicle_types.length
        ? vehicle.vehicle_types.join(", ")
        : "-";
    const estimated = vehicle.estimated_value
      ? typeof vehicle.estimated_value === "number"
        ? new Intl.NumberFormat('fr-FR').format(vehicle.estimated_value) + ' FCFA'
        : vehicle.estimated_value
      : "-";
    const foundText = vehicle.found ? "Oui" : "Non";
    const reportedToPolice = vehicle.reported_to_police ? "Oui" : "Non";

    modalContent.innerHTML = `
      <div class="space-y-6">
        <!-- En-tête avec statut et numéro de dossier -->
        <div class="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
          <div class="flex items-center space-x-2">
            <span class="px-3 py-1 text-sm rounded-full ${
              vehicle.status === 'recovered' 
                ? 'bg-green-100 text-green-800' 
                : vehicle.status === 'closed' 
                  ? 'bg-gray-100 text-gray-800' 
                  : 'bg-yellow-100 text-yellow-800'
            }">
              ${vehicle.status === 'recovered' ? 'Récupéré' : vehicle.status === 'closed' ? 'Fermé' : 'En cours'}
            </span>
            ${vehicle.case_number ? `<span class="text-sm text-gray-600">Dossier #${vehicle.case_number}</span>` : ''}
          </div>
          <div class="text-sm text-gray-500">
            Enregistré le: ${formatDate(vehicle.created_at)}
          </div>
        </div>

        <!-- Informations générales du véhicule -->
        <div class="bg-white p-4 rounded-lg border border-gray-200">
          <h4 class="font-semibold text-gray-900 mb-3 pb-2 border-b">Informations du véhicule</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div><b>Numéro d'enregistrement:</b> ${vehicle.registration_number || "Non renseigné"}</div>
            <div><b>Type(s) de véhicule:</b> ${types}</div>
            <div><b>Marque:</b> ${vehicle.make || "Non renseigné"}</div>
            <div><b>Modèle:</b> ${vehicle.model || "Non renseigné"}</div>
            <div><b>Année:</b> ${vehicle.year || "Non renseigné"}</div>
            <div><b>Couleur:</b> ${vehicle.color || "Non renseigné"}</div>
            <div><b>Immatriculation:</b> ${vehicle.license_plate || "Non renseigné"}</div>
            <div><b>N° de châssis:</b> ${vehicle.chassis_number || "Non renseigné"}</div>
            <div><b>N° de moteur:</b> ${vehicle.engine_number || "Non renseigné"}</div>
            <div><b>Valeur estimée:</b> ${estimated}</div>
            <div><b>Légion:</b> ${legionName}</div>
            <div><b>Administration:</b> ${vehicle.administration || "Non renseigné"}</div>
          </div>
        </div>

        <!-- Détails du vol -->
        <div class="bg-white p-4 rounded-lg border border-gray-200">
          <h4 class="font-semibold text-gray-900 mb-3 pb-2 border-b">Détails du vol</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div><b>Date du vol:</b> ${formatDate(vehicle.theft_date)}</div>
            <div><b>Heure du vol:</b> ${vehicle.theft_time || "Non renseignée"}</div>
            <div><b>Lieu du vol:</b> ${vehicle.theft_location || "Non renseigné"}</div>
            <div><b>Dernier lieu de stationnement:</b> ${vehicle.last_seen_location || "Non renseigné"}</div>
            <div><b>Circonstances du vol:</b> ${vehicle.theft_circumstances || "Non renseignées"}</div>
            <div><b>Témoins:</b> ${vehicle.witnesses || "Aucun"}</div>
            <div><b>Déclaré à la police:</b> ${reportedToPolice}</div>
            ${vehicle.police_station ? `<div><b>Commissariat:</b> ${vehicle.police_station}</div>` : ''}
            ${vehicle.police_report_number ? `<div><b>N° de plainte:</b> ${vehicle.police_report_number}</div>` : ''}
            ${vehicle.investigation_officer ? `<div><b>Officier en charge:</b> ${vehicle.investigation_officer}</div>` : ''}
            ${vehicle.investigation_status ? `<div><b>Statut de l'enquête:</b> ${vehicle.investigation_status}</div>` : ''}
          </div>
        </div>

        <!-- Informations sur le propriétaire -->
        <div class="bg-white p-4 rounded-lg border border-gray-200">
          <h4 class="font-semibold text-gray-900 mb-3 pb-2 border-b">Propriétaire</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div><b>Nom complet:</b> ${ownerName}</div>
            <div><b>Téléphone:</b> ${vehicle.owner?.phone || vehicle.owner_phone || "Non renseigné"}</div>
            <div><b>Adresse:</b> ${vehicle.owner?.address || vehicle.owner_address || "Non renseignée"}</div>
            <div><b>Email:</b> ${vehicle.owner?.email || "Non renseigné"}</div>
            <div><b>Numéro de pièce d'identité:</b> ${vehicle.owner?.id_number || vehicle.owner_cni || "Non renseigné"}</div>
            <div><b>Profession:</b> ${vehicle.owner?.profession || "Non renseignée"}</div>
          </div>
        </div>

        <!-- Informations sur l'assurance -->
        <div class="bg-white p-4 rounded-lg border border-gray-200">
          <h4 class="font-semibold text-gray-900 mb-3 pb-2 border-b">Assurance</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div><b>Compagnie d'assurance:</b> ${vehicle.insurance_company || "Non renseignée"}</div>
            <div><b>Numéro de police:</b> ${vehicle.insurance_policy || "Non renseigné"}</div>
            <div><b>État du véhicule:</b> ${vehicle.vehicle_condition || "Non renseigné"}</div>
          </div>
        </div>

        <!-- Informations supplémentaires -->
        <div class="bg-white p-4 rounded-lg border border-gray-200">
          <h4 class="font-semibold text-gray-900 mb-3 pb-2 border-b">Informations supplémentaires</h4>
          <div class="space-y-4 text-sm">
            <div><b>Caractéristiques distinctives:</b> ${vehicle.distinctive_features || "Aucune"}</div>
            <div><b>Récompense offerte:</b> ${vehicle.reward_offered ? new Intl.NumberFormat('fr-FR').format(vehicle.reward_offered) + ' FCFA' : "Aucune"}</div>
            <div><b>Notes supplémentaires:</b> ${vehicle.additional_notes || "Aucune"}</div>
            <div><b>Observations de l'agent:</b> ${vehicle.agent_observations || "Aucune"}</div>
          </div>
        </div>

        <!-- Pied de page avec boutons d'action -->
        <div class="flex justify-end space-x-3 pt-4 border-t">
          <button onclick="window.vehiclesManager.editVehicle('${vehicle.id}')" 
                  class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
            <i class="fas fa-edit mr-2"></i>Modifier
          </button>
          ${vehicle.status === 'active' ? `
            <button onclick="window.vehiclesManager.markAsRecovered('${vehicle.id}')" 
                    class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
              <i class="fas fa-check-circle mr-2"></i>Marquer comme récupéré
            </button>
          ` : ''}
          <button onclick="if(confirm('Êtes-vous sûr de vouloir supprimer ce véhicule ?')) window.vehiclesManager.deleteVehicle('${vehicle.id}')" 
                  class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors">
            <i class="fas fa-trash-alt mr-2"></i>Supprimer
          </button>
        </div>
      </div>
    `;

    // Afficher la modale
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");

    // Section Agent & métadonnées
    const agentInfo = `
      <h4 class="font-semibold text-gray-900">Agent & métadonnées</h4>
      <div class="text-sm">
          <div><b>Agent enregistreur:</b> ${vehicle.recording_agent || "-"}</div>
          <div><b>Date enregistrement:</b> ${
            vehicle.registration_date
              ? vehicle.registration_date.seconds
                ? new Date(
                              vehicle.registration_date.seconds * 1000
                            ).toLocaleString("fr-FR")
                          : vehicle.registration_date
                        : "-"
                    }</div>
                    <div><b>Statut dossier:</b> ${
                      vehicle.case_status || "-"
                    }</div>
                    <div><b>Observations:</b> ${
                      vehicle.agent_observations || "-"
                    }</div>
                </div>
            </div>
        `;
    modal.classList.remove("hidden");
  }

  closeModal() {
    document.getElementById("vehicleModal")?.classList.add("hidden");
  }

  editVehicle(vehicleId) {
    window.location.href = `edit.html?id=${vehicleId}`;
  }

  async markAsRecovered(vehicleId) {
    if (!confirm("Êtes-vous sûr que ce véhicule a été récupéré ?")) return;
    try {
      await updateDoc(doc(this.db, "stolen_vehicles", vehicleId), {
        status: "recovered",
        updated_at: Timestamp.now(),
      });
      alert("Véhicule marqué comme récupéré");
      this.loadVehicles();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la mise à jour");
    }
  }

  async deleteVehicle(vehicleId) {
    if (!confirm("Supprimer définitivement ce véhicule ?")) return;
    try {
      await deleteDoc(doc(this.db, "stolen_vehicles", vehicleId));
      alert("Véhicule supprimé");
      this.loadVehicles();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la suppression");
    }
  }

  updateResultsCount() {
    const el = document.getElementById("resultsCount");
    if (el)
      el.textContent = `${this.filteredVehicles.length} véhicule(s) trouvé(s)`;
  }

  updatePagination() {
    const totalPages = Math.ceil(
      this.filteredVehicles.length / this.itemsPerPage
    );
    const pagination = document.getElementById("pagination");
    if (!pagination) return;
    if (totalPages <= 1) {
      pagination.classList.add("hidden");
      return;
    }
    pagination.classList.remove("hidden");

    const startItem = (this.currentPage - 1) * this.itemsPerPage + 1;
    const endItem = Math.min(
      this.currentPage * this.itemsPerPage,
      this.filteredVehicles.length
    );
    document.getElementById("pageStart").textContent = startItem;
    document.getElementById("pageEnd").textContent = endItem;
    document.getElementById("totalItems").textContent =
      this.filteredVehicles.length;

    const pageNumbers = document.getElementById("pageNumbers");
    pageNumbers.innerHTML = "";
    const maxVisible = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage + 1 < maxVisible)
      startPage = Math.max(1, endPage - maxVisible + 1);
    for (let i = startPage; i <= endPage; i++) {
      const btn = document.createElement("button");
      btn.className = `px-3 py-1 text-sm border rounded ${
        i === this.currentPage
          ? "bg-blue-600 text-white border-blue-600"
          : "border-gray-300 hover:bg-gray-50"
      }`;
      btn.textContent = i;
      btn.onclick = () => {
        this.currentPage = i;
        this.displayVehicles();
      };
      pageNumbers.appendChild(btn);
    }

    document.getElementById("prevPageBtn").disabled = this.currentPage === 1;
    document.getElementById("nextPageBtn").disabled =
      this.currentPage === totalPages;
  }

  exportData() {
    const vehicles = this.filteredVehicles || [];
    if (vehicles.length === 0) {
      alert("Aucune donnée à exporter !");
      return;
    }
    const headers = [
      "Enreg",
      "Plaque",
      "Châssis",
      "Marque",
      "Modèle",
      "Année",
      "Valeur",
      "Date vol",
      "Lieu vol",
      "Légion",
      "Statut",
    ];
    const rows = vehicles.map((v) => [
      v.registration_number || "",
      v.license_plate || "",
      v.chassis_number || "",
      v.make || "",
      v.model || "",
      v.year || "",
      v.estimated_value || "",
      v.theft_date && v.theft_date.seconds
        ? new Date(v.theft_date.seconds * 1000).toLocaleDateString("fr-FR")
        : "",
      v.theft_location || "",
      window.TrackingCarConfig?.LEGIONS?.[v.legion]?.name || v.legion || "",
      v.status || "",
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vehicules.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  formatDate(date) {
    if (!date) return "-";
    const d = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
    return d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

// UTILITAIRES (global)
function getVal(id) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`Élément non trouvé: ${id}`);
    return "";
  }
  
  // Gestion spéciale pour les champs de type number, range
  if (el.type === 'number' || el.type === 'range') {
    return el.value !== '' ? parseFloat(el.value) : null;
  }
  
  // Gestion des cases à cocher
  if (el.type === 'checkbox') {
    return el.checked;
  }
  
  // Gestion des champs de date et heure
  if (el.type === 'date' || el.type === 'time' || el.type === 'datetime-local') {
    return el.value || null;
  }
  
  // Gestion des champs de sélection (select)
  if (el.tagName === 'SELECT') {
    return el.value || "";
  }
  
  // Pour les champs texte normaux
  const value = el.value ? el.value.toString().trim() : "";
  return value === "" ? null : value;
}
function getCheckboxValues(name) {
  return Array.from(
    document.querySelectorAll(`input[name="${name}"]:checked`)
  ).map((i) => i.value);
}
function getRadioValue(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : "";
}
function normalizeLegion(value) {
  if (!value) return "";
  let v = value.toString().trim().toLowerCase();
  if (v === "centre") return "l1";
  if (v === "littoral") return "l2";
  if (v === "ouest") return "l3";
  if (v === "sud") return "l4";
  if (v === "nord") return "l5";
  if (v === "adamaoua") return "l6";
  if (v === "est") return "l7";
  if (v === "extreme-nord") return "l8";
  if (v === "nord-ouest") return "l9";
  if (v === "sud-ouest") return "l10";
  if (v === "logone-et-chari (far north)") return "l11";
  return value;
}

// INIT after DOM loaded
document.addEventListener("DOMContentLoaded", () => {
  const admin = window.checkAccessForAdmin();
  if (!admin || !admin.role) {
    console.error("Admin non authentifié", admin);
    const container = document.getElementById("vehiclesList");
    if (container)
      container.innerHTML =
        '<div style="background:red;color:white;padding:16px;font-weight:bold;">ERREUR: Admin non authentifié</div>';
    return;
  }

  if (admin.role === "global_admin") {
    document
      .querySelectorAll(".menu-global")
      .forEach((e) => e.classList.remove("hidden"));
    document
      .querySelectorAll(".menu-legion")
      .forEach((e) => e.classList.add("hidden"));
  } else {
    document
      .querySelectorAll(".menu-global")
      .forEach((e) => e.classList.add("hidden"));
    document
      .querySelectorAll(".menu-legion")
      .forEach((e) => e.classList.remove("hidden"));
  }

  window.vehiclesManager = new VehiclesManager(admin);
  window.vehiclesManager.vehicleDetections = {};
  // optional: implement listenDetectionsForVehicles if needed (kept for backward compat)
  window.vehiclesManager.listenDetectionsForVehicles = function () {
    // no-op default
  };

  // Handle add form (support addVehicleForm or legacy vehicleForm)
  const addForm =
    document.getElementById("addVehicleForm") ||
    document.getElementById("vehicleForm");
  if (addForm) {
    // disable legion if leg admin
    if (admin.role === "legion_admin") {
      const legionSelect = document.getElementById("legion");
      if (legionSelect) {
        legionSelect.value = admin.legion;
        legionSelect.disabled = true;
      }
    }

    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      // Afficher un indicateur de chargement
      const submitBtn = document.querySelector('button[type="submit"]');
      const originalBtnText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
      
      try {
        const db = window.vehiclesManager?.db;
        if (!db) throw new Error("Erreur: Impossible d'accéder à la base de données");

        // Récupération des valeurs du formulaire
        const registrationNumber = getVal("registrationNumber");
        const theftDateVal = getVal("theftDate");
        const theftTimeVal = getVal("theftTime");
        
        // Validation des champs obligatoires
        const requiredFields = {
          registrationNumber: "Numéro d'enregistrement",
          make: "Marque du véhicule",
          model: "Modèle du véhicule",
          theftDate: "Date du vol",
          theftTime: "Heure du vol",
          theftLocation: "Lieu du vol",
          ownerPhone: "Téléphone du propriétaire"
        };
        
        const missingFields = [];
        for (const [field, label] of Object.entries(requiredFields)) {
          const value = getVal(field);
          if (!value && value !== 0) { // Permet les valeurs 0
            missingFields.push(label);
          }
        }
        
        if (missingFields.length > 0) {
          throw new Error(`Veuillez remplir les champs obligatoires : ${missingFields.join(', ')}`);
        }
        
        // Traitement des dates
        let theftDateObj = null;
        if (theftDateVal && theftTimeVal) {
          theftDateObj = new Date(`${theftDateVal}T${theftTimeVal}`);
          if (isNaN(theftDateObj.getTime())) {
            throw new Error("La date ou l'heure du vol n'est pas valide");
          }
        } else if (theftDateVal) {
          theftDateObj = new Date(theftDateVal);
        }
        
        // Récupération des autres valeurs
        const vehicleTypes = getCheckboxValues("vehicleType");
        const foundDateVal = getVal("foundDate");
        const foundDateObj = foundDateVal ? new Date(foundDateVal) : null;
        const foundCondition = getVal("foundCondition");
        const foundDelay = getVal("foundDelay");
        const distinctiveFeatures = getVal("distinctiveFeatures");
        const make = getVal("make");
        const model = getVal("model");
        const year = getVal("vehicleYear");
        const color = getVal("vehicleColor");

        // IDs conformes au formulaire add.html
        const licensePlateRaw = getVal("vehicleLicensePlate");
        const licensePlate = licensePlateRaw
          ? licensePlateRaw.replace(/\s|-/g, "").toUpperCase()
          : null;

        const chassisNumberRaw = getVal("vehicleChassisNumber");
        const chassisNumber = chassisNumberRaw
          ? chassisNumberRaw.replace(/\s|-/g, "").toUpperCase()
          : null;

        const engineNumberRaw = getVal("vehicleEngineNumber");
        const engineNumber = engineNumberRaw
          ? engineNumberRaw.replace(/\s|-/g, "").toUpperCase()
          : null;

        const estimatedValue = getVal("vehicleEstimatedValue");
        const zoneType = getVal("zoneType");
        const visibility = getVal("visibility");
        const antitheft_present = getRadioValue("antitheft_present");
        const antitheftType = getCheckboxValues("antitheftType");
        const found = getRadioValue("found") === "oui";
        
        // Informations sur le vol
        const theftCircumstances = getVal("theftCircumstances");
        const witnesses = getVal("witnesses");
        const reportedToPolice = document.getElementById("reportedToPolice")?.checked || false;

        // Informations sur l'agent
        const recordingAgent = getVal("recordingAgent") || 
          (admin.name ? `${admin.name}${admin.email ? ` (${admin.email})` : ''}` : 'Système');
        
        const registrationDateObj = new Date();
        const caseStatus = getVal("caseStatus") || "ouvert";
        const agentObservations = getVal("agentObservations");

        // Gestion de la légion
        let legionValue = admin.role === "legion_admin" ? admin.legion : getVal("legion");
        legionValue = normalizeLegion(legionValue);
        
        if (!legionValue) {
          throw new Error("Veuillez sélectionner une légion responsable");
        }
        
        // Récupération des informations du propriétaire
        const ownerLastName = getVal("ownerLastName");
        const ownerFirstName = getVal("ownerFirstName");
        const ownerAddress = getVal("ownerAddress");
        const ownerPhone = getVal("ownerPhone");
        const ownerEmail = getVal("ownerEmail");
        const ownerIdNumber = getVal("ownerIdNumber");
        const ownerProfession = getVal("ownerProfession");

// Préparation des données pour l'enregistrement
const data = {
// Informations d'identification
registration_number: registrationNumber,
case_number: getVal("caseNumber"),
          
// Informations sur le vol
theft_date: theftDateObj ? Timestamp.fromDate(theftDateObj) : null,
theft_time: theftTimeVal,
theft_location: getVal("theftLocation"),
theft_circumstances: theftCircumstances,
witnesses: witnesses,
reported_to_police: reportedToPolice,
          
// Informations sur le véhicule
vehicle_types: vehicleTypes.length > 0 ? vehicleTypes : ["inconnu"],
make: make,
model: model,
year: year,
color: color,
license_plate: licensePlate,
chassis_number: chassisNumber,
engine_number: engineNumber,
estimated_value: estimatedValue ? parseFloat(estimatedValue) : null,
distinctive_features: distinctiveFeatures,
          
// Localisation et zone
zone_type: zoneType,
visibility: visibility,
legion: legionValue,
          
// Sécurité
antitheft_present: antitheft_present,
antitheft_types: antitheftType,
          
// État de récupération
          
          // Propriétaire
          owner: {
            last_name: ownerLastName,
            first_name: ownerFirstName,
            full_name: `${ownerLastName || ""} ${ownerFirstName || ""}`.trim() || null,
            address: ownerAddress,
            phone: ownerPhone,
            email: ownerEmail,
            id_number: ownerIdNumber,
            profession: ownerProfession
          },
          
          // Métadonnées
          recording_agent: recordingAgent,
          registration_date: Timestamp.fromDate(registrationDateObj),
          case_status: caseStatus,
          agent_observations: agentObservations,
          status: caseStatus === "resolu" ? "recovered" : 
                 caseStatus === "classe" ? "closed" : "active",
          created_at: Timestamp.now(),
          updated_at: Timestamp.now(),
          reported_by_email: admin.email || "system@trackingcar.com"
        };

        console.log("Enregistrement du véhicule...", data);
        
        // Enregistrement dans Firestore
        const docRef = await addDoc(collection(db, "stolen_vehicles"), data);
        console.log("Véhicule enregistré avec l'ID: ", docRef.id);

        // Afficher une notification de succès
        const successMessage = document.createElement('div');
        successMessage.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        successMessage.innerHTML = '<i class="fas fa-check-circle mr-2"></i> Véhicule enregistré avec succès !';
        document.body.appendChild(successMessage);

        // Redirection après un court délai
        setTimeout(() => {
          window.location.href = "list.html";
        }, 1500);

      } catch (err) {
        console.error("Erreur lors de l'ajout du véhicule:", err);

        // Afficher une notification d'erreur détaillée
        const errorMessage = document.createElement('div');
        errorMessage.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        errorMessage.innerHTML = `
          <div class="flex items-center">
            <i class="fas fa-exclamation-triangle mr-2"></i>
            <div>
              <div class="font-semibold">Erreur lors de l'enregistrement</div>
              <div class="text-sm">${err.message || 'Veuillez réessayer'}</div>
            </div>
          </div>
        `;
        document.body.appendChild(errorMessage);

        // Supprimer le message d'erreur après 5 secondes
        setTimeout(() => {
          if (errorMessage.parentNode) {
            errorMessage.parentNode.removeChild(errorMessage);
          }
        }, 5000);

        // Réactiver le bouton de soumission
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnText;
        }
      }
    });
  }
});
