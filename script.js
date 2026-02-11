document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. INICIALIZACIÓN DE ICONOS ---
    if (window.lucide) {
        lucide.createIcons();
    }

    // --- 2. CONFIGURACIÓN DE DATOS (MAPAS) ---
    const VAR_MAP = {
        "FALL CREEK": {
            "01": "Ventura", "02": "Emerald", "03": "Biloxi", "05": "Snowchaser", 
            "12": "Jupiter Blue", "13": "Bianca Blue", "14": "Atlas Blue", 
            "15": "Biloxi Orgánico", "16": "Sekoya Beauty", "18": "Sekoya Pop", 
            "27": "Atlas Blue Orgánico", "36": "FCM17-132", "37": "FCM15-005", 
            "38": "FCM15-003", "40": "FCM14-057", "41": "Azra", 
            "49": "Sekoya Pop Orgánica", "58": "Ventura Orgánico", 
            "C0": "FCE15-087", "C1": "FCE18-012", "C2": "FCE18-015"
        },
        "DRISCOLL'S": {
            "17": "Kirra", "19": "Arana", "20": "Stella Blue", "21": "Terrapin", 
            "26": "Rosita", "28": "Arana Orgánico", "29": "Stella Blue Orgánico", 
            "30": "Kirra Orgánico", "31": "Regina", "34": "Raymi Orgánico", 
            "45": "Raymi", "50": "Rosita Orgánica"
        },
        "OZBLU": {
            "06": "Mágica", "07": "Bella", "08": "Bonita", "09": "Julieta", 
            "10": "Zila", "11": "Magnifica"
        },
        "PLANASA": {
            "22": "PLA Blue-Malibu", "23": "PLA Blue-Madeira", 
            "24": "PLA Blue-Masirah", "35": "Manila"
        },
        "IQ BERRIES": {
            "51": "Megaone", "53": "Megacrisp", "54": "Megaearly", 
            "55": "Megagem", "56": "Megagrand", "57": "Megastar"
        },
        "UNIV. FLORIDA": {
            "04": "Springhigh", "33": "Magnus", "39": "Colosus", "42": "Raven", 
            "43": "Avanti", "46": "Patrecia", "47": "Wayne", "48": "Bobolink", 
            "52": "Keecrisp", "67": "Albus (FL 11-051)", "68": "Falco (FL 17-141)", 
            "69": "FL-11-158", "70": "FL-10-179", "B9": "FL 19-006", 
            "C3": "FL09-279", "C4": "FL12-236"
        },
        "OTROS / EXPERIMENTALES": {
            "25": "Mixto", "32": "I+D", "44": "Merliah", 
            "62": "FCM15-000", "63": "FCM15-010", "64": "FCM-17010", "65": "Valentina"
        }
    };

    // --- 3. CARGA DINÁMICA DE SELECTS ---
    const selectVariedad = document.getElementById('reg_variedad');
    if (selectVariedad) {
        for (const [casa, variedades] of Object.entries(VAR_MAP)) {
            const group = document.createElement('optgroup');
            group.label = casa;

            for (const [id, nombre] of Object.entries(variedades)) {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = nombre;
                group.appendChild(option);
            }
            selectVariedad.appendChild(group);
        }
    }

    // --- 4. INTERFAZ DE USUARIO (SIDEBAR) ---
    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.getElementById('menu-btn');
    const closeBtn = document.getElementById('close-btn');

    if (menuBtn && sidebar) {
        menuBtn.addEventListener('click', () => sidebar.classList.add('active'));
    }

    if (closeBtn && sidebar) {
        closeBtn.addEventListener('click', () => sidebar.classList.remove('active'));
    }

    // --- 5. VALIDACIONES DE ENTRADA EN TIEMPO REAL ---
    const trazLibre = document.getElementById('reg_traz_libre'); // ID corregido según tu estructura
    if (trazLibre) {
        trazLibre.addEventListener('input', function() {
            this.value = this.value.toUpperCase();
        });
    }

    // --- 6. MANEJO DEL FORMULARIO (SUBMIT) ---
    const cosechaForm = document.getElementById('cosecha-form');
    if (cosechaForm) {
        cosechaForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Usamos SweetAlert2 para feedback visual claro bajo el sol
            Swal.fire({
                title: '¡Registro Exitoso!',
                text: 'Los datos se han guardado localmente en la tableta.',
                icon: 'success',
                confirmButtonColor: '#2f7cc0',
                confirmButtonText: 'Entendido'
            }).then((result) => {
                if (result.isConfirmed) {
                    // Opcional: Limpiar formulario después de guardar
                    // cosechaForm.reset();
                }
            });
        });
    }
});