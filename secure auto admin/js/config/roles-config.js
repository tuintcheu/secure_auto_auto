/**
 * Configuration des rôles simplifiée pour 2 types d'utilisateurs
 */

// Configuration des rôles (2 types seulement)
const ROLE_PERMISSIONS = {
    global_admin: {
        name: "Administrateur Global",
        description: "Accès complet à toutes les régions et légions - CED Yaoundé",
        code: "GLOBAL",
        regions: "ALL",
        legions: "ALL",
        permissions: {
            can_manage_users: true,
            can_view_all_reports: true,
            can_export_data: true,
            can_manage_system: true,
            can_manage_rewards: true,
            can_view_all_regions: true,
            can_create_vehicles: true,
            can_edit_vehicles: true,
            can_delete_vehicles: true,
            can_verify_detections: true,
            can_process_rewards: true
        }
    },
    legion_admin: {
        name: "Administrateur de Légion",
        description: "Accès limité à sa légion spécifique",
        code: "LEGION",
        permissions: {
            can_manage_users: false,
            can_view_all_reports: false,
            can_export_data: true,
            can_manage_system: false,
            can_manage_rewards: false,
            can_view_all_regions: false,
            can_create_vehicles: true,
            can_edit_vehicles: true,
            can_delete_vehicles: false, // Peut seulement modifier le statut
            can_verify_detections: true,
            can_process_rewards: false
        }
    }
};

// Mapping des légions par région (basé sur vos vraies données)
const LEGION_MAPPING = {
    "RG1": {
        name: "Région de Yaoundé",
        legions: ["CENTRE", "SUD"]
    },
    "RG2": {
        name: "Région de Douala", 
        legions: ["LITTORAL", "SUD_OUEST"]
    },
    "RG3": {
        name: "Région de Garoua",
        legions: ["ADAMAOUA", "NORD"]
    },
    "RG4": {
        name: "Région de Maroua",
        legions: ["EXTREME_NORD", "LOGONE_CHARI"]
    },
    "RG5": {
        name: "Région de Bamenda",
        legions: ["OUEST", "NORD_OUEST"]
    },
    "RG6": {
        name: "Région de Bafia",
        legions: ["CENTRE_BAFIA"]
    }
};

// Liste complète des légions
const ALL_LEGIONS = [
    "CENTRE", "SUD", "LITTORAL", "SUD_OUEST", 
    "ADAMAOUA", "NORD", "EXTREME_NORD", "LOGONE_CHARI",
    "OUEST", "NORD_OUEST", "CENTRE_BAFIA"
];

export { ROLE_PERMISSIONS, LEGION_MAPPING, ALL_LEGIONS };