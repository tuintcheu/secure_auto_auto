/**
 * Configuration des régions et légions de Gendarmerie du Cameroun
 */

// Structure hiérarchique des légions par région de gendarmerie
const GENDARMERIE_REGIONS = {
    RG1: {
        name: "Région de Yaoundé",
        headquarters: "Yaoundé",
        code: "RG1",
        legions: [
            {
                code: "CENTRE",
                name: "Légion de la Région du Centre",
                headquarters: "Yaoundé",
                departments: ["Mfoundi", "Mefou-et-Afamba", "Mefou-et-Akono", "Nyong-et-Kéllé", "Nyong-et-Mfoumou", "Nyong-et-So'o", "Haute-Sanaga", "Mbam-et-Inoubou", "Mbam-et-Kim", "Lékié"]
            },
            {
                code: "SUD",
                name: "Légion de la Région du Sud",
                headquarters: "Ebolowa",
                departments: ["Dja-et-Lobo", "Mvila", "Océan", "Vallée-du-Ntem"]
            }
        ]
    },
    RG2: {
        name: "Région de Douala",
        headquarters: "Douala",
        code: "RG2",
        legions: [
            {
                code: "LITTORAL",
                name: "Légion de la Région du Littoral",
                headquarters: "Douala",
                departments: ["Wouri", "Moungo", "Nkam", "Sanaga-Maritime"]
            },
            {
                code: "SUD_OUEST",
                name: "Légion de la Région du Sud-Ouest",
                headquarters: "Buea",
                departments: ["Fako", "Koupé-Manengouba", "Lebialem", "Manyu", "Meme", "Ndian"]
            }
        ]
    },
    RG3: {
        name: "Région de Garoua",
        headquarters: "Garoua",
        code: "RG3",
        legions: [
            {
                code: "ADAMAOUA",
                name: "Légion de la Région de l'Adamaoua",
                headquarters: "Ngaoundéré",
                departments: ["Djerem", "Faro-et-Déo", "Mayo-Banyo", "Mbéré", "Vina"]
            },
            {
                code: "NORD",
                name: "Légion de la Région du Nord",
                headquarters: "Garoua",
                departments: ["Bénoué", "Faro", "Mayo-Louti", "Mayo-Rey"]
            }
        ]
    },
    RG4: {
        name: "Région de Maroua",
        headquarters: "Maroua",
        code: "RG4",
        legions: [
            {
                code: "EXTREME_NORD",
                name: "Légion de la Région de l'Extrême-Nord",
                headquarters: "Maroua",
                departments: ["Diamaré", "Logone-et-Chari", "Mayo-Danay", "Mayo-Kani", "Mayo-Sava", "Mayo-Tsanaga"]
            },
            {
                code: "LOGONE_CHARI",
                name: "Légion de Logone et Chari",
                headquarters: "Kousséri",
                departments: ["Logone-et-Chari"]
            }
        ]
    },
    RG5: {
        name: "Région de Bamenda",
        headquarters: "Bamenda",
        code: "RG5",
        legions: [
            {
                code: "OUEST",
                name: "Légion de la Région de l'Ouest",
                headquarters: "Bafoussam",
                departments: ["Bamboutos", "Haut-Nkam", "Hauts-Plateaux", "Koung-Khi", "Menoua", "Mifi", "Mino", "Ndé", "Noun"]
            },
            {
                code: "NORD_OUEST",
                name: "Légion de la Région du Nord-Ouest",
                headquarters: "Bamenda",
                departments: ["Boyo", "Bui", "Donga-Mantung", "Menchum", "Mezam", "Momo", "Ngoketunjia"]
            }
        ]
    },
    RG6: {
        name: "Région de Bafia",
        headquarters: "Bafia",
        code: "RG6",
        legions: [
            {
                code: "CENTRE_BAFIA",
                name: "Légion de Bafia (Centre)",
                headquarters: "Bafia",
                departments: ["Mbam-et-Kim", "Mbam-et-Inoubou"]
            }
        ]
    }
};

// Liste plate de toutes les légions
const ALL_LEGIONS = Object.values(GENDARMERIE_REGIONS)
    .flatMap(region => region.legions)
    .reduce((acc, legion) => {
        acc[legion.code] = legion;
        return acc;
    }, {});

// Configuration des droits d'accès par rôle
const ROLE_PERMISSIONS = {
    super_admin: {
        name: "Super Administrateur",
        description: "Accès complet à toutes les régions - CED Yaoundé",
        regions: Object.keys(GENDARMERIE_REGIONS),
        legions: Object.keys(ALL_LEGIONS),
        can_manage_users: true,
        can_view_all_reports: true,
        can_export_data: true,
        can_manage_system: true
    },
    regional_admin: {
        name: "Administrateur Régional",
        description: "Accès limité à sa région de gendarmerie",
        can_manage_users: false,
        can_view_all_reports: false,
        can_export_data: true,
        can_manage_system: false
    },
    legion_admin: {
        name: "Administrateur de Légion",
        description: "Accès limité à sa légion",
        can_manage_users: false,
        can_view_all_reports: false,
        can_export_data: false,
        can_manage_system: false
    }
};

export { GENDARMERIE_REGIONS, ALL_LEGIONS, ROLE_PERMISSIONS };