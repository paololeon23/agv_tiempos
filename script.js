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

        // Abrir Sidebar
        if (menuBtn && sidebar) {
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Evita que el clic se propague al document inmediatamente
                sidebar.classList.add('active');
            });
        }

        // Cerrar con el botón X
        if (closeBtn && sidebar) {
            closeBtn.addEventListener('click', () => {
                sidebar.classList.remove('active');
            });
        }

        // CERRAR AL CLICKEAR AFUERA
        document.addEventListener('click', (event) => {
            // Si el sidebar está activo Y el clic NO fue dentro del sidebar Y el clic NO fue en el botón de menú
            if (sidebar.classList.contains('active') && 
                !sidebar.contains(event.target) && 
                !menuBtn.contains(event.target)) {
                
                sidebar.classList.remove('active');
            }
        });

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

// --- 7. LÓGICA DE MEDICIÓN (CALIBRADO VISUAL) - MEJORADA ---
const selectMedicion = document.getElementById('tipo_medicion');
const selectRotulo = document.getElementById('reg_rotulo_ensayo');
const wrapVisual = document.getElementById('wrapper_visual');
const wrapAcopio = document.getElementById('wrapper_acopio');

// Almacenamiento de datos por ensayo y tipo
const datosEnsayos = {
    visual: {
        1: { clamCount: 1, rows: [] },
        2: { clamCount: 1, rows: [] },
        3: { clamCount: 1, rows: [] },
        4: { clamCount: 1, rows: [] }
    },
    acopio: {
        1: { clamCount: 1, rows: [] },
        2: { clamCount: 1, rows: [] },
        3: { clamCount: 1, rows: [] },
        4: { clamCount: 1, rows: [] }
    }
};

let tipoActual = '';
let ensayoActual = '';

// --- CAMBIO DE TIPO DE MEDICIÓN ---
if (selectMedicion) {
    selectMedicion.addEventListener('change', function() {
        tipoActual = this.value;
        
        if (this.value === 'visual') {
            wrapVisual.style.display = 'block';
            wrapAcopio.style.display = 'none';
        } else if (this.value === 'acopio') {
            wrapVisual.style.display = 'none';
            wrapAcopio.style.display = 'block';
        }
        
        // Restaurar datos si hay un ensayo seleccionado
        if (ensayoActual) {
            restaurarDatosEnsayo(tipoActual, ensayoActual);
        }
    });
}

// --- CAMBIO DE ENSAYO ---
if (selectRotulo) {
    selectRotulo.addEventListener('change', function() {
        ensayoActual = this.value;
        
        // Solo restaurar si hay un tipo de medición seleccionado
        if (tipoActual) {
            restaurarDatosEnsayo(tipoActual, ensayoActual);
        }
    });
}

// --- FUNCIÓN PARA RESTAURAR DATOS DEL ENSAYO ---
function restaurarDatosEnsayo(tipo, ensayo) {
    if (tipo === 'visual') {
        const tbody = document.getElementById('tbody-visual');
        tbody.innerHTML = ''; // Limpiar tabla visual
        
        const datos = datosEnsayos.visual[ensayo];
        
        // Restaurar filas guardadas
        datos.rows.forEach(rowData => {
            agregarFilaVisual(rowData, tbody);
        });
        
        // Abrir el wrapper visual
        abrirVisual();
    }
    // Aquí puedes agregar lógica similar para acopio cuando lo implementes
}

// --- FUNCIÓN PARA AGREGAR FILA A LA TABLA ---
function agregarFilaVisual(data, tbody) {
    const row = document.createElement('tr');
    
    row.setAttribute('data-clam', data.clam);
    row.setAttribute('data-jarra', data.jarra);
    row.setAttribute('data-p1', data.p1);
    row.setAttribute('data-p2', data.p2);

    row.innerHTML = `
        <td class="clam-id">${data.clam}</td>
        <td>${data.jarra}</td>
        <td>${data.p1}g</td>
        <td>${data.p2}g</td>
        <td>
            <button type="button" class="btn-delete-row">
                <i data-lucide="trash-2"></i>
            </button>
        </td>
    `;

    tbody.appendChild(row);
    
    if (window.lucide) lucide.createIcons();

    // Evento de eliminar
    row.querySelector('.btn-delete-row').addEventListener('click', () => {
        row.remove();
        // Actualizar almacenamiento
        actualizarAlmacenamiento();
    });
}

