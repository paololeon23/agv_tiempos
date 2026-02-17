import { saveLocal, updateUI, getDatosPacking, getFechasConDatos } from './network.js';

document.addEventListener('DOMContentLoaded', () => {

    // ========================================
    // 0. FLAG PARA AVISO ANTES DE SALIR
    // ========================================
    window.formHasChanges = false;

    // ========================================
    // 1. INICIALIZACIÓN DE ICONOS
    // ========================================
    if (window.lucide) {
        lucide.createIcons();
    }

    // ========================================
    // 2. CONFIGURACIÓN DE DATOS (MAPAS)
    // ========================================
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

    // ========================================
    // 3. CARGA DINÁMICA DE SELECTS
    // ========================================
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

    // ========================================
    // 4. INTERFAZ DE USUARIO (SIDEBAR + VISTAS)
    // ========================================
    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.getElementById('menu-btn');
    const closeBtn = document.getElementById('close-btn');
    const cosechaForm = document.getElementById('cosecha-form');
    const historialView = document.getElementById('view-historial');
    const recomendacionesView = document.getElementById('view-recomendaciones');

    if (menuBtn && sidebar) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.add('active');
        });
    }

    if (closeBtn && sidebar) {
        closeBtn.addEventListener('click', () => {
            sidebar.classList.remove('active');
        });
    }

    document.addEventListener('click', (event) => {
        if (sidebar.classList.contains('active') && 
            !sidebar.contains(event.target) && 
            !menuBtn.contains(event.target)) {
            sidebar.classList.remove('active');
        }
    });

    // Cambio de vista (Nueva / Historial)
    function setActiveView(view) {
        const links = document.querySelectorAll('.nav-link');
        links.forEach(a => {
            const v = a.getAttribute('data-view');
            if (v === view) a.classList.add('active');
            else a.classList.remove('active');
        });

        if (cosechaForm) cosechaForm.style.display = (view === 'nueva') ? 'block' : 'none';
        if (historialView) historialView.style.display = (view === 'historial') ? 'block' : 'none';
        if (recomendacionesView) recomendacionesView.style.display = (view === 'recomendaciones') ? 'block' : 'none';
        if (view === 'historial') renderHistorial();
    }

    document.querySelectorAll('.nav-link').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            const view = a.getAttribute('data-view');
            if (view) setActiveView(view);
        });
    });

    // ========================================
    // 5. VALIDACIONES DE ENTRADA
    // ========================================
    const trazLibre = document.getElementById('reg_traz_libre');
    if (trazLibre) {
        trazLibre.addEventListener('input', function() {
            this.value = this.value.toUpperCase();
        });
    }

    // Fecha actual por defecto
    const campoFecha = document.getElementById('reg_fecha');
    if (campoFecha) {
        campoFecha.value = new Date().toISOString().split('T')[0];
    }

    // ========================================
    // 6. MANEJO DEL FORMULARIO (SUBMIT / CAMBIOS)
    // ========================================
    if (cosechaForm) {
        // Nunca hacemos submit tradicional, todo va por JS
        cosechaForm.addEventListener('submit', (e) => {
            e.preventDefault();
        });

        // Cualquier cambio en el formulario marca que hay datos sin guardar
        cosechaForm.addEventListener('input', () => {
            window.formHasChanges = true;
        });
        cosechaForm.addEventListener('change', () => {
            window.formHasChanges = true;
        });
    }

    // ========================================
    // 7. HISTORIAL - RENDER
    // ========================================
    function renderHistorial() {
        const contenedor = document.getElementById('historial-list');
        if (!contenedor) return;

        const items = JSON.parse(localStorage.getItem('tiempos_agro_seguro_v1')) || [];
        contenedor.innerHTML = '';

        if (items.length === 0) {
            contenedor.innerHTML = '<div class="empty-state"><p>No hay registros en el historial.</p></div>';
            return;
        }

        const gruposPorFecha = {};
        items.forEach(item => {
            const rows = item.rows || [];
            if (!rows.length) return;
            const fecha = rows[0][0] || (item.timestamp || '').split(' ')[0];
            if (!gruposPorFecha[fecha]) gruposPorFecha[fecha] = [];
            gruposPorFecha[fecha].push(item);
        });

        const fechasOrdenadas = Object.keys(gruposPorFecha).sort((a, b) => b.localeCompare(a));
        const filasTabla = [];

        fechasOrdenadas.forEach(fecha => {
            const itemsDeDia = gruposPorFecha[fecha];
            const ensayosMap = {};
            itemsDeDia.forEach(item => {
                const estado = item.status === 'subido' ? 'subido' : 'pendiente';
                (item.rows || []).forEach(row => {
                    const ensayoNum = row[10];
                    const ensayoNom = row[11] || ('Ensayo ' + ensayoNum);
                    const clave = `${ensayoNum}|${ensayoNom}`;
                    if (!ensayosMap[clave]) {
                        ensayosMap[clave] = { ensayoNum, ensayoNom, totalClamshells: 0, estados: new Set() };
                    }
                    ensayosMap[clave].totalClamshells += 1;
                    ensayosMap[clave].estados.add(estado);
                });
            });

            Object.values(ensayosMap).forEach(info => {
                const estadoFinal = info.estados.has('pendiente') ? 'pendiente' : 'subido';
                const claseEstado = estadoFinal === 'pendiente' ? 'hist-status-pendiente' : 'hist-status-subido';
                const textoEstado = estadoFinal === 'pendiente' ? 'Pendiente' : 'Subido';
                filasTabla.push({
                    fecha,
                    ensayo: info.ensayoNom || ('Ensayo ' + info.ensayoNum),
                    clamshells: info.totalClamshells,
                    estado: textoEstado,
                    claseEstado
                });
            });
        });

        const thead = `
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Ensayo</th>
                    <th>Clamshells</th>
                    <th>Estado</th>
                </tr>
            </thead>`;
        const tbody = '<tbody>' + filasTabla.map(f => `
            <tr>
                <td>${f.fecha}</td>
                <td>${f.ensayo}</td>
                <td>${f.clamshells}</td>
                <td><span class="hist-status-badge ${f.claseEstado}">${f.estado}</span></td>
            </tr>
        `).join('') + '</tbody>';

        const table = document.createElement('div');
        table.className = 'historial-table-wrapper';
        table.innerHTML = `
            <table class="historial-table">
                ${thead}
                ${tbody}
            </table>`;
        contenedor.appendChild(table);
    }

    window.addEventListener('tiemposStorageUpdated', () => {
        const v = document.getElementById('view-historial');
        if (v && v.style.display !== 'none') renderHistorial();
    });

    // ========================================
    // 8. SISTEMA DE MEDICIÓN - CONFIGURACIÓN
    // ========================================
    
    const selectMedicion = document.getElementById('tipo_medicion');
    const selectRotulo = document.getElementById('reg_rotulo_ensayo');
    
    const wrappers = {
        visual: document.getElementById('wrapper_visual'),
        jarras: document.getElementById('wrapper_jarras'),
        temperaturas: document.getElementById('wrapper_temperaturas'),
        tiempos: document.getElementById('wrapper_tiempos'),
        humedad: document.getElementById('wrapper_humedad'),
        presionambiente: document.getElementById('wrapper_presionambiente'),
        presionfruta: document.getElementById('wrapper_presionfruta'),
        observacion: document.getElementById('wrapper_observacion')
    };
    const viewVisualContainer = document.getElementById('view_visual_container');
    const viewPackingContainer = document.getElementById('view_packing_container');
    const btnGuardarRegistro = document.getElementById('btn-guardar-registro');

    // Almacenamiento de datos por ensayo y tipo
    const datosEnsayos = {
        visual: {
            1: { visual: [], jarras: [], temperaturas: [], tiempos: [], humedad: [], presionambiente: [], presionfruta: [], observacion: [] },
            2: { visual: [], jarras: [], temperaturas: [], tiempos: [], humedad: [], presionambiente: [], presionfruta: [], observacion: [] },
            3: { visual: [], jarras: [], temperaturas: [], tiempos: [], humedad: [], presionambiente: [], presionfruta: [], observacion: [] },
            4: { visual: [], jarras: [], temperaturas: [], tiempos: [], humedad: [], presionambiente: [], presionfruta: [], observacion: [] }
        },
        packing: {
            1: { packing: [] },
            2: { packing: [] },
            3: { packing: [] },
            4: { packing: [] }
        }
    };

    let tipoActual = '';
    let ensayoActual = '';

    // ========================================
    // HELPERS DE VALIDACIÓN
    // ========================================
    function esNumeroPositivoEntero(val) {
        if (val === '' || val == null) return false;
        const n = Number(val);
        return Number.isInteger(n) && n > 0;
    }
    function esNumeroNoNegativo(val) {
        if (val === '' || val == null) return false;
        const n = Number(val);
        return !Number.isNaN(n) && n >= 0 && /^\d*\.?\d*$/.test(String(val).trim());
    }
    function tiempoEnMinutos(t) {
        if (!t || typeof t !== 'string') return -1;
        const [h, m] = t.trim().split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) return -1;
        return h * 60 + m;
    }
    function tiempoMenorOIgual(t1, t2) {
        return tiempoEnMinutos(t1) <= tiempoEnMinutos(t2);
    }
    function tieneDatosSinGuardar() {
        const ids = {
            visual: ['reg_visual_n_jarra', 'reg_visual_peso_1', 'reg_visual_peso_2', 'reg_visual_llegada_acopio', 'reg_visual_despacho_acopio'],
            jarras: ['reg_jarras_n_jarra', 'reg_jarras_inicio', 'reg_jarras_termino'],
            tiempos: ['reg_tiempos_inicio_c', 'reg_tiempos_perdida_peso', 'reg_tiempos_termino_c', 'reg_tiempos_llegada_acopio', 'reg_tiempos_despacho_acopio'],
            temperaturas: ['reg_temp_inicio_amb', 'reg_temp_inicio_pul', 'reg_temp_termino_amb', 'reg_temp_termino_pul', 'reg_temp_llegada_amb', 'reg_temp_llegada_pul', 'reg_temp_despacho_amb', 'reg_temp_despacho_pul'],
            humedad: ['reg_humedad_inicio', 'reg_humedad_termino', 'reg_humedad_llegada', 'reg_humedad_despacho'],
            presionambiente: ['reg_presion_amb_inicio', 'reg_presion_amb_termino', 'reg_presion_amb_llegada', 'reg_presion_amb_despacho'],
            presionfruta: ['reg_presion_fruta_inicio', 'reg_presion_fruta_termino', 'reg_presion_fruta_llegada', 'reg_presion_fruta_despacho'],
            observacion: ['reg_observacion_texto']
        };
        for (const [seccion, arr] of Object.entries(ids)) {
            const algunoLleno = arr.some(id => {
                const el = document.getElementById(id);
                return el && String(el.value || '').trim() !== '';
            });
            if (algunoLleno) return true;
        }
        return false;
    }

    // ========================================
    // CAMBIO DE TIPO DE MEDICIÓN
    // ========================================
    if (selectMedicion) {
        selectMedicion.addEventListener('change', async function() {
            const newTipo = this.value;
            if (tieneDatosSinGuardar()) {
                const result = await Swal.fire({
                    title: '¿Descartar datos?',
                    text: 'Tienes datos en la fila actual sin haber pulsado "Añadir". ¿Seguro que no quieres guardar esta fila?',
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, descartar',
                    cancelButtonText: 'No, quedarme',
                    confirmButtonColor: '#d33',
                    cancelButtonColor: '#3085d6'
                });
                if (!result.isConfirmed) {
                    this.value = tipoActual;
                    return;
                }
            }
            tipoActual = newTipo;
            
            if (this.value === 'visual') {
                if (viewVisualContainer) viewVisualContainer.style.display = 'block';
                if (viewPackingContainer) viewPackingContainer.style.display = 'none';
                if (btnGuardarRegistro) btnGuardarRegistro.style.display = 'block';
                wrappers.visual.style.display = 'block';
                wrappers.jarras.style.display = 'block';
                wrappers.temperaturas.style.display = 'block';
                wrappers.tiempos.style.display = 'block';
                wrappers.humedad.style.display = 'block';
                wrappers.presionambiente.style.display = 'block';
                wrappers.presionfruta.style.display = 'block';
                wrappers.observacion.style.display = 'block';
            } else if (this.value === 'packing') {
                if (viewVisualContainer) viewVisualContainer.style.display = 'none';
                if (viewPackingContainer) viewPackingContainer.style.display = 'block';
                if (btnGuardarRegistro) btnGuardarRegistro.style.display = 'none';
                wrappers.visual.style.display = 'none';
                wrappers.jarras.style.display = 'none';
                wrappers.temperaturas.style.display = 'none';
                wrappers.tiempos.style.display = 'none';
                wrappers.humedad.style.display = 'none';
                wrappers.presionambiente.style.display = 'none';
                wrappers.presionfruta.style.display = 'none';
                wrappers.observacion.style.display = 'none';
                cargarFechasPacking();
            }
            
            if (ensayoActual) {
                restaurarDatosEnsayo(tipoActual, ensayoActual);
            }
        });
    }

    // ========================================
    // CAMBIO DE ENSAYO
    // ========================================
    if (selectRotulo) {
        selectRotulo.addEventListener('change', async function() {
            const newEnsayo = this.value;
            if (tieneDatosSinGuardar()) {
                const result = await Swal.fire({
                    title: '¿Descartar datos?',
                    text: 'Tienes datos en la fila actual sin haber pulsado "Añadir". ¿Seguro que no quieres guardar esta fila?',
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, descartar',
                    cancelButtonText: 'No, quedarme',
                    confirmButtonColor: '#d33',
                    cancelButtonColor: '#3085d6'
                });
                if (!result.isConfirmed) {
                    this.value = ensayoActual;
                    return;
                }
            }
            ensayoActual = newEnsayo;
            
            if (tipoActual) {
                restaurarDatosEnsayo(tipoActual, ensayoActual);
            }
        });
    }

    // ========================================
    // PACKING: fechas y ensayos con datos (solo opciones que tienen data)
    // ========================================
    function formatearFechaParaVer(yyyyMmDd) {
        if (!yyyyMmDd || typeof yyyyMmDd !== 'string') return yyyyMmDd || '';
        var parts = yyyyMmDd.trim().split('-');
        if (parts.length !== 3) return yyyyMmDd;
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }

    async function cargarFechasPacking() {
        const inputFecha = document.getElementById('view_fecha');
        const txtFechasConDatos = document.getElementById('view_fechas_con_datos');
        const selEnsayo = document.getElementById('view_ensayo_nombre');
        if (!inputFecha || !selEnsayo) return;
        if (inputFecha.value) inputFecha.value = '';
        selEnsayo.value = '';
        if (txtFechasConDatos) txtFechasConDatos.textContent = '';
        try {
            const res = await getFechasConDatos();
            if (res.ok && res.fechas && res.fechas.length > 0) {
                var list = res.fechas.map(formatearFechaParaVer).join(', ');
                if (txtFechasConDatos) txtFechasConDatos.textContent = 'Fechas con datos: ' + list;
                if (res.fromCache) Swal.fire({ title: 'Datos guardados', text: 'Usando última data (sin conexión).', icon: 'info', timer: 2000, showConfirmButton: false });
            } else {
                if (txtFechasConDatos) txtFechasConDatos.textContent = res.error ? res.error : 'Sin fechas con datos.';
                if (!res.ok && res.error) Swal.fire({ title: 'Aviso', text: res.error, icon: 'info' });
            }
        } catch (err) {
            var msg = err.message || 'No se pudieron cargar las fechas.';
            if (txtFechasConDatos) txtFechasConDatos.textContent = msg + ' En Netlify, desactiva "Prevención de seguimiento" para esta página.';
            Swal.fire({ title: 'Error', text: msg, icon: 'error' });
        }
    }

    const btnCargarDatos = document.getElementById('btn_cargar_datos');
    const viewEnsayosStatus = document.getElementById('view_ensayos_status');
    if (btnCargarDatos) {
        btnCargarDatos.addEventListener('click', async function () {
            const fechaEl = document.getElementById('view_fecha');
            const ensayoEl = document.getElementById('view_ensayo_nombre');
            const fecha = fechaEl && fechaEl.value ? fechaEl.value.trim() : '';
            const ensayoNumero = ensayoEl && ensayoEl.value ? ensayoEl.value.trim() : '';
            if (!fecha || !ensayoNumero) {
                Swal.fire({ title: 'Faltan datos', text: 'Elige fecha y ensayo (1 a 4) para cargar.', icon: 'warning' });
                return;
            }
            if (viewEnsayosStatus) viewEnsayosStatus.textContent = 'Cargando...';
            try {
                const res = await getDatosPacking(fecha, ensayoNumero);
                if (!res.ok || !res.data) {
                    if (viewEnsayosStatus) viewEnsayosStatus.textContent = res.error || 'No hay registro para esa fecha y ensayo.';
                    Swal.fire({ title: 'Sin datos', text: res.error || 'No hay registro para esa fecha y ensayo.', icon: 'info' });
                    return;
                }
                const d = res.data;
                const set = function (id, val) { const el = document.getElementById(id); if (el) el.value = (val != null && val !== '') ? String(val) : ''; };
                set('view_etapa', d.TRAZ_ETAPA);
                set('view_campo', d.TRAZ_CAMPO);
                set('view_turno', d.TRAZ_LIBRE);
                set('view_variedad', d.VARIEDAD);
                set('view_placa', d.PLACA_VEHICULO);
                set('view_guia_despacho', d.GUIA_REMISION);
                set('view_rotulo', d.ENSAYO_NUMERO);
                if (viewEnsayosStatus) viewEnsayosStatus.textContent = '';
                Swal.fire({ title: res.fromCache ? 'Datos cargados (caché)' : 'Datos cargados', icon: 'success', timer: 1500, showConfirmButton: false });
            } catch (err) {
                if (viewEnsayosStatus) viewEnsayosStatus.textContent = err.message || 'Error al cargar.';
                Swal.fire({ title: 'Error', text: err.message || 'No se pudo cargar.', icon: 'error' });
            }
        });
    }

    // Sincronizar vista al cargar (visual por defecto si no es packing)
    (function syncVistaInicial() {
        const v = selectMedicion ? selectMedicion.value : '';
        if (v === 'packing') {
            if (viewVisualContainer) viewVisualContainer.style.display = 'none';
            if (viewPackingContainer) viewPackingContainer.style.display = 'block';
            if (btnGuardarRegistro) btnGuardarRegistro.style.display = 'none';
            cargarFechasPacking();
        } else {
            if (viewVisualContainer) viewVisualContainer.style.display = 'block';
            if (viewPackingContainer) viewPackingContainer.style.display = 'none';
            if (btnGuardarRegistro) btnGuardarRegistro.style.display = 'block';
        }
    })();

    // ========================================
    // RESTAURAR DATOS DEL ENSAYO
    // ========================================
    function restaurarDatosEnsayo(tipo, ensayo) {
        if (tipo === 'visual') {
            const datos = datosEnsayos.visual[ensayo];
            
            const tbodyVisual = document.getElementById('tbody-visual');
            if (tbodyVisual) {
                tbodyVisual.innerHTML = '';
                datos.visual.forEach((item, index) => {
                    agregarFilaVisual(item, tbodyVisual, index + 1);
                });
                actualizarContador('next_clam_visual', datos.visual.length);
            }
            
            const tbodyJarras = document.getElementById('tbody-jarras');
            if (tbodyJarras) {
                tbodyJarras.innerHTML = '';
                datos.jarras.forEach((item, index) => {
                    agregarFilaJarras(item, tbodyJarras, index + 1);
                });
                actualizarContador('next_row_jarras', datos.jarras.length);
            }
            
            const tbodyTemp = document.getElementById('tbody-temperaturas');
            if (tbodyTemp) {
                tbodyTemp.innerHTML = '';
                datos.temperaturas.forEach((item, index) => {
                    agregarFilaTemperaturas(item, tbodyTemp, index + 1);
                });
                actualizarContador('next_clam_temp', datos.temperaturas.length);
            }
            
            const tbodyTiempos = document.getElementById('tbody-tiempos');
            if (tbodyTiempos) {
                tbodyTiempos.innerHTML = '';
                datos.tiempos.forEach((item, index) => {
                    agregarFilaTiempos(item, tbodyTiempos, index + 1);
                });
                actualizarContador('next_clam_tiempos', datos.tiempos.length);
            }
            
            const tbodyHumedad = document.getElementById('tbody-humedad');
            if (tbodyHumedad) {
                tbodyHumedad.innerHTML = '';
                datos.humedad.forEach((item, index) => {
                    agregarFilaHumedad(item, tbodyHumedad, index + 1);
                });
                actualizarContador('next_clam_humedad', datos.humedad.length);
            }
            
            const tbodyPresion = document.getElementById('tbody-presion');
            if (tbodyPresion) {
                tbodyPresion.innerHTML = '';
                datos.presionambiente.forEach((item, index) => {
                    agregarFilaPresionAmbiente(item, tbodyPresion, index + 1);
                });
                actualizarContador('next_clam_presion', datos.presionambiente.length);
            }
            
            const tbodyPresionFruta = document.getElementById('tbody-presion-fruta');
            if (tbodyPresionFruta) {
                tbodyPresionFruta.innerHTML = '';
                datos.presionfruta.forEach((item, index) => {
                    agregarFilaPresionFruta(item, tbodyPresionFruta, index + 1);
                });
                actualizarContador('next_clam_presion_fruta', datos.presionfruta.length);
            }
            
            const tbodyObs = document.getElementById('tbody-observacion');
            if (tbodyObs) {
                tbodyObs.innerHTML = '';
                datos.observacion.forEach((item, index) => {
                    agregarFilaObservacion(item, tbodyObs, index + 1);
                });
                actualizarContador('next_clam_obs', datos.observacion.length);
            }
            
            abrirCollapsible('body-visual');
            abrirCollapsible('body-jarras');
        }
    }

    // ========================================
    // ACTUALIZAR CONTADOR
    // ========================================
    function actualizarContador(contadorId, valor) {
        const contador = document.getElementById(contadorId);
        if (contador) {
            contador.textContent = valor + 1;
        }
    }

    // ========================================
    // CALCULAR TIEMPO EMPLEADO
    // ========================================
    function calcularTiempoEmpleado(inicio, termino) {
        if (!inicio || !termino) return "0'";
        
        const [h1, m1] = inicio.split(':').map(Number);
        const [h2, m2] = termino.split(':').map(Number);
        
        const minutos1 = h1 * 60 + m1;
        const minutos2 = h2 * 60 + m2;
        
        let diferencia = minutos2 - minutos1;
        if (diferencia < 0) diferencia += 24 * 60;
        
        return `${diferencia}'`;
    }

    // ========================================
    // AGREGAR FILA - VISUAL (PESOS)
    // ========================================
    function agregarFilaVisual(data, tbody, clamNum) {
        const row = document.createElement('tr');
        row.setAttribute('data-clam', clamNum);
        row.setAttribute('data-jarra', data.jarra);
        row.setAttribute('data-p1', data.p1);
        row.setAttribute('data-p2', data.p2);
        row.setAttribute('data-llegada', data.llegada);
        row.setAttribute('data-despacho', data.despacho);

        row.innerHTML = `
            <td class="clam-id">${clamNum}</td>
            <td>${data.jarra}</td>
            <td>${data.p1}g</td>
            <td>${data.p2}g</td>
            <td>${data.llegada}g</td>
            <td>${data.despacho}g</td>
            <td>
                <button type="button" class="btn-edit-row" title="Editar">
                    <i data-lucide="pencil"></i>
                </button>
                <button type="button" class="btn-delete-row" title="Eliminar">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        `;

        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();

        row.querySelector('.btn-edit-row').addEventListener('click', () => {
            editarFilaVisual(clamNum, data);
        });

        row.querySelector('.btn-delete-row').addEventListener('click', () => {
            eliminarFila('visual', clamNum);
        });
    }

    // ========================================
    // AGREGAR FILA - JARRAS
    // ========================================
    function agregarFilaJarras(data, tbody, rowNum) {
        const row = document.createElement('tr');
        row.setAttribute('data-row', rowNum);
        row.setAttribute('data-jarra', data.jarra);
        row.setAttribute('data-tipo', data.tipo);
        row.setAttribute('data-inicio', data.inicio);
        row.setAttribute('data-termino', data.termino);
        row.setAttribute('data-tiempo', data.tiempo);

        row.innerHTML = `
            <td class="row-id">${rowNum}</td>
            <td>${data.jarra}</td>
            <td>${data.tipo}</td>
            <td>${data.inicio}</td>
            <td>${data.termino}</td>
            <td>${data.tiempo}</td>
            <td>
                <button type="button" class="btn-edit-row" title="Editar">
                    <i data-lucide="pencil"></i>
                </button>
                <button type="button" class="btn-delete-row" title="Eliminar">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        `;

        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();

        row.querySelector('.btn-edit-row').addEventListener('click', () => {
            editarFilaJarras(rowNum, data);
        });

        row.querySelector('.btn-delete-row').addEventListener('click', () => {
            eliminarFila('jarras', rowNum);
        });
    }

    // ========================================
    // AGREGAR FILA - TEMPERATURAS
    // ========================================
    function agregarFilaTemperaturas(data, tbody, clamNum) {
        const row = document.createElement('tr');
        row.setAttribute('data-clam', clamNum);
        row.setAttribute('data-inicio-amb', data.inicio_amb || '');
        row.setAttribute('data-inicio-pul', data.inicio_pul || '');
        row.setAttribute('data-termino-amb', data.termino_amb || '');
        row.setAttribute('data-termino-pul', data.termino_pul || '');
        row.setAttribute('data-llegada-amb', data.llegada_amb || '');
        row.setAttribute('data-llegada-pul', data.llegada_pul || '');
        row.setAttribute('data-despacho-amb', data.despacho_amb || '');
        row.setAttribute('data-despacho-pul', data.despacho_pul || '');

        row.innerHTML = `
            <td class="clam-id">${clamNum}</td>
            <td>${data.inicio_amb || '-'}°C</td>
            <td>${data.inicio_pul || '-'}°C</td>
            <td>${data.termino_amb || '-'}°C</td>
            <td>${data.termino_pul || '-'}°C</td>
            <td>${data.llegada_amb || '-'}°C</td>
            <td>${data.llegada_pul || '-'}°C</td>
            <td>${data.despacho_amb || '-'}°C</td>
            <td>${data.despacho_pul || '-'}°C</td>
            <td>
                <button type="button" class="btn-edit-row" title="Editar">
                    <i data-lucide="pencil"></i>
                </button>
                <button type="button" class="btn-delete-row" title="Eliminar">
                    <i data-lucide="trash-2"></i>
                </button>
                <button type="button" class="btn-replicate-row" title="Replicar">
                    <i data-lucide="copy"></i>
                </button>
            </td>
        `;

        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();

        row.querySelector('.btn-edit-row').addEventListener('click', () => {
            editarFilaTemperaturas(clamNum, data);
        });

        row.querySelector('.btn-delete-row').addEventListener('click', () => {
            eliminarFila('temperaturas', clamNum);
        });

        row.querySelector('.btn-replicate-row').addEventListener('click', () => {
            replicarFila('temperaturas', data);
        });
    }

    // ========================================
    // AGREGAR FILA - TIEMPOS
    // ========================================
    function agregarFilaTiempos(data, tbody, clamNum) {
        const row = document.createElement('tr');
        row.setAttribute('data-clam', clamNum);
        row.setAttribute('data-inicio', data.inicio || '');
        row.setAttribute('data-perdida', data.perdida || '');
        row.setAttribute('data-termino', data.termino || '');
        row.setAttribute('data-llegada', data.llegada || '');
        row.setAttribute('data-despacho', data.despacho || '');

        row.innerHTML = `
            <td class="clam-id">${clamNum}</td>
            <td>${data.inicio || '-'}</td>
            <td>${data.perdida || '-'}</td>
            <td>${data.termino || '-'}</td>
            <td>${data.llegada || '-'}</td>
            <td>${data.despacho || '-'}</td>
            <td>
                <button type="button" class="btn-edit-row" title="Editar">
                    <i data-lucide="pencil"></i>
                </button>
                <button type="button" class="btn-delete-row" title="Eliminar">
                    <i data-lucide="trash-2"></i>
                </button>
                <button type="button" class="btn-replicate-row" title="Replicar">
                    <i data-lucide="copy"></i>
                </button>
            </td>
        `;

        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();

        row.querySelector('.btn-edit-row').addEventListener('click', () => {
            editarFilaTiempos(clamNum, data);
        });

        row.querySelector('.btn-delete-row').addEventListener('click', () => {
            eliminarFila('tiempos', clamNum);
        });

        row.querySelector('.btn-replicate-row').addEventListener('click', () => {
            replicarFila('tiempos', data);
        });
    }

    // ========================================
    // AGREGAR FILA - HUMEDAD
    // ========================================
    function agregarFilaHumedad(data, tbody, clamNum) {
        const row = document.createElement('tr');
        row.setAttribute('data-clam', clamNum);
        row.setAttribute('data-inicio', data.inicio || '');
        row.setAttribute('data-termino', data.termino || '');
        row.setAttribute('data-llegada', data.llegada || '');
        row.setAttribute('data-despacho', data.despacho || '');

        row.innerHTML = `
            <td class="clam-id">${clamNum}</td>
            <td>${data.inicio || '-'}%</td>
            <td>${data.termino || '-'}%</td>
            <td>${data.llegada || '-'}%</td>
            <td>${data.despacho || '-'}%</td>
            <td>
                <button type="button" class="btn-edit-row" title="Editar">
                    <i data-lucide="pencil"></i>
                </button>
                <button type="button" class="btn-delete-row" title="Eliminar">
                    <i data-lucide="trash-2"></i>
                </button>
                <button type="button" class="btn-replicate-row" title="Replicar">
                    <i data-lucide="copy"></i>
                </button>
            </td>
        `;

        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();

        row.querySelector('.btn-edit-row').addEventListener('click', () => {
            editarFilaHumedad(clamNum, data);
        });

        row.querySelector('.btn-delete-row').addEventListener('click', () => {
            eliminarFila('humedad', clamNum);
        });

        row.querySelector('.btn-replicate-row').addEventListener('click', () => {
            replicarFila('humedad', data);
        });
    }

    // ========================================
    // AGREGAR FILA - PRESIÓN AMBIENTE
    // ========================================
    function agregarFilaPresionAmbiente(data, tbody, clamNum) {
        const row = document.createElement('tr');
        row.setAttribute('data-clam', clamNum);
        row.setAttribute('data-inicio', data.inicio || '');
        row.setAttribute('data-termino', data.termino || '');
        row.setAttribute('data-llegada', data.llegada || '');
        row.setAttribute('data-despacho', data.despacho || '');

        row.innerHTML = `
            <td class="clam-id">${clamNum}</td>
            <td>${data.inicio || '-'} kPa</td>
            <td>${data.termino || '-'} kPa</td>
            <td>${data.llegada || '-'} kPa</td>
            <td>${data.despacho || '-'} kPa</td>
            <td>
                <button type="button" class="btn-edit-row" title="Editar">
                    <i data-lucide="pencil"></i>
                </button>
                <button type="button" class="btn-delete-row" title="Eliminar">
                    <i data-lucide="trash-2"></i>
                </button>
                <button type="button" class="btn-replicate-row" title="Replicar">
                    <i data-lucide="copy"></i>
                </button>
            </td>
        `;

        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();

        row.querySelector('.btn-edit-row').addEventListener('click', () => {
            editarFilaPresionAmbiente(clamNum, data);
        });

        row.querySelector('.btn-delete-row').addEventListener('click', () => {
            eliminarFila('presionambiente', clamNum);
        });

        row.querySelector('.btn-replicate-row').addEventListener('click', () => {
            replicarFila('presionambiente', data);
        });
    }

    // ========================================
    // AGREGAR FILA - PRESIÓN FRUTA
    // ========================================
    function agregarFilaPresionFruta(data, tbody, clamNum) {
        const row = document.createElement('tr');
        row.setAttribute('data-clam', clamNum);
        row.setAttribute('data-inicio', data.inicio || '');
        row.setAttribute('data-termino', data.termino || '');
        row.setAttribute('data-llegada', data.llegada || '');
        row.setAttribute('data-despacho', data.despacho || '');

        row.innerHTML = `
            <td class="clam-id">${clamNum}</td>
            <td>${data.inicio || '-'} kPa</td>
            <td>${data.termino || '-'} kPa</td>
            <td>${data.llegada || '-'} kPa</td>
            <td>${data.despacho || '-'} kPa</td>
            <td>
                <button type="button" class="btn-edit-row" title="Editar">
                    <i data-lucide="pencil"></i>
                </button>
                <button type="button" class="btn-delete-row" title="Eliminar">
                    <i data-lucide="trash-2"></i>
                </button>
                <button type="button" class="btn-replicate-row" title="Replicar">
                    <i data-lucide="copy"></i>
                </button>
            </td>
        `;

        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();

        row.querySelector('.btn-edit-row').addEventListener('click', () => {
            editarFilaPresionFruta(clamNum, data);
        });

        row.querySelector('.btn-delete-row').addEventListener('click', () => {
            eliminarFila('presionfruta', clamNum);
        });

        row.querySelector('.btn-replicate-row').addEventListener('click', () => {
            replicarFila('presionfruta', data);
        });
    }

    // ========================================
    // AGREGAR FILA - OBSERVACIÓN
    // ========================================
    function agregarFilaObservacion(data, tbody, clamNum) {
        const row = document.createElement('tr');
        row.setAttribute('data-clam', clamNum);
        row.setAttribute('data-obs', data.observacion || '');

        row.innerHTML = `
            <td class="clam-id">${clamNum}</td>
            <td>${data.observacion || '-'}</td>
            <td>
                <button type="button" class="btn-edit-row" title="Editar">
                    <i data-lucide="pencil"></i>
                </button>
                <button type="button" class="btn-delete-row" title="Eliminar">
                    <i data-lucide="trash-2"></i>
                </button>
                <button type="button" class="btn-replicate-row" title="Replicar">
                    <i data-lucide="copy"></i>
                </button>
            </td>
        `;

        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();

        row.querySelector('.btn-edit-row').addEventListener('click', () => {
            editarFilaObservacion(clamNum, data);
        });

        row.querySelector('.btn-delete-row').addEventListener('click', () => {
            eliminarFila('observacion', clamNum);
        });

        row.querySelector('.btn-replicate-row').addEventListener('click', () => {
            replicarFila('observacion', data);
        });
    }

    // ========================================
    // EDITAR FILA - VISUAL
    // ========================================
    function editarFilaVisual(clamNum, dataActual) {
        Swal.fire({
            title: `Editar Registro #${clamNum}`,
            html: `
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">N° Jarra:</label>
                        <input type="number" id="edit_jarra" class="swal2-input" value="${dataActual.jarra}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Peso 1 (g):</label>
                        <input type="number" id="edit_p1" class="swal2-input" step="0.1" value="${dataActual.p1}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Peso 2 (g):</label>
                        <input type="number" id="edit_p2" class="swal2-input" step="0.1" value="${dataActual.p2}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Llegada Acopio (g):</label>
                        <input type="number" id="edit_llegada" class="swal2-input" step="0.1" value="${dataActual.llegada}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Despacho Acopio (g):</label>
                        <input type="number" id="edit_despacho" class="swal2-input" step="0.1" value="${dataActual.despacho}" style="width: 90%; margin: 0;">
                    </div>
                </div>
            `,
            confirmButtonText: 'Guardar',
            confirmButtonColor: '#2f7cc0',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const jarra = String(document.getElementById('edit_jarra').value || '').trim();
                const p1 = document.getElementById('edit_p1').value;
                const p2 = document.getElementById('edit_p2').value;
                const llegada = document.getElementById('edit_llegada').value;
                const despacho = document.getElementById('edit_despacho').value;
                if (jarra !== '' && !esNumeroPositivoEntero(jarra)) {
                    Swal.showValidationMessage('N° Jarra debe ser un número entero positivo.');
                    return undefined;
                }
                if (p1 !== '' && p2 !== '') {
                    const n1 = Number(p1), n2 = Number(p2);
                    if (Number.isNaN(n2) || n2 > n1) {
                        Swal.showValidationMessage('Peso 2 debe ser menor o igual que Peso 1.');
                        return undefined;
                    }
                }
                if (llegada !== '' && despacho !== '') {
                    const nL = Number(llegada), nD = Number(despacho);
                    if (Number.isNaN(nD) || nD > nL) {
                        Swal.showValidationMessage('Despacho acopio debe ser ≤ Llegada acopio.');
                        return undefined;
                    }
                }
                return { jarra, p1, p2, llegada, despacho };
            }
        }).then((result) => {
            if (result.isConfirmed) {
                const { jarra, p1, p2, llegada, despacho } = result.value;
                datosEnsayos[tipoActual][ensayoActual].visual[clamNum - 1] = { jarra, p1, p2, llegada, despacho };
                restaurarDatosEnsayo(tipoActual, ensayoActual);
                
                Swal.fire({
                    title: 'Actualizado',
                    text: 'Registro actualizado correctamente',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
            }
        });
    }

    // ========================================
    // EDITAR FILA - JARRAS
    // ========================================
    function editarFilaJarras(rowNum, dataActual) {
        Swal.fire({
            title: `Editar Jarra #${rowNum}`,
            html: `
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">N° Jarra:</label>
                        <input type="number" id="edit_jarra" class="swal2-input" value="${dataActual.jarra}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Tipo:</label>
                        <select id="edit_tipo" class="swal2-input" style="width: 90%; margin: 0;">
                            <option value="C" ${dataActual.tipo === 'C' ? 'selected' : ''}>Cosecha</option>
                            <option value="T" ${dataActual.tipo === 'T' ? 'selected' : ''}>Traslado</option>
                        </select>
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Hora Inicio:</label>
                        <input type="time" id="edit_inicio" class="swal2-input" value="${dataActual.inicio}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Hora Término:</label>
                        <input type="time" id="edit_termino" class="swal2-input" value="${dataActual.termino}" style="width: 90%; margin: 0;">
                    </div>
                </div>
            `,
            confirmButtonText: 'Guardar',
            confirmButtonColor: '#2f7cc0',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const jarra = String(document.getElementById('edit_jarra').value || '').trim();
                const tipo = document.getElementById('edit_tipo').value;
                const inicio = document.getElementById('edit_inicio').value;
                const termino = document.getElementById('edit_termino').value;
                if (!esNumeroPositivoEntero(jarra)) {
                    Swal.showValidationMessage('N° Jarra debe ser un número entero positivo.');
                    return undefined;
                }
                if (inicio && termino && !tiempoMenorOIgual(inicio, termino)) {
                    Swal.showValidationMessage('La hora de término debe ser mayor o igual que la de inicio.');
                    return undefined;
                }
                const tiempo = calcularTiempoEmpleado(inicio, termino);
                return { jarra, tipo, inicio, termino, tiempo };
            }
        }).then((result) => {
            if (result.isConfirmed) {
                const { jarra, tipo, inicio, termino, tiempo } = result.value;
                datosEnsayos[tipoActual][ensayoActual].jarras[rowNum - 1] = { jarra, tipo, inicio, termino, tiempo };
                restaurarDatosEnsayo(tipoActual, ensayoActual);
                
                Swal.fire({
                    title: 'Actualizado',
                    text: 'Jarra actualizada correctamente',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
            }
        });
    }

    // ========================================
    // EDITAR FILA - TEMPERATURAS
    // ========================================
    function editarFilaTemperaturas(clamNum, dataActual) {
        Swal.fire({
            title: `Editar Temperaturas #${clamNum}`,
            html: `
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Inicio - Ambiente (°C):</label>
                        <input type="number" id="edit_inicio_amb" class="swal2-input" step="0.1" value="${dataActual.inicio_amb || ''}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Inicio - Pulpa (°C):</label>
                        <input type="number" id="edit_inicio_pul" class="swal2-input" step="0.1" value="${dataActual.inicio_pul || ''}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Término - Ambiente (°C):</label>
                        <input type="number" id="edit_termino_amb" class="swal2-input" step="0.1" value="${dataActual.termino_amb || ''}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Término - Pulpa (°C):</label>
                        <input type="number" id="edit_termino_pul" class="swal2-input" step="0.1" value="${dataActual.termino_pul || ''}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Llegada - Ambiente (°C):</label>
                        <input type="number" id="edit_llegada_amb" class="swal2-input" step="0.1" value="${dataActual.llegada_amb || ''}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Llegada - Pulpa (°C):</label>
                        <input type="number" id="edit_llegada_pul" class="swal2-input" step="0.1" value="${dataActual.llegada_pul || ''}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Despacho - Ambiente (°C):</label>
                        <input type="number" id="edit_despacho_amb" class="swal2-input" step="0.1" value="${dataActual.despacho_amb || ''}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Despacho - Pulpa (°C):</label>
                        <input type="number" id="edit_despacho_pul" class="swal2-input" step="0.1" value="${dataActual.despacho_pul || ''}" style="width: 90%; margin: 0;">
                    </div>
                </div>
            `,
            confirmButtonText: 'Guardar',
            confirmButtonColor: '#2f7cc0',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const campos = ['edit_inicio_amb','edit_inicio_pul','edit_termino_amb','edit_termino_pul','edit_llegada_amb','edit_llegada_pul','edit_despacho_amb','edit_despacho_pul'];
                const vals = {};
                for (const id of campos) {
                    const v = String(document.getElementById(id).value || '').trim();
                    vals[id] = v;
                    if (v === '') {
                        Swal.showValidationMessage('Todos los campos de temperatura son obligatorios.');
                        return undefined;
                    }
                    if (!esNumeroNoNegativo(v)) {
                        Swal.showValidationMessage('Solo números positivos o cero (sin negativos ni letras).');
                        return undefined;
                    }
                }
                return {
                    inicio_amb: vals.edit_inicio_amb, inicio_pul: vals.edit_inicio_pul,
                    termino_amb: vals.edit_termino_amb, termino_pul: vals.edit_termino_pul,
                    llegada_amb: vals.edit_llegada_amb, llegada_pul: vals.edit_llegada_pul,
                    despacho_amb: vals.edit_despacho_amb, despacho_pul: vals.edit_despacho_pul
                };
            }
        }).then((result) => {
            if (result.isConfirmed) {
                datosEnsayos[tipoActual][ensayoActual].temperaturas[clamNum - 1] = result.value;
                restaurarDatosEnsayo(tipoActual, ensayoActual);
                
                Swal.fire({
                    title: 'Actualizado',
                    text: 'Temperaturas actualizadas correctamente',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
            }
        });
    }

    // ========================================
    // EDITAR FILA - TIEMPOS
    // ========================================
    function editarFilaTiempos(clamNum, dataActual) {
        Swal.fire({
            title: `Editar Tiempos #${clamNum}`,
            html: `
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Inicio Cosecha:</label>
                        <input type="time" id="edit_inicio" class="swal2-input" value="${dataActual.inicio || ''}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Pérdida Peso:</label>
                        <input type="time" id="edit_perdida" class="swal2-input" value="${dataActual.perdida || ''}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Término Cosecha:</label>
                        <input type="time" id="edit_termino" class="swal2-input" value="${dataActual.termino || ''}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Llegada Acopio:</label>
                        <input type="time" id="edit_llegada" class="swal2-input" value="${dataActual.llegada || ''}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Despacho Acopio:</label>
                        <input type="time" id="edit_despacho" class="swal2-input" value="${dataActual.despacho || ''}" style="width: 90%; margin: 0;">
                    </div>
                </div>
            `,
            confirmButtonText: 'Guardar',
            confirmButtonColor: '#2f7cc0',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const inicio = document.getElementById('edit_inicio').value || '';
                const perdida = document.getElementById('edit_perdida').value || '';
                const termino = document.getElementById('edit_termino').value || '';
                const llegada = document.getElementById('edit_llegada').value || '';
                const despacho = document.getElementById('edit_despacho').value || '';
                const orden = [inicio, perdida, termino, llegada, despacho];
                for (let i = 0; i < orden.length - 1; i++) {
                    if (orden[i] && orden[i + 1] && !tiempoMenorOIgual(orden[i], orden[i + 1])) {
                        Swal.showValidationMessage('Cada hora debe ser mayor o igual a la anterior (orden: Inicio → Pérdida → Término → Llegada → Despacho).');
                        return undefined;
                    }
                }
                return { inicio, perdida, termino, llegada, despacho };
            }
        }).then((result) => {
            if (result.isConfirmed) {
                datosEnsayos[tipoActual][ensayoActual].tiempos[clamNum - 1] = result.value;
                restaurarDatosEnsayo(tipoActual, ensayoActual);
                
                Swal.fire({
                    title: 'Actualizado',
                    text: 'Tiempos actualizados correctamente',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
            }
        });
    }

    // ========================================
    // EDITAR FILA - HUMEDAD
    // ========================================
    function editarFilaHumedad(clamNum, dataActual) {
        Swal.fire({
            title: `Editar Humedad #${clamNum}`,
            html: `
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Inicio (%):</label>
                        <input type="number" id="edit_inicio" class="swal2-input" step="0.1" value="${dataActual.inicio || ''}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Término (%):</label>
                        <input type="number" id="edit_termino" class="swal2-input" step="0.1" value="${dataActual.termino || ''}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Llegada (%):</label>
                        <input type="number" id="edit_llegada" class="swal2-input" step="0.1" value="${dataActual.llegada || ''}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Despacho (%):</label>
                        <input type="number" id="edit_despacho" class="swal2-input" step="0.1" value="${dataActual.despacho || ''}" style="width: 90%; margin: 0;">
                    </div>
                </div>
            `,
            confirmButtonText: 'Guardar',
            confirmButtonColor: '#2f7cc0',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const inicio = (document.getElementById('edit_inicio').value || '').trim();
                const termino = (document.getElementById('edit_termino').value || '').trim();
                const llegada = (document.getElementById('edit_llegada').value || '').trim();
                const despacho = (document.getElementById('edit_despacho').value || '').trim();
                if (!inicio || !termino || !llegada || !despacho) {
                    Swal.showValidationMessage('Todos los campos de humedad son obligatorios.');
                    return undefined;
                }
                for (const v of [inicio, termino, llegada, despacho]) {
                    if (!esNumeroNoNegativo(v)) {
                        Swal.showValidationMessage('Solo números positivos o cero (sin negativos ni letras).');
                        return undefined;
                    }
                }
                return { inicio, termino, llegada, despacho };
            }
        }).then((result) => {
            if (result.isConfirmed) {
                datosEnsayos[tipoActual][ensayoActual].humedad[clamNum - 1] = result.value;
                restaurarDatosEnsayo(tipoActual, ensayoActual);
                
                Swal.fire({
                    title: 'Actualizado',
                    text: 'Humedad actualizada correctamente',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
            }
        });
    }

    // ========================================
    // EDITAR FILA - PRESIÓN AMBIENTE
    // ========================================
    function editarFilaPresionAmbiente(clamNum, dataActual) {
        Swal.fire({
            title: `Editar Presión Ambiente #${clamNum}`,
            html: `
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Inicio (kPa):</label>
                        <input type="number" id="edit_inicio" class="swal2-input" step="0.001" value="${dataActual.inicio || ''}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Término (kPa):</label>
                        <input type="number" id="edit_termino" class="swal2-input" step="0.001" value="${dataActual.termino || ''}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Llegada (kPa):</label>
                        <input type="number" id="edit_llegada" class="swal2-input" step="0.001" value="${dataActual.llegada || ''}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Despacho (kPa):</label>
                        <input type="number" id="edit_despacho" class="swal2-input" step="0.001" value="${dataActual.despacho || ''}" style="width: 90%; margin: 0;">
                    </div>
                </div>
            `,
            confirmButtonText: 'Guardar',
            confirmButtonColor: '#2f7cc0',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const inicio = (document.getElementById('edit_inicio').value || '').trim();
                const termino = (document.getElementById('edit_termino').value || '').trim();
                const llegada = (document.getElementById('edit_llegada').value || '').trim();
                const despacho = (document.getElementById('edit_despacho').value || '').trim();
                if (!inicio || !termino || !llegada || !despacho) {
                    Swal.showValidationMessage('Todos los campos de presión ambiente son obligatorios.');
                    return undefined;
                }
                for (const v of [inicio, termino, llegada, despacho]) {
                    if (!esNumeroNoNegativo(v)) {
                        Swal.showValidationMessage('Solo números positivos o cero (sin negativos ni letras).');
                        return undefined;
                    }
                }
                return { inicio, termino, llegada, despacho };
            }
        }).then((result) => {
            if (result.isConfirmed) {
                datosEnsayos[tipoActual][ensayoActual].presionambiente[clamNum - 1] = result.value;
                restaurarDatosEnsayo(tipoActual, ensayoActual);
                
                Swal.fire({
                    title: 'Actualizado',
                    text: 'Presión actualizada correctamente',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
            }
        });
    }

    // ========================================
    // EDITAR FILA - PRESIÓN FRUTA
    // ========================================
    function editarFilaPresionFruta(clamNum, dataActual) {
        Swal.fire({
            title: `Editar Presión Fruta #${clamNum}`,
            html: `
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Inicio (kPa):</label>
                        <input type="number" id="edit_inicio" class="swal2-input" step="0.001" value="${dataActual.inicio || ''}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Término (kPa):</label>
                        <input type="number" id="edit_termino" class="swal2-input" step="0.001" value="${dataActual.termino || ''}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Llegada (kPa):</label>
                        <input type="number" id="edit_llegada" class="swal2-input" step="0.001" value="${dataActual.llegada || ''}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Despacho (kPa):</label>
                        <input type="number" id="edit_despacho" class="swal2-input" step="0.001" value="${dataActual.despacho || ''}" style="width: 90%; margin: 0;">
                    </div>
                </div>
            `,
            confirmButtonText: 'Guardar',
            confirmButtonColor: '#2f7cc0',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const inicio = (document.getElementById('edit_inicio').value || '').trim();
                const termino = (document.getElementById('edit_termino').value || '').trim();
                const llegada = (document.getElementById('edit_llegada').value || '').trim();
                const despacho = (document.getElementById('edit_despacho').value || '').trim();
                if (!inicio || !termino || !llegada || !despacho) {
                    Swal.showValidationMessage('Todos los campos de presión fruta son obligatorios.');
                    return undefined;
                }
                for (const v of [inicio, termino, llegada, despacho]) {
                    if (!esNumeroNoNegativo(v)) {
                        Swal.showValidationMessage('Solo números positivos o cero (sin negativos ni letras).');
                        return undefined;
                    }
                }
                return { inicio, termino, llegada, despacho };
            }
        }).then((result) => {
            if (result.isConfirmed) {
                datosEnsayos[tipoActual][ensayoActual].presionfruta[clamNum - 1] = result.value;
                restaurarDatosEnsayo(tipoActual, ensayoActual);
                
                Swal.fire({
                    title: 'Actualizado',
                    text: 'Presión actualizada correctamente',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
            }
        });
    }

    // ========================================
    // EDITAR FILA - OBSERVACIÓN
    // ========================================
    function editarFilaObservacion(clamNum, dataActual) {
        Swal.fire({
            title: `Editar Observación #${clamNum}`,
            html: `
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Observación:</label>
                        <textarea id="edit_obs" class="swal2-input" rows="3" style="width: 90%; margin: 0; height: 80px;">${dataActual.observacion || ''}</textarea>
                    </div>
                </div>
            `,
            confirmButtonText: 'Guardar',
            confirmButtonColor: '#2f7cc0',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const observacion = document.getElementById('edit_obs').value;
                return { observacion };
            }
        }).then((result) => {
            if (result.isConfirmed) {
                const { observacion } = result.value;
                datosEnsayos[tipoActual][ensayoActual].observacion[clamNum - 1] = { observacion };
                restaurarDatosEnsayo(tipoActual, ensayoActual);
                
                Swal.fire({
                    title: 'Actualizado',
                    text: 'Observación actualizada correctamente',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
            }
        });
    }

    // ========================================
    // ELIMINAR FILA
    // ========================================
    function eliminarFila(tipo, num) {
        Swal.fire({
            title: '¿Estás seguro?',
            text: `Se eliminará el registro #${num}`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        }).then((result) => {
            if (result.isConfirmed) {
                datosEnsayos[tipoActual][ensayoActual][tipo].splice(num - 1, 1);
                restaurarDatosEnsayo(tipoActual, ensayoActual);
                window.formHasChanges = true;
                
                Swal.fire({
                    title: 'Eliminado',
                    text: 'Registro eliminado correctamente',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
            }
        });
    }

    // ========================================
    // REPLICAR FILA (SIN SWAL AL AGREGAR, SOLO AL ALCANZAR LÍMITE)
    // ========================================
    function replicarFila(tipo, data) {
        if (!ensayoActual) {
            Swal.fire({ 
                title: 'Atención', 
                text: 'Primero selecciona un Rótulo de Muestra (Ensayo)', 
                icon: 'warning' 
            });
            return;
        }

        const maxClam = datosEnsayos[tipoActual][ensayoActual].visual.length;
        const currentCount = datosEnsayos[tipoActual][ensayoActual][tipo].length;

        if (currentCount >= maxClam) {
            Swal.fire({
                title: 'Límite alcanzado',
                text: `Ya tienes ${maxClam} registros (máximo permitido según N° Clamshells)`,
                icon: 'info',
                confirmButtonColor: '#2f7cc0'
            });
            return;
        }

        datosEnsayos[tipoActual][ensayoActual][tipo].push({...data});
        restaurarDatosEnsayo(tipoActual, ensayoActual);
        window.formHasChanges = true;
    }

    // ========================================
    // SISTEMA DE TOGGLE DINÁMICO
    // ========================================
    function abrirCollapsible(bodyId) {
        const body = document.getElementById(bodyId);
        const header = document.querySelector(`[data-target="${bodyId}"]`);
        const chevron = header ? header.querySelector('.chevron') : null;
        
        if (body) body.style.display = 'block';
        if (chevron) chevron.classList.add('rotate');
    }

    function cerrarCollapsible(bodyId) {
        const body = document.getElementById(bodyId);
        const header = document.querySelector(`[data-target="${bodyId}"]`);
        const chevron = header ? header.querySelector('.chevron') : null;
        
        if (body) body.style.display = 'none';
        if (chevron) chevron.classList.remove('rotate');
    }

    function toggleCollapsible(bodyId) {
        const body = document.getElementById(bodyId);
        const isVisible = body && body.style.display === 'block';
        isVisible ? cerrarCollapsible(bodyId) : abrirCollapsible(bodyId);
    }

    document.querySelectorAll('.collapsible-toggle').forEach(header => {
        header.addEventListener('click', () => {
            const targetId = header.getAttribute('data-target');
            if (targetId) toggleCollapsible(targetId);
        });
    });

    // ========================================
    // CALCULAR TIEMPO AUTOMÁTICO EN JARRAS
    // ========================================
    const inputInicio = document.getElementById('reg_jarras_inicio');
    const inputTermino = document.getElementById('reg_jarras_termino');
    const spanTiempo = document.getElementById('reg_jarras_tiempo');

    if (inputInicio && inputTermino && spanTiempo) {
        [inputInicio, inputTermino].forEach(input => {
            input.addEventListener('change', () => {
                const inicio = inputInicio.value;
                const termino = inputTermino.value;
                
                if (inicio && termino) {
                    spanTiempo.textContent = calcularTiempoEmpleado(inicio, termino);
                } else {
                    spanTiempo.textContent = "0'";
                }
            });
        });
    }

    // ========================================
    // AÑADIR PESOS (VISUAL) - VALIDACIONES
    // ========================================
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
            
            const jarra = document.getElementById('reg_visual_n_jarra').value.trim();
            const p1 = document.getElementById('reg_visual_peso_1').value.trim();
            const p2 = document.getElementById('reg_visual_peso_2').value.trim();
            const llegada = document.getElementById('reg_visual_llegada_acopio').value.trim();
            const despacho = document.getElementById('reg_visual_despacho_acopio').value.trim();

            if (jarra !== '' && !esNumeroPositivoEntero(jarra)) {
                Swal.fire({
                    title: 'N° Jarra inválido',
                    text: 'El N° Jarra debe ser un número entero positivo (sin negativos ni letras).',
                    icon: 'warning',
                    confirmButtonColor: '#2f7cc0'
                });
                return;
            }
            if (p1 !== '' && p2 !== '') {
                const n1 = Number(p1), n2 = Number(p2);
                if (Number.isNaN(n2) || n2 > n1) {
                    Swal.fire({
                        title: 'Peso 2 inválido',
                        text: 'Peso 2 debe ser menor o igual que Peso 1.',
                        icon: 'warning',
                        confirmButtonColor: '#2f7cc0'
                    });
                    return;
                }
            }
            if (llegada !== '' && despacho !== '') {
                const nLleg = Number(llegada), nDesp = Number(despacho);
                if (Number.isNaN(nDesp) || nDesp > nLleg) {
                    Swal.fire({
                        title: 'Despacho inválido',
                        text: 'Despacho acopio debe ser menor o igual que Llegada acopio.',
                        icon: 'warning',
                        confirmButtonColor: '#2f7cc0'
                    });
                    return;
                }
            }

            const tbody = document.getElementById('tbody-visual');
            const rowData = { jarra, p1, p2, llegada, despacho };
            
            datosEnsayos.visual[ensayoActual].visual.push(rowData);
            const clamNum = datosEnsayos.visual[ensayoActual].visual.length;
            
            agregarFilaVisual(rowData, tbody, clamNum);
            actualizarContador('next_clam_visual', clamNum);
            window.formHasChanges = true;

            document.getElementById('reg_visual_n_jarra').value = '';
            document.getElementById('reg_visual_peso_1').value = '';
            document.getElementById('reg_visual_peso_2').value = '';
            document.getElementById('reg_visual_llegada_acopio').value = '';
            document.getElementById('reg_visual_despacho_acopio').value = '';
            document.getElementById('reg_visual_n_jarra').focus();
        });
    }

    // ========================================
    // AÑADIR JARRAS - VALIDACIONES
    // ========================================
    const btnAddJarras = document.getElementById('btn-add-jarras');
    if (btnAddJarras) {
        btnAddJarras.addEventListener('click', () => {
            if (!ensayoActual) {
                Swal.fire({ 
                    title: 'Atención', 
                    text: 'Primero selecciona un Rótulo de Muestra (Ensayo)', 
                    icon: 'warning' 
                });
                return;
            }
            
            const jarra = document.getElementById('reg_jarras_n_jarra').value.trim();
            const tipo = document.getElementById('reg_jarras_tipo').value || '';
            const inicio = document.getElementById('reg_jarras_inicio').value || '';
            const termino = document.getElementById('reg_jarras_termino').value || '';

            if (!esNumeroPositivoEntero(jarra)) {
                Swal.fire({
                    title: 'N° Jarra inválido',
                    text: 'El N° Jarra debe ser un número entero positivo (sin negativos ni letras).',
                    icon: 'warning',
                    confirmButtonColor: '#2f7cc0'
                });
                return;
            }
            if (inicio && termino && !tiempoMenorOIgual(inicio, termino)) {
                Swal.fire({
                    title: 'Hora inválida',
                    text: 'La hora de término debe ser mayor o igual que la hora de inicio.',
                    icon: 'warning',
                    confirmButtonColor: '#2f7cc0'
                });
                return;
            }

            const tiempo = calcularTiempoEmpleado(inicio, termino);
            const tbody = document.getElementById('tbody-jarras');
            const rowData = { jarra, tipo, inicio, termino, tiempo };
            
            datosEnsayos.visual[ensayoActual].jarras.push(rowData);
            const rowNum = datosEnsayos.visual[ensayoActual].jarras.length;
            
            agregarFilaJarras(rowData, tbody, rowNum);
            actualizarContador('next_row_jarras', rowNum);
            window.formHasChanges = true;

            document.getElementById('reg_jarras_n_jarra').value = '';
            document.getElementById('reg_jarras_tipo').value = '';
            document.getElementById('reg_jarras_inicio').value = '';
            document.getElementById('reg_jarras_termino').value = '';
            document.getElementById('reg_jarras_tiempo').textContent = "0'";
            document.getElementById('reg_jarras_n_jarra').focus();
        });
    }

    // ========================================
    // AÑADIR TEMPERATURAS - VALIDACIONES (todos obligatorios, no negativos)
    // ========================================
    const btnAddTemp = document.getElementById('btn-add-temperaturas');
    if (btnAddTemp) {
        btnAddTemp.addEventListener('click', () => {
            if (!ensayoActual) {
                Swal.fire({ 
                    title: 'Atención', 
                    text: 'Primero selecciona un Rótulo de Muestra (Ensayo)', 
                    icon: 'warning' 
                });
                return;
            }
            
            const campos = [
                { id: 'reg_temp_inicio_amb', label: 'Temp. inicio ambiente' },
                { id: 'reg_temp_inicio_pul', label: 'Temp. inicio pulpa' },
                { id: 'reg_temp_termino_amb', label: 'Temp. término ambiente' },
                { id: 'reg_temp_termino_pul', label: 'Temp. término pulpa' },
                { id: 'reg_temp_llegada_amb', label: 'Temp. llegada ambiente' },
                { id: 'reg_temp_llegada_pul', label: 'Temp. llegada pulpa' },
                { id: 'reg_temp_despacho_amb', label: 'Temp. despacho ambiente' },
                { id: 'reg_temp_despacho_pul', label: 'Temp. despacho pulpa' }
            ];
            const valores = {};
            for (const c of campos) {
                const v = (document.getElementById(c.id) && document.getElementById(c.id).value || '').trim();
                valores[c.id] = v;
                if (v === '') {
                    Swal.fire({
                        title: 'Campo obligatorio',
                        text: `Debes completar todos los campos de temperatura. Falta: ${c.label}.`,
                        icon: 'warning',
                        confirmButtonColor: '#2f7cc0'
                    });
                    return;
                }
                if (!esNumeroNoNegativo(v)) {
                    Swal.fire({
                        title: 'Valor inválido',
                        text: `${c.label}: solo números positivos o cero (sin negativos ni letras).`,
                        icon: 'warning',
                        confirmButtonColor: '#2f7cc0'
                    });
                    return;
                }
            }

            const inicio_amb = valores['reg_temp_inicio_amb'];
            const inicio_pul = valores['reg_temp_inicio_pul'];
            const termino_amb = valores['reg_temp_termino_amb'];
            const termino_pul = valores['reg_temp_termino_pul'];
            const llegada_amb = valores['reg_temp_llegada_amb'];
            const llegada_pul = valores['reg_temp_llegada_pul'];
            const despacho_amb = valores['reg_temp_despacho_amb'];
            const despacho_pul = valores['reg_temp_despacho_pul'];

            const tbody = document.getElementById('tbody-temperaturas');
            const rowData = { inicio_amb, inicio_pul, termino_amb, termino_pul, llegada_amb, llegada_pul, despacho_amb, despacho_pul };
            
            datosEnsayos.visual[ensayoActual].temperaturas.push(rowData);
            const clamNum = datosEnsayos.visual[ensayoActual].temperaturas.length;
            
            agregarFilaTemperaturas(rowData, tbody, clamNum);
            actualizarContador('next_clam_temp', clamNum);
            window.formHasChanges = true;

            document.getElementById('reg_temp_inicio_amb').value = '';
            document.getElementById('reg_temp_inicio_pul').value = '';
            document.getElementById('reg_temp_termino_amb').value = '';
            document.getElementById('reg_temp_termino_pul').value = '';
            document.getElementById('reg_temp_llegada_amb').value = '';
            document.getElementById('reg_temp_llegada_pul').value = '';
            document.getElementById('reg_temp_despacho_amb').value = '';
            document.getElementById('reg_temp_despacho_pul').value = '';
            document.getElementById('reg_temp_inicio_amb').focus();
        });
    }

    // ========================================
    // AÑADIR TIEMPOS - VALIDACIONES (orden ascendente)
    // ========================================
    const btnAddTiempos = document.getElementById('btn-add-tiempos');
    if (btnAddTiempos) {
        btnAddTiempos.addEventListener('click', () => {
            if (!ensayoActual) {
                Swal.fire({ 
                    title: 'Atención', 
                    text: 'Primero selecciona un Rótulo de Muestra (Ensayo)', 
                    icon: 'warning' 
                });
                return;
            }
            
            const inicio = document.getElementById('reg_tiempos_inicio_c').value || '';
            const perdida = document.getElementById('reg_tiempos_perdida_peso').value || '';
            const termino = document.getElementById('reg_tiempos_termino_c').value || '';
            const llegada = document.getElementById('reg_tiempos_llegada_acopio').value || '';
            const despacho = document.getElementById('reg_tiempos_despacho_acopio').value || '';

            const orden = [inicio, perdida, termino, llegada, despacho];
            for (let i = 0; i < orden.length - 1; i++) {
                if (orden[i] && orden[i + 1] && !tiempoMenorOIgual(orden[i], orden[i + 1])) {
                    const nombres = ['Inicio cosecha', 'Pérdida peso', 'Término cosecha', 'Llegada acopio', 'Despacho acopio'];
                    Swal.fire({
                        title: 'Orden de tiempos inválido',
                        text: `Cada hora debe ser mayor o igual a la anterior. Revisa "${nombres[i]}" y "${nombres[i + 1]}".`,
                        icon: 'warning',
                        confirmButtonColor: '#2f7cc0'
                    });
                    return;
                }
            }

            const tbody = document.getElementById('tbody-tiempos');
            const rowData = { inicio, perdida, termino, llegada, despacho };
            
            datosEnsayos.visual[ensayoActual].tiempos.push(rowData);
            const clamNum = datosEnsayos.visual[ensayoActual].tiempos.length;
            
            agregarFilaTiempos(rowData, tbody, clamNum);
            actualizarContador('next_clam_tiempos', clamNum);
            window.formHasChanges = true;

            document.getElementById('reg_tiempos_inicio_c').value = '';
            document.getElementById('reg_tiempos_perdida_peso').value = '';
            document.getElementById('reg_tiempos_termino_c').value = '';
            document.getElementById('reg_tiempos_llegada_acopio').value = '';
            document.getElementById('reg_tiempos_despacho_acopio').value = '';
            document.getElementById('reg_tiempos_inicio_c').focus();
        });
    }

    // ========================================
    // AÑADIR HUMEDAD - VALIDACIONES (todos obligatorios, no negativos)
    // ========================================
    const btnAddHumedad = document.getElementById('btn-add-humedad');
    if (btnAddHumedad) {
        btnAddHumedad.addEventListener('click', () => {
            if (!ensayoActual) {
                Swal.fire({ 
                    title: 'Atención', 
                    text: 'Primero selecciona un Rótulo de Muestra (Ensayo)', 
                    icon: 'warning' 
                });
                return;
            }
            
            const ids = ['reg_humedad_inicio', 'reg_humedad_termino', 'reg_humedad_llegada', 'reg_humedad_despacho'];
            const labels = ['Humedad inicio', 'Humedad término', 'Humedad llegada', 'Humedad despacho'];
            const vals = ids.map(id => (document.getElementById(id) && document.getElementById(id).value || '').trim());
            for (let i = 0; i < ids.length; i++) {
                if (vals[i] === '') {
                    Swal.fire({
                        title: 'Campo obligatorio',
                        text: `Todos los campos de humedad deben estar llenos. Falta: ${labels[i]}.`,
                        icon: 'warning',
                        confirmButtonColor: '#2f7cc0'
                    });
                    return;
                }
                if (!esNumeroNoNegativo(vals[i])) {
                    Swal.fire({
                        title: 'Valor inválido',
                        text: 'Humedad: solo números positivos o cero (sin negativos ni letras).',
                        icon: 'warning',
                        confirmButtonColor: '#2f7cc0'
                    });
                    return;
                }
            }

            const [inicio, termino, llegada, despacho] = vals;
            const tbody = document.getElementById('tbody-humedad');
            const rowData = { inicio, termino, llegada, despacho };
            
            datosEnsayos.visual[ensayoActual].humedad.push(rowData);
            const clamNum = datosEnsayos.visual[ensayoActual].humedad.length;
            
            agregarFilaHumedad(rowData, tbody, clamNum);
            actualizarContador('next_clam_humedad', clamNum);
            window.formHasChanges = true;

            document.getElementById('reg_humedad_inicio').value = '';
            document.getElementById('reg_humedad_termino').value = '';
            document.getElementById('reg_humedad_llegada').value = '';
            document.getElementById('reg_humedad_despacho').value = '';
            document.getElementById('reg_humedad_inicio').focus();
        });
    }

    // ========================================
    // AÑADIR PRESIÓN AMBIENTE - VALIDACIONES (todos obligatorios, no negativos)
    // ========================================
    const btnAddPresion = document.getElementById('btn-add-presion');
    if (btnAddPresion) {
        btnAddPresion.addEventListener('click', () => {
            if (!ensayoActual) {
                Swal.fire({ 
                    title: 'Atención', 
                    text: 'Primero selecciona un Rótulo de Muestra (Ensayo)', 
                    icon: 'warning' 
                });
                return;
            }
            
            const ids = ['reg_presion_amb_inicio', 'reg_presion_amb_termino', 'reg_presion_amb_llegada', 'reg_presion_amb_despacho'];
            const vals = ids.map(id => (document.getElementById(id) && document.getElementById(id).value || '').trim());
            for (let i = 0; i < ids.length; i++) {
                if (vals[i] === '') {
                    Swal.fire({
                        title: 'Campo obligatorio',
                        text: 'Todos los campos de presión ambiente deben estar llenos (sin negativos ni letras).',
                        icon: 'warning',
                        confirmButtonColor: '#2f7cc0'
                    });
                    return;
                }
                if (!esNumeroNoNegativo(vals[i])) {
                    Swal.fire({
                        title: 'Valor inválido',
                        text: 'Presión ambiente: solo números positivos o cero (sin negativos ni letras).',
                        icon: 'warning',
                        confirmButtonColor: '#2f7cc0'
                    });
                    return;
                }
            }

            const [inicio, termino, llegada, despacho] = vals;
            const tbody = document.getElementById('tbody-presion');
            const rowData = { inicio, termino, llegada, despacho };
            
            datosEnsayos.visual[ensayoActual].presionambiente.push(rowData);
            const clamNum = datosEnsayos.visual[ensayoActual].presionambiente.length;
            
            agregarFilaPresionAmbiente(rowData, tbody, clamNum);
            actualizarContador('next_clam_presion', clamNum);
            window.formHasChanges = true;

            document.getElementById('reg_presion_amb_inicio').value = '';
            document.getElementById('reg_presion_amb_termino').value = '';
            document.getElementById('reg_presion_amb_llegada').value = '';
            document.getElementById('reg_presion_amb_despacho').value = '';
            document.getElementById('reg_presion_amb_inicio').focus();
        });
    }

    // ========================================
    // AÑADIR PRESIÓN FRUTA - VALIDACIONES (todos obligatorios, no negativos)
    // ========================================
    const btnAddPresionFruta = document.getElementById('btn-add-presion-fruta');
    if (btnAddPresionFruta) {
        btnAddPresionFruta.addEventListener('click', () => {
            if (!ensayoActual) {
                Swal.fire({ 
                    title: 'Atención', 
                    text: 'Primero selecciona un Rótulo de Muestra (Ensayo)', 
                    icon: 'warning' 
                });
                return;
            }
            
            const ids = ['reg_presion_fruta_inicio', 'reg_presion_fruta_termino', 'reg_presion_fruta_llegada', 'reg_presion_fruta_despacho'];
            const vals = ids.map(id => (document.getElementById(id) && document.getElementById(id).value || '').trim());
            for (let i = 0; i < ids.length; i++) {
                if (vals[i] === '') {
                    Swal.fire({
                        title: 'Campo obligatorio',
                        text: 'Todos los campos de presión fruta deben estar llenos (sin negativos ni letras).',
                        icon: 'warning',
                        confirmButtonColor: '#2f7cc0'
                    });
                    return;
                }
                if (!esNumeroNoNegativo(vals[i])) {
                    Swal.fire({
                        title: 'Valor inválido',
                        text: 'Presión fruta: solo números positivos o cero (sin negativos ni letras).',
                        icon: 'warning',
                        confirmButtonColor: '#2f7cc0'
                    });
                    return;
                }
            }

            const [inicio, termino, llegada, despacho] = vals;
            const tbody = document.getElementById('tbody-presion-fruta');
            const rowData = { inicio, termino, llegada, despacho };
            
            datosEnsayos.visual[ensayoActual].presionfruta.push(rowData);
            const clamNum = datosEnsayos.visual[ensayoActual].presionfruta.length;
            
            agregarFilaPresionFruta(rowData, tbody, clamNum);
            actualizarContador('next_clam_presion_fruta', clamNum);
            window.formHasChanges = true;

            document.getElementById('reg_presion_fruta_inicio').value = '';
            document.getElementById('reg_presion_fruta_termino').value = '';
            document.getElementById('reg_presion_fruta_llegada').value = '';
            document.getElementById('reg_presion_fruta_despacho').value = '';
            document.getElementById('reg_presion_fruta_inicio').focus();
        });
    }

    // ========================================
    // AÑADIR OBSERVACIÓN - SIN VALIDACIONES
    // ========================================
    const btnAddObs = document.getElementById('btn-add-obs');
    if (btnAddObs) {
        btnAddObs.addEventListener('click', () => {
            if (!ensayoActual) {
                Swal.fire({ 
                    title: 'Atención', 
                    text: 'Primero selecciona un Rótulo de Muestra (Ensayo)', 
                    icon: 'warning' 
                });
                return;
            }
            
            const observacion = document.getElementById('reg_observacion_texto').value || '';

            const tbody = document.getElementById('tbody-observacion');
            const rowData = { observacion };
            
            datosEnsayos.visual[ensayoActual].observacion.push(rowData);
            const clamNum = datosEnsayos.visual[ensayoActual].observacion.length;
            
            agregarFilaObservacion(rowData, tbody, clamNum);
            actualizarContador('next_clam_obs', clamNum);
            window.formHasChanges = true;

            document.getElementById('reg_observacion_texto').value = '';
            document.getElementById('reg_observacion_texto').focus();
        });
    }

    // ========================================
    // 8. GUARDADO FINAL CON LÓGICA DE JOIN
    // ========================================
    const btnGuardarGeneral = document.getElementById('btn-guardar-registro');

    if (btnGuardarGeneral) {
        let isSaving = false;
        const toggleSaving = (saving) => {
            isSaving = saving;
            btnGuardarGeneral.disabled = saving;
            btnGuardarGeneral.style.opacity = saving ? '0.5' : '1';
        };

        btnGuardarGeneral.addEventListener('click', () => {
            if (isSaving) return;

            const form = document.getElementById('cosecha-form');
            
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

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

            let hayDatos = false;
            const datosDelTipo = datosEnsayos[tipoMedicion];
            
            for (let ensayo in datosDelTipo) {
                if (datosDelTipo[ensayo].visual && datosDelTipo[ensayo].visual.length > 0) {
                    hayDatos = true;
                    break;
                }
            }

            if (!hayDatos) {
                Swal.fire({
                    title: 'Atención',
                    text: 'Debes agregar al menos un registro de peso (Visual) en algún ensayo',
                    icon: 'warning',
                    confirmButtonColor: '#2f7cc0'
                });
                return;
            }

            // Validar consistencia de datos (EXCEPTO jarras)
            for (let numEnsayo in datosDelTipo) {
                const ensayo = datosDelTipo[numEnsayo];
                
                if (ensayo.visual && ensayo.visual.length > 0) {
                    const totalVisual = ensayo.visual.length;
                    
                    const secciones = ['temperaturas', 'tiempos', 'humedad', 'presionambiente', 'presionfruta', 'observacion'];
                    
                    for (let seccion of secciones) {
                        if (ensayo[seccion] && ensayo[seccion].length > 0 && ensayo[seccion].length !== totalVisual) {
                            const nombresSeccion = { temperaturas: 'Temperaturas', tiempos: 'Tiempos', humedad: 'Humedad', presionambiente: 'Presión ambiente', presionfruta: 'Presión fruta', observacion: 'Observación' };
                            Swal.fire({
                                title: 'Inconsistencia de filas',
                                html: `El <strong>Ensayo ${numEnsayo}</strong> tiene <strong>${totalVisual}</strong> filas en Visual, pero <strong>${ensayo[seccion].length}</strong> en ${nombresSeccion[seccion] || seccion}.<br><br>Las filas deben coincidir en total (Jarras puede tener más o menos).`,
                                icon: 'error',
                                confirmButtonColor: '#d33'
                            });
                            return;
                        }
                    }
                }
            }

            // Construir filas planas de 50 columnas para Excel (sin TEMP_AMB)
            const allRows = [];
            
            for (let numEnsayo in datosDelTipo) {
                const ensayo = datosDelTipo[numEnsayo];
                
                if (ensayo.visual && ensayo.visual.length > 0) {
                    
                    // JOIN entre visual y jarras por n_jarra
                    const registrosCombinados = ensayo.visual.map((visual, index) => {
                        
                        // Buscar jarras tipo C y T para esta jarra
                        const jarraC = ensayo.jarras ? ensayo.jarras.find(j => j.jarra === visual.jarra && j.tipo === 'C') : null;
                        const jarraT = ensayo.jarras ? ensayo.jarras.find(j => j.jarra === visual.jarra && j.tipo === 'T') : null;
                        
                        const tempCorrespondiente = ensayo.temperaturas && ensayo.temperaturas[index] ? ensayo.temperaturas[index] : null;
                        const tiempoCorrespondiente = ensayo.tiempos && ensayo.tiempos[index] ? ensayo.tiempos[index] : null;
                        const humedadCorrespondiente = ensayo.humedad && ensayo.humedad[index] ? ensayo.humedad[index] : null;
                        const presionAmbCorrespondiente = ensayo.presionambiente && ensayo.presionambiente[index] ? ensayo.presionambiente[index] : null;
                        const presionFrutaCorrespondiente = ensayo.presionfruta && ensayo.presionfruta[index] ? ensayo.presionfruta[index] : null;
                        const obsCorrespondiente = ensayo.observacion && ensayo.observacion[index] ? ensayo.observacion[index] : null;
                        
                        return {
                            n_clamshell: index + 1,
                            n_jarra: parseInt(visual.jarra) || 0,
                            peso_1: parseFloat(visual.p1) || 0,
                            peso_2: parseFloat(visual.p2) || 0,
                            llegada_acopio: parseFloat(visual.llegada) || 0,
                            despacho_acopio: parseFloat(visual.despacho) || 0,
                            inicio_c: jarraC ? jarraC.inicio : '',
                            termino_c: jarraC ? jarraC.termino : '',
                            min_c: jarraC ? jarraC.tiempo : '',
                            inicio_t: jarraT ? jarraT.inicio : '',
                            termino_t: jarraT ? jarraT.termino : '',
                            min_t: jarraT ? jarraT.tiempo : '',
                            temperatura_muestra: tempCorrespondiente ? {
                                inicio: {
                                    ambiente: parseFloat(tempCorrespondiente.inicio_amb) || null,
                                    pulpa: parseFloat(tempCorrespondiente.inicio_pul) || null
                                },
                                termino: {
                                    ambiente: parseFloat(tempCorrespondiente.termino_amb) || null,
                                    pulpa: parseFloat(tempCorrespondiente.termino_pul) || null
                                },
                                llegada_acopio: {
                                    ambiente: parseFloat(tempCorrespondiente.llegada_amb) || null,
                                    pulpa: parseFloat(tempCorrespondiente.llegada_pul) || null
                                },
                                despacho_acopio: {
                                    ambiente: parseFloat(tempCorrespondiente.despacho_amb) || null,
                                    pulpa: parseFloat(tempCorrespondiente.despacho_pul) || null
                                }
                            } : null,
                            tiempos: tiempoCorrespondiente ? {
                                inicio_cosecha: tiempoCorrespondiente.inicio || null,
                                perdida_peso: tiempoCorrespondiente.perdida || null,
                                termino_cosecha: tiempoCorrespondiente.termino || null,
                                llegada_acopio: tiempoCorrespondiente.llegada || null,
                                despacho_acopio: tiempoCorrespondiente.despacho || null
                            } : null,
                            humedad_relativa: humedadCorrespondiente ? {
                                inicio: parseFloat(humedadCorrespondiente.inicio) || null,
                                termino: parseFloat(humedadCorrespondiente.termino) || null,
                                llegada_acopio: parseFloat(humedadCorrespondiente.llegada) || null,
                                despacho_acopio: parseFloat(humedadCorrespondiente.despacho) || null
                            } : null,
                            temperatura_ambiente: null,
                            presion_vapor_ambiente: presionAmbCorrespondiente ? {
                                inicio: parseFloat(presionAmbCorrespondiente.inicio) || null,
                                termino: parseFloat(presionAmbCorrespondiente.termino) || null,
                                llegada_acopio: parseFloat(presionAmbCorrespondiente.llegada) || null,
                                despacho_acopio: parseFloat(presionAmbCorrespondiente.despacho) || null
                            } : null,
                            presion_vapor_fruta: presionFrutaCorrespondiente ? {
                                inicio: parseFloat(presionFrutaCorrespondiente.inicio) || null,
                                termino: parseFloat(presionFrutaCorrespondiente.termino) || null,
                                llegada_acopio: parseFloat(presionFrutaCorrespondiente.llegada) || null,
                                despacho_acopio: parseFloat(presionFrutaCorrespondiente.despacho) || null
                            } : null,
                            observacion: obsCorrespondiente ? obsCorrespondiente.observacion : null
                        };
                    });
                    
                    // Caso BACKUP: Jarras con tiempos pero sin peso
                    if (ensayo.jarras) {
                        ensayo.jarras.forEach(jarra => {
                            const yaExiste = registrosCombinados.some(r => r.n_jarra === parseInt(jarra.jarra));
                            if (!yaExiste) {
                                const esC = jarra.tipo === 'C';
                                const esT = jarra.tipo === 'T';
                                
                                registrosCombinados.push({
                                    n_clamshell: 0,
                                    n_jarra: parseInt(jarra.jarra) || 0,
                                    peso_1: 0.0,
                                    peso_2: 0.0,
                                    llegada_acopio: 0.0,
                                    despacho_acopio: 0.0,
                                    inicio_c: esC ? jarra.inicio : '',
                                    termino_c: esC ? jarra.termino : '',
                                    min_c: esC ? jarra.tiempo : '',
                                    inicio_t: esT ? jarra.inicio : '',
                                    termino_t: esT ? jarra.termino : '',
                                    min_t: esT ? jarra.tiempo : '',
                                    temperatura_muestra: null,
                                    tiempos: null,
                                    humedad_relativa: null,
                                    temperatura_ambiente: null,
                                    presion_vapor_ambiente: null,
                                    presion_vapor_fruta: null,
                                    observacion: null
                                });
                            }
                        });
                    }
                    
                    const fecha = document.getElementById('reg_fecha').value;
                    const responsable = document.getElementById('reg_responsable').value;
                    const guia_remision = document.getElementById('reg_guia_remision').value;
                    const variedad = document.getElementById('reg_variedad').value;
                    const placa_vehiculo = document.getElementById('reg_placa').value;
                    const hora_inicio = document.getElementById('reg_hora_inicio').value;
                    const dias_precosecha = document.getElementById('reg_dias_precosecha').value || '';
                    const traz_etapa = document.getElementById('reg_traz_etapa').value;
                    const traz_campo = document.getElementById('reg_traz_campo').value;
                    const traz_libre = document.getElementById('reg_traz_libre').value || '';
                    const ensayo_numero = parseInt(numEnsayo);
                    const ensayo_nombre = `Ensayo ${numEnsayo}`;

                    // Convertir cada registro a fila plana de 50 columnas (sin TEMP_AMB; wrapper_tempambiente eliminado)
                    registrosCombinados.forEach(reg => {
                        const tm = reg.temperatura_muestra;
                        const ti = reg.tiempos;
                        const hr = reg.humedad_relativa;
                        const pva = reg.presion_vapor_ambiente;
                        const pvf = reg.presion_vapor_fruta;

                        const row = [
                            fecha, responsable, guia_remision, variedad, placa_vehiculo, hora_inicio, dias_precosecha,
                            traz_etapa, traz_campo, traz_libre,
                            ensayo_numero, ensayo_nombre,
                            reg.n_clamshell ?? '', reg.n_jarra ?? '',
                            reg.peso_1 ?? '', reg.peso_2 ?? '', reg.llegada_acopio ?? '', reg.despacho_acopio ?? '',
                            reg.inicio_c || '', reg.termino_c || '', reg.min_c || '',
                            reg.inicio_t || '', reg.termino_t || '', reg.min_t || '',
                            (tm?.inicio?.ambiente != null) ? tm.inicio.ambiente : '', (tm?.inicio?.pulpa != null) ? tm.inicio.pulpa : '',
                            (tm?.termino?.ambiente != null) ? tm.termino.ambiente : '', (tm?.termino?.pulpa != null) ? tm.termino.pulpa : '',
                            (tm?.llegada_acopio?.ambiente != null) ? tm.llegada_acopio.ambiente : '', (tm?.llegada_acopio?.pulpa != null) ? tm.llegada_acopio.pulpa : '',
                            (tm?.despacho_acopio?.ambiente != null) ? tm.despacho_acopio.ambiente : '', (tm?.despacho_acopio?.pulpa != null) ? tm.despacho_acopio.pulpa : '',
                            (ti?.inicio_cosecha) || '', (ti?.perdida_peso) || '', (ti?.termino_cosecha) || '', (ti?.llegada_acopio) || '', (ti?.despacho_acopio) || '',
                            (hr?.inicio != null) ? hr.inicio : '', (hr?.termino != null) ? hr.termino : '', (hr?.llegada_acopio != null) ? hr.llegada_acopio : '', (hr?.despacho_acopio != null) ? hr.despacho_acopio : '',
                            (pva?.inicio != null) ? pva.inicio : '', (pva?.termino != null) ? pva.termino : '', (pva?.llegada_acopio != null) ? pva.llegada_acopio : '', (pva?.despacho_acopio != null) ? pva.despacho_acopio : '',
                            (pvf?.inicio != null) ? pvf.inicio : '', (pvf?.termino != null) ? pvf.termino : '', (pvf?.llegada_acopio != null) ? pvf.llegada_acopio : '', (pvf?.despacho_acopio != null) ? pvf.despacho_acopio : '',
                            reg.observacion || ''
                        ];
                        allRows.push(row);
                    });
                }
            }

            toggleSaving(true);
            saveLocal({ rows: allRows });
            updateUI();
            window.formHasChanges = false;
            if (typeof renderHistorial === 'function') renderHistorial();

            Swal.fire({
                title: '¡Registro Guardado!',
                html: 'Los datos se han guardado correctamente.<br><small>Se enviarán al servidor cuando haya conexión.</small>',
                icon: 'success',
                confirmButtonColor: '#2f7cc0',
                confirmButtonText: 'Entendido'
            }).then(() => {
                document.getElementById('cosecha-form').reset();
                if (campoFecha) campoFecha.value = new Date().toISOString().split('T')[0];
                window.location.reload();
            }).finally(() => {
                toggleSaving(false);
            });
        });
    }
});