// --- ACTUALIZAR ALMACENAMIENTO DESDE LA TABLA ---
function actualizarAlmacenamiento() {
    if (!tipoActual || !ensayoActual) return;
    
    const tbody = document.getElementById('tbody-visual');
    const rows = tbody.querySelectorAll('tr');
    
    datosEnsayos[tipoActual][ensayoActual].rows = [];
    
    rows.forEach(row => {
        datosEnsayos[tipoActual][ensayoActual].rows.push({
            clam: row.getAttribute('data-clam'),
            jarra: row.getAttribute('data-jarra'),
            p1: row.getAttribute('data-p1'),
            p2: row.getAttribute('data-p2')
        });
    });
    
    // Actualizar el contador de clamshell
    if (rows.length > 0) {
        const ultimoClam = parseInt(rows[rows.length - 1].getAttribute('data-clam'));
        datosEnsayos[tipoActual][ensayoActual].clamCount = ultimoClam + 1;
    }
}

// --- TOGGLE VISUAL ---
const headVisual = document.getElementById('toggle-visual');
const bodyVisual = document.getElementById('body-visual');
const iconVisual = document.getElementById('chevron-visual');

function abrirVisual() {
    bodyVisual.style.display = 'block';
    if (iconVisual) iconVisual.classList.add('rotate');
}

function cerrarVisual() {
    bodyVisual.style.display = 'none';
    if (iconVisual) iconVisual.classList.remove('rotate');
}

if (headVisual) {
    headVisual.addEventListener('click', () => {
        const isVisible = bodyVisual.style.display === 'block';
        isVisible ? cerrarVisual() : abrirVisual();
    });
}

// --- AÑADIR PESOS ---
const btnAddVisual = document.getElementById('btn-add-visual');
if (btnAddVisual) {
    btnAddVisual.addEventListener('click', () => {
        if (!ensayoActual) {
            Swal.fire({ 
                title: 'Atención', 
                text: 'Primero selecciona un Rótulo de Muestra (Ensayo)', 
                icon: 'warning' 
            });
            return;
        }
        
        const jarra = document.getElementById('v_jarra').value;
        const p1 = document.getElementById('v_peso1').value;
        const p2 = document.getElementById('v_peso2').value;

        if (jarra && p1 && p2) {
            const tbody = document.getElementById('tbody-visual');
            const clamActual = datosEnsayos.visual[ensayoActual].clamCount;
            
            const rowData = {
                clam: clamActual,
                jarra: jarra,
                p1: p1,
                p2: p2
            };
            
            // Agregar a la tabla
            agregarFilaVisual(rowData, tbody);
            
            // Guardar en almacenamiento
            datosEnsayos.visual[ensayoActual].rows.push(rowData);
            datosEnsayos.visual[ensayoActual].clamCount++;

            // Limpiar inputs
            document.getElementById('v_jarra').value = '';
            document.getElementById('v_peso1').value = '';
            document.getElementById('v_peso2').value = '';
            
            // FOCO PARA LA SIGUIENTE ENTRADA
            document.getElementById('v_jarra').focus();

        } else {
            Swal.fire({ title: 'Atención', text: 'Datos incompletos', icon: 'warning' });
        }
    });
}

// --- OPCIONAL: FUNCIÓN PARA OBTENER TODOS LOS DATOS AL GUARDAR ---
function obtenerTodosLosDatos() {
    // Actualizar almacenamiento antes de retornar
    actualizarAlmacenamiento();
    
    return {
        tipoMedicion: tipoActual,
        ensayoActual: ensayoActual,
        todosLosEnsayos: datosEnsayos
    };
}

            // Fuerza a que se vea la fecha actual en la tablet
        const campoFecha = document.getElementById('reg_fecha');
        if (campoFecha) {
            campoFecha.value = new Date().toISOString().split('T')[0];
        }


// --- 8. LÓGICA DE GUARDADO FINAL (ORDENADO PARA BACKEND) ---
const btnGuardarGeneral = document.getElementById('btn-guardar-registro');

if (btnGuardarGeneral) {
    btnGuardarGeneral.addEventListener('click', () => {
        
        const form = document.getElementById('cosecha-form');
        
        // ✅ Activa la validación HTML5 manualmente
        if (!form.checkValidity()) {
            form.reportValidity(); // Muestra los mensajes de error nativos
            return; // Detiene la ejecución
        }

        // Validación adicional: Tipo de medición
        const tipoMedicion = document.getElementById('tipo_medicion').value;
        if (!tipoMedicion) {
            Swal.fire({
                title: 'Atención',
                text: 'Debes seleccionar un tipo de medición',
                icon: 'warning',
                confirmButtonColor: '#2f7cc0'
            });
            return;
        }

        // Validación adicional: Rótulo de ensayo seleccionado
        const rotuloSeleccionado = document.getElementById('reg_rotulo_ensayo').value;
        if (!rotuloSeleccionado) {
            Swal.fire({
                title: 'Atención',
                text: 'Debes seleccionar un Rótulo de Muestra (Ensayo)',
                icon: 'warning',
                confirmButtonColor: '#2f7cc0'
            });
            return;
        }

        // ⚠️ IMPORTANTE: Actualizar almacenamiento del ensayo actual antes de guardar
        actualizarAlmacenamiento();

        // Validar que al menos UN ensayo tenga datos
        let hayDatos = false;
        const datosDelTipo = datosEnsayos[tipoMedicion];
        
        for (let ensayo in datosDelTipo) {
            if (datosDelTipo[ensayo].rows.length > 0) {
                hayDatos = true;
                break;
            }
        }

        if (!hayDatos) {
            Swal.fire({
                title: 'Atención',
                text: 'Debes agregar al menos un registro de peso en algún ensayo',
                icon: 'warning',
                confirmButtonColor: '#2f7cc0'
            });
            return;
        }

        // Construir array de ensayos con datos
        const ensayosConDatos = [];
        
        for (let numEnsayo in datosDelTipo) {
            const ensayo = datosDelTipo[numEnsayo];
            
            // Solo incluir ensayos que tengan datos
            if (ensayo.rows.length > 0) {
                ensayosConDatos.push({
                    ensayo_numero: parseInt(numEnsayo),
                    ensayo_nombre: `Ensayo ${numEnsayo}`,
                    registros: ensayo.rows.map(row => ({
                        id: parseInt(row.clam),
                        jarra: parseInt(row.jarra),
                        p1: parseFloat(row.p1),
                        p2: parseFloat(row.p2)
                    })),
                    total_registros: ensayo.rows.length
                });
            }
        }
        
        // Construcción del objeto siguiendo el orden del formulario
        const payload = {
            fecha: document.getElementById('reg_fecha').value,
            responsable: document.getElementById('reg_responsable').value,
            guia: document.getElementById('reg_guia_remision').value,
            variedad: document.getElementById('reg_variedad').value,
            placa: document.getElementById('reg_placa').value,
            hora_inicio: document.getElementById('reg_hora_inicio').value,
            dias_precosecha: document.getElementById('reg_dias_precosecha').value || null,
            tipo_medicion: tipoMedicion,
            // Agrupamos trazabilidad
            trazabilidad: {
                etapa: document.getElementById('reg_traz_etapa').value,
                campo: document.getElementById('reg_traz_campo').value,
                libre: document.getElementById('reg_traz_libre').value || null
            },
            // TODOS los ensayos con datos
            ensayos: ensayosConDatos,
            // Resumen
            resumen: {
                total_ensayos: ensayosConDatos.length,
                total_registros: ensayosConDatos.reduce((sum, e) => sum + e.total_registros, 0)
            }
        };

        // Para ver el orden REAL que recibirá el backend, lo pasamos por JSON.stringify
        console.log("JSON FINAL PARA BACKEND:");
        console.log(JSON.stringify(payload, null, 2));
        
        // Mensaje de éxito
        Swal.fire({
            title: '¡Registro Exitoso!',
            text: 'Los datos se han guardado correctamente.',
            icon: 'success',
            confirmButtonColor: '#2f7cc0',
            confirmButtonText: 'Entendido'
        });
    });
}
